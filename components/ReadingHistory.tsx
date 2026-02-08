
import React from 'react';
import type { ReadingHistoryItem } from '../types';
import { BookOpenIcon, TrashIcon, CloseIcon } from './icons';

interface ReadingHistoryProps {
  items: ReadingHistoryItem[];
  onContinue: (item: ReadingHistoryItem) => void;
  onRequestDeleteEbook: (item: ReadingHistoryItem) => void;
  onRemoveItem: (item: ReadingHistoryItem) => void;
}

const ReadingHistory: React.FC<ReadingHistoryProps> = ({ items, onContinue, onRequestDeleteEbook, onRemoveItem }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="reading-history animate-fade-in">
      <h2 className="reading-history__title">Tiếp tục đọc</h2>
      <ul>
        {items.map((item) => (
          <li key={item.url} className="relative group">
            <button
              onClick={() => onContinue(item)}
              className="reading-history__item-button pr-12"
              aria-label={`Tiếp tục đọc ${item.title}`}
            >
                <BookOpenIcon className="reading-history__item-icon" />
                <div className="reading-history__item-info">
                    <h3 className="reading-history__item-title" title={item.title}>{item.title}</h3>
                    <p className="reading-history__item-author">{item.author}</p>
                    <p className="reading-history__item-chapter">
                        Đọc tiếp: {item.lastChapterTitle}
                    </p>
                </div>
            </button>
            
            {/* Remove from History Button (X) */}
            <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveItem(item);
                }}
                className="absolute top-2 right-2 p-1.5 rounded-full text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-base)] hover:text-[var(--theme-text-primary)] opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                aria-label={`Bỏ theo dõi ${item.title}`}
                title="Bỏ khỏi danh sách đọc tiếp"
            >
                <CloseIcon className="w-4 h-4" />
            </button>

             {item.source === 'Ebook' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDeleteEbook(item);
                }}
                className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-900/30 hover:bg-red-700 text-red-400 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                aria-label={`Xóa ebook ${item.title}`}
                title="Xóa file Ebook vĩnh viễn"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ReadingHistory;
