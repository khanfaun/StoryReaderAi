
const API_KEY_STORAGE_KEY = 'google_gemini_api_key';

export const isAiStudio = (): boolean => {
  return window.location.hostname.includes('aistudio.google.com');
};

export const saveApiKey = (key: string): void => {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
};

export const getApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const clearApiKey = (): void => {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
};

export const hasApiKey = (): boolean => {
  return !!getApiKey();
};
