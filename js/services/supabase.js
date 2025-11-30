import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configurações do Projeto
// NOTA: Em produção real, estas chaves idealmente ficariam em variáveis de ambiente,
// mas para um app client-side puro (GitHub Pages), precisamos expô-las.
// O RLS (Row Level Security) no Supabase deve estar ativado para segurança.
const SUPABASE_URL = 'https://hyeeclvizibfzeemiqle.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const AuthService = {
    async signInGoogle() {
        // Pega a URL base limpa (sem ?code=... ou hashes)
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { 
                redirectTo: redirectTo,
                queryParams: { access_type: 'offline' }
            }
        });
        
        if (error) {
            console.error("Erro no Auth Google:", error);
            throw error;
        }
    },
    
    async signOut() {
        await supabase.auth.signOut();
        // Limpa resquícios locais para evitar estados fantasmas
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
    },

    async getSession() {
        return await supabase.auth.getSession();
    },

    async getUser() {
        const { data } = await supabase.auth.getUser();
        return data.user;
    }
};