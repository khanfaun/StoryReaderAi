
import React, { useState } from 'react';
import type { ReadingSettings } from '../types';
import { themePresets } from '../hooks/useReadingSettings';
import { QuestionMarkCircleIcon, PlayIcon, ChatIcon, StopIcon, PauseIcon, CloseIcon } from './icons';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReadingSettings;
  onSettingsChange: (newSettings: ReadingSettings) => void;
  availableSystemVoices: SpeechSynthesisVoice[];
  mode?: 'default' | 'tts-setup';
  onConfirmTts?: () => void;
  
  // New props for Mobile Tools
  onToggleTts?: () => void;
  onToggleAutoScroll?: (target: 'top' | 'bottom') => void;
  onToggleChat?: () => void;
  isTtsActive?: boolean;
  isAutoScrollActive?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
    isOpen, 
    onClose, 
    settings, 
    onSettingsChange, 
    availableSystemVoices,
    mode = 'default',
    onConfirmTts,
    onToggleTts,
    onToggleAutoScroll,
    onToggleChat,
    isTtsActive,
    isAutoScrollActive
}) => {
  const [showVoiceGuide, setShowVoiceGuide] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSettingChange = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  const handleTtsSettingChange = <K extends keyof ReadingSettings['ttsSettings']>(key: K, value: ReadingSettings['ttsSettings'][K]) => {
      onSettingsChange({
          ...settings,
          ttsSettings: {
              ...settings.ttsSettings,
              [key]: value,
          },
      });
  };

  const handleModeChange = (mode: ReadingSettings['themeMode']) => {
    const preset = themePresets[mode];
    onSettingsChange({
      ...settings,
      themeMode: mode,
      backgroundColor: preset.surfaceColor,
      textColor: preset.textColor,
      titleColor: preset.titleColor,
      highlightColor: preset.highlightColor,
    });
  };
  
  const defaultSettings = { 
      ...themePresets.dark, 
      backgroundColor: themePresets.dark.surfaceColor, 
      themeMode: 'dark' as const, 
      fontSize: 20, 
      fontFamily: "'Readex Pro', sans-serif", 
      ttsSettings: { voice: 'vi-VN-HoaiMyNeural', playbackRate: 1, volume: 1, showTtsSetupOnPlay: true } 
  };

  const isTtsSetup = mode === 'tts-setup';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[150] flex justify-center items-center" onClick={isTtsSetup ? undefined : onClose}>
      <div 
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl w-full max-w-sm flex flex-col m-4 border border-[var(--theme-border)] animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-[var(--theme-border)]">
          <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">
              {isTtsSetup ? 'Cấu hình Giọng đọc' : 'Cài đặt'}
          </h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-3xl leading-none">&times;</button>
        </div>
        
        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* TTS Settings - Only visible in setup mode */}
          {isTtsSetup && (
            <div className="space-y-4 p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-base)]/50">
                <h3 className="text-lg font-semibold text-[var(--theme-accent-primary)]">Cài đặt Giọng nói (TTS)</h3>
                <div>
                <div className="flex justify-between items-center mb-2">
                    <label htmlFor="ttsVoice" className="block text-sm font-medium text-[var(--theme-text-secondary)]">
                        Giọng đọc
                    </label>
                    <button 
                        onClick={() => setShowVoiceGuide(!showVoiceGuide)}
                        className="text-xs text-[var(--theme-accent-primary)] hover:underline flex items-center gap-1"
                        type="button"
                    >
                        <QuestionMarkCircleIcon className="w-4 h-4" />
                        Cách cài giọng Việt
                    </button>
                </div>

                {showVoiceGuide && (
                    <div className="mb-4 p-3 bg-[var(--theme-bg-base)] rounded text-xs text-[var(--theme-text-secondary)] border border-[var(--theme-border)] space-y-3 animate-fade-in">
                        <p className="font-semibold text-[var(--theme-text-primary)]">Hướng dẫn thêm giọng đọc Tiếng Việt:</p>
                        <ul className="list-disc list-inside pl-1 space-y-1">
                            <li><b>Windows:</b> Settings &gt; Time & Language &gt; Language & Region &gt; Add "Vietnamese".</li>
                            <li><b>Android:</b> Settings &gt; General &gt; Text-to-speech &gt; Install Voice Data.</li>
                            <li><b>iOS:</b> Settings &gt; Accessibility &gt; Spoken Content &gt; Voices.</li>
                        </ul>
                    </div>
                )}

                <select
                    id="ttsVoice"
                    value={settings.ttsSettings.voice}
                    onChange={e => handleTtsSettingChange('voice', e.target.value)}
                    className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                >
                    <option value="">Mặc định của trình duyệt</option>
                    {availableSystemVoices.map(voice => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                            {`${voice.name} (${voice.lang})`}
                        </option>
                    ))}
                </select>
                </div>
                <div>
                <label htmlFor="playbackRate" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                    Tốc độ đọc: <span className="font-bold text-[var(--theme-accent-primary)]">{settings.ttsSettings.playbackRate.toFixed(1)}x</span>
                </label>
                <input
                    id="playbackRate"
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={settings.ttsSettings.playbackRate}
                    onChange={e => handleTtsSettingChange('playbackRate', parseFloat(e.target.value))}
                    className="w-full h-2 bg-[var(--theme-bg-base)] rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
                />
                </div>
            </div>
          )}

          {/* Display Settings - Compact Layout */}
          {!isTtsSetup && (
            <div className="space-y-4">
                {/* Row 1: Theme Mode & Font Family (2 Columns) */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="themeMode" className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                            Giao diện
                        </label>
                        <select
                            id="themeMode"
                            value={settings.themeMode}
                            onChange={e => handleModeChange(e.target.value as ReadingSettings['themeMode'])}
                            className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-sm text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                        >
                            <option value="dark">Tối</option>
                            <option value="light">Sáng</option>
                            <option value="midnight">Ban đêm</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="fontFamily" className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                            Font chữ
                        </label>
                        <select
                            id="fontFamily"
                            value={settings.fontFamily}
                            onChange={e => handleSettingChange('fontFamily', e.target.value)}
                            className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-sm text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                        >
                            <option value="'Readex Pro', sans-serif">Readex Pro</option>
                            <option value="'Merriweather', serif">Merriweather</option>
                            <option value="'Lora', serif">Lora</option>
                            <option value="Georgia, serif">Georgia</option>
                            <option value="Verdana, sans-serif">Verdana</option>
                        </select>
                    </div>
                </div>

                {/* Font Size Slider */}
                <div>
                    <label htmlFor="fontSize" className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                        Cỡ chữ: <span className="font-bold text-[var(--theme-accent-primary)]">{settings.fontSize}px</span>
                    </label>
                    <input
                        id="fontSize"
                        type="range"
                        min="14"
                        max="32"
                        value={settings.fontSize}
                        onChange={e => handleSettingChange('fontSize', parseInt(e.target.value, 10))}
                        className="w-full h-2 bg-[var(--theme-bg-base)] rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
                    />
                </div>

                {/* Row 2: Color Pickers (4 Columns) */}
                <div>
                    <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-2">Tùy chỉnh màu sắc</label>
                    <div className="grid grid-cols-4 gap-2">
                        <div className="flex flex-col items-center">
                            <input type="color" value={settings.backgroundColor} onChange={e => handleSettingChange('backgroundColor', e.target.value)} className="w-full h-8 p-0 border-0 rounded cursor-pointer" title="Màu nền" />
                            <span className="text-[10px] text-[var(--theme-text-secondary)] mt-1">Nền</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <input type="color" value={settings.textColor} onChange={e => handleSettingChange('textColor', e.target.value)} className="w-full h-8 p-0 border-0 rounded cursor-pointer" title="Màu chữ" />
                            <span className="text-[10px] text-[var(--theme-text-secondary)] mt-1">Chữ</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <input type="color" value={settings.titleColor} onChange={e => handleSettingChange('titleColor', e.target.value)} className="w-full h-8 p-0 border-0 rounded cursor-pointer" title="Màu tiêu đề" />
                            <span className="text-[10px] text-[var(--theme-text-secondary)] mt-1">Tiêu đề</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <input type="color" value={settings.highlightColor} onChange={e => handleSettingChange('highlightColor', e.target.value)} className="w-full h-8 p-0 border-0 rounded cursor-pointer" title="Màu nổi bật" />
                            <span className="text-[10px] text-[var(--theme-text-secondary)] mt-1">Nổi bật</span>
                        </div>
                    </div>
                </div>

                {/* Mobile Only: Tools Section - Hidden on Tablet (md) and Desktop */}
                <div className="md:hidden pt-4 border-t border-[var(--theme-border)]">
                    <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-2">Công cụ tiện ích</label>
                    <div className="grid grid-cols-3 gap-2">
                        {onToggleTts && (
                            <button 
                                onClick={() => { onToggleTts(); onClose(); }}
                                className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${isTtsActive ? 'bg-[var(--theme-accent-primary)] text-white border-[var(--theme-accent-primary)]' : 'bg-[var(--theme-bg-base)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)]'}`}
                            >
                                {isTtsActive ? <StopIcon className="w-5 h-5 mb-1" /> : <PlayIcon className="w-5 h-5 mb-1" />}
                                <span className="text-[10px] font-semibold">{isTtsActive ? 'Dừng đọc' : 'Đọc truyện'}</span>
                            </button>
                        )}
                        
                        {onToggleAutoScroll && (
                            <button 
                                onClick={() => { onToggleAutoScroll('bottom'); onClose(); }}
                                className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${isAutoScrollActive ? 'bg-[var(--theme-accent-primary)] text-white border-[var(--theme-accent-primary)]' : 'bg-[var(--theme-bg-base)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)]'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                                </svg>
                                <span className="text-[10px] font-semibold">{isAutoScrollActive ? 'Dừng cuộn' : 'Cuộn trang'}</span>
                            </button>
                        )}

                        {onToggleChat && (
                            <button 
                                onClick={() => { onToggleChat(); onClose(); }}
                                className="flex flex-col items-center justify-center p-3 rounded-lg bg-[var(--theme-bg-base)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)] transition-colors"
                            >
                                <ChatIcon className="w-5 h-5 mb-1" />
                                <span className="text-[10px] font-semibold">Chat AI</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
          )}
          
          {!isTtsSetup && (
            <button
                onClick={() => onSettingsChange(defaultSettings)}
                className="w-full mt-2 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300 text-sm"
            >
                Khôi phục mặc định
            </button>
          )}

          {isTtsSetup && (
              <div className="pt-4 border-t border-[var(--theme-border)] space-y-4">
                  <div className="flex items-center">
                      <input 
                        id="dontAskAgain" 
                        type="checkbox" 
                        checked={!settings.ttsSettings.showTtsSetupOnPlay}
                        onChange={(e) => handleTtsSettingChange('showTtsSetupOnPlay', !e.target.checked)}
                        className="w-4 h-4 text-[var(--theme-accent-primary)] rounded focus:ring-[var(--theme-accent-primary)] bg-[var(--theme-bg-base)] border-gray-500"
                      />
                      <label htmlFor="dontAskAgain" className="ml-2 text-sm text-[var(--theme-text-primary)]">
                          Lần sau không hỏi lại (dùng luôn cài đặt này)
                      </label>
                  </div>
                  <button
                    onClick={onConfirmTts}
                    className="w-full flex items-center justify-center gap-2 bg-[var(--theme-accent-primary)] hover:brightness-90 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300"
                  >
                    <PlayIcon className="w-5 h-5" />
                    Bắt đầu nghe
                  </button>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
