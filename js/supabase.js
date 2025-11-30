// --- js/supabase.js ---

const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY'; 

// Cria o cliente
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

export const Auth = {
    signIn: async (email) => {
        // CORREÇÃO: Usa dinamicamente a origem atual (seja localhost, IP de rede ou domínio final)
        const redirectUrl = window.location.origin + window.location.pathname;
        
        console.log("Redirecionando para:", redirectUrl); // Para debug

        return await supabase.auth.signInWithOtp({
            email,
            options: { 
                emailRedirectTo: redirectUrl 
            }
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
            // Se o evento for de login inicial ou recuperação de sessão
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                callback(session?.user || null);
            } else if (event === 'SIGNED_OUT') {
                callback(null);
            }
        });
    }
};

export const DB = {
    getGames: async () => {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error("Erro Supabase:", error);
            return [];
        }
        return data;
    },
    
    addGame: async (gameData, userId) => {
        // Garante que preço e vendidos sejam números
        const payload = {
            ...gameData,
            preco: parseFloat(gameData.preco || 0),
            vendido: gameData.vendido ? parseFloat(gameData.vendido) : null,
            lucro: gameData.lucro ? parseFloat(gameData.lucro) : null,
            user_id: userId
        };

        const { data, error } = await supabase
            .from('games')
            .insert([payload])
            .select();
            
        if (error) throw error;
        return data;
    }
};