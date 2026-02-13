
import type { Story, ReadingHistoryItem, Chapter } from '../types';

const HISTORY_KEY = 'novel_reader_history';
const HISTORY_DIRTY_KEY = 'novel_reader_history_dirty';
const MAX_HISTORY_ITEMS = 20;

export function getReadingHistory(): ReadingHistoryItem[] {
  try {
    const rawHistory = localStorage.getItem(HISTORY_KEY);
    if (!rawHistory) return [];
    const history = JSON.parse(rawHistory) as ReadingHistoryItem[];
    // Sắp xếp lại vì dữ liệu cũ có thể không được sắp xếp
    return history.sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
  } catch (error) {
    console.error("Error reading history:", error);
    localStorage.removeItem(HISTORY_KEY);
    return [];
  }
}

// Helper to check if history is dirty (needs sync)
export function isHistoryDirty(): boolean {
    return localStorage.getItem(HISTORY_DIRTY_KEY) === 'true';
}

export function markHistorySynced(): void {
    localStorage.removeItem(HISTORY_DIRTY_KEY);
}

export function saveReadingHistory(history: ReadingHistoryItem[]): void {
  try {
    const sortedHistory = history.sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
    if (sortedHistory.length > MAX_HISTORY_ITEMS) {
      sortedHistory.length = MAX_HISTORY_ITEMS;
    }

    const rawHistory = JSON.stringify(sortedHistory);
    localStorage.setItem(HISTORY_KEY, rawHistory);
    // Mark as dirty whenever we save
    localStorage.setItem(HISTORY_DIRTY_KEY, 'true');
  } catch (error) {
    console.error("Error saving history:", error);
  }
}

export function updateReadingHistory(story: Story, chapter: Chapter): ReadingHistoryItem[] {
  const history = getReadingHistory();
  const now = Date.now();

  const existingIndex = history.findIndex(item => item.url === story.url);

  if (existingIndex > -1) {
    const item = history[existingIndex];
    item.lastChapterUrl = chapter.url;
    item.lastChapterTitle = chapter.title;
    item.lastReadTimestamp = now;
    item.lastScrollPosition = 0; // Reset scroll when changing chapter
    item.lastParagraphIndex = 0; // Reset paragraph index
    // Move to top by removing and re-adding
    history.splice(existingIndex, 1);
    history.unshift(item);
  } else {
    const newItem: ReadingHistoryItem = {
      title: story.title,
      author: story.author,
      url: story.url,
      source: story.source,
      imageUrl: story.imageUrl,
      lastChapterUrl: chapter.url,
      lastChapterTitle: chapter.title,
      lastReadTimestamp: now,
      lastScrollPosition: 0,
      lastParagraphIndex: 0,
    };
    history.unshift(newItem);
  }

  // Limit number of history items
  if (history.length > MAX_HISTORY_ITEMS) {
    history.length = MAX_HISTORY_ITEMS;
  }
  
  saveReadingHistory(history);
  return history;
}

export function saveReadingPosition(storyUrl: string, scrollPercentage: number, paragraphIndex: number): void {
    const history = getReadingHistory();
    const existingIndex = history.findIndex(item => item.url === storyUrl);

    if (existingIndex > -1) {
        history[existingIndex].lastScrollPosition = scrollPercentage;
        history[existingIndex].lastParagraphIndex = paragraphIndex;
        history[existingIndex].lastReadTimestamp = Date.now();
        // Direct save without re-sort to avoid performance hit on scroll
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        // Mark dirty for sync
        localStorage.setItem(HISTORY_DIRTY_KEY, 'true');
    }
}
