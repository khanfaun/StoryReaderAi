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
const DELETION_LOG_FILENAME = 'deletion_log.json'; // CHECKLIST XOÁ

const STORAGE_KEY_TOKEN = 'gdrive_access_token';
const STORAGE_KEY_EXPIRY = 'gdrive_token_expiry';
const STORAGE_KEY_DEVICE_ID = 'gdrive_sync_device_id'; // Key lưu ID thiết bị

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

const fileIdCache = new Map<string, string>();

// --- DEVICE ID MANAGEMENT ---
// Tạo hoặc lấy ID duy nhất cho trình duyệt này để tránh tự xoá dữ liệu vừa xoá
const getDeviceId = (): string => {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) {
        deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
};

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
type SyncTask = () => Promise<void>;
const syncQueue: SyncTask[] = [];
let isQueueProcessing = false;

export const hasPendingWork = (): boolean => {
    return syncQueue.length > 0 || isQueueProcessing || globalState.isSyncing;
};

const enqueueSyncTask = (task: SyncTask) => {
    syncQueue.push(task);
    processSyncQueue();
};

const processSyncQueue = async () => {
    if (isQueueProcessing) return;
    
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
                    updateGlobalState({ isError: true, lastError: e.message || 'Lỗi đồng bộ' });
                }
                await new Promise(resolve => setTimeout(resolve, 500)); 
            }
        }
    } catch (err: any) {
        console.error("Critical Queue Error:", err);
        updateGlobalState({ isError: true, lastError: err.message || 'Lỗi hàng đợi' });
    } finally {
        isQueueProcessing = false;
        await checkDirtyStatus(true); 
    }
};

const uploadDirtyDataToDrive = async () => {
    if (!accessToken) return;
    
    try {
        if (isHistoryDirty()) {
            const history = getReadingHistory();
            await saveReadingHistoryToDrive(history);
        }

        const dirtyStories = await dbService.getDirtyStories();
        if (dirtyStories.length > 0) {
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
            for (const chap of dirtyChapters) {
                const { _dirty, ...cleanChapData } = chap;
                await saveChapterContentToDrive(chap.storyUrl, chap.chapterUrl, cleanChapData);
                await dbService.markChapterSynced(chap.storyUrl, chap.chapterUrl, cleanChapData);
            }
        }
    } catch (e) {
        console.error("Auto-sync failed", e);
        throw e;
    }
};

