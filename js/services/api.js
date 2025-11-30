import { supabase } from './supabase.js';

const RAWG_API_KEY = 'b435fbadf8c24701adce7ef05814f0d6'; 

export const GameService = {
    // Busca MEUS jogos (com login)
    async fetchGames() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('games')
            .select('*')
            .eq('user_id', user.id) // Garante que pega só os meus
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    },

    // NOVO: Busca jogos de UM AMIGO (Público)
    // Note que selecionamos colunas específicas para evitar trazer dados sensíveis desnecessários,
    // embora a proteção visual principal seja feita no UI.js
    async fetchSharedGames(userId) {
        const { data, error } = await supabase
            .from('games')
            .select('id, title, platform, status, image_url, created_at') // NÃO pedimos price_paid/sold
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async addGame(gameData) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");

        const payload = { 
            ...gameData, 
            user_id: user.id,
            price_paid: parseFloat(gameData.price_paid) || 0,
            price_sold: parseFloat(gameData.price_sold) || 0
        };
        
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data[0];
    },

    async updateGame(id, gameData) {
        const payload = {
            ...gameData,
            price_paid: parseFloat(gameData.price_paid) || 0,
            price_sold: parseFloat(gameData.price_sold) || 0
        };
        const { error } = await supabase.from('games').update(payload).eq('id', id);
        if (error) throw error;
    },

    async deleteGame(id) {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;
    },

    async searchRawg(query) {
        if (!query || query.length < 3) return [];
        const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Erro API RAWG: ${res.status}`);
        const data = await res.json();
        return data.results || [];
    }
};