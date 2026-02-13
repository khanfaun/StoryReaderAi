
import { Story, CachedChapter, ReadingHistoryItem } from '../types';
import * as dbService from './dbService';
import { getReadingHistory, saveReadingHistory, isHistoryDirty, markHistorySynced } from './history';

declare var gapi: any;
declare var google: any;

const CLIENT_ID = '668650540476-6dkreulqvl7sffc6sv373t2pplob9hmt.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
// Sử dụng drive.appdata để lưu file ẩn
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'; 

// Tên file danh mục chính
const INDEX_FILENAME = 'library_index.json';
const HISTORY_FILENAME = 'reading_history.json';

// Keys cho localStorage
const STORAGE_KEY_TOKEN = 'gdrive_access_token';
const STORAGE_KEY_EXPIRY = 'gdrive_token_expiry';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

// --- CACHING SYSTEM ---
// Lưu trữ map Filename -> FileID để giảm request search và tránh độ trễ consistency
const fileIdCache = new Map<string, string>();

// --- GLOBAL PROCESS STATE MANAGEMENT (OBSERVER PATTERN) ---
// Biến toàn cục lưu trạng thái hiện tại của tiến trình đồng bộ
let globalSyncStatus: string = '';
let globalIsSyncing: boolean = false;
type SyncListener = (status: string, isSyncing: boolean) => void;
const syncListeners: Set<SyncListener> = new Set();

// Hàm cập nhật trạng thái và thông báo cho tất cả UI đang lắng nghe
const updateGlobalState = (status: string, isSyncing: boolean) => {
    globalSyncStatus = status;
    globalIsSyncing = isSyncing;
    syncListeners.forEach(listener => listener(status, isSyncing));
};

// Hàm đăng ký lắng nghe (dùng trong React Component)
export const subscribeToSyncState = (listener: SyncListener) => {
    // Gửi ngay trạng thái hiện tại khi mới đăng ký
    listener(globalSyncStatus, globalIsSyncing);
    syncListeners.add(listener);
    // Trả về hàm hủy đăng ký (cleanup)
    return () => syncListeners.delete(listener);
};

export const getSyncState = () => ({ status: globalSyncStatus, isSyncing: globalIsSyncing });

// --- INITIALIZATION & AUTH ---

export async function initGoogleDrive(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof gapi === 'undefined' || typeof google === 'undefined') {
            reject(new Error("Google scripts not loaded."));
            return;
        }

        const initializeGapiClient = async () => {
            try {
                await gapi.client.init({
                    discoveryDocs: [DISCOVERY_DOC],
                });
                gapiInited = true;
                maybeResolve();
            } catch(e) {
                reject(e);
            }
        };

        const initializeGisClient = () => {
            try {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: (resp: any) => {
                        if (resp.error !== undefined) {
                            throw (resp);
                        }
                        accessToken = resp.access_token;
                        
                        // Lưu token và thời gian hết hạn vào localStorage
                        const expiresIn = resp.expires_in; // giây
                        const expirationTime = Date.now() + (expiresIn * 1000);
                        localStorage.setItem(STORAGE_KEY_TOKEN, accessToken!);
                        localStorage.setItem(STORAGE_KEY_EXPIRY, expirationTime.toString());
                    },
                });
                gisInited = true;
                maybeResolve();
            } catch (e) {
                reject(e);
            }
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
        // Kiểm tra xem token còn hạn không (trừ đi 5 phút buffer)
        if (Date.now() < expiryTime - 300000) {
            accessToken = storedToken;
            if (gapi.client) {
                gapi.client.setToken({ access_token: accessToken });
            }
            console.log("Restored Google Drive session.");
        } else {
            signOut();
        }
    }
}

export async function signInToDrive(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        try {
            if (!tokenClient) throw new Error("Google Drive Service chưa được khởi tạo.");
            
            const originalCallback = tokenClient.callback;
            tokenClient.callback = (resp: any) => {
                if (originalCallback) originalCallback(resp);
                
                if (resp.error !== undefined) {
                    reject(resp);
                } else {
                    resolve(true);
                }
            };
            
            if (accessToken) {
                tokenClient.requestAccessToken({ prompt: '' });
            } else {
                tokenClient.requestAccessToken({ prompt: 'consent' });
            }
        } catch(e) {
            reject(e);
        }
    });
}

export function signOut() {
    accessToken = null;
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    fileIdCache.clear(); // Clear cache on sign out
    if (gapi.client) gapi.client.setToken(null);
}

export function isAuthenticated(): boolean {
    return !!accessToken;
}

