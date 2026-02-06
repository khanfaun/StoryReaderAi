
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Story, Chapter, CharacterStats, ReadingSettings, ReadingHistoryItem, ChatMessage, PartialStory, ApiKeyInfo } from './types';
import { searchStory, getChapterContent, getStoryDetails, getStoryFromUrl, parseHtml, parseChapterContentFromDoc, parseStoryDetailsFromDoc } from './services/truyenfullService';
import { analyzeChapterForCharacterStats, chatWithEbook, chatWithChapterContent, validateApiKey, analyzeChapterForPrimaryCharacter, analyzeChapterForWorldInfo, rewriteChapterContent } from './services/geminiService';
import { getCachedChapter, setCachedChapter } from './services/cacheService';
import { getStoryState, saveStoryState as saveStoryStateLocal, mergeChapterStats } from './services/storyStateService';
import { useReadingSettings } from './hooks/useReadingSettings';
import { getReadingHistory, saveReadingHistory, updateReadingHistory } from './services/history';
import * as dbService from './services/dbService';
import * as apiKeyService from './services/apiKeyService';
import { downloadStoryAsEpub } from './services/epubService';

import Header from './components/Header';
import Footer from './components/Footer';
import SearchBar from './components/SearchBar';
import StoryDetail from './components/StoryDetail';
import ChapterContent from './components/ChapterContent';
import LoadingSpinner from './components/LoadingSpinner';
import CharacterPanel from './components/CharacterPanel';
import PanelToggleButton from './components/PanelToggleButton';
import SearchResultsList from './components/SearchResultsList';
import ScrollToTopButton from './components/ScrollToTopButton';
import CharacterPrimaryPanel from './components/CharacterPrimaryPanel';
import ReadingHistory from './components/ReadingHistory';
import ChatPanel from './components/ChatPanel';
import ChatToggleButton from './components/ChatToggleButton';
import ConfirmationModal from './components/ConfirmationModal';
import ApiKeyModal from './components/ApiKeyModal';
import UpdateModal from './components/UpdateModal';
import HelpModal from './components/HelpModal';
import ManualImportModal from './components/ManualImportModal';
import StoryEditModal from './components/StoryEditModal';
import DownloadModal, { DownloadConfig } from './components/DownloadModal';
import { PlusIcon, CloseIcon, CheckIcon, UploadIcon, SpinnerIcon, StopIcon, DownloadIcon } from './components/icons';


declare var JSZip: any;

interface EbookHandler {
  zip: any; // JSZip instance
}

interface ManualImportState {
    isOpen: boolean;
    url: string;
    message: string;
    type: 'chapter' | 'story_details';
    source: string;
    contextData?: any; // To pass extra data like current story object
}

type SortOption = 'newest' | 'oldest' | 'az' | 'za';
type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'ready';

interface TtsState {
  status: TtsStatus;
  textChunks: string[];
  currentChunkIndex: number;
  error: string | null;
}

interface DownloadStatus {
    isProcessing: boolean;
    current: number;
    total: number;
    message: string;
    isError?: boolean;
}

const UPDATE_MODAL_VERSION = 'update_modal_seen_v2'; 

// Hàm chia đoạn thông minh: Tách theo câu để tua chính xác hơn
function splitChapterIntoChunks(text: string): string[] {
    if (!text || text.trim().length === 0) return [];
    const matches = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g);
    if (!matches) return [text];
    const chunks: string[] = [];
    let currentChunk = "";
    const MIN_CHUNK_LENGTH = 300; 
    for (const sentence of matches) {
        currentChunk += sentence;
        if (currentChunk.length >= MIN_CHUNK_LENGTH) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
    }
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}


