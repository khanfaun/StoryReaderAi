
import React, { useState, useEffect } from 'react';
import { isAiStudio } from '../services/apiKeyService';
import { CloseIcon, SpinnerIcon, EyeIcon, EyeSlashIcon, WrenchScrewdriverIcon } from './icons';
import type { TokenUsage } from '../services/apiKeyService';
import { injectDemoData } from '../services/demoData';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onValidateAndSave: (key: string) => Promise<true | string>;
  onDelete: () => void;
  currentKey: string | null;
  tokenUsage: TokenUsage;
  onDataChange?: () => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onValidateAndSave, onDelete, currentKey, tokenUsage, onDataChange }) => {
  const [apiKey, setApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(!currentKey);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isSavedKeyVisible, setIsSavedKeyVisible] = useState(false);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);

  const TOKEN_FREE_TIER_BENCHMARK = 1000000; // Mốc tham khảo, không phải giới hạn cứng
  const tokenUsagePercentage = Math.min((tokenUsage.totalTokens / TOKEN_FREE_TIER_BENCHMARK) * 100, 100);

  useEffect(() => {
    if (isOpen) {
        setIsEditing(!currentKey);
        setApiKey('');
        setValidationError(null);
        setIsKeyVisible(false);
        setIsSavedKeyVisible(false);
    }
  }, [isOpen, currentKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setIsValidating(true);
    
    const result = await onValidateAndSave(apiKey.trim());
    
    if (result !== true) {
        setValidationError(result);
    }
    // On success, the parent component closes the modal, so no further action is needed here.
    setIsValidating(false);
  };

  const handleDelete = () => {
    onDelete();
    setIsEditing(true);
  };
  
  const handleLoadDemo = async () => {
      setIsLoadingDemo(true);
      try {
          await injectDemoData();
          if (onDataChange) onDataChange();
          alert("Đã thêm dữ liệu demo thành công!");
          onClose();
      } catch (e) {
          console.error(e);
          alert("Lỗi khi thêm dữ liệu demo: " + (e instanceof Error ? e.message : String(e)));
      } finally {
          setIsLoadingDemo(false);
      }
  };
  
  const inAiStudio = isAiStudio();

  if (!isOpen) return null;

  return (
    <div className="sync-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="api-key-modal-title">
      <div className="sync-modal" onClick={e => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="api-key-modal-title" className="sync-modal__title">Quản lý API Key</h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>
        
        <div className="p-6 overflow-y-auto max-h-[80vh]">
          {/* INTRO TEXT (Only show if no key is set) */}
          {!currentKey && (
             <div className="sync-modal__description !p-0 !pb-4">
                <p>Để sử dụng các tính năng AI (phân tích nhân vật, trò chuyện, đọc voice), bạn cần cung cấp Google AI API Key.</p>
                {!inAiStudio && (
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--theme-accent-primary)] hover:underline font-semibold block mt-2">
                        Nhận API Key của bạn tại đây
                    </a>
                )}
                {inAiStudio && (
                    <div className="text-center p-3 mt-3 bg-emerald-900/50 border border-emerald-700 rounded-lg text-sm text-emerald-300">
                        Môi trường AI Studio: API Key sẽ được tự động cấu hình.
                    </div>
                )}
             </div>
          )}

          {/* INPUT FORM OR KEY DISPLAY */}
          {isEditing || !currentKey ? (
            <form onSubmit={handleSubmit} className="sync-modal-form !p-0">
              <div>
                <label htmlFor="apiKey" className="sync-modal-form__label">Nhập API Key mới</label>
                <div className="relative">
                    <input
                      type={isKeyVisible ? 'text' : 'password'}
                      id="apiKey"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className="sync-modal-form__input pr-10"
                      placeholder={inAiStudio ? "Nhập giá trị bất kỳ..." : "Dán API Key vào đây"}
                      required
                      disabled={isValidating}
                    />
                    <button
                        type="button"
                        onClick={() => setIsKeyVisible(!isKeyVisible)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                        aria-label={isKeyVisible ? 'Ẩn API key' : 'Hiện API key'}
                    >
                        {isKeyVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                </div>
              </div>
              {validationError && (
                  <p className="text-sm text-rose-400 mt-2">{validationError}</p>
              )}
              <div className="sync-modal-form__actions flex-wrap pt-2">
                {!currentKey && !inAiStudio && (
                    <button type="button" onClick={onClose} className="sync-modal-form__button bg-transparent border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-base)] mr-auto" disabled={isValidating}>
                        Bỏ qua
                    </button>
                )}
                {currentKey && <button type="button" onClick={() => setIsEditing(false)} className="sync-modal-form__button sync-modal-form__button--secondary" disabled={isValidating}>Hủy</button>}
                <button type="submit" className="sync-modal-form__button sync-modal-form__button--primary" disabled={isValidating}>
                  {isValidating ? <SpinnerIcon className="sync-modal-form__spinner" /> : 'Lưu & Xác thực'}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-[var(--theme-bg-base)] p-3 rounded-lg border border-[var(--theme-border)] flex items-center justify-between">
                <div>
                    <p className="text-xs text-[var(--theme-text-secondary)] mb-1">API Key hiện tại</p>
                    <div className="font-mono text-sm text-[var(--theme-text-primary)] flex items-center gap-2">
                        <span>{isSavedKeyVisible ? currentKey : `••••••••••••••••••••${currentKey?.slice(-4)}`}</span>
                        <button type="button" onClick={() => setIsSavedKeyVisible(!isSavedKeyVisible)} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]">
                            {isSavedKeyVisible ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsEditing(true)} className="p-2 text-[var(--theme-accent-primary)] hover:bg-[var(--theme-bg-surface)] rounded-md transition-colors font-medium text-sm">Sửa</button>
                    <button onClick={handleDelete} className="p-2 text-rose-500 hover:bg-[var(--theme-bg-surface)] rounded-md transition-colors font-medium text-sm">Xóa</button>
                </div>
            </div>
          )}

          {/* DIVIDER */}
          <hr className="my-6 border-[var(--theme-border)]" />

          {/* STATS & NOTES (Always Visible) */}
          <div className="space-y-6">
            <div>
                <p className="sync-modal-form__label">Sử dụng tính năng Phân tích AI (Token) tháng này</p>
                <div className="w-full bg-[var(--theme-bg-base)] rounded-full h-4 border border-[var(--theme-border)] overflow-hidden">
                    <div 
                    className="bg-[var(--theme-accent-primary)] h-full rounded-full transition-all duration-500"
                    style={{ width: `${tokenUsagePercentage}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-xs text-[var(--theme-text-secondary)] mt-1">
                    <span>{tokenUsage.totalTokens.toLocaleString()} / {TOKEN_FREE_TIER_BENCHMARK.toLocaleString()} tokens (ước tính)</span>
                    <span>{tokenUsagePercentage.toFixed(2)}%</span>
                </div>
                <div className="mt-4 p-3 bg-[var(--theme-bg-base)]/50 rounded-md border border-[var(--theme-border)]">
                    <p className="text-xs text-[var(--theme-text-secondary)] italic leading-relaxed">
                        <strong>Lưu ý:</strong> Gói miễn phí của Gemini chủ yếu giới hạn theo Số Yêu Cầu Mỗi Phút (RPM). Bộ đếm này là công cụ tham khảo giúp bạn hình dung mức độ sử dụng trong tháng.
                    </p>
                </div>
            </div>
          </div>
          
          {/* DEMO DATA BUTTON */}
          <div className="mt-6 pt-4 border-t border-[var(--theme-border)]">
              <button 
                onClick={handleLoadDemo}
                disabled={isLoadingDemo}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-700/30 hover:bg-slate-700/50 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] rounded-md transition-colors text-xs border border-[var(--theme-border)] border-dashed hover:border-solid"
              >
                  {isLoadingDemo ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : <WrenchScrewdriverIcon className="w-3 h-3" />}
                  <span>Nạp dữ liệu Demo (Dành cho Dev)</span>
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
