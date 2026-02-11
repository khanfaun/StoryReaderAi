
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterStats, DiaDiem, QuanHe, NPC, Story, ChatMessage } from '../types';
import LoadingSpinner from './LoadingSpinner';
import InfoItemDisplay from './InfoItemDisplay';
import EntityEditModal, { EntityType } from './EntityEditModal';
import ConfirmationModal from './ConfirmationModal';
import { PlusIcon, EditIcon, TrashIcon, DownloadIcon, UploadIcon, ChatIcon, SpinnerIcon } from './icons';
import EntityTooltip from './EntityTooltip';
import { getStoryState, saveStoryState, exportStoryData, importStoryData } from '../services/storyStateService';

interface CharacterPanelProps {
  stats: CharacterStats | null;
  story?: Story | null; // Added story prop
  isOpen: boolean;
  onClose: () => void;
  isAnalyzing: boolean;
  isSidebar?: boolean;
  onStatsChange: (newStats: CharacterStats) => void;
  onDataLoaded: () => void;
  onReanalyze: () => void;
  onStopAnalysis: () => void;
  // Chat props
  chatMessages?: ChatMessage[];
  onSendMessage?: (message: string) => void;
  isChatLoading?: boolean;
}

type Tab = 'status' | 'realmSystem' | 'inventory' | 'skills' | 'equipment' | 'npcs' | 'relationships' | 'factions' | 'locations' | 'data' | 'chat';

interface RelationshipGraphProps {
  relations: QuanHe[];
  mainCharacterName: string | null;
}

const getEdgeColor = (description: string): string => {
    const lowerDesc = (description || '').toLowerCase();
    if (['huyết hải', 'truy sát', 'sinh tử đại địch', 'diệt tộc', 'không đội trời chung'].some(kw => lowerDesc.includes(kw))) {
        return '#991b1b'; 
    }
    if (['thù địch', 'kẻ thù', 'đối địch', 'phản bội', 'hãm hại', 'âm mưu', 'ghen ghét'].some(kw => lowerDesc.includes(kw))) {
        return '#f97316'; 
    }
    if (['mâu thuẫn', 'đối thủ', 'cạnh tranh', 'coi thường', 'chán ghét', 'xung đột', 'gây sự'].some(kw => lowerDesc.includes(kw))) {
        return '#eab308'; 
    }
    if (['đồng minh', 'bằng hữu', 'đồng môn', 'thân hữu', 'giúp đỡ', 'cảm kích', 'tiền bối'].some(kw => lowerDesc.includes(kw))) {
        return '#22d3ee'; 
    }
    if (['thân thiết tột cùng', 'sư đồ', 'phu thê', 'tri kỷ', 'huynh đệ', 'gia tộc', 'sống chết', 'trung thành', 'ân nhân'].some(kw => lowerDesc.includes(kw))) {
        return '#22c55e'; 
    }
    return '#e2e8f0'; 
};


