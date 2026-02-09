
import type { GoogleUser } from '../types';

// Cấu hình Google Drive Scope
const CLIENT_ID = '668650540476-6dkreulqvl7sffc6sv373t2pplob9hmt.apps.googleusercontent.com';

// LƯU Ý: Để chạy thực tế, bạn cần tạo Project trên Google Cloud Console, enable Drive API và tạo OAuth Client ID.
// Ở đây tôi sẽ giả định CLIENT_ID đã được cấu hình hoặc sử dụng cơ chế token của GIS.
// Do chạy trên môi trường sandbox, tôi sẽ viết code chuẩn, bạn cần thay CLIENT_ID của mình vào.
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;
let currentUser: GoogleUser | null = null;

// Tên thư mục gốc trên Drive
const APP_FOLDER_NAME = 'App_Novel_Reader_Data';

export const initGoogleDrive = (onUserChanged: (user: GoogleUser | null) => void): Promise<void> => {
    return new Promise((resolve) => {
        const checkScripts = () => {
            if (typeof (window as any).gapi !== 'undefined' && typeof (window as any).google !== 'undefined') {
                loadGapi(onUserChanged).then(resolve);
            } else {
                setTimeout(checkScripts, 100);
            }
        };
        checkScripts();
    });
};

const loadGapi = async (onUserChanged: (user: GoogleUser | null) => void) => {
    await new Promise<void>((resolve) => {
        (window as any).gapi.load('client', resolve);
    });
    // Khởi tạo GAPI Client (không cần apiKey cho flow này nếu dùng access token)
    await (window as any).gapi.client.init({
        // apiKey: 'YOUR_API_KEY', // Optional for Drive API with User Auth
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiInited = true;

    // Khởi tạo GIS Client
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                // Lấy thông tin user
                await fetchUserInfo(onUserChanged);
            }
        },
    });
    gisInited = true;
    
    // Thử khôi phục session (chỉ hoạt động nếu đã có token trong localStorage hoặc cookie hợp lệ - GIS mới không auto-login im lặng dễ dàng)
    const storedToken = localStorage.getItem('gdrive_token');
    if (storedToken) {
        // Kiểm tra token còn sống không bằng cách gọi API userinfo
        accessToken = storedToken;
        try {
            await fetchUserInfo(onUserChanged);
        } catch {
            accessToken = null;
            localStorage.removeItem('gdrive_token');
            onUserChanged(null);
        }
    }
};

const fetchUserInfo = async (onUserChanged: (user: GoogleUser | null) => void) => {
    if (!accessToken) return;
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.ok) {
            const data = await response.json();
            currentUser = {
                name: data.name,
                email: data.email,
                imageUrl: data.picture,
            };
            localStorage.setItem('gdrive_token', accessToken);
            onUserChanged(currentUser);
        } else {
            throw new Error('Token expired');
        }
    } catch (e) {
        console.warn('Failed to fetch user info', e);
        accessToken = null;
        localStorage.removeItem('gdrive_token');
        onUserChanged(null);
    }
};

export const loginGoogle = () => {
    if (tokenClient) {
        // Prompt user to login.
        // skip_prompt: false force chọn tài khoản để lấy refresh behavior tốt hơn
        tokenClient.requestAccessToken({ prompt: '' });
    } else {
        console.error('GIS client not initialized');
    }
};

export const logoutGoogle = (onUserChanged: (user: GoogleUser | null) => void) => {
    const token = accessToken;
    if (token) {
        (window as any).google.accounts.oauth2.revoke(token, () => {
            console.log('Token revoked');
        });
    }
    accessToken = null;
    currentUser = null;
    localStorage.removeItem('gdrive_token');
    onUserChanged(null);
};

export const isLoggedIn = () => !!accessToken;

// --- Drive Operations ---

const getHeaders = () => {
    return {
        Authorization: `Bearer ${accessToken}`,
    };
};

// Tìm folder ứng dụng, nếu chưa có thì tạo
export const getAppFolderId = async (): Promise<string> => {
    if (!accessToken) throw new Error('Not logged in');

    // Tìm folder
    const q = `mimeType='application/vnd.google-apps.folder' and name='${APP_FOLDER_NAME}' and trashed=false`;
    const response = await (window as any).gapi.client.drive.files.list({
        q: q,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    const files = response.result.files;
    if (files && files.length > 0) {
        return files[0].id;
    }

    // Tạo folder mới
    const fileMetadata = {
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
    };
    const createResponse = await (window as any).gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return createResponse.result.id;
};

// Tìm hoặc tạo folder con (cho từng truyện)
export const getStoryFolderId = async (parentFolderId: string, folderName: string): Promise<string> => {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentFolderId}' in parents and trashed=false`;
    const response = await (window as any).gapi.client.drive.files.list({
        q: q,
        fields: 'files(id)',
    });

    if (response.result.files && response.result.files.length > 0) {
        return response.result.files[0].id;
    }

    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
    };
    const createResponse = await (window as any).gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return createResponse.result.id;
};

// Upload file JSON (Tạo mới hoặc update)
export const uploadJsonFile = async (
    parentId: string,
    fileName: string,
    content: any
): Promise<void> => {
    // Kiểm tra file tồn tại
    const q = `name='${fileName}' and '${parentId}' in parents and trashed=false`;
    const listRes = await (window as any).gapi.client.drive.files.list({
        q: q,
        fields: 'files(id)',
    });

    const fileId = listRes.result.files?.[0]?.id;
    const fileContent = JSON.stringify(content, null, 2);
    const fileMetadata: any = {
        name: fileName,
        mimeType: 'application/json',
    };
    
    if (!fileId) {
        fileMetadata.parents = [parentId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(fileMetadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        fileContent +
        close_delim;

    const request = (window as any).gapi.client.request({
        'path': fileId ? `/upload/drive/v3/files/${fileId}` : '/upload/drive/v3/files',
        'method': fileId ? 'PATCH' : 'POST',
        'params': { 'uploadType': 'multipart' },
        'headers': {
            'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        'body': multipartRequestBody
    });

    await request;
};

// Download file JSON
export const downloadJsonFile = async (parentId: string, fileName: string): Promise<any | null> => {
    // 1. Tìm file ID
    const q = `name='${fileName}' and '${parentId}' in parents and trashed=false`;
    const listRes = await (window as any).gapi.client.drive.files.list({
        q: q,
        fields: 'files(id)',
    });

    const fileId = listRes.result.files?.[0]?.id;
    if (!fileId) return null;

    // 2. Download content
    const response = await (window as any).gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
    });

    return response.result; // Gapi tự parse JSON nếu response header là application/json
};

// List files in folder (dùng cho index)
export const listFilesInFolder = async (folderId: string): Promise<any[]> => {
    const q = `'${folderId}' in parents and trashed=false`;
    const response = await (window as any).gapi.client.drive.files.list({
        q: q,
        fields: 'files(id, name, mimeType)',
        pageSize: 1000,
    });
    return response.result.files || [];
}
