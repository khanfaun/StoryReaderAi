
import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, UploadIcon, SpinnerIcon } from './icons';

interface AudioUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: { name: string; data: string }[]) => void;
}

const AudioUploadModal: React.FC<AudioUploadModalProps> = ({ isOpen, onClose, onUpload }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
    }
  };
  
  const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const result = reader.result as string;
              // Remove the data URL prefix e.g. "data:audio/mp3;base64,"
              const base64Data = result.split(',')[1];
              resolve(base64Data);
          };
          reader.onerror = error => reject(error);
      });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsLoading(true);
    try {
      const uploadedFiles = await Promise.all(
        selectedFiles.map(async file => {
          const data = await fileToBase64(file);
          return { name: file.name, data };
        })
      );
      onUpload(uploadedFiles);
      onClose(); // Close modal on success
    } catch (error) {
        console.error("Error converting files to base64:", error);
        alert("Đã xảy ra lỗi khi xử lý file. Vui lòng thử lại.");
    } finally {
        setIsLoading(false);
        setSelectedFiles([]);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 z-[150] flex justify-center items-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-lg flex flex-col border border-[var(--theme-border)] animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">Tải lên file âm thanh</h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]" aria-label="Đóng">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div 
            className="border-2 border-dashed border-[var(--theme-border)] rounded-lg p-8 text-center cursor-pointer hover:border-[var(--theme-accent-primary)] transition-colors"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => document.getElementById('audio-upload-input')?.click()}
          >
            <UploadIcon className="w-12 h-12 mx-auto text-[var(--theme-text-secondary)]"/>
            <p className="mt-2 text-[var(--theme-text-primary)]">Kéo thả file vào đây, hoặc <span className="text-[var(--theme-accent-primary)] font-semibold">nhấn để chọn file</span></p>
            <p className="text-xs text-[var(--theme-text-secondary)] mt-1">Hỗ trợ file .mp3, .wav. Tên file sẽ được dùng làm tên đoạn trong danh sách phát.</p>
            <input 
                id="audio-upload-input"
                type="file"
                multiple
                accept="audio/mpeg, audio/wav"
                onChange={handleFileChange}
                className="hidden"
            />
          </div>
          
          {selectedFiles.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                <p className="text-sm font-semibold">File đã chọn:</p>
                <ul className="list-disc list-inside text-xs text-[var(--theme-text-secondary)]">
                    {selectedFiles.map(file => <li key={file.name} className="truncate">{file.name}</li>)}
                </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 bg-[var(--theme-bg-base)] rounded-b-lg">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors">Hủy</button>
            <button
                type="button"
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || isLoading}
                className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
            >
              {isLoading && <SpinnerIcon className="w-5 h-5 animate-spin" />}
              {isLoading ? 'Đang xử lý...' : `Tải lên ${selectedFiles.length} file`}
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AudioUploadModal;
