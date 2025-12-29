
import type { Story, Chapter, PartialStory } from '../types';

// =================================================================
// SHARED UTILITIES
// =================================================================

// Xác định các proxy với các trình tạo URL cụ thể
const CORS_PROXIES = [
    {
        name: 'CORS.EU.ORG',
        buildUrl: (url: string) => `https://cors.eu.org/${url}`
    },
    {
        name: 'CORSProxy.io',
        buildUrl: (url: string) => `https://corsproxy.io/?${url}`
    },
    {
        name: 'AllOrigins',
        buildUrl: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    },
    {
        name: 'ThingProxy',
        buildUrl: (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
    }
];

const FETCH_TIMEOUT = 15000; // 15 giây

async function fetchAndParse(url: string): Promise<Document> {
  let lastError: Error | null = null;

  for (const proxy of CORS_PROXIES) {
    const proxyUrl = proxy.buildUrl(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      
      const docTextContent = doc.body.textContent?.toLowerCase() || "";
      const docTitle = doc.title.toLowerCase();
      const errorKeywords = ['cors', 'failed to fetch', 'cannot get', 'error', 'captcha', 'are you a robot', 'human verification', 'rate-limit', 'access denied'];

      if (errorKeywords.some(keyword => docTitle.includes(keyword) || (docTextContent.length < 500 && docTextContent.includes(keyword)))) {
          throw new Error(`Dịch vụ proxy (${proxy.name}) trả về trang lỗi hoặc captcha.`);
      }

      return doc;
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`Thất bại khi fetch từ proxy: ${proxy.name}. Đang thử proxy tiếp theo. Lỗi:`, (error as Error).message);
      lastError = error as Error;
    }
  }
  throw new Error(`CONNECTION_FAILED: Không thể tải dữ liệu từ ${url}. Vui lòng thử lại hoặc sử dụng tính năng nhập thủ công.`);
}

export function parseHtml(htmlString: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(htmlString, 'text/html');
}

function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}


// =================================================================
// PARSING LOGIC (Separated from Fetching)
// =================================================================

