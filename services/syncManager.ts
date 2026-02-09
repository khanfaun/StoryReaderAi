
import * as driveService from './googleDriveService';
import * as dbService from './dbService';
import type { Story, CharacterStats, CachedChapter } from '../types';

// Helper: Sanitize tên truyện để làm tên folder an toàn
const sanitizeFolderName = (url: string) => url.replace(/[^a-zA-Z0-9]/g, '_');

// INDEX FILE: Lưu danh sách tóm tắt các truyện đã đồng bộ
const INDEX_FILE_NAME = 'index.json';

// --- SYNC ACTIONS ---

/**
 * 1. Initial Sync (Khi đăng nhập):
 * - Tải index.json từ Drive.
 * - So sánh với DB local.
 * - Nếu Cloud có mà Local không: Tạo "Stub Story" (chỉ có metadata cơ bản) để hiển thị.
 * - Nếu Local có mà Cloud không: Upload metadata lên Cloud (Queue).
 */
export const syncIndex = async () => {
    if (!driveService.isLoggedIn()) return;

    try {
        const appFolderId = await driveService.getAppFolderId();
        
        // 1. Tải Index từ Drive
        const cloudIndex = await driveService.downloadJsonFile(appFolderId, INDEX_FILE_NAME) as Story[] || [];
        
        // 2. Lấy Local Stories
        const localStories = await dbService.getAllStories();
        const localMap = new Map(localStories.map(s => [s.url, s]));
        const cloudMap = new Map(cloudIndex.map(s => [s.url, s]));

        // 3. Merge Cloud -> Local (Lazy stub)
        for (const cloudStory of cloudIndex) {
            if (!localMap.has(cloudStory.url)) {
                // Tạo story ở local nhưng đánh dấu là chưa tải full
                // Chúng ta giữ nguyên thông tin cơ bản để hiển thị list
                await dbService.saveStory({
                    ...cloudStory,
                    chapters: [], // Chưa tải danh sách chương
                    source: cloudStory.source || 'Cloud', // Đánh dấu nguồn
                });
            }
        }

        // 4. Merge Local -> Cloud (Update Index)
        let indexChanged = false;
        for (const localStory of localStories) {
            // Nếu local mới hơn hoặc cloud chưa có -> Update cloud index
            // Ở đây làm đơn giản: Nếu cloud chưa có thì thêm vào
            if (!cloudMap.has(localStory.url)) {
                cloudIndex.push({
                    title: localStory.title,
                    author: localStory.author,
                    imageUrl: localStory.imageUrl,
                    url: localStory.url,
                    source: localStory.source,
                    createdAt: localStory.createdAt
                } as Story); // Chỉ lưu summary vào index
                indexChanged = true;
            }
        }

        if (indexChanged) {
            await driveService.uploadJsonFile(appFolderId, INDEX_FILE_NAME, cloudIndex);
        }

    } catch (e) {
        console.error("Sync Index Failed:", e);
    }
};

/**
 * 2. Sync Story Metadata (Khi bấm vào truyện):
 * - Kiểm tra xem đã có danh sách chương chưa.
 * - Nếu chưa hoặc muốn update -> Tải `metadata.json` từ folder truyện trên Drive.
 * - Đồng thời tải `ai_stats.json`.
 */
export const syncStoryMetadata = async (story: Story): Promise<Story> => {
    if (!driveService.isLoggedIn()) return story;

    try {
        const appFolderId = await driveService.getAppFolderId();
        const folderName = sanitizeFolderName(story.url);
        const storyFolderId = await driveService.getStoryFolderId(appFolderId, folderName);

        // Tải Metadata (chứa full list chapters)
        const cloudMetadata = await driveService.downloadJsonFile(storyFolderId, 'metadata.json');
        
        // Tải AI Stats
        const cloudStats = await driveService.downloadJsonFile(storyFolderId, 'ai_stats.json');

        if (cloudMetadata) {
            // Update Local DB
            const mergedStory = { ...story, ...cloudMetadata };
            await dbService.saveStory(mergedStory);
            
            if (cloudStats) {
                // Save AI stats if available (using a helper or directly if exposed)
                // Assuming we use the localStorage key convention from storyStateService
                localStorage.setItem(`storyState_${story.url}`, JSON.stringify(cloudStats));
            }
            return mergedStory;
        }
    } catch (e) {
        console.warn("Sync Story Metadata Failed (Maybe not on cloud yet):", e);
    }
    return story;
};

/**
 * 3. Sync Chapter Content (Khi bấm đọc chương):
 * - Kiểm tra Local cache.
 * - Nếu không có -> Tải `chapters/chapter_X.json` từ Drive.
 */
export const syncChapterContent = async (storyUrl: string, chapterUrl: string): Promise<string | null> => {
    if (!driveService.isLoggedIn()) return null;

    try {
        const appFolderId = await driveService.getAppFolderId();
        const storyFolderId = await driveService.getStoryFolderId(appFolderId, sanitizeFolderName(storyUrl));
        const chaptersFolderId = await driveService.getStoryFolderId(storyFolderId, 'chapters');
        
        const fileName = sanitizeFolderName(chapterUrl) + '.json';
        const data = await driveService.downloadJsonFile(chaptersFolderId, fileName);
        
        if (data && data.content) {
            // Lưu vào cache local ngay lập tức
            await dbService.saveChapterData(storyUrl, chapterUrl, { content: data.content, stats: data.stats });
            return data.content;
        }
    } catch (e) {
        console.warn("Sync Chapter Content Failed:", e);
    }
    return null;
};

// --- BACKGROUND UPLOAD ACTIONS ---

export const uploadStoryToDrive = async (story: Story, stats: CharacterStats | null) => {
    if (!driveService.isLoggedIn()) return;
    
    // Chạy ngầm không await để không block UI
    (async () => {
        try {
            const appFolderId = await driveService.getAppFolderId();
            const folderName = sanitizeFolderName(story.url);
            const storyFolderId = await driveService.getStoryFolderId(appFolderId, folderName);

            // 1. Upload Metadata
            await driveService.uploadJsonFile(storyFolderId, 'metadata.json', story);

            // 2. Upload AI Stats
            if (stats) {
                await driveService.uploadJsonFile(storyFolderId, 'ai_stats.json', stats);
            }

            // 3. Update Index (Optional, maybe optimize to not do every time)
            await syncIndex(); 

        } catch (e) {
            console.error("Background Upload Story Failed:", e);
        }
    })();
};

export const uploadChapterToDrive = async (storyUrl: string, chapterUrl: string, data: CachedChapter) => {
    if (!driveService.isLoggedIn()) return;

    (async () => {
        try {
            const appFolderId = await driveService.getAppFolderId();
            const storyFolderId = await driveService.getStoryFolderId(appFolderId, sanitizeFolderName(storyUrl));
            const chaptersFolderId = await driveService.getStoryFolderId(storyFolderId, 'chapters');

            const fileName = sanitizeFolderName(chapterUrl) + '.json';
            await driveService.uploadJsonFile(chaptersFolderId, fileName, data);
        } catch (e) {
            console.error("Background Upload Chapter Failed:", e);
        }
    })();
};
