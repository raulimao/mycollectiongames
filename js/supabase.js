// --- js/supabase.js ---
const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY'; 

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

export const Auth = {
    // LOGIN SOCIAL (GOOGLE/GITHUB)
    signInWithProvider: async (provider) => {
        // Redireciona para a URL atual (onde o app está hospedado)
        const redirectTo = window.location.origin + window.location.pathname;
        
        return await supabase.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: redirectTo
            }
        });
    },
    
    signOut: async () => {
        await supabase.auth.signOut();
        window.location.reload();
    },

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
    
    // (Opcional por enquanto) Adicionar jogo
    addGame: async (gameData, userId) => {
        // Lógica de insert...
    }
};