import type { Story, ReadingHistoryItem } from '../types';
import { saveHistoryToDrive } from './sync';

const HISTORY_KEY = 'novel_reader_history';
const MAX_HISTORY_ITEMS = 20;

export function getReadingHistory(): ReadingHistoryItem[] {
  try {
    const rawHistory = localStorage.getItem(HISTORY_KEY);
    if (!rawHistory) return [];
    const history = JSON.parse(rawHistory) as ReadingHistoryItem[];
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

    // Sync to drive in the background
    saveHistoryToDrive(sortedHistory).catch(err => {
      console.error("Drive Sync: Background push failed:", err);
    });
  } catch (error) {
    console.error("Error saving history:", error);
  }
}

export function updateReadingHistory(story: Story, lastChapterUrl: string): ReadingHistoryItem[] {
  const history = getReadingHistory();
  const now = Date.now();

  const existingIndex = history.findIndex(item => item.url === story.url);

  if (existingIndex > -1) {
    const item = history[existingIndex];
    item.lastChapterUrl = lastChapterUrl;
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
      lastChapterUrl: lastChapterUrl,
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
