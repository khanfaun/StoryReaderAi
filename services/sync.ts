
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

// CONFIG CHUNKING
const CHUNK_SIZE = 50; // Mỗi file chứa 50 chương

const STORAGE_KEY_TOKEN = 'gdrive_access_token';
const STORAGE_KEY_EXPIRY = 'gdrive_token_expiry';
const STORAGE_KEY_DEVICE_ID = 'gdrive_sync_device_id'; 

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

const fileIdCache = new Map<string, string>();

let hasCheckedDeletionsSession = false;

const getDeviceId = (): string => {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) {
        deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
};

// --- GLOBAL SYNC STATE ---
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

// --- SYNC QUEUE SYSTEM ---
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
    
    updateGlobalState({ isBackgroundSyncing: true, isError: false, lastError: null });
    isQueueProcessing = true;

    try {
        while (syncQueue.length > 0) {
            const task = syncQueue.shift();
            if (task) {
                try {
                    await task();
                } catch (e: any) {
                    console.error("Background sync task failed:", e);
                }
                await new Promise(resolve => setTimeout(resolve, 500)); 
            }
        }
    } catch (err: any) {
        console.error("Critical Queue Error:", err);
        updateGlobalState({ isError: true, lastError: err.message || 'Lỗi hàng đợi' });
    } finally {
        isQueueProcessing = false;
        await checkDirtyStatus(false);
        updateGlobalState({ 
            isBackgroundSyncing: false, 
            status: '' 
        });
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
            if (!globalState.isError && !globalState.isBackgroundSyncing && !isQueueProcessing) {
                console.log("Auto-sync triggered due to dirty items...");
                enqueueSyncTask(uploadAllLocalData);
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
                        updateGlobalState({ isDirty: false, isError: false });
                        hasCheckedDeletionsSession = false;
                        checkDirtyStatus(); 
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
            checkDirtyStatus();
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
    hasCheckedDeletionsSession = false;
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

// LEGACY: Old Single Chapter Filename
function getChapterFilename(storyUrl: string, chapterUrl: string): string {
    return `chap_${hashUrl(storyUrl)}_${hashUrl(chapterUrl)}.json`;
}

// NEW: Pack Filename
function getPackFilename(storyUrl: string, chunkId: number): string {
    return `pack_${hashUrl(storyUrl)}_${chunkId}.json`;
}

// Helper to determine chunk index
function getChunkIndex(chapterIndex: number): number {
    return Math.floor(chapterIndex / CHUNK_SIZE);
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
    deviceId: string;
}

interface DeletionLog {
    deletedItems: DeletionLogItem[];
}

async function appendToRemoteDeletionLog(item: Omit<DeletionLogItem, 'deviceId'>): Promise<void> {
    if (!accessToken) return;
    try {
        const currentLog = await downloadFile<DeletionLog>(DELETION_LOG_FILENAME) || { deletedItems: [] };
        const newItem: DeletionLogItem = { ...item, deviceId: getDeviceId() };
        
        const exists = currentLog.deletedItems.some(i => i.id === newItem.id && i.type === newItem.type);
        if (!exists) {
            currentLog.deletedItems.push(newItem);
            if (currentLog.deletedItems.length > 100) {
                currentLog.deletedItems = currentLog.deletedItems.slice(-100);
            }
            await performUpload(DELETION_LOG_FILENAME, currentLog);
        }
    } catch (e) {
        console.warn("Failed to update remote deletion log", e);
    }
}

async function processRemoteDeletions(): Promise<void> {
    if (!accessToken) return;
    if (hasCheckedDeletionsSession) return;
    
    updateGlobalState({ status: "Đang kiểm tra dữ liệu đã xoá..." });
    const currentDeviceId = getDeviceId();
    
    try {
        const log = await downloadFile<DeletionLog>(DELETION_LOG_FILENAME);
        if (log && log.deletedItems && log.deletedItems.length > 0) {
            for (const item of log.deletedItems) {
                if (item.deviceId === currentDeviceId) continue;

                if (item.type === 'story') {
                    const exists = await dbService.getStory(item.id);
                    if (exists) {
                        await dbService.deleteEbookAndStory(item.id);
                    }
                } else if (item.type === 'history') {
                    let history = getReadingHistory();
                    const initialLen = history.length;
                    history = history.filter(h => h.url !== item.id);
                    if (history.length !== initialLen) {
                        saveReadingHistory(history);
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Error processing remote deletions:", e);
    } finally {
        hasCheckedDeletionsSession = true;
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

export async function saveStoryDetailsToDrive(story: Story): Promise<void> {
    const filename = getStoryFilename(story.url);
    await queueUpload(filename, story);
}

export async function deleteStoryFromDrive(story: Story): Promise<void> {
    if (!accessToken) return;
    
    enqueueSyncTask(async () => {
        await appendToRemoteDeletionLog({
            type: 'story',
            id: story.url,
            timestamp: Date.now()
        });

        const storyHash = hashUrl(story.url);
        const filename = getStoryFilename(story.url);
        await performDelete(filename);
        
        // Clean up PACK files (containing multiple chapters)
        try {
            let pageToken = null;
            do {
                const response: any = await gapi.client.drive.files.list({
                    q: `name contains 'pack_${storyHash}_' and 'appDataFolder' in parents and trashed = false`,
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
        } catch (e) { console.warn("Error cleaning up packs", e); }
        
        // Cập nhật lại Index file
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

// 3. CHAPTER CONTENT (UPDATED FOR CHUNKING)

/**
 * Tải nội dung 1 chương.
 * 1. Tính toán xem chương này thuộc Pack nào.
 * 2. Tìm Pack trên Drive.
 * 3. Nếu có Pack -> Tải về, giải nén toàn bộ 50 chương vào DB, trả về chương cần tìm.
 * 4. Nếu không có Pack -> Tìm file lẻ (cơ chế cũ).
 */
export async function fetchChapterContentFromDrive(storyUrl: string, chapterUrl: string, chapterIndex?: number): Promise<CachedChapter | null> {
    // Nếu không có index, ta thử tìm trong story metadata (nếu có cache) hoặc fallback về cơ chế cũ
    if (chapterIndex !== undefined) {
        const chunkId = getChunkIndex(chapterIndex);
        const packFilename = getPackFilename(storyUrl, chunkId);
        
        // Try to fetch pack
        const packData = await downloadFile<Record<string, CachedChapter>>(packFilename);
        
        if (packData) {
            // Save ALL chapters in this pack to IndexedDB to avoid future requests
            for (const chUrl in packData) {
                await dbService.saveChapterData(storyUrl, chUrl, { 
                    ...packData[chUrl], 
                    _dirty: false, 
                    _syncedAt: Date.now() 
                }, false);
            }
            
            return packData[chapterUrl] || null;
        }
    }

    // Fallback: Legacy Single File
    const filename = getChapterFilename(storyUrl, chapterUrl);
    return await downloadFile<CachedChapter>(filename);
}

// Single chapter save (Queueing handled by uploadAllLocalData mainly)
// But for individual edits, we still want to queue a sync.
export async function saveChapterContentToDrive(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    // Thay vì upload ngay file lẻ, ta trigger uploadAllLocalData để nó gom nhóm
    // Nhưng để tránh loop, ta chỉ mark dirty trong DB (đã làm ở component), 
    // và ở đây ta check xem có đang sync không.
    
    // Tuy nhiên, để đảm bảo data an toàn ngay lập tức, ta có thể trigger global sync
    // sau một khoảng debounce.
    checkDirtyStatus();
}

export async function deleteChapterFromDrive(storyUrl: string, chapterUrl: string): Promise<void> {
    // Delete chapter is tricky with packs. We generally don't delete from packs to save bandwidth.
    // We just overwrite the pack with the chapter removed (if we re-upload).
    // For now, assume simple deletion of legacy file if exists.
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
        await appendToRemoteDeletionLog({
            type: 'history',
            id: itemUrl,
            timestamp: Date.now()
        });
        const remoteData = await downloadFile<{ history: ReadingHistoryItem[] }>(HISTORY_FILENAME);
        let remoteHistory = remoteData?.history || [];
        const newHistory = remoteHistory.filter(h => h.url !== itemUrl);
        await performUpload(HISTORY_FILENAME, { history: newHistory });
        markHistorySynced();
    });
}

// --- SYNC ACTIONS ---

export async function syncReadingProgress(): Promise<void> {
    if (!accessToken) return;
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
    await saveReadingHistoryToDrive(mergedHistory);
}

export async function syncLibraryIndex(): Promise<Story[]> {
    if (!accessToken) return [];
    await processRemoteDeletions();

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

    const finalStories = Array.from(mergedMap.values());
    await saveLibraryIndexToDrive(finalStories);
    
    return finalStories;
}

// CHỨC NĂNG QUAN TRỌNG: UPLOAD GOM NHÓM (CHUNKING)
export async function uploadAllLocalData(finalize: boolean = true): Promise<void> {
    if (!accessToken) return; // Silent return if auto-sync called without auth
    updateGlobalState({ status: "Đang kiểm tra thay đổi trên máy...", isSyncing: true, isError: false, lastError: null });

    try {
        await syncReadingProgress();

        // 1. Sync Stories Metadata
        const dirtyStories = await dbService.getDirtyStories();
        if (dirtyStories.length > 0) {
            updateGlobalState({ status: `Đang tải lên ${dirtyStories.length} truyện thay đổi...` });
            for (const story of dirtyStories) {
                const { _dirty, ...cleanStoryData } = story;
                await saveStoryDetailsToDrive(cleanStoryData as Story);
                await dbService.markStorySynced(story);
            }
            await syncLibraryIndex(); 
        }

        // 2. Sync Chapters (Packed)
        const dirtyChapters = await dbService.getAllDirtyChapters();
        if (dirtyChapters.length > 0) {
            // Group dirty chapters by Story URL
            const dirtyByStory: Record<string, typeof dirtyChapters> = {};
            dirtyChapters.forEach(ch => {
                if (!dirtyByStory[ch.storyUrl]) dirtyByStory[ch.storyUrl] = [];
                dirtyByStory[ch.storyUrl].push(ch);
            });

            const storyUrls = Object.keys(dirtyByStory);
            let processedStories = 0;

            for (const storyUrl of storyUrls) {
                const story = await dbService.getStory(storyUrl);
                if (!story || !story.chapters) continue; // Skip if metadata missing

                // Map chapters to Chunks
                const chunksToUpdate = new Set<number>();
                const dirtySet = new Set(dirtyByStory[storyUrl].map(c => c.chapterUrl));

                // Find indices for dirty chapters
                story.chapters.forEach((chap, index) => {
                    if (dirtySet.has(chap.url)) {
                        chunksToUpdate.add(getChunkIndex(index));
                    }
                });

                // Process each affected chunk
                const chunkIds = Array.from(chunksToUpdate);
                for (let i = 0; i < chunkIds.length; i++) {
                    const chunkId = chunkIds[i];
                    updateGlobalState({ status: `Đang đóng gói dữ liệu truyện ${processedStories + 1}/${storyUrls.length} (Gói ${i+1}/${chunkIds.length})...` });

                    // Define range for this chunk
                    const startIdx = chunkId * CHUNK_SIZE;
                    const endIdx = Math.min(startIdx + CHUNK_SIZE, story.chapters.length);
                    const chapterUrlsInChunk = story.chapters.slice(startIdx, endIdx).map(c => c.url);

                    // Fetch ALL existing data for this chunk from Local DB
                    // (This includes non-dirty chapters that are part of the same pack)
                    const localChunkData = await dbService.getChaptersByUrls(storyUrl, chapterUrlsInChunk);
                    
                    // Optional: Fetch existing pack from Drive to merge? 
                    // No, assuming Local DB has the latest state or a valid subset. 
                    // If we overwrite, we rely on Local being the master for *this user's edits*.
                    
                    // Create Pack Object
                    const packData: Record<string, CachedChapter> = {};
                    let hasContent = false;
                    for (const url of chapterUrlsInChunk) {
                        if (localChunkData[url]) {
                            const { _dirty, _syncedAt, ...cleanData } = localChunkData[url] as any;
                            packData[url] = cleanData;
                            hasContent = true;
                        }
                    }

                    if (hasContent) {
                        const packFilename = getPackFilename(storyUrl, chunkId);
                        await performUpload(packFilename, packData);
                        
                        // Mark included dirty chapters as synced
                        for (const url of chapterUrlsInChunk) {
                            if (localChunkData[url] && (localChunkData[url] as any)._dirty) {
                                await dbService.markChapterSynced(storyUrl, url, localChunkData[url]);
                            }
                        }
                    }
                }
                processedStories++;
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
        await processRemoteDeletions();
        const remoteIndex = await syncLibraryIndex();
        const validStoryUrls = new Set(remoteIndex.map(s => s.url));

        // 1. List all files
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

        // 2. Process Stories
        const driveStoryFilenames = Array.from(driveFilesMap.keys()).filter(k => k.startsWith('story_') && k.endsWith('.json'));
        for (const filename of driveStoryFilenames) {
            const hash = filename.replace('story_', '').replace('.json', '');
            const storyUrl = unhashUrl(hash);
            if (!storyUrl || !validStoryUrls.has(storyUrl)) continue;

            const driveFile = driveFilesMap.get(filename);
            const localStory = await dbService.getStory(storyUrl);
            
            if (!localStory || (!localStory._dirty && driveFile?.modifiedTime && new Date(driveFile.modifiedTime).getTime() > (localStory._syncedAt || 0) + 5000)) {
                updateGlobalState({ status: `Đang tải truyện mới: ${filename}...` });
                const storyData = await downloadFile<Story>(filename);
                if (storyData) await dbService.saveStory({ ...storyData, _dirty: false, _syncedAt: Date.now() }, false);
            }
        }

        // 3. Process PACKS (New System)
        const drivePackFilenames = Array.from(driveFilesMap.keys()).filter(k => k.startsWith('pack_') && k.endsWith('.json'));
        
        if (drivePackFilenames.length > 0) {
            updateGlobalState({ status: `Tìm thấy ${drivePackFilenames.length} gói dữ liệu. Đang đồng bộ...` });
            
            // Simple logic: If we don't track pack sync time, we might re-download. 
            // Optimization: We could track pack sync time, but for now let's rely on checking if any chapter inside is missing/outdated?
            // Actually, simplest is to download packs that are "newer" than the story's sync time? No.
            // Let's just download packs for now as a "Restore" mechanism. 
            // Improving "Stale Check" is complex without a Pack Metadata table.
            
            // For this implementation, we will download packs ONLY if we are in a "Restore" scenario 
            // OR if the user explicitly requested Full Sync.
            // To avoid redownloading everything every time, we check local DB coverage.
            
            for (let i = 0; i < drivePackFilenames.length; i++) {
                const filename = drivePackFilenames[i];
                const parts = filename.replace('.json', '').split('_');
                // pack_HASH_CHUNKID
                if (parts.length !== 3) continue;
                
                const storyUrl = unhashUrl(parts[1]);
                if (!validStoryUrls.has(storyUrl)) continue;

                // Download Pack
                const packData = await downloadFile<Record<string, CachedChapter>>(filename);
                if (packData) {
                    for (const chUrl in packData) {
                        // Check if we need to update this chapter
                        const localChap = await dbService.getChapterData(storyUrl, chUrl);
                        if (!localChap || (!localChap._dirty)) {
                             // Save to DB
                             await dbService.saveChapterData(storyUrl, chUrl, { 
                                 ...packData[chUrl], 
                                 _dirty: false, 
                                 _syncedAt: Date.now() 
                             }, false);
                        }
                    }
                }
                updateGlobalState({ status: `Đang tải dữ liệu: ${Math.round((i+1)/drivePackFilenames.length*100)}%` });
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
    } finally {
        updateGlobalState({ isSyncing: false });
    }
}
