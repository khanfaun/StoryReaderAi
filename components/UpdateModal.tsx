import React from 'react';
import { CloseIcon, UploadIcon, RefreshIcon, ChatIcon, WrenchScrewdriverIcon, KeyIcon } from './icons';

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
      icon: <UploadIcon className="w-8 h-8 text-green-400" />,
      title: "Nhập Ebook (.EPUB)",
      description: "Giờ đây bạn có thể đọc và phân tích những cuốn truyện yêu thích từ file .epub của riêng mình."
    },
    {
      icon: <RefreshIcon className="w-8 h-8 text-yellow-400" />,
      title: "Phân Tích Lại",
      description: "AI phân tích sai? Không vấn đề! Nút 'Phân tích lại' cho phép bạn yêu cầu AI quét lại chương truyện để có kết quả chính xác hơn."
    },
    {
      icon: <ChatIcon className="w-8 h-8 text-cyan-400" />,
      title: "AI Trò Chuyện",
      description: "Thắc mắc về tình tiết, nhân vật hay nội dung truyện? Hãy hỏi trực tiếp AI để có câu trả lời ngay lập tức."
    },
    {
      icon: <WrenchScrewdriverIcon className="w-8 h-8 text-orange-400" />,
      title: "Chỉnh Sửa Dữ Liệu",
      description: "Toàn quyền kiểm soát dữ liệu! Bạn có thể dễ dàng thêm, sửa đổi, hoặc xóa bất kỳ thông tin nào mà AI đã phân tích."
    },
    {
      icon: <KeyIcon className="w-8 h-8 text-indigo-400" />,
      title: "Cá nhân hóa sử dụng API Key",
      description: "Để tăng cường bảo mật và cá nhân hóa, ứng dụng giờ đây yêu cầu bạn cung cấp API Key của riêng mình để sử dụng các tính năng AI."
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
          <ul className="space-y-5">
            {features.map(feature => (
              <li key={feature.title} className="flex items-start gap-4">
                <div className="flex-shrink-0 bg-slate-800 rounded-full p-2">{feature.icon}</div>
                <div>
                  <h3 className="font-semibold text-md text-[var(--theme-text-primary)]">{feature.title}</h3>
                  <p className="text-sm text-[var(--theme-text-secondary)]">{feature.description}</p>
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
              Đóng
            </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;