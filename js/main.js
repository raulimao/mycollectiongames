import { supabase, Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- DEBUGGER (MANTIDO PARA CONFIRMAR O SUCESSO) ---
const debugEl = document.createElement('div');
debugEl.style.cssText = "position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.85); color:#00ff41; font-size:11px; z-index:99999; padding:10px; pointer-events:none; font-family:monospace; border-bottom:1px solid #00ff41;";
document.body.appendChild(debugEl);
const log = (msg) => {
    console.log(msg);
    debugEl.innerHTML = `> ${msg}<br>${debugEl.innerHTML.split('<br>').slice(0,2).join('<br>')}`;
};

// --- Estado ---
const state = {
    user: null,
    games: [],
    currentTab: 'collection',
    search: '',
    platformFilter: 'all'
};

const DOM = {
    loginOverlay: document.getElementById('loginOverlay'),
    appContainer: document.getElementById('appContainer'),
    loginForm: document.getElementById('loginForm'),
    userEmailDisplay: document.getElementById('userEmailDisplay'),
    gamesContainer: document.getElementById('gamesContainer'),
    searchInput: document.getElementById('searchInput'),
    platformSelect: document.getElementById('platformSelect'),
    tabs: document.querySelectorAll('.tab-btn'),
    loginMessage: document.getElementById('loginMessage')
};

// --- INICIALIZAÇÃO ---
const init = async () => {
    log("🚀 Iniciando Sistema...");

    // 1. O LINK MÁGICO CHEGOU? (Detecção Manual)
    const hash = window.location.hash;
    const hasToken = hash.includes('access_token') && hash.includes('type=recovery') || hash.includes('type=magiclink');

    if (hasToken) {
        log("⚡ Token detectado na URL! Forçando login...");
        
        // UI: Mostra que está trabalhando
        if (DOM.loginOverlay) DOM.loginOverlay.classList.remove('hidden');
        if (DOM.loginForm) DOM.loginForm.classList.add('hidden');
        if (DOM.loginMessage) DOM.loginMessage.innerHTML = "<span class='spinner'></span> Processando Credenciais...";

        // --- A MÁGICA: Extração Manual do Token ---
        // Não esperamos o Supabase. Nós mesmos pegamos os dados.
        try {
            // Remove o '#' inicial e parseia
            const params = new URLSearchParams(hash.substring(1));
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');

            if (access_token) {
                log("🔓 Token extraído. Definindo sessão...");
                
                // Força o Supabase a usar estes tokens
                const { data, error } = await supabase.auth.setSession({
                    access_token,
                    refresh_token
                });

                if (error) throw error;

                if (data.session) {
                    log("✅ SESSÃO FORÇADA COM SUCESSO!");
                    handleUserAuth(data.session.user);
                    return; // Encerra o init aqui, já logamos
                }
            }
        } catch (e) {
            log("❌ Falha ao forçar sessão: " + e.message);
            showLoginScreen();
        }
    }

    // 2. VERIFICAÇÃO PADRÃO (Para quem já estava logado antes)
    // Só roda se não estivermos no meio do processo acima
    try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
            log("💾 Sessão salva encontrada.");
            handleUserAuth(data.session.user);
        } else if (!hasToken) {
            // Só mostra login se NÃO tiver token (visitante normal)
            log("👤 Nenhum usuário logado.");
            showLoginScreen();
        }
    } catch (e) {
        log("Erro init: " + e.message);
        showLoginScreen();
    }

    // 3. Listener de Segurança
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            // log("📡 Auth Event: Logged In"); // Comentado para não poluir
            handleUserAuth(session.user);
        } else if (event === 'SIGNED_OUT') {
            log("📡 Auth Event: Logged Out");
            showLoginScreen();
        }
    });

    setupEventListeners();
};

// --- Funções Core ---
const handleUserAuth = async (user) => {
    if (state.user?.id === user.id) return;
    state.user = user;
    
    // UI Update
    if(DOM.loginOverlay) DOM.loginOverlay.classList.add('hidden');
    if(DOM.appContainer) DOM.appContainer.classList.remove('hidden');
    if(DOM.userEmailDisplay) DOM.userEmailDisplay.innerText = user.email;

    // Remove o hash gigante da URL
    if (window.location.hash) {
        window.history.replaceState(null, null, window.location.pathname);
    }

    await loadUserLibrary();
};

const showLoginScreen = () => {
    state.user = null;
    if(DOM.loginOverlay) DOM.loginOverlay.classList.remove('hidden');
    if(DOM.appContainer) DOM.appContainer.classList.add('hidden');
    if(DOM.loginForm) DOM.loginForm.classList.remove('hidden');
    if(DOM.loginMessage) DOM.loginMessage.innerText = "";
};

const loadUserLibrary = async () => {
    if(DOM.gamesContainer) DOM.gamesContainer.innerHTML = '<div class="spinner"></div>';
    const data = await DB.getGames();
    state.games = data || [];
    refreshApp();
};

const refreshApp = () => {
    const filtered = filterGames();
    const collection = state.games.filter(g => g.status !== 'Vendido');
    const sold = state.games.filter(g => g.status === 'Vendido');
    
    renderKPIs(collection, sold);
    populateFilters(state.games);

    if (state.games.length === 0) {
        if(DOM.gamesContainer) DOM.gamesContainer.innerHTML = `
            <div style="text-align:center; padding:3rem; color:#888; border:1px dashed #333; border-radius:10px;">
                <h3 style="color:white">Vault Vazio</h3>
                <p>Nenhum jogo encontrado.</p>
                <button class="btn-primary" style="margin-top:1rem" onclick="alert('Em breve!')">+ Adicionar</button>
            </div>`;
    } else {
        renderGrid(filtered, state.currentTab === 'sold');
    }
};

const filterGames = () => {
    let source = state.currentTab === 'collection' 
        ? state.games.filter(g => g.status !== 'Vendido')
        : state.games.filter(g => g.status === 'Vendido');

    return source.filter(item => {
        const nome = item.jogo || item.nome || '';
        const matchText = nome.toLowerCase().includes(state.search.toLowerCase());
        const matchPlat = state.platformFilter === 'all' || item.plataforma === state.platformFilter;
        return matchText && matchPlat;
    });
};

const setupEventListeners = () => {
    if (DOM.loginForm) {
        DOM.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('emailInput').value;
            const btn = DOM.loginForm.querySelector('button');
            
            btn.disabled = true;
            btn.innerText = "Enviando...";
            
            try {
                const { error } = await Auth.signIn(email);
                if (error) throw error;
                if(DOM.loginMessage) DOM.loginMessage.innerHTML = "<span style='color:var(--success)'>✨ Enviado! Verifique seu email.</span>";
            } catch (err) {
                if(DOM.loginMessage) DOM.loginMessage.innerText = "Erro: " + err.message;
            } finally {
                btn.disabled = false;
                btn.innerText = "INICIAR SESSÃO";
            }
        });
    }

    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) btnLogout.addEventListener('click', () => {
        if(confirm("Sair?")) Auth.signOut();
    });

    DOM.tabs.forEach(t => t.addEventListener('click', (e) => {
        DOM.tabs.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.currentTab = e.target.dataset.tab;
        refreshApp();
    }));
    
    if(DOM.searchInput) DOM.searchInput.addEventListener('input', (e) => { state.search = e.target.value; refreshApp(); });
    if(DOM.platformSelect) DOM.platformSelect.addEventListener('change', (e) => { state.platformFilter = e.target.value; refreshApp(); });
};

document.addEventListener('DOMContentLoaded', init);