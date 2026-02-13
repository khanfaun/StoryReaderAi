
import { Story, CachedChapter, ReadingHistoryItem } from '../types';
import * as dbService from './dbService';
import { getReadingHistory, saveReadingHistory, isHistoryDirty, markHistorySynced } from './history';

declare var gapi: any;
declare var google: any;

const CLIENT_ID = '668650540476-6dkreulqvl7sffc6sv373t2pplob9hmt.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'; 

const INDEX_FILENAME = 'library_index.json';
const HISTORY_FILENAME = 'reading_history.json';

const STORAGE_KEY_TOKEN = 'gdrive_access_token';
const STORAGE_KEY_EXPIRY = 'gdrive_token_expiry';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

const fileIdCache = new Map<string, string>();

// --- GLOBAL SYNC STATE ---
// status: Text hiển thị trong Modal
// isSyncing: True khi đang chạy quy trình đồng bộ thủ công (Modal)
// isBackgroundSyncing: True khi đang chạy đồng bộ ngầm (Icon Header xoay)
// isDirty: True khi có thay đổi chưa được đẩy lên (Icon Header màu cam)
// isError: True khi quá trình đồng bộ gặp lỗi (Icon Header tam giác)
let globalState = {
    status: '',
    isSyncing: false,
    isBackgroundSyncing: false,
    isDirty: false,
    isError: false,
    lastError: null as string | null
};

type SyncListener = (state: typeof globalState) => void;
const syncListeners: Set<SyncListener> = new Set();

const notifyListeners = () => {
    syncListeners.forEach(listener => listener({ ...globalState }));
};

const updateGlobalState = (updates: Partial<typeof globalState>) => {
    globalState = { ...globalState, ...updates };
    notifyListeners();
};

export const subscribeToSyncState = (listener: SyncListener) => {
    listener({ ...globalState });
    syncListeners.add(listener);
    return () => syncListeners.delete(listener);
};

// --- SYNC QUEUE SYSTEM (Hàng đợi xử lý đồng bộ nền) ---
// Giúp tránh lỗi Rate Limit khi cào nhiều chương cùng lúc
type SyncTask = () => Promise<void>;
const syncQueue: SyncTask[] = [];
let isQueueProcessing = false;

// Hàm kiểm tra xem hệ thống có đang bận xử lý dữ liệu quan trọng không
// Dùng để cảnh báo khi người dùng tắt tab
export const hasPendingWork = (): boolean => {
    return syncQueue.length > 0 || isQueueProcessing || globalState.isSyncing;
};

const enqueueSyncTask = (task: SyncTask) => {
    syncQueue.push(task);
    processSyncQueue();
};

const processSyncQueue = async () => {
    if (isQueueProcessing) return;
    
    // Bật trạng thái background syncing ngay lập tức, xóa lỗi cũ
    updateGlobalState({ isBackgroundSyncing: true, isDirty: false, isError: false, lastError: null });
    isQueueProcessing = true;

    try {
        while (syncQueue.length > 0) {
            const task = syncQueue.shift();
            if (task) {
                try {
                    await task();
                } catch (e: any) {
                    console.error("Background sync task failed:", e);
                    // Nếu lỗi một task, đánh dấu là Lỗi
                    updateGlobalState({ isError: true, lastError: e.message || 'Lỗi đồng bộ' });
                }
                // Delay nhỏ giữa các request để an toàn cho quota Google Drive
                await new Promise(resolve => setTimeout(resolve, 500)); 
            }
        }
    } catch (err: any) {
        console.error("Critical Queue Error:", err);
        updateGlobalState({ isError: true, lastError: err.message || 'Lỗi hàng đợi' });
    } finally {
        // LUÔN LUÔN TẮT TRẠNG THÁI BẬN DÙ CÓ LỖI HAY KHÔNG
        isQueueProcessing = false;
        
        // Kiểm tra lại trạng thái cuối cùng
        // Nếu đã có lỗi (isError=true) thì giữ nguyên icon tam giác.
        // Nếu không có lỗi, kiểm tra xem còn dirty item nào sót lại không.
        await checkDirtyStatus(true); 
    }
};