const RelationshipGraph: React.FC<RelationshipGraphProps> = ({ relations, mainCharacterName }) => {
    const [focusedCharacter, setFocusedCharacter] = useState<string | null>(mainCharacterName);
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const svgRef = useRef<SVGSVGElement>(null);
    const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());

    useEffect(() => {
        setFocusedCharacter(mainCharacterName);
    }, [mainCharacterName]);

    const filteredRelations = useMemo(() => {
        if (!focusedCharacter) return [];
        return relations.filter(
            rel => rel.nhanVat1 === focusedCharacter || rel.nhanVat2 === focusedCharacter
        );
    }, [relations, focusedCharacter]);

    const nodeNames = useMemo(() => {
        if (!focusedCharacter) return [];
        const names = new Set<string>([focusedCharacter]);
        filteredRelations.forEach(rel => {
            names.add(rel.nhanVat1);
            names.add(rel.nhanVat2);
        });
        return Array.from(names);
    }, [filteredRelations, focusedCharacter]);

    const width = 350;
    const height = 350;

    const nodesWithInfo = useMemo(() => {
        if (!focusedCharacter) return [];
        
        return nodeNames.map(name => {
            const isFocused = name === focusedCharacter;
            const isMain = name === mainCharacterName;
            let relationshipText = '';
            let nodeColor = isMain ? "var(--theme-accent-secondary)" : "var(--theme-text-secondary)";
    
            if (isFocused) {
                nodeColor = 'var(--theme-text-primary)'; 
            } else {
                const relation = filteredRelations.find(r => 
                    (r.nhanVat1 === focusedCharacter && r.nhanVat2 === name) || 
                    (r.nhanVat1 === name && r.nhanVat2 === focusedCharacter)
                );
                if (relation) {
                    let shortDesc = (relation.moTa || '').split(/[.,(]/)[0].trim();
                    if (shortDesc.length > 25) {
                        const words = shortDesc.split(/\s+/);
                        if (words.length > 3) {
                            shortDesc = words.slice(0, 3).join(' ') + '...';
                        }
                    }
                    relationshipText = shortDesc;
                    nodeColor = getEdgeColor(relation.moTa);
                }
            }
    
            return {
                name,
                isFocused,
                isMain,
                relationshipText,
                nodeColor,
            };
        });
    }, [nodeNames, filteredRelations, focusedCharacter, mainCharacterName]);

    useEffect(() => {
        if (nodeNames.length === 0 || !focusedCharacter) return;

        const newPositions = new Map<string, { x: number; y: number }>();
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 80;

        newPositions.set(focusedCharacter, { x: centerX, y: centerY });

        const outerNodes = nodeNames.filter(name => name !== focusedCharacter);
        const angleStep = (2 * Math.PI) / (outerNodes.length || 1);

        outerNodes.forEach((name, i) => {
            const angle = i * angleStep - Math.PI / 2; 
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            newPositions.set(name, { x, y });
        });
        
        setNodePositions(newPositions);
    }, [nodeNames, focusedCharacter]);


    const handleZoom = (direction: 'in' | 'out') => {
        const scaleAmount = 1.2;
        const currentScale = transform.scale;
        const newScale = direction === 'in' ? currentScale * scaleAmount : currentScale / scaleAmount;
        const clampedScale = Math.max(0.2, Math.min(5, newScale));
        if (clampedScale === currentScale) return;

        const centerX = width / 2;
        const centerY = height / 2;

        const newX = centerX - (centerX - transform.x) * (clampedScale / currentScale);
        const newY = centerY - (centerY - transform.y) * (clampedScale / currentScale);
        
        setTransform({ scale: clampedScale, x: newX, y: newY });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        e.preventDefault();
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        panStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => setIsPanning(false);

    if (relations.length === 0) {
        return <p className="text-[var(--theme-text-secondary)] italic">Chưa có thông tin quan hệ để hiển thị. Hãy chọn một nhân vật phụ và tick vào ô "Hiển thị trên sơ đồ quan hệ".</p>;
    }
    
    if (nodeNames.length < 1 && focusedCharacter) {
        return (
             <div className="flex flex-col items-center">
                <p className="font-bold text-lg text-[var(--theme-accent-primary)] mb-2">{focusedCharacter}</p>
                <p className="text-[var(--theme-text-secondary)] italic">Nhân vật này chưa có mối quan hệ nào được ghi nhận.</p>
             </div>
        )
    }
    
    return (
        <div className="flex flex-col items-center">
            <div className="mb-4 text-center">
                <p className="text-sm text-[var(--theme-text-secondary)]">Đang xem quan hệ của:</p>
                <p className="font-bold text-lg text-[var(--theme-accent-primary)]">{focusedCharacter || '...'}</p>
            </div>
            <div className="relative w-full">
                <svg 
                  ref={svgRef}
                  viewBox={`0 0 ${width} ${height}`} 
                  className="w-full h-auto border border-[var(--theme-border)] rounded-md bg-[var(--theme-bg-base)]" 
                  aria-labelledby="graph-title" 
                  role="img"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                >
                    <title id="graph-title">Sơ đồ mối quan hệ giữa các nhân vật</title>
                    <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                        {filteredRelations.map((rel, index) => {
                            const pos1 = nodePositions.get(rel.nhanVat1);
                            const pos2 = nodePositions.get(rel.nhanVat2);
                            if (!pos1 || !pos2) return null;
                            
                            return (
                                <g key={`${rel.nhanVat1}-${rel.nhanVat2}-${index}`} className="opacity-80">
                                    <line x1={pos1.x} y1={pos1.y} x2={pos2.x} y2={pos2.y} stroke={getEdgeColor(rel.moTa)} strokeWidth="1.5" />
                                </g>
                            );
                        })}
                        {nodesWithInfo.map(node => {
                            const pos = nodePositions.get(node.name);
                            if (!pos) return null;
                           
                            const isCenterNode = node.name === focusedCharacter;
                            const textProps: { textAnchor: "start" | "middle" | "end", x: number, y: number } = {
                                textAnchor: 'middle',
                                x: 0,
                                y: isCenterNode ? -15 : 0,
                            };

                            if (!isCenterNode) {
                                const angle = Math.atan2(pos.y - height / 2, pos.x - width / 2);
                                const deg = angle * (180 / Math.PI);
                                if (deg > -45 && deg <= 45) { // Phải
                                    textProps.textAnchor = 'start';
                                    textProps.x = 12;
                                    textProps.y = 5;
                                } else if (deg > 45 && deg <= 135) { // Dưới
                                    textProps.textAnchor = 'middle';
                                    textProps.y = 22;
                                } else if (deg > 135 || deg <= -135) { // Trái
                                    textProps.textAnchor = 'end';
                                    textProps.x = -12;
                                    textProps.y = 5;
                                } else { // Trên
                                    textProps.textAnchor = 'middle';
                                    textProps.y = -15;
                                }
                            }
                           
                            return (
                                <g key={node.name} transform={`translate(${pos.x}, ${pos.y})`} className="group" aria-label={`Xem quan hệ của ${node.name}`}>
                                    <g onClick={() => setFocusedCharacter(node.name)} className="cursor-pointer">
                                        {node.isFocused && !node.isMain && (
                                            <circle r="12" fill="var(--theme-accent-primary)" className="opacity-40 animate-pulse" />
                                        )}
                                        <circle r="6" fill={node.nodeColor} stroke={node.isFocused ? "var(--theme-accent-primary)" : node.nodeColor} strokeWidth="2" className="group-hover:stroke-[var(--theme-accent-secondary)] transition-all" />
                                        <text {...textProps} fill="var(--theme-text-primary)" fontSize="12" fontWeight={node.isMain || node.isFocused ? "bold" : "normal"} className="group-hover:fill-[var(--theme-accent-secondary)] transition-colors" style={{ paintOrder: 'stroke', stroke: 'var(--theme-bg-base)', strokeWidth: '3px', strokeLinejoin: 'round' }}>
                                            {node.name}
                                            {node.relationshipText && (
                                                <tspan x={textProps.x} dy="1.2em" fontSize="9" fill="var(--theme-text-secondary)">{node.relationshipText}</tspan>
                                            )}
                                        </text>
                                    </g>
                                </g>
                            );
                        })}
                    </g>
                </svg>
                <div className="absolute bottom-2 right-2 flex flex-col gap-2 z-10">
                    <button 
                        onClick={() => handleZoom('in')} 
                        className="w-8 h-8 flex items-center justify-center bg-[var(--theme-bg-surface)] hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] rounded-md text-xl font-bold transition-colors"
                        aria-label="Phóng to"
                    >+</button>
                    <button 
                        onClick={() => handleZoom('out')} 
                        className="w-8 h-8 flex items-center justify-center bg-[var(--theme-bg-surface)] hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] rounded-md text-xl font-bold transition-colors"
                        aria-label="Thu nhỏ"
                    >-</button>
                </div>
            </div>
            {focusedCharacter && focusedCharacter !== mainCharacterName && (
                 <button onClick={() => setFocusedCharacter(mainCharacterName)} className="mt-4 px-4 py-2 text-sm bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] font-semibold rounded-lg hover:border-[var(--theme-accent-primary)] transition-all">
                    Xem nhân vật chính
                </button>
            )}
            <div className="w-full mt-4 p-3 border border-[var(--theme-border)] rounded-md bg-[var(--theme-bg-base)] text-sm">
                <h4 className="font-semibold text-[var(--theme-text-primary)] mb-2 text-center">Chú giải mức độ thân thiết</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: '#22c55e' }}></span>
                        <span className="text-[var(--theme-text-secondary)]">Thân Thiết Tột Cùng</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: '#eab308' }}></span>
                        <span className="text-[var(--theme-text-secondary)]">Mâu Thuẫn</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: '#22d3ee' }}></span>
                        <span className="text-[var(--theme-text-secondary)]">Đồng Minh / Tích Cực</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: '#f97316' }}></span>
                        <span className="text-[var(--theme-text-secondary)]">Thù Địch</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: '#e2e8f0' }}></span>
                        <span className="text-[var(--theme-text-secondary)]">Trung Lập</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: '#991b1b' }}></span>
                        <span className="text-[var(--theme-text-secondary)]">Sinh Tử Đại Địch</span>
                    </div>
                </div>
            </div>
        </div>
    );
};


