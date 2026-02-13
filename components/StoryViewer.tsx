
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Story, Chapter, CharacterStats, ReadingSettings, ChatMessage, ReadingHistoryItem, DownloadConfig } from '../types';
import { getChapterContent, parseHtml, parseChapterContentFromDoc } from '../services/truyenfullService';
import { analyzeChapterForCharacterStats, chatWithEbook, chatWithChapterContent, rewriteChapterContent } from '../services/geminiService';
import { getCachedChapter, setCachedChapter } from '../services/cacheService';
import { getStoryState, saveStoryState as saveStoryStateLocal, mergeChapterStats } from '../services/storyStateService';
import { updateReadingHistory, saveReadingPosition, getReadingHistory, saveReadingHistory } from '../services/history';
import * as dbService from '../services/dbService';
import * as apiKeyService from '../services/apiKeyService';
import * as syncService from '../services/sync'; // Import Sync Service
import { splitChapterIntoChunks } from '../utils/textUtils';
import { useTts } from '../hooks/useTts';

import StoryDetail from './StoryDetail';
import ChapterContent from './ChapterContent';
import LoadingSpinner from './LoadingSpinner';
import CharacterPanel from './CharacterPanel';
import ScrollToTopButton from './ScrollToTopButton';
import CharacterPrimaryPanel from './CharacterPrimaryPanel';
import ChatPanel from './ChatPanel'; 
import ManualImportModal from './ManualImportModal';
import MultiChapterAddModal from './MultiChapterAddModal';
import EntityEditModal, { EntityType } from './EntityEditModal';

interface EbookHandler {
  zip: any;
}

interface StoryViewerProps {
  story: Story;
  initialEbookInstance: EbookHandler | null;
  initialChapterIndex?: number | null; // Prop mới
  initialScrollPercentage?: number; // Prop mới cho vị trí cuộn (fallback)
  initialParagraphIndex?: number; // Prop mới cho anchor scroll (primary)
  settings: ReadingSettings;
  onSettingsChange: (settings: ReadingSettings) => void;
  onBack: () => void;
  onUpdateStory: (updatedStory: Story) => void;
  onDeleteStory: (story: Story) => void;
  readChapters: Set<string>;
  onReadChapterUpdate: (chapterUrl: string) => void;
  setReadingHistory: React.Dispatch<React.SetStateAction<ReadingHistoryItem[]>>;
  
  // Download / Background Control Props
  backgroundDownloads: Record<string, { current: number; total: number; status: 'running' | 'paused' }>;
  downloadQueue: Story[];
  cachedChapters: Set<string>;
  onPauseDownload: (url: string) => void;
  onResumeDownload: (url: string) => void;
  onStopDownload: (url: string) => void;
  onStartBackgroundDownload: (story: Story) => void;
  onStartDownloadExport: (config: DownloadConfig) => void;
  onRedownload?: (story: Story) => void; // Added prop for redownload
  
  // Global UI Control
  setIsBottomNavForReadingVisible: (val: boolean) => void;
  isBottomNavForReadingVisible: boolean;
  onTokenUsageUpdate: (usage: { totalTokens?: number, ttsCharacters?: number }) => void;
  isApiKeyModalOpen: boolean;
  setIsApiKeyModalOpen: (val: boolean) => void;
  tokenUsage: apiKeyService.TokenUsage;
  onDataChange: () => void;
  onReadingModeChange: (isReading: boolean) => void; // New prop

  // Search & Create Props
  onSearch: (query: string) => void;
  isSearchLoading: boolean;
  onOpenHelpModal: () => void;
  onCreateStory: () => void;
  
  // Header Handlers (Passed from App)
  onOpenUpdateModal: () => void;
  onOpenSyncModal: () => void;
  
  // Add Chapter Trigger
  onOpenAddChapterModal?: () => void;

  // New Prop: Global Header Visibility State
  isHeaderVisible?: boolean;

  // NEW PROP: Add Chapters Handler (This was missing in interface)
  onAddChapters?: (story: Story, newChapters: { number: number; title: string; content: string }[]) => Promise<void>;
}

interface ManualImportState {
    isOpen: boolean;
    url: string;
    message: string;
    type: 'chapter' | 'story_details';
    source: string;
    contextData?: any;
}

interface TtsState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'ready';
  textChunks: string[];
  currentChunkIndex: number;
  error: string | null;
}