// Hàm mới: Tự động đẩy các dữ liệu dirty lên Drive (chạy ngầm)
const uploadDirtyDataToDrive = async () => {
    if (!accessToken) return;
    
    try {
        // 1. Check & Upload Reading History
        if (isHistoryDirty()) {
            const history = getReadingHistory();
            await saveReadingHistoryToDrive(history);
        }

        // 2. Check & Upload Stories
        const dirtyStories = await dbService.getDirtyStories();
        if (dirtyStories.length > 0) {
            for (const story of dirtyStories) {
                const { _dirty, ...cleanStoryData } = story;
                await saveStoryDetailsToDrive(cleanStoryData as Story);
                await dbService.markStorySynced(story);
            }
            // Update index if stories changed
            const allStories = await dbService.getAllStories();
            await saveLibraryIndexToDrive(allStories);
        }

        // 3. Check & Upload Chapters
        const dirtyChapters = await dbService.getAllDirtyChapters();
        if (dirtyChapters.length > 0) {
            for (const chap of dirtyChapters) {
                const { _dirty, ...cleanChapData } = chap;
                await saveChapterContentToDrive(chap.storyUrl, chap.chapterUrl, cleanChapData);
                await dbService.markChapterSynced(chap.storyUrl, chap.chapterUrl, cleanChapData);
            }
        }
    } catch (e) {
        console.error("Auto-sync failed", e);
        throw e; // Để queue handler bắt lỗi
    }
};

// Hàm kiểm tra nhanh xem còn file nào chưa sync không (chạy sau khi queue rỗng hoặc khi init)
// updateUI: Có cập nhật globalState tắt spinner không
// triggerAutoSync: Có tự động đẩy lên Drive không
const checkDirtyStatus = async (updateUI: boolean = false) => {
    if (!accessToken) {
        if(updateUI) updateGlobalState({ isBackgroundSyncing: false });
        return;
    }
    
    try {
        const dirtyStories = await dbService.getDirtyStories();
        const isHistoryUnsynced = isHistoryDirty();
        // Check dirty chapters cost heavy db read, maybe optimize later. 
        // For now rely on story/history or assume queue cleared chapters.
        const dirtyChapters = await dbService.getAllDirtyChapters(); 
        
        const hasDirty = dirtyStories.length > 0 || isHistoryUnsynced || dirtyChapters.length > 0;
        
        if (hasDirty) {
            updateGlobalState({ isDirty: true });
            
            // AUTO SYNC LOGIC:
            // Nếu phát hiện dirty, đang đăng nhập, và không đang trong trạng thái lỗi nghiêm trọng
            // -> Tự động queue task để đồng bộ
            if (!globalState.isError && !globalState.isBackgroundSyncing) {
                console.log("Auto-sync triggered due to dirty items...");
                enqueueSyncTask(uploadDirtyDataToDrive);
            }
        } else {
            // Nếu không còn gì dirty, và không có lỗi -> Icon Tick Xanh (Clean)
            if (!globalState.isError) {
                updateGlobalState({ isDirty: false });
            }
        }
    } catch(e) {
        console.warn("Check dirty failed", e);
    } finally {
        if(updateUI) updateGlobalState({ isBackgroundSyncing: false });
    }
}


// --- INITIALIZATION & AUTH ---

export async function initGoogleDrive(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof gapi === 'undefined' || typeof google === 'undefined') {
            reject(new Error("Google scripts not loaded."));
            return;
        }

        const initializeGapiClient = async () => {
            try {
                await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
                gapiInited = true;
                maybeResolve();
            } catch(e) { reject(e); }
        };

        const initializeGisClient = () => {
            try {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: (resp: any) => {
                        if (resp.error !== undefined) throw (resp);
                        accessToken = resp.access_token;
                        const expirationTime = Date.now() + (resp.expires_in * 1000);
                        localStorage.setItem(STORAGE_KEY_TOKEN, accessToken!);
                        localStorage.setItem(STORAGE_KEY_EXPIRY, expirationTime.toString());
                        updateGlobalState({ isDirty: false, isError: false }); // Reset status on login
                        checkDirtyStatus(); // Check and Auto-Sync
                    },
                });
                gisInited = true;
                maybeResolve();
            } catch (e) { reject(e); }
        };

        const maybeResolve = () => {
            if (gapiInited && gisInited) {
                tryRestoreSession();
                resolve();
            }
        };

        gapi.load('client', initializeGapiClient);
        initializeGisClient();
    });
}

