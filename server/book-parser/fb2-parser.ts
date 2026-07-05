import * as xml2js from 'xml2js';
import { logger } from '../lib/logger.js';
import { Fb2DomExtractor } from './fb2-dom-extractor.js';
import {
  BaseBookParser,
  type BookMetadata,
  type BookChapter,
  type ParsedBook,
  type XmlElement,
  asArray,
  getXmlAttribute,
  isArabicOrRomanSectionMarker,
  MAX_BOOK_CHAPTERS,
  MAX_FB2_COVER_BYTES,
  MAX_FB2_XML_BYTES,
  STRUCTURAL_FB2_SECTION_ORDINALS,
  STRUCTURAL_FB2_SECTION_PREFIXES,
  STRUCTURAL_FB2_SECTION_TITLES,
} from './shared.js';

export class FB2Parser extends BaseBookParser {
  private readonly domExtractor = new Fb2DomExtractor({
    countWords: (text) => this.countWords(text),
    escapeHtml: (text) => this.escapeHtml(text),
    buildFallbackSectionTitle: (ancestorTitles, chapterNumber, preferIntroLabel) =>
      this.buildFallbackSectionTitle(ancestorTitles, chapterNumber, preferIntroLabel),
    isStructuralSubsectionTitle: (title) => this.isStructuralSubsectionTitle(title),
  });

  /**
   * Автоопределение кодировки и декодирование содержимого FB2 файла
   */
  private detectAndDecodeContent(fileBuffer: Buffer): string {
    const content = fileBuffer.toString('utf-8');
    const encodingMatch = /<?xml[^>]*encoding=["']([^"']+)["']/i.exec(content);
    const declaredEncoding = encodingMatch?.[1]?.toLowerCase();

    if (declaredEncoding && declaredEncoding !== 'utf-8' && declaredEncoding !== 'utf8') {
      return this.tryDecodeWithEncoding(fileBuffer, declaredEncoding, content);
    }

    if (this.hasEncodingIssues(content)) {
      return this.tryDecodeWindows1251(fileBuffer, content);
    }

    return content;
  }

  /**
   * Пытается декодировать с указанной кодировкой
   */
  private tryDecodeWithEncoding(fileBuffer: Buffer, encoding: string, fallback: string): string {
    logger.info({ encoding }, '[FB2Parser] Detected encoding from XML declaration');
    try {
      if (encoding === 'windows-1251' || encoding === 'cp1251') {
        return this.decodeWindows1251(fileBuffer);
      }
      logger.warn({ encoding }, '[FB2Parser] Unsupported encoding, using UTF-8 fallback');
    } catch (error) {
      console.warn(`⚠️ [FB2Parser] Failed to decode with ${encoding}:`, error);
    }
    return fallback;
  }

  /**
   * Пытается декодировать из Windows-1251 с обработкой ошибок
   */
  private tryDecodeWindows1251(fileBuffer: Buffer, fallback: string): string {
    logger.warn('[FB2Parser] Detected encoding issues, trying Windows-1251 decode');
    try {
      return this.decodeWindows1251(fileBuffer);
    } catch (error) {
      console.warn(`⚠️ [FB2Parser] Windows-1251 decode failed, using original content:`, error);
      return fallback;
    }
  }

