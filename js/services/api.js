import { supabase } from './supabase.js';
import { Config } from '../config.js';

// Use API key from config (supports localStorage override)
const RAWG_API_KEY = Config.RAWG_API_KEY;


// --- SERVICE: PRICE TRACKER (CHEAPSHARK API) ---
const PriceService = {
    async getLowestPrice(gameTitle) {
        try {
            // 1. Search for game to get GameID
            const searchUrl = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(gameTitle)}&limit=1`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (!searchData || searchData.length === 0) return null;

            const gameId = searchData[0].gameID;
            const thumb = searchData[0].thumb;

            // 2. Get Game Details (Cheapest Price Ever vs Current)
            const detailsUrl = `https://www.cheapshark.com/api/1.0/games?id=${gameId}`;
            const detailsRes = await fetch(detailsUrl);
            const detailsData = await detailsRes.json();

            if (!detailsData || !detailsData.deals || detailsData.deals.length === 0) return null;

            // Find lowest price currently available across all stores
            // CheapShark returns an array of deals. We want the absolute lowest 'price'.
            const deals = detailsData.deals;
            // Sort by price ascending
            deals.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

            const bestDeal = deals[0];
            const storeID = bestDeal.storeID;

            // Map common stores (CheapShark Store IDs)
            // 1=Steam, 7=GOG, 8=Origin, 11=Humble, 25=Epic
            const stores = { "1": "Steam", "7": "GOG", "8": "Origin", "11": "Humble", "25": "Epic Games" };
            const storeName = stores[storeID] || "Other Store";

            return {
                price: parseFloat(bestDeal.price),
                retailPrice: parseFloat(bestDeal.retailPrice),
                savings: parseFloat(bestDeal.savings).toFixed(0),
                store: storeName,
                dealID: bestDeal.dealID,
                thumb: thumb
            };
        } catch (e) {
            // Suppress Fetch errors to avoid console spam (Status 429/CORS)
            // console.warn("[PriceService] Erro (possível Rate Limit):", e.message); 
            return null;
        }
    }
};

// --- CACHE & UTILS ---
const CacheService = {
    set(key, data, ttlMinutes = 1440) {
        try {
            const now = new Date();
            const item = { value: data, expiry: now.getTime() + (ttlMinutes * 60 * 1000) };
            localStorage.setItem(key, JSON.stringify(item));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.warn("Storage full. Clearing old cache...");
                // Simple cleanup: Remove all API cache items
                try {
                    Object.keys(localStorage).forEach(k => {
                        if (k.startsWith('search_') || k.startsWith('details_') || k.startsWith('tr_')) {
                            localStorage.removeItem(k);
                        }
                    });
                    // Try one more time
                    try {
                        const now = new Date();
                        const item = { value: data, expiry: now.getTime() + (ttlMinutes * 60 * 1000) };
                        localStorage.setItem(key, JSON.stringify(item));
                    } catch (retryError) {
                        console.warn("Storage still full after cleanup. Item not cached.");
                    }
                } catch (cleanupError) {
                    console.error("Error during cache cleanup:", cleanupError);
                }
            } else {
                console.warn("Cache error:", e);
            }
        }
    },
    get(key) {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;
        try {
            const item = JSON.parse(itemStr);
            if (new Date().getTime() > item.expiry) { localStorage.removeItem(key); return null; }
            return item.value;
        } catch (e) { return null; }
    }
};

// --- TRADUÇÃO INTELIGENTE (COM CACHE PERSISTENTE E RATE LIMITING) ---

const simpleHash = str => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash &= hash;
    }
    return new Uint32Array([hash])[0].toString(36);
};

// Cache persistente para evitar chamadas de API repetidas
const TranslationCache = {
    get(text) {
        try {
            const key = `tr_${simpleHash(text)}`;
            const cached = localStorage.getItem(key);
            return cached || null;
        } catch (e) { return null; }
    },
    set(text, translation) {
        try {
            const key = `tr_${simpleHash(text)}`;
            localStorage.setItem(key, translation);
        } catch (e) { /* LocalStorage full? Ignore */ }
    }
};

let lastTranslationRequest = 0;
let translationDisabled = false;

