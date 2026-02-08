
import React, { useState } from 'react';
import type { Story } from '../types';
import { SpinnerIcon, StopIcon, PauseIcon, PlayIcon, CloseIcon, DownloadIcon, CheckIcon } from './icons';

interface GlobalDownloadManagerProps {
    activeDownloads: Record<string, { current: number; total: number; status: 'running' | 'paused' }>;
    queue: Story[];
    allStories: Story[]; // Need access to story metadata to show titles for active downloads
    activeStory?: Story | null;
    onPause: (url: string) => void;
    onResume: (url: string) => void;
    onStop: (url: string) => void;
    onPrioritize: (url: string) => void;
    onRemoveFromQueue: (url: string) => void;
}

const GlobalDownloadManager: React.FC<GlobalDownloadManagerProps> = ({
    activeDownloads,
    queue,
    allStories,
    activeStory,
    onPause,
    onResume,
    onStop,
    onPrioritize,
    onRemoveFromQueue
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Combine all tasks into a unified list
    const tasks = [
        ...Object.keys(activeDownloads).map((url) => {
            const progress = activeDownloads[url];
            const story = (activeStory && activeStory.url === url ? activeStory : null) || 
                          allStories.find(s => s.url === url) || 
                          queue.find(s => s.url === url);
            return {
                url,
                title: story?.title || 'Đang tải...',
                current: progress.current,
                total: progress.total,
                status: progress.status, // 'running' | 'paused'
                type: 'active' as const
            };
        }),
        ...queue.map(story => ({
            url: story.url,
            title: story.title,
            current: 0,
            total: story.chapters?.length || 0,
            status: 'queued' as const,
            type: 'queued' as const
        }))
    ];

    const activeCount = tasks.filter(t => t.status === 'running').length;
    const pendingCount = tasks.length - activeCount;

    if (tasks.length === 0) {
        return null;
    }

    const toggleExpand = () => setIsExpanded(!isExpanded);

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border)] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transition-all duration-300">
            {/* Header / Collapsed View */}
            <div 
                className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[var(--theme-bg-base)] transition-colors"
                onClick={toggleExpand}
            >
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <DownloadIcon className={`w-5 h-5 ${activeCount > 0 ? 'text-[var(--theme-accent-primary)]' : 'text-[var(--theme-text-secondary)]'}`} />
                        {activeCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--theme-accent-primary)] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--theme-accent-primary)]"></span>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-[var(--theme-text-primary)]">
                            Quản lý tải xuống
                        </span>
                        <span className="text-xs text-[var(--theme-text-secondary)]">
                            {activeCount > 0 ? `Đang tải ${activeCount} truyện` : 'Đang tạm dừng'} 
                            {pendingCount > 0 && ` • ${pendingCount} đang chờ`}
                        </span>
                    </div>
                </div>
                
                <button className="p-2 text-[var(--theme-text-secondary)]">
                    <svg 
                        className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                </button>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 border-t border-[var(--theme-border)] bg-[var(--theme-bg-base)] max-h-[60vh] overflow-y-auto">
                    <h4 className="text-xs font-bold text-[var(--theme-text-secondary)] uppercase mb-3 tracking-wider">Danh sách tải về ({tasks.length})</h4>
                    <div className="space-y-3">
                        {tasks.map((task) => {
                            const percent = task.total > 0 ? Math.round((task.current / task.total) * 100) : 0;
                            const isRunning = task.status === 'running';
                            const isPaused = task.status === 'paused';
                            const isQueued = task.status === 'queued';

                            return (
                                <div key={task.url} className={`flex items-center gap-3 p-3 rounded-lg border shadow-sm transition-colors ${isRunning ? 'bg-[var(--theme-bg-surface)] border-[var(--theme-accent-primary)]/50' : 'bg-[var(--theme-bg-surface)]/50 border-[var(--theme-border)]'}`}>
                                    
                                    {/* Priority/Play/Pause Checkbox */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isRunning) {
                                                onPause(task.url);
                                            } else {
                                                onPrioritize(task.url);
                                            }
                                        }}
                                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${isRunning 
                                            ? 'bg-green-500 border-green-500 text-white shadow-[0_0_8px_rgba(34,197,94,0.5)]' 
                                            : 'bg-[var(--theme-bg-base)] border-[var(--theme-text-secondary)] text-transparent hover:border-[var(--theme-accent-primary)]'}`}
                                        title={isRunning ? "Nhấn để tạm dừng" : "Nhấn để ưu tiên tải ngay"}
                                    >
                                        {isRunning && <CheckIcon className="w-4 h-4" />}
                                    </button>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <h5 className={`font-semibold text-sm truncate ${isRunning ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)]'}`} title={task.title}>
                                                {task.title}
                                            </h5>
                                            <span className="text-[10px] font-mono text-[var(--theme-text-secondary)] ml-2 whitespace-nowrap">
                                                {isQueued ? 'Đang chờ' : `${percent}%`}
                                            </span>
                                        </div>
                                        
                                        {/* Progress Bar */}
                                        <div className="w-full bg-[var(--theme-bg-base)] rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-300 ${isRunning ? 'bg-green-500' : isPaused ? 'bg-amber-500' : 'bg-slate-600'}`} 
                                                style={{ width: `${Math.max(percent, 5)}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-[10px] text-[var(--theme-text-secondary)] mt-1">
                                            {isQueued ? `${task.total} chương` : `${task.current}/${task.total} chương`} 
                                            {isPaused && <span className="text-amber-500 ml-1">(Tạm dừng)</span>}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        {isRunning && (
                                            <button onClick={() => onPause(task.url)} className="p-1.5 hover:bg-amber-500/20 text-amber-400 rounded" title="Tạm dừng">
                                                <PauseIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                        {isPaused && (
                                            <button onClick={() => onResume(task.url)} className="p-1.5 hover:bg-green-500/20 text-green-400 rounded" title="Tiếp tục">
                                                <PlayIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => isQueued ? onRemoveFromQueue(task.url) : onStop(task.url)} 
                                            className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded" 
                                            title="Hủy / Xóa"
                                        >
                                            <StopIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalDownloadManager;