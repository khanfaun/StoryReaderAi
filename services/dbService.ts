
import type { Story, CachedChapter } from '../types';

const DB_NAME = 'EbookReaderDB';
const DB_VERSION = 2; // Tăng version để thêm store mới
const EBOOK_STORE = 'ebooks'; // Stores ArrayBuffer of the ebook file
const STORY_STORE = 'stories'; // Stores Story metadata object
const CHAPTER_STORE = 'chapters'; // Stores Chapter content & stats

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Lỗi khi mở IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      
      if (!dbInstance.objectStoreNames.contains(EBOOK_STORE)) {
        dbInstance.createObjectStore(EBOOK_STORE, { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains(STORY_STORE)) {
        dbInstance.createObjectStore(STORY_STORE, { keyPath: 'url' });
      }
      // Store mới để lưu nội dung chương. Key là mảng [storyUrl, chapterUrl] để đảm bảo duy nhất
      if (!dbInstance.objectStoreNames.contains(CHAPTER_STORE)) {
        dbInstance.createObjectStore(CHAPTER_STORE, { keyPath: ['storyUrl', 'chapterUrl'] });
      }
    };
  });
}

// --- EBOOK FILE OPERATIONS ---

export async function saveEbook(id: string, file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const db = await openDB();
    const transaction = db.transaction(EBOOK_STORE, 'readwrite');
    const store = transaction.objectStore(EBOOK_STORE);
    store.put({ id, data: arrayBuffer });

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function getEbookAsArrayBuffer(id: string): Promise<ArrayBuffer | null> {
    const db = await openDB();
    const transaction = db.transaction(EBOOK_STORE, 'readonly');
    const store = transaction.objectStore(EBOOK_STORE);
    const request = store.get(id);
    
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result ? request.result.data : null);
        };
        request.onerror = () => reject(request.error);
    });
}

// --- STORY METADATA OPERATIONS ---

export async function saveStory(story: Story): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(STORY_STORE, 'readwrite');
    const store = transaction.objectStore(STORY_STORE);
    
    // Ensure createdAt is present
    const storyToSave = {
        ...story,
        createdAt: story.createdAt || Date.now()
    };

    store.put(storyToSave);
    
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function getStory(id: string): Promise<Story | null> {
    const db = await openDB();
    const transaction = db.transaction(STORY_STORE, 'readonly');
    const store = transaction.objectStore(STORY_STORE);
    const request = store.get(id);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result || null);
        };
        request.onerror = () => reject(request.error);
    });
}


export async function getAllStories(): Promise<Story[]> {
    const db = await openDB();
    const transaction = db.transaction(STORY_STORE, 'readonly');
    const store = transaction.objectStore(STORY_STORE);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result || []);
        };
        request.onerror = () => reject(request.error);
    });
}

// --- CHAPTER CONTENT OPERATIONS ---

export async function saveChapterData(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readwrite');
    const store = transaction.objectStore(CHAPTER_STORE);
    store.put({ 
        storyUrl, 
        chapterUrl, 
        ...data 
    });
    
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function getChapterData(storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTER_STORE);
    const request = store.get([storyUrl, chapterUrl]);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            if (request.result) {
                // Return the full object, which now includes audioChunks if available
                const { storyUrl, chapterUrl, ...cachedData } = request.result;
                resolve(cachedData as CachedChapter);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function deleteChapterData(storyUrl: string, chapterUrl: string): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readwrite');
    const store = transaction.objectStore(CHAPTER_STORE);
    const request = store.delete([storyUrl, chapterUrl]);

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Lấy tất cả dữ liệu chương (bao gồm stats snapshot) của một truyện.
 * Dùng cho tính năng Xuất/Backup dữ liệu.
 */
export async function getAllChapterData(storyUrl: string): Promise<(CachedChapter & { chapterUrl: string })[]> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTER_STORE);
    
    // Tạo range tìm kiếm tất cả record có storyUrl khớp
    const range = IDBKeyRange.bound([storyUrl, ''], [storyUrl, '\uffff']);
    const request = store.getAll(range);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const results = request.result || [];
            // Map kết quả về đúng format
            const mapped = results.map(item => {
                const { storyUrl: sUrl, ...rest } = item;
                return rest;
            });
            resolve(mapped);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Lấy danh sách URL các chương đã được cache của một truyện.
 * Dùng để hiển thị dấu tick "Đã tải" trên giao diện.
 */
export async function getCachedChapterUrls(storyUrl: string): Promise<string[]> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTER_STORE);
    
    const range = IDBKeyRange.bound([storyUrl, ''], [storyUrl, '\uffff']);
    // Dùng getAllKeys để tối ưu hiệu năng, không load nội dung
    const request = store.getAllKeys(range);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const results = request.result || [];
            // Kết quả là mảng các key: [storyUrl, chapterUrl]
            // Ta chỉ cần lấy phần tử thứ 2 (chapterUrl)
            const urls = results.map((key: any) => key[1] as string);
            resolve(urls);
        };
        request.onerror = () => reject(request.error);
    });
}


