
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
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

// Helper để lấy user từ storage ngay lập tức (Synchronous)
export function getUserFromStorage(): GoogleUser | null {
    const savedUser = localStorage.getItem('gdrive_user_cache');
    if (savedUser) {
        try {
            return JSON.parse(savedUser);
        } catch (e) {
            return null;
        }
    }
    return null;
}

// ==========================================================
// INITIALIZATION
// ==========================================================

export function initGoogleDrive(onUserChanged: (user: GoogleUser | null) => void) {
    console.log("[DriveService] Initializing...");

    // 1. Kiểm tra cache ngay lập tức để cập nhật UI
    const cachedUser = getUserFromStorage();
    if (cachedUser) {
        onUserChanged(cachedUser);
    }

    const gapiLoaded = () => {
        window.gapi.load('client', async () => {
            await window.gapi.client.init({
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            
            // Check nếu có token cũ còn hạn (optional logic, usually handled by clicking login)
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
                
                if (window.gapi && window.gapi.client) {
                    window.gapi.client.setToken(resp);
                }

                // Fetch info mới nhất từ API và cập nhật
                fetchUserInfo(onUserChanged);
            },
        });
        gisInited = true;
    };

    const checkScriptLoad = () => {
        if (window.gapi && !gapiInited) gapiLoaded();
        if (window.google && !gisInited) gisLoaded();
        
        if ((!window.gapi || !window.google) || (!gapiInited || !gisInited)) {
            setTimeout(checkScriptLoad, 500);
        }
    };

    checkScriptLoad();
}

export function isUserLoggedIn(): boolean {
    return !!accessToken || !!getUserFromStorage();
}

// ==========================================================
// AUTHENTICATION
// ==========================================================

export function signIn() {
    if (!tokenClient) {
        alert("Google Services chưa sẵn sàng. Vui lòng thử lại sau 2 giây.");
        return;
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function signOut(callback: () => void) {
    const token = window.gapi?.client?.getToken();
    const clearLocal = () => {
        accessToken = null;
        if (window.gapi?.client) window.gapi.client.setToken(null);
        localStorage.removeItem('gdrive_user_cache');
        callback();
    };

    if (token !== null && window.google) {
        window.google.accounts.oauth2.revoke(token.access_token, () => {
            clearLocal();
        });
    } else {
        clearLocal();
    }
}

async function fetchUserInfo(callback: (user: GoogleUser | null) => void) {
    try {
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
        console.error("Error fetching user info", e);
    }
}

// ==========================================================
// DRIVE API OPERATIONS
// ==========================================================

export async function listFiles(): Promise<GoogleFile[]> {
    if (!accessToken) throw new Error("Chưa xác thực Google Drive.");
    
    // Đảm bảo GAPI client có token
    if (window.gapi.client.getToken() === null) {
         window.gapi.client.setToken({ access_token: accessToken });
    }

    const response = await window.gapi.client.drive.files.list({
        spaces: 'appDataFolder',
        fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime)',
        pageSize: 100,
    });
    return response.result.files || [];
}

export async function uploadJsonFile(fileName: string, content: any, existingFileId?: string): Promise<string> {
    if (!accessToken) throw new Error("Chưa xác thực Google Drive.");

    const fileContent = JSON.stringify(content);
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: existingFileId ? undefined : ['appDataFolder'],
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

export async function downloadFile(fileId: string): Promise<any> {
    if (!accessToken) throw new Error("Chưa xác thực Google Drive.");

    if (window.gapi.client.getToken() === null) {
            window.gapi.client.setToken({ access_token: accessToken });
    }
    
    const response = await window.gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
    });
    return response.result;
}

export async function deleteFile(fileId: string): Promise<void> {
    if (!accessToken) throw new Error("Chưa xác thực Google Drive.");
    if (window.gapi.client.getToken() === null) {
            window.gapi.client.setToken({ access_token: accessToken });
    }
    await window.gapi.client.drive.files.delete({
        fileId: fileId
    });
}
