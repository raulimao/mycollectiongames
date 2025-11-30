const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY';

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

export const Auth = {
    signInGoogle: async () => {
        const redirectTo = window.location.origin + window.location.pathname;
        return await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    },
    
    signOut: async () => {
        // Limpa tudo para garantir que o usuário saia
        await supabase.auth.signOut();
        localStorage.clear(); 
        sessionStorage.clear();
        window.location.reload();
    },

    getSession: async () => await supabase.auth.getSession()
};

export const DB = {
    // Busca jogos com tratamento de erro
    getGames: async () => {
        const { data, error } = await supabase.from('games').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    // Adiciona jogo convertendo string para número
    addGame: async (gameData, userId) => {
        const payload = sanitize(gameData, userId);
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data;
    },

    updateGame: async (id, gameData) => {
        const payload = sanitize(gameData);
        delete payload.user_id; // Segurança: nunca altera o dono
        const { data, error } = await supabase.from('games').update(payload).eq('id', id).select();
        if (error) throw error;
        return data;
    },

    deleteGame: async (id) => {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;
    }
};

// Helper para limpar dados antes de enviar ao banco
const sanitize = (data, userId) => {
    return {
        ...data,
        preco: parseFloat(data.preco) || 0,
        vendido: data.vendido ? parseFloat(data.vendido) : 0,
        lucro: data.lucro ? parseFloat(data.lucro) : 0,
        user_id: userId ? userId : undefined
    };
};