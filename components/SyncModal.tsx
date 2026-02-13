
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SpinnerIcon, SyncIcon, CheckIcon, CloudIcon, LogoutIcon } from './icons';
import { initGoogleDrive, signInToDrive, isAuthenticated, syncLibraryIndex, signOut, syncData, subscribeToSyncState } from '../services/sync';
import ConfirmationModal from './ConfirmationModal';

interface SyncModalProps {
  onClose: () => void;
}

const SyncModal: React.FC<SyncModalProps> = ({ onClose }) => {
  const [status, setStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // Helper để trích xuất phần trăm từ chuỗi status
  const getProgressPercentage = (statusStr: string): number => {
      const match = statusStr.match(/(\d+)%/);
      return match ? parseInt(match[1], 10) : 0;
  };

  const progressPercent = getProgressPercentage(status);
  // Indeterminate khi đang làm việc nhưng chưa có % cụ thể
  const isIndeterminate = isWorking && progressPercent === 0;

  useEffect(() => {
      // Subscribe to global sync state to reflect background/manual sync progress
      const unsubscribe = subscribeToSyncState((state) => {
          setStatus(state.status);
          setIsWorking(state.isSyncing || state.isBackgroundSyncing);
      });
      return unsubscribe;
  }, []);

  useEffect(() => {
    const init = async () => {
        try {
            await initGoogleDrive();
            setIsLoggedIn(isAuthenticated());
        } catch (e) {
            setInitError("Không thể tải thư viện Google Drive. Vui lòng kiểm tra kết nối mạng.");
            console.error(e);
        }
    };
    init();
  }, []);

  const handleSignIn = async () => {
    setIsWorking(true);
    setStatus('Đang kết nối Google Drive...');
    try {
      await signInToDrive();
      setIsLoggedIn(true);
      setStatus('Đăng nhập thành công! Đang đồng bộ danh sách truyện...');
      await syncLibraryIndex();
      setStatus('Đồng bộ danh sách hoàn tất! Bạn có thể đóng cửa sổ này.');
      setTimeout(() => {
          window.location.reload(); 
      }, 1500);
    } catch (error: any) {
        setStatus('Đăng nhập thất bại hoặc bị hủy.');
        console.error(error);
        setIsWorking(false);
    }
  };

  const handleSync = async () => {
      if (isWorking) return;
      try {
          await syncData();
      } catch (e: any) {
          console.error(e);
      }
  }

  const handleLogoutClick = () => {
      setIsLogoutConfirmOpen(true);
  };

  const confirmLogout = () => {
      signOut();
      setIsLoggedIn(false);
      setIsLogoutConfirmOpen(false);
      setStatus('');
      window.location.reload();
  };

  return createPortal(
    <>
    <div className="sync-modal-overlay animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sync-modal animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="sync-modal-title" className="sync-modal__title flex items-center gap-2">
              <CloudIcon className="w-6 h-6 text-[var(--theme-accent-primary)]" />
              Đồng bộ Google Drive
          </h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6">
          {initError ? (
              <p className="text-rose-400 text-center">{initError}</p>
          ) : !isLoggedIn ? (
            <div>
              <div className="text-center mb-6">
                  <div className="bg-blue-900/30 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
                      <CloudIcon className="w-10 h-10 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--theme-text-primary)] mb-2">Lưu trữ & Đồng bộ</h3>
                  <p className="text-sm text-[var(--theme-text-secondary)]">
                    Đăng nhập để tự động lưu truyện và dữ liệu AI vào Google Drive của bạn (Thư mục Ẩn). Dữ liệu sẽ được tải về khi bạn cần.
                  </p>
              </div>
              <button
                onClick={handleSignIn}
                disabled={isWorking}
                className="w-full bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors duration-300 shadow-md border border-gray-300"
              >
                 {isWorking ? <SpinnerIcon className="sync-modal-form__spinner text-gray-600" /> : (
                     <>
                        <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#clip0_17_40)"><path fill="#4285F4" d="M43.611 20.083H42V20H24V28H35.303C33.6747 33.148 29.2287 37.001 24 37C17.373 37 12 31.627 12 25C12 18.373 17.373 13 24 13C26.96 13 29.56 14.14 31.63 15.87L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5C13.464 5 5 13.464 5 24C5 34.536 13.464 43 24 43C34.536 43 43 34.536 43 24C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path><path fill="#EA4335" d="M31.63 15.87L24 22.88L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5V13C26.96 13 29.56 14.14 31.63 15.87Z"></path><path fill="#34A853" d="M24 43C28.9375 42.998 33.4725 41.0548 37.18 37.68L31.63 32.13C29.56 33.86 26.96 35 24 35C21.04 35 18.44 33.86 16.37 32.13L10.82 37.68C14.5275 41.0548 19.0625 42.998 24 43V43Z"></path><path fill="#FBBC05" d="M42.611 20.083H24V28H35.303C34.51 30.245 33.16 32.068 31.63 32.13L37.18 37.68C40.6552 34.4172 42.6625 30.0125 42.962 25.083C43.001 24.524 43 23.5 43 23C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path></g><defs><clipPath id="clip0_17_40"><rect width="48" height="48" fill="white"></rect></clipPath></defs></svg>
                        <span>Đăng nhập với Google</span>
                     </>
                 )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
                <div className="bg-emerald-900/20 p-4 rounded-lg border border-emerald-500/50 flex items-center gap-3">
                    <div className="bg-emerald-500 rounded-full p-1"><CheckIcon className="w-5 h-5 text-white" /></div>
                    <div>
                        <p className="text-sm font-bold text-emerald-400">Đã kết nối Google Drive</p>
                        <p className="text-xs text-emerald-200/70">Dữ liệu của bạn được an toàn.</p>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    {/* Nút Đồng bộ duy nhất */}
                    <button
                        onClick={handleSync}
                        disabled={isWorking}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 shadow-lg"
                        title="Đồng bộ ngay"
                    >
                        {isWorking ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : <SyncIcon className="w-6 h-6" />}
                        <span className="text-lg">{isWorking ? 'Đang xử lý...' : 'Đồng bộ ngay'}</span>
                    </button>
                    <p className="text-center text-xs text-[var(--theme-text-secondary)]">
                        Hệ thống sẽ tự động tải về nội dung mới và sao lưu các thay đổi của bạn.
                    </p>

                    <button
                        onClick={handleLogoutClick}
                        disabled={isWorking}
                        className="w-full mt-4 bg-transparent border border-rose-500/30 hover:bg-rose-900/20 text-rose-400 font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
                    >
                        <LogoutIcon className="w-4 h-4" />
                        <span>Đăng xuất</span>
                    </button>
                </div>

                {/* --- PROGRESS BAR SECTION --- */}
                {status && (
                    <div className="mt-2 animate-fade-in">
                        <div className="flex justify-between text-xs text-[var(--theme-text-secondary)] mb-1">
                            <span className="truncate pr-2 font-medium">{status}</span>
                            {progressPercent > 0 && <span className="text-[var(--theme-accent-primary)] font-bold">{progressPercent}%</span>}
                        </div>
                        <div className="w-full bg-[var(--theme-bg-base)] rounded-full h-3 overflow-hidden border border-[var(--theme-border)]">
                            <div 
                                className={`h-full transition-all duration-300 relative ${isIndeterminate ? 'w-full animate-pulse bg-[var(--theme-accent-primary)]/50' : 'bg-[var(--theme-accent-primary)]'}`} 
                                style={{ width: isIndeterminate ? '100%' : `${progressPercent}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
    
    <ConfirmationModal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={confirmLogout}
        title="Xác nhận đăng xuất"
        confirmText="Đăng xuất"
        confirmButtonClass="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors"
    >
        <p>Bạn có chắc chắn muốn đăng xuất khỏi Google Drive?</p>
        <p className="text-sm text-yellow-500 mt-2">Lưu ý: Sau khi đăng xuất, trang web sẽ được tải lại để đảm bảo dữ liệu hiển thị chính xác.</p>
    </ConfirmationModal>
    </>,
    document.body
  );
};

export default SyncModal;