const App: React.FC = () => {
  const [searchResults, setSearchResults] = useState<Story[] | null>(null);
  const [localStories, setLocalStories] = useState<Story[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | null>(null);
  const [chapterContent, setChapterContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Chỉ true lúc khởi động đầu tiên
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false); // Dùng cho tìm kiếm, tải truyện...
  const [isChapterLoading, setIsChapterLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // State theo dõi các truyện đang được tải ngầm
  const [backgroundLoadingStories, setBackgroundLoadingStories] = useState<Set<string>>(new Set());
  
  const [cumulativeStats, setCumulativeStats] = useState<CharacterStats | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const [isPanelVisible, setIsPanelVisible] = useState<boolean>(false);
  
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  
  const [settings, setSettings] = useReadingSettings();
  const [isBottomNavForReadingVisible, setIsBottomNavForReadingVisible] = useState(true);

  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>([]);

  const [ebookInstance, setEbookInstance] = useState<EbookHandler | null>(null);
  const ebookFileRef = useRef<HTMLInputElement>(null);

  const [isChatPanelVisible, setIsChatPanelVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; item?: ReadingHistoryItem }>({ isOpen: false });

  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(!apiKeyService.hasApiKey());
  const [tokenUsage, setTokenUsage] = useState<apiKeyService.TokenUsage>(apiKeyService.getTokenUsage());
  
  const [ttsState, setTtsState] = useState<TtsState>({
    status: 'idle', textChunks: [], currentChunkIndex: 0, error: null,
  });
  const [availableSystemVoices, setAvailableSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  
  const [manualImportState, setManualImportState] = useState<ManualImportState>({
      isOpen: false, url: '', message: '', type: 'chapter', source: ''
  });
  
  const [isCreateStoryModalOpen, setIsCreateStoryModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [pendingStory, setPendingStory] = useState<Story | null>(null); // Story waiting to be decided (download or read)

  // Background Download State
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>({
      isProcessing: false, current: 0, total: 0, message: ''
  });
  const downloadAbortRef = useRef(false);

  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [filterAuthor, setFilterAuthor] = useState<string | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  const operationIdRef = useRef<number>(0);
  
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
              setIsTagDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const loadVoices = () => {
        let allVoices = window.speechSynthesis.getVoices();
        if (allVoices.length === 0) return;
        allVoices.sort((a, b) => {
            const isViA = a.lang.startsWith('vi');
            const isViB = b.lang.startsWith('vi');
            if (isViA && !isViB) return -1;
            if (!isViA && isViB) return 1;
            const isLowPriorityA = a.lang.startsWith('en') || a.default;
            const isLowPriorityB = b.lang.startsWith('en') || b.default;
            if (isLowPriorityA && !isLowPriorityB) return 1;
            if (!isLowPriorityA && isLowPriorityB) return -1;
            return a.name.localeCompare(b.name);
        });
        setAvailableSystemVoices(allVoices);
        const currentVoiceURI = settings.ttsSettings.voice;
        const isCurrentVoiceValid = allVoices.some(v => v.voiceURI === currentVoiceURI);
        if (!isCurrentVoiceValid && allVoices.length > 0) {
            setSettings({
                ...settings,
                ttsSettings: { ...settings.ttsSettings, voice: allVoices[0].voiceURI }
            });
        }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
    }
  }, [settings, setSettings]);

  // Helper to ensure story has chapters
  const ensureChaptersLoaded = async (storyInput: Story): Promise<Story> => {
      if (storyInput.chapters && storyInput.chapters.length > 0) return storyInput;
      
      setDownloadStatus({ isProcessing: true, current: 0, total: 0, message: 'Đang tải danh sách chương...' });
      try {
          const fullStory = await getStoryDetails(storyInput, undefined, () => {});
          setDownloadStatus({ isProcessing: false, current: 0, total: 0, message: '' });
          return fullStory;
      } catch (e) {
          setDownloadStatus({ isProcessing: false, current: 0, total: 0, message: '' });
          throw e;
      }
  };

  // --- DOWNLOAD LOGIC START ---
  const handleStartDownload = async (config: DownloadConfig) => {
      setIsDownloadModalOpen(false); // Close immediately
      
      let storyToDownload = config.story;
      // 1. Ensure we have chapters before downloading
      try {
          if (!storyToDownload.chapters || storyToDownload.chapters.length === 0) {
              storyToDownload = await ensureChaptersLoaded(storyToDownload);
          }
      } catch (e) {
          setError(`Không thể tải danh sách chương: ${(e as Error).message}`);
          return;
      }

      const { ranges, target, preset, format, mergeCustom } = config;
      const totalChapters = storyToDownload.chapters.length;

      setDownloadStatus({ isProcessing: true, current: 0, total: 0, message: 'Đang khởi tạo...' });
      downloadAbortRef.current = false;

      try {
          const zip = new JSZip(); 
          let hasFiles = false;
          
          let isSingleFile = false;
          if (target === 'library') isSingleFile = true;
          else {
              if (preset === 'all') isSingleFile = true;
              else if (preset === '50' || preset === '100') isSingleFile = false;
              else isSingleFile = mergeCustom;
          }

          if (isSingleFile) {
              const allIndices = new Set<number>();
              ranges.forEach(r => {
                  const start = Math.max(1, Math.min(r.start, totalChapters));
                  const end = Math.max(1, Math.min(r.end, totalChapters));
                  for(let i = Math.min(start, end); i <= Math.max(start, end); i++) allIndices.add(i - 1); 
              });
              
              const sortedIndices = Array.from(allIndices).sort((a, b) => a - b);
              const chaptersToDownload = sortedIndices.map(idx => storyToDownload.chapters![idx]);
              
              if (chaptersToDownload.length === 0) throw new Error("Chưa chọn chương nào hợp lệ.");

              setDownloadStatus(prev => ({ ...prev, total: chaptersToDownload.length, message: `Đang tải ${chaptersToDownload.length} chương...` }));
              
              const blob = await downloadStoryAsEpub(
                  storyToDownload,
                  chaptersToDownload,
                  format,
                  (curr, tot, log, act) => {
                      setDownloadStatus(prev => ({ ...prev, current: curr, total: tot, message: act || log || 'Đang xử lý...' }));
                  },
                  () => downloadAbortRef.current
              );
              
              if (!downloadAbortRef.current) {
                  if (target === 'download') {
                      triggerFileDownload(blob, `${storyToDownload.title} - Full.${format === 'html' ? 'html' : 'epub'}`);
                  } else {
                      setDownloadStatus(prev => ({ ...prev, message: "Đang lưu vào trình duyệt..." }));
                      const timestamp = Date.now();
                      const archiveId = `ebook:archive-${timestamp}`;
                      const fileName = `${storyToDownload.title} (Lưu trữ).epub`;
                      
                      await dbService.saveEbook(archiveId, new File([blob], fileName));
                      const archiveStory: Story = {
                          ...storyToDownload,
                          source: 'Ebook',
                          url: archiveId,
                          title: `${storyToDownload.title} (Offline)`,
                          createdAt: timestamp,
                          chapters: chaptersToDownload,
                          imageUrl: storyToDownload.imageUrl,
                          author: storyToDownload.author
                      };
                      await dbService.saveStory(archiveStory);
                      setLocalStories(prev => [archiveStory, ...prev]);
                      
                      // Auto-delete the original online fetched story to prevent duplicates
                      if (storyToDownload.source !== 'Ebook' && storyToDownload.source !== 'Local') {
                          // We use the ID (url) of the ONLINE story
                          try {
                              await dbService.deleteEbookAndStory(storyToDownload.url);
                              setLocalStories(prev => prev.filter(s => s.url !== storyToDownload.url));
                          } catch (e) {
                              console.warn("Could not auto-delete original story", e);
                          }
                      }
                  }
              }

          } else {
              const totalRanges = ranges.length;
              for (let i = 0; i < totalRanges; i++) {
                  if (downloadAbortRef.current) break;
                  const r = ranges[i];
                  const start = Math.max(1, Math.min(r.start, totalChapters));
                  const end = Math.max(1, Math.min(r.end, totalChapters));
                  const chaptersToDownload = storyToDownload.chapters.slice(start - 1, end);
                  if (chaptersToDownload.length === 0) continue;

                  setDownloadStatus(prev => ({ ...prev, message: `Đang xử lý file ${i+1}/${totalRanges} (Chương ${start}-${end})` }));
                  
                  const blob = await downloadStoryAsEpub(
                      storyToDownload,
                      chaptersToDownload,
                      format,
                      (curr, tot) => {
                          setDownloadStatus(prev => ({ ...prev, current: curr, total: tot }));
                      },
                      () => downloadAbortRef.current
                  );

                  const filename = `${storyToDownload.title} - ${start}-${end}.${format === 'html' ? 'html' : 'epub'}`;
                  zip.file(filename, blob);
                  hasFiles = true;
              }

              if (hasFiles && !downloadAbortRef.current) {
                  setDownloadStatus(prev => ({ ...prev, message: "Đang nén file tổng..." }));
                  const content = await zip.generateAsync({ type: "blob" });
                  triggerFileDownload(content, `${storyToDownload.title} - Batch_Download.zip`);
              }
          }
          
          if (!downloadAbortRef.current) {
              setDownloadStatus(prev => ({ ...prev, isProcessing: false, message: "Hoàn tất!" }));
              setTimeout(() => setDownloadStatus(prev => ({ ...prev, isProcessing: false })), 3000); // Hide toast after 3s
          } else {
              setDownloadStatus({ isProcessing: false, current: 0, total: 0, message: '' });
          }

      } catch (e) {
          setDownloadStatus(prev => ({ ...prev, message: `Lỗi: ${(e as Error).message}`, isError: true }));
          setTimeout(() => setDownloadStatus(prev => ({ ...prev, isProcessing: false, isError: false })), 5000);
      }
  };

  const triggerFileDownload = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleCancelDownload = () => {
      downloadAbortRef.current = true;
      setDownloadStatus(prev => ({ ...prev, message: 'Đang hủy...', isProcessing: false })); // Hide UI immediately
  };
  
  // Handler for "Đọc nhanh không tải" (Cancel on Modal)
  const handleReadWithoutDownload = async () => {
      setIsDownloadModalOpen(false);
      if (pendingStory) {
          // If we chose "Read Quick", we NOW proceed to fetch the details/chapters
          await handleSelectStoryInternal(pendingStory, true); 
          setPendingStory(null);
      }
  };
  // --- DOWNLOAD LOGIC END ---

  const persistStoryState = useCallback((storyUrl: string, state: CharacterStats) => {
    saveStoryStateLocal(storyUrl, state);
  }, []);
  
  const handleStatsChange = useCallback((newStats: CharacterStats) => {
      setCumulativeStats(newStats);
      if (story) {
        persistStoryState(story.url, newStats);
      }
  }, [story, persistStoryState]);
  
  const reloadDataFromStorage = useCallback(async () => {
    setIsDataLoading(true);
    setStory(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
    setSearchResults(null);
    setError(null);
    const localHistory = getReadingHistory();
    const dbStories = await dbService.getAllStories();
    setLocalStories(dbStories);
    
    const historyMap = new Map(localHistory.map(item => [item.url, item]));
    
    dbStories.forEach(dbStory => {
      if (!historyMap.has(dbStory.url)) {
           const placeholderItem: ReadingHistoryItem = {
              title: dbStory.title, author: dbStory.author, url: dbStory.url,
              source: dbStory.source, imageUrl: dbStory.imageUrl,
              lastChapterUrl: dbStory.chapters?.[0]?.url || '',
              lastChapterTitle: dbStory.chapters?.[0]?.title || 'Bắt đầu đọc',
              lastReadTimestamp: 0
           };
           historyMap.set(dbStory.url, placeholderItem);
      }
    });

    const combinedHistory = Array.from(historyMap.values())
        .filter(item => item.lastReadTimestamp > 0) 
        .sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
        
    setReadingHistory(combinedHistory);
    const savedSettingsRaw = localStorage.getItem('truyenReaderSettings');
    if (savedSettingsRaw) {
        try {
            const savedSettings = JSON.parse(savedSettingsRaw);
            setSettings(savedSettings);
        } catch (e) {
            console.error("Failed to parse settings from loaded file", e);
        }
    }
    setTokenUsage(apiKeyService.getTokenUsage());
    setIsApiKeyModalOpen(!apiKeyService.hasApiKey());
    
    setIsDataLoading(false);
  }, [setSettings]);


  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await reloadDataFromStorage();
      
      const hasSeenUpdate = localStorage.getItem(UPDATE_MODAL_VERSION);
      if (!hasSeenUpdate) {
          setIsUpdateModalOpen(true);
      }

      setIsLoading(false);
    };

    loadInitialData();
  }, [reloadDataFromStorage]);

  const handleCloseUpdateModal = () => {
      localStorage.setItem(UPDATE_MODAL_VERSION, 'true');
      setIsUpdateModalOpen(false);
  };

  const resetChat = () => {
    setChatMessages([]);
    setIsChatLoading(false);
  };
  
  const cleanupTts = useCallback(() => {
    window.speechSynthesis.cancel();
    setTtsState({ status: 'idle', textChunks: [], currentChunkIndex: 0, error: null });
  }, []);
  
  useEffect(() => {
      return () => cleanupTts();
  }, [cleanupTts]);

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
  }, []);
  
  const handleTokenUsageUpdate = useCallback((usageData?: { totalTokens?: number, ttsCharacters?: number }) => {
    if (!usageData || (!usageData.totalTokens && !usageData.ttsCharacters)) return;
    const activeApiKey = apiKeyService.getApiKey();
    if (!activeApiKey) return;
    
    setTokenUsage(prevUsage => {
      const newTotalTokens = prevUsage.totalTokens + (usageData.totalTokens || 0);
      const newTtsChars = prevUsage.ttsCharacters + (usageData.ttsCharacters || 0);
      const newUsageState = { ...prevUsage, totalTokens: newTotalTokens, ttsCharacters: newTtsChars };
      apiKeyService.saveTokenUsage(activeApiKey, newUsageState);
      return newUsageState;
    });
  }, []);
    
  const processAndAnalyzeContent = useCallback(async (storyToLoad: Story, chapterUrl: string, content: string) => {
    const currentOpId = ++operationIdRef.current;
    
    setChapterContent(content);
    
    try {
        await setCachedChapter(storyToLoad.url, chapterUrl, { content, stats: null });
    } catch (e) {
        console.error("Failed to initial cache chapter", e);
    }
    
    const currentApiKey = apiKeyService.getApiKey();
    if (!content || content.trim().length === 0 || !currentApiKey) return;

    setIsAnalyzing(true);
    try {
      const currentStats = getStoryState(storyToLoad.url) ?? {};
      const { data: chapterStats, usage } = await analyzeChapterForCharacterStats(content, currentStats);
      
      if (currentOpId !== operationIdRef.current) return; 

      handleTokenUsageUpdate({ totalTokens: usage.totalTokens });
      const newState = mergeChapterStats(currentStats, chapterStats ?? {});
      setCumulativeStats(newState);
      persistStoryState(storyToLoad.url, newState);
      await setCachedChapter(storyToLoad.url, chapterUrl, { content, stats: chapterStats });
    } catch (analysisError) {
      if (currentOpId !== operationIdRef.current) return;
      handleApiError(analysisError);
    } finally {
      if (currentOpId === operationIdRef.current) setIsAnalyzing(false);
    }
  }, [handleApiError, handleTokenUsageUpdate, persistStoryState]);

  const fetchChapter = useCallback(async (storyToLoad: Story, chapterIndex: number) => {
    if (!storyToLoad || !storyToLoad.chapters || chapterIndex < 0 || chapterIndex >= storyToLoad.chapters.length) return;
    
    cleanupTts();
    const chapter = storyToLoad.chapters[chapterIndex];
    setSelectedChapterIndex(chapterIndex);
    
    const newHistory = updateReadingHistory(storyToLoad, chapter);
    setReadingHistory(newHistory);

    const newReadChapters = new Set(readChapters);
    newReadChapters.add(chapter.url);
    localStorage.setItem(`readChapters_${storyToLoad.url}`, JSON.stringify(Array.from(newReadChapters)));
    
    setError(null);
    setChapterContent(null);
    setIsChapterLoading(true);

    const cachedData = await getCachedChapter(storyToLoad.url, chapter.url);
    if (cachedData) {
        setChapterContent(cachedData.content);
        setIsChapterLoading(false); 
        
        if (cachedData.stats) {
            const currentStats = getStoryState(storyToLoad.url) ?? {};
            const newState = mergeChapterStats(currentStats, cachedData.stats);
            setCumulativeStats(newState);
            persistStoryState(storyToLoad.url, newState);
        } else {
            processAndAnalyzeContent(storyToLoad, chapter.url, cachedData.content);
        }
        return;
    }
    
    try {
        let content = "";
        if (storyToLoad.source === 'Ebook' && ebookInstance) {
            const { zip } = ebookInstance;
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
        
        processAndAnalyzeContent(storyToLoad, chapter.url, content);
        
    } catch (err) {
        const error = err as Error;
        const isConnectionError = error.message.includes('CONNECTION_FAILED') || error.message.includes('Proxy');
        if (isConnectionError) {
            setManualImportState({
                isOpen: true,
                url: chapter.url,
                message: "Kết nối mạng không ổn định hoặc nguồn truyện chặn truy cập tự động. Bạn có thể tự tải file chương về và nhập vào đây để đọc.",
                type: 'chapter',
                source: storyToLoad.source,
                contextData: { story: storyToLoad, chapterIndex }
            });
        }
        setError(`Lỗi tải chương: ${error.message}.`);
    } finally {
        setIsChapterLoading(false);
    }
  }, [readChapters, persistStoryState, ebookInstance, processAndAnalyzeContent, cleanupTts]);

  // ... (Removed unrelated helpers for brevity) ...

  const handleUpdateChapterContent = async (newContent: string) => {
        if (!story || selectedChapterIndex === null || !story.chapters) return;
        const chapter = story.chapters[selectedChapterIndex];
        setChapterContent(newContent);
        try {
            await setCachedChapter(story.url, chapter.url, { 
                content: newContent, 
                stats: cumulativeStats
            });
        } catch (e) {
            setError("Không thể lưu nội dung chỉnh sửa vào bộ nhớ.");
        }
  };

  const parseEbookFile = async (file: File): Promise<Story> => {
      const zip = await JSZip.loadAsync(file);
      const parser = new DOMParser();
      const containerXmlText = await zip.file('META-INF/container.xml')?.async('string');
      if (!containerXmlText) throw new Error('File container.xml không hợp lệ hoặc không tồn tại.');
      const containerDoc = parser.parseFromString(containerXmlText, 'application/xml');
      const opfPath = containerDoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
      if (!opfPath) throw new Error('Không tìm thấy file .opf trong container.xml');
      const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
      const opfXmlText = await zip.file(opfPath)?.async('string');
      if (!opfXmlText) throw new Error(`Không thể đọc file .opf tại đường dẫn: ${opfPath}`);
      const opfDoc = parser.parseFromString(opfXmlText, 'application/xml');
      
      const metadataEl = opfDoc.getElementsByTagName('metadata')[0];
      const title = metadataEl.getElementsByTagName('dc:title')[0]?.textContent || 'Không có tiêu đề';
      const author = metadataEl.getElementsByTagName('dc:creator')[0]?.textContent || 'Không rõ tác giả';
      const description = metadataEl.getElementsByTagName('dc:description')[0]?.textContent || 'Không có mô tả.';

      const tags: string[] = [];
      Array.from(metadataEl.getElementsByTagName('dc:subject')).forEach(el => {
          if (el.textContent) tags.push(el.textContent.trim());
      });

      const manifestItems = opfDoc.getElementsByTagName('item');
      const manifestMap = new Map<string, { href: string; mediaType: string }>();
      let ncxId: string | null = null, navHref: string | null = null, coverImageHref: string | null = null;
      for (const item of Array.from(manifestItems)) {
        const id = item.getAttribute('id'), href = item.getAttribute('href'), mediaType = item.getAttribute('media-type');
        if (id && href) manifestMap.set(id, { href: basePath + href, mediaType: mediaType || '' });
        if (item.getAttribute('properties')?.includes('cover-image')) coverImageHref = basePath + href;
        if (item.getAttribute('properties')?.includes('nav')) navHref = basePath + href;
        if (mediaType === 'application/x-dtbncx+xml') ncxId = id;
      }

      let imageUrl = 'https://picsum.photos/400/600';
      if (coverImageHref) {
        const coverFile = zip.file(decodeURIComponent(coverImageHref));
        if (coverFile) {
          const blob = await coverFile.async('blob');
          imageUrl = URL.createObjectURL(blob);
        }
      }
      
      const spineEl = opfDoc.getElementsByTagName('spine')[0];
      if (!spineEl) throw new Error('Cấu trúc Ebook không hợp lệ: Thiếu thẻ <spine> trong file .opf.');
      
      const spineChapters: Chapter[] = [];
      const itemRefs = spineEl.getElementsByTagName('itemref');
      for (const itemRef of Array.from(itemRefs)) {
        const idref = itemRef.getAttribute('idref');
        if (idref && itemRef.getAttribute('linear') !== 'no') {
          const manifestItem = manifestMap.get(idref);
          if (manifestItem && manifestItem.mediaType?.includes('xhtml')) {
            spineChapters.push({ title: `Mục ${spineChapters.length + 1}`, url: manifestItem.href });
          }
        }
      }
      
      const resolvePath = (base: string, relative: string) => {
          try {
              const dummyBase = "http://dummy.com/";
              const absUrl = new URL(relative, dummyBase + base).href;
              const result = absUrl.replace(dummyBase, "");
              return result;
          } catch(e) { return relative; }
      };

      const tocChapters: Chapter[] = [];

      if (navHref) { 
          const navXmlText = await zip.file(navHref).async('string');
          const navDoc = parser.parseFromString(navXmlText, 'text/html');
          const tocNav = navDoc.querySelector('nav[epub\\:type="toc"]') || navDoc.querySelector('nav');
          const navPathDir = navHref.substring(0, navHref.lastIndexOf('/') + 1);

          if (tocNav) {
            const links = tocNav.querySelectorAll('a');
            for (const link of Array.from(links)) {
              const href = link.getAttribute('href');
              const chapterTitle = link.textContent?.trim();
              if (href && chapterTitle) {
                const chapterUrl = resolvePath(navPathDir, href);
                tocChapters.push({ title: chapterTitle, url: chapterUrl });
              }
            }
          }
      } else { 
          const ncxFileIdFromSpine = spineEl.getAttribute('toc');
          const ncxManifestItem = manifestMap.get(ncxFileIdFromSpine || ncxId || '');
          if (ncxManifestItem) {
            const ncxXmlText = await zip.file(ncxManifestItem.href).async('string');
            const ncxDoc = parser.parseFromString(ncxXmlText, 'application/xml');
            const ncxPathDir = ncxManifestItem.href.substring(0, ncxManifestItem.href.lastIndexOf('/') + 1);
            
            const navPoints = ncxDoc.querySelectorAll('navPoint');
            for (const point of Array.from(navPoints)) {
                const label = point.querySelector('navLabel > text')?.textContent?.trim();
                const contentSrc = point.querySelector('content')?.getAttribute('src');
                if (label && contentSrc) {
                    const chapterUrl = resolvePath(ncxPathDir, contentSrc);
                    tocChapters.push({ title: label, url: chapterUrl });
                }
            }
          }
      }
      
      let chapters = tocChapters.length > 0 ? tocChapters : spineChapters;
      
      chapters = chapters.filter(c => !['bìa', 'cover', 'mục lục', 'bản quyền', 'copyright', 'table of contents'].some(kw => c.title.toLowerCase().includes(kw)));
      
      if (chapters.length === 0) chapters = spineChapters;
      if (chapters.length === 0) throw new Error("Không tìm thấy chương có nội dung trong file Ebook này.");

      const ebookStory: Story = { 
          title, author, imageUrl, source: 'Ebook', 
          url: `ebook:${file.name}`, description, chapters,
          createdAt: Date.now(),
          tags: tags
      };
      return ebookStory;
  };

  const handleSelectStoryInternal = async (selectedStory: Story, forceFetch: boolean = false) => {
      setIsDataLoading(true);
      setError(null);
      try {
          let fullStory = selectedStory;
          
          // Only fetch details if chapters are missing OR forceFetch is true (for "Read Quick")
          const needsFetching = (!selectedStory.chapters || selectedStory.chapters.length === 0 || forceFetch) 
                                && selectedStory.source !== 'Local' && selectedStory.source !== 'Ebook';
          
          if (needsFetching) {
              setBackgroundLoadingStories(prev => new Set(prev).add(selectedStory.url));
              fullStory = await getStoryDetails(selectedStory, 
                  async (updatedStory) => {
                      setStory(prev => {
                          if (prev && prev.url === updatedStory.url) {
                              return { ...prev, ...updatedStory };
                          }
                          return prev;
                      });
                      await dbService.saveStory(updatedStory);
                      setLocalStories(prev => {
                          if (prev.some(s => s.url === updatedStory.url)) {
                              return prev.map(s => s.url === updatedStory.url ? updatedStory : s);
                          }
                          return prev;
                      });
                  },
                  () => {
                      setBackgroundLoadingStories(prev => {
                          const next = new Set(prev);
                          next.delete(selectedStory.url);
                          return next;
                      });
                  }
              );
          }
          
          await dbService.saveStory(fullStory);
          setLocalStories(prev => {
              if (prev.some(s => s.url === fullStory.url)) {
                  return prev.map(s => s.url === fullStory.url ? fullStory : s);
              }
              return [fullStory, ...prev];
          });

          if (story?.url !== fullStory.url) {
               setSelectedChapterIndex(null);
               setChapterContent(null);
               setIsPanelVisible(false);
          }

          setStory(fullStory);
          setSearchResults(null); 

          const stats = getStoryState(fullStory.url);
          setCumulativeStats(stats || {});

          const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
          if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
          else setReadChapters(new Set());
          
          window.scrollTo(0, 0);

      } catch (e) {
          setError(`Lỗi tải thông tin truyện: ${(e as Error).message}`);
          setBackgroundLoadingStories(prev => {
              const next = new Set(prev);
              next.delete(selectedStory.url);
              return next;
          });
      } finally {
          setIsDataLoading(false);
      }
  };

  const handleSelectStory = useCallback((selectedStory: Story) => {
      // 1. If Offline story (Ebook/Local) OR has chapters already -> Open directly
      if (selectedStory.source === 'Ebook' || selectedStory.source === 'Local' || (selectedStory.chapters && selectedStory.chapters.length > 0)) {
          handleSelectStoryInternal(selectedStory);
      } else {
          // 2. If Online story and just fetched (no chapters yet) -> Show Download Modal
          setPendingStory(selectedStory);
          setIsDownloadModalOpen(true);
      }
  }, []);

  // ... (Other handlers unchanged) ...

  const handleManualImportFile = async (file: File) => {
      try {
          const text = await file.text();
          const doc = parseHtml(text);
          const { type, source, contextData, url } = manualImportState;

          if (type === 'chapter') {
              setIsChapterLoading(true);
              const { story, chapterIndex } = contextData;
              const content = parseChapterContentFromDoc(doc, source);
              setManualImportState(prev => ({ ...prev, isOpen: false }));
              await processAndAnalyzeContent(story, url, content);
              setIsChapterLoading(false);
              setError(null);
          } else if (type === 'story_details') {
              setIsDataLoading(true);
              let currentSource = source;
              if (source === 'Unknown' || !source) {
                  if (url.includes('truyenfull')) currentSource = 'TruyenFull.vn';
                  else if (url.includes('tangthuvien')) currentSource = 'TangThuVien.net';
              }

              const details = parseStoryDetailsFromDoc(doc, currentSource, url);
              
              const fullStory: Story = {
                  ...(contextData?.partialStory || {}),
                  ...details,
                  createdAt: Date.now()
              };
              
              await dbService.saveStory(fullStory);

              setStory(fullStory);
              setCumulativeStats(getStoryState(fullStory.url) ?? {});
              const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
              if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
              else setReadChapters(new Set());
              
              setLocalStories(prev => {
                if(prev.find(s => s.url === fullStory.url)) return prev;
                return [...prev, fullStory];
              });

              setManualImportState(prev => ({ ...prev, isOpen: false }));
              setIsDataLoading(false);
              setError(null);
          }
      } catch (e) {
          alert(`Lỗi khi đọc file: ${(e as Error).message}`);
      }
  };

  const handleSelectChapter = useCallback((chapter: Chapter) => {
      cleanupTts();
      if (!story || !story.chapters) return;
      const index = story.chapters.findIndex(c => c.url === chapter.url);
      if (index !== -1) {
          window.scrollTo(0, 0);
          fetchChapter(story, index);
      }
  }, [story, fetchChapter, cleanupTts]);

  const handleBackToMain = () => {
    cleanupTts();
    setStory(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
  };
  
  // ... (Previous, Next, TTS Handlers) ...

  const handleCreateStory = async (storyData: Partial<Story> & { ebookFile?: File }) => {
     if (!storyData.title) return;
     const isEbook = !!storyData.ebookFile;
     const source = isEbook ? 'Ebook' : 'Local';
     const url = isEbook ? `ebook:${storyData.ebookFile!.name}` : `local:${Date.now()}`;

     const newStory: Story = {
         title: storyData.title,
         author: storyData.author || 'Tự sáng tác',
         imageUrl: storyData.imageUrl || '',
         description: storyData.description || '',
         source: source,
         url: url,
         chapters: storyData.chapters || [],
         createdAt: Date.now(),
         tags: storyData.tags || []
     };
     
     try {
         if (storyData.ebookFile) await dbService.saveEbook(newStory.url, storyData.ebookFile);
         await dbService.saveStory(newStory);
         setLocalStories(prev => [newStory, ...prev]);
         if (isEbook && storyData.ebookFile) {
             const zip = await JSZip.loadAsync(storyData.ebookFile);
             setEbookInstance({ zip });
             setStory(newStory);
             const newHistory = updateReadingHistory(newStory, newStory.chapters![0]);
             setReadingHistory(newHistory);
             let storyState = getStoryState(newStory.url);
             setCumulativeStats(storyState ?? {});
             const savedRead = localStorage.getItem(`readChapters_${newStory.url}`);
             if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
         } else {
             handleSelectStory(newStory);
         }
     } catch (e) {
         setError(`Lỗi tạo truyện: ${(e as Error).message}`);
     }
  };

  const handleUpdateStory = async (updatedStory: Story) => {
      try {
          await dbService.saveStory(updatedStory);
          setStory(updatedStory);
          setLocalStories(prev => prev.map(s => s.url === updatedStory.url ? updatedStory : s));
          
          const history = getReadingHistory();
          const existingIndex = history.findIndex(item => item.url === updatedStory.url);
          if (existingIndex > -1) {
              history[existingIndex].title = updatedStory.title;
              history[existingIndex].author = updatedStory.author;
              history[existingIndex].imageUrl = updatedStory.imageUrl;
              saveReadingHistory(history);
              setReadingHistory(history);
          }
      } catch (e) {
          setError(`Lỗi cập nhật truyện: ${(e as Error).message}`);
      }
  };

  const handleDeleteStory = async (storyToDelete: Story) => {
      try {
          await dbService.deleteEbookAndStory(storyToDelete.url);
          const history = getReadingHistory().filter(item => item.url !== storyToDelete.url);
          saveReadingHistory(history);
          setReadingHistory(history);
          setLocalStories(prev => prev.filter(s => s.url !== storyToDelete.url));
          handleBackToMain();
      } catch (e) {
          setError(`Lỗi xóa truyện: ${(e as Error).message}`);
      }
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
         if (story?.url === updatedStory.url) setStory(updatedStory);
         setLocalStories(prev => prev.map(s => s.url === updatedStory.url ? updatedStory : s));
     } catch (e) {
         setError(`Lỗi tạo chương: ${(e as Error).message}`);
     }
  };

  // ... (Other handlers like TTS, Chat, etc.) ...
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

  const handleSendMessage = async (message: string) => {
      const currentApiKey = apiKeyService.getApiKey();
      if (!currentApiKey) { setIsApiKeyModalOpen(true); return; }
      setChatMessages(prev => [...prev, { role: 'user', content: message }]);
      setIsChatLoading(true);
      try {
          let responseText = "";
          let usageTokenCount = 0;
          if (chapterContent && story) {
              const result = await chatWithChapterContent(message, chapterContent, story.title);
              responseText = result.text;
              usageTokenCount = result.usage.totalTokens;
          } else if (ebookInstance && story?.chapters) {
              const result = await chatWithEbook(message, ebookInstance.zip, story.chapters);
              responseText = result.text;
              usageTokenCount = result.usage.totalTokens;
          } else {
              responseText = "Chức năng chat chỉ khả dụng khi đang đọc một chương hoặc với Ebook.";
          }
          handleTokenUsageUpdate({ totalTokens: usageTokenCount });
          setChatMessages(prev => [...prev, { role: 'model', content: responseText }]);
      } catch (err) {
          handleApiError(err);
          setChatMessages(prev => [...prev, { role: 'model', content: "Xin lỗi, đã có lỗi xảy ra." }]);
      } finally { setIsChatLoading(false); }
  };

  const handleRewriteChapter = useCallback(async () => {
      const currentApiKey = apiKeyService.getApiKey();
      if (!currentApiKey) { setIsApiKeyModalOpen(true); return; }
      if (!chapterContent || !story || selectedChapterIndex === null) return;
      setIsRewriting(true);
      try {
          const { text, usage } = await rewriteChapterContent(chapterContent);
          handleTokenUsageUpdate({ totalTokens: usage.totalTokens });
          await handleUpdateChapterContent(text);
      } catch (err) { handleApiError(err); } finally { setIsRewriting(false); }
  }, [chapterContent, story, selectedChapterIndex, handleApiError, handleTokenUsageUpdate]);

  const handleBackToStory = () => {
    cleanupTts();
    setSelectedChapterIndex(null);
    setChapterContent(null);
    setError(null);
    setIsPanelVisible(false);
  };

  const handlePrevChapter = () => {
    if (story && selectedChapterIndex !== null && selectedChapterIndex > 0) {
        window.scrollTo(0, 0);
        fetchChapter(story, selectedChapterIndex - 1);
    }
  };

  const handleNextChapter = () => {
    if (story && story.chapters && selectedChapterIndex !== null && selectedChapterIndex < story.chapters.length - 1) {
        window.scrollTo(0, 0);
        fetchChapter(story, selectedChapterIndex + 1);
    }
  };

  const handleReanalyzePrimary = useCallback(async () => {
      const currentApiKey = apiKeyService.getApiKey();
      if (!currentApiKey) { setIsApiKeyModalOpen(true); return; }
      if (!chapterContent || !story) return;
      setIsAnalyzing(true);
      const currentOpId = ++operationIdRef.current;
      try {
          const { data, usage } = await analyzeChapterForPrimaryCharacter(chapterContent, cumulativeStats);
          if (currentOpId !== operationIdRef.current) return;
          handleTokenUsageUpdate({ totalTokens: usage.totalTokens });
          if (data) {
              const currentStats = getStoryState(story.url) ?? {};
              const newState = mergeChapterStats(currentStats, data as CharacterStats);
              setCumulativeStats(newState);
              persistStoryState(story.url, newState);
          }
      } catch (err) { if (currentOpId !== operationIdRef.current) return; handleApiError(err); } finally { if (currentOpId === operationIdRef.current) setIsAnalyzing(false); }
  }, [chapterContent, story, cumulativeStats, handleTokenUsageUpdate, persistStoryState, handleApiError]);

  const handleReanalyzeWorld = useCallback(async () => {
      const currentApiKey = apiKeyService.getApiKey();
      if (!currentApiKey) { setIsApiKeyModalOpen(true); return; }
      if (!chapterContent || !story) return;
      setIsAnalyzing(true);
      const currentOpId = ++operationIdRef.current;
      try {
          const { data, usage } = await analyzeChapterForWorldInfo(chapterContent, cumulativeStats);
          if (currentOpId !== operationIdRef.current) return;
          handleTokenUsageUpdate({ totalTokens: usage.totalTokens });
          if (data) {
              const currentStats = getStoryState(story.url) ?? {};
              const newState = mergeChapterStats(currentStats, data as CharacterStats);
              setCumulativeStats(newState);
              persistStoryState(story.url, newState);
          }
      } catch (err) { if (currentOpId !== operationIdRef.current) return; handleApiError(err); } finally { if (currentOpId === operationIdRef.current) setIsAnalyzing(false); }
  }, [chapterContent, story, cumulativeStats, handleTokenUsageUpdate, persistStoryState, handleApiError]);

  const filteredLibraryStories = useMemo(() => {
      let filtered = [...localStories];
      if (filterSource) filtered = filtered.filter(s => s.source === filterSource);
      if (filterAuthor) filtered = filtered.filter(s => s.author.toLowerCase().includes(filterAuthor.toLowerCase()));
      if (filterTags.length > 0) filtered = filtered.filter(s => filterTags.every(tag => s.tags?.includes(tag)));
      filtered.sort((a, b) => {
          switch (sortOption) {
              case 'newest': return (b.createdAt || 0) - (a.createdAt || 0);
              case 'oldest': return (a.createdAt || 0) - (b.createdAt || 0);
              case 'az': return a.title.localeCompare(b.title);
              case 'za': return b.title.localeCompare(a.title);
              default: return 0;
          }
      });
      return filtered;
  }, [localStories, filterSource, filterAuthor, filterTags, sortOption]);

  const offlineStories = useMemo(() => filteredLibraryStories.filter(s => s.source === 'Ebook' || s.source === 'Local'), [filteredLibraryStories]);
  const onlineStories = useMemo(() => filteredLibraryStories.filter(s => s.source !== 'Ebook' && s.source !== 'Local'), [filteredLibraryStories]);

  const allTags = useMemo(() => {
      const tags = new Set<string>();
      localStories.forEach(s => { if (s.tags) s.tags.forEach(t => tags.add(t)); });
      return Array.from(tags).sort();
  }, [localStories]);

  const toggleTag = (tag: string) => {
      setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleStopAnalysis = useCallback(() => { operationIdRef.current++; setIsAnalyzing(false); }, []);
  const handleValidateKey = async (key: string): Promise<true | string> => {
      try { await validateApiKey(key); return true; } catch (e) { return (e as Error).message; }
  };
  
  const handleTtsStatusChange = (newStatus: TtsStatus) => { setTtsState(prev => ({...prev, status: newStatus})); };
  const handleTtsChunkChange = (newIndex: number) => {
    setTtsState(prev => {
        if (newIndex >= prev.textChunks.length || newIndex < 0) return prev;
        return {...prev, currentChunkIndex: newIndex, status: 'playing'};
    });
  };
  
  const handleRequestDeleteEbook = async (item: ReadingHistoryItem) => { setDeleteConfirmation({ isOpen: true, item }); };
  const confirmDeleteEbook = async () => {
      if (deleteConfirmation.item) {
          await dbService.deleteEbookAndStory(deleteConfirmation.item.url);
          const newHistory = getReadingHistory().filter(h => h.url !== deleteConfirmation.item?.url);
          saveReadingHistory(newHistory);
          setReadingHistory(newHistory);
          setLocalStories(prev => prev.filter(s => s.url !== deleteConfirmation.item?.url));
      }
      setDeleteConfirmation({ isOpen: false });
  };
  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    setIsDataLoading(true); setError(null); setSearchResults(null); setStory(null); setSelectedChapterIndex(null); setChapterContent(null);
    try { const results = await searchStory(query); setSearchResults(results); } catch (err) { setError((err as Error).message); } finally { setIsDataLoading(false); }
  };
  const handleContinueFromHistory = useCallback(async (item: ReadingHistoryItem) => {
    setIsDataLoading(true); setError(null); setSearchResults(null); setSelectedChapterIndex(null); setChapterContent(null);
    try {
        let storyToLoad: Story | null = null;
        if (item.source === 'Ebook') {
             const ebookBuffer = await dbService.getEbookAsArrayBuffer(item.url); 
             if (!ebookBuffer) throw new Error("File Ebook không còn tồn tại trong bộ nhớ.");
             const zip = await JSZip.loadAsync(ebookBuffer);
             setEbookInstance({ zip });
             const storedStory = await dbService.getStory(item.url);
             if (storedStory) storyToLoad = storedStory; else throw new Error("Thông tin truyện không tìm thấy.");
        } else {
             const storedStory = await dbService.getStory(item.url);
             if (storedStory) storyToLoad = storedStory; else { if (item.source === 'Local') throw new Error("Truyện này đã bị xóa."); storyToLoad = await getStoryFromUrl(item.url); }
        }
        if (storyToLoad) {
            setStory(storyToLoad);
            const stats = getStoryState(storyToLoad.url);
            setCumulativeStats(stats ?? {});
            const savedRead = localStorage.getItem(`readChapters_${storyToLoad.url}`);
            if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
            const chapterIndex = storyToLoad.chapters?.findIndex(c => c.url === item.lastChapterUrl) ?? 0;
            const validIndex = chapterIndex >= 0 ? chapterIndex : 0;
            await fetchChapter(storyToLoad, validIndex);
        }
    } catch (e) { setError(`Không thể khôi phục truyện: ${(e as Error).message}`); } finally { setIsDataLoading(false); }
  }, [fetchChapter]);

  // Main Render Logic
  const renderMainContent = () => {
    if (isLoading || isDataLoading) return <LoadingSpinner />;
    if (error && !story && !searchResults && !isChapterLoading) {
      return ( <div className="text-center p-4 bg-rose-900/50 border border-rose-700 rounded-lg"><p className="text-rose-300 font-semibold">Đã xảy ra lỗi</p><p className="text-rose-400 mt-2">{error}</p></div> );
    }
    if (selectedChapterIndex !== null && story && story.chapters) {
        if (isChapterLoading && !chapterContent) return <LoadingSpinner />;
        if (error) { return (<div className="text-center p-4 bg-rose-900/50 border border-rose-700 rounded-lg"><p className="text-rose-300 font-semibold">Không thể tải hoặc phân tích chương</p><p className="text-rose-400 mt-2">{error}</p><button onClick={handleBackToStory} className="mt-4 bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-bold py-2 px-4 rounded-lg">Quay lại</button></div>); }
        if (chapterContent !== null) {
            return (
                <ChapterContent
                  story={story} currentChapterIndex={selectedChapterIndex} content={chapterContent}
                  onBack={handleBackToStory} onPrev={handlePrevChapter} onNext={handleNextChapter}
                  onSelectChapter={handleSelectChapter} readChapters={readChapters} settings={settings}
                  onSettingsChange={setSettings} onNavBarVisibilityChange={setIsBottomNavForReadingVisible}
                  cumulativeStats={cumulativeStats} onStatsChange={handleStatsChange}
                  onContentUpdate={handleUpdateChapterContent} onRewrite={handleRewriteChapter}
                  isBusy={isChapterLoading || isAnalyzing || isRewriting || ttsState.status === 'loading'}
                  isAnalyzing={isAnalyzing} onCreateChapter={handleCreateChapter}
                  onTtsRequest={handleTtsRequest} onTtsStop={cleanupTts}
                  onTtsStatusChange={handleTtsStatusChange} onTtsChunkChange={handleTtsChunkChange}
                  ttsStatus={ttsState.status} ttsError={ttsState.error}
                  ttsTextChunks={ttsState.textChunks} ttsCurrentChunkIndex={ttsState.currentChunkIndex}
                  availableSystemVoices={availableSystemVoices}
                />
            );
        }
         return <LoadingSpinner />;
    }
    if (story) return (
      <StoryDetail 
        story={story} 
        onSelectChapter={handleSelectChapter} readChapters={readChapters} lastReadChapterIndex={selectedChapterIndex} 
        onBack={handleBackToMain} onUpdateStory={handleUpdateStory} onDeleteStory={handleDeleteStory}
        onDeleteChapterContent={dbService.deleteChapterData} onCreateChapter={handleCreateChapter}
        onFilterAuthor={setFilterAuthor} onFilterTag={(tag) => { setFilterTags([tag]); setSortOption('newest'); }}
        isBackgroundLoading={backgroundLoadingStories.has(story.url)}
        onStartDownload={handleStartDownload}
      />
    );
    if (searchResults) return <SearchResultsList results={searchResults} onSelectStory={handleSelectStory} />;
    return (
        <div className="space-y-12">
            {readingHistory.length > 0 && ( <section><ReadingHistory items={readingHistory} onContinue={handleContinueFromHistory} onRequestDeleteEbook={handleRequestDeleteEbook} /></section> )}
            
            {localStories.length > 0 && (
                <section className="animate-fade-in">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b-2 border-[var(--theme-border)] pb-2">
                        <h2 className="text-2xl font-bold text-[var(--theme-text-primary)]">Thư viện của bạn <span className="text-sm font-normal text-[var(--theme-text-secondary)]">({filteredLibraryStories.length} truyện)</span></h2>
                        <div className="flex flex-wrap items-center gap-3">
                            <select value={sortOption} onChange={(e) => setSortOption(e.target.value as SortOption)} className="bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] text-sm rounded-lg p-2 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)]">
                                <option value="newest">Mới thêm</option><option value="oldest">Cũ nhất</option><option value="az">A - Z</option><option value="za">Z - A</option>
                            </select>
                            <select value={filterSource || ''} onChange={(e) => setFilterSource(e.target.value || null)} className="bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] text-sm rounded-lg p-2 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)]">
                                <option value="">Tất cả nguồn</option><option value="TruyenFull.vn">Web (TruyenFull)</option><option value="TangThuVien.net">Web (TTV)</option><option value="Ebook">Ebook</option><option value="Local">Tự thêm</option>
                            </select>
                            <div className="relative" ref={tagDropdownRef}>
                                <button onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)} className="bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] text-sm rounded-lg p-2 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)] min-w-[150px] text-left flex justify-between items-center"><span className="truncate">{filterTags.length === 0 ? "Tất cả thể loại" : `${filterTags.length} thể loại`}</span><svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                                {isTagDropdownOpen && (
                                    <div className="absolute z-20 mt-1 w-64 max-h-60 overflow-y-auto bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl p-2 animate-fade-in-up">
                                        {allTags.map(tag => (
                                            <div key={tag} className="flex items-center p-2 hover:bg-[var(--theme-bg-base)] rounded cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}>
                                                <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${filterTags.includes(tag) ? 'bg-[var(--theme-accent-primary)] border-[var(--theme-accent-primary)]' : 'border-gray-500'}`}>{filterTags.includes(tag) && <CheckIcon className="w-3 h-3 text-white" />}</div>
                                                <span className="text-sm text-[var(--theme-text-primary)]">{tag}</span>
                                            </div>
                                        ))}
                                        {allTags.length === 0 && <p className="text-sm text-[var(--theme-text-secondary)] p-2">Không có thể loại nào.</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {(filterSource || filterAuthor || filterTags.length > 0) && (
                        <div className="flex gap-2 mb-4 flex-wrap">
                            {filterSource && <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[var(--theme-accent-primary)]/20 text-[var(--theme-accent-primary)] border border-[var(--theme-accent-primary)]">Nguồn: {filterSource}<button onClick={() => setFilterSource(null)} className="hover:text-white"><CloseIcon className="w-3 h-3" /></button></span>}
                            {filterAuthor && <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[var(--theme-accent-secondary)]/20 text-[var(--theme-accent-secondary)] border border-[var(--theme-accent-secondary)]">Tác giả: {filterAuthor}<button onClick={() => setFilterAuthor(null)} className="hover:text-white"><CloseIcon className="w-3 h-3" /></button></span>}
                            {filterTags.map(tag => ( <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-purple-600/20 text-purple-400 border border-purple-500">{tag}<button onClick={() => toggleTag(tag)} className="hover:text-white"><CloseIcon className="w-3 h-3" /></button></span>))}
                            <button onClick={() => { setFilterSource(null); setFilterAuthor(null); setFilterTags([]); }} className="text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] underline">Xóa bộ lọc</button>
                        </div>
                    )}
                    
                    {/* Separate Offline and Online Stories */}
                    {offlineStories.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-[var(--theme-accent-primary)] mb-4 flex items-center gap-2">
                                <DownloadIcon className="w-5 h-5" /> Truyện đã tải / Tự thêm
                            </h3>
                            <SearchResultsList results={offlineStories} onSelectStory={handleSelectStory} onFilterAuthor={setFilterAuthor} onFilterSource={setFilterSource} onFilterTag={(tag) => setFilterTags([tag])} backgroundLoadingStories={backgroundLoadingStories} />
                        </div>
                    )}
                    
                    {onlineStories.length > 0 && (
                        <div>
                            <h3 className="text-lg font-bold text-[var(--theme-text-secondary)] mb-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Truyện đang theo dõi (Online)
                            </h3>
                            <SearchResultsList results={onlineStories} onSelectStory={handleSelectStory} onFilterAuthor={setFilterAuthor} onFilterSource={setFilterSource} onFilterTag={(tag) => setFilterTags([tag])} backgroundLoadingStories={backgroundLoadingStories} />
                        </div>
                    )}
                </section>
            )}
            {!readingHistory.length && !localStories.length && ( <div className="text-center text-[var(--theme-text-secondary)] py-12"><h2 className="text-2xl mb-4 text-[var(--theme-text-primary)]">Chào mừng đến với Trình Đọc Truyện</h2><p>Sử dụng thanh tìm kiếm để tìm truyện hoặc tạo truyện mới để bắt đầu.</p></div> )}
        </div>
    );
  };
  
  const isReading = selectedChapterIndex !== null && !!story && chapterContent !== null;
  const mainContainerClass = isReading ? "w-full px-4 sm:px-8 py-8 sm:py-12 flex-grow" : "max-w-screen-2xl mx-auto px-4 py-8 sm:py-12 flex-grow";
  const appContentClass = isApiKeyModalOpen || isUpdateModalOpen || isHelpModalOpen || manualImportState.isOpen || isCreateStoryModalOpen || isDownloadModalOpen ? 'blur-sm pointer-events-none' : '';

  return (
    <div className="flex flex-col min-h-screen bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] font-sans transition-colors duration-300 relative">
      {/* GLOBAL DOWNLOAD PROGRESS TOAST */}
      {downloadStatus.isProcessing && (
          <div className="fixed bottom-4 right-4 z-[200] max-w-sm w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-2xl p-4 animate-fade-in-up">
              <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-[var(--theme-text-primary)] text-sm flex items-center gap-2">
                      <SpinnerIcon className="w-4 h-4 animate-spin text-[var(--theme-accent-primary)]" />
                      Đang xử lý tải xuống
                  </h4>
                  <button onClick={handleCancelDownload} className="text-rose-400 hover:text-rose-300 p-1 rounded-md hover:bg-rose-900/20" title="Hủy tải xuống">
                      <StopIcon className="w-4 h-4" />
                  </button>
              </div>
              <div className="w-full bg-[var(--theme-bg-base)] rounded-full h-2 mb-2 overflow-hidden">
                  <div 
                      className="bg-[var(--theme-accent-primary)] h-full transition-all duration-300 relative" 
                      style={{ width: `${downloadStatus.total > 0 ? (downloadStatus.current / downloadStatus.total) * 100 : 0}%` }}
                  >
                      <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                  </div>
              </div>
              <div className="flex justify-between text-xs text-[var(--theme-text-secondary)]">
                  <span className="truncate max-w-[70%]">{downloadStatus.message}</span>
                  <span>{Math.round(downloadStatus.total > 0 ? (downloadStatus.current / downloadStatus.total) * 100 : 0)}%</span>
              </div>
          </div>
      )}

      <div className={appContentClass}>
        <Header onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)} onOpenUpdateModal={() => setIsUpdateModalOpen(true)} onGoHome={handleBackToMain} />
        <main className={mainContainerClass}>
            <div className="mb-8 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
                <div className="flex-grow">
                    <SearchBar onSearch={handleSearch} isLoading={isDataLoading} onOpenHelpModal={() => setIsHelpModalOpen(true)} />
                </div>
                 {!isReading && !searchResults && (
                    <button onClick={() => setIsCreateStoryModalOpen(true)} className="flex-shrink-0 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors h-auto">
                        <PlusIcon className="w-5 h-5" /> <span className="whitespace-nowrap">Tạo truyện mới</span>
                    </button>
                )}
            </div>
            {isReading ? (
            <div className="grid grid-cols-1 lg:grid-cols-[24rem_minmax(0,1fr)_24rem] xl:grid-cols-[28rem_minmax(0,1fr)_28rem] lg:gap-8">
                <aside className="hidden lg:block sticky top-8 self-start">
                <CharacterPrimaryPanel stats={cumulativeStats} isAnalyzing={isAnalyzing} onStatsChange={handleStatsChange} onDataLoaded={reloadDataFromStorage} onReanalyze={handleReanalyzePrimary} onStopAnalysis={handleStopAnalysis} />
                </aside>
                <div className="min-w-0">{renderMainContent()}</div>
                <aside className="hidden lg:block sticky top-8 self-start">
                <CharacterPanel stats={cumulativeStats} isAnalyzing={isAnalyzing} isOpen={true} onClose={() => {}} isSidebar={true} onStatsChange={handleStatsChange} onDataLoaded={reloadDataFromStorage} onReanalyze={handleReanalyzeWorld} onStopAnalysis={handleStopAnalysis} />
                </aside>
            </div>
            ) : ( <div>{renderMainContent()}</div> )}
        </main>
        {!isReading && <Footer />}
      </div>

      <div className={appContentClass}>
        <div className="lg:hidden">
            {isReading && (
                <>
                    <PanelToggleButton onClick={() => setIsPanelVisible(!isPanelVisible)} isPanelOpen={isPanelVisible} isBottomNavVisible={isBottomNavForReadingVisible} />
                    <CharacterPanel isOpen={isPanelVisible} onClose={() => setIsPanelVisible(false)} stats={cumulativeStats} isAnalyzing={isAnalyzing} isSidebar={false} onStatsChange={handleStatsChange} onDataLoaded={reloadDataFromStorage} onReanalyze={handleReanalyzeWorld} onStopAnalysis={handleStopAnalysis} />
                </>
            )}
        </div>
        {isReading && (
            <>
            <ChatToggleButton onClick={() => setIsChatPanelVisible(!isChatPanelVisible)} isPanelOpen={isChatPanelVisible} isBottomNavVisible={isBottomNavForReadingVisible} />
            <ChatPanel isOpen={isChatPanelVisible} onClose={() => setIsChatPanelVisible(false)} messages={chatMessages} onSendMessage={handleSendMessage} isLoading={isChatLoading} storyTitle={story?.title} />
            </>
        )}
        <ScrollToTopButton isReading={isReading} isBottomNavVisible={isBottomNavForReadingVisible} />
      </div>

      <UpdateModal isOpen={isUpdateModalOpen} onClose={handleCloseUpdateModal} />
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} onValidateKey={handleValidateKey} onDataChange={reloadDataFromStorage} tokenUsage={tokenUsage} />
      <ManualImportModal isOpen={manualImportState.isOpen} onClose={() => setManualImportState(prev => ({ ...prev, isOpen: false }))} urlToImport={manualImportState.url} message={manualImportState.message} onFileSelected={handleManualImportFile} />
      <StoryEditModal isOpen={isCreateStoryModalOpen} onClose={() => setIsCreateStoryModalOpen(false)} onSave={handleCreateStory} onParseEbook={parseEbookFile} />
      <DownloadModal isOpen={isDownloadModalOpen} onClose={handleReadWithoutDownload} story={pendingStory || story} onStartDownload={handleStartDownload} />
      <ConfirmationModal isOpen={deleteConfirmation.isOpen} onClose={() => setDeleteConfirmation({ isOpen: false })} onConfirm={confirmDeleteEbook} title="Xác nhận xóa">
        <p>Bạn có chắc chắn muốn xóa truyện <strong className="text-[var(--theme-text-primary)]">{deleteConfirmation.item?.title}</strong> {' '}vĩnh viễn không?</p>
        <p className="mt-2 text-sm text-rose-400">Hành động này không thể hoàn tác.</p>
      </ConfirmationModal>
    </div>
  );
};

export default App;
