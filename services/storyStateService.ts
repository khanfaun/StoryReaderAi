import type { CharacterStats, InfoItem, NPC, TheLuc, DiaDiem, TuChat, CharacterStatus, QuanHe } from '../types';

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

// Hàm hợp nhất mảng quan hệ
function mergeRelationships(
  currentArr: QuanHe[] = [],
  chapterArr: QuanHe[] = []
): QuanHe[] {
  if (!chapterArr || chapterArr.length === 0) {
    return currentArr;
  }
  
  const map = new Map<string, QuanHe>();

  // Helper to create a consistent key for a relationship
  const getKey = (item: QuanHe) => [item.nhanVat1.toLowerCase(), item.nhanVat2.toLowerCase()].sort().join('--');

  currentArr.forEach(item => {
    map.set(getKey(item), { ...item });
  });

  chapterArr.forEach(item => {
    const key = getKey(item);
    // Luôn cập nhật mô tả mới nhất từ chương hiện tại
    map.set(key, { ...item });
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
    newState.quanHe = mergeRelationships(currentState.quanHe, chapterStats.quanHe);
    
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