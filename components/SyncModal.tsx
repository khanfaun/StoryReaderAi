
import React, { useState, useEffect, useRef } from 'react';
import * as driveService from '../services/googleDriveService';
import { syncAllData } from '../services/sync';
import { CloseIcon, SpinnerIcon, CheckIcon } from './icons';
import type { GoogleUser } from '../types';

interface SyncModalProps {
  onClose: () => void;
  user: GoogleUser | null; 
}

const SyncModal: React.FC<SyncModalProps> = ({ onClose, user }) => {
  const [status, setStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const prevUserRef = useRef<GoogleUser | null>(null);

  // Detect login success to show feedback
  useEffect(() => {
      if (!prevUserRef.current && user) {
          setLoginSuccess(true);
          setTimeout(() => setLoginSuccess(false), 3000);
      }
      prevUserRef.current = user;
  }, [user]);

  const handleSignIn = () => {
    driveService.signIn();
    // App listener handles state update
  };

  const handleSignOut = () => {
    setIsWorking(true);
    driveService.signOut(() => {
        setStatus("Đã đăng xuất.");
        setIsWorking(false);
    });
  };

  const handleSyncNow = async () => {
    if (!user) return;
    setIsWorking(true);
    setStatus('Bắt đầu đồng bộ...');
    
    await syncAllData((msg) => setStatus(msg));
    
    setIsWorking(false);
  };

  return (
    <div className="sync-modal-overlay animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sync-modal animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="sync-modal-title" className="sync-modal__title">Đồng bộ Google Drive</h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6">
          {user ? (
            <div className="text-center">
              {user.imageUrl ? (
                  <img src={user.imageUrl} alt="User avatar" className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-[var(--theme-accent-primary)]" />
              ) : (
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
                      {user.name.charAt(0).toUpperCase()}
                  </div>
              )}
              <p className="font-semibold text-lg text-[var(--theme-text-primary)]">{user.name}</p>
              <p className="text-sm text-[var(--theme-text-secondary)] mb-4">{user.email}</p>
              
              {loginSuccess && (
                  <div className="mb-4 p-2 text-center text-sm bg-green-900/40 text-green-400 border border-green-700/50 rounded-lg animate-fade-in">
                      <div className="flex items-center justify-center gap-2">
                          <CheckIcon className="w-4 h-4" />
                          <span>Đăng nhập thành công!</span>
                      </div>
                  </div>
              )}
              
              <div className="flex flex-col gap-3 mt-4">
                <button
                    onClick={handleSyncNow}
                    className="sync-modal-form__button sync-modal-form__button--primary"
                    disabled={isWorking}
                >
                  {isWorking ? <SpinnerIcon className="sync-modal-form__spinner mr-2" /> : null}
                  {isWorking ? 'Đang xử lý...' : 'Đồng bộ ngay'}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="sync-modal-form__button sync-modal-form__button--secondary"
                  disabled={isWorking}
                >
                   Đăng xuất
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="bg-blue-900/20 border border-blue-700/50 p-4 rounded-lg mb-6 text-center">
                  <p className="text-sm text-blue-200 mb-2 font-semibold">☁️ Cloud Sync (Beta)</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">
                    Lưu trữ dữ liệu truyện, lịch sử đọc và phân tích AI của bạn lên Google Drive cá nhân.
                  </p>
              </div>
              <button
                onClick={handleSignIn}
                disabled={isWorking}
                className="w-full bg-white hover:bg-gray-100 text-gray-800 font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors duration-300 border border-gray-300"
              >
                 <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#clip0_17_40)"><path fill="#4285F4" d="M43.611 20.083H42V20H24V28H35.303C33.6747 33.148 29.2287 37.001 24 37C17.373 37 12 31.627 12 25C12 18.373 17.373 13 24 13C26.96 13 29.56 14.14 31.63 15.87L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5C13.464 5 5 13.464 5 24C5 34.536 13.464 43 24 43C34.536 43 43 34.536 43 24C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path><path fill="#EA4335" d="M31.63 15.87L24 22.88L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5V13C26.96 13 29.56 14.14 31.63 15.87Z"></path><path fill="#34A853" d="M24 43C28.9375 42.998 33.4725 41.0548 37.18 37.68L31.63 32.13C29.56 33.86 26.96 35 24 35C21.04 35 18.44 33.86 16.37 32.13L10.82 37.68C14.5275 41.0548 19.0625 42.998 24 43V43Z"></path><path fill="#FBBC05" d="M42.611 20.083H24V28H35.303C34.51 30.245 33.16 32.068 31.63 32.13L37.18 37.68C40.6552 34.4172 42.6625 30.0125 42.962 25.083C43.001 24.524 43 23.5 43 23C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path></g><defs><clipPath id="clip0_17_40"><rect width="48" height="48" fill="white"></rect></clipPath></defs></svg>
                 <span>Tiếp tục với Google</span>
              </button>
            </div>
          )}
        </div>

        <div className="sync-modal__status text-xs" aria-live="polite">
          {status}
        </div>
      </div>
    </div>
  );
};

export default SyncModal;
