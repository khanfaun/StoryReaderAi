import React, { useState, useEffect, useCallback, useRef } from 'react';
import JSZip from 'jszip';

// Components
import Header from './components/Header';
import Footer from './components/Footer';
import SearchBar from './components/SearchBar';
import SearchResultsList from './components/SearchResultsList';
import StoryDetail from './components/StoryDetail';
import ChapterContent from './components/ChapterContent';
import ReadingHistory from './components/ReadingHistory';
import LoadingSpinner from './components/LoadingSpinner';
import SyncModal from './components/SyncModal';
import ApiKeyModal from './components/ApiKeyModal';
import ScrollToTopButton from './components/ScrollToTopButton';
import CharacterPrimaryPanel from './components/CharacterPrimaryPanel';
import CharacterPanel from './components/CharacterPanel';
import PanelToggleButton from './components/PanelToggleButton';
import ChatToggleButton from './components/ChatToggleButton';
import ChatPanel from './components/ChatPanel';
import ConfirmationModal from './components/ConfirmationModal';

// Services
import * as truyenService from './services/truyenfullService';
import * as historyService from './services/history';
import * as cacheService from './services/cacheService';
import * as storyStateService from './services/storyStateService';
import * as geminiService from './services/geminiService';
import * as apiKeyService from './services/apiKeyService';
import * as authService from './services/authService';
import * as dbService from './services/dbService';

// Types
import type { Story, Chapter, ReadingHistoryItem, CharacterStats, GoogleUser, ChatMessage, CachedChapter } from './types';

// Hooks
import { useReadingSettings } from './hooks/useReadingSettings';

// App Views
type View = 'home' | 'story-detail' | 'chapter-content';

