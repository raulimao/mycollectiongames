/**
 * GOG Galaxy Importer
 * Processa dados do GOG Galaxy 2.0 para importação no GameVault
 */

import { supabase } from './supabase.js';
import { GameService } from './api.js';

export class GogGalaxyImporter {
    constructor() {
        this.source = 'GOG Galaxy';
    }

    /**
     * Parseia o JSON exportado do GOG Galaxy
     * @param {string} jsonString - JSON do relatório GOG Galaxy
     * @returns {Object} Dados parseados por plataforma
     */
    parseGogGalaxyJson(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            return data;
        } catch (error) {
            console.error('Erro ao parsear JSON do GOG Galaxy:', error);
            throw new Error('JSON inválido. Certifique-se de colar o conteúdo completo do arquivo.');
        }
    }

    /**
     * Mapeia plataforma do GOG Galaxy para plataforma do GameVault
     */
    mapPlatform(gogPlatform) {
        const mapping = {
            'Xbox One': 'Xbox One',
            'Epic Games': 'PC',
            'Steam': 'PC',
            'GOG': 'PC',
            'Origin': 'PC',
            'Ubisoft': 'PC',
            'Battle.net': 'PC',
        };
        return mapping[gogPlatform] || 'PC';
    }

    /**
     * Gera tags baseadas na fonte
     */
    getTags(gogPlatform) {
        const tagMapping = {
            'Xbox One': ['Digital', 'Xbox'],
            'Epic Games': ['Digital', 'Epic Games'],
            'Steam': ['Digital', 'Steam'],
            'GOG': ['Digital', 'GOG'],
            'Origin': ['Digital', 'Origin'],
            'Ubisoft': ['Digital', 'Ubisoft'],
            'Battle.net': ['Digital', 'Battle.net'],
        };
        return tagMapping[gogPlatform] || ['Digital'];
    }

    /**
     * Obtém preview dos jogos com checagem de duplicatas
     * @param {Object} jsonData - Dados parseados do GOG Galaxy
     * @param {string} userId - ID do usuário atual
     * @param {Array} selectedPlatforms - Plataformas a incluir
     */
    async getPreviewData(jsonData, userId, selectedPlatforms = null) {
        try {
            // Buscar jogos existentes para verificar duplicatas
            const existingGames = await GameService.fetchStatsOnly(userId);
            const existingTitles = new Set(
                existingGames.map(g => g.title.toLowerCase().trim())
            );

            const previewGames = [];
            const platformsToProcess = selectedPlatforms || Object.keys(jsonData);

            for (const platform of platformsToProcess) {
                const games = jsonData[platform] || [];

                for (const game of games) {
                    const title = game.title || 'Sem título';
                    const isDuplicate = existingTitles.has(title.toLowerCase().trim());

                    previewGames.push({
                        title: title,
                        sourcePlatform: platform,
                        targetPlatform: this.mapPlatform(platform),
                        tags: this.getTags(platform),
                        key: game.key,
                        isDuplicate: isDuplicate,
                        selected: !isDuplicate // Pré-seleciona jogos novos
                    });
                }
            }

            // Ordenar: novos primeiro, depois por título
            return previewGames.sort((a, b) => {
                if (a.isDuplicate === b.isDuplicate) {
                    return a.title.localeCompare(b.title);
                }
                return a.isDuplicate ? 1 : -1;
            });

        } catch (error) {
            console.error('Erro ao preparar preview:', error);
            throw error;
        }
    }

    /**
     * Importa jogos selecionados
     * @param {Array} gamesToImport - Lista de jogos a importar
     * @param {string} userId - ID do usuário
     * @param {Function} progressCallback - Callback de progresso
     */
    async importSelected(gamesToImport, userId, progressCallback) {
        const total = gamesToImport.length;
        const allNewGames = [];

        for (let i = 0; i < total; i++) {
            const game = gamesToImport[i];

            if (progressCallback) {
                progressCallback({
                    stage: 'processing',
                    current: i + 1,
                    total,
                    game: game.title
                });
            }

            // Tentar buscar Metacritic no RAWG (com rate limiting)
            let metacritic = null;
            try {
                if (i > 0 && i % 5 === 0) {
                    await new Promise(r => setTimeout(r, 1100));
                }

                const rawgResults = await GameService.searchRawg(game.title);
                if (rawgResults && rawgResults.length > 0) {
                    metacritic = rawgResults[0].metacritic || null;
                    // Também tentar pegar imagem
                    if (!game.image_url && rawgResults[0].background_image) {
                        game.image_url = rawgResults[0].background_image;
                    }
                }
            } catch (e) {
                console.warn(`RAWG enrich failed for ${game.title}`);
            }

            allNewGames.push({
                title: game.title,
                platform: game.targetPlatform,
                status: 'Coleção',
                price_paid: 0,
                price_sold: 0,
                image_url: game.image_url || null,
                tags: game.tags,
                metacritic: metacritic,
                user_id: userId
            });
        }

        if (allNewGames.length > 0) {
            if (progressCallback) {
                progressCallback({ stage: 'saving', total: allNewGames.length });
            }
            await GameService.batchAddGames(allNewGames);
        }

        return allNewGames.length;
    }
}

/**
 * Extensão do ImportService para GOG Galaxy
 */
export const GogImportService = {
    async getGogPreview(jsonData, selectedPlatforms = null) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const importer = new GogGalaxyImporter();
        const parsedData = typeof jsonData === 'string'
            ? importer.parseGogGalaxyJson(jsonData)
            : jsonData;

        return await importer.getPreviewData(parsedData, user.id, selectedPlatforms);
    },

    async confirmGogImport(selectedGames, progressCallback) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const importer = new GogGalaxyImporter();
        return await importer.importSelected(selectedGames, user.id, progressCallback);
    },

    /**
     * Retorna plataformas disponíveis no JSON
     */
    getAvailablePlatforms(jsonData) {
        const parsedData = typeof jsonData === 'string'
            ? JSON.parse(jsonData)
            : jsonData;

        const platforms = [];
        for (const [platform, games] of Object.entries(parsedData)) {
            if (games && games.length > 0) {
                platforms.push({
                    name: platform,
                    count: games.length
                });
            }
        }
        return platforms.sort((a, b) => b.count - a.count);
    }
};
