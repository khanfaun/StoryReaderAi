import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
// FIX: Correctly import ChatMessage from the central types file.
import type { ChatMessage } from '../types';
import { CloseIcon, SpinnerIcon } from './icons';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  storyTitle?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, messages, onSendMessage, isLoading, storyTitle }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const panelContent = (
    <>
      <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)] sticky top-0 bg-[var(--theme-bg-surface)] z-10">
        <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">AI Trò chuyện</h2>
        <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-3xl leading-none">&times;</button>
      </div>
      <div className="flex-grow p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.length === 0 && (
             <div className="text-center text-[var(--theme-text-secondary)] p-6">
                <p>Bắt đầu cuộc trò chuyện về "{storyTitle || 'cuốn sách này'}"!</p>
                <p className="text-sm mt-2">Bạn có thể hỏi về nhân vật, tóm tắt tình tiết, hoặc các chi tiết khác.</p>
             </div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-[var(--theme-accent-primary)] text-white' : 'bg-[var(--theme-bg-base)]'}`}>
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex justify-start">
                <div className="max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl bg-[var(--theme-bg-base)] flex items-center">
                    <SpinnerIcon className="animate-spin w-5 h-5 text-[var(--theme-accent-primary)]" />
                </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-[var(--theme-border)] sticky bottom-0 bg-[var(--theme-bg-surface)]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Hỏi AI điều gì đó..."
            disabled={isLoading}
            className="flex-grow bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-full py-2 px-4 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-10 h-10 flex-shrink-0 bg-[var(--theme-accent-primary)] text-white rounded-full flex items-center justify-center transition-colors hover:brightness-90 disabled:bg-slate-600 disabled:cursor-not-allowed"
            aria-label="Gửi tin nhắn"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );

  return createPortal(
    <div
      className={`fixed inset-0 z-40 transition-all duration-300 ${isOpen ? 'bg-black/60' : 'bg-transparent pointer-events-none'}`}
      onClick={onClose}
    >
      <div
        className={`fixed top-0 bottom-0 left-0 w-full max-w-md bg-[var(--theme-bg-surface)] shadow-2xl transition-transform duration-300 ease-in-out border-r border-[var(--theme-border)] flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-panel-title"
      >
        {panelContent}
      </div>
    </div>,
    document.body
  );
};

export default ChatPanel;