const StoryViewer: React.FC<StoryViewerProps> = ({
    story, initialEbookInstance, initialChapterIndex, initialScrollPercentage, initialParagraphIndex, settings, onSettingsChange, onBack,
    onUpdateStory, onDeleteStory, readChapters, onReadChapterUpdate, setReadingHistory,
    backgroundDownloads, downloadQueue, cachedChapters, onPauseDownload, onResumeDownload, onStopDownload, onStartBackgroundDownload, onStartDownloadExport, onRedownload,
    setIsBottomNavForReadingVisible, isBottomNavForReadingVisible, onTokenUsageUpdate,
    isApiKeyModalOpen, setIsApiKeyModalOpen, tokenUsage, onDataChange, onReadingModeChange,
    onSearch, isSearchLoading, onOpenHelpModal, onCreateStory,
    onOpenUpdateModal, onOpenSyncModal, onOpenAddChapterModal,
    isHeaderVisible = true,
    // Destructure the new prop here
    onAddChapters
}) => {
    // Local State specific to the active story session
    const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | null>(initialChapterIndex ?? null);
    const [chapterContent, setChapterContent] = useState<string | null>(null);
    const [isChapterLoading, setIsChapterLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    
    // Track entry method: Direct (from History) vs Indirect (from Library -> Detail)
    const enteredDirectlyRef = useRef(initialChapterIndex !== null && initialChapterIndex !== undefined);
    
    // State for restoration - managed internally now
    const [targetScrollPercentage, setTargetScrollPercentage] = useState<number>(initialScrollPercentage || 0);
    
    const [cumulativeStats, setCumulativeStats] = useState<CharacterStats | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [isRewriting, setIsRewriting] = useState<boolean>(false);
    const [isPanelVisible, setIsPanelVisible] = useState<boolean>(false);
    
    // Chat State
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isChatLoading, setIsChatLoading] = useState(false);

    const [ttsState, setTtsState] = useState<TtsState>({
        status: 'idle', textChunks: [], currentChunkIndex: 0, error: null,
    });

    const [manualImportState, setManualImportState] = useState<ManualImportState>({
        isOpen: false, url: '', message: '', type: 'chapter', source: ''
    });
    
    // Bookmark State
    const [isBookmarked, setIsBookmarked] = useState(true);
    
    // Multi Chapter Add Modal State
    const [isMultiAddModalOpen, setIsMultiAddModalOpen] = useState(false);

    // Entity Edit Modal State (Used for both panel and quick add)
    const [entityModalState, setEntityModalState] = useState<{ isOpen: boolean; type: EntityType | null; data: any | null }>({ isOpen: false, type: null, data: null });

    const operationIdRef = useRef<number>(0);
    const { availableSystemVoices } = useTts(settings, onSettingsChange);

    // Calculate queue status
    const isQueued = downloadQueue.some(s => s.url === story.url);
    const queuePosition = isQueued ? downloadQueue.findIndex(s => s.url === story.url) + 1 : 0;

    // Reading Mode Detection
    const isReading = selectedChapterIndex !== null && chapterContent !== null;

    // Computed for modal auto-complete
    const allCharacterNames = useMemo(() => {
        if (!cumulativeStats) return [];
        const mainCharName = cumulativeStats.trangThai?.ten;
        const npcNames = cumulativeStats.npcs?.map(npc => npc.ten) || [];
        return [mainCharName, ...npcNames].filter((name): name is string => !!name);
    }, [cumulativeStats]);

    useEffect(() => {
        onReadingModeChange(isReading);
    }, [isReading, onReadingModeChange]);

    // Load initial stats when story mounts OR update when chapter changes logic is handled in fetchChapter
    useEffect(() => {
        // Chỉ tải state tổng quan nếu không đang đọc chương cụ thể
        if (initialChapterIndex === null || initialChapterIndex === undefined) {
            const stats = getStoryState(story.url);
            setCumulativeStats(stats || {});
        }
        
        return () => {
            cleanupTts();
        };
    }, [story.url, initialChapterIndex]);

    // Effect để tự động tải chương nếu có initialChapterIndex
    useEffect(() => {
        if (initialChapterIndex !== null && initialChapterIndex !== undefined && story.chapters && initialChapterIndex < story.chapters.length) {
            // Sử dụng một hàm async IIFE để gọi fetchChapter
            (async () => {
                await fetchChapter(story, initialChapterIndex);
            })();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Chỉ chạy 1 lần khi mount hoặc khi story/index thay đổi lớn (thực tế story object đổi thì component này remount)


    const cleanupTts = useCallback(() => {
        window.speechSynthesis.cancel();
        setTtsState({ status: 'idle', textChunks: [], currentChunkIndex: 0, error: null });
    }, []);

    const persistStoryState = useCallback((storyUrl: string, state: CharacterStats) => {
        saveStoryStateLocal(storyUrl, state);
    }, []);

    const handleStatsChange = useCallback((newStats: CharacterStats) => {
        setCumulativeStats(newStats);
        persistStoryState(story.url, newStats);
        
        // SỬA ĐỔI QUAN TRỌNG: Lưu trực tiếp vào Cache DB của chương hiện tại (Snapshot)
        // Khi người dùng sửa tay, dữ liệu này sẽ ghi đè snapshot cũ
        if (selectedChapterIndex !== null && story.chapters && story.chapters[selectedChapterIndex]) {
            const currentChapterUrl = story.chapters[selectedChapterIndex].url;
            // Cần content để lưu lại
            if (chapterContent) {
                setCachedChapter(story.url, currentChapterUrl, { content: chapterContent, stats: newStats }).catch(console.error);
                // Sync Drive nếu cần
                if (syncService.isAuthenticated()) {
                    syncService.saveChapterContentToDrive(story.url, currentChapterUrl, { content: chapterContent, stats: newStats }).catch(console.error);
                }
            }
        }
    }, [story.url, persistStoryState, selectedChapterIndex, story.chapters, chapterContent]);

    // --- SHARED ENTITY SAVE HANDLER ---
    // Used by both Panels and Quick Add Modal
    const handleSaveEntity = (entityData: any) => {
        if (!entityModalState.type) return;

        // Nếu stats null thì khởi tạo object rỗng, ngược lại deep copy
        const newStats = cumulativeStats ? JSON.parse(JSON.stringify(cumulativeStats)) : {};
        const type = entityModalState.type;

        if (type === 'heThongCanhGioi') {
            const list: string[] = newStats.heThongCanhGioi || [];
            if (entityModalState.data && typeof entityModalState.data === 'string') { // Editing existing string
                const index = list.indexOf(entityModalState.data);
                if (index > -1) list[index] = entityData;
            } else { // Adding
                list.push(entityData);
            }
            newStats.heThongCanhGioi = list;
        } else if (type === 'tuChat') {
            const list = newStats.trangThai?.tuChat || [];
            const index = list.findIndex((item: any) => item.ten === entityModalState.data?.ten);
            if (index !== -1) list[index] = entityData; else list.push(entityData);
            if (!newStats.trangThai) newStats.trangThai = { ten: '' };
            newStats.trangThai.tuChat = list;
        } else if (type === 'quanHe') {
            const list = newStats.quanHe || [];
            if (entityModalState.data) { // Editing
                const index = list.findIndex((item: any) => item.nhanVat1 === entityModalState.data.nhanVat1 && item.nhanVat2 === entityModalState.data.nhanVat2);
                if (index !== -1) list[index] = entityData;
            } else { // Adding
                list.push(entityData);
            }
            newStats.quanHe = list;
        } else if (type === 'diaDiem') {
            const { isCurrentLocation, ...locationDetails } = entityData;
            const list = newStats.diaDiem || [];
            const index = list.findIndex((item: any) => item.ten === entityModalState.data?.ten);
            
            if (index !== -1) list[index] = locationDetails; else list.push(locationDetails);
            newStats.diaDiem = list;

            if (isCurrentLocation) {
                newStats.viTriHienTai = locationDetails.ten;
            } else if (newStats.viTriHienTai === locationDetails.ten) {
                // Unchecked the current location, so clear it
                newStats.viTriHienTai = undefined;
            }
        } else if (type === 'mainCharacter') {
            if (!newStats.trangThai) newStats.trangThai = { ten: '' };
            newStats.trangThai.ten = entityData.ten;
            newStats.canhGioi = entityData.canhGioi;
        } else { // Handle other standard object arrays
            const list = newStats[type as keyof CharacterStats] as any[] || [];
            const index = list.findIndex((item: any) => item.ten === entityModalState.data?.ten);
            if (index !== -1) list[index] = entityData; else list.push(entityData);
            (newStats as any)[type] = list;
        }
        
        handleStatsChange(newStats);
        setEntityModalState({ isOpen: false, type: null, data: null });
    };

    const handleAddEntityFromSelection = (type: EntityType, name: string) => {
        // Pre-fill data structure based on type
        let initialData: any = { ten: name };
        
        if (type === 'heThongCanhGioi') {
            initialData = name;
        } else if (type === 'npcs') {
            initialData = { ...initialData, moTa: '', status: 'active', mucDoThanThiet: 'Trung Lập' };
        } else if (type === 'diaDiem') {
            initialData = { ...initialData, moTa: '' };
        } else {
            initialData = { ...initialData, moTa: '', status: 'active' };
        }

        setEntityModalState({
            isOpen: true,
            type: type,
            data: initialData // Passing as 'data' simulates editing an existing item but with just the name filled, user completes the rest
        });
    };

    const handleApiError = useCallback((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
        setError(errorMessage);
        if (errorMessage.includes('API Key không hợp lệ')) {
            const activeKey = apiKeyService.getActiveApiKey();
            if (activeKey) {
                apiKeyService.setActiveApiKeyId(null);
            }
            setIsApiKeyModalOpen(true);
        }
    }, [setIsApiKeyModalOpen]);

    const handleBackToStory = () => {
        cleanupTts();
        
        // Logic điều hướng Back:
        if (enteredDirectlyRef.current) {
            // Nếu vào trực tiếp (từ Lịch sử) -> Quay về Home
            onBack(); 
        } else {
            // Nếu vào từ danh sách chương (Detail) -> Quay về danh sách chương
            setSelectedChapterIndex(null);
            setChapterContent(null);
            setError(null);
            setIsPanelVisible(false);
            // Refresh global state when going back to detail view
            const stats = getStoryState(story.url);
            setCumulativeStats(stats || {});
        }
    };

    const handleSaveReadingPosition = useCallback((percentage: number, paragraphIndex: number) => {
        saveReadingPosition(story.url, percentage, paragraphIndex);
    }, [story.url]);
    
    // --- Bookmark Logic ---
    const handleToggleBookmark = useCallback(() => {
        if (!isReading || selectedChapterIndex === null || !story.chapters) return;
        
        const currentState = !isBookmarked;
        setIsBookmarked(currentState);
        
        const history = getReadingHistory();
        if (currentState) {
            // Re-add to history (Update timestamp)
            const chapter = story.chapters[selectedChapterIndex];
            const newHistory = updateReadingHistory(story, chapter);
            setReadingHistory(newHistory);
        } else {
            // Remove from history
            const newHistory = history.filter(item => item.url !== story.url);
            saveReadingHistory(newHistory);
            setReadingHistory(newHistory);
        }
    }, [isBookmarked, isReading, selectedChapterIndex, story, setReadingHistory]);

    // --- Content Fetching & Analysis ---

    const processAndAnalyzeContent = useCallback(async (storyToLoad: Story, chapterUrl: string, content: string, overrideBaseStats?: CharacterStats | null) => {
        const currentOpId = ++operationIdRef.current;
        
        setChapterContent(content);
        setIsChapterLoading(false);
        
        try {
            await setCachedChapter(storyToLoad.url, chapterUrl, { content, stats: null });
            // DRIVE SYNC: Sau khi có nội dung mới, đẩy lên Drive nếu đã đăng nhập
            if (syncService.isAuthenticated()) {
                syncService.saveChapterContentToDrive(storyToLoad.url, chapterUrl, { content, stats: null }).catch(console.error);
            }
        } catch (e) {
            console.error("Failed to initial cache chapter", e);
        }
        
        const currentApiKey = apiKeyService.getApiKey();
        if (!content || content.trim().length === 0 || !currentApiKey) return;

        setIsAnalyzing(true);
        try {
            // SỬA ĐỔI: Sử dụng baseStats được truyền vào (từ chương trước) thay vì state hiện tại
            // Điều này đảm bảo phân tích dựa trên snapshot quá khứ chứ không phải tương lai
            const baseStats = overrideBaseStats !== undefined ? (overrideBaseStats || {}) : (cumulativeStats || {});
            
            const { data: deltaStats, usage } = await analyzeChapterForCharacterStats(content, baseStats);
            
            if (currentOpId !== operationIdRef.current) return; 

            onTokenUsageUpdate({ totalTokens: usage.totalTokens });
            
            const fullChapterState = mergeChapterStats(baseStats, deltaStats ?? {});
            
            setCumulativeStats(fullChapterState);
            persistStoryState(storyToLoad.url, fullChapterState);
            const dataToSave = { content, stats: fullChapterState };
            await setCachedChapter(storyToLoad.url, chapterUrl, dataToSave);
            
            // DRIVE SYNC: Cập nhật lại với stats
            if (syncService.isAuthenticated()) {
                syncService.saveChapterContentToDrive(storyToLoad.url, chapterUrl, dataToSave).catch(console.error);
            }

        } catch (analysisError) {
            if (currentOpId !== operationIdRef.current) return;
            handleApiError(analysisError);
        } finally {
            if (currentOpId === operationIdRef.current) setIsAnalyzing(false);
        }
    }, [cumulativeStats, handleApiError, onTokenUsageUpdate, persistStoryState]);

    const fetchChapter = useCallback(async (storyToLoad: Story, chapterIndex: number) => {
        if (!storyToLoad || !storyToLoad.chapters || chapterIndex < 0 || chapterIndex >= storyToLoad.chapters.length) return;
        
        // SỬA ĐỔI: Reset stats ngay lập tức để tránh hiển thị dữ liệu của chương cũ
        setCumulativeStats(null);
        
        cleanupTts();
        const chapter = storyToLoad.chapters[chapterIndex];
        
        // --- LOGIC QUYẾT ĐỊNH VỊ TRÍ CUỘN ---
        // Kiểm tra lịch sử đọc để xem chương này có phải là chương đang đọc dở không
        const history = getReadingHistory();
        const historyItem = history.find(h => h.url === storyToLoad.url);
        
        // Mặc định về 0
        let newTargetScroll = 0;
        
        // Nếu tìm thấy lịch sử VÀ URL chương khớp với chương cuối cùng đã đọc
        if (historyItem && historyItem.lastChapterUrl === chapter.url) {
            newTargetScroll = historyItem.lastScrollPosition || 0;
        } else if (chapterIndex === initialChapterIndex && initialScrollPercentage && initialScrollPercentage > 0) {
            // Fallback: Nếu đây là lần load đầu tiên (từ prop)
            newTargetScroll = initialScrollPercentage;
        }
        
        setTargetScrollPercentage(newTargetScroll);
        // --- KẾT THÚC LOGIC CUỘN ---

        setSelectedChapterIndex(chapterIndex);
        setIsChapterLoading(true);
        setChapterContent(null);
        setError(null);
        
        // Auto-update history on chapter load -> effectively "Bookmarked"
        const newHistory = updateReadingHistory(storyToLoad, chapter);
        setReadingHistory(newHistory);
        onReadChapterUpdate(chapter.url);
        setIsBookmarked(true);
        
        try {
            // 1. Kiểm tra Local Cache trước
            const cachedData = await getCachedChapter(storyToLoad.url, chapter.url);
            
            if (cachedData && cachedData.content) {
                setChapterContent(cachedData.content);
                // SỬA ĐỔI: Nguyên tắc Snapshot
                // Nếu Cache ĐÃ CÓ stats -> Dùng luôn, KHÔNG phân tích lại, KHÔNG merge với cái gì khác.
                // Đây là dữ liệu "đã chốt" của chương này.
                if (cachedData.stats) {
                    setCumulativeStats(cachedData.stats);
                    setIsChapterLoading(false); 
                    return; 
                }
                
                // Nếu chưa có stats, tìm stats của chương LIỀN TRƯỚC để làm context
                // (Chứ không lấy cumulativeStats toàn cục - có thể là của tương lai)
                let prevStats = null;
                if (chapterIndex > 0) {
                    const prevChapUrl = storyToLoad.chapters[chapterIndex - 1].url;
                    const prevCache = await dbService.getChapterData(storyToLoad.url, prevChapUrl);
                    if (prevCache && prevCache.stats) {
                        prevStats = prevCache.stats;
                    }
                }
                
                // Phân tích mới dựa trên context cũ
                await processAndAnalyzeContent(storyToLoad, chapter.url, cachedData.content, prevStats);
                return;
            }

            // 2. Nếu Local Cache trống & Đã đăng nhập Drive -> Thử tải từ Drive
            // IMPORTANT: Đây là điểm chặn quan trọng. Nếu Drive có, ta dùng luôn và KHÔNG chạy xuống phần scrape.
            if (syncService.isAuthenticated()) {
                try {
                    console.log("Checking Drive for chapter content...");
                    const driveData = await syncService.fetchChapterContentFromDrive(storyToLoad.url, chapter.url);
                    if (driveData && driveData.content) {
                        setChapterContent(driveData.content);
                        // Lưu lại vào Local Cache để lần sau đọc nhanh hơn
                        await setCachedChapter(storyToLoad.url, chapter.url, driveData);
                        
                        if (driveData.stats) {
                            setCumulativeStats(driveData.stats);
                            setIsChapterLoading(false);
                            return; // <--- STRICT RETURN: Dừng lại ở đây, không cào web.
                        }
                        
                        // Nếu Drive có content nhưng chưa có stats (hiếm, nhưng có thể), thì mới phân tích
                        let prevStats = null;
                        if (chapterIndex > 0) {
                            const prevChapUrl = storyToLoad.chapters[chapterIndex - 1].url;
                            const prevCache = await dbService.getChapterData(storyToLoad.url, prevChapUrl);
                            prevStats = prevCache?.stats || null;
                        }

                        await processAndAnalyzeContent(storyToLoad, chapter.url, driveData.content, prevStats);
                        return; // <--- STRICT RETURN: Dừng lại ở đây.
                    }
                } catch (driveErr) {
                    // Nếu lỗi Mạng hoặc 404, chỉ log warning.
                    // Nếu là 404 thật thì mới nên fallback xuống web. 
                    // Nhưng ở đây ta cứ fallback cho an toàn (trừ khi yêu cầu cấm tuyệt đối ngay cả khi 404).
                    // Theo yêu cầu "tuyệt đối không phải fetch từ web gốc NẾU NHƯ ĐÃ CÓ trên Drive". 
                    // Nghĩa là nếu Drive ko có thì vẫn được fetch web.
                    console.warn("Failed to fetch from Drive, falling back to Web/Ebook", driveErr);
                }
            }
            
            // 3. Nếu không tìm thấy ở đâu cả -> Fetch từ Web hoặc Ebook
            let content = "";
            if (storyToLoad.source === 'Ebook' && initialEbookInstance) {
                const { zip } = initialEbookInstance;
                const [filePath] = chapter.url.split('#');
                const decodedUrl = decodeURIComponent(filePath);
                const chapterFile = zip.file(decodedUrl);
                if (!chapterFile) throw new Error(`Không thể tìm thấy tệp tin của chương "${decodedUrl}" bên trong Ebook.`);
                
                const rawHtml = await chapterFile.async('string');
                const doc = parseHtml(rawHtml);
                const contentEl = doc.body;
                contentEl.querySelectorAll('a, sup, sub, script, style, img, svg').forEach((el: HTMLElement) => el.remove());
                contentEl.innerHTML = contentEl.innerHTML.replace(/<br\s*\/?>/gi, '\n');
                let text = (contentEl.textContent ?? '').trim();
                content = (text || "Nội dung chương trống.").replace(/\n\s*\n/g, '\n\n');
            } else if (storyToLoad.source === 'Local') {
                 content = "";
            } else {
                 content = await getChapterContent(chapter, storyToLoad.source);
            }
            
            // Tương tự, tìm stats chương trước cho trường hợp fetch mới
            let prevStats = null;
            if (chapterIndex > 0) {
                const prevChapUrl = storyToLoad.chapters[chapterIndex - 1].url;
                const prevCache = await dbService.getChapterData(storyToLoad.url, prevChapUrl);
                prevStats = prevCache?.stats || null;
            }

            await processAndAnalyzeContent(storyToLoad, chapter.url, content, prevStats);
            
        } catch (err) {
            const error = err as Error;
            if (error.message.includes('CONNECTION_FAILED') || error.message.includes('Proxy')) {
                setManualImportState({
                    isOpen: true,
                    url: chapter.url,
                    message: "Kết nối mạng không ổn định hoặc bị chặn. Bạn có thể nhập nội dung thủ công.",
                    type: 'chapter',
                    source: storyToLoad.source,
                    contextData: { story: storyToLoad, chapterIndex }
                });
            }
            setError(`Lỗi tải chương: ${error.message}.`);
            setIsChapterLoading(false);
        }
    }, [initialEbookInstance, processAndAnalyzeContent, cleanupTts, setReadingHistory, onReadChapterUpdate, initialChapterIndex, initialScrollPercentage]);

    // --- Interaction Handlers ---

    const handleSelectChapter = useCallback((chapter: Chapter) => {
        if (!story.chapters) return;
        const index = story.chapters.findIndex(c => c.url === chapter.url);
        if (index !== -1) {
            window.scrollTo(0, 0);
            fetchChapter(story, index);
        }
    }, [story, fetchChapter]);

    const handlePrevChapter = () => {
        if (selectedChapterIndex !== null && selectedChapterIndex > 0) {
            window.scrollTo(0, 0);
            fetchChapter(story, selectedChapterIndex - 1);
        }
    };

    const handleNextChapter = () => {
        if (story.chapters && selectedChapterIndex !== null && selectedChapterIndex < story.chapters.length - 1) {
            window.scrollTo(0, 0);
            fetchChapter(story, selectedChapterIndex + 1);
        }
    };

    const handleUpdateChapterContent = async (newContent: string) => {
        if (selectedChapterIndex === null || !story.chapters) return;
        const chapter = story.chapters[selectedChapterIndex];
        setChapterContent(newContent);
        try {
            const dataToSave = { content: newContent, stats: cumulativeStats };
            await setCachedChapter(story.url, chapter.url, dataToSave);
            // Sync update to Drive
            if(syncService.isAuthenticated()) {
                syncService.saveChapterContentToDrive(story.url, chapter.url, dataToSave).catch(console.error);
            }
        } catch (e) {
            setError("Không thể lưu nội dung chỉnh sửa.");
        }
    };

    const handleRewriteChapter = useCallback(async () => {
        const currentApiKey = apiKeyService.getApiKey();
        if (!currentApiKey) { setIsApiKeyModalOpen(true); return; }
        if (!chapterContent || selectedChapterIndex === null) return;
        setIsRewriting(true);
        try {
            const { text, usage } = await rewriteChapterContent(chapterContent);
            onTokenUsageUpdate({ totalTokens: usage.totalTokens });
            await handleUpdateChapterContent(text);
        } catch (err) { handleApiError(err); } finally { setIsRewriting(false); }
    }, [chapterContent, selectedChapterIndex, handleApiError, onTokenUsageUpdate]);

    const handleFullReanalysis = useCallback(async () => {
        const currentApiKey = apiKeyService.getApiKey();
        if (!currentApiKey) { setIsApiKeyModalOpen(true); return; }
        if (!chapterContent) return;

        setIsAnalyzing(true);
        const currentOpId = ++operationIdRef.current;

        try {
            // Sử dụng stats hiện tại làm base cho re-analyze
            const baseStats = cumulativeStats || {};
            const { data: deltaStats, usage } = await analyzeChapterForCharacterStats(chapterContent, baseStats);

            if (currentOpId !== operationIdRef.current) return;
            onTokenUsageUpdate({ totalTokens: usage.totalTokens });

            if (deltaStats) {
                const fullChapterState = mergeChapterStats(baseStats, deltaStats);
                setCumulativeStats(fullChapterState);
                persistStoryState(story.url, fullChapterState);
                if (selectedChapterIndex !== null && story.chapters) {
                    const dataToSave = { content: chapterContent, stats: fullChapterState };
                    await setCachedChapter(story.url, story.chapters[selectedChapterIndex].url, dataToSave);
                    if(syncService.isAuthenticated()) {
                        syncService.saveChapterContentToDrive(story.url, story.chapters[selectedChapterIndex].url, dataToSave).catch(console.error);
                    }
                }
            }
        } catch (err) {
            if (currentOpId !== operationIdRef.current) return;
            handleApiError(err);
        } finally {
            if (currentOpId === operationIdRef.current) setIsAnalyzing(false);
        }
    }, [chapterContent, story, cumulativeStats, onTokenUsageUpdate, persistStoryState, handleApiError, selectedChapterIndex]);

    const handleStopAnalysis = useCallback(() => { operationIdRef.current++; setIsAnalyzing(false); }, []);

    // --- Chat Logic ---
    const handleSendMessage = async (message: string) => {
        const currentApiKey = apiKeyService.getApiKey();
        if (!currentApiKey) { setIsApiKeyModalOpen(true); return; }
        setChatMessages(prev => [...prev, { role: 'user', content: message }]);
        setIsChatLoading(true);
        try {
            let responseText = "";
            let usageTokenCount = 0;
            if (chapterContent) {
                const result = await chatWithChapterContent(message, chapterContent, story.title);
                responseText = result.text;
                usageTokenCount = result.usage.totalTokens;
            } else if (initialEbookInstance && story.chapters) {
                const result = await chatWithEbook(message, initialEbookInstance.zip, story.chapters);
                responseText = result.text;
                usageTokenCount = result.usage.totalTokens;
            } else {
                responseText = "Chức năng chat chỉ khả dụng khi đang đọc một chương hoặc với Ebook.";
            }
            onTokenUsageUpdate({ totalTokens: usageTokenCount });
            setChatMessages(prev => [...prev, { role: 'model', content: responseText }]);
        } catch (err) {
            handleApiError(err);
            setChatMessages(prev => [...prev, { role: 'model', content: "Xin lỗi, đã có lỗi xảy ra." }]);
        } finally { setIsChatLoading(false); }
    };

    // --- TTS Logic ---
    const handleTtsRequest = useCallback(async () => {
        if (!chapterContent) return;
        if (ttsState.textChunks.length > 0 && ttsState.status !== 'error') {
            setTtsState(prev => ({ ...prev, status: 'playing' }));
            return;
        }
        setTtsState(prev => ({ ...prev, status: 'loading', error: null }));
        try {
            const chunks = splitChapterIntoChunks(chapterContent);
            setTtsState({ status: 'playing', textChunks: chunks, currentChunkIndex: 0, error: null });
        } catch (e) {
            setTtsState(prev => ({ ...prev, status: 'error', error: "Lỗi xử lý văn bản." }));
        }
    }, [chapterContent, ttsState.textChunks.length, ttsState.status]);

    const handleTtsStatusChange = (newStatus: TtsState['status']) => { setTtsState(prev => ({...prev, status: newStatus})); };
    const handleTtsChunkChange = (newIndex: number) => {
        setTtsState(prev => {
            if (newIndex >= prev.textChunks.length || newIndex < 0) return prev;
            return {...prev, currentChunkIndex: newIndex, status: 'playing'};
        });
    };

    // handleCreateChapter logic removed here, handled by App via onUpdateStory

    const handleManualImportFile = async (file: File) => {
        try {
            const text = await file.text();
            const doc = parseHtml(text);
            if (manualImportState.type === 'chapter') {
                setIsChapterLoading(true);
                const { story: targetStory, chapterIndex } = manualImportState.contextData;
                const content = parseChapterContentFromDoc(doc, manualImportState.source);
                setManualImportState(prev => ({ ...prev, isOpen: false }));
                await processAndAnalyzeContent(targetStory, manualImportState.url, content);
                setIsChapterLoading(false);
                setError(null);
            }
        } catch (e) {
            alert(`Lỗi khi đọc file: ${(e as Error).message}`);
        }
    };
    
    // --- Add Chapters Handler Wrapper ---
    const handleAddChaptersInternal = async (newChapters: { number: number; title: string; content: string }[]) => {
        if (onAddChapters) {
            await onAddChapters(story, newChapters);
        }
    };

    // Loading State specifically for initial navigation or pending selection
    // FIX: Using selectedChapterIndex instead of initialChapterIndex to allow going back
    if (selectedChapterIndex !== null && chapterContent === null && !error) {
         return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <LoadingSpinner />
                <p className="mt-4 text-[var(--theme-text-secondary)]">Đang tải chương...</p>
            </div>
         );
    }

    if (isReading && story.chapters) {
        const layout = settings.pcLayout || 'default';
        let gridClass = "grid grid-cols-1 w-full px-4 sm:px-8 py-8 sm:py-12 flex-grow ";
        let leftSidebarContent: React.ReactNode = null;
        let rightSidebarContent: React.ReactNode = null;

        const PrimaryPanel = (
            <CharacterPrimaryPanel 
                stats={cumulativeStats} 
                isAnalyzing={isAnalyzing} 
                onStatsChange={handleStatsChange} 
                onReanalyze={handleFullReanalysis} 
                onStopAnalysis={handleStopAnalysis} 
            />
        );

        const WorldPanel = (
            <CharacterPanel 
                stats={cumulativeStats} 
                story={story}
                isAnalyzing={isAnalyzing} 
                isOpen={true} 
                onClose={() => {}} 
                isSidebar={true} 
                onStatsChange={handleStatsChange} 
                onDataLoaded={onDataChange} 
                onReanalyze={handleFullReanalysis} 
                onStopAnalysis={handleStopAnalysis}
                chatMessages={chatMessages}
                onSendMessage={handleSendMessage}
                isChatLoading={isChatLoading} 
            />
        );
        
        // Unified Panel for stacked layouts
        const UnifiedPanel = (
            <CharacterPanel 
                stats={cumulativeStats} 
                story={story}
                isAnalyzing={isAnalyzing} 
                isOpen={true} 
                onClose={() => {}} 
                isSidebar={true}
                unifiedMode={true} // Force show all tabs
                onStatsChange={handleStatsChange} 
                onDataLoaded={onDataChange} 
                onReanalyze={handleFullReanalysis} 
                onStopAnalysis={handleStopAnalysis}
                chatMessages={chatMessages}
                onSendMessage={handleSendMessage}
                isChatLoading={isChatLoading} 
            />
        );

        // Define layout structure based on settings
        // Updated breakpoints to support Tablet Landscape (lg) with significantly reduced sidebar width (16rem/256px)
        if (layout === 'default') {
            gridClass += "lg:grid-cols-[16rem_minmax(0,1fr)_16rem] xl:grid-cols-[22rem_minmax(0,1fr)_22rem] 2xl:grid-cols-[28rem_minmax(0,1fr)_28rem] lg:gap-4 xl:gap-8";
            leftSidebarContent = PrimaryPanel;
            rightSidebarContent = WorldPanel;
        } else if (layout === 'stacked-left') {
            gridClass += "lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)] 2xl:grid-cols-[28rem_minmax(0,1fr)] lg:gap-6";
            leftSidebarContent = UnifiedPanel;
        } else if (layout === 'stacked-right') {
            gridClass += "lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem] lg:gap-6";
            rightSidebarContent = UnifiedPanel;
        } else {
            // 'minimal' layout - uses mobile/tablet logic (1 column), panels are hidden
            gridClass += "lg:grid-cols-1"; 
        }

        // Apply dynamic sticky classes based on header visibility
        const stickySidebarClass = isHeaderVisible 
            ? "top-36 max-h-[calc(100vh-10rem)]" 
            : "top-20 max-h-[calc(100vh-6rem)]";

        return (
            <div className={gridClass}>
                {leftSidebarContent && (
                    <aside className={`hidden lg:block sticky ${stickySidebarClass} self-start transition-all duration-300 overflow-y-auto custom-scrollbar pr-2`}>
                        {leftSidebarContent}
                    </aside>
                )}
                
                <div className="min-w-0">
                    <ChapterContent
                        story={story} currentChapterIndex={selectedChapterIndex!} content={chapterContent || ''}
                        onBack={handleBackToStory} onPrev={handlePrevChapter} onNext={handleNextChapter}
                        onSelectChapter={handleSelectChapter} readChapters={readChapters} settings={settings}
                        onSettingsChange={onSettingsChange} onNavBarVisibilityChange={setIsBottomNavForReadingVisible}
                        cumulativeStats={cumulativeStats} onStatsChange={handleStatsChange}
                        onContentUpdate={handleUpdateChapterContent} onRewrite={handleRewriteChapter}
                        isBusy={isChapterLoading || isAnalyzing || isRewriting || ttsState.status === 'loading'}
                        isAnalyzing={isAnalyzing} onCreateChapter={undefined} // Removed internal create, handled via + button props
                        onTtsRequest={handleTtsRequest} onTtsStop={cleanupTts}
                        onTtsStatusChange={handleTtsStatusChange} onTtsChunkChange={handleTtsChunkChange}
                        ttsStatus={ttsState.status} ttsError={ttsState.error}
                        ttsTextChunks={ttsState.textChunks} ttsCurrentChunkIndex={ttsState.currentChunkIndex}
                        availableSystemVoices={availableSystemVoices}
                        onToggleStats={() => setIsPanelVisible(!isPanelVisible)}
                        initialScrollPercentage={targetScrollPercentage}
                        onSavePosition={handleSaveReadingPosition}
                        isBookmarked={isBookmarked}
                        onToggleBookmark={handleToggleBookmark}
                        // Header handlers
                        onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)}
                        onOpenUpdateModal={onOpenUpdateModal}
                        onOpenSyncModal={onOpenSyncModal}
                        onGoHome={onBack} // Main Home handler
                        onSearch={onSearch}
                        isSearchLoading={isSearchLoading}
                        onOpenHelpModal={onOpenHelpModal}
                        // Layout prop
                        pcLayout={layout}
                        // Pass create modal trigger - Updated to use MultiChapterAddModal
                        onOpenAddChapterModal={() => setIsMultiAddModalOpen(true)}
                        // Pass Global Header Visibility
                        isMainHeaderVisible={isHeaderVisible}
                        // Add panel status for back button logic
                        isPanelOpen={isPanelVisible}
                        // Pass Add Entity Handler
                        onAddEntity={handleAddEntityFromSelection}
                    />
                </div>

                {rightSidebarContent && (
                    <aside className={`hidden lg:block sticky ${stickySidebarClass} self-start transition-all duration-300 overflow-y-auto custom-scrollbar pl-2`}>
                        {rightSidebarContent}
                    </aside>
                )}

                {/* Mobile/Tablet Floating Panels OR Minimal PC Layout Panels */}
                <div className={layout === 'minimal' ? '' : 'lg:hidden'}>
                    <CharacterPanel 
                        isOpen={isPanelVisible} 
                        onClose={() => setIsPanelVisible(false)} 
                        stats={cumulativeStats} 
                        story={story}
                        isAnalyzing={isAnalyzing} 
                        isSidebar={false} 
                        onStatsChange={handleStatsChange} 
                        onDataLoaded={onDataChange} 
                        onReanalyze={handleFullReanalysis} 
                        onStopAnalysis={handleStopAnalysis}
                        chatMessages={chatMessages}
                        onSendMessage={handleSendMessage}
                        isChatLoading={isChatLoading} 
                        isHeaderVisible={isHeaderVisible}
                    />
                </div>
                
                {/* ScrollToTopButton - Global (Mobile & Desktop) */}
                <ScrollToTopButton 
                    isReading={true} 
                    isBottomNavVisible={isBottomNavForReadingVisible} 
                    isAudioPlayerActive={ttsState.status !== 'idle' && ttsState.status !== 'error'}
                />
                
                {/* Modals needed during reading */}
                <ManualImportModal isOpen={manualImportState.isOpen} onClose={() => setManualImportState(prev => ({ ...prev, isOpen: false }))} urlToImport={manualImportState.url} message={manualImportState.message} onFileSelected={handleManualImportFile} />
                <MultiChapterAddModal 
                    isOpen={isMultiAddModalOpen}
                    onClose={() => setIsMultiAddModalOpen(false)}
                    onSave={handleAddChaptersInternal}
                    nextChapterIndex={selectedChapterIndex !== null ? selectedChapterIndex + 2 : (story.chapters?.length || 0) + 1}
                />
                {entityModalState.isOpen && entityModalState.type && (
                    <EntityEditModal 
                        isOpen={entityModalState.isOpen}
                        onClose={() => setEntityModalState({ isOpen: false, type: null, data: null })}
                        onSave={handleSaveEntity}
                        entityType={entityModalState.type}
                        entityData={entityModalState.data}
                        allLocations={cumulativeStats?.diaDiem}
                        currentLocationName={cumulativeStats?.viTriHienTai}
                        allCharacters={allCharacterNames}
                    />
                )}
            </div>
        );
    }

    // Detail View
    return (
        <div className="w-full max-w-[96%] mx-auto px-4 py-8 sm:py-12 flex-grow mt-16 transition-all duration-300">
            <StoryDetail 
                story={story} 
                onSelectChapter={handleSelectChapter} readChapters={readChapters} lastReadChapterIndex={selectedChapterIndex} 
                onBack={onBack} onUpdateStory={onUpdateStory} onDeleteStory={onDeleteStory}
                onDeleteChapterContent={dbService.deleteChapterData}
                isBackgroundLoading={false}
                onStartDownload={onStartDownloadExport}
                downloadProgress={backgroundDownloads[story.url]}
                // Pass queue status
                isQueued={isQueued}
                queuePosition={queuePosition}
                cachedChapters={cachedChapters}
                onPauseDownload={() => onPauseDownload(story.url)}
                onResumeDownload={() => onResumeDownload(story.url)}
                onStopDownload={() => onStopDownload(story.url)}
                onStartBackgroundDownload={() => onStartBackgroundDownload(story)}
                onRedownload={onRedownload ? () => onRedownload(story) : undefined}
                onSearch={onSearch}
                isSearchLoading={isSearchLoading}
                onOpenHelpModal={onOpenHelpModal}
                // Pass ADD CHAPTERS HANDLER
                onAddChapters={onAddChapters}
            />
        </div>
    );
};

export default StoryViewer;
