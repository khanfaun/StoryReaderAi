
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import type { Story, Chapter, ReadingSettings, CharacterStats } from '../types';
import ChapterListModal from './ChapterListModal';
import SettingsPanel from './SettingsPanel';
import EntityTooltip from './EntityTooltip';
import { ListIcon, EditIcon, SparklesIcon, SpinnerIcon, PlusIcon, PlayIcon, PauseIcon, StopIcon, CloseIcon, BarsIcon, CogIcon, SlidersIcon, BackwardStepIcon, ForwardStepIcon, VolumeHighIcon, UserIcon, ClipboardIcon, BookmarkIcon, BookmarkSlashIcon, EyeIcon, EyeSlashIcon, CheckIcon } from './icons';
import type { EntityType } from './EntityEditModal';

type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'ready';

interface ChapterContentProps {
  story: Story;
  currentChapterIndex: number;
  content: string;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectChapter: (chapter: Chapter) => void;
  readChapters: Set<string>;
  settings: ReadingSettings;
  onSettingsChange: (settings: ReadingSettings) => void;
  onNavBarVisibilityChange: (isVisible: boolean) => void;
  cumulativeStats: CharacterStats | null;
  onStatsChange: (newStats: CharacterStats) => void;
  onContentUpdate?: (newContent: string) => void;
  onRewrite?: () => Promise<void>;
  onCreateChapter?: (story: Story, title: string, content: string) => Promise<void>;
  isBusy?: boolean;
  isAnalyzing?: boolean;
  
  // TTS Props
  onTtsRequest: () => void;
  onTtsStop: () => void;
  onTtsStatusChange: (newStatus: TtsStatus) => void;
  onTtsChunkChange: (newIndex: number) => void;
  ttsStatus: TtsStatus;
  ttsError: string | null;
  ttsTextChunks: string[];
  ttsCurrentChunkIndex: number;
  availableSystemVoices: SpeechSynthesisVoice[];
  
  // Stats Toggle passed from Parent
  onToggleChat?: () => void; 
  onToggleStats?: () => void;

  // Reading Position Restoration
  initialScrollPercentage?: number;
  initialParagraphIndex?: number; // Deprecated, kept for compat
  onSavePosition?: (percentage: number, paragraphIndex: number) => void;

  // Header Handlers 
  onOpenApiKeySettings: () => void;
  onOpenUpdateModal: () => void;
  onOpenSyncModal: () => void;
  onGoHome: () => void;
  
  // Search
  onSearch: (query: string) => void;
  isSearchLoading: boolean;
  onOpenHelpModal: () => void;

  // Bookmark
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  
  // Layout Props
  pcLayout?: 'default' | 'stacked-left' | 'stacked-right' | 'minimal';

  // Modal Trigger from Parent
  onOpenAddChapterModal?: () => void;

  // Header Visibility State
  isMainHeaderVisible?: boolean;

  // Panel Open State (for Back button logic)
  isPanelOpen?: boolean;

  // NEW: Manual Add Entity Trigger
  onAddEntity?: (type: EntityType, name: string) => void;
}

// Helper format thời gian mm:ss
const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Ước tính thời gian dựa trên số ký tự (giả sử tốc độ 1x ~ 20 ký tự/giây cho tiếng Việt)
const CHAR_PER_SEC = 20;

// Mapping buttons for Quick Add Menu - Unified Style
const QUICK_ADD_OPTIONS: { label: string; type: EntityType }[] = [
    { label: 'NPC', type: 'npcs' },
    { label: 'Vật Phẩm', type: 'balo' },
    { label: 'Công Pháp', type: 'congPhap' },
    { label: 'Cảnh Giới', type: 'heThongCanhGioi' },
    { label: 'Thế Lực', type: 'theLuc' },
    { label: 'Địa Điểm', type: 'diaDiem' },
    { label: 'Quan Hệ', type: 'quanHe' },
    { label: 'Tư Chất', type: 'tuChat' },
    { label: 'Trang Bị', type: 'trangBi' },
];

