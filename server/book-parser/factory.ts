import * as path from 'node:path';
import JSZip from 'jszip';
import { logger } from '../lib/logger.js';
import { EPUBParser } from './epub-parser.js';
import { FB2Parser } from './fb2-parser.js';
import {
  BaseBookParser,
  BOOK_PARSE_TIMEOUT_MS,
  MAX_BOOK_PARSE_BYTES,
  MAX_EPUB_ENTRIES,
  MAX_EPUB_UNCOMPRESSED_BYTES,
  withParseTimeout,
} from './shared.js';

// Factory для создания парсеров
export class BookParserFactory {
  static createParser(fileType: 'epub' | 'fb2'): BaseBookParser {
    switch (fileType) {
      case 'epub':
        return new EPUBParser();
      case 'fb2':
        return new FB2Parser();
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  private static hasZipSignature(fileBuffer: Buffer): boolean {
    if (fileBuffer.length < 4) {
      return false;
    }

    if (fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4b) {
      return false;
    }

    return (
      (fileBuffer[2] === 0x03 && fileBuffer[3] === 0x04) ||
      (fileBuffer[2] === 0x05 && fileBuffer[3] === 0x06) ||
      (fileBuffer[2] === 0x07 && fileBuffer[3] === 0x08)
    );
  }

  private static hasFb2Signature(fileBuffer: Buffer): boolean {
    const head = fileBuffer.subarray(0, 8192).toString('utf8').replace(/^\uFEFF/, '').toLowerCase();
    return head.includes('<fictionbook');
  }

  private static getZipEntryUncompressedSize(entry: unknown): number | null {
    const size = (entry as { _data?: { uncompressedSize?: unknown } })?._data?.uncompressedSize;
    return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null;
  }

  private static async isValidEpubBuffer(fileBuffer: Buffer): Promise<boolean> {
    try {
      const zip = await this.withTimeout(
        JSZip.loadAsync(fileBuffer),
        'Inspect EPUB archive',
      );
      const files = Object.entries(zip.files).filter(([, entry]) => !entry.dir);

      if (files.length === 0 || files.length > MAX_EPUB_ENTRIES) {
        return false;
      }

      let totalUncompressed = 0;
      for (const [entryName, entry] of files) {
        const normalizedName = entryName.replaceAll('\\', '/');
        if (normalizedName.startsWith('/') || normalizedName.includes('../')) {
          return false;
        }

        const size = this.getZipEntryUncompressedSize(entry);
        if (size !== null) {
          totalUncompressed += size;
          if (totalUncompressed > MAX_EPUB_UNCOMPRESSED_BYTES) {
            return false;
          }
        }
      }

      const mimetypeFile = zip.file('mimetype');
      if (!mimetypeFile) {
        return false;
      }

      const mimetypeSize = this.getZipEntryUncompressedSize(mimetypeFile);
      if (mimetypeSize !== null && mimetypeSize > 128) {
        return false;
      }

      const mimetypeContent = await this.withTimeout(
        mimetypeFile.async('string'),
        'Read EPUB mimetype',
      );
      if (mimetypeContent.trim() !== 'application/epub+zip') {
        return false;
      }

      return Boolean(zip.file('META-INF/container.xml'));
    } catch (error) {
      logger.warn({ error }, '[BookParserFactory] Failed to validate EPUB signature');
      return false;
    }
  }

  private static withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = BOOK_PARSE_TIMEOUT_MS): Promise<T> {
    return withParseTimeout(promise, label, timeoutMs);
  }

  static async detectFileTypeFromBuffer(fileBuffer: Buffer, filename?: string): Promise<'epub' | 'fb2' | null> {
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      return null;
    }

    if (fileBuffer.length > MAX_BOOK_PARSE_BYTES) {
      return null;
    }

    if (this.hasZipSignature(fileBuffer)) {
      const isValidEpub = await this.isValidEpubBuffer(fileBuffer);
      if (isValidEpub) {
        return 'epub';
      }
      return null;
    }

    if (this.hasFb2Signature(fileBuffer)) {
      return 'fb2';
    }

    // Conservative fallback for legacy FB2 files with uncommon prologs.
    if (filename && this.detectFileType(filename) === 'fb2') {
      const xmlHead = fileBuffer.subarray(0, 4096).toString('utf8').toLowerCase();
      if (xmlHead.includes('<?xml')) {
        return 'fb2';
      }
    }

    return null;
  }

  static detectFileType(filename: string): 'epub' | 'fb2' | null {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.epub':
        return 'epub';
      case '.fb2':
        return 'fb2';
      default:
        return null;
    }
  }
}