function tryRestoreSession() {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const storedExpiry = localStorage.getItem(STORAGE_KEY_EXPIRY);

    if (storedToken && storedExpiry) {
        const expiryTime = parseInt(storedExpiry, 10);
        if (Date.now() < expiryTime - 300000) {
            accessToken = storedToken;
            if (gapi.client) gapi.client.setToken({ access_token: accessToken });
            console.log("Restored Google Drive session.");
            checkDirtyStatus(); // Check and Auto-Sync on restore
        } else {
            signOut();
        }
    }
}

export async function signInToDrive(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        try {
            if (!tokenClient) throw new Error("Google Drive Service chưa khởi tạo.");
            const originalCallback = tokenClient.callback;
            tokenClient.callback = (resp: any) => {
                if (originalCallback) originalCallback(resp);
                if (resp.error !== undefined) reject(resp); else resolve(true);
            };
            tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
        } catch(e) { reject(e); }
    });
}

export function signOut() {
    accessToken = null;
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    fileIdCache.clear();
    if (gapi.client) gapi.client.setToken(null);
    updateGlobalState({ isDirty: false, isBackgroundSyncing: false, isError: false });
}

export function isAuthenticated(): boolean {
    return !!accessToken;
}

// --- HELPER FUNCTIONS ---

function hashUrl(url: string): string {
    return btoa(encodeURIComponent(url)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unhashUrl(hash: string): string {
    try {
        const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
        return decodeURIComponent(atob(base64));
    } catch (e) { return ''; }
}

function getStoryFilename(storyUrl: string): string {
    return `story_${hashUrl(storyUrl)}.json`;
}

function getChapterFilename(storyUrl: string, chapterUrl: string): string {
    return `chap_${hashUrl(storyUrl)}_${hashUrl(chapterUrl)}.json`;
}

// --- API CALLS ---

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> {
    try {
        const response = await fetch(url, options);
        if (response.ok || (response.status < 500 && response.status !== 429)) return response;
        throw new Error(`Request failed with status ${response.status}`);
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 2);
        } else throw error;
    }
}

