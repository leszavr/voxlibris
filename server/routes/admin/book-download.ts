import { storage } from '../../repositories/index.js';
import { fileStorage } from '../../file-storage.js';
import { CryptoService } from '../../crypto-service.js';

interface DownloadPayload {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}

function normalizeStorageKey(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const normalizedPath = url.pathname.replace(/^\/+/, '');
      if (normalizedPath.startsWith('api/storage/')) {
        return normalizedPath.replace(/^api\/storage\//, '');
      }

      const segments = normalizedPath.split('/').filter(Boolean);
      return segments.length >= 2 ? segments.slice(1).join('/') : normalizedPath;
    } catch {
      // Fall through to plain path normalization.
    }
  }

  const plainPath = trimmed.replace(/^\/+/, '');
  return plainPath.startsWith('api/storage/') ? plainPath.replace(/^api\/storage\//, '') : plainPath;
}

function sanitizeFileNameBase(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replaceAll(/[^\p{L}\p{N}\s._-]/gu, '')
    .trim()
    .replaceAll(/\s+/g, '_');

  return normalized.length > 0 ? normalized.slice(0, 120) : 'book';
}

function getFormatMeta(format: string | null | undefined): { ext: string; mimeType: string } {
  const normalized = (format || '').toLowerCase();
  if (normalized === 'epub') return { ext: 'epub', mimeType: 'application/epub+zip' };
  if (normalized === 'fb2') return { ext: 'fb2', mimeType: 'application/x-fictionbook+xml' };
  return { ext: 'bin', mimeType: 'application/octet-stream' };
}

function buildAttachmentFileName(baseName: string, ext: string): string {
  const normalizedExt = ext.replace(/^\./, '').trim() || 'bin';
  return `${sanitizeFileNameBase(baseName)}.${normalizedExt}`;
}


export async function buildPersonalBookDownloadPayload(
  id: string,
): Promise<{ payload?: DownloadPayload; error?: string; statusCode?: number }> {
  const book = await storage.getPersonalBook(id);
  if (!book) {
    return { statusCode: 404, error: 'Personal book not found' };
  }

  if (!book.storagePath) {
    return { statusCode: 400, error: 'Book file path is missing' };
  }

  if (!book.encryptedContentKey) {
    return { statusCode: 400, error: 'Book encryption key is missing' };
  }

  const encryptedFile = await fileStorage.getFile(book.storagePath);
  const cek = CryptoService.decryptKey(book.encryptedContentKey);
  const decryptedFile = CryptoService.decryptFile(encryptedFile, cek);
  const formatMeta = getFormatMeta(book.format);

  return {
    payload: {
      fileBuffer: decryptedFile,
      fileName: buildAttachmentFileName(book.title, formatMeta.ext),
      mimeType: formatMeta.mimeType,
    },
  };
}

export async function buildClubBookDownloadPayload(
  id: string,
): Promise<{ payload?: DownloadPayload; error?: string; statusCode?: number }> {
  const book = await storage.getClubBook(id);
  if (!book) {
    return { statusCode: 404, error: 'Club book not found' };
  }

  if (!book.storagePath) {
    return { statusCode: 400, error: 'Book file path is missing' };
  }

  if (!book.encryptedContentKey) {
    return { statusCode: 400, error: 'Book encryption key is missing' };
  }

  const encryptedFile = await fileStorage.getFile(book.storagePath);
  const cek = CryptoService.decryptKey(book.encryptedContentKey);
  const decryptedFile = CryptoService.decryptFile(encryptedFile, cek);
  const formatMeta = getFormatMeta(book.format);

  return {
    payload: {
      fileBuffer: decryptedFile,
      fileName: buildAttachmentFileName(book.title, formatMeta.ext),
      mimeType: formatMeta.mimeType,
    },
  };
}

export async function buildRegularBookDownloadPayload(
  id: string,
): Promise<{ payload?: DownloadPayload; error?: string; statusCode?: number }> {
  const book = await storage.getBook(id);
  if (!book) {
    return { statusCode: 404, error: 'Book not found' };
  }

  if (!book.contentPath) {
    return { statusCode: 400, error: 'Book file is not available for download' };
  }

  const storageKey = normalizeStorageKey(book.contentPath);
  if (!storageKey) {
    return { statusCode: 400, error: 'Book file path is invalid' };
  }

  const fileBuffer = await fileStorage.getFile(storageKey);
  const formatMeta = getFormatMeta(book.contentType);
  const originalExtension = book.originalFilename?.split('.').pop() || formatMeta.ext;

  return {
    payload: {
      fileBuffer,
      fileName: buildAttachmentFileName(book.title, originalExtension),
      mimeType: formatMeta.mimeType,
    },
  };
}
