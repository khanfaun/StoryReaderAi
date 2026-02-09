
import React from 'react';
import { KeyIcon, BellIcon, CloudIcon } from './icons';
import type { GoogleUser } from '../types';
import UserMenu from './UserMenu';

interface HeaderProps {
  onOpenApiKeySettings: () => void;
  onOpenUpdateModal: () => void;
  onGoHome: () => void;
  storyTitle?: string;
  user?: GoogleUser | null;
  onLogin?: () => void;
  onLogout?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
    onOpenApiKeySettings, 
    onOpenUpdateModal, 
    onGoHome, 
    storyTitle,
    user,
    onLogin,
    onLogout
}) => {
  return (
    <header className="bg-[var(--theme-bg-surface)] shadow-lg border-b border-[var(--theme-border)] relative z-50">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center relative h-16">
        <h1 
            className="text-xl sm:text-2xl font-bold text-[var(--theme-text-primary)] cursor-pointer hover:opacity-80 transition-opacity select-none flex-shrink-0 z-10 flex items-center gap-2"
            onClick={onGoHome}
            title="Về trang chủ"
        >
          <span className="text-[var(--theme-accent-primary)]">Trình Đọc</span> <span className="hidden sm:inline">Truyện</span>
        </h1>

        {/* Centered Story Title (Visible on Mobile & Desktop) */}
        {storyTitle && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-[40%] md:max-w-[50%] text-center pointer-events-none">
                <span className="text-sm sm:text-lg font-bold text-[var(--theme-text-primary)] truncate block w-full pointer-events-auto">
                    {storyTitle}
                </span>
            </div>
        )}

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 z-10">
          <button
            onClick={onOpenUpdateModal}
            className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
            aria-label="Xem thông báo cập nhật"
          >
            <BellIcon className="w-6 h-6" />
          </button>
          
          {user ? (
              <UserMenu user={user} onLogout={onLogout!} onOpenSettings={onOpenApiKeySettings} />
          ) : (
              <div className="flex items-center gap-1">
                  <button
                    onClick={onOpenApiKeySettings}
                    className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
                    aria-label="Quản lý API Key"
                  >
                    <KeyIcon className="w-6 h-6" />
                  </button>
                  <button
                    onClick={onLogin}
                    className="ml-1 p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-blue-400 transition-colors duration-200 flex items-center gap-1"
                    aria-label="Đăng nhập Cloud"
                    title="Đăng nhập để đồng bộ"
                  >
                    <CloudIcon className="w-6 h-6" />
                  </button>
              </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
