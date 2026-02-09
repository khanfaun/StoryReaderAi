import type { Story, ReadingHistoryItem, Chapter } from '../types';

const HISTORY_KEY = 'novel_reader_history';
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

export function saveReadingHistory(history: ReadingHistoryItem[]): void {
  try {
    const sortedHistory = history.sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
    if (sortedHistory.length > MAX_HISTORY_ITEMS) {
      sortedHistory.length = MAX_HISTORY_ITEMS;
    }

    const rawHistory = JSON.stringify(sortedHistory);
    localStorage.setItem(HISTORY_KEY, rawHistory);

    // Sync to drive in the background (deprecated)
    // saveHistoryToDrive(sortedHistory).catch(err => {
    //   console.warn("Drive Sync (deprecated): Background push failed:", err);
    // });
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