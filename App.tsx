
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Story, Chapter, ReadingHistoryItem, ApiKeyInfo, DownloadConfig } from './types';
import { searchStory, getStoryDetails, getStoryFromUrl, parseHtml, parseStoryDetailsFromDoc } from './services/truyenfullService';
import { validateApiKey } from './services/geminiService';
import { getCachedChapter, setCachedChapter } from './services/cacheService';
import { useReadingSettings } from './hooks/useReadingSettings';
import { getReadingHistory, saveReadingHistory, updateReadingHistory } from './services/history';
import * as dbService from './services/dbService';
import * as apiKeyService from './services/apiKeyService';
import * as syncService from './services/sync'; // Import Sync Service
import { parseEbookFile } from './services/ebookParser';
import { useBackgroundDownload } from './hooks/useBackgroundDownload';
import { useDownloader } from './hooks/useDownloader';

import Header from './components/Header';
import Footer from './components/Footer';
import SearchBar from './components/SearchBar';
import LoadingSpinner from './components/LoadingSpinner';
import SearchResultsList from './components/SearchResultsList';
import ReadingHistory from './components/ReadingHistory';
import ApiKeyModal from './components/ApiKeyModal';
import UpdateModal from './components/UpdateModal';
import HelpModal from './components/HelpModal';
import ManualImportModal from './components/ManualImportModal';
import StoryEditModal from './components/StoryEditModal';
import ChapterEditModal from './components/ChapterEditModal';
import DownloadModal from './components/DownloadModal';
import ConfirmationModal from './components/ConfirmationModal';
import GlobalDownloadManager from './components/GlobalDownloadManager';
import SyncModal from './components/SyncModal'; 
import MobileSearchModal from './components/MobileSearchModal';
import { PlusIcon, StopIcon, SpinnerIcon, CheckIcon, CloseIcon, UploadIcon, DownloadIcon } from './components/icons';

import StoryViewer from './components/StoryViewer';

declare var JSZip: any;

interface EbookHandler {
  zip: any; 
}

interface ManualImportState {
    isOpen: boolean;
    url: string;
    message: string;
    type: 'chapter' | 'story_details';
    source: string;
    contextData?: any; 
}

type SortOption = 'newest' | 'oldest' | 'az' | 'za';

interface DownloadStatus {
    isProcessing: boolean;
    current: number;
    total: number;
    message: string;
    isError?: boolean;
}

interface NewChapterData {
    number: number;
    title: string;
    content: string;
}

const UPDATE_MODAL_VERSION = 'update_modal_seen_v2'; 

