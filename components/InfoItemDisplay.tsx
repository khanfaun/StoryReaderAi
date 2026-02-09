
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { EditIcon, TrashIcon } from './icons';

interface InfoItem {
  ten: string;
  moTa: string;
  status?: string;
  capDo?: string;
  diaDiemCha?: string;
}

interface InfoItemDisplayProps {
  item: InfoItem;
  onEdit: () => void;
  onDelete: () => void;
  isSimpleString?: boolean; // To handle heThongCanhGioi
}

const popoverRoot = document.getElementById('popover-root');

const InfoItemDisplay: React.FC<InfoItemDisplayProps> = ({ item, onEdit, onDelete, isSimpleString = false }) => {
  const [isPopoverVisible, setIsPopoverVisible] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [popoverPosition, setPopoverPosition] = useState<'top' | 'bottom'>('top');
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Logic xác định trạng thái "bị loại bỏ" nhưng vẫn hiển thị
  const status = item.status?.toLowerCase() || '';
  const isInactive = ['dead', 'used', 'lost', 'destroyed', 'completed'].includes(status);
  
  // Màu sắc và Style đặc biệt cho các trạng thái
  let statusStyleClass = '';
  let statusText = '';

  if (isInactive) {
      statusStyleClass = 'bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)] border-[var(--theme-border)] decoration-slate-500 line-through decoration-2 opacity-70';
      if (status === 'dead') statusText = '(Đã chết)';
      else if (status === 'used') statusText = '(Đã dùng)';
      else if (status === 'lost') statusText = '(Đã mất)';
      else if (status === 'destroyed') statusText = '(Đã hủy)';
  } else {
      statusStyleClass = 'bg-[var(--theme-text-primary)] border-[var(--theme-text-primary)] text-[var(--theme-bg-surface)] hover:brightness-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-surface)] focus:ring-[var(--theme-accent-secondary)]';
  }

  const updatePopoverPosition = useCallback(() => {
    if (!isPopoverVisible || !buttonRef.current || !popoverRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = popoverRef.current.offsetWidth;
    const popoverHeight = popoverRef.current.offsetHeight;
    const margin = 10;

    let top: number;
    let pos: 'top' | 'bottom';

    if (buttonRect.top > popoverHeight + margin) {
      pos = 'top';
      top = buttonRect.top + window.scrollY - popoverHeight - margin;
    } else {
      pos = 'bottom';
      top = buttonRect.bottom + window.scrollY + margin;
    }

    // Center the popover horizontally
    const left = buttonRect.left + (buttonRect.width / 2) - (popoverWidth / 2);
    
    setPopoverPosition(pos);
    setPopoverStyle({
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
      zIndex: 100,
    });
  }, [isPopoverVisible]);

  useEffect(() => {
    if (isPopoverVisible) {
      // Delay slightly to allow popover to render and get its dimensions
      const timer = setTimeout(updatePopoverPosition, 0);
      window.addEventListener('scroll', updatePopoverPosition, true);
      window.addEventListener('resize', updatePopoverPosition);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', updatePopoverPosition, true);
        window.removeEventListener('resize', updatePopoverPosition);
      };
    }
  }, [isPopoverVisible, updatePopoverPosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(event.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(event.target as Node)
      ) {
        setIsPopoverVisible(false);
      }
    };
    if (isPopoverVisible) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPopoverVisible]);

  const popoverContent = (isPopoverVisible && popoverRoot && !isSimpleString) ? createPortal(
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="w-64 p-3 bg-[var(--theme-bg-base)] rounded-lg shadow-2xl border border-[var(--theme-border)] text-sm text-[var(--theme-text-primary)] animate-fade-in-up z-[200]"
      role="tooltip"
    >
      <div className="flex justify-between items-start gap-2">
          <p className={`font-bold text-[var(--theme-accent-primary)] mb-1 break-words ${isInactive ? 'line-through decoration-slate-500 decoration-2 opacity-80' : ''}`}>
              {item.ten}
          </p>
          {isInactive && <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-900/30 px-1 rounded">{status}</span>}
      </div>
      <p className="break-words text-justify">{item.moTa}</p>
      {item.capDo && <p className="text-sm mt-2 text-[var(--theme-text-secondary)]"><strong>Cấp độ:</strong> {item.capDo}</p>}
      {item.diaDiemCha && <p className="text-sm text-[var(--theme-text-secondary)]"><strong>Thuộc:</strong> {item.diaDiemCha}</p>}
      <div 
        className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent
                    ${popoverPosition === 'top' ? 'top-full border-t-8 border-t-[var(--theme-border)]' : 'bottom-full border-b-8 border-b-[var(--theme-border)]'}`}
      />
    </div>,
    popoverRoot
  ) : null;

  return (
    <div className="w-full relative group">
      <button
        ref={buttonRef}
        onClick={() => setIsPopoverVisible(!isPopoverVisible)}
        className={`w-full text-left px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 border flex justify-between items-center ${statusStyleClass}`}
        aria-haspopup="true"
        aria-expanded={isPopoverVisible}
      >
        <span className="truncate flex-1 min-w-0" title={item.ten}>{item.ten}</span>
        {statusText && <span className="text-[10px] ml-2 italic opacity-80 flex-shrink-0">{statusText}</span>}
      </button>
      {popoverContent}
       <div className="absolute top-1/2 -translate-y-1/2 right-2 hidden group-hover:flex items-center gap-1 bg-[var(--theme-bg-surface)] shadow-md rounded-full px-1 py-0.5 border border-[var(--theme-border)]">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-cyan-400 rounded-full transition-colors"
            aria-label={`Sửa ${item.ten}`}
            title="Sửa"
          >
            <EditIcon className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-rose-500 rounded-full transition-colors"
            aria-label={`Xóa ${item.ten}`}
            title="Xóa vĩnh viễn"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
      </div>
    </div>
  );
};

export default InfoItemDisplay;
