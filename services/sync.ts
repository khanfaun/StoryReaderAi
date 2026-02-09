
import type { Story, ReadingHistoryItem, CharacterStats, CachedChapter } from '../types';
import * as driveService from './googleDriveService';
import * as dbService from './dbService';
import { getReadingHistory, saveReadingHistory } from './history';
import { getStoryState, saveStoryState } from './storyStateService';

// Filenames conventions
const HISTORY_FILE = 'reading_history.json';
const SETTINGS_FILE = 'user_settings.json';
const STORY_PREFIX = 'story_metadata_'; 

// Helper to sanitize filename
const getStoryFileName = (storyUrl: string) => `${STORY_PREFIX}${storyUrl.replace(/[^a-zA-Z0-9]/g, '_')}.json`;

export interface SyncProgressCallback {
    (message: string): void;
}

/**
 * Main Sync Function
 */
export async function syncAllData(onProgress: SyncProgressCallback): Promise<boolean> {
    try {
        onProgress("Đang kết nối đến Google Drive...");
        const files = await driveService.listFiles();
        const fileMap = new Map(files.map(f => [f.name, f]));

        // 1. SYNC HISTORY
        onProgress("Đang đồng bộ lịch sử đọc...");
        await syncHistory(fileMap.get(HISTORY_FILE));

        // 2. SYNC STORIES (METADATA + AI STATE)
        // Get all local stories
        const localStories = await dbService.getAllStories();
        
        // Identify Drive Story Files
        const driveStoryFiles = files.filter(f => f.name.startsWith(STORY_PREFIX));
        
        // A. Upload Local Stories (that don't exist or are newer on local)
        // Note: For simplicity in V1, we assume if Local exists, we push to Cloud if Cloud is missing.
        // Real conflict resolution requires timestamps which we can add later.
        
        onProgress(`Đang kiểm tra ${localStories.length} truyện trong thư viện...`);
        
        for (const story of localStories) {
            const fileName = getStoryFileName(story.url);
            const driveFile = fileMap.get(fileName);
            const aiState = getStoryState(story.url);
            
            // Construct payload: Story Metadata + AI State + Chapter Reading Status
            const payload = {
                story: story,
                aiState: aiState,
                readChapters: localStorage.getItem(`readChapters_${story.url}`) ? JSON.parse(localStorage.getItem(`readChapters_${story.url}`)!) : [],
                lastModified: Date.now()
            };

            if (!driveFile) {
                onProgress(`Đang tải lên: ${story.title}...`);
                await driveService.uploadJsonFile(fileName, payload);
            } else {
                // Check timestamp (Simplistic: Client wins if modified recently)
                // TODO: Implement proper merge. For now, we update Cloud to match Local.
                // onProgress(`Đang cập nhật: ${story.title}...`);
                // await driveService.uploadJsonFile(fileName, payload, driveFile.id);
            }
        }

        // B. Download New Stories from Drive (that are not in Local)
        for (const driveFile of driveStoryFiles) {
            // Check if we have this locally
            const isLocal = localStories.some(s => getStoryFileName(s.url) === driveFile.name);
            
            if (!isLocal) {
                onProgress(`Đang tải về: ${driveFile.name}...`);
                const content = await driveService.downloadFile(driveFile.id);
                
                if (content && content.story) {
                    // Save Story
                    await dbService.saveStory(content.story);
                    // Save AI State
                    if (content.aiState) {
                        saveStoryState(content.story.url, content.aiState);
                    }
                    // Save Read Chapters
                    if (content.readChapters) {
                        localStorage.setItem(`readChapters_${content.story.url}`, JSON.stringify(content.readChapters));
                    }
                }
            }
        }

        onProgress("Đồng bộ hoàn tất!");
        return true;
    } catch (e) {
        console.error("Sync Error:", e);
        onProgress(`Lỗi: ${(e as Error).message}`);
        return false;
    }
}

/**
 * Check if a specific story exists on Drive and return its data if found.
 * Used for auto-syncing when opening a story not present locally.
 */
export async function checkAndLoadStoryFromDrive(storyUrl: string): Promise<any | null> {
    try {
        const fileName = getStoryFileName(storyUrl);
        const files = await driveService.listFiles();
        const targetFile = files.find(f => f.name === fileName);

        if (targetFile) {
            const content = await driveService.downloadFile(targetFile.id);
            return content;
        }
        return null;
    } catch (e) {
        console.error("Error checking story on Drive:", e);
        return null; // Fail silently to allow fallback to web fetch
    }
}

/**
 * Upload a specific story to Google Drive immediately.
 * Checks if file exists first to avoid duplicates.
 */
export async function uploadStoryToDrive(story: Story): Promise<void> {
    try {
        const fileName = getStoryFileName(story.url);
        
        // Check if file already exists on Drive to prevent duplicates/errors
        const files = await driveService.listFiles();
        const existingFile = files.find(f => f.name === fileName);

        const aiState = getStoryState(story.url);
        
        const payload = {
            story: story,
            aiState: aiState,
            readChapters: localStorage.getItem(`readChapters_${story.url}`) ? JSON.parse(localStorage.getItem(`readChapters_${story.url}`)!) : [],
            lastModified: Date.now()
        };

        if (existingFile) {
            await driveService.uploadJsonFile(fileName, payload, existingFile.id);
        } else {
            await driveService.uploadJsonFile(fileName, payload);
        }
    } catch (e) {
        console.error("Single Story Upload Error:", e);
        throw e;
    }
}

async function syncHistory(driveFile: any) {
    const localHistory = getReadingHistory();
    
    if (!driveFile) {
        // Upload local to drive
        if (localHistory.length > 0) {
            await driveService.uploadJsonFile(HISTORY_FILE, localHistory);
        }
    } else {
        // Download from drive and merge
        const cloudHistory: ReadingHistoryItem[] = await driveService.downloadFile(driveFile.id);
        if (Array.isArray(cloudHistory)) {
            // Merge logic: Combine and deduplicate by URL, keeping most recent
            const mergedMap = new Map();
            [...cloudHistory, ...localHistory].forEach(item => {
                const existing = mergedMap.get(item.url);
                if (!existing || item.lastReadTimestamp > existing.lastReadTimestamp) {
                    mergedMap.set(item.url, item);
                }
            });
            const merged = Array.from(mergedMap.values()).sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
            saveReadingHistory(merged);
            
            // Sync back result to cloud
            await driveService.uploadJsonFile(HISTORY_FILE, merged, driveFile.id);
        }
    }
}

// Deprecated placeholders for old calls
export async function saveHistoryToDrive(history: ReadingHistoryItem[]): Promise<void> {}
export async function loadHistoryFromDrive(): Promise<ReadingHistoryItem[] | null> { return null; }
export async function saveStoryStateToDrive(storyUrl: string, state: CharacterStats): Promise<void> {}
export async function loadStoryStateFromDrive(storyUrl: string): Promise<CharacterStats | null> { return null; }
export async function saveChapterToDrive(storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> {}
export async function loadChapterFromDrive(storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> { return null; }