const CharacterPanel: React.FC<CharacterPanelProps> = ({ 
    stats, story, isOpen, onClose, isAnalyzing, isSidebar = false, onStatsChange, onDataLoaded, onReanalyze, onStopAnalysis,
    chatMessages, onSendMessage, isChatLoading 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>(isSidebar ? 'npcs' : 'status');
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: EntityType | null; data: any | null }>({ isOpen: false, type: null, data: null });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: EntityType; entity: any; } | null>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  
  // Chat state in case we want specific chat behaviors inside the tab
  const [chatInput, setChatInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const allCharacterNames = useMemo(() => {
    if (!stats) return [];
    const mainCharName = stats.trangThai?.ten;
    const npcNames = stats.npcs?.map(npc => npc.ten) || [];
    return [mainCharName, ...npcNames].filter((name): name is string => !!name);
  }, [stats]);

  // Scroll chat to bottom
  useEffect(() => {
      if (activeTab === 'chat' && chatContainerRef.current) {
          // Use scrollTop to scroll container only, preventing whole page scroll
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
  }, [chatMessages, activeTab]);

  const handleOpenModal = (type: EntityType, data: any | null = null) => {
    setModalState({ isOpen: true, type, data });
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, type: null, data: null });
  };

  const handleSaveEntity = (entityData: any) => {
    if (!modalState.type) return;

    // Khởi tạo stats mới nếu hiện tại null
    const newStats = stats ? JSON.parse(JSON.stringify(stats)) : {};
    const type = modalState.type;

    if (type === 'heThongCanhGioi') {
        const list: string[] = newStats.heThongCanhGioi || [];
        if (modalState.data) { // Editing
            const index = list.indexOf(modalState.data);
            if (index > -1) list[index] = entityData;
        } else { // Adding
            list.push(entityData);
        }
        newStats.heThongCanhGioi = list;
    } else if (type === 'tuChat') {
        const list = newStats.trangThai?.tuChat || [];
        const index = list.findIndex((item: any) => item.ten === modalState.data?.ten);
        if (index !== -1) list[index] = entityData; else list.push(entityData);
        if (!newStats.trangThai) newStats.trangThai = { ten: '' };
        newStats.trangThai.tuChat = list;
    } else if (type === 'quanHe') {
        const list: QuanHe[] = newStats.quanHe || [];
        if (modalState.data) { // Editing
            const index = list.findIndex(item => item.nhanVat1 === modalState.data.nhanVat1 && item.nhanVat2 === modalState.data.nhanVat2);
            if (index !== -1) list[index] = entityData;
        } else { // Adding
            list.push(entityData);
        }
        newStats.quanHe = list;
    } else if (type === 'diaDiem') {
        const { isCurrentLocation, ...locationDetails } = entityData;
        const list: DiaDiem[] = newStats.diaDiem || [];
        const index = list.findIndex((item) => item.ten === modalState.data?.ten);
        
        if (index !== -1) list[index] = locationDetails; else list.push(locationDetails);
        newStats.diaDiem = list;

        if (isCurrentLocation) {
            newStats.viTriHienTai = locationDetails.ten;
        } else if (newStats.viTriHienTai === locationDetails.ten) {
            // Unchecked the current location, so clear it
            newStats.viTriHienTai = undefined;
        }
    } else { // Handle other standard object arrays
        const list = newStats[type as keyof CharacterStats] as any[] || [];
        const index = list.findIndex((item: any) => item.ten === modalState.data?.ten);
        if (index !== -1) list[index] = entityData; else list.push(entityData);
        (newStats as any)[type] = list;
    }
    
    onStatsChange(newStats);
    handleCloseModal();
  };

  const handleRequestDelete = (type: EntityType, entity: any) => {
    setDeleteConfirmation({ type, entity });
  };

  const handleDeleteEntity = () => {
      if (!stats || !deleteConfirmation) return;

      const { type, entity } = deleteConfirmation;
      const newStats = JSON.parse(JSON.stringify(stats));

      if (type === 'heThongCanhGioi') {
        newStats.heThongCanhGioi = (newStats.heThongCanhGioi || []).filter((item: string) => item !== entity);
      } else if (type === 'tuChat') {
         if (newStats.trangThai?.tuChat) {
             newStats.trangThai.tuChat = newStats.trangThai.tuChat.filter((item: any) => item.ten !== entity.ten);
         }
      } else if (type === 'quanHe') {
         newStats.quanHe = (newStats.quanHe || []).filter((item: QuanHe) => !(item.nhanVat1 === entity.nhanVat1 && item.nhanVat2 === entity.nhanVat2));
      } else {
          const list = newStats[type as keyof CharacterStats] as any[] || [];
          (newStats as any)[type] = list.filter(item => item.ten !== entity.ten);
      }

      onStatsChange(newStats);
      setDeleteConfirmation(null); // Close modal after deletion
  };

  // Replaced manual logic with shared service call
  const handleSaveData = async () => {
    if (!story) return;
    await exportStoryData(story);
  };

  const handleLoadData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !story) return;
    await importStoryData(file, story, onDataLoaded);
    if (event.target) event.target.value = '';
  };
  
  const handleChatSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (chatInput.trim() && !isChatLoading && onSendMessage) {
          onSendMessage(chatInput.trim());
          setChatInput('');
      }
  };


  const allRelations = useMemo((): QuanHe[] => {
    if (!stats) return [];
    const relations: QuanHe[] = [];
    const mainCharName = stats.trangThai?.ten;

    // 1. Mối quan hệ MC -> NPC (từ checkbox)
    if (mainCharName && stats.npcs) {
        stats.npcs.forEach(npc => {
            if (npc.hienThiQuanHe) {
                relations.push({
                    nhanVat1: mainCharName,
                    nhanVat2: npc.ten,
                    moTa: npc.mucDoThanThiet || 'Trung Lập'
                });
            }
        });
    }

    // 2. Mối quan hệ NPC -> Nhân vật khác (từ multi-select mới)
    if (stats.npcs) {
        stats.npcs.forEach(npc => {
            if (npc.quanHeVoiNhanVatKhac) {
                npc.quanHeVoiNhanVatKhac.forEach(rel => {
                    // Tránh thêm các mối quan hệ trùng lặp nếu được xác định từ hai phía
                    const exists = relations.some(r =>
                        (r.nhanVat1 === npc.ten && r.nhanVat2 === rel.nhanVatKhac) ||
                        (r.nhanVat1 === rel.nhanVatKhac && r.nhanVat2 === npc.ten)
                    );
                    if (!exists && rel.nhanVatKhac) { // Đảm bảo nhân vật khác đã được chọn
                        relations.push({
                            nhanVat1: npc.ten,
                            nhanVat2: rel.nhanVatKhac,
                            moTa: rel.moTa,
                        });
                    }
                });
            }
        });
    }
    
    return relations;
  }, [stats]);


  const renderContent = () => {
    // Logic kiểm tra !hasAnyData đã được loại bỏ để luôn hiển thị
    
    if (activeTab === 'chat') {
        return (
            <div className="flex flex-col h-[60vh] max-h-[500px]">
                <div 
                    ref={chatContainerRef} 
                    className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2 custom-scrollbar"
                >
                    {(!chatMessages || chatMessages.length === 0) && (
                        <div className="text-center text-[var(--theme-text-secondary)] p-4 italic">
                            <p>Hãy hỏi tôi bất cứ điều gì về cốt truyện, nhân vật hoặc các chi tiết trong chương này.</p>
                        </div>
                    )}
                    {chatMessages?.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-[var(--theme-accent-primary)] text-white' : 'bg-[var(--theme-bg-base)] text-[var(--theme-text-primary)] border border-[var(--theme-border)]'}`}>
                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div className="flex justify-start">
                            <div className="px-3 py-2 rounded-2xl bg-[var(--theme-bg-base)] border border-[var(--theme-border)] flex items-center">
                                <SpinnerIcon className="animate-spin w-4 h-4 text-[var(--theme-accent-primary)]" />
                            </div>
                        </div>
                    )}
                </div>
                <form onSubmit={handleChatSubmit} className="flex gap-2 pt-2 border-t border-[var(--theme-border)]">
                    <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Hỏi AI..." 
                        className="flex-grow bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-full px-4 py-2 text-sm text-[var(--theme-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent-primary)] disabled:opacity-50"
                        disabled={isChatLoading}
                    />
                    <button 
                        type="submit" 
                        disabled={!chatInput.trim() || isChatLoading}
                        className="w-9 h-9 rounded-full bg-[var(--theme-accent-primary)] hover:brightness-110 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 transform rotate-90">
                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                        </svg>
                    </button>
                </form>
            </div>
        );
    }
    
    // Nếu đang phân tích thì hiển thị spinner, nhưng không chặn hoàn toàn nếu muốn xem tab khác
    if (isAnalyzing && activeTab !== 'data') {
        // Có thể hiển thị loading nhỏ ở góc, hoặc để người dùng vẫn thao tác
        // Ở đây ta giữ loading nếu không có dữ liệu gì cả để tránh rối
        const hasSomeData = stats && (
            stats.trangThai || stats.canhGioi || stats.balo?.length || stats.npcs?.length
        );
        if (!hasSomeData) {
             return (
                <div className="flex flex-col items-center justify-center h-48">
                    <LoadingSpinner />
                    <p className="text-[var(--theme-accent-primary)] mt-2">Đang phân tích chương...</p>
                </div>
            );
        }
    }

    const renderInfoList = (title: string, items: any[] | undefined, type: EntityType) => {
        const list = items || [];
        return (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-[var(--theme-accent-primary)]">{title}</h3>
                    <button 
                        onClick={() => handleOpenModal(type)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-md transition-colors"
                        aria-label={`Thêm ${title} mới`}
                    >
                        <PlusIcon className="w-4 h-4" />
                        Thêm
                    </button>
                </div>
                {list.length === 0 ? (
                    <p className="text-[var(--theme-text-secondary)] italic text-sm">Chưa có thông tin. Nhấn "Thêm" để nhập tay.</p>
                ) : (
                     <div className="flex flex-col gap-2">
                        {list.map((item, index) => {
                            const isString = typeof item === 'string';
                            const displayItem = isString ? { ten: item, moTa: '' } : item;
                            const key = isString ? item : (item.ten || `${item.nhanVat1}-${item.nhanVat2}-${index}`);
                            return (
                                <InfoItemDisplay
                                    key={key}
                                    item={displayItem}
                                    isSimpleString={isString}
                                    onEdit={() => handleOpenModal(type, item)}
                                    onDelete={() => handleRequestDelete(type, item)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    switch(activeTab) {
      // Character Primary Panel Tabs
      case 'status':
        const r = stats?.trangThai;
        return (
          <div>
            <h3 className="text-xl font-bold text-[var(--theme-accent-primary)] mb-4">Trạng Thái & Cảnh Giới</h3>
            <div className="space-y-4">
                <p className="text-lg"><strong>Tên:</strong> {r?.ten || 'Chưa cập nhật'}</p>
                 <p className="text-lg">
                    <strong>Cảnh giới:</strong> 
                    <span className="text-2xl ml-2 text-[var(--theme-accent-secondary)] font-semibold">{stats?.canhGioi || 'Chưa rõ'}</span>
                </p>
                {renderInfoList('Tư chất / Đặc tính', r?.tuChat, 'tuChat')}
              </div>
          </div>
        );
      case 'realmSystem':
        return renderInfoList('Hệ Thống Cấp Độ', stats?.heThongCanhGioi, 'heThongCanhGioi');
      case 'inventory':
         return renderInfoList('Balo', stats?.balo, 'balo');
      case 'skills':
         return renderInfoList('Công Pháp / Kỹ Năng', stats?.congPhap, 'congPhap');
      case 'equipment':
        return renderInfoList('Trang Bị', stats?.trangBi, 'trangBi');
      
      // World Info Panel Tabs
      case 'npcs':
        const npcs = stats?.npcs || [];
        return (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-[var(--theme-accent-primary)]">Nhân Vật Phụ</h3>
                    <button 
                        onClick={() => handleOpenModal('npcs')}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-md transition-colors"
                        aria-label="Thêm Nhân Vật Phụ mới"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Thêm
                    </button>
                </div>
                {npcs.length === 0 ? (
                    <p className="text-[var(--theme-text-secondary)] italic text-sm">Chưa có thông tin. Nhấn "Thêm" để nhập tay.</p>
                ) : (
                     <div className="flex flex-col gap-2">
                        {npcs.map((npc) => (
                           <div key={npc.ten} className="flex items-center gap-2">
                                <div className="w-3 h-3 flex-shrink-0" title={`Quan hệ với NVC: ${npc.mucDoThanThiet || 'Chưa rõ'}`}>
                                    {npc.hienThiQuanHe && (
                                        <svg viewBox="0 0 12 12" fill={getEdgeColor(npc.mucDoThanThiet || '')}>
                                            <circle cx="6" cy="6" r="6" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <InfoItemDisplay
                                        item={npc}
                                        onEdit={() => handleOpenModal('npcs', npc)}
                                        onDelete={() => handleRequestDelete('npcs', npc)}
                                    />
                                </div>
                           </div>
                        ))}
                    </div>
                )}
            </div>
        );
      case 'relationships':
        return (
          <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-[var(--theme-accent-primary)]">Sơ đồ Quan hệ</h3>
            </div>
            <RelationshipGraph 
                relations={allRelations}
                mainCharacterName={stats?.trangThai?.ten || null}
            />
          </div>
        );
      case 'factions':
        return renderInfoList('Thế Lực / Môn Phái', stats?.theLuc, 'theLuc');
      case 'locations':
        return (
            <div>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-[var(--theme-accent-primary)]">Sơ đồ Địa Điểm</h3>
                  <button 
                      onClick={() => handleOpenModal('diaDiem')}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-md transition-colors"
                      aria-label="Thêm Địa điểm mới"
                  >
                      <PlusIcon className="w-4 h-4" />
                      Thêm
                  </button>
              </div>
              {(stats?.diaDiem && stats.diaDiem.length > 0) ? (
                  <LocationTree 
                    locations={stats.diaDiem || []} 
                    currentLocation={stats.viTriHienTai || null}
                    onEdit={handleOpenModal}
                    onDelete={handleRequestDelete}
                  />
              ) : (
                 <p className="text-[var(--theme-text-secondary)] italic text-sm">Chưa có thông tin. Nhấn "Thêm" để nhập tay.</p>
              )}
            </div>
        );
      case 'data':
        return (
            <div>
                <h3 className="text-xl font-bold text-[var(--theme-accent-primary)] mb-4">Quản lý Dữ liệu AI</h3>
                <div className="space-y-6">
                    <div className="p-4 border border-[var(--theme-border)] rounded-lg bg-[var(--theme-bg-base)]">
                        <h4 className="text-sm font-bold text-[var(--theme-text-primary)] mb-2">1. Xuất Dữ Liệu (Truyện Này)</h4>
                        <p className="text-xs text-[var(--theme-text-secondary)] mb-3">Lưu trữ file .json chứa toàn bộ thông tin AI và tiến độ đọc của truyện này.</p>
                        <button 
                            onClick={handleSaveData}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-sm font-semibold transition-colors w-full justify-center"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            Tải file JSON
                        </button>
                    </div>

                    <div className="p-4 border border-[var(--theme-border)] rounded-lg bg-[var(--theme-bg-base)]">
                        <h4 className="text-sm font-bold text-[var(--theme-text-primary)] mb-2">2. Nhập Dữ Liệu (Truyện Này)</h4>
                        <p className="text-xs text-[var(--theme-text-secondary)] mb-3">Khôi phục dữ liệu phân tích từ file .json đã lưu.</p>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => loadInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-accent-primary)] hover:brightness-110 text-white rounded-md text-sm font-semibold transition-colors w-full justify-center"
                            >
                                <UploadIcon className="w-4 h-4" />
                                Chọn file và Nhập
                            </button>
                            <input 
                                type="file" 
                                ref={loadInputRef} 
                                onChange={handleLoadData} 
                                accept=".json" 
                                className="hidden" 
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
      default:
        return null;
    }
  };

  const TabButton: React.FC<{tab: Tab, label: string, customColor?: string}> = ({ tab, label, customColor }) => {
      const isActive = activeTab === tab;
      let styleClass = '';
      let inlineStyle = {};

      if (customColor) {
          if (isActive) {
              styleClass = 'text-white';
              inlineStyle = { backgroundColor: 'var(--theme-accent-primary)' }; // Use theme accent instead of hardcoded
          } else {
              styleClass = 'hover:bg-opacity-20';
              // Use theme text color for inactive state instead of customColor to blend better
              inlineStyle = { color: 'var(--theme-text-secondary)', backgroundColor: 'transparent' }; 
          }
      } else {
          styleClass = isActive ? 'bg-[var(--theme-accent-primary)] text-white' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-base)]';
      }

      return (
        <button 
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${styleClass}`}
            style={inlineStyle}
        >
            {label}
        </button>
      );
  };

  const panelInnerContent = (
    <>
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
             <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">
               {isSidebar ? 'Thông Tin Thế Giới' : 'Bảng Nhân Vật'}
             </h2>
            {isAnalyzing && (
                <svg className="animate-spin h-5 w-5 text-[var(--theme-accent-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8
 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
          </div>
          <div className="flex items-center gap-2">
              {isAnalyzing ? (
                <button 
                  onClick={onStopAnalysis} 
                  className="bg-rose-600 text-white font-semibold text-xs px-3 py-1 rounded-md hover:bg-rose-500 transition-colors animate-pulse"
                  aria-label="Dừng phân tích"
                  title="Dừng phân tích"
                >
                  Dừng phân tích
                </button>
              ) : (
                <button 
                  onClick={onReanalyze} 
                  className="bg-[var(--theme-accent-secondary)] text-slate-900 font-semibold text-xs px-3 py-1 rounded-md hover:brightness-110 transition-colors"
                  aria-label="Phân tích lại thông tin thế giới"
                  title="Phân tích lại"
                >
                  Phân tích lại
                </button>
              )}
              {!isSidebar && (
                <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-3xl leading-none">&times;</button>
              )}
          </div>
        </div>
        
        <div className="p-4 flex flex-wrap gap-2 border-b border-[var(--theme-border)] bg-[var(--theme-bg-base)]/50">
          {isSidebar ? (
             <>
               <TabButton tab="npcs" label="Nhân Vật" />
               <TabButton tab="relationships" label="Quan hệ" />
               <TabButton tab="factions" label="Thế Lực" />
               <TabButton tab="locations" label="Địa Điểm" />
               <TabButton tab="data" label="Dữ liệu" />
               <TabButton tab="chat" label="Chat AI" customColor="var(--theme-accent-primary)" />
             </>
          ) : (
            <>
              <TabButton tab="status" label="Trạng Thái" />
              <TabButton tab="realmSystem" label="Cấp Độ" />
              <TabButton tab="inventory" label="Balo" />
              <TabButton tab="skills" label="Công Pháp" />
              <TabButton tab="equipment" label="Trang Bị" />
              <TabButton tab="npcs" label="Nhân Vật" />
              <TabButton tab="relationships" label="Quan hệ" />
              <TabButton tab="factions" label="Thế Lực" />
              <TabButton tab="locations" label="Địa Điểm" />
              <TabButton tab="data" label="Dữ liệu" />
              <TabButton tab="chat" label="Chat AI" customColor="var(--theme-accent-primary)" />
            </>
          )}
        </div>
        
        <div className="p-6 min-h-[200px]">
          {renderContent()}
        </div>
    </>
  );
  
  if (isSidebar) {
      return (
        <>
          <div className="bg-[var(--theme-bg-surface)] rounded-lg shadow-xl w-full border border-[var(--theme-border)]">
              {panelInnerContent}
          </div>
          {modalState.isOpen && modalState.type && (
              <EntityEditModal 
                  isOpen={modalState.isOpen}
                  onClose={handleCloseModal}
                  onSave={handleSaveEntity}
                  entityType={modalState.type}
                  entityData={modalState.data}
                  allLocations={stats?.diaDiem}
                  currentLocationName={stats?.viTriHienTai}
                  allCharacters={allCharacterNames}
              />
          )}
          <ConfirmationModal
            isOpen={!!deleteConfirmation}
            onClose={() => setDeleteConfirmation(null)}
            onConfirm={handleDeleteEntity}
            title="Xác nhận xóa"
          >
            Bạn có chắc chắn muốn xóa mục <strong className="text-[var(--theme-text-primary)]">{deleteConfirmation?.entity?.ten || deleteConfirmation?.entity}</strong>?
          </ConfirmationModal>
        </>
      )
  }

  return createPortal(
    <>
    <div 
      className={`fixed inset-0 z-[60] transition-all duration-300 ${isOpen ? 'bg-black/60' : 'bg-transparent pointer-events-none'}`}
      onClick={onClose}
    >
      <div 
        className={`fixed top-0 bottom-0 right-0 w-full max-w-md bg-[var(--theme-bg-surface)] shadow-2xl transition-transform duration-300 ease-in-out border-l border-[var(--theme-border)] flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-panel-title"
      >
        <div className="flex-grow overflow-y-auto">
          {panelInnerContent}
        </div>
      </div>
    </div>
    {modalState.isOpen && modalState.type && (
        <EntityEditModal 
            isOpen={modalState.isOpen}
            onClose={handleCloseModal}
            onSave={handleSaveEntity}
            entityType={modalState.type}
            entityData={modalState.data}
            allLocations={stats?.diaDiem}
            currentLocationName={stats?.viTriHienTai}
            allCharacters={allCharacterNames}
        />
    )}
    <ConfirmationModal
        isOpen={!!deleteConfirmation}
        onClose={() => setDeleteConfirmation(null)}
        onConfirm={handleDeleteEntity}
        title="Xác nhận xóa"
    >
        Bạn có chắc chắn muốn xóa mục <strong className="text-[var(--theme-text-primary)]">{deleteConfirmation?.entity?.ten || deleteConfirmation?.entity}</strong>?
    </ConfirmationModal>
    </>,
    document.body
  );
};

type LocationTreeNode = DiaDiem & { children: LocationTreeNode[] };

const LocationTree: React.FC<{ 
    locations: DiaDiem[]; 
    currentLocation: string | null;
    onEdit: (type: EntityType, data: any) => void;
    onDelete: (type: EntityType, entity: any) => void;
}> = ({ locations, currentLocation, onEdit, onDelete }) => {
    const buildTree = (list: DiaDiem[]): LocationTreeNode[] => {
        const tree: LocationTreeNode[] = [];
        const map: { [key: string]: LocationTreeNode } = {};

        list.forEach(loc => {
            map[loc.ten] = { ...loc, children: [] };
        });

        list.forEach(loc => {
            if (loc.diaDiemCha && map[loc.diaDiemCha]) {
                map[loc.diaDiemCha].children.push(map[loc.ten]);
            } else {
                tree.push(map[loc.ten]);
            }
        });

        return tree;
    };

    const tree = buildTree(locations);

    if (locations.length > 0 && tree.length === 0) {
        return (
            <div className="text-[var(--theme-text-secondary)] italic mt-4">
                <p>Không thể dựng cây phả hệ, hiển thị dạng danh sách:</p>
                {locations.map(loc => (
                    <p key={loc.ten} className="ml-4">- {loc.ten} {loc.ten === currentLocation ? ' (hiện tại)' : ''}</p>
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-1 mt-4">
            {tree.map((node, index) => (
                <TreeNode 
                    key={node.ten} 
                    node={node} 
                    level={0} 
                    isLast={index === tree.length - 1}
                    parentIsLast={[]}
                    currentLocation={currentLocation} 
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
};

const TreeNode: React.FC<{ 
    node: LocationTreeNode;
    level: number;
    isLast: boolean;
    parentIsLast: boolean[];
    currentLocation: string | null;
    onEdit: (type: EntityType, data: any) => void;
    onDelete: (type: EntityType, entity: any) => void;
}> = ({ node, level, isLast, parentIsLast, currentLocation, onEdit, onDelete }) => {
    
    const isCurrent = node.ten === currentLocation;
    
    return (
        <div className="flex flex-col">
            <div className="flex items-center relative h-10">
                <TreeBranch level={level + 1} isLast={isLast} parentIsLast={parentIsLast} />
                <div className="flex items-center ml-1 group flex-1 min-w-0">
                  <div className={`px-3 py-1 rounded-md text-sm font-medium truncate max-w-full ${isCurrent ? 'bg-[var(--theme-accent-secondary)] text-slate-900 ring-2 ring-offset-2 ring-offset-[var(--theme-bg-surface)] ring-[var(--theme-accent-secondary)]' : 'bg-[var(--theme-bg-base)]'}`}>
                      <EntityTooltip entity={node} noUnderline>{node.ten}</EntityTooltip>
                  </div>
                  {isCurrent && (
                      <div className="ml-2 w-3 h-3 rounded-full bg-[var(--theme-accent-secondary)] animate-pulse shrink-0" title="Vị trí hiện tại"></div>
                  )}
                  <div className="ml-2 hidden group-hover:flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit('diaDiem', node); }}
                        className="p-1.5 text-slate-300 hover:text-cyan-400 rounded-full transition-colors bg-slate-700/90"
                        aria-label={`Sửa ${node.ten}`}
                        title="Sửa"
                      >
                        <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete('diaDiem', node); }}
                        className="p-1.5 text-slate-300 hover:text-rose-500 rounded-full transition-colors bg-slate-700/90"
                        aria-label={`Xóa ${node.ten}`}
                        title="Xóa"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                  </div>
                </div>
            </div>
            {node.children && node.children.length > 0 && (
                <div className="flex flex-col">
                    {node.children.map((child, index) => (
                        <TreeNode 
                            key={child.ten} 
                            node={child} 
                            level={level + 1}
                            isLast={index === node.children.length - 1}
                            parentIsLast={[...parentIsLast, isLast]}
                            currentLocation={currentLocation} 
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};


const TreeBranch: React.FC<{ level: number; isLast: boolean; parentIsLast: boolean[] }> = ({ level, isLast, parentIsLast }) => {
    const path = [];
    for (let i = 0; i < level; i++) {
        if (i === level - 1) {
            path.push(
                <div key={i} className="w-6 h-full relative shrink-0">
                    {/* Vertical line from top to center */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-1/2 bg-[var(--theme-text-secondary)] opacity-60"></div>
                    {/* Horizontal line from center to right */}
                    <div className="absolute top-1/2 left-1/2 w-1/2 h-[2px] bg-[var(--theme-text-secondary)] opacity-60"></div>
                    {/* Vertical line from center to bottom, only if not last */}
                    {!isLast && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[2px] h-1/2 bg-[var(--theme-text-secondary)] opacity-60"></div>}
                </div>
            );
        } else {
            path.push(
                <div key={i} className="w-6 h-full relative shrink-0">
                    {/* Full vertical line if the parent in this column is not last */}
                    {!parentIsLast[i] && <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-[var(--theme-text-secondary)] opacity-60"></div>}
                </div>
            );
        }
    }
    return <div className="h-full flex items-center" aria-hidden="true">{path}</div>;
};


export default CharacterPanel;
