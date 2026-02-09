
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Story, Chapter, ReadingHistoryItem, ApiKeyInfo, DownloadConfig, GoogleUser } from './types';
import { searchStory, getStoryDetails, getStoryFromUrl, parseHtml, parseStoryDetailsFromDoc } from './services/truyenfullService';
import { validateApiKey } from './services/geminiService';
import { getCachedChapter, setCachedChapter } from './services/cacheService';
import { useReadingSettings } from './hooks/useReadingSettings';
import { getReadingHistory, saveReadingHistory, updateReadingHistory } from './services/history';
import * as dbService from './services/dbService';
import * as apiKeyService from './services/apiKeyService';
import { parseEbookFile } from './services/ebookParser';
import { useBackgroundDownload } from './hooks/useBackgroundDownload';
import { useDownloader } from './hooks/useDownloader';
// Drive Sync Services
import * as driveService from './services/googleDriveService';
import * as syncManager from './services/syncManager';

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
import DownloadModal from './components/DownloadModal';
import ConfirmationModal from './components/ConfirmationModal';
import GlobalDownloadManager from './components/GlobalDownloadManager';
import { PlusIcon, StopIcon, SpinnerIcon, CheckIcon, CloseIcon, UploadIcon, DownloadIcon } from './components/icons';

// New Component for active story logic
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

const UPDATE_MODAL_VERSION = 'update_modal_seen_v2'; 

