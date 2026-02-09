
import React, { useState, useRef, useEffect } from 'react';
import type { Story } from '../types';
import { getChapterContent } from '../services/truyenfullService';
import { getCachedChapter, setCachedChapter } from '../services/cacheService';
import * as syncService from '../services/sync';

export interface BackgroundDownloadState {
    current: number;
    total: number;
    status: 'running' | 'paused';
}

export const useBackgroundDownload = (
    setCachedChapters: React.Dispatch<React.SetStateAction<Set<string>>>
) => {
    const [backgroundDownloads, setBackgroundDownloads] = useState<Record<string, BackgroundDownloadState>>({});
    const [downloadQueue, setDownloadQueue] = useState<Story[]>([]);
    const [activeDownloadUrl, setActiveDownloadUrl] = useState<string | null>(null);
    const backgroundDownloadControls = useRef<Record<string, { paused: boolean; aborted: boolean }>>({});

    const runBackgroundContentFetcher = async (storyToFetch: Story, startIndex: number) => {
        if (!storyToFetch.chapters || startIndex >= storyToFetch.chapters.length) {
            setActiveDownloadUrl(null);
            return;
        }

        backgroundDownloadControls.current[storyToFetch.url] = { paused: false, aborted: false };

        setBackgroundDownloads(prev => ({
            ...prev,
            [storyToFetch.url]: { current: startIndex, total: storyToFetch.chapters!.length, status: 'running' }
        }));

        const chapters = storyToFetch.chapters;
        const BATCH_SIZE = 3; 
        
        try {
            for (let i = startIndex; i < chapters.length; i += BATCH_SIZE) {
                const controls = backgroundDownloadControls.current[storyToFetch.url];
                if (!controls || controls.aborted) break;

                while (backgroundDownloadControls.current[storyToFetch.url]?.paused) {
                    if (backgroundDownloadControls.current[storyToFetch.url]?.aborted) break;
                    await new Promise(r => setTimeout(r, 500));
                }
                
                if (!controls || controls.aborted) break;

                const batch = chapters.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (chap) => {
                    try {
                        // 1. Kiểm tra Local Cache
                        const cached = await getCachedChapter(storyToFetch.url, chap.url);
                        if (!cached) {
                            let content = '';
                            let stats = null;
                            let loadedFromDrive = false;

                            // 2. Nếu chưa có ở Local, kiểm tra trên Drive (nếu đã đăng nhập)
                            if (syncService.isAuthenticated()) {
                                try {
                                    const driveData = await syncService.fetchChapterContentFromDrive(storyToFetch.url, chap.url);
                                    if (driveData && driveData.content) {
                                        content = driveData.content;
                                        stats = driveData.stats;
                                        loadedFromDrive = true;
                                        console.log(`[BG] Loaded ${chap.title} from Drive`);
                                    }
                                } catch (driveErr) {
                                    // Bỏ qua lỗi Drive, sẽ fallback xuống scrape
                                }
                            }

                            // 3. Nếu không có trên Drive, Cào từ Web
                            if (!loadedFromDrive) {
                                content = await getChapterContent(chap, storyToFetch.source);
                            }

                            // Lưu vào Local DB
                            await setCachedChapter(storyToFetch.url, chap.url, { content, stats });

                            // Nếu dữ liệu mới được cào về (không phải từ Drive), đồng bộ ngược lên Drive
                            if (!loadedFromDrive && syncService.isAuthenticated()) {
                                syncService.saveChapterContentToDrive(storyToFetch.url, chap.url, { content, stats }).catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.warn(`Background fetch failed for ${chap.title}`, e);
                    }
                }));

                setBackgroundDownloads(prev => ({
                    ...prev,
                    [storyToFetch.url]: { 
                        current: Math.min(i + BATCH_SIZE, chapters.length), 
                        total: chapters.length, 
                        status: prev[storyToFetch.url]?.status || 'running' 
                    }
                }));
                
                setCachedChapters(prev => {
                    const next = new Set(prev);
                    batch.forEach(c => next.add(c.url));
                    return next;
                });
                
                await new Promise(r => setTimeout(r, 1000));
            }
        } finally {
            setBackgroundDownloads(prev => {
                const next = { ...prev };
                delete next[storyToFetch.url];
                return next;
            });
            delete backgroundDownloadControls.current[storyToFetch.url];
            
            // Only clear active if it matches the current finishing one
            setActiveDownloadUrl(prev => prev === storyToFetch.url ? null : prev);
        }
    };

    const handlePauseBackgroundDownload = (storyUrl: string) => {
        if (backgroundDownloadControls.current[storyUrl]) {
            backgroundDownloadControls.current[storyUrl].paused = true;
            setBackgroundDownloads(prev => ({
                ...prev,
                [storyUrl]: { ...prev[storyUrl], status: 'paused' }
            }));
        }
    };

    const handleResumeBackgroundDownload = (storyUrl: string) => {
        if (backgroundDownloadControls.current[storyUrl]) {
            backgroundDownloadControls.current[storyUrl].paused = false;
            setBackgroundDownloads(prev => ({
                ...prev,
                [storyUrl]: { ...prev[storyUrl], status: 'running' }
            }));
        }
    };

    const handleStopBackgroundDownload = (storyUrl: string) => {
        // If stopping active download
        if (backgroundDownloadControls.current[storyUrl]) {
            backgroundDownloadControls.current[storyUrl].aborted = true;
            backgroundDownloadControls.current[storyUrl].paused = false;
        }
        
        setBackgroundDownloads(prev => {
            const next = { ...prev };
            delete next[storyUrl];
            return next;
        });
        
        // Also remove from queue if present (active or pending)
        setDownloadQueue(prev => prev.filter(s => s.url !== storyUrl));
        
        if (activeDownloadUrl === storyUrl) {
            setActiveDownloadUrl(null);
        }
    };

    const handleStartBackgroundDownload = async (storyToStart: Story) => {
        if (!storyToStart.chapters) return;
        
        // If currently downloading this story, ignore
        if (backgroundDownloads[storyToStart.url]) {
            // If it's paused, just ensure it's active
            if (backgroundDownloads[storyToStart.url].status === 'paused') {
                handlePrioritize(storyToStart.url);
            }
            return;
        }
        
        // If already in queue, ignore
        if (downloadQueue.some(s => s.url === storyToStart.url)) return;

        // If another download is active, add to queue
        if (activeDownloadUrl && activeDownloadUrl !== storyToStart.url) {
            setDownloadQueue(prev => [...prev, storyToStart]);
            return;
        }

        setActiveDownloadUrl(storyToStart.url);
        runBackgroundContentFetcher(storyToStart, 0);
    };

    const handlePrioritize = (storyUrl: string) => {
        if (activeDownloadUrl === storyUrl) return; // Already active

        // 1. Pause current active download if any
        if (activeDownloadUrl) {
            handlePauseBackgroundDownload(activeDownloadUrl);
        }

        // 2. Check if target is in queue
        const queuedStory = downloadQueue.find(s => s.url === storyUrl);
        if (queuedStory) {
            // Remove from queue
            setDownloadQueue(prev => prev.filter(s => s.url !== storyUrl));
            // Set active and start
            setActiveDownloadUrl(storyUrl);
            runBackgroundContentFetcher(queuedStory, 0);
            return;
        }

        // 3. Check if target is already in backgroundDownloads (paused)
        if (backgroundDownloads[storyUrl]) {
            setActiveDownloadUrl(storyUrl);
            handleResumeBackgroundDownload(storyUrl);
        }
    };

    const handleRemoveFromQueue = (storyUrl: string) => {
        setDownloadQueue(prev => prev.filter(s => s.url !== storyUrl));
    };
    
    useEffect(() => {
        // Automatically start next item in queue when active slot is free
        if (!activeDownloadUrl && downloadQueue.length > 0) {
            const nextStory = downloadQueue[0];
            setDownloadQueue(prev => prev.slice(1));
            setActiveDownloadUrl(nextStory.url);
            runBackgroundContentFetcher(nextStory, 0);
        }
    }, [activeDownloadUrl, downloadQueue]);

    return {
        backgroundDownloads,
        downloadQueue, 
        activeDownloadUrl,
        handleStartBackgroundDownload,
        handlePauseBackgroundDownload,
        handleResumeBackgroundDownload,
        handleStopBackgroundDownload,
        handlePrioritize,
        handleRemoveFromQueue,
        runBackgroundContentFetcher
    };
};
