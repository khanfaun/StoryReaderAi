
import React from 'react';
import { CloudIcon, DownloadIcon, CloseIcon } from './icons';
import type { Story } from '../types';

interface StorageChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChoice: (choice: 'local' | 'drive') => void;
  story: Story | null;
}

const StorageChoiceModal: React.FC<StorageChoiceModalProps> = ({ isOpen, onClose, onChoice, story }) => {
  if (!isOpen || !story) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-[200] flex justify-center items-center p-4 animate-fade-in">
      <div 
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-md border border-[var(--theme-border)] animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <h2 className="text-lg font-bold text-[var(--theme-text-primary)]">Lưu truyện</h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-[var(--theme-text-primary)] mb-2">
            Bạn muốn lưu truyện <strong className="text-[var(--theme-accent-primary)]">{story.title}</strong> vào đâu?
          </p>
          <p className="text-xs text-[var(--theme-text-secondary)] mb-6">
            Lưu vào Google Drive sẽ giúp đồng bộ dữ liệu truyện và tiến độ đọc giữa các thiết bị.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => onChoice('drive')}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-blue-900/30 border border-blue-700/50 hover:bg-blue-800/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-full text-white">
                  <CloudIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block font-bold text-blue-100 group-hover:text-white">Lưu & Đồng bộ Drive</span>
                  <span className="block text-xs text-blue-300">Lưu vào trình duyệt + Cloud</span>
                </div>
              </div>
              <svg className="w-5 h-5 text-blue-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button
              onClick={() => onChoice('local')}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-[var(--theme-bg-base)] border border-[var(--theme-border)] hover:border-[var(--theme-accent-secondary)] transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-600 rounded-full text-white">
                  <DownloadIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block font-bold text-[var(--theme-text-primary)]">Chỉ lưu trên trình duyệt</span>
                  <span className="block text-xs text-[var(--theme-text-secondary)]">Offline trên thiết bị này</span>
                </div>
              </div>
              <svg className="w-5 h-5 text-[var(--theme-text-secondary)] group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StorageChoiceModal;
