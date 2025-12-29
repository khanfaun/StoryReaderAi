
import type { Story, Chapter } from '../types';
import { saveStory } from './dbService';

const generateChapters = (storyUrl: string, count: number): Chapter[] => {
  return Array.from({ length: count }, (_, i) => ({
    title: `Chương ${i + 1}: Nội dung demo số ${i + 1}`,
    url: `${storyUrl}/chuong-${i + 1}`
  }));
};

const DEMO_STORIES: Story[] = [
  // --- 5 Truyện Fetch (Mô phỏng nguồn Web) ---
  {
    title: "Phàm Nhân Tu Tiên",
    author: "Vong Ngữ",
    description: "Một phàm nhân bình thường tu tiên như thế nào? Tiên hiệp cổ điển, logic chặt chẽ.",
    imageUrl: "https://static.truyenfull.vn/poster/pham-nhan-tu-tien-290520.jpg",
    source: "TruyenFull.vn",
    url: "https://truyenfull.vn/pham-nhan-tu-tien/",
    tags: ["Tiên Hiệp", "Kiếm Hiệp", "Cổ Điển"],
    createdAt: Date.now() - 1000000,
    chapters: generateChapters("https://truyenfull.vn/pham-nhan-tu-tien/", 10)
  },
  {
    title: "Quỷ Bí Chi Chủ",
    author: "Ái Tiềm Thủy Đích Ô Tặc",
    description: "Hơi nước cùng máy móc làn sóng bên trong, ai có thể đụng vào phi phàm? Thế giới Lovecraftian huyền bí.",
    imageUrl: "https://truyen.tangthuvien.net/images/book/quy-bi-chi-chu.jpg",
    source: "TangThuVien.net",
    url: "https://truyen.tangthuvien.net/doc-truyen/quy-bi-chi-chu",
    tags: ["Huyền Huyễn", "Dị Giới", "Phương Tây"],
    createdAt: Date.now() - 800000,
    chapters: generateChapters("https://truyen.tangthuvien.net/doc-truyen/quy-bi-chi-chu", 10)
  },
  {
    title: "Cổ Chân Nhân",
    author: "Cổ Chân Nhân",
    description: "Câu chuyện về một đại ma đầu trọng sinh, làm việc không từ thủ đoạn để đạt được mục đích.",
    imageUrl: "https://static.truyenfull.vn/poster/co-chan-nhan.jpg",
    source: "TruyenFull.vn",
    url: "https://truyenfull.vn/co-chan-nhan/",
    tags: ["Tiên Hiệp", "Trọng Sinh", "Phản Diện"],
    createdAt: Date.now() - 600000,
    chapters: generateChapters("https://truyenfull.vn/co-chan-nhan/", 10)
  },
  {
    title: "Đạo Giới Thiên Hạ",
    author: "Dạ Mưu",
    description: "Đạo giới mênh mông, thiên hạ ai người xưng bá? (Truyện demo mô phỏng)",
    imageUrl: "https://picsum.photos/400/600?random=1",
    source: "TangThuVien.net",
    url: "https://truyen.tangthuvien.net/doc-truyen/dao-gioi-thien-ha-demo",
    tags: ["Huyền Huyễn", "Tu Chân"],
    createdAt: Date.now() - 400000,
    chapters: generateChapters("https://truyen.tangthuvien.net/doc-truyen/dao-gioi-thien-ha-demo", 10)
  },
  {
    title: "Thâm Không Bỉ Ngạn",
    author: "Thần Đông",
    description: "Vũ trụ mênh mông, bỉ ngạn ở phương nào? Tác phẩm mới của Thần Đông.",
    imageUrl: "https://static.truyenfull.vn/poster/tham-khong-bi-ngan.jpg",
    source: "TruyenFull.vision",
    url: "https://truyenfull.vision/tham-khong-bi-ngan/",
    tags: ["Đô Thị", "Huyền Huyễn", "Viễn Tưởng"],
    createdAt: Date.now() - 200000,
    chapters: generateChapters("https://truyenfull.vision/tham-khong-bi-ngan/", 10)
  },

  // --- 5 Truyện Tự Thêm (Local) ---
  {
    title: "Nhật Ký Code Dạo",
    author: "Tôi",
    description: "Ghi chép lại những ngày tháng fix bug thâu đêm suốt sáng. Một câu chuyện bi hài kịch.",
    imageUrl: "https://picsum.photos/400/600?random=2",
    source: "Local",
    url: "local:nhat-ky-code-dao",
    tags: ["Đời Thường", "Hài Hước", "Công Nghệ"],
    createdAt: Date.now() - 90000,
    chapters: generateChapters("local:nhat-ky-code-dao", 10)
  },
  {
    title: "Hệ Thống Bán Bún Riêu",
    author: "Người Qua Đường",
    description: "Xuyên không về cổ đại nhưng lại mang theo hệ thống bán bún riêu. Chinh phục thiên hạ bằng ẩm thực.",
    imageUrl: "https://picsum.photos/400/600?random=3",
    source: "Local",
    url: "local:he-thong-bun-rieu",
    tags: ["Hệ Thống", "Xuyên Không", "Ẩm Thực"],
    createdAt: Date.now() - 70000,
    chapters: generateChapters("local:he-thong-bun-rieu", 10)
  },
  {
    title: "Đại Ma Đầu Nhà Bên",
    author: "Hàng Xóm",
    description: "Cô hàng xóm xinh đẹp lại là trùm phản diện của thế giới ngầm?",
    imageUrl: "https://picsum.photos/400/600?random=4",
    source: "Local",
    url: "local:dai-ma-dau-nha-ben",
    tags: ["Đô Thị", "Lãng Mạn", "Hài Hước"],
    createdAt: Date.now() - 50000,
    chapters: generateChapters("local:dai-ma-dau-nha-ben", 10)
  },
  {
    title: "Bí Kíp Luyện Rồng",
    author: "Dragon Master",
    description: "Hướng dẫn chi tiết cách nuôi dạy rồng từ lúc mới nở đến khi trưởng thành.",
    imageUrl: "https://picsum.photos/400/600?random=5",
    source: "Local",
    url: "local:bi-kip-luyen-rong",
    tags: ["Fantasy", "Phiêu Lưu"],
    createdAt: Date.now() - 30000,
    chapters: generateChapters("local:bi-kip-luyen-rong", 10)
  },
  {
    title: "Ghi Chú Ý Tưởng",
    author: "Tôi",
    description: "Nơi lưu trữ các ý tưởng truyện chưa thành hình.",
    imageUrl: "", // Không có ảnh
    source: "Local",
    url: "local:ghi-chu-y-tuong",
    tags: ["Ghi Chú", "Khác"],
    createdAt: Date.now() - 10000,
    chapters: generateChapters("local:ghi-chu-y-tuong", 10)
  }
];

export const injectDemoData = async (): Promise<void> => {
  console.log("Bắt đầu nạp dữ liệu demo...");
  for (const story of DEMO_STORIES) {
    await saveStory(story);
  }
  console.log("Đã nạp xong 10 truyện demo.");
};
