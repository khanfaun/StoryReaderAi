
import type { CachedChapter } from '../types';
import * as dbService from './dbService';

/**
 * Lấy dữ liệu chương đã được cache từ IndexedDB.
 * @param storyUrl URL của truyện để tạo khóa cache.
 * @param chapterUrl URL của chương cụ thể.
 * @returns Promise chứa dữ liệu chương đã cache hoặc null nếu không tìm thấy.
 */
export const getCachedChapter = async (storyUrl: string, chapterUrl: string): Promise<CachedChapter | null> => {
  if (!storyUrl || !chapterUrl) return null;
  try {
    const chapterData = await dbService.getChapterData(storyUrl, chapterUrl);
    if (chapterData) {
        return {
            content: chapterData.content,
            stats: chapterData.stats,
        };
    }
    return null;
  } catch (e) {
    console.error("Lỗi khi đọc cache chương từ DB:", e);
    return null;
  }
};

/**
 * Lưu dữ liệu chương vào IndexedDB.
 * @param storyUrl URL của truyện.
 * @param chapterUrl URL của chương.
 * @param data Dữ liệu chương (nội dung và stats) để lưu.
 */
export const setCachedChapter = async (storyUrl: string, chapterUrl: string, data: CachedChapter): Promise<void> => {
  if (!storyUrl || !chapterUrl) return;
  try {
    await dbService.saveChapterData(storyUrl, chapterUrl, data);
  } catch (e) {
    console.error("Lỗi khi ghi cache chương vào DB:", e);
  }
};
