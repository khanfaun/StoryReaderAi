
import React, { useState, useRef, useEffect } from 'react';
import { MagnifyingGlassIcon, XMarkIcon, SpinnerIcon, QuestionMarkCircleIcon, PlusIcon, DocumentPlusIcon } from './icons';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  onOpenHelpModal: () => void;
  onAddStory?: () => void;
  onAddChapter?: () => void;
  minimalMode?: boolean; // New prop to hide extra tools
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSearch, 
  isLoading, 
  onOpenHelpModal, 
  onAddStory, 
  onAddChapter,
  minimalMode = false 
}) => {
  const [localQuery, setLocalQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) {
      onSearch(localQuery.trim());
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setLocalQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="w-full flex items-center gap-2 sm:gap-3 max-w-2xl mx-auto">
      
      {/* 1. KHU VỰC NHẬP LIỆU (Input Zone) */}
      <form 
        onSubmit={handleSubmit} 
        className={`
          relative flex-grow flex items-center h-10 px-4 rounded-full transition-all duration-300 ease-out m-0
          ${isFocused 
            ? 'bg-[var(--theme-bg-surface)] shadow-[0_0_0_2px_var(--theme-accent-primary)]' 
            : 'bg-[var(--theme-bg-base)]/50 border border-[var(--theme-border)] hover:border-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-base)]'
          }
        `}
      >
        {/* Search Icon / Spinner */}
        <div className={`flex-shrink-0 mr-3 transition-colors duration-200 ${isFocused ? 'text-[var(--theme-accent-primary)]' : 'text-[var(--theme-text-secondary)]'}`}>
          {isLoading ? (
            <SpinnerIcon className="w-4 h-4 animate-spin" />
          ) : (
            <MagnifyingGlassIcon className="w-4 h-4" />
          )}
        </div>

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Tìm truyện, tác giả hoặc dán Link..."
          className="flex-grow bg-transparent border-none outline-none text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-secondary)]/60 h-full w-full min-w-0 p-0 m-0"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Clear Button */}
        <div className={`flex-shrink-0 ml-2 transition-all duration-200 ${localQuery && !isLoading ? 'opacity-100 scale-100' : 'opacity-0 scale-0 w-0 overflow-hidden'}`}>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)] transition-colors flex items-center justify-center"
            title="Xóa tìm kiếm"
            tabIndex={-1} 
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Help Button (Moved Inside) - Hide in minimal mode */}
        {!minimalMode && (
            <div className="flex-shrink-0 ml-1">
            <button
                type="button"
                onClick={onOpenHelpModal}
                className="p-1 rounded-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)] transition-all duration-200 flex items-center justify-center"
                title="Hướng dẫn tìm kiếm"
            >
                <QuestionMarkCircleIcon className="w-5 h-5" />
            </button>
            </div>
        )}
      </form>

      {/* 2. KHU VỰC CÔNG CỤ (Tools Zone) - Ẩn trong minimal mode */}
      {!minimalMode && (onAddChapter || onAddStory) && (
        <div className="flex items-center gap-1.5 flex-shrink-0 h-10">
          {onAddChapter && (
            <button
              onClick={onAddChapter}
              className="h-9 w-9 flex items-center justify-center rounded-full text-emerald-500 bg-[var(--theme-bg-base)]/50 border border-transparent hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all duration-200"
              title="Thêm chương mới"
            >
              <DocumentPlusIcon className="w-5 h-5" />
            </button>
          )}

          {onAddStory && (
            <button
              onClick={onAddStory}
              className="h-9 w-9 flex items-center justify-center rounded-full text-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)]/50 border border-transparent hover:border-[var(--theme-accent-primary)]/50 hover:bg-[var(--theme-accent-primary)]/10 transition-all duration-200"
              title="Thêm truyện mới / Ebook"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

    </div>
  );
};

export default SearchBar;
