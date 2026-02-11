
import React from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="sync-modal-overlay animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
      <div className="sync-modal animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="help-modal-title" className="sync-modal__title">💡 Mẹo Tìm Truyện Nhanh</h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6 space-y-4">
          <p className="text-[var(--theme-text-secondary)]">
            Để có kết quả chính xác và nhanh nhất, bạn nên dán trực tiếp đường dẫn (URL) của truyện vào ô tìm kiếm.
          </p>
          <div>
            <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Ví dụ:</label>
            <div className="p-3 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md">
              <code className="text-sm text-[var(--theme-accent-primary)] break-all">
                https://truyenfull.vision/ta-thien-menh-dai-nhan-vat-phan-phai/
              </code>
            </div>
          </div>
           <p className="text-sm text-[var(--theme-text-secondary)]">
            Sao chép đường dẫn từ trang truyện bạn muốn đọc (Nên chọn truyện từ truyenfull.vision để tối ưu nhất hiện tại) và dán vào ô tìm kiếm sẽ cho kết quả ngay lập tức, thay vì phải tìm kiếm theo từ khóa.
          </p>
        </div>
        
        <div className="p-4 bg-[var(--theme-bg-base)] rounded-b-lg flex justify-end">
           <button 
              onClick={onClose} 
              className="sync-modal-form__button sync-modal-form__button--primary"
            >
              Đã hiểu
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default HelpModal;
