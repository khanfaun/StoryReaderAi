import React from 'react';
import { ChatIcon } from './icons';

interface ChatToggleButtonProps {
  onClick: () => void;
  isPanelOpen: boolean;
  isBottomNavVisible: boolean;
}

const ChatToggleButton: React.FC<ChatToggleButtonProps> = ({ onClick, isPanelOpen, isBottomNavVisible }) => {
  const bottomClass = isBottomNavVisible ? 'bottom-40' : 'bottom-24';

  return (
    <button
      onClick={onClick}
      className={`fixed ${bottomClass} left-6 bg-blue-600 hover:bg-blue-500 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg z-50 transition-all duration-300 transform hover:scale-110`}
      aria-label={isPanelOpen ? "Đóng bảng trò chuyện AI" : "Mở bảng trò chuyện AI"}
    >
      <ChatIcon className="w-7 h-7" />
    </button>
  );
};

export default ChatToggleButton;