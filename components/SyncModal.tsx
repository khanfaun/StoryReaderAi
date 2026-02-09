
import React, { useState, useEffect } from 'react';
import { CloseIcon, SpinnerIcon, SyncIcon, CheckIcon, CloudIcon } from './icons';
import { initGoogleDrive, signInToDrive, isAuthenticated, syncLibraryIndex } from '../services/sync';

interface SyncModalProps {
  onClose: () => void;
}

const SyncModal: React.FC<SyncModalProps> = ({ onClose }) => {
  const [status, setStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

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
      
      // Tự động đồng bộ danh sách ngay sau khi đăng nhập
      await syncLibraryIndex();
      
      setStatus('Đồng bộ danh sách hoàn tất! Bạn có thể đóng cửa sổ này.');
      setTimeout(() => {
          // Tải lại trang để cập nhật danh sách truyện mới vào App state
          window.location.reload(); 
      }, 1500);

    } catch (error: any) {
        setStatus('Đăng nhập thất bại hoặc bị hủy.');
        console.error(error);
    } finally {
        setIsWorking(false);
    }
  };

  const handleManualSyncIndex = async () => {
      setIsWorking(true);
      setStatus("Đang tải danh sách truyện từ Drive...");
      try {
          await syncLibraryIndex();
          setStatus("Đã cập nhật danh sách truyện mới nhất!");
          setTimeout(() => window.location.reload(), 1000);
      } catch (e: any) {
          setStatus("Lỗi đồng bộ: " + e.message);
      } finally {
          setIsWorking(false);
      }
  }

  return (
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
                    Đăng nhập để tự động lưu truyện và dữ liệu AI vào Google Drive của bạn (Thư mục Ẩn). Dữ liệu sẽ được tải về khi bạn cần (Lazy Loading).
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
                        <p className="text-xs text-emerald-200/70">Tài khoản của bạn đã sẵn sàng.</p>
                    </div>
                </div>

                <div className="bg-[var(--theme-bg-base)] p-4 rounded-lg border border-[var(--theme-border)] text-sm space-y-3">
                    <p className="font-semibold text-[var(--theme-text-primary)]">Cơ chế hoạt động:</p>
                    <ul className="list-disc list-inside text-[var(--theme-text-secondary)] space-y-1 pl-1">
                        <li><strong>Khi mở App:</strong> Tự động tải danh sách truyện từ Drive.</li>
                        <li><strong>Khi mở Truyện:</strong> Nếu truyện chưa có đủ chương, sẽ tải từ Drive.</li>
                        <li><strong>Khi đọc Chương:</strong> Nếu nội dung chưa có, sẽ tải từ Drive.</li>
                        <li><strong>Khi lưu/tải:</strong> Dữ liệu sẽ tự động được đẩy lên Drive.</li>
                    </ul>
                </div>

                <button
                    onClick={handleManualSyncIndex}
                    disabled={isWorking}
                    className="w-full bg-[var(--theme-accent-primary)] hover:brightness-110 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                    {isWorking ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <SyncIcon className="w-5 h-5" />}
                    <span>Làm mới danh sách truyện ngay</span>
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
