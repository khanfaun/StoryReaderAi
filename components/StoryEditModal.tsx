
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, UploadIcon, TrashIcon, SpinnerIcon } from './icons';
import type { Story } from '../types';

interface StoryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (storyData: Partial<Story> & { ebookFile?: File }) => void;
  story?: Story | null; // Nếu có story thì là chế độ Sửa, ngược lại là Thêm mới
  // FIX: Make onParseEbook optional as it's only used in create mode.
  onParseEbook?: (file: File) => Promise<Story>; // Callback để parse ebook từ App
}

const StoryEditModal: React.FC<StoryEditModalProps> = ({ isOpen, onClose, onSave, story, onParseEbook }) => {
  const [formData, setFormData] = useState<Partial<Story>>({
    title: '',
    author: '',
    imageUrl: '',
    description: '',
    tags: [],
  });
  const [tagsInput, setTagsInput] = useState('');
  const [chapters, setChapters] = useState<any[]>([]); // Lưu tạm danh sách chương
  const [pendingEbookFile, setPendingEbookFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ebookInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (story) {
        setFormData({
          title: story.title,
          author: story.author,
          imageUrl: story.imageUrl,
          description: story.description,
          tags: story.tags || [],
        });
        setTagsInput((story.tags || []).join(', '));
        setChapters(story.chapters || []);
      } else {
        setFormData({
            title: '',
            author: '',
            imageUrl: '',
            description: '',
            tags: [],
        });
        setTagsInput('');
        setChapters([]);
      }
      setPendingEbookFile(null);
      setIsParsing(false);
    }
  }, [isOpen, story]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setTagsInput(e.target.value);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64String = reader.result as string;
              setFormData(prev => ({ ...prev, imageUrl: base64String }));
          };
          reader.readAsDataURL(file);
      }
  };

  const handleEbookSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // FIX: Add a guard clause to ensure onParseEbook exists before calling it.
      if (!file || !onParseEbook) return;

      setIsParsing(true);
      try {
          const parsedStory = await onParseEbook(file);
          // Auto-fill form with parsed data
          setFormData({
              title: parsedStory.title,
              author: parsedStory.author,
              imageUrl: parsedStory.imageUrl,
              description: parsedStory.description,
              tags: parsedStory.tags || [],
          });
          setTagsInput((parsedStory.tags || []).join(', '));
          setChapters(parsedStory.chapters || []);
          setPendingEbookFile(file); // Store file to save later
      } catch (err) {
          alert(`Lỗi đọc file Ebook: ${(err as Error).message}`);
      } finally {
          setIsParsing(false);
          if (ebookInputRef.current) ebookInputRef.current.value = "";
      }
  };

  const handleDeleteImage = () => {
      setFormData(prev => ({ ...prev, imageUrl: '' }));
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Process tags
    const processedTags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

    onSave({
        ...formData,
        tags: processedTags,
        chapters: chapters, // Preserve chapters from ebook if any
        ebookFile: pendingEbookFile || undefined
    });
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 z-[100] flex justify-center items-center">
      <div
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-md flex flex-col m-4 border border-[var(--theme-border)] animate-fade-in-up max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-modal-title"
      >
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <h2 id="story-modal-title" className="text-xl font-bold text-[var(--theme-text-primary)]">
            {story ? 'Chỉnh sửa truyện' : 'Tạo truyện mới'}
          </h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]" aria-label="Đóng">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Ebook Import Section */}
          {!story && (
              <div className="p-4 border border-dashed border-[var(--theme-accent-primary)] rounded-lg bg-[var(--theme-accent-primary)]/5 text-center">
                  <p className="text-sm text-[var(--theme-text-secondary)] mb-2">Bạn có file Ebook (.epub)?</p>
                  <button
                      type="button"
                      onClick={() => ebookInputRef.current?.click()}
                      disabled={isParsing}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--theme-accent-primary)] hover:brightness-90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
                  >
                      {isParsing ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
                      {isParsing ? 'Đang phân tích...' : 'Nhập thông tin từ Ebook'}
                  </button>
                  <input
                      type="file"
                      ref={ebookInputRef}
                      onChange={handleEbookSelect}
                      accept=".epub"
                      className="hidden"
                  />
                  {pendingEbookFile && (
                      <p className="text-xs text-green-400 mt-2">
                          Đã tải: {pendingEbookFile.name} ({chapters.length} chương)
                      </p>
                  )}
              </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Tên truyện</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title || ''}
              onChange={handleChange}
              required
              placeholder="Nhập tên truyện..."
              className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
            />
          </div>

          <div>
            <label htmlFor="author" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Tác giả</label>
            <input
              type="text"
              id="author"
              name="author"
              value={formData.author || ''}
              onChange={handleChange}
              placeholder="Tên tác giả hoặc 'Tôi'"
              className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
            />
          </div>
          
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Thể loại / Nhãn (ngăn cách bằng dấu phẩy)</label>
            <input
              type="text"
              id="tags"
              name="tags"
              value={tagsInput}
              onChange={handleTagsChange}
              placeholder="Ví dụ: Tiên Hiệp, Huyền Huyễn, Hệ Thống"
              className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
            />
          </div>

          <div>
            <label htmlFor="imageUrl" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Ảnh bìa (Link hoặc Tải lên - Size tối ưu: 600x900)</label>
            <div className="flex gap-2 items-center">
                <input
                    type="text"
                    id="imageUrl"
                    name="imageUrl"
                    value={formData.imageUrl || ''}
                    onChange={handleChange}
                    placeholder="https://example.com/image.jpg"
                    className="flex-grow bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 bg-slate-600 hover:bg-slate-500 text-white p-2 rounded-md transition-colors"
                    title="Tải ảnh từ máy tính"
                >
                    <UploadIcon className="w-6 h-6" />
                </button>
                {formData.imageUrl && (
                    <button
                        type="button"
                        onClick={handleDeleteImage}
                        className="flex-shrink-0 bg-rose-600 hover:bg-rose-500 text-white p-2 rounded-md transition-colors"
                        title="Xóa ảnh hiện tại"
                    >
                        <TrashIcon className="w-6 h-6" />
                    </button>
                )}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                />
            </div>
            {formData.imageUrl && formData.imageUrl.startsWith('data:') && (
                <p className="text-xs text-green-400 mt-1 truncate">Đã tải lên ảnh từ máy tính.</p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Mô tả</label>
            <textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              rows={4}
              placeholder="Giới thiệu về nội dung truyện..."
              className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-semibold transition-colors"
            >
              {story ? 'Lưu thay đổi' : (pendingEbookFile ? 'Thêm truyện từ Ebook' : 'Tạo truyện')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default StoryEditModal;
