import { JSDOM } from 'jsdom';
import { logger } from '../lib/logger.js';
import { type BookChapter, MAX_BOOK_CHAPTERS } from './shared.js';

type Fb2DomExtractorDeps = {
  countWords: (text: string) => number;
  escapeHtml: (text: string) => string;
  buildFallbackSectionTitle: (ancestorTitles: string[], chapterNumber: number, preferIntroLabel?: boolean) => string;
  isStructuralSubsectionTitle: (title: string) => boolean;
};

export class Fb2DomExtractor {
  constructor(private readonly deps: Fb2DomExtractorDeps) {}

  extractChapters(xmlContent: string): BookChapter[] {
    let dom: InstanceType<typeof JSDOM>;
    try {
      dom = new JSDOM(xmlContent, { contentType: 'text/xml' });
    } catch (error) {
      logger.warn({ error }, '[FB2Parser] JSDOM parse failed for body extraction');
      return [];
    }

    const doc = dom.window.document;
    const binaryMap = this.buildFb2BinaryMapFromDom(doc);
    const chapters: BookChapter[] = [];
    let chapterNumber = 1;

    const bodyEls = Array.from(doc.getElementsByTagName('body'));
    for (const body of bodyEls) {
      const bodyName = body.getAttribute('name')?.toLowerCase();
      if (bodyName === 'notes' || bodyName === 'comments') continue;

      const sectionEls = Array.from(body.children).filter(el => el.localName === 'section');
      for (const section of sectionEls) {
        if (chapters.length >= MAX_BOOK_CHAPTERS) break;
        chapterNumber = this.appendDomSectionChapters(section, chapters, chapterNumber, [], binaryMap);
      }
    }

    return chapters;
  }

  private appendDomSectionChapters(
    sectionEl: Element,
    chapters: BookChapter[],
    chapterNumber: number,
    ancestorTitles: string[],
    binaryMap: Map<string, string>,
  ): number {
    if (chapters.length >= MAX_BOOK_CHAPTERS) return chapterNumber;

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    const childSectionEls = Array.from(sectionEl.children).filter(el => el.localName === 'section');
    const directContent = this.getDomSectionOwnContent(sectionEl, binaryMap);
    const directWordCount = this.deps.countWords(directContent);

    const nextAncestorTitles = sectionTitle?.trim()
      ? [...ancestorTitles, sectionTitle.trim()]
      : ancestorTitles;

    if (this.shouldSplitDomSection(sectionEl, childSectionEls, directWordCount)) {
      if (directWordCount >= 80) {
        const title = sectionTitle || this.deps.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);
        chapters.push({ chapterNumber, title, content: directContent, wordCount: directWordCount });
        chapterNumber += 1;
      }

      for (const childSection of childSectionEls) {
        if (chapters.length >= MAX_BOOK_CHAPTERS) break;
        chapterNumber = this.appendDomSectionChapters(childSection, chapters, chapterNumber, nextAncestorTitles, binaryMap);
      }

      return chapterNumber;
    }