// --- DELETE OPERATIONS ---

export async function deleteEbookAndStory(id: string): Promise<void> {
    const db = await openDB();
    
    // 1. Delete Ebook File (if exists)
    const ebookTx = db.transaction(EBOOK_STORE, 'readwrite');
    ebookTx.objectStore(EBOOK_STORE).delete(id);
    await new Promise<void>((res, rej) => { ebookTx.oncomplete = () => res(); ebookTx.onerror = () => rej(ebookTx.error); });
    
    // 2. Delete Story Metadata
    const storyTx = db.transaction(STORY_STORE, 'readwrite');
    storyTx.objectStore(STORY_STORE).delete(id);
    await new Promise<void>((res, rej) => { storyTx.oncomplete = () => res(); storyTx.onerror = () => rej(storyTx.error); });

    // 3. Delete ALL Chapter Contents associated with this story
    const chapTx = db.transaction(CHAPTER_STORE, 'readwrite');
    const chapStore = chapTx.objectStore(CHAPTER_STORE);
    
    const range = IDBKeyRange.bound([id, ''], [id, '\uffff']);
    const request = chapStore.delete(range);

    await new Promise<void>((res, rej) => { 
        request.onsuccess = () => res(); 
        request.onerror = () => rej(request.error); 
    });
}

// --- FULL BACKUP/RESTORE OPERATIONS (FOR DRIVE SYNC) ---

export interface FullBackupData {
    stories: Story[];
    chapters: any[];
    ebooks: { id: string; data: ArrayBuffer }[]; // Warning: This can be huge
}

export async function exportDatabase(): Promise<FullBackupData> {
    const db = await openDB();
    const transaction = db.transaction([STORY_STORE, CHAPTER_STORE, EBOOK_STORE], 'readonly');
    
    const storiesReq = transaction.objectStore(STORY_STORE).getAll();
    const chaptersReq = transaction.objectStore(CHAPTER_STORE).getAll();
    const ebooksReq = transaction.objectStore(EBOOK_STORE).getAll();

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve({
                stories: storiesReq.result,
                chapters: chaptersReq.result,
                ebooks: ebooksReq.result
            });
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function importDatabase(data: FullBackupData): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction([STORY_STORE, CHAPTER_STORE, EBOOK_STORE], 'readwrite');
    
    // Clear existing data? Let's use put to overwrite/add
    const storyStore = transaction.objectStore(STORY_STORE);
    if (data.stories) {
        for (const s of data.stories) storyStore.put(s);
    }

    const chapterStore = transaction.objectStore(CHAPTER_STORE);
    if (data.chapters) {
        for (const c of data.chapters) chapterStore.put(c);
    }

    const ebookStore = transaction.objectStore(EBOOK_STORE);
    if (data.ebooks) {
        for (const e of data.ebooks) ebookStore.put(e);
    }

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}
