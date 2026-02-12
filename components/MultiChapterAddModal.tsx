
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon, TrashIcon, SparklesIcon, CheckIcon, SpinnerIcon } from './icons';

interface ChapterDraft {
  id: string; // Unique ID cho UI list
  number: number;
  title: string;
  content: string;
}

interface MultiChapterAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (chapters: { number: number; title: string; content: string }[]) => Promise<void>;
  nextChapterIndex: number;
}

const MultiChapterAddModal: React.FC<MultiChapterAddModalProps> = ({ isOpen, onClose, onSave, nextChapterIndex }) => {
  const [drafts, setDrafts] = useState<ChapterDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Ref để scroll xuống dưới cùng khi thêm card mới
  const listRef = useRef<HTMLDivElement>(null);

  // Ref để lưu trữ số chương tại thời điểm mở modal (Snapshot)
  // Điều này ngăn UI tự động nhảy số khi background scraping cập nhật nextChapterIndex bên ngoài
  const startNumberRef = useRef(nextChapterIndex);

  // Khởi tạo card đầu tiên khi mở modal
  useEffect(() => {
    if (isOpen) {
      // Snapshot giá trị nextChapterIndex ngay tại thời điểm mở
      startNumberRef.current = nextChapterIndex;

      setDrafts([{
        id: Date.now().toString(),
        number: startNumberRef.current,
        title: '',
        content: ''
      }]);
      setIsSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // QUAN TRỌNG: Bỏ nextChapterIndex khỏi dependency để không reset khi app tải xong

  const addCard = () => {
    // Nếu danh sách trống, dùng snapshot đã lưu. Nếu có, +1 từ card cuối cùng.
    const lastNumber = drafts.length > 0 ? drafts[drafts.length - 1].number : startNumberRef.current - 1;
    setDrafts(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        number: lastNumber + 1,
        title: '',
        content: ''
      }
    ]);
    
    // Scroll to bottom after render
    setTimeout(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, 100);
  };

  const removeCard = (id: string) => {
    if (drafts.length <= 1) {
        // Nếu chỉ còn 1 card thì reset nội dung về snapshot ban đầu thay vì xóa hẳn
        setDrafts([{
            id: Date.now().toString(),
            number: startNumberRef.current,
            title: '',
            content: ''
        }]);
        return;
    }
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const updateDraft = (id: string, field: keyof ChapterDraft, value: string | number) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleSave = async () => {
    // Validate: Lọc bỏ các chương không có nội dung để tránh rác
    const validChapters = drafts
        .filter(d => d.content.trim().length > 0)
        .map(d => {
            // Format tiêu đề: "Chương X: Tên chương" hoặc "Chương X"
            let finalTitle = `Chương ${d.number}`;
            if (d.title.trim()) {
                finalTitle += `: ${d.title.trim()}`;
            }
            return {
                number: d.number,
                title: finalTitle,
                content: d.content
            };
        });

    if (validChapters.length === 0) {
        alert("Vui lòng nhập nội dung cho ít nhất một chương.");
        return;
    }

    setIsSaving(true);
    try {
        await onSave(validChapters);
        onClose(); // Chỉ đóng khi thành công
    } catch (error) {
        console.error("Lỗi khi lưu chương:", error);
        // Không đóng modal, giữ nguyên dữ liệu để user sửa hoặc thử lại
        // Lỗi sẽ được hiển thị bởi App.tsx (setError)
    } finally {
        setIsSaving(false);
    }
  };

  const handleAiTranslate = () => {
      alert("Tính năng AI Biên dịch/Viết tiếp đang được phát triển! Vui lòng quay lại sau.");
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 z-[150] flex justify-center items-center p-4 animate-fade-in">
      <div
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-4xl flex flex-col h-[90vh] border border-[var(--theme-border)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)] bg-[var(--theme-bg-surface)]">
          <h2 className="text-xl font-bold text-[var(--theme-text-primary)] flex items-center gap-2">
            <PlusIcon className="w-6 h-6 text-green-500" />
            Thêm Chương Mới
          </h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]" aria-label="Đóng">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content List */}
        <div className="flex-grow overflow-y-auto p-4 bg-[var(--theme-bg-base)]" ref={listRef}>
            <div className="space-y-4">
                {drafts.map((draft, index) => (
                    <div key={draft.id} className="bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg p-4 shadow-sm relative group transition-all hover:border-[var(--theme-accent-primary)]/50">
                        {/* Remove Button */}
                        <button 
                            onClick={() => removeCard(draft.id)}
                            className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-900/20 rounded-full transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100"
                            title="Xóa thẻ này"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-3">
                            {/* Chapter Number */}
                            <div className="md:col-span-3">
                                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Số chương</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--theme-text-secondary)]">Chương</span>
                                    <input
                                        type="number"
                                        value={draft.number}
                                        onChange={(e) => updateDraft(draft.id, 'number', parseInt(e.target.value))}
                                        className="w-full pl-16 pr-3 py-1.5 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded text-sm text-[var(--theme-text-primary)] focus:ring-1 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)] outline-none"
                                    />
                                </div>
                            </div>
                            
                            {/* Chapter Title */}
                            <div className="md:col-span-9">
                                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Tên chương (Tùy chọn)</label>
                                <input
                                    type="text"
                                    value={draft.title}
                                    onChange={(e) => updateDraft(draft.id, 'title', e.target.value)}
                                    placeholder="Ví dụ: Mở đầu, Gặp gỡ..."
                                    className="w-full px-3 py-1.5 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded text-sm text-[var(--theme-text-primary)] focus:ring-1 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)] outline-none"
                                />
                            </div>
                        </div>

                        {/* Content */}
                        <div>
                            <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Nội dung chương</label>
                            <textarea
                                value={draft.content}
                                onChange={(e) => updateDraft(draft.id, 'content', e.target.value)}
                                placeholder="Nhập nội dung chương tại đây..."
                                className="w-full min-h-[150px] p-3 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded text-sm text-[var(--theme-text-primary)] focus:ring-1 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)] outline-none resize-y font-[var(--reader-font-family)]"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Add More Button */}
            <button
                onClick={addCard}
                className="w-full mt-4 py-3 border-2 border-dashed border-[var(--theme-border)] rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-primary)] hover:border-[var(--theme-accent-primary)] hover:bg-[var(--theme-accent-primary)]/5 transition-all flex items-center justify-center gap-2 font-medium"
            >
                <PlusIcon className="w-5 h-5" />
                Thêm chương tiếp theo
            </button>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--theme-border)] bg-[var(--theme-bg-surface)] flex flex-col sm:flex-row justify-between items-center gap-3">
            <button
                onClick={handleAiTranslate}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-purple-600/10 text-purple-400 hover:bg-purple-600/20 border border-purple-600/30 flex items-center justify-center gap-2 transition-colors font-medium text-sm"
            >
                <SparklesIcon className="w-4 h-4" />
                AI Biên dịch (Sắp ra mắt)
            </button>

            <div className="flex gap-3 w-full sm:w-auto">
                <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors text-sm disabled:opacity-50"
                >
                    Hủy
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-colors shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                    {isSaving ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <CheckIcon className="w-5 h-5" />}
                    Lưu {drafts.filter(d => d.content.trim()).length} chương mới
                </button>
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MultiChapterAddModal;
