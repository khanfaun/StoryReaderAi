import type { CachedChapter, CharacterStats, ReadingHistoryItem } from '../types';

// =================================================================
// CẢNH BÁO: CÁC HÀM TRONG FILE NÀY ĐANG TRONG QUÁ TRÌNH NGƯNG HOẠT ĐỘNG
// CHÚNG SẼ SỚM ĐƯỢC THAY THẾ HOÀN TOÀN BẰNG FIREBASE
// =================================================================

// =================================================================
// DRIVE API HELPERS (TẠM THỜI GIỮ LẠI)
// =================================================================

let appFolderId: string | null = null;

// Mock các hàm gapi để tránh lỗi runtime, chúng không thực sự hoạt động.
const mockGapi = {
    client: {
        drive: {
            files: {
                list: () => Promise.resolve({ result: { files: [] } }),
                create: () => Promise.resolve({ result: { id: 'mockId' } }),
                get: () => Promise.resolve({ result: {} }),
            }
        },
        request: () => Promise.resolve({ result: {} })
    }
};

async function getAppFolderId(): Promise<string> {
    console.warn("getAppFolderId is deprecated.");
    if (appFolderId) return appFolderId;
    return 'mockFolderId';
}

async function searchFile(name: string, parentId: string): Promise<string | null> {
    console.warn("searchFile is deprecated.");
    return null;
}

async function readFile(fileId: string): Promise<any> {
    console.warn("readFile is deprecated.");
    return null;
}

async function createFile(name: string, content: any, mimeType: string, parentId: string): Promise<string> {
    console.warn("createFile is deprecated.");
    return 'mockFileId';
}

async function updateFile(fileId: string, content: any, mimeType: string): Promise<void> {
    console.warn("updateFile is deprecated.");
    return;
}


// =================================================================
// PUBLIC SYNC FUNCTIONS (DEPRECATED)
// =================================================================

function sanitizeForFilename(url: string): string {
    return url.replace(/[^a-zA-Z0-9-.]/g, '_');
}

// --- History ---
export async function saveHistoryToDrive(history: ReadingHistoryItem[]): Promise<void> {
    console.warn("saveHistoryToDrive is deprecated and will be removed.");
    // const parentId = await getAppFolderId();
    // const fileId = await searchFile('history.json', parentId);
    // if (fileId) {
    //     await updateFile(fileId, history, 'application/json');
    // } else {
    //     await createFile('history.json', history, 'application/json', parentId);
    // }
}

export async function loadHistoryFromDrive(): Promise<ReadingHistoryItem[] | null> {
    console.warn("loadHistoryFromDrive is deprecated and will be removed.");
    return null;
}

// --- Story State (AI Data) ---
export async function saveStoryStateToDrive(storyUrl: string, state: CharacterStats): Promise<void> {
    console.warn("saveStoryStateToDrive is deprecated and will be removed.");
}

export async function loadStoryStateFromDrive(storyUrl: string): Promise<CharacterStats | null> {
    console.warn("loadStoryStateFromDrive is deprecated and will be removed.");
    return null;
}

// --- Chapter Content ---
async function getStoryFolderId(storyUrl: string): Promise<string> {
    console.warn("getStoryFolderId is deprecated.");
    return 'mockStoryFolderId';
}

export async function saveChapterToDrive(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    console.warn("saveChapterToDrive is deprecated and will be removed.");
}

export async function loadChapterFromDrive(storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> {
    console.warn("loadChapterFromDrive is deprecated and will be removed.");
    return null;
}
