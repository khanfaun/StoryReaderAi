
import React from 'react';
import { CloseIcon, RefreshIcon, SparklesIcon, EditIcon, PlayIcon, PlusIcon } from './icons';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  const features = [
    {
      icon: <RefreshIcon className="w-8 h-8 text-green-400" />,
      title: "Cải thiện thuật toán tìm truyện",
      description: "Hệ thống tìm kiếm đã được nâng cấp để xử lý thông minh hơn, giúp bạn tìm thấy những cuốn truyện yêu thích chính xác và nhanh chóng hơn."
    },
    {
      icon: <SparklesIcon className="w-8 h-8 text-purple-400" />,
      title: "AI Biên tập & Dịch lại",
      description: "Văn phong 'Convert' quá khó đọc? Sử dụng tính năng 'AI Viết lại' để chuyển đổi nội dung thành tiếng Việt mượt mà, văn học hơn."
    },
    {
      icon: <EditIcon className="w-8 h-8 text-blue-400" />,
      title: "Chỉnh sửa Toàn diện",
      description: "Bạn có thể sửa trực tiếp nội dung chương, đổi tên chương, cập nhật thông tin truyện hoặc xóa các chương bị lỗi."
    },
    {
      icon: <PlayIcon className="w-8 h-8 text-rose-400" />,
      title: "Cập nhật Giọng đọc Trình duyệt",
      description: "Tối ưu hóa trải nghiệm nghe truyện. Hệ thống sẽ tự động ưu tiên giọng đọc Tiếng Việt chất lượng cao trên thiết bị của bạn, hạn chế sử dụng giọng mặc định tiếng Anh."
    },
    {
      icon: <PlusIcon className="w-8 h-8 text-teal-400" />,
      title: "Tự Thêm Truyện (Local)",
      description: "Bạn có thể tự sáng tác hoặc copy truyện từ nguồn ngoài vào để đọc và lưu trữ trực tiếp trên trình duyệt mà không cần mạng."
    }
  ];

  return (
    <div className="sync-modal-overlay animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <div className="sync-modal animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="update-modal-title" className="sync-modal__title">🚀 Cập nhật tính năng mới!</h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <ul className="space-y-6">
            {features.map(feature => (
              <li key={feature.title} className="flex items-start gap-4">
                <div className="flex-shrink-0 bg-slate-800 rounded-full p-2 border border-[var(--theme-border)]">{feature.icon}</div>
                <div>
                  <h3 className="font-bold text-lg text-[var(--theme-accent-primary)] mb-1">{feature.title}</h3>
                  <p className="text-sm text-[var(--theme-text-secondary)] leading-relaxed">{feature.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="p-4 bg-[var(--theme-bg-base)] rounded-b-lg flex justify-end">
           <button 
              onClick={onClose} 
              className="sync-modal-form__button sync-modal-form__button--primary"
            >
              Tuyệt vời, Đóng lại
            </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
