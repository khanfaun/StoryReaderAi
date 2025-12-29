
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';

interface ChapterEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => void;
  nextChapterIndex?: number; // Prop mới để biết số thứ tự chương tiếp theo
}

const ChapterEditModal: React.FC<ChapterEditModalProps> = ({ isOpen, onClose, onSave, nextChapterIndex }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Nếu có nextChapterIndex, điền sẵn format "Chương X: "
      if (nextChapterIndex !== undefined) {
          // Format số với 2 chữ số (ví dụ: 01, 02...)
          const paddedIndex = nextChapterIndex.toString().padStart(2, '0');
          setTitle(`Chương ${paddedIndex}: `);
      } else {
          setTitle('');
      }
      setContent('');
    }
  }, [isOpen, nextChapterIndex]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title, content);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 z-[100] flex justify-center items-center">
      <div
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-2xl flex flex-col m-4 border border-[var(--theme-border)] animate-fade-in-up max-h-[90vh]"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-modal-title"
      >
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <h2 id="chapter-modal-title" className="text-xl font-bold text-[var(--theme-text-primary)]">
            Thêm Chương Mới
          </h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]" aria-label="Đóng">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-grow overflow-hidden">
          <div className="p-6 space-y-4 flex-grow flex flex-col overflow-y-auto">
            <div>
              <label htmlFor="chapterTitle" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Tên chương</label>
              <input
                type="text"
                id="chapterTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                placeholder="Ví dụ: Chương 01: Mở đầu"
                className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
              />
              <p className="text-xs text-[var(--theme-text-secondary)] mt-1">Hệ thống đã điền sẵn số chương, bạn hãy nhập tên chương phía sau.</p>
            </div>

            <div className="flex-grow flex flex-col">
              <label htmlFor="chapterContent" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Nội dung chương</label>
              <textarea
                id="chapterContent"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nhập nội dung chương tại đây..."
                className="w-full flex-grow min-h-[300px] bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-4 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)] resize-none"
                style={{ fontFamily: 'var(--reader-font-family)', fontSize: '16px', lineHeight: '1.6' }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 p-4 border-t border-[var(--theme-border)] bg-[var(--theme-bg-base)] rounded-b-lg">
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
              Tạo chương
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ChapterEditModal;
