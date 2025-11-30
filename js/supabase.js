// --- js/supabase.js ---

const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY'; 

// Cria e EXPORTA o cliente diretamente
export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

export const Auth = {
    signIn: async (email) => {
        // Tenta detectar a URL atual automaticamente
        const redirectTo = window.location.href.split('#')[0]; // Remove hashes antigos
        
        return await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectTo }
        });
    },
    
    signOut: async () => {
        await supabase.auth.signOut();
        window.location.reload();
    },

    // Wrapper simples para pegar sessão atual
    getSession: async () => {
        return await supabase.auth.getSession();
    }
};

export const DB = {
    getGames: async () => {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return [];
        return data;
    },
    
    addGame: async (gameData, userId) => {
        const payload = {
            ...gameData,
            preco: parseFloat(gameData.preco || 0),
            vendido: gameData.vendido ? parseFloat(gameData.vendido) : null,
            lucro: gameData.lucro ? parseFloat(gameData.lucro) : null,
            user_id: userId
        };
        const { data, error } = await supabase.from('games').insert([payload]).select();
        if (error) throw error;
        return data;
    }
};