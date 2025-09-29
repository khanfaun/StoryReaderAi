
import React, { useState, useEffect } from 'react';
import { isAiStudio } from '../services/apiKeyService';
import { CloseIcon, SpinnerIcon, EyeIcon, EyeSlashIcon } from './icons';
import type { TokenUsage } from '../services/apiKeyService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onValidateAndSave: (key: string) => Promise<true | string>;
  onDelete: () => void;
  currentKey: string | null;
  tokenUsage: TokenUsage;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onValidateAndSave, onDelete, currentKey, tokenUsage }) => {
  const [apiKey, setApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(!currentKey);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isSavedKeyVisible, setIsSavedKeyVisible] = useState(false);

  const FREE_TIER_BENCHMARK = 1000000; // Mốc tham khảo, không phải giới hạn cứng
  const usagePercentage = Math.min((tokenUsage.totalTokens / FREE_TIER_BENCHMARK) * 100, 100);

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
  
  const inAiStudio = isAiStudio();
  const isKeyRequiredOnLoad = !currentKey;

  if (!isOpen) return null;

  return (
    <div className="sync-modal-overlay" onClick={isKeyRequiredOnLoad ? undefined : onClose} role="dialog" aria-modal="true" aria-labelledby="api-key-modal-title">
      <div className="sync-modal" onClick={e => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="api-key-modal-title" className="sync-modal__title">Quản lý API Key</h2>
          {!isKeyRequiredOnLoad && (
            <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
              <CloseIcon className="sync-modal__close-icon" />
            </button>
          )}
        </header>
        
        <div className="p-6">
          {inAiStudio ? (
             <div className="text-center p-4 bg-emerald-900/50 border border-emerald-700 rounded-lg mb-4">
                <p className="text-emerald-300 font-semibold">Môi trường AI Studio</p>
                <p className="text-emerald-400 mt-2 text-sm">Bạn đang chạy trong môi trường AI Studio. API Key của môi trường sẽ được tự động sử dụng. Bạn có thể nhập một giá trị bất kỳ để tiếp tục.</p>
            </div>
          ) : (
             <div className="sync-modal__description">
                <p>Để sử dụng các tính năng AI (phân tích nhân vật, trò chuyện), bạn cần cung cấp Google AI API Key.</p>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--theme-accent-primary)] hover:underline font-semibold">
                    Nhận API Key của bạn tại đây
                </a>
             </div>
          )}

          {isEditing || !currentKey ? (
            <form onSubmit={handleSubmit} className="sync-modal-form mt-4">
              <div>
                <label htmlFor="apiKey" className="sync-modal-form__label">Google AI API Key</label>
                <div className="relative">
                    <input
                      type={isKeyVisible ? 'text' : 'password'}
                      id="apiKey"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className="sync-modal-form__input pr-10"
                      placeholder={inAiStudio ? "Nhập giá trị bất kỳ để tiếp tục" : "Dán API Key của bạn vào đây"}
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
              <div className="sync-modal-form__actions">
                {currentKey && <button type="button" onClick={() => setIsEditing(false)} className="sync-modal-form__button sync-modal-form__button--secondary" disabled={isValidating}>Hủy</button>}
                <button type="submit" className="sync-modal-form__button sync-modal-form__button--primary" disabled={isValidating}>
                  {isValidating ? <SpinnerIcon className="sync-modal-form__spinner" /> : 'Lưu & Xác thực'}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4">
              <p className="sync-modal-form__label">API Key hiện tại</p>
              <div className="flex items-center justify-between p-3 bg-[var(--theme-bg-base)] rounded-md border border-[var(--theme-border)]">
                <span className="font-mono text-sm text-[var(--theme-text-secondary)] break-all">
                  {isSavedKeyVisible ? currentKey : `••••••••••••••••••••${currentKey?.slice(-4)}`}
                </span>
                <div className="flex gap-2 flex-shrink-0 ml-2">
                    <button type="button" onClick={() => setIsSavedKeyVisible(!isSavedKeyVisible)} className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]">
                        {isSavedKeyVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                    <button onClick={() => setIsEditing(true)} className="text-sm text-[var(--theme-accent-primary)] hover:underline font-semibold">Sửa</button>
                    <button onClick={handleDelete} className="text-sm text-rose-500 hover:underline font-semibold">Xóa</button>
                </div>
              </div>

              <div className="mt-6">
                <p className="sync-modal-form__label">Theo dõi Token (Ước tính tháng này)</p>
                <div className="w-full bg-[var(--theme-bg-base)] rounded-full h-4 border border-[var(--theme-border)] overflow-hidden">
                    <div 
                    className="bg-[var(--theme-accent-primary)] h-full rounded-full transition-all duration-500"
                    style={{ width: `${usagePercentage}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-xs text-[var(--theme-text-secondary)] mt-1">
                    <span>{tokenUsage.totalTokens.toLocaleString()} / {FREE_TIER_BENCHMARK.toLocaleString()}</span>
                    <span>{usagePercentage.toFixed(2)}%</span>
                </div>
                <p className="text-xs text-[var(--theme-text-secondary)] mt-2 italic">
                    Gói miễn phí của Gemini chủ yếu giới hạn theo Số Yêu Cầu Mỗi Phút (RPM). Bộ đếm này là một công cụ tham khảo giúp bạn hình dung mức độ sử dụng. Con số {FREE_TIER_BENCHMARK.toLocaleString()} là một mốc an toàn, không phải giới hạn chính thức từ Google.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
