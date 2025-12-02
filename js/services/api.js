import { supabase } from './supabase.js';

const RAWG_API_KEY = 'b435fbadf8c24701adce7ef05814f0d6'; 

const parseCurrency = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    let clean = value.toString().replace(/[^0-9.,]/g, '');
    clean = clean.replace(',', '.');
    return parseFloat(clean) || 0;
};

// Timeout Wrapper melhorado
const withTimeout = (promise, ms = 5000, operationName = 'Operação') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout em: ${operationName}`)), ms)
        )
    ]);
};

export const GameService = {
    // Agora recebe o userId diretamente para evitar chamada redundante ao Auth
    async getMyProfile(userId) {
        if (!userId) return null;
        try {
            console.log(`📡 [API] Buscando perfil para ID: ${userId.slice(0,5)}...`);
            
            // Timeout curto (4s) para perfil. Se falhar, assumimos que não existe/erro e deixamos criar.
            const { data, error } = await withTimeout(
                supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
                4000,
                'Buscar Perfil'
            );
            
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn("⚠️ [API] Falha/Timeout no Perfil:", e.message);
            // Retorna null para que o fluxo continue e permita criar um novo perfil ou tentar depois
            return null;
        }
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
            const { data, error } = await withTimeout(
                supabase.from('profiles').select('id').eq('nickname', nickname.toLowerCase()).single()
            );
            if(error) return null;
            return data ? data.id : null;
        } catch (e) { return null; }
    },

    async fetchGames(userId) {
        // Se não passar userId, tenta pegar da sessão (fallback)
        let uid = userId;
        if (!uid) {
            const { data: { user } } = await supabase.auth.getUser();
            uid = user?.id;
        }
        if (!uid) return [];
        
        console.groupCollapsed("📡 [API] Buscando Jogos");
        try {
            const { data, error } = await withTimeout(
                supabase.from('games').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
                10000, // 10s para jogos (pode ser pesado)
                'Fetch Games'
            );
            if (error) throw error;
            console.log(`Carregados: ${data.length}`);
            console.groupEnd();
            return data || [];
        } catch (e) {
            console.error(e.message);
            console.groupEnd();
            return [];
        }
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
        try {
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`);
            if(!res.ok) throw new Error("RAWG Error");
            const data = await res.json();
            return data.results || [];
        } catch (e) { return []; }
    },

    // NOVO: Busca detalhes profundos para o Modal Rico
    async getGameDetails(gameName) {
        if (!gameName) return null;
        try {
            // Busca exata ou melhor match
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(gameName)}&page_size=1`);
            const data = await res.json();
            
            if (!data.results || data.results.length === 0) return null;
            
            const gameBasic = data.results[0];
            
            // Busca detalhes completos (precisa do ID para descrição e website)
            const resDetails = await fetch(`https://api.rawg.io/api/games/${gameBasic.id}?key=${RAWG_API_KEY}`);
            const fullData = await resDetails.json();
            
            return fullData;
        } catch (e) {
            console.warn("Falha ao buscar detalhes:", e);
            return null;
        }
    }
};