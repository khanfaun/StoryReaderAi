
import React from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  hideCancel?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, children, confirmText, cancelText, confirmButtonClass, hideCancel }) => {
  if (!isOpen) return null;

  const defaultConfirmClass = "px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors";

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 z-[150] flex justify-center items-center p-4" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
    >
      <div
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-md flex flex-col border border-[var(--theme-border)] animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <h2 id="confirmation-modal-title" className="text-xl font-bold text-[var(--theme-text-primary)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]" aria-label="Đóng">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 text-[var(--theme-text-secondary)]">
          {children}
        </div>

        <div className="flex justify-end gap-3 p-4 bg-[var(--theme-bg-base)] rounded-b-lg">
          {!hideCancel && (
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors"
            >
              {cancelText || 'Hủy'}
            </button>
          )}
          <button 
            type="button" 
            onClick={onConfirm} 
            className={confirmButtonClass || defaultConfirmClass}
          >
            {confirmText || 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmationModal;
