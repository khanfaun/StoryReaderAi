
import type { ApiKeyInfo } from '../types';

const API_KEY_LIST_KEY = 'google_gemini_api_key_list';
const ACTIVE_API_KEY_ID_KEY = 'google_gemini_active_api_key_id';
const TOKEN_USAGE_MAP_KEY = 'google_gemini_token_usage_map';
export const TTS_FREE_TIER_CHARS = 1000000; // 1 million characters per month for TTS free tier

export interface TokenUsage {
  totalTokens: number;
  ttsCharacters: number;
  lastReset: number; // timestamp
}

export type TokenUsageMap = {
  [apiKey: string]: TokenUsage;
};

export const isAiStudio = (): boolean => {
  return window.location.hostname.includes('aistudio.google.com');
};

// --- Key List Management ---

export const getApiKeys = (): ApiKeyInfo[] => {
  const stored = localStorage.getItem(API_KEY_LIST_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveApiKeys = (keys: ApiKeyInfo[]): void => {
  localStorage.setItem(API_KEY_LIST_KEY, JSON.stringify(keys));
};

export const addApiKey = (key: string): ApiKeyInfo => {
  const keys = getApiKeys();
  const newKeyInfo = { id: Date.now().toString(), key };
  keys.push(newKeyInfo);
  saveApiKeys(keys);
  return newKeyInfo;
};

export const deleteApiKey = (id: string): void => {
  let keys = getApiKeys();
  const keyToDelete = keys.find(k => k.id === id);
  if (!keyToDelete) return;

  keys = keys.filter(k => k.id !== id);
  saveApiKeys(keys);

  if (getActiveApiKeyId() === id) {
    setActiveApiKeyId(null);
  }

  const storedMapStr = localStorage.getItem(TOKEN_USAGE_MAP_KEY);
  if (storedMapStr) {
    let usageMap: TokenUsageMap = JSON.parse(storedMapStr);
    if (usageMap[keyToDelete.key]) {
      delete usageMap[keyToDelete.key];
      localStorage.setItem(TOKEN_USAGE_MAP_KEY, JSON.stringify(usageMap));
    }
  }
};

// --- Active Key Management ---

export const setActiveApiKeyId = (id: string | null): void => {
  if (id) {
    localStorage.setItem(ACTIVE_API_KEY_ID_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_API_KEY_ID_KEY);
  }
};

export const getActiveApiKeyId = (): string | null => {
  return localStorage.getItem(ACTIVE_API_KEY_ID_KEY);
};

export const getActiveApiKey = (): ApiKeyInfo | null => {
  const activeId = getActiveApiKeyId();
  if (!activeId) return null;
  const keys = getApiKeys();
  return keys.find(k => k.id === activeId) || null;
};

// Main function used by the app to get the current key string
export const getApiKey = (): string | null => {
  return getActiveApiKey()?.key || null;
};

export const hasApiKey = (): boolean => {
  return !!getActiveApiKey();
};

// --- Token Usage Management ---

const getDefaultUsage = (): TokenUsage => ({
    totalTokens: 0,
    ttsCharacters: 0,
    lastReset: new Date().getTime(),
});

export const getAllTokenUsages = (): TokenUsageMap => {
    const storedMapStr = localStorage.getItem(TOKEN_USAGE_MAP_KEY);
    const currentDate = new Date();
    let usageMap: TokenUsageMap = storedMapStr ? JSON.parse(storedMapStr) : {};
    let needsSave = false;

    for (const key in usageMap) {
        if (Object.prototype.hasOwnProperty.call(usageMap, key)) {
            const usage = usageMap[key];
            const lastResetDate = new Date(usage.lastReset);
            if (lastResetDate.getFullYear() !== currentDate.getFullYear() || lastResetDate.getMonth() !== currentDate.getMonth()) {
                usageMap[key] = getDefaultUsage();
                needsSave = true;
            }
        }
    }
    
    if (needsSave) {
        localStorage.setItem(TOKEN_USAGE_MAP_KEY, JSON.stringify(usageMap));
    }
    return usageMap;
}

export const getTokenUsage = (): TokenUsage => {
    const activeApiKey = getApiKey();
    const usageMap = getAllTokenUsages();

    if (!activeApiKey) {
        return getDefaultUsage();
    }
    
    return usageMap[activeApiKey] || getDefaultUsage();
};

export const saveTokenUsage = (apiKey: string, usage: TokenUsage): void => {
    if (!apiKey) return;
    let usageMap = getAllTokenUsages();
    usageMap[apiKey] = usage;
    localStorage.setItem(TOKEN_USAGE_MAP_KEY, JSON.stringify(usageMap));
};
