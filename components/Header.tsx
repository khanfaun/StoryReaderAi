import React from 'react';
import { KeyIcon, BellIcon } from './icons';

interface HeaderProps {
  onOpenApiKeySettings: () => void;
  onOpenUpdateModal: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenApiKeySettings, onOpenUpdateModal }) => {
  return (
    <header className="bg-[var(--theme-bg-surface)] shadow-lg border-b border-[var(--theme-border)]">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">
          <span className="text-[var(--theme-accent-primary)]">Trình Đọc</span> Truyện
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenUpdateModal}
            className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
            aria-label="Xem thông báo cập nhật"
          >
            <BellIcon className="w-6 h-6" />
          </button>
          <button
            onClick={onOpenApiKeySettings}
            className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
            aria-label="Quản lý API Key"
          >
            <KeyIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;