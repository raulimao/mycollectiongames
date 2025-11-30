import { supabase } from './supabase.js';

// Sua chave válida
const RAWG_API_KEY = 'b435fbadf8c24701adce7ef05814f0d6'; 

export const GameService = {
    // Busca todos os jogos do usuário
    async fetchGames() {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    },

    // Adiciona novo jogo
    async addGame(gameData) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado. Faça login novamente.");

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

    // Atualiza jogo
    async updateGame(id, gameData) {
        const payload = {
            ...gameData,
            price_paid: parseFloat(gameData.price_paid) || 0,
            price_sold: parseFloat(gameData.price_sold) || 0
        };

        const { error } = await supabase.from('games').update(payload).eq('id', id);
        if (error) throw error;
    },

    // Deleta jogo
    async deleteGame(id) {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;
    },

    // API Pública RAWG
    async searchRawg(query) {
        if (!query || query.length < 3) return [];
        
        // --- CORREÇÃO: Removido o bloco IF que travava sua chave ---
        
        const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`;
        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error(`Erro API RAWG: ${res.status}`);
        }
        
        const data = await res.json();
        return data.results || [];
    }
};