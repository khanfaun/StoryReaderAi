
import React, { useState, useEffect } from 'react';

interface ScrollToTopButtonProps {
  isReading?: boolean;
  isBottomNavVisible?: boolean;
  isAudioPlayerActive?: boolean;
}

const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({ 
  isReading = false, 
  isBottomNavVisible = false,
  isAudioPlayerActive = false
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    if (window.scrollY > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    window.addEventListener('scroll', toggleVisibility);
    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  // Logic xác định vị trí nút dựa trên trạng thái giao diện
  let positionClass = 'bottom-6'; // Mặc định khi ẩn thanh điều hướng

  if (isReading) {
      if (isAudioPlayerActive) {
          // Khi mở Audio Player:
          // Mobile: Player khá cao, cần đẩy lên nhiều (bottom-40)
          // PC: Đẩy lên một chút để không đè footer (bottom-28)
          positionClass = 'bottom-40 md:bottom-28';
      } else if (isBottomNavVisible) {
          // Khi mở thanh điều hướng thường:
          // Mobile: bottom-24
          // PC: bottom-20
          positionClass = 'bottom-24 md:bottom-20';
      }
  }

  return (
    <button
      onClick={scrollToTop}
      className={`fixed ${positionClass} right-6 w-14 h-14 rounded-full flex items-center justify-center
                  shadow-lg z-50 transition-all duration-300
                  ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-0 pointer-events-none'}
                  bg-[var(--theme-bg-base)]/80 backdrop-blur-md ring-2 ring-[var(--theme-accent-primary)] text-[var(--theme-accent-primary)]
                  hover:bg-[var(--theme-accent-primary)] hover:text-white`}
      aria-label="Cuộn lên đầu trang"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
};

export default ScrollToTopButton;
