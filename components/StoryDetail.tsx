
import React, { useState } from 'react';
import type { Story, Chapter } from '../types';
import { EditIcon, TrashIcon, PlusIcon, CheckIcon, CloseIcon, DownloadIcon, SpinnerIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';
import StoryEditModal from './StoryEditModal';
import ChapterEditModal from './ChapterEditModal';

interface StoryDetailProps {
  story: Story;
  onSelectChapter: (chapter: Chapter) => void;
  readChapters: Set<string>;
  lastReadChapterIndex: number | null;
  onBack: () => void;
  onUpdateStory?: (updatedStory: Story) => void;
  onDeleteStory?: (story: Story) => void;
  onDeleteChapterContent?: (storyUrl: string, chapterUrl: string) => Promise<void>;
  onCreateChapter?: (story: Story, title: string, content: string) => Promise<void>;
  onFilterAuthor?: (author: string) => void;
  onFilterTag?: (tag: string) => void;
  onDownloadStory?: (story: Story) => void;
  isBackgroundLoading?: boolean; // Prop mới
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
    onCreateChapter,
    onFilterAuthor,
    onFilterTag,
    onDownloadStory,
    isBackgroundLoading = false
}) => {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const chaptersPerPage = 100; // Hiển thị 100 chương mỗi trang

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddChapterModalOpen, setIsAddChapterModalOpen] = useState(false);
  const [confirmDeleteStory, setConfirmDeleteStory] = useState(false);
  
  // State riêng để xóa chương bằng Modal
  const [chapterToDelete, setChapterToDelete] = useState<{ index: number, chapter: Chapter } | null>(null);
  
  // State để theo dõi chương đang được chỉnh sửa tên
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState('');

  // Pagination logic
  const totalChapters = story.chapters?.length ?? 0;
  const totalPages = Math.ceil(totalChapters / chaptersPerPage);
  const indexOfLastChapter = currentPage * chaptersPerPage;
  const indexOfFirstChapter = indexOfLastChapter - chaptersPerPage;
  const currentChapters = story.chapters?.slice(indexOfFirstChapter, indexOfLastChapter) ?? [];
  
  const handlePageChange = (pageNumber: number) => {
    const newPage = Math.max(1, Math.min(pageNumber, totalPages));
    setCurrentPage(newPage);
    // Reset editing chapter if changing page
    setEditingChapterIndex(null);
  };

  const handleUpdateMetadata = (formData: Partial<Story>) => {
      if (onUpdateStory) {
          const updatedStory = { ...story, ...formData };
          onUpdateStory(updatedStory);
          setIsEditModalOpen(false);
      }
  };

  // Mở Modal xác nhận xóa chương
  const handleRequestDeleteChapter = (indexOnPage: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const actualIndex = indexOfFirstChapter + indexOnPage;
      const chapter = story.chapters![actualIndex];
      setChapterToDelete({ index: actualIndex, chapter });
  };

  const handleConfirmDeleteChapter = async () => {
      if (!chapterToDelete) return;
      
      const { index, chapter } = chapterToDelete;
      const newChapters = [...(story.chapters || [])];
      newChapters.splice(index, 1);
      
      const updatedStory = { ...story, chapters: newChapters };
      
      if (onUpdateStory) onUpdateStory(updatedStory); 
      
      if (onDeleteChapterContent) {
          await onDeleteChapterContent(story.url, chapter.url);
      }
      
      setChapterToDelete(null);
  };

  // Inline Chapter Editing Logic (Rename)
  const handleStartEditChapter = (indexOnPage: number, chapter: Chapter, e: React.MouseEvent) => {
      e.stopPropagation();
      const actualIndex = indexOfFirstChapter + indexOnPage;
      setEditingChapterIndex(actualIndex);
      setEditingChapterTitle(chapter.title);
  };

  const handleSaveEditChapter = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (editingChapterIndex === null) return;

      const newChapters = [...(story.chapters || [])]; 
      newChapters[editingChapterIndex] = { ...newChapters[editingChapterIndex], title: editingChapterTitle };
      
      const updatedStory = { ...story, chapters: newChapters };
      
      if (onUpdateStory) onUpdateStory(updatedStory);

      setEditingChapterIndex(null);
      setEditingChapterTitle('');
  };

  const handleCancelEditChapter = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingChapterIndex(null);
      setEditingChapterTitle('');
  };

  const handleAddChapterClick = () => {
      setIsAddChapterModalOpen(true);
  };

  const handleConfirmAddChapter = async (title: string, content: string) => {
      if (onCreateChapter) {
          await onCreateChapter(story, title, content);
          // Move to last page to see new chapter
          const newTotalChapters = (story.chapters?.length || 0) + 1;
          const newTotalPages = Math.ceil(newTotalChapters / chaptersPerPage);
          setCurrentPage(newTotalPages);
      }
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
                {onDownloadStory && story.source !== 'Local' && story.source !== 'Ebook' && (
                    <button
                        onClick={() => onDownloadStory(story)}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-2 sm:py-2 sm:px-4 rounded-lg transition-colors duration-300"
                        title="Cào/Tải toàn bộ chương truyện về máy để đọc offline"
                    >
                        <DownloadIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">Tải Offline</span>
                    </button>
                )}
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
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500 text-lg font-bold p-4 text-center">{story.title}</div>
               )}
          </div>
          <div className="flex-grow">
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--theme-text-primary)] mb-2 text-center md:text-left">{story.title}</h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-3">
                  <span className="text-[var(--theme-text-secondary)]">Tác giả:</span>
                  <button 
                    onClick={handleAuthorClick}
                    className="text-[var(--theme-accent-primary)] hover:underline font-semibold"
                    title={`Xem thêm truyện của ${story.author}`}
                  >
                      {story.author}
                  </button>
                  <span className="text-[var(--theme-text-secondary)] mx-2">|</span>
                  <span className="text-[var(--theme-text-secondary)]">Nguồn: {story.source === 'Local' ? 'Tự thêm' : story.source}</span>
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
                  {onCreateChapter && (
                      <button onClick={handleAddChapterClick} className="flex items-center gap-1 text-sm bg-[var(--theme-accent-primary)] text-white px-3 py-1 rounded hover:brightness-110 transition-colors">
                          <PlusIcon className="w-4 h-4" /> <span className="hidden sm:inline">Thêm chương</span>
                      </button>
                  )}
              </div>
          </div>

          {/* BACKGROUND LOADING INDICATOR BAR - FULL WIDTH */}
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
          
          {/* Chapter list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {currentChapters.map((chapter, index) => {
              const actualIndex = indexOfFirstChapter + index;
              const isEditingThis = editingChapterIndex === actualIndex;

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

              let buttonClass = 'text-left p-3 flex-grow text-sm truncate rounded-l-md transition-colors duration-200';
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
                  </button>
                  
                  {/* Action Buttons - Always visible on hover */}
                  <div className="flex items-center gap-1 px-2 border-l border-[var(--theme-border)]/50 hidden group-hover:flex">
                      <button
                          onClick={(e) => handleStartEditChapter(index, chapter, e)}
                          className="p-1.5 text-slate-400 hover:text-[var(--theme-accent-primary)] rounded-full hover:bg-[var(--theme-bg-base)] transition-colors"
                          title="Sửa tên chương"
                      >
                          <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                          onClick={(e) => handleRequestDeleteChapter(index, e)}
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
      
      <ChapterEditModal
        isOpen={isAddChapterModalOpen}
        onClose={() => setIsAddChapterModalOpen(false)}
        onSave={handleConfirmAddChapter}
        nextChapterIndex={(story.chapters?.length || 0) + 1}
      />
    </div>
  );
};

export default StoryDetail;
