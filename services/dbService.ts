import type { Story } from '../types';

const DB_NAME = 'EbookReaderDB';
const DB_VERSION = 1;
const EBOOK_STORE = 'ebooks'; // Stores ArrayBuffer of the ebook file
const STORY_STORE = 'stories'; // Stores Story metadata object

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
    };
  });
}

export async function saveEbook(id: string, file: File): Promise<void> {
    // FIX: Perform the async file reading *before* starting the transaction
    // to prevent it from closing prematurely.
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

export async function saveStory(story: Story): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(STORY_STORE, 'readwrite');
    const store = transaction.objectStore(STORY_STORE);
    store.put(story);
    
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


export async function deleteEbookAndStory(id: string): Promise<void> {
    const db = await openDB();
    const ebookTx = db.transaction(EBOOK_STORE, 'readwrite');
    ebookTx.objectStore(EBOOK_STORE).delete(id);
    
    const storyTx = db.transaction(STORY_STORE, 'readwrite');
    storyTx.objectStore(STORY_STORE).delete(id);

    return Promise.all([
        new Promise<void>((res, rej) => { ebookTx.oncomplete = () => res(); ebookTx.onerror = () => rej(ebookTx.error); }),
        new Promise<void>((res, rej) => { storyTx.oncomplete = () => res(); storyTx.onerror = () => rej(storyTx.error); })
    ]).then(() => {});
}