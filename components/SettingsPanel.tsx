
import React, { useState } from 'react';
import type { ReadingSettings } from '../types';
import { themePresets } from '../hooks/useReadingSettings';
import { QuestionMarkCircleIcon, PlayIcon } from './icons';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReadingSettings;
  onSettingsChange: (newSettings: ReadingSettings) => void;
  availableSystemVoices: SpeechSynthesisVoice[];
  mode?: 'default' | 'tts-setup'; // New prop to control display mode
  onConfirmTts?: () => void; // New prop for confirming TTS setup
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
    isOpen, 
    onClose, 
    settings, 
    onSettingsChange, 
    availableSystemVoices,
    mode = 'default',
    onConfirmTts
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
              {isTtsSetup ? 'Cấu hình Giọng đọc' : 'Tùy Chỉnh'}
          </h2>
          <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-3xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
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
                        <p className="font-semibold text-[var(--theme-text-primary)]">Hướng dẫn thêm giọng đọc Tiếng Việt cho máy:</p>
                        
                        <div>
                            <strong className="text-[var(--theme-accent-secondary)] block mb-1">🖥️ Windows:</strong>
                            <ul className="list-disc list-inside pl-1 space-y-1">
                                <li>Vào <b>Settings</b> &gt; <b>Time & Language</b> &gt; <b>Language & Region</b>.</li>
                                <li>Tại mục "Preferred languages", nhấn <b>Add a language</b>.</li>
                                <li>Tìm <b>Vietnamese</b> và cài đặt (nhớ tích chọn <b>Text-to-speech</b>).</li>
                                <li className="mt-1">
                                    <a href="ms-settings:regionlanguage" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline bg-blue-900/30 px-2 py-1 rounded border border-blue-800">
                                        <span>Mở cài đặt Language ngay</span>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <div className="border-t border-[var(--theme-border)] pt-2">
                            <strong className="text-[var(--theme-accent-secondary)] block mb-1">📱 Android:</strong>
                            <p>Vào <b>Cài đặt (Settings)</b> &gt; <b>Quản lý chung</b> &gt; <b>Ngôn ngữ & Bàn phím</b> &gt; <b>Đầu ra văn bản sang giọng nói (Text-to-speech)</b> &gt; Cài đặt (biểu tượng bánh răng) &gt; <b>Cài đặt dữ liệu giọng nói</b> &gt; Chọn <b>Tiếng Việt</b>.</p>
                        </div>

                        <div className="border-t border-[var(--theme-border)] pt-2">
                            <strong className="text-[var(--theme-accent-secondary)] block mb-1">🍎 iOS / macOS:</strong>
                            <p>Vào <b>Cài đặt</b> &gt; <b>Trợ năng (Accessibility)</b> &gt; <b>Nội dung được đọc (Spoken Content)</b> &gt; <b>Giọng nói</b> &gt; <b>Tiếng Việt</b> &gt; Tải về giọng (ví dụ: Linh, Nam).</p>
                        </div>
                        
                        <div className="p-2 bg-yellow-900/20 border border-yellow-800/50 rounded text-yellow-500 italic mt-2">
                            ⚠️ Lưu ý: Sau khi cài đặt xong, hãy <strong>khởi động lại trình duyệt</strong> để web nhận diện được giọng mới.
                        </div>
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
                {availableSystemVoices.length === 0 && <p className="text-xs text-yellow-400 mt-2">Không tìm thấy giọng đọc nào trên trình duyệt của bạn.</p>}
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
                <div>
                <label htmlFor="volume" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                    Âm lượng: <span className="font-bold text-[var(--theme-accent-primary)]">{Math.round(settings.ttsSettings.volume * 100)}%</span>
                </label>
                <input
                    id="volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.ttsSettings.volume}
                    onChange={e => handleTtsSettingChange('volume', parseFloat(e.target.value))}
                    className="w-full h-2 bg-[var(--theme-bg-base)] rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent-primary)]"
                />
                </div>
            </div>
          )}

          {/* Display Settings - ONLY show if NOT in tts-setup mode */}
          {!isTtsSetup && (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[var(--theme-accent-primary)]">Cài đặt Giao diện</h3>
                <div>
                <label htmlFor="themeMode" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                    Chế độ màu
                </label>
                <select
                    id="themeMode"
                    value={settings.themeMode}
                    onChange={e => handleModeChange(e.target.value as ReadingSettings['themeMode'])}
                    className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                >
                    <option value="dark">Chế độ Tối</option>
                    <option value="light">Chế độ Sáng</option>
                    <option value="midnight">Chế độ Ban đêm</option>
                </select>
                </div>

                <div>
                <label htmlFor="fontSize" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                    Kích thước chữ: <span className="font-bold text-[var(--theme-accent-primary)]">{settings.fontSize}px</span>
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
                
                <div>
                <label htmlFor="fontFamily" className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                    Font chữ
                </label>
                <select
                    id="fontFamily"
                    value={settings.fontFamily}
                    onChange={e => handleSettingChange('fontFamily', e.target.value)}
                    className="w-full bg-[var(--theme-bg-base)] border border-[var(--theme-border)] rounded-md p-2 text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-primary)]"
                >
                    <option value="'Readex Pro', sans-serif">Readex Pro (Mặc định)</option>
                    <option value="'Merriweather', serif">Merriweather (Có chân)</option>
                    <option value="'Lora', serif">Lora (Thanh lịch)</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                </select>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex flex-col items-center">
                        <label htmlFor="bgColor" className="text-sm font-medium text-[var(--theme-text-secondary)] mb-2">Màu nền</label>
                        <input
                        id="bgColor"
                        type="color"
                        value={settings.backgroundColor}
                        onChange={e => handleSettingChange('backgroundColor', e.target.value)}
                        className="w-16 h-10 p-1 bg-transparent border border-[var(--theme-border)] rounded-md cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col items-center">
                        <label htmlFor="textColor" className="text-sm font-medium text-[var(--theme-text-secondary)] mb-2">Màu chữ</label>
                        <input
                        id="textColor"
                        type="color"
                        value={settings.textColor}
                        onChange={e => handleSettingChange('textColor', e.target.value)}
                        className="w-16 h-10 p-1 bg-transparent border border-[var(--theme-border)] rounded-md cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col items-center">
                        <label htmlFor="titleColor" className="text-sm font-medium text-[var(--theme-text-secondary)] mb-2">Màu tiêu đề</label>
                        <input
                        id="titleColor"
                        type="color"
                        value={settings.titleColor}
                        onChange={e => handleSettingChange('titleColor', e.target.value)}
                        className="w-16 h-10 p-1 bg-transparent border border-[var(--theme-border)] rounded-md cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col items-center">
                        <label htmlFor="highlightColor" className="text-sm font-medium text-[var(--theme-text-secondary)] mb-2">Màu nổi bật</label>
                        <input
                        id="highlightColor"
                        type="color"
                        value={settings.highlightColor}
                        onChange={e => handleSettingChange('highlightColor', e.target.value)}
                        className="w-16 h-10 p-1 bg-transparent border border-[var(--theme-border)] rounded-md cursor-pointer"
                        />
                    </div>
                </div>
            </div>
          )}
          
          {!isTtsSetup && (
            <button
                onClick={() => onSettingsChange(defaultSettings)}
                className="w-full mt-4 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300"
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