  /**
   * Проверяет наличие проблем с кодировкой (кракозябры)
   */
  private hasEncodingIssues(content: string): boolean {
    // Ищем характерные паттерны неправильной кодировки
    const badPatterns = [
      /Ð[À-ß]/g,  // Типичные кракозябры от неправильной кодировки
      /â€/g,       // Еще один паттерн
      /Ã[€¿]/g,    // Исправлено: отдельные символы вместо диапазона
    ];

    return badPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Декодирует содержимое из Windows-1251
   */
  private decodeWindows1251(buffer: Buffer): string {
    // Полная таблица перекодировки Windows-1251 -> UTF-8 (включая все спецсимволы)
    const cp1251Map: { [key: number]: string } = {
      // Кириллица заглавные буквы (0xC0-0xDF)
      0xC0: 'А', 0xC1: 'Б', 0xC2: 'В', 0xC3: 'Г', 0xC4: 'Д', 0xC5: 'Е', 0xC6: 'Ж', 0xC7: 'З',
      0xC8: 'И', 0xC9: 'Й', 0xCA: 'К', 0xCB: 'Л', 0xCC: 'М', 0xCD: 'Н', 0xCE: 'О', 0xCF: 'П',
      0xD0: 'Р', 0xD1: 'С', 0xD2: 'Т', 0xD3: 'У', 0xD4: 'Ф', 0xD5: 'Х', 0xD6: 'Ц', 0xD7: 'Ч',
      0xD8: 'Ш', 0xD9: 'Щ', 0xDA: 'Ъ', 0xDB: 'Ы', 0xDC: 'Ь', 0xDD: 'Э', 0xDE: 'Ю', 0xDF: 'Я',
      // Кириллица строчные буквы (0xE0-0xFF)
      0xE0: 'а', 0xE1: 'б', 0xE2: 'в', 0xE3: 'г', 0xE4: 'д', 0xE5: 'е', 0xE6: 'ж', 0xE7: 'з',
      0xE8: 'и', 0xE9: 'й', 0xEA: 'к', 0xEB: 'л', 0xEC: 'м', 0xED: 'н', 0xEE: 'о', 0xEF: 'п',
      0xF0: 'р', 0xF1: 'с', 0xF2: 'т', 0xF3: 'у', 0xF4: 'ф', 0xF5: 'х', 0xF6: 'ц', 0xF7: 'ч',
      0xF8: 'ш', 0xF9: 'щ', 0xFA: 'ъ', 0xFB: 'ы', 0xFC: 'ь', 0xFD: 'э', 0xFE: 'ю', 0xFF: 'я',
      // Ё/ё
      0xA8: 'Ё', 0xB8: 'ё',
      // Специальные символы Windows-1251 (0x80-0xBF) - КРИТИЧЕСКИ ВАЖНО!
      0x80: '\u0402', 0x81: '\u0403', 0x82: '\u201A', 0x83: '\u0453', 0x84: '\u201E',
      0x85: '\u2026', // Многоточие ... (КРИТИЧНО!)
      0x86: '\u2020', 0x87: '\u2021', 0x88: '\u20AC', 0x89: '\u2030', 0x8A: '\u0409',
      0x8B: '\u2039', // Левая одиночная угловая кавычка ‹
      0x8C: '\u040A', 0x8D: '\u040C', 0x8E: '\u040B', 0x8F: '\u040F',
      0x90: '\u0452', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D',
      0x95: '\u2022', // Буллет •
      0x96: '\u2013', // Короткое тире –
      0x97: '\u2014', // Длинное тире —
      0x98: '\u0098', 0x99: '\u2122', 0x9A: '\u0459',
      0x9B: '\u203A', // Правая одиночная угловая кавычка ›
      0x9C: '\u045A', 0x9D: '\u045C', 0x9E: '\u045B', 0x9F: '\u045F',
      0xA0: '\u00A0', // Неразрывный пробел
      0xA1: '\u040E', 0xA2: '\u045E', 0xA3: '\u0408', 0xA4: '\u00A4', 0xA5: '\u0490',
      0xA6: '\u00A6', 0xA7: '\u00A7', 0xA9: '\u00A9', 0xAA: '\u0404',
      0xAB: '\u00AB', // Левая кавычка-ёлочка « (КРИТИЧНО!)
      0xAC: '\u00AC', 0xAD: '\u00AD', 0xAE: '\u00AE', 0xAF: '\u0407',
      0xB0: '\u00B0', 0xB1: '\u00B1', 0xB2: '\u0406', 0xB3: '\u0456', 0xB4: '\u0491',
      0xB5: '\u00B5', 0xB6: '\u00B6', 0xB7: '\u00B7', 0xB9: '\u2116', // Номер №
      0xBA: '\u0454',
      0xBB: '\u00BB', // Правая кавычка-ёлочка » (КРИТИЧНО!)
      0xBC: '\u0458', 0xBD: '\u0405', 0xBE: '\u0455', 0xBF: '\u0457'
    };

    let result = '';
    for (const byte of buffer) {
      if (cp1251Map[byte]) {
        result += cp1251Map[byte];
      } else if (byte < 128) {
        // ASCII символы остаются как есть
        result += String.fromCodePoint(byte);
      } else {
        // Неизвестные символы заменяем на ?
        result += '?';
      }
    }

    return result;
  }

  private looksLikeFb2Document(content: string): boolean {
    const header = content.slice(0, 8192).toLowerCase();
    return header.includes('<fictionbook');
  }

  async parseBook(fileBuffer: Buffer, filename: string): Promise<ParsedBook> {
    try {
      this.assertInputSize(fileBuffer);

      // Автоопределение кодировки для корректной обработки кириллицы
      const content = this.detectAndDecodeContent(fileBuffer);
      const xmlBytes = Buffer.byteLength(content, 'utf8');

      if (xmlBytes > MAX_FB2_XML_BYTES) {
        throw new Error(`FB2 XML exceeds limit of ${Math.round(MAX_FB2_XML_BYTES / 1024 / 1024)} MB`);
      }

      if (!this.looksLikeFb2Document(content)) {
        throw new Error('Invalid FB2 payload: FictionBook tag was not detected');
      }

      const parser = new xml2js.Parser();
      const fb2Data = await this.withTimeout(
        parser.parseStringPromise(content),
        'Parse FB2 XML',
      );

      const fictionBook = fb2Data?.FictionBook as XmlElement | undefined;
      if (!fictionBook) {
        throw new Error('Invalid FB2 format: FictionBook element not found');
      }

      // Извлечь метаданные
      const metadata = await this.extractMetadata(fictionBook);

      // Извлечь главы через DOM-парсинг (сохраняет порядок чередования элементов)
      const chapters = this.domExtractor.extractChapters(content);

      // Вычислить хеш содержимого
      const contentHash = this.calculateTextContentHash(chapters);

      return {
        metadata: {
          ...metadata,
          totalChapters: chapters.length,
          contentHash,
        },
        chapters,
        originalFilename: filename,
        fileType: 'fb2',
      };
    } catch (error) {
      console.error('Error parsing FB2:', error);
      throw new Error(`Failed to parse FB2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractMetadata(fictionBook: XmlElement): Promise<Omit<BookMetadata, 'totalChapters'>> {
    const description = (fictionBook?.description as XmlElement[] | undefined)?.[0];
    if (!description) {
      throw new Error('No description section found in FB2');
    }

    const titleInfo = (description['title-info'] as XmlElement[] | undefined)?.[0];
    const publishInfo = (description['publish-info'] as XmlElement[] | undefined)?.[0];

    // Извлечь основные метаданные
    const title = this.extractFB2Text(titleInfo?.['book-title']);
    const author = this.extractAuthorName(titleInfo?.author);
    const description_text = this.extractFB2Text(titleInfo?.annotation);
    const isbn = this.extractFB2Text(publishInfo?.isbn);
    const genres = this.extractFB2Values(titleInfo?.genre);
    const language = (titleInfo?.lang as string[] | undefined)?.[0]
      || (titleInfo?.['src-lang'] as string[] | undefined)?.[0];
    const publisher = this.extractFB2Text(publishInfo?.publisher);
    const publishDate = Array.isArray(publishInfo?.year)
      ? (publishInfo?.year[0] as string | undefined)
      : undefined;

    // Попытаться найти обложку
    let coverImageData: Buffer | undefined;
    let coverImageType: string | undefined;

    try {
      const coverInfo = this.findCoverImage(fictionBook);
      if (coverInfo) {
        const decodedCover = Buffer.from(coverInfo.data, 'base64');
        if (decodedCover.length <= MAX_FB2_COVER_BYTES) {
          coverImageData = decodedCover;
          coverImageType = coverInfo.type;
        } else {
          logger.warn(
            { coverBytes: decodedCover.length, maxBytes: MAX_FB2_COVER_BYTES },
            '[FB2Parser] Skipping oversized cover image',
          );
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Could not extract cover image');
    }

    return {
      title: title || 'Unknown Title',
      author: author || 'Unknown Author',
      description: description_text,
      isbn,
      genre: genres[0],
      genres,
      language,
      publisher,
      publishDate,
      coverImageData,
      coverImageType,
    };
  }

  private extractFB2Text(element: unknown): string | undefined {
    if (!element || !Array.isArray(element)) return undefined;

    const firstElement = element[0] as unknown;
    if (typeof firstElement === 'string') return firstElement;
    if (typeof firstElement === 'object') {
      // Извлечь текст из вложенных элементов
      return this.extractTextFromFB2Element(firstElement);
    }

    return undefined;
  }

  private extractFB2Values(element: unknown): string[] {
    if (!Array.isArray(element)) return [];

    const values: string[] = [];

    for (const item of element) {
      if (typeof item === 'string') {
        const normalized = item.trim();
        if (normalized) values.push(normalized);
        continue;
      }

      if (typeof item === 'object' && item !== null) {
        const text = this.extractTextFromFB2Element(item).trim();
        if (text) values.push(text);
      }
    }

    return Array.from(new Set(values));
  }

  private extractTextFromFB2Element(element: unknown): string {
    if (typeof element === 'string') return element;
    if (!element) return '';

    let text = '';

    // Извлечь прямой текст
    const xmlElement = element as XmlElement;
    if (typeof xmlElement._ === 'string') text += xmlElement._;

    // Рекурсивно извлечь из дочерних элементов
    Object.keys(xmlElement).forEach(key => {
      if (key !== '$' && key !== '_') {
        const childElement = xmlElement[key];
        if (Array.isArray(childElement)) {
          childElement.forEach(child => {
            text += this.extractTextFromFB2Element(child);
          });
        }
      }
    });

    return text;
  }

  private extractAuthorName(authors: unknown): string | undefined {
    if (!authors || !Array.isArray(authors)) return undefined;

    const author = authors[0] as XmlElement | undefined;
    if (!author) return undefined;

    const firstName = this.extractFB2Text(author['first-name']) || '';
    const middleName = this.extractFB2Text(author['middle-name']) || '';
    const lastName = this.extractFB2Text(author['last-name']) || '';

    return [firstName, middleName, lastName].filter(Boolean).join(' ') || undefined;
  }

  private findCoverImage(fictionBook: XmlElement): { data: string; type: string } | null {
    const binaries = fictionBook?.binary as XmlElement[] | undefined;
    if (!binaries || !Array.isArray(binaries)) return null;

    // 1. Попытка найти ID обложки из метаданных (description -> title-info -> coverpage -> image)
    const description = (fictionBook?.description as XmlElement[] | undefined)?.[0];
    const titleInfo = (description?.['title-info'] as XmlElement[] | undefined)?.[0];
    const coverpage = (titleInfo?.coverpage as XmlElement[] | undefined)?.[0];
    const coverImage = (coverpage?.image as XmlElement[] | undefined)?.[0];

    const coverImageId = getXmlAttribute(coverImage, 'href')?.replace(/^#/, '');

    if (coverImageId) {
      const binary = binaries.find((b) => b.$?.id === coverImageId);
      const exactCover = this.buildFb2BinaryImage(binary);
      if (exactCover) return exactCover;
    }

    // 2. Fallback: Ищем бинарник с ID, содержащим "cover"
    const coverBinary = binaries.find((b) => {
      const id = b.$?.id?.toLowerCase();
      return id && (id.includes('cover') || id === 'cover.jpg' || id === 'cover.png');
    });

    const namedCover = this.buildFb2BinaryImage(coverBinary);
    if (namedCover) return namedCover;

    // 3. Fallback: Ищем первое изображение (старая логика)
    for (const binary of binaries) {
      const firstImage = this.buildFb2BinaryImage(binary, true);
      if (firstImage) return firstImage;
    }

    return null;
  }

  private buildFb2BinaryImage(binary: XmlElement | undefined, requireImageContentType = false): { data: string; type: string } | null {
    if (!binary) return null;

    const contentType = binary.$?.['content-type'];
    if (requireImageContentType && !contentType?.startsWith('image/')) {
      return null;
    }

    return {
      data: typeof binary._ === 'string' ? binary._ : '',
      type: contentType || 'image/jpeg',
    };
  }

  private extractChapters(fictionBook: XmlElement): BookChapter[] {
    const body = fictionBook?.body as XmlElement[] | undefined;
    if (!body || !Array.isArray(body)) return [];

    const chapters: BookChapter[] = [];
    let chapterNumber = 1;

    // Обработать каждый body (может быть несколько)
    body.forEach((bodyElement) => {
      // Фильтр: пропускаем body с name="notes" (сноски, примечания)
      const bodyName = bodyElement?.$?.name?.toLowerCase();
      if (bodyName === 'notes' || bodyName === 'comments') {
        logger.info({ bodyName }, '[FB2Parser] Skipping body section');
        return; // Пропускаем это body
      }

      const sections = bodyElement?.section as XmlElement[] | undefined ?? [];

      sections.forEach((section) => {
        if (chapters.length >= MAX_BOOK_CHAPTERS) {
          return;
        }

        chapterNumber = this.appendSectionChapters(section, chapters, chapterNumber, []);
      });
    });

    return chapters;
  }

  private appendSectionChapters(
    section: XmlElement,
    chapters: BookChapter[],
    chapterNumber: number,
    ancestorTitles: string[],
  ): number {
    if (chapters.length >= MAX_BOOK_CHAPTERS) {
      return chapterNumber;
    }

    const sectionTitle = this.extractSectionTitle(section);
    const childSections = asArray<XmlElement>(section?.section);
    const directContent = this.extractSectionOwnContent(section);
    const directWordCount = this.countWords(directContent);
    const nextAncestorTitles = sectionTitle?.trim()
      ? [...ancestorTitles, sectionTitle.trim()]
      : ancestorTitles;

    if (this.shouldSplitSectionIntoChildChapters(section, childSections, directWordCount)) {
      const hasMeaningfulIntro = directWordCount >= 80;

      if (hasMeaningfulIntro) {
        const title = sectionTitle || this.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);
        chapters.push({
          chapterNumber,
          title,
          content: directContent,
          wordCount: directWordCount,
        });
        chapterNumber += 1;
      }

      for (const childSection of childSections) {
        if (chapters.length >= MAX_BOOK_CHAPTERS) {
          break;
        }

        chapterNumber = this.appendSectionChapters(childSection, chapters, chapterNumber, nextAncestorTitles);
      }

      return chapterNumber;
    }

    const chapterContent = this.extractSectionContent(section);
    if (chapterContent.trim()) {
      const title = sectionTitle || this.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);

      chapters.push({
        chapterNumber,
        title,
        content: chapterContent,
        wordCount: this.countWords(chapterContent),
      });
      return chapterNumber + 1;
    }

    return chapterNumber;
  }

  private shouldSplitSectionIntoChildChapters(
    section: XmlElement,
    childSections: XmlElement[],
    directWordCount: number,
  ): boolean {
    if (childSections.length === 0) {
      return false;
    }

    const titledChildSections = childSections.filter((childSection) => {
      const title = this.extractSectionTitle(childSection);
      return Boolean(title && title.trim().length > 0);
    });

    if (titledChildSections.length === 0) {
      return false;
    }

    const sectionTitle = this.extractSectionTitle(section);
    const isContainerLike = directWordCount < 80;
    const nonStructuralChildTitles = titledChildSections.filter((childSection) => {
      const title = this.extractSectionTitle(childSection);
      return title ? !this.isStructuralSubsectionTitle(title) : false;
    });
    const structuralChildTitles = titledChildSections.filter((childSection) => {
      const title = this.extractSectionTitle(childSection);
      return title ? this.isStructuralSubsectionTitle(title) : false;
    });

    if (childSections.length >= 2 && isContainerLike && nonStructuralChildTitles.length >= 2) {
      return true;
    }

    if (childSections.length >= 2 && isContainerLike && structuralChildTitles.length >= 1) {
      return true;
    }

    if (childSections.length === 1 && !sectionTitle && directWordCount < 30 && nonStructuralChildTitles.length === 1) {
      return true;
    }

    return false;
  }

  private isStructuralSubsectionTitle(title: string): boolean {
    const normalized = title.trim().replaceAll(/\s+/g, ' ').toLowerCase();

    if (!normalized) {
      return true;
    }

    if (STRUCTURAL_FB2_SECTION_TITLES.includes(normalized as typeof STRUCTURAL_FB2_SECTION_TITLES[number])) {
      return true;
    }

    if (isArabicOrRomanSectionMarker(normalized)) {
      return true;
    }

    const [prefix, marker] = normalized.split(' ', 2);
    if (!prefix || !marker || !STRUCTURAL_FB2_SECTION_PREFIXES.includes(prefix as typeof STRUCTURAL_FB2_SECTION_PREFIXES[number])) {
      return false;
    }

    return isArabicOrRomanSectionMarker(marker)
      || STRUCTURAL_FB2_SECTION_ORDINALS.includes(marker as typeof STRUCTURAL_FB2_SECTION_ORDINALS[number]);
  }

  private buildFallbackSectionTitle(ancestorTitles: string[], chapterNumber: number, preferIntroLabel = false): string {
    const nearestAncestorTitle = [...ancestorTitles]
      .reverse()
      .find((title) => title.trim().length > 0);

    if (nearestAncestorTitle) {
      return preferIntroLabel ? `${nearestAncestorTitle} — вступление` : nearestAncestorTitle;
    }

    return `Chapter ${chapterNumber}`;
  }

  private extractSectionTitle(section: XmlElement): string | undefined {
    const title = section?.title as XmlElement[] | undefined;
    if (!title || !Array.isArray(title)) return undefined;

    const titleElement = title[0] as XmlElement | undefined;
    
    // Если в заголовке несколько параграфов (обычно автор + название в антологиях)
    const paragraphs = titleElement?.p as XmlElement[] | undefined;
    if (Array.isArray(paragraphs) && paragraphs.length > 1) {
      const parts = paragraphs
        .map((p) => this.extractTextFromFB2Element(p))
        .filter((text: string) => text?.trim());
      
      // Соединяем через точку с пробелом: "Автор. Название"
      return parts.join('. ');
    }
    
    // Обычный заголовок - один параграф
    return this.extractTextFromFB2Element(titleElement);
  }

  private extractSectionContent(section: XmlElement): string {
    let content = '';

    // Обработать заголовок секции как <h3>
    const sectionTitle = this.extractSectionTitle(section);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.escapeHtml(sectionTitle)}</h3>\n`;
    }

    // Обработать все элементы секции в порядке их появления
    Object.keys(section).forEach((key) => {
      if (key === '$' || key === 'title' || key === 'section') {
        return; // Пропускаем атрибуты, заголовок (уже обработан) и подсекции (обработаем позже)
      }

      const elements = asArray<XmlElement>(section[key]);

      elements.forEach((element) => {
        const elementContent = this.processFB2Element(key, element);
        if (elementContent) {
          content += elementContent;
        }
      });
    });

    // Рекурсивно обработать подсекции
    const subsections = section?.section as XmlElement[] | undefined ?? [];
    subsections.forEach((subsection) => {
      content += this.extractSectionContent(subsection);
    });

    return content;
  }

  /**
   * Обработка отдельного FB2 элемента с сохранением структуры
   */
  private processFB2Element(tagName: string, element: XmlElement): string {
    switch (tagName) {
      case 'p':
        return this.processFB2Paragraph(element);
      
      case 'subtitle':
        return `<h4>${this.processFB2InlineContent(element)}</h4>\n`;
      
      case 'epigraph':
        return this.processFB2Epigraph(element);
      
      case 'cite':
        return this.processFB2Cite(element);
      
      case 'annotation':
        return this.processFB2Annotation(element);
      
      case 'poem':
        return this.processFB2Poem(element);
      
      case 'stanza':
        return this.processFB2Stanza(element);
      
      case 'table':
        return this.processFB2Table(element);
      
      case 'empty-line':
        return '<br>\n';
      
      case 'image':
        return this.processFB2Image(element);
      
      case 'text-author':
        return `<p class="text-author"><em>${this.processFB2InlineContent(element)}</em></p>\n`;
      
      default: {
        // Для неизвестных тегов просто извлекаем текст
        const text = this.extractTextFromFB2Element(element);
        return text.trim() ? `<p>${this.escapeHtml(text)}</p>\n` : '';
      }
    }
  }

  /**
   * Обработка параграфа с поддержкой inline форматирования
   */
  private processFB2Paragraph(element: XmlElement): string {
    const content = this.processFB2InlineContent(element);
    return content.trim() ? `<p>${content}</p>\n` : '';
  }

  /**
   * Обработка inline содержимого (с форматированием)
   */
  private processFB2InlineContent(element: XmlElement): string {
    if (typeof element === 'string') {
      return this.escapeHtml(element);
    }

    let result = '';

    // Прямой текст узла
    if (typeof element._ === 'string') {
      result += this.escapeHtml(element._);
    }

    // Обработка дочерних элементов
    Object.keys(element).forEach((key) => {
      if (key === '$' || key === '_') {
        return;
      }

      const children = asArray<XmlElement>(element[key]);

      children.forEach((child) => {
        switch (key) {
          case 'strong':
            result += `<strong>${this.processFB2InlineContent(child)}</strong>`;
            break;
          
          case 'emphasis':
            result += `<em>${this.processFB2InlineContent(child)}</em>`;
            break;
          
          case 'strikethrough':
            result += `<del>${this.processFB2InlineContent(child)}</del>`;
            break;
          
          case 'sub':
            result += `<sub>${this.processFB2InlineContent(child)}</sub>`;
            break;
          
          case 'sup':
            result += `<sup>${this.processFB2InlineContent(child)}</sup>`;
            break;
          
          case 'code':
            result += `<code>${this.processFB2InlineContent(child)}</code>`;
            break;
          
          case 'a':
            result += this.processFB2Link(child);
            break;
          
          case 'image':
            result += this.processFB2Image(child);
            break;
          
          default:
            // Для неизвестных inline элементов просто извлекаем текст
            result += this.processFB2InlineContent(child);
        }
      });
    });

    return result;
  }

  /**
   * Обработка ссылок
   */
  private processFB2Link(element: XmlElement): string {
    const href = element.$?.['l:href'] || element.$?.href || '#';
    const text = this.processFB2InlineContent(element);
    
    // Внешние ссылки открываем в новом окне
    const isExternal = href.startsWith('http://') || href.startsWith('https://');
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    
    return `<a href="${this.escapeHtml(href)}"${target}>${text}</a>`;
  }

  /**
   * Обработка изображений
   */
  private processFB2Image(element: XmlElement): string {
    const href = getXmlAttribute(element, 'href');
    if (!href) return '';

    const alt = element.$?.alt || 'Image';
    return `<img src="${this.escapeHtml(href)}" alt="${this.escapeHtml(alt)}" class="fb2-image">`;
  }

  /**
   * Обработка эпиграфа
   */
  private processFB2Epigraph(element: XmlElement): string {
    let content = '<blockquote class="epigraph">\n';
    
    const paragraphs = asArray<XmlElement>(element.p);
    paragraphs.forEach((p) => {
      content += `<p>${this.processFB2InlineContent(p)}</p>\n`;
    });
    
    const textAuthors = asArray<XmlElement>(element['text-author']);
    textAuthors.forEach((author) => {
      content += `<p class="text-author"><em>${this.processFB2InlineContent(author)}</em></p>\n`;
    });
    
    content += '</blockquote>\n';
    return content;
  }

  /**
   * Обработка цитаты
   */
  private processFB2Cite(element: XmlElement): string {
    let content = '<blockquote class="cite">\n';
    
    const paragraphs = asArray<XmlElement>(element.p);
    paragraphs.forEach((p) => {
      content += `<p>${this.processFB2InlineContent(p)}</p>\n`;
    });
    
    const subtitles = asArray<XmlElement>(element.subtitle);
    subtitles.forEach((subtitle) => {
      content += `<h5>${this.processFB2InlineContent(subtitle)}</h5>\n`;
    });
    
    const textAuthors = asArray<XmlElement>(element['text-author']);
    textAuthors.forEach((author) => {
      content += `<p class="text-author"><em>${this.processFB2InlineContent(author)}</em></p>\n`;
    });
    
    content += '</blockquote>\n';
    return content;
  }

  /**
   * Обработка аннотации
   */
  private processFB2Annotation(element: XmlElement): string {
    let content = '<div class="annotation">\n';
    
    const paragraphs = asArray<XmlElement>(element.p);
    paragraphs.forEach((p) => {
      content += `<p>${this.processFB2InlineContent(p)}</p>\n`;
    });
    
    const poems = asArray<XmlElement>(element.poem);
    poems.forEach((poem) => {
      content += this.processFB2Poem(poem);
    });
    
    const subtitles = asArray<XmlElement>(element.subtitle);
    subtitles.forEach((subtitle) => {
      content += `<h5>${this.processFB2InlineContent(subtitle)}</h5>\n`;
    });
    
    content += '</div>\n';
    return content;
  }

  /**
   * Обработка поэмы/стихотворения
   */
  private processFB2Poem(element: XmlElement): string {
    let content = '<div class="poem">\n';
    
    const titles = asArray<XmlElement>(element.title);
    titles.forEach((title) => {
      const titleText = this.extractTextFromFB2Element(title);
      if (titleText.trim()) {
        content += `<h5 class="poem-title">${this.escapeHtml(titleText)}</h5>\n`;
      }
    });
    
    const stanzas = asArray<XmlElement>(element.stanza);
    stanzas.forEach((stanza) => {
      content += this.processFB2Stanza(stanza);
    });
    
    const textAuthors = asArray<XmlElement>(element['text-author']);
    textAuthors.forEach((author) => {
      content += `<p class="text-author"><em>${this.processFB2InlineContent(author)}</em></p>\n`;
    });
    
    content += '</div>\n';
    return content;
  }

  /**
   * Обработка строфы
   */
  private processFB2Stanza(element: XmlElement): string {
    let content = '<div class="stanza">\n';
    
    const titles = asArray<XmlElement>(element.title);
    titles.forEach((title) => {
      const titleText = this.extractTextFromFB2Element(title);
      if (titleText.trim()) {
        content += `<h6 class="stanza-title">${this.escapeHtml(titleText)}</h6>\n`;
      }
    });
    
    const subtitles = asArray<XmlElement>(element.subtitle);
    subtitles.forEach((subtitle) => {
      content += `<p class="stanza-subtitle"><em>${this.processFB2InlineContent(subtitle)}</em></p>\n`;
    });
    
    const verses = asArray<XmlElement>(element.v);
    verses.forEach((verse) => {
      const verseText = this.processFB2InlineContent(verse);
      if (verseText.trim()) {
        content += `<p class="verse">${verseText}</p>\n`;
      }
    });
    
    content += '</div>\n';
    return content;
  }

  /**
   * Обработка таблицы
   */
  private processFB2Table(element: XmlElement): string {
    let content = '<table class="fb2-table">\n';
    
    const rows = asArray<XmlElement>(element.tr);
    rows.forEach((row) => {
      content += '<tr>\n';
      
      const cells = [
        ...asArray<XmlElement>(row.th).map(cell => ({ cell, isHeader: true })),
        ...asArray<XmlElement>(row.td).map(cell => ({ cell, isHeader: false }))
      ];
      
      cells.forEach(({ cell, isHeader }) => {
        const tag = isHeader ? 'th' : 'td';
        const cellContent = this.processFB2InlineContent(cell);
        
        // Обработка атрибутов colspan, rowspan, align, valign
        const colspan = cell.$?.colspan;
        const rowspan = cell.$?.rowspan;
        const align = cell.$?.align;
        const valign = cell.$?.valign;
        
        let attrs = '';
        if (colspan) attrs += ` colspan="${this.escapeHtml(String(colspan))}"`;
        if (rowspan) attrs += ` rowspan="${this.escapeHtml(String(rowspan))}"`;
        if (align) attrs += ` align="${this.escapeHtml(String(align))}"`;
        if (valign) attrs += ` valign="${this.escapeHtml(String(valign))}"`;
        
        content += `<${tag}${attrs}>${cellContent}</${tag}>\n`;
      });
      
      content += '</tr>\n';
    });
    
    content += '</table>\n';
    return content;
  }

  private extractSectionOwnContent(section: XmlElement): string {
    let content = '';

    const sectionTitle = this.extractSectionTitle(section);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.escapeHtml(sectionTitle)}</h3>\n`;
    }

    // Обработать все элементы секции (кроме подсекций) в порядке их появления
    Object.keys(section).forEach((key) => {
      if (key === '$' || key === 'title' || key === 'section') {
        return; // Пропускаем атрибуты, заголовок (уже обработан) и подсекции
      }

      const elements = asArray<XmlElement>(section[key]);

      elements.forEach((element) => {
        const elementContent = this.processFB2Element(key, element);
        if (elementContent) {
          content += elementContent;
        }
      });
    });

    return content;
  }

  // ────────────────────────────────────────────────────────────────────────────

  private escapeHtml(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
