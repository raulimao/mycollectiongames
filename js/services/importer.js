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
     * Import all owned games to GameVault
     * @param {string} userId - Current user ID
     * @param {Function} progressCallback - Optional progress callback
     * @returns {Promise<Object>} Import results
     */
    async importGames(userId, progressCallback = null) {
        try {
            // Fetch Steam library
            const steamGames = await this.getOwnedGames();

            if (progressCallback) {
                progressCallback({ stage: 'fetched', total: steamGames.length });
            }

            // Transform all games WITH METACRITIC (batched to avoid rate limits)
            const transformedGames = [];
            for (let i = 0; i < steamGames.length; i++) {
                if (progressCallback) {
                    progressCallback({
                        stage: 'enriching',
                        current: i + 1,
                        total: steamGames.length
                    });
                }

                const transformed = await this.transformToGameVaultFormat(steamGames[i]);
                transformedGames.push(transformed);

                // Small delay to respect RAWG API rate limits (5 requests per second)
                if (i % 5 === 0 && i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Check for duplicates
            const existingGames = await GameService.fetchStatsOnly(userId);
            const existingTitles = new Set(
                existingGames
                    .filter(g => g.platform === 'PC')
                    .map(g => g.title.toLowerCase())
            );

            // Filter out duplicates
            const newGames = transformedGames.filter(game =>
                !existingTitles.has(game.title.toLowerCase())
            );

            const duplicateCount = transformedGames.length - newGames.length;

            if (progressCallback) {
                progressCallback({
                    stage: 'filtered',
                    total: transformedGames.length,
                    newGames: newGames.length,
                    duplicates: duplicateCount
                });
            }

            // Batch import new games
            if (newGames.length > 0) {
                await GameService.batchAddGames(newGames);
            }

            if (progressCallback) {
                progressCallback({ stage: 'complete', imported: newGames.length });
            }

            return {
                success: true,
                totalFound: steamGames.length,
                imported: newGames.length,
                duplicates: duplicateCount,
                games: newGames
            };

        } catch (error) {
            console.error('Import error:', error);
            throw error;
        }
    }
}

/**
 * Main Import Service
 * Orchestrates imports from different platforms
 */
export const ImportService = {
    /**
     * Import games from Steam
     * @param {string} steamId - Steam ID (64-bit)
     * @param {string} apiKey - Steam Web API Key
     * @param {Function} progressCallback - Progress callback
     * @returns {Promise<Object>} Import results
     */
    async importFromSteam(steamId, apiKey, progressCallback = null) {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            throw new Error('Usuário não autenticado');
        }

        const importer = new SteamImporter(apiKey, steamId);
        return await importer.importGames(user.id, progressCallback);
    },

    // Future platform integrations
    // async importFromGOG() { ... }
    // async importFromEpic() { ... }
    // async importFromAmazon() { ... }
};
