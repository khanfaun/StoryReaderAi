import React, { useState } from 'react';
import { handleAuthClick, handleSignOut, isSignedIn } from '../services/googleDriveService';
import { CloseIcon, SpinnerIcon, DownloadIcon } from './icons';
import type { GoogleUser } from '../types';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: () => Promise<boolean>;
  user: GoogleUser | null;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose, onSync, user }) => {
  const [status, setStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  // Nếu không mở, không render gì cả
  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsWorking(true);
    setStatus('Đang kết nối Google Drive...');
    try {
      await handleAuthClick();
      // Sau khi auth thành công, trigger sync
      setStatus('Đăng nhập thành công! Đang đồng bộ danh sách truyện...');
      await onSync();
      setStatus('Đồng bộ hoàn tất! Cửa sổ sẽ đóng...');
      
      // Delay một chút để người dùng đọc thông báo rồi đóng
      setTimeout(() => {
          onClose();
      }, 1000);
      
    } catch (error: any) {
        console.error("Drive login error", error);
        setStatus('Đăng nhập thất bại hoặc bị hủy.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleSignOutClick = async () => {
    setIsWorking(true);
    handleSignOut();
    setStatus('Đã ngắt kết nối Drive.');
    setIsWorking(false);
    // Reload page to clear state is usually safest/easiest for simple apps
    setTimeout(() => window.location.reload(), 1000);
  };

  const handleSyncNow = async () => {
    setIsWorking(true);
    setStatus('Đang quét và đồng bộ danh sách truyện...');
    const success = await onSync();
    if (success) {
      setStatus('Đồng bộ thành công! Cửa sổ sẽ đóng...');
      setTimeout(() => onClose(), 800);
    } else {
      setStatus('Đồng bộ thất bại. Vui lòng thử lại.');
    }
    setIsWorking(false);
  };

  return (
    <div 
        className="sync-modal-overlay animate-fade-in" 
        onClick={onClose} 
        role="dialog" 
        aria-modal="true"
        style={{ zIndex: 300 }} // Đảm bảo luôn nằm trên cùng (ApiKeyModal là 200)
    >
      <div className="sync-modal animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="sync-modal-title" className="sync-modal__title">Google Drive Sync</h2>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            className="sync-modal__close-btn" 
            aria-label="Đóng"
          >
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6">
          {isSignedIn() ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 bg-green-100 flex items-center justify-center border-2 border-green-500 overflow-hidden">
                  {user?.imageUrl ? (
                      <img src={user.imageUrl} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                      <DownloadIcon className="w-8 h-8 text-green-600" />
                  )}
              </div>
              <p className="font-semibold text-lg text-[var(--theme-text-primary)]">Đã kết nối Drive</p>
              <p className="text-sm text-[var(--theme-text-secondary)] mb-6">
                  {user?.name || 'Tài khoản Google'}
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                    onClick={handleSyncNow}
                    className="sync-modal-form__button sync-modal-form__button--primary"
                    disabled={isWorking}
                >
                  {isWorking ? <SpinnerIcon className="sync-modal-form__spinner" /> : 'Đồng bộ danh sách ngay'}
                </button>
                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="sync-modal-form__button sync-modal-form__button--secondary"
                  disabled={isWorking}
                >
                   Đăng xuất
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="sync-modal__description text-center">
                Kết nối Google Drive để lưu trữ và đồng bộ truyện giữa các thiết bị. 
                <br/><span className="text-xs text-slate-400">(Dữ liệu sẽ được lưu tại thư mục 'TruyenReader_Data')</span>
              </p>
              <button
                onClick={handleSignIn}
                disabled={isWorking}
                className="w-full mt-4 bg-white hover:bg-gray-100 text-gray-800 font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors duration-300 border border-gray-300"
              >
                 {isWorking ? <SpinnerIcon className="sync-modal-form__spinner text-blue-500" /> : (
                     <>
                        <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#clip0_17_40)"><path fill="#4285F4" d="M43.611 20.083H42V20H24V28H35.303C33.6747 33.148 29.2287 37.001 24 37C17.373 37 12 31.627 12 25C12 18.373 17.373 13 24 13C26.96 13 29.56 14.14 31.63 15.87L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5C13.464 5 5 13.464 5 24C5 34.536 13.464 43 24 43C34.536 43 43 34.536 43 24C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path><path fill="#EA4335" d="M31.63 15.87L24 22.88L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5V13C26.96 13 29.56 14.14 31.63 15.87Z"></path><path fill="#34A853" d="M24 43C28.9375 42.998 33.4725 41.0548 37.18 37.68L31.63 32.13C29.56 33.86 26.96 35 24 35C21.04 35 18.44 33.86 16.37 32.13L10.82 37.68C14.5275 41.0548 19.0625 42.998 24 43V43Z"></path><path fill="#FBBC05" d="M42.611 20.083H24V28H35.303C34.51 30.245 33.16 32.068 31.63 32.13L37.18 37.68C40.6552 34.4172 42.6625 30.0125 42.962 25.083C43.001 24.524 43 23.5 43 23C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path></g><defs><clipPath id="clip0_17_40"><rect width="48" height="48" fill="white"></rect></clipPath></defs></svg>
                        <span>Đăng nhập với Google</span>
                     </>
                 )}
              </button>
            </div>
          )}
        </div>

        <div className="sync-modal__status" aria-live="polite">
          {status}
        </div>
      </div>
    </div>
  );
};

export default SyncModal;