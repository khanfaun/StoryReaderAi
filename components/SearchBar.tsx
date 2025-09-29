import React, { useState } from 'react';
import { UploadIcon } from './icons';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  onEbookImport: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading, onEbookImport }) => {
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col sm:flex-row items-center gap-4">
      <form onSubmit={handleSearch} className="flex-grow w-full">
        <div className="flex items-center border-b-2 border-[var(--theme-accent-primary)] py-2">
          <input
            className="appearance-none bg-transparent border-none w-full text-[var(--theme-text-primary)] mr-3 py-1 px-2 leading-tight focus:outline-none"
            type="text"
            placeholder="Nhập tên truyện hoặc dán URL..."
            aria-label="Tên truyện hoặc URL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
          <button
            className="flex-shrink-0 bg-[var(--theme-accent-primary)] hover:brightness-90 border-[var(--theme-accent-primary)] hover:border-[var(--theme-accent-primary)]/90 text-sm border-4 text-white py-1 px-4 rounded-lg disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? 'Đang tìm...' : 'Tìm kiếm'}
          </button>
        </div>
      </form>
      <button
        type="button"
        onClick={onEbookImport}
        className="flex-shrink-0 w-full sm:w-auto bg-transparent border-2 border-[var(--theme-accent-secondary)] hover:bg-[var(--theme-accent-secondary)] hover:text-slate-900 text-sm text-[var(--theme-accent-secondary)] font-semibold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center"
        disabled={isLoading}
      >
        <UploadIcon className="w-5 h-5 mr-2" />
        <span>Nhập Ebook</span>
      </button>
    </div>
  );
};

export default SearchBar;