// --- HELPER FUNCTIONS ---

function hashUrl(url: string): string {
    // Encode URI component trước khi base64 để tránh lỗi ký tự đặc biệt/unicode
    return btoa(encodeURIComponent(url)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Reverse hash to lookup in DB
function unhashUrl(hash: string): string {
    try {
        const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
        return decodeURIComponent(atob(base64));
    } catch (e) {
        return '';
    }
}

function getStoryFilename(storyUrl: string): string {
    return `story_${hashUrl(storyUrl)}.json`;
}

function getChapterFilename(storyUrl: string, chapterUrl: string): string {
    return `chap_${hashUrl(storyUrl)}_${hashUrl(chapterUrl)}.json`;
}

// --- ROBUST API CALLS ---

/**
 * Thực hiện fetch với cơ chế Retry (Exponential Backoff)
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> {
    try {
        const response = await fetch(url, options);
        
        // Nếu thành công hoặc lỗi Client (400, 404...) thì trả về luôn (trừ 429)
        if (response.ok || (response.status < 500 && response.status !== 429)) {
            return response;
        }
        
        // Nếu lỗi Server (5xx) hoặc Rate Limit (429), ném lỗi để catch bên dưới và retry
        throw new Error(`Request failed with status ${response.status}`);
    } catch (error) {
        if (retries > 0) {
            console.warn(`Retrying... attempts left: ${retries}. Delay: ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 2);
        } else {
            throw error;
        }
    }
}

// Tìm file ID theo tên trong AppData với cơ chế xử lý trùng lặp và Cache
async function findFileId(filename: string): Promise<string | null> {
    if (!accessToken) return null;
    
    // 1. Check Cache
    if (fileIdCache.has(filename)) {
        return fileIdCache.get(filename)!;
    }

    try {
        // Query tìm tất cả file trùng tên, không bị xóa
        const response = await gapi.client.drive.files.list({
            q: `name = '${filename}' and 'appDataFolder' in parents and trashed = false`,
            fields: 'files(id, createdTime)', // Lấy thêm createdTime để sort
            spaces: 'appDataFolder'
        });
        
        const files = response.result.files;
        if (files && files.length > 0) {
            // Nếu có nhiều file trùng tên (Lỗi race condition cũ), giữ cái mới nhất
            if (files.length > 1) {
                console.warn(`Found ${files.length} duplicates for ${filename}. Cleaning up...`);
                // Sort mới nhất lên đầu
                files.sort((a: any, b: any) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
                
                // Xóa các file cũ (background process)
                for (let i = 1; i < files.length; i++) {
                    deleteFileById(files[i].id).catch(console.error);
                }
            }
            
            const validId = files[0].id;
            fileIdCache.set(filename, validId);
            return validId;
        }
        
        return null;
    } catch (e) {
        console.error(`Error finding file ${filename}:`, e);
        if ((e as any)?.status === 401) signOut();
        return null;
    }
}

// Upload file (Create or Update) với logic xử lý lỗi mạnh mẽ
// Sử dụng multipart/related thủ công để tương thích tốt nhất với Google Drive API
async function uploadFile(filename: string, content: any): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    // 1. Tìm ID file
    let fileId = await findFileId(filename);
    
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';
    
    // Metadata cơ bản
    const metadata: any = {
        name: filename,
        mimeType: 'application/json',
    };

    // 2. Quyết định Create hay Update
    if (fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
    } else {
        // Khi CREATE (POST), phải chỉ định parent là appDataFolder để file ẩn đi
        metadata.parents = ['appDataFolder'];
    }

    // Construct multipart/related body manually
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

    try {
        const response = await fetchWithRetry(url, {
            method: method,
            headers: new Headers({ 
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            }),
            body: body
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Trường hợp đặc biệt: Đã tìm thấy ID nhưng khi PATCH lại báo 404 (File vừa bị xóa nơi khác)
            if (response.status === 404 && method === 'PATCH') {
                console.warn(`File ${filename} not found during update. Retrying as CREATE.`);
                fileIdCache.delete(filename); // Xóa cache cũ
                return uploadFile(filename, content); // Gọi lại đệ quy để tạo mới
            }
            
            if (response.status === 401) signOut();
            throw new Error(`Upload failed (${response.status}): ${errorText || response.statusText}`);
        }

        // 3. Cập nhật Cache sau khi thành công
        const result = await response.json();
        if (result.id) {
            fileIdCache.set(filename, result.id);
        }

    } catch (error) {
        console.error(`Failed to upload ${filename}`, error);
        throw error;
    }
}

// Xóa file theo ID cụ thể
async function deleteFileById(fileId: string): Promise<void> {
    if (!accessToken) return;
    try {
        await gapi.client.drive.files.delete({ fileId: fileId });
    } catch (e) {
        console.warn(`Error deleting duplicate file ${fileId}`, e);
    }
}

// Delete file theo tên
async function deleteFile(filename: string): Promise<void> {
    if (!accessToken) return;
    
    // Tìm tất cả phiên bản và xóa hết
    const id = await findFileId(filename); // Hàm này đã có logic dọn dẹp, nhưng ta gọi delete trực tiếp
    
    if (id) {
        try {
            await deleteFileById(id);
            console.log(`Deleted file ${filename} from Drive.`);
            fileIdCache.delete(filename);
        } catch (e) {
            console.error(`Error deleting file ${filename}:`, e);
            if ((e as any)?.status === 401) signOut();
        }
    }
}

// Download file content
async function downloadFile<T>(filename: string): Promise<T | null> {
    if (!accessToken) return null;
    
    const fileId = await findFileId(filename);
    if (!fileId) return null;

    try {
        const response = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                fileIdCache.delete(filename); // Cache invalid
                return null;
            }
            if (response.status === 401) signOut();
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error(`Download error for ${filename}:`, e);
        return null;
    }
}

// --- PUBLIC API FOR LAZY LOADING ---

// 1. LIBRARY INDEX
export async function fetchLibraryIndexFromDrive(): Promise<Story[]> {
    const data = await downloadFile<{ stories: Story[] }>(INDEX_FILENAME);
    return data?.stories || [];
}

export async function saveLibraryIndexToDrive(stories: Story[]): Promise<void> {
    const minimalStories = stories.map(s => ({
        title: s.title,
        author: s.author,
        imageUrl: s.imageUrl,
        source: s.source,
        url: s.url,
        createdAt: s.createdAt,
        // Sync metadata is not needed in the shared index file, or can be minimized
    }));
    await uploadFile(INDEX_FILENAME, { stories: minimalStories });
}

// 2. STORY DETAILS
export async function fetchStoryDetailsFromDrive(storyUrl: string): Promise<Story | null> {
    const filename = getStoryFilename(storyUrl);
    return await downloadFile<Story>(filename);
}

export async function saveStoryDetailsToDrive(story: Story): Promise<void> {
    const filename = getStoryFilename(story.url);
    await uploadFile(filename, story);
}

export async function deleteStoryFromDrive(story: Story): Promise<void> {
    const filename = getStoryFilename(story.url);
    await deleteFile(filename);

    const currentIndex = await fetchLibraryIndexFromDrive();
    const newIndex = currentIndex.filter(s => s.url !== story.url);
    await saveLibraryIndexToDrive(newIndex);
}

// 3. CHAPTER CONTENT
export async function fetchChapterContentFromDrive(storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    return await downloadFile<CachedChapter>(filename);
}

export async function saveChapterContentToDrive(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    await uploadFile(filename, data);
}

export async function deleteChapterFromDrive(storyUrl: string, chapterUrl: string): Promise<void> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    await deleteFile(filename);
}

// 4. READING HISTORY
export async function saveReadingHistoryToDrive(history: ReadingHistoryItem[]): Promise<void> {
    await uploadFile(HISTORY_FILENAME, { history });
}

// --- SYNC ACTIONS (Called by UI) ---

// Synchronize Reading Progress (History)
export async function syncReadingProgress(): Promise<void> {
    if (!accessToken) return;
    
    // Only upload if local is dirty
    if (isHistoryDirty()) {
        const localHistory = getReadingHistory();
        // Merge with remote first to be safe (optional, but good practice)
        // For simplicity in this logic, we push local state as "latest" if dirty,
        // but real differential sync would require merging.
        // Let's implement merge: Pull -> Merge -> Push if changes
        
        const remoteData = await downloadFile<{ history: ReadingHistoryItem[] }>(HISTORY_FILENAME);
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
        
        saveReadingHistory(mergedHistory); // Save merged to local
        await saveReadingHistoryToDrive(mergedHistory); // Push back to drive
        
        markHistorySynced(); // Clear dirty flag
    } else {
        // Just Pull and Merge (if remote is newer/different)
        const remoteData = await downloadFile<{ history: ReadingHistoryItem[] }>(HISTORY_FILENAME);
        if (remoteData?.history) {
             const localHistory = getReadingHistory();
             // Simple check: if timestamps differ for top item
             // Or just always merge to be safe
             const mergedMap = new Map<string, ReadingHistoryItem>();
             const mergeItem = (item: ReadingHistoryItem) => {
                const existing = mergedMap.get(item.url);
                if (!existing || item.lastReadTimestamp > existing.lastReadTimestamp) {
                    mergedMap.set(item.url, item);
                }
            };
            localHistory.forEach(mergeItem);
            remoteData.history.forEach(mergeItem);
            const mergedHistory = Array.from(mergedMap.values()).sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
            saveReadingHistory(mergedHistory);
            markHistorySynced(); // Ensure it's not dirty after a pull merge
        }
    }
}

export async function syncLibraryIndex(): Promise<Story[]> {
    if (!accessToken) return [];
    
    // 1. Tải index từ Drive
    const driveStories = await fetchLibraryIndexFromDrive();
    
    // 2. Lấy local stories
    const localStories = await dbService.getAllStories();
    
    // 3. Merge: Ưu tiên Drive nếu chưa có ở Local
    const mergedMap = new Map<string, Story>();
    localStories.forEach(s => mergedMap.set(s.url, s));
    
    let hasChanges = false;
    for (const dStory of driveStories) {
        if (!mergedMap.has(dStory.url)) {
            // Mark fetched story as clean immediately because it matches remote
            const cleanStory = { ...dStory, _dirty: false, _syncedAt: Date.now() };
            await dbService.saveStory(cleanStory, false); 
            mergedMap.set(dStory.url, cleanStory);
            hasChanges = true;
        }
    }
    
    const driveUrls = new Set(driveStories.map(s => s.url));
    const localHasNew = localStories.some(s => !driveUrls.has(s.url));

    if (localHasNew || localStories.length !== driveStories.length) {
        await saveLibraryIndexToDrive(Array.from(mergedMap.values()));
    }

    return Array.from(mergedMap.values());
}

// --- OPTIMIZED UPLOAD (DIFFERENTIAL SYNC) ---

export async function uploadAllLocalData(): Promise<void> {
    if (globalIsSyncing) return;
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    updateGlobalState("Đang kiểm tra thay đổi...", true);

    try {
        // 1. Sync Reading History first
        updateGlobalState("Đang đồng bộ tiến độ đọc...", true);
        await syncReadingProgress();

        // 2. Scan for Dirty Stories
        const dirtyStories = await dbService.getDirtyStories();
        if (dirtyStories.length > 0) {
            updateGlobalState(`Đang tải lên ${dirtyStories.length} truyện thay đổi...`, true);
            
            for (let i = 0; i < dirtyStories.length; i++) {
                const story = dirtyStories[i];
                // Remove dirty flag before upload to keep file clean
                const { _dirty, ...cleanStoryData } = story;
                
                await saveStoryDetailsToDrive(cleanStoryData as Story);
                await dbService.markStorySynced(story); // Mark local as clean
            }
            // If stories changed, update index
            const allStories = await dbService.getAllStories();
            await saveLibraryIndexToDrive(allStories);
        }

        // 3. Scan for Dirty Chapters
        const dirtyChapters = await dbService.getAllDirtyChapters();
        if (dirtyChapters.length > 0) {
            const BATCH_SIZE = 5;
            for (let j = 0; j < dirtyChapters.length; j += BATCH_SIZE) {
                const batch = dirtyChapters.slice(j, j + BATCH_SIZE);
                const progressPercent = Math.round((j / dirtyChapters.length) * 100);
                updateGlobalState(`Đang tải lên chương: ${progressPercent}% (${j}/${dirtyChapters.length})...`, true);
                
                await Promise.all(batch.map(async (chap) => {
                    const { _dirty, ...cleanChapData } = chap;
                    await saveChapterContentToDrive(chap.storyUrl, chap.chapterUrl, cleanChapData);
                    await dbService.markChapterSynced(chap.storyUrl, chap.chapterUrl, cleanChapData);
                }));
            }
        }
        
        updateGlobalState("Đồng bộ hoàn tất!", false);
    } catch (e: any) {
        updateGlobalState(`Lỗi sao lưu: ${e.message}`, false);
        throw e;
    }
}

// --- SMART PULL ACTION (DIFFERENTIAL DOWNLOAD) ---

export async function pullMissingDataFromDrive(): Promise<void> {
    if (globalIsSyncing) return;
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    updateGlobalState("Đang đồng bộ tiến độ đọc...", true);
    await syncReadingProgress();

    updateGlobalState("Đang quét dữ liệu trên Drive...", true);
    
    try {
        // 1. Get List of ALL files in AppData (Metadata only: id, name, modifiedTime)
        // This avoids downloading content for checking
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
            if (files) {
                files.forEach((f: any) => {
                    if (f.name) driveFilesMap.set(f.name, { id: f.id, modifiedTime: f.modifiedTime });
                });
            }
            pageToken = response.result.nextPageToken;
        } while (pageToken);

        // 2. Check Stories
        // Extract Story URLs from filenames in driveFilesMap
        // story_HASH.json
        const driveStoryFilenames = Array.from(driveFilesMap.keys()).filter(k => k.startsWith('story_') && k.endsWith('.json'));
        
        for (const filename of driveStoryFilenames) {
            const hash = filename.replace('story_', '').replace('.json', '');
            const storyUrl = unhashUrl(hash);
            if (!storyUrl) continue;

            const driveFile = driveFilesMap.get(filename);
            const localStory = await dbService.getStory(storyUrl);
            
            let shouldDownload = false;
            
            if (!localStory) {
                shouldDownload = true; // New story
            } else if (!localStory._dirty && driveFile?.modifiedTime) {
                const driveTime = new Date(driveFile.modifiedTime).getTime();
                // If Drive is significantly newer (> 2 seconds to account for clock skew) than last local sync
                if (driveTime > (localStory._syncedAt || 0) + 2000) {
                    shouldDownload = true;
                }
            }
            // If local is dirty, we keep local version (Conflict strategy: Local wins for now, or Manual Resolve later)

            if (shouldDownload) {
                updateGlobalState(`Đang tải truyện mới: ${filename}...`, true);
                const storyData = await downloadFile<Story>(filename);
                if (storyData) {
                    await dbService.saveStory({ ...storyData, _dirty: false, _syncedAt: Date.now() }, false);
                }
            }
        }

        // 3. Check Chapters
        const driveChapterFilenames = Array.from(driveFilesMap.keys()).filter(k => k.startsWith('chap_') && k.endsWith('.json'));
        const missingOrOutdatedChapters: string[] = [];

        // Batch check against DB
        for (const filename of driveChapterFilenames) {
            // Filename: chap_STORYHASH_CHAPHASH.json
            const parts = filename.replace('.json', '').split('_');
            if (parts.length !== 3) continue;
            
            const storyUrl = unhashUrl(parts[1]);
            const chapterUrl = unhashUrl(parts[2]);
            if (!storyUrl || !chapterUrl) continue;

            const driveFile = driveFilesMap.get(filename);
            const localChapter = await dbService.getChapterData(storyUrl, chapterUrl);

            let shouldDownload = false;
            if (!localChapter) {
                shouldDownload = true;
            } else if (!localChapter._dirty && driveFile?.modifiedTime) {
                const driveTime = new Date(driveFile.modifiedTime).getTime();
                if (driveTime > (localChapter._syncedAt || 0) + 2000) {
                    shouldDownload = true;
                }
            }

            if (shouldDownload) {
                missingOrOutdatedChapters.push(filename);
            }
        }

        if (missingOrOutdatedChapters.length > 0) {
            updateGlobalState(`Tìm thấy ${missingOrOutdatedChapters.length} chương cần cập nhật. Đang tải...`, true);
            const BATCH_SIZE = 5;
            for (let i = 0; i < missingOrOutdatedChapters.length; i += BATCH_SIZE) {
                const batch = missingOrOutdatedChapters.slice(i, i + BATCH_SIZE);
                const percent = Math.round(((i + batch.length) / missingOrOutdatedChapters.length) * 100);
                updateGlobalState(`Đang tải dữ liệu: ${percent}% (${i + batch.length}/${missingOrOutdatedChapters.length})`, true);

                await Promise.all(batch.map(async (filename) => {
                    // Extract IDs again to save
                    const parts = filename.replace('.json', '').split('_');
                    const storyUrl = unhashUrl(parts[1]);
                    const chapterUrl = unhashUrl(parts[2]);
                    
                    const data = await downloadFile<CachedChapter>(filename);
                    if (data && storyUrl && chapterUrl) {
                        await dbService.saveChapterData(storyUrl, chapterUrl, {
                            ...data,
                            _dirty: false,
                            _syncedAt: Date.now()
                        }, false);
                    }
                }));
            }
        }

        // Sync Index last
        await syncLibraryIndex();

        updateGlobalState("Đã hoàn tất tải dữ liệu mới từ Drive!", false);
    } catch (e: any) {
        updateGlobalState(`Lỗi tải dữ liệu: ${e.message}`, false);
        throw e;
    }
}
