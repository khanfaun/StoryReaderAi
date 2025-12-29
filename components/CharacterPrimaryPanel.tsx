
import React, { useState, useRef } from 'react';
import type { CharacterStats } from '../types';
import LoadingSpinner from './LoadingSpinner';
import InfoItemDisplay from './InfoItemDisplay';
import EntityEditModal, { EntityType } from './EntityEditModal';
import ConfirmationModal from './ConfirmationModal';
import { PlusIcon, EditIcon } from './icons';

interface CharacterPrimaryPanelProps {
  stats: CharacterStats | null;
  isAnalyzing: boolean;
  onStatsChange: (newStats: CharacterStats) => void;
  onDataLoaded: () => void;
  onReanalyze: () => void;
  onStopAnalysis: () => void;
}

type Tab = 'status' | 'realmSystem' | 'inventory' | 'skills' | 'equipment' | 'data';

const CharacterPrimaryPanel: React.FC<CharacterPrimaryPanelProps> = ({ stats, isAnalyzing, onStatsChange, onDataLoaded, onReanalyze, onStopAnalysis }) => {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: EntityType | null; data: any | null }>({ isOpen: false, type: null, data: null });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: EntityType; entity: any; } | null>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const handleOpenModal = (type: EntityType, data: any | null = null) => {
    setModalState({ isOpen: true, type, data });
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, type: null, data: null });
  };

  const handleSaveEntity = (entityData: any) => {
    if (!stats || !modalState.type) return;

    const newStats = JSON.parse(JSON.stringify(stats)); // Deep copy to ensure immutability
    const type = modalState.type;

    if (type === 'tuChat') {
        const list = newStats.trangThai?.tuChat || [];
        const index = list.findIndex((item: any) => item.ten === modalState.data?.ten);
        if (index !== -1) list[index] = entityData; else list.push(entityData);
        if (!newStats.trangThai) newStats.trangThai = { ten: '' };
        newStats.trangThai.tuChat = list;
    } else if (type === 'heThongCanhGioi') {
        const list: string[] = newStats.heThongCanhGioi || [];
        if (modalState.data) { // Editing
            const index = list.indexOf(modalState.data);
            if (index > -1) list[index] = entityData;
        } else { // Adding
            list.push(entityData);
        }
        newStats.heThongCanhGioi = list;
    } else if (type === 'mainCharacter') {
        if (!newStats.trangThai) newStats.trangThai = { ten: '' };
        newStats.trangThai.ten = entityData.ten;
        newStats.canhGioi = entityData.canhGioi;
    } else { // Handle object arrays
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
      }
      else {
          const list = newStats[type as keyof CharacterStats] as any[] || [];
          (newStats as any)[type] = list.filter(item => item.ten !== entity.ten);
      }

      onStatsChange(newStats);
      setDeleteConfirmation(null);
  };
  
  const handleSaveData = () => {
    try {
      const saveData: any = {
        version: 1,
        timestamp: new Date().toISOString(),
        data: {
          readingHistory: null,
          readingSettings: null,
          storyStates: {},
        },
      };

      const keys = Object.keys(localStorage);
      
      const historyKey = 'novel_reader_history';
      const historyData = localStorage.getItem(historyKey);
      if (historyData) saveData.data.readingHistory = JSON.parse(historyData);

      const settingsKey = 'truyenReaderSettings';
      const settingsData = localStorage.getItem(settingsKey);
      if (settingsData) saveData.data.readingSettings = JSON.parse(settingsData);

      keys.filter(k => k.startsWith('storyState_')).forEach(key => {
        const storyUrl = key.replace('storyState_', '');
        if (!saveData.data.storyStates[storyUrl]) saveData.data.storyStates[storyUrl] = {};
        const stateData = localStorage.getItem(key);
        if(stateData) saveData.data.storyStates[storyUrl].stats = JSON.parse(stateData);
      });

      keys.filter(k => k.startsWith('readChapters_')).forEach(key => {
        const storyUrl = key.replace('readChapters_', '');
        if (!saveData.data.storyStates[storyUrl]) saveData.data.storyStates[storyUrl] = {};
        const readData = localStorage.getItem(key);
        if(readData) saveData.data.storyStates[storyUrl].readChapters = JSON.parse(readData);
      });
      
      const jsonString = JSON.stringify(saveData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `TrinhDocTruyen_Save_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('Đã lưu dữ liệu thành công!');
    } catch (error) {
      console.error("Lỗi khi lưu dữ liệu:", error);
      alert('Đã xảy ra lỗi khi lưu dữ liệu.');
    }
  };

  const handleLoadData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('File content is not text.');
        const loadedData = JSON.parse(text);
        if (!loadedData.version || !loadedData.data) throw new Error('File không hợp lệ hoặc bị hỏng.');

        const { readingHistory, readingSettings, storyStates } = loadedData.data;
        if (readingHistory) localStorage.setItem('novel_reader_history', JSON.stringify(readingHistory));
        if (readingSettings) localStorage.setItem('truyenReaderSettings', JSON.stringify(readingSettings));
        if (storyStates) {
          Object.keys(storyStates).forEach(storyUrl => {
            const storyData = storyStates[storyUrl];
            if (storyData.stats) localStorage.setItem(`storyState_${storyUrl}`, JSON.stringify(storyData.stats));
            if (storyData.readChapters) localStorage.setItem(`readChapters_${storyUrl}`, JSON.stringify(storyData.readChapters));
          });
        }
        onDataLoaded();
        alert('Đã tải dữ liệu thành công! Ứng dụng sẽ được làm mới.');
      } catch (error: any) {
        console.error("Lỗi khi tải dữ liệu:", error);
        alert(`Đã xảy ra lỗi khi tải dữ liệu: ${error.message}`);
      } finally {
        if (event.target) event.target.value = '';
      }
    };
    reader.readAsText(file);
  };


  const renderContent = () => {
     const hasAnyData = stats && (
        stats.trangThai || stats.canhGioi || stats.heThongCanhGioi?.length ||
        stats.balo?.length || stats.congPhap?.length || stats.trangBi?.length
    );
      
    if (!hasAnyData && activeTab !== 'data') {
        if (isAnalyzing) {
             return (
                <div className="flex flex-col items-center justify-center h-48">
                <LoadingSpinner />
                <p className="text-[var(--theme-accent-primary)] mt-2">Đang phân tích chương...</p>
                </div>
            );
        }
      return <p className="text-center text-[var(--theme-text-secondary)] p-6">Chưa có dữ liệu nhân vật.</p>;
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
                    <p className="text-[var(--theme-text-secondary)] italic">Chưa có thông tin về {title.toLowerCase()}.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {list.map((item, index) => {
                             const isString = typeof item === 'string';
                             const displayItem = isString ? { ten: item, moTa: '' } : item;
                             return (
                                <InfoItemDisplay
                                    key={isString ? item : `${item.ten}-${index}`}
                                    item={displayItem}
                                    isSimpleString={isString}
                                    onEdit={() => handleOpenModal(type, item)}
                                    onDelete={() => handleRequestDelete(type, item)}
                                />
                             )
                        })}
                    </div>
                )}
            </div>
        );
    };

    switch(activeTab) {
      case 'status':
        const status = stats.trangThai;
        return (
          <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-[var(--theme-accent-primary)]">Trạng Thái & Cảnh Giới</h3>
                <button
                    onClick={() => handleOpenModal('mainCharacter', { ten: stats?.trangThai?.ten, canhGioi: stats?.canhGioi })}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-md transition-colors"
                    aria-label="Sửa thông tin nhân vật chính"
                >
                    <EditIcon className="w-4 h-4" />
                    Sửa
                </button>
            </div>
            <div className="space-y-4">
                {status && <p className="text-lg"><strong>Tên:</strong> {status.ten || 'N/A'}</p>}
                 <p className="text-lg">
                    <strong>Cảnh giới:</strong> 
                    <span className="text-2xl ml-2 text-[var(--theme-accent-secondary)] font-semibold">{stats.canhGioi || 'Chưa rõ'}</span>
                </p>
                {renderInfoList('Tư chất / Đặc tính', status?.tuChat, 'tuChat')}
              </div>
          </div>
        );
      case 'realmSystem':
        return renderInfoList('Hệ Thống Cấp Độ', stats.heThongCanhGioi, 'heThongCanhGioi');
      case 'inventory':
        return renderInfoList('Balo', stats.balo, 'balo');
      case 'skills':
        return renderInfoList('Công Pháp / Kỹ Năng', stats.congPhap, 'congPhap');
      case 'equipment':
        return renderInfoList('Trang Bị', stats.trangBi, 'trangBi');
      case 'data':
        return (
            <div>
                <h3 className="text-xl font-bold text-[var(--theme-accent-primary)] mb-4">Quản lý Dữ liệu</h3>
                <div className="space-y-6">
                    <div>
                        <h4 className="font-semibold text-[var(--theme-text-primary)]">Lưu Dữ liệu</h4>
                        <p className="text-sm text-[var(--theme-text-secondary)] mb-2">Lưu toàn bộ lịch sử đọc và tiến trình nhân vật vào một file JSON. Giữ file này an toàn để khôi phục sau này.</p>
                        <button onClick={handleSaveData} className="px-4 py-2 rounded-md bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-semibold transition-colors">Lưu vào File</button>
                    </div>
                    <div>
                        <h4 className="font-semibold text-[var(--theme-text-primary)]">Tải Dữ liệu</h4>
                        <p className="text-sm text-[var(--theme-text-secondary)] mb-2">Tải lại dữ liệu từ một file JSON đã lưu. Thao tác này sẽ ghi đè lên tất cả dữ liệu hiện tại và quay về màn hình chính.</p>
                        <button onClick={() => loadInputRef.current?.click()} className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors">Tải từ File</button>
                        <input type="file" ref={loadInputRef} onChange={handleLoadData} accept=".json" className="hidden" />
                    </div>
                </div>
            </div>
        );
      default:
        return null;
    }
  };

  const TabButton: React.FC<{tab: Tab, label: string}> = ({ tab, label }) => (
      <button 
        onClick={() => setActiveTab(tab)}
        className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tab ? 'bg-[var(--theme-accent-primary)] text-white' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-base)]'}`}>
          {label}
      </button>
  );
  
  const panelInnerContent = (
    <>
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-[var(--theme-text-primary)] flex items-center">
                Trạng Thái Nhân Vật
              </h2>
              {isAnalyzing && (
                  <svg className="animate-spin h-5 w-5 text-[var(--theme-accent-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
                  aria-label="Phân tích lại thông tin nhân vật"
                  title="Phân tích lại"
                >
                  Phân tích lại
                </button>
            )}
          </div>
        </div>
        
        <div className="p-4 flex flex-wrap gap-2 border-b border-[var(--theme-border)] bg-[var(--theme-bg-base)]/50">
          <TabButton tab="status" label="Trạng Thái" />
          <TabButton tab="realmSystem" label="Cấp Độ" />
          <TabButton tab="inventory" label="Balo" />
          <TabButton tab="skills" label="Công Pháp" />
          <TabButton tab="equipment" label="Trang Bị" />
          <TabButton tab="data" label="Dữ liệu" />
        </div>
        
        <div className="p-6 min-h-[200px]">
          {renderContent()}
        </div>
    </>
  );
  
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
  );
};

export default CharacterPrimaryPanel;
