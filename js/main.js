import { Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- Estado da Aplicação ---
const state = {
    user: null,
    games: [],
    currentTab: 'collection',
    search: '',
    platformFilter: 'all'
};

// --- Elementos do DOM (Cache) ---
const DOM = {
    loginOverlay: document.getElementById('loginOverlay'),
    appContainer: document.getElementById('appContainer'),
    loginForm: document.getElementById('loginForm'),
    userEmailDisplay: document.getElementById('userEmailDisplay'),
    btnLogout: document.getElementById('btnLogout'),
    kpiContainer: document.getElementById('kpi-container'),
    gamesContainer: document.getElementById('gamesContainer'),
    searchInput: document.getElementById('searchInput'),
    platformSelect: document.getElementById('platformSelect'),
    tabs: document.querySelectorAll('.tab-btn'),
    btnNewGame: document.getElementById('btnNewGame')
};

// --- Inicialização ---
const init = async () => {
    console.log("Inicializando GameVault...");

    // 1. UI DE CARREGAMENTO IMEDIATO
    // Se tiver hash na URL (retorno do email), esconde o form imediatamente para não confundir
    const hasHash = window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery');
    if (hasHash) {
        if(DOM.loginForm) DOM.loginForm.classList.add('hidden');
        const msg = document.getElementById('loginMessage');
        if(msg) {
            msg.innerText = "Validando credenciais...";
            msg.style.color = "var(--primary)";
        }
    }

    // 2. CONFIGURA O LISTENER (Para mudanças futuras)
    Auth.onStateChange((user) => {
        handleUserAuth(user);
    });

    // 3. VERIFICAÇÃO FORÇADA DE SESSÃO (A Correção do Bug Mobile)
    // Não esperamos o listener. Perguntamos ativamente: "Já tem usuário?"
    try {
        const user = await Auth.getUser();
        if (user) {
            console.log("Sessão ativa encontrada manualmente.");
            handleUserAuth(user);
        } else if (hasHash) {
            // Se tem hash mas o getUser falhou, esperamos um pouco o Supabase processar
            console.log("Hash detectado, aguardando processamento do Supabase...");
            setTimeout(async () => {
                const retryUser = await Auth.getUser();
                if (retryUser) handleUserAuth(retryUser);
                else {
                    // Se falhar mesmo assim, mostra erro e volta o form
                    if(DOM.loginForm) DOM.loginForm.classList.remove('hidden');
                    const msg = document.getElementById('loginMessage');
                    if(msg) msg.innerText = "Link expirado ou inválido. Tente novamente.";
                }
            }, 2000);
        }
    } catch (e) {
        console.error("Erro na verificação inicial:", e);
    }

    setupEventListeners();
};

// --- Função Centralizada de Autenticação ---
const handleUserAuth = async (user) => {
    // Evita rodar duas vezes se o listener e a verificação manual pegarem ao mesmo tempo
    if (state.user?.email === user?.email) return;

    state.user = user;

    if (user) {
        // --- LOGADO ---
        console.log("✅ Usuário Autenticado:", user.email);
        
        if(DOM.userEmailDisplay) DOM.userEmailDisplay.innerText = user.email;
        
        // Esconde Login / Mostra App
        if(DOM.loginOverlay) DOM.loginOverlay.classList.add('hidden');
        if(DOM.appContainer) DOM.appContainer.classList.remove('hidden');

        // Reseta form (para logout futuro)
        if(DOM.loginForm) DOM.loginForm.classList.remove('hidden');
        const msg = document.getElementById('loginMessage');
        if(msg) msg.innerText = "";

        // Carrega Jogos
        await loadUserLibrary();
        
        // Limpa a URL (apenas visual)
        if (window.location.hash) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }

    } else {
        // --- DESLOGADO ---
        // Só mostra login se não tiver hash (processando)
        if (!window.location.hash.includes('access_token')) {
            if(DOM.loginOverlay) DOM.loginOverlay.classList.remove('hidden');
            if(DOM.appContainer) DOM.appContainer.classList.add('hidden');
        }
    }
};

// --- Carregamento de Dados ---
const loadUserLibrary = async () => {
    if(DOM.gamesContainer) DOM.gamesContainer.innerHTML = '<div class="spinner" style="margin-top:50px"></div>';
    
    const data = await DB.getGames();
    state.games = data || [];
    refreshApp();
};

// --- UI Logic ---
const refreshApp = () => {
    const filtered = filterGames();
    
    const collectionItems = state.games.filter(g => g.status !== 'Vendido');
    const soldItems = state.games.filter(g => g.status === 'Vendido');
    
    renderKPIs(collectionItems, soldItems);
    populateFilters(state.games);

    if (state.games.length === 0) {
        DOM.gamesContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; border: 1px dashed #333; border-radius: 20px; color: #888;">
                <h2 style="font-family:'Orbitron'; color:white; margin-bottom:10px;">VAULT VAZIO</h2>
                <p>Nenhum jogo encontrado.</p>
                <button class="btn-primary" style="margin-top:15px" onclick="alert('Em breve!')">+ Adicionar Jogo</button>
            </div>
        `;
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

// --- Event Listeners ---
const setupEventListeners = () => {
    // Login Form
    if (DOM.loginForm) {
        DOM.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('emailInput').value;
            const btn = DOM.loginForm.querySelector('button');
            const msg = document.getElementById('loginMessage');
            
            // UI Loading
            btn.disabled = true;
            const originalText = btn.innerText;
            btn.innerText = "ENVIANDO...";

            try {
                const { error } = await Auth.signIn(email);
                if (error) throw error;
                
                msg.innerHTML = "✨ Link enviado!<br>Cheque seu e-mail.";
                msg.style.color = "var(--success)";
            } catch (err) {
                msg.innerText = "Erro: " + err.message;
                msg.style.color = "red";
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    }

    // Logout
    if (DOM.btnLogout) {
        DOM.btnLogout.addEventListener('click', () => {
            if(confirm("Sair do sistema?")) Auth.signOut();
        });
    }

    // Tabs
    DOM.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            DOM.tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.currentTab = e.target.dataset.tab;
            refreshApp();
        });
    });

    // Filtros
    if (DOM.searchInput) DOM.searchInput.addEventListener('input', (e) => {
        state.search = e.target.value;
        refreshApp();
    });
    if (DOM.platformSelect) DOM.platformSelect.addEventListener('change', (e) => {
        state.platformFilter = e.target.value;
        refreshApp();
    });
};

document.addEventListener('DOMContentLoaded', init);