
import React, { useState } from 'react';
import { SparklesIcon } from './icons';

const DonateSection: React.FC = () => {
  const [imgError, setImgError] = useState(false);

  // Sử dụng CDN JSDelivr để tải ảnh từ GitHub nhanh và ổn định hơn
  // Cấu trúc: https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}
  const qrCodeUrl = "https://cdn.jsdelivr.net/gh/khanfaun/StoryReaderAi@main/assets/qr_donate.jpg";

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

        <div className="bg-white p-2 rounded-lg shadow-lg mb-4 w-full max-w-[220px] aspect-square flex items-center justify-center overflow-hidden relative mx-auto">
            {!imgError ? (
                <img 
                    src={qrCodeUrl} 
                    alt="QR Ngân Hàng" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                        console.warn("Không thể tải ảnh QR từ CDN. Chuyển sang hiển thị thông tin.", e);
                        setImgError(true);
                    }}
                />
            ) : (
                <div className="flex flex-col items-center justify-center text-center p-4 bg-gray-50 w-full h-full border-2 border-dashed border-gray-200 rounded-lg">
                    <div className="opacity-20 mb-2">
                        <SparklesIcon className="w-12 h-12 text-gray-400" />
                    </div>
                    <span className="text-xs text-gray-400 font-medium">QR Code chưa sẵn sàng</span>
                    <span className="text-[10px] text-gray-400 mt-1">Vui lòng nhập số tài khoản bên dưới</span>
                </div>
            )}
        </div>

        <div className="w-full space-y-2 text-sm bg-[var(--theme-bg-surface)] p-3 rounded-md border border-[var(--theme-border)]">
            <div className="flex justify-between items-center">
                <span className="text-[var(--theme-text-secondary)] text-xs">Ngân hàng:</span>
                <span className="font-bold text-[var(--theme-text-primary)] text-right">BVBank (Bản Việt)</span>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-[var(--theme-text-secondary)] text-xs">Số tài khoản:</span>
                <span className="font-bold text-[var(--theme-accent-primary)] select-all font-mono text-base">9021616938732</span>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-[var(--theme-text-secondary)] text-xs">Chủ tài khoản:</span>
                <span className="font-bold text-[var(--theme-text-primary)] uppercase text-right text-xs">Phan Trinh An Khang</span>
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
