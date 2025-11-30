import { supabase, Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- DEBUGGER MOBILE (MANTIDO PARA TESTE) ---
const debugEl = document.createElement('div');
debugEl.style.cssText = "position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.8); color:#00ff41; font-size:11px; z-index:99999; padding:8px; pointer-events:none; font-family:monospace; border-bottom:1px solid #00ff41;";
document.body.appendChild(debugEl);
const log = (msg) => {
    console.log(msg);
    // Mostra apenas as últimas 2 linhas para não poluir
    const lines = debugEl.innerHTML.split("<br>").slice(0, 1);
    debugEl.innerHTML = msg + "<br>" + lines.join("<br>");
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
    log("🚀 Iniciando (Modo Implicit)...");

    // 1. Verifica se estamos voltando do email
    const isAuthRedirect = window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery'));

    if (isAuthRedirect) {
        log("🔑 Token detectado na URL!");
        if (DOM.loginOverlay) DOM.loginOverlay.classList.remove('hidden');
        if (DOM.loginForm) DOM.loginForm.classList.add('hidden'); 
        if (DOM.loginMessage) DOM.loginMessage.innerText = "Autenticando sessão...";
    }

    // 2. Tenta obter sessão
    try {
        const { data, error } = await supabase.auth.getSession();
        
        if (data?.session) {
            log("✅ Sessão válida!");
            handleUserAuth(data.session.user);
        } else {
            // Se tem token na URL mas getSession falhou inicialmente,
            // o Implicit Flow as vezes precisa de um micro-delay para o Supabase processar o hash
            if (isAuthRedirect) {
                log("⏳ Processando hash...");
                setTimeout(async () => {
                     const retry = await supabase.auth.getSession();
                     if (retry.data?.session) {
                         log("✅ Sessão recuperada após delay!");
                         handleUserAuth(retry.data.session.user);
                     } else {
                         log("❌ Falha na validação do token.");
                         showLoginScreen();
                         if(DOM.loginMessage) DOM.loginMessage.innerText = "Link expirado ou inválido.";
                     }
                }, 1000);
            } else {
                log("ℹ️ Visitante não logado.");
                showLoginScreen();
            }
        }
    } catch (e) {
        log("Erro fatal: " + e.message);
        showLoginScreen();
    }

    // 3. Listener de Segurança (Backup)
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            log("📡 Evento: LOGIN");
            handleUserAuth(session.user);
        } else if (event === 'SIGNED_OUT') {
            log("📡 Evento: LOGOUT");
            showLoginScreen();
        }
    });

    setupEventListeners();
};

const handleUserAuth = async (user) => {
    if (state.user?.id === user.id) return; // Evita loop
    state.user = user;

    log(`👤 Olá, ${user.email}`);
    
    // UI Update
    if(DOM.loginOverlay) DOM.loginOverlay.classList.add('hidden');
    if(DOM.appContainer) DOM.appContainer.classList.remove('hidden');
    if(DOM.userEmailDisplay) DOM.userEmailDisplay.innerText = user.email;

    // Remove hash da URL limpo
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
        if(DOM.gamesContainer) DOM.gamesContainer.innerHTML = `<div style="text-align:center; padding:3rem; color:#888;"><h3>Seu Vault está vazio</h3><p>Adicione jogos para começar.</p></div>`;
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
            btn.innerText = "Enviando Magic Link...";
            log("Enviando link...");

            try {
                const { error } = await Auth.signIn(email);
                if (error) throw error;
                if(DOM.loginMessage) {
                    DOM.loginMessage.innerHTML = "<span style='color:var(--success)'>✨ Link enviado! Verifique seu app de email.</span>";
                    log("Link enviado com sucesso!");
                }
            } catch (err) {
                log("Erro envio: " + err.message);
                if(DOM.loginMessage) DOM.loginMessage.innerText = "Erro: " + err.message;
            } finally {
                btn.disabled = false;
                btn.innerText = "INICIAR SESSÃO";
            }
        });
    }

    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) btnLogout.addEventListener('click', () => {
        if(confirm("Sair do Vault?")) Auth.signOut();
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