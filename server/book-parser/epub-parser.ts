import * as path from 'node:path';
import JSZip from 'jszip';
import * as xml2js from 'xml2js';
import * as mime from 'mime-types';
import { JSDOM } from 'jsdom';
import { logger } from '../lib/logger.js';
import {
  BaseBookParser,
  type BookMetadata,
  type BookChapter,
  type ParsedBook,
  type XmlElement,
  asArray,
  firstItem,
  getXmlTextNodeValue,
  MAX_BOOK_CHAPTERS,
  MAX_EPUB_COVER_BYTES,
  MAX_EPUB_ENTRIES,
  MAX_EPUB_TEXT_ENTRY_BYTES,
  MAX_EPUB_UNCOMPRESSED_BYTES,
} from './shared.js';

export class EPUBParser extends BaseBookParser {
  async parseBook(fileBuffer: Buffer, filename: string): Promise<ParsedBook> {
    try {
      this.assertInputSize(fileBuffer);

      const zip = await this.withTimeout(
        JSZip.loadAsync(fileBuffer),
        'EPUB archive loading',
      );
      this.ensureArchiveSafety(zip);

      // Найти OPF файл (содержит метаданные)
      const opfFile = await this.findOpfFile(zip);
      if (!opfFile) {
        throw new Error('OPF file not found in EPUB');
      }

      const normalizedOpfPath = this.normalizeZipPath(opfFile);
      const opfFileObject = zip.file(normalizedOpfPath);
      if (!opfFileObject) {
        throw new Error('OPF file object not found');
      }

      this.assertZipEntrySize(opfFileObject, MAX_EPUB_TEXT_ENTRY_BYTES, 'OPF file');
      const opfContent = await this.withTimeout(
        opfFileObject.async('string'),
        'Read OPF file',
      );
      if (!opfContent) {
        throw new Error('Failed to read OPF content');
      }

      const parser = new xml2js.Parser();
      const opfData = await this.withTimeout(
        parser.parseStringPromise(opfContent),
        'Parse OPF XML',
      );

      const opfDir = this.normalizeOpfDir(normalizedOpfPath);

      // Извлечь метаданные
      const metadata = await this.extractMetadata(opfData, zip, opfDir);

      // Извлечь главы
      const chapters = await this.extractChapters(opfData, zip, opfDir, metadata.title);

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
        fileType: 'epub',
      };
    } catch (error) {
      console.error('Error parsing EPUB:', error);
      throw new Error(`Failed to parse EPUB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getZipEntryUncompressedSize(entry: unknown): number | null {
    const size = (entry as { _data?: { uncompressedSize?: unknown } })?._data?.uncompressedSize;
    return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null;
  }

  private assertZipEntrySize(entry: unknown, maxBytes: number, entryLabel: string): void {
    const declaredSize = this.getZipEntryUncompressedSize(entry);
    if (declaredSize !== null && declaredSize > maxBytes) {
      throw new Error(`${entryLabel} exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
    }
  }

  private ensureArchiveSafety(zip: JSZip): void {
    const entries = Object.entries(zip.files);
    const fileEntries = entries.filter(([, entry]) => !entry.dir);

    if (fileEntries.length === 0) {
      throw new Error('EPUB archive has no files');
    }

    if (fileEntries.length > MAX_EPUB_ENTRIES) {
      throw new Error(`EPUB archive has too many files: ${fileEntries.length}`);
    }

    let totalUncompressedBytes = 0;

    for (const [entryName, entry] of fileEntries) {
      const normalizedName = entryName.replaceAll('\\', '/');
      if (normalizedName.startsWith('/') || normalizedName.includes('../')) {
        throw new Error(`Unsafe EPUB entry path: ${entryName}`);
      }

      const size = this.getZipEntryUncompressedSize(entry);
      if (size !== null) {
        totalUncompressedBytes += size;
        if (totalUncompressedBytes > MAX_EPUB_UNCOMPRESSED_BYTES) {
          throw new Error(`EPUB archive exceeds max uncompressed size of ${Math.round(MAX_EPUB_UNCOMPRESSED_BYTES / 1024 / 1024)} MB`);
        }
      }
    }
  }

