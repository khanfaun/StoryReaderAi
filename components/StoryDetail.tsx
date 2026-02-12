
import React, { useState, useMemo } from 'react';
import type { Story, Chapter, DownloadConfig } from '../types';
import { EditIcon, TrashIcon, PlusIcon, CheckIcon, CloseIcon, SpinnerIcon, DownloadIcon, InfoIcon, PauseIcon, PlayIcon, StopIcon, RefreshIcon, SortIcon, DocumentPlusIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';
import StoryEditModal from './StoryEditModal';
import DownloadModal from './DownloadModal';
import MultiChapterAddModal from './MultiChapterAddModal';

interface StoryDetailProps {
  story: Story;
  onSelectChapter: (chapter: Chapter) => void;
  readChapters: Set<string>;
  lastReadChapterIndex: number | null;
  onBack: () => void;
  onUpdateStory?: (updatedStory: Story) => void;
  onDeleteStory?: (story: Story) => void;
  onDeleteChapterContent?: (storyUrl: string, chapterUrl: string) => Promise<void>;
  onFilterAuthor?: (author: string) => void;
  onFilterTag?: (tag: string) => void;
  isBackgroundLoading?: boolean;
  onStartDownload?: (config: DownloadConfig) => void;
  downloadProgress?: { current: number; total: number; status: 'running' | 'paused' };
  
  // New Control Props
  onPauseDownload?: () => void;
  onResumeDownload?: () => void;
  onStopDownload?: () => void;
  onStartBackgroundDownload?: () => void;
  onRedownload?: () => void; // New prop for re-downloading
  
  // Queue Props
  isQueued?: boolean;
  queuePosition?: number;
  
  // Cached chapters list for checkmark
  cachedChapters?: Set<string>;

  // Search & Create Props (Passed from App)
  onSearch: (query: string) => void;
  isSearchLoading: boolean;
  onOpenHelpModal: () => void;
  
  // NEW: Add Chapters Handler
  onAddChapters?: (story: Story, newChapters: { number: number; title: string; content: string }[]) => Promise<void>;
}

const StoryDetail: React.FC<StoryDetailProps> = ({ 
    story, 
    onSelectChapter, 
    readChapters, 
    lastReadChapterIndex, 
    onBack,
    onUpdateStory,
    onDeleteStory,
    onDeleteChapterContent,
    onFilterAuthor,
    onFilterTag,
    isBackgroundLoading = false,
    onStartDownload,
    downloadProgress,
    onPauseDownload,
    onResumeDownload,
    onStopDownload,
    onStartBackgroundDownload,
    onRedownload,
    isQueued = false,
    queuePosition = 0,
    cachedChapters,
    onSearch,
    isSearchLoading,
    onOpenHelpModal,
    onAddChapters
}) => {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const chaptersPerPage = 20; // Giảm xuống 20 chương mỗi trang

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [confirmDeleteStory, setConfirmDeleteStory] = useState(false);
  const [confirmRedownload, setConfirmRedownload] = useState(false);
  
  // Download states
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  
  // Multi Chapter Add Modal
  const [isMultiAddModalOpen, setIsMultiAddModalOpen] = useState(false);

  // State riêng để xóa chương bằng Modal
  const [chapterToDelete, setChapterToDelete] = useState<{ chapter: Chapter } | null>(null);
  
  // State để theo dõi chương đang được chỉnh sửa tên (Lưu theo URL gốc để tránh lỗi khi sort)
  const [editingChapterUrl, setEditingChapterUrl] = useState<string | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState('');

  // Sort State
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination & Sorting logic
  const totalChapters = story.chapters?.length ?? 0;
  const totalPages = Math.ceil(totalChapters / chaptersPerPage);
  
  const sortedChapters = useMemo(() => {
      if (!story.chapters) return [];
      const chaps = [...story.chapters];
      if (sortOrder === 'desc') {
          chaps.reverse();
      }
      return chaps;
  }, [story.chapters, sortOrder]);

  const indexOfLastChapter = currentPage * chaptersPerPage;
  const indexOfFirstChapter = indexOfLastChapter - chaptersPerPage;
  const currentChapters = sortedChapters.slice(indexOfFirstChapter, indexOfLastChapter);
  
  const handlePageChange = (pageNumber: number) => {
    const newPage = Math.max(1, Math.min(pageNumber, totalPages));
    setCurrentPage(newPage);
    // Reset editing chapter if changing page
    setEditingChapterUrl(null);
  };

  const toggleSort = () => {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      setCurrentPage(1); // Reset về trang 1 khi đổi chiều sắp xếp
  };

  const handleUpdateMetadata = (formData: Partial<Story>) => {
      if (onUpdateStory) {
          const updatedStory = { ...story, ...formData };
          onUpdateStory(updatedStory);
          setIsEditModalOpen(false);
      }
  };

  // Mở Modal xác nhận xóa chương
  const handleRequestDeleteChapter = (chapter: Chapter, e: React.MouseEvent) => {
      e.stopPropagation();
      setChapterToDelete({ chapter });
  };

  const handleConfirmDeleteChapter = async () => {
      if (!chapterToDelete || !story.chapters) return;
      
      const { chapter } = chapterToDelete;
      // Tìm index thực tế trong mảng gốc (vì mảng hiển thị có thể đã bị sort)
      const realIndex = story.chapters.findIndex(c => c.url === chapter.url);
      
      if (realIndex > -1) {
          const newChapters = [...story.chapters];
          newChapters.splice(realIndex, 1);
          
          const updatedStory = { ...story, chapters: newChapters };
          
          if (onUpdateStory) onUpdateStory(updatedStory); 
          
          if (onDeleteChapterContent) {
              await onDeleteChapterContent(story.url, chapter.url);
          }
      }
      
      setChapterToDelete(null);
  };

  // Inline Chapter Editing Logic (Rename)
  const handleStartEditChapter = (chapter: Chapter, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingChapterUrl(chapter.url);
      setEditingChapterTitle(chapter.title);
  };

  const handleSaveEditChapter = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!editingChapterUrl || !story.chapters) return;

      const realIndex = story.chapters.findIndex(c => c.url === editingChapterUrl);
      if (realIndex > -1) {
          const newChapters = [...story.chapters]; 
          newChapters[realIndex] = { ...newChapters[realIndex], title: editingChapterTitle };
          
          const updatedStory = { ...story, chapters: newChapters };
          
          if (onUpdateStory) onUpdateStory(updatedStory);
      }

      setEditingChapterUrl(null);
      setEditingChapterTitle('');
  };

  const handleCancelEditChapter = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingChapterUrl(null);
      setEditingChapterTitle('');
  };

  const handleAuthorClick = () => {
      if (onFilterAuthor && story.author) {
          onFilterAuthor(story.author);
          onBack(); // Go back to library
      }
  };

  const handleTagClick = (tag: string) => {
      if (onFilterTag) {
          onFilterTag(tag);
          onBack(); // Go back to library
      }
  };
  
  // --- DOWNLOAD HANDLERS ---
  const handleDownloadClick = () => {
      setIsDownloadModalOpen(true);
  };

  const handleStartDownloadInternal = (config: DownloadConfig) => {
      if (onStartDownload) {
          onStartDownload(config);
      }
      setIsDownloadModalOpen(false);
  }
  
  const handleAddChaptersInternal = async (newChapters: { number: number; title: string; content: string }[]) => {
      if (onAddChapters) {
          await onAddChapters(story, newChapters);
      }
  };

  // Calculate percentage for progress bar
  const downloadPercentage = downloadProgress ? (downloadProgress.current / downloadProgress.total) * 100 : 0;
  const isPaused = downloadProgress?.status === 'paused';
  
  return (
    <div className="bg-[var(--theme-bg-surface)] rounded-lg shadow-xl p-4 sm:p-6 animate-fade-in border border-[var(--theme-border)]">
      
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <button
            onClick={onBack}
            className="flex items-center gap-1 bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-bold p-2 sm:py-2 sm:px-4 rounded-lg transition-colors duration-300"
            title="Quay lại"
        >
            <span>&larr;</span>
            <span className="hidden sm:inline">Quay lại</span>
        </button>
        
        {onUpdateStory && (
            <div className="flex gap-2 flex-wrap">
                {onAddChapters && (
                    <button
                        onClick={() => setIsMultiAddModalOpen(true)}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold p-2 sm:py-2 sm:px-4 rounded-lg transition-colors duration-300"
                        title="Thêm nhiều chương mới"
                    >
                        <DocumentPlusIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">Thêm chương mới</span>
                    </button>
                )}
                
                <button
                    onClick={handleDownloadClick}
                    className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-bold p-2 sm:py-2 sm:px-4 rounded-lg transition-colors duration-300"
                    title="Tải truyện hoặc lưu Offline"
                >
                    <DownloadIcon className="w-5 h-5" />
                    <span className="hidden sm:inline">Tải truyện</span>
                </button>
                <button
                    onClick={() => setIsEditModalOpen(true)}
                    className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white font-bold p-2 sm:py-2 sm:px-4 rounded-lg transition-colors duration-300"
                    title="Sửa thông tin truyện"
                >
                    <EditIcon className="w-5 h-5" />
                    <span className="hidden sm:inline">Sửa thông tin</span>
                </button>
                {onDeleteStory && (
                    <button
                        onClick={() => setConfirmDeleteStory(true)}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold p-2 sm:py-2 sm:px-4 rounded-lg transition-colors duration-300"
                        title="Xóa truyện"
                    >
                        <TrashIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">Xóa truyện</span>
                    </button>
                )}
            </div>
        )}
      </div>

      {/* Story info display */}
      <div className="mb-6 flex flex-col md:flex-row gap-6">
          <div className="flex-shrink-0 w-full md:w-48 lg:w-64 aspect-[2/3] relative rounded-lg overflow-hidden shadow-lg border border-[var(--theme-border)] mx-auto md:mx-0 max-w-[200px] md:max-w-none">
               {story.imageUrl ? (
                  <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover" />
               ) : (
                  <div className="w-full h-full bg-[var(--theme-bg-base)] flex items-center justify-center text-[var(--theme-text-secondary)] text-lg font-bold p-4 text-center">{story.title}</div>
               )}
          </div>
          <div className="flex-grow">
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--theme-text-primary)] mb-2 text-center md:text-left">{story.title}</h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-3 text-sm">
                  <span className="text-[var(--theme-text-secondary)]">Tác giả:</span>
                  <button 
                    onClick={handleAuthorClick}
                    className="text-[var(--theme-accent-primary)] hover:underline font-semibold"
                    title={`Xem thêm truyện của ${story.author}`}
                  >
                      {story.author}
                  </button>
                  <span className="text-[var(--theme-text-secondary)] mx-2">|</span>
                  <span className="text-[var(--theme-text-secondary)]">Nguồn: </span>
                  {story.source === 'Local' || story.source === 'Ebook' ? (
                      <span className="text-[var(--theme-text-secondary)] font-medium">{story.source === 'Local' ? 'Tự thêm' : 'Ebook'}</span>
                  ) : (
                      <a 
                        href={story.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[var(--theme-accent-primary)] hover:underline font-medium flex items-center gap-1"
                        title="Mở trang gốc truyện"
                      >
                          {story.source}
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                  )}
              </div>
              
              {story.tags && story.tags.length > 0 && (
                  <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                      {story.tags.map(tag => (
                          <button 
                            key={tag}
                            onClick={() => handleTagClick(tag)}
                            className="px-2 py-1 text-xs font-medium rounded-full bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] border border-[var(--theme-border)] hover:border-[var(--theme-accent-primary)] hover:text-[var(--theme-accent-primary)] transition-colors"
                          >
                              {tag}
                          </button>
                      ))}
                  </div>
              )}

              <p className="text-[var(--theme-text-primary)] leading-relaxed whitespace-pre-wrap text-justify">{story.description}</p>
          </div>
      </div>

      <div className="mt-8 animate-fade-in">
          <div className="flex justify-between items-center border-b-2 border-[var(--theme-border)] pb-2 mb-4">
              <div className="flex items-center gap-4">
                  <h3 className="text-xl sm:text-2xl font-semibold text-[var(--theme-text-primary)]">Danh sách chương ({totalChapters})</h3>
                  <div className="flex gap-2">
                      <button 
                        onClick={toggleSort}
                        className="flex items-center gap-1 text-sm bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] px-3 py-1 rounded hover:bg-[var(--theme-border)] transition-colors"
                        title={sortOrder === 'asc' ? 'Sắp xếp: Cũ nhất trước' : 'Sắp xếp: Mới nhất trước'}
                      >
                          <SortIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">{sortOrder === 'asc' ? 'Cũ nhất' : 'Mới nhất'}</span>
                      </button>
                  </div>
              </div>
          </div>

          {/* BACKGROUND LOADING INDICATOR BAR (METADATA) */}
          {isBackgroundLoading && (
              <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg flex items-center justify-between animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                  <div className="flex items-center gap-3">
                      <div className="relative">
                          <SpinnerIcon className="w-5 h-5 text-blue-400 animate-spin" />
                          <div className="absolute inset-0 bg-blue-400/30 rounded-full blur-sm animate-pulse"></div>
                      </div>
                      <div className="flex flex-col">
                          <span className="text-sm font-semibold text-blue-200">Đang đồng bộ danh sách chương...</span>
                          <span className="text-xs text-blue-400">Đã tìm thấy {totalChapters} chương</span>
                      </div>
                  </div>
                  <span className="text-xs px-2 py-1 bg-blue-800/50 rounded text-blue-300 border border-blue-700/50 font-mono hidden sm:inline-block">Đang chạy ngầm</span>
              </div>
          )}

          {/* QUEUED STATUS INDICATOR */}
          {isQueued && !downloadProgress && (
              <div className="mb-6 p-4 bg-amber-900/30 border border-amber-600/50 rounded-lg flex items-center gap-3 animate-fade-in">
                  <SpinnerIcon className="w-5 h-5 text-amber-400 animate-spin" />
                  <div>
                      <h3 className="font-bold text-amber-200 text-sm">Đang chờ trong hàng đợi tải...</h3>
                      <p className="text-xs text-amber-100/80">
                          Vị trí: <strong>#{queuePosition}</strong>. Quá trình tải sẽ tự động bắt đầu khi các truyện trước hoàn tất.
                      </p>
                  </div>
                  <button 
                      onClick={onStopDownload}
                      className="ml-auto text-xs px-3 py-1 bg-amber-800 hover:bg-amber-700 text-white rounded border border-amber-600/50 transition-colors"
                  >
                      Hủy tải
                  </button>
              </div>
          )}

          {/* BACKGROUND DOWNLOAD PROGRESS (CONTENT) */}
          {downloadProgress ? (
              <div className={`mb-6 p-4 rounded-lg shadow-lg animate-fade-in border ${isPaused ? 'bg-amber-900/20 border-amber-500/30' : 'bg-emerald-900/20 border-emerald-500/30'}`}>
                  <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                          {isPaused ? <PauseIcon className="w-4 h-4 text-amber-400" /> : <SpinnerIcon className="w-4 h-4 text-emerald-400 animate-spin" />}
                          <span className={`text-sm font-bold ${isPaused ? 'text-amber-200' : 'text-emerald-200'}`}>
                              {isPaused ? 'Đang tạm dừng tải truyện' : 'Đang tự động tải truyện...'}
                          </span>
                      </div>
                      <div className="flex items-center gap-3">
                          <span className={`text-xs font-mono ${isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {downloadProgress.current} / {downloadProgress.total} chương
                          </span>
                          
                          {/* CONTROL BUTTONS */}
                          <div className="flex items-center gap-1 border-l border-white/10 pl-3">
                              {isPaused ? (
                                  <button onClick={onResumeDownload} className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400" title="Tiếp tục tải">
                                      <PlayIcon className="w-5 h-5" />
                                  </button>
                              ) : (
                                  <button onClick={onPauseDownload} className="p-1 hover:bg-amber-500/20 rounded text-amber-400" title="Tạm dừng">
                                      <PauseIcon className="w-5 h-5" />
                                  </button>
                              )}
                              {onRedownload && (
                                <button onClick={() => setConfirmRedownload(true)} className="p-1 hover:bg-blue-500/20 rounded text-blue-400" title="Tải lại từ đầu">
                                    <RefreshIcon className="w-5 h-5" />
                                </button>
                              )}
                              <button onClick={onStopDownload} className="p-1 hover:bg-rose-500/20 rounded text-rose-400" title="Hủy tải xuống">
                                  <StopIcon className="w-5 h-5" />
                              </button>
                          </div>
                      </div>
                  </div>
                  <div className={`w-full bg-[var(--theme-bg-base)] rounded-full h-2 overflow-hidden border ${isPaused ? 'border-amber-900/50' : 'border-emerald-900/50'}`}>
                      <div 
                          className={`h-full transition-all duration-300 relative ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${downloadPercentage}%` }}
                      >
                          {!isPaused && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
                      </div>
                  </div>
                  <p className={`text-[10px] mt-1 text-center ${isPaused ? 'text-amber-400/70' : 'text-emerald-400/70'}`}>
                      {isPaused ? "Nhấn nút Play để tiếp tục tải." : "Bạn có thể đọc bình thường trong khi hệ thống đang tải."}
                  </p>
              </div>
          ) : (
              // SHOW START BUTTONS IF NOT FULLY DOWNLOADED AND NOT QUEUED
              (story.chapters && story.chapters.length > 0 && downloadPercentage < 100 && story.source !== 'Local' && story.source !== 'Ebook' && !isBackgroundLoading && !isQueued) && (
                  <div className="mb-6 flex justify-center gap-3">
                      <button 
                        onClick={onStartBackgroundDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm transition-colors"
                      >
                          <DownloadIcon className="w-4 h-4" />
                          Tiếp tục tải các chương còn lại
                      </button>
                      {onRedownload && (
                          <button 
                            onClick={() => setConfirmRedownload(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-500/30 rounded-lg text-blue-300 text-sm transition-colors"
                          >
                              <RefreshIcon className="w-4 h-4" />
                              Tải lại dữ liệu
                          </button>
                      )}
                  </div>
              )
          )}
          
          {/* Chapter list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {currentChapters.map((chapter) => {
              const isEditingThis = editingChapterUrl === chapter.url;

              if (isEditingThis) {
                  return (
                      <div key={chapter.url} className="flex items-center gap-1 p-1 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md">
                          <input 
                              type="text" 
                              value={editingChapterTitle} 
                              onChange={(e) => setEditingChapterTitle(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-grow w-full bg-transparent border-none focus:outline-none text-[var(--theme-text-primary)] text-sm px-2"
                              autoFocus
                          />
                          <button 
                              onClick={handleSaveEditChapter}
                              className="text-green-500 hover:text-green-400 p-1 flex-shrink-0"
                              title="Lưu"
                          >
                              <CheckIcon className="w-5 h-5" />
                          </button>
                          <button 
                              onClick={handleCancelEditChapter}
                              className="text-slate-400 hover:text-slate-300 p-1 flex-shrink-0"
                              title="Hủy"
                          >
                              <CloseIcon className="w-5 h-5" />
                          </button>
                      </div>
                  )
              }

              const isRead = readChapters.has(chapter.url);
              const lastReadChapterUrl = story.chapters?.[lastReadChapterIndex ?? -1]?.url;
              const isLastRead = lastReadChapterUrl === chapter.url;
              const isCached = cachedChapters?.has(chapter.url) ?? false;

              let buttonClass = 'text-left p-3 flex-grow text-sm truncate rounded-l-md transition-colors duration-200 relative';
              let containerClass = 'flex items-center rounded-md group hover:shadow-md transition-all duration-200 ';

              if (isLastRead) {
                  buttonClass += ' text-[var(--theme-accent-primary)]';
                  containerClass += ' ring-2 ring-[var(--theme-accent-primary)] bg-[var(--theme-accent-primary)]/20';
              } else if (isRead) {
                  buttonClass += ' text-[var(--theme-text-secondary)]';
                  containerClass += ' bg-[var(--theme-bg-base)] border border-[var(--theme-border)]';
              } else {
                  buttonClass += ' text-[var(--theme-text-primary)]';
                  containerClass += ' bg-[var(--theme-bg-surface)] brightness-110 hover:brightness-125';
              }

              return (
              <div key={chapter.url} className={containerClass}>
                  <button
                      onClick={() => onSelectChapter(chapter)}
                      className={buttonClass}
                      title={chapter.title}
                  >
                      {chapter.title}
                      {/* Cached Tick Indicator */}
                      {isCached && (
                          <span className="absolute top-1/2 -translate-y-1/2 right-2 text-emerald-500" title="Đã tải (Offline)">
                              <CheckIcon className="w-3.5 h-3.5" />
                          </span>
                      )}
                  </button>
                  
                  {/* Action Buttons - Always visible on hover */}
                  <div className="flex items-center gap-1 px-2 border-l border-[var(--theme-border)]/50 hidden group-hover:flex">
                      <button
                          onClick={(e) => handleStartEditChapter(chapter, e)}
                          className="p-1.5 text-slate-400 hover:text-[var(--theme-accent-primary)] rounded-full hover:bg-[var(--theme-bg-base)] transition-colors"
                          title="Sửa tên chương"
                      >
                          <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                          onClick={(e) => handleRequestDeleteChapter(chapter, e)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-[var(--theme-bg-base)] transition-colors"
                          title="Xóa chương"
                      >
                          <TrashIcon className="w-4 h-4" />
                      </button>
                  </div>
              </div>
              );
          })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 sm:gap-4 flex-wrap mt-8">
              <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 sm:px-4 text-xs sm:text-sm rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
              &laquo; <span className="hidden sm:inline">Đầu</span>
              </button>
              <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 sm:px-4 text-xs sm:text-sm rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
              &lsaquo; <span className="hidden sm:inline">Trước</span>
              </button>
              <span className="text-[var(--theme-text-primary)] font-semibold whitespace-nowrap text-sm sm:text-base">
              {currentPage} / {totalPages}
              </span>
              <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 sm:px-4 text-xs sm:text-sm rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
              <span className="hidden sm:inline">Sau</span> &rsaquo;
              </button>
              <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="bg-[var(--theme-bg-surface)] brightness-125 hover:brightness-150 text-[var(--theme-text-primary)] font-bold py-2 px-3 sm:px-4 text-xs sm:text-sm rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
              <span className="hidden sm:inline">Cuối</span> &raquo;
              </button>
          </div>
          )}
      </div>

      {/* Confirmation Modal for Story Deletion */}
      <ConfirmationModal
        isOpen={confirmDeleteStory}
        onClose={() => setConfirmDeleteStory(false)}
        onConfirm={() => {
            if (onDeleteStory) onDeleteStory(story);
            setConfirmDeleteStory(false);
        }}
        title="Xóa truyện"
      >
          <p>Bạn có chắc chắn muốn xóa toàn bộ truyện <strong className="text-[var(--theme-text-primary)]">{story.title}</strong>?</p>
          <p className="text-sm text-red-400 mt-2">Hành động này sẽ xóa vĩnh viễn truyện và tất cả nội dung chương đã tải.</p>
      </ConfirmationModal>

      {/* Confirmation Modal for Re-download */}
      <ConfirmationModal
        isOpen={confirmRedownload}
        onClose={() => setConfirmRedownload(false)}
        onConfirm={() => {
            if (onRedownload) onRedownload();
            setCurrentPage(1); // Reset trang về 1 khi tải lại
            setConfirmRedownload(false);
        }}
        title="Tải lại dữ liệu"
        confirmText="Tải lại & Xóa cũ"
        confirmButtonClass="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
      >
          <p>Bạn có chắc muốn <strong>XÓA TOÀN BỘ</strong> nội dung đã tải của truyện <strong className="text-[var(--theme-text-primary)]">{story.title}</strong> và tải lại từ đầu không?</p>
          <p className="text-sm text-yellow-500 mt-2">Hành động này sẽ cập nhật lại danh sách chương mới nhất và tải lại nội dung toàn bộ truyện. Tiến độ đọc của bạn sẽ được giữ nguyên.</p>
      </ConfirmationModal>

      {/* Confirmation Modal for Chapter Deletion */}
      <ConfirmationModal
        isOpen={chapterToDelete !== null}
        onClose={() => setChapterToDelete(null)}
        onConfirm={handleConfirmDeleteChapter}
        title="Xóa chương"
      >
          <p>Bạn có chắc chắn muốn xóa chương <strong className="text-[var(--theme-text-primary)]">{chapterToDelete?.chapter.title}</strong>?</p>
          <p className="text-sm text-red-400 mt-2">Nội dung chương đã tải sẽ bị xóa khỏi bộ nhớ.</p>
      </ConfirmationModal>

      <StoryEditModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleUpdateMetadata}
        story={story}
      />
      
      <DownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        story={story}
        onStartDownload={handleStartDownloadInternal}
        isBackgroundDownloading={!!downloadProgress}
      />
      
      <MultiChapterAddModal 
        isOpen={isMultiAddModalOpen}
        onClose={() => setIsMultiAddModalOpen(false)}
        onSave={handleAddChaptersInternal}
        nextChapterIndex={(story.chapters?.length || 0) + 1}
      />
    </div>
  );
};

export default StoryDetail;
