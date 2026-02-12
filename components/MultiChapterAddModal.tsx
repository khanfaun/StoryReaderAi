
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon, TrashIcon, SparklesIcon, CheckIcon, SpinnerIcon, UploadIcon, CogIcon, UserIcon, WrenchScrewdriverIcon, ClockIcon, HashtagIcon, ArrowUpIcon, ArrowDownIcon, SortIcon, KeyIcon } from './icons';
import * as apiKeyService from '../services/apiKeyService';
import type { ApiKeyInfo } from '../types';

// Khai báo JSZip từ global scope (được load ở index.html)
declare var JSZip: any;

interface ChapterDraft {
  id: string; // Unique ID cho UI list
  number: number;
  title: string;
  content: string;
  createdAt: number; // Thêm trường thời gian để sort
}

interface MultiChapterAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (chapters: { number: number; title: string; content: string }[]) => Promise<void>;
  nextChapterIndex: number;
}

type SortOption = 'number' | 'time';
type SortOrder = 'asc' | 'desc';

const MultiChapterAddModal: React.FC<MultiChapterAddModalProps> = ({ isOpen, onClose, onSave, nextChapterIndex }) => {
  const [drafts, setDrafts] = useState<ChapterDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Persist AI Panel state
  const [isAiMode, setIsAiMode] = useState(() => {
      const saved = localStorage.getItem('ai_panel_expanded');
      return saved === 'true';
  });
  
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sorting State
  const [sortType, setSortType] = useState<SortOption>('number');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  
  // AI Config States
  const [aiModel, setAiModel] = useState('gemini-flash');
  const [translationMode, setTranslationMode] = useState('vi-vi'); // Default to Edit Mode
  const [translationTone, setTranslationTone] = useState('tien-hiep');
  const [batchSize, setBatchSize] = useState(5);
  const [context, setContext] = useState('');
  
  // API Key Management State (Local to Modal but synced via service)
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [activeApiKeyId, setActiveApiKeyId] = useState<string | null>(null);
  const [newApiKeyInput, setNewApiKeyInput] = useState('');
  const [isAddingKey, setIsAddingKey] = useState(false);
  
  // Toggles
  const [autoTitle, setAutoTitle] = useState(true);
  const [cleanNotes, setCleanNotes] = useState(true);
  const [vietPhrase, setVietPhrase] = useState(false);

  // Ref để scroll xuống dưới cùng khi thêm card mới
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref để lưu trữ số chương tại thời điểm mở modal (Snapshot)
  const startNumberRef = useRef(nextChapterIndex);

  // Close sort menu when clicking outside
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
              setIsSortMenuOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshApiKeys = () => {
      setApiKeys(apiKeyService.getApiKeys());
      setActiveApiKeyId(apiKeyService.getActiveApiKeyId());
  };

  // Khởi tạo card đầu tiên khi mở modal
  useEffect(() => {
    if (isOpen) {
      startNumberRef.current = nextChapterIndex;
      const initialId = Date.now().toString();
      
      setDrafts([{
        id: initialId,
        number: startNumberRef.current,
        title: '',
        content: '',
        createdAt: Date.now()
      }]);
      setSelectedIds(new Set()); // Default unticked
      setIsSaving(false);
      // isAiMode không được reset ở đây, giữ nguyên state từ localStorage
      setIsProcessingFiles(false);
      // Reset sort to default when opening
      setSortType('number');
      setSortOrder('asc');
      setIsSortMenuOpen(false);
      
      // Load API Keys
      refreshApiKeys();
      setIsAddingKey(false);
      setNewApiKeyInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); 

  // --- API KEY LOGIC ---
  const handleAddApiKey = () => {
      if (!newApiKeyInput.trim()) return;
      const newKey = apiKeyService.addApiKey(newApiKeyInput.trim());
      // Auto active if it's the first key
      if (apiKeys.length === 0) {
          apiKeyService.setActiveApiKeyId(newKey.id);
      }
      setNewApiKeyInput('');
      setIsAddingKey(false);
      refreshApiKeys();
  };

  const handleDeleteApiKey = (id: string) => {
      apiKeyService.deleteApiKey(id);
      refreshApiKeys();
  };

  const handleSetActiveApiKey = (id: string) => {
      apiKeyService.setActiveApiKeyId(id);
      refreshApiKeys();
  };

  // --- SELECTION LOGIC ---
  const toggleSelect = (id: string) => {
      setSelectedIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          return newSet;
      });
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === drafts.length) {
          setSelectedIds(new Set()); // Deselect all
      } else {
          setSelectedIds(new Set(drafts.map(d => d.id))); // Select all
      }
  };

  const isAllSelected = drafts.length > 0 && selectedIds.size === drafts.length;

  // --- SORTING LOGIC ---
  const sortDrafts = (items: ChapterDraft[], type: SortOption, order: SortOrder) => {
      return [...items].sort((a, b) => {
          if (type === 'number') {
              return order === 'asc' ? a.number - b.number : b.number - a.number;
          } else {
              return order === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
          }
      });
  };

  const handleSort = (type: SortOption) => {
      // Toggle order if clicking same type, otherwise default to asc
      const newOrder = (type === sortType && sortOrder === 'asc') ? 'desc' : 'asc';
      setSortType(type);
      setSortOrder(newOrder);
      
      setDrafts(prev => sortDrafts(prev, type, newOrder));
      setIsSortMenuOpen(false);
  };

  const addCard = () => {
    const lastNumber = drafts.length > 0 ? Math.max(...drafts.map(d => d.number)) : startNumberRef.current - 1;
    const newId = Date.now().toString();
    const newCard = {
        id: newId,
        number: lastNumber + 1,
        title: '',
        content: '',
        createdAt: Date.now()
    };

    setDrafts(prev => [...prev, newCard]);
    
    setTimeout(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, 100);
  };

  const removeCard = (id: string) => {
    if (drafts.length <= 1) {
        const newId = Date.now().toString();
        setDrafts([{
            id: newId,
            number: startNumberRef.current,
            title: '',
            content: '',
            createdAt: Date.now()
        }]);
        setSelectedIds(new Set());
        return;
    }
    setDrafts(prev => prev.filter(d => d.id !== id));
    setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
    });
  };

  const updateDraft = (id: string, field: keyof ChapterDraft, value: string | number) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleSave = async () => {
    const validChapters = drafts
        .filter(d => d.content.trim().length > 0)
        .map(d => {
            let finalTitle = d.title.trim();
            // Nếu title chưa có chữ "Chương X", tự động thêm vào
            if (!finalTitle.toLowerCase().startsWith('chương') && !finalTitle.toLowerCase().startsWith('chapter')) {
                finalTitle = `Chương ${d.number}: ${finalTitle}`;
            }
            // Nếu title rỗng
            if (!finalTitle || finalTitle === `Chương ${d.number}:`) {
                finalTitle = `Chương ${d.number}`;
            }

            return {
                number: d.number,
                title: finalTitle,
                content: d.content
            };
        });

    if (validChapters.length === 0) {
        alert("Vui lòng nhập nội dung cho ít nhất một chương.");
        return;
    }

    setIsSaving(true);
    try {
        await onSave(validChapters);
        onClose(); 
    } catch (error) {
        console.error("Lỗi khi lưu chương:", error);
        setIsSaving(false); 
    }
  };

  const toggleAiMode = () => {
      const newState = !isAiMode;
      setIsAiMode(newState);
      localStorage.setItem('ai_panel_expanded', String(newState));
  };

  // --- LOGIC XỬ LÝ FILE ---

  // Helper: Strip HTML tags for EPUB content
  const stripHtml = (html: string) => {
     const doc = new DOMParser().parseFromString(html, 'text/html');
     const scripts = doc.querySelectorAll('script, style');
     scripts.forEach(s => s.remove());
     
     doc.body.innerHTML = doc.body.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n');
        
     return doc.body.textContent || "";
  };

  // Helper: Extract Chapter Number from Title
  const extractNumberFromTitle = (title: string): number | null => {
      // Regex tìm "Chương 10", "Chapter 10", "Hồi 10", "Chap 10"
      const match = title.match(/(?:chương|chapter|chap|hồi)\s+(\d+)/i);
      if (match) {
          return parseInt(match[1], 10);
      }
      return null;
  };

  // Helper: Parse EPUB
  const parseEpubContent = async (file: File): Promise<ChapterDraft[]> => {
      const newDrafts: ChapterDraft[] = [];
      try {
          const zip = await JSZip.loadAsync(file);
          const containerXml = await zip.file("META-INF/container.xml")?.async("string");
          if (!containerXml) return [];

          const parser = new DOMParser();
          const containerDoc = parser.parseFromString(containerXml, "application/xml");
          const rootPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
          if (!rootPath) return [];

          const opfContent = await zip.file(rootPath)?.async("string");
          if (!opfContent) return [];
          const opfDoc = parser.parseFromString(opfContent, "application/xml");
          
          const manifest: Record<string, string> = {};
          opfDoc.querySelectorAll("manifest item").forEach(item => {
              const id = item.getAttribute("id");
              const href = item.getAttribute("href");
              if (id && href) manifest[id] = href;
          });

          const spine = Array.from(opfDoc.querySelectorAll("spine itemref")).map(item => item.getAttribute("idref"));
          const basePath = rootPath.substring(0, rootPath.lastIndexOf('/') + 1);

          for (const idref of spine) {
              if (!idref) continue;
              const href = manifest[idref];
              if (!href) continue;
              
              if (href.includes('cover') || href.includes('nav') || href.includes('toc')) continue;

              const fullPath = basePath + href;
              const htmlContent = await zip.file(fullPath)?.async("string");
              
              if (htmlContent) {
                  const textContent = stripHtml(htmlContent).trim();
                  if (textContent.length > 50) {
                      newDrafts.push({
                          id: Date.now().toString() + Math.random(),
                          number: 0, 
                          title: `Chương (Từ Ebook)`,
                          content: textContent,
                          createdAt: Date.now()
                      });
                  }
              }
          }
      } catch (e) {
          console.error("Lỗi đọc EPUB:", e);
      }
      return newDrafts;
  };

  // Helper: Parse App Generated TXT Format
  // Format: "====================================" delimiter for chapters
  //         "Title\n------------------------------------\nContent"
  const parseAppTxtFormat = (text: string): ChapterDraft[] => {
      const drafts: ChapterDraft[] = [];
      const separator = "====================================";
      const titleSeparator = "------------------------------------";
      
      const chunks = text.split(separator).map(c => c.trim()).filter(c => c.length > 0);
      
      // Bỏ qua chunk đầu tiên nếu nó là Metadata truyện (Tên truyện, tác giả...)
      // Check bằng cách xem nó có chứa từ khóa "Tác giả:" không
      let startIndex = 0;
      if (chunks.length > 0 && chunks[0].includes("Tác giả:")) {
          startIndex = 1;
      }

      for (let i = startIndex; i < chunks.length; i++) {
          const chunk = chunks[i];
          const parts = chunk.split(titleSeparator);
          
          let title = "";
          let content = "";
          let number = 0;

          if (parts.length >= 2) {
              title = parts[0].trim();
              content = parts.slice(1).join(titleSeparator).trim();
          } else {
              // Fallback: Use first line as title
              const lines = chunk.split('\n');
              title = lines[0].trim();
              content = lines.slice(1).join('\n').trim();
          }

          const extractedNumber = extractNumberFromTitle(title);
          if (extractedNumber !== null) number = extractedNumber;

          if (content) {
              drafts.push({
                  id: Date.now().toString() + Math.random() + i,
                  number: number, // Nếu không tìm thấy số thì tạm để 0, logic sau sẽ fix
                  title: title,
                  content: content,
                  createdAt: Date.now()
              });
          }
      }
      return drafts;
  }

  const handleFiles = async (files: FileList) => {
      setIsProcessingFiles(true);
      const newDrafts: ChapterDraft[] = [];
      
      const hasEmptyInitial = drafts.length === 1 && !drafts[0].content && !drafts[0].title;
      // Tìm số lớn nhất hiện tại để tiếp tục tăng
      const maxCurrentNum = drafts.length > 0 ? Math.max(...drafts.map(d => d.number)) : startNumberRef.current - 1;
      let currentNumberBase = hasEmptyInitial ? startNumberRef.current : maxCurrentNum + 1;

      try {
          for (const file of Array.from(files)) {
              const fileName = file.name;
              const ext = fileName.split('.').pop()?.toLowerCase();

              if (ext === 'epub') {
                  const epubChapters = await parseEpubContent(file);
                  epubChapters.forEach(ch => {
                      ch.number = currentNumberBase++;
                      newDrafts.push(ch);
                  });
              } else if (ext === 'json') {
                  const text = await file.text();
                  try {
                      const data = JSON.parse(text);
                      if (Array.isArray(data)) {
                          data.forEach((item: any) => {
                              if (item.content) {
                                  // Ưu tiên số chương có sẵn trong JSON
                                  let num = item.number;
                                  if (!num) {
                                      // Nếu không có, thử tìm trong title
                                      const extracted = extractNumberFromTitle(item.title);
                                      if (extracted !== null) num = extracted;
                                      else num = currentNumberBase++;
                                  } else {
                                      // Nếu có số, cập nhật lại currentNumberBase để các file sau (nếu có) tiếp tục tăng từ đó
                                      // Cập nhật base để tránh trùng nếu file tiếp theo không có số
                                      currentNumberBase = Math.max(currentNumberBase, num + 1);
                                  }

                                  newDrafts.push({
                                      id: Date.now().toString() + Math.random(),
                                      number: num,
                                      title: item.title || fileName.replace('.' + ext, ''),
                                      content: item.content,
                                      createdAt: Date.now()
                                  });
                              }
                          });
                      } else if (data.content) {
                          let num = data.number;
                          if(!num) {
                              const extracted = extractNumberFromTitle(data.title);
                              if(extracted !== null) num = extracted;
                              else num = currentNumberBase++;
                          } else {
                              currentNumberBase = Math.max(currentNumberBase, num + 1);
                          }

                          newDrafts.push({
                              id: Date.now().toString() + Math.random(),
                              number: num,
                              title: data.title || fileName.replace('.' + ext, ''),
                              content: data.content,
                              createdAt: Date.now()
                          });
                      }
                  } catch (e) { console.warn("Invalid JSON", e); }
              } else {
                  // Text/HTML Handler
                  const text = await file.text();
                  
                  // Kiểm tra xem có phải định dạng TXT của app không
                  if (text.includes("====================================") && text.includes("------------------------------------")) {
                      const parsedTxtChapters = parseAppTxtFormat(text);
                      parsedTxtChapters.forEach(ch => {
                          if (ch.number === 0) ch.number = currentNumberBase++;
                          else currentNumberBase = Math.max(currentNumberBase, ch.number + 1);
                          newDrafts.push(ch);
                      });
                  } else {
                      // Fallback: Treat as single chapter
                      const content = (ext === 'html' || ext === 'htm') ? stripHtml(text) : text;
                      // Try extract number from filename
                      let num = extractNumberFromTitle(fileName);
                      if (num === null) num = currentNumberBase++;
                      else currentNumberBase = Math.max(currentNumberBase, num + 1);

                      newDrafts.push({
                          id: Date.now().toString() + Math.random(),
                          number: num,
                          title: fileName.replace('.' + ext, ''),
                          content: content,
                          createdAt: Date.now()
                      });
                  }
              }
          }

          if (newDrafts.length > 0) {
              setDrafts(prev => {
                  let combined: ChapterDraft[] = [];
                  if (hasEmptyInitial) {
                      combined = newDrafts;
                  } else {
                      combined = [...prev, ...newDrafts];
                  }
                  
                  // AUTOMATICALLY SORT BY NUMBER ASCENDING AFTER UPLOAD
                  setSortType('number');
                  setSortOrder('asc');
                  return sortDrafts(combined, 'number', 'asc');
              });
              
              setTimeout(() => {
                  if (listRef.current) {
                      listRef.current.scrollTop = 0; // Scroll to top to see sorted list
                  }
              }, 100);
          }
      } catch (e) {
          alert("Có lỗi khi xử lý file: " + (e as Error).message);
      } finally {
          setIsProcessingFiles(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          handleFiles(e.target.files);
      }
  };

  const handleRunAi = () => {
      if (!apiKeyService.hasApiKey()) {
          alert("Vui lòng thêm API Key trước khi sử dụng tính năng AI.");
          return;
      }
      
      if (selectedIds.size === 0) {
          alert("Vui lòng chọn ít nhất một chương để xử lý AI.");
          return;
      }
      const selectedCount = selectedIds.size;
      const totalContent = drafts.filter(d => selectedIds.has(d.id)).reduce((acc, curr) => acc + (curr.content?.length || 0), 0);
      
      if (totalContent === 0) {
          alert("Các chương được chọn chưa có nội dung.");
          return;
      }

      alert(`Hệ thống sẽ xử lý ${selectedCount} chương đã chọn với cấu hình:\n- Model: ${aiModel}\n- Chế độ: ${translationMode}\n- Văn phong: ${translationTone}\n(Tính năng đang phát triển)`);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex justify-center items-center p-4 animate-fade-in">
      <div
        className={`bg-[var(--theme-bg-surface)] rounded-xl shadow-2xl flex flex-col h-[90vh] border border-[var(--theme-border)] transition-all duration-500 ease-in-out ${isAiMode ? 'w-full max-w-[95vw] lg:max-w-7xl' : 'w-full max-w-4xl'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)] bg-[var(--theme-bg-surface)] rounded-t-xl shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[var(--theme-text-primary)] flex items-center gap-2">
              <PlusIcon className="w-6 h-6 text-green-500" />
              {isAiMode ? 'AI Biên Dịch & Thêm Chương' : 'Thêm Chương Mới'}
            </h2>
            {isAiMode && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">BETA</span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
              {/* Global Upload Button - Always Visible */}
              <input 
                  type="file" 
                  className="hidden" 
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  multiple 
                  accept=".txt,.json,.epub,.html,.htm,.md" 
                  disabled={isProcessingFiles}
              />
              <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingFiles}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all text-sm font-bold"
                  title="Tải lên file (TXT, JSON, EPUB, HTML)"
              >
                  {isProcessingFiles ? (
                      <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                  ) : (
                      <UploadIcon className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{isProcessingFiles ? 'Đang xử lý...' : 'Tải file lên'}</span>
              </button>

              <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors" aria-label="Đóng">
                <CloseIcon className="w-6 h-6" />
              </button>
          </div>
        </div>

        {/* Main Content Area: Flex Row */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* LEFT COLUMN: AI CONFIGURATION (Visible in AI Mode) */}
            <div className={`flex-col bg-[var(--theme-bg-base)] border-r border-[var(--theme-border)] transition-all duration-500 ease-in-out overflow-y-auto custom-scrollbar ${isAiMode ? 'w-full lg:w-[400px] flex opacity-100' : 'w-0 opacity-0 hidden'}`}>
                <div className="p-5 space-y-6">
                    
                    {/* 0. API KEY MANAGEMENT (Mini Version) */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[var(--theme-accent-primary)] font-bold text-sm uppercase tracking-wider">
                                <KeyIcon className="w-4 h-4" /> Cấu hình API Key
                            </div>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--theme-accent-primary)] hover:underline">
                                Nhận API Key tại đây
                            </a>
                        </div>
                        
                        <div className="bg-[var(--theme-bg-surface)] rounded-lg border border-[var(--theme-border)] p-2 space-y-2">
                            {apiKeys.length === 0 && <p className="text-xs text-center text-[var(--theme-text-secondary)]">Chưa có API key.</p>}
                            <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-2">
                                {apiKeys.map(key => (
                                    <div key={key.id} className="flex items-center justify-between gap-2 p-1.5 rounded bg-[var(--theme-bg-base)] border border-[var(--theme-border)]">
                                        <div className="flex items-center gap-2 overflow-hidden cursor-pointer flex-grow" onClick={() => handleSetActiveApiKey(key.id)}>
                                            <input 
                                                type="radio" 
                                                checked={activeApiKeyId === key.id} 
                                                readOnly 
                                                className="w-3 h-3 text-[var(--theme-accent-primary)]"
                                            />
                                            <span className="text-xs font-mono truncate text-[var(--theme-text-primary)]">••••{key.key.slice(-4)}</span>
                                        </div>
                                        <button onClick={() => handleDeleteApiKey(key.id)} className="text-slate-400 hover:text-rose-500">
                                            <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            
                            {isAddingKey ? (
                                <div className="flex gap-1">
                                    <input 
                                        type="password" 
                                        value={newApiKeyInput}
                                        onChange={(e) => setNewApiKeyInput(e.target.value)}
                                        placeholder="Dán API Key..."
                                        className="flex-1 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--theme-accent-primary)]"
                                    />
                                    <button onClick={handleAddApiKey} className="bg-[var(--theme-accent-primary)] text-white px-2 rounded hover:brightness-110">
                                        <CheckIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => setIsAddingKey(true)} className="w-full py-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-primary)] border border-dashed border-[var(--theme-border)] rounded hover:border-[var(--theme-accent-primary)] flex items-center justify-center gap-1">
                                    <PlusIcon className="w-3 h-3" /> Thêm Key mới
                                </button>
                            )}
                        </div>
                        <p className="text-[10px] text-[var(--theme-text-secondary)] italic">
                            * API Key chỉ được lưu trữ cục bộ trên trình duyệt để đảm bảo an toàn.
                        </p>
                    </div>

                    <hr className="border-[var(--theme-border)]" />

                    {/* 1. TRANSLATION CONFIG */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[var(--theme-accent-primary)] font-bold text-sm uppercase tracking-wider">
                            <CogIcon className="w-4 h-4" /> Cấu hình dịch
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Mô hình AI</label>
                                <select 
                                    value={aiModel}
                                    onChange={(e) => setAiModel(e.target.value)}
                                    className="w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded px-3 py-2 text-sm text-[var(--theme-text-primary)] outline-none focus:border-[var(--theme-accent-primary)]"
                                >
                                    <option value="gemini-flash">Gemini 2.5 Flash (Nhanh)</option>
                                    <option value="gemini-pro">Gemini 3 Pro (Chất lượng cao)</option>
                                </select>
                            </div>

                            {/* Translation Mode Select */}
                            <div>
                                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Chế độ dịch thuật</label>
                                <select 
                                    value={translationMode}
                                    onChange={(e) => setTranslationMode(e.target.value)}
                                    className="w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded px-3 py-2 text-sm text-[var(--theme-text-primary)] outline-none focus:border-[var(--theme-accent-primary)]"
                                >
                                    <option value="zh-vi">Trung ➜ Việt</option>
                                    <option value="en-vi">Anh ➜ Việt</option>
                                    <option value="vi-vi">Việt ➜ Việt (Biên tập Convert)</option>
                                    <option value="vi-en">Việt ➜ Anh</option>
                                    <option value="vi-zh">Việt ➜ Trung</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Văn phong / Thể loại</label>
                                <select 
                                    value={translationTone}
                                    onChange={(e) => setTranslationTone(e.target.value)}
                                    className="w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded px-3 py-2 text-sm text-[var(--theme-text-primary)] outline-none focus:border-[var(--theme-accent-primary)]"
                                >
                                    <option value="tien-hiep">Tiên Hiệp / Kiếm Hiệp (Hán Việt hóa)</option>
                                    <option value="sac-hiep">Sắc Hiệp (Tả thực)</option>
                                    <option value="do-thi">Đô Thị (Hiện đại, gãy gọn)</option>
                                    <option value="thuan-viet">Thuần Việt (Dễ đọc)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Số dòng/lần xử lý: {batchSize}</label>
                                <input 
                                    type="range" min="1" max="20" 
                                    value={batchSize} 
                                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                                    className="w-full h-1 bg-[var(--theme-border)] rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-[var(--theme-border)]" />

                    {/* 2. CONTEXT & GLOSSARY */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[var(--theme-accent-primary)] font-bold text-sm uppercase tracking-wider">
                            <UserIcon className="w-4 h-4" /> Bối cảnh & Nhân vật
                        </div>
                        <div className="relative">
                            <textarea 
                                value={context}
                                onChange={(e) => setContext(e.target.value)}
                                placeholder="Nhập tên nhân vật, mối quan hệ, hoặc các từ khóa cần giữ nguyên (VD: Main: Lâm Phong - lạnh lùng...)"
                                className="w-full h-24 bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg p-3 text-xs text-[var(--theme-text-primary)] focus:ring-1 focus:ring-[var(--theme-accent-primary)] outline-none resize-none"
                            />
                            <div className="absolute bottom-2 right-2 text-[10px] text-[var(--theme-text-secondary)] bg-[var(--theme-bg-surface)]/80 px-1 rounded">
                                AI sẽ dựa vào đây để dịch đúng xưng hô
                            </div>
                        </div>
                    </div>

                    {/* 3. TOGGLES */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[var(--theme-accent-primary)] font-bold text-sm uppercase tracking-wider">
                            <WrenchScrewdriverIcon className="w-4 h-4" /> Tùy chọn khác
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[var(--theme-bg-surface)] transition-colors">
                                <span className="text-sm text-[var(--theme-text-primary)]">Tự động tạo tiêu đề chương</span>
                                <div className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={autoTitle} onChange={() => setAutoTitle(!autoTitle)} className="sr-only peer" />
                                    <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--theme-accent-primary)]"></div>
                                </div>
                            </label>
                            
                            <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[var(--theme-bg-surface)] transition-colors">
                                <span className="text-sm text-[var(--theme-text-primary)]">Lọc rác/chú thích converter</span>
                                <div className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={cleanNotes} onChange={() => setCleanNotes(!cleanNotes)} className="sr-only peer" />
                                    <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--theme-accent-primary)]"></div>
                                </div>
                            </label>

                            <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[var(--theme-bg-surface)] transition-colors">
                                <span className="text-sm text-[var(--theme-text-primary)]">Ưu tiên từ Hán Việt (VietPhrase)</span>
                                <div className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={vietPhrase} onChange={() => setVietPhrase(!vietPhrase)} className="sr-only peer" />
                                    <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--theme-accent-primary)]"></div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* EXECUTE BUTTON */}
                    <div className="pt-2 sticky bottom-0 bg-[var(--theme-bg-base)] pb-2">
                        <button 
                            onClick={handleRunAi}
                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95"
                        >
                            <SparklesIcon className="w-5 h-5" /> Áp dụng AI ({selectedIds.size})
                        </button>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: DRAFTS LIST (The Original Content) */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--theme-bg-base)]">
                {/* Toolbar */}
                <div className="px-4 py-2 bg-[var(--theme-bg-base)] border-b border-[var(--theme-border)] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                checked={isAllSelected} 
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-[var(--theme-border)] text-[var(--theme-accent-primary)] focus:ring-[var(--theme-accent-primary)] cursor-pointer"
                                title="Chọn tất cả"
                            />
                            <span className="text-xs font-semibold text-[var(--theme-text-primary)]">
                                {selectedIds.size}/{drafts.length}
                            </span>
                        </div>
                        <span className="text-xs text-[var(--theme-text-secondary)] hidden sm:inline">| Danh sách chương</span>
                    </div>
                    
                    {/* Unified Sort Button & Dropdown */}
                    <div className="relative" ref={sortMenuRef}>
                        <button 
                            onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] hover:border-[var(--theme-accent-primary)] transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                            title="Sắp xếp danh sách"
                        >
                            <SortIcon className="w-3.5 h-3.5" />
                            <span className="font-medium">Sắp xếp</span>
                        </button>
                        
                        {isSortMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in-up">
                                <div className="p-1 space-y-0.5">
                                    <button 
                                        onClick={() => handleSort('number')}
                                        className={`flex items-center justify-between w-full px-3 py-2 text-xs rounded-md transition-colors ${sortType === 'number' ? 'bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)]' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-base)] hover:text-[var(--theme-text-primary)]'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <HashtagIcon className="w-3.5 h-3.5" />
                                            <span>Số chương</span>
                                        </div>
                                        {sortType === 'number' && (sortOrder === 'asc' ? <ArrowUpIcon className="w-3.5 h-3.5" /> : <ArrowDownIcon className="w-3.5 h-3.5" />)}
                                    </button>
                                    
                                    <button 
                                        onClick={() => handleSort('time')}
                                        className={`flex items-center justify-between w-full px-3 py-2 text-xs rounded-md transition-colors ${sortType === 'time' ? 'bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)]' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-base)] hover:text-[var(--theme-text-primary)]'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <ClockIcon className="w-3.5 h-3.5" />
                                            <span>Thời gian thêm</span>
                                        </div>
                                        {sortType === 'time' && (sortOrder === 'asc' ? <ArrowUpIcon className="w-3.5 h-3.5" /> : <ArrowDownIcon className="w-3.5 h-3.5" />)}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Scrollable List */}
                <div className="flex-grow overflow-y-auto p-4 custom-scrollbar" ref={listRef}>
                    <div className="space-y-4">
                        {drafts.length === 0 && (
                            <div className="text-center py-20 text-[var(--theme-text-secondary)] opacity-50">
                                <p>Chưa có chương nào được thêm.</p>
                                <p className="text-xs">Nhấn "Thêm chương" hoặc Tải file lên.</p>
                            </div>
                        )}
                        {drafts.map((draft, index) => (
                            <div key={draft.id} className={`bg-[var(--theme-bg-surface)] border rounded-lg p-4 shadow-sm relative group transition-all ${selectedIds.has(draft.id) ? 'border-[var(--theme-accent-primary)] ring-1 ring-[var(--theme-accent-primary)]/30' : 'border-[var(--theme-border)] hover:border-[var(--theme-accent-primary)]/50'}`}>
                                
                                {/* Selection Checkbox - Top Left */}
                                <div className="absolute top-3 left-3 z-10">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.has(draft.id)} 
                                        onChange={() => toggleSelect(draft.id)}
                                        className="w-5 h-5 rounded border-[var(--theme-border)] text-[var(--theme-accent-primary)] focus:ring-[var(--theme-accent-primary)] cursor-pointer"
                                    />
                                </div>

                                {/* Remove Button */}
                                <button 
                                    onClick={() => removeCard(draft.id)}
                                    className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-900/20 rounded-full transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100 z-10"
                                    title="Xóa thẻ này"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>

                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-3 pl-6">
                                    {/* Chapter Number */}
                                    <div className="md:col-span-2 xl:col-span-2">
                                        <label className="block text-[10px] uppercase font-bold text-[var(--theme-text-secondary)] mb-1">Số chương</label>
                                        <input
                                            type="number"
                                            value={draft.number}
                                            onChange={(e) => updateDraft(draft.id, 'number', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded text-sm text-[var(--theme-text-primary)] focus:ring-1 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)] outline-none font-mono text-center"
                                        />
                                    </div>
                                    
                                    {/* Chapter Title */}
                                    <div className="md:col-span-10 xl:col-span-10">
                                        <label className="block text-[10px] uppercase font-bold text-[var(--theme-text-secondary)] mb-1">Tên chương (Tùy chọn)</label>
                                        <input
                                            type="text"
                                            value={draft.title}
                                            onChange={(e) => updateDraft(draft.id, 'title', e.target.value)}
                                            placeholder="Ví dụ: Mở đầu, Gặp gỡ..."
                                            className="w-full px-3 py-2 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded text-sm text-[var(--theme-text-primary)] focus:ring-1 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)] outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="pl-6">
                                    <label className="block text-[10px] uppercase font-bold text-[var(--theme-text-secondary)] mb-1">Nội dung chương</label>
                                    <textarea
                                        value={draft.content}
                                        onChange={(e) => updateDraft(draft.id, 'content', e.target.value)}
                                        placeholder="Nhập nội dung chương tại đây..."
                                        className="w-full min-h-[120px] p-3 bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded text-sm text-[var(--theme-text-primary)] focus:ring-1 focus:ring-[var(--theme-accent-primary)] focus:border-[var(--theme-accent-primary)] outline-none resize-y font-[var(--reader-font-family)] leading-relaxed"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add More Button (Manual) */}
                    <button
                        onClick={addCard}
                        className="w-full mt-6 py-4 border-2 border-dashed border-[var(--theme-border)] rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-primary)] hover:border-[var(--theme-accent-primary)] hover:bg-[var(--theme-accent-primary)]/5 transition-all flex items-center justify-center gap-2 font-medium"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Thêm thủ công
                    </button>
                </div>
            </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--theme-border)] bg-[var(--theme-bg-surface)] rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
            <button
                onClick={toggleAiMode}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 font-medium text-sm border ${isAiMode ? 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-900/30' : 'bg-[var(--theme-bg-base)] text-[var(--theme-text-secondary)] border-[var(--theme-border)] hover:border-purple-500 hover:text-purple-400'}`}
            >
                <SparklesIcon className={`w-4 h-4 ${isAiMode ? 'animate-pulse' : ''}`} />
                {isAiMode ? 'Đóng AI Panel' : 'Mở AI Biên Dịch'}
            </button>

            <div className="flex gap-3 w-full sm:w-auto">
                <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors text-sm disabled:opacity-50"
                >
                    Hủy
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none px-8 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-colors shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                    {isSaving ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <CheckIcon className="w-5 h-5" />}
                    Lưu {drafts.filter(d => d.content.trim()).length} chương
                </button>
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MultiChapterAddModal;