  private async findOpfFile(zip: JSZip): Promise<string | null> {
    // Читаем META-INF/container.xml для поиска OPF файла
    const containerContent = await this.readZipText(zip, 'META-INF/container.xml', MAX_EPUB_TEXT_ENTRY_BYTES);
    if (!containerContent) return null;

    try {
      const parser = new xml2js.Parser();
      const containerData = await this.withTimeout(
        parser.parseStringPromise(containerContent),
        'Parse EPUB container.xml',
      );

      const rootfiles = containerData?.container?.rootfiles?.[0]?.rootfile;
      if (rootfiles && rootfiles.length > 0) {
        return rootfiles[0].$?.['full-path'];
      }
    } catch (error) {
      console.error('Error parsing container.xml:', error);
    }

    // Fallback: поиск .opf файлов
    for (const filename of Object.keys(zip.files)) {
      if (filename.endsWith('.opf')) {
        return filename;
      }
    }

    return null;
  }

  private async extractMetadata(
    opfData: XmlElement,
    zip: JSZip,
    opfDir: string
  ): Promise<Omit<BookMetadata, 'totalChapters'>> {
    const packageNode = opfData?.package as XmlElement | undefined;
    const metadata = firstItem<XmlElement>(packageNode?.metadata);
    if (!metadata) {
      return {
        title: 'Unknown Title',
        author: 'Unknown Author',
      };
    }

    // Извлечь основные метаданные
    const title = this.extractMetaValue(metadata['dc:title'] ?? metadata.title);
    const author = this.extractMetaValue(metadata['dc:creator'] ?? metadata.creator);
    const description = this.extractMetaValue(metadata['dc:description'] ?? metadata.description);
    const isbn = this.extractMetaValue(metadata['dc:identifier'] ?? metadata.identifier);
    const genres = this.extractMetaValues(metadata['dc:subject'] ?? metadata.subject);
    const language = this.extractMetaValue(metadata['dc:language'] ?? metadata.language);
    const publisher = this.extractMetaValue(metadata['dc:publisher'] ?? metadata.publisher);
    const publishDate = this.extractMetaValue(metadata['dc:date'] ?? metadata.date);

    // Попытаться найти обложку
    let coverImageData: Buffer | undefined;
    let coverImageType: string | undefined;

    try {
      const coverInfo = await this.findCoverImage(opfData, zip, opfDir);
      if (coverInfo) {
        coverImageData = coverInfo.data;
        coverImageType = coverInfo.type;
      }
    } catch (error) {
      logger.warn({ error }, 'Could not extract cover image');
    }

    return {
      title: title || 'Unknown Title',
      author: author || 'Unknown Author',
      description,
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

  private extractMetaValue(metaValue: unknown): string | undefined {
    if (!metaValue) return undefined;

    if (typeof metaValue === 'string') return metaValue;

    if (Array.isArray(metaValue)) {
      const firstMetaValue = metaValue[0];
      return typeof firstMetaValue === 'string'
        ? firstMetaValue
        : getXmlTextNodeValue(firstMetaValue);
    }

    return getXmlTextNodeValue(metaValue);
  }

  private extractMetaValues(metaValue: unknown): string[] {
    if (!metaValue) return [];

    const source = Array.isArray(metaValue) ? metaValue : [metaValue];
    const values = source
      .map((item) => typeof item === 'string' ? item : getXmlTextNodeValue(item))
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(values));
  }

  private async readManifestItemBuffer(
    zip: JSZip,
    opfDir: string,
    href: string,
    mediaType: string | undefined,
  ): Promise<{ data: Buffer; type: string } | null> {
    const imagePath = this.resolveZipPath(opfDir, href.split('#')[0]);
    const imageFile = zip.file(imagePath);
    if (!imageFile) return null;

    this.assertZipEntrySize(imageFile, MAX_EPUB_COVER_BYTES, `EPUB cover image: ${imagePath}`);
    const imageData = await this.withTimeout(
      imageFile.async('nodebuffer'),
      `Read EPUB cover image: ${imagePath}`,
    );

    return {
      data: imageData,
      type: mediaType || mime.lookup(href) || 'image/jpeg',
    };
  }

  private async findCoverImage(
    opfData: XmlElement,
    zip: JSZip,
    opfDir: string
  ): Promise<{ data: Buffer; type: string } | null> {
    const packageNode = opfData?.package as XmlElement | undefined;
    const manifestRoot = firstItem<XmlElement>(packageNode?.manifest);
    const manifest = asArray<XmlElement>(manifestRoot?.item);

    // Искать элемент с id="cover" или media-type содержащий "image"
    for (const item of manifest) {
      const id = item.$?.id;
      const href = item.$?.href;
      const mediaType = item.$?.['media-type'];

      if ((id === 'cover' || id === 'cover-image' || mediaType?.startsWith('image/')) && href) {
        try {
          const cover = await this.readManifestItemBuffer(zip, opfDir, href, mediaType);
          if (cover) return cover;
        } catch (error) {
          logger.warn({ error }, 'Error reading cover image');
        }
      }
    }

    return null;
  }

  private async extractChapters(
    opfData: XmlElement,
    zip: JSZip,
    opfDir: string,
    bookTitle?: string
  ): Promise<BookChapter[]> {
    const packageNode = opfData?.package as XmlElement | undefined;
    const spineRoot = firstItem<XmlElement>(packageNode?.spine);
    const manifestRoot = firstItem<XmlElement>(packageNode?.manifest);
    const spine = asArray<XmlElement>(spineRoot?.itemref);
    const manifest = asArray<XmlElement>(manifestRoot?.item);

    const manifestMap = new Map(
      manifest
        .map((item) => [item.$?.id, item] as const)
        .filter((entry): entry is [string, XmlElement] => Boolean(entry[0])),
    );

    const tocMap = await this.extractTocMap(opfData, zip, opfDir);
    const chapters: BookChapter[] = [];

    for (let i = 0; i < spine.length; i++) {
      if (chapters.length >= MAX_BOOK_CHAPTERS) {
        throw new Error(`EPUB exceeds chapter limit of ${MAX_BOOK_CHAPTERS}`);
      }

      const itemRef = spine[i];
      const idref = itemRef.$?.idref;
      const linear = itemRef.$?.linear;

      if (!idref) continue;
      if (linear && String(linear).toLowerCase() === 'no') continue;

      const href = this.getSpineItemHref(manifestMap, idref);
      if (!href) continue;

      try {
        const chapter = await this.readEpubChapter(zip, opfDir, href, tocMap, chapters.length + 1, bookTitle);
        if (!chapter) continue;
        chapters.push(chapter);
      } catch (error) {
        console.warn(`Error processing chapter ${i + 1}:`, error);
      }
    }

    return chapters;
  }

  private async readEpubChapter(
    zip: JSZip,
    opfDir: string,
    href: string,
    tocMap: Map<string, string>,
    chapterNumber: number,
    bookTitle?: string,
  ): Promise<BookChapter | null> {
    const filePath = this.resolveZipPath(opfDir, href.split('#')[0]);
    const chapterFile = zip.file(filePath);

    if (!chapterFile) {
      console.warn(`Chapter file not found: ${filePath}`);
      return null;
    }

    this.assertZipEntrySize(chapterFile, MAX_EPUB_TEXT_ENTRY_BYTES, `EPUB chapter file: ${filePath}`);
    const chapterContent = await this.withTimeout(
      chapterFile.async('string'),
      `Read EPUB chapter file: ${filePath}`,
    );
    const { html, text, title } = this.extractReadableHtmlFromEpub(chapterContent);
    const textContent = text || this.extractTextFromHtml(chapterContent);
    const tocTitle = tocMap.get(filePath);
    const chapterTitle = this.chooseChapterTitle(title, tocTitle, chapterNumber, bookTitle);

    if (this.isNonContentChapter(chapterTitle, textContent, html, bookTitle)) {
      return null;
    }

    return {
      chapterNumber,
      title: chapterTitle,
      content: html || textContent,
      wordCount: this.countWords(textContent),
    };
  }

  private normalizeZipPath(zipPath: string): string {
    return zipPath.replace(/^[\\/]+/, '');
  }

  private normalizeOpfDir(opfPath: string): string {
    const dir = path.posix.dirname(this.normalizeZipPath(opfPath));
    return dir === '.' ? '' : dir;
  }

  private resolveZipPath(opfDir: string, href: string): string {
    const stripped = href.replace(/^[\\/]+/, '');
    let decoded = stripped;
    try {
      decoded = decodeURIComponent(stripped);
    } catch {
      decoded = stripped;
    }
    return opfDir ? path.posix.join(opfDir, decoded) : decoded;
  }

  private extractReadableHtmlFromEpub(htmlContent: string): { html: string; text: string; title?: string } {
    try {
      const dom = new JSDOM(htmlContent);
      const doc = dom.window.document;

      // Удаляем только действительно служебные элементы
      // Оставляем семантические HTML5 теги (section, article, aside, figure, figcaption)
      // Оставляем MathML и SVG (допустимы в EPUB 3)
      const removeSelectors = [
        "script", "style", "header", "footer", "form",
        "iframe", "link", "meta", "button", "input",
        "textarea", "select",
        ".toc", "#toc", "[role='doc-toc']",
        // Удаляем nav только если это явно навигация (TOC)
        "nav[role='navigation']",
        String.raw`nav[epub\:type='toc']`,
        String.raw`nav[epub\:type='landmarks']`,
        // Удаляем pagebreak элементы (служебные)
        String.raw`[epub\:type='pagebreak']`,
        String.raw`span[epub\:type='pagebreak']`,
      ];
      doc.querySelectorAll(removeSelectors.join(",")).forEach(el => el.remove());

      // Сохраняем важные атрибуты epub:type, преобразуя их в data-epub-type для HTML
      doc.querySelectorAll(String.raw`[epub\:type]`).forEach(el => {
        const epubType = el.getAttribute("epub:type");
        if (epubType && el instanceof dom.window.HTMLElement) {
          el.dataset.epubType = epubType;
        }
      });

      const body = doc.body || doc.documentElement;
      if (!body) {
        return { html: "", text: "" };
      }

      const titleEl = doc.querySelector("h1, h2, h3, title");
      const title = titleEl?.textContent?.trim();

      const html = body.innerHTML.trim();
      const text = body.textContent?.trim() || "";

      return { html, text, title };
    } catch (error) {
      console.warn("Failed to extract readable HTML from EPUB:", error);
      return { html: "", text: "" };
    }
  }

  private normalizeTitle(value?: string): string {
    return (value || "")
      .toLowerCase()
      .replaceAll(/\s+/g, " ")
      .trim();
  }

  private chooseChapterTitle(
    htmlTitle: string | undefined,
    tocTitle: string | undefined,
    chapterNumber: number,
    bookTitle?: string
  ): string {
    const normalizedBookTitle = this.normalizeTitle(bookTitle);
    const normalizedHtmlTitle = this.normalizeTitle(htmlTitle);

    if (tocTitle && this.normalizeTitle(tocTitle)) {
      return tocTitle;
    }

    if (htmlTitle && normalizedHtmlTitle && normalizedHtmlTitle !== normalizedBookTitle) {
      return htmlTitle;
    }

    return `Chapter ${chapterNumber}`;
  }

  private isNonContentChapter(
    chapterTitle: string,
    textContent: string,
    htmlContent: string,
    bookTitle?: string
  ): boolean {
    const normalizedTitle = this.normalizeTitle(chapterTitle);
    const normalizedBookTitle = this.normalizeTitle(bookTitle);

    const stopTitles = new Set([
      "cover",
      "annotation",
      "annotaion",
      "annotation.",
      "аннотация",
      "обложка",
      "титульный лист",
      "title",
      "title page",
      "copyright",
      "copyright page",
      "предисловие",
      "от автора",
      "оглавление",
      "contents",
      "table of contents"
    ]);

    const hasImages = /<img\b/i.test(htmlContent);
    const wordCount = this.countWords(textContent);

    if (normalizedTitle && stopTitles.has(normalizedTitle) && wordCount < 120 && !hasImages) {
      return true;
    }

    if (normalizedTitle && normalizedBookTitle && normalizedTitle === normalizedBookTitle && wordCount < 200 && !hasImages) {
      return true;
    }

    if (!wordCount && !hasImages) {
      return true;
    }

    return false;
  }

  private async extractTocMap(opfData: XmlElement, zip: JSZip, opfDir: string): Promise<Map<string, string>> {
    const tocMap = new Map<string, string>();
    const packageNode = opfData?.package as XmlElement | undefined;
    const manifestRoot = firstItem<XmlElement>(packageNode?.manifest);
    const manifest = asArray<XmlElement>(manifestRoot?.item);

    await this.appendNavToc(manifest, zip, opfDir, tocMap);

    // EPUB2 fallback: NCX
    if (tocMap.size === 0) {
      await this.appendNcxToc(manifest, zip, opfDir, tocMap);
    }

    return tocMap;
  }

  private extractTocFromNavHtml(htmlContent: string, opfDir: string, tocMap: Map<string, string>): void {
    try {
      const dom = new JSDOM(htmlContent);
      const doc = dom.window.document;

      const nav = this.findTocNavElement(doc);

      if (!nav) return;

      nav.querySelectorAll("a[href]").forEach((link) => {
        const href = link.getAttribute("href");
        if (!href) return;
        const label = link.textContent?.trim();
        if (!label) return;

        const filePath = this.resolveZipPath(opfDir, href.split('#')[0]);
        if (!tocMap.has(filePath)) {
          tocMap.set(filePath, label);
        }
      });
    } catch (error) {
      console.warn("Failed to extract TOC from nav HTML:", error);
    }
  }

  private extractTocFromNcx(ncxData: XmlElement, opfDir: string, tocMap: Map<string, string>): void {
    const ncxRoot = ncxData?.ncx as XmlElement | undefined;
    const navMap = firstItem<XmlElement>(ncxRoot?.navMap);
    const navPoints = asArray<XmlElement>(navMap?.navPoint);
    if (!Array.isArray(navPoints)) return;

    const walk = (points: XmlElement[]) => {
      for (const point of points) {
        const navLabel = asArray<XmlElement>(point?.navLabel);
        const label = firstItem<XmlElement>(navLabel)?.text;
        const labelText = Array.isArray(label) ? (label[0] as string | undefined)?.trim() : undefined;
        const content = asArray<XmlElement>(point?.content);
        const src = firstItem<XmlElement>(content)?.$?.src;
        if (labelText && src) {
          const filePath = this.resolveZipPath(opfDir, src.split('#')[0]);
          if (!tocMap.has(filePath)) {
            tocMap.set(filePath, labelText);
          }
        }
        const children = point?.navPoint;
        if (Array.isArray(children) && children.length > 0) {
          walk(children as XmlElement[]);
        }
      }
    };

    walk(navPoints);
  }

  private findNavItem(manifest: XmlElement[]): XmlElement | null {
    return manifest.find((item) => String(item.$?.properties || "").toLowerCase().includes("nav")) || null;
  }

  private findNcxItem(manifest: XmlElement[]): XmlElement | null {
    return manifest.find((item) =>
      String(item.$?.['media-type'] || "").toLowerCase().includes("x-dtbncx+xml")
    ) || null;
  }

  private async readZipText(zip: JSZip, filePath: string, maxBytes = MAX_EPUB_TEXT_ENTRY_BYTES): Promise<string | null> {
    const file = zip.file(filePath);
    if (!file) return null;

    this.assertZipEntrySize(file, maxBytes, `EPUB entry: ${filePath}`);

    try {
      return await this.withTimeout(
        file.async("string"),
        `Read EPUB entry: ${filePath}`,
      );
    } catch (error) {
      console.warn("Failed to read EPUB file:", error);
      return null;
    }
  }

  private async appendNavToc(
    manifest: XmlElement[],
    zip: JSZip,
    opfDir: string,
    tocMap: Map<string, string>
  ): Promise<void> {
    const navItem = this.findNavItem(manifest);
    if (!navItem?.$?.href) return;

    const navPath = this.resolveZipPath(opfDir, navItem.$.href.split('#')[0]);
    const navContent = await this.readZipText(zip, navPath);
    if (!navContent) return;

    this.extractTocFromNavHtml(navContent, opfDir, tocMap);
  }

  private async appendNcxToc(
    manifest: XmlElement[],
    zip: JSZip,
    opfDir: string,
    tocMap: Map<string, string>
  ): Promise<void> {
    const ncxItem = this.findNcxItem(manifest);
    if (!ncxItem?.$?.href) return;

    const ncxPath = this.resolveZipPath(opfDir, ncxItem.$.href.split('#')[0]);
    const ncxContent = await this.readZipText(zip, ncxPath);
    if (!ncxContent) return;

    try {
      const parser = new xml2js.Parser();
      const ncxData = await parser.parseStringPromise(ncxContent);
      this.extractTocFromNcx(ncxData, opfDir, tocMap);
    } catch (error) {
      console.warn("Failed to parse EPUB NCX:", error);
    }
  }

  private getSpineItemHref(manifestMap: Map<string, XmlElement>, idref: string): string | null {
    const manifestItem = manifestMap.get(idref);
    if (!manifestItem) return null;

    const href = manifestItem.$?.href;
    if (!href) return null;

    const properties = String(manifestItem.$?.properties || '').toLowerCase();
    if (this.shouldSkipManifestProperties(properties)) return null;

    const mediaType = String(manifestItem.$?.['media-type'] || '').toLowerCase();
    if (mediaType && !mediaType.includes('html') && !mediaType.includes('xhtml')) {
      return null;
    }

    return href;
  }

  private shouldSkipManifestProperties(properties: string): boolean {
    if (!properties) return false;
    return (
      properties.includes('nav') ||
      properties.includes('toc') ||
      properties.includes('cover') ||
      properties.includes('titlepage') ||
      properties.includes('frontmatter')
    );
  }

  private findTocNavElement(doc: Document): Element | null {
    return (
      doc.querySelector(String.raw`nav[epub\:type='toc']`) ||
      doc.querySelector("nav[role='doc-toc']") ||
      doc.querySelector("nav#toc") ||
      doc.querySelector("nav")
    );
  }
}