function extractChapterContent(doc: Document, source: string): string {
    let contentEl: Element | null = null;
    let removeSelectors: string[] = [];

    switch (source) {
        case 'TruyenFull.vn':
        case 'TruyenFull.vision':
            contentEl = doc.querySelector('#chapter-c');
            removeSelectors = ['.ads-chapter', '.ads', 'script', '.meta-chap', '#chapter-nav', 'div[class*="ads"]', 'a[href*="truyenfull"]'];
            break;
        case 'TangThuVien.net':
            // Cập nhật selector đa dạng hơn cho TTV: .box-chap-content, .chapter-c, .content-body
            contentEl = doc.querySelector('.box-chap-content, .chapter-c, .chapter-content, .content-body');
            removeSelectors = [
                'div[class*="google-auto-placed"]', 
                'script', 
                'a', 
                'div[class*="ads"]', 
                'iframe', 
                '.ads-content',
                '.box-config', // Menu cấu hình
                '.truyen-control', // Thanh điều khiển
                '.chapter-nav', // Nút điều hướng
                '#chapter-nav-top',
                '#chapter-nav-bot',
                '.btn-chapter-nav',
            ];
            break;
        case 'TruyenHDT.com':
            contentEl = doc.querySelector('#chapter-content');
            removeSelectors = ['.ads-in-content', 'script', 'style', 'a'];
            break;
        case 'KhoDocSach.com':
            contentEl = doc.querySelector('#chapter-content');
            removeSelectors = ['script', 'style', '.text-center', 'a'];
            break;
        case 'TruyenYY.mobi':
            contentEl = doc.querySelector('#chapter-content');
            removeSelectors = ['script', 'style', '.ads-holder', 'a'];
            break;
        default:
             // Thử các selector phổ biến nếu source không khớp chính xác
             contentEl = doc.querySelector('#chapter-c, .box-chap-content, #chapter-content, .chapter-c, .content-body');
             removeSelectors = ['script', 'style', 'iframe', '.ads', 'div[class*="ads"]'];
    }

    if (!contentEl) throw new Error(`Không tìm thấy nội dung chương cho nguồn ${source}.`);

    // Clean up
    removeSelectors.forEach(selector => {
        contentEl?.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Remove all attributes to clean styling
    contentEl.querySelectorAll('*').forEach(el => {
        el.removeAttribute('style');
        el.removeAttribute('class');
    });

    contentEl.innerHTML = contentEl.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    let text = (contentEl.textContent ?? '').trim();
    
    // Post-processing cleaning for specific sources
    if (source === 'TangThuVien.net') {
         const garbageLines = [
            'Tuỳ chỉnh', 'Theme', 'Font chữ', 'Palatino', 'Times', 'Arial', 'Georgia', 
            'Cỡ chữ', 'A-', 'A+', 'Màn hình', '-', '+', 'Nền', 'Màu chữ',
            'Trang chủ', 'Danh sách', 'Truyện mới', 'Phản hồi'
         ];
         text = text.split('\n').filter(line => {
             const t = line.trim();
             if (garbageLines.includes(t)) return false;
             // Filter specific numbers often found in settings (font size, screen width)
             if (/^\d+$/.test(t) && (parseInt(t) === 26 || parseInt(t) === 900)) return false; 
             return true;
         }).join('\n');
    }

    text = text.replace(/\n\s*\n/g, '\n\n');
    
    return text || "Nội dung chương trống.";
}

function extractStoryDetails(doc: Document, source: string, url: string): PartialStory & { chapters: Chapter[] } {
    let title = '', author = '', imageUrl = '', description = '';
    const chapters: Chapter[] = [];

    // Helper: Clean Text
    const txt = (sel: string) => doc.querySelector(sel)?.textContent?.trim() ?? '';
    const attr = (sel: string, attrName: string) => doc.querySelector(sel)?.getAttribute(attrName) ?? '';

    switch (source) {
        case 'TruyenFull.vn':
        case 'TruyenFull.vision':
            title = txt('h3.title');
            author = txt('div.info a[itemprop="author"]');
            imageUrl = attr('.book img', 'src');
            description = txt('.desc-text') || 'Không có mô tả.';
            doc.querySelectorAll('#list-chapter .list-chapter li a').forEach(el => {
                if(el.textContent && el.getAttribute('href')) chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
            });
            break;
        case 'TangThuVien.net':
            title = txt('.book-info h1');
            author = txt('.book-info .tag a.blue');
            imageUrl = attr('div.book-img > img', 'src');
            description = Array.from(doc.querySelectorAll('.book-intro p')).map(p => p.textContent?.trim()).join('\n\n') || 'Không có mô tả.';
            // TangThuVien needs special handling for chapters usually, but for manual import we parse what's on screen if possible,
            // OR we expect the user to provide the dedicated Table of Contents page.
            doc.querySelectorAll('#j-bookCatalogPage ul li a').forEach(el => {
                if(el.textContent && el.getAttribute('href')) chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
            });
            break;
         case 'TruyenHDT.com':
            title = txt('.info .title');
            author = txt('.info .author a');
            imageUrl = attr('.books img', 'src');
            description = txt('#story-info-detail .description');
            doc.querySelectorAll('#list-chapter ul.list-group li a').forEach(el => {
                if(el.textContent && el.getAttribute('href')) chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
            });
            break;
        case 'KhoDocSach.com':
            title = txt('h2.series-title');
            author = txt('.series-information .info-item:nth-child(1) a');
            imageUrl = attr('.series-cover .img-in-ratio', 'data-bg');
            description = txt('.summary-content .text');
             doc.querySelectorAll('#chapters .chapter-list a').forEach(el => {
                 if(el.textContent && el.getAttribute('href')) chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
            });
            break;
        case 'TruyenYY.mobi':
            title = txt('.book-info .book-name');
            author = txt('.book-info .author a');
            imageUrl = attr('.book-info .book-img img', 'src');
            description = txt('#book-info #book-intro');
            doc.querySelectorAll('#chapters-area .chapter-item a').forEach(el => {
                 if(el.textContent && el.getAttribute('href')) chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
            });
            break;
    }

    return { title, author, imageUrl, description, chapters, source, url };
}


// =================================================================
// PUBLIC API FOR MANUAL PARSING
// =================================================================

export function parseChapterContentFromDoc(doc: Document, source: string): string {
    return extractChapterContent(doc, source);
}

export function parseStoryDetailsFromDoc(doc: Document, source: string, url: string): PartialStory & { chapters: Chapter[] } {
    return extractStoryDetails(doc, source, url);
}


// =================================================================
// SCRAPER IMPLEMENTATIONS (FETCHING)
// =================================================================

const TRUYENFULL_SOURCE = 'TruyenFull.vn';
const TRUYENFULLVISION_SOURCE = 'TruyenFull.vision';
const TANGTHUVIEN_SOURCE = 'TangThuVien.net';
const TRUYENHDT_SOURCE = 'TruyenHDT.com';
const KHODOCSACH_SOURCE = 'KhoDocSach.com';
const TRUYENYY_SOURCE = 'TruyenYY.mobi';

// Generic Search function
async function genericSearch(query: string, searchUrlBuilder: (q: string) => string, listSelector: string, itemSelectors: { title: string, author: string, img: string, link: string }, source: string): Promise<Story[]> {
    const searchUrl = searchUrlBuilder(query);
    const doc = await fetchAndParse(searchUrl);
    const stories: Story[] = [];
    doc.querySelectorAll(listSelector).forEach(rowEl => {
        const titleAnchor = rowEl.querySelector<HTMLAnchorElement>(itemSelectors.title);
        const authorSpan = rowEl.querySelector<HTMLElement>(itemSelectors.author);
        const imageElement = rowEl.querySelector<HTMLImageElement>(itemSelectors.img);
        
        // Handle messy image sources (lazy loading, data-src, etc)
        const imgSrc = imageElement ? (imageElement.getAttribute('data-image') || imageElement.getAttribute('data-src') || imageElement.src) : '';

        if (titleAnchor) {
            stories.push({
                title: titleAnchor.innerText.trim(),
                url: titleAnchor.href,
                author: authorSpan?.innerText.trim() || 'Đang cập nhật',
                imageUrl: imgSrc || '',
                source: source,
            });
        }
    });
    return stories;
}

// Scrapers
const scrapers = {
  [TRUYENFULL_SOURCE]: {
    search: (q: string) => genericSearch(q, q => `https://truyenfull.vn/tim-kiem/?tukhoa=${encodeURIComponent(q)}`, '.list-truyen .row', { title: 'h3.truyen-title a', author: '.author', img: '[data-image]', link: 'h3.truyen-title a' }, TRUYENFULL_SOURCE),
    getDetails: async (url: string) => {
        // TruyenFull Pagination logic needs fetch
        const baseUrl = url.replace(/\/trang-\d+\/?(#.*)?$/, '').replace(/#.*$/, '').replace(/\/+$/, '') + '/';
        const doc = await fetchAndParse(baseUrl);
        const baseDetails = extractStoryDetails(doc, TRUYENFULL_SOURCE, url);
        
        // Improved Pagination Detection: Find the max page number from ALL pagination links
        let lastPage = 1;
        const paginationLinks = doc.querySelectorAll('.pagination li a');
        paginationLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            // Regex linh hoạt hơn: tìm 'trang-X' ở bất cứ đâu trong link, không chỉ ở cuối
            const match = href.match(/trang-(\d+)/);
            if (match) {
                const pageNum = parseInt(match[1], 10);
                if (pageNum > lastPage) lastPage = pageNum;
            }
        });

        if (lastPage > 1) {
             const pages = [];
             for (let i = 2; i <= lastPage; i++) pages.push(i);

             // Batch fetching: Tải từng nhóm trang để tránh nghẽn mạng và lỗi 429
             // Giảm Batch size xuống 5 để an toàn hơn
             const BATCH_SIZE = 5;
             for (let i = 0; i < pages.length; i += BATCH_SIZE) {
                 const batch = pages.slice(i, i + BATCH_SIZE);
                 const batchPromises = batch.map(pageNum => 
                     fetchAndParse(`${baseUrl}trang-${pageNum}/`)
                         .then(d => ({ pageNum, doc: d }))
                         .catch(e => {
                             console.warn(`Failed to fetch page ${pageNum}`, e);
                             return null;
                         })
                 );
                 
                 const results = await Promise.all(batchPromises);
                 
                 // Sắp xếp lại theo số trang để đảm bảo thứ tự chương
                 results.sort((a, b) => (a?.pageNum || 0) - (b?.pageNum || 0));

                 results.forEach(res => {
                     if(res && res.doc) {
                        res.doc.querySelectorAll('#list-chapter .list-chapter li a').forEach(el => {
                            if(el.textContent && el.getAttribute('href')) baseDetails.chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
                        });
                     }
                 });

                 // Thêm độ trễ 300ms giữa các batch
                 if (i + BATCH_SIZE < pages.length) {
                     await new Promise(r => setTimeout(r, 300)); 
                 }
             }
        }
        return baseDetails;
    },
    getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), TRUYENFULL_SOURCE)
  },
  [TRUYENFULLVISION_SOURCE]: {
      search: (q: string) => genericSearch(q, q => `https://truyenfull.vision/tim-kiem/?tukhoa=${encodeURIComponent(q)}`, '.list-truyen .row', { title: 'h3.truyen-title a', author: '.author', img: '[data-image]', link: 'h3.truyen-title a' }, TRUYENFULLVISION_SOURCE),
      getDetails: async (url: string) => {
          // Use TruyenFull logic, they are identical structure
          return scrapers[TRUYENFULL_SOURCE].getDetails(url); 
      },
      getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), TRUYENFULLVISION_SOURCE)
  },
  [TANGTHUVIEN_SOURCE]: {
      search: (q: string) => genericSearch(q, q => `https://truyen.tangthuvien.net/ket-qua-tim-kiem?term=${encodeURIComponent(q)}`, 'div.book-img-text ul li', { title: 'div.book-mid-info h4 a', author: 'div.book-mid-info p.author a.name', img: 'div.book-img-box img', link: '' }, TANGTHUVIEN_SOURCE),
      getDetails: async (url: string) => {
          const doc = await fetchAndParse(url);
          const baseDetails = extractStoryDetails(doc, TANGTHUVIEN_SOURCE, url);
          
          // TangThuVien requires fetching chapter list via hidden API
          // 1. Try getting ID from hidden input (most reliable)
          let bookId = doc.querySelector('input[name="story_id"]')?.getAttribute('value');
          
          // 2. Try getting ID from URL if hidden input fails
          if (!bookId) {
              bookId = url.match(/\/(?:doc-truyen|story)\/(\d+)/)?.[1];
          }

          if(bookId) {
               try {
                   // Fetch all chapters in one go using the pagination API with a high limit
                   const chapterApiUrl = `https://truyen.tangthuvien.net/doc-truyen/page/${bookId}?page=0&limit=10000&web=1`;
                   const chapDoc = await fetchAndParse(chapterApiUrl);
                   
                   const newChapters: Chapter[] = [];
                   chapDoc.querySelectorAll('li a').forEach(el => {
                       const href = el.getAttribute('href');
                       const title = el.getAttribute('title') || el.textContent?.trim();
                       if (href && title) {
                           newChapters.push({ title: title, url: href });
                       }
                   });
                   
                   if(newChapters.length > 0) {
                        baseDetails.chapters = newChapters;
                   }
               } catch(e) { console.warn("Failed to fetch TTV chapter list", e); }
          }
          return baseDetails;
      },
      getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), TANGTHUVIEN_SOURCE)
  },
  [TRUYENHDT_SOURCE]: {
      search: (q: string) => genericSearch(q, q => `https://truyenhdt.com/tim-kiem.html?key=${encodeURIComponent(q)}`, 'ul.list-story > li', { title: '.info .title a', author: '.info .author', img: '.image a img', link: '' }, TRUYENHDT_SOURCE),
      getDetails: async (url: string) => extractStoryDetails(await fetchAndParse(url), TRUYENHDT_SOURCE, url),
      getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), TRUYENHDT_SOURCE)
  },
  [KHODOCSACH_SOURCE]: {
      search: (q: string) => genericSearch(q, q => `https://khodocsach.com/tim-kiem?q=${encodeURIComponent(q)}`, '.container .grid .item', { title: '.card-title a', author: '.card-author a', img: '.card-img-top img', link: '' }, KHODOCSACH_SOURCE),
      getDetails: async (url: string) => {
          const doc = await fetchAndParse(url);
          const baseDetails = extractStoryDetails(doc, KHODOCSACH_SOURCE, url);
          // Simple pagination check
          const lastPageLink = Array.from(doc.querySelectorAll('.pagination .page-item a.page-link')).slice(-2)[0];
          const lastPage = lastPageLink ? parseInt(lastPageLink.textContent || '1', 10) : 1;
           
           if (lastPage > 1) {
               const pages = [];
               for(let i=2; i<=lastPage; i++) pages.push(i);

               const BATCH_SIZE = 8;
               for(let i=0; i<pages.length; i+=BATCH_SIZE) {
                   const batch = pages.slice(i, i+BATCH_SIZE);
                   const batchPromises = batch.map(pageNum => 
                        fetchAndParse(`${url}?page=${pageNum}`)
                            .then(d => ({pageNum, doc: d}))
                            .catch(()=>null)
                   );
                   const results = await Promise.all(batchPromises);
                   results.sort((a, b) => (a?.pageNum || 0) - (b?.pageNum || 0));

                   results.forEach(res => {
                       if(res && res.doc) {
                           res.doc.querySelectorAll('#chapters .chapter-list a').forEach(el => {
                                if(el.textContent && el.getAttribute('href')) baseDetails.chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
                           });
                       }
                   });
                   if (i + BATCH_SIZE < pages.length) {
                        await new Promise(r => setTimeout(r, 200)); 
                   }
               }
           }
           return baseDetails;
      },
      getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), KHODOCSACH_SOURCE)
  },
  [TRUYENYY_SOURCE]: {
      search: (q: string) => genericSearch(q, q => `https://truyenyy.mobi/search/?key=${encodeURIComponent(q)}`, '.book-list .book-item a', { title: '.book-name', author: '.book-author', img: 'img', link: '' }, TRUYENYY_SOURCE),
      getDetails: async (url: string) => extractStoryDetails(await fetchAndParse(url), TRUYENYY_SOURCE, url),
      getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), TRUYENYY_SOURCE)
  }
};


