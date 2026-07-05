import * as crypto from 'node:crypto';

export type XmlAttributes = Record<string, string>;
export type XmlElement = {
  $?: XmlAttributes;
  [key: string]: unknown;
};

export const firstItem = <T>(value: unknown): T | undefined => (Array.isArray(value) ? (value[0] as T | undefined) : undefined);
export const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
export const getXmlAttribute = (element: XmlElement | undefined, attributeName: string): string | undefined => {
  const attributes = element?.$;
  if (!attributes) return undefined;

  if (attributes[attributeName]) return attributes[attributeName];

  const namespacedAttribute = Object.entries(attributes).find(([key]) => key === attributeName || key.endsWith(`:${attributeName}`));
  return namespacedAttribute?.[1];
};
export const getXmlTextNodeValue = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null || !('_' in value)) return undefined;

  const text = value._;
  return typeof text === 'string' ? text : undefined;
};

export const STRUCTURAL_FB2_SECTION_TITLES = [
  'пролог',
  'эпилог',
] as const;

export const STRUCTURAL_FB2_SECTION_PREFIXES = [
  'часть',
  'глава',
  'книга',
  'том',
  'раздел',
  'акт',
] as const;

export const STRUCTURAL_FB2_SECTION_ORDINALS = [
  'первая',
  'вторая',
  'третья',
  'четвертая',
  'четвёртая',
  'пятая',
  'шестая',
  'седьмая',
  'восьмая',
  'девятая',
  'десятая',
  'одиннадцатая',
  'двенадцатая',
  'последняя',
] as const;

export const isArabicOrRomanSectionMarker = (value: string): boolean => (
  /^\d+[.)]?$/.test(value) || /^[ivxlcdm]+[.)]?$/i.test(value)
);

export async function withParseTimeout<T>(promise: Promise<T>, label: string, timeoutMs = BOOK_PARSE_TIMEOUT_MS): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const MAX_BOOK_PARSE_BYTES = parsePositiveIntEnv(process.env.MAX_BOOK_PARSE_MB, 50) * 1024 * 1024;
export const BOOK_PARSE_TIMEOUT_MS = parsePositiveIntEnv(process.env.BOOK_PARSE_TIMEOUT_MS, 15000);
export const MAX_EPUB_ENTRIES = parsePositiveIntEnv(process.env.MAX_EPUB_ENTRY_COUNT, 3000);
export const MAX_EPUB_UNCOMPRESSED_BYTES = parsePositiveIntEnv(process.env.MAX_EPUB_UNCOMPRESSED_MB, 200) * 1024 * 1024;
export const MAX_EPUB_TEXT_ENTRY_BYTES = parsePositiveIntEnv(process.env.MAX_EPUB_TEXT_ENTRY_MB, 8) * 1024 * 1024;
export const MAX_EPUB_COVER_BYTES = parsePositiveIntEnv(process.env.MAX_EPUB_COVER_MB, 10) * 1024 * 1024;
export const MAX_BOOK_CHAPTERS = parsePositiveIntEnv(
  process.env.MAX_BOOK_CHAPTERS || process.env.MAX_EPUB_CHAPTERS,
  1500,
);
export const MAX_FB2_XML_BYTES = parsePositiveIntEnv(process.env.MAX_FB2_XML_MB, 20) * 1024 * 1024;
export const MAX_FB2_COVER_BYTES = parsePositiveIntEnv(process.env.MAX_FB2_COVER_MB, 10) * 1024 * 1024;

export interface BookMetadata {
  title: string;
  author: string;
  description?: string;
  isbn?: string;
  genre?: string;
  genres?: string[];
  language?: string;
  publisher?: string;
  publishDate?: string;
  coverImageData?: Buffer;
  coverImageType?: string;
  totalChapters: number;
  contentHash?: string;
}

export interface BookChapter {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface ParsedBook {
  metadata: BookMetadata;
  chapters: BookChapter[];
  originalFilename: string;
  fileType: 'epub' | 'fb2';
}

export abstract class BaseBookParser {
  abstract parseBook(fileBuffer: Buffer, filename: string): Promise<ParsedBook>;

  protected assertInputSize(fileBuffer: Buffer): void {
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      throw new Error('Empty file payload');
    }

    if (fileBuffer.length > MAX_BOOK_PARSE_BYTES) {
      throw new Error(`File exceeds parser limit of ${Math.round(MAX_BOOK_PARSE_BYTES / 1024 / 1024)} MB`);
    }
  }

  protected async withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = BOOK_PARSE_TIMEOUT_MS): Promise<T> {
    return withParseTimeout(promise, label, timeoutMs);
  }

  protected cleanText(text: string): string {
    return text
      .replaceAll(/<[^>]*>/g, '') // Remove HTML tags
      .replaceAll(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  protected countWords(text: string): number {
    return this.cleanText(text).split(' ').filter(word => word.length > 0).length;
  }

  protected extractTextFromHtml(html: string): string {
    // Simple HTML to text conversion with proper encoding support
    return html
      .replaceAll(/<br\s*\/?>/gi, '\n')
      .replaceAll(/<\/p>/gi, '\n\n')
      .replaceAll(/<[^>]*>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&laquo;', '«')
      .replaceAll('&raquo;', '»')
      .replaceAll('&hellip;', '...')
      .replaceAll('&mdash;', '—')
      .replaceAll('&ndash;', '–')
      .replaceAll('&ldquo;', '"')
      .replaceAll('&rdquo;', '"')
      .replaceAll('&lsquo;', "'")
      .replaceAll('&rsquo;', "'")
      .trim();
  }

  protected calculateContentHash(fileBuffer: Buffer): string {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  protected calculateTextContentHash(chapters: BookChapter[]): string {
    // Create a normalized text representation for content-based hashing
    const normalizedContent = chapters
      .map(chapter => `${chapter.title}|${this.cleanText(chapter.content)}`)
      .join('\n---\n');

    return crypto.createHash('sha256').update(normalizedContent, 'utf8').digest('hex');
  }
}
