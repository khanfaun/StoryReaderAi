import React, { useState, useCallback, useEffect } from 'react';
import type { Story, Chapter, CharacterStats, ReadingSettings, ReadingHistoryItem, GoogleUser } from './types';
import { searchStory, getChapterContent, getStoryDetails, getStoryFromUrl } from './services/truyenfullService';
import { analyzeChapterForCharacterStats } from './services/geminiService';
import { getCachedChapter, setCachedChapter } from './services/cacheService';
import { getStoryState, saveStoryState as saveStoryStateLocal, mergeChapterStats } from './services/storyStateService';
import { useReadingSettings } from './hooks/useReadingSettings';
import { getReadingHistory, saveReadingHistory, updateReadingHistory } from './services/history';
import * as driveSync from './services/sync';
import * as authService from './services/authService';

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
import SyncModal from './components/SyncModal';

const App: React.FC = () => {
  const [searchResults, setSearchResults] = useState<Story[] | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | null>(null);
  const [chapterContent, setChapterContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Chỉ true lúc khởi động đầu tiên
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false); // Dùng cho tìm kiếm, tải truyện...
  const [isChapterLoading, setIsChapterLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [cumulativeStats, setCumulativeStats] = useState<CharacterStats | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isPanelVisible, setIsPanelVisible] = useState<boolean>(false);
  
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  
  const [settings, setSettings] = useReadingSettings();
  const [isBottomNavForReadingVisible, setIsBottomNavForReadingVisible] = useState(true);

  // States for Firebase auth and history
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>([]);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);

  // TODO: Sẽ thay thế bằng Firestore
  const saveStoryState = useCallback((storyUrl: string, state: CharacterStats) => {
    saveStoryStateLocal(storyUrl, state);
    // if (driveSync.isSignedIn()) {
    //   driveSync.saveStoryStateToDrive(storyUrl, state).catch(e => console.error("Drive Sync: Failed to save story state", e));
    // }
  }, []);

  // TODO: Sẽ thay thế bằng Firestore
  const handleSync = useCallback(async (): Promise<boolean> => {
    console.warn("Chức năng đồng bộ đang được nâng cấp lên Firebase.");
    return true; // Tạm thời trả về true
  }, []);
  
  // Effect này sẽ chạy một lần khi ứng dụng khởi động
  useEffect(() => {
    // Tải lịch sử đọc từ localStorage
    const localHistory = getReadingHistory();
    setReadingHistory(localHistory);
    
    // Xử lý kết quả đăng nhập từ Google Redirect
    authService.getGoogleRedirectResult().then(user => {
        if (user) {
            setGoogleUser(user);
            // Mở modal sau khi đăng nhập thành công để người dùng biết
            setIsSyncModalOpen(true);
            // TODO: Bắt đầu quá trình đồng bộ dữ liệu
            handleSync(); 
        }
    }).catch(error => {
        console.error("Lỗi xử lý kết quả chuyển hướng:", error);
    });

    // Thiết lập listener để theo dõi trạng thái đăng nhập của Firebase
    const unsubscribe = authService.onAuthChange(user => {
      if (user) {
        setGoogleUser({
          name: user.displayName || '',
          email: user.email || '',
          imageUrl: user.photoURL || ''
        });
      } else {
        setGoogleUser(null);
      }
      setIsLoading(false); // Hoàn tất tải lần đầu
    });
    
    // Dọn dẹp listener khi component bị unmount
    return () => unsubscribe();
  }, [handleSync]);

  const fetchChapter = useCallback(async (storyToLoad: Story, chapterIndex: number) => {
    if (!storyToLoad || !storyToLoad.chapters || chapterIndex < 0 || chapterIndex >= storyToLoad.chapters.length) return;
    
    const chapter = storyToLoad.chapters[chapterIndex];
    setSelectedChapterIndex(chapterIndex);
    
    // Update reading history
    const newHistory = updateReadingHistory(storyToLoad, chapter.url);
    setReadingHistory(newHistory);

    const newReadChapters = new Set(readChapters);
    newReadChapters.add(chapter.url);
    setReadChapters(newReadChapters);
    localStorage.setItem(`readChapters_${storyToLoad.url}`, JSON.stringify(Array.from(newReadChapters)));
    
    // 1. Check Local Cache
    let cachedData = getCachedChapter(storyToLoad.url, chapter.url);

    // TODO: Sẽ thay thế bằng Firestore
    // 2. Check Google Drive if not in local cache
    // if (!cachedData && driveSync.isSignedIn()) {
    //     cachedData = await driveSync.loadChapterFromDrive(storyToLoad.url, chapter.url);
    //     if (cachedData) {
    //         setCachedChapter(storyToLoad.url, chapter.url, cachedData); // Save to local cache
    //     }
    // }
    
    if (cachedData) {
        setChapterContent(cachedData.content);
        return;
    }

    setIsChapterLoading(true);
    setError(null);
    setChapterContent(null);
    
    try {
        const content = await getChapterContent(chapter, storyToLoad.source);
        setChapterContent(content);
        
        setIsAnalyzing(true);
        let chapterStats: CharacterStats | null = null;
        try {
            const currentStats = getStoryState(storyToLoad.url) ?? {};
            chapterStats = await analyzeChapterForCharacterStats(content, currentStats);
            
            const newState = mergeChapterStats(currentStats, chapterStats ?? {});
            setCumulativeStats(newState);
            saveStoryState(storyToLoad.url, newState);
            
            const dataToCache = { content, stats: chapterStats };
            setCachedChapter(storyToLoad.url, chapter.url, dataToCache);
            // TODO: Sẽ thay thế bằng Cloud Storage
            // if(driveSync.isSignedIn()) {
            //   driveSync.saveChapterToDrive(storyToLoad.url, chapter.url, dataToCache).catch(e => console.error("Drive Sync: failed to save chapter", e));
            // }

        } catch (analysisError) {
            console.error("Analysis error, caching content only", analysisError);
            setCachedChapter(storyToLoad.url, chapter.url, { content, stats: null });
        } finally {
            setIsAnalyzing(false);
        }
    } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load chapter content.");
    } finally {
        setIsChapterLoading(false);
    }
  }, [readChapters, saveStoryState]);

  const handleSearch = useCallback(async (query: string) => {
    setIsDataLoading(true);
    setError(null);
    setStory(null);
    setSearchResults(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
    setCumulativeStats(null);
    setReadChapters(new Set());
    try {
      const urlRegex = /^(https?):\/\/[^\s$.?#].[^\s]*$/i;
      if (urlRegex.test(query)) {
        const fullStory = await getStoryFromUrl(query);
        setStory(fullStory);
        let storyState = getStoryState(fullStory.url);
        // TODO: Thay bằng Firestore
        // if (!storyState && driveSync.isSignedIn()) {
        //     storyState = await driveSync.loadStoryStateFromDrive(fullStory.url);
        //     if (storyState) saveStoryStateLocal(fullStory.url, storyState);
        // }
        setCumulativeStats(storyState ?? {});
        const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
        if (savedRead) {
          setReadChapters(new Set(JSON.parse(savedRead)));
        }
      } else {
        const results = await searchStory(query);
        setSearchResults(results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsDataLoading(false);
    }
  }, []);
  
  const handleSelectStory = useCallback(async (selectedStory: Story) => {
    setIsDataLoading(true);
    setError(null);
    setSearchResults(null);
    setStory(null);
    try {
        const fullStory = await getStoryDetails(selectedStory);
        setStory(fullStory);
        
        let storyState = getStoryState(fullStory.url);
        // TODO: Thay bằng Firestore
        // if (!storyState && driveSync.isSignedIn()) {
        //     storyState = await driveSync.loadStoryStateFromDrive(fullStory.url);
        //     if (storyState) saveStoryStateLocal(fullStory.url, storyState);
        // }
        setCumulativeStats(storyState ?? {});

        const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
        if (savedRead) {
            setReadChapters(new Set(JSON.parse(savedRead)));
        } else {
            setReadChapters(new Set());
        }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load story details.");
    } finally {
        setIsDataLoading(false);
    }
  }, []);

  const handleSelectChapter = useCallback((chapter: Chapter) => {
      if (!story || !story.chapters) return;
      const index = story.chapters.findIndex(c => c.url === chapter.url);
      if (index !== -1) {
          window.scrollTo(0, 0);
          fetchChapter(story, index);
      }
  }, [story, fetchChapter]);
  
  const handleBackToStory = () => {
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
  
  const handleContinueFromHistory = useCallback(async (item: ReadingHistoryItem) => {
    setIsDataLoading(true);
    setError(null);
    setSearchResults(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
    try {
        const storyToLoad: Story = {
            title: item.title, author: item.author, url: item.url,
            source: item.source, imageUrl: item.imageUrl,
        };
        const fullStory = await getStoryDetails(storyToLoad);
        setStory(fullStory);
        
        let storyState = getStoryState(fullStory.url);
        // TODO: Thay bằng Firestore
        // if (!storyState && driveSync.isSignedIn()) {
        //     storyState = await driveSync.loadStoryStateFromDrive(fullStory.url);
        //     if(storyState) saveStoryStateLocal(fullStory.url, storyState);
        // }
        setCumulativeStats(storyState ?? {});
        
        const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
        if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
        else setReadChapters(new Set());

        const chapterIndex = fullStory.chapters?.findIndex(c => c.url === item.lastChapterUrl);
        if (chapterIndex !== -1) {
            await fetchChapter(fullStory, chapterIndex);
        } else if (fullStory.chapters?.length) {
            await fetchChapter(fullStory, 0);
        }
    } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load story from history.");
    } finally {
        setIsDataLoading(false);
    }
  }, [fetchChapter]);

  const renderMainContent = () => {
    if (isLoading) return <LoadingSpinner />;
    
    if (error && !story && !searchResults && !isChapterLoading) {
      return (
        <div className="text-center p-4 bg-rose-900/50 border border-rose-700 rounded-lg">
            <p className="text-rose-300 font-semibold">Đã xảy ra lỗi</p>
            <p className="text-rose-400 mt-2">{error}</p>
        </div>
      );
    }
    
    if (selectedChapterIndex !== null && story && story.chapters) {
        if (isChapterLoading && !chapterContent) return <LoadingSpinner />;
        if (error) {
             return (
                <div className="text-center p-4 bg-rose-900/50 border border-rose-700 rounded-lg">
                    <p className="text-rose-300 font-semibold">Không thể tải chương</p>
                    <p className="text-rose-400 mt-2">{error}</p>
                    <button onClick={handleBackToStory} className="mt-4 bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-bold py-2 px-4 rounded-lg">Quay lại</button>
                </div>
            );
        }
        if (chapterContent) {
            return (
                <ChapterContent
                  story={story} currentChapterIndex={selectedChapterIndex} content={chapterContent}
                  onBack={handleBackToStory} onPrev={handlePrevChapter} onNext={handleNextChapter}
                  onSelectChapter={handleSelectChapter} readChapters={readChapters} settings={settings}
                  onSettingsChange={setSettings} onNavBarVisibilityChange={setIsBottomNavForReadingVisible}
                  cumulativeStats={cumulativeStats}
                />
            );
        }
         return <LoadingSpinner />;
    }
    
    if (story) return <StoryDetail story={story} onSelectChapter={handleSelectChapter} readChapters={readChapters} lastReadChapterIndex={selectedChapterIndex} />;
    if (searchResults) return <SearchResultsList results={searchResults} onSelectStory={handleSelectStory} />;
    if (readingHistory.length > 0) return <ReadingHistory items={readingHistory} onContinue={handleContinueFromHistory} />;

    return (
        <div className="text-center text-[var(--theme-text-secondary)]">
            <h2 className="text-2xl mb-4 text-[var(--theme-text-primary)]">Chào mừng đến với Trình Đọc Truyện</h2>
            <p>Sử dụng thanh tìm kiếm ở trên để tìm truyện bạn muốn đọc.</p>
        </div>
    );
  };
  
  const isReading = selectedChapterIndex !== null && !!story && !!chapterContent;
  const mainContainerClass = isReading
    ? "w-full px-4 sm:px-8 py-8 sm:py-12 flex-grow"
    : "max-w-screen-2xl mx-auto px-4 py-8 sm:py-12 flex-grow";

  return (
    <div className="bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] min-h-screen flex flex-col">
      <Header onOpenSync={() => setIsSyncModalOpen(true)} user={googleUser} />
      <main className={mainContainerClass}>
        <div className="mb-8">
            <SearchBar onSearch={handleSearch} isLoading={isDataLoading} />
        </div>
        
        {isReading ? (
          <div className="grid grid-cols-1 lg:grid-cols-[24rem_minmax(0,1fr)_24rem] xl:grid-cols-[28rem_minmax(0,1fr)_28rem] lg:gap-8">
            <aside className="hidden lg:block sticky top-8 self-start">
              <CharacterPrimaryPanel stats={cumulativeStats} isAnalyzing={isAnalyzing} />
            </aside>
            <div className="min-w-0">{renderMainContent()}</div>
            <aside className="hidden lg:block sticky top-8 self-start">
              <CharacterPanel stats={cumulativeStats} isAnalyzing={isAnalyzing} isOpen={true} onClose={() => {}} isSidebar={true} />
            </aside>
          </div>
        ) : (
          <div>{renderMainContent()}</div>
        )}

      </main>
      {!isReading && <Footer />}

      <div className="lg:hidden">
          {isReading && (
            <>
                <PanelToggleButton onClick={() => setIsPanelVisible(!isPanelVisible)} isPanelOpen={isPanelVisible} isBottomNavVisible={isBottomNavForReadingVisible} />
                <CharacterPanel isOpen={isPanelVisible} onClose={() => setIsPanelVisible(false)} stats={cumulativeStats} isAnalyzing={isAnalyzing} isSidebar={false} />
            </>
          )}
      </div>
      <ScrollToTopButton isReading={isReading} isBottomNavVisible={isBottomNavForReadingVisible} />
      {isSyncModalOpen && <SyncModal onClose={() => setIsSyncModalOpen(false)} onSync={handleSync} user={googleUser} />}
    </div>
  );
};

export default App;