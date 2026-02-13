
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
        const store = dbInstance.createObjectStore(STORY_STORE, { keyPath: 'url' });
        // Index để tìm nhanh các item chưa đồng bộ (dirty)
        store.createIndex('dirty', '_dirty', { unique: false });
      }
      // Store mới để lưu nội dung chương. Key là mảng [storyUrl, chapterUrl] để đảm bảo duy nhất
      if (!dbInstance.objectStoreNames.contains(CHAPTER_STORE)) {
        const store = dbInstance.createObjectStore(CHAPTER_STORE, { keyPath: ['storyUrl', 'chapterUrl'] });
        // Index dirty cho chapter. Lưu ý: IndexedDB không hỗ trợ boolean index tốt trên mọi trình duyệt cũ, nhưng hiện đại thì ổn.
        // Tuy nhiên, vì keyPath là array, việc query index phức tạp hơn. Ta sẽ filter thủ công hoặc dùng cursor.
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

export async function saveStory(story: Story, markDirty: boolean = true): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(STORY_STORE, 'readwrite');
    const store = transaction.objectStore(STORY_STORE);
    
    // Giữ nguyên _syncedAt nếu có, cập nhật _dirty = true
    const storyToSave: Story = {
        ...story,
        createdAt: story.createdAt || Date.now(),
        _dirty: markDirty, // Tick vào checklist
        // Nếu markDirty=false (khi sync về), giữ nguyên syncedAt từ server hoặc cập nhật mới
        // Logic sync sẽ xử lý syncedAt riêng. Ở đây nếu user save -> dirty.
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

// Lấy danh sách các truyện cần đồng bộ lên Drive (_dirty = true)
export async function getDirtyStories(): Promise<Story[]> {
    const stories = await getAllStories();
    return stories.filter(s => s._dirty === true);
}

// Đánh dấu truyện đã được đồng bộ xong (bỏ tick dirty)
export async function markStorySynced(story: Story): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(STORY_STORE, 'readwrite');
    const store = transaction.objectStore(STORY_STORE);
    
    const cleanStory: Story = {
        ...story,
        _dirty: false,
        _syncedAt: Date.now()
    };
    
    store.put(cleanStory);
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// --- CHAPTER CONTENT OPERATIONS ---

export async function saveChapterData(storyUrl: string, chapterUrl: string, data: CachedChapter, markDirty: boolean = true): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readwrite');
    const store = transaction.objectStore(CHAPTER_STORE);
    store.put({ 
        storyUrl, 
        chapterUrl, 
        ...data,
        _dirty: markDirty
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
                const { storyUrl, chapterUrl, ...cachedData } = request.result;
                resolve(cachedData as CachedChapter);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

// Lấy nhiều chương cụ thể theo danh sách URL
export async function getChaptersByUrls(storyUrl: string, chapterUrls: string[]): Promise<Record<string, CachedChapter>> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTER_STORE);
    
    const results: Record<string, CachedChapter> = {};
    
    await Promise.all(chapterUrls.map(url => {
        return new Promise<void>((resolve) => {
            const req = store.get([storyUrl, url]);
            req.onsuccess = () => {
                if (req.result) {
                    const { storyUrl: s, chapterUrl: c, ...data } = req.result;
                    results[url] = data as CachedChapter;
                }
                resolve();
            };
            req.onerror = () => resolve(); // Ignore errors
        });
    }));
    
    return results;
}

// Lấy tất cả chương bẩn cần đồng bộ
// Lưu ý: Do DB có thể rất lớn, ta nên dùng Cursor hoặc lấy theo từng truyện nếu cần tối ưu
// Ở đây dùng getAll đơn giản vì đây là app cá nhân
export async function getAllDirtyChapters(): Promise<(CachedChapter & { storyUrl: string, chapterUrl: string })[]> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTER_STORE);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const all = request.result || [];
            // Filter in memory
            const dirty = all.filter((c: any) => c._dirty === true);
            resolve(dirty);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function markChapterSynced(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {
    // Để mark synced, ta cần lưu lại nhưng với _dirty = false
    await saveChapterData(storyUrl, chapterUrl, {
        ...data,
        _syncedAt: Date.now()
    }, false); // false = not dirty
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

export async function deleteAllStoryChapters(storyUrl: string): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readwrite');
    const store = transaction.objectStore(CHAPTER_STORE);
    
    const range = IDBKeyRange.bound([storyUrl, ''], [storyUrl, '\uffff']);
    const request = store.delete(range);

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function getAllChapterData(storyUrl: string): Promise<(CachedChapter & { chapterUrl: string })[]> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTER_STORE);
    
    const range = IDBKeyRange.bound([storyUrl, ''], [storyUrl, '\uffff']);
    const request = store.getAll(range);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const results = request.result || [];
            const mapped = results.map(item => {
                const { storyUrl: sUrl, ...rest } = item;
                return rest;
            });
            resolve(mapped);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function getCachedChapterUrls(storyUrl: string): Promise<string[]> {
    const db = await openDB();
    const transaction = db.transaction(CHAPTER_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTER_STORE);
    
    const range = IDBKeyRange.bound([storyUrl, ''], [storyUrl, '\uffff']);
    const request = store.getAllKeys(range);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const results = request.result || [];
            const urls = results.map((key: any) => key[1] as string);
            resolve(urls);
        };
        request.onerror = () => reject(request.error);
    });
}


// --- DELETE OPERATIONS ---

export async function deleteEbookAndStory(id: string): Promise<void> {
    const db = await openDB();
    
    const ebookTx = db.transaction(EBOOK_STORE, 'readwrite');
    ebookTx.objectStore(EBOOK_STORE).delete(id);
    await new Promise<void>((res, rej) => { ebookTx.oncomplete = () => res(); ebookTx.onerror = () => rej(ebookTx.error); });
    
    const storyTx = db.transaction(STORY_STORE, 'readwrite');
    storyTx.objectStore(STORY_STORE).delete(id);
    await new Promise<void>((res, rej) => { storyTx.oncomplete = () => res(); storyTx.onerror = () => rej(storyTx.error); });

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
    ebooks: { id: string; data: ArrayBuffer }[]; 
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
