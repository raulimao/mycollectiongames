// --- js/supabase.js ---

const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY'; 

const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Define a URL correta dinamicamente, mas travada na raiz
const getRedirectUrl = () => {
    // Se estiver no computador local (127.0.0.1 ou localhost)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:5500/'; // Ajuste para sua porta local se necessário
    }
    // Se estiver na produção (GitHub Pages)
    return 'https://raulimao.github.io/mycollectiongames/';
};

export const DB = {
    getAll: async () => {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error(error); return []; }
        return data;
    },

    add: async (game) => {
        const { id, ...gameData } = game; 
        const { data, error } = await supabase.from('games').insert([gameData]).select();
        if (error) throw error;
        return data[0];
    },

    update: async (game) => {
        const { id, user_id, created_at, ...updates } = game;
        const { data, error } = await supabase.from('games').update(updates).eq('id', id).select();
        if (error) throw error;
        return data[0];
    },

    delete: async (id) => {
        const { error } = await supabase.from('games').delete().eq('id', id);
        if (error) throw error;
    },
    
    auth: {
        signIn: async (email) => {
            const { data, error } = await supabase.auth.signInWithOtp({
                email: email,
                options: { 
                    // FIX: Usa a função que garante a URL correta com a barra no final
                    emailRedirectTo: getRedirectUrl() 
                }
            });
            return { data, error };
        },
        
        signOut: async () => {
            await supabase.auth.signOut();
            window.location.href = getRedirectUrl(); // Força reload limpo
        },

        getUser: async () => {
            const { data } = await supabase.auth.getUser();
            return data.user;
        },
        
        // NOVO: Escuta mudanças de sessão em tempo real (importante para mobile)
        onStateChange: (callback) => {
            supabase.auth.onAuthStateChange((event, session) => {
                callback(session?.user || null);
            });
        }
    }
};