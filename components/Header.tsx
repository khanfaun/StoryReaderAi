
import React from 'react';
import { KeyIcon, BellIcon, CloudIcon } from './icons';
import type { GoogleUser } from '../types';

interface HeaderProps {
  onOpenApiKeySettings: () => void;
  onOpenUpdateModal: () => void;
  onOpenSyncModal?: () => void;
  onGoHome: () => void;
  storyTitle?: string;
  googleUser?: GoogleUser | null;
}

const Header: React.FC<HeaderProps> = ({ onOpenApiKeySettings, onOpenUpdateModal, onOpenSyncModal, onGoHome, storyTitle, googleUser }) => {
  return (
    <header className="bg-[var(--theme-bg-surface)] shadow-lg border-b border-[var(--theme-border)] relative z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center relative">
        <h1 
            className="text-2xl font-bold text-[var(--theme-text-primary)] cursor-pointer hover:opacity-80 transition-opacity select-none flex-shrink-0 z-10"
            onClick={onGoHome}
            title="Về trang chủ"
        >
          <span className="text-[var(--theme-accent-primary)]">Trình Đọc</span> <span className="hidden sm:inline">Truyện</span>
        </h1>

        {/* Centered Story Title (Visible on Mobile & Desktop) */}
        {storyTitle && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-[50%] md:max-w-[60%] text-center pointer-events-none">
                <span className="text-sm sm:text-lg font-bold text-[var(--theme-text-primary)] truncate block w-full pointer-events-auto">
                    {storyTitle}
                </span>
            </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0 z-10">
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
          {onOpenSyncModal && (
            <button
                onClick={onOpenSyncModal}
                className="rounded-full transition-all duration-200 hover:opacity-80"
                aria-label="Tài khoản Google Drive"
                title={googleUser ? `Đã đăng nhập: ${googleUser.name}` : "Đăng nhập / Đồng bộ dữ liệu"}
            >
                {googleUser ? (
                    <div className="p-0.5 border-2 border-[var(--theme-accent-primary)] rounded-full">
                        {googleUser.imageUrl ? (
                            <img 
                                src={googleUser.imageUrl} 
                                alt={googleUser.name} 
                                className="w-8 h-8 rounded-full object-cover" 
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                                {googleUser.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-2 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] rounded-full">
                        <CloudIcon className="w-6 h-6" />
                    </div>
                )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