const fetchTranslationChunk = async (chunk) => {
    // 1. Verifica Cache Local (Rápido e Grátis)
    const cached = TranslationCache.get(chunk);
    if (cached) return cached;

    // 2. Se API bloqueou recentemente, retorna original sem tentar
    // (Mas ainda salva no cache se um dia conseguirmos traduzir)
    if (translationDisabled) return chunk;

    try {
        // Rate limiting: Mínimo 1000ms entre chamadas (MyMemory é estrito)
        const now = Date.now();
        const timeSince = now - lastTranslationRequest;
        if (timeSince < 1000) {
            await new Promise(r => setTimeout(r, 1000 - timeSince));
        }
        lastTranslationRequest = Date.now();

        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|pt-br`);

        if (res.status === 429) {
            // Silencioso para não assustar o usuário, apenas fallback
            // console.warn('Rate limit tradução (429). Fallback para inglês.');
            translationDisabled = true;
            setTimeout(() => translationDisabled = false, 2 * 60 * 1000); // 2 min cooldown
            return chunk;
        }

        const data = await res.json();

        if (data.responseStatus === 200 && data.responseData.translatedText && !data.responseData.translatedText.includes("QUERY LENGTH LIMIT")) {
            const translated = data.responseData.translatedText;
            TranslationCache.set(chunk, translated); // Salva para sempre
            return translated;
        }

        return chunk;
    } catch (e) {
        return chunk;
    }
};

const translateText = async (text) => {
    if (!text) return "Sem descrição disponível.";

    // Limpa tags HTML para economizar caracteres e evitar quebra de layout
    const cleanText = text.replace(/<[^>]*>/g, '');

    // Se tradução está desabilitada, retorna texto limpo em inglês
    if (translationDisabled) {
        console.log('ℹ️ Translation disabled due to rate limiting. Showing English text.');
        return cleanText;
    }

    // Se for curto, traduz direto (rápido)
    if (cleanText.length <= 450) {
        return await fetchTranslationChunk(cleanText);
    }

    // --- ESTRATÉGIA SMART SPLIT ---
    // 1. Quebra o texto em frases baseadas em pontuação (. ! ?), mantendo a pontuação.
    const sentences = cleanText.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [cleanText];

    const chunks = [];
    let currentChunk = "";

    // 2. Empacota as frases em blocos de até 450 chars
    for (let sentence of sentences) {
        if ((currentChunk + sentence).length < 450) {
            currentChunk += sentence;
        } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
        }
    }
    if (currentChunk) chunks.push(currentChunk);

    // 3. Processa SEQUENCIALMENTE (não paralelo) para respeitar rate limit
    try {
        const translatedChunks = [];
        for (const chunk of chunks) {
            const translated = await fetchTranslationChunk(chunk);
            translatedChunks.push(translated);

            // Se falhou, o fetchTranslationChunk já retorna o original e seta a flag.
            // Continuamos o loop para garantir que o resto do texto seja anexado (mesmo que em inglês).
            // if (translationDisabled) break; // REMOVIDO PARA EVITAR TRUNCAMENTO
        }
        return translatedChunks.join(" ");
    } catch (e) {
        console.warn("Erro no processo de tradução inteligente:", e);
        return cleanText; // Último recurso: mostra em inglês mesmo
    }
};

// --- API DE JOGOS (RAWG) ---
const GameService = {
    async getMyProfile(userId) {
        if (!userId) return null;
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        return data;
    },

    async createProfile(nickname) {
        const { data: { user } } = await supabase.auth.getUser();
        const cleanNick = nickname.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const { data, error } = await supabase.from('profiles').insert([{ id: user.id, nickname: cleanNick }]).select().single();
        if (error) throw error;
        return data;
    },

    async updateProfile(userId, profileData) {
        const { error } = await supabase.from('profiles').update(profileData).eq('id', userId);
        if (error) throw error;
    },

    async getUserIdByNickname(nickname) {
        const { data } = await supabase.from('profiles').select('id').eq('nickname', nickname.toLowerCase()).single();
        return data ? data.id : null;
    },

    // DEPRECATED: Server-Side Pagination
    // async fetchGames(userId, page = 0, limit = 50) { ... }
    // async fetchSharedGames(userId) { ... }

    async fetchStatsOnly(userId) {
        // Query otimizada: Traz dados suficientes para KPI, Gráficos E Renderização da Grid (Busca Global)
        // Evita trazer campos pesados que não usamos na listagem, mas garante Tags, Imagens e Metacritic.
        const { data, error } = await supabase
            .from('games')
            .select('id, status, platform, price_paid, price_sold, created_at, title, image_url, tags, metacritic')
            .eq('user_id', userId);

        if (error) throw error;
        return data || [];
    },

    async addGame(gameData) {
        const { data: { user } } = await supabase.auth.getUser();
        const payload = { ...gameData, user_id: user.id };
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data[0];
    },

    async updateGame(id, gameData) { await supabase.from('games').update(gameData).eq('id', id); },

    async checkDuplicate(userId, title, platform) {
        const { data } = await supabase.from('games')
            .select('id')
            .eq('user_id', userId)
            .ilike('title', title) // ilike for case-insensitive
            .eq('platform', platform)
            .maybeSingle();
        return !!data;
    },

    async batchAddGames(gamesArray) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        // Add user_id to all games
        const gamesWithUserId = gamesArray.map(game => ({
            ...game,
            user_id: user.id
        }));

        // Insert in batches of 10 to ensure stability and progress tracking
        const BATCH_SIZE = 10;
        const results = [];
        console.log(`[BatchAdd] Starting insert of ${gamesWithUserId.length} games...`);

        for (let i = 0; i < gamesWithUserId.length; i += BATCH_SIZE) {
            const batch = gamesWithUserId.slice(i, i + BATCH_SIZE);
            console.log(`[BatchAdd] Processing batch ${i / BATCH_SIZE + 1}...`);

            const { data, error } = await supabase.from('games').insert(batch).select();

            if (error) {
                console.error('[BatchAdd] Error:', error);
                throw error;
            }

            console.log(`[BatchAdd] Batch ${i / BATCH_SIZE + 1} success. Inserted ${data?.length} rows.`);
            results.push(...(data || []));
        }

        console.log('[BatchAdd] All batches completed.');
        return results;
    },

    async deleteGame(id) {
        // 1. Fetch game details to identify feed items
        const { data: game } = await supabase.from('games').select('user_id, title, platform').eq('id', id).maybeSingle();

        // 2. Delete the game
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;

        // 3. Cascade delete to social_feed (best effort match)
        if (game) {
            // Remove feed items matching this game's signature
            await supabase.from('social_feed')
                .delete()
                .eq('user_id', game.user_id)
                .eq('game_title', game.title)
                .eq('platform', game.platform);
        }
    },

    async deleteByPlatform(userId, platform) {
        if (!userId) throw new Error("User ID required");
        // Delete games where platform is Steam (or 'PC' AND tag contains Steam if we were precise, but for now platform check is safer if we standardize 'Steam' imports as Platform='PC' with Tag='Steam'. But wait, ImportService sets platform='PC'. So we must delete by TAG or FILTER.)

        // Better approach: User confirms deletion. We fetch all games check tags inside JSONB.
        // Supabase 'cs' operator checks if JSONB contains key/value
        // But tags is TEXT ARRAY.
        // supabase.from('games').delete().contains('tags', ['Steam']).eq('user_id', userId)

        const { data, error } = await supabase
            .from('games')
            .delete()
            .eq('user_id', userId)
            .contains('tags', ['Steam']) // This assumes specific tag 'Steam' is used
            .select();

        if (error) throw error;
        return data ? data.length : 0;
    },

    async searchRawg(query) {
        if (!query || query.length < 3) return [];
        // console.log('[RAWG] Searching:', query);
        const cacheKey = `search_${query.toLowerCase()}`;
        const cached = CacheService.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`;
            // console.log('[RAWG] URL:', url); // Debug
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('[RAWG] API Error:', res.status);
                return [];
            }
            const data = await res.json();
            CacheService.set(cacheKey, data.results, 60);
            return data.results || [];
        } catch (e) {
            console.error('[RAWG] Catch Error:', e);
            return [];
        }
    },

    async getGameDetails(gameName) {
        if (!gameName) return null;
        // ATENÇÃO: Cache v17 para invalidar versões anteriores com descrições quebradas
        const cacheKey = `details_v17_${gameName.toLowerCase().replace(/\s/g, '')}`;
        const cachedData = CacheService.get(cacheKey);
        if (cachedData) return cachedData;

        try {
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(gameName)}&page_size=1`);
            const data = await res.json();
            if (!data.results || data.results.length === 0) return null;

            const gameBasic = data.results[0];
            const [resDetails, resMovies] = await Promise.all([
                fetch(`https://api.rawg.io/api/games/${gameBasic.id}?key=${RAWG_API_KEY}`),
                fetch(`https://api.rawg.io/api/games/${gameBasic.id}/movies?key=${RAWG_API_KEY}`)
            ]);

            const fullData = await resDetails.json();
            const moviesData = await resMovies.json();

            const descRaw = fullData.description_raw || fullData.description || "Sem descrição.";

            // Aqui acontece a mágica da tradução completa
            const translatedDesc = await translateText(descRaw);

            const finalData = {
                ...fullData,
                description_ptbr: translatedDesc,
                trailers: moviesData.results || []
            };

            CacheService.set(cacheKey, finalData, 1440);
            return finalData;
        } catch (e) { return null; }
    }
};


