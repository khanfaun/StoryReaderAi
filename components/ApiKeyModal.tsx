
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
  const [activeModelId, setActiveModelId] = useState<string>(apiKeyService.getActiveModel());
  const [isPrefetchEnabled, setIsPrefetchEnabled] = useState<boolean>(!apiKeyService.isAutoPrefetchDisabled());
  
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
    setActiveModelId(apiKeyService.getActiveModel());
    setIsPrefetchEnabled(!apiKeyService.isAutoPrefetchDisabled());
  };

  useEffect(() => {
    if (isOpen) {
      refreshKeys();
      setNewKeyInputs([{ id: Date.now(), value: '' }]);
      setValidationResults({});
      setIsBatchValidating(false);
    }
  }, [isOpen]);

  const handleTogglePrefetch = () => {
    const newValue = !isPrefetchEnabled;
    setIsPrefetchEnabled(newValue);
    apiKeyService.setAutoPrefetchDisabled(!newValue);
    onDataChange();
  };


  const handleSetActive = (id: string) => {
    apiKeyService.setActiveApiKeyId(id);
    setActiveKeyId(id);
    onDataChange();
  };

  const handleSetModel = (modelId: string) => {
    apiKeyService.setActiveModel(modelId);
    setActiveModelId(modelId);
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
        <div className="sync-modal max-w-5xl w-[95vw] lg:w-[70vw]" onClick={e => e.stopPropagation()}>
          <header className="sync-modal__header">
            <h2 id="api-key-modal-title" className="sync-modal__title">Quản lý API Key</h2>
            <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
              <CloseIcon className="sync-modal__close-icon" />
            </button>
          </header>
          
          <div className="p-6 overflow-y-auto max-h-[85vh]">
            <div className="bg-[var(--theme-bg-base)] p-4 rounded-xl border border-[var(--theme-border)] text-sm space-y-2 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-[var(--theme-text-primary)] font-semibold flex items-center gap-1.5 text-base">
                        🔑 Cài đặt API Key & Mô hình AI
                    </p>
                    {!inAiStudio && (
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--theme-accent-primary)] hover:underline font-semibold text-xs flex items-center gap-1">
                            Lấy API Key miễn phí ↗
                        </a>
                    )}
                </div>
                <p className="text-xs text-[var(--theme-text-secondary)] leading-relaxed">
                    API Key của bạn được lưu bảo mật cục bộ ở trình duyệt này, tuyệt đối không gửi về máy chủ.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                {/* Column 1 (Left - 5 cols): AI Model Selection */}
                <div className="lg:col-span-5 space-y-4 flex flex-col">
                    <div className="bg-[var(--theme-bg-surface)] p-4 rounded-xl border border-[var(--theme-border)] space-y-4 flex-grow">
                        <div>
                            <label htmlFor="model-select" className="block text-xs font-semibold mb-2 text-[var(--theme-text-primary)] uppercase tracking-wider">
                                Mô Hình Hoạt Động (AI Model)
                            </label>
                            <div className="relative">
                                <select
                                    id="model-select"
                                    value={activeModelId}
                                    onChange={(e) => handleSetModel(e.target.value)}
                                    className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] py-2.5 px-3 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)] focus:border-transparent cursor-pointer appearance-none"
                                >
                                    {apiKeyService.GEMINI_MODELS.map(model => (
                                        <option key={model.id} value={model.id} className="bg-[var(--theme-bg-surface)] py-2 text-sm text-[var(--theme-text-primary)]">
                                            {model.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[var(--theme-text-secondary)]">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--theme-bg-base)] p-3.5 rounded-lg border border-[var(--theme-border)] space-y-2">
                            <span className="text-xs font-semibold text-[var(--theme-accent-primary)] uppercase tracking-wide block">
                                Đặc trưng mô hình:
                            </span>
                            <p className="text-xs text-[var(--theme-text-primary)] font-semibold leading-relaxed">
                                {apiKeyService.GEMINI_MODELS.find(m => m.id === activeModelId)?.name}
                            </p>
                            <p className="text-[11px] text-[var(--theme-text-secondary)] leading-relaxed">
                                {apiKeyService.GEMINI_MODELS.find(m => m.id === activeModelId)?.description}
                            </p>
                        </div>

                        {/* Sử dụng AI tháng này */}
                        <div className="bg-[var(--theme-bg-base)] p-3 rounded-lg border border-[var(--theme-border)] space-y-1.5">
                            <p className="text-[10px] font-semibold text-[var(--theme-text-primary)] uppercase tracking-wider flex items-center gap-1">
                                📊 AI sử dụng tháng này (ước tính)
                            </p>
                            <div className="w-full bg-[var(--theme-bg-surface)] rounded-full h-2 overflow-hidden border border-[var(--theme-border)]">
                                <div className="bg-[var(--theme-accent-primary)] h-full rounded-full transition-all duration-500" style={{ width: `${tokenUsagePercentage}%` }}></div>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-[var(--theme-text-secondary)]">
                                <span className="font-medium">{tokenUsage.totalTokens.toLocaleString()} / {TOKEN_FREE_TIER_BENCHMARK.toLocaleString()} tokens</span>
                                <span className="font-bold text-[var(--theme-text-primary)]">{tokenUsagePercentage.toFixed(2)}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Tách biệt khỏi cụm mô hình hoạt động: Tận dụng khoảng trống ở cột trái */}
                    <div className="bg-[var(--theme-bg-surface)] p-4 rounded-xl border border-[var(--theme-border)] space-y-3">
                        <label className="block text-xs font-semibold text-[var(--theme-text-primary)] uppercase tracking-wider">
                            ⚙️ Tính Năng Đọc Truyện
                        </label>
                        <div 
                            className="flex items-center justify-between p-3 bg-[var(--theme-bg-base)] rounded-lg border border-[var(--theme-border)] hover:border-gray-500 transition-all cursor-pointer"
                            onClick={handleTogglePrefetch}
                        >
                            <div className="flex flex-col gap-0.5 select-none pr-3">
                                <span className="text-xs font-semibold text-[var(--theme-text-primary)] font-medium">Tự động phân tích chương sau</span>
                                <span className="text-[10px] text-[var(--theme-text-secondary)] leading-relaxed">Khi cuộn qua 50% chương đang đọc, hệ thống sẽ tự động phân tích và prefetch ngầm chương tiếp theo.</span>
                            </div>
                            <div className="flex-shrink-0 relative">
                                <span className={`inline-block w-10 h-6 rounded-full transition-colors duration-200 relative ${isPrefetchEnabled ? 'bg-[var(--theme-accent-primary)]' : 'bg-gray-600'}`}>
                                    <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${isPrefetchEnabled ? 'transform translate-x-4' : 'transform translate-x-0'}`}></span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {inAiStudio && (
                        <div className="bg-[var(--theme-bg-surface)] p-4 rounded-xl border border-[var(--theme-border)]">
                            <button onClick={handleLoadDemo} disabled={isLoadingDemo} className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-[var(--theme-bg-base)] hover:brightness-110 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] rounded-md transition-all text-xs border border-[var(--theme-border)] border-dashed hover:border-solid">
                                {isLoadingDemo ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : <WrenchScrewdriverIcon className="w-3 h-3" />}
                                <span>Nạp dữ liệu Demo (Dành cho Dev)</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Column 2 (Right - 7 cols): API Keys List & Add New Keys */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Keys list */}
                    <div className="bg-[var(--theme-bg-surface)] p-4 rounded-xl border border-[var(--theme-border)] space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-primary)] border-b border-[var(--theme-border)] pb-2">
                            Danh sách API Keys của bạn ({keys.length})
                        </h3>
                        
                        <div className="space-y-2 max-h-[22vh] overflow-y-auto pr-1">
                            {keys.length === 0 && (
                                <p className="text-center text-xs text-[var(--theme-text-secondary)] py-6 bg-[var(--theme-bg-base)] rounded-lg border border-[var(--theme-border)] border-dashed">
                                    Chưa lưu API key nào. Vui lòng thêm key ở dưới để bắt đầu sử dụng AI.
                                </p>
                            )}
                            {keys.map(keyInfo => (
                                <div key={keyInfo.id} className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 transition-all ${
                                    activeKeyId === keyInfo.id 
                                        ? 'border-[var(--theme-accent-primary)] bg-[var(--theme-accent-primary)]/5' 
                                        : 'border-[var(--theme-border)] bg-[var(--theme-bg-base)] hover:border-gray-500'
                                }`}>
                                    <div className="flex items-center gap-3 flex-grow overflow-hidden cursor-pointer" onClick={() => handleSetActive(keyInfo.id)}>
                                        <input
                                            type="radio"
                                            name="activeKey"
                                            id={`key-${keyInfo.id}`}
                                            checked={activeKeyId === keyInfo.id}
                                            onChange={() => handleSetActive(keyInfo.id)}
                                            className="w-4 h-4 text-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)] border-[var(--theme-border)] focus:ring-[var(--theme-accent-primary)] focus:ring-2"
                                        />
                                        <label htmlFor={`key-${keyInfo.id}`} className="flex-grow cursor-pointer overflow-hidden flex items-center justify-between">
                                            <span className="font-mono text-xs text-[var(--theme-text-primary)] tracking-wider">
                                                Key ••••••••{keyInfo.key.slice(-4)}
                                            </span>
                                            {activeKeyId === keyInfo.id && (
                                                <span className="text-[10px] bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)] font-bold px-2 py-0.5 rounded-full">
                                                    ĐANG DÙNG
                                                </span>
                                            )}
                                        </label>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setKeyToDelete(keyInfo); }} 
                                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors flex-shrink-0" 
                                        title="Xóa Key"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Mẹo nhỏ tránh quá tải */}
                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-3 rounded-lg text-xs flex items-start gap-2">
                        <span className="text-sm leading-none mt-0.5">💡</span>
                        <p className="leading-relaxed text-[11px]">
                            <strong>Mẹo tránh lỗi quá tải (Rate limit):</strong> Hãy lấy API Key từ <strong>các tài khoản Google khác nhau</strong> để hệ thống tự động xoay vòng key. *(Lưu ý: Dùng nhiều key từ cùng một tài khoản sẽ không cải thiện giới hạn tốc độ).*
                        </p>
                    </div>

                    {/* Batch Add Area */}
                    <div className="bg-[var(--theme-bg-surface)] p-4 rounded-xl border border-[var(--theme-border)] space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-primary)] border-b border-[var(--theme-border)] pb-2">
                            Thêm API Key Mới
                        </h3>
                        
                        <div className="space-y-2.5 max-h-[20vh] overflow-y-auto pr-1">
                            {newKeyInputs.map((input, index) => {
                                const result = validationResults[input.id];
                                return (
                                    <div key={input.id} className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-grow">
                                                <input
                                                    type="password"
                                                    placeholder="Dán API Key (AIzaSy...)"
                                                    value={input.value}
                                                    onChange={(e) => handleNewKeyChange(input.id, e.target.value)}
                                                    className="sync-modal-form__input pr-12 w-full text-xs font-mono py-2.5 bg-[var(--theme-bg-base)] border-[var(--theme-border)] focus:ring-[var(--theme-accent-primary)]"
                                                    disabled={isBatchValidating}
                                                />
                                                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                                    {result && statusIcons[result.status]}
                                                </div>
                                            </div>
                                            {newKeyInputs.length > 1 && (
                                                <button type="button" onClick={() => handleRemoveKeyInput(input.id)} className="flex-shrink-0 p-2 text-slate-400 hover:text-rose-500 rounded-md transition-colors" disabled={isBatchValidating}>
                                                    <TrashIcon className="w-4 h-4"/>
                                                </button>
                                            )}
                                        </div>
                                        {result?.status === 'invalid' && <p className="text-[10px] text-rose-400 font-medium ml-1">{result.message}</p>}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between border-t border-[var(--theme-border)] pt-3">
                            <button onClick={handleAddKeyInput} disabled={isBatchValidating} className="flex items-center gap-1.5 text-xs text-[var(--theme-accent-primary)] hover:underline font-semibold disabled:opacity-50">
                                <PlusIcon className="w-3.5 h-3.5" />
                                Nhập thêm dòng mới
                            </button>
                            
                            <button type="button" onClick={handleBatchValidateAndSave} className="sync-modal-form__button sync-modal-form__button--primary text-xs py-2 px-4 shadow-sm" disabled={isBatchValidating}>
                                {isBatchValidating ? <SpinnerIcon className="sync-modal-form__spinner mx-auto animate-spin" /> : 'Xác thực & Lưu'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {inAiStudio && (
                <div className="mt-8 pt-4 border-t border-[var(--theme-border)]">
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
