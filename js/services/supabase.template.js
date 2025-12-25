// CORREÇÃO: Acessa o Supabase Global (injetado via script tag no index.html)
// Isso evita o erro de "AuthClient null" causado por imports ESM via CDN.
const { createClient } = window.supabase;

// =====================================================
// ⚠️ SUPABASE CONFIGURATION TEMPLATE
// =====================================================
// 
// INSTRUCTIONS:
// 1. Create a project at https://supabase.com
// 2. Get your URL and Anon Key from Project Settings > API
// 3. Replace the placeholders below with your credentials
//
// NOTE: The anon key is safe to expose in client-side code
// as long as you have Row Level Security (RLS) enabled!
// =====================================================

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const AuthService = {
    async signInGoogle() {
        try {
            const redirectTo = `${window.location.origin}${window.location.pathname}`;
            console.log("🔐 [Auth] Iniciando OAuth para:", redirectTo);

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectTo,
                    queryParams: { access_type: 'offline' }
                }
            });

            if (error) throw error;
        } catch (error) {
            console.error("❌ [Auth Error]", error);
            alert("Erro ao iniciar login: " + error.message);
        }
    },

    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.reload();
    }
};
