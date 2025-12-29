
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
    // We iterate using a cursor or key range. Since CHAPTER_STORE key is [storyUrl, chapterUrl], 
    // we use an IDBKeyRange.bound if supported, but key path is array.
    // IDBKeyRange on array keys compares items. [id, -infinity] to [id, infinity].
    
    const chapTx = db.transaction(CHAPTER_STORE, 'readwrite');
    const chapStore = chapTx.objectStore(CHAPTER_STORE);
    
    // Using IDBKeyRange.bound for array keys is tricky with standard JS strings.
    // Simpler approach: Iterate all and delete matches (performance hit but safe for small DBs).
    // Or use lower/upper bound correctly.
    // For [storyUrl, chapterUrl], all keys starting with storyUrl will be grouped.
    
    const range = IDBKeyRange.bound([id, ''], [id, '\uffff']);
    const request = chapStore.delete(range);

    await new Promise<void>((res, rej) => { 
        request.onsuccess = () => res(); 
        request.onerror = () => rej(request.error); 
    });
}