
const API_KEY_STORAGE_KEY = 'google_gemini_api_key';
const TOKEN_USAGE_MAP_KEY = 'google_gemini_token_usage_map';

export interface TokenUsage {
  totalTokens: number;
  lastReset: number; // timestamp
}

// Type for the new storage structure
type TokenUsageMap = {
  [apiKey: string]: TokenUsage;
};


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
  // Only clears the active key, preserving the token usage data for all keys.
  localStorage.removeItem(API_KEY_STORAGE_KEY);
};

export const hasApiKey = (): boolean => {
  return !!getApiKey();
};

const getDefaultUsage = (): TokenUsage => ({
    totalTokens: 0,
    lastReset: new Date().getTime(),
});

/**
 * Gets the token usage for the currently active API key.
 * Handles monthly resets for all stored keys.
 */
export const getTokenUsage = (): TokenUsage => {
    const activeApiKey = getApiKey();
    const storedMapStr = localStorage.getItem(TOKEN_USAGE_MAP_KEY);
    const currentDate = new Date();
    let usageMap: TokenUsageMap = storedMapStr ? JSON.parse(storedMapStr) : {};
    let needsSave = false;

    // Check all keys in the map for monthly reset
    for (const key in usageMap) {
        if (Object.prototype.hasOwnProperty.call(usageMap, key)) {
            const usage = usageMap[key];
            const lastResetDate = new Date(usage.lastReset);

            if (lastResetDate.getFullYear() !== currentDate.getFullYear() || lastResetDate.getMonth() !== currentDate.getMonth()) {
                console.log(`Resetting token count for key ending in ...${key.slice(-4)}`);
                usageMap[key] = getDefaultUsage();
                needsSave = true;
            }
        }
    }
    
    if (needsSave) {
        localStorage.setItem(TOKEN_USAGE_MAP_KEY, JSON.stringify(usageMap));
    }

    if (!activeApiKey) {
        return getDefaultUsage();
    }
    
    // Return usage for the active key, or default if it's a new key.
    return usageMap[activeApiKey] || getDefaultUsage();
};

/**
 * Saves the token usage for a specific API key.
 * @param apiKey The API key for which to save the usage.
 * @param usage The new token usage data.
 */
export const saveTokenUsage = (apiKey: string, usage: TokenUsage): void => {
    if (!apiKey) return;
    const storedMapStr = localStorage.getItem(TOKEN_USAGE_MAP_KEY);
    let usageMap: TokenUsageMap = storedMapStr ? JSON.parse(storedMapStr) : {};
    usageMap[apiKey] = usage;
    localStorage.setItem(TOKEN_USAGE_MAP_KEY, JSON.stringify(usageMap));
};
