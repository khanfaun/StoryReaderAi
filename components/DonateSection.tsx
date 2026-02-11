
import React, { useState } from 'react';
import { SparklesIcon, UploadIcon, CheckIcon, ClipboardIcon } from './icons';
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

        {/* KHUNG HIỂN THỊ ẢNH */}
        <div className="bg-white p-2 rounded-lg shadow-lg mb-4 w-full max-w-[220px] aspect-square flex items-center justify-center overflow-hidden relative mx-auto group">
            {displayImage ? (
                <img 
                    src={displayImage} 
                    alt="QR Ngân Hàng" 
                    className="w-full h-full object-contain"
                />
            ) : (
                <div className="flex flex-col items-center justify-center text-center p-4 bg-gray-50 w-full h-full border-2 border-dashed border-gray-200 rounded-lg">
                    <div className="opacity-20 mb-2">
                        <SparklesIcon className="w-12 h-12 text-gray-400" />
                    </div>
                    <span className="text-xs text-gray-400 font-medium">Chưa có mã QR</span>
                </div>
            )}
        </div>

        {/* THÔNG TIN CHUYỂN KHOẢN */}
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
