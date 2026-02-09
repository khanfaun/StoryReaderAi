
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

// QUAN TRỌNG: Thêm quyền profile và email để lấy thông tin người dùng (Avatar, Tên)
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;
let isInteractiveSignIn = false; // Cờ để kiểm tra xem có phải người dùng đang bấm nút đăng nhập không

// ==========================================================
// INITIALIZATION
// ==========================================================

export function initGoogleDrive(onUserChanged: (user: GoogleUser | null) => void) {
    console.log("[DriveService] Initializing...");

    const gapiLoaded = () => {
        window.gapi.load('client', async () => {
            await window.gapi.client.init({
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            console.log("[DriveService] GAPI Client Loaded");
            
            // Nếu đã có token trong localStorage (phiên cũ), thử khôi phục
            checkAuth(onUserChanged);
        });
    };

    const gisLoaded = () => {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (resp: any) => {
                console.log("[DriveService] Token Callback Received", resp);
                
                if (resp.error !== undefined) {
                    console.error("[DriveService] Auth Error:", resp);
                    alert("Lỗi đăng nhập Google: " + resp.error);
                    throw (resp);
                }
                
                // 1. Lưu Access Token
                accessToken = resp.access_token;
                
                // 2. QUAN TRỌNG: Cập nhật token cho GAPI Client để dùng cho Drive API sau này
                if (window.gapi && window.gapi.client) {
                    window.gapi.client.setToken(resp);
                    console.log("[DriveService] GAPI Token Set");
                }

                // 3. Lấy thông tin người dùng ngay lập tức
                fetchUserInfo(onUserChanged);
            },
        });
        gisInited = true;
        console.log("[DriveService] GIS Client Loaded");
        checkAuth(onUserChanged);
    };

    // Robust Script Loading Check
    const checkScriptLoad = () => {
        if (window.gapi && !gapiInited) {
            gapiLoaded();
        }
        if (window.google && !gisInited) {
            gisLoaded();
        }
        
        if ((!window.gapi || !window.google) || (!gapiInited || !gisInited)) {
            setTimeout(checkScriptLoad, 500);
        }
    };

    checkScriptLoad();
}

function checkAuth(callback: (user: GoogleUser | null) => void) {
    const savedUser = localStorage.getItem('gdrive_user_cache');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            console.log("[DriveService] Restored user from cache", user);
            callback(user);
        } catch (e) {
            localStorage.removeItem('gdrive_user_cache');
        }
    }
}

export function isUserLoggedIn(): boolean {
    return !!accessToken;
}

// ==========================================================
// AUTHENTICATION
// ==========================================================

export function signIn() {
    if (!tokenClient) {
        alert("Google Services chưa sẵn sàng. Vui lòng tải lại trang.");
        return;
    }
    
    console.log("[DriveService] Requesting Access Token...");
    isInteractiveSignIn = true; // Đánh dấu đây là hành động đăng nhập chủ động
    
    // Luôn dùng 'consent' khi dev/unverified để đảm bảo popup hiện ra và token mới được cấp
    // Điều này giúp vượt qua trạng thái "token cũ bị block"
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function signOut(callback: () => void) {
    const token = window.gapi.client.getToken();
    if (token !== null) {
        window.google.accounts.oauth2.revoke(token.access_token, () => {
            window.gapi.client.setToken(null);
            accessToken = null;
            localStorage.removeItem('gdrive_user_cache');
            callback();
            console.log("[DriveService] Signed out.");
        });
    } else {
        accessToken = null;
        localStorage.removeItem('gdrive_user_cache');
        callback();
    }
}

async function fetchUserInfo(callback: (user: GoogleUser | null) => void) {
    try {
        if (!accessToken) {
            console.warn("[DriveService] No access token to fetch info");
            return;
        }
        
        console.log("[DriveService] Fetching User Info...");
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
            console.log("[DriveService] User Info Fetched Success:", user);
            callback(user);

            // TỰ ĐỘNG RELOAD NẾU LÀ ĐĂNG NHẬP CHỦ ĐỘNG
            if (isInteractiveSignIn) {
                console.log("[DriveService] Interactive sign-in detected. Reloading page to apply changes...");
                setTimeout(() => {
                    window.location.reload();
                }, 1000); // Đợi 1s để UI kịp hiện thông báo thành công (nếu có)
            }

        } else {
            console.error("[DriveService] Failed to fetch user info. Status:", response.status);
            if (response.status === 401 || response.status === 403) {
                alert("Ứng dụng chưa được cấp quyền đọc thông tin. Hãy thử đăng nhập lại và chọn 'Tiếp tục' ở màn hình cảnh báo.");
            }
        }
    } catch (e) {
        console.error("[DriveService] Exception fetching user info", e);
        alert("Lỗi kết nối khi lấy thông tin người dùng.");
    }
}

// ==========================================================
// DRIVE API OPERATIONS (AppData Folder)
// ==========================================================

export async function listFiles(): Promise<GoogleFile[]> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive.");
    
    try {
        // Đảm bảo GAPI có token (phòng trường hợp accessToken có nhưng GAPI client chưa set)
        if (window.gapi.client.getToken() === null) {
             window.gapi.client.setToken({ access_token: accessToken });
        }

        const response = await window.gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime)',
            pageSize: 100,
        });
        return response.result.files || [];
    } catch (e) {
        console.error("[DriveService] List files error", e);
        throw e;
    }
}

export async function uploadJsonFile(fileName: string, content: any, existingFileId?: string): Promise<string> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive.");

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
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive.");

    try {
        if (window.gapi.client.getToken() === null) {
             window.gapi.client.setToken({ access_token: accessToken });
        }
        
        const response = await window.gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        return response.result;
    } catch (e) {
        console.error("[DriveService] Download error", e);
        return null;
    }
}

export async function deleteFile(fileId: string): Promise<void> {
    if (!accessToken) throw new Error("Chưa đăng nhập Google Drive.");
    try {
        if (window.gapi.client.getToken() === null) {
             window.gapi.client.setToken({ access_token: accessToken });
        }
        await window.gapi.client.drive.files.delete({
            fileId: fileId
        });
    } catch (e) {
        console.error("[DriveService] Delete error", e);
    }
}
