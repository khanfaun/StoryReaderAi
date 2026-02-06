
import type { CharacterStats, InfoItem, NPC, TheLuc, DiaDiem, TuChat, CharacterStatus, Story, CachedChapter } from '../types';
import * as dbService from './dbService';

// Hàm generic để hợp nhất các mảng đối tượng có thuộc tính 'ten' và 'status'
function mergeArray<T extends { ten: string; moTa: string; status?: string }>(
  currentArr: T[] = [],
  chapterArr: T[] = []
): T[] {
  if (!chapterArr || chapterArr.length === 0) {
    return currentArr;
  }
  
  const map = new Map<string, T>(currentArr.map(item => [item.ten.toLowerCase(), { ...item }]));

  chapterArr.forEach(item => {
    const key = item.ten.toLowerCase();
    const existingItem = map.get(key);

    if (existingItem) {
      // Cập nhật tất cả các thuộc tính từ mục mới vào mục hiện có.
      // Điều này đảm bảo `moTa`, `status`, và các thuộc tính mới như `capDo` được cập nhật.
      map.set(key, { ...existingItem, ...item });
    } else {
      // Thêm mục mới, đảm bảo nó có trạng thái 'active' nếu không được chỉ định
      map.set(key, { ...item, status: item.status || 'active' } as T);
    }
  });

  return Array.from(map.values());
}

// Hàm hợp nhất đơn giản hơn cho các mảng chỉ có 'ten' và 'moTa' (như TuChat)
function mergeDescriptiveArray<T extends { ten: string; moTa: string }>(
  currentArr: T[] = [],
  chapterArr: T[] = []
): T[] {
  if (!chapterArr || chapterArr.length === 0) {
    return currentArr;
  }
  
  const map = new Map<string, T>(currentArr.map(item => [item.ten.toLowerCase(), { ...item }]));

  chapterArr.forEach(item => {
    const key = item.ten.toLowerCase();
    const existingItem = map.get(key);

    if (existingItem) {
      // Cập nhật mô tả từ chương mới hơn
      existingItem.moTa = item.moTa;
    } else {
      // Thêm mục mới
      map.set(key, { ...item } as T);
    }
  });

  return Array.from(map.values());
}


/**
 * Hợp nhất trạng thái từ chương mới vào trạng thái tích lũy hiện tại của truyện.
 * @param currentState Trạng thái tích lũy hiện tại.
 * @param chapterStats Trạng thái được phân tích từ chương mới nhất.
 * @returns Trạng thái tích lũy mới.
 */
export function mergeChapterStats(
  currentState: CharacterStats,
  chapterStats: CharacterStats
): CharacterStats {
    const newState: CharacterStats = { ...currentState };

    // Hợp nhất Trạng thái & Đặc tính
    if (chapterStats.trangThai) {
        const newTrangThai: CharacterStatus = {
            // Tên luôn được cập nhật từ chương mới nhất nếu có
            ten: chapterStats.trangThai.ten || currentState.trangThai?.ten || '',
            // Hợp nhất danh sách tư chất
            tuChat: mergeDescriptiveArray<TuChat>(currentState.trangThai?.tuChat, chapterStats.trangThai.tuChat)
        };
        newState.trangThai = newTrangThai;
    }

    if (chapterStats.canhGioi) newState.canhGioi = chapterStats.canhGioi;
    if (chapterStats.viTriHienTai) newState.viTriHienTai = chapterStats.viTriHienTai;

    // Hợp nhất hệ thống cảnh giới: ưu tiên danh sách đầy đủ hơn (dài hơn)
    if ((chapterStats.heThongCanhGioi?.length ?? 0) > (currentState.heThongCanhGioi?.length ?? 0)) {
        newState.heThongCanhGioi = chapterStats.heThongCanhGioi;
    }
    
    // Hợp nhất các danh sách
    newState.balo = mergeArray<InfoItem>(currentState.balo, chapterStats.balo);
    newState.congPhap = mergeArray<InfoItem>(currentState.congPhap, chapterStats.congPhap);
    newState.trangBi = mergeArray<InfoItem>(currentState.trangBi, chapterStats.trangBi);
    newState.npcs = mergeArray<NPC>(currentState.npcs, chapterStats.npcs);
    newState.theLuc = mergeArray<TheLuc>(currentState.theLuc, chapterStats.theLuc);
    newState.diaDiem = mergeArray<DiaDiem>(currentState.diaDiem, chapterStats.diaDiem);
    
    return newState;
}

const getStoryStateKey = (storyUrl: string) => `storyState_${storyUrl}`;

/**
 * Lấy trạng thái tích lũy của truyện từ localStorage.
 * @param storyUrl URL của truyện.
 * @returns Trạng thái đã lưu hoặc null.
 */
export const getStoryState = (storyUrl: string): CharacterStats | null => {
    try {
        const rawState = localStorage.getItem(getStoryStateKey(storyUrl));
        return rawState ? JSON.parse(rawState) : null;
    } catch (e) {
        console.error("Lỗi khi tải trạng thái truyện:", e);
        // Nếu có lỗi, xóa trạng thái hỏng
        localStorage.removeItem(getStoryStateKey(storyUrl));
        return null;
    }
};

