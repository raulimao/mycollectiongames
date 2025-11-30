// --- js/supabase.js ---
const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY'; 

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

export const Auth = {
    signInWithProvider: async (provider) => {
        const redirectTo = window.location.origin + window.location.pathname;
        return await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    },
    signOut: async () => {
        await supabase.auth.signOut();
        window.location.reload();
    },
    getSession: async () => await supabase.auth.getSession()
};

export const DB = {
    getGames: async () => {
        const { data, error } = await supabase.from('games').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },
    
    // CRIAR
    addGame: async (gameData, userId) => {
        const payload = sanitizeGameData(gameData, userId);
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data;
    },

    // ATUALIZAR
    updateGame: async (id, gameData) => {
        const payload = sanitizeGameData(gameData);
        // Não atualizamos user_id na edição por segurança
        delete payload.user_id; 
        const { data, error } = await supabase.from('games').update(payload).eq('id', id).select();
        if (error) throw error;
        return data;
    },

    // DELETAR
    deleteGame: async (id) => {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;
        return true;
    }
};

// Ajuda a limpar os números antes de enviar
const sanitizeGameData = (data, userId) => {
    return {
        ...data,
        preco: parseFloat(data.preco || 0),
        vendido: data.vendido ? parseFloat(data.vendido) : null,
        lucro: data.lucro ? parseFloat(data.lucro) : null,
        user_id: userId ? userId : undefined
    };
};