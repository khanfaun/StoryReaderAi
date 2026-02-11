
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isAiStudio } from '../services/apiKeyService';
import { CloseIcon, SpinnerIcon, EyeIcon, EyeSlashIcon, WrenchScrewdriverIcon, TrashIcon, PlusIcon, CheckIcon } from './icons';
import * as apiKeyService from '../services/apiKeyService';
import type { TokenUsage } from '../services/apiKeyService';
import type { ApiKeyInfo } from '../types';
import { injectDemoData } from '../services/demoData';
import ConfirmationModal from './ConfirmationModal';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onValidateKey: (key: string) => Promise<true | string>;
  onDataChange: () => void;
  tokenUsage: TokenUsage;
}

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

const statusIcons: Record<ValidationStatus, React.ReactNode> = {
    idle: null,
    validating: <SpinnerIcon className="w-5 h-5 text-yellow-500 animate-spin" />,
    valid: <CheckIcon className="w-5 h-5 text-green-500" />,
    invalid: <CloseIcon className="w-5 h-5 text-rose-500" />,
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onValidateKey, onDataChange, tokenUsage }) => {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  
  const [newKeyInputs, setNewKeyInputs] = useState<Array<{ id: number; value: string }>>([{ id: Date.now(), value: '' }]);
  const [validationResults, setValidationResults] = useState<Record<number, { status: ValidationStatus; message?: string }>>({});
  
  const [isBatchValidating, setIsBatchValidating] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyInfo | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);

  const TOKEN_FREE_TIER_BENCHMARK = 1000000;
  const tokenUsagePercentage = Math.min((tokenUsage.totalTokens / TOKEN_FREE_TIER_BENCHMARK) * 100, 100);
  
  const inAiStudio = isAiStudio();

  const refreshKeys = () => {
    setKeys(apiKeyService.getApiKeys());
    setActiveKeyId(apiKeyService.getActiveApiKeyId());
  };

  useEffect(() => {
    if (isOpen) {
      refreshKeys();
      setNewKeyInputs([{ id: Date.now(), value: '' }]);
      setValidationResults({});
      setIsBatchValidating(false);
    }
  }, [isOpen]);

  const handleSetActive = (id: string) => {
    apiKeyService.setActiveApiKeyId(id);
    setActiveKeyId(id);
    onDataChange();
  };
  
  const handleNewKeyChange = (id: number, value: string) => {
      setNewKeyInputs(prev => prev.map(input => input.id === id ? { ...input, value } : input));
      // Reset validation status on change
      if (validationResults[id]) {
          setValidationResults(prev => ({ ...prev, [id]: { status: 'idle' } }));
      }
  };

  const handleAddKeyInput = () => {
      setNewKeyInputs(prev => [...prev, { id: Date.now(), value: '' }]);
  };

  const handleRemoveKeyInput = (id: number) => {
      setNewKeyInputs(prev => prev.filter(input => input.id !== id));
      const newResults = { ...validationResults };
      delete newResults[id];
      setValidationResults(newResults);
  };
  
  const handleBatchValidateAndSave = async () => {
      const keysToValidate = newKeyInputs.filter(input => input.value.trim());
      if (keysToValidate.length === 0) return;

      setIsBatchValidating(true);
      
      const newResults: typeof validationResults = {};
      keysToValidate.forEach(k => { newResults[k.id] = { status: 'validating' } });
      setValidationResults(prev => ({...prev, ...newResults}));

      let hasAddedKeys = false;
      const remainingInputs = [...newKeyInputs];

      for (const input of keysToValidate) {
          const result = await onValidateKey(input.value.trim());
          if (result === true) {
              const newKey = apiKeyService.addApiKey(input.value.trim());
              // Auto-activate if it's the very first key
              if (keys.length === 0 && !hasAddedKeys) {
                handleSetActive(newKey.id);
              }
              newResults[input.id] = { status: 'valid' };
              // Remove successful input from the list
              const index = remainingInputs.findIndex(i => i.id === input.id);
              if (index > -1) remainingInputs.splice(index, 1);
              hasAddedKeys = true;
          } else {
              newResults[input.id] = { status: 'invalid', message: result };
          }
          setValidationResults(prev => ({...prev, ...newResults}));
      }
      
      setIsBatchValidating(false);
      
      if (hasAddedKeys) {
          refreshKeys();
          onDataChange();
      }
      
      // If all inputs were processed, add a new empty one, otherwise keep the failed ones
      setNewKeyInputs(remainingInputs.length === 0 ? [{ id: Date.now(), value: '' }] : remainingInputs);
  };


  const handleConfirmDelete = () => {
    if (keyToDelete) {
        apiKeyService.deleteApiKey(keyToDelete.id);
        setKeyToDelete(null);
        refreshKeys();
        onDataChange();
    }
  };
  
  const handleLoadDemo = async () => {
      setIsLoadingDemo(true);
      try {
          await injectDemoData();
          onDataChange();
          alert("Đã thêm dữ liệu demo thành công!");
          onClose();
      } catch (e) {
          alert("Lỗi khi thêm dữ liệu demo: " + (e instanceof Error ? e.message : String(e)));
      } finally {
          setIsLoadingDemo(false);
      }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="sync-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="api-key-modal-title">
        <div className="sync-modal max-w-lg" onClick={e => e.stopPropagation()}>
          <header className="sync-modal__header">
            <h2 id="api-key-modal-title" className="sync-modal__title">Quản lý API Key</h2>
            <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
              <CloseIcon className="sync-modal__close-icon" />
            </button>
          </header>
          
          <div className="p-6 overflow-y-auto max-h-[85vh]">
            <div className="sync-modal__description !p-0 !pb-4">
                <p>Chọn một key để kích hoạt. Bạn có thể thêm nhiều key cùng lúc và hệ thống sẽ tự động xác thực chúng.</p>
                {!inAiStudio && (
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--theme-accent-primary)] hover:underline font-semibold block mt-2">
                        Nhận API Key của bạn tại đây
                    </a>
                )}
            </div>

            {/* Key List */}
            <div className="space-y-3">
                {keys.length === 0 && (
                    <p className="text-center text-sm text-[var(--theme-text-secondary)] py-4">Chưa có API key nào được lưu.</p>
                )}
                {keys.map(keyInfo => (
                    <div key={keyInfo.id} className="bg-[var(--theme-bg-base)] p-3 rounded-lg border border-[var(--theme-border)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-grow overflow-hidden">
                        <input
                        type="radio"
                        name="activeKey"
                        id={`key-${keyInfo.id}`}
                        checked={activeKeyId === keyInfo.id}
                        onChange={() => handleSetActive(keyInfo.id)}
                        className="w-4 h-4 text-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)] border-gray-500 focus:ring-[var(--theme-accent-primary)] focus:ring-2"
                        />
                        <label htmlFor={`key-${keyInfo.id}`} className="flex-grow cursor-pointer overflow-hidden">
                        <p className="font-mono text-sm text-[var(--theme-text-primary)]">Key ••••••••{keyInfo.key.slice(-4)}</p>
                        </label>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1">
                        <button onClick={() => setKeyToDelete(keyInfo)} className="p-2 text-slate-400 hover:text-rose-500 rounded-md transition-colors" title="Xóa Key">
                        <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                    </div>
                ))}
            </div>
            
            {/* Batch Add Form */}
            <div className="sync-modal-form !p-0 mt-6 pt-4 border-t border-[var(--theme-border)]">
                <h3 className="text-lg font-semibold mb-3">Thêm API Key mới</h3>
                <div className="space-y-3">
                    {newKeyInputs.map((input, index) => {
                        const result = validationResults[input.id];
                        return (
                            <div key={input.id}>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-grow">
                                        <input
                                            type="password"
                                            placeholder="Dán API key của bạn vào đây"
                                            value={input.value}
                                            onChange={(e) => handleNewKeyChange(input.id, e.target.value)}
                                            className="sync-modal-form__input pr-12"
                                            disabled={isBatchValidating}
                                        />
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                            {result && statusIcons[result.status]}
                                        </div>
                                    </div>
                                    {newKeyInputs.length > 1 && (
                                        <button type="button" onClick={() => handleRemoveKeyInput(input.id)} className="p-2 text-slate-400 hover:text-rose-500 rounded-md transition-colors" disabled={isBatchValidating}>
                                            <TrashIcon className="w-5 h-5"/>
                                        </button>
                                    )}
                                </div>
                                {result?.status === 'invalid' && <p className="text-xs text-rose-400 mt-1 ml-1">{result.message}</p>}
                            </div>
                        );
                    })}
                </div>
                
                <button onClick={handleAddKeyInput} disabled={isBatchValidating} className="mt-3 flex items-center gap-2 text-sm text-[var(--theme-accent-primary)] hover:underline font-semibold disabled:opacity-50">
                    <PlusIcon className="w-4 h-4" />
                    Thêm Key khác
                </button>
                
                <div className="sync-modal-form__actions justify-center pt-4">
                    <button type="button" onClick={handleBatchValidateAndSave} className="sync-modal-form__button sync-modal-form__button--primary w-full sm:w-auto" disabled={isBatchValidating}>
                        {isBatchValidating ? <SpinnerIcon className="sync-modal-form__spinner" /> : 'Lưu & Xác thực các Key mới'}
                    </button>
                </div>
            </div>

            <hr className="my-6 border-[var(--theme-border)]" />
            
            {/* Usage Stats */}
            <div>
                <p className="sync-modal-form__label">Sử dụng AI tháng này (của key đang active)</p>
                <div className="w-full bg-[var(--theme-bg-base)] rounded-full h-4 border border-[var(--theme-border)] overflow-hidden">
                    <div className="bg-[var(--theme-accent-primary)] h-full rounded-full transition-all duration-500" style={{ width: `${tokenUsagePercentage}%` }}></div>
                </div>
                <div className="flex justify-between text-xs text-[var(--theme-text-secondary)] mt-1">
                    <span>{tokenUsage.totalTokens.toLocaleString()} / {TOKEN_FREE_TIER_BENCHMARK.toLocaleString()} tokens (ước tính)</span>
                    <span>{tokenUsagePercentage.toFixed(2)}%</span>
                </div>
            </div>

            {inAiStudio && (
                <div className="mt-6 pt-4 border-t border-[var(--theme-border)]">
                    <button onClick={handleLoadDemo} disabled={isLoadingDemo} className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-[var(--theme-bg-surface)] hover:brightness-110 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] rounded-md transition-colors text-xs border border-[var(--theme-border)] border-dashed hover:border-solid">
                        {isLoadingDemo ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : <WrenchScrewdriverIcon className="w-3 h-3" />}
                        <span>Nạp dữ liệu Demo (Dành cho Dev)</span>
                    </button>
                </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={!!keyToDelete}
        onClose={() => setKeyToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Xác nhận xóa API Key"
      >
        <p>Bạn có chắc muốn xóa vĩnh viễn key <strong className="text-[var(--theme-text-primary)] font-mono">••••••••{keyToDelete?.key.slice(-4)}</strong>?</p>
      </ConfirmationModal>
    </>,
    document.body
  );
};

export default ApiKeyModal;
