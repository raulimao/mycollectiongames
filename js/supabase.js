// --- js/supabase.js ---
const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY'; 

// Cria o cliente globalmente
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Define URL de redirecionamento (Localhost vs Produção)
const getRedirectUrl = () => {
    const host = window.location.hostname;
    return (host === 'localhost' || host === '127.0.0.1') 
        ? 'http://127.0.0.1:5500/' 
        : 'https://raulimao.github.io/mycollectiongames/';
};

export const Auth = {
    signIn: async (email) => {
        return await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: getRedirectUrl() }
        });
    },
    signOut: async () => {
        await supabase.auth.signOut();
        window.location.reload();
    },
    getUser: async () => {
        const { data } = await supabase.auth.getUser();
        return data.user;
    },
    onStateChange: (callback) => {
        return supabase.auth.onAuthStateChange((event, session) => {
            callback(session?.user || null);
        });
    }
};

export const DB = {
    // Busca APENAS os jogos do usuário logado
    getGames: async () => {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error("Erro ao buscar jogos:", error);
            return [];
        }
        return data;
    },
    
    // Preparado para adicionar (SaaS Feature)
    addGame: async (gameData, userId) => {
        const { data, error } = await supabase
            .from('games')
            .insert([{ ...gameData, user_id: userId }])
            .select();
        if (error) throw error;
        return data;
    }
};