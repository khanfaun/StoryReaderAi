
import React from 'react';
import { KeyIcon, BellIcon, SyncIcon } from './icons';
import type { GoogleUser } from '../types';
import * as driveService from '../services/googleDriveService';

interface HeaderProps {
  onOpenApiKeySettings: () => void;
  onOpenUpdateModal: () => void;
  onGoHome: () => void;
  storyTitle?: string;
  user: GoogleUser | null;
  onLogin: () => void;
  onLogout: () => void;
  isSyncing: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
    onOpenApiKeySettings, 
    onOpenUpdateModal, 
    onGoHome, 
    storyTitle,
    user,
    onLogin,
    onLogout,
    isSyncing
}) => {
  const [showUserMenu, setShowUserMenu] = React.useState(false);

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
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-[40%] md:max-w-[50%] text-center pointer-events-none">
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
          
          {/* Sync / User Button */}
          {user ? (
              <div className="relative">
                  <button 
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border-2 border-[var(--theme-accent-primary)] focus:outline-none"
                  >
                      <img src={user.imageUrl} alt={user.name} className="w-full h-full object-cover" />
                  </button>
                  {/* Status Indicator */}
                  {isSyncing && (
                      <span className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-0.5 border border-[var(--theme-bg-surface)]">
                          <SyncIcon className="w-3 h-3 text-white animate-spin" />
                      </span>
                  )}
                  
                  {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-48 bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl py-1 z-50 animate-fade-in-up">
                          <div className="px-4 py-2 border-b border-[var(--theme-border)]">
                              <p className="text-sm font-bold text-[var(--theme-text-primary)] truncate">{user.name}</p>
                              <p className="text-xs text-[var(--theme-text-secondary)] truncate">{user.email}</p>
                          </div>
                          <button 
                            onClick={() => { driveService.logoutGoogle(onLogout); setShowUserMenu(false); }}
                            className="block w-full text-left px-4 py-2 text-sm text-rose-400 hover:bg-[var(--theme-bg-base)] transition-colors"
                          >
                              Đăng xuất
                          </button>
                      </div>
                  )}
                  {/* Overlay to close menu */}
                  {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)}></div>}
              </div>
          ) : (
              <button
                onClick={onLogin}
                className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
                title="Đăng nhập Google Drive để đồng bộ"
              >
                <div className="relative">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                    </svg>
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400"></span>
                    </span>
                </div>
              </button>
          )}

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
