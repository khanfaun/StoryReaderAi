
import { useState, useEffect } from 'react';
import type { ReadingSettings } from '../types';

export const useTts = (settings: ReadingSettings, setSettings: (s: ReadingSettings) => void) => {
    const [availableSystemVoices, setAvailableSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

    useEffect(() => {
        const loadVoices = () => {
            let allVoices = window.speechSynthesis.getVoices();
            if (allVoices.length === 0) return;
            allVoices.sort((a, b) => {
                const isViA = a.lang.startsWith('vi');
                const isViB = b.lang.startsWith('vi');
                if (isViA && !isViB) return -1;
                if (!isViA && isViB) return 1;
                const isLowPriorityA = a.lang.startsWith('en') || a.default;
                const isLowPriorityB = b.lang.startsWith('en') || b.default;
                if (isLowPriorityA && !isLowPriorityB) return 1;
                if (!isLowPriorityA && isLowPriorityB) return -1;
                return a.name.localeCompare(b.name);
            });
            setAvailableSystemVoices(allVoices);
            const currentVoiceURI = settings.ttsSettings.voice;
            const isCurrentVoiceValid = allVoices.some(v => v.voiceURI === currentVoiceURI);
            if (!isCurrentVoiceValid && allVoices.length > 0) {
                setSettings({
                    ...settings,
                    ttsSettings: { ...settings.ttsSettings, voice: allVoices[0].voiceURI }
                });
            }
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => {
            window.speechSynthesis.onvoiceschanged = null;
            // Note: We don't cancel speech here to allow persistence across components if needed,
            // or let the parent handle cancellation.
        }
    }, [settings, setSettings]);

    return { availableSystemVoices };
};
