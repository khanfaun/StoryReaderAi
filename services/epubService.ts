
import type { Story, Chapter } from '../types';
import { getChapterContent } from './truyenfullService';
import { getCachedChapter } from './cacheService';

declare var JSZip: any;

// Helper: Escape HTML
const escapeXml = (unsafe: string) => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

// Helper: Clean HTML for XML/XHTML strictness
const cleanHtmlForXhtml = (html: string) => {
    // 1. Chuyển đổi <br> thành <br />
    let clean = html.replace(/<br\s*\/?>/gi, '<br />');
    
    // 2. Wrap text trong <p> nếu chưa có
    const paragraphs = clean.split('\n').filter(line => line.trim().length > 0);
    clean = paragraphs.map(p => {
        if (!p.trim().startsWith('<p')) return `<p>${p}</p>`;
        return p;
    }).join('\n');

    // 3. Loại bỏ các ký tự điều khiển không hợp lệ
    // eslint-disable-next-line no-control-regex
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return clean;
};

// Delay helper
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface DownloadProgressCallback {
    (downloadedCount: number, totalChapters: number, log?: string, action?: string): void;
}

interface CheckCancelledCallback {
    (): boolean;
}

/**
 * Tải nội dung các chương và trả về mảng dữ liệu
 */
async function fetchChaptersContent(
    story: Story,
    chaptersToDownload: Chapter[],
    onProgress: DownloadProgressCallback,
    isCancelled: CheckCancelledCallback
) {
    const chaptersData: { index: number; title: string; content: string; fileName: string }[] = [];
    const total = chaptersToDownload.length;
    let downloaded = 0;

    // BATCH PROCESSING CONFIG
    const BATCH_SIZE = 5; 
    const BATCH_DELAY = 1000;

    for (let i = 0; i < total; i += BATCH_SIZE) {
        if (isCancelled()) {
            throw new Error("Đã hủy bởi người dùng");
        }

        const batch = chaptersToDownload.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (chapter, indexInBatch) => {
            // Tìm index thực tế trong story gốc để hiển thị đúng số chương (nếu cần) hoặc dùng index trong mảng tải về
            // Ở đây ta dùng index trong mảng tải về để đảm bảo tính liên tục trong file EPUB
            const globalIndex = i + indexInBatch; 
            
            try {
                let content = '';
                const cached = await getCachedChapter(story.url, chapter.url);
                
                if (cached) {
                    content = cached.content;
                } else {
                    if (story.source === 'Local' || story.source === 'Ebook') {
                        content = "Nội dung không khả dụng (Local/Ebook gốc chưa được lưu nội dung).";
                    } else {
                        content = await getChapterContent(chapter, story.source);
                    }
                }
                
                return {
                    index: globalIndex,
                    title: chapter.title,
                    content: content,
                    fileName: `chapter_${globalIndex + 1}.xhtml`
                };
            } catch (e) {
                onProgress(downloaded, total, `Lỗi tải chương "${chapter.title}": ${(e as Error).message}`);
                return {
                    index: globalIndex,
                    title: chapter.title,
                    content: `<p><em>Lỗi tải nội dung chương này.</em></p>`,
                    fileName: `chapter_${globalIndex + 1}.xhtml`
                };
            }
        });

        const results = await Promise.all(batchPromises);
        
        results.forEach(res => {
            if (res) {
                chaptersData.push(res);
                downloaded++;
            }
        });

        onProgress(downloaded, total, `Đã tải xong nhóm ${i + 1} - ${Math.min(i + BATCH_SIZE, total)}`, "Đang tải nội dung...");
        
        if (i + BATCH_SIZE < total) {
            await wait(BATCH_DELAY);
        }
    }

    return chaptersData.sort((a, b) => a.index - b.index);
}

/**
 * Tạo file EPUB Blob từ dữ liệu chương
 */
