import { Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- Estado da Aplicação ---
const state = {
    user: null,
    games: [],     // Dados crus do Banco
    currentTab: 'collection',
    search: '',
    platformFilter: 'all'
};

// --- DOM Elements ---
const loginOverlay = document.getElementById('loginOverlay');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const userEmailDisplay = document.getElementById('userEmailDisplay');

// --- Autenticação e Inicialização ---
const init = () => {
    // Ouve mudanças de Login/Logout
    Auth.onStateChange(async (user) => {
        state.user = user;
        
        if (user) {
            // USUÁRIO LOGADO
            console.log("Usuário autenticado:", user.email);
            userEmailDisplay.innerText = user.email;
            
            // 1. Esconde Login, Mostra App
            loginOverlay.classList.add('hidden');
            appContainer.classList.remove('hidden');

            // 2. Busca dados REAIS do Supabase
            await loadUserLibrary();

        } else {
            // USUÁRIO DESLOGADO
            loginOverlay.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });

    setupEventListeners();
};

// --- Carregamento de Dados (Core do SaaS) ---
const loadUserLibrary = async () => {
    // Mostra loading se quiser...
    const data = await DB.getGames();
    state.games = data || []; // Garante array mesmo se null

    // Atualiza toda a interface
    refreshApp();
};

// --- Lógica de UI Centralizada ---
const refreshApp = () => {
    // 1. Filtra os dados com base no Estado Atual
    const filtered = filterGames();

    // 2. Renderiza KPIs (Com base em TUDO ou Filtro? Geralmente TUDO do usuário)
    // Separa coleção de vendidos para as KPIs
    const collectionItems = state.games.filter(g => g.status !== 'Vendido');
    const soldItems = state.games.filter(g => g.status === 'Vendido');
    renderKPIs(collectionItems, soldItems);

    // 3. Atualiza Filtros (Dropdown)
    populateFilters(state.games);

    // 4. Renderiza Grid
    // Verifica se é um usuário NOVO (sem dados)
    if (state.games.length === 0) {
        document.getElementById('gamesContainer').innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 5rem; border: 1px dashed #333; border-radius: 20px;">
                <h2 style="margin-bottom:10px;">Seu Vault está Vazio</h2>
                <p style="color:#888; margin-bottom:20px;">Comece a rastrear sua coleção agora.</p>
                <button class="btn-primary" onclick="alert('Função de adicionar em breve!')">Adicionar Primeiro Jogo</button>
            </div>
        `;
        return;
    }
    
    renderGrid(filtered, state.currentTab === 'sold');
};

const filterGames = () => {
    // Define qual grupo mostrar (Coleção ou Vendidos)
    let source = [];
    if (state.currentTab === 'collection') {
        source = state.games.filter(g => g.status !== 'Vendido');
    } else {
        source = state.games.filter(g => g.status === 'Vendido');
    }

    // Aplica filtros de texto e plataforma
    return source.filter(item => {
        const matchText = item.nome?.toLowerCase().includes(state.search.toLowerCase()) || 
                          item.jogo?.toLowerCase().includes(state.search.toLowerCase()); // Suporte a campos legados
        const matchPlat = state.platformFilter === 'all' || item.plataforma === state.platformFilter;
        return matchText && matchPlat;
    });
};

// --- Event Listeners ---
const setupEventListeners = () => {
    // Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('emailInput').value;
        const btn = loginForm.querySelector('button');
        const msg = document.getElementById('loginMessage');
        
        btn.disabled = true;
        btn.querySelector('#btnText').classList.add('hidden');
        btn.querySelector('#loader').classList.remove('hidden');

        const { error } = await Auth.signIn(email);
        
        btn.disabled = false;
        btn.querySelector('#btnText').classList.remove('hidden');
        btn.querySelector('#loader').classList.add('hidden');

        if (error) {
            msg.innerText = "Erro: " + error.message;
            msg.style.color = "red";
        } else {
            msg.innerText = "Link mágico enviado! Verifique seu e-mail.";
            msg.style.color = "var(--success)";
        }
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', Auth.signOut);

    // Abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentTab = e.target.dataset.tab;
            refreshApp();
        });
    });

    // Filtros
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.search = e.target.value;
        refreshApp();
    });
    
    document.getElementById('platformSelect').addEventListener('change', (e) => {
        state.platformFilter = e.target.value;
        refreshApp();
    });
};

// Start
document.addEventListener('DOMContentLoaded', init);