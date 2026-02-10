
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import type { Story, Chapter, ReadingSettings, CharacterStats } from '../types';
import ChapterListModal from './ChapterListModal';
import ChapterEditModal from './ChapterEditModal';
import SettingsPanel from './SettingsPanel';
import EntityTooltip from './EntityTooltip';
import { ListIcon, EditIcon, SparklesIcon, SpinnerIcon, PlusIcon, PlayIcon, PauseIcon, StopIcon, CloseIcon, BarsIcon, CogIcon, SlidersIcon, BackwardStepIcon, ForwardStepIcon, VolumeHighIcon, UserIcon, ClipboardIcon, BookmarkIcon, BookmarkSlashIcon } from './icons';

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
  onToggleChat?: () => void; // Keep for compatibility if needed, but unused in UI
  onToggleStats?: () => void;

  // Scroll Restoration
  initialScrollPercentage?: number;
  onScrollProgress?: (percentage: number) => void;

  // Header Props
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

// Helper format thời gian mm:ss
const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Ước tính thời gian dựa trên số ký tự (giả sử tốc độ 1x ~ 20 ký tự/giây cho tiếng Việt)
const CHAR_PER_SEC = 20;

const ChapterContent: React.FC<ChapterContentProps> = ({ 
    story, currentChapterIndex, content, onBack, onPrev, onNext, onSelectChapter, 
    readChapters, settings, onSettingsChange, onNavBarVisibilityChange, 
    cumulativeStats, onStatsChange, onContentUpdate, onRewrite, onCreateChapter,
    isBusy = false, isAnalyzing = false,
    onTtsRequest, onTtsStop, onTtsStatusChange, onTtsChunkChange,
    ttsStatus, ttsError, ttsTextChunks, ttsCurrentChunkIndex, availableSystemVoices,
    onToggleChat, onToggleStats,
    initialScrollPercentage = 0,
    onScrollProgress,
    isBookmarked,
    onToggleBookmark
}) => {
  const [isListVisible, setIsListVisible] = useState(false);
  const [isNavBarVisible, setIsNavBarVisible] = useState(true);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  // TTS Setup Modal State
  const [isTtsSetupVisible, setIsTtsSetupVisible] = useState(false);
  
  const [isAudioPlayerVisible, setIsAudioPlayerVisible] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false); // Playlist UI toggle
  const [isTtsSettingsOpen, setIsTtsSettingsOpen] = useState(false); // TTS Settings UI toggle

  const lastScrollY = useRef(0);
  const activeChunkRef = useRef<HTMLDivElement>(null); // Ref to scroll to active highlighted text
  const activeWordRef = useRef<HTMLSpanElement>(null); // Ref to scroll to the specific word
  
  // Flag to distinguish between user scroll and TTS auto-scroll
  const programmaticScrollRef = useRef(false);

  // Edit Content State
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editableContent, setEditableContent] = useState(content);
  const [isRewriting, setIsRewriting] = useState(false);
  
  // Add Chapter State
  const [isAddChapterModalOpen, setIsAddChapterModalOpen] = useState(false);

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
  }, [content]);

  // Restore Scroll Position Logic
  useLayoutEffect(() => {
      // Only restore if we have content and an initial percentage > 0
      if (content && initialScrollPercentage > 0) {
          const scrollHeight = document.documentElement.scrollHeight;
          const clientHeight = document.documentElement.clientHeight;
          const targetScroll = initialScrollPercentage * (scrollHeight - clientHeight);
          
          window.scrollTo({
              top: targetScroll,
              behavior: 'auto' // Instant jump to avoid disorientation
          });
      } else if (content) {
          // New chapter loaded without history (or explicitly reset), scroll to top
          window.scrollTo(0,0);
      }
  }, [content, initialScrollPercentage]);

  // Track Scroll Progress
  useEffect(() => {
      const handleScroll = () => {
          if (scrollTimeoutRef.current) {
              clearTimeout(scrollTimeoutRef.current);
          }

          scrollTimeoutRef.current = setTimeout(() => {
              const scrollTop = window.scrollY;
              const docHeight = document.documentElement.scrollHeight;
              const winHeight = window.innerHeight;
              const scrollPercent = scrollTop / (docHeight - winHeight);
              
              if (onScrollProgress && !isNaN(scrollPercent)) {
                  onScrollProgress(Math.min(Math.max(scrollPercent, 0), 1));
              }
          }, 500); // Debounce 500ms
      };

      window.addEventListener('scroll', handleScroll);
      return () => {
          window.removeEventListener('scroll', handleScroll);
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      };
  }, [onScrollProgress]);


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

  // TTS Auto-Scroll Effect: Scroll to highlighted chunk OR word
  useEffect(() => {
      if (ttsStatus === 'playing') {
          // Priority: Scroll to active word if available, otherwise active chunk
          const target = activeWordRef.current || activeChunkRef.current;
          if (target) {
              programmaticScrollRef.current = true;
              target.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center', 
              });
              // Reset the programmatic flag after enough time for smooth scroll to complete
              setTimeout(() => {
                  programmaticScrollRef.current = false;
              }, 1000);
          }
      }
  }, [ttsCurrentChunkIndex, ttsStatus, currentWordRange]); // Trigger when word range changes


  // --- CORE TTS LOGIC ---
  useEffect(() => {
    const synth = window.speechSynthesis;
    const currentChunk = chunkMetadata[ttsCurrentChunkIndex];

    // 1. Cleanup / Stop conditions
    if (ttsStatus === 'idle' || ttsStatus === 'error' || !currentChunk) {
        if (synth.speaking || synth.paused) {
            synth.cancel();
        }
        return;
    }

    // 2. Pause
    if (ttsStatus === 'paused') {
        // We use CANCEL instead of PAUSE to avoid browser bugs.
        // We rely on globalCharIndexRef to resume correctly.
        synth.cancel(); 
        return;
    }

    // 3. Playing
    if (ttsStatus === 'playing') {
        // Calculate where to start within the current chunk
        // offset = current global pos - chunk start pos
        let offset = globalCharIndexRef.current - currentChunk.start;
        
        // Safety check: offset shouldn't be negative
        if (offset < 0) offset = 0;
        // Safety check: if offset is at end of chunk, move to next
        if (offset >= currentChunk.length) {
             if (ttsCurrentChunkIndex < ttsTextChunks.length - 1) {
                 onTtsChunkChange(ttsCurrentChunkIndex + 1);
             } else {
                 onTtsStop();
             }
             return;
        }

        // SLICING TEXT: This is the key to "Smart Resume"
        // Instead of resume(), we speak a new utterance starting from the sliced text.
        const textToSpeak = currentChunk.text.slice(offset);
        
        // Cancel any existing speech before starting new one
        synth.cancel(); 

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utteranceRef.current = utterance;

        const selectedVoice = availableSystemVoices.find(v => v.voiceURI === settings.ttsSettings.voice);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        utterance.rate = settings.ttsSettings.playbackRate;
        utterance.volume = settings.ttsSettings.volume;

        // Base progress: The global position where this utterance started
        const baseGlobalIndex = currentChunk.start + offset;

        utterance.onboundary = (event) => {
            // event.charIndex is relative to the *textToSpeak* (sliced text)
            // Actual local index (in chunk) = offset + event.charIndex
            const localCharIndex = offset + event.charIndex;
            
            // Actual global index = Base start + event charIndex
            const currentGlobalIndex = baseGlobalIndex + event.charIndex;
            globalCharIndexRef.current = currentGlobalIndex;
            
            // --- KARAOKE LOGIC ---
            // Determine word boundary. Browser often gives start index but length varies.
            // We find the next space/punctuation to estimate length.
            const remainingTextInChunk = currentChunk.text.slice(localCharIndex);
            // Match until next space or non-word character or end of string
            const match = remainingTextInChunk.match(/^([^\s]+)/); // Simple word match
            const wordLength = match ? match[0].length : 1;
            
            setCurrentWordRange({
                start: localCharIndex,
                end: localCharIndex + wordLength
            });

            // Update UI Progress
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
                     onTtsStop(); // Finished story
                 }
            }
        };

        utterance.onerror = (event) => {
            if (event.error === 'interrupted' || event.error === 'canceled') return;
            console.error('TTS Error:', event);
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

      // 1. Calculate target Global Character Index
      const targetGlobalCharIndex = Math.floor((newProgress / 100) * totalChars);
      globalCharIndexRef.current = targetGlobalCharIndex;
      
      // Update time display
      setTtsCurrentTime(targetGlobalCharIndex / (CHAR_PER_SEC * settings.ttsSettings.playbackRate));

      // 2. Find which chunk this index belongs to
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
          ttsSettings: {
              ...settings.ttsSettings,
              [key]: value,
          },
      });
      
      // Update live utterance if possible or needed
      if (key === 'volume' && utteranceRef.current) {
          // Note: dynamic volume update depends on browser. Chrome mostly ignores it mid-utterance.
          // But we set it here for good measure.
          utteranceRef.current.volume = value as number;
      }

      // Nếu đang play mà đổi giọng/tốc độ (volume often works dynamically, but let's be safe), cần reload utterance
      // We skip reload for volume to avoid stutter if user slides it
      if (ttsStatus === 'playing' && key !== 'volume') {
          window.speechSynthesis.cancel();
          onTtsStatusChange('paused');
          setTimeout(() => onTtsStatusChange('playing'), 100);
      }
  };

  // Handle click on specific playlist item
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
  
  // ... (Auto scroll logic omitted for brevity - same as before) ...
  // Keeping original auto scroll logic
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
  
  const handleConfirmAddChapter = async (title: string, newContent: string) => {
      if (onCreateChapter) await onCreateChapter(story, title, newContent);
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

  const handleCopyContent = () => {
      navigator.clipboard.writeText(content).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
      }, (err) => {
          console.error('Could not copy text: ', err);
      });
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
    // If forcing plain text (for active karaoke mode to prevent nesting issues)
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

  // Special renderer for the ACTIVE chunk during TTS (Karaoke Mode)
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
              {/* Passed Text: Standard */}
              <span>{passedText}</span>
              
              {/* Active Word: Highlighted Color Only */}
              <span 
                ref={activeWordRef}
                style={{ 
                    color: settings.highlightColor, 
                }}
                className="transition-colors duration-100 font-medium"
              >
                  {activeWord}
              </span>
              
              {/* Remaining Text: Standard */}
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
    // 1. TOP NAV - Removed old layout, now using Fixed Header
    if (target === 'top') {
        return null; // Top buttons are now in the fixed header
    }

    // 2. BOTTOM NAV - AUDIO PLAYER ACTIVE
    if (isAudioPlayerVisible) {
        const handleFooterPlayPause = () => {
            if (ttsStatus === 'playing') onTtsStatusChange('paused');
            else if (ttsStatus === 'paused' || ttsStatus === 'ready') onTtsStatusChange('playing');
            else if (ttsStatus === 'idle' || ttsStatus === 'error') {
                onTtsRequest();
            }
        };

        const handleClosePlayer = () => {
            onTtsStop();
            setIsAudioPlayerVisible(false);
            setIsTtsSettingsOpen(false);
        };

        return (
            <div className="container mx-auto px-2 flex flex-col xl:flex-row justify-between items-center gap-2">
                <div className="flex items-center gap-1 sm:gap-2 w-full xl:w-auto justify-center xl:justify-start">
                    {/* Settings Button (Mobile Left - Audio Mode) */}
                    <div className="xl:hidden flex gap-1">
                        <button onClick={() => setIsSettingsVisible(true)} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300" title="Cài đặt">
                            <CogIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <button onClick={onPrev} disabled={isFirstChapter} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 rounded-lg transition-all duration-300 disabled:opacity-50" title="Chương trước">
                        <span className="md:hidden"><BackwardStepIcon className="w-6 h-6" /></span>
                        <span className="hidden md:inline">Trước</span>
                    </button>
                    <button onClick={() => setIsListVisible(true)} className="flex-shrink-0 bg-[var(--theme-text-primary)] text-[var(--theme-bg-surface)] hover:brightness-90 font-bold p-2 rounded-lg transition-all duration-300" title="Danh sách chương">
                        <ListIcon className="h-6 w-6" />
                    </button>
                    <button onClick={onNext} disabled={isLastChapter} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 rounded-lg transition-all duration-300 disabled:opacity-50" title="Chương sau">
                        <span className="md:hidden"><ForwardStepIcon className="w-6 h-6" /></span>
                        <span className="hidden md:inline">Sau</span>
                    </button>

                    {/* User/Stats Button (Mobile Only - Added for Audio Mode - Moved to Right of Next) */}
                    <button 
                        onClick={onToggleStats} 
                        disabled={isBusy && !isAnalyzing}
                        className="xl:hidden flex-shrink-0 text-white font-bold p-2 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border" 
                        style={{ backgroundColor: '#8170ff', borderColor: '#8170ff' }}
                        aria-label="Thông tin nhân vật"
                    >
                        <UserIcon className="h-6 w-6" />
                    </button>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center bg-transparent rounded-none px-0 py-0 border-none shadow-none mx-0 max-w-full w-full relative">
                    
                    {/* Popovers ... */}
                    {isAudioPlayerVisible && isPlaylistOpen && (
                        <div className="fixed bottom-24 left-4 right-4 md:bottom-28 md:left-1/2 md:-translate-x-1/2 md:w-96 md:max-w-none bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl overflow-y-auto z-[100] p-2 animate-fade-in-up max-h-[50vh]">
                            <div className="flex justify-between items-center mb-2 px-1 border-b border-[var(--theme-border)] pb-1">
                                <span className="text-xs font-bold text-[var(--theme-text-primary)]">Danh sách phát ({chunkMetadata.length} đoạn)</span>
                                <button onClick={() => setIsPlaylistOpen(false)} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"><CloseIcon className="w-4 h-4"/></button>
                            </div>
                            <ul className="space-y-1">
                                {chunkMetadata.map((chunk) => (
                                    <li key={chunk.index}>
                                        <button 
                                            onClick={() => handleJumpToChunk(chunk.index)}
                                            className={`w-full text-left text-xs p-2 rounded flex items-center gap-2 transition-colors ${chunk.index === ttsCurrentChunkIndex ? 'bg-[var(--theme-accent-primary)] text-white' : 'hover:bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)]'}`}
                                        >
                                            {chunk.index === ttsCurrentChunkIndex && ttsStatus === 'playing' && <SpinnerIcon className="w-3 h-3 animate-spin"/>}
                                            <span className="font-mono opacity-50">#{chunk.index + 1}</span>
                                            <span className="truncate">{chunk.text.substring(0, 40)}...</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {isAudioPlayerVisible && isTtsSettingsOpen && (
                        <div className="fixed bottom-24 left-4 right-4 md:bottom-28 md:left-1/2 md:-translate-x-1/2 md:w-64 md:max-w-none bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl p-3 z-[100] animate-fade-in-up">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs font-bold text-[var(--theme-text-primary)]">Cấu hình giọng đọc</span>
                                <button onClick={() => setIsTtsSettingsOpen(false)} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"><CloseIcon className="w-4 h-4"/></button>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] text-[var(--theme-text-secondary)] mb-1">Giọng đọc</label>
                                    <select
                                        value={settings.ttsSettings.voice}
                                        onChange={e => handleTtsSettingChange('voice', e.target.value)}
                                        className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded p-1 text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent-primary)]"
                                    >
                                        <option value="">Mặc định</option>
                                        {availableSystemVoices.map(voice => (
                                            <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] text-[var(--theme-text-secondary)] mb-1">
                                        <span>Tốc độ</span>
                                        <span>{settings.ttsSettings.playbackRate}x</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.0"
                                        step="0.1"
                                        value={settings.ttsSettings.playbackRate}
                                        onChange={e => handleTtsSettingChange('playbackRate', parseFloat(e.target.value))}
                                        className="w-full h-1 bg-[var(--theme-text-primary)]/20 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="w-full flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-[var(--theme-text-secondary)] min-w-[35px] text-right font-mono">{formatTime(ttsCurrentTime)}</span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={ttsProgress}
                            onChange={handleSeek}
                            className="w-full h-1 bg-[var(--theme-text-primary)]/20 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)] hover:accent-[var(--theme-accent-primary)]"
                        />
                        <span className="text-[10px] text-[var(--theme-text-secondary)] min-w-[35px] font-mono">{formatTime(ttsDuration)}</span>
                    </div>

                    <div className="w-full flex items-center justify-between gap-2 md:justify-center md:gap-4">
                        <div className="flex items-center">
                             <button 
                                onClick={togglePlaylist}
                                className={`p-2 rounded-full transition-colors ${isPlaylistOpen ? 'text-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-base)]'}`}
                                title="Danh sách phát"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4">
                            <button 
                                onClick={() => onTtsChunkChange(ttsCurrentChunkIndex - 1)} 
                                disabled={ttsCurrentChunkIndex === 0} 
                                className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] disabled:opacity-30 rounded-full hover:bg-[var(--theme-bg-base)]"
                                title="Đoạn trước"
                            >
                                <BackwardStepIcon className="w-6 h-6" />
                            </button>
                            
                            <button 
                                onClick={handleFooterPlayPause} 
                                className="w-10 h-10 flex items-center justify-center bg-[var(--theme-accent-primary)] hover:brightness-110 text-white rounded-full transition-transform hover:scale-105 shadow-md"
                                disabled={ttsStatus === 'loading'}
                            >
                                {ttsStatus === 'loading' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : (ttsStatus === 'playing' ? <PauseIcon className="w-5 h-5"/> : <PlayIcon className="w-5 h-5 ml-0.5"/>)}
                            </button>

                            <button 
                                onClick={() => onTtsChunkChange(ttsCurrentChunkIndex + 1)} 
                                disabled={ttsCurrentChunkIndex >= ttsTextChunks.length - 1} 
                                className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] disabled:opacity-30 rounded-full hover:bg-[var(--theme-bg-base)]"
                                title="Đoạn sau"
                            >
                                <ForwardStepIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex items-center gap-1">
                            <div className="items-center gap-2 group mr-1 hidden sm:flex">
                                <VolumeHighIcon className="w-4 h-4 text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text-primary)]" />
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={settings.ttsSettings.volume}
                                    onChange={e => handleTtsSettingChange('volume', parseFloat(e.target.value))}
                                    className="w-16 h-1 bg-[var(--theme-text-primary)]/20 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
                                    title={`Âm lượng: ${Math.round(settings.ttsSettings.volume * 100)}%`}
                                />
                            </div>

                            <button 
                                onClick={toggleTtsSettings}
                                className={`p-2 rounded-full transition-colors ${isTtsSettingsOpen ? 'text-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-base)]'}`}
                                title="Cấu hình giọng đọc"
                            >
                                <SlidersIcon className="w-5 h-5" />
                            </button>

                            <button 
                                onClick={handleClosePlayer} 
                                className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-base)] transition-colors"
                                title="Đóng trình phát"
                            >
                                <CloseIcon className="w-5 h-5"/>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="hidden xl:block">
                    <button onClick={() => setIsSettingsVisible(true)} className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300" title="Cài đặt">
                        <CogIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>
        );
    }

    // 3. BOTTOM NAV (Default)
    return (
        <div className="container mx-auto px-2 flex justify-center items-center gap-1 sm:gap-2">
          {/* Settings Button (Mobile Only - Left side) */}
          <button 
            onClick={() => setIsSettingsVisible(true)} 
            disabled={isBusy && !isAnalyzing}
            className="flex-shrink-0 xl:hidden bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CogIcon className="w-6 h-6" />
          </button>

          {/* Previous Button - Icon only on mobile */}
          <button 
            onClick={onPrev} 
            disabled={isFirstChapter || (isBusy && !isAnalyzing)} 
            className="whitespace-nowrap bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="md:hidden"><BackwardStepIcon className="w-6 h-6" /></span>
            <span className="hidden md:inline">Chương trước</span>
          </button>

          <button 
            onClick={() => setIsListVisible(true)} 
            disabled={isBusy && !isAnalyzing}
            className="flex-shrink-0 bg-[var(--theme-text-primary)] text-[var(--theme-bg-surface)] hover:brightness-90 font-bold p-2 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed" 
            aria-label="Danh sách chương"
          >
            <ListIcon className="h-6 w-6" />
          </button>

          {/* Next Button - Icon only on mobile */}
          <button 
            onClick={onNext} 
            disabled={isLastChapter || (isBusy && !isAnalyzing)} 
            className="whitespace-nowrap bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="md:hidden"><ForwardStepIcon className="w-6 h-6" /></span>
            <span className="hidden md:inline">Chương sau</span>
          </button>

          {/* User/Stats Button (Mobile Only) - Updated Color #8170ff */}
          <button 
            onClick={onToggleStats} 
            disabled={isBusy && !isAnalyzing}
            className="flex-shrink-0 xl:hidden text-white font-bold p-2 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border" 
            style={{ backgroundColor: '#8170ff', borderColor: '#8170ff' }}
            aria-label="Thông tin nhân vật"
          >
            <UserIcon className="h-6 w-6" />
          </button>

          {/* Tools Area - Only visible on Tablet/PC (md:flex), hidden on Mobile */}
          <div className="hidden md:flex items-center gap-2 pl-2 sm:pl-3">
             <button
                onClick={handleTtsButtonClick}
                className={`flex-shrink-0 text-white p-2 rounded-lg transition-colors duration-200 bg-[var(--theme-accent-primary)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Mở/đóng trình phát âm thanh"
                disabled={isRewriting}
            >
                {ttsStatus === 'loading' ? <SpinnerIcon className="h-6 w-6 animate-spin" /> : <PlayIcon className="h-6 w-6" />}
            </button>
          </div>
          <div ref={autoScrollButtonRefBottom} className="relative flex-shrink-0 pl-2 sm:pl-3 hidden md:block">
            <button 
                onClick={() => handleAutoScrollButtonClick('bottom')} 
                className={`p-2 rounded-lg transition-all duration-300 ${isAutoScrolling ? 'bg-[var(--theme-accent-primary)] text-white' : 'bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)]'}`}
                aria-label={isAutoScrolling ? "Dừng cuộn" : "Bắt đầu cuộn tự động"}
                >
                {isAutoScrolling ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                    </svg>
                )}
            </button>
          </div>
           {/* Settings Button (Desktop Only - Right side) */}
           <button 
            onClick={() => setIsSettingsVisible(true)} 
            disabled={isBusy && !isAnalyzing}
            className="flex-shrink-0 hidden xl:block bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] p-2 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CogIcon className="w-6 h-6" />
          </button>
        </div>
      );
    };

  return (
    <>
      {/* --- NEW STICKY HEADER --- */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-16 bg-[var(--theme-bg-surface)]/95 backdrop-blur border-b border-[var(--theme-border)] shadow-md flex items-center justify-between px-4 transition-transform duration-300 transform translate-y-0">
          {/* Left: Back Button */}
          <button 
              onClick={onBack} 
              disabled={isBusy && !isAnalyzing}
              className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)] rounded-full transition-colors disabled:opacity-50"
              title="Quay lại"
          >
              <span className="sr-only">Quay lại</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
          </button>

          {/* Center: Title */}
          <div className="flex-1 text-center px-4 overflow-hidden">
              <h2 className="text-sm font-bold text-[var(--theme-text-primary)] truncate">{story.title}</h2>
              <p className="text-xs text-[var(--theme-text-secondary)] truncate">{chapterTitle}</p>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
              {/* Nút Sửa nội dung (Chỉ hiện khi có quyền sửa và chưa ở chế độ sửa) */}
              {onContentUpdate && !isEditingContent && (
                  <button
                      onClick={() => setIsEditingContent(true)}
                      disabled={isBusy && !isAnalyzing}
                      className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-primary)] hover:bg-[var(--theme-border)] rounded-full transition-colors disabled:opacity-50"
                      title="Sửa nội dung"
                  >
                      <EditIcon className="w-6 h-6" />
                  </button>
              )}

              {/* Nút Thêm chương (Chỉ hiện khi có quyền thêm) */}
              {onCreateChapter && (
                  <button
                      onClick={() => setIsAddChapterModalOpen(true)}
                      disabled={isBusy && !isAnalyzing}
                      className="p-2 text-[var(--theme-text-secondary)] hover:text-green-500 hover:bg-[var(--theme-border)] rounded-full transition-colors disabled:opacity-50"
                      title="Thêm chương mới"
                  >
                      <PlusIcon className="w-6 h-6" />
                  </button>
              )}

              <button 
                  onClick={onToggleBookmark}
                  className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-primary)] hover:bg-[var(--theme-border)] rounded-full transition-colors"
                  title={isBookmarked ? "Bỏ đánh dấu đọc tiếp" : "Đánh dấu đọc tiếp"}
              >
                  {isBookmarked ? <BookmarkIcon className="h-6 w-6 text-[var(--theme-accent-primary)]" /> : <BookmarkSlashIcon className="h-6 w-6" />}
              </button>
              
              <button 
                  onClick={() => {
                      navigator.clipboard.writeText(content).then(() => {
                          setCopySuccess(true);
                          setTimeout(() => setCopySuccess(false), 2000);
                      });
                  }}
                  className="p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)] rounded-full transition-colors relative"
                  title="Sao chép nội dung chương"
              >
                  <ClipboardIcon className="h-6 w-6" />
                  {copySuccess && (
                      <span className="absolute top-10 right-0 bg-green-600 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-fade-in whitespace-nowrap">
                          Đã chép!
                      </span>
                  )}
              </button>
          </div>
      </div>

      <div className="bg-[var(--theme-bg-base)] rounded-lg shadow-xl p-4 sm:p-8 lg:p-12 w-full animate-fade-in border border-[var(--theme-border)] pb-24 mt-20">
        
        {ttsError && isAudioPlayerVisible && (
             <div className="my-2 p-2 bg-rose-900/50 text-rose-300 text-center rounded text-sm border border-rose-700">
                 Lỗi Audio: {ttsError}
             </div>
        )}

        {isEditingContent ? (
            <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-[var(--theme-text-primary)]">Chỉnh sửa nội dung</h3>
                    {onRewrite && (
                        <button
                            onClick={handleAiRewriteClick}
                            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-bold py-1.5 px-3 rounded-lg transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isRewriting}
                            title="Dùng AI viết lại/dịch lại cho dễ hiểu"
                        >
                            {isRewriting ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                            <span>AI Viết lại</span>
                        </button>
                    )}
                </div>
                <textarea
                    value={editableContent}
                    onChange={(e) => setEditableContent(e.target.value)}
                    className="w-full h-[60vh] p-4 rounded-md bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] border border-[var(--theme-border)] focus:ring-2 focus:ring-[var(--theme-accent-primary)] focus:outline-none"
                    style={{ 
                        fontSize: 'var(--reader-font-size)',
                        fontFamily: 'var(--reader-font-family)',
                    }}
                />
                <div className="flex justify-end gap-4 mt-4">
                    <button onClick={handleCancelEdit} className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 font-bold">Hủy</button>
                    <button onClick={handleSaveContent} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 font-bold">Lưu thay đổi</button>
                </div>
            </div>
        ) : (
            <div
            className="prose max-w-none text-justify mt-6 break-words whitespace-pre-wrap overflow-hidden"
            style={{ 
                minHeight: '50vh', 
                color: 'var(--reader-text)', 
                fontSize: 'var(--reader-font-size)',
                fontFamily: 'var(--reader-font-family)',
                lineHeight: 1.8,
            }}
            >
                <div className="flex justify-between items-start mb-6 border-b border-[var(--theme-border)] pb-2 opacity-60 hover:opacity-100 transition-opacity">
                    <h2 className="text-2xl sm:text-3xl font-bold text-[var(--reader-title)]">{chapterTitle}</h2>
                    {/* Các nút Sửa/Thêm đã được di chuyển lên Header */}
                </div>

            {ttsStatus !== 'idle' && ttsTextChunks.length > 0 ? (
                ttsTextChunks.map((chunk, index) => {
                    const isActive = index === ttsCurrentChunkIndex;
                    
                    return (
                        <div
                            key={index}
                            ref={isActive ? activeChunkRef : null}
                            className={`transition-all duration-300 my-2 ${!isActive ? 'hover:bg-[var(--theme-text-secondary)]/5' : ''}`}
                        >
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
      
      {/* Popovers rendered here to escape bottom nav stacking context */}
      {isAudioPlayerVisible && isPlaylistOpen && (
        <div className="fixed bottom-24 left-4 right-4 md:bottom-28 md:left-1/2 md:-translate-x-1/2 md:w-96 md:max-w-none bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl overflow-y-auto z-[100] p-2 animate-fade-in-up max-h-[50vh]">
            <div className="flex justify-between items-center mb-2 px-1 border-b border-[var(--theme-border)] pb-1">
                <span className="text-xs font-bold text-[var(--theme-text-primary)]">Danh sách phát ({chunkMetadata.length} đoạn)</span>
                <button onClick={() => setIsPlaylistOpen(false)} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"><CloseIcon className="w-4 h-4"/></button>
            </div>
            <ul className="space-y-1">
                {chunkMetadata.map((chunk) => (
                    <li key={chunk.index}>
                        <button 
                            onClick={() => handleJumpToChunk(chunk.index)}
                            className={`w-full text-left text-xs p-2 rounded flex items-center gap-2 transition-colors ${chunk.index === ttsCurrentChunkIndex ? 'bg-[var(--theme-accent-primary)] text-white' : 'hover:bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)]'}`}
                        >
                            {chunk.index === ttsCurrentChunkIndex && ttsStatus === 'playing' && <SpinnerIcon className="w-3 h-3 animate-spin"/>}
                            <span className="font-mono opacity-50">#{chunk.index + 1}</span>
                            <span className="truncate">{chunk.text.substring(0, 40)}...</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
      )}

      {isAudioPlayerVisible && isTtsSettingsOpen && (
        <div className="fixed bottom-24 left-4 right-4 md:bottom-28 md:left-1/2 md:-translate-x-1/2 md:w-64 md:max-w-none bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl p-3 z-[100] animate-fade-in-up">
            <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-[var(--theme-text-primary)]">Cấu hình giọng đọc</span>
                <button onClick={() => setIsTtsSettingsOpen(false)} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"><CloseIcon className="w-4 h-4"/></button>
            </div>
            <div className="space-y-3">
                <div>
                    <label className="block text-[10px] text-[var(--theme-text-secondary)] mb-1">Giọng đọc</label>
                    <select
                        value={settings.ttsSettings.voice}
                        onChange={e => handleTtsSettingChange('voice', e.target.value)}
                        className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded p-1 text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-accent-primary)]"
                    >
                        <option value="">Mặc định</option>
                        {availableSystemVoices.map(voice => (
                            <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <div className="flex justify-between text-[10px] text-[var(--theme-text-secondary)] mb-1">
                        <span>Tốc độ</span>
                        <span>{settings.ttsSettings.playbackRate}x</span>
                    </div>
                    <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={settings.ttsSettings.playbackRate}
                        onChange={e => handleTtsSettingChange('playbackRate', parseFloat(e.target.value))}
                        className="w-full h-1 bg-[var(--theme-text-primary)]/20 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
                    />
                </div>
            </div>
        </div>
      )}

      {popoverTarget && autoScrollPopover}

      <div className={`fixed bottom-0 left-0 right-0 z-40 py-4 bg-[var(--theme-bg-base)]/95 backdrop-blur-lg border-t border-[var(--theme-border)] shadow-lg transition-transform duration-300 ${isNavBarVisible ? 'translate-y-0' : 'translate-y-full'}`}>
        {navButtons('bottom')}
      </div>

      <ChapterListModal
        isOpen={isListVisible}
        onClose={() => setIsListVisible(false)}
        chapters={story.chapters ?? []}
        currentChapterUrl={story.chapters?.[currentChapterIndex]?.url}
        onSelectChapter={handleChapterSelectAndClose}
        readChapters={readChapters}
      />
      
      {/* Default Settings Panel */}
      <SettingsPanel 
        isOpen={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        settings={settings}
        onSettingsChange={onSettingsChange}
        availableSystemVoices={availableSystemVoices}
        mode="default"
        // Pass handlers for mobile tools
        onToggleTts={handleTtsButtonClick}
        onToggleAutoScroll={(target) => handleAutoScrollButtonClick(target)}
        // onToggleChat removed here as it is now in CharacterPanel
        isTtsActive={ttsStatus === 'playing' || ttsStatus === 'paused' || isAudioPlayerVisible}
        isAutoScrollActive={isAutoScrolling}
      />

      {/* TTS Setup Settings Panel */}
      <SettingsPanel 
        isOpen={isTtsSetupVisible}
        onClose={() => setIsTtsSetupVisible(false)}
        settings={settings}
        onSettingsChange={onSettingsChange}
        availableSystemVoices={availableSystemVoices}
        mode="tts-setup"
        onConfirmTts={handleConfirmTtsSetup}
      />
      
      <ChapterEditModal
        isOpen={isAddChapterModalOpen}
        onClose={() => setIsAddChapterModalOpen(false)}
        onSave={handleConfirmAddChapter}
        nextChapterIndex={(story.chapters?.length || 0) + 1}
      />
    </>
  );
};

export default ChapterContent;
