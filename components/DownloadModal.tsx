
import React, { useEffect, useRef } from 'react';
import { CloseIcon, SpinnerIcon, StopIcon } from './icons';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalChapters: number;
  downloadedCount: number;
  isDownloading: boolean;
  currentAction: string;
  logs: string[];
  onStop: () => void;
}

const DownloadModal: React.FC<DownloadModalProps> = ({ 
    isOpen, onClose, totalChapters, downloadedCount, 
    isDownloading, currentAction, logs, onStop 
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  if (!isOpen) return null;

  const percentage = totalChapters > 0 ? Math.round((downloadedCount / totalChapters) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-[200] flex justify-center items-center p-4 animate-fade-in">
      <div className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-lg border border-[var(--theme-border)] flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <h2 className="text-xl font-bold text-[var(--theme-text-primary)] flex items-center gap-2">
            {isDownloading ? (
                <>
                    <SpinnerIcon className="w-6 h-6 text-[var(--theme-accent-primary)] animate-spin" />
                    Đang cào truyện...
                </>
            ) : (
                'Hoàn tất / Đã dừng'
            )}
          </h2>
          {!isDownloading && (
              <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]">
                <CloseIcon className="w-6 h-6" />
              </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
            {/* Progress Bar */}
            <div>
                <div className="flex justify-between text-sm text-[var(--theme-text-primary)] mb-2 font-medium">
                    <span>Tiến độ: {downloadedCount} / {totalChapters} chương</span>
                    <span>{percentage}%</span>
                </div>
                <div className="w-full bg-[var(--theme-bg-base)] rounded-full h-4 border border-[var(--theme-border)] overflow-hidden relative">
                    <div 
                        className="bg-gradient-to-r from-teal-500 to-[var(--theme-accent-primary)] h-full rounded-full transition-all duration-300 relative" 
                        style={{ width: `${percentage}%` }}
                    >
                        {/* Shimmer effect */}
                        {isDownloading && (
                            <div className="absolute top-0 left-0 bottom-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite] -skew-x-12"></div>
                        )}
                    </div>
                </div>
                <p className="text-xs text-[var(--theme-text-secondary)] mt-2 text-center italic">
                    {currentAction}
                </p>
            </div>

            {/* Logs Console */}
            <div className="bg-black/50 rounded-md p-3 border border-[var(--theme-border)] font-mono text-xs h-48 overflow-y-auto custom-scrollbar">
                {logs.length === 0 && <p className="text-gray-500">Đang chuẩn bị...</p>}
                {logs.map((log, index) => (
                    <div key={index} className="mb-1 break-words">
                        <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>{' '}
                        <span className={log.includes('Lỗi') ? 'text-red-400' : 'text-green-400'}>
                            {log}
                        </span>
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>

            {/* Warning */}
            {isDownloading && (
                <div className="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                    <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <p className="text-xs text-yellow-200/80">
                        Vui lòng <strong>không tắt tab này</strong> khi đang tải. Hệ thống đang tải từng đợt để tránh bị chặn IP. Tốc độ tải phụ thuộc vào mạng và phản hồi từ nguồn truyện.
                    </p>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--theme-bg-base)] rounded-b-lg border-t border-[var(--theme-border)] flex justify-end">
            {isDownloading ? (
                <button 
                    onClick={onStop}
                    className="flex items-center gap-2 px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
                >
                    <StopIcon className="w-5 h-5" />
                    Dừng tải
                </button>
            ) : (
                <button 
                    onClick={onClose}
                    className="px-6 py-2 bg-[var(--theme-accent-primary)] hover:brightness-110 text-white font-bold rounded-lg transition-colors"
                >
                    Đóng
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default DownloadModal;
