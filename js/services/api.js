import { supabase } from './supabase.js';

const RAWG_API_KEY = 'b435fbadf8c24701adce7ef05814f0d6'; 

// --- CACHE & UTILS ---
const CacheService = {
    set(key, data, ttlMinutes = 1440) { 
        const now = new Date();
        const item = { value: data, expiry: now.getTime() + (ttlMinutes * 60 * 1000) };
        localStorage.setItem(key, JSON.stringify(item));
    },
    get(key) {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;
        try {
            const item = JSON.parse(itemStr);
            if (new Date().getTime() > item.expiry) { localStorage.removeItem(key); return null; }
            return item.value;
        } catch(e) { return null; }
    }
};

// --- TRADUÇÃO INTELIGENTE (DIVIDIR E CONQUISTAR) ---
// Função auxiliar que faz a chamada real
const fetchTranslationChunk = async (chunk) => {
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|pt-br`);
        const data = await res.json();
        
        // Verifica se a API devolveu sucesso e não um erro disfarçado
        if (data.responseStatus === 200 && 
            data.responseData.translatedText && 
            !data.responseData.translatedText.includes("QUERY LENGTH LIMIT")) {
            return data.responseData.translatedText;
        }
        return chunk; // Falha silenciosa: retorna o original se der erro
    } catch (e) {
        return chunk; // Fallback de rede
    }
};

const translateText = async (text) => {
    if (!text) return "Sem descrição disponível.";
    
    // Limpa tags HTML para economizar caracteres e evitar quebra de layout
    const cleanText = text.replace(/<[^>]*>/g, ''); 

    // Se for curto, traduz direto (rápido)
    if (cleanText.length <= 450) {
        return await fetchTranslationChunk(cleanText);
    }

    // --- ESTRATÉGIA SMART SPLIT ---
    // 1. Quebra o texto em frases baseadas em pontuação (. ! ?), mantendo a pontuação.
    // O regex olha para .!? seguidos de espaço ou fim de linha.
    const sentences = cleanText.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [cleanText];
    
    const chunks = [];
    let currentChunk = "";

    // 2. Empacota as frases em blocos de até 450 chars
    for (let sentence of sentences) {
        // Se a frase atual + a nova frase ainda cabem no limite...
        if ((currentChunk + sentence).length < 450) {
            currentChunk += sentence;
        } else {
            // Se não couber, fecha o pacote atual e começa um novo
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
        }
    }
    // Adiciona o que sobrou no último pacote
    if (currentChunk) chunks.push(currentChunk);

    // 3. Dispara todas as requisições em PARALELO
    // Isso é muito mais rápido do que esperar uma por uma
    try {
        const translatedChunks = await Promise.all(
            chunks.map(chunk => fetchTranslationChunk(chunk))
        );
        // 4. Costura tudo de volta
        return translatedChunks.join(" ");
    } catch (e) {
        console.warn("Erro no processo de tradução inteligente:", e);
        return text; // Último recurso: mostra em inglês mesmo
    }
};

// --- API DE JOGOS (RAWG) ---
export const GameService = {
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

    async fetchGames(userId) {
        const { data, error } = await supabase.from('games').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },
    
    async fetchSharedGames(userId) { return this.fetchGames(userId); },

    async addGame(gameData) {
        const { data: { user } } = await supabase.auth.getUser();
        const payload = { ...gameData, user_id: user.id };
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data[0];
    },

    async updateGame(id, gameData) { await supabase.from('games').update(gameData).eq('id', id); },
    async deleteGame(id) { await supabase.from('games').delete().eq('id', id); },

    async searchRawg(query) {
        if (!query || query.length < 3) return [];
        const cacheKey = `search_${query.toLowerCase()}`;
        const cached = CacheService.get(cacheKey);
        if(cached) return cached;

        try {
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`);
            const data = await res.json();
            CacheService.set(cacheKey, data.results, 60); 
            return data.results || [];
        } catch (e) { return []; }
    },

    async getGameDetails(gameName) {
        if (!gameName) return null;
        // ATENÇÃO: Mudei a versão do cache para v16 para forçar o recarregamento das descrições cortadas
        const cacheKey = `details_v16_${gameName.toLowerCase().replace(/\s/g, '')}`; 
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

// --- API SOCIAL ---
export const SocialService = {
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
            if(error) throw error;
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
            if(error) throw error;
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
        if(!userId) return [];
        const { data } = await supabase.from('social_follows').select('following_id').eq('follower_id', userId);
        return data ? data.map(r => r.following_id) : [];
    },

    async getNetwork(userId, type) {
        const column = type === 'followers' ? 'following_id' : 'follower_id'; 
        const targetColumn = type === 'followers' ? 'follower_id' : 'following_id'; 
        const { data: relations } = await supabase.from('social_follows').select(targetColumn).eq(column, userId);
        if(!relations || relations.length === 0) return [];
        const ids = relations.map(r => r[targetColumn]);
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
        return profiles || [];
    },

    async getProfileStats(userId) {
        const { data, error } = await supabase.from('profile_stats').select('*').eq('user_id', userId).maybeSingle();
        if(error || !data) return { followers_count: 0, following_count: 0, games_count: 0 };
        return data;
    },

    async getNotifications(userId) {
        const { data, error } = await supabase.from('notifications').select(`*, actor:profiles!actor_id(nickname)`).eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
        if(error) console.error("Erro busca notificações:", error);
        return data || [];
    },

    async markNotificationRead(notifId) {
        await supabase.from('notifications').update({ read: true }).eq('id', notifId);
    },
    
    async markAllNotificationsRead(userId) {
        await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    }
};