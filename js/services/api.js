import { supabase } from './supabase.js';

// 🔴 SUBSTITUA ESTA CHAVE PELA SUA CHAVE NOVA DO RAWG.IO
// A chave antiga foi bloqueada. Pegue uma free em: https://rawg.io/apidocs
const RAWG_API_KEY = '03a8f74ab0684719a04c9fc1445fc46f'; 

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
        
        // Verifica se a chave foi configurada
        if (RAWG_API_KEY === '03a8f74ab0684719a04c9fc1445fc46f') {
            throw new Error("Chave de API inválida. Configure no arquivo api.js");
        }
        
        const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`;
        const res = await fetch(url);
        
        if (!res.ok) {
            // Lança o erro para o main.js mostrar o toast vermelho
            throw new Error(`Erro API RAWG: ${res.status}`);
        }
        
        const data = await res.json();
        return data.results || [];
    }
};