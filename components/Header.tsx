
import React, { useState, useEffect, useRef } from 'react';
import { KeyIcon, BellIcon, CloudIcon, MagnifyingGlassIcon, PlusIcon, CheckIcon, SpinnerIcon } from './icons';
import { subscribeToSyncState, isAuthenticated } from '../services/sync';

interface HeaderProps {
  onOpenApiKeySettings: () => void;
  onOpenUpdateModal: () => void;
  onGoHome: () => void;
  storyTitle?: string;
  onOpenSyncModal?: () => void;
  
  // New props for mobile interaction
  onOpenMobileSearch?: () => void;
  onCreateStory?: () => void;

  children?: React.ReactNode;
  autoHide?: boolean; 
  isVisible?: boolean; 
}

const Header: React.FC<HeaderProps> = ({ 
  onOpenApiKeySettings, 
  onOpenUpdateModal, 
  onGoHome, 
  storyTitle, 
  onOpenSyncModal,
  onOpenMobileSearch,
  onCreateStory,
  children,
  autoHide = false,
  isVisible: externalIsVisible
}) => {
  const [internalIsVisible, setInternalIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  
  // Sync State for Icon
  const [syncState, setSyncState] = useState({ isSyncing: false, isBackgroundSyncing: false, isDirty: false });
  const [isDriveConnected, setIsDriveConnected] = useState(false);

  const isVisible = externalIsVisible !== undefined ? externalIsVisible : internalIsVisible;

  useEffect(() => {
      // Check auth status initially
      setIsDriveConnected(isAuthenticated());
      
      // Subscribe to sync state changes
      const unsubscribe = subscribeToSyncState((state) => {
          setSyncState({
              isSyncing: state.isSyncing,
              isBackgroundSyncing: state.isBackgroundSyncing,
              isDirty: state.isDirty
          });
          // Update auth status if it changes (e.g. after logout)
          setIsDriveConnected(isAuthenticated());
      });
      return unsubscribe;
  }, []);

  useEffect(() => {
    if (externalIsVisible !== undefined) return;

    if (!autoHide) {
      setInternalIsVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < lastScrollY.current || currentScrollY < 50) {
        setInternalIsVisible(true);
      } else if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setInternalIsVisible(false);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [autoHide, externalIsVisible]);

  // Determine which icon to show for Sync button
  const renderSyncIcon = () => {
      if (!isDriveConnected) {
          return <CloudIcon className="w-6 h-6 text-[var(--theme-text-secondary)]" />;
      }
      
      if (syncState.isSyncing || syncState.isBackgroundSyncing) {
          return <SpinnerIcon className="w-6 h-6 text-[var(--theme-accent-primary)] animate-spin" />;
      }
      
      if (syncState.isDirty) {
          return <CloudIcon className="w-6 h-6 text-amber-500" />;
      }
      
      // Fully Synced
      return <CheckIcon className="w-6 h-6 text-emerald-500" />;
  };
  
  const getSyncTitle = () => {
      if (!isDriveConnected) return "Đăng nhập Google Drive";
      if (syncState.isSyncing || syncState.isBackgroundSyncing) return "Đang đồng bộ...";
      if (syncState.isDirty) return "Có thay đổi chưa đồng bộ (Nhấn để đồng bộ ngay)";
      return "Đã đồng bộ an toàn";
  }

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-[110] bg-[var(--theme-bg-surface)] shadow-lg border-b border-[var(--theme-border)] h-16 transition-transform duration-300 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}
    >
      <div className="container mx-auto px-4 h-full flex justify-between items-center gap-2 sm:gap-4 overflow-x-hidden">
        
        {/* LEFT: Logo */}
        <div className="flex-shrink-0 flex items-center z-10">
          <h1 
              className="text-xl sm:text-2xl font-bold text-[var(--theme-text-primary)] cursor-pointer hover:opacity-80 transition-opacity select-none whitespace-nowrap"
              onClick={onGoHome}
              title="Về trang chủ"
          >
            <span className="text-[var(--theme-accent-primary)]">Ai</span> Storymind
          </h1>
        </div>

        {/* CENTER: Search Bar (Desktop) & Story Title */}
        <div className="flex-grow h-full flex justify-center items-center max-w-2xl px-2 min-w-0">
            {storyTitle ? (
               <span className="text-sm sm:text-lg font-bold text-[var(--theme-text-primary)] truncate text-center w-full">
                    {storyTitle}
               </span>
            ) : (
               /* Hide search bar on mobile, show on md+ */
               <div className="hidden md:flex w-full">
                   {children}
               </div>
            )}
        </div>

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 z-10">
          {onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                className="p-2 rounded-full hover:bg-[var(--theme-border)] transition-colors duration-200"
                aria-label="Đồng bộ Cloud"
                title={getSyncTitle()}
              >
                {renderSyncIcon()}
              </button>
          )}
          
          <button
            onClick={onOpenUpdateModal}
            className="relative p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
            aria-label="Xem thông báo cập nhật"
          >
            <BellIcon className="w-6 h-6" />
            <span className="absolute top-2 right-2 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--theme-bg-surface)]"></span>
          </button>
          
          <button
            onClick={onOpenApiKeySettings}
            className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
            aria-label="Quản lý API Key"
          >
            <KeyIcon className="w-6 h-6" />
          </button>

          {/* MOBILE ONLY: Add Story Icon */}
          {!storyTitle && onCreateStory && (
            <button
                onClick={onCreateStory}
                className="md:hidden p-2 rounded-full text-[var(--theme-accent-primary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
                aria-label="Thêm truyện mới"
                title="Thêm truyện mới / Ebook"
            >
                <PlusIcon className="w-6 h-6" />
            </button>
          )}

          {/* MOBILE ONLY: Search Icon */}
          {!storyTitle && onOpenMobileSearch && (
            <button
                onClick={onOpenMobileSearch}
                className="md:hidden p-2 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
                aria-label="Tìm kiếm"
                title="Tìm kiếm"
            >
                <MagnifyingGlassIcon className="w-6 h-6" />
            </button>
          )}

        </div>
      </div>
    </header>
  );
};

export default Header;