function App() {
  // View & Loading States
  const [view, setView] = useState<View>('home');
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isChapterLoading, setIsChapterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data States
  const [searchResults, setSearchResults] = useState<Story[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number | null>(null);
  const [chapterContent, setChapterContent] = useState<string>('');
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>([]);

  // Modal & Panel States
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isCharacterPanelOpen, setIsCharacterPanelOpen] = useState(false);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true);
  const [ebookToDelete, setEbookToDelete] = useState<ReadingHistoryItem | null>(null);

  // Auth & API Key States
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // AI & Stats States
  const [cumulativeStats, setCumulativeStats] = useState<CharacterStats | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isPrimaryAnalysisRunning, setIsPrimaryAnalysisRunning] = useState(false);
  const [isWorldAnalysisRunning, setIsWorldAnalysisRunning] = useState(false);

  // Ebook state
  const ebookZipRef = useRef<JSZip | null>(null);

  // Settings
  const [settings, onSettingsChange] = useReadingSettings();

  // Initial load
  useEffect(() => {
    const savedKey = apiKeyService.getApiKey();
    setApiKey(savedKey);
    if (!savedKey && !apiKeyService.isAiStudio()) {
        setIsApiKeyModalOpen(true);
    }
    
    // Fix legacy ebook URLs in history
    const historyItems = historyService.getReadingHistory();
    historyItems.forEach(item => {
      if (item.source === 'Ebook' && !item.url.startsWith('ebook-')) {
          item.url = `ebook-${item.title.replace(/\s/g, '_')}`;
      }
    });
    setReadingHistory(historyItems);
    historyService.saveReadingHistory(historyItems);


    const unsubscribe = authService.onAuthChange(firebaseUser => {
      if (firebaseUser) {
        setUser({
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          imageUrl: firebaseUser.photoURL || '',
        });
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Save read chapters to localStorage
  useEffect(() => {
    if (selectedStory) {
      localStorage.setItem(`readChapters_${selectedStory.url}`, JSON.stringify(Array.from(readChapters)));
    }
  }, [readChapters, selectedStory]);

  const handleBack = () => {
    setError(null);
    if (view === 'chapter-content') {
      setView('story-detail');
      // Clear chapter-specific state
      setCurrentChapterIndex(null);
      setChapterContent('');
      setChatMessages([]);
      ebookZipRef.current = null;
    } else if (view === 'story-detail') {
      setView('home');
      // Clear story-specific state
      setSelectedStory(null);
      setReadChapters(new Set());
      setCumulativeStats(null);
      setSearchResults([]);
    }
  };

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setError(null);
    setSearchResults([]);
    try {
      // Check if query is a URL
      new URL(query);
      const story = await truyenService.getStoryFromUrl(query);
      await handleSelectStory(story);
    } catch (_) {
      // Not a URL, perform a search
      try {
        const results = await truyenService.searchStory(query);
        setSearchResults(results);
      } catch (e: any) {
        setError(e.message);
      }
    }
    setIsLoading(false);
  };
  
  const handleSelectStory = useCallback(async (story: Story) => {
    setIsDetailLoading(true);
    setError(null);
    setView('story-detail');
    try {
      const detailedStory = (story.chapters && story.chapters.length > 0) ? story : await truyenService.getStoryDetails(story);
      setSelectedStory(detailedStory);

      // Load read chapters and stats from localStorage
      const savedRead = localStorage.getItem(`readChapters_${detailedStory.url}`);
      if (savedRead) {
        setReadChapters(new Set(JSON.parse(savedRead)));
      } else {
        setReadChapters(new Set());
      }
      const savedStats = storyStateService.getStoryState(detailedStory.url);
      setCumulativeStats(savedStats);
    } catch (e: any) {
      setError(e.message);
      setView('home');
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  const runAiAnalysis = useCallback(async (chapterUrl: string, content: string) => {
    if (!apiKey || !selectedStory) return;
    
    const cachedData = cacheService.getCachedChapter(selectedStory.url, chapterUrl);
    if (cachedData?.stats) {
        setCumulativeStats(prevStats => storyStateService.mergeChapterStats(prevStats || {}, cachedData.stats!));
        return;
    }

    setIsAnalyzing(true);
    try {
      const newStats = await geminiService.analyzeChapterForCharacterStats(apiKey, content, cumulativeStats);
      if (newStats) {
        const updatedStats = storyStateService.mergeChapterStats(cumulativeStats || {}, newStats);
        setCumulativeStats(updatedStats);
        storyStateService.saveStoryState(selectedStory.url, updatedStats);
        
        cacheService.setCachedChapter(selectedStory.url, chapterUrl, { content, stats: newStats });
      }
    } catch (e: any) {
        setError(`Lỗi phân tích AI: ${e.message}`);
    } finally {
        setIsAnalyzing(false);
    }
  }, [apiKey, selectedStory, cumulativeStats]);

  const handleSelectChapter = useCallback(async (chapter: Chapter) => {
    if (!selectedStory) return;
    setIsChapterLoading(true);
    setError(null);
    setIsCharacterPanelOpen(false);
    setIsChatPanelOpen(false);
    setChatMessages([]);

    const chapterIndex = selectedStory.chapters?.findIndex(c => c.url === chapter.url) ?? -1;
    setCurrentChapterIndex(chapterIndex);

    try {
        const cachedData = cacheService.getCachedChapter(selectedStory.url, chapter.url);
        let content: string;
        
        if (cachedData) {
            content = cachedData.content;
        } else {
            content = await truyenService.getChapterContent(chapter, selectedStory.source);
            cacheService.setCachedChapter(selectedStory.url, chapter.url, { content, stats: null });
        }
        
        setChapterContent(content);
        setView('chapter-content');

        setReadChapters(prev => new Set(prev).add(chapter.url));
        const newHistory = historyService.updateReadingHistory(selectedStory, chapter);
        setReadingHistory(newHistory);
        
        runAiAnalysis(chapter.url, content);

    } catch (e: any) {
        setError(e.message);
        setView('story-detail');
    } finally {
        setIsChapterLoading(false);
    }
  }, [selectedStory, runAiAnalysis]);

  const handleNavigateChapter = (direction: 'prev' | 'next') => {
    if (selectedStory?.chapters && currentChapterIndex !== null) {
      const newIndex = direction === 'prev' ? currentChapterIndex - 1 : currentChapterIndex + 1;
      if (newIndex >= 0 && newIndex < selectedStory.chapters.length) {
        const chapterToSelect = selectedStory.chapters[newIndex];
        if (selectedStory.source === 'Ebook') {
            handleSelectEbookChapter(chapterToSelect);
        } else {
            handleSelectChapter(chapterToSelect);
        }
      }
    }
  };

  const handleContinueReading = async (item: ReadingHistoryItem) => {
    if (item.source === 'Ebook') {
        const story = await dbService.getStory(item.url);
        if (story) {
            await handleSelectStory(story);
            const chapter = story.chapters?.find(c => c.url === item.lastChapterUrl);
            if (chapter) await handleSelectEbookChapter(chapter);
        } else {
            setError(`Không tìm thấy dữ liệu cho Ebook: ${item.title}`);
        }
    } else {
        const storyToLoad: Story = { ...item, source: item.source };
        await handleSelectStory(storyToLoad);
        const chapterToLoad = { url: item.lastChapterUrl, title: item.lastChapterTitle };
        await handleSelectChapter(chapterToLoad);
    }
  };

  const handleApiKeySave = async (key: string): Promise<true | string> => {
    if (apiKeyService.isAiStudio()) {
        apiKeyService.saveApiKey("AI_STUDIO_DUMMY_KEY");
        setApiKey("AI_STUDIO_DUMMY_KEY");
        setIsApiKeyModalOpen(false);
        return true;
    }
    try {
        await geminiService.validateApiKey(key);
        apiKeyService.saveApiKey(key);
        setApiKey(key);
        setIsApiKeyModalOpen(false);
        return true;
    } catch (error: any) {
        return error.message;
    }
  };
  
  const handleApiKeyDelete = () => {
    apiKeyService.clearApiKey();
    setApiKey(null);
  };
  
  const handleStatsChange = (newStats: CharacterStats) => {
    setCumulativeStats(newStats);
    if (selectedStory) {
        storyStateService.saveStoryState(selectedStory.url, newStats);
    }
  };
  
  const handleReanalyze = async (type: 'primary' | 'world') => {
      if (!apiKey || !selectedStory || currentChapterIndex === null) return;
      const chapter = selectedStory.chapters?.[currentChapterIndex];
      if (!chapter) return;
      
      const cachedData = cacheService.getCachedChapter(selectedStory.url, chapter.url);
      if (!cachedData) return;

      const setLoading = type === 'primary' ? setIsPrimaryAnalysisRunning : setIsWorldAnalysisRunning;
      setLoading(true);

      try {
          const analysisFn = type === 'primary' 
            ? geminiService.analyzeChapterForPrimaryCharacter 
            : geminiService.analyzeChapterForWorldInfo;

          const newStats = await analysisFn(apiKey, cachedData.content, cumulativeStats);

          if (newStats) {
            const updatedStats = storyStateService.mergeChapterStats(cumulativeStats || {}, newStats);
            handleStatsChange(updatedStats);
            const updatedCachedStats = storyStateService.mergeChapterStats(cachedData.stats || {}, newStats);
            cacheService.setCachedChapter(selectedStory.url, chapter.url, { content: cachedData.content, stats: updatedCachedStats });
          }
      } catch (e: any) {
          setError(`Lỗi phân tích lại: ${e.message}`);
      } finally {
          setLoading(false);
      }
  };
  
  const handleSendMessage = async (message: string) => {
      if (!apiKey || !selectedStory) return;
      setChatMessages(prev => [...prev, { role: 'user', content: message }]);
      setIsChatLoading(true);

      try {
          let responseText = '';
          if (selectedStory.source === 'Ebook' && ebookZipRef.current && selectedStory.chapters) {
              responseText = await geminiService.chatWithEbook(apiKey, message, ebookZipRef.current, selectedStory.chapters);
          } else if (chapterContent) {
              responseText = await geminiService.chatWithChapterContent(apiKey, message, chapterContent, selectedStory.title);
          } else {
              throw new Error("Không có nội dung để trò chuyện.");
          }
          setChatMessages(prev => [...prev, { role: 'model', content: responseText }]);
      } catch (e: any) {
          setChatMessages(prev => [...prev, { role: 'model', content: `Lỗi: ${e.message}` }]);
      } finally {
          setIsChatLoading(false);
      }
  };

  const handleEbookImport = (file: File) => {
      setIsLoading(true);
      setError(null);
      const zip = new JSZip();
      zip.loadAsync(file)
          .then(async (zip) => {
              const contentOpf = await zip.file(/content\.opf/i)[0]?.async('string');
              if (!contentOpf) throw new Error("Không tìm thấy file content.opf trong Ebook.");
              
              const parser = new DOMParser();
              const doc = parser.parseFromString(contentOpf, "application/xml");
              
              const title = doc.querySelector('metadata > dc\\:title')?.textContent || file.name.replace(/\.[^/.]+$/, "");
              const author = doc.querySelector('metadata > dc\\:creator')?.textContent || 'Không rõ';
              
              const manifestItems: { [id: string]: { href: string, mediaType: string } } = {};
              doc.querySelectorAll('manifest > item').forEach(item => {
                  const id = item.getAttribute('id');
                  const href = item.getAttribute('href');
                  const mediaType = item.getAttribute('media-type');
                  if (id && href && mediaType?.includes('html')) {
                      manifestItems[id] = { href, mediaType };
                  }
              });

              const chapters: Chapter[] = [];
              doc.querySelectorAll('spine > itemref').forEach(itemref => {
                  const idref = itemref.getAttribute('idref');
                  if (idref && manifestItems[idref]) {
                      chapters.push({ title: idref, url: manifestItems[idref].href });
                  }
              });
              
              for (const chapter of chapters) {
                  const chapterFile = zip.file(decodeURIComponent(chapter.url));
                  if (chapterFile) {
                      const html = await chapterFile.async('string');
                      const chapterDoc = parser.parseFromString(html, 'text/html');
                      chapter.title = chapterDoc.querySelector('h1, h2, h3, title')?.textContent?.trim() || chapter.title;
                  }
              }

              const ebookId = `ebook-${title.replace(/\s/g, '_')}`;
              const newStory: Story = {
                  title, author, imageUrl: '', source: 'Ebook', url: ebookId,
                  description: `Ebook được nhập vào lúc ${new Date().toLocaleString()}`, chapters,
              };

              await dbService.saveEbook(ebookId, file);
              await dbService.saveStory(newStory);

              await handleSelectStory(newStory);
          })
          .catch(e => { setError(`Lỗi xử lý Ebook: ${e.message}`); })
          .finally(() => { setIsLoading(false); });
  };

  const handleSelectEbookChapter = async (chapter: Chapter) => {
      if (!selectedStory || !selectedStory.url.startsWith('ebook-')) return;
      setIsChapterLoading(true);
      setError(null);
      try {
          if (!ebookZipRef.current) {
              const buffer = await dbService.getEbookAsArrayBuffer(selectedStory.url);
              if (!buffer) throw new Error("Không thể tải file Ebook từ cơ sở dữ liệu.");
              ebookZipRef.current = await new JSZip().loadAsync(buffer);
          }
          const chapterFile = ebookZipRef.current.file(decodeURIComponent(chapter.url));
          if (!chapterFile) throw new Error(`Không tìm thấy file chương: ${chapter.url}`);

          const rawHtml = await chapterFile.async('string');
          const parser = new DOMParser();
          const doc = parser.parseFromString(rawHtml, 'text/html');
          const contentEl = doc.body;
          contentEl.querySelectorAll('a, sup, sub, script, style, img, svg').forEach(el => el.remove());
          
          contentEl.innerHTML = contentEl.innerHTML.replace(/<br\s*\/?>/gi, '\n');
          const content = (contentEl.textContent ?? '').trim().replace(/\n\s*\n/g, '\n\n');
          
          setChapterContent(content || "Nội dung chương trống.");
          
          const chapterIndex = selectedStory.chapters?.findIndex(c => c.url === chapter.url) ?? -1;
          setCurrentChapterIndex(chapterIndex);
          setView('chapter-content');

          setReadChapters(prev => new Set(prev).add(chapter.url));
          const newHistory = historyService.updateReadingHistory(selectedStory, chapter);
          setReadingHistory(newHistory);
      } catch (e: any) {
          setError(`Lỗi đọc chương Ebook: ${e.message}`);
      } finally {
          setIsChapterLoading(false);
      }
  };

  const handleEbookDelete = async () => {
      if (!ebookToDelete) return;
      try {
        await dbService.deleteEbookAndStory(ebookToDelete.url);
        const newHistory = readingHistory.filter(item => item.url !== ebookToDelete.url);
        historyService.saveReadingHistory(newHistory);
        setReadingHistory(newHistory);
      } catch (e: any) {
          setError(`Lỗi xóa Ebook: ${e.message}`);
      } finally {
          setEbookToDelete(null);
      }
  };

  const lastReadChapterIndex = selectedStory?.chapters?.findIndex(c => c.url === readingHistory.find(h => h.url === selectedStory.url)?.lastChapterUrl) ?? null;

  const renderView = () => {
    if (isDetailLoading) {
      return <div className="flex justify-center items-center h-64"><LoadingSpinner /></div>;
    }
    if (error) {
      return (
        <div className="text-center p-8 bg-rose-900/50 border border-rose-700 rounded-lg">
          <h2 className="text-xl font-bold text-rose-300">Đã xảy ra lỗi</h2>
          <p className="text-rose-400 mt-2">{error}</p>
          <button onClick={() => { setError(null); setView('home'); }} className="mt-6 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded-lg">
            Quay lại
          </button>
        </div>
      );
    }
    switch (view) {
      case 'story-detail':
        return selectedStory && (
          <StoryDetail
            story={selectedStory}
            onSelectChapter={selectedStory.source === 'Ebook' ? handleSelectEbookChapter : handleSelectChapter}
            readChapters={readChapters}
            lastReadChapterIndex={lastReadChapterIndex}
            onBack={handleBack}
          />
        );
      case 'chapter-content':
        return selectedStory && currentChapterIndex !== null && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-2/3">
              {isChapterLoading ? (
                 <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>
              ) : (
                <ChapterContent
                  story={selectedStory}
                  currentChapterIndex={currentChapterIndex}
                  content={chapterContent}
                  onBack={handleBack}
                  onPrev={() => handleNavigateChapter('prev')}
                  onNext={() => handleNavigateChapter('next')}
                  onSelectChapter={selectedStory.source === 'Ebook' ? handleSelectEbookChapter : handleSelectChapter}
                  readChapters={readChapters}
                  settings={settings}
                  onSettingsChange={onSettingsChange}
                  onNavBarVisibilityChange={setIsBottomNavVisible}
                  cumulativeStats={cumulativeStats}
                  onStatsChange={handleStatsChange}
                />
              )}
            </div>
             <aside className="lg:w-1/3 space-y-6">
                <CharacterPrimaryPanel
                    stats={cumulativeStats}
                    isAnalyzing={isPrimaryAnalysisRunning || (isAnalyzing && !cumulativeStats)}
                    onStatsChange={handleStatsChange}
                    onDataLoaded={handleBack}
                    onReanalyze={() => handleReanalyze('primary')}
                />
                <CharacterPanel
                    stats={cumulativeStats}
                    isOpen={true} onClose={() => {}} isSidebar={true}
                    isAnalyzing={isWorldAnalysisRunning || (isAnalyzing && !cumulativeStats)}
                    onStatsChange={handleStatsChange}
                    onDataLoaded={handleBack}
                    onReanalyze={() => handleReanalyze('world')}
                />
            </aside>
          </div>
        );
      case 'home':
      default:
        return (
          <>
            <SearchBar onSearch={handleSearch} isLoading={isLoading} onEbookImport={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.epub';
                input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleEbookImport(file);
                };
                input.click();
            }} />
            {isLoading && <div className="mt-8"><LoadingSpinner /></div>}
            <div className="mt-12">
              <ReadingHistory items={readingHistory} onContinue={handleContinueReading} onRequestDeleteEbook={setEbookToDelete} />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-12">
                <SearchResultsList results={searchResults} onSelectStory={handleSelectStory} />
              </div>
            )}
          </>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)]">
      <Header 
        onOpenSync={() => setIsSyncModalOpen(true)}
        user={user}
        onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)}
      />
      <main className="container mx-auto p-4 sm:p-6 flex-grow w-full">
        {renderView()}
      </main>
      <Footer />
      
      <ScrollToTopButton isReading={view === 'chapter-content'} isBottomNavVisible={isBottomNavVisible} />
      {isSyncModalOpen && isAuthReady && <SyncModal onClose={() => setIsSyncModalOpen(false)} onSync={async () => true} user={user} />}
      <ApiKeyModal 
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onValidateAndSave={handleApiKeySave}
        onDelete={handleApiKeyDelete}
        currentKey={apiKey}
      />

       {view === 'chapter-content' && (
          <>
              <ChatToggleButton 
                  onClick={() => setIsChatPanelOpen(p => !p)} 
                  isPanelOpen={isChatPanelOpen}
                  isBottomNavVisible={isBottomNavVisible}
              />
              <ChatPanel 
                  isOpen={isChatPanelOpen}
                  onClose={() => setIsChatPanelOpen(false)}
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  isLoading={isChatLoading}
                  storyTitle={selectedStory?.title}
              />
          </>
      )}

      <ConfirmationModal
          isOpen={!!ebookToDelete}
          onClose={() => setEbookToDelete(null)}
          onConfirm={handleEbookDelete}
          title="Xác nhận xóa Ebook"
      >
          Bạn có chắc chắn muốn xóa Ebook <strong className="text-[var(--theme-text-primary)]">{ebookToDelete?.title}</strong>? Thao tác này sẽ xóa vĩnh viễn file và không thể hoàn tác.
      </ConfirmationModal>

      <div id="popover-root"></div>
    </div>
  );
}

export default App;
