
import type { Story, Chapter } from '../types';
import { parseHtml } from './truyenfullService';

declare var JSZip: any;

export const parseEbookFile = async (file: File): Promise<Story> => {
    const zip = await JSZip.loadAsync(file);
    const parser = new DOMParser();
    const containerXmlText = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXmlText) throw new Error('File container.xml không hợp lệ hoặc không tồn tại.');
    const containerDoc = parser.parseFromString(containerXmlText, 'application/xml');
    const opfPath = containerDoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw new Error('Không tìm thấy file .opf trong container.xml');
    const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
    const opfXmlText = await zip.file(opfPath)?.async('string');
    if (!opfXmlText) throw new Error(`Không thể đọc file .opf tại đường dẫn: ${opfPath}`);
    const opfDoc = parser.parseFromString(opfXmlText, 'application/xml');
    
    const metadataEl = opfDoc.getElementsByTagName('metadata')[0];
    const title = metadataEl.getElementsByTagName('dc:title')[0]?.textContent || 'Không có tiêu đề';
    const author = metadataEl.getElementsByTagName('dc:creator')[0]?.textContent || 'Không rõ tác giả';
    const description = metadataEl.getElementsByTagName('dc:description')[0]?.textContent || 'Không có mô tả.';

    const tags: string[] = [];
    Array.from(metadataEl.getElementsByTagName('dc:subject')).forEach(el => {
        if (el.textContent) tags.push(el.textContent.trim());
    });

    const manifestItems = opfDoc.getElementsByTagName('item');
    const manifestMap = new Map<string, { href: string; mediaType: string }>();
    let ncxId: string | null = null, navHref: string | null = null, coverImageHref: string | null = null;
    for (const item of Array.from(manifestItems)) {
      const id = item.getAttribute('id'), href = item.getAttribute('href'), mediaType = item.getAttribute('media-type');
      if (id && href) manifestMap.set(id, { href: basePath + href, mediaType: mediaType || '' });
      if (item.getAttribute('properties')?.includes('cover-image')) coverImageHref = basePath + href;
      if (item.getAttribute('properties')?.includes('nav')) navHref = basePath + href;
      if (mediaType === 'application/x-dtbncx+xml') ncxId = id;
    }

    let imageUrl = 'https://picsum.photos/400/600';
    if (coverImageHref) {
      const coverFile = zip.file(decodeURIComponent(coverImageHref));
      if (coverFile) {
        const blob = await coverFile.async('blob');
        imageUrl = URL.createObjectURL(blob);
      }
    }
    
    const spineEl = opfDoc.getElementsByTagName('spine')[0];
    if (!spineEl) throw new Error('Cấu trúc Ebook không hợp lệ: Thiếu thẻ <spine> trong file .opf.');
    
    const spineChapters: Chapter[] = [];
    const itemRefs = spineEl.getElementsByTagName('itemref');
    for (const itemRef of Array.from(itemRefs)) {
      const idref = itemRef.getAttribute('idref');
      if (idref && itemRef.getAttribute('linear') !== 'no') {
        const manifestItem = manifestMap.get(idref);
        if (manifestItem && manifestItem.mediaType?.includes('xhtml')) {
          spineChapters.push({ title: `Mục ${spineChapters.length + 1}`, url: manifestItem.href });
        }
      }
    }
    
    const resolvePath = (base: string, relative: string) => {
        try {
            const dummyBase = "http://dummy.com/";
            const absUrl = new URL(relative, dummyBase + base).href;
            const result = absUrl.replace(dummyBase, "");
            return result;
        } catch(e) { return relative; }
    };

    const tocChapters: Chapter[] = [];

    if (navHref) { 
        const navXmlText = await zip.file(navHref).async('string');
        const navDoc = parser.parseFromString(navXmlText, 'text/html');
        const tocNav = navDoc.querySelector('nav[epub\\:type="toc"]') || navDoc.querySelector('nav');
        const navPathDir = navHref.substring(0, navHref.lastIndexOf('/') + 1);

        if (tocNav) {
          const links = tocNav.querySelectorAll('a');
          for (const link of Array.from(links)) {
            const href = link.getAttribute('href');
            const chapterTitle = link.textContent?.trim();
            if (href && chapterTitle) {
              const chapterUrl = resolvePath(navPathDir, href);
              tocChapters.push({ title: chapterTitle, url: chapterUrl });
            }
          }
        }
    } else { 
        const ncxFileIdFromSpine = spineEl.getAttribute('toc');
        const ncxManifestItem = manifestMap.get(ncxFileIdFromSpine || ncxId || '');
        if (ncxManifestItem) {
          const ncxXmlText = await zip.file(ncxManifestItem.href).async('string');
          const ncxDoc = parser.parseFromString(ncxXmlText, 'application/xml');
          const ncxPathDir = ncxManifestItem.href.substring(0, ncxManifestItem.href.lastIndexOf('/') + 1);
          
          const navPoints = ncxDoc.querySelectorAll('navPoint');
          for (const point of Array.from(navPoints)) {
              const label = point.querySelector('navLabel > text')?.textContent?.trim();
              const contentSrc = point.querySelector('content')?.getAttribute('src');
              if (label && contentSrc) {
                  const chapterUrl = resolvePath(ncxPathDir, contentSrc);
                  tocChapters.push({ title: label, url: chapterUrl });
              }
          }
        }
    }
    
    let chapters = tocChapters.length > 0 ? tocChapters : spineChapters;
    
    chapters = chapters.filter(c => !['bìa', 'cover', 'mục lục', 'bản quyền', 'copyright', 'table of contents'].some(kw => c.title.toLowerCase().includes(kw)));
    
    if (chapters.length === 0) chapters = spineChapters;
    if (chapters.length === 0) throw new Error("Không tìm thấy chương có nội dung trong file Ebook này.");

    const ebookStory: Story = { 
        title, author, imageUrl, source: 'Ebook', 
        url: `ebook:${file.name}`, description, chapters,
        createdAt: Date.now(),
        tags: tags
    };
    return ebookStory;
};
