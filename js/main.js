import { supabase, Auth, DB } from './supabase.js'; // Importa supabase direto
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- DEBUGGER MOBILE (REMOVER EM PRODUÇÃO) ---
const debugEl = document.createElement('div');
debugEl.style.cssText = "position:fixed; top:0; left:0; width:100%; background:rgba(200,0,0,0.9); color:white; font-size:10px; z-index:99999; padding:5px; pointer-events:none; font-family:monospace;";
document.body.appendChild(debugEl);
const log = (msg) => {
    console.log(msg);
    debugEl.innerHTML = msg + "<br>" + debugEl.innerHTML;
};
// ---------------------------------------------

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

const init = async () => {
    log("🚀 Init iniciado...");
    log("URL Hash: " + window.location.hash);

    // 1. Tratamento Visual Inicial
    if (window.location.hash.includes('access_token')) {
        log("🔑 Hash Token detectado!");
        if (DOM.loginOverlay) DOM.loginOverlay.classList.remove('hidden');
        if (DOM.loginForm) DOM.loginForm.classList.add('hidden'); // Esconde form
        if (DOM.loginMessage) DOM.loginMessage.innerText = "Processando Token...";
    }

    // 2. TENTATIVA DIRETA DE SESSÃO (A Correção Real)
    // getSession processa o token da URL internamente
    try {
        log("🔄 Verificando getSession()...");
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
            log("❌ Erro getSession: " + error.message);
            showLoginScreen();
        } else if (data.session) {
            log("✅ Sessão encontrada via getSession!");
            handleUserAuth(data.session.user);
        } else {
            log("ℹ️ Nenhuma sessão ativa.");
            // Se tem hash mas não tem sessão, aguarda o listener
            if (!window.location.hash.includes('access_token')) {
                showLoginScreen();
            }
        }
    } catch (e) {
        log("❌ Exceção Fatal: " + e.message);
        showLoginScreen();
    }

    // 3. Listener (Rede de Segurança)
    supabase.auth.onAuthStateChange((event, session) => {
        log(`📡 Evento Auth: ${event}`);
        if (session?.user) {
            handleUserAuth(session.user);
        } else if (event === 'SIGNED_OUT') {
            showLoginScreen();
        }
    });

    setupEventListeners();
};

const handleUserAuth = async (user) => {
    // Evita re-renderizar se já estiver logado
    if (state.user?.id === user.id) return;
    
    log(`👤 Autenticado: ${user.email}`);
    state.user = user;

    // UI Update Force
    if(DOM.loginOverlay) DOM.loginOverlay.classList.add('hidden');
    if(DOM.appContainer) DOM.appContainer.classList.remove('hidden');
    if(DOM.userEmailDisplay) DOM.userEmailDisplay.innerText = user.email;

    // Limpa URL
    if (window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname);
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
    log("📥 Baixando jogos...");
    if(DOM.gamesContainer) DOM.gamesContainer.innerHTML = '<div class="spinner"></div>';
    
    const data = await DB.getGames();
    log(`📦 Jogos recebidos: ${data.length}`);
    
    state.games = data || [];
    refreshApp();
};

const refreshApp = () => {
    // Lógica de Renderização (Idêntica à anterior)
    const filtered = filterGames();
    const collection = state.games.filter(g => g.status !== 'Vendido');
    const sold = state.games.filter(g => g.status === 'Vendido');
    
    renderKPIs(collection, sold);
    populateFilters(state.games);

    if (state.games.length === 0) {
        if(DOM.gamesContainer) DOM.gamesContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:#888;">Vault Vazio.<br><br>Adicione jogos no PC primeiro (ou aguarde update).</div>`;
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
            log(`✉️ Enviando link para: ${email}`);
            
            const btn = DOM.loginForm.querySelector('button');
            const originalBtn = btn.innerHTML;
            btn.innerHTML = "Enviando...";
            btn.disabled = true;

            try {
                const { error } = await Auth.signIn(email);
                if (error) throw error;
                DOM.loginMessage.innerHTML = "<span style='color:#00ff41'>Link Enviado! Cheque o email no celular.</span>";
            } catch (err) {
                log("❌ Erro login: " + err.message);
                DOM.loginMessage.innerText = "Erro: " + err.message;
            } finally {
                btn.innerHTML = originalBtn;
                btn.disabled = false;
            }
        });
    }
    
    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) btnLogout.addEventListener('click', () => Auth.signOut());

    // Tabs & Filters
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