// --- EXPORTS ---
export { GameService, SocialService, PriceService };

// --- API SOCIAL ---

const SocialService = {
    async getGlobalFeed() {
        const { data, error } = await supabase.from('social_feed').select(`*, social_likes (count)`).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        return data.map(post => ({ ...post, likes_count: post.social_likes[0]?.count || 0 }));
    },


    async getUserLikes(userId) {
        const { data } = await supabase.from('social_likes').select('feed_id').eq('user_id', userId);
        return data ? data.map(l => l.feed_id) : [];
    },

    async toggleLike(feedId, userId) {
        const { data } = await supabase.from('social_likes').select('id').eq('user_id', userId).eq('feed_id', feedId).maybeSingle();
        if (data) {
            await supabase.from('social_likes').delete().eq('id', data.id);
            return 'removed';
        } else {
            const { error } = await supabase.from('social_likes').insert([{ user_id: userId, feed_id: feedId }]);
            if (error) throw error;
            const { data: feedItem } = await supabase.from('social_feed').select('user_id').eq('id', feedId).maybeSingle();
            if (feedItem && feedItem.user_id !== userId) {
                await supabase.from('notifications').insert({ user_id: feedItem.user_id, actor_id: userId, action_type: 'LIKE', related_id: feedId });
            }
            return 'added';
        }
    },

    async toggleFollow(currentUserId, targetUserId) {
        if (currentUserId === targetUserId) throw new Error("Ação inválida.");
        const { data } = await supabase.from('social_follows').select('*').eq('follower_id', currentUserId).eq('following_id', targetUserId).maybeSingle();
        if (data) {
            await supabase.from('social_follows').delete().eq('follower_id', currentUserId).eq('following_id', targetUserId);
            return false;
        } else {
            const { error } = await supabase.from('social_follows').insert([{ follower_id: currentUserId, following_id: targetUserId }]);
            if (error) throw error;
            await supabase.from('notifications').insert({ user_id: targetUserId, actor_id: currentUserId, action_type: 'FOLLOW' });
            return true;
        }
    },

    async checkIsFollowing(currentUserId, targetUserId) {
        if (!currentUserId || !targetUserId) return false;
        const { data } = await supabase.from('social_follows').select('follower_id').eq('follower_id', currentUserId).eq('following_id', targetUserId).maybeSingle();
        return !!data;
    },

    async getUserFollowingIds(userId) {
        if (!userId) return [];
        const { data } = await supabase.from('social_follows').select('following_id').eq('follower_id', userId);
        return data ? data.map(r => r.following_id) : [];
    },

    async getNetwork(userId, type) {
        const column = type === 'followers' ? 'following_id' : 'follower_id';
        const targetColumn = type === 'followers' ? 'follower_id' : 'following_id';
        const { data: relations } = await supabase.from('social_follows').select(targetColumn).eq(column, userId);
        if (!relations || relations.length === 0) return [];
        const ids = relations.map(r => r[targetColumn]);
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
        return profiles || [];
    },

    async getProfileStats(userId) {
        const { data, error } = await supabase.from('profile_stats').select('*').eq('user_id', userId).maybeSingle();
        if (error || !data) return { followers_count: 0, following_count: 0, games_count: 0 };
        return data;
    },

    async getNotifications(userId) {
        const { data, error } = await supabase.from('notifications').select(`*, actor:profiles!actor_id(nickname)`).eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
        if (error) console.error("Erro busca notificações:", error);
        return data || [];
    },

    async markNotificationRead(notifId) {
        await supabase.from('notifications').update({ read: true }).eq('id', notifId);
    },

    async markAllNotificationsRead(userId) {
        await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    },

    async cleanupOrphanedFeed(userId) {
        // 1. Get all User's Games (Source of Truth)
        const { data: games } = await supabase.from('games').select('title, platform').eq('user_id', userId);
        const userGames = games || [];

        // 2. Get all User's Feed Items
        const { data: feedItems } = await supabase.from('social_feed').select('id, game_title, platform').eq('user_id', userId);
        const userFeed = feedItems || [];

        // 3. Find Orphans (Feed items with no matching Game)
        // Match criteria: Exact Title AND Platform
        const orphans = userFeed.filter(feedItem => {
            const hasMatch = userGames.some(game =>
                game.title === feedItem.game_title &&
                game.platform === feedItem.platform
            );
            return !hasMatch;
        });

        if (orphans.length === 0) return 0;

        // 4. Delete Orphans
        const orphanIds = orphans.map(o => o.id);
        const { error } = await supabase.from('social_feed').delete().in('id', orphanIds);

        if (error) throw error;
        return orphanIds.length;
    }
};