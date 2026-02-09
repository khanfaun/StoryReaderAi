
import React, { useEffect, useState, useRef } from 'react';
import type { Story, CharacterStats, DownloadConfig, GoogleUser } from '../types';
import { CloseIcon, PlusIcon, TrashIcon, DownloadIcon, CheckIcon, SpinnerIcon, UploadIcon, SparklesIcon, CloudIcon } from './icons';
import { exportStoryData, importStoryData } from '../services/storyStateService';
import * as driveService from '../services/googleDriveService';
import { uploadStoryToDrive } from '../services/sync';

interface Range {
    id: string;
    start: number | ''; 
    end: number | '';
}

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story | null;
  onStartDownload: (config: DownloadConfig) => void;
  isBackgroundDownloading?: boolean;
  onDataImported?: () => void; // New prop to refresh data in App
  googleUser: GoogleUser | null; // Receive user from App
}

type Preset = 'all' | '50' | '100' | 'custom';
type ModalTab = 'ebook' | 'ai_data' | 'drive';

const DownloadModal: React.FC<DownloadModalProps> = ({ 
    isOpen, 
    onClose, 
    story, 
    onStartDownload, 
    isBackgroundDownloading = false,
    onDataImported,
    googleUser 
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('ebook');
  
  // Ebook State
  const [preset, setPreset] = useState<Preset>('all');
  const [ranges, setRanges] = useState<Range[]>([]);
  const [format, setFormat] = useState<'epub' | 'html'>('epub');
  const [mergeCustom, setMergeCustom] = useState(false);
  
  // AI Data State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drive State
  const [isDriveProcessing, setIsDriveProcessing] = useState(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState('');
  
  // Login Feedback
  const [loginSuccess, setLoginSuccess] = useState(false);
  const prevUserRef = useRef<GoogleUser | null>(null);
  
  const totalChapters = story?.chapters?.length || 0;

  useEffect(() => {
    if (isOpen) {
        setPreset('all');
        setFormat('epub');
        setMergeCustom(false);
        setActiveTab('ebook'); // Reset to default tab
        handlePresetChange('all', totalChapters); 
        
        // Reset message
        setDriveStatusMsg('');
        setLoginSuccess(false);
    }
  }, [isOpen, totalChapters]);

  // Effect to detect successful login and show feedback
  useEffect(() => {
      // If previous was null and current is set -> Just logged in
      if (!prevUserRef.current && googleUser) {
          setLoginSuccess(true);
          setTimeout(() => setLoginSuccess(false), 3000);
      }
      prevUserRef.current = googleUser;
  }, [googleUser]);

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

  // --- GOOGLE DRIVE LOGIC ---
  const handleDriveSignIn = () => {
      driveService.signIn();
  };

  const handleDriveUpload = async () => {
      if (!story || !googleUser) return;
      setIsDriveProcessing(true);
      setDriveStatusMsg('Đang tải lên...');
      try {
          await uploadStoryToDrive(story);
          setDriveStatusMsg('Đã tải lên thành công!');
          setTimeout(() => setDriveStatusMsg(''), 3000);
      } catch (e) {
          console.error(e);
          setDriveStatusMsg(`Lỗi: ${(e as Error).message}`);
      } finally {
          setIsDriveProcessing(false);
      }
  };

  const handleDriveImport = async () => {
      if (!story || !googleUser) return;
      setIsDriveProcessing(true);
      setDriveStatusMsg('Đang tìm file trên Drive...');
      
      try {
          const STORY_PREFIX = 'story_metadata_';
          // Sanitize naming logic same as sync.ts
          const fileName = `${STORY_PREFIX}${story.url.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
          
          const files = await driveService.listFiles();
          const targetFile = files.find(f => f.name === fileName);

          if (!targetFile) {
              setDriveStatusMsg('Không tìm thấy bản lưu nào của truyện này trên Drive.');
              return;
          }

          setDriveStatusMsg('Đang tải về...');
          const content = await driveService.downloadFile(targetFile.id);
          
          if (!content) {
              throw new Error("File rỗng hoặc không tải được.");
          }

          // Convert JSON content back to File object to reuse importStoryData logic
          // Note: The structure from Drive (via sync.ts) might need adaptation if importStoryData expects the 'export' format.
          // Check sync.ts: payload = { story, aiState, readChapters, lastModified }
          // Check storyStateService.ts: importStoryData expects { version, data: { storyStates: ... } } OR legacy format.
          
          // Construct a compatible format for importStoryData
          // We wrap the cloud payload into the structure importStoryData expects
          const compatibleData = {
              version: 2,
              timestamp: new Date().toISOString(),
              data: {
                  storyStates: {
                      [story.url]: {
                          stats: content.aiState,
                          readChapters: content.readChapters,
                          // cachedChapters: content.cachedChapters // If we start syncing cache to drive
                      }
                  }
              }
          };

          const blob = new Blob([JSON.stringify(compatibleData)], { type: 'application/json' });
          const file = new File([blob], fileName, { type: 'application/json' });

          setDriveStatusMsg('Đang nhập dữ liệu...');
          await importStoryData(file, story, onDataImported);
          setDriveStatusMsg('Đã đồng bộ từ Drive thành công!');
          setTimeout(() => setDriveStatusMsg(''), 3000);

      } catch (e) {
          console.error(e);
          setDriveStatusMsg(`Lỗi: ${(e as Error).message}`);
      } finally {
          setIsDriveProcessing(false);
      }
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
                    Tải truyện (Ebook)
                </button>
                <button 
                    className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'ai_data' ? 'text-[var(--theme-accent-primary)] border-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] border-transparent hover:text-[var(--theme-text-primary)]'}`}
                    onClick={() => setActiveTab('ai_data')}
                >
                    Dữ liệu AI (Local)
                </button>
                <button 
                    className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'drive' ? 'text-blue-500 border-blue-500 bg-[var(--theme-bg-base)]' : 'text-[var(--theme-text-secondary)] border-transparent hover:text-blue-400'}`}
                    onClick={() => setActiveTab('drive')}
                >
                    Google Drive
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

                {/* TAB CONTENT: AI DATA IMPORT/EXPORT (LOCAL) */}
                {activeTab === 'ai_data' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="p-4 bg-purple-900/30 border border-purple-700/50 rounded-lg flex items-start gap-3">
                            <div className="p-2 bg-purple-800/50 rounded-full">
                                <SparklesIcon className="w-5 h-5 text-purple-300" />
                            </div>
                            <div>
                                <h3 className="font-bold text-purple-200 mb-1 text-sm">Quản lý Dữ liệu Phân tích AI</h3>
                                <p className="text-xs text-purple-100/80 leading-relaxed">
                                    File JSON chứa toàn bộ dữ liệu phân tích và tiến độ đọc của truyện này. Dùng để sao lưu hoặc chuyển dữ liệu sang thiết bị khác (thủ công).
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Export Section */}
                            <div className="p-4 border border-[var(--theme-border)] rounded-lg bg-[var(--theme-bg-base)]">
                                <h4 className="text-sm font-bold text-[var(--theme-text-primary)] mb-2">1. Tải về máy (Export)</h4>
                                <p className="text-xs text-[var(--theme-text-secondary)] mb-3">Lưu trữ file .json chứa toàn bộ thông tin AI của truyện này.</p>
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

                {/* TAB CONTENT: GOOGLE DRIVE */}
                {activeTab === 'drive' && (
                    <div className="space-y-6 animate-fade-in">
                        {!googleUser ? (
                            <div className="text-center py-8">
                                <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg mb-6 max-w-sm mx-auto">
                                    <CloudIcon className="w-12 h-12 text-blue-400 mx-auto mb-2" />
                                    <p className="text-sm text-blue-200 mb-2 font-semibold">Đồng bộ Google Drive</p>
                                    <p className="text-xs text-[var(--theme-text-secondary)]">
                                        Đăng nhập để sao lưu và khôi phục dữ liệu truyện này từ Google Drive của bạn.
                                    </p>
                                </div>
                                <button
                                    onClick={handleDriveSignIn}
                                    className="bg-white hover:bg-gray-100 text-gray-800 font-bold py-3 px-6 rounded-lg inline-flex items-center justify-center gap-3 transition-colors duration-300 border border-gray-300"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#clip0_17_40)"><path fill="#4285F4" d="M43.611 20.083H42V20H24V28H35.303C33.6747 33.148 29.2287 37.001 24 37C17.373 37 12 31.627 12 25C12 18.373 17.373 13 24 13C26.96 13 29.56 14.14 31.63 15.87L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5C13.464 5 5 13.464 5 24C5 34.536 13.464 43 24 43C34.536 43 43 34.536 43 24C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path><path fill="#EA4335" d="M31.63 15.87L24 22.88L37.18 10.32C33.4725 6.94524 28.9375 5.00195 24 5V13C26.96 13 29.56 14.14 31.63 15.87Z"></path><path fill="#34A853" d="M24 43C28.9375 42.998 33.4725 41.0548 37.18 37.68L31.63 32.13C29.56 33.86 26.96 35 24 35C21.04 35 18.44 33.86 16.37 32.13L10.82 37.68C14.5275 41.0548 19.0625 42.998 24 43V43Z"></path><path fill="#FBBC05" d="M42.611 20.083H24V28H35.303C34.51 30.245 33.16 32.068 31.63 32.13L37.18 37.68C40.6552 34.4172 42.6625 30.0125 42.962 25.083C43.001 24.524 43 23.5 43 23C43 22.663 42.871 21.35 42.611 20.083V20.083Z"></path></g><defs><clipPath id="clip0_17_40"><rect width="48" height="48" fill="white"></rect></clipPath></defs></svg>
                                    <span>Đăng nhập Google</span>
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-3 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-lg">
                                    <div className="flex items-center gap-3">
                                        {googleUser.imageUrl ? (
                                            <img src={googleUser.imageUrl} alt="Avatar" className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">{googleUser.name.charAt(0)}</div>
                                        )}
                                        <div>
                                            <p className="text-sm font-semibold text-[var(--theme-text-primary)]">{googleUser.name}</p>
                                            <p className="text-xs text-[var(--theme-text-secondary)]">{googleUser.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-xs text-green-400 font-medium bg-green-900/20 px-2 py-1 rounded border border-green-800">
                                        Đã kết nối
                                    </div>
                                </div>
                                
                                {loginSuccess && (
                                    <div className="p-2 text-center text-sm bg-green-900/40 text-green-400 border border-green-700/50 rounded-lg animate-fade-in">
                                        <div className="flex items-center justify-center gap-2">
                                            <CheckIcon className="w-4 h-4" />
                                            <span>Đăng nhập thành công!</span>
                                        </div>
                                    </div>
                                )}

                                {driveStatusMsg && (
                                    <div className={`p-3 text-sm rounded-lg text-center ${driveStatusMsg.includes('Lỗi') ? 'bg-red-900/30 text-red-300' : 'bg-blue-900/30 text-blue-300'}`}>
                                        {driveStatusMsg}
                                    </div>
                                )}

                                <div className="grid gap-4">
                                    <div className="p-4 border border-[var(--theme-border)] rounded-lg bg-[var(--theme-bg-base)]">
                                        <h4 className="text-sm font-bold text-[var(--theme-text-primary)] mb-2">1. Sao lưu lên Drive (Upload)</h4>
                                        <p className="text-xs text-[var(--theme-text-secondary)] mb-3">Tải dữ liệu phân tích, tiến độ đọc của truyện này lên Cloud.</p>
                                        <button 
                                            onClick={handleDriveUpload}
                                            disabled={isDriveProcessing}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-md text-sm font-semibold transition-colors w-full justify-center disabled:opacity-50 disabled:cursor-wait"
                                        >
                                            {isDriveProcessing ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <CloudIcon className="w-4 h-4" />}
                                            {isDriveProcessing ? 'Đang xử lý...' : 'Tải lên Drive'}
                                        </button>
                                    </div>

                                    <div className="p-4 border border-[var(--theme-border)] rounded-lg bg-[var(--theme-bg-base)]">
                                        <h4 className="text-sm font-bold text-[var(--theme-text-primary)] mb-2">2. Khôi phục từ Drive (Import)</h4>
                                        <p className="text-xs text-[var(--theme-text-secondary)] mb-3">Tìm bản sao lưu của truyện này trên Drive và tải về máy.</p>
                                        <button 
                                            onClick={handleDriveImport}
                                            disabled={isDriveProcessing}
                                            className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-accent-primary)] hover:brightness-110 text-white rounded-md text-sm font-semibold transition-colors w-full justify-center disabled:opacity-50 disabled:cursor-wait"
                                        >
                                            {isDriveProcessing ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <DownloadIcon className="w-4 h-4" />}
                                            {isDriveProcessing ? 'Đang xử lý...' : 'Tải về từ Drive'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
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
