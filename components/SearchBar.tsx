
import React, { useState } from 'react';
import { QuestionMarkCircleIcon } from './icons';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  onOpenHelpModal: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading, onOpenHelpModal }) => {
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto flex items-center gap-2">
      <form onSubmit={handleSearch} className="flex-grow w-full">
        <div className="flex items-center border-b border-[var(--theme-accent-primary)] py-1">
          <input
            className="appearance-none bg-transparent border-none w-full text-[var(--theme-text-primary)] mr-3 py-1 px-2 leading-tight focus:outline-none text-sm"
            type="text"
            placeholder="Tìm truyện hoặc dán URL..."
            aria-label="Tên truyện hoặc URL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
          <button
            className="flex-shrink-0 bg-[var(--theme-accent-primary)] hover:brightness-90 border-[var(--theme-accent-primary)] text-xs text-white py-1 px-3 rounded disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? '...' : 'Tìm'}
          </button>
        </div>
      </form>
      <button
        type="button"
        onClick={onOpenHelpModal}
        className="flex-shrink-0 p-1.5 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)] hover:text-[var(--theme-text-primary)] transition-colors duration-200"
        aria-label="Mẹo tìm kiếm"
        disabled={isLoading}
        title="Mẹo tìm truyện nhanh"
      >
        <QuestionMarkCircleIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default SearchBar;
