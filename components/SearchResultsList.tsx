import React from 'react';
import type { Story } from '../types';

interface SearchResultItemProps {
  story: Story;
  onSelectStory: (story: Story) => void;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ story, onSelectStory }) => {
  let sourceColor: string;
  switch (story.source) {
      case 'TruyenFull.vn':
          sourceColor = 'bg-teal-800 text-teal-300';
          break;
      case 'TruyenFull.vision':
          sourceColor = 'bg-indigo-800 text-indigo-300';
          break;
      case 'TangThuVien.net':
          sourceColor = 'bg-orange-800 text-orange-300';
          break;
      case 'TruyenKK.com':
          sourceColor = 'bg-rose-800 text-rose-300';
          break;
      case 'TruyenYY.pro':
          sourceColor = 'bg-fuchsia-800 text-fuchsia-300';
          break;
      case 'TruyenChuHay.vn':
          sourceColor = 'bg-sky-800 text-sky-300';
          break;
      case 'TruyenChu.com.vn':
          sourceColor = 'bg-lime-800 text-lime-300';
          break;
      default:
          sourceColor = 'bg-slate-700 text-slate-300';
          break;
  }
    
  if (story.isSearchLink) {
    return (
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-lg shadow-lg overflow-hidden flex flex-col cursor-pointer transition-all transform hover:scale-105 hover:border-solid hover:border-[var(--theme-accent-primary)] group"
        aria-label={`Tìm kiếm '${story.title}' trên ${story.source}`}
      >
        <div className="relative w-full h-full flex flex-col items-center justify-center p-4 min-h-[200px]">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-500 group-hover:text-[var(--theme-accent-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <h3 className="text-md font-bold text-center text-[var(--theme-text-primary)] leading-tight mt-3" title={story.title}>
            {story.title}
            </h3>
            <p className="text-sm text-center text-[var(--theme-text-secondary)]">{story.author}</p>
        </div>
         <div className="p-2 text-right bg-slate-800/30">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${sourceColor}`}>
                {story.source}
            </span>
        </div>
      </a>
    );
  }

  return (
    <div 
      className="bg-[var(--theme-bg-surface)] rounded-lg shadow-lg overflow-hidden flex flex-col cursor-pointer transition-transform transform hover:scale-105 hover:shadow-[var(--theme-accent-primary)]/20"
      onClick={() => onSelectStory(story)}
      role="button"
      tabIndex={0}
      aria-label={`Chọn truyện ${story.title}`}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectStory(story)}
    >
      <div className="relative pt-[140%] bg-slate-700">
        <img 
          src={story.imageUrl} 
          alt={`Bìa truyện ${story.title}`} 
          className="absolute top-0 left-0 w-full h-full object-cover" 
          loading="lazy"
        />
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-md font-bold text-[var(--theme-text-primary)] leading-tight mb-1 flex-grow" title={story.title}>
          {story.title}
        </h3>
        <p className="text-sm text-[var(--theme-text-secondary)] mb-3 truncate">{story.author}</p>
        <div className="text-right mt-auto">
          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${sourceColor}`}>
            {story.source}
          </span>
        </div>
      </div>
    </div>
  );
};

interface SearchResultsListProps {
  results: Story[];
  onSelectStory: (story: Story) => void;
}

const SearchResultsList: React.FC<SearchResultsListProps> = ({ results, onSelectStory }) => {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-[var(--theme-text-primary)] mb-6 border-b-2 border-[var(--theme-border)] pb-2">Kết quả tìm kiếm ({results.length})</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
        {results.map((story) => (
          <SearchResultItem key={`${story.url}-${story.source}`} story={story} onSelectStory={onSelectStory} />
        ))}
      </div>
    </div>
  );
};

export default SearchResultsList;