    const content = this.getDomSectionContent(sectionEl, binaryMap);
    if (content.trim()) {
      const title = sectionTitle || this.deps.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);
      chapters.push({ chapterNumber, title, content, wordCount: this.deps.countWords(content) });
      return chapterNumber + 1;
    }

    return chapterNumber;
  }

  private shouldSplitDomSection(
    sectionEl: Element,
    childSectionEls: Element[],
    directWordCount: number,
  ): boolean {
    if (childSectionEls.length === 0) return false;

    const titledChildren = childSectionEls.filter(el => Boolean(this.getDomSectionTitle(el)?.trim()));
    if (titledChildren.length === 0) return false;

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    const isContainerLike = directWordCount < 80;

    const nonStructural = titledChildren.filter(el => {
      const t = this.getDomSectionTitle(el);
      return t ? !this.deps.isStructuralSubsectionTitle(t) : false;
    });
    const structural = titledChildren.filter(el => {
      const t = this.getDomSectionTitle(el);
      return t ? this.deps.isStructuralSubsectionTitle(t) : false;
    });

    if (childSectionEls.length >= 2 && isContainerLike && nonStructural.length >= 2) return true;
    if (childSectionEls.length >= 2 && isContainerLike && structural.length >= 1) return true;
    if (childSectionEls.length === 1 && !sectionTitle && directWordCount < 30 && nonStructural.length === 1) return true;

    return false;
  }

  private getDomSectionTitle(sectionEl: Element): string | undefined {
    const titleEl = Array.from(sectionEl.children).find(el => el.localName === 'title');
    if (!titleEl) return undefined;

    const paragraphs = Array.from(titleEl.children).filter(el => el.localName === 'p');
    if (paragraphs.length > 1) {
      const parts = paragraphs.map(p => p.textContent?.trim() || '').filter(Boolean);
      return parts.length > 0 ? parts.join('. ') : undefined;
    }

    return titleEl.textContent?.trim() || undefined;
  }

  private getDomSectionOwnContent(sectionEl: Element, binaryMap: Map<string, string>): string {
    let content = '';

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.deps.escapeHtml(sectionTitle)}</h3>\n`;
    }

    for (const child of Array.from(sectionEl.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === 'title' || el.localName === 'section') continue;
      content += this.renderFB2DomElement(el, binaryMap);
    }

    return content;
  }

  private getDomSectionContent(sectionEl: Element, binaryMap: Map<string, string>): string {
    let content = '';

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.deps.escapeHtml(sectionTitle)}</h3>\n`;
    }

    for (const child of Array.from(sectionEl.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === 'title') continue;
      if (el.localName === 'section') {
        content += this.getDomSectionContent(el, binaryMap);
        continue;
      }
      content += this.renderFB2DomElement(el, binaryMap);
    }

    return content;
  }

  private renderFB2DomElement(el: Element, binaryMap: Map<string, string>): string {
    switch (el.localName) {
      case 'p':
        return `<p>${this.renderFB2DomInline(el, binaryMap)}</p>\n`;
      case 'subtitle':
        return `<h4>${this.renderFB2DomInline(el, binaryMap)}</h4>\n`;
      case 'empty-line':
        return '<br>\n';
      case 'epigraph':
        return this.renderFB2DomEpigraph(el, binaryMap);
      case 'cite':
        return this.renderFB2DomCite(el, binaryMap);
      case 'poem':
        return this.renderFB2DomPoem(el, binaryMap);
      case 'table':
        return this.renderFB2DomTable(el, binaryMap);
      case 'image':
        return this.renderFB2DomImage(el, binaryMap);
      case 'text-author':
        return `<p class="text-author"><em>${this.renderFB2DomInline(el, binaryMap)}</em></p>\n`;
      case 'annotation':
        return this.renderFB2DomAnnotation(el, binaryMap);
      default: {
        const text = el.textContent?.trim() || '';
        return text ? `<p>${this.deps.escapeHtml(text)}</p>\n` : '';
      }
    }
  }

  private renderFB2DomInline(el: Element, binaryMap: Map<string, string>): string {
    let result = '';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        result += this.deps.escapeHtml(child.textContent || '');
      } else if (child.nodeType === 1) {
        const c = child as Element;
        switch (c.localName) {
          case 'strong':       result += `<strong>${this.renderFB2DomInline(c, binaryMap)}</strong>`; break;
          case 'emphasis':     result += `<em>${this.renderFB2DomInline(c, binaryMap)}</em>`; break;
          case 'strikethrough': result += `<del>${this.renderFB2DomInline(c, binaryMap)}</del>`; break;
          case 'sub':          result += `<sub>${this.renderFB2DomInline(c, binaryMap)}</sub>`; break;
          case 'sup':          result += `<sup>${this.renderFB2DomInline(c, binaryMap)}</sup>`; break;
          case 'code':         result += `<code>${this.renderFB2DomInline(c, binaryMap)}</code>`; break;
          case 'a':            result += this.renderFB2DomLink(c, binaryMap); break;
          case 'image':        result += this.renderFB2DomImage(c, binaryMap); break;
          default:             result += this.renderFB2DomInline(c, binaryMap);
        }
      }
    }
    return result;
  }

  private renderFB2DomLink(el: Element, binaryMap: Map<string, string>): string {
    const href = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      || el.getAttribute('href')
      || '#';
    const isExternal = href.startsWith('http://') || href.startsWith('https://');
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${this.deps.escapeHtml(href)}"${target}>${this.renderFB2DomInline(el, binaryMap)}</a>`;
  }

  private renderFB2DomImage(el: Element, binaryMap: Map<string, string>): string {
    const href = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      || el.getAttribute('href')
      || '';
    if (!href) return '';
    const alt = el.getAttribute('alt') || 'Image';
    const resolvedSrc = binaryMap.get(href.replace(/^#/, '')) || href;
    return `<img src="${this.deps.escapeHtml(resolvedSrc)}" alt="${this.deps.escapeHtml(alt)}" class="fb2-image">`;
  }

  private buildFb2BinaryMapFromDom(doc: Document): Map<string, string> {
    const binaryMap = new Map<string, string>();

    for (const binaryEl of Array.from(doc.getElementsByTagName('binary'))) {
      const id = binaryEl.getAttribute('id')?.trim();
      const contentType = binaryEl.getAttribute('content-type')?.trim() || 'image/jpeg';
      const data = binaryEl.textContent?.replace(/\s+/g, '') || '';

      if (!id || !data || !contentType.startsWith('image/')) {
        continue;
      }

      binaryMap.set(id, `data:${contentType};base64,${data}`);
    }

    return binaryMap;
  }

  private renderFB2DomEpigraph(el: Element, binaryMap: Map<string, string>): string {
    let content = '<blockquote class="epigraph">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      if (c.localName === 'p') {
        content += `<p>${this.renderFB2DomInline(c, binaryMap)}</p>\n`;
      } else if (c.localName === 'text-author') {
        content += `<p class="text-author"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`;
      } else if (c.localName === 'poem') {
        content += this.renderFB2DomPoem(c, binaryMap);
      }
    }
    content += '</blockquote>\n';
    return content;
  }

  private renderFB2DomCite(el: Element, binaryMap: Map<string, string>): string {
    let content = '<blockquote class="cite">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      switch (c.localName) {
        case 'p':          content += `<p>${this.renderFB2DomInline(c, binaryMap)}</p>\n`; break;
        case 'subtitle':   content += `<h5>${this.renderFB2DomInline(c, binaryMap)}</h5>\n`; break;
        case 'text-author': content += `<p class="text-author"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`; break;
        case 'poem':       content += this.renderFB2DomPoem(c, binaryMap); break;
      }
    }
    content += '</blockquote>\n';
    return content;
  }

  private renderFB2DomPoem(el: Element, binaryMap: Map<string, string>): string {
    let content = '<div class="poem">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      switch (c.localName) {
        case 'title': {
          const t = c.textContent?.trim() || '';
          if (t) content += `<h5 class="poem-title">${this.deps.escapeHtml(t)}</h5>\n`;
          break;
        }
        case 'stanza':      content += this.renderFB2DomStanza(c, binaryMap); break;
        case 'text-author': content += `<p class="text-author"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`; break;
      }
    }
    content += '</div>\n';
    return content;
  }

  private renderFB2DomStanza(el: Element, binaryMap: Map<string, string>): string {
    let content = '<div class="stanza">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      switch (c.localName) {
        case 'title': {
          const t = c.textContent?.trim() || '';
          if (t) content += `<h6 class="stanza-title">${this.deps.escapeHtml(t)}</h6>\n`;
          break;
        }
        case 'subtitle': content += `<p class="stanza-subtitle"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`; break;
        case 'v': {
          const v = this.renderFB2DomInline(c, binaryMap);
          if (v.trim()) content += `<p class="verse">${v}</p>\n`;
          break;
        }
      }
    }
    content += '</div>\n';
    return content;
  }

  private renderFB2DomTable(el: Element, binaryMap: Map<string, string>): string {
    let content = '<table class="fb2-table">\n';
    for (const row of Array.from(el.children).filter(c => c.localName === 'tr')) {
      content += '<tr>\n';
      for (const cell of Array.from(row.children)) {
        const tag = cell.localName === 'th' ? 'th' : 'td';
        let attrs = '';
        for (const a of ['colspan', 'rowspan', 'align', 'valign']) {
          const v = cell.getAttribute(a);
          if (v) attrs += ` ${a}="${this.deps.escapeHtml(v)}"`;
        }
        content += `<${tag}${attrs}>${this.renderFB2DomInline(cell, binaryMap)}</${tag}>\n`;
      }
      content += '</tr>\n';
    }
    content += '</table>\n';
    return content;
  }

  private renderFB2DomAnnotation(el: Element, binaryMap: Map<string, string>): string {
    let content = '<div class="annotation">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      content += this.renderFB2DomElement(child as Element, binaryMap);
    }
    content += '</div>\n';
    return content;
  }
}
