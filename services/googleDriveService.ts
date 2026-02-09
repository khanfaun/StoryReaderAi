import type { Story, CachedChapter, CharacterStats } from '../types';

// Declare globals for Google APIs
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// ==========================================
// CẤU HÌNH GOOGLE API
// ==========================================
// Cập nhật Client ID mới
const CLIENT_ID = '668650540476-6dkreulqvl7sffc6sv373t2pplob9hmt.apps.googleusercontent.com'; 

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const APP_FOLDER_NAME = 'TruyenReader_Data';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

// --- INITIALIZATION ---

export const initDriveApi = async (): Promise<void> => {
    return new Promise((resolve) => {
        const checkGapi = () => {
            if (window.gapi && window.google) {
                initializeGapiClient();
                initializeGisClient();
                resolve();
            } else {
                setTimeout(checkGapi, 100);
            }
        };
        checkGapi();
    });
};

const initializeGapiClient = async () => {
    await new Promise<void>((resolve, reject) => {
        window.gapi.load('client', { callback: resolve, onerror: reject });
    });
    await window.gapi.client.init({
        // apiKey: API_KEY, // Optional for Drive if using OAuth token
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiInited = true;
};

const initializeGisClient = () => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
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
};

export const handleAuthClick = (): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            // Fallback config if not initialized via initDriveApi
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (resp: any) => {
                    if (resp.error) reject(resp);
                    else {
                        accessToken = resp.access_token;
                        resolve(accessToken!);
                    }
                },
            });
        }
        
        // Request access token
        tokenClient.requestAccessToken({ prompt: '' });
    });
};

export const handleSignOut = () => {
    const token = window.gapi.client.getToken();
    if (token !== null) {
        window.google.accounts.oauth2.revoke(token.access_token);
        window.gapi.client.setToken(null);
        accessToken = null;
    }
};

export const isSignedIn = () => !!accessToken;

// --- DRIVE OPERATIONS ---

// 1. App Folder Management
async function ensureAppFolder(): Promise<string> {
    if (!isSignedIn()) throw new Error("Not signed in");
    const q = `mimeType='application/vnd.google-apps.folder' and name='${APP_FOLDER_NAME}' and trashed=false`;
    const response = await window.gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
    
    if (response.result.files && response.result.files.length > 0) {
        return response.result.files[0].id!;
    } else {
        const fileMetadata = {
            name: APP_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
        };
        const createRes = await window.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id',
        });
        return createRes.result.id!;
    }
}

// 2. File Helpers
async function findFile(name: string, parentId: string): Promise<string | null> {
    if (!isSignedIn()) return null;
    const q = `name='${name}' and '${parentId}' in parents and trashed=false`;
    const response = await window.gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
    return response.result.files?.[0]?.id || null;
}

async function readFile<T>(fileId: string): Promise<T | null> {
    if (!isSignedIn()) return null;
    try {
        const response = await window.gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        // GAPI returns body in .body or .result depending on context, handled by JSON parsing usually
        return typeof response.body === 'string' ? JSON.parse(response.body) : response.result;
    } catch (e) {
        console.error("Read file error", e);
        return null;
    }
}