async function findFileId(filename: string): Promise<string | null> {
    if (!accessToken) return null;
    if (fileIdCache.has(filename)) return fileIdCache.get(filename)!;

    try {
        const response = await gapi.client.drive.files.list({
            q: `name = '${filename}' and 'appDataFolder' in parents and trashed = false`,
            fields: 'files(id, createdTime)',
            spaces: 'appDataFolder'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            if (files.length > 1) {
                files.sort((a: any, b: any) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
                for (let i = 1; i < files.length; i++) deleteFileById(files[i].id).catch(console.error);
            }
            const validId = files[0].id;
            fileIdCache.set(filename, validId);
            return validId;
        }
        return null;
    } catch (e: any) {
        if (e?.status === 401) signOut();
        return null;
    }
}

// Core Upload Function (Internal)
async function performUpload(filename: string, content: any): Promise<void> {
    if (!accessToken) return; // Silent fail if not logged in (will be marked dirty locally)

    let fileId = await findFileId(filename);
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';
    const metadata: any = { name: filename, mimeType: 'application/json' };

    if (fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
    } else {
        metadata.parents = ['appDataFolder'];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const body = delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(content) +
        close_delim;

    const response = await fetchWithRetry(url, {
        method: method,
        headers: new Headers({ 
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        }),
        body: body
    });

    if (!response.ok) {
        if (response.status === 404 && method === 'PATCH') {
            fileIdCache.delete(filename);
            return performUpload(filename, content);
        }
        if (response.status === 401) signOut();
        throw new Error(`Upload failed (${response.status})`);
    }

    const result = await response.json();
    if (result.id) fileIdCache.set(filename, result.id);
}

// Queue Wrapper for Upload
async function queueUpload(filename: string, content: any): Promise<void> {
    if (!accessToken) return; // Nếu chưa đăng nhập thì không queue
    enqueueSyncTask(async () => {
        await performUpload(filename, content);
    });
}

// Internal Delete
async function deleteFileById(fileId: string): Promise<void> {
    if (!accessToken) return;
    try { await gapi.client.drive.files.delete({ fileId: fileId }); } catch (e) {}
}

async function performDelete(filename: string): Promise<void> {
    if (!accessToken) return;
    const id = await findFileId(filename);
    if (id) {
        await deleteFileById(id);
        fileIdCache.delete(filename);
    }
}

async function queueDelete(filename: string): Promise<void> {
    if (!accessToken) return;
    enqueueSyncTask(async () => {
        await performDelete(filename);
    });
}

// Download function
async function downloadFile<T>(filename: string): Promise<T | null> {
    if (!accessToken) return null;
    const fileId = await findFileId(filename);
    if (!fileId) return null;

    try {
        const response = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        if (!response.ok) {
            if (response.status === 404) { fileIdCache.delete(filename); return null; }
            if (response.status === 401) signOut();
            return null;
        }
        return await response.json();
    } catch (e) { return null; }
}

// --- PUBLIC API WITH AUTO-SYNC ---

// 1. LIBRARY INDEX
export async function fetchLibraryIndexFromDrive(): Promise<Story[]> {
    const data = await downloadFile<{ stories: Story[] }>(INDEX_FILENAME);
    return data?.stories || [];
}

export async function saveLibraryIndexToDrive(stories: Story[]): Promise<void> {
    const minimalStories = stories.map(s => ({
        title: s.title, author: s.author, imageUrl: s.imageUrl,
        source: s.source, url: s.url, createdAt: s.createdAt,
    }));
    await queueUpload(INDEX_FILENAME, { stories: minimalStories });
}

// 2. STORY DETAILS
export async function fetchStoryDetailsFromDrive(storyUrl: string): Promise<Story | null> {
    const filename = getStoryFilename(storyUrl);
    return await downloadFile<Story>(filename);
}

// Auto-Sync: Gọi hàm này khi sửa Story Metadata
export async function saveStoryDetailsToDrive(story: Story): Promise<void> {
    const filename = getStoryFilename(story.url);
    await queueUpload(filename, story);
}

// Auto-Sync: Gọi hàm này khi xóa Story
// FIX: Phải cập nhật lại library_index.json ngay lập tức để tránh zombie
// FIX 2: Cố gắng xóa tất cả các chương liên quan để làm sạch Drive
export async function deleteStoryFromDrive(story: Story): Promise<void> {
    if (!accessToken) return;
    
    // Đưa vào queue để đảm bảo tuần tự
    enqueueSyncTask(async () => {
        const storyHash = hashUrl(story.url);

        // 1. Xóa file truyện metadata
        const filename = getStoryFilename(story.url);
        await performDelete(filename);
        
        // 2. [NEW] Xóa tất cả các chương liên quan (chap_HASH_*)
        // Tìm tất cả file có tên chứa 'chap_' + storyHash
        try {
            let pageToken = null;
            do {
                const response: any = await gapi.client.drive.files.list({
                    q: `name contains 'chap_${storyHash}_' and 'appDataFolder' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id)',
                    spaces: 'appDataFolder',
                    pageToken: pageToken
                });
                const files = response.result.files;
                if (files && files.length > 0) {
                    // Try to delete in batch if possible, or loop
                    // Using Promise.all for parallelism
                    await Promise.all(files.map((f: any) => deleteFileById(f.id)));
                }
                pageToken = response.result.nextPageToken;
            } while (pageToken);
        } catch (e) {
            console.warn("Error cleaning up chapters from Drive (non-critical):", e);
        }
        
        // 3. Tải Index hiện tại từ Drive
        const remoteData = await downloadFile<{ stories: Story[] }>(INDEX_FILENAME);
        let remoteStories = remoteData?.stories || [];
        
        // 4. Lọc bỏ truyện vừa xóa
        const newRemoteStories = remoteStories.filter(s => s.url !== story.url);
        
        // 5. Upload Index mới lên ngay
        const minimalStories = newRemoteStories.map(s => ({
            title: s.title, author: s.author, imageUrl: s.imageUrl,
            source: s.source, url: s.url, createdAt: s.createdAt,
        }));
        
        await performUpload(INDEX_FILENAME, { stories: minimalStories });
    });
}

// 3. CHAPTER CONTENT
export async function fetchChapterContentFromDrive(storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    return await downloadFile<CachedChapter>(filename);
}

// Auto-Sync: Gọi hàm này khi cào chương hoặc sửa nội dung/stats
export async function saveChapterContentToDrive(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    await queueUpload(filename, data);
}

// Auto-Sync: Gọi khi xóa chương
export async function deleteChapterFromDrive(storyUrl: string, chapterUrl: string): Promise<void> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    await queueDelete(filename);
}

// 4. READING HISTORY
// Auto-Sync: Gọi khi đọc chương mới (Merge/Update)
export async function saveReadingHistoryToDrive(history: ReadingHistoryItem[]): Promise<void> {
    await queueUpload(HISTORY_FILENAME, { history });
    markHistorySynced(); // Mark synced immediately in memory
}

// Auto-Sync: Gọi khi xóa một mục khỏi lịch sử (Explicit Delete)
export async function removeHistoryItemFromDrive(itemUrl: string): Promise<void> {
    if (!accessToken) return;
    
    enqueueSyncTask(async () => {
        // 1. Tải History hiện tại từ Drive
        const remoteData = await downloadFile<{ history: ReadingHistoryItem[] }>(HISTORY_FILENAME);
        let remoteHistory = remoteData?.history || [];
        
        // 2. Lọc bỏ item
        const newHistory = remoteHistory.filter(h => h.url !== itemUrl);
        
        // 3. Upload lại (Ghi đè)
        await performUpload(HISTORY_FILENAME, { history: newHistory });
        
        markHistorySynced();
    });
}

// --- SYNC ACTIONS (Called by UI Modal - MANUAL FULL SYNC) ---

export async function syncReadingProgress(): Promise<void> {
    if (!accessToken) return;
    
    // Always pull merge first
    const remoteData = await downloadFile<{ history: ReadingHistoryItem[] }>(HISTORY_FILENAME);
    const localHistory = getReadingHistory();
    const remoteHistory = remoteData?.history || [];
    
    const mergedMap = new Map<string, ReadingHistoryItem>();
    const mergeItem = (item: ReadingHistoryItem) => {
        const existing = mergedMap.get(item.url);
        if (!existing || item.lastReadTimestamp > existing.lastReadTimestamp) {
            mergedMap.set(item.url, item);
        }
    };
    
    localHistory.forEach(mergeItem);
    remoteHistory.forEach(mergeItem);
    
    const mergedHistory = Array.from(mergedMap.values()).sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
    saveReadingHistory(mergedHistory);
    
    // Push back merged
    await saveReadingHistoryToDrive(mergedHistory);
}

export async function syncLibraryIndex(): Promise<Story[]> {
    if (!accessToken) return [];
    const driveStories = await fetchLibraryIndexFromDrive();
    const localStories = await dbService.getAllStories();
    
    const mergedMap = new Map<string, Story>();
    localStories.forEach(s => mergedMap.set(s.url, s));
    
    for (const dStory of driveStories) {
        if (!mergedMap.has(dStory.url)) {
            const cleanStory = { ...dStory, _dirty: false, _syncedAt: Date.now() };
            await dbService.saveStory(cleanStory, false); 
            mergedMap.set(dStory.url, cleanStory);
        }
    }
    await saveLibraryIndexToDrive(Array.from(mergedMap.values()));
    return Array.from(mergedMap.values());
}

export async function uploadAllLocalData(finalize: boolean = true): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");
    updateGlobalState({ status: "Đang kiểm tra thay đổi trên máy...", isSyncing: true, isError: false, lastError: null });

    try {
        await syncReadingProgress();

        const dirtyStories = await dbService.getDirtyStories();
        if (dirtyStories.length > 0) {
            updateGlobalState({ status: `Đang tải lên ${dirtyStories.length} truyện thay đổi...` });
            for (const story of dirtyStories) {
                const { _dirty, ...cleanStoryData } = story;
                await saveStoryDetailsToDrive(cleanStoryData as Story);
                await dbService.markStorySynced(story);
            }
            const allStories = await dbService.getAllStories();
            await saveLibraryIndexToDrive(allStories);
        }

        const dirtyChapters = await dbService.getAllDirtyChapters();
        if (dirtyChapters.length > 0) {
            const BATCH_SIZE = 5;
            for (let j = 0; j < dirtyChapters.length; j += BATCH_SIZE) {
                const batch = dirtyChapters.slice(j, j + BATCH_SIZE);
                const progressPercent = Math.round((j / dirtyChapters.length) * 100);
                updateGlobalState({ status: `Đang tải lên chương: ${progressPercent}% (${j}/${dirtyChapters.length})...` });
                
                await Promise.all(batch.map(async (chap) => {
                    const { _dirty, ...cleanChapData } = chap;
                    await saveChapterContentToDrive(chap.storyUrl, chap.chapterUrl, cleanChapData);
                    await dbService.markChapterSynced(chap.storyUrl, chap.chapterUrl, cleanChapData);
                }));
            }
        }
        
        if (finalize) {
            updateGlobalState({ status: "Đồng bộ hoàn tất!", isSyncing: false, isDirty: false, isError: false });
        }
    } catch (e: any) {
        // Ensure spinner stops even on error
        updateGlobalState({ status: `Lỗi sao lưu: ${e.message}`, isSyncing: false, isError: true, lastError: e.message });
        throw e;
    }
}

export async function pullMissingDataFromDrive(finalize: boolean = true): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");
    updateGlobalState({ status: "Đang quét dữ liệu trên Drive...", isSyncing: true, isError: false, lastError: null });
    
    try {
        // 1. Tải Index trước để làm nguồn tin cậy
        const remoteIndex = await fetchLibraryIndexFromDrive();
        const validStoryUrls = new Set(remoteIndex.map(s => s.url));

        let pageToken = null;
        const driveFilesMap = new Map<string, { id: string, modifiedTime: string }>();
        do {
            const response: any = await gapi.client.drive.files.list({
                q: `'appDataFolder' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, modifiedTime)',
                spaces: 'appDataFolder',
                pageToken: pageToken
            });
            const files = response.result.files;
            if (files) files.forEach((f: any) => { if (f.name) driveFilesMap.set(f.name, { id: f.id, modifiedTime: f.modifiedTime }); });
            pageToken = response.result.nextPageToken;
        } while (pageToken);

        const driveStoryFilenames = Array.from(driveFilesMap.keys()).filter(k => k.startsWith('story_') && k.endsWith('.json'));
        for (const filename of driveStoryFilenames) {
            const hash = filename.replace('story_', '').replace('.json', '');
            const storyUrl = unhashUrl(hash);
            if (!storyUrl) continue;
            
            // SKIP ORPHANED FILES (Files not in Index)
            if (!validStoryUrls.has(storyUrl)) continue;

            const driveFile = driveFilesMap.get(filename);
            const localStory = await dbService.getStory(storyUrl);
            
            let shouldDownload = false;
            if (!localStory) shouldDownload = true;
            else if (!localStory._dirty && driveFile?.modifiedTime) {
                const driveTime = new Date(driveFile.modifiedTime).getTime();
                if (driveTime > (localStory._syncedAt || 0) + 5000) shouldDownload = true;
            }

            if (shouldDownload) {
                updateGlobalState({ status: `Đang tải truyện mới: ${filename}...` });
                const storyData = await downloadFile<Story>(filename);
                if (storyData) await dbService.saveStory({ ...storyData, _dirty: false, _syncedAt: Date.now() }, false);
            }
        }

        const driveChapterFilenames = Array.from(driveFilesMap.keys()).filter(k => k.startsWith('chap_') && k.endsWith('.json'));
        const missingOrOutdatedChapters: string[] = [];

        for (const filename of driveChapterFilenames) {
            const parts = filename.replace('.json', '').split('_');
            if (parts.length !== 3) continue;
            const storyUrl = unhashUrl(parts[1]);
            const chapterUrl = unhashUrl(parts[2]);
            if (!storyUrl || !chapterUrl) continue;
            
            // SKIP CHAPTERS OF DELETED STORIES
            if (!validStoryUrls.has(storyUrl)) continue;

            const driveFile = driveFilesMap.get(filename);
            const localChapter = await dbService.getChapterData(storyUrl, chapterUrl);

            let shouldDownload = false;
            if (!localChapter) shouldDownload = true;
            else if (!localChapter._dirty && driveFile?.modifiedTime) {
                const driveTime = new Date(driveFile.modifiedTime).getTime();
                if (driveTime > (localChapter._syncedAt || 0) + 5000) shouldDownload = true;
            }

            if (shouldDownload) missingOrOutdatedChapters.push(filename);
        }

        if (missingOrOutdatedChapters.length > 0) {
            updateGlobalState({ status: `Tìm thấy ${missingOrOutdatedChapters.length} chương mới. Đang tải...` });
            const BATCH_SIZE = 5;
            for (let i = 0; i < missingOrOutdatedChapters.length; i += BATCH_SIZE) {
                const batch = missingOrOutdatedChapters.slice(i, i + BATCH_SIZE);
                const percent = Math.round(((i + batch.length) / missingOrOutdatedChapters.length) * 100);
                updateGlobalState({ status: `Đang tải dữ liệu: ${percent}% (${i + batch.length}/${missingOrOutdatedChapters.length})` });

                await Promise.all(batch.map(async (filename) => {
                    const data = await downloadFile<CachedChapter>(filename);
                    if (data) {
                        const parts = filename.replace('.json', '').split('_');
                        const storyUrl = unhashUrl(parts[1]);
                        const chapterUrl = unhashUrl(parts[2]);
                        if(storyUrl && chapterUrl) await dbService.saveChapterData(storyUrl, chapterUrl, { ...data, _dirty: false, _syncedAt: Date.now() }, false);
                    }
                }));
            }
        }

        await syncLibraryIndex();
        if (finalize) updateGlobalState({ status: "Đã hoàn tất tải dữ liệu mới!", isSyncing: false });

    } catch (e: any) {
        // Ensure spinner stops even on error
        updateGlobalState({ status: `Lỗi tải dữ liệu: ${e.message}`, isSyncing: false, isError: true, lastError: e.message });
        throw e;
    }
}

export async function syncData(): Promise<void> {
    if (globalState.isSyncing) return;
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    try {
        updateGlobalState({ status: "Bắt đầu đồng bộ: Bước 1/2 - Tải về...", isSyncing: true, isError: false, lastError: null });
        await pullMissingDataFromDrive(false);
        updateGlobalState({ status: "Bắt đầu đồng bộ: Bước 2/2 - Tải lên..." });
        await uploadAllLocalData(false);
        updateGlobalState({ status: "Đồng bộ hoàn tất!", isSyncing: false, isDirty: false, isError: false });
        
        setTimeout(() => {
             const event = new Event('visibilitychange');
             document.dispatchEvent(event);
        }, 500);
    } catch (e: any) {
        updateGlobalState({ status: `Lỗi đồng bộ: ${e.message}`, isSyncing: false, isError: true, lastError: e.message });
        throw e;
    }
}
