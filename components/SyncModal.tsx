
import React, { useState, useEffect } from 'react';
import { CloseIcon, SpinnerIcon, UploadIcon, DownloadIcon, SyncIcon } from './icons';
import { initGoogleDrive, signInToDrive, checkBackupStatus, backupToDriveSecure, restoreFromDrive } from '../services/sync';

interface SyncModalProps {
  onClose: () => void;
  // Removed old Firebase props
  onSync?: () => Promise<boolean>; 
  user?: any;
}

const SyncModal: React.FC<SyncModalProps> = ({ onClose }) => {
  const [status, setStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{ exists: boolean; date?: string; size?: string } | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Drive API on mount
    const init = async () => {
        try {
            await initGoogleDrive();
            // Check if we have a token already (soft check) - actually we can't easily check validity without a call
            // We'll rely on the user clicking "Login" or checking backup status failing to detect auth state
            updateBackupInfo();
        } catch (e) {
            setInitError("Không thể tải thư viện Google Drive. Vui lòng kiểm tra kết nối mạng.");
            console.error(e);
        }
    };
    init();
  }, []);

  const updateBackupInfo = async () => {
      const info = await checkBackupStatus();
      setBackupInfo(info);
      if (info.exists || info.date) {
          setIsSignedIn(true); // Implicitly signed in if we can read appData
      }
  };

  const handleSignIn = async () => {
    setIsWorking(true);
    setStatus('Đang mở cửa sổ đăng nhập Google...');
    try {
      await signInToDrive();
      setStatus('Đăng nhập thành công!');
      setIsSignedIn(true);
      await updateBackupInfo();
    } catch (error: any) {
        setStatus('Đăng nhập thất bại.');
        console.error(error);
    } finally {
        setIsWorking(false);
    }
  };

  const handleBackup = async () => {
      setIsWorking(true);
      try {
          await backupToDriveSecure((msg) => setStatus(msg));
          await updateBackupInfo();
      } catch (e: any) {
          setStatus(`Lỗi sao lưu: ${e.message}`);
      } finally {
          setIsWorking(false);
      }
  };

  const handleRestore = async () => {
      if (!confirm("Cảnh báo: Hành động này sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại bằng dữ liệu từ bản sao lưu. Bạn có chắc chắn muốn tiếp tục?")) return;
      
      setIsWorking(true);
      try {
          await restoreFromDrive((msg) => setStatus(msg));
          // Success message handled in restoreFromDrive (which reloads page)
      } catch (e: any) {
          setStatus(`Lỗi khôi phục: ${e.message}`);
          setIsWorking(false);
      }
  };

  return (
    <div className="sync-modal-overlay animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sync-modal animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="sync-modal-title" className="sync-modal__title flex items-center gap-2">
              <SyncIcon className="w-6 h-6 text-[var(--theme-accent-primary)]" />
              Đồng bộ Google Drive
          </h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6">
          {initError ? (
              <p className="text-rose-400 text-center">{initError}</p>
          ) : !isSignedIn ? (
            <div>
              <p className="sync-modal__description text-center">
                Đăng nhập để lưu trữ an toàn truyện đã tải, lịch sử đọc và dữ liệu phân tích AI lên Google Drive của bạn. Dữ liệu được lưu trong thư mục riêng của ứng dụng.
              </p>
              <button
                onClick={handleSignIn}
                disabled={isWorking}
                className="w-full mt-4 bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors duration-300 shadow-md border border-gray-300"
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
                <div className="bg-[var(--theme-bg-base)] p-4 rounded-lg border border-[var(--theme-border)] text-center">
                    <p className="text-sm font-semibold text-[var(--theme-text-primary)] mb-2">Trạng thái bản sao lưu trên Cloud</p>
                    {backupInfo?.exists ? (
                        <div className="text-[var(--theme-accent-primary)]">
                            <p className="font-bold text-lg">Đã có bản sao lưu</p>
                            <p className="text-xs text-[var(--theme-text-secondary)] mt-1">Ngày tạo: {backupInfo.date}</p>
                            <p className="text-xs text-[var(--theme-text-secondary)]">Dung lượng: {backupInfo.size}</p>
                        </div>
                    ) : (
                        <p className="text-[var(--theme-text-secondary)] text-sm">Chưa tìm thấy bản sao lưu nào.</p>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <button
                        onClick={handleBackup}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        disabled={isWorking}
                    >
                        {isWorking && status.includes('sao lưu') ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <UploadIcon className="w-5 h-5" />}
                        <span>Sao lưu lên Cloud</span>
                    </button>
                    <p className="text-[10px] text-center text-[var(--theme-text-secondary)]">Ghi đè bản sao lưu cũ trên Drive bằng dữ liệu hiện tại.</p>

                    <button
                        onClick={handleRestore}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2"
                        disabled={isWorking || !backupInfo?.exists}
                    >
                        {isWorking && status.includes('khôi phục') ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <DownloadIcon className="w-5 h-5" />}
                        <span>Khôi phục từ Cloud</span>
                    </button>
                    <p className="text-[10px] text-center text-[var(--theme-text-secondary)]">Tải dữ liệu từ Drive về máy và ghi đè dữ liệu hiện tại.</p>
                </div>
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