async function generateEpubBlob(
    story: Story,
    chaptersData: { title: string; content: string; fileName: string }[],
    onProgress: DownloadProgressCallback
): Promise<Blob> {
    const zip = new JSZip();
    const total = chaptersData.length;

    onProgress(total, total, "Đang đóng gói EPUB...", "Đang nén file...");

    // mimetype
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // container.xml
    zip.folder("META-INF").file("container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

    const oebps = zip.folder("OEBPS");
    const navPoints: string[] = [];
    const manifestItems: string[] = [];
    const spineRefs: string[] = [];

    // CSS
    oebps.folder("Styles").file("style.css", `
body { font-family: "Times New Roman", serif; font-size: 1.1em; line-height: 1.6; padding: 0 10px; text-align: justify; }
h1, h2 { text-align: center; color: #333; margin-bottom: 1em; }
p { margin-bottom: 1em; text-indent: 1.5em; }
    `);
    manifestItems.push(`<item id="css" href="Styles/style.css" media-type="text/css"/>`);

    // Title Page
    const titlePageContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(story.title)}</title><link rel="stylesheet" href="Styles/style.css" type="text/css"/></head>
<body>
    <div style="text-align: center; margin-top: 30%;">
        <h1>${escapeXml(story.title)}</h1>
        <h3>${escapeXml(story.author)}</h3>
        <p>Nguồn: ${escapeXml(story.source)}</p>
        <p>Tạo bởi: Trình Đọc Truyện AI</p>
        ${story.description ? `<p style="margin-top: 2em; font-style: italic;">${escapeXml(story.description).replace(/\n/g, '<br/>')}</p>` : ''}
    </div>
</body>
</html>`;
    oebps.folder("Text").file("title_page.xhtml", titlePageContent);
    manifestItems.push(`<item id="title_page" href="Text/title_page.xhtml" media-type="application/xhtml+xml"/>`);
    spineRefs.push(`<itemref idref="title_page"/>`);
    navPoints.push(`<navPoint id="navPoint-0" playOrder="0"><navLabel><text>Thông tin truyện</text></navLabel><content src="Text/title_page.xhtml"/></navPoint>`);

    // Chapters
    chaptersData.forEach((chap, idx) => {
        const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(chap.title)}</title><link rel="stylesheet" href="../Styles/style.css" type="text/css"/></head>
<body>
    <h2>${escapeXml(chap.title)}</h2>
    ${cleanHtmlForXhtml(chap.content)}
</body>
</html>`;
        
        oebps.folder("Text").file(chap.fileName, xhtml);
        manifestItems.push(`<item id="chap_${idx}" href="Text/${chap.fileName}" media-type="application/xhtml+xml"/>`);
        spineRefs.push(`<itemref idref="chap_${idx}"/>`);
        navPoints.push(`<navPoint id="navPoint-${idx + 1}" playOrder="${idx + 1}"><navLabel><text>${escapeXml(chap.title)}</text></navLabel><content src="Text/${chap.fileName}"/></navPoint>`);
    });

    // content.opf
    const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:title>${escapeXml(story.title)}</dc:title>
        <dc:creator opf:role="aut">${escapeXml(story.author)}</dc:creator>
        <dc:language>vi</dc:language>
        <dc:identifier id="BookId" opf:scheme="UUID">urn:uuid:${Date.now()}</dc:identifier>
        <meta name="cover" content="cover-image" />
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        ${manifestItems.join('\n        ')}
    </manifest>
    <spine toc="ncx">
        ${spineRefs.join('\n        ')}
    </spine>
</package>`;
    oebps.file("content.opf", contentOpf);

    // toc.ncx
    const tocNcx = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="urn:uuid:${Date.now()}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle><text>${escapeXml(story.title)}</text></docTitle>
    <navMap>
        ${navPoints.join('\n        ')}
    </navMap>
</ncx>`;
    oebps.file("toc.ncx", tocNcx);

    return await zip.generateAsync({ type: "blob" });
}

/**
 * Tạo file HTML đơn (dùng để in sang PDF)
 */
async function generateHtmlBlob(
    story: Story,
    chaptersData: { title: string; content: string }[],
    onProgress: DownloadProgressCallback
): Promise<Blob> {
    onProgress(chaptersData.length, chaptersData.length, "Đang tạo file HTML...", "Đang đóng gói...");
    
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <title>${escapeXml(story.title)}</title>
        <style>
            body { font-family: "Times New Roman", serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { text-align: center; page-break-before: always; color: #333; }
            .title-page { text-align: center; margin-top: 30vh; page-break-after: always; }
            .chapter { page-break-after: always; }
            p { text-align: justify; text-indent: 1.5em; margin-bottom: 1em; }
        </style>
    </head>
    <body>
        <div class="title-page">
            <h1>${escapeXml(story.title)}</h1>
            <h3>${escapeXml(story.author)}</h3>
            <p>Nguồn: ${escapeXml(story.source)}</p>
        </div>
    `;

    chaptersData.forEach(chap => {
        htmlContent += `
        <div class="chapter">
            <h1>${escapeXml(chap.title)}</h1>
            ${cleanHtmlForXhtml(chap.content)}
        </div>
        `;
    });

    htmlContent += `</body></html>`;
    
    return new Blob([htmlContent], { type: "text/html;charset=utf-8" });
}

/**
 * Hàm chính để tải truyện (đã được cập nhật để trả về Blob)
 */
export async function downloadStoryAsEpub(
    story: Story, 
    chaptersToDownload: Chapter[],
    format: 'epub' | 'html',
    onProgress: DownloadProgressCallback,
    isCancelled: CheckCancelledCallback
): Promise<Blob> {
    if (!chaptersToDownload || chaptersToDownload.length === 0) {
        throw new Error("Danh sách chương trống.");
    }

    // 1. Fetch Content
    const chaptersData = await fetchChaptersContent(story, chaptersToDownload, onProgress, isCancelled);

    // 2. Generate File based on format
    if (format === 'html') {
        return generateHtmlBlob(story, chaptersData, onProgress);
    } else {
        return generateEpubBlob(story, chaptersData, onProgress);
    }
}
