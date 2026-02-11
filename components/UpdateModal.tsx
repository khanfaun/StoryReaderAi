
import React from 'react';
import { CloseIcon, RefreshIcon, EditIcon, PlayIcon, DownloadIcon, CloudIcon } from './icons';
import DonateSection from './DonateSection';

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
      icon: <CloudIcon className="w-8 h-8 text-sky-400" />,
      title: "Đồng bộ hóa Google Drive",
      description: "Đăng nhập để tự động sao lưu tiến độ đọc, danh sách truyện và dữ liệu phân tích AI lên Google Drive. Đồng bộ trải nghiệm đọc xuyên suốt trên mọi thiết bị của bạn."
    },
    {
      icon: <DownloadIcon className="w-8 h-8 text-indigo-400" />,
      title: "Tự động Tải & Lưu Offline",
      description: "Khi mở truyện, hệ thống sẽ tự động tải ngầm toàn bộ các chương về trình duyệt. Bạn có thể đọc mượt mà, không cần mạng và không phải chờ tải lại."
    },
    {
      icon: <RefreshIcon className="w-8 h-8 text-green-400" />,
      title: "Cải thiện thuật toán tìm truyện",
      description: "Hệ thống tìm kiếm đã được nâng cấp để xử lý thông minh hơn, giúp bạn tìm thấy những cuốn truyện yêu thích chính xác và nhanh chóng hơn."
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
    }
  ];

  return (
    <div className="sync-modal-overlay animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <div className="sync-modal animate-fade-in-up !max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <header className="sync-modal__header">
          <h2 id="update-modal-title" className="sync-modal__title">🚀 Cập nhật tính năng mới!</h2>
          <button onClick={onClose} className="sync-modal__close-btn" aria-label="Đóng">
            <CloseIcon className="sync-modal__close-icon" />
          </button>
        </header>

        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            
            {/* Cột trái: Tính năng (chiếm 3 phần ~ 60%) */}
            <div className="lg:col-span-3">
              <ul className="space-y-10">
                {features.map(feature => (
                  <li key={feature.title} className="flex items-start gap-4">
                    <div className="flex-shrink-0 bg-[var(--theme-bg-base)] rounded-full p-2 border border-[var(--theme-border)]">{feature.icon}</div>
                    <div>
                      <h3 className="font-bold text-lg text-[var(--theme-accent-primary)] mb-1">{feature.title}</h3>
                      <p className="text-sm text-[var(--theme-text-secondary)] leading-relaxed">{feature.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cột phải: Donate (chiếm 2 phần ~ 40%) */}
            <div className="lg:col-span-2">
                <DonateSection />
            </div>

          </div>
        </div>
        
        {/* Footer spacing */}
        <div className="p-2"></div>
      </div>
    </div>
  );
};

export default UpdateModal;
