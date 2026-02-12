
import { useState, useRef } from 'react';
import type { Story, DownloadConfig } from '../types';
import { getStoryDetails } from '../services/truyenfullService';
import { downloadStoryAsEpub } from '../services/epubService';

declare var JSZip: any;

export interface DownloadStatus {
    isProcessing: boolean;
    current: number;
    total: number;
    message: string;
    isError?: boolean;
}

export const useDownloader = (onError: (msg: string) => void) => {
    const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>({
        isProcessing: false, current: 0, total: 0, message: ''
    });
    const downloadAbortRef = useRef(false);

    const ensureChaptersLoaded = async (storyInput: Story): Promise<Story> => {
        if (storyInput.chapters && storyInput.chapters.length > 0) return storyInput;
        
        setDownloadStatus({ isProcessing: true, current: 0, total: 0, message: 'Đang tải danh sách chương...' });
        try {
            const fullStory = await getStoryDetails(storyInput, undefined, () => {});
            setDownloadStatus({ isProcessing: false, current: 0, total: 0, message: '' });
            return fullStory;
        } catch (e) {
            setDownloadStatus({ isProcessing: false, current: 0, total: 0, message: '' });
            throw e;
        }
    };

    const getExtension = (format: string) => {
        switch(format) {
            case 'html': return 'html';
            case 'txt': return 'txt';
            case 'json': return 'json';
            default: return 'epub';
        }
    };

    const handleStartDownload = async (config: DownloadConfig) => {
        let storyToDownload = config.story;
        try {
            if (!storyToDownload.chapters || storyToDownload.chapters.length === 0) {
                storyToDownload = await ensureChaptersLoaded(storyToDownload);
            }
        } catch (e) {
            onError(`Không thể tải danh sách chương: ${(e as Error).message}`);
            return;
        }

        const { ranges, preset, format, mergeCustom } = config;
        const totalChapters = storyToDownload.chapters!.length;
        const fileExt = getExtension(format);

        setDownloadStatus({ isProcessing: true, current: 0, total: 0, message: 'Đang khởi tạo...' });
        downloadAbortRef.current = false;

        try {
            const zip = new JSZip(); 
            let hasFiles = false;
            
            let isSingleFile = false;
            if (preset === 'all') isSingleFile = true;
            else if (preset === '50' || preset === '100') isSingleFile = false;
            else isSingleFile = mergeCustom;

            if (isSingleFile) {
                const allIndices = new Set<number>();
                ranges.forEach(r => {
                    const start = Math.max(1, Math.min(r.start, totalChapters));
                    const end = Math.max(1, Math.min(r.end, totalChapters));
                    for(let i = Math.min(start, end); i <= Math.max(start, end); i++) allIndices.add(i - 1); 
                });
                
                const sortedIndices = Array.from(allIndices).sort((a, b) => a - b);
                const chaptersToDownload = sortedIndices.map(idx => storyToDownload.chapters![idx]);
                
                if (chaptersToDownload.length === 0) throw new Error("Chưa chọn chương nào hợp lệ.");

                setDownloadStatus(prev => ({ ...prev, total: chaptersToDownload.length, message: `Đang tải ${chaptersToDownload.length} chương...` }));
                
                const blob = await downloadStoryAsEpub(
                    storyToDownload,
                    chaptersToDownload,
                    format,
                    (curr, tot, log, act) => {
                        setDownloadStatus(prev => ({ ...prev, current: curr, total: tot, message: act || log || 'Đang xử lý...' }));
                    },
                    () => downloadAbortRef.current
                );
                
                if (!downloadAbortRef.current) {
                    triggerFileDownload(blob, `${storyToDownload.title} - Full.${fileExt}`);
                }

            } else {
                const totalRanges = ranges.length;
                for (let i = 0; i < totalRanges; i++) {
                    if (downloadAbortRef.current) break;
                    const r = ranges[i];
                    const start = Math.max(1, Math.min(r.start, totalChapters));
                    const end = Math.max(1, Math.min(r.end, totalChapters));
                    const chaptersToDownload = storyToDownload.chapters!.slice(start - 1, end);
                    if (chaptersToDownload.length === 0) continue;

                    setDownloadStatus(prev => ({ ...prev, message: `Đang xử lý file ${i+1}/${totalRanges} (Chương ${start}-${end})` }));
                    
                    const blob = await downloadStoryAsEpub(
                        storyToDownload,
                        chaptersToDownload,
                        format,
                        (curr, tot) => {
                            setDownloadStatus(prev => ({ ...prev, current: curr, total: tot }));
                        },
                        () => downloadAbortRef.current
                    );

                    const filename = `${storyToDownload.title} - ${start}-${end}.${fileExt}`;
                    zip.file(filename, blob);
                    hasFiles = true;
                }

                if (hasFiles && !downloadAbortRef.current) {
                    setDownloadStatus(prev => ({ ...prev, message: "Đang nén file tổng..." }));
                    const content = await zip.generateAsync({ type: "blob" });
                    triggerFileDownload(content, `${storyToDownload.title} - Batch_Download.zip`);
                }
            }
            
            if (!downloadAbortRef.current) {
                setDownloadStatus(prev => ({ ...prev, isProcessing: false, message: "Hoàn tất!" }));
                setTimeout(() => setDownloadStatus(prev => ({ ...prev, isProcessing: false })), 3000); 
            } else {
                setDownloadStatus({ isProcessing: false, current: 0, total: 0, message: '' });
            }

        } catch (e) {
            setDownloadStatus(prev => ({ ...prev, message: `Lỗi: ${(e as Error).message}`, isError: true }));
            setTimeout(() => setDownloadStatus(prev => ({ ...prev, isProcessing: false, isError: false })), 5000);
        }
    };

    const triggerFileDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleCancelDownload = () => {
        downloadAbortRef.current = true;
        setDownloadStatus(prev => ({ ...prev, message: 'Đang hủy...', isProcessing: false })); 
    };

    return {
        downloadStatus,
        handleStartDownload,
        handleCancelDownload,
        setDownloadStatus
    };
};