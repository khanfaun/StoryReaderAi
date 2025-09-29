import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Story, Chapter, CharacterStats, ReadingSettings, ReadingHistoryItem, ChatMessage } from './types';
import { searchStory, getChapterContent, getStoryDetails, getSourceInfo, parseHtml, ManualImportRequiredError, getChaptersForTangThuVien } from './services/truyenfullService';
import { analyzeChapterForCharacterStats, chatWithEbook, chatWithChapterContent, validateApiKey, analyzeChapterForPrimaryCharacter, analyzeChapterForWorldInfo } from './services/geminiService';
import { getCachedChapter, setCachedChapter } from './services/cacheService';
import { getStoryState, saveStoryState as saveStoryStateLocal, mergeChapterStats } from './services/storyStateService';
import { useReadingSettings } from './hooks/useReadingSettings';
import { getReadingHistory, saveReadingHistory, updateReadingHistory } from './services/history';
import * as dbService from './services/dbService';
import * as apiKeyService from './services/apiKeyService';

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


declare var JSZip: any;

interface EbookHandler {
  zip: any; // JSZip instance
}

type ManualImportType = 'story_details' | 'chapter_list' | 'chapter_content';

interface ManualImportState {
    isOpen: boolean;
    urlToImport: string;
    message: string;
    importType: ManualImportType | null;
    onFileSelected: (file: File) => Promise<void>;
}

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

  // States for local history
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>([]);

  // State for Ebook handling
  const [ebookInstance, setEbookInstance] = useState<EbookHandler | null>(null);
  const ebookFileRef = useRef<HTMLInputElement>(null);

  // State for AI Chat
  const [isChatPanelVisible, setIsChatPanelVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // State for delete confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; item?: ReadingHistoryItem }>({ isOpen: false });

  // State for API Key management
  const [apiKey, setApiKey] = useState<string | null>(apiKeyService.getApiKey());
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(!apiKeyService.hasApiKey());
  const [tokenUsage, setTokenUsage] = useState<apiKeyService.TokenUsage>(apiKeyService.getTokenUsage());


  // State for Update Modal
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(true);

  // State for Help Modal
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // State for Manual Import Modal
  const [manualImportState, setManualImportState] = useState<ManualImportState>({
    isOpen: false,
    urlToImport: '',
    message: '',
    importType: null,
    onFileSelected: async () => {},
  });


  const saveStoryState = useCallback((storyUrl: string, state: CharacterStats) => {
    saveStoryStateLocal(storyUrl, state);
  }, []);
  
  const handleStatsChange = useCallback((newStats: CharacterStats) => {
      setCumulativeStats(newStats);
      if (story) {
        saveStoryState(story.url, newStats);
      }
  }, [story, saveStoryState]);
  
  const reloadDataFromStorage = useCallback(async () => {
    setIsDataLoading(true);
    setStory(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
    setSearchResults(null);
    setError(null);
    const localHistory = getReadingHistory();
    const dbStories = await dbService.getAllStories();
    const dbEbooks = dbStories.filter(s => s.source === 'Ebook');
    const historyMap = new Map(localHistory.map(item => [item.url, item]));
    dbEbooks.forEach(ebook => {
      if (!historyMap.has(ebook.url)) {
        const placeholderItem: ReadingHistoryItem = {
          title: ebook.title, author: ebook.author, url: ebook.url,
          source: ebook.source, imageUrl: ebook.imageUrl,
          lastChapterUrl: ebook.chapters?.[0]?.url || '',
          lastChapterTitle: ebook.chapters?.[0]?.title || 'Bắt đầu đọc',
          lastReadTimestamp: 0
        };
        historyMap.set(ebook.url, placeholderItem);
      }
    });
    const combinedHistory = Array.from(historyMap.values()).sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);
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
    
    setIsDataLoading(false);
  }, [setSettings]);


  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await reloadDataFromStorage();
      setTokenUsage(apiKeyService.getTokenUsage());
      setIsLoading(false);
    };

    loadInitialData();
  }, [reloadDataFromStorage]);

  const resetChat = () => {
    setChatMessages([]);
    setIsChatLoading(false);
  };

  const handleApiError = useCallback((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
        setError(errorMessage);
        if (errorMessage.includes('API Key không hợp lệ')) {
            apiKeyService.clearApiKey();
            setApiKey(null);
            setIsApiKeyModalOpen(true);
        }
  }, []);
  
  const handleTokenUsageUpdate = useCallback((usageData?: { totalTokens: number }) => {
    if (!usageData || !usageData.totalTokens || usageData.totalTokens === 0) return;
    if (!apiKey) return;
    setTokenUsage(prevUsage => {
      const newTotal = prevUsage.totalTokens + usageData.totalTokens;
      const newUsageState = { ...prevUsage, totalTokens: newTotal };
      apiKeyService.saveTokenUsage(apiKey, newUsageState);
      return newUsageState;
    });
  }, [apiKey]);
    
  // Central function to process content and run AI analysis
  const processAndAnalyzeContent = useCallback(async (storyToLoad: Story, chapterUrl: string, content: string) => {
    setChapterContent(content);
    if (!apiKey) {
      setError("Vui lòng thiết lập API Key để sử dụng tính năng phân tích nhân vật.");
      setIsApiKeyModalOpen(true);
      setCachedChapter(storyToLoad.url, chapterUrl, { content, stats: null });
      return;
    }

    setIsAnalyzing(true);
    try {
      const currentStats = getStoryState(storyToLoad.url) ?? {};
      const { data: chapterStats, usage } = await analyzeChapterForCharacterStats(apiKey, content, currentStats);
      handleTokenUsageUpdate(usage);
      const newState = mergeChapterStats(currentStats, chapterStats ?? {});
      setCumulativeStats(newState);
      saveStoryState(storyToLoad.url, newState);
      setCachedChapter(storyToLoad.url, chapterUrl, { content, stats: chapterStats });
    } catch (analysisError) {
      console.error("Analysis error, caching content only", analysisError);
      handleApiError(analysisError);
      setCachedChapter(storyToLoad.url, chapterUrl, { content, stats: null });
    } finally {
      setIsAnalyzing(false);
    }
  }, [apiKey, handleApiError, handleTokenUsageUpdate, saveStoryState]);

  const fetchChapter = useCallback(async (storyToLoad: Story, chapterIndex: number) => {
    if (!storyToLoad || !storyToLoad.chapters || chapterIndex < 0 || chapterIndex >= storyToLoad.chapters.length) return;
    
    const chapter = storyToLoad.chapters[chapterIndex];
    setSelectedChapterIndex(chapterIndex);
    
    const newHistory = updateReadingHistory(storyToLoad, chapter);
    setReadingHistory(newHistory);

    const newReadChapters = new Set(readChapters);
    newReadChapters.add(chapter.url);
    localStorage.setItem(`readChapters_${storyToLoad.url}`, JSON.stringify(Array.from(newReadChapters)));
    
    let cachedData = getCachedChapter(storyToLoad.url, chapter.url);
    if (cachedData) {
        setChapterContent(cachedData.content);
        if (cachedData.stats) {
            const currentStats = getStoryState(storyToLoad.url) ?? {};
            const newState = mergeChapterStats(currentStats, cachedData.stats);
            setCumulativeStats(newState);
            saveStoryState(storyToLoad.url, newState);
        }
        return;
    }

    setIsChapterLoading(true);
    setError(null);
    setChapterContent(null);
    
    const sourceInfo = getSourceInfo(chapter.url);
    
    try {
        if (storyToLoad.source === 'Ebook' && ebookInstance) {
            const { zip } = ebookInstance;
            const decodedUrl = decodeURIComponent(chapter.url);
            const chapterFile = zip.file(decodedUrl);
            if (!chapterFile) throw new Error(`Không thể tìm thấy tệp tin của chương "${decodedUrl}" bên trong Ebook.`);
            const rawHtml = await chapterFile.async('string');
            const doc = parseHtml(rawHtml);
            const contentEl = doc.body;
            contentEl.querySelectorAll('a, sup, sub, script, style, img, svg').forEach((el: HTMLElement) => el.remove());
            contentEl.innerHTML = contentEl.innerHTML.replace(/<br\s*\/?>/gi, '\n');
            let text = (contentEl.textContent ?? '').trim();
            if (!text) text = "Nội dung chương trống.";
            await processAndAnalyzeContent(storyToLoad, chapter.url, text.replace(/\n\s*\n/g, '\n\n'));
        } else if (sourceInfo && !sourceInfo.direct) {
            // Blocked source, require manual import
            throw new ManualImportRequiredError(
                "Để đọc chương này, vui lòng truy cập trang chương, lưu lại (Ctrl+S), và nhập file HTML.",
                chapter.url
            );
        } else {
             // This path is now only for whitelisted sources
            const fetchUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(chapter.url)}`;
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Không thể tải nội dung chương từ nguồn trực tiếp.`);
            const htmlText = await response.text();
            const doc = parseHtml(htmlText);
            const content = getChapterContent(doc, storyToLoad.source);
            await processAndAnalyzeContent(storyToLoad, chapter.url, content);
        }
    } catch (err) {
        if (err instanceof ManualImportRequiredError) {
            setManualImportState({
                isOpen: true,
                urlToImport: err.url,
                message: err.message,
                importType: 'chapter_content',
                onFileSelected: async (file) => {
                    const htmlText = await file.text();
                    const doc = parseHtml(htmlText);
                    const content = getChapterContent(doc, storyToLoad.source);
                    await processAndAnalyzeContent(storyToLoad, chapter.url, content);
                    setManualImportState({ ...manualImportState, isOpen: false });
                }
            });
        } else {
            handleApiError(err);
        }
    } finally {
        setIsChapterLoading(false);
    }
  }, [readChapters, saveStoryState, ebookInstance, processAndAnalyzeContent, handleApiError]);

  const handleSearch = useCallback(async (query: string) => {
    setIsDataLoading(true);
    setError(null);
    setStory(null);
    setSearchResults(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
    setCumulativeStats(null);
    setReadChapters(new Set());
    setEbookInstance(null);
    resetChat();
    
    try {
      const urlRegex = /^(https?):\/\/[^\s$.?#].[^\s]*$/i;
      if (urlRegex.test(query)) {
        const sourceInfo = getSourceInfo(query);
        if (!sourceInfo) {
            throw new Error(`URL từ trang '${new URL(query).hostname}' không được hỗ trợ.`);
        }
        
        if (!sourceInfo.direct) {
            // For blocked sources, immediately ask for manual import
            throw new ManualImportRequiredError(
                `Trang này (${sourceInfo.source}) không hỗ trợ tải trực tiếp. Vui lòng lưu trang truyện (Ctrl+S) và nhập file HTML.`,
                query
            );
        }

        // Only direct sources will be fetched
        const fetchUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(query)}`;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`Proxy fetch failed for ${query}`);
        const htmlText = await response.text();
        const doc = parseHtml(htmlText);
        const details = await getStoryDetails(doc, query, sourceInfo.source);
        
        const fullStory: Story = {
            title: details.title || 'Không có tiêu đề',
            author: details.author || 'Không rõ tác giả',
            imageUrl: details.imageUrl || '',
            description: details.description,
            chapters: details.chapters,
            url: query,
            source: sourceInfo.source,
        };
        
        setStory(fullStory);
        setCumulativeStats(getStoryState(fullStory.url) ?? {});
        const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
        if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));

      } else {
        const results = await searchStory(query);
        setSearchResults(results);
      }
    } catch (err) {
      if (err instanceof ManualImportRequiredError) {
          const sourceInfo = getSourceInfo(err.url)!;
          setManualImportState({
              isOpen: true,
              urlToImport: err.url,
              message: err.message,
              importType: 'story_details',
              onFileSelected: async (file) => {
                  try {
                      setIsDataLoading(true);
                      const htmlText = await file.text();
                      const doc = parseHtml(htmlText);
                      
                      // This might throw another ManualImportRequiredError for chapter lists (e.g., TTV)
                      try {
                          const details = await getStoryDetails(doc, err.url, sourceInfo.source);
                          const fullStory: Story = {
                              title: details.title || 'Không có tiêu đề',
                              author: details.author || 'Không rõ tác giả',
                              imageUrl: details.imageUrl || '',
                              description: details.description,
                              chapters: details.chapters,
                              url: err.url,
                              source: sourceInfo.source,
                          };
                          setStory(fullStory);
                          setCumulativeStats(getStoryState(fullStory.url) ?? {});
                          setManualImportState({ ...manualImportState, isOpen: false });
                      } catch (innerErr) {
                           if (innerErr instanceof ManualImportRequiredError) {
                              // Handle the nested request for the chapter list
                              const tempStory: Story = {
                                  title: doc.querySelector('.book-info h1')?.textContent?.trim() ?? 'Đang tải...',
                                  author: doc.querySelector('.book-info .tag a.blue')?.textContent?.trim() ?? 'Đang tải...',
                                  imageUrl: doc.querySelector('div.book-img > img')?.getAttribute('src') ?? '',
                                  description: 'Đang chờ tải danh sách chương...',
                                  url: err.url,
                                  source: sourceInfo.source,
                                  chapters: [],
                              };
                              setStory(tempStory); // Set temporary story
                              setCumulativeStats(getStoryState(tempStory.url) ?? {});
                              
                              setManualImportState({
                                  isOpen: true,
                                  urlToImport: innerErr.url,
                                  message: innerErr.message,
                                  importType: 'chapter_list',
                                  onFileSelected: async (chapterListFile) => {
                                      const chapterHtml = await chapterListFile.text();
                                      const chapterDoc = parseHtml(chapterHtml);
                                      const chapters = getChaptersForTangThuVien(chapterDoc, innerErr.url);
                                      setStory({ ...tempStory, chapters, description: doc.querySelector('.book-intro')?.textContent?.trim() });
                                      setManualImportState({ ...manualImportState, isOpen: false });
                                  }
                              });
                           } else {
                              throw innerErr; // Re-throw other errors
                           }
                      }
                  } catch (importError) {
                      setError(importError instanceof Error ? importError.message : "Lỗi khi xử lý file HTML.");
                      setManualImportState({ ...manualImportState, isOpen: false });
                  } finally {
                      setIsDataLoading(false);
                  }
              }
          });
      } else {
        setError(err instanceof Error ? err.message : "An unknown error occurred.");
      }
    } finally {
      setIsDataLoading(false);
    }
  }, []);
  
  const handleSelectStory = useCallback(async (selectedStory: Story) => {
    setIsDataLoading(true);
    setError(null);
    setSearchResults(null);
    setStory(null);
    setEbookInstance(null);
    resetChat();
    
    try {
        // Direct fetching is only for whitelisted sites now
        const sourceInfo = getSourceInfo(selectedStory.url)!;
        const fetchUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(selectedStory.url)}`;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("Proxy fetch failed");
        const htmlText = await response.text();
        const doc = parseHtml(htmlText);
        const details = await getStoryDetails(doc, selectedStory.url, sourceInfo.source);
        const fullStory = { ...selectedStory, ...details };

        setStory(fullStory);
        setCumulativeStats(getStoryState(fullStory.url) ?? {});
        const savedRead = localStorage.getItem(`readChapters_${fullStory.url}`);
        if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
        else setReadChapters(new Set());
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

  const handleEbookImportClick = () => {
    ebookFileRef.current?.click();
  };
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsDataLoading(true);
    setError(null);
    setStory(null);
    setSearchResults(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
    setCumulativeStats(null);
    setReadChapters(new Set());
    setEbookInstance(null);
    resetChat();
   
    try {
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

      const titleMap = new Map<string, string>();
      const parseNavPoints = (element: Element, pathDir: string) => {
        for (const point of Array.from(element.children).filter(c => c.tagName.toLowerCase() === 'navpoint')) {
          const label = point.querySelector('navLabel > text')?.textContent?.trim();
          const src = point.querySelector('content')?.getAttribute('src');
          if (label && src) {
            const chapterUrl = new URL(src.split('#')[0], `http://dummy.com/${pathDir}`).pathname.substring(1);
            titleMap.set(chapterUrl, label);
          }
          parseNavPoints(point, pathDir);
        }
      };

      if (navHref) { // EPUB 3
          const navXmlText = await zip.file(navHref).async('string');
          const navDoc = parser.parseFromString(navXmlText, 'text/html');
          const tocNav = navDoc.querySelector('nav[epub\\:type="toc"]');
          if (tocNav) {
            for (const link of Array.from(tocNav.querySelectorAll('a'))) {
              const href = link.getAttribute('href'), chapterTitle = link.textContent?.trim();
              if (href && chapterTitle) {
                const navPathDir = navHref.substring(0, navHref.lastIndexOf('/') + 1);
                const chapterUrl = new URL(href.split('#')[0], `http://dummy.com/${navPathDir}`).pathname.substring(1);
                titleMap.set(chapterUrl, chapterTitle);
              }
            }
          }
      } else { // EPUB 2
          const ncxFileIdFromSpine = spineEl.getAttribute('toc');
          const ncxManifestItem = manifestMap.get(ncxFileIdFromSpine || ncxId || '');
          if (ncxManifestItem) {
            const ncxXmlText = await zip.file(ncxManifestItem.href).async('string');
            const ncxDoc = parser.parseFromString(ncxXmlText, 'application/xml');
            const navMap = ncxDoc.querySelector('navMap');
            if (navMap) {
              const ncxPathDir = ncxManifestItem.href.substring(0, ncxManifestItem.href.lastIndexOf('/') + 1);
              parseNavPoints(navMap, ncxPathDir);
            }
          }
      }
      
      let chapters = spineChapters.map(c => ({ ...c, title: titleMap.get(decodeURIComponent(c.url)) || c.title }))
        .filter(c => !['bìa', 'cover', 'mục lục', 'bản quyền'].some(kw => c.title.toLowerCase().includes(kw)));
      if (chapters.length === 0 && spineChapters.length > 1) chapters = spineChapters.slice(1);
      if (chapters.length === 0) throw new Error("Không tìm thấy chương có nội dung trong file Ebook này.");

      const ebookStory: Story = { title, author, imageUrl, source: 'Ebook', url: `ebook:${file.name}`, description, chapters };
      
      await dbService.saveEbook(ebookStory.url, file);
      await dbService.saveStory(ebookStory);
      
      setStory(ebookStory);
      setEbookInstance({ zip });
      
      const newHistory = updateReadingHistory(ebookStory, chapters[0]);
      setReadingHistory(newHistory);
      
      let storyState = getStoryState(ebookStory.url);
      setCumulativeStats(storyState ?? {});
      const savedRead = localStorage.getItem(`readChapters_${ebookStory.url}`);
      if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));

    } catch (err) {
       setError(err instanceof Error ? `Lỗi xử lý file Ebook: ${err.message}` : "Không thể đọc file Ebook.");
    } finally {
       setIsDataLoading(false);
       if (ebookFileRef.current) ebookFileRef.current.value = "";
    }
  };
  
  const handleBackToStory = () => {
    setSelectedChapterIndex(null);
    setChapterContent(null);
    setError(null);
    setIsPanelVisible(false);
  };
  
  const handleBackToMain = () => {
    setStory(null);
    setSelectedChapterIndex(null);
    setChapterContent(null);
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
        let storyToLoad: Story;
        if (item.source === 'Ebook') {
            const [ebookBuffer, dbStory] = await Promise.all([
                dbService.getEbookAsArrayBuffer(item.url),
                dbService.getStory(item.url)
            ]);
            if (!ebookBuffer || !dbStory) throw new Error("Không tìm thấy dữ liệu Ebook đã lưu. Vui lòng nhập lại file.");
            
            const zip = await JSZip.loadAsync(ebookBuffer);
            setEbookInstance({ zip });
            storyToLoad = dbStory;
        } else {
            // Re-trigger the fetch/import flow for web stories
            await handleSearch(item.url);
            // The rest of the logic is handled within handleSearch, so we can exit early.
            setIsDataLoading(false);
            return;
        }

        setStory(storyToLoad);
        setCumulativeStats(getStoryState(storyToLoad.url) ?? {});
        
        const savedRead = localStorage.getItem(`readChapters_${storyToLoad.url}`);
        if (savedRead) setReadChapters(new Set(JSON.parse(savedRead)));
        else setReadChapters(new Set());

        const chapterIndex = storyToLoad.chapters?.findIndex(c => 
            decodeURIComponent(c.url) === decodeURIComponent(item.lastChapterUrl)
        );

        if (chapterIndex !== -1 && chapterIndex !== undefined) {
            await fetchChapter(storyToLoad, chapterIndex);
        } else if (storyToLoad.chapters?.length) {
            await fetchChapter(storyToLoad, 0);
        }
    } catch (err) {
        if (err instanceof ManualImportRequiredError) {
            // Also handle manual import from history
            await handleSearch(item.url);
        } else {
            setError(err instanceof Error ? err.message : "Không thể tải truyện từ lịch sử.");
        }
    } finally {
        setIsDataLoading(false);
    }
  }, [fetchChapter, handleSearch]);
  
  const handleRequestDeleteEbook = (item: ReadingHistoryItem) => {
    setDeleteConfirmation({ isOpen: true, item });
  };
  
  const handleDeleteEbook = async () => {
      const storyUrl = deleteConfirmation.item?.url;
      if (!storyUrl) return;

      try {
          await dbService.deleteEbookAndStory(storyUrl);
          const currentHistory = getReadingHistory();
          const updatedHistory = currentHistory.filter(h => h.url !== storyUrl);
          saveReadingHistory(updatedHistory);
          setReadingHistory(updatedHistory);
          if (story?.url === storyUrl) {
              setStory(null);
              setSelectedChapterIndex(null);
              setChapterContent(null);
          }
      } catch (err) {
          setError("Không thể xóa Ebook.");
      } finally {
          setDeleteConfirmation({ isOpen: false });
      }
  };

  const handleSendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isChatLoading || !story) return;

    if (!apiKey) {
      const newErrorMessage: ChatMessage = { role: 'model', content: `Lỗi: Vui lòng thiết lập API Key trong mục cài đặt để sử dụng tính năng trò chuyện.` };
      setChatMessages(prev => [...prev, newErrorMessage]);
      setIsApiKeyModalOpen(true);
      return;
    }

    const newUserMessage: ChatMessage = { role: 'user', content: message };
    setChatMessages(prev => [...prev, newUserMessage]);
    setIsChatLoading(true);

    try {
      let responseText: string;
      if (story.source === 'Ebook' && ebookInstance?.zip) {
        const { text, usage } = await chatWithEbook(apiKey, message, ebookInstance.zip, story.chapters || []);
        handleTokenUsageUpdate(usage);
        responseText = text;
      } else if (chapterContent) {
        const { text, usage } = await chatWithChapterContent(apiKey, message, chapterContent, story.title);
        handleTokenUsageUpdate(usage);
        responseText = text;
      } else {
        responseText = "Không có nội dung để trò chuyện. Vui lòng tải một chương hoặc Ebook.";
      }
      const newModelMessage: ChatMessage = { role: 'model', content: responseText };
      setChatMessages(prev => [...prev, newModelMessage]);
    } catch (err) {
        handleApiError(err);
        const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi khi trò chuyện với AI.";
        const newErrorMessage: ChatMessage = { role: 'model', content: `Lỗi: ${errorMessage}` };
        setChatMessages(prev => [...prev, newErrorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  }, [isChatLoading, story, ebookInstance, chapterContent, apiKey, handleApiError, handleTokenUsageUpdate]);

  const handleValidateAndSaveApiKey = async (key: string): Promise<true | string> => {
    if (apiKeyService.isAiStudio()) {
        apiKeyService.saveApiKey(key);
        setApiKey(key);
        setTokenUsage(apiKeyService.getTokenUsage());
        setIsApiKeyModalOpen(false);
        return true;
    }
    try {
        await validateApiKey(key);
        apiKeyService.saveApiKey(key);
        setApiKey(key);
        setTokenUsage(apiKeyService.getTokenUsage());
        setIsApiKeyModalOpen(false);
        return true;
    } catch (err) {
        return err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
    }
  };


  const handleDeleteApiKey = () => {
      apiKeyService.clearApiKey();
      setApiKey(null);
      setTokenUsage(apiKeyService.getTokenUsage());
  };

  const handleReanalyzePrimary = useCallback(async () => {
    if (!apiKey || !chapterContent || !story || selectedChapterIndex === null) return;
    
    setIsAnalyzing(true);
    setError(null);
    try {
        const currentStats = getStoryState(story.url) ?? {};
        const { data: newPrimaryDelta, usage } = await analyzeChapterForPrimaryCharacter(apiKey, chapterContent, currentStats);
        handleTokenUsageUpdate(usage);
        
        if (newPrimaryDelta) {
            const newState = mergeChapterStats(currentStats, newPrimaryDelta);
            setCumulativeStats(newState);
            saveStoryState(story.url, newState);

            const chapter = story.chapters![selectedChapterIndex];
            const oldCachedData = getCachedChapter(story.url, chapter.url);
            const newCachedStats = { ...(oldCachedData?.stats || {}), ...newPrimaryDelta };
            setCachedChapter(story.url, chapter.url, { content: chapterContent, stats: newCachedStats });
        }
    } catch (err) {
        handleApiError(err);
    } finally {
        setIsAnalyzing(false);
    }
  }, [apiKey, chapterContent, story, selectedChapterIndex, handleApiError, saveStoryState, handleTokenUsageUpdate]);

  const handleReanalyzeWorld = useCallback(async () => {
    if (!apiKey || !chapterContent || !story || selectedChapterIndex === null) return;

    setIsAnalyzing(true);
    setError(null);
    try {
        const currentStats = getStoryState(story.url) ?? {};
        const { data: newWorldDelta, usage } = await analyzeChapterForWorldInfo(apiKey, chapterContent, currentStats);
        handleTokenUsageUpdate(usage);

        if (newWorldDelta) {
            const newState = mergeChapterStats(currentStats, newWorldDelta);
            setCumulativeStats(newState);
            saveStoryState(story.url, newState);

            const chapter = story.chapters![selectedChapterIndex];
            const oldCachedData = getCachedChapter(story.url, chapter.url);
            const newCachedStats = { ...(oldCachedData?.stats || {}), ...newWorldDelta };
            setCachedChapter(story.url, chapter.url, { content: chapterContent, stats: newCachedStats });
        }
    } catch (err) {
        handleApiError(err);
    } finally {
        setIsAnalyzing(false);
    }
  }, [apiKey, chapterContent, story, selectedChapterIndex, handleApiError, saveStoryState, handleTokenUsageUpdate]);

  const renderMainContent = () => {
    if (isLoading || isDataLoading) return <LoadingSpinner />;
    
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
                    <p className="text-rose-300 font-semibold">Không thể tải hoặc phân tích chương</p>
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
                  onStatsChange={handleStatsChange}
                />
            );
        }
         return <LoadingSpinner />;
    }
    
    if (story) return <StoryDetail story={story} onSelectChapter={handleSelectChapter} readChapters={readChapters} lastReadChapterIndex={selectedChapterIndex} onBack={handleBackToMain} />;
    if (searchResults) return <SearchResultsList results={searchResults} onSelectStory={handleSelectStory} />;
    if (readingHistory.length > 0) return <ReadingHistory items={readingHistory} onContinue={handleContinueFromHistory} onRequestDeleteEbook={handleRequestDeleteEbook} />;

    return (
        <div className="text-center text-[var(--theme-text-secondary)]">
            <h2 className="text-2xl mb-4 text-[var(--theme-text-primary)]">Chào mừng đến với Trình Đọc Truyện</h2>
            <p>Sử dụng thanh tìm kiếm để tìm truyện hoặc nhập file Ebook để bắt đầu đọc.</p>
        </div>
    );
  };
  
  const isReading = selectedChapterIndex !== null && !!story && !!chapterContent;
  const mainContainerClass = isReading
    ? "w-full px-4 sm:px-8 py-8 sm:py-12 flex-grow"
    : "max-w-screen-2xl mx-auto px-4 py-8 sm:py-12 flex-grow";
  
  const appContentClass = (isApiKeyModalOpen && !apiKey) || isUpdateModalOpen || isHelpModalOpen || manualImportState.isOpen ? 'blur-sm pointer-events-none' : '';

  return (
    <div className="bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] min-h-screen flex flex-col">
      <div className={appContentClass}>
        <Header 
            onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)}
            onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
        />
        <main className={mainContainerClass}>
            <div className="mb-8">
                <SearchBar 
                    onSearch={handleSearch} 
                    isLoading={isDataLoading} 
                    onEbookImport={handleEbookImportClick} 
                    onOpenHelpModal={() => setIsHelpModalOpen(true)}
                />
                <input 
                    type="file"
                    ref={ebookFileRef}
                    onChange={handleFileChange}
                    accept=".epub"
                    className="hidden"
                />
            </div>
            
            {isReading ? (
            <div className="grid grid-cols-1 lg:grid-cols-[24rem_minmax(0,1fr)_24rem] xl:grid-cols-[28rem_minmax(0,1fr)_28rem] lg:gap-8">
                <aside className="hidden lg:block sticky top-8 self-start">
                <CharacterPrimaryPanel stats={cumulativeStats} isAnalyzing={isAnalyzing} onStatsChange={handleStatsChange} onDataLoaded={reloadDataFromStorage} onReanalyze={handleReanalyzePrimary} />
                </aside>
                <div className="min-w-0">{renderMainContent()}</div>
                <aside className="hidden lg:block sticky top-8 self-start">
                <CharacterPanel stats={cumulativeStats} isAnalyzing={isAnalyzing} isOpen={true} onClose={() => {}} isSidebar={true} onStatsChange={handleStatsChange} onDataLoaded={reloadDataFromStorage} onReanalyze={handleReanalyzeWorld} />
                </aside>
            </div>
            ) : (
            <div>{renderMainContent()}</div>
            )}

        </main>
        {!isReading && <Footer />}
      </div>

      <div className={appContentClass}>
        <div className="lg:hidden">
            {isReading && (
                <>
                    <PanelToggleButton onClick={() => setIsPanelVisible(!isPanelVisible)} isPanelOpen={isPanelVisible} isBottomNavVisible={isBottomNavForReadingVisible} />
                    <CharacterPanel isOpen={isPanelVisible} onClose={() => setIsPanelVisible(false)} stats={cumulativeStats} isAnalyzing={isAnalyzing} isSidebar={false} onStatsChange={handleStatsChange} onDataLoaded={reloadDataFromStorage} onReanalyze={handleReanalyzeWorld} />
                </>
            )}
        </div>
        {isReading && (
            <>
            <ChatToggleButton onClick={() => setIsChatPanelVisible(!isChatPanelVisible)} isPanelOpen={isChatPanelVisible} isBottomNavVisible={isBottomNavForReadingVisible} />
            <ChatPanel 
                isOpen={isChatPanelVisible} 
                onClose={() => setIsChatPanelVisible(false)}
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                isLoading={isChatLoading}
                storyTitle={story?.title}
            />
            </>
        )}
        <ScrollToTopButton isReading={isReading} isBottomNavVisible={isBottomNavForReadingVisible} />
      </div>

      <UpdateModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} />
      
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />

       <ManualImportModal 
            isOpen={manualImportState.isOpen}
            onClose={() => setManualImportState({ ...manualImportState, isOpen: false })}
            urlToImport={manualImportState.urlToImport}
            message={manualImportState.message}
            onFileSelected={manualImportState.onFileSelected}
        />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onValidateAndSave={handleValidateAndSaveApiKey}
        onDelete={handleDeleteApiKey}
        currentKey={apiKey}
        tokenUsage={tokenUsage}
      />
      
       <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false })}
        onConfirm={handleDeleteEbook}
        title="Xác nhận xóa Ebook"
      >
        <p>
          Bạn có chắc chắn muốn xóa Ebook{' '}
          <strong className="text-[var(--theme-text-primary)]">{deleteConfirmation.item?.title}</strong>
          {' '}vĩnh viễn không?
        </p>
        <p className="mt-2 text-sm text-rose-400">Hành động này không thể hoàn tác.</p>
      </ConfirmationModal>
    </div>
  );
};

export default App;
