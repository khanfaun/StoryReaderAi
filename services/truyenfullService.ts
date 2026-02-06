import type { Story, Chapter, PartialStory } from '../types';

// =================================================================
// SHARED UTILITIES
// =================================================================

// Xác định các proxy với các trình tạo URL cụ thể
const CORS_PROXIES = [
    {
        name: 'CORSProxy.io',
        buildUrl: (url: string) => `https://corsproxy.io/?${url}`, 
        isJson: false
    },
    {
        name: 'AllOrigins (Raw)',
        buildUrl: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        isJson: false
    },
    {
        name: 'AllOrigins (JSON)',
        buildUrl: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        isJson: true
    },
    {
        name: 'CodeTabs',
        buildUrl: (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        isJson: false
    }
];

// Timeout cho mỗi request lẻ
const SINGLE_PROXY_TIMEOUT = 12000; 

// Hàm fetch đơn lẻ qua 1 proxy
async function fetchViaProxy(proxy: typeof CORS_PROXIES[0], url: string): Promise<Document> {
    const proxyUrl = proxy.buildUrl(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SINGLE_PROXY_TIMEOUT);

    try {
        const response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: {} 
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Status ${response.status}`);
        }
        
        let htmlText = '';

        if (proxy.isJson) {
            const data = await response.json();
            if (data && data.contents) {
                htmlText = data.contents;
            } else {
                throw new Error(`Invalid JSON`);
            }
        } else {
            htmlText = await response.text();
        }
        
        if (!htmlText || htmlText.length < 50) {
            throw new Error(`Content too short`);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // KIỂM TRA LỖI CLOUDFLARE / CAPTCHA / BLOCK
        const docTextContent = doc.body.textContent?.toLowerCase() || "";
        const docTitle = doc.title.toLowerCase();
        
        const errorKeywords = [
            'just a moment...', 
            'attention required', 
            'security check', 
            'access denied', 
            '403 forbidden', 
            'cloudflare', 
            'verify you are human',
            'enable javascript',
            'challenge-platform'
        ];

        if (docTextContent.length < 2000 && errorKeywords.some(keyword => docTitle.includes(keyword) || docTextContent.includes(keyword))) {
            throw new Error(`Blocked by Cloudflare`);
        }
        
        if (doc.body && doc.body.children.length > 0) {
             return doc;
        } else {
             throw new Error(`Parse Failed`);
        }

    } catch (error) {
        clearTimeout(timeoutId);
        throw error; // Ném lỗi để Promise.any bỏ qua promise này
    }
}

// Polyfill for Promise.any to avoid TS errors if target lib < ES2021
function promiseAny<T>(promises: Promise<T>[]): Promise<T> {
    return new Promise((resolve, reject) => {
        let errors: any[] = [];
        let rejectedCount = 0;
        if (promises.length === 0) {
             reject(new Error("No promises passed"));
             return;
        }
        promises.forEach((promise, index) => {
            Promise.resolve(promise)
                .then(resolve)
                .catch(error => {
                    errors[index] = error;
                    rejectedCount++;
                    if (rejectedCount === promises.length) {
                        reject({ errors, message: "All promises rejected" });
                    }
                });
        });
    });
}

async function fetchAndParse(url: string): Promise<Document> {
  // Chiến thuật: "Đua" (Race/Any)
  // Gửi request tới TẤT CẢ proxy cùng lúc. Cái nào xong trước và thành công thì lấy.
  // Điều này khắc phục việc phải chờ proxy chết (timeout) mới thử cái tiếp theo.
  
  const promises = CORS_PROXIES.map(proxy => fetchViaProxy(proxy, url));

  try {
      // Promise.any trả về promise đầu tiên thành công (fulfilled)
      // Sử dụng polyfill promiseAny thay vì Promise.any trực tiếp
      const result = await promiseAny(promises);
      return result;
  } catch (aggregateError: any) {
      // Nếu TẤT CẢ đều thất bại
      console.error("All proxies failed:", aggregateError.errors);
      throw new Error(`CONNECTION_FAILED: Không thể tải dữ liệu từ ${url}. Tất cả các kênh kết nối đều thất bại.`);
  }
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
    // Danh sách selector cần xóa (quảng cáo, script rác)
    let removeSelectors: string[] = ['script', 'style', 'iframe', 'div[class*="ads"]', 'center', '.ads-responsive'];

    switch (source) {
        case 'TruyenFull.vn':
        case 'TruyenFull.vision':
            contentEl = doc.querySelector('#chapter-c') || doc.querySelector('.chapter-c') || doc.querySelector('.chapter-content');
            removeSelectors.push('.ads-chapter', '.ads', '.meta-chap', '#chapter-nav', 'a[href*="truyenfull"]', '.ads-mobile');
            break;
        case 'TangThuVien.net':
            contentEl = doc.querySelector('.box-chap-content, .chapter-c, .chapter-content, .content-body');
            removeSelectors.push('div[class*="google-auto-placed"]', 'a', '.ads-content', '.box-config', '.truyen-control', '.chapter-nav', '#chapter-nav-top', '#chapter-nav-bot', '.btn-chapter-nav');
            break;
        case 'TruyenHDT.com':
            contentEl = doc.querySelector('#chapter-content');
            removeSelectors.push('.ads-in-content', 'a');
            break;
        case 'KhoDocSach.com':
            contentEl = doc.querySelector('#chapter-content');
            removeSelectors.push('.text-center', 'a');
            break;
        case 'TruyenYY.mobi':
            contentEl = doc.querySelector('#chapter-content');
            removeSelectors.push('.ads-holder', 'a');
            break;
        default:
             contentEl = doc.querySelector('#chapter-c, .box-chap-content, #chapter-content, .chapter-c, .content-body');
    }

    if (!contentEl) {
        // Fallback: Tìm div chứa nhiều text nhất nếu không khớp selector chuẩn
        const divs = Array.from(doc.querySelectorAll('div'));
        let maxLen = 0;
        let bestDiv = null;
        divs.forEach(div => {
            // Lọc bỏ các div container quá lớn
            if (div.children.length > 20) return;
            
            const len = div.textContent?.length || 0;
            if (len > maxLen && len > 500) { 
                maxLen = len;
                bestDiv = div;
            }
        });
        if (bestDiv) {
            contentEl = bestDiv;
        } else {
            // Nếu vẫn không tìm thấy, trả về thông báo lỗi nhẹ nhàng thay vì throw Error
            return "Không thể tự động trích xuất nội dung. Có thể cấu trúc trang web đã thay đổi hoặc bị chặn. Hãy thử tính năng 'Nhập thủ công'.";
        }
    }

    // Clean up DOM rác
    removeSelectors.forEach(selector => {
        contentEl?.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Loại bỏ style cứng và class để tránh xung đột giao diện
    contentEl.querySelectorAll('*').forEach(el => {
        el.removeAttribute('style');
        el.removeAttribute('class');
    });

    // Xử lý xuống dòng
    contentEl.innerHTML = contentEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p>/gi, '\n')
        .replace(/<\/p>/gi, '\n');

    let text = (contentEl.textContent ?? '').trim();
    
    // Lọc rác đặc thù của TTV
    if (source === 'TangThuVien.net') {
         const garbageLines = [
            'Tuỳ chỉnh', 'Theme', 'Font chữ', 'Palatino', 'Times', 'Arial', 'Georgia', 
            'Cỡ chữ', 'A-', 'A+', 'Màn hình', '-', '+', 'Nền', 'Màu chữ',
            'Trang chủ', 'Danh sách', 'Truyện mới', 'Phản hồi'
         ];
         text = text.split('\n').filter(line => {
             const t = line.trim();
             if (garbageLines.includes(t)) return false;
             if (/^\d+$/.test(t) && (parseInt(t) === 26 || parseInt(t) === 900)) return false; 
             return true;
         }).join('\n');
    }

    // Chuẩn hóa khoảng trắng
    text = text.replace(/\n\s*\n/g, '\n\n').replace(/[ \t]+/g, ' ');
    
    return text || "Nội dung chương trống.";
}

function extractStoryDetails(doc: Document, source: string, url: string): PartialStory & { chapters: Chapter[] } {
    let title = '', author = '', imageUrl = '', description = '';
    const chapters: Chapter[] = [];

    const txt = (sel: string) => doc.querySelector(sel)?.textContent?.trim() ?? '';
    const attr = (sel: string, attrName: string) => doc.querySelector(sel)?.getAttribute(attrName) ?? '';

    switch (source) {
        case 'TruyenFull.vn':
        case 'TruyenFull.vision':
            title = txt('h3.title') || txt('.col-truyen-main .title');
            author = txt('div.info a[itemprop="author"]') || txt('.info .author');
            imageUrl = attr('.book img', 'src') || attr('.books img', 'src');
            description = txt('.desc-text') || txt('.desc-text-full') || 'Không có mô tả.';
            
            // Lấy chương từ trang đầu tiên
            doc.querySelectorAll('#list-chapter .list-chapter li a, .list-chapter li a').forEach(el => {
                if(el.textContent && el.getAttribute('href')) chapters.push({ title: el.textContent.trim(), url: el.getAttribute('href')! });
            });
            break;
        case 'TangThuVien.net':
            title = txt('.book-info h1');
            author = txt('.book-info .tag a.blue');
            imageUrl = attr('div.book-img > img', 'src');
            description = Array.from(doc.querySelectorAll('.book-intro p')).map(p => p.textContent?.trim()).join('\n\n') || 'Không có mô tả.';
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

// Logic lấy chi tiết truyện dùng chung cho TruyenFull (Modified for Background Fetch)
const truyenFullGetDetails = async (url: string, source: string, onPartialUpdate?: (story: PartialStory & { chapters: Chapter[] }) => void) => {
    // 1. Lấy thông tin trang đầu tiên (Critical Path)
    // Clean URL: bỏ phân trang, bỏ hash
    const baseUrl = url.replace(/\/trang-\d+\/?(#.*)?$/, '').replace(/#.*$/, '').replace(/\/+$/, '') + '/';
    const doc = await fetchAndParse(baseUrl);
    const baseDetails = extractStoryDetails(doc, source, url);
    
    // 2. Xác định tổng số trang
    let lastPage = 1;
    const paginationLinks = doc.querySelectorAll('.pagination li a');
    paginationLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/trang-(\d+)/);
        if (match) {
            const pageNum = parseInt(match[1], 10);
            if (pageNum > lastPage) lastPage = pageNum;
        }
    });

    // 3. Nếu có nhiều trang, khởi động tiến trình tải ngầm
    if (lastPage > 1) {
         // Detached Async Process: Không await ở đây để trả về kết quả trang 1 ngay lập tức
         (async () => {
             const pages = [];
             for (let i = 2; i <= lastPage; i++) pages.push(i);
             
             // Tăng batch size lên để tải nhanh hơn
             const BATCH_SIZE = 8; 
             
             for (let i = 0; i < pages.length; i += BATCH_SIZE) {
                 const batch = pages.slice(i, i + BATCH_SIZE);
                 
                 // Sử dụng Promise.allSettled để request song song, không chết chùm
                 const batchResults = await Promise.allSettled(batch.map(async (pageNum) => {
                     try {
                         const pageDoc = await fetchAndParse(`${baseUrl}trang-${pageNum}/`);
                         return { pageNum, doc: pageDoc };
                     } catch (e) {
                         console.warn(`Background fetch failed page ${pageNum} of ${baseUrl}`, e);
                         return null; // Trả về null nếu lỗi
                     }
                 }));
                 
                 // Lọc lấy kết quả thành công và sắp xếp
                 const validResults = batchResults
                    .filter((r): r is PromiseFulfilledResult<{ pageNum: number; doc: Document } | null> => r.status === 'fulfilled' && r.value !== null)
                    .map(r => r.value)
                    .sort((a, b) => (a?.pageNum || 0) - (b?.pageNum || 0));

                 // Parse chương từ các trang đã tải và thêm vào baseDetails
                 let hasNewChapters = false;
                 validResults.forEach(res => {
                     if(res && res.doc) {
                        res.doc.querySelectorAll('#list-chapter .list-chapter li a, .list-chapter li a').forEach(el => {
                            if(el.textContent && el.getAttribute('href')) {
                                baseDetails.chapters.push({ 
                                    title: el.textContent.trim(), 
                                    url: el.getAttribute('href')! 
                                });
                                hasNewChapters = true;
                            }
                        });
                     }
                 });
                 
                 // Gửi tín hiệu cập nhật về App nếu có chương mới
                 if (hasNewChapters && onPartialUpdate) {
                     onPartialUpdate(baseDetails);
                 }
                 
                 // Nghỉ nhẹ 1 chút để tránh spam quá mức
                 if (i + BATCH_SIZE < pages.length) {
                     await new Promise(r => setTimeout(r, 200)); 
                 }
             }
         })();
    }
    
    // Trả về ngay dữ liệu của trang 1 để hiển thị
    return baseDetails;
}

// Scrapers configuration
const scrapers = {
  [TRUYENFULL_SOURCE]: {
    search: (q: string) => genericSearch(q, q => `https://truyenfull.vn/tim-kiem/?tukhoa=${encodeURIComponent(q)}`, '.list-truyen .row', { title: 'h3.truyen-title a', author: '.author', img: '[data-image]', link: 'h3.truyen-title a' }, TRUYENFULL_SOURCE),
    getDetails: (url: string, onPartialUpdate?: (s: any) => void) => truyenFullGetDetails(url, TRUYENFULL_SOURCE, onPartialUpdate),
    getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), TRUYENFULL_SOURCE)
  },
  [TRUYENFULLVISION_SOURCE]: {
      // TruyenFull.vision có cấu trúc tương tự .vn nhưng khác domain
      search: (q: string) => genericSearch(q, q => `https://truyenfull.vision/tim-kiem/?tukhoa=${encodeURIComponent(q)}`, '.list-truyen .row', { title: 'h3.truyen-title a', author: '.author', img: '[data-image]', link: 'h3.truyen-title a' }, TRUYENFULLVISION_SOURCE),
      getDetails: (url: string, onPartialUpdate?: (s: any) => void) => truyenFullGetDetails(url, TRUYENFULLVISION_SOURCE, onPartialUpdate),
      getChapter: async (url: string) => extractChapterContent(await fetchAndParse(url), TRUYENFULLVISION_SOURCE)
  },
  [TANGTHUVIEN_SOURCE]: {
      search: (q: string) => genericSearch(q, q => `https://truyen.tangthuvien.net/ket-qua-tim-kiem?term=${encodeURIComponent(q)}`, 'div.book-img-text ul li', { title: 'div.book-mid-info h4 a', author: 'div.book-mid-info p.author a.name', img: 'div.book-img-box img', link: '' }, TANGTHUVIEN_SOURCE),
      getDetails: async (url: string) => {
          const doc = await fetchAndParse(url);
          const baseDetails = extractStoryDetails(doc, TANGTHUVIEN_SOURCE, url);
          
          // TTV dùng API ẩn để load chương, cần lấy bookId
          let bookId = doc.querySelector('input[name="story_id"]')?.getAttribute('value');
          if (!bookId) {
              bookId = url.match(/\/(?:doc-truyen|story)\/(\d+)/)?.[1];
          }

          if(bookId) {
               try {
                   // Hack: lấy limit cực lớn để lấy toàn bộ chương 1 lần
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
          const lastPageLink = Array.from(doc.querySelectorAll('.pagination .page-item a.page-link')).slice(-2)[0];
          const lastPage = lastPageLink ? parseInt(lastPageLink.textContent || '1', 10) : 1;
           
           if (lastPage > 1) {
               const pages = [];
               for(let i=2; i<=lastPage; i++) pages.push(i);

               const BATCH_SIZE = 8;
               for(let i=0; i<pages.length; i+=BATCH_SIZE) {
                   const batch = pages.slice(i, i+BATCH_SIZE);
                   const batchResults = await Promise.allSettled(batch.map(pageNum => 
                        fetchAndParse(`${url}?page=${pageNum}`)
                   ));
                   
                   const validResults = batchResults
                    .filter((r): r is PromiseFulfilledResult<Document> => r.status === 'fulfilled')
                    .map((r, index) => ({ doc: r.value, pageNum: batch[index] }))
                    .sort((a, b) => a.pageNum - b.pageNum);

                   validResults.forEach(res => {
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

  // Check if query is a supported URL
  if (trimmedQuery.startsWith('http')) {
      // Nếu là URL, ưu tiên tải trực tiếp. Nếu lỗi thì ném lỗi ra luôn để UI hiển thị, không fallback sang tìm kiếm từ khóa.
      const story = await getStoryFromUrl(trimmedQuery);
      return [story];
  }

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

export async function getStoryDetails(story: Story, onPartialUpdate?: (story: Story) => void): Promise<Story> {
  const scraper = scrapers[story.source as keyof typeof scrapers];
  if (!scraper) throw new Error(`Nguồn không được hỗ trợ: ${story.source}`);
  
  // Pass the callback to the scraper
  const details = await scraper.getDetails(story.url, (partialDetails: any) => {
      if (onPartialUpdate) {
          onPartialUpdate({ ...story, ...partialDetails });
      }
  });
  return { ...story, ...details };
}

export async function getStoryFromUrl(url: string, onPartialUpdate?: (story: Story) => void): Promise<Story> {
  let source = '';
  if (url.includes('truyenfull.vn')) source = TRUYENFULL_SOURCE;
  else if (url.includes('truyenfull.vision')) source = TRUYENFULLVISION_SOURCE;
  else if (url.includes('tangthuvien.net')) source = TANGTHUVIEN_SOURCE;
  else if (url.includes('truyenhdt.com')) source = TRUYENHDT_SOURCE;
  else if (url.includes('khodocsach.com')) source = KHODOCSACH_SOURCE;
  else if (url.includes('truyenyy.mobi')) source = TRUYENYY_SOURCE;

  if (!source) throw new Error(`URL không được hỗ trợ. Hiện chỉ hỗ trợ: TruyenFull, TangThuVien, TruyenHDT, KhoDocSach, TruyenYY.`);

  const performFetch = async (targetUrl: string, targetSource: string) => {
      const scraper = scrapers[targetSource as keyof typeof scrapers];
      const details = await scraper.getDetails(targetUrl, (partialDetails: any) => {
          if (onPartialUpdate) {
              onPartialUpdate({ ...partialDetails, url: targetUrl, source: targetSource });
          }
      });
      return { ...details, url: targetUrl, source: targetSource };
  };

  try {
      return await performFetch(url, source);
  } catch (error) {
      // Cơ chế Fallback: Nếu TruyenFull.vision lỗi, thử TruyenFull.vn và ngược lại
      if (url.includes('truyenfull.vision')) {
          const fallbackUrl = url.replace('truyenfull.vision', 'truyenfull.vn');
          console.log(`[Fallback] Thử lại với domain truyenfull.vn: ${fallbackUrl}`);
          try {
              return await performFetch(fallbackUrl, TRUYENFULL_SOURCE);
          } catch (e) {
              console.warn("Fallback cũng thất bại.");
          }
      } else if (url.includes('truyenfull.vn')) {
          const fallbackUrl = url.replace('truyenfull.vn', 'truyenfull.vision');
          console.log(`[Fallback] Thử lại với domain truyenfull.vision: ${fallbackUrl}`);
          try {
              return await performFetch(fallbackUrl, TRUYENFULLVISION_SOURCE);
          } catch (e) {
              console.warn("Fallback cũng thất bại.");
          }
      }
      throw error;
  }
}

export async function getChapterContent(chapter: Chapter, source: string): Promise<string> {
    if (source === 'Local' || source === 'Ebook') {
        return ""; 
    }
    const scraper = scrapers[source as keyof typeof scrapers];
    if (scraper) return scraper.getChapter(chapter.url);
    throw new Error(`Nguồn không hợp lệ: ${source}`);
}