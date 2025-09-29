import type { Story, Chapter } from '../types';

// Custom Error for manual import flow
export class ManualImportRequiredError extends Error {
    public url: string;
    constructor(message: string, url: string) {
        super(message);
        this.name = 'ManualImportRequiredError';
        this.url = url;
    }
}

// Utility to parse HTML string into a Document object
export const parseHtml = (htmlText: string): Document => {
  const parser = new DOMParser();
  return parser.parseFromString(htmlText, 'text/html');
};

// --- Source Configuration ---

interface SourceInfo {
  source: string;
  direct: boolean; // Can be fetched via proxy
  selectors: {
    title: string;
    author: string;
    description: string;
    imageUrl: string;
    chapters: string;
    chapterContent: string;
  };
}

// Configuration for each supported website
const sources: { [key: string]: SourceInfo } = {
    'truyenfull.vn': {
        source: 'TruyenFull.vn',
        direct: true,
        selectors: {
            title: 'h3.title',
            author: '.info a[itemprop="author"]',
            description: '.desc-text',
            imageUrl: '.book img',
            chapters: '.list-chapter a',
            chapterContent: '#chapter-c',
        },
    },
    'truyenfull.vision': {
        source: 'TruyenFull.vision',
        direct: true,
        selectors: {
            title: '.book-info .book-title',
            author: '.book-info .author',
            description: '#book-description-full',
            imageUrl: 'div.book-img > img',
            chapters: '#list-chapter a',
            chapterContent: '#chapter-content',
        },
    },
    'tangthuvien.net': {
        source: 'TangThuVien.net',
        direct: false, // Requires manual import for story page and chapter list
        selectors: {
            title: '.book-info h1',
            author: '.book-info .tag a.blue',
            description: '.book-intro',
            imageUrl: 'div.book-img > img',
            chapters: '#volumes ul > li > a', // Selector for the chapter list page
            chapterContent: '.box-chap',
        },
    },
    'truyenyy.pro': {
        source: 'TruyenYY.pro',
        direct: true,
        selectors: {
            title: 'h1.name',
            author: 'p.author',
            description: '#divdescription',
            imageUrl: '.book_avatar img',
            chapters: 'ul.list-chap > li > a',
            chapterContent: '#content',
        }
    },
    // Add other sources as needed. These are placeholders.
    'truyenkk.com': {
        source: 'TruyenKK.com',
        direct: false,
        selectors: { title: '', author: '', description: '', imageUrl: '', chapters: '', chapterContent: ''}
    },
    'truyenchuhay.vn': {
        source: 'TruyenChuHay.vn',
        direct: false,
        selectors: { title: '', author: '', description: '', imageUrl: '', chapters: '', chapterContent: ''}
    },
    'truyenchu.com.vn': {
        source: 'TruyenChu.com.vn',
        direct: false,
        selectors: { title: '', author: '', description: '', imageUrl: '', chapters: '', chapterContent: ''}
    }
};

/**
 * Gets information about a source based on a URL.
 * @param url The URL of the story or chapter.
 * @returns SourceInfo object or null if not supported.
 */
export const getSourceInfo = (url: string): SourceInfo | null => {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return sources[hostname] || null;
  } catch {
    return null;
  }
};

/**
 * Searches for stories based on a query string.
 * Scrapes TruyenFull.vn for results.
 * @param query The search query.
 * @returns A promise that resolves to an array of Story objects.
 */
export const searchStory = async (query: string): Promise<Story[]> => {
    const searchUrl = `https://truyenfull.vn/tim-kiem/?tukhoa=${encodeURIComponent(query)}`;
    // Using a proxy to bypass CORS issues
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error('Không thể thực hiện tìm kiếm. Vui lòng thử lại.');
    }
    const htmlText = await response.text();
    const doc = parseHtml(htmlText);

    const results: Story[] = [];
    const resultElements = doc.querySelectorAll('.list-truyen .row');

    resultElements.forEach(row => {
        const titleEl = row.querySelector('h3.truyen-title a');
        const authorEl = row.querySelector('.author');
        const imgEl = row.querySelector('[data-image]');

        if (titleEl && authorEl && imgEl) {
            const url = titleEl.getAttribute('href') || '';
            const title = titleEl.textContent?.trim() || 'Không có tiêu đề';
            const author = authorEl.textContent?.trim() || 'Không rõ tác giả';
            const imageUrl = imgEl.getAttribute('data-image') || '';

            results.push({
                title,
                author,
                imageUrl,
                url,
                source: 'TruyenFull.vn',
            });
        }
    });

    // If no direct results, provide links to search on other websites
    if (results.length === 0) {
      const searchLinkSources = [
        { name: 'TangThuVien.net', url: `https://tangthuvien.net/forum/showthread.php?t=162021&highlight=${encodeURIComponent(query)}` },
        { name: 'TruyenYY.pro', url: `https://truyenyy.pro/tim-kiem/?k=${encodeURIComponent(query)}` },
      ];

      searchLinkSources.forEach(source => {
        results.push({
          title: `Tìm "${query}"`,
          author: `trên ${source.name}`,
          url: source.url,
          source: source.name,
          imageUrl: '',
          isSearchLink: true
        });
      });
    }

    return results;
};

