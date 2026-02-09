
import type { GoogleUser, GoogleFile } from '../types';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// ==========================================================
// CẤU HÌNH GOOGLE DRIVE
// ==========================================================

const CLIENT_ID = '668650540476-6dkreulqvl7sffc6sv373t2pplob9hmt.apps.googleusercontent.com';

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

// ==========================================================
// INITIALIZATION
// ==========================================================

export function initGoogleDrive(onUserChanged: (user: GoogleUser | null) => void) {
    const gapiLoaded = () => {
        window.gapi.load('client', async () => {
            await window.gapi.client.init({
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            checkAuth(onUserChanged);
        });
    };

    const gisLoaded = () => {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (resp: any) => {
                if (resp.error !== undefined) {
                    throw (resp);
                }
                accessToken = resp.access_token;
                // Fetch profile info
                fetchUserInfo(onUserChanged);
            },
        });
        gisInited = true;
        checkAuth(onUserChanged);
    };

    // Load scripts manually if not present (handled in index.html, but safety check)
    if (window.gapi) gapiLoaded();
    if (window.google) gisLoaded();
}

function checkAuth(callback: (user: GoogleUser | null) => void) {
    // Check local storage for existing session hint (not the token itself for security, just a flag)
    const savedUser = localStorage.getItem('gdrive_user_cache');
    if (savedUser) {
        callback(JSON.parse(savedUser));
    }
}

export function isUserLoggedIn(): boolean {
    return !!accessToken;
}

// ==========================================================
// AUTHENTICATION
// ==========================================================

export function signIn() {
    if (!tokenClient) return;
    // Request access token
    if (window.gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

export function signOut(callback: () => void) {
    const token = window.gapi.client.getToken();
    if (token !== null) {
        window.google.accounts.oauth2.revoke(token.access_token, () => {
            window.gapi.client.setToken(null);
            accessToken = null;
            localStorage.removeItem('gdrive_user_cache');
            callback();
        });
    } else {
        accessToken = null;
        localStorage.removeItem('gdrive_user_cache');
        callback();
    }
}

async function fetchUserInfo(callback: (user: GoogleUser | null) => void) {
    try {
        // We use the Drive API "about" or Oauth2 UserInfo endpoint if available.
        // Or simpler: fetch from googleapis.com/oauth2/v3/userinfo
        if (!accessToken) return;
        
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const user: GoogleUser = {
                name: data.name,
                email: data.email,
                imageUrl: data.picture
            };
            localStorage.setItem('gdrive_user_cache', JSON.stringify(user));
            callback(user);
        }
    } catch (e) {
        console.error("Failed to fetch user info", e);
    }
}

// ==========================================================
// DRIVE API OPERATIONS (AppData Folder)
// ==========================================================

/**
 * List files in the hidden appDataFolder
 */
export async function listFiles(): Promise<GoogleFile[]> {
    if (!accessToken) throw new Error("Chưa đăng nhập.");
    
    try {
        const response = await window.gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime)',
            pageSize: 100,
        });
        return response.result.files || [];
    } catch (e) {
        console.error("List files error", e);
        throw e;
    }
}

/**
 * Upload a JSON file to appDataFolder
 */
export async function uploadJsonFile(fileName: string, content: any, existingFileId?: string): Promise<string> {
    if (!accessToken) throw new Error("Chưa đăng nhập.");

    const fileContent = JSON.stringify(content);
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: existingFileId ? undefined : ['appDataFolder'], // Only set parent on create
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const method = existingFileId ? 'PATCH' : 'POST';
    const url = existingFileId 
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const response = await fetch(url, {
        method: method,
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form
    });

    if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.id;
}

/**
 * Download a file content by ID
 */
export async function downloadFile(fileId: string): Promise<any> {
    if (!accessToken) throw new Error("Chưa đăng nhập.");

    try {
        const response = await window.gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        return response.result;
    } catch (e) {
        // If 404, file might be deleted elsewhere
        console.error("Download error", e);
        return null;
    }
}

/**
 * Delete a file
 */
export async function deleteFile(fileId: string): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập.");
    try {
        await window.gapi.client.drive.files.delete({
            fileId: fileId
        });
    } catch (e) {
        console.error("Delete error", e);
    }
}
