import { supabase } from './supabase.js';
import { GameService } from './api.js';

/**
 * Steam Web API Integration
 * Handles fetching and transforming Steam library data
 */
export class SteamImporter {
    constructor(apiKey, steamId) {
        this.apiKey = apiKey;
        this.steamId = steamId;
        this.baseUrl = 'https://api.steampowered.com';
    }

    /**
     * Fetch owned games from Steam
     * @returns {Promise<Array>} Array of Steam games
     */
    async getOwnedGames() {
        // Steam API doesn't support CORS from browsers
        // Using allorigins.win as a free CORS proxy
        const steamApiUrl = `${this.baseUrl}/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${this.steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(steamApiUrl)}`;

        try {
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                throw new Error(`Steam API Error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.response) {
                throw new Error('Invalid Steam API response');
            }

            if (!data.response.games) {
                throw new Error('Nenhum jogo encontrado ou perfil privado. Certifique-se de que seu perfil Steam está público.');
            }

            return data.response.games;
        } catch (error) {
            console.error('Steam API Error:', error);
            throw error;
        }
    }

    /**
     * Get game details including cover image
     * @param {number} appId - Steam App ID
     * @returns {string} Steam grid image URL
     */
    getGameImage(appId) {
        // Steam provides official grid images for library
        return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
    }

    /**
     * Get header image as fallback
     * @param {number} appId - Steam App ID
     * @returns {string} Steam header image URL
     */
    getGameHeaderImage(appId) {
        return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
    }

    /**
     * Transform Steam game to GameVault format (with RAWG enrichment)
     * @param {Object} steamGame - Steam game object
     * @returns {Promise<Object>} GameVault formatted game
     */
    async transformToGameVaultFormat(steamGame) {
        // Try to fetch Metacritic from RAWG
        let metacritic = null;
        try {
            const rawgResults = await GameService.searchRawg(steamGame.name);
            if (rawgResults && rawgResults.length > 0) {
                metacritic = rawgResults[0].metacritic || null;
            }
        } catch (error) {
            console.warn(`Failed to fetch Metacritic for ${steamGame.name}:`, error);
        }

        return {
            title: steamGame.name,
            platform: 'PC', // Steam games are PC
            status: 'Coleção', // Default status
            price_paid: 0, // Steam doesn't provide purchase price
            image_url: this.getGameImage(steamGame.appid),
            tags: ['Digital', 'Steam'], // Auto-tag as Steam import
            metacritic: metacritic
        };
    }

    /**
     * Fetch Steam games and check for duplicates (Preview Mode)
     * @param {string} userId - Current user ID
     * @returns {Promise<Object>} Results with games tagged as isDuplicate
     */
    async getPreviewData(userId) {
        try {
            // 1. Fetch Steam library
            const steamGames = await this.getOwnedGames();

            // 2. Get existing games to check duplicates
            const existingGames = await GameService.fetchStatsOnly(userId);
            const existingTitles = new Set(
                existingGames
                    .filter(g => g.platform === 'PC' || g.platform === 'Steam')
                    .map(g => g.title.toLowerCase().trim())
            );

            // 3. Map to simple preview format
            const previewGames = steamGames.map(g => {
                const isDup = existingTitles.has(g.name.toLowerCase().trim());
                return {
                    steamAppId: g.appid,
                    title: g.name,
                    image_url: this.getGameImage(g.appid),
                    header_url: this.getGameHeaderImage(g.appid),
                    playtime_minutes: g.playtime_forever,
                    isDuplicate: isDup
                };
            });

            // Sort: New items first, then by playtime desc
            return previewGames.sort((a, b) => {
                if (a.isDuplicate === b.isDuplicate) return b.playtime_minutes - a.playtime_minutes;
                return a.isDuplicate ? 1 : -1;
            });

        } catch (error) {
            console.error('Preview error:', error);
            throw error;
        }
    }

    /**
     * Import a specific list of games (after user selection)
     * @param {Array} gamesToImport - List of game objects from preview
     * @param {string} userId
     * @param {Function} progressCallback 
     */
    async importSelected(gamesToImport, userId, progressCallback) {
        const total = gamesToImport.length;
        const batchSize = 5; // Process in small batches
        const allNewGames = [];

        for (let i = 0; i < total; i++) {
            const game = gamesToImport[i];

            if (progressCallback) progressCallback({ stage: 'enriching', current: i + 1, total, game: game.title });

            // Enrich (Metacritic) - Fail safe
            let metacritic = null;
            try {
                // Rate limit protection
                if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 1100));

                // Only search RAWG if we really need logic, or skip to save time?
                // Let's do it to keep quality high.
                const rawgResults = await GameService.searchRawg(game.title);
                if (rawgResults && rawgResults.length > 0) {
                    metacritic = rawgResults[0].metacritic || null;
                }
            } catch (e) { console.warn("RAWG enrich failed for", game.title); }

            allNewGames.push({
                title: game.title,
                platform: 'PC',
                status: 'Coleção',
                price_paid: 0,
                price_sold: 0,
                image_url: game.header_url || game.image_url,
                tags: ['Digital', 'Steam'],
                metacritic: metacritic,
                user_id: userId
            });
        }

        if (allNewGames.length > 0) {
            if (progressCallback) progressCallback({ stage: 'saving', total: allNewGames.length });
            await GameService.batchAddGames(allNewGames);
        }

        return allNewGames.length;
    }
}

/**
 * Main Import Service
 */
export const ImportService = {
    async getSteamPreview(steamId, apiKey) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        const importer = new SteamImporter(apiKey, steamId);
        return await importer.getPreviewData(user.id);
    },

    async confirmSteamImport(selectedGames, apiKey, steamId, progressCallback) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        const importer = new SteamImporter(apiKey, steamId);
        return await importer.importSelected(selectedGames, user.id, progressCallback);
    }
};