const App: React.FC = () => {
  const [searchResults, setSearchResults] = useState<Story[] | null>(null);
  const [localStories, setLocalStories] = useState<Story[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [initialChapterIndex, setInitialChapterIndex] = useState<number | null>(null); // State mới để điều hướng trực tiếp
  const [initialScrollPercentage, setInitialScrollPercentage] = useState<number>(0);
  const [initialParagraphIndex, setInitialParagraphIndex] = useState<number>(0); // NEW: Anchor Scrolling

  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [isReadingMode, setIsReadingMode] = useState<boolean>(false);
  
  const [backgroundLoadingStories, setBackgroundLoadingStories] = useState<Set<string>>(new Set());
  const [cachedChapters, setCachedChapters] = useState<Set<string>>(new Set());

  const { 
      backgroundDownloads,
      downloadQueue, 
      handleStartBackgroundDownload, 
      handlePauseBackgroundDownload, 
      handleResumeBackgroundDownload, 
      handleStopBackgroundDownload,
      handlePrioritize,
      handleRemoveFromQueue,
      runBackgroundContentFetcher 
  } = useBackgroundDownload(setCachedChapters);
  
  const { downloadStatus, handleStartDownload, handleCancelDownload, setDownloadStatus } = useDownloader((msg) => setError(msg));

  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useReadingSettings();
  const [isBottomNavForReadingVisible, setIsBottomNavForReadingVisible] = useState(true);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>([]);
  const [ebookInstance, setEbookInstance] = useState<EbookHandler | null>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; item?: ReadingHistoryItem }>({ isOpen: false });
  const [overwriteConfirmation, setOverwriteConfirmation] = useState<{ isOpen: boolean; chapters: NewChapterData[]; story: Story } | null>(null);
  
  // SỬA ĐỔI: Khởi tạo state dựa trên localStorage để không hiện lại nếu đã tắt
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(() => {
      const hasKey = apiKeyService.hasApiKey();
      const hasDismissed = localStorage.getItem('dismissed_api_key_modal');
      return !hasKey && !hasDismissed;
  });

  const [tokenUsage, setTokenUsage] = useState<apiKeyService.TokenUsage>(apiKeyService.getTokenUsage());
  
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false); 
  
  // State cho Mobile Search
  const [isMobileSearchModalOpen, setIsMobileSearchModalOpen] = useState(false);

  const [manualImportState, setManualImportState] = useState<ManualImportState>({
      isOpen: false, url: '', message: '', type: 'chapter', source: ''
  });
  
  const [isCreateStoryModalOpen, setIsCreateStoryModalOpen] = useState(false);
  const [isCreateChapterModalOpen, setIsCreateChapterModalOpen] = useState(false);
  
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [pendingStory, setPendingStory] = useState<Story | null>(null); 

  const loadingAbortRef = useRef(false); 

  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [filterAuthor, setFilterAuthor] = useState<string | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // --- GLOBAL SCROLL / HEADER VISIBILITY LOGIC ---
  const [isGlobalHeaderVisible, setIsGlobalHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
      // Logic cuộn chỉ hoạt động khi đang đọc truyện (story mode)
      if (!story) {
          setIsGlobalHeaderVisible(true);
          return;
      }

      const handleScroll = () => {
          // Nếu không ở chế độ đọc chi tiết (đang ở StoryDetail chẳng hạn), vẫn giữ logic
          // Nhưng logic này chủ yếu để đồng bộ 2 header trong ChapterContent.
          if (!isReadingMode) {
              // Trong trang chi tiết (chưa vào đọc), header cũng có thể autohide
              // nhưng không cần đồng bộ với sub-header.
              // Tuy nhiên để trải nghiệm nhất quán, ta dùng chung logic.
          }

          const currentScrollY = window.scrollY;
          
          if (currentScrollY < lastScrollYRef.current || currentScrollY < 50) {
              setIsGlobalHeaderVisible(true);
          } else if (currentScrollY > lastScrollYRef.current && currentScrollY > 50) {
              setIsGlobalHeaderVisible(false);
          }
          
          lastScrollYRef.current = currentScrollY;
      };

      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
  }, [story, isReadingMode]);


  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
              setIsTagDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartDownloadWrapper = async (config: DownloadConfig) => {
      setIsDownloadModalOpen(false);
      handleStartDownload(config);
  }

  const handleReadWithoutDownload = async () => {
      setIsDownloadModalOpen(false);
      setPendingStory(null);
  };
  
  const handleImportDataSuccess = () => {
      reloadDataFromStorage();
  };

  // SỬA ĐỔI: Hàm đóng ApiKeyModal và lưu trạng thái vào localStorage
  const handleCloseApiKeyModal = () => {
      localStorage.setItem('dismissed_api_key_modal', 'true');
      setIsApiKeyModalOpen(false);
  };

  const reloadDataFromStorage = useCallback(async () => {
    setIsDataLoading(true);
    
    // 1. Tải dữ liệu Local
    const localHistory = getReadingHistory();
    const dbStories = await dbService.getAllStories();
    
    // 2. Nếu đã đăng nhập Drive, tải Index từ Drive về và hợp nhất (Lazy Sync)
    try {
        await syncService.initGoogleDrive(); // Đảm bảo init để check token
        if (syncService.isAuthenticated()) {
            console.log("Drive authenticated, lazy syncing index...");
            // Lấy danh sách từ Drive
            const driveStories = await syncService.fetchLibraryIndexFromDrive();
            
            // Hợp nhất: Thêm truyện từ Drive nếu Local chưa có
            const mergedStories = [...dbStories];
            const existingUrls = new Set(dbStories.map(s => s.url));
            
            let hasNewFromDrive = false;
            for (const dStory of driveStories) {
                if (!existingUrls.has(dStory.url)) {
                    mergedStories.push(dStory);
                    existingUrls.add(dStory.url);
                    // Lưu metadata cơ bản vào local DB để hiển thị
                    await dbService.saveStory(dStory); 
                    hasNewFromDrive = true;
                }
            }
            
            if (hasNewFromDrive) {
                setLocalStories(mergedStories);
            } else {
                setLocalStories(dbStories);
            }
        } else {
            setLocalStories(dbStories);
        }
    } catch (e) {
        console.warn("Sync check failed", e);
        setLocalStories(dbStories);
    }
    
    // 3. Xây dựng lịch sử đọc
    const historyMap = new Map(localHistory.map(item => [item.url, item]));
    const currentStories = await dbService.getAllStories(); // Lấy lại bản mới nhất sau khi merge

    currentStories.forEach(dbStory => {
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
    
    // SỬA ĐỔI: Chỉ mở lại nếu chưa từng tắt. Không force mở mỗi lần reload.
    if (!apiKeyService.hasApiKey() && !localStorage.getItem('dismissed_api_key_modal')) {
        setIsApiKeyModalOpen(true);
    }
    
    setIsDataLoading(false);
  }, [setSettings]);


  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      // Init Drive trước khi load data
      try {
          await syncService.initGoogleDrive();
      } catch(e) { console.warn("Google Drive API init failed", e); }

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

  const handleSelectStoryInternal = async (selectedStory: Story, forceFetch: boolean = false) => {
      setIsDataLoading(true);
      loadingAbortRef.current = false; 
      setError(null);
      try {
          const cachedUrls = await dbService.getCachedChapterUrls(selectedStory.url);
          setCachedChapters(new Set(cachedUrls));

          let fullStory = selectedStory;
          
          // SYNC LOGIC: Check Drive Metadata First
          // Nếu đã đăng nhập, luôn kiểm tra xem trên Drive có bản cập nhật mới hơn của truyện này không (danh sách chương)
          // Điều này giúp Máy B nhận được danh sách chương từ Máy A mà không cần cào lại Web.
          if (syncService.isAuthenticated()) {
              console.log("Checking Drive for story metadata...");
              try {
                  const driveStory = await syncService.fetchStoryDetailsFromDrive(fullStory.url);
                  if (driveStory) {
                      console.log("Loaded story details from Drive.");
                      // Merge với thông tin local để đảm bảo nhất quán
                      fullStory = { ...fullStory, ...driveStory };
                      await dbService.saveStory(fullStory); // Cache lại local
                  }
              } catch (e) {
                  console.warn("Could not fetch story metadata from Drive, falling back to Web/Local", e);
              }
          }

          // Chỉ fetch từ Web nếu:
          // 1. Không có chương nào (Local và Drive đều trống)
          // 2. Hoặc forceFetch được bật
          // 3. VÀ không phải là truyện Local/Ebook
          const needsFetching = (!fullStory.chapters || fullStory.chapters.length === 0 || forceFetch) 
                                && fullStory.source !== 'Local' && fullStory.source !== 'Ebook';
          
          if (needsFetching) {
              if (loadingAbortRef.current) throw new Error("Đã hủy quá trình tải.");
              setBackgroundLoadingStories(prev => new Set(prev).add(fullStory.url));
              
              fullStory = await getStoryDetails(fullStory, 
                  async (updatedStory) => {
                      if (loadingAbortRef.current) return;
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
                          next.delete(fullStory.url);
                          return next;
                      });
                  }
              );
          }
          
          if (loadingAbortRef.current) throw new Error("Đã hủy quá trình tải.");

          await dbService.saveStory(fullStory);
          
          // DRIVE SYNC: Sau khi có metadata đầy đủ (dù từ Web hay Drive), lưu/cập nhật lại lên Drive để đảm bảo đồng bộ
          if (syncService.isAuthenticated()) {
              syncService.saveStoryDetailsToDrive(fullStory).catch(console.error);
              // Cập nhật index chính (library_index.json)
              syncService.syncLibraryIndex().catch(console.error);
          }

          setLocalStories(prev => {
              if (prev.some(s => s.url === fullStory.url)) {
                  return prev.map(s => s.url === fullStory.url ? fullStory : s);
              }
              return [fullStory, ...prev];
          });

          // Set story active
          setStory(fullStory);
          setSearchResults(null); 

          const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
          if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
          else setReadChapters(new Set());
          
          window.scrollTo(0, 0);

          // TỰ ĐỘNG TẢI NGẦM TOÀN BỘ (Nếu không phải Local/Ebook)
          // Lưu ý: Logic tải ngầm cũng sẽ ưu tiên lấy từ Drive trước nếu có
          if (fullStory.chapters && fullStory.chapters.length > 0 && fullStory.source !== 'Local' && fullStory.source !== 'Ebook') {
              runBackgroundContentFetcher(fullStory, 0);
          }

      } catch (e) {
          if (!loadingAbortRef.current) {
            setError(`Lỗi tải thông tin truyện: ${(e as Error).message}`);
          }
          setBackgroundLoadingStories(prev => {
              const next = new Set(prev);
              next.delete(selectedStory.url);
              return next;
          });
      } finally {
          setIsDataLoading(false);
      }
  };

  const handleSelectStory = useCallback(async (selectedStory: Story) => {
      // Logic chọn truyện
      const existingStory = await dbService.getStory(selectedStory.url);
      
      // KIỂM TRA LỊCH SỬ ĐỂ KHÔI PHỤC VỊ TRÍ ĐỌC
      // Thay vì reset về 0, ta kiểm tra xem truyện này có trong lịch sử không
      const history = getReadingHistory();
      const historyItem = history.find(h => h.url === selectedStory.url);
      
      if (historyItem && historyItem.lastScrollPosition) {
          setInitialScrollPercentage(historyItem.lastScrollPosition);
      } else {
          setInitialScrollPercentage(0);
      }
      setInitialParagraphIndex(0);
      
      if (existingStory) {
           handleSelectStoryInternal(existingStory);
           // Nếu local có, và là truyện Web, luôn kiểm tra/tải tiếp các chương còn thiếu
           if (existingStory.chapters && existingStory.chapters.length > 0 && existingStory.source !== 'Local' && existingStory.source !== 'Ebook') {
               runBackgroundContentFetcher(existingStory, 0);
           }
           return;
      }
      
      // Nếu không có local, gọi hàm internal để xử lý (nó sẽ check Drive -> Web)
      handleSelectStoryInternal(selectedStory);

  }, [runBackgroundContentFetcher]);

  const handleCancelLoading = () => {
      loadingAbortRef.current = true;
      setIsDataLoading(false);
      setError("Đã hủy tải truyện.");
  };

  // --- FEATURE: REDOWNLOAD STORY ---
  const handleRedownloadStory = async (storyToReset: Story) => {
      if (!storyToReset) return;
      
      // 1. Dừng các tiến trình tải ngầm
      handleStopBackgroundDownload(storyToReset.url);
      
      // 2. Xóa Cache trong DB
      try {
          await dbService.deleteAllStoryChapters(storyToReset.url);
          setCachedChapters(new Set()); // Reset visual cache tick
          
          // 3. Force Fetch metadata lại từ đầu
          await handleSelectStoryInternal(storyToReset, true);
          
          // 4. Bắt đầu tải ngầm lại từ đầu
          // Lấy story mới nhất từ state (hoặc object đã update) để đảm bảo có danh sách chương
          // handleSelectStoryInternal đã update state `story`, nhưng để chắc chắn ta dùng callback
          // hoặc đơn giản gọi lại fetcher với đối tượng hiện tại
          runBackgroundContentFetcher(storyToReset, 0);
          
      } catch(e) {
          setError(`Lỗi khi tải lại dữ liệu: ${(e as Error).message}`);
      }
  };

  const handleManualImportFile = async (file: File) => {
      try {
          const text = await file.text();
          const doc = parseHtml(text);
          const { type, source, url } = manualImportState;

          if (type === 'story_details') {
              setIsDataLoading(true);
              let currentSource = source;
              if (source === 'Unknown' || !source) {
                  if (url.includes('truyenfull')) currentSource = 'TruyenFull.vn';
                  else if (url.includes('tangthuvien')) currentSource = 'TangThuVien.net';
              }

              const details = parseStoryDetailsFromDoc(doc, currentSource, url);
              
              const fullStory: Story = {
                  ...(manualImportState.contextData?.partialStory || {}),
                  ...details,
                  createdAt: Date.now()
              };
              
              await dbService.saveStory(fullStory);

              setStory(fullStory);
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

  const handleBackToMain = () => {
    setStory(null);
    setInitialChapterIndex(null); // Reset chỉ số chương khởi tạo
    setEbookInstance(null); // Reset ebook instance
    setIsReadingMode(false); // Reset reading mode
    setInitialScrollPercentage(0);
    setInitialParagraphIndex(0);
    
    // Reset search context
    setSearchResults(null);
    setError(null);
  };
  
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
         
         // DRIVE SYNC: Lưu truyện mới tạo
         if (syncService.isAuthenticated()) {
             await syncService.saveStoryDetailsToDrive(newStory);
             await syncService.syncLibraryIndex();
         }

         setLocalStories(prev => [newStory, ...prev]);
         if (isEbook && storyData.ebookFile) {
             const zip = await JSZip.loadAsync(storyData.ebookFile);
             setEbookInstance({ zip });
             setStory(newStory);
             const newHistory = updateReadingHistory(newStory, newStory.chapters![0]);
             setReadingHistory(newHistory);
             const savedRead = localStorage.getItem(`readChapters_${newStory.url}`);
             if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
         } else {
             handleSelectStory(newStory);
         }
     } catch (e) {
         setError(`Lỗi tạo truyện: ${(e as Error).message}`);
     }
  };

  const executeAddChapters = async (targetStory: Story, chaptersToAdd: NewChapterData[], isOverwrite: boolean) => {
      try {
          const timestamp = Date.now();
          const finalChapters = [...(targetStory.chapters || [])];
          
          await Promise.all(chaptersToAdd.map(async (ch, index) => {
              // Logic: Chapter Number trong mảng bắt đầu từ 1. Index mảng = number - 1.
              // Nếu overwrite, ta tìm chapter ở vị trí (ch.number - 1).
              const targetIndex = ch.number - 1;
              let chapUrl = "";
              
              if (isOverwrite && targetIndex < finalChapters.length) {
                  // Giữ URL cũ để đè nội dung
                  chapUrl = finalChapters[targetIndex].url;
                  // Cập nhật title trong metadata
                  finalChapters[targetIndex].title = ch.title;
              } else {
                  // Tạo mới
                  chapUrl = `${targetStory.url}/chapter-${timestamp}-${index}`;
                  // Chèn vào đúng vị trí hoặc push
                  if (targetIndex < finalChapters.length) {
                      // Insert at specific index (rare usage but possible logic)
                      // Tuy nhiên logic Modal thường là Append nếu number > length.
                      // Nếu number <= length mà không overwrite thì là chèn? 
                      // Hiện tại để đơn giản: Nếu không overwrite mà trùng index -> Chèn hoặc báo lỗi?
                      // Logic hiện tại của modal: Add Card luôn +1.
                      // Ta chỉ xử lý Insert/Overwrite dựa trên index.
                      finalChapters.splice(targetIndex, 0, { title: ch.title, url: chapUrl });
                  } else {
                      // Append
                      finalChapters[targetIndex] = { title: ch.title, url: chapUrl };
                  }
              }

              const data = { content: ch.content, stats: null };
              // Save content
              await setCachedChapter(targetStory.url, chapUrl, data);
              // Sync content
              if(syncService.isAuthenticated()) {
                  syncService.saveChapterContentToDrive(targetStory.url, chapUrl, data).catch(console.error);
              }
          }));

          // Fill empty slots if any (in case user added Chapter 10 but skipped 9)
          for(let i=0; i<finalChapters.length; i++) {
              if(!finalChapters[i]) {
                  finalChapters[i] = { title: `Chương ${i+1} (Trống)`, url: `${targetStory.url}/empty-${i}` };
              }
          }

          const updatedStory = { ...targetStory, chapters: finalChapters };
          await dbService.saveStory(updatedStory);
          handleUpdateStory(updatedStory);
          
          if (syncService.isAuthenticated()) {
              syncService.saveStoryDetailsToDrive(updatedStory).catch(console.error);
          }
          
      } catch (e) {
          throw e; // Để modal bắt lỗi
      }
  };

  const handleCreateChapter = async (title: string, content: string) => {
      if (!story || (story.source !== 'Local' && story.source !== 'Ebook')) {
          setError("Chỉ có thể thêm chương cho truyện tự tạo hoặc Ebook.");
          return;
      }
      
      // Check if trying to add a chapter that implies overwrite?
      // Single add modal usually appends.
      // We'll treat single add as append always for simplicity unless complex logic needed.
      
      const newChapter: Chapter = { title, url: `${story.url}/chapter-${Date.now()}` };
      const updatedChapters = [...(story.chapters || []), newChapter];
      const updatedStory = { ...story, chapters: updatedChapters };
      
      try {
          await setCachedChapter(story.url, newChapter.url, { content, stats: null });
          await dbService.saveStory(updatedStory);
          handleUpdateStory(updatedStory);
          
          // Sync to Drive
          if(syncService.isAuthenticated()) {
              syncService.saveStoryDetailsToDrive(updatedStory).catch(console.error);
              syncService.saveChapterContentToDrive(story.url, newChapter.url, { content, stats: null }).catch(console.error);
          }
      } catch (e) {
          setError(`Lỗi tạo chương: ${(e as Error).message}`);
      }
  };
  
  // NEW: Bulk Add Chapters with Overwrite Logic
  const handleBatchAddChapters = async (targetStory: Story, newChapters: NewChapterData[]) => {
      if (!targetStory) return;
      
      // Check for potential overwrites
      const currentChapterCount = targetStory.chapters?.length || 0;
      const potentialOverwrites = newChapters.filter(ch => ch.number <= currentChapterCount);
      
      if (potentialOverwrites.length > 0) {
          setOverwriteConfirmation({
              isOpen: true,
              chapters: newChapters,
              story: targetStory
          });
          // Trả về promise để modal chờ, nhưng vì logic UI là modal đóng/mở
          // Ta cần cơ chế để modal biết là đang chờ confirm.
          // Tuy nhiên, để đơn giản: Modal gọi hàm này -> Hàm này mở Confirm -> Modal đóng hoặc chờ?
          // Yêu cầu: "hệ thống popup modal hỏi có muốn ghi đè không".
          // Cách tốt nhất: Modal gọi hàm này -> Hàm này check -> Nếu trùng -> throw error đặc biệt hoặc return false?
          // Hoặc: Hàm này return void, nhưng set state để mở Confirm modal.
          // Modal 'MultiChapterAdd' sẽ đóng lại. Người dùng sẽ tương tác với Confirm Modal của App.
          // Nếu Confirm -> Execute. Nếu Cancel -> Hủy. Dữ liệu trong Modal đã mất nếu Modal đóng.
          // FIX: Để Modal không đóng, hàm này cần return Promise.
          // Nếu overwrite -> User confirm -> Resolve. User cancel -> Reject.
          
          return new Promise<void>((resolve, reject) => {
              // Hacky way: Attach resolvers to the state so ConfirmModal can call them
              (window as any)._overwriteResolve = resolve;
              (window as any)._overwriteReject = reject;
          });
      } else {
          try {
              await executeAddChapters(targetStory, newChapters, false);
          } catch (e) {
              setError(`Lỗi khi lưu các chương mới: ${(e as Error).message}`);
              throw e; // Rethrow to keep modal open
          }
      }
  };

  const confirmOverwriteAction = async () => {
      if (!overwriteConfirmation) return;
      
      try {
          await executeAddChapters(overwriteConfirmation.story, overwriteConfirmation.chapters, true);
          setOverwriteConfirmation(null);
          // Resolve pending promise if any
          if ((window as any)._overwriteResolve) {
              (window as any)._overwriteResolve();
              delete (window as any)._overwriteResolve;
              delete (window as any)._overwriteReject;
          }
      } catch (e) {
          setError(`Lỗi khi ghi đè chương: ${(e as Error).message}`);
          // Reject if error
           if ((window as any)._overwriteReject) {
              (window as any)._overwriteReject(e);
          }
      }
  };

  const cancelOverwriteAction = () => {
      setOverwriteConfirmation(null);
      // Reject promise to keep MultiAddModal open if possible, or just to signal cancellation
      if ((window as any)._overwriteReject) {
          // Truyền lỗi "Cancelled" để modal biết không đóng (hoặc xử lý tùy ý)
          // Tuy nhiên nếu modal đóng rồi thì thôi. 
          // Ở đây ta giả định Modal gọi await handleBatchAdd... 
          // Nếu ta reject, modal sẽ catch và hiện lỗi, giữ form.
          (window as any)._overwriteReject(new Error("Đã hủy ghi đè."));
          delete (window as any)._overwriteResolve;
          delete (window as any)._overwriteReject;
      }
  };

  const handleUpdateStory = async (updatedStory: Story) => {
      try {
          await dbService.saveStory(updatedStory);
          setStory(updatedStory);
          setLocalStories(prev => prev.map(s => s.url === updatedStory.url ? updatedStory : s));
          
          if (syncService.isAuthenticated()) {
              syncService.saveStoryDetailsToDrive(updatedStory).catch(console.error);
          }

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
          // Note: Currently not deleting from Drive to prevent accidental data loss, user can manually delete in Drive if needed or implement later
          handleBackToMain();
      } catch (e) {
          setError(`Lỗi xóa truyện: ${(e as Error).message}`);
      }
  };

  const handleValidateKey = async (key: string): Promise<true | string> => {
      try { await validateApiKey(key); return true; } catch (e) { return (e as Error).message; }
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
  
  const handleRemoveFromHistory = (itemToRemove: ReadingHistoryItem) => {
      const newHistory = getReadingHistory().filter(h => h.url !== itemToRemove.url);
      saveReadingHistory(newHistory);
      setReadingHistory(newHistory);
  };

  const handleSearch = async (query: string) => {
    // If we are in reading mode (story is set), this will reset it to null and go back to home/search view
    if (story) {
        setStory(null);
    }
    if (!query.trim()) return;
    setIsDataLoading(true); setError(null); setSearchResults(null); 
    try { const results = await searchStory(query); setSearchResults(results); } catch (err) { setError((err as Error).message); } finally { setIsDataLoading(false); }
  };

  const handleContinueFromHistory = useCallback(async (item: ReadingHistoryItem) => {
    setIsDataLoading(true); setError(null); setSearchResults(null); 
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
             // Thử lấy từ local DB
             let storedStory = await dbService.getStory(item.url);
             
             // Nếu local chưa có nhưng đã login Drive, thử tải về (Lazy Sync)
             if (!storedStory && syncService.isAuthenticated()) {
                 console.log("Lazy loading story details from Drive for history item...");
                 storedStory = await syncService.fetchStoryDetailsFromDrive(item.url);
                 if (storedStory) await dbService.saveStory(storedStory);
             }

             if (storedStory) {
                 storyToLoad = storedStory;
             } else { 
                 if (item.source === 'Local') throw new Error("Truyện này đã bị xóa."); 
                 storyToLoad = await getStoryFromUrl(item.url); 
             }
        }
        
        if (storyToLoad) {
            // Tìm index của chương cuối cùng đã đọc để nhảy tới
            if (storyToLoad.chapters && item.lastChapterUrl) {
                const chapterIndex = storyToLoad.chapters.findIndex(c => c.url === item.lastChapterUrl);
                if (chapterIndex !== -1) {
                    setInitialChapterIndex(chapterIndex);
                } else {
                    setInitialChapterIndex(0); // Mặc định về chương đầu nếu không tìm thấy
                }
            } else {
                setInitialChapterIndex(0);
            }
            
            // Set initial scroll position if available
            setInitialScrollPercentage(item.lastScrollPosition || 0);
            setInitialParagraphIndex(item.lastParagraphIndex || 0);

            setStory(storyToLoad);
            const savedRead = localStorage.getItem(`readChapters_${storyToLoad.url}`);
            if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
        }
    } catch (e) { setError(`Không thể khôi phục truyện: ${(e as Error).message}`); } finally { setIsDataLoading(false); }
  }, []);

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

  // Main Render Logic
  const appContentClass = isApiKeyModalOpen || isUpdateModalOpen || isHelpModalOpen || manualImportState.isOpen || isCreateStoryModalOpen || isCreateChapterModalOpen || isDownloadModalOpen || isSyncModalOpen || isMobileSearchModalOpen || overwriteConfirmation ? 'blur-sm pointer-events-none' : '';

  // Render Search Bar for Header (Desktop Only)
  const renderHeaderSearch = () => (
      <SearchBar 
          onSearch={handleSearch} 
          isLoading={isDataLoading} 
          onOpenHelpModal={() => setIsHelpModalOpen(true)}
          onAddStory={() => setIsCreateStoryModalOpen(true)}
          // Only show Add Chapter when in Story Detail mode (story is set but not reading content) or if in reading mode but user wants quick access
          // Since the request is to "replace the button in detail page", we show it when !isReadingMode if story is set.
          // Or specifically for local stories.
          onAddChapter={story && !isReadingMode && (story.source === 'Local' || story.source === 'Ebook') ? () => setIsCreateChapterModalOpen(true) : undefined}
      />
  );

  if (story) {
      return (
          <div className={`flex flex-col min-h-screen bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] font-sans transition-colors duration-300 relative`}>
              <div className={`flex flex-col min-h-screen ${appContentClass}`}>
                {/* Always show Global Header and Search in Reading Mode */}
                <Header 
                    onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)} 
                    onOpenUpdateModal={() => setIsUpdateModalOpen(true)} 
                    onGoHome={handleBackToMain} 
                    onOpenSyncModal={() => setIsSyncModalOpen(true)} 
                    isVisible={isGlobalHeaderVisible} 
                    // Enable mobile buttons
                    onOpenMobileSearch={() => setIsMobileSearchModalOpen(true)}
                    onCreateStory={() => setIsCreateStoryModalOpen(true)}
                >
                    {renderHeaderSearch()}
                </Header>
                
                <StoryViewer 
                    story={story}
                    initialEbookInstance={ebookInstance}
                    initialChapterIndex={initialChapterIndex} // Truyền index chương cần đọc
                    initialScrollPercentage={initialScrollPercentage} // Truyền vị trí cuộn
                    initialParagraphIndex={initialParagraphIndex} // Truyền vị trí đoạn văn (Anchor)
                    settings={settings}
                    onSettingsChange={setSettings}
                    onBack={handleBackToMain}
                    onUpdateStory={handleUpdateStory}
                    onDeleteStory={handleDeleteStory}
                    readChapters={readChapters}
                    onReadChapterUpdate={(url) => {
                        const newRead = new Set(readChapters).add(url);
                        setReadChapters(newRead);
                        localStorage.setItem(`readChapters_${story.url}`, JSON.stringify(Array.from(newRead)));
                    }}
                    setReadingHistory={setReadingHistory}
                    
                    backgroundDownloads={backgroundDownloads}
                    downloadQueue={downloadQueue}
                    cachedChapters={cachedChapters}
                    onPauseDownload={handlePauseBackgroundDownload}
                    onResumeDownload={handleResumeBackgroundDownload}
                    onStopDownload={handleStopBackgroundDownload}
                    onStartBackgroundDownload={handleStartBackgroundDownload}
                    onStartDownloadExport={handleStartDownloadWrapper}
                    onRedownload={handleRedownloadStory} // Passed handler
                    
                    setIsBottomNavForReadingVisible={setIsBottomNavForReadingVisible}
                    isBottomNavForReadingVisible={isBottomNavForReadingVisible}
                    onTokenUsageUpdate={handleTokenUsageUpdate}
                    isApiKeyModalOpen={isApiKeyModalOpen}
                    setIsApiKeyModalOpen={setIsApiKeyModalOpen}
                    tokenUsage={tokenUsage}
                    onDataChange={reloadDataFromStorage}
                    onReadingModeChange={setIsReadingMode}

                    onSearch={handleSearch}
                    isSearchLoading={isDataLoading}
                    onOpenHelpModal={() => setIsHelpModalOpen(true)}
                    onCreateStory={() => setIsCreateStoryModalOpen(true)}
                    
                    // NEW PROPS PASSED TO STORYVIEWER
                    onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
                    onOpenSyncModal={() => setIsSyncModalOpen(true)}
                    onOpenAddChapterModal={() => setIsCreateChapterModalOpen(true)}
                    
                    // NEW PROP: Add Chapters Handler
                    onAddChapters={handleBatchAddChapters}

                    // Pass Global Header Visibility State
                    isHeaderVisible={isGlobalHeaderVisible}
                />
                
                {!isReadingMode && (
                    <GlobalDownloadManager 
                        activeDownloads={backgroundDownloads}
                        queue={downloadQueue}
                        allStories={localStories}
                        activeStory={story}
                        onPause={handlePauseBackgroundDownload}
                        onResume={handleResumeBackgroundDownload}
                        onStop={handleStopBackgroundDownload}
                        onPrioritize={handlePrioritize}
                        onRemoveFromQueue={handleRemoveFromQueue}
                    />
                )}
              </div>

              <StoryEditModal isOpen={isCreateStoryModalOpen} onClose={() => setIsCreateStoryModalOpen(false)} onSave={handleCreateStory} onParseEbook={parseEbookFile} />
              <ChapterEditModal isOpen={isCreateChapterModalOpen} onClose={() => setIsCreateChapterModalOpen(false)} onSave={handleCreateChapter} nextChapterIndex={(story.chapters?.length || 0) + 1} />
              <DownloadModal isOpen={isDownloadModalOpen} onClose={handleReadWithoutDownload} story={pendingStory || story} onStartDownload={handleStartDownloadWrapper} onDataImported={handleImportDataSuccess} />
              {isSyncModalOpen && <SyncModal onClose={() => setIsSyncModalOpen(false)} />}
              
              <UpdateModal isOpen={isUpdateModalOpen} onClose={handleCloseUpdateModal} />
              <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
              <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={handleCloseApiKeyModal} onValidateKey={handleValidateKey} onDataChange={reloadDataFromStorage} tokenUsage={tokenUsage} />
              
              <MobileSearchModal 
                isOpen={isMobileSearchModalOpen} 
                onClose={() => setIsMobileSearchModalOpen(false)} 
                onSearch={handleSearch} 
                isLoading={isDataLoading} 
              />
              
              <ConfirmationModal
                isOpen={!!overwriteConfirmation}
                onClose={cancelOverwriteAction}
                onConfirm={confirmOverwriteAction}
                title="Phát hiện chương trùng lặp"
                confirmText="Ghi đè"
                cancelText="Hủy bỏ"
                confirmButtonClass="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
              >
                <p>Hệ thống phát hiện {overwriteConfirmation?.chapters.filter(ch => ch.number <= (overwriteConfirmation?.story.chapters?.length || 0)).length} chương có số thứ tự trùng với chương đã tồn tại.</p>
                <p className="text-sm mt-2 text-[var(--theme-text-secondary)]">Bạn có muốn <strong>ghi đè</strong> nội dung mới vào các chương cũ không?</p>
              </ConfirmationModal>
          </div>
      )
  }

  // Dashboard / Home View
  return (
    <div className="flex flex-col min-h-screen bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] font-sans transition-colors duration-300 relative">
      {downloadStatus.isProcessing && (
          <div className="fixed bottom-14 left-4 z-[200] max-w-sm w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-2xl p-4 animate-fade-in-up">
              <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-[var(--theme-text-primary)] text-sm flex items-center gap-2">
                      <SpinnerIcon className="w-4 h-4 animate-spin text-[var(--theme-accent-primary)]" />
                      Đang xử lý tải xuống (EPUB)
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

      <div className={`flex flex-col flex-grow ${appContentClass}`}>
        <Header 
            onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)} 
            onOpenUpdateModal={() => setIsUpdateModalOpen(true)} 
            onGoHome={handleBackToMain} 
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            // Enable mobile buttons
            onOpenMobileSearch={() => setIsMobileSearchModalOpen(true)}
            onCreateStory={() => setIsCreateStoryModalOpen(true)}
        >
            {renderHeaderSearch()}
        </Header>

        <main className="max-w-screen-2xl mx-auto px-4 py-8 sm:py-12 flex-grow mb-16 mt-16">
            
            {(isLoading || isDataLoading) ? (
                <LoadingSpinner>
                    <div className="text-center mt-4 space-y-2">
                        <h3 className="text-xl font-bold text-[var(--theme-accent-primary)]">Đang khởi tạo...</h3>
                        <p className="text-sm text-[var(--theme-text-secondary)]">Vui lòng đợi trong giây lát</p>
                        {isDataLoading && (
                        <button 
                            onClick={handleCancelLoading}
                            className="mt-3 px-4 py-1 text-xs font-semibold text-rose-300 border border-rose-500/50 rounded-md hover:bg-rose-900/30 transition-colors"
                        >
                            Dừng / Hủy bỏ
                        </button>
                        )}
                    </div>
                </LoadingSpinner>
            ) : error ? (
                <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
                    <div className="text-center p-6 bg-rose-900/20 border border-rose-500/30 rounded-xl max-w-lg w-full shadow-xl animate-fade-in-up">
                        <div className="bg-rose-500/20 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-rose-200 mb-2">Đã xảy ra lỗi</h3>
                        <p className="text-rose-300/80 mb-6">{error}</p>
                        <button 
                            onClick={handleBackToMain}
                            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-all duration-300 font-semibold shadow-lg hover:shadow-rose-900/20 flex items-center gap-2 mx-auto"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                            Quay lại Trang chủ
                        </button>
                    </div>
                </div> 
            ) : searchResults ? (
                <SearchResultsList results={searchResults} onSelectStory={handleSelectStory} />
            ) : (
                <div className="space-y-12">
                    {readingHistory.length > 0 && ( <section><ReadingHistory items={readingHistory} onContinue={handleContinueFromHistory} onRequestDeleteEbook={handleRequestDeleteEbook} onRemoveItem={handleRemoveFromHistory} /></section> )}
                    
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
                    {!readingHistory.length && !localStories.length && ( <div className="text-center text-[var(--theme-text-secondary)] py-12"><h2 className="text-2xl mb-4 text-[var(--theme-text-primary)]">Chào mừng đến với Ai Storymind</h2><p className="max-w-lg mx-auto">Trang web hỗ trợ phân tích dữ liệu truyện, tóm tắt nội dung và tương tác với nhân vật bằng trí tuệ nhân tạo.</p></div> )}
                </div>
            )}
        </main>
        
        {!isReadingMode && (
            <GlobalDownloadManager 
                activeDownloads={backgroundDownloads}
                queue={downloadQueue}
                allStories={localStories}
                onPause={handlePauseBackgroundDownload}
                onResume={handleResumeBackgroundDownload}
                onStop={handleStopBackgroundDownload}
                onPrioritize={handlePrioritize}
                onRemoveFromQueue={handleRemoveFromQueue}
            />
        )}

        <Footer />
      </div>

      <UpdateModal isOpen={isUpdateModalOpen} onClose={handleCloseUpdateModal} />
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={handleCloseApiKeyModal} onValidateKey={handleValidateKey} onDataChange={reloadDataFromStorage} tokenUsage={tokenUsage} />
      <ManualImportModal isOpen={manualImportState.isOpen} onClose={() => setManualImportState(prev => ({ ...prev, isOpen: false }))} urlToImport={manualImportState.url} message={manualImportState.message} onFileSelected={handleManualImportFile} />
      <StoryEditModal isOpen={isCreateStoryModalOpen} onClose={() => setIsCreateStoryModalOpen(false)} onSave={handleCreateStory} onParseEbook={parseEbookFile} />
      <ChapterEditModal isOpen={isCreateChapterModalOpen} onClose={() => setIsCreateChapterModalOpen(false)} onSave={handleCreateChapter} nextChapterIndex={story?.chapters ? story.chapters.length + 1 : 1} />
      <DownloadModal isOpen={isDownloadModalOpen} onClose={handleReadWithoutDownload} story={pendingStory || story} onStartDownload={handleStartDownloadWrapper} onDataImported={handleImportDataSuccess} />
      <ConfirmationModal isOpen={deleteConfirmation.isOpen} onClose={() => setDeleteConfirmation({ isOpen: false })} onConfirm={confirmDeleteEbook} title="Xác nhận xóa">
        <p>Bạn có chắc chắn muốn xóa truyện <strong className="text-[var(--theme-text-primary)]">{deleteConfirmation.item?.title}</strong> {' '}vĩnh viễn không?</p>
        <p className="mt-2 text-sm text-rose-400">Hành động này không thể hoàn tác.</p>
      </ConfirmationModal>
      {isSyncModalOpen && <SyncModal onClose={() => setIsSyncModalOpen(false)} />}
      
      {/* Mobile Search Modal */}
      <MobileSearchModal 
        isOpen={isMobileSearchModalOpen} 
        onClose={() => setIsMobileSearchModalOpen(false)} 
        onSearch={handleSearch} 
        isLoading={isDataLoading} 
      />
    </div>
  );
};

export default App;