/**
 * Lưu trạng thái tích lũy của truyện vào localStorage.
 * @param storyUrl URL của truyện.
 * @param state Trạng thái cần lưu.
 */
export const saveStoryState = (storyUrl: string, state: CharacterStats): void => {
    try {
        localStorage.setItem(getStoryStateKey(storyUrl), JSON.stringify(state));
    } catch (e) {
        console.error("Lỗi khi lưu trạng thái truyện:", e);
    }
};

// ==========================================================
// SHARED EXPORT / IMPORT LOGIC
// ==========================================================

/**
 * Xuất toàn bộ dữ liệu của truyện, bao gồm:
 * 1. Trạng thái tích lũy (LocalStorage)
 * 2. Danh sách chương đã đọc (LocalStorage)
 * 3. Dữ liệu Cache của từng chương (IndexedDB) - QUAN TRỌNG
 */
export const exportStoryData = async (story: Story): Promise<void> => {
    if (!story) return;
    
    try {
        // 1. Get Cumulative Stats
        const stats = getStoryState(story.url);
        
        // 2. Get Read Chapters List
        const readChaptersRaw = localStorage.getItem(`readChapters_${story.url}`);
        const readChapters = readChaptersRaw ? JSON.parse(readChaptersRaw) : [];

        // 3. Get Cached Chapters Data from IndexedDB (Snapshot per chapter)
        const cachedChapters = await dbService.getAllChapterData(story.url);

        if (!stats && readChapters.length === 0 && cachedChapters.length === 0) {
            alert("Truyện này chưa có dữ liệu nào để xuất.");
            return;
        }

        const saveData = {
            version: 2, // Bump version to 2 to indicate cachedChapters support
            timestamp: new Date().toISOString(),
            data: {
                readingHistory: null,
                readingSettings: null,
                storyStates: {
                    [story.url]: {
                        stats: stats,
                        readChapters: readChapters,
                        cachedChapters: cachedChapters // Include cache here
                    }
                }
            }
        };

        const jsonString = JSON.stringify(saveData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `${story.title} - Full AI Data_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (e) {
        console.error("Export Error:", e);
        alert(`Lỗi khi xuất dữ liệu: ${(e as Error).message}`);
    }
};

/**
 * Nhập dữ liệu truyện từ file JSON.
 * Hỗ trợ khôi phục cả cache IndexedDB.
 */
export const importStoryData = async (file: File, story: Story, onSuccess?: () => void): Promise<void> => {
    if (!file || !story) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const text = event.target?.result;
            if (typeof text !== 'string') throw new Error('File content is not text.');
            
            const json = JSON.parse(text);
            
            // Validate Structure
            if (json.data && json.data.storyStates) {
                // Try to find data for THIS story
                let targetData = json.data.storyStates[story.url];
                
                // Fallback: If URL doesn't match, verify if there's only 1 story in the file
                if (!targetData) {
                    const keys = Object.keys(json.data.storyStates);
                    if (keys.length === 1) {
                        targetData = json.data.storyStates[keys[0]];
                        console.log("Importing from different URL source (Single Entry Match):", keys[0]);
                    }
                }

                if (targetData) {
                    // 1. Restore Cumulative Stats
                    if (targetData.stats) {
                        saveStoryState(story.url, targetData.stats as CharacterStats);
                    }
                    
                    // 2. Restore Read Chapters List
                    if (targetData.readChapters) {
                        localStorage.setItem(`readChapters_${story.url}`, JSON.stringify(targetData.readChapters));
                    }
                    
                    // 3. Restore Cached Chapters (IndexedDB)
                    if (targetData.cachedChapters && Array.isArray(targetData.cachedChapters)) {
                        const chaptersToRestore = targetData.cachedChapters as (CachedChapter & { chapterUrl: string })[];
                        
                        // Use sequential writes to avoid overwhelming DB transaction if array is huge
                        for (const chapData of chaptersToRestore) {
                            if (chapData.chapterUrl) {
                                await dbService.saveChapterData(story.url, chapData.chapterUrl, {
                                    content: chapData.content,
                                    stats: chapData.stats
                                });
                            }
                        }
                    }
                    
                    alert("Đã nhập dữ liệu thành công (bao gồm cả dữ liệu từng chương)!");
                    if (onSuccess) onSuccess();
                } else {
                    alert("File hợp lệ nhưng không tìm thấy dữ liệu cho truyện này (URL không khớp).");
                }
            } else if (typeof json === 'object' && (json.trangThai || json.npcs || json.balo)) {
                 // Legacy format support
                 saveStoryState(story.url, json as CharacterStats);
                 alert("Đã nhập dữ liệu thành công! (Legacy Format - Chỉ có trạng thái tổng)");
                 if (onSuccess) onSuccess();
            } else {
                throw new Error("Cấu trúc file không nhận diện được.");
            }
        } catch (err) {
            console.error("Import Error:", err);
            alert(`Lỗi nhập file: ${(err as Error).message}`);
        }
    };
    reader.readAsText(file);
};
