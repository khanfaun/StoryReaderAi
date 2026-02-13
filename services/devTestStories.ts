
import type { Story, Chapter } from '../types';
import * as dbService from './dbService';

// Hàm tạo nội dung giả lập cho chương
const generateContent = (storyName: string, chapterNum: number): string => {
    return `
    Nội dung demo cho ${storyName} - Chương ${chapterNum}.
    
    Đây là dữ liệu được sinh ra để kiểm thử tính năng đọc truyện.
    
    Đoạn 1: Giới thiệu bối cảnh. Trời trong xanh, mây trắng bay, nhân vật chính xuất hiện với khí thế bất phàm.
    
    Đoạn 2: Diễn biến câu chuyện. Nhân vật chính bắt đầu hành trình tu luyện, gặp gỡ những người bạn mới và đối mặt với thử thách đầu tiên.
    
    Đoạn 3: Cao trào. Một sự kiện bất ngờ xảy ra làm thay đổi cục diện.
    
    Đoạn 4: Kết thúc chương. Mở ra những bí ẩn mới cần được giải đáp ở chương sau.
    
    (Hết chương ${chapterNum})
    `.repeat(20); // Lặp lại để nội dung dài ra một chút
};

const createDemoStory = (id: string, title: string, author: string, chapterCount: number, tags: string[]): Story => {
    const chapters: Chapter[] = Array.from({ length: chapterCount }, (_, i) => ({
        title: `Chương ${i + 1}: Thử nghiệm ${i + 1}`,
        url: `dev:${id}:chap:${i + 1}`
    }));

    return {
        title,
        author,
        imageUrl: `https://via.placeholder.com/300x450?text=${encodeURIComponent(title)}`,
        description: `Đây là bộ truyện demo "${title}" dùng để kiểm thử hệ thống. Bao gồm ${chapterCount} chương.`,
        source: 'Local',
        url: `dev:${id}`,
        chapters,
        createdAt: Date.now(),
        tags
    };
};

// Danh sách các truyện Demo
const DEMO_DATA: Story[] = [
    createDemoStory("demo1", "Thần Kiếm Demo", "Dev Team", 10, ["Kiếm Hiệp", "Demo"]),
    createDemoStory("demo2", "Đô Thị Test System", "Tester A", 8, ["Đô Thị", "Hệ Thống"]),
    createDemoStory("demo3", "Vũ Trụ React", "Coder B", 5, ["Khoa Huyễn", "Code"]),
];

// Hàm inject dữ liệu vào DB
export const injectDevStories = async (): Promise<Story[]> => {
    console.log("Bắt đầu nạp dữ liệu Dev Test...");
    
    for (const story of DEMO_DATA) {
        // 1. Lưu Metadata truyện
        await dbService.saveStory(story);
        
        // 2. Lưu nội dung từng chương vào Cache (để đọc được ngay)
        if (story.chapters) {
            for (let i = 0; i < story.chapters.length; i++) {
                const chapter = story.chapters[i];
                const content = generateContent(story.title, i + 1);
                
                await dbService.saveChapterData(story.url, chapter.url, {
                    content: content,
                    stats: null // Chưa có stats AI
                });
            }
        }
    }
    
    console.log("Đã nạp xong dữ liệu Dev Test.");
    return DEMO_DATA;
};
