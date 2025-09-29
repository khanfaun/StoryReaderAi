import React from 'react';
import type { ReadingHistoryItem } from '../types';
import { BookOpenIcon, TrashIcon } from './icons';

interface ReadingHistoryProps {
  items: ReadingHistoryItem[];
  onContinue: (item: ReadingHistoryItem) => void;
  onRequestDeleteEbook: (item: ReadingHistoryItem) => void;
}

const ReadingHistory: React.FC<ReadingHistoryProps> = ({ items, onContinue, onRequestDeleteEbook }) => {
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
              className="reading-history__item-button"
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
             {item.source === 'Ebook' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDeleteEbook(item);
                }}
                className="absolute top-1/2 -translate-y-1/2 right-4 w-10 h-10 rounded-full bg-red-800/50 hover:bg-red-700 text-red-300 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                aria-label={`Xóa ebook ${item.title}`}
                title="Xóa Ebook vĩnh viễn"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ReadingHistory;
