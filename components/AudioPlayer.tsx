
import React, { useState } from 'react';
import type { ReadingSettings } from '../types';
import { PlayIcon, PauseIcon, StopIcon, SpinnerIcon } from './icons';

type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'ready';

interface AudioPlayerProps {
    textChunks: string[];
    currentChunkIndex: number;
    status: TtsStatus;
    settings: ReadingSettings;
    onChunkChange: (newIndex: number) => void;
    onStatusChange: (newStatus: TtsStatus) => void;
    onStop: () => void;
    onTtsRequest: () => void;
    ttsError: string | null;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ textChunks, currentChunkIndex, status, onChunkChange, onStatusChange, onStop, onTtsRequest, ttsError }) => {
    const [isPlaylistVisible, setIsPlaylistVisible] = useState(true);
    
    const handlePlayPause = () => {
        if (status === 'playing') onStatusChange('paused');
        else if (status === 'paused' || status === 'ready') onStatusChange('playing');
        else if (status === 'idle' || status === 'error') {
            onTtsRequest();
        }
    };
    
    const playButtonContent = () => {
        switch(status) {
            case 'playing': return <PauseIcon className="w-8 h-8"/>;
            case 'loading': return <SpinnerIcon className="w-8 h-8 animate-spin" />;
            case 'idle':
            case 'error':
                 return (
                    <div className="flex flex-col items-center">
                        <PlayIcon className="w-8 h-8"/>
                        <span className="text-xs mt-1">Bắt đầu đọc</span>
                    </div>
                );
            default: return <PlayIcon className="w-8 h-8"/>;
        }
    }
    
    if (status === 'idle' || status === 'error') {
        return (
             <div className="p-4 bg-[var(--theme-bg-base)] border border-dashed border-[var(--theme-border)] rounded-lg shadow-md flex flex-col items-center justify-center min-h-[120px]">
                <button onClick={handlePlayPause} className="w-24 h-24 flex items-center justify-center bg-[var(--theme-accent-primary)] hover:brightness-110 text-white rounded-full text-2xl transition-transform transform hover:scale-105 disabled:bg-slate-600 disabled:opacity-50">
                    {playButtonContent()}
                </button>
                {ttsError && <p className="text-center text-sm text-rose-400 mt-4">Lỗi: {ttsError}</p>}
             </div>
        )
    }

    return (
        <div className="p-4 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-lg shadow-md space-y-3">
            <div className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                    <button onClick={() => onChunkChange(currentChunkIndex - 1)} disabled={currentChunkIndex === 0} className="p-2 rounded-full hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] disabled:opacity-50 transition-colors">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M8.445 14.832A1 1 0 0010 14.168V5.832a1 1 0 00-1.555-.832L3 8.168a1 1 0 000 1.664l5.445 3.001zM14.445 14.832A1 1 0 0016 14.168V5.832a1 1 0 00-1.555-.832L9 8.168a1 1 0 000 1.664l5.445 3.001z"/></svg>
                    </button>
                    <button onClick={handlePlayPause} className="w-12 h-12 flex items-center justify-center bg-[var(--theme-accent-primary)] hover:brightness-110 text-white rounded-full text-2xl transition-transform transform hover:scale-105 disabled:bg-slate-600 disabled:opacity-50" disabled={status === 'loading'}>
                        {playButtonContent()}
                    </button>
                    <button onClick={() => onChunkChange(currentChunkIndex + 1)} disabled={currentChunkIndex >= textChunks.length - 1} className="p-2 rounded-full hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] disabled:opacity-50 transition-colors">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M11.555 5.168A1 1 0 0010 5.832v8.336a1 1 0 001.555.832l5.445-3.001a1 1 0 000-1.664l-5.445-3.001zM5.555 5.168A1 1 0 004 5.832v8.336a1 1 0 001.555.832l5.445-3.001a1 1 0 000-1.664L5.555 5.168z"/></svg>
                    </button>
                </div>
                 <div className="w-20 flex justify-end items-center gap-1">
                    <button onClick={() => setIsPlaylistVisible(!isPlaylistVisible)} className={`p-2 rounded-full hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] ${isPlaylistVisible ? 'bg-[var(--theme-border)] text-[var(--theme-accent-primary)]' : ''}`} title="Danh sách phát">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1z" /></svg>
                    </button>
                    <button onClick={onStop} className="p-2 rounded-full hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)]" title="Dừng">
                        <StopIcon className="w-5 h-5"/>
                    </button>
                </div>
            </div>
            {ttsError && <p className="text-center text-sm text-rose-400">Lỗi: {ttsError}</p>}
            
            {isPlaylistVisible && (
                <div className="pt-2 mt-2 border-t border-[var(--theme-border)] max-h-48 overflow-y-auto">
                    <div className="flex justify-between text-xs text-[var(--theme-text-secondary)] mb-2 px-2">
                        <span>Danh sách phát ({currentChunkIndex + 1} / {textChunks.length} đoạn)</span>
                    </div>
                    <ul className="space-y-1">
                        {textChunks.map((chunk, index) => (
                            <li key={index}>
                                <button
                                    onClick={() => onChunkChange(index)}
                                    className={`w-full text-left text-sm px-3 py-2 rounded-md flex items-center justify-between transition-colors ${
                                        index === currentChunkIndex ? 'bg-[var(--theme-accent-primary)]/20 text-[var(--theme-accent-primary)] border border-[var(--theme-accent-primary)]/30' : 'hover:bg-[var(--theme-bg-surface)] text-[var(--theme-text-secondary)]'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 truncate">
                                        {index === currentChunkIndex && status === 'playing' ? <svg className="w-4 h-4 text-[var(--theme-accent-primary)]" viewBox="0 0 24 24"><path d="M6 18V6l12 6-12 6z" fill="currentColor"/></svg> : <span className="w-4 text-center opacity-50">{index + 1}</span>}
                                        <span className="truncate italic">"{chunk.substring(0, 50)}..."</span>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default AudioPlayer;