/**
 * Extracts story details (title, author, chapters, etc.) from a story's main page.
 * @param doc The parsed HTML document of the story page.
 * @param url The URL of the story page.
 * @param sourceName The name of the source website.
 * @returns A promise resolving to a partial Story object with details.
 */
export const getStoryDetails = async (doc: Document, url: string, sourceName: string): Promise<Partial<Story>> => {
    const sourceInfo = Object.values(sources).find(s => s.source === sourceName);
    if (!sourceInfo) {
        throw new Error(`Unsupported source for story details: ${sourceName}`);
    }
    const selectors = sourceInfo.selectors;

    const title = doc.querySelector(selectors.title)?.textContent?.trim() || 'Không có tiêu đề';
    const author = doc.querySelector(selectors.author)?.textContent?.trim() || 'Không rõ tác giả';
    const description = doc.querySelector(selectors.description)?.textContent?.trim() || 'Không có mô tả.';
    let imageUrl = doc.querySelector(selectors.imageUrl)?.getAttribute('src') || '';
    // Resolve relative image URLs
    if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = new URL(imageUrl, url).href;
    }

    let chapters: Chapter[] = [];
    if (sourceName === 'TangThuVien.net') {
        const chapterListLink = doc.querySelector('.book-info a[href*="doctruyen"]');
        if (chapterListLink) {
            const chapterListUrl = new URL(chapterListLink.getAttribute('href') || '', url).href;
            throw new ManualImportRequiredError(
                "Tàng Thư Viện yêu cầu nhập thủ công danh sách chương. Vui lòng truy cập trang danh sách chương, lưu lại (Ctrl+S), và nhập file HTML.",
                chapterListUrl
            );
        } else {
             // Fallback if the direct link is not found
             chapters = getChaptersForTangThuVien(doc, url);
        }
    } else {
        const chapterElements = Array.from(doc.querySelectorAll(selectors.chapters));
        chapters = chapterElements.map(el => {
            const link = el as HTMLAnchorElement;
            const chapterUrl = new URL(link.getAttribute('href') || '', url).href;
            return {
                title: link.textContent?.trim() || 'Chương không tên',
                url: chapterUrl,
            };
        });
        // Reverse if site lists newest first (most common)
        if (sourceName !== 'TruyenYY.pro') {
            chapters.reverse();
        }
    }

    return { title, author, description, imageUrl, chapters };
};

/**
 * Specifically parses the chapter list from a TangThuVien chapter list page.
 * @param doc The parsed HTML document of the chapter list page.
 * @param storyUrl The base URL of the story to resolve chapter links.
 * @returns An array of Chapter objects.
 */
export const getChaptersForTangThuVien = (doc: Document, storyUrl: string): Chapter[] => {
    const chapterElements = Array.from(doc.querySelectorAll('#volumes ul > li > a'));
    return chapterElements.map(el => {
        const link = el as HTMLAnchorElement;
        const chapterUrl = new URL(link.getAttribute('href') || '', storyUrl).href;
        return {
            title: link.textContent?.trim() || 'Chương không tên',
            url: chapterUrl,
        };
    });
};

/**
 * Extracts the main text content of a chapter from a parsed document.
 * @param doc The parsed HTML document of the chapter page.
 * @param sourceName The name of the source website.
 * @returns The cleaned chapter content as a string.
 */
export const getChapterContent = (doc: Document, sourceName: string): string => {
  const source = Object.values(sources).find(s => s.source === sourceName);
  const contentSelector = source?.selectors.chapterContent;
  
  if (!contentSelector) {
    throw new Error(`Unsupported source for chapter content: ${sourceName}`);
  }
  
  const contentEl = doc.querySelector(contentSelector);
  if (!contentEl) {
    // Try a more generic selector as a fallback
    const genericContent = doc.querySelector('.chapter-c, #content, .reading-content');
    if (genericContent) {
        console.warn(`Could not find selector "${contentSelector}", using fallback.`);
        return cleanContent(genericContent);
    }
    throw new Error('Could not find chapter content element.');
  }

  return cleanContent(contentEl);
};

/**
 * Helper function to clean common junk from chapter content elements.
 * @param element The HTML element containing the chapter content.
 * @returns The cleaned text content.
 */
function cleanContent(element: Element): string {
    // Remove ads, links, and other unwanted elements
    element.querySelectorAll('a, sup, sub, script, style, img, svg, [class*="ads"], [id*="ads"], .hidden, .text-center, .text-right, button').forEach(el => el.remove());
    
    // Replace <br> tags with newlines for better text flow
    element.innerHTML = element.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    
    let text = (element.textContent ?? '').trim();

    // Remove common junk lines
    const junkPatterns = [
        /truyenfull/i, /đọc truyện online/i, /tang thu vien/i, /truyenyy/i,
        /nguồn:/i, /dịch:/i, /biên:/i, /--/i, /sưu tầm/i,
        /mời bạn đọc(.*?)tại/i, /chương mới nhất tại/i
    ];
    
    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.length < 15 && junkPatterns.some(pattern => pattern.test(trimmedLine))) {
            return false;
        }
        return true;
    });

    text = filteredLines.join('\n').replace(/\n\s*\n/g, '\n\n').trim();
    
    return text || "Nội dung chương trống.";
}
