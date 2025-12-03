import { supabase } from './supabase.js';

const RAWG_API_KEY = 'b435fbadf8c24701adce7ef05814f0d6'; 

// --- SERVIÇO DE CACHE ---
const CacheService = {
    set(key, data, ttlMinutes = 1440) { // Padrão: 24 horas
        const now = new Date();
        const item = {
            value: data,
            expiry: now.getTime() + (ttlMinutes * 60 * 1000),
        };
        localStorage.setItem(key, JSON.stringify(item));
    },
    get(key) {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;
        
        try {
            const item = JSON.parse(itemStr);
            const now = new Date();
            if (now.getTime() > item.expiry) {
                localStorage.removeItem(key);
                return null;
            }
            return item.value;
        } catch(e) { return null; }
    }
};

const parseCurrency = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    let clean = value.toString().replace(/[^0-9.,]/g, '');
    clean = clean.replace(',', '.');
    return parseFloat(clean) || 0;
};

const withTimeout = (promise, ms = 5000, operationName = 'Operação') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout em: ${operationName}`)), ms)
        )
    ]);
};

// Tradução Gratuita (MyMemory API)
// Nota: Limitada a 5000 caracteres/dia. Ideal para descrições curtas.
const translateText = async (text) => {
    if(!text) return "Sem descrição.";
    try {
        // Pega apenas os primeiros 500 caracteres para economizar e não quebrar a URL
        const cleanText = text.substring(0, 500); 
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=en|pt-br`);
        const data = await res.json();
        return data.responseData.translatedText + "...";
    } catch (e) {
        console.warn("Falha na tradução:", e);
        return text; // Fallback para inglês
    }
};

export const GameService = {
    async getMyProfile(userId) {
        if (!userId) return null;
        try {
            const { data, error } = await withTimeout(
                supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
                4000, 'Buscar Perfil'
            );
            if (error) throw error;
            return data;
        } catch (e) { return null; }
    },

    async createProfile(nickname) {
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("Usuário não autenticado");
        const cleanNick = nickname.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const { data, error } = await withTimeout(
            supabase.from('profiles').insert([{ id: user.id, nickname: cleanNick }]).select().single()
        );
        if (error) throw error;
        return data;
    },

    async getUserIdByNickname(nickname) {
        try {
            const { data, error } = await supabase.from('profiles').select('id').eq('nickname', nickname.toLowerCase()).single();
            if(error) return null;
            return data ? data.id : null;
        } catch (e) { return null; }
    },

    async fetchGames(userId) {
        let uid = userId;
        if (!uid) {
            const { data: { user } } = await supabase.auth.getUser();
            uid = user?.id;
        }
        if (!uid) return [];
        try {
            const { data, error } = await withTimeout(
                supabase.from('games').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
                10000, 'Fetch Games'
            );
            if (error) throw error;
            return data || [];
        } catch (e) { return []; }
    },
    
    async fetchSharedGames(userId) {
        try {
            const { data } = await supabase.from('games').select('*').eq('user_id', userId);
            return data || [];
        } catch(e) { return []; }
    },

    async addGame(gameData) {
        const { data: { user } } = await supabase.auth.getUser();
        const payload = { 
            ...gameData, 
            user_id: user.id, 
            price_paid: parseCurrency(gameData.price_paid), 
            price_sold: parseCurrency(gameData.price_sold) 
        };
        const { data, error } = await withTimeout(
            supabase.from('games').insert([payload]).select()
        );
        if (error) throw error;
        return data[0];
    },

    async updateGame(id, gameData) {
        const payload = { 
            ...gameData, 
            price_paid: parseCurrency(gameData.price_paid), 
            price_sold: parseCurrency(gameData.price_sold) 
        };
        await supabase.from('games').update(payload).eq('id', id);
    },

    async deleteGame(id) {
        await supabase.from('games').delete().eq('id', id);
    },

    async searchRawg(query) {
        if (!query || query.length < 3) return [];
        // Cache simples para busca também
        const cacheKey = `search_${query.toLowerCase()}`;
        const cached = CacheService.get(cacheKey);
        if(cached) return cached;

        try {
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`);
            if(!res.ok) throw new Error("RAWG Error");
            const data = await res.json();
            CacheService.set(cacheKey, data.results, 60); // Cache busca por 1h
            return data.results || [];
        } catch (e) { return []; }
    },

    // --- FUNÇÃO ATUALIZADA (CACHE + TRADUÇÃO + TRAILERS) ---
    async getGameDetails(gameName) {
        if (!gameName) return null;
        
        // 1. Verifica Cache
        const cacheKey = `details_${gameName.toLowerCase().replace(/\s/g, '')}`;
        const cachedData = CacheService.get(cacheKey);
        if (cachedData) {
            console.log("⚡ [Cache] Detalhes recuperados!");
            return cachedData;
        }

        try {
            // 2. Busca ID
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(gameName)}&page_size=1`);
            const data = await res.json();
            
            if (!data.results || data.results.length === 0) return null;
            
            const gameBasic = data.results[0];
            
            // 3. Busca Detalhes e Trailers em paralelo
            const [resDetails, resMovies] = await Promise.all([
                fetch(`https://api.rawg.io/api/games/${gameBasic.id}?key=${RAWG_API_KEY}`),
                fetch(`https://api.rawg.io/api/games/${gameBasic.id}/movies?key=${RAWG_API_KEY}`)
            ]);

            const fullData = await resDetails.json();
            const moviesData = await resMovies.json();

            // 4. Tradução
            const descRaw = fullData.description_raw || fullData.description || "";
            const translatedDesc = await translateText(descRaw);

            // 5. Monta objeto final
            const finalData = {
                ...fullData,
                description_ptbr: translatedDesc,
                trailers: moviesData.results || [] // Lista de trailers oficiais
            };

            // 6. Salva no Cache
            CacheService.set(cacheKey, finalData, 1440); // 24 horas
            
            return finalData;
        } catch (e) {
            console.warn("Falha ao buscar detalhes:", e);
            return null;
        }
    }
};