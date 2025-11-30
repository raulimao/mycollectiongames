import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configurações do seu projeto
const SUPABASE_URL = 'https://hyeeclvizibfzeemiqle.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5ZWVjbHZpemliZnplZW1pcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0OTQ5NDIsImV4cCI6MjA4MDA3MDk0Mn0.kE0BV4RAZweE4On2sQ3kaQWBcwa8eCcBdnwh__zDtlY';

// Inicializa o cliente
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const AuthService = {
    // Login com Google corrigido para GitHub Pages
    async signInGoogle() {
        // Pega a URL atual exata (ex: .../mycollectiongames/) limpa de parâmetros
        const redirectTo = window.location.href.split('?')[0];
        
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { 
                redirectTo: redirectTo,
                queryParams: { access_type: 'offline', prompt: 'consent' }
            }
        });
        if (error) throw error;
    },
    
    // Logout completo (limpa sessão e recarrega)
    async signOut() {
        await supabase.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
    },

    // Helper para pegar sessão atual
    async getSession() {
        return await supabase.auth.getSession();
    },

    // Helper para pegar usuário atual
    async getUser() {
        const { data } = await supabase.auth.getUser();
        return data.user;
    }
};