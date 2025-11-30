import { supabase, Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- ESTADO ---
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
    btnGoogle: document.getElementById('btnGoogle'),
    btnGithub: document.getElementById('btnGithub'),
    userAvatar: document.getElementById('userAvatar'),
    loginMessage: document.getElementById('loginMessage'),
    gamesContainer: document.getElementById('gamesContainer')
};

// --- INIT ---
const init = async () => {
    console.log("🚀 Iniciando GameVault OAuth...");

    // 1. Verificar Sessão Existente (O retorno do Google cai aqui)
    const { data } = await Auth.getSession();
    
    if (data?.session) {
        handleUserAuth(data.session.user);
    } else {
        // Se não tem sessão, mostra login
        DOM.loginOverlay.classList.remove('hidden');
    }

    // 2. Listener de Auth (Para logout ou login em outra aba)
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            handleUserAuth(session.user);
        } else if (event === 'SIGNED_OUT') {
            window.location.reload();
        }
    });

    setupEventListeners();
};

const handleUserAuth = async (user) => {
    state.user = user;
    console.log("✅ Usuário Logado:", user.email);

    // UI Updates
    DOM.loginOverlay.classList.add('hidden');
    DOM.appContainer.classList.remove('hidden');
    
    // Mostra avatar do Google se tiver
    if (user.user_metadata?.avatar_url) {
        DOM.userAvatar.src = user.user_metadata.avatar_url;
        DOM.userAvatar.classList.remove('hidden');
    }

    // Carrega dados
    await loadUserLibrary();
};

const loadUserLibrary = async () => {
    DOM.gamesContainer.innerHTML = '<div class="spinner"></div>';
    const data = await DB.getGames();
    state.games = data || [];
    refreshApp();
};

const refreshApp = () => {
    // Mesma lógica de renderização anterior
    const filtered = filterGames();
    const collection = state.games.filter(g => g.status !== 'Vendido');
    const sold = state.games.filter(g => g.status === 'Vendido');
    
    renderKPIs(collection, sold);
    populateFilters(state.games);

    if (state.games.length === 0) {
        DOM.gamesContainer.innerHTML = `<div style="text-align:center; padding:3rem; color:#888;"><h3>Bem-vindo!</h3><p>Seu vault está pronto.</p></div>`;
    } else {
        renderGrid(filtered, state.currentTab === 'sold');
    }
};

const filterGames = () => {
    // Filtros...
    let source = state.currentTab === 'collection' 
        ? state.games.filter(g => g.status !== 'Vendido')
        : state.games.filter(g => g.status === 'Vendido');
    
    return source.filter(item => {
        const nome = item.jogo || item.nome || '';
        return nome.toLowerCase().includes(state.search.toLowerCase()) &&
               (state.platformFilter === 'all' || item.plataforma === state.platformFilter);
    });
};

const setupEventListeners = () => {
    // Botão Google
    if (DOM.btnGoogle) {
        DOM.btnGoogle.addEventListener('click', async () => {
            DOM.loginMessage.innerText = "Redirecionando para o Google...";
            await Auth.signInWithProvider('google');
        });
    }

    // Botão Github
    if (DOM.btnGithub) {
        DOM.btnGithub.addEventListener('click', async () => {
            DOM.loginMessage.innerText = "Redirecionando para o Github...";
            await Auth.signInWithProvider('github');
        });
    }

    // Logout
    document.getElementById('btnLogout').addEventListener('click', () => Auth.signOut());

    // Abas e Filtros
    document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.currentTab = e.target.dataset.tab;
        refreshApp();
    }));
    
    document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value; refreshApp(); });
    document.getElementById('platformSelect').addEventListener('change', (e) => { state.platformFilter = e.target.value; refreshApp(); });
};

document.addEventListener('DOMContentLoaded', init);