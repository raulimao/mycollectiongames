import { supabase } from './supabase.js';

const RAWG_API_KEY = 'bf9095c524314757b15a99942a202d6b';

export const GameService = {
    // Busca todos os jogos do usuário (RLS filtra automaticamente)
    async fetchGames() {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    // Adiciona novo jogo
    async addGame(gameData) {
        // Obtém o usuário atual para garantir a relação
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("Usuário não autenticado");

        const payload = { ...gameData, user_id: user.id };
        
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data[0];
    },

    // Atualiza jogo existente
    async updateGame(id, gameData) {
        const { error } = await supabase.from('games').update(gameData).eq('id', id);
        if (error) throw error;
    },

    // Deleta jogo
    async deleteGame(id) {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;
    },

    // Busca na API pública RAWG
    async searchRawg(query) {
        if (query.length < 3) return [];
        try {
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${query}&page_size=5`);
            const data = await res.json();
            return data.results || [];
        } catch (e) {
            console.error("RAWG Error:", e);
            return [];
        }
    }
};