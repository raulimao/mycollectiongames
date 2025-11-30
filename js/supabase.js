// --- js/supabase.js ---
const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY'; 

// Cria o cliente
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
        // Tenta pegar a sessão atual para garantir
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            console.error("❌ ERRO: Usuário não está autenticado no momento da busca.");
            throw new Error("Usuário não logado.");
        }

        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            // AQUI ESTÁ O SEGREDO: Logar o erro detalhado
            console.error("🔥 ERRO SUPABASE (Detalhes):", error);
            console.error("Mensagem:", error.message);
            console.error("Dica:", error.hint);
            throw error;
        }
        return data || [];
    },
    
    addGame: async (gameData, userId) => {
        const payload = sanitizeGameData(gameData, userId);
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) {
            console.error("Erro ao Adicionar:", error);
            throw error;
        }
        return data;
    },

    updateGame: async (id, gameData) => {
        const payload = sanitizeGameData(gameData);
        delete payload.user_id; 
        const { data, error } = await supabase.from('games').update(payload).eq('id', id).select();
        if (error) {
            console.error("Erro ao Atualizar:", error);
            throw error;
        }
        return data;
    },

    deleteGame: async (id) => {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) {
            console.error("Erro ao Deletar:", error);
            throw error;
        }
        return true;
    }
};

const sanitizeGameData = (data, userId) => {
    return {
        ...data,
        preco: parseFloat(data.preco || 0),
        vendido: data.vendido ? parseFloat(data.vendido) : null,
        lucro: data.lucro ? parseFloat(data.lucro) : null,
        user_id: userId ? userId : undefined
    };
};