const App: React.FC = () => {
  const [searchResults, setSearchResults] = useState<Story[] | null>(null);
  const [localStories, setLocalStories] = useState<Story[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false); 
  const [error, setError] = useState<string | null>(null);
  
  // Track Reading Mode to adjust UI (Header title, hide global download manager)
  const [isReadingMode, setIsReadingMode] = useState<boolean>(false);
  
  const [backgroundLoadingStories, setBackgroundLoadingStories] = useState<Set<string>>(new Set());
  const [cachedChapters, setCachedChapters] = useState<Set<string>>(new Set());

  // Using Hooks
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
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(!apiKeyService.hasApiKey());
  const [tokenUsage, setTokenUsage] = useState<apiKeyService.TokenUsage>(apiKeyService.getTokenUsage());
  
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  
  const [manualImportState, setManualImportState] = useState<ManualImportState>({
      isOpen: false, url: '', message: '', type: 'chapter', source: ''
  });
  
  const [isCreateStoryModalOpen, setIsCreateStoryModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [pendingStory, setPendingStory] = useState<Story | null>(null); 

  const loadingAbortRef = useRef(false); 

  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [filterAuthor, setFilterAuthor] = useState<string | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Google Drive Auth State
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Close dropdown logic
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

  const reloadDataFromStorage = useCallback(async () => {
    setIsDataLoading(true);
    // Note: Don't clear story here to avoid flickering if called during reading
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
      
      // Init Drive
      driveService.initGoogleDrive(async (user) => {
          setGoogleUser(user);
          if (user) {
              setIsSyncing(true);
              await syncManager.syncIndex();
              await reloadDataFromStorage(); // Reload to show new cloud stories
              setIsSyncing(false);
          }
      });

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
          
          // LAZY LOAD: Sync metadata from Drive if logged in and chapters are empty
          if (driveService.isLoggedIn() && (!fullStory.chapters || fullStory.chapters.length === 0)) {
              setIsSyncing(true);
              fullStory = await syncManager.syncStoryMetadata(fullStory);
              setIsSyncing(false);
          }

          const needsFetching = (!fullStory.chapters || fullStory.chapters.length === 0 || forceFetch) 
                                && fullStory.source !== 'Local' && fullStory.source !== 'Ebook';
          
          if (needsFetching) {
              if (loadingAbortRef.current) throw new Error("Đã hủy quá trình tải.");
              setBackgroundLoadingStories(prev => new Set(prev).add(selectedStory.url));
              
              fullStory = await getStoryDetails(selectedStory, 
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
                          next.delete(selectedStory.url);
                          return next;
                      });
                  }
              );
          }
          
          if (loadingAbortRef.current) throw new Error("Đã hủy quá trình tải.");

          await dbService.saveStory(fullStory);
          
          // Background Upload (if logged in)
          syncManager.uploadStoryToDrive(fullStory, null);

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
          setIsSyncing(false);
      }
  };

  const handleSelectStory = useCallback(async (selectedStory: Story) => {
      if (selectedStory.source === 'Ebook' || selectedStory.source === 'Local') {
          handleSelectStoryInternal(selectedStory);
          return;
      }

      const existingStory = await dbService.getStory(selectedStory.url);
      
      // If we have existing data or we are logged in (to lazy load), use it
      if (existingStory || driveService.isLoggedIn()) {
           handleSelectStoryInternal(existingStory || selectedStory);
           if (existingStory && existingStory.chapters && existingStory.chapters.length > 10) {
               runBackgroundContentFetcher(existingStory, 10);
           }
           return;
      }

      setIsDataLoading(true); 
      loadingAbortRef.current = false;
      try {
          if (loadingAbortRef.current) return;
          let fullStory = await getStoryDetails(selectedStory, undefined, () => {});
          
          if (loadingAbortRef.current) return;

          await dbService.saveStory(fullStory);
          setLocalStories(prev => [fullStory, ...prev.filter(s => s.url !== fullStory.url)]);
          
          if (fullStory.chapters && fullStory.chapters.length > 0) {
              const preloadCount = Math.min(fullStory.chapters.length, 10);
              const toLoad = fullStory.chapters.slice(0, preloadCount);
              
              await Promise.all(toLoad.map(async (c) => {
                   if (loadingAbortRef.current) return;
                   try {
                      const cached = await dbService.getChapterData(fullStory.url, c.url);
                      if (!cached) {
                          const { getChapterContent } = await import('./services/truyenfullService');
                          const content = await getChapterContent(c, fullStory.source);
                          await setCachedChapter(fullStory.url, c.url, { content, stats: null });
                      }
                   } catch(e) { 
                       console.warn(`Failed to preload chapter ${c.title}`, e);
                   }
              }));
              
              if (loadingAbortRef.current) return;

              handleSelectStoryInternal(fullStory); 
              
              if (fullStory.chapters.length > 10) {
                  runBackgroundContentFetcher(fullStory, 10);
              }
          } else {
              handleSelectStoryInternal(fullStory);
          }

      } catch (e) {
          if (!loadingAbortRef.current) {
            setError(`Lỗi khởi tạo truyện: ${(e as Error).message}`);
          }
      } finally {
          setIsDataLoading(false);
      }
  }, [runBackgroundContentFetcher]);

  const handleCancelLoading = () => {
      loadingAbortRef.current = true;
      setIsDataLoading(false);
      setError("Đã hủy tải truyện.");
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
    setEbookInstance(null); // Reset ebook instance
    setIsReadingMode(false); // Reset reading mode
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
    if (!query.trim()) return;
    setIsDataLoading(true); setError(null); setSearchResults(null); setStory(null); 
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
             // Check local storage first
             const storedStory = await dbService.getStory(item.url);
             
             // If missing or incomplete and connected to drive, try sync
             if ((!storedStory || !storedStory.chapters || storedStory.chapters.length === 0) && driveService.isLoggedIn()) {
                 const baseStory = storedStory || { ...item, chapters: [] } as any;
                 storyToLoad = await syncManager.syncStoryMetadata(baseStory);
             } else {
                 storyToLoad = storedStory;
             }

             if (!storyToLoad) {
                 if (item.source === 'Local') throw new Error("Truyện này đã bị xóa.");
                 storyToLoad = await getStoryFromUrl(item.url);
             }
        }
        if (storyToLoad) {
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
  
  // If a story is selected, delegate to StoryViewer
  if (story) {
      return (
          <div className="flex flex-col min-h-screen bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] font-sans transition-colors duration-300 relative">
              <Header 
                onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)} 
                onOpenUpdateModal={() => setIsUpdateModalOpen(true)} 
                onGoHome={handleBackToMain} 
                storyTitle={isReadingMode ? story.title : undefined}
                user={googleUser}
                onLogin={driveService.loginGoogle}
                onLogout={() => setGoogleUser(null)}
                isSyncing={isSyncing}
              />
              
              <StoryViewer 
                  story={story}
                  initialEbookInstance={ebookInstance}
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
                  
                  setIsBottomNavForReadingVisible={setIsBottomNavForReadingVisible}
                  isBottomNavForReadingVisible={isBottomNavForReadingVisible}
                  onTokenUsageUpdate={handleTokenUsageUpdate}
                  isApiKeyModalOpen={isApiKeyModalOpen}
                  setIsApiKeyModalOpen={setIsApiKeyModalOpen}
                  tokenUsage={tokenUsage}
                  onDataChange={reloadDataFromStorage}
                  onReadingModeChange={setIsReadingMode}

                  // Pass Search & Create props
                  onSearch={handleSearch}
                  isSearchLoading={isDataLoading}
                  onOpenHelpModal={() => setIsHelpModalOpen(true)}
                  onCreateStory={() => setIsCreateStoryModalOpen(true)}
              />
              
              {/* GLOBAL DOWNLOAD MANAGER (Hidden when Reading) */}
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

              <StoryEditModal isOpen={isCreateStoryModalOpen} onClose={() => setIsCreateStoryModalOpen(false)} onSave={handleCreateStory} onParseEbook={parseEbookFile} />
              <DownloadModal 
                isOpen={isDownloadModalOpen} 
                onClose={handleReadWithoutDownload} 
                story={pendingStory || story} 
                onStartDownload={handleStartDownloadWrapper} 
                onDataImported={handleImportDataSuccess} 
                user={googleUser}
                onLogin={driveService.loginGoogle}
                onLogout={() => setGoogleUser(null)}
              />
          </div>
      )
  }

  // Otherwise, render Library / Dashboard
  const appContentClass = isApiKeyModalOpen || isUpdateModalOpen || isHelpModalOpen || manualImportState.isOpen || isCreateStoryModalOpen || isDownloadModalOpen ? 'blur-sm pointer-events-none' : '';

  return (
    <div className="flex flex-col min-h-screen bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] font-sans transition-colors duration-300 relative">
      {/* GLOBAL DOWNLOAD PROGRESS TOAST - REMOVED (Replaced by GlobalDownloadManager) */}
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
            user={googleUser}
            onLogin={driveService.loginGoogle}
            onLogout={() => setGoogleUser(null)}
            isSyncing={isSyncing}
        />
        <main className="max-w-screen-2xl mx-auto px-4 py-8 sm:py-12 flex-grow mb-16">
            <div className="mb-8 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
                <div className="flex-grow">
                    <SearchBar onSearch={handleSearch} isLoading={isDataLoading} onOpenHelpModal={() => setIsHelpModalOpen(true)} />
                </div>
                 {!searchResults && (
                    <button onClick={() => setIsCreateStoryModalOpen(true)} className="flex-shrink-0 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors h-auto">
                        <PlusIcon className="w-5 h-5" /> <span className="whitespace-nowrap">Tạo truyện mới</span>
                    </button>
                )}
            </div>
            
            {/* Main Content Area */}
            {(isLoading || isDataLoading) ? (
                <LoadingSpinner>
                    <div className="text-center mt-4 space-y-2">
                        <h3 className="text-xl font-bold text-[var(--theme-accent-primary)]">
                            {isSyncing ? "Đang đồng bộ dữ liệu..." : "Đang tải..."}
                        </h3>
                        <p className="text-sm text-[var(--theme-text-secondary)]">Vui lòng đợi trong giây lát</p>
                        {isDataLoading && !isSyncing && (
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
                <div className="text-center p-4 bg-rose-900/50 border border-rose-700 rounded-lg"><p className="text-rose-300 font-semibold">Đã xảy ra lỗi</p><p className="text-rose-400 mt-2">{error}</p></div> 
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
                                        <option value="Cloud">Đồng bộ Cloud</option>
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
            )}
        </main>
        
        {/* GLOBAL DOWNLOAD MANAGER (Library Mode) */}
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
      <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} onValidateKey={handleValidateKey} onDataChange={reloadDataFromStorage} tokenUsage={tokenUsage} />
      <ManualImportModal isOpen={manualImportState.isOpen} onClose={() => setManualImportState(prev => ({ ...prev, isOpen: false }))} urlToImport={manualImportState.url} message={manualImportState.message} onFileSelected={handleManualImportFile} />
      <StoryEditModal isOpen={isCreateStoryModalOpen} onClose={() => setIsCreateStoryModalOpen(false)} onSave={handleCreateStory} onParseEbook={parseEbookFile} />
      <DownloadModal 
        isOpen={isDownloadModalOpen} 
        onClose={handleReadWithoutDownload} 
        story={pendingStory || story} 
        onStartDownload={handleStartDownloadWrapper} 
        onDataImported={handleImportDataSuccess} 
        user={googleUser}
        onLogin={driveService.loginGoogle}
        onLogout={() => setGoogleUser(null)}
      />
      <ConfirmationModal isOpen={deleteConfirmation.isOpen} onClose={() => setDeleteConfirmation({ isOpen: false })} onConfirm={confirmDeleteEbook} title="Xác nhận xóa">
        <p>Bạn có chắc chắn muốn xóa truyện <strong className="text-[var(--theme-text-primary)]">{deleteConfirmation.item?.title}</strong> {' '}vĩnh viễn không?</p>
        <p className="mt-2 text-sm text-rose-400">Hành động này không thể hoàn tác.</p>
      </ConfirmationModal>
    </div>
  );
};

export default App;
