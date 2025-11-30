import { supabase } from './supabase.js';

const RAWG_API_KEY = 'b435fbadf8c24701adce7ef05814f0d6'; 

export const GameService = {
    // --- MÉTODOS DE PERFIL (NOVOS) ---

    // Busca perfil do usuário logado
    async getMyProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        return data; // Retorna { id, nickname } ou null
    },

    // Cria o perfil (Gamertag)
    async createProfile(nickname) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Erro de autenticação");

        // Validação simples
        const cleanNick = nickname.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (cleanNick.length < 3) throw new Error("Nickname muito curto (min 3 chars)");

        const { data, error } = await supabase
            .from('profiles')
            .insert([{ id: user.id, nickname: cleanNick }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') throw new Error("Este Gamertag já está em uso!");
            throw error;
        }
        return data;
    },

    // Busca ID através do Nickname (Para o link público)
    async getUserIdByNickname(nickname) {
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('nickname', nickname.toLowerCase())
            .single();
            
        if (error || !data) return null;
        return data.id;
    },

    // --- MÉTODOS DE JOGOS (MANTIDOS) ---

    async fetchGames() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data, error } = await supabase.from('games').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async fetchSharedGames(userId) {
        const { data, error } = await supabase
            .from('games')
            .select('id, title, platform, status, image_url, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async addGame(gameData) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");
        const payload = { ...gameData, user_id: user.id, price_paid: parseFloat(gameData.price_paid)||0, price_sold: parseFloat(gameData.price_sold)||0 };
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data[0];
    },

    async updateGame(id, gameData) {
        const payload = { ...gameData, price_paid: parseFloat(gameData.price_paid)||0, price_sold: parseFloat(gameData.price_sold)||0 };
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
        if (!res.ok) throw new Error(`Erro API: ${res.status}`);
        const data = await res.json();
        return data.results || [];
    }
};