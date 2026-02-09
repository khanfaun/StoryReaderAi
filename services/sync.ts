
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

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

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
                resolve();
            }
        };

        gapi.load('client', initializeGapiClient);
        initializeGisClient();
    });
}

export async function signInToDrive(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        try {
            if (!tokenClient) throw new Error("Google Drive Service chưa được khởi tạo.");
            
            tokenClient.callback = (resp: any) => {
                if (resp.error !== undefined) {
                    reject(resp);
                }
                accessToken = resp.access_token;
                resolve(true);
            };
            
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } catch(e) {
            reject(e);
        }
    });
}

export function isAuthenticated(): boolean {
    return !!accessToken;
}

// --- HELPER FUNCTIONS ---

// Tạo tên file an toàn từ URL (Base64 URL safe)
function hashUrl(url: string): string {
    return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getStoryFilename(storyUrl: string): string {
    return `story_${hashUrl(storyUrl)}.json`;
}

function getChapterFilename(storyUrl: string, chapterUrl: string): string {
    // Kết hợp hash story và hash chapter để đảm bảo duy nhất
    return `chap_${hashUrl(storyUrl)}_${hashUrl(chapterUrl)}.json`;
}

// Tìm file ID theo tên trong AppData
async function findFileId(filename: string): Promise<string | null> {
    if (!accessToken) return null;
    try {
        const response = await gapi.client.drive.files.list({
            q: `name = '${filename}' and 'appDataFolder' in parents and trashed = false`,
            fields: 'files(id)',
            spaces: 'appDataFolder'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            return files[0].id;
        }
        return null;
    } catch (e) {
        console.error(`Error finding file ${filename}:`, e);
        return null;
    }
}

// Upload file (Create or Update)
async function uploadFile(filename: string, content: any): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive");

    const fileId = await findFileId(filename);
    
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

    if (fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
    }

    const response = await fetch(url, {
        method: method,
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form
    });

    if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
    }
}

// Download file content
async function downloadFile<T>(filename: string): Promise<T | null> {
    if (!accessToken) return null;
    
    const fileId = await findFileId(filename);
    if (!fileId) return null;

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error(`Download error for ${filename}:`, e);
        return null;
    }
}

// --- PUBLIC API FOR LAZY LOADING ---

// 1. LIBRARY INDEX
// Tải danh sách truyện (metadata cơ bản) từ Drive
export async function fetchLibraryIndexFromDrive(): Promise<Story[]> {
    const data = await downloadFile<{ stories: Story[] }>(INDEX_FILENAME);
    return data?.stories || [];
}

// Lưu danh sách truyện hiện tại lên Drive
export async function saveLibraryIndexToDrive(stories: Story[]): Promise<void> {
    // Chỉ lưu metadata gọn nhẹ, không lưu chapters trong index
    const minimalStories = stories.map(s => ({
        title: s.title,
        author: s.author,
        imageUrl: s.imageUrl,
        source: s.source,
        url: s.url,
        createdAt: s.createdAt,
        // Không lưu chapters array ở đây để file nhẹ
    }));
    await uploadFile(INDEX_FILENAME, { stories: minimalStories });
}

// 2. STORY DETAILS
// Tải chi tiết truyện (bao gồm danh sách chương)
export async function fetchStoryDetailsFromDrive(storyUrl: string): Promise<Story | null> {
    const filename = getStoryFilename(storyUrl);
    return await downloadFile<Story>(filename);
}

// Lưu chi tiết truyện lên Drive
export async function saveStoryDetailsToDrive(story: Story): Promise<void> {
    const filename = getStoryFilename(story.url);
    await uploadFile(filename, story);
}

// 3. CHAPTER CONTENT
// Tải nội dung chương
export async function fetchChapterContentFromDrive(storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    return await downloadFile<CachedChapter>(filename);
}

// Lưu nội dung chương lên Drive
export async function saveChapterContentToDrive(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    const filename = getChapterFilename(storyUrl, chapterUrl);
    await uploadFile(filename, data);
}

// --- SYNC ACTIONS (Called by UI) ---

// Hành động: Đồng bộ danh sách truyện (Merge Drive -> Local)
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
            // Đây là truyện mới từ Drive, lưu vào Local DB (metadata cơ bản)
            await dbService.saveStory(dStory);
            mergedMap.set(dStory.url, dStory);
            hasChanges = true;
        }
    }
    
    // Nếu Local có truyện mới mà Drive chưa có -> Upload ngược lại index mới
    if (localStories.length > driveStories.length) {
        await saveLibraryIndexToDrive(Array.from(mergedMap.values()));
    }

    return Array.from(mergedMap.values());
}
