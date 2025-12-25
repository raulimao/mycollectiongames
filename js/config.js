/**
 * Application Configuration
 * 
 * ⚠️ IMPORTANT: This file contains sensitive API keys.
 * Do NOT commit this file to public repositories.
 * Add to .gitignore if using version control.
 * 
 * You can get API keys from:
 * - RAWG: https://rawg.io/apidocs (free tier available)
 * - Steam: https://steamcommunity.com/dev/apikey
 */

export const Config = {
    // RAWG API Key - Get yours at https://rawg.io/apidocs
    // User can override this by saving their own key to localStorage
    RAWG_API_KEY: localStorage.getItem('rawg_api_key') || 'b435fbadf8c24701adce7ef05814f0d6',

    // Cache settings
    CACHE_TTL_MINUTES: 1440, // 24 hours
    SEARCH_CACHE_TTL_MINUTES: 60, // 1 hour

    // API Rate limits
    RAWG_REQUESTS_PER_SECOND: 5,
    STEAM_REQUESTS_PER_SECOND: 5,

    // Save RAWG API Key to localStorage
    setRawgApiKey(key) {
        localStorage.setItem('rawg_api_key', key);
        this.RAWG_API_KEY = key;
    },

    // Check if RAWG API key is configured
    isRawgConfigured() {
        return this.RAWG_API_KEY &&
            this.RAWG_API_KEY !== 'YOUR_RAWG_API_KEY_HERE' &&
            this.RAWG_API_KEY.length > 10;
    }
};

// Log warning if using default/unconfigured key
if (!Config.isRawgConfigured()) {
    console.warn('⚠️ RAWG API Key not configured. Game search may not work. Set your key in Config or via localStorage.');
}
