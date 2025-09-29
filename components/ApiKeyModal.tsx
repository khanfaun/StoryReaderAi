
import React, { useState, useEffect } from 'react';
import { isAiStudio } from '../services/apiKeyService';
import { CloseIcon } from './icons';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
  onDelete: () => void;
  currentKey: string | null;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, onDelete, currentKey }) => {
  const [apiKey, setApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(!currentKey);

  useEffect(() => {
    if (isOpen) {
        setIsEditing(!currentKey);
        setApiKey('');
    }
  }, [isOpen, currentKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      onSave(apiKey.trim());
    }
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
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="sync-modal-form__input"
                  placeholder={inAiStudio ? "Nhập giá trị bất kỳ để tiếp tục" : "Dán API Key của bạn vào đây"}
                  required
                />
              </div>
              <div className="sync-modal-form__actions">
                {currentKey && <button type="button" onClick={() => setIsEditing(false)} className="sync-modal-form__button sync-modal-form__button--secondary">Hủy</button>}
                <button type="submit" className="sync-modal-form__button sync-modal-form__button--primary">Lưu Key</button>
              </div>
            </form>
          ) : (
            <div className="mt-4">
              <p className="sync-modal-form__label">API Key hiện tại</p>
              <div className="flex items-center justify-between p-3 bg-[var(--theme-bg-base)] rounded-md border border-[var(--theme-border)]">
                <span className="font-mono text-sm text-[var(--theme-text-secondary)]">
                  ••••••••••••••••••••{currentKey?.slice(-4)}
                </span>
                <div className="flex gap-2">
                   <button onClick={() => setIsEditing(true)} className="text-sm text-[var(--theme-accent-primary)] hover:underline font-semibold">Sửa</button>
                   <button onClick={handleDelete} className="text-sm text-rose-500 hover:underline font-semibold">Xóa</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