const checkDirtyStatus = async (updateUI: boolean = false) => {
    if (!accessToken) {
        if(updateUI) updateGlobalState({ isBackgroundSyncing: false });
        return;
    }
    
    try {
        const dirtyStories = await dbService.getDirtyStories();
        const isHistoryUnsynced = isHistoryDirty();
        const dirtyChapters = await dbService.getAllDirtyChapters(); 
        
        const hasDirty = dirtyStories.length > 0 || isHistoryUnsynced || dirtyChapters.length > 0;
        
        if (hasDirty) {
            updateGlobalState({ isDirty: true });
            
            if (!globalState.isError && !globalState.isBackgroundSyncing) {
                console.log("Auto-sync triggered due to dirty items...");
                enqueueSyncTask(uploadDirtyDataToDrive);
            }
        } else {
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

async function performUpload(filename: string, content: any): Promise<void> {
    if (!accessToken) return;

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

async function queueUpload(filename: string, content: any): Promise<void> {
    if (!accessToken) return;
    enqueueSyncTask(async () => {
        await performUpload(filename, content);
    });
}

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

// --- DELETION LOG SYSTEM (CHECKLIST XOÁ) ---

interface DeletionLogItem {
    type: 'story' | 'history' | 'chapter';
    id: string; // URL hoặc ID
    timestamp: number;
    deviceId: string; // ID thiết bị thực hiện xoá
}

interface DeletionLog {
    deletedItems: DeletionLogItem[];
}

// Hàm append vào checklist xoá trên Drive
async function appendToRemoteDeletionLog(item: Omit<DeletionLogItem, 'deviceId'>): Promise<void> {
    if (!accessToken) return;
    
    try {
        // 1. Tải log hiện tại (nếu có)
        const currentLog = await downloadFile<DeletionLog>(DELETION_LOG_FILENAME) || { deletedItems: [] };
        
        // 2. Thêm item mới kèm Device ID
        const newItem: DeletionLogItem = { ...item, deviceId: getDeviceId() };
        
        // Tránh trùng lặp (nếu cùng ID và type)
        const exists = currentLog.deletedItems.some(i => i.id === newItem.id && i.type === newItem.type);
        if (!exists) {
            currentLog.deletedItems.push(newItem);
            
            // Giới hạn log size (giữ lại 100 mục gần nhất) để tránh file quá lớn
            if (currentLog.deletedItems.length > 100) {
                currentLog.deletedItems = currentLog.deletedItems.slice(-100);
            }
            
            // 3. Upload lại
            await performUpload(DELETION_LOG_FILENAME, currentLog);
            console.log(`[Deletion Log] Added ${item.type}: ${item.id} from device ${newItem.deviceId}`);
        }
    } catch (e) {
        console.warn("Failed to update remote deletion log", e);
    }
}

// Hàm xử lý checklist xoá: Tải log về và xoá dữ liệu local tương ứng
async function processRemoteDeletions(): Promise<void> {
    if (!accessToken) return;
    
    updateGlobalState({ status: "Đang kiểm tra dữ liệu đã xoá..." });
    const currentDeviceId = getDeviceId();
    
    try {
        const log = await downloadFile<DeletionLog>(DELETION_LOG_FILENAME);
        if (!log || !log.deletedItems || log.deletedItems.length === 0) return;
        
        console.log(`[Deletion Log] Found ${log.deletedItems.length} items to check.`);
        
        for (const item of log.deletedItems) {
            // QUAN TRỌNG: Bỏ qua nếu lệnh xóa đến từ chính thiết bị này
            // Điều này ngăn chặn vòng lặp vô tận hoặc việc cố gắng xóa dữ liệu vừa bị xóa
            if (item.deviceId === currentDeviceId) {
                continue;
            }

            if (item.type === 'story') {
                // Kiểm tra xem local có truyện này không
                const exists = await dbService.getStory(item.id);
                if (exists) {
                    console.log(`[Sync Pruning] Deleting story from checklist: ${exists.title}`);
                    await dbService.deleteEbookAndStory(item.id);
                }
            } else if (item.type === 'history') {
                // Xoá khỏi lịch sử đọc local
                let history = getReadingHistory();
                const initialLen = history.length;
                history = history.filter(h => h.url !== item.id);
                if (history.length !== initialLen) {
                    saveReadingHistory(history);
                    console.log(`[Sync Pruning] Removed history item: ${item.id}`);
                }
            }
        }
    } catch (e) {
        console.warn("Error processing remote deletions:", e);
    }
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
export async function deleteStoryFromDrive(story: Story): Promise<void> {
    if (!accessToken) return;
    
    // Đưa vào queue để đảm bảo tuần tự
    enqueueSyncTask(async () => {
        // 1. Ghi vào Checklist Xoá (Deletion Log) TRƯỚC TIÊN
        await appendToRemoteDeletionLog({
            type: 'story',
            id: story.url,
            timestamp: Date.now()
        });

        const storyHash = hashUrl(story.url);

        // 2. Xóa file truyện metadata
        const filename = getStoryFilename(story.url);
        await performDelete(filename);
        
        // 3. Xóa tất cả các chương liên quan (chap_HASH_*)
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
                    await Promise.all(files.map((f: any) => deleteFileById(f.id)));
                }
                pageToken = response.result.nextPageToken;
            } while (pageToken);
        } catch (e) {
            console.warn("Error cleaning up chapters from Drive (non-critical):", e);
        }
        
        // 4. Cập nhật lại Index file
        const remoteData = await downloadFile<{ stories: Story[] }>(INDEX_FILENAME);
        let remoteStories = remoteData?.stories || [];
        const newRemoteStories = remoteStories.filter(s => s.url !== story.url);
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

export async function saveChapterContentToDrive(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    await queueUpload(filename, data);
}

export async function deleteChapterFromDrive(storyUrl: string, chapterUrl: string): Promise<void> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    await queueDelete(filename);
}

// 4. READING HISTORY
export async function saveReadingHistoryToDrive(history: ReadingHistoryItem[]): Promise<void> {
    await queueUpload(HISTORY_FILENAME, { history });
    markHistorySynced(); 
}

export async function removeHistoryItemFromDrive(itemUrl: string): Promise<void> {
    if (!accessToken) return;
    
    enqueueSyncTask(async () => {
        // Ghi vào Checklist Xoá
        await appendToRemoteDeletionLog({
            type: 'history',
            id: itemUrl,
            timestamp: Date.now()
        });

        // Cập nhật file history
        const remoteData = await downloadFile<{ history: ReadingHistoryItem[] }>(HISTORY_FILENAME);
        let remoteHistory = remoteData?.history || [];
        const newHistory = remoteHistory.filter(h => h.url !== itemUrl);
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

// Hàm đồng bộ chính cho danh sách truyện (Xử lý 2 chiều: Thêm và Xóa)
export async function syncLibraryIndex(): Promise<Story[]> {
    if (!accessToken) return [];
    
    // BƯỚC 1: QUÉT CHECKLIST XOÁ TRƯỚC (Deletions First)
    // Để đảm bảo những gì đã bị xoá ở thiết bị khác sẽ biến mất khỏi thiết bị này
    await processRemoteDeletions();

    // BƯỚC 2: Tải danh sách truyện còn lại từ Drive
    const driveStories = await fetchLibraryIndexFromDrive();
    
    const localStories = await dbService.getAllStories();
    const mergedMap = new Map<string, Story>();
    
    localStories.forEach(s => mergedMap.set(s.url, s));
    
    // BƯỚC 3: Tải về (Download)
    for (const dStory of driveStories) {
        if (!mergedMap.has(dStory.url)) {
            const cleanStory = { ...dStory, _dirty: false, _syncedAt: Date.now() };
            await dbService.saveStory(cleanStory, false); 
            mergedMap.set(dStory.url, cleanStory);
        }
    }

    // BƯỚC 4: Upload các truyện mới từ Local lên Drive
    const driveStoryUrls = new Set(driveStories.map(s => s.url));
    
    for (const lStory of localStories) {
        // Nếu truyện ở Local là Dirty (mới thêm) hoặc chưa có trên Drive -> Upload
        if (lStory._dirty || !driveStoryUrls.has(lStory.url)) {
             // Chỉ upload nếu nó không vừa bị xoá (double check)
             // Nhưng ở đây ta giả định processRemoteDeletions đã xoá nó rồi nếu cần.
             // Nếu nó vẫn còn đây thì là truyện mới.
        }
    }

    // Cập nhật lại Drive Index để bao gồm các truyện mới từ thiết bị này
    const finalStories = Array.from(mergedMap.values());
    await saveLibraryIndexToDrive(finalStories);
    
    return finalStories;
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
            // Trigger sync index to refresh list
            await syncLibraryIndex(); 
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
        updateGlobalState({ status: `Lỗi sao lưu: ${e.message}`, isSyncing: false, isError: true, lastError: e.message });
        throw e;
    }
}

export async function pullMissingDataFromDrive(finalize: boolean = true): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");
    updateGlobalState({ status: "Đang quét dữ liệu trên Drive...", isSyncing: true, isError: false, lastError: null });
    
    try {
        // QUAN TRỌNG: Quét checklist xoá trước khi tải bất cứ thứ gì
        await processRemoteDeletions();

        // Sau đó mới đồng bộ Index
        const remoteIndex = await syncLibraryIndex();
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

        if (finalize) updateGlobalState({ status: "Đã hoàn tất tải dữ liệu mới!", isSyncing: false });

    } catch (e: any) {
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