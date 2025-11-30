import { Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- Estado da Aplicação ---
const state = {
    user: null,
    games: [],
    currentTab: 'collection', // 'collection' ou 'sold'
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

    // 1. Verificação imediata de Hash na URL (Correção para Mobile)
    // Se a URL tiver '#access_token', significa que o usuário clicou no Magic Link.
    // Não devemos mostrar o formulário de login vazio, e sim um "Loading".
    const isReturningFromEmail = window.location.hash.includes('access_token') || window.location.hash.includes('error=');
    
    if (isReturningFromEmail) {
        console.log("Detectado retorno de Magic Link. Processando...");
        if(DOM.loginOverlay) {
             DOM.loginOverlay.classList.remove('hidden');
             // Esconde o form e mostra mensagem
             DOM.loginForm.classList.add('hidden');
             const msg = document.getElementById('loginMessage');
             if(msg) {
                 msg.innerText = "Autenticando e descriptografando Vault...";
                 msg.style.color = "var(--primary)";
             }
        }
    }

    // 2. Listener de Estado de Autenticação
    Auth.onStateChange(async (user) => {
        state.user = user;
        
        if (user) {
            // --- USUÁRIO LOGADO ---
            console.log("Login Confirmado:", user.email);
            if(DOM.userEmailDisplay) DOM.userEmailDisplay.innerText = user.email;
            
            // Remove Login
            DOM.loginOverlay.classList.add('hidden');
            DOM.appContainer.classList.remove('hidden');

            // Restaura o form de login (para caso de logout futuro)
            DOM.loginForm.classList.remove('hidden');
            document.getElementById('loginMessage').innerText = "";

            // Carrega dados
            await loadUserLibrary();
            
            // Limpa a URL (remove o token gigante) sem recarregar a página
            if (isReturningFromEmail) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

        } else {
            // --- USUÁRIO DESLOGADO ---
            console.log("Sem usuário ativo.");
            
            // Só mostra a tela de login se NÃO estivermos no meio do processamento do token
            // Isso evita o "flash" do formulário de login antes do Supabase validar o token
            if (!isReturningFromEmail) { 
                DOM.loginOverlay.classList.remove('hidden');
                DOM.loginForm.classList.remove('hidden');
                DOM.appContainer.classList.add('hidden');
            }
        }
    });
    
    setupEventListeners();
};

// --- Carregamento de Dados ---
const loadUserLibrary = async () => {
    DOM.gamesContainer.innerHTML = '<div class="spinner" style="margin-top:50px"></div>'; // Loading feedback
    
    console.log("📥 Buscando jogos no Supabase...");
    const data = await DB.getGames(); // Chama o supabase.js
    
    state.games = data || [];
    refreshApp();
};

// --- Lógica de UI (Renderização) ---
const refreshApp = () => {
    // 1. Filtragem dos dados locais
    const filtered = filterGames();

    // 2. KPIs (Sempre baseados no total do usuário, independente do filtro de busca)
    const collectionItems = state.games.filter(g => g.status !== 'Vendido');
    const soldItems = state.games.filter(g => g.status === 'Vendido');
    renderKPIs(collectionItems, soldItems);

    // 3. Atualiza Dropdown de Filtros (apenas se for a primeira carga ou se quiser dinâmico)
    populateFilters(state.games);

    // 4. Renderização do Grid
    if (state.games.length === 0) {
        // Empty State (Vault Vazio)
        DOM.gamesContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; border: 1px dashed #333; border-radius: 20px; background: rgba(0,0,0,0.2);">
                <h2 style="font-family:'Orbitron'; margin-bottom:10px; color: var(--text-muted);">VAULT VAZIO</h2>
                <p style="color:#666; margin-bottom:20px;">Você ainda não adicionou nenhum jogo à sua coleção.</p>
                <button class="btn-primary" onclick="alert('Funcionalidade de Adicionar Jogo será implementada a seguir!')">
                    + ADICIONAR PRIMEIRO JOGO
                </button>
            </div>
        `;
    } else {
        renderGrid(filtered, state.currentTab === 'sold');
    }
};

const filterGames = () => {
    // Seleciona fonte baseada na aba ativa
    let source = [];
    if (state.currentTab === 'collection') {
        source = state.games.filter(g => g.status !== 'Vendido');
    } else {
        source = state.games.filter(g => g.status === 'Vendido');
    }

    return source.filter(item => {
        // Tratamento seguro para campos que podem vir nulos do banco
        const nomeJogo = item.jogo || item.nome || ''; // Suporte a legado
        
        // Filtro de Texto
        const matchText = nomeJogo.toLowerCase().includes(state.search.toLowerCase());
        
        // Filtro de Plataforma
        const matchPlat = state.platformFilter === 'all' || item.plataforma === state.platformFilter;
        
        return matchText && matchPlat;
    });
};

// --- Event Listeners ---
const setupEventListeners = () => {
    // 1. Formulário de Login
    if (DOM.loginForm) {
        DOM.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const emailInput = document.getElementById('emailInput');
            const email = emailInput.value;
            const btn = DOM.loginForm.querySelector('button');
            const msg = document.getElementById('loginMessage');
            const btnText = document.getElementById('btnText');
            const loader = document.getElementById('loader');
            
            // Estado de Loading UI
            btn.disabled = true;
            if(btnText) btnText.classList.add('hidden');
            if(loader) loader.classList.remove('hidden');
            msg.innerText = "";

            try {
                // Chama login no Supabase
                const { error } = await Auth.signIn(email);
                
                if (error) {
                    msg.innerText = "Erro: " + error.message;
                    msg.style.color = "#ff4444";
                } else {
                    msg.innerHTML = "✨ Link enviado!<br>Verifique seu e-mail (inclusive SPAM).";
                    msg.style.color = "var(--success)";
                    emailInput.value = ""; // Limpa campo
                }
            } catch (err) {
                msg.innerText = "Erro inesperado. Tente novamente.";
            } finally {
                // Restaura UI
                btn.disabled = false;
                if(btnText) btnText.classList.remove('hidden');
                if(loader) loader.classList.add('hidden');
            }
        });
    }

    // 2. Logout
    if (DOM.btnLogout) {
        DOM.btnLogout.addEventListener('click', () => {
            if(confirm("Deseja sair do Vault?")) {
                Auth.signOut();
            }
        });
    }

    // 3. Abas (Coleção vs Vendidos)
    DOM.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // UI Update
            DOM.tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            // Logic Update
            state.currentTab = e.target.dataset.tab;
            refreshApp();
        });
    });

    // 4. Busca (Search)
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', (e) => {
            state.search = e.target.value;
            refreshApp();
        });
    }

    // 5. Filtro de Plataforma
    if (DOM.platformSelect) {
        DOM.platformSelect.addEventListener('change', (e) => {
            state.platformFilter = e.target.value;
            refreshApp();
        });
    }

    // 6. Botão Novo Jogo (Placeholder)
    if (DOM.btnNewGame) {
        DOM.btnNewGame.addEventListener('click', () => {
            alert("O Modal de Adicionar Jogo será reativado na próxima etapa do desenvolvimento!");
            // openModal(); // Futura implementação
        });
    }
};

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);