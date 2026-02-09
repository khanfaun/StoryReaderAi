
import React, { useState, useRef, useEffect } from 'react';
import type { GoogleUser } from '../types';
import { SyncIcon, CogIcon, CloseIcon } from './icons';
import * as authService from '../services/authService';
import { syncLibraryFromCloud } from '../services/cloudService';

interface UserMenuProps {
  user: GoogleUser;
  onLogout: () => void;
  onOpenSettings: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ user, onLogout, onOpenSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSync = async () => {
      setIsSyncing(true);
      await syncLibraryFromCloud();
      // Giả lập delay để người dùng thấy phản hồi
      setTimeout(() => setIsSyncing(false), 1000);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 focus:outline-none"
      >
        <img 
            src={user.imageUrl} 
            alt={user.name} 
            className="w-9 h-9 rounded-full border-2 border-[var(--theme-border)] hover:border-[var(--theme-accent-primary)] transition-colors object-cover"
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl py-2 z-50 animate-fade-in-up">
            <div className="px-4 py-3 border-b border-[var(--theme-border)]">
                <p className="text-sm font-bold text-[var(--theme-text-primary)] truncate">{user.name}</p>
                <p className="text-xs text-[var(--theme-text-secondary)] truncate">{user.email}</p>
            </div>
            
            <div className="py-1">
                <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="w-full text-left px-4 py-2 text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-base)] flex items-center gap-2"
                >
                    <SyncIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[var(--theme-accent-primary)]' : ''}`} />
                    {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
                </button>
                <button 
                    onClick={() => { onOpenSettings(); setIsOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-base)] flex items-center gap-2"
                >
                    <CogIcon className="w-4 h-4" />
                    Cài đặt / API Key
                </button>
            </div>

            <div className="border-t border-[var(--theme-border)] py-1">
                <button 
                    onClick={() => { onLogout(); setIsOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:bg-[var(--theme-bg-base)] flex items-center gap-2"
                >
                    <CloseIcon className="w-4 h-4" />
                    Đăng xuất
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