const ChapterContent: React.FC<ChapterContentProps> = ({ 
    story, currentChapterIndex, content, onBack, onPrev, onNext, onSelectChapter, 
    readChapters, settings, onSettingsChange, onNavBarVisibilityChange, 
    cumulativeStats, onStatsChange, onContentUpdate, onRewrite, onCreateChapter,
    isBusy = false, isAnalyzing = false,
    onTtsRequest, onTtsStop, onTtsStatusChange, onTtsChunkChange,
    ttsStatus, ttsError, ttsTextChunks, ttsCurrentChunkIndex, availableSystemVoices,
    onToggleChat, onToggleStats,
    initialScrollPercentage = 0,
    onSavePosition,
    onOpenApiKeySettings, onOpenUpdateModal, onOpenSyncModal, onGoHome,
    onSearch, isSearchLoading, onOpenHelpModal,
    isBookmarked, onToggleBookmark,
    pcLayout = 'default',
    onOpenAddChapterModal,
    isMainHeaderVisible = true,
    isPanelOpen = false,
    onAddEntity
}) => {
  const [isListVisible, setIsListVisible] = useState(false);
  const [isNavBarVisible, setIsNavBarVisible] = useState(true);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  // TTS Setup Modal State
  const [isTtsSetupVisible, setIsTtsSetupVisible] = useState(false);
  
  const [isAudioPlayerVisible, setIsAudioPlayerVisible] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false); // Playlist UI toggle
  const [isTtsSettingsOpen, setIsTtsSettingsOpen] = useState(false); // TTS Settings UI toggle

  const activeChunkRef = useRef<HTMLDivElement>(null); // Ref to scroll to active highlighted text (TTS)
  const activeWordRef = useRef<HTMLSpanElement>(null); // Ref to scroll to the specific word
  const contentAreaRef = useRef<HTMLDivElement>(null);
  
  // Flag to distinguish between user scroll and TTS auto-scroll
  const programmaticScrollRef = useRef(false);
  
  // Edit Content State
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editableContent, setEditableContent] = useState(content);
  const [isRewriting, setIsRewriting] = useState(false);
  
  // State cho chức năng tự động cuộn
  const [popoverTarget, setPopoverTarget] = useState<'top' | 'bottom' | null>(null);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(1);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const scrollIntervalRef = useRef<number | null>(null);
  const autoScrollButtonRefTop = useRef<HTMLDivElement>(null);
  const autoScrollButtonRefBottom = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // TTS Progress State
  const [ttsProgress, setTtsProgress] = useState(0); // 0 - 100 (Global progress)
  const [ttsCurrentTime, setTtsCurrentTime] = useState(0); // seconds
  const [ttsDuration, setTtsDuration] = useState(0); // seconds
  
  // Karaoke State: Tracks the specific word being spoken within the current chunk
  const [currentWordRange, setCurrentWordRange] = useState<{start: number, end: number} | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const globalCharIndexRef = useRef(0); // Tracks the absolute character position across all chunks
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Debounce scroll event
  
  // Ref để theo dõi giá trị cuộn hiện tại realtime (dùng cho cleanup)
  // FIX: Khởi tạo bằng initialScrollPercentage để nếu người dùng không cuộn tí nào mà thoát ra, vẫn lưu đúng vị trí cũ
  const latestScrollPercentRef = useRef(initialScrollPercentage);

  // Ref để lưu lại layout trước đó khi chuyển sang chế độ tập trung
  const lastNonMinimalLayoutRef = useRef<ReadingSettings['pcLayout']>('default');

  // Text Selection State
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  // Cập nhật ref khi prop thay đổi (phòng trường hợp component không remount nhưng prop đổi)
  useEffect(() => {
      latestScrollPercentRef.current = initialScrollPercentage;
  }, [initialScrollPercentage]);

  // Precompute chunk metadata: Start index, End index, Length for each chunk
  // This allows mapping global progress to specific chunk + offset
  const chunkMetadata = useMemo(() => {
      let cumulativeLength = 0;
      return ttsTextChunks.map((text, index) => {
          const start = cumulativeLength;
          const length = text.length;
          cumulativeLength += length;
          return { index, start, length, end: cumulativeLength, text };
      });
  }, [ttsTextChunks]);

  const totalChars = chunkMetadata.length > 0 ? chunkMetadata[chunkMetadata.length - 1].end : 0;

  // Toggle Helpers (Mutually Exclusive)
  const togglePlaylist = useCallback(() => {
      if (!isPlaylistOpen) setIsTtsSettingsOpen(false); // Close settings if opening playlist
      setIsPlaylistOpen(prev => !prev);
  }, [isPlaylistOpen]);

  const toggleTtsSettings = useCallback(() => {
      if (!isTtsSettingsOpen) setIsPlaylistOpen(false); // Close playlist if opening settings
      setIsTtsSettingsOpen(prev => !prev);
  }, [isTtsSettingsOpen]);


  useEffect(() => {
    onNavBarVisibilityChange(isNavBarVisible);
  }, [isNavBarVisible, onNavBarVisibilityChange]);

  useEffect(() => {
      setEditableContent(content);
      setIsEditingContent(false);
      setSelectionMenu(null); // Clear selection menu on content change
  }, [content]);

  // Handle Manual Scroll Restoration Control
  useEffect(() => {
      if ('scrollRestoration' in window.history) {
          window.history.scrollRestoration = 'manual';
      }
      return () => {
          if ('scrollRestoration' in window.history) {
              window.history.scrollRestoration = 'auto';
          }
      };
  }, []);

  // Handle Text Selection
  useEffect(() => {
      // 1. Logic mở menu (chỉ khi kết thúc chọn)
      const handleSelectionEnd = () => {
          if (isEditingContent) return; 

          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
              setSelectionMenu(null);
              return;
          }

          const text = selection.toString().trim();
          if (text.length === 0 || text.length > 200) { 
              setSelectionMenu(null);
              return;
          }

          // Check if selection is inside content area
          if (contentAreaRef.current && !contentAreaRef.current.contains(selection.anchorNode)) {
              return;
          }

          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          setSelectionMenu({
              x: rect.left + rect.width / 2,
              y: rect.top - 10, // Base Position, offset handled in render
              text: text
          });
      };

      // 2. Logic đóng menu (ngay khi bỏ chọn)
      const handleSelectionChange = () => {
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed) {
              setSelectionMenu(null);
          }
      };

      document.addEventListener('mouseup', handleSelectionEnd);
      document.addEventListener('touchend', handleSelectionEnd);
      document.addEventListener('selectionchange', handleSelectionChange);

      return () => {
          document.removeEventListener('mouseup', handleSelectionEnd);
          document.removeEventListener('touchend', handleSelectionEnd);
          document.removeEventListener('selectionchange', handleSelectionChange);
      };
  }, [isEditingContent]);

  // Clear selection menu on scroll (to avoid floating issues)
  useEffect(() => {
      const handleScroll = () => {
          if (selectionMenu) setSelectionMenu(null);
      };
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
  }, [selectionMenu]);


  // --- LOGIC KHÔI PHỤC VỊ TRÍ ĐỌC (RESTORE) ---
  // Sử dụng useLayoutEffect để chạy ngay sau khi DOM cập nhật
  useLayoutEffect(() => {
      // Nếu không có nội dung hoặc không có vị trí cần khôi phục thì scroll về 0
      if (!content) return;

      const performRestore = () => {
          if (initialScrollPercentage > 0) {
              const scrollHeight = document.documentElement.scrollHeight;
              const clientHeight = window.innerHeight;
              
              if (scrollHeight > clientHeight) {
                  // Tính toán vị trí pixel: Phần trăm * Chiều cao thực tế
                  // Trừ đi một chút (ví dụ 100px hoặc 10%) để người dùng có ngữ cảnh
                  const targetScroll = initialScrollPercentage * (scrollHeight - clientHeight);
                  
                  // Chỉ cuộn nếu sự khác biệt đáng kể (tránh rung lắc nhỏ)
                  if (Math.abs(window.scrollY - targetScroll) > 5) {
                      window.scrollTo({ top: targetScroll, behavior: 'auto' }); 
                      // Cập nhật lại ref ngay khi restore xong để đảm bảo đồng bộ
                      latestScrollPercentRef.current = initialScrollPercentage;
                  }
              }
          } else {
              window.scrollTo(0, 0);
          }
      };

      // Thử khôi phục ngay lập tức
      performRestore();

      // Thử lại một lần nữa sau 50ms và 100ms để chắc chắn layout đã ổn định
      const timer1 = setTimeout(performRestore, 50);
      const timer2 = setTimeout(performRestore, 200);

      return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
      };
  }, [content, initialScrollPercentage]); // Chạy lại khi nội dung chương hoặc % thay đổi

  // --- LOGIC LƯU VỊ TRÍ ĐỌC (SAVE) ---
  useEffect(() => {
      const handleScroll = () => {
          const scrollTop = window.scrollY;
          const scrollHeight = document.documentElement.scrollHeight;
          const clientHeight = window.innerHeight;
          
          let scrollPercentage = 0;
          if (scrollHeight > clientHeight) {
              scrollPercentage = scrollTop / (scrollHeight - clientHeight);
          }
          
          // Kẹp giá trị trong khoảng 0 đến 1
          const safePercentage = Math.min(Math.max(scrollPercentage, 0), 1);
          
          // Cập nhật ref để dùng cho cleanup (Unmount)
          latestScrollPercentRef.current = safePercentage;

          // Debounce việc lưu xuống DB
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
              if (onSavePosition) {
                  onSavePosition(safePercentage, 0);
              }
          }, 500);
      };

      window.addEventListener('scroll', handleScroll);
      return () => {
          window.removeEventListener('scroll', handleScroll);
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          
          // QUAN TRỌNG: Lưu ngay lập tức giá trị cuối cùng khi component bị hủy (Back/Next)
          // Điều này giải quyết vấn đề người dùng cuộn rồi bấm Back ngay (chưa hết 500ms)
          if (onSavePosition) {
              // Lưu giá trị hiện tại trong ref (đã được init bằng giá trị cũ hoặc cập nhật khi scroll)
              onSavePosition(latestScrollPercentRef.current, 0);
          }
      };
  }, [onSavePosition]);


  // Reset progress when chapter changes (content changes)
  useEffect(() => {
      setTtsProgress(0);
      setTtsCurrentTime(0);
      setCurrentWordRange(null);
      globalCharIndexRef.current = 0;
      if (totalChars > 0) {
          setTtsDuration(totalChars / (CHAR_PER_SEC * settings.ttsSettings.playbackRate));
      }
  }, [totalChars, settings.ttsSettings.playbackRate, content]);

  // Sync globalCharIndexRef when ttsCurrentChunkIndex changes from outside (e.g. Next/Prev button)
  useEffect(() => {
      const chunk = chunkMetadata[ttsCurrentChunkIndex];
      if (chunk) {
          setCurrentWordRange(null); // Reset word highlight on chunk change
          // If our global tracker is outside the current chunk bounds, reset it to the start of the chunk
          // This handles manual skipping via buttons
          if (globalCharIndexRef.current < chunk.start || globalCharIndexRef.current >= chunk.end) {
              globalCharIndexRef.current = chunk.start;
              // Update UI immediately
              setTtsProgress((chunk.start / totalChars) * 100);
              setTtsCurrentTime(chunk.start / (CHAR_PER_SEC * settings.ttsSettings.playbackRate));
          }
      }
  }, [ttsCurrentChunkIndex, chunkMetadata, totalChars, settings.ttsSettings.playbackRate]);

  // TTS Auto-Scroll Effect
  useEffect(() => {
      if (ttsStatus === 'playing') {
          const target = activeWordRef.current || activeChunkRef.current;
          if (target) {
              programmaticScrollRef.current = true;
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => { programmaticScrollRef.current = false; }, 1000);
          }
      }
  }, [ttsCurrentChunkIndex, ttsStatus, currentWordRange]);


  // --- CORE TTS LOGIC ---
  useEffect(() => {
    const synth = window.speechSynthesis;
    const currentChunk = chunkMetadata[ttsCurrentChunkIndex];

    if (ttsStatus === 'idle' || ttsStatus === 'error' || !currentChunk) {
        if (synth.speaking || synth.paused) synth.cancel();
        return;
    }

    if (ttsStatus === 'paused') {
        synth.cancel(); 
        return;
    }

    if (ttsStatus === 'playing') {
        let offset = globalCharIndexRef.current - currentChunk.start;
        if (offset < 0) offset = 0;
        if (offset >= currentChunk.length) {
             if (ttsCurrentChunkIndex < ttsTextChunks.length - 1) {
                 onTtsChunkChange(ttsCurrentChunkIndex + 1);
             } else {
                 onTtsStop();
             }
             return;
        }

        const textToSpeak = currentChunk.text.slice(offset);
        synth.cancel(); 

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utteranceRef.current = utterance;

        const selectedVoice = availableSystemVoices.find(v => v.voiceURI === settings.ttsSettings.voice);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        utterance.rate = settings.ttsSettings.playbackRate;
        utterance.volume = settings.ttsSettings.volume;

        const baseGlobalIndex = currentChunk.start + offset;

        utterance.onboundary = (event) => {
            const localCharIndex = offset + event.charIndex;
            const currentGlobalIndex = baseGlobalIndex + event.charIndex;
            globalCharIndexRef.current = currentGlobalIndex;
            
            const remainingTextInChunk = currentChunk.text.slice(localCharIndex);
            const match = remainingTextInChunk.match(/^([^\s]+)/); // Simple word match
            const wordLength = match ? match[0].length : 1;
            
            setCurrentWordRange({ start: localCharIndex, end: localCharIndex + wordLength });

            if (totalChars > 0) {
                const progress = Math.min((currentGlobalIndex / totalChars) * 100, 100);
                setTtsProgress(progress);
                setTtsCurrentTime(currentGlobalIndex / (CHAR_PER_SEC * settings.ttsSettings.playbackRate));
            }
        };

        utterance.onend = () => {
            const remainingInChunk = currentChunk.end - globalCharIndexRef.current;
            if (remainingInChunk < 20 || textToSpeak.length < 20) {
                 if (ttsCurrentChunkIndex < ttsTextChunks.length - 1) {
                     const nextChunkStart = chunkMetadata[ttsCurrentChunkIndex + 1].start;
                     globalCharIndexRef.current = nextChunkStart;
                     onTtsChunkChange(ttsCurrentChunkIndex + 1);
                 } else {
                     onTtsStop(); 
                 }
            }
        };

        utterance.onerror = (event) => {
            if (event.error === 'interrupted' || event.error === 'canceled') return;
            onTtsStatusChange('error');
        };

        synth.speak(utterance);
    }
    return () => {};
  }, [ttsStatus, ttsCurrentChunkIndex, ttsTextChunks, settings.ttsSettings, availableSystemVoices, onTtsChunkChange, onTtsStatusChange, onTtsStop, chunkMetadata, totalChars]);


  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newProgress = parseFloat(e.target.value);
      setTtsProgress(newProgress);
      
      if (totalChars === 0) return;

      const targetGlobalCharIndex = Math.floor((newProgress / 100) * totalChars);
      globalCharIndexRef.current = targetGlobalCharIndex;
      setTtsCurrentTime(targetGlobalCharIndex / (CHAR_PER_SEC * settings.ttsSettings.playbackRate));

      const newChunkIndex = chunkMetadata.findIndex(chunk => targetGlobalCharIndex >= chunk.start && targetGlobalCharIndex < chunk.end);
      
      if (newChunkIndex !== -1) {
          if (newChunkIndex !== ttsCurrentChunkIndex) {
              onTtsChunkChange(newChunkIndex);
          } else {
              if (ttsStatus === 'playing') {
                  window.speechSynthesis.cancel();
                  onTtsStatusChange('paused');
                  setTimeout(() => onTtsStatusChange('playing'), 50);
              }
          }
      }
  };
  
  const handleTtsSettingChange = <K extends keyof ReadingSettings['ttsSettings']>(key: K, value: ReadingSettings['ttsSettings'][K]) => {
      onSettingsChange({
          ...settings,
          ttsSettings: { ...settings.ttsSettings, [key]: value },
      });
      
      if (key === 'volume' && utteranceRef.current) utteranceRef.current.volume = value as number;

      if (ttsStatus === 'playing' && key !== 'volume') {
          window.speechSynthesis.cancel();
          onTtsStatusChange('paused');
          setTimeout(() => onTtsStatusChange('playing'), 100);
      }
  };

  const handleJumpToChunk = (index: number) => {
      const chunk = chunkMetadata[index];
      if (chunk) {
          globalCharIndexRef.current = chunk.start;
          setTtsProgress((chunk.start / totalChars) * 100);
          setTtsCurrentTime(chunk.start / (CHAR_PER_SEC * settings.ttsSettings.playbackRate));
          onTtsChunkChange(index);
          if (ttsStatus !== 'playing') {
              onTtsStatusChange('playing');
          }
      }
  };

  const chapterTitle = story.chapters?.[currentChapterIndex]?.title ?? 'Đang tải...';
  const isFirstChapter = currentChapterIndex === 0;
  const isLastChapter = !story.chapters || currentChapterIndex === story.chapters.length - 1;
  
  // Auto scroll logic (simplified)
  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
        cancelAnimationFrame(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
    }
    setIsAutoScrolling(false);
    setIsNavBarVisible(true);
  }, []);
  
  const startAutoScroll = useCallback(() => {
    setPopoverTarget(null);
    if (autoScrollSpeed === 0) { stopAutoScroll(); return; }
    setIsNavBarVisible(false);
    setIsAutoScrolling(true);
    let frameCount = 0;
    const framesToSkip = 11 - autoScrollSpeed;
    const scrollStep = () => {
      frameCount++;
      if (frameCount >= framesToSkip) {
        window.scrollBy(0, 1);
        frameCount = 0;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        stopAutoScroll();
      } else {
        scrollIntervalRef.current = requestAnimationFrame(scrollStep);
      }
    };
    if (scrollIntervalRef.current) cancelAnimationFrame(scrollIntervalRef.current);
    scrollIntervalRef.current = requestAnimationFrame(scrollStep);
  }, [autoScrollSpeed, stopAutoScroll]);
  
  useEffect(() => {
    const handleManualScroll = () => { if (isAutoScrolling) stopAutoScroll(); };
    window.addEventListener('wheel', handleManualScroll);
    window.addEventListener('touchstart', handleManualScroll);
    return () => {
      window.removeEventListener('wheel', handleManualScroll);
      window.removeEventListener('touchstart', handleManualScroll);
    };
  }, [isAutoScrolling, stopAutoScroll]);
  
  useEffect(() => { return () => { stopAutoScroll(); }; }, [currentChapterIndex, stopAutoScroll]);
  
  const handleChapterSelectAndClose = (chapter: Chapter) => {
    if (isBusy && !isAnalyzing) return;
    onSelectChapter(chapter);
    setIsListVisible(false);
  };

  const handleAutoScrollButtonClick = (target: 'top' | 'bottom') => {
      if (isAutoScrolling) stopAutoScroll();
      else setPopoverTarget(prev => (prev === target ? null : target));
  };

  const handleSaveContent = () => {
      if (onContentUpdate) onContentUpdate(editableContent);
      setIsEditingContent(false);
  };

  const handleCancelEdit = () => {
      setEditableContent(content);
      setIsEditingContent(false);
  };
  
  const handleAiRewriteClick = async () => {
      if (onRewrite) {
          setIsRewriting(true);
          try { await onRewrite(); } finally { setIsRewriting(false); }
      }
  };
  
  // Logic to toggle focus mode (Minimal Layout)
  const handleToggleFocusMode = () => {
      if (settings.pcLayout === 'minimal') {
          // Restore previous layout
          onSettingsChange({
              ...settings,
              pcLayout: lastNonMinimalLayoutRef.current || 'default'
          });
      } else {
          // Save current layout and switch to minimal
          lastNonMinimalLayoutRef.current = settings.pcLayout;
          onSettingsChange({
              ...settings,
              pcLayout: 'minimal'
          });
      }
  };
  
  const handleTtsButtonClick = () => {
      if (isAudioPlayerVisible) {
          onTtsStop();
          setIsAudioPlayerVisible(false);
          setIsTtsSettingsOpen(false); // Close settings if player closes
          return;
      }
      if (settings.ttsSettings.showTtsSetupOnPlay) {
          setIsTtsSetupVisible(true);
      } else {
          setIsAudioPlayerVisible(true);
          if (ttsStatus === 'idle' || ttsStatus === 'error') {
              onTtsRequest();
          }
      }
  };

  const handleConfirmTtsSetup = () => {
      setIsTtsSetupVisible(false);
      setIsAudioPlayerVisible(true);
      onTtsRequest();
  };

  // Logic Copy to Clipboard
  const handleCopyContent = () => {
      navigator.clipboard.writeText(content).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
      });
  };

  // Logic Nút Back (Header): Nếu panel đang mở thì đóng panel, ngược lại thì back
  const handleHeaderBack = () => {
      if (isPanelOpen && onToggleStats) {
          onToggleStats();
      } else {
          onBack();
      }
  };

  // Handle Quick Add Entity from Menu
  const handleQuickAdd = (type: EntityType) => {
      if (onAddEntity && selectionMenu) {
          onAddEntity(type, selectionMenu.text);
          setSelectionMenu(null); // Close menu after action
          // Clear selection from browser
          window.getSelection()?.removeAllRanges();
      }
  };

  const entityMapData = useMemo(() => {
    if (!cumulativeStats) return { map: new Map(), regex: null };
    const map = new Map<string, any>();
    const allNames: string[] = [];
    const addEntity = (entity: any) => {
        if (entity && entity.ten && typeof entity.ten === 'string' && entity.ten.trim().length > 1) {
            const trimmedName = entity.ten.trim();
            if (!map.has(trimmedName.toLowerCase())) {
                map.set(trimmedName.toLowerCase(), entity);
                allNames.push(trimmedName);
            }
        }
    };
    const addEntities = (arr: any[] | undefined) => { if (arr) arr.forEach(addEntity); };

    if (cumulativeStats.trangThai?.ten) addEntity({ ten: cumulativeStats.trangThai.ten, moTa: `Nhân vật chính. Cảnh giới: ${cumulativeStats.canhGioi || 'Chưa rõ'}` });
    addEntities(cumulativeStats.trangThai?.tuChat);
    addEntities(cumulativeStats.balo);
    addEntities(cumulativeStats.congPhap);
    addEntities(cumulativeStats.trangBi);
    addEntities(cumulativeStats.npcs);
    addEntities(cumulativeStats.theLuc);
    addEntities(cumulativeStats.diaDiem);
    
    if (allNames.length === 0) return { map, regex: null };
    allNames.sort((a, b) => b.length - a.length);
    const escapedNames = allNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedNames.join('|')})`, 'gi');
    return { map, regex };
  }, [cumulativeStats]);
  
  const renderContentWithTooltips = useCallback((text: string, forcePlainText = false) => {
    if (forcePlainText) {
        return text.split('\n').map((paragraph, index) => (
            <p key={index} className="mb-4 break-words">{paragraph}</p>
        ));
    }

    const { map, regex } = entityMapData;
    if (!regex || map.size === 0) {
        return text.split('\n').map((paragraph, index) => (
            <p key={index} className="mb-4 break-words">{paragraph}</p>
        ));
    }
    return text.split('\n').map((paragraph, pIndex) => {
        if (!paragraph.trim()) return <p key={pIndex} className="mb-4" />;
        const parts = paragraph.split(regex);
        return (
            <p key={pIndex} className="mb-4 break-words">
                {parts.map((part, index) => {
                    if (index % 2 === 1) { 
                        const entity = map.get(part.toLowerCase());
                        if (entity) {
                            return (
                                <EntityTooltip key={index} entity={entity}>
                                    {part}
                                </EntityTooltip>
                            );
                        }
                    }
                    return <React.Fragment key={index}>{part}</React.Fragment>;
                })}
            </p>
        );
    });
  }, [entityMapData]);

  const renderKaraokeChunk = (text: string) => {
      if (!currentWordRange) {
          return <p className="mb-4 break-words whitespace-pre-wrap">{text}</p>;
      }
      const { start, end } = currentWordRange;
      const passedText = text.slice(0, start);
      const activeWord = text.slice(start, end);
      const remainingText = text.slice(end);

      return (
          <div className="mb-4 break-words whitespace-pre-wrap">
              <span>{passedText}</span>
              <span ref={activeWordRef} style={{ color: settings.highlightColor }} className="transition-colors duration-100 font-medium">
                  {activeWord}
              </span>
              <span>{remainingText}</span>
          </div>
      );
  };

  const autoScrollPopover = (
    <div 
      className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center animate-fade-in" 
      onClick={() => setPopoverTarget(null)}
    >
      <div
        ref={popoverRef}
        onClick={e => e.stopPropagation()}
        className="w-64 bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl p-4 animate-fade-in-up"
      >
        <label htmlFor="scrollSpeed" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
          Tốc độ cuộn: <span className="font-bold text-[var(--theme-accent-primary)]">{autoScrollSpeed}</span>
        </label>
        <input
          id="scrollSpeed"
          type="range"
          min="0"
          max="10"
          value={autoScrollSpeed}
          onChange={e => setAutoScrollSpeed(parseInt(e.target.value, 10))}
          className="w-full h-2 bg-[var(--theme-text-primary)]/20 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
        />
        <button 
          onClick={startAutoScroll}
          className="w-full mt-4 bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300"
        >
          {autoScrollSpeed === 0 ? 'Dừng cuộn' : 'Bắt đầu cuộn'}
        </button>
      </div>
    </div>
  );

  const navButtons = (target: 'top' | 'bottom') => {
    // 1. TOP NAV
    if (target === 'top') return null;

    // 2. BOTTOM NAV - AUDIO PLAYER
    if (isAudioPlayerVisible) {
        const handleFooterPlayPause = () => {
            if (ttsStatus === 'playing') onTtsStatusChange('paused');
            else if (ttsStatus === 'paused' || ttsStatus === 'ready') onTtsStatusChange('playing');
            else if (ttsStatus === 'idle' || ttsStatus === 'error') onTtsRequest();
        };

        const handleClosePlayer = () => {
            onTtsStop();
            setIsAudioPlayerVisible(false);
            setIsTtsSettingsOpen(false);
        };

        return (
            <div className="container mx-auto px-2 flex flex-col lg:flex-row justify-between items-center gap-2">
                <div className="flex items-center gap-1 sm:gap-2 w-full lg:w-auto justify-center lg:justify-start">
                    <div className="lg:hidden flex gap-1">
                        <button onClick={() => setIsSettingsVisible(true)} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300" title="Cài đặt"><CogIcon className="w-6 h-6" /></button>
                    </div>
                    <button onClick={onPrev} disabled={isFirstChapter} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 rounded-lg transition-all duration-300 disabled:opacity-50"><span className="md:hidden"><BackwardStepIcon className="w-6 h-6" /></span><span className="hidden md:inline">Trước</span></button>
                    <button onClick={() => setIsListVisible(true)} className="flex-shrink-0 bg-[var(--theme-text-primary)] text-[var(--theme-bg-surface)] hover:brightness-90 font-bold p-2 rounded-lg transition-all duration-300"><ListIcon className="h-6 w-6" /></button>
                    <button onClick={onNext} disabled={isLastChapter} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 rounded-lg transition-all duration-300 disabled:opacity-50"><span className="md:hidden"><ForwardStepIcon className="w-6 h-6" /></span><span className="hidden md:inline">Sau</span></button>
                    <button onClick={onToggleStats} disabled={isBusy && !isAnalyzing} className="lg:hidden flex-shrink-0 text-white font-bold p-2 rounded-lg transition-all duration-300 disabled:opacity-50 border" style={{ backgroundColor: '#8170ff', borderColor: '#8170ff' }}><UserIcon className="h-6 w-6" /></button>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center bg-transparent rounded-none px-0 py-0 border-none shadow-none mx-0 max-w-full w-full relative">
                    {/* Audio Controls & Sliders ... (Reduced for brevity, same as before) */}
                    <div className="w-full flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-[var(--theme-text-secondary)] min-w-[35px] text-right font-mono">{formatTime(ttsCurrentTime)}</span>
                        <input type="range" min="0" max="100" step="0.1" value={ttsProgress} onChange={handleSeek} className="w-full h-1 bg-[var(--theme-text-primary)]/20 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"/>
                        <span className="text-[10px] text-[var(--theme-text-secondary)] min-w-[35px] font-mono">{formatTime(ttsDuration)}</span>
                    </div>
                    <div className="w-full flex items-center justify-between gap-2 md:justify-center md:gap-4">
                        <button onClick={togglePlaylist} className={`p-2 rounded-full transition-colors ${isPlaylistOpen ? 'text-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                        <div className="flex items-center gap-2 sm:gap-4">
                            <button onClick={() => onTtsChunkChange(ttsCurrentChunkIndex - 1)} disabled={ttsCurrentChunkIndex === 0} className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] disabled:opacity-30 rounded-full hover:bg-[var(--theme-bg-base)]"><BackwardStepIcon className="w-6 h-6" /></button>
                            <button onClick={handleFooterPlayPause} className="w-10 h-10 flex items-center justify-center bg-[var(--theme-accent-primary)] hover:brightness-110 text-white rounded-full transition-transform hover:scale-105 shadow-md" disabled={ttsStatus === 'loading'}>{ttsStatus === 'loading' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : (ttsStatus === 'playing' ? <PauseIcon className="w-5 h-5"/> : <PlayIcon className="w-5 h-5 ml-0.5"/>)}</button>
                            <button onClick={() => onTtsChunkChange(ttsCurrentChunkIndex + 1)} disabled={ttsCurrentChunkIndex >= ttsTextChunks.length - 1} className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] disabled:opacity-30 rounded-full hover:bg-[var(--theme-bg-base)]"><ForwardStepIcon className="w-6 h-6" /></button>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={toggleTtsSettings} className={`p-2 rounded-full transition-colors ${isTtsSettingsOpen ? 'text-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'}`}><SlidersIcon className="w-5 h-5" /></button>
                            <button onClick={handleClosePlayer} className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors"><CloseIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                </div>
                <div className="hidden lg:block"><button onClick={() => setIsSettingsVisible(true)} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300"><CogIcon className="w-6 h-6" /></button></div>
            </div>
        );
    }

    // 3. BOTTOM NAV (Default)
    return (
        <div className="container mx-auto px-2 flex justify-center items-center gap-1 sm:gap-2">
          <button onClick={() => setIsSettingsVisible(true)} disabled={isBusy && !isAnalyzing} className="flex-shrink-0 lg:hidden bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300 disabled:opacity-50"><CogIcon className="w-6 h-6" /></button>
          <button onClick={onPrev} disabled={isFirstChapter || (isBusy && !isAnalyzing)} className="whitespace-nowrap bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg transition-all duration-300 disabled:opacity-50"><span className="md:hidden"><BackwardStepIcon className="w-6 h-6" /></span><span className="hidden md:inline">Chương trước</span></button>
          <button onClick={() => setIsListVisible(true)} disabled={isBusy && !isAnalyzing} className="flex-shrink-0 bg-[var(--theme-text-primary)] text-[var(--theme-bg-surface)] hover:brightness-90 font-bold p-2 rounded-lg transition-all duration-300 disabled:opacity-50"><ListIcon className="h-6 w-6" /></button>
          <button onClick={onNext} disabled={isLastChapter || (isBusy && !isAnalyzing)} className="whitespace-nowrap bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg transition-all duration-300 disabled:opacity-50"><span className="md:hidden"><ForwardStepIcon className="w-6 h-6" /></span><span className="hidden md:inline">Chương sau</span></button>
          
          {/* Toggle Stats Button: Hidden on LG unless in 'minimal' layout */}
          <button onClick={onToggleStats} disabled={isBusy && !isAnalyzing} className={`flex-shrink-0 text-white font-bold p-2 rounded-lg transition-all duration-300 disabled:opacity-50 border ${pcLayout === 'minimal' ? '' : 'lg:hidden'}`} style={{ backgroundColor: '#8170ff', borderColor: '#8170ff' }}><UserIcon className="h-6 w-6" /></button>
          
          <div className="hidden md:flex items-center gap-2 pl-2 sm:pl-3">
             <button onClick={handleTtsButtonClick} className={`flex-shrink-0 p-2 rounded-lg transition-colors duration-200 bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] disabled:opacity-50`} disabled={isRewriting}>{ttsStatus === 'loading' ? <SpinnerIcon className="h-6 w-6 animate-spin" /> : <PlayIcon className="h-6 w-6" />}</button>
          </div>
          <div ref={autoScrollButtonRefBottom} className="relative flex-shrink-0 pl-2 sm:pl-3 hidden md:block">
            <button onClick={() => handleAutoScrollButtonClick('bottom')} className={`p-2 rounded-lg transition-all duration-300 ${isAutoScrolling ? 'bg-[var(--theme-accent-primary)] text-white' : 'bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)]'}`}>{isAutoScrolling ? <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" /></svg>}</button>
          </div>
           <button onClick={() => setIsSettingsVisible(true)} disabled={isBusy && !isAnalyzing} className="flex-shrink-0 hidden lg:block bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300 disabled:opacity-50"><CogIcon className="w-6 h-6" /></button>
        </div>
      );
    };

  return (
    <div className="flex flex-col min-h-screen">
      {/* --- CHAPTER HEADER (FIXED BELOW MAIN HEADER) --- */}
      {/* Dynamic top position based on Main Header visibility */}
      <div className={`fixed left-0 right-0 z-[100] h-16 bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border)] shadow-lg flex items-center justify-between px-4 transition-all duration-300 ${isMainHeaderVisible ? 'top-16' : 'top-0'}`}>
          <button onClick={handleHeaderBack} disabled={isBusy && !isAnalyzing} className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)] rounded-full transition-colors disabled:opacity-50"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button>
          <div className="flex-1 text-center px-4 overflow-hidden"><h2 className="text-sm font-bold text-[var(--theme-text-primary)] truncate">{story.title}</h2><p className="text-xs text-[var(--theme-text-secondary)] truncate">{story.chapters?.[currentChapterIndex]?.title ?? 'Đang tải...'}</p></div>
          <div className="flex items-center gap-1">
              <button onClick={onToggleBookmark} className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-primary)] hover:bg-[var(--theme-border)] rounded-full transition-colors">{isBookmarked ? <BookmarkIcon className="h-6 w-6 text-[var(--theme-accent-primary)]" /> : <BookmarkSlashIcon className="h-6 w-6" />}</button>
              
              {/* Copy Button with Tick Animation */}
              <button 
                onClick={handleCopyContent} 
                className={`p-2 rounded-full transition-all duration-300 ${copySuccess ? 'text-green-500 bg-green-500/10' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)]'}`}
                title={copySuccess ? 'Đã sao chép' : 'Sao chép nội dung'}
              >
                  {copySuccess ? <CheckIcon className="h-6 w-6" /> : <ClipboardIcon className="h-6 w-6" />}
              </button>

              {onContentUpdate && !isEditingContent && <button onClick={() => setIsEditingContent(true)} disabled={isBusy && !isAnalyzing} className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-primary)] hover:bg-[var(--theme-border)] rounded-full transition-colors disabled:opacity-50"><EditIcon className="w-6 h-6" /></button>}
              
              {/* FOCUS MODE TOGGLE BUTTON - HIDDEN ON MOBILE (md:block) */}
              <button 
                  onClick={handleToggleFocusMode}
                  className={`hidden md:block p-2 rounded-full transition-colors ${settings.pcLayout === 'minimal' ? 'text-[var(--theme-accent-primary)] hover:brightness-110' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)]'}`}
                  title={settings.pcLayout === 'minimal' ? "Hiện các bảng dữ liệu" : "Ẩn các bảng dữ liệu (Chế độ tập trung)"}
              >
                  {settings.pcLayout === 'minimal' ? <EyeSlashIcon className="w-6 h-6" /> : <EyeIcon className="w-6 h-6" />}
              </button>

              {onOpenAddChapterModal && <button onClick={onOpenAddChapterModal} disabled={isBusy && !isAnalyzing} className="p-2 text-[var(--theme-text-secondary)] hover:text-green-500 hover:bg-[var(--theme-border)] rounded-full transition-colors disabled:opacity-50"><PlusIcon className="w-6 h-6" /></button>}
          </div>
      </div>

      {/* Main Content Area - Added top margin to compensate for fixed headers (Main Header + Chapter Header usually) */}
      {/* Dynamic top margin: 36 (~144px, 64+64+padding) when both headers visible, 20 (~80px, 64+padding) when only sub-header */}
      {/* UPDATE: Reduced padding on lg (p-6) to save space, increased on xl (p-12) */}
      <div 
        ref={contentAreaRef}
        className={`flex-grow bg-[var(--theme-bg-base)] rounded-lg shadow-xl p-4 sm:p-8 lg:p-6 xl:p-12 w-full animate-fade-in border border-[var(--theme-border)] pb-24 mx-auto max-w-screen-xl transition-all duration-300 ${isMainHeaderVisible ? 'mt-36' : 'mt-20'}`}
      >
        {ttsError && isAudioPlayerVisible && <div className="my-2 p-2 bg-rose-900/50 text-rose-300 text-center rounded text-sm border border-rose-700">Lỗi Audio: {ttsError}</div>}
        {isEditingContent ? (
            <div className="mt-6">
                <div className="flex justify-between items-center mb-2"><h3 className="text-lg font-semibold text-[var(--theme-text-primary)]">Chỉnh sửa nội dung</h3>{onRewrite && <button onClick={handleAiRewriteClick} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-bold py-1.5 px-3 rounded-lg transition-colors duration-300 disabled:opacity-50" disabled={isRewriting}>{isRewriting ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}<span>AI Viết lại</span></button>}</div>
                <textarea value={editableContent} onChange={(e) => setEditableContent(e.target.value)} className="w-full h-[60vh] p-4 rounded-md bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] border border-[var(--theme-border)] focus:ring-2 focus:ring-[var(--theme-accent-primary)] focus:outline-none" style={{ fontSize: 'var(--reader-font-size)', fontFamily: 'var(--reader-font-family)' }}/>
                <div className="flex justify-end gap-4 mt-4"><button onClick={handleCancelEdit} className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 font-bold">Hủy</button><button onClick={handleSaveContent} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 font-bold">Lưu thay đổi</button></div>
            </div>
        ) : (
            <div className="prose max-w-none text-justify mt-6 break-words whitespace-pre-wrap overflow-hidden" style={{ minHeight: '50vh', color: 'var(--reader-text)', fontSize: 'var(--reader-font-size)', fontFamily: 'var(--reader-font-family)', lineHeight: 1.8 }}>
                <div className="flex justify-between items-start mb-6 border-b border-[var(--theme-border)] pb-2 opacity-60 hover:opacity-100 transition-opacity"><h2 className="text-2xl sm:text-3xl font-bold text-[var(--reader-title)]">{chapterTitle}</h2></div>
                {ttsStatus !== 'idle' && ttsTextChunks.length > 0 ? (
                    ttsTextChunks.map((chunk, index) => {
                        const isActive = index === ttsCurrentChunkIndex;
                        return (
                            <div key={index} ref={isActive ? activeChunkRef : null} className={`transition-all duration-300 my-2 ${!isActive ? 'hover:bg-[var(--theme-text-secondary)]/5' : ''}`}>
                                {isActive ? renderKaraokeChunk(chunk) : renderContentWithTooltips(chunk)}
                            </div>
                        );
                    })
                ) : (
                    renderContentWithTooltips(content)
                )}
            </div>
        )}
      </div>
      
      {/* QUICK ADD ENTITY FLOATING MENU */}
      {selectionMenu && (
          <div 
            className="fixed z-[200] bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-2 animate-fade-in-up flex flex-col gap-2 min-w-[200px]"
            style={{ 
                left: Math.min(window.innerWidth - 220, Math.max(10, selectionMenu.x - 100)), // Clamp to screen
                // Modified: Increased offset from 120 to 160 to push it higher above text
                top: Math.max(70, selectionMenu.y - 160), 
            }}
            onMouseDown={e => e.preventDefault()} // Prevent losing selection focus immediately
          >
              <div className="text-[10px] text-[var(--theme-text-secondary)] uppercase font-bold text-center border-b border-[var(--theme-border)] pb-1 mb-1 truncate px-2">
                  Thêm "{selectionMenu.text.length > 15 ? selectionMenu.text.substring(0, 15) + '...' : selectionMenu.text}" vào:
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                  {QUICK_ADD_OPTIONS.map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => handleQuickAdd(opt.type)}
                        className="text-[10px] py-1.5 px-1 rounded border bg-[var(--theme-bg-base)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-accent-primary)] hover:text-[var(--theme-accent-primary)] transition-colors font-medium text-center"
                      >
                          {opt.label}
                      </button>
                  ))}
              </div>
          </div>
      )}

      {/* Popovers ... (Same as previous) */}
      {isAudioPlayerVisible && isPlaylistOpen && (
        <div className="fixed bottom-24 left-4 right-4 md:bottom-28 md:left-1/2 md:-translate-x-1/2 md:w-96 md:max-w-none bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl overflow-y-auto z-[100] p-2 animate-fade-in-up max-h-[50vh]">
            <div className="flex justify-between items-center mb-2 px-1 border-b border-[var(--theme-border)] pb-1"><span className="text-xs font-bold text-[var(--theme-text-primary)]">Danh sách phát ({chunkMetadata.length} đoạn)</span><button onClick={() => setIsPlaylistOpen(false)} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"><CloseIcon className="w-4 h-4"/></button></div>
            <ul className="space-y-1">{chunkMetadata.map((chunk) => (<li key={chunk.index}><button onClick={() => handleJumpToChunk(chunk.index)} className={`w-full text-left text-xs p-2 rounded flex items-center gap-2 transition-colors ${chunk.index === ttsCurrentChunkIndex ? 'bg-[var(--theme-accent-primary)] text-white' : 'hover:bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)]'}`}>{chunk.index === ttsCurrentChunkIndex && ttsStatus === 'playing' && <SpinnerIcon className="w-3 h-3 animate-spin"/>}<span className="font-mono opacity-50">#{chunk.index + 1}</span><span className="truncate">{chunk.text.substring(0, 40)}...</span></button></li>))}</ul>
        </div>
      )}
      {isAudioPlayerVisible && isTtsSettingsOpen && (
        <div className="fixed bottom-24 left-4 right-4 md:bottom-28 md:left-1/2 md:-translate-x-1/2 md:w-64 md:max-w-none bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl p-3 z-[100] animate-fade-in-up">
            <div className="flex justify-between items-center mb-3"><span className="text-xs font-bold text-[var(--theme-text-primary)]">Cấu hình giọng đọc</span><button onClick={() => setIsTtsSettingsOpen(false)} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"><CloseIcon className="w-4 h-4"/></button></div>
            <div className="space-y-3"><div><label className="block text-[10px] text-[var(--theme-text-secondary)] mb-1">Giọng đọc</label><select value={settings.ttsSettings.voice} onChange={e => handleTtsSettingChange('voice', e.target.value)} className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded p-1 text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent-primary)]"><option value="">Mặc định</option>{availableSystemVoices.map(voice => (<option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>))}</select></div><div><div className="flex justify-between text-[10px] text-[var(--theme-text-secondary)] mb-1"><span>Tốc độ</span><span>{settings.ttsSettings.playbackRate}x</span></div><input type="range" min="0.5" max="2.0" step="0.1" value={settings.ttsSettings.playbackRate} onChange={e => handleTtsSettingChange('playbackRate', parseFloat(e.target.value))} className="w-full h-1 bg-[var(--theme-text-primary)]/20 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"/></div></div>
        </div>
      )}
      {popoverTarget && autoScrollPopover}
      <div className={`fixed bottom-0 left-0 right-0 z-40 py-4 bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border)] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] transition-transform duration-300 ${isNavBarVisible ? 'translate-y-0' : 'translate-y-full'}`}>{navButtons('bottom')}</div>
      <ChapterListModal isOpen={isListVisible} onClose={() => setIsListVisible(false)} chapters={story.chapters ?? []} currentChapterUrl={story.chapters?.[currentChapterIndex]?.url} onSelectChapter={handleChapterSelectAndClose} readChapters={readChapters} />
      <SettingsPanel isOpen={isSettingsVisible} onClose={() => setIsSettingsVisible(false)} settings={settings} onSettingsChange={onSettingsChange} availableSystemVoices={availableSystemVoices} mode="default" onToggleTts={handleTtsButtonClick} onToggleAutoScroll={(target) => handleAutoScrollButtonClick(target)} isTtsActive={ttsStatus === 'playing' || ttsStatus === 'paused' || isAudioPlayerVisible} isAutoScrollActive={isAutoScrolling} />
      <SettingsPanel isOpen={isTtsSetupVisible} onClose={() => setIsTtsSetupVisible(false)} settings={settings} onSettingsChange={onSettingsChange} availableSystemVoices={availableSystemVoices} mode="tts-setup" onConfirmTts={handleConfirmTtsSetup} />
    </div>
  );
};

export default ChapterContent;
