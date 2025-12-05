import { supabase } from './supabase.js';

const RAWG_API_KEY = 'b435fbadf8c24701adce7ef05814f0d6'; 

// --- SERVIÇO DE CACHE (Versão v5 para forçar atualização) ---
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
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout em: ${operationName}`)), ms))
    ]);
};

// --- TRADUÇÃO V2 (GOOGLE GTX + MYMEMORY FALLBACK) ---
const translateText = async (text) => {
    if(!text) return "Sem descrição disponível.";
    
    // 1. Tentativa via Google Translate Free (Suporta textos maiores)
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        // O Google retorna array de arrays, precisamos juntar
        if (data && data[0]) {
            return data[0].map(x => x[0]).join("");
        }
    } catch (e) {
        console.warn("Google Translate falhou, tentando fallback...", e);
    }

    // 2. Fallback: MyMemory (Limite 500 chars)
    if (text.length < 500) {
        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-br`);
            const data = await res.json();
            if (data.responseStatus === 200) return data.responseData.translatedText;
        } catch (e) { console.warn("MyMemory falhou"); }
    }

    // 3. Último caso: Retorna original COMPLETO (Melhor que cortado)
    return text;
};

export const GameService = {
    async getMyProfile(userId) {
        if (!userId) return null;
        try {
            const { data, error } = await withTimeout(supabase.from('profiles').select('*').eq('id', userId).maybeSingle(), 4000, 'Buscar Perfil');
            if (error) throw error;
            return data;
        } catch (e) { return null; }
    },

    async createProfile(nickname) {
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("Usuário não autenticado");
        const cleanNick = nickname.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const { data, error } = await withTimeout(supabase.from('profiles').insert([{ id: user.id, nickname: cleanNick }]).select().single());
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
            const { data, error } = await withTimeout(supabase.from('games').select('*').eq('user_id', uid).order('created_at', { ascending: false }), 10000, 'Fetch Games');
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
        const payload = { ...gameData, user_id: user.id, price_paid: parseCurrency(gameData.price_paid), price_sold: parseCurrency(gameData.price_sold) };
        const { data, error } = await withTimeout(supabase.from('games').insert([payload]).select());
        if (error) throw error;
        return data[0];
    },

    async updateGame(id, gameData) {
        const payload = { ...gameData, price_paid: parseCurrency(gameData.price_paid), price_sold: parseCurrency(gameData.price_sold) };
        await supabase.from('games').update(payload).eq('id', id);
    },

    async deleteGame(id) {
        await supabase.from('games').delete().eq('id', id);
    },

    async searchRawg(query) {
        if (!query || query.length < 3) return [];
        const cacheKey = `search_${query.toLowerCase()}`;
        const cached = CacheService.get(cacheKey);
        if(cached) return cached;

        try {
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`);
            if(!res.ok) throw new Error("RAWG Error");
            const data = await res.json();
            CacheService.set(cacheKey, data.results, 60); 
            return data.results || [];
        } catch (e) { return []; }
    },

    async getGameDetails(gameName) {
        if (!gameName) return null;
        
        // MUDANÇA: 'v5' para invalidar descrições cortadas antigas
        const cacheKey = `details_v5_${gameName.toLowerCase().replace(/\s/g, '')}`; 
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

            // Pega texto puro para melhor tradução
            const descRaw = fullData.description_raw || fullData.description || "";
            const translatedDesc = await translateText(descRaw);

            const finalData = {
                ...fullData,
                description_ptbr: translatedDesc,
                trailers: moviesData.results || [] 
            };

            CacheService.set(cacheKey, finalData, 1440); 
            return finalData;
        } catch (e) {
            return null;
        }
    }
};