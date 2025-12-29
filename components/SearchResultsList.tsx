
import React from 'react';
import type { Story } from '../types';

interface SearchResultItemProps {
  story: Story;
  onSelectStory: (story: Story) => void;
  onFilterAuthor?: (author: string) => void;
  onFilterSource?: (source: string) => void;
  onFilterTag?: (tag: string) => void;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ story, onSelectStory, onFilterAuthor, onFilterSource, onFilterTag }) => {
  let sourceColor: string;
  let label: string;

  switch (story.source) {
      case 'TruyenFull.vn':
          sourceColor = 'bg-teal-600 hover:bg-teal-500';
          label = 'TF';
          break;
      case 'TruyenFull.vision':
          sourceColor = 'bg-indigo-600 hover:bg-indigo-500';
          label = 'TFV';
          break;
      case 'TangThuVien.net':
          sourceColor = 'bg-orange-600 hover:bg-orange-500';
          label = 'TTV';
          break;
      case 'Ebook':
          sourceColor = 'bg-emerald-600 hover:bg-emerald-500';
          label = 'EPUB';
          break;
      case 'Local':
          sourceColor = 'bg-green-600 hover:bg-green-500';
          label = 'Tự thêm';
          break;
      default:
          sourceColor = 'bg-slate-600 hover:bg-slate-500';
          label = 'Web';
          break;
  }
    
  if (story.isSearchLink) {
    return (
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-slate-800/50 border border-dashed border-slate-600 rounded-md shadow-sm overflow-hidden flex flex-col cursor-pointer transition-all transform hover:scale-[1.02] hover:border-[var(--theme-accent-primary)] group h-full"
        aria-label={`Tìm kiếm '${story.title}' trên ${story.source}`}
      >
        <div className="relative w-full aspect-[2/3] flex flex-col items-center justify-center p-2 bg-slate-800">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-500 group-hover:text-[var(--theme-accent-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <p className="text-[10px] text-center text-[var(--theme-text-secondary)] mt-1">Mở link ngoài</p>
        </div>
        <div className="p-1.5 flex flex-col flex-grow bg-[var(--theme-bg-surface)]">
            <h3 className="text-[11px] font-bold text-[var(--theme-text-primary)] leading-tight line-clamp-2 mb-1" title={story.title}>
            {story.title}
            </h3>
             <div className="mt-auto">
                <span className={`inline-block px-1 py-0.5 text-[9px] font-semibold text-white rounded ${sourceColor}`}>
                    {label}
                </span>
            </div>
        </div>
      </a>
    );
  }

  const handleSourceClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onFilterSource) onFilterSource(story.source);
  };

  const handleAuthorClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onFilterAuthor) onFilterAuthor(story.author);
  };

  const handleTagClick = (tag: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (onFilterTag) onFilterTag(tag);
  }

  // Display max 1 tag to keep card clean in compact view
  const visibleTags = story.tags ? story.tags.slice(0, 1) : [];

  return (
    <div 
      className="group relative bg-[var(--theme-bg-surface)] rounded-md shadow-sm overflow-hidden flex flex-col cursor-pointer transition-transform transform hover:-translate-y-1 hover:shadow-md h-full border border-[var(--theme-border)]"
      onClick={() => onSelectStory(story)}
      role="button"
      tabIndex={0}
      aria-label={`Chọn truyện ${story.title}`}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectStory(story)}
    >
      {/* Cover Image Container with Aspect Ratio 2:3 */}
      <div className="relative w-full aspect-[2/3] bg-slate-800 overflow-hidden">
        {story.imageUrl ? (
            <img 
            src={story.imageUrl} 
            alt={`Bìa truyện ${story.title}`} 
            className="absolute top-0 left-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
            loading="lazy"
            />
        ) : (
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-slate-700 text-slate-500 font-bold text-[10px] p-1 text-center select-none">
                {story.title}
            </div>
        )}
        
        {/* Source Badge Overlay - Smaller */}
        <div className="absolute top-1 right-1 z-10">
             <button
                onClick={handleSourceClick}
                className={`px-1 py-0.5 text-[9px] font-bold text-white rounded shadow-sm opacity-90 transition-transform hover:scale-110 ${sourceColor}`}
                title={`Lọc theo nguồn: ${label}`}
             >
                {label}
            </button>
        </div>
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
      </div>

      {/* Info Section - More compact */}
      <div className="p-2 flex flex-col flex-grow gap-0.5">
        <h3 className="text-xs font-semibold text-[var(--theme-text-primary)] leading-snug line-clamp-2" title={story.title}>
          {story.title}
        </h3>
        
        <button
            onClick={handleAuthorClick} 
            className="text-left text-[10px] text-[var(--theme-text-secondary)] line-clamp-1 hover:text-[var(--theme-accent-primary)] hover:underline transition-colors w-fit" 
            title={`Lọc theo tác giả: ${story.author}`}
        >
            {story.author || 'N/A'}
        </button>

        {visibleTags.length > 0 && (
            <div className="mt-auto flex flex-wrap gap-1">
                {visibleTags.map(tag => (
                    <button
                        key={tag}
                        onClick={(e) => handleTagClick(tag, e)}
                        className="px-1 py-0.5 text-[8px] bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] rounded hover:border-[var(--theme-accent-primary)] hover:text-[var(--theme-accent-primary)] transition-colors truncate max-w-full"
                        title={`Lọc theo: ${tag}`}
                    >
                        {tag}
                    </button>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

interface SearchResultsListProps {
  results: Story[];
  onSelectStory: (story: Story) => void;
  onFilterAuthor?: (author: string) => void;
  onFilterSource?: (source: string) => void;
  onFilterTag?: (tag: string) => void;
}

const SearchResultsList: React.FC<SearchResultsListProps> = ({ results, onSelectStory, onFilterAuthor, onFilterSource, onFilterTag }) => {
  return (
    <div className="animate-fade-in">
      {/* Increased grid columns for more compact view */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 sm:gap-3">
        {results.map((story) => (
          <SearchResultItem 
            key={`${story.url}-${story.source}`} 
            story={story} 
            onSelectStory={onSelectStory} 
            onFilterAuthor={onFilterAuthor}
            onFilterSource={onFilterSource}
            onFilterTag={onFilterTag}
          />
        ))}
      </div>
    </div>
  );
};

export default SearchResultsList;
