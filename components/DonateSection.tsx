
import React, { useState } from 'react';
import { SparklesIcon } from './icons';

const DonateSection: React.FC = () => {
  const [imgError, setImgError] = useState(false);

  // Sử dụng đường dẫn trực tiếp từ GitHub Repo của bạn để đảm bảo ảnh luôn hiển thị
  // Bỏ qua các vấn đề về đường dẫn tương đối hoặc cấu hình build
  const qrCodeUrl = "https://raw.githubusercontent.com/khanfaun/StoryReaderAi/main/assets/qr_donate.jpg";

  return (
    <div className="h-full flex flex-col">
      <div className="bg-gradient-to-b from-indigo-900/30 to-[var(--theme-bg-base)] border border-indigo-500/30 rounded-lg p-5 flex flex-col items-center text-center h-full shadow-inner">
        <div className="mb-4 bg-indigo-500/20 p-3 rounded-full">
            <SparklesIcon className="w-8 h-8 text-indigo-300" />
        </div>
        
        <h3 className="text-lg font-bold text-[var(--theme-accent-primary)] mb-2">
          Ủng hộ Nhà Phát Triển
        </h3>
        
        <p className="text-sm text-[var(--theme-text-secondary)] mb-4 leading-relaxed">
          Nếu bạn thấy ứng dụng này hữu ích, hãy mời mình một ly cà phê nhé! Sự ủng hộ của bạn là động lực lớn nhất để mình duy trì và phát triển thêm nhiều tính năng mới.
        </p>

        <div className="bg-white p-2 rounded-lg shadow-lg mb-4 w-full max-w-[220px] aspect-square flex items-center justify-center overflow-hidden relative">
            {!imgError ? (
                <img 
                    src={qrCodeUrl} 
                    alt="QR Ngân Hàng" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                        console.error("Không thể tải ảnh QR từ GitHub.", e);
                        setImgError(true);
                    }}
                />
            ) : (
                <div className="flex flex-col items-center justify-center text-gray-300 h-full w-full bg-gray-50">
                    <SparklesIcon className="w-10 h-10 mb-2 opacity-20" />
                    <span className="text-[10px] font-mono opacity-50">QR Code</span>
                </div>
            )}
        </div>

        <div className="w-full space-y-2 text-sm bg-[var(--theme-bg-surface)] p-3 rounded-md border border-[var(--theme-border)]">
            <div className="flex justify-between">
                <span className="text-[var(--theme-text-secondary)]">Ngân hàng:</span>
                <span className="font-bold text-[var(--theme-text-primary)] text-right">BVBank - Ngân hàng TMCP Bản Việt</span>
            </div>
            <div className="flex justify-between">
                <span className="text-[var(--theme-text-secondary)]">Số tài khoản:</span>
                <span className="font-bold text-[var(--theme-accent-primary)] select-all font-mono">9021616938732</span>
            </div>
            <div className="flex justify-between">
                <span className="text-[var(--theme-text-secondary)]">Chủ tài khoản:</span>
                <span className="font-bold text-[var(--theme-text-primary)] uppercase text-right">Phan Trinh An Khang</span>
            </div>
        </div>
        
        <p className="mt-auto pt-4 text-xs text-[var(--theme-text-secondary)] italic">
            Cảm ơn bạn rất nhiều! ❤️
        </p>
      </div>
    </div>
  );
};

export default DonateSection;