export async function searchStory(query: string): Promise<Story[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const searchPromises = Object.values(scrapers).map(scraper =>
    scraper.search(trimmedQuery).catch(err => {
      console.warn(`Search error:`, err);
      return []; 
    })
  );

  const resultsBySource = await Promise.all(searchPromises);
  const allStoriesRaw = resultsBySource.flat();

  // Filter
  const normalizedQuery = normalizeString(trimmedQuery);
  const filteredStories = allStoriesRaw.filter(story => 
      normalizeString(story.title).includes(normalizedQuery)
  );

  if (filteredStories.length === 0 && allStoriesRaw.length === 0) {
      throw new Error(`Không tìm thấy truyện "${query}". Vui lòng thử từ khóa khác.`);
  }

  return filteredStories.length > 0 ? filteredStories : allStoriesRaw;
}

export async function getStoryDetails(story: Story): Promise<Story> {
  const scraper = scrapers[story.source as keyof typeof scrapers];
  if (!scraper) throw new Error(`Nguồn không được hỗ trợ: ${story.source}`);
  
  const details = await scraper.getDetails(story.url);
  return { ...story, ...details };
}

export async function getStoryFromUrl(url: string): Promise<Story> {
  let source = '';
  if (url.includes('truyenfull.vn')) source = TRUYENFULL_SOURCE;
  else if (url.includes('truyenfull.vision')) source = TRUYENFULLVISION_SOURCE;
  else if (url.includes('tangthuvien.net')) source = TANGTHUVIEN_SOURCE;
  else if (url.includes('truyenhdt.com')) source = TRUYENHDT_SOURCE;
  else if (url.includes('khodocsach.com')) source = KHODOCSACH_SOURCE;
  else if (url.includes('truyenyy.mobi')) source = TRUYENYY_SOURCE;

  if (!source) throw new Error(`URL không được hỗ trợ.`);

  const scraper = scrapers[source as keyof typeof scrapers];
  const details = await scraper.getDetails(url);
  return { ...details, url, source };
}

export async function getChapterContent(chapter: Chapter, source: string): Promise<string> {
    if (source === 'Local' || source === 'Ebook') {
        // Đối với truyện Local hoặc Ebook, nếu gọi hàm này nghĩa là không tìm thấy trong cache/zip
        // Trả về chuỗi rỗng để UI hiển thị trình soạn thảo (nếu là Local) hoặc thông báo lỗi
        return ""; 
    }
    const scraper = scrapers[source as keyof typeof scrapers];
    if (scraper) return scraper.getChapter(chapter.url);
    throw new Error(`Nguồn không hợp lệ: ${source}`);
}
