
import React, { useState } from 'react';
import { SparklesIcon, UploadIcon, CheckIcon, ClipboardIcon, DownloadIcon } from './icons';
import { QR_CODE_BASE64 } from '../donateConfig';

const DonateSection: React.FC = () => {
  // Nếu đã có mã Base64 trong file config, dùng nó. Nếu không, dùng state tạm thời để Dev setup.
  const [tempBase64, setTempBase64] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const displayImage = QR_CODE_BASE64 || tempBase64;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64String = reader.result as string;
              setTempBase64(base64String);
          };
          reader.readAsDataURL(file);
      }
  };

  const copyToClipboard = () => {
      if (tempBase64) {
          navigator.clipboard.writeText(tempBase64);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }
  };

  const handleDownloadQR = () => {
      if (!displayImage) return;
      const link = document.createElement('a');
      link.href = displayImage;
      link.download = 'qr_donate_banking.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-gradient-to-b from-indigo-900/30 to-[var(--theme-bg-base)] border border-indigo-500/30 rounded-lg p-4 sm:p-5 flex flex-col items-center text-center h-full shadow-inner">
        <div className="mb-4 bg-indigo-500/20 p-3 rounded-full">
            <SparklesIcon className="w-8 h-8 text-indigo-300" />
        </div>
        
        <h3 className="text-lg font-bold text-[var(--theme-accent-primary)] mb-2">
          Ủng hộ Nhà Phát Triển
        </h3>
        
        <p className="text-sm text-[var(--theme-text-secondary)] mb-6 leading-relaxed">
          Nếu bạn thấy ứng dụng này hữu ích, hãy mời mình một ly cà phê nhé! Sự ủng hộ của bạn là động lực lớn nhất để mình duy trì và phát triển thêm nhiều tính năng mới.
        </p>

        {/* CONTAINER CHO ẢNH VÀ THÔNG TIN - Mobile: Dọc (Ảnh trên, Tin dưới) / Desktop: Dọc */}
        <div className="w-full flex flex-col items-center gap-4 lg:gap-0">
            
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
                {/* KHUNG HIỂN THỊ ẢNH */}
                <div className="bg-white p-2 rounded-lg shadow-lg w-32 h-32 sm:w-40 sm:h-40 flex-shrink-0 flex items-center justify-center overflow-hidden relative group lg:w-full lg:max-w-[220px] lg:h-auto lg:aspect-square lg:mb-2 lg:mx-auto">
                    {displayImage ? (
                        <img 
                            src={displayImage} 
                            alt="QR Ngân Hàng" 
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center p-2 lg:p-4 bg-gray-50 w-full h-full border-2 border-dashed border-gray-200 rounded-lg">
                            <div className="opacity-20 mb-1 lg:mb-2">
                                <SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-12 lg:h-12 text-gray-400" />
                            </div>
                            <span className="text-[9px] sm:text-[10px] lg:text-xs text-gray-400 font-medium">Chưa có mã QR</span>
                        </div>
                    )}
                </div>
                
                {/* NÚT TẢI ẢNH QR - NO BORDER/STROKE */}
                {displayImage && (
                    <button 
                        onClick={handleDownloadQR}
                        className="flex items-center gap-1 text-[10px] sm:text-xs text-[var(--theme-accent-primary)] hover:text-white hover:underline transition-colors lg:mb-4 bg-transparent hover:bg-[var(--theme-accent-primary)]/20 rounded px-2 py-1"
                        title="Tải ảnh QR về máy"
                    >
                        <DownloadIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>Tải QR</span>
                    </button>
                )}
            </div>

            {/* THÔNG TIN CHUYỂN KHOẢN */}
            <div className="w-full flex-1 min-w-0 space-y-2 text-sm bg-[var(--theme-bg-surface)] p-3 rounded-md border border-[var(--theme-border)] flex flex-col justify-center">
                <div className="flex flex-row justify-between items-center gap-0.5 sm:gap-0">
                    <span className="text-[var(--theme-text-secondary)] text-xs whitespace-nowrap">Ngân hàng:</span>
                    <span className="font-bold text-[var(--theme-text-primary)] text-right truncate">BVBank</span>
                </div>
                <div className="flex flex-row justify-between items-center gap-0.5 sm:gap-0">
                    <span className="text-[var(--theme-text-secondary)] text-xs whitespace-nowrap">Số tài khoản:</span>
                    <span className="font-bold text-[var(--theme-accent-primary)] select-all font-mono text-sm lg:text-base text-right break-all sm:break-normal">9021616938732</span>
                </div>
                <div className="flex flex-row justify-between items-center gap-0.5 sm:gap-0">
                    <span className="text-[var(--theme-text-secondary)] text-xs whitespace-nowrap">Chủ tài khoản:</span>
                    <span className="font-bold text-[var(--theme-text-primary)] uppercase text-[10px] lg:text-xs text-right truncate">Phan Trinh An Khang</span>
                </div>
            </div>
        </div>
        
        <p className="mt-auto pt-4 text-xs text-[var(--theme-text-secondary)] italic">
            Cảm ơn bạn rất nhiều! ❤️
        </p>

        {/* --- CÔNG CỤ DÀNH RIÊNG CHO DEV (Chỉ hiện khi chưa set cứng mã trong code) --- */}
        {!QR_CODE_BASE64 && (
            <div className="mt-6 w-full p-4 border-2 border-dashed border-yellow-600/50 bg-yellow-900/10 rounded-lg text-left">
                <p className="text-xs font-bold text-yellow-500 mb-2 uppercase tracking-wider">⚠️ Dành cho Developer (Setup)</p>
                <p className="text-[10px] text-[var(--theme-text-secondary)] mb-3">
                    Hiện tại chưa có ảnh QR trong file cấu hình. Hãy chọn ảnh QR của bạn để lấy mã nhúng:
                </p>
                
                <div className="flex gap-2 mb-3">
                    <label className="flex-1 cursor-pointer bg-[var(--theme-bg-surface)] border border-[var(--theme-border)] hover:border-[var(--theme-accent-primary)] text-[var(--theme-text-primary)] text-xs py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors">
                        <UploadIcon className="w-4 h-4" />
                        <span>Chọn ảnh QR</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {tempBase64 && (
                        <button 
                            onClick={copyToClipboard}
                            className="flex-1 bg-[var(--theme-accent-primary)] hover:brightness-110 text-white text-xs py-2 px-3 rounded flex items-center justify-center gap-2 font-bold"
                        >
                            {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
                            <span>{copied ? 'Đã copy mã!' : 'Copy mã ảnh'}</span>
                        </button>
                    )}
                </div>

                {tempBase64 && (
                    <div className="text-[10px] text-[var(--theme-text-secondary)]">
                        <p className="mb-1">👉 <strong>Bước tiếp theo:</strong> Mở file <code>donateConfig.ts</code> (nằm cùng cấp với thư mục components), tìm dòng <code>export const QR_CODE_BASE64 = "";</code> và dán mã vừa copy vào giữa hai dấu ngoặc kép.</p>
                        <textarea 
                            readOnly 
                            value={tempBase64} 
                            className="w-full h-16 bg-black/30 border border-[var(--theme-border)] rounded p-2 text-[9px] font-mono text-gray-400 focus:outline-none resize-none"
                        />
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default DonateSection;
