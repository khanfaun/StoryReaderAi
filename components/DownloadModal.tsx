
import React, { useEffect, useState, useRef } from 'react';
import type { Story, CharacterStats } from '../types';
import { CloseIcon, PlusIcon, TrashIcon, DownloadIcon, CheckIcon, SpinnerIcon, UploadIcon, SparklesIcon } from './icons';
import { exportStoryData, importStoryData } from '../services/storyStateService';

interface Range {
    id: string;
    start: number | ''; 
    end: number | '';
}

export interface DownloadConfig {
    story: Story;
    target: 'download'; 
    preset: 'all' | '50' | '100' | 'custom';
    ranges: { start: number; end: number }[];
    format: 'epub' | 'html';
    mergeCustom: boolean;
}

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story | null;
  onStartDownload: (config: DownloadConfig) => void;
  isBackgroundDownloading?: boolean;
  onDataImported?: () => void; // New prop to refresh data in App
}

type Preset = 'all' | '50' | '100' | 'custom';
type ModalTab = 'ebook' | 'ai_data';

const DownloadModal: React.FC<DownloadModalProps> = ({ 
    isOpen, 
    onClose, 
    story, 
    onStartDownload, 
    isBackgroundDownloading = false,
    onDataImported 
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('ebook');
  
  // Ebook State
  const [preset, setPreset] = useState<Preset>('all');
  const [ranges, setRanges] = useState<Range[]>([]);
  const [format, setFormat] = useState<'epub' | 'html'>('epub');
  const [mergeCustom, setMergeCustom] = useState(false);
  
  // AI Data State
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const totalChapters = story?.chapters?.length || 0;

  useEffect(() => {
    if (isOpen) {
        setPreset('all');
        setFormat('epub');
        setMergeCustom(false);
        setActiveTab('ebook'); // Reset to default tab
        handlePresetChange('all', totalChapters); 
    }
  }, [isOpen, totalChapters]);

  // --- EBOOK LOGIC ---
  const handlePresetChange = (newPreset: Preset, total: number = totalChapters) => {
      setPreset(newPreset);
      let newRanges: Range[] = [];
      
      if (newPreset === 'all') {
          newRanges = [{ id: 'all', start: 1, end: total }];
      } else if (newPreset === '50' || newPreset === '100') {
          const size = parseInt(newPreset);
          for (let i = 1; i <= total; i += size) {
              newRanges.push({
                  id: `chunk-${i}`,
                  start: i,
                  end: Math.min(i + size - 1, total)
              });
          }
      } else {
          newRanges = [{ id: Date.now().toString(), start: '', end: '' }];
      }
      setRanges(newRanges);
  };

  const addRange = () => {
      setRanges(prev => [...prev, { id: Date.now().toString(), start: '', end: '' }]);
  };

  const removeRange = (id: string) => {
      if (ranges.length > 1) {
          setRanges(prev => prev.filter(r => r.id !== id));
      }
  };

  const updateRange = (id: string, field: 'start' | 'end', value: string) => {
      if (value === '') {
          setRanges(prev => prev.map(r => r.id === id ? { ...r, [field]: '' } : r));
          return;
      }
      const val = parseInt(value);
      if (!isNaN(val)) {
          setRanges(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
      }
  };

  const handleConfirmDownload = () => {
      if (!story) return;
      let finalRanges: { start: number; end: number }[] = [];

      if (preset === 'custom') {
          finalRanges = ranges
              .map(r => ({ start: Number(r.start), end: Number(r.end) }))
              .filter(r => r.start > 0 && r.end > 0 && r.start <= r.end);
          
          if (finalRanges.length === 0) {
              alert("Vui lòng nhập ít nhất một khoảng chương hợp lệ.");
              return;
          }
      } else {
          finalRanges = ranges.map(r => ({ start: Number(r.start), end: Number(r.end) }));
      }

      onStartDownload({
          story,
          target: 'download',
          preset: preset,
          ranges: finalRanges,
          format,
          mergeCustom
      });
  };

  // --- AI DATA LOGIC (USING SHARED SERVICE) ---
  const handleExportData = async () => {
      if (!story) return;
      await exportStoryData(story);
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!story || !e.target.files?.[0]) return;
      const file = e.target.files[0];
      await importStoryData(file, story, onDataImported);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-[200] flex justify-center items-center p-4 animate-fade-in">
        <div className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-2xl border border-[var(--theme-border)] flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
                <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">Tải xuống & Dữ liệu</h2>
                <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"><CloseIcon className="w-6 h-6" /></button>
            </div>
            
            {/* TABS */}
            <div className="flex border-b border-[var(--theme-border)]">
                <button 
                    className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'ebook' ? 'text-[var(--theme-accent-primary)] border-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] border-transparent hover:text-[var(--theme-text-primary)]'}`}
                    onClick={() => setActiveTab('ebook')}
                >
                    Tải truyện (Ebook/HTML)
                </button>
                <button 
                    className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'ai_data' ? 'text-[var(--theme-accent-primary)] border-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] border-transparent hover:text-[var(--theme-text-primary)]'}`}
                    onClick={() => setActiveTab('ai_data')}
                >
                    Dữ liệu AI (JSON)
                </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
                
                {/* TAB CONTENT: EBOOK DOWNLOAD */}
                {activeTab === 'ebook' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Warning if background downloading */}
                        {isBackgroundDownloading ? (
                            <div className="p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg flex items-center gap-3 animate-pulse">
                                <SpinnerIcon className="w-6 h-6 text-yellow-500 animate-spin" />
                                <div>
                                    <h3 className="font-bold text-yellow-200 text-sm">Hệ thống đang tải dữ liệu...</h3>
                                    <p className="text-xs text-yellow-100/80">
                                        Vui lòng đợi quá trình đồng bộ hoàn tất (100%) trước khi xuất file để đảm bảo đầy đủ nội dung.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg flex items-start gap-3">
                                <div className="p-2 bg-blue-800/50 rounded-full">
                                    <CheckIcon className="w-5 h-5 text-blue-300" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-blue-200 mb-1 text-sm">Dữ liệu đã sẵn sàng</h3>
                                    <p className="text-xs text-blue-100/80 leading-relaxed">
                                        Hệ thống sẽ sử dụng dữ liệu đã lưu trong trình duyệt để đóng gói file ngay lập tức.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className={`space-y-6 transition-opacity duration-300 ${isBackgroundDownloading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                            {/* Preset Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-[var(--theme-text-secondary)] mb-2">Chọn chương:</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <button onClick={() => handlePresetChange('all')} className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${preset === 'all' ? 'border-[var(--theme-accent-primary)] bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)]' : 'border-[var(--theme-border)] bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)]'}`}>
                                        Tất cả ({totalChapters})
                                    </button>
                                    <button onClick={() => handlePresetChange('50')} className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${preset === '50' ? 'border-[var(--theme-accent-primary)] bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)]' : 'border-[var(--theme-border)] bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)]'}`}>
                                        50 chương/file
                                    </button>
                                    <button onClick={() => handlePresetChange('100')} className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${preset === '100' ? 'border-[var(--theme-accent-primary)] bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)]' : 'border-[var(--theme-border)] bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)]'}`}>
                                        100 chương/file
                                    </button>
                                    <button onClick={() => handlePresetChange('custom')} className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${preset === 'custom' ? 'border-[var(--theme-accent-primary)] bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)]' : 'border-[var(--theme-border)] bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)]'}`}>
                                        Tùy chỉnh
                                    </button>
                                </div>
                            </div>

                            {/* Range Editor (Only for Custom Download) */}
                            {preset === 'custom' && (
                                <div className="animate-fade-in">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-3">
                                            <label className="text-xs font-medium text-[var(--theme-text-secondary)]">Khoảng chương:</label>
                                            <div className="flex items-center gap-1.5">
                                                <input 
                                                    type="checkbox" 
                                                    id="mergeCustom"
                                                    checked={mergeCustom}
                                                    onChange={(e) => setMergeCustom(e.target.checked)}
                                                    className="w-3.5 h-3.5 accent-[var(--theme-accent-primary)]"
                                                />
                                                <label htmlFor="mergeCustom" className="text-xs text-[var(--theme-text-primary)] cursor-pointer select-none">
                                                    Gộp thành 1 file
                                                </label>
                                            </div>
                                        </div>
                                        <button onClick={addRange} className="flex items-center gap-1 text-xs text-[var(--theme-accent-primary)] hover:underline font-bold">
                                            <PlusIcon className="w-3 h-3" /> Thêm khoảng
                                        </button>
                                    </div>
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {ranges.map((range, index) => (
                                            <div key={range.id} className="flex items-center gap-2 bg-[var(--theme-bg-base)] p-2 rounded border border-[var(--theme-border)]">
                                                <span className="text-xs font-mono text-[var(--theme-text-secondary)] w-5">{index + 1}.</span>
                                                <div className="flex items-center gap-2 flex-1">
                                                    <input 
                                                        type="number" 
                                                        value={range.start} 
                                                        onChange={(e) => updateRange(range.id, 'start', e.target.value)}
                                                        className="w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded px-2 py-1 text-xs text-[var(--theme-text-primary)]"
                                                        placeholder="Từ"
                                                    />
                                                    <span className="text-[var(--theme-text-secondary)]">-</span>
                                                    <input 
                                                        type="number" 
                                                        value={range.end} 
                                                        onChange={(e) => updateRange(range.id, 'end', e.target.value)}
                                                        className="w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded px-2 py-1 text-xs text-[var(--theme-text-primary)]"
                                                        placeholder="Đến"
                                                    />
                                                </div>
                                                <button onClick={() => removeRange(range.id)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors" title="Xóa">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Format Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-[var(--theme-text-secondary)] mb-2">Định dạng file:</label>
                                <select 
                                    value={format} 
                                    onChange={(e) => setFormat(e.target.value as 'epub' | 'html')}
                                    className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:ring-[var(--theme-accent-primary)] text-sm"
                                >
                                    <option value="epub">EPUB (Khuyên dùng - Đọc trên mọi app)</option>
                                    <option value="html">HTML (Để in sang PDF)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB CONTENT: AI DATA IMPORT/EXPORT */}
                {activeTab === 'ai_data' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="p-4 bg-purple-900/30 border border-purple-700/50 rounded-lg flex items-start gap-3">
                            <div className="p-2 bg-purple-800/50 rounded-full">
                                <SparklesIcon className="w-5 h-5 text-purple-300" />
                            </div>
                            <div>
                                <h3 className="font-bold text-purple-200 mb-1 text-sm">Quản lý Dữ liệu Phân tích AI</h3>
                                <p className="text-xs text-purple-100/80 leading-relaxed">
                                    File JSON chứa toàn bộ dữ liệu phân tích và tiến độ đọc của truyện này. Dùng để sao lưu hoặc chuyển dữ liệu sang thiết bị khác.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Export Section */}
                            <div className="p-4 border border-[var(--theme-border)] rounded-lg bg-[var(--theme-bg-base)]">
                                <h4 className="text-sm font-bold text-[var(--theme-text-primary)] mb-2">1. Tải về máy (Export)</h4>
                                <p className="text-xs text-[var(--theme-text-secondary)] mb-3">Lưu trữ file .json chứa toàn bộ thông tin AI của truyện này (bao gồm cả phân tích từng chương).</p>
                                <button 
                                    onClick={handleExportData}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-sm font-semibold transition-colors"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Tải file JSON
                                </button>
                            </div>

                            {/* Import Section */}
                            <div className="p-4 border border-[var(--theme-border)] rounded-lg bg-[var(--theme-bg-base)]">
                                <h4 className="text-sm font-bold text-[var(--theme-text-primary)] mb-2">2. Nhập từ máy (Import)</h4>
                                <p className="text-xs text-[var(--theme-text-secondary)] mb-3">Chọn file .json đã lưu để khôi phục dữ liệu AI cho truyện này.</p>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-accent-primary)] hover:brightness-110 text-white rounded-md text-sm font-semibold transition-colors"
                                    >
                                        <UploadIcon className="w-4 h-4" />
                                        Chọn file và Nhập
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleImportData} 
                                        accept=".json" 
                                        className="hidden" 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-[var(--theme-bg-base)] rounded-b-lg border-t border-[var(--theme-border)] flex justify-end gap-3">
                <button 
                    onClick={onClose} 
                    className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors text-sm"
                >
                    Đóng
                </button>
                {activeTab === 'ebook' && (
                    <button 
                        onClick={handleConfirmDownload} 
                        disabled={isBackgroundDownloading}
                        className="flex items-center gap-2 px-6 py-2 rounded-md bg-[var(--theme-accent-primary)] hover:brightness-110 text-white font-bold transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon className="w-5 h-5" />
                        Tải về máy
                    </button>
                )}
            </div>
        </div>
    </div>
  );
};

export default DownloadModal;
