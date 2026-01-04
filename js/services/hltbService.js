// HowLongToBeat Service
// Provides accurate game completion times using HLTB's internal API

const HLTBService = {
    // Cache to avoid repeated API calls
    cache: new Map(),

    /**
     * Search for a game on HowLongToBeat
     * @param {string} gameName - Name of the game to search
     * @returns {Promise<Object|null>} Game completion data or null if not found
     */
    async search(gameName) {
        if (!gameName || gameName.trim().length < 2) {
            console.warn('[HLTB] Game name too short:', gameName);
            return null;
        }

        // Check cache first
        const cacheKey = gameName.toLowerCase().trim();
        if (this.cache.has(cacheKey)) {
            console.log('[HLTB] Cache hit for:', gameName);
            return this.cache.get(cacheKey);
        }

        try {
            console.log('[HLTB] Searching for:', gameName);

            // Use LOCAL SMART PROXY (server.py)
            // Same Origin (port 5500) - No CORS headaches!
            const PROXY_ENDPOINT = '/proxy/hltb';

            // The request is now same-origin, so no CORS preflight issues from browser
            const response = await fetch(PROXY_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    searchType: "games",
                    searchTerms: [gameName], // Send FULL name, don't split!
                    searchPage: 1,
                    size: 20,
                    searchOptions: {
                        games: {
                            userId: 0,
                            platform: "",
                            sortCategory: "popular",
                            rangeCategory: "main",
                            rangeTime: { min: 0, max: 0 },
                            gameplay: { perspective: "", flow: "", genre: "" },
                            modifier: ""
                        },
                        users: { sortCategory: "postcount" },
                        filter: "",
                        sort: 0,
                        randomizer: 0
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HLTB API returned ${response.status}`);
            }

            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                console.log('[HLTB] No results for:', gameName);
                this.cache.set(cacheKey, null);
                return null;
            }

            // Better Matching Logic
            // The API returns a list. The first one is NOT always the best match.
            // We need to find the game that closely resembles 'gameName'.

            const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetName = normalize(gameName);

            let bestMatch = null;
            let bestScore = 0;

            // Simple similarity fallback: counting common bigrams (Dice Coefficient-ish)
            const getSimilarity = (s1, s2) => {
                const longer = s1.length > s2.length ? s1 : s2;
                const shorter = s1.length > s2.length ? s2 : s1;
                if (longer.length === 0) return 1.0;
                return (longer.length - Math.abs(longer.length - shorter.length)) / longer.length;
                // Note: Ideally use Levenshtein, but for now specific word inclusion is better
            };

            // Revised scoring: Prefer exact starts-with or full inclusion
            for (const g of data.data) {
                const gName = normalize(g.game_name);
                let score = 0;

                if (gName === targetName) score = 100; // Exact match
                else if (gName.includes(targetName) || targetName.includes(gName)) score = 80; // Substring
                else {
                    // Overlap score
                    let matches = 0;
                    const words = targetName.split(' ');
                    words.forEach(w => {
                        if (gName.includes(w)) matches++;
                    });
                    score = (matches / words.length) * 50;
                }

                // Prioritize close similarity
                const currentSim = getSimilarity(targetName, gName);
                score += currentSim * 20;

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = g;
                }
            }

            if (!bestMatch) {
                console.log('[HLTB] No close match found among', data.data.length, 'candidates.');
                bestMatch = data.data[0]; // Fallback to first if nothing makes sense
            }

            const game = bestMatch;

            // Convert seconds to hours (HLTB stores time in seconds)
            // Backend via howlongtobeatpy sends simple JSON, compatible.
            // Image might be full URL now.
            let imageUrl = game.game_image || null;
            if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = `https://howlongtobeat.com/games/${imageUrl}`;
            }

            const result = {
                name: game.game_name,
                imageUrl: imageUrl,
                mainStory: Math.round(game.comp_main / 3600) || 0,
                mainExtras: Math.round(game.comp_plus / 3600) || 0,
                completionist: Math.round(game.comp_100 / 3600) || 0,
                // Use main story as default, fallback to main+extras if main is 0
                averageTime: Math.round(game.comp_main / 3600) || Math.round(game.comp_plus / 3600) || 0
            };

            console.log('[HLTB] Found:', result);

            // Cache the result (cache for 24h)
            this.cache.set(cacheKey, result);

            return result;

        } catch (error) {
            console.error('[HLTB] Search error:', error);
            // Cache null to avoid repeated failed requests
            this.cache.set(cacheKey, null);
            return null;
        }
    },

    /**
     * Clear the cache (useful for testing)
     */
    clearCache() {
        this.cache.clear();
        console.log('[HLTB] Cache cleared');
    }
};

// Export for use in other modules
export { HLTBService };
