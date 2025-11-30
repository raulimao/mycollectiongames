import { supabase } from './supabase.js';

const RAWG_API_KEY = 'bf9095c524314757b15a99942a202d6b';

export const GameService = {
    async fetchGames() {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async addGame(gameData) {
        // O user_id é injetado automaticamente pelo Supabase via RLS/Auth Context
        // mas aqui passamos explicitamente para garantir a policy
        const { data: { user } } = await supabase.auth.getUser();
        
        const payload = { ...gameData, user_id: user.id };
        
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data[0];
    },

    async updateGame(id, gameData) {
        const { error } = await supabase.from('games').update(gameData).eq('id', id);
        if (error) throw error;
    },

    async deleteGame(id) {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;
    },

    async searchRawg(query) {
        if (query.length < 3) return [];
        const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${query}&page_size=5`);
        const data = await res.json();
        return data.results;
    }
};