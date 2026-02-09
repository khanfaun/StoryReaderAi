
import { db, auth } from './firebase';
import { doc, getDoc, setDoc, collection, getDocs, writeBatch, serverTimestamp, query, orderBy } from 'firebase/firestore';
import type { Story, Chapter, CharacterStats, CachedChapter } from '../types';
import { saveStory, getStory, saveChapterData, getChapterData, getAllStories } from './dbService';

// Helper tạo ID an toàn từ URL
const createIdFromUrl = (url: string) => {
    return btoa(url).replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
};

// 1. SYNC LIBRARY (Metadata only)
export const syncLibraryFromCloud = async (): Promise<Story[]> => {
    const user = auth.currentUser;
    if (!user) return [];

    try {
        const storiesRef = collection(db, 'users', user.uid, 'stories');
        const q = query(storiesRef, orderBy('updatedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const cloudStories: Story[] = [];
        const localStories = await getAllStories();
        const localMap = new Map(localStories.map(s => [s.url, s]));

        for (const docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            const cloudStory = data.story as Story;
            // Cloud story metadata doesn't include chapters array to save bandwidth
            cloudStory.chapters = []; 
            
            const localStory = localMap.get(cloudStory.url);
            
            // Nếu local chưa có hoặc cloud mới hơn -> Lưu local
            if (!localStory || (data.updatedAt?.toMillis() > (localStory.createdAt || 0))) {
                // Giữ lại chapters cũ của local nếu có, vì cloud metadata ko có chapters
                const mergedStory = {
                    ...cloudStory,
                    chapters: localStory?.chapters || [],
                    source: cloudStory.source || 'Local' // Fallback
                };
                await saveStory(mergedStory);
                cloudStories.push(mergedStory);
            } else {
                cloudStories.push(localStory);
            }
        }
        
        // Merge with local-only stories (optional: push local-only to cloud?)
        // Hiện tại chỉ trả về danh sách đã merge
        return await getAllStories();
    } catch (e) {
        console.error("Sync Library Error:", e);
        return [];
    }
};

// 2. SYNC STORY DETAILS (Chapter List)
export const syncStoryChaptersFromCloud = async (story: Story): Promise<Story> => {
    const user = auth.currentUser;
    if (!user) return story;

    const storyId = createIdFromUrl(story.url);
    const listRef = doc(db, 'users', user.uid, 'stories', storyId, 'meta', 'chapterList');

    try {
        const docSnap = await getDoc(listRef);
        if (docSnap.exists()) {
            const cloudChapters = docSnap.data().chapters as Chapter[];
            if (cloudChapters && cloudChapters.length > (story.chapters?.length || 0)) {
                const updatedStory = { ...story, chapters: cloudChapters };
                await saveStory(updatedStory);
                return updatedStory;
            }
        }
    } catch (e) {
        console.warn("Sync Chapter List Error:", e);
    }
    return story;
};

// 3. FETCH CHAPTER CONTENT (On Demand)
export const fetchChapterFromCloud = async (storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> => {
    const user = auth.currentUser;
    if (!user) return null;

    const storyId = createIdFromUrl(storyUrl);
    const chapterId = createIdFromUrl(chapterUrl);
    const contentRef = doc(db, 'users', user.uid, 'stories', storyId, 'chapter_contents', chapterId);

    try {
        const docSnap = await getDoc(contentRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Lưu xuống Local DB ngay lập tức
            const cachedData: CachedChapter = {
                content: data.content,
                stats: data.stats ? JSON.parse(data.stats) : null
            };
            await saveChapterData(storyUrl, chapterUrl, cachedData);
            return cachedData;
        }
    } catch (e) {
        console.warn("Fetch Chapter Cloud Error:", e);
    }
    return null;
};

// 4. PUSH DATA TO CLOUD (Background)
export const pushStoryToCloud = async (story: Story) => {
    const user = auth.currentUser;
    if (!user) return;

    const storyId = createIdFromUrl(story.url);
    const storyRef = doc(db, 'users', user.uid, 'stories', storyId);
    
    // Tách chapters ra khỏi metadata
    const { chapters, ...metaData } = story;
    
    try {
        await setDoc(storyRef, {
            story: metaData,
            updatedAt: serverTimestamp()
        }, { merge: true });

        if (chapters && chapters.length > 0) {
            const listRef = doc(db, 'users', user.uid, 'stories', storyId, 'meta', 'chapterList');
            await setDoc(listRef, { chapters }, { merge: true });
        }
    } catch (e) {
        console.error("Push Story Error:", e);
    }
};

export const pushChapterToCloud = async (storyUrl: string, chapterUrl: string, data: CachedChapter) => {
    const user = auth.currentUser;
    if (!user) return;

    const storyId = createIdFromUrl(storyUrl);
    const chapterId = createIdFromUrl(chapterUrl);
    const contentRef = doc(db, 'users', user.uid, 'stories', storyId, 'chapter_contents', chapterId);

    try {
        // Chỉ push nội dung nếu chưa tồn tại hoặc update mới (Tiết kiệm write)
        // Ở đây ta cứ push đè (merge) để đơn giản
        await setDoc(contentRef, {
            content: data.content,
            stats: data.stats ? JSON.stringify(data.stats) : null,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error("Push Chapter Error:", e);
    }
};
