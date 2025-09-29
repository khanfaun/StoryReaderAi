import React, { useRef } from 'react';
import { CloseIcon, UploadIcon } from './icons';

interface ManualImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  urlToImport: string;
  message: string;
  onFileSelected: (file: File) => Promise<void>;
}

const ManualImportModal: React.FC<ManualImportModalProps> = ({ isOpen, onClose, urlToImport, message, onFileSelected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await onFileSelected(file);
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  if (!isOpen) return null;

  return (
    <div className="sync-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <div className="sync-modal max-w-lg" onClick={e => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="import-modal-title" className="sync-modal__title">Trợ lý Nhập liệu Thủ công</h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6">
          <p className="text-center p-3 mb-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-yellow-300">
            {message}
          </p>

          <ol className="list-decimal list-inside space-y-4 text-[var(--theme-text-secondary)]">
            <li>
              <strong>Mở trang truyện:</strong>
              <p className="text-sm pl-2">
                Nhấp vào liên kết dưới đây để mở trang cần thiết trong một tab mới.
              </p>
              <a 
                href={urlToImport} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-sm pl-4 text-[var(--theme-accent-primary)] hover:underline break-all"
              >
                {urlToImport}
              </a>
            </li>
            <li>
              <strong>Lưu trang về máy:</strong>
              <p className="text-sm pl-2">
                Trên tab vừa mở, nhấn <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Ctrl + S</kbd> (hoặc <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Cmd + S</kbd> trên Mac) để lưu trang.
              </p>
              <p className="text-sm pl-2 mt-1">
                 Chọn định dạng "Web Page, HTML Only" (nếu có) hoặc "Web Page, Complete" rồi lưu vào máy tính của bạn.
              </p>
            </li>
            <li>
              <strong>Nhập file đã lưu:</strong>
              <p className="text-sm pl-2">
                Quay lại đây và nhấp vào nút bên dưới để chọn file bạn vừa lưu.
              </p>
            </li>
          </ol>
          
          <div className="mt-8 flex flex-col items-center">
            <button
                type="button"
                onClick={handleImportClick}
                className="flex-shrink-0 w-full sm:w-auto bg-transparent border-2 border-[var(--theme-accent-secondary)] hover:bg-[var(--theme-accent-secondary)] hover:text-slate-900 text-sm text-[var(--theme-accent-secondary)] font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center"
            >
                <UploadIcon className="w-5 h-5 mr-2" />
                <span>Chọn file HTML đã lưu...</span>
            </button>
            <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".html,.htm"
                className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualImportModal;