async function saveFile(name: string, content: any, parentId: string, fileId?: string | null): Promise<string> {
    if (!isSignedIn()) throw new Error("Not signed in");
    const fileContent = JSON.stringify(content);
    const metadata = {
        name: name,
        mimeType: 'application/json',
        parents: fileId ? undefined : [parentId], // Only set parent on create
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const contentType = 'application/json';

    let multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n\r\n' +
        fileContent +
        close_delim;

    const request = window.gapi.client.request({
        path: fileId ? `/upload/drive/v3/files/${fileId}` : '/upload/drive/v3/files',
        method: fileId ? 'PATCH' : 'POST',
        params: { uploadType: 'multipart' },
        headers: {
            'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody
    });

    const response = await request;
    return response.result.id;
}

// 3. Specific Logic (Lazy Loading)

// Manifest: Contains a list of { url, title, folderId, lastUpdated }
export async function syncManifest(localStories: Story[]): Promise<{ stories: Story[], manifestFileId: string }> {
    if (!isSignedIn()) return { stories: localStories, manifestFileId: '' };

    const appFolderId = await ensureAppFolder();
    const manifestId = await findFile('manifest.json', appFolderId);
    
    let driveStories: any[] = [];
    
    if (manifestId) {
        const data = await readFile<{ stories: any[] }>(manifestId);
        driveStories = data?.stories || [];
    }

    // Merge: Drive is source of truth for existence, but we merge metadata
    const mergedStories: Story[] = [...localStories];
    const localUrlMap = new Map(localStories.map(s => [s.url, s]));

    driveStories.forEach(ds => {
        if (!localUrlMap.has(ds.url)) {
            // Found a story on Drive not in Local -> Add as "Cloud Only"
            mergedStories.push({
                title: ds.title,
                author: ds.author || 'Unknown',
                url: ds.url,
                imageUrl: ds.imageUrl || '',
                source: ds.source || 'Unknown',
                isCloudOnly: true,
                driveFolderId: ds.driveFolderId,
            });
        } else {
            // Exists in both, update driveFolderId if missing locally
            const local = localUrlMap.get(ds.url)!;
            if (!local.driveFolderId && ds.driveFolderId) {
                local.driveFolderId = ds.driveFolderId;
            }
        }
    });

    // Upload updated manifest back to Drive (background)
    const newManifestContent = {
        stories: mergedStories.map(s => ({
            title: s.title,
            author: s.author,
            url: s.url,
            imageUrl: s.imageUrl,
            source: s.source,
            driveFolderId: s.driveFolderId,
            lastUpdated: Date.now()
        }))
    };
    
    // Non-blocking upload
    saveFile('manifest.json', newManifestContent, appFolderId, manifestId).catch(console.error);

    return { stories: mergedStories, manifestFileId: manifestId || '' };
}

function sanitizeFilename(url: string): string {
    return url.replace(/[^a-zA-Z0-9]/g, '_');
}

export async function fetchStoryMetadata(story: Story): Promise<Story | null> {
    if (!isSignedIn()) return null;

    // 1. Find Story Folder
    let folderId = story.driveFolderId;
    if (!folderId) {
        const appFolderId = await ensureAppFolder();
        const folderName = sanitizeFilename(story.url);
        // Try to find folder by name
        const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${appFolderId}' in parents and trashed=false`;
        const res = await window.gapi.client.drive.files.list({ q });
        folderId = res.result.files?.[0]?.id;
    }

    if (!folderId) return null; // Story not on Drive

    // 2. Read metadata.json
    const metaId = await findFile('metadata.json', folderId);
    if (!metaId) return null;

    const fullData = await readFile<Story>(metaId);
    if (fullData) {
        return { ...fullData, driveFolderId: folderId, isCloudOnly: false };
    }
    return null;
}

export async function saveStoryMetadata(story: Story): Promise<string> {
    if (!isSignedIn()) return '';

    const appFolderId = await ensureAppFolder();
    const folderName = sanitizeFilename(story.url);
    
    // Find or Create Story Folder
    let folderId = story.driveFolderId;
    if (!folderId) {
        const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${appFolderId}' in parents and trashed=false`;
        const res = await window.gapi.client.drive.files.list({ q });
        if (res.result.files && res.result.files.length > 0) {
            folderId = res.result.files[0].id!;
        } else {
            const createRes = await window.gapi.client.drive.files.create({
                resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [appFolderId] },
                fields: 'id'
            });
            folderId = createRes.result.id!;
        }
    }

    // Save metadata.json
    const metaId = await findFile('metadata.json', folderId);
    await saveFile('metadata.json', story, folderId, metaId);
    
    return folderId;
}

export async function fetchChapterFromDrive(story: Story, chapterUrl: string): Promise<CachedChapter | null> {
    if (!isSignedIn()) return null;
    if (!story.driveFolderId) return null;

    // 1. Ensure 'Chapters' folder exists
    const chaptersFolderId = await findFile('Chapters', story.driveFolderId);
    if (!chaptersFolderId) return null;

    // 2. Find chapter file
    const fileName = sanitizeFilename(chapterUrl) + '.json';
    const fileId = await findFile(fileName, chaptersFolderId);
    
    if (!fileId) return null;

    // 3. Read content
    return await readFile<CachedChapter>(fileId);
}

export async function saveChapterToDrive(story: Story, chapterUrl: string, data: CachedChapter): Promise<void> {
    if (!isSignedIn()) return;

    if (!story.driveFolderId) {
        // Should have been set by saveStoryMetadata, but if not:
        story.driveFolderId = await saveStoryMetadata(story);
    }

    // 1. Ensure 'Chapters' folder
    let chaptersFolderId = await findFile('Chapters', story.driveFolderId);
    if (!chaptersFolderId) {
        const createRes = await window.gapi.client.drive.files.create({
            resource: { name: 'Chapters', mimeType: 'application/vnd.google-apps.folder', parents: [story.driveFolderId] },
            fields: 'id'
        });
        chaptersFolderId = createRes.result.id!;
    }

    // 2. Save File
    const fileName = sanitizeFilename(chapterUrl) + '.json';
    const fileId = await findFile(fileName, chaptersFolderId);
    await saveFile(fileName, data, chaptersFolderId, fileId);
}
