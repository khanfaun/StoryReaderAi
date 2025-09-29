
import React from 'react';
import { SyncIcon, KeyIcon } from './icons';
import type { GoogleUser } from '../types';

interface HeaderProps {
  onOpenSync: () => void;
  user: GoogleUser | null;
  onOpenApiKeySettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenSync, user, onOpenApiKeySettings }) => {
  return (
    <header className="bg-[var(--theme-bg-surface)] shadow-lg border-b border-[var(--theme-border)]">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">
          <span className="text-[var(--theme-accent-primary)]">Trình Đọc</span> Truyện
        </h1>
        <div className="flex items-center gap-2">
          <p className="text-[var(--theme-text-secondary)] text-sm hidden sm:block">Dữ liệu từ các trang truyện hàng đầu</p>
           {user && (
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 ring-2 ring-[var(--theme-accent-primary)]" title={`Đã đăng nhập: ${user.name}`}>
                {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={onOpenApiKeySettings}
            className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
            aria-label="Quản lý API Key"
          >
            <KeyIcon className="w-6 h-6" />
          </button>
          <button
            onClick={onOpenSync}
            className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
            aria-label="Đồng bộ hóa"
          >
            <SyncIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
