
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Story, Chapter, CharacterStats, ReadingSettings, ChatMessage, ReadingHistoryItem, DownloadConfig } from '../types';
import { getChapterContent, parseHtml, parseChapterContentFromDoc } from '../services/truyenfullService';
import { analyzeChapterForCharacterStats, chatWithEbook, chatWithChapterContent, rewriteChapterContent } from '../services/geminiService';
import { getCachedChapter, setCachedChapter } from '../services/cacheService';
import { getStoryState, saveStoryState as saveStoryStateLocal, mergeChapterStats } from '../services/storyStateService';
import { updateReadingHistory } from '../services/history';
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
import ApiKeyModal from './ApiKeyModal';
import ManualImportModal from './ManualImportModal';

interface EbookHandler {
  zip: any;
}

interface StoryViewerProps {
  story: Story;
  initialEbookInstance: EbookHandler | null;
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
    story, initialEbookInstance, settings, onSettingsChange, onBack,
    onUpdateStory, onDeleteStory, readChapters, onReadChapterUpdate, setReadingHistory,
    backgroundDownloads, downloadQueue, cachedChapters, onPauseDownload, onResumeDownload, onStopDownload, onStartBackgroundDownload, onStartDownloadExport,
    setIsBottomNavForReadingVisible, isBottomNavForReadingVisible, onTokenUsageUpdate,
    isApiKeyModalOpen, setIsApiKeyModalOpen, tokenUsage, onDataChange, onReadingModeChange,
    onSearch, isSearchLoading, onOpenHelpModal, onCreateStory
}) => {
    // Local State specific to the active story session
    const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | null>(null);
    const [chapterContent, setChapterContent] = useState<string | null>(null);
    const [isChapterLoading, setIsChapterLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    
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

    const operationIdRef = useRef<number>(0);
    const { availableSystemVoices } = useTts(settings, onSettingsChange);

    // Calculate queue status
    const isQueued = downloadQueue.some(s => s.url === story.url);
    const queuePosition = isQueued ? downloadQueue.findIndex(s => s.url === story.url) + 1 : 0;

    // Reading Mode Detection
    const isReading = selectedChapterIndex !== null && chapterContent !== null;

    useEffect(() => {
        onReadingModeChange(isReading);
    }, [isReading, onReadingModeChange]);

    // Load initial stats when story mounts
    useEffect(() => {
        const stats = getStoryState(story.url);
        setCumulativeStats(stats || {});
        // If story changes, reset view
        return () => {
            cleanupTts();
        };
    }, [story.url]);

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
    }, [story.url, persistStoryState]);

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
        setSelectedChapterIndex(null);
        setChapterContent(null);
        setError(null);
        setIsPanelVisible(false);
    };

    // --- Content Fetching & Analysis ---

    const processAndAnalyzeContent = useCallback(async (storyToLoad: Story, chapterUrl: string, content: string) => {
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
            const baseStats = cumulativeStats || {};
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
        
        cleanupTts();
        const chapter = storyToLoad.chapters[chapterIndex];
        
        setSelectedChapterIndex(chapterIndex);
        setIsChapterLoading(true);
        setChapterContent(null);
        setError(null);
        
        const newHistory = updateReadingHistory(storyToLoad, chapter);
        setReadingHistory(newHistory);
        onReadChapterUpdate(chapter.url);
        
        try {
            // 1. Kiểm tra Local Cache trước
            const cachedData = await getCachedChapter(storyToLoad.url, chapter.url);
            
            if (cachedData && cachedData.content) {
                setChapterContent(cachedData.content);
                if (cachedData.stats) {
                    setCumulativeStats(cachedData.stats);
                    setIsChapterLoading(false); 
                    return; 
                }
                await processAndAnalyzeContent(storyToLoad, chapter.url, cachedData.content);
                return;
            }

            // 2. Nếu Local Cache trống & Đã đăng nhập Drive -> Thử tải từ Drive
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
                            return;
                        }
                        await processAndAnalyzeContent(storyToLoad, chapter.url, driveData.content);
                        return;
                    }
                } catch (driveErr) {
                    console.warn("Failed to fetch from Drive, falling back to Web/Ebook", driveErr);
                }
            }
            
            // 3. Nếu Drive cũng không có -> Fetch từ Web hoặc Ebook
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
            
            await processAndAnalyzeContent(storyToLoad, chapter.url, content);
            
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
    }, [initialEbookInstance, processAndAnalyzeContent, cleanupTts, setReadingHistory, onReadChapterUpdate]);

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

    const handleCreateChapter = async (targetStory: Story, title: string, content: string) => {
        if (targetStory.source !== 'Local' && targetStory.source !== 'Ebook') {
            setError("Chỉ có thể thêm chương cho truyện tự tạo hoặc Ebook.");
            return;
        }
        const newChapter: Chapter = { title, url: `${targetStory.url}/chapter-${Date.now()}` };
        const updatedChapters = [...(targetStory.chapters || []), newChapter];
        const updatedStory = { ...targetStory, chapters: updatedChapters };
        
        try {
            await setCachedChapter(targetStory.url, newChapter.url, { content, stats: null });
            await dbService.saveStory(updatedStory);
            onUpdateStory(updatedStory);
            
            // Sync to Drive
            if(syncService.isAuthenticated()) {
                syncService.saveStoryDetailsToDrive(updatedStory).catch(console.error);
                syncService.saveChapterContentToDrive(targetStory.url, newChapter.url, { content, stats: null }).catch(console.error);
            }
        } catch (e) {
            setError(`Lỗi tạo chương: ${(e as Error).message}`);
        }
    };

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

    if (isReading && story.chapters) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-[24rem_minmax(0,1fr)_24rem] xl:grid-cols-[28rem_minmax(0,1fr)_28rem] lg:gap-8 w-full px-4 sm:px-8 py-8 sm:py-12 flex-grow">
                <aside className="hidden lg:block sticky top-8 self-start">
                    <CharacterPrimaryPanel 
                        stats={cumulativeStats} 
                        isAnalyzing={isAnalyzing} 
                        onStatsChange={handleStatsChange} 
                        onReanalyze={handleFullReanalysis} 
                        onStopAnalysis={handleStopAnalysis} 
                    />
                </aside>
                <div className="min-w-0">
                    <ChapterContent
                        story={story} currentChapterIndex={selectedChapterIndex!} content={chapterContent}
                        onBack={handleBackToStory} onPrev={handlePrevChapter} onNext={handleNextChapter}
                        onSelectChapter={handleSelectChapter} readChapters={readChapters} settings={settings}
                        onSettingsChange={onSettingsChange} onNavBarVisibilityChange={setIsBottomNavForReadingVisible}
                        cumulativeStats={cumulativeStats} onStatsChange={handleStatsChange}
                        onContentUpdate={handleUpdateChapterContent} onRewrite={handleRewriteChapter}
                        isBusy={isChapterLoading || isAnalyzing || isRewriting || ttsState.status === 'loading'}
                        isAnalyzing={isAnalyzing} onCreateChapter={handleCreateChapter}
                        onTtsRequest={handleTtsRequest} onTtsStop={cleanupTts}
                        onTtsStatusChange={handleTtsStatusChange} onTtsChunkChange={handleTtsChunkChange}
                        ttsStatus={ttsState.status} ttsError={ttsState.error}
                        ttsTextChunks={ttsState.textChunks} ttsCurrentChunkIndex={ttsState.currentChunkIndex}
                        availableSystemVoices={availableSystemVoices}
                        onToggleStats={() => setIsPanelVisible(!isPanelVisible)}
                    />
                </div>
                <aside className="hidden lg:block sticky top-8 self-start">
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
                </aside>

                {/* Mobile Floating Panels */}
                <div className="lg:hidden">
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
                    />
                </div>
                
                {/* ScrollToTopButton - Global (Mobile & Desktop) */}
                <ScrollToTopButton 
                    isReading={true} 
                    isBottomNavVisible={isBottomNavForReadingVisible} 
                    isAudioPlayerActive={ttsState.status !== 'idle' && ttsState.status !== 'error'}
                />
                
                {/* Modals needed during reading */}
                <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} onValidateKey={async (k) => { try { await import('../services/geminiService').then(m => m.validateApiKey(k)); return true; } catch(e: any) { return e.message; } }} onDataChange={onDataChange} tokenUsage={tokenUsage} />
                <ManualImportModal isOpen={manualImportState.isOpen} onClose={() => setManualImportState(prev => ({ ...prev, isOpen: false }))} urlToImport={manualImportState.url} message={manualImportState.message} onFileSelected={handleManualImportFile} />
            </div>
        );
    }

    // Detail View
    return (
        <div className="max-w-screen-2xl mx-auto px-4 py-8 sm:py-12 flex-grow">
            <StoryDetail 
                story={story} 
                onSelectChapter={handleSelectChapter} readChapters={readChapters} lastReadChapterIndex={selectedChapterIndex} 
                onBack={onBack} onUpdateStory={onUpdateStory} onDeleteStory={onDeleteStory}
                onDeleteChapterContent={dbService.deleteChapterData} onCreateChapter={handleCreateChapter}
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
                onSearch={onSearch}
                isSearchLoading={isSearchLoading}
                onOpenHelpModal={onOpenHelpModal}
                onCreateStory={onCreateStory}
            />
        </div>
    );
};

export default StoryViewer;
