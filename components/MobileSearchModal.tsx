
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';
import SearchBar from './SearchBar';

interface MobileSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  isLoading: boolean;
}

const MobileSearchModal: React.FC<MobileSearchModalProps> = ({ isOpen, onClose, onSearch, isLoading }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus vào input khi mở modal
      setTimeout(() => {
        const input = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="sync-modal-overlay animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="sync-modal animate-fade-in-up w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 className="sync-modal__title">Tìm kiếm truyện</h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-4">
          {/* Search Input Area */}
          <div className="mb-6">
            <SearchBar 
                onSearch={(q) => { onSearch(q); onClose(); }} 
                isLoading={isLoading} 
                onOpenHelpModal={() => {}} // Không cần action này trong modal vì text đã hiển thị bên dưới
                minimalMode={true} // Chế độ tối giản, chỉ hiện input
            />
          </div>

          {/* Help Text Section (Taken from HelpModal) */}
          <div className="bg-[var(--theme-bg-base)] rounded-lg p-4 border border-[var(--theme-border)] text-sm space-y-3">
            <h3 className="font-bold text-[var(--theme-accent-primary)] flex items-center gap-2">
                💡 Mẹo tìm nhanh
            </h3>
            <p className="text-[var(--theme-text-secondary)]">
              Để có kết quả chính xác nhất, hãy dán trực tiếp đường dẫn (URL) của truyện.
            </p>
            <div>
              <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Ví dụ:</label>
              <div className="p-2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded text-xs font-mono text-[var(--theme-accent-primary)] break-all">
                https://truyenfull.vision/ta-thien-menh-dai-nhan-vat-phan-phai/
              </div>
            </div>
             <p className="text-[var(--theme-text-secondary)] text-xs">
              Hỗ trợ: TruyenFull, TangThuVien, TruyenHDT...
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileSearchModal;
