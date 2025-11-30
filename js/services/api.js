import { supabase } from './supabase.js';

const RAWG_API_KEY = 'bf9095c524314757b15a99942a202d6b';

export const GameService = {
    // Busca todos os jogos (RLS filtra por user_id no backend)
    async fetchGames() {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    },

    async addGame(gameData) {
        // Garante usuário autenticado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado. Faça login novamente.");

        // Sanitização básica
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
        // Sanitização básica
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

    // API Pública de Jogos
    async searchRawg(query) {
        if (!query || query.length < 3) return [];
        
        try {
            const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`;
            const res = await fetch(url);
            
            if (!res.ok) throw new Error(`RAWG API Error: ${res.status}`);
            
            const data = await res.json();
            return data.results || [];
        } catch (e) {
            console.warn("Aviso na busca RAWG:", e);
            // Retorna array vazio para não quebrar a UI
            return [];
        }
    }
};