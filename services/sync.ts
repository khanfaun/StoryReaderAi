
import { Story, CachedChapter } from '../types';
import * as dbService from './dbService';

declare var gapi: any;
declare var google: any;

const CLIENT_ID = '668650540476-6dkreulqvl7sffc6sv373t2pplob9hmt.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
// Sử dụng drive.appdata để lưu file ẩn
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'; 

// Tên file danh mục chính
const INDEX_FILENAME = 'library_index.json';

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
async function uploadFile(filename: string, content: any): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    // 1. Tìm ID file
    let fileId = await findFileId(filename);
    
    const metadata = {
        name: filename,
        mimeType: 'application/json',
        parents: ['appDataFolder']
    };

    const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    // 2. Quyết định Create hay Update
    if (fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
    }

    try {
        const response = await fetchWithRetry(url, {
            method: method,
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });

        if (!response.ok) {
            // Trường hợp đặc biệt: Đã tìm thấy ID nhưng khi PATCH lại báo 404 (File vừa bị xóa nơi khác)
            if (response.status === 404 && method === 'PATCH') {
                console.warn(`File ${filename} not found during update. Retrying as CREATE.`);
                fileIdCache.delete(filename); // Xóa cache cũ
                return uploadFile(filename, content); // Gọi lại đệ quy để tạo mới
            }
            
            if (response.status === 401) signOut();
            throw new Error(`Upload failed: ${response.statusText}`);
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

// --- SYNC ACTIONS (Called by UI) ---

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
            await dbService.saveStory(dStory);
            mergedMap.set(dStory.url, dStory);
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

// --- BULK UPLOAD ACTION ---

export async function uploadAllLocalData(onProgress: (msg: string) => void): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    // 1. Upload Library Index
    const stories = await dbService.getAllStories();
    onProgress(`Đang đồng bộ danh sách truyện (${stories.length})...`);
    await saveLibraryIndexToDrive(stories);

    // 2. Upload Stories & Cached Chapters
    for (let i = 0; i < stories.length; i++) {
        const story = stories[i];
        onProgress(`Đang xử lý truyện: ${story.title} (${i + 1}/${stories.length})...`);
        
        // Upload Metadata
        await saveStoryDetailsToDrive(story);

        // Get Cached Chapters
        const cachedChapters = await dbService.getAllChapterData(story.url);
        
        // Upload Chapters (Parallel Batching)
        const BATCH_SIZE = 5;
        for (let j = 0; j < cachedChapters.length; j += BATCH_SIZE) {
            const batch = cachedChapters.slice(j, j + BATCH_SIZE);
            const progressPercent = Math.round((j / cachedChapters.length) * 100);
            onProgress(`Uploading ${story.title}: ${progressPercent}% (${j}/${cachedChapters.length} chương)...`);
            
            await Promise.all(batch.map(chap => 
                saveChapterContentToDrive(story.url, chap.chapterUrl, {
                    content: chap.content,
                    stats: chap.stats
                })
            ));
        }
    }
    
    onProgress("Đồng bộ hoàn tất!");
}

// --- SMART PULL ACTION (DOWNLOAD MISSING DATA) ---

export async function pullMissingDataFromDrive(onProgress: (msg: string) => void): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    onProgress("Đang kiểm tra danh sách truyện trên Drive...");
    
    // 1. Tải và đồng bộ danh sách truyện (Index)
    const driveStories = await fetchLibraryIndexFromDrive();
    
    // Cập nhật index vào local DB
    for (const dStory of driveStories) {
        // Chỉ lưu metadata cơ bản nếu chưa có, hoặc cập nhật đè để đảm bảo mới nhất
        await dbService.saveStory(dStory);
    }

    // 2. Duyệt qua từng truyện để tìm chương thiếu
    for (let i = 0; i < driveStories.length; i++) {
        const indexStory = driveStories[i];
        onProgress(`Đang kiểm tra truyện: ${indexStory.title} (${i + 1}/${driveStories.length})...`);

        // Tải chi tiết truyện đầy đủ (bao gồm danh sách chương mới nhất từ Drive)
        const fullDriveStory = await fetchStoryDetailsFromDrive(indexStory.url);
        
        if (!fullDriveStory || !fullDriveStory.chapters) continue;

        // Lưu metadata truyện đầy đủ vào local
        await dbService.saveStory(fullDriveStory);

        // Lấy danh sách các chương đã có ở local (để không tải lại)
        const localCachedUrls = await dbService.getCachedChapterUrls(indexStory.url);
        const localUrlSet = new Set(localCachedUrls);

        // Lọc ra các chương mà Drive có nhưng Local chưa có
        const missingChapters = fullDriveStory.chapters.filter(ch => !localUrlSet.has(ch.url));

        if (missingChapters.length > 0) {
            onProgress(`Tìm thấy ${missingChapters.length} chương/dữ liệu mới cho "${indexStory.title}". Đang tải...`);
            
            // Tải về theo batch
            const BATCH_SIZE = 5;
            for (let j = 0; j < missingChapters.length; j += BATCH_SIZE) {
                const batch = missingChapters.slice(j, j + BATCH_SIZE);
                
                await Promise.all(batch.map(async (chap) => {
                    const data = await fetchChapterContentFromDrive(indexStory.url, chap.url);
                    if (data) {
                        // Lưu cả content và stats (AI data) vào cache
                        await dbService.saveChapterData(indexStory.url, chap.url, data);
                    }
                }));
                
                // Cập nhật progress bar ảo nếu cần, hoặc log
                const percent = Math.round(((j + batch.length) / missingChapters.length) * 100);
                onProgress(`Đang tải "${indexStory.title}": ${percent}% (${j + batch.length}/${missingChapters.length})`);
            }
        } else {
            // onProgress(`"${indexStory.title}" đã đồng bộ.`);
        }
    }

    onProgress("Đã hoàn tất tải dữ liệu mới từ Drive!");
}
