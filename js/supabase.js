// --- js/supabase.js ---

// Inicializa o cliente Supabase (usando a lib global que adicionamos no HTML)
const supabaseUrl = 'https://hyeeclvizibfzeemiqle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);


export const DB = {
    // Pegar todos os jogos do usuário logado
    getAll: async () => {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('Erro Supabase:', error);
            return [];
        }
        return data;
    },

    // Adicionar novo
    add: async (game) => {
        const { id, ...gameData } = game; // Remove ID temporário se existir
        const { data, error } = await supabase
            .from('games')
            .insert([gameData])
            .select();
            
        if (error) throw error;
        return data[0];
    },

    // Atualizar
    update: async (game) => {
        const { id, user_id, created_at, ...updates } = game; // Separa campos que não mudam
        const { data, error } = await supabase
            .from('games')
            .update(updates)
            .eq('id', id)
            .select();
            
        if (error) throw error;
        return data[0];
    },

    // Deletar
    delete: async (id) => {
        const { error } = await supabase
            .from('games')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
    },
    
    // Autenticação
    auth: {
        signIn: async (email) => {
            const { data, error } = await supabase.auth.signInWithOtp({
                email: email,
                options: { emailRedirectTo: window.location.href }
            });
            return { data, error };
        },
        
        signOut: async () => {
            await supabase.auth.signOut();
            window.location.reload();
        },

        getUser: async () => {
            const { data } = await supabase.auth.getUser();
            return data.user;
        }
    }
};