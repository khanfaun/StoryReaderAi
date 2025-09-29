import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { InfoItem, NPC, TheLuc, DiaDiem, TuChat, QuanHe, NPCRelationship } from '../types';
import ConfirmationModal from './ConfirmationModal';
import { CloseIcon, TrashIcon } from './icons';

export type EntityType = 'balo' | 'congPhap' | 'trangBi' | 'npcs' | 'theLuc' | 'diaDiem' | 'tuChat' | 'quanHe' | 'heThongCanhGioi' | 'mainCharacter';
type Entity = Partial<InfoItem & NPC & TheLuc & DiaDiem & TuChat & QuanHe & {nhanVat1: string; nhanVat2: string;}> | string;

interface EntityEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entityData: any) => void;
  entityType: EntityType;
  entityData: Entity | null;
  allLocations?: DiaDiem[];
  currentLocationName?: string | null;
  allCharacters?: string[];
}

const getEntityTypeTitle = (type: EntityType, isEditing: boolean) => {
    const action = isEditing ? 'Sửa' : 'Thêm';
    switch(type) {
        case 'balo': return `${action} Vật Phẩm`;
        case 'congPhap': return `${action} Công Pháp`;
        case 'trangBi': return `${action} Trang Bị`;
        case 'npcs': return `${action} Nhân Vật Phụ`;
        case 'theLuc': return `${action} Thế Lực`;
        case 'diaDiem': return `${action} Địa Điểm`;
        case 'tuChat': return `${action} Tư Chất`;
        case 'quanHe': return `${action} Mối Quan Hệ`;
        case 'heThongCanhGioi': return `${action} Cảnh Giới`;
        case 'mainCharacter': return 'Sửa Thông Tin Nhân Vật Chính';
        default: return `${action} Mục`;
    }
}

const relationshipLevels = [
  { value: 'Thân Thiết Tột Cùng', label: 'Cấp 6: Thân Thiết Tột Cùng' },
  { value: 'Đồng Minh', label: 'Cấp 5: Đồng Minh / Tích Cực' },
  { value: 'Trung Lập', label: 'Cấp 4: Trung Lập' },
  { value: 'Mâu Thuẫn', label: 'Cấp 3: Mâu Thuẫn / Cạnh Tranh' },
  { value: 'Thù Địch', label: 'Cấp 2: Thù Địch' },
  { value: 'Sinh Tử Đại Địch', label: 'Cấp 1: Sinh Tử Đại Địch' },
];


const EntityEditModal: React.FC<EntityEditModalProps> = ({ isOpen, onClose, onSave, entityType, entityData, allLocations, currentLocationName, allCharacters }) => {
    const [formData, setFormData] = useState<any>({});
    const [relationToDeleteIndex, setRelationToDeleteIndex] = useState<number | null>(null);
    const isEditing = !!entityData;

    useEffect(() => {
        if (!isOpen) return;

        if (entityType === 'heThongCanhGioi') {
            setFormData({ ten: entityData || '' });
        } else if (entityType === 'diaDiem') {
             const isCurrent = typeof entityData === 'object' && entityData !== null && 'ten' in entityData && entityData.ten === currentLocationName;
             const baseData = typeof entityData === 'object' ? entityData : null;
             setFormData({ ...(baseData || { ten: '', moTa: ''}), isCurrentLocation: isCurrent });
        } else if (entityType === 'npcs') {
            const npcData = (entityData || {}) as Partial<NPC>;
            setFormData({
                ten: npcData.ten || '',
                moTa: npcData.moTa || '',
                status: npcData.status || 'active',
                mucDoThanThiet: npcData.mucDoThanThiet || 'Trung Lập',
                hienThiQuanHe: !!npcData.hienThiQuanHe,
                quanHeVoiNhanVatKhac: npcData.quanHeVoiNhanVatKhac || [],
            });
        } else if (entityType === 'mainCharacter') {
            setFormData(entityData || { ten: '', canhGioi: '' });
        }
        else {
            setFormData(entityData || { ten: '', moTa: ''});
        }
    }, [entityData, entityType, isOpen, currentLocationName]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setFormData({ 
            ...formData, 
            [name]: type === 'checkbox' ? checked : value 
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (entityType === 'heThongCanhGioi') {
            onSave(formData.ten);
        } else {
            onSave(formData);
        }
    };
    
    // Handlers for NPC relationships
    const handleRelationshipChange = (index: number, field: keyof NPCRelationship, value: string) => {
        const updatedRelationships = [...(formData.quanHeVoiNhanVatKhac || [])];
        updatedRelationships[index][field] = value;
        setFormData({ ...formData, quanHeVoiNhanVatKhac: updatedRelationships });
    };

    const handleAddRelationship = () => {
        const newRelationship: NPCRelationship = { nhanVatKhac: '', moTa: 'Trung Lập' };
        setFormData({ ...formData, quanHeVoiNhanVatKhac: [...(formData.quanHeVoiNhanVatKhac || []), newRelationship] });
    };

    const handleConfirmRemoveRelationship = () => {
        if (relationToDeleteIndex === null) return;
        const updatedRelationships = [...(formData.quanHeVoiNhanVatKhac || [])];
        updatedRelationships.splice(relationToDeleteIndex, 1);
        setFormData({ ...formData, quanHeVoiNhanVatKhac: updatedRelationships });
        setRelationToDeleteIndex(null); // Close modal
    };


    if (!isOpen) return null;

    const renderField = (name: string, label: string, type: 'text' | 'textarea' = 'text', required = true) => (
        <div>
            <label htmlFor={name} className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">{label}</label>
            {type === 'textarea' ? (
                <textarea
                    id={name}
                    name={name}
                    value={formData[name] || ''}
                    onChange={handleChange}
                    required={required}
                    rows={3}
                    className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                />
            ) : (
                <input
                    type="text"
                    id={name}
                    name={name}
                    value={formData[name] || ''}
                    onChange={handleChange}
                    required={required}
                    className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                />
            )}
        </div>
    );
    
    const renderStatusField = () => (
         <div>
            <label htmlFor="status" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Trạng thái</label>
            <select
                id="status"
                name="status"
                value={formData.status || 'active'}
                onChange={handleChange}
                className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
            >
                <option value="active">Tồn tại / Còn sống</option>
                <option value="used">Đã sử dụng</option>
                <option value="lost">Bị mất</option>
                <option value="dead">Đã chết</option>
                <option value="destroyed">Bị phá hủy</option>
            </select>
        </div>
    );


    return createPortal(
        <>
            <div className="fixed inset-0 bg-black bg-opacity-75 z-[100] flex justify-center items-center" onClick={onClose}>
                <div
                    className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-md flex flex-col m-4 border border-[var(--theme-border)] animate-fade-in-up"
                    onClick={e => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="form-title"
                >
                    <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
                        <h2 id="form-title" className="text-xl font-bold text-[var(--theme-text-primary)]">{getEntityTypeTitle(entityType, isEditing)}</h2>
                        <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-3xl leading-none"><CloseIcon className="w-6 h-6" /></button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {entityType === 'heThongCanhGioi' && renderField('ten', 'Tên Cảnh Giới')}

                        {entityType === 'mainCharacter' && (
                            <>
                                {renderField('ten', 'Tên Nhân Vật Chính')}
                                {renderField('canhGioi', 'Cảnh Giới Hiện Tại')}
                            </>
                        )}
                        
                        {entityType !== 'heThongCanhGioi' && entityType !== 'mainCharacter' && (
                            <>
                                {renderField('ten', 'Tên')}
                                {renderField('moTa', 'Mô tả', 'textarea')}
                            </>
                        )}

                        {['balo', 'congPhap', 'trangBi', 'npcs', 'theLuc', 'diaDiem'].includes(entityType) && renderStatusField()}
                        
                        {entityType === 'npcs' && (
                            <>
                            <div>
                                    <label htmlFor="mucDoThanThiet" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Mức độ thân thiết (với NVC)</label>
                                    <select
                                        id="mucDoThanThiet"
                                        name="mucDoThanThiet"
                                        value={formData.mucDoThanThiet || 'Trung Lập'}
                                        onChange={handleChange}
                                        className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                                    >
                                        {relationshipLevels.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center pt-2">
                                    <input
                                        id="hienThiQuanHe"
                                        name="hienThiQuanHe"
                                        type="checkbox"
                                        checked={!!formData.hienThiQuanHe}
                                        onChange={handleChange}
                                        className="h-4 w-4 rounded border-gray-300 text-[var(--theme-accent-primary)] focus:ring-[var(--theme-accent-primary)]"
                                    />
                                    <label htmlFor="hienThiQuanHe" className="ml-3 block text-sm font-medium text-[var(--theme-text-primary)]">
                                        Hiển thị quan hệ với NVC trên sơ đồ
                                    </label>
                                </div>

                                <div className="pt-4 mt-4 border-t border-[var(--theme-border)]">
                                    <h4 className="text-base font-semibold text-[var(--theme-text-primary)] mb-2">Mối quan hệ với nhân vật khác</h4>
                                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                        {(formData.quanHeVoiNhanVatKhac || []).map((rel: NPCRelationship, index: number) => (
                                            <div key={index} className="flex items-center gap-2 p-2 bg-[var(--theme-bg-base)] rounded-md border border-[var(--theme-border)]">
                                                <select
                                                    name={`rel-char-${index}`}
                                                    value={rel.nhanVatKhac}
                                                    onChange={(e) => handleRelationshipChange(index, 'nhanVatKhac', e.target.value)}
                                                    className="flex-1 w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-md p-2 text-sm text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                                                >
                                                    <option value="">-- Chọn NV --</option>
                                                    {allCharacters?.filter(c => c !== formData.ten).map(char => <option key={char} value={char}>{char}</option>)}
                                                </select>
                                                <select
                                                    name={`rel-desc-${index}`}
                                                    value={rel.moTa}
                                                    onChange={(e) => handleRelationshipChange(index, 'moTa', e.target.value)}
                                                    className="flex-1 w-full bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] rounded-md p-2 text-sm text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                                                >
                                                    {relationshipLevels.map(opt => <option key={opt.value} value={opt.value}>{opt.value}</option>)}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => setRelationToDeleteIndex(index)}
                                                    className="p-2 text-slate-400 hover:text-rose-500 rounded-full transition-colors bg-slate-700/90"
                                                    aria-label="Xóa mối quan hệ"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {(formData.quanHeVoiNhanVatKhac?.length === 0) && <p className="text-xs text-center text-slate-500 italic">Chưa có mối quan hệ nào.</p>}
                                    <button
                                        type="button"
                                        onClick={handleAddRelationship}
                                        className="mt-2 text-sm text-[var(--theme-accent-primary)] hover:underline font-semibold"
                                    >
                                        + Thêm mối quan hệ
                                    </button>
                                </div>
                            </>
                        )}

                        {entityType === 'diaDiem' && (
                            <>
                                {renderField('capDo', 'Cấp độ', 'text', false)}
                                <div>
                                    <label htmlFor="diaDiemCha" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">Thuộc địa điểm</label>
                                    <select
                                        id="diaDiemCha"
                                        name="diaDiemCha"
                                        value={formData.diaDiemCha || ''}
                                        onChange={handleChange}
                                        className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                                    >
                                        <option value="">-- Không có --</option>
                                        {allLocations
                                            ?.filter(loc => loc.ten !== formData.ten) // Ngăn tự chọn mình làm cha
                                            .map(loc => (
                                                <option key={loc.ten} value={loc.ten}>{loc.ten}</option>
                                            ))
                                        }
                                    </select>
                                </div>
                                <div className="flex items-center pt-2">
                                    <input
                                        id="isCurrentLocation"
                                        name="isCurrentLocation"
                                        type="checkbox"
                                        checked={!!formData.isCurrentLocation}
                                        onChange={handleChange}
                                        className="h-4 w-4 rounded border-gray-300 text-[var(--theme-accent-primary)] focus:ring-[var(--theme-accent-primary)]"
                                    />
                                    <label htmlFor="isCurrentLocation" className="ml-3 block text-sm font-medium text-[var(--theme-text-primary)]">
                                        Vị trí hiện tại của nhân vật chính
                                    </label>
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors">Hủy</button>
                            <button type="submit" className="px-4 py-2 rounded-md bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-semibold transition-colors">Lưu</button>
                        </div>
                    </form>
                </div>
            </div>
            <ConfirmationModal
                isOpen={relationToDeleteIndex !== null}
                onClose={() => setRelationToDeleteIndex(null)}
                onConfirm={handleConfirmRemoveRelationship}
                title="Xác nhận xóa mối quan hệ"
            >
                Bạn có chắc chắn muốn xóa mối quan hệ này khỏi danh sách không?
            </ConfirmationModal>
        </>,
        document.body
    );
};

export default EntityEditModal;