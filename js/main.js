import { supabase, Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, populateFilters } from './ui.js';

// --- CONFIGURAÇÃO ---
const RAWG_API_KEY = '03a8f74ab0684719a04c9fc1445fc46f'; // <--- COLE SUA CHAVE AQUI

// --- ESTADO ---
const state = {
    user: null,
    games: [],
    currentTab: 'collection',
    search: '',
    platformFilter: 'all',
    editingId: null // Se null, é adição. Se tiver ID, é edição.
};

const DOM = {
    // Auth & Layout
    loginOverlay: document.getElementById('loginOverlay'),
    appContainer: document.getElementById('appContainer'),
    btnGoogle: document.getElementById('btnGoogle'),
    
    // App Logic
    gamesContainer: document.getElementById('gamesContainer'),
    
    // Modal & Form
    modal: document.getElementById('gameModal'),
    form: document.getElementById('gameForm'),
    modalTitle: document.getElementById('modalTitle'),
    inputGameName: document.getElementById('inputGameName'),
    apiResults: document.getElementById('apiResults'),
    inputStatus: document.getElementById('inputStatus'),
    soldGroup: document.getElementById('soldGroup'),
    btnDelete: document.getElementById('btnDeleteGame')
};

// --- INIT ---
const init = async () => {
    // Verifica Login
    const { data } = await Auth.getSession();
    if (data?.session) handleUserAuth(data.session.user);
    else DOM.loginOverlay.classList.remove('hidden');

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) handleUserAuth(session.user);
        else if (event === 'SIGNED_OUT') window.location.reload();
    });

    setupEventListeners();
};

const handleUserAuth = async (user) => {
    state.user = user;
    DOM.loginOverlay.classList.add('hidden');
    DOM.appContainer.classList.remove('hidden');
    await loadUserLibrary();
};

const loadUserLibrary = async () => {
    DOM.gamesContainer.innerHTML = '<div class="spinner"></div>';
    try {
        state.games = await DB.getGames();
        refreshApp();
    } catch (e) {
        console.error(e);
        alert("Erro ao carregar jogos.");
    }
};

const refreshApp = () => {
    // Filtros
    let filtered = state.games;
    
    // 1. Aba
    if (state.currentTab === 'collection') filtered = filtered.filter(g => g.status !== 'Vendido');
    else filtered = filtered.filter(g => g.status === 'Vendido');

    // 2. Busca
    filtered = filtered.filter(item => {
        const nome = item.jogo || item.nome || '';
        return nome.toLowerCase().includes(state.search.toLowerCase()) &&
               (state.platformFilter === 'all' || item.plataforma === state.platformFilter);
    });

    // Render
    renderKPIs(state.games.filter(g=>g.status!=='Vendido'), state.games.filter(g=>g.status==='Vendido'));
    populateFilters(state.games);
    renderGrid(filtered, state.currentTab === 'sold');
};

// --- API RAWG (Busca de Jogos) ---
const searchRawgGames = async (query) => {
    if (query.length < 3) {
        DOM.apiResults.classList.add('hidden');
        return;
    }
    
    try {
        const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${query}&page_size=5`);
        const data = await res.json();
        renderApiResults(data.results);
    } catch (e) {
        console.error("Erro RAWG:", e);
    }
};

const renderApiResults = (games) => {
    DOM.apiResults.innerHTML = '';
    if (!games.length) return;

    games.forEach(game => {
        const div = document.createElement('div');
        div.className = 'api-item';
        div.innerHTML = `
            <img src="${game.background_image || ''}" class="api-thumb">
            <div>
                <div style="font-weight:bold">${game.name}</div>
                <div style="font-size:0.7rem; color:#888">${game.released ? game.released.substring(0,4) : ''}</div>
            </div>
        `;
        div.onclick = () => selectApiGame(game);
        DOM.apiResults.appendChild(div);
    });
    DOM.apiResults.classList.remove('hidden');
};

const selectApiGame = (game) => {
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image;
    DOM.apiResults.classList.add('hidden');
};

// --- MODAL & CRUD ACTIONS ---
const openModal = (game = null) => {
    DOM.modal.classList.remove('hidden');
    DOM.form.reset();
    DOM.apiResults.classList.add('hidden');
    DOM.soldGroup.classList.add('hidden');

    if (game) {
        // MODO EDIÇÃO
        state.editingId = game.id;
        DOM.modalTitle.innerText = "Editar Jogo";
        DOM.btnDelete.classList.remove('hidden');
        
        // Preencher campos
        document.getElementById('inputGameName').value = game.jogo || game.nome;
        document.getElementById('inputPlatform').value = game.plataforma;
        document.getElementById('inputPrice').value = game.preco;
        document.getElementById('inputStatus').value = game.status;
        document.getElementById('inputImage').value = game.imagem || ''; // Supondo coluna imagem
        
        if(game.status === 'Vendido') {
            DOM.soldGroup.classList.remove('hidden');
            document.getElementById('inputSoldPrice').value = game.vendido;
        }
    } else {
        // MODO CRIAÇÃO
        state.editingId = null;
        DOM.modalTitle.innerText = "Adicionar Jogo";
        DOM.btnDelete.classList.add('hidden');
    }
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const formData = {
        jogo: document.getElementById('inputGameName').value,
        plataforma: document.getElementById('inputPlatform').value,
        preco: document.getElementById('inputPrice').value,
        status: document.getElementById('inputStatus').value,
        imagem: document.getElementById('inputImage').value, // Novo campo
        vendido: document.getElementById('inputSoldPrice').value
    };

    // Calcula lucro simples se vendido
    if (formData.status === 'Vendido') {
        formData.lucro = (parseFloat(formData.vendido) - parseFloat(formData.preco)).toFixed(2);
    }

    try {
        if (state.editingId) {
            await DB.updateGame(state.editingId, formData);
        } else {
            await DB.addGame(formData, state.user.id);
        }
        DOM.modal.classList.add('hidden');
        loadUserLibrary();
    } catch (err) {
        alert("Erro ao salvar: " + err.message);
    }
};

// --- EVENT LISTENERS ---
const setupEventListeners = () => {
    // Busca API (Debounce manual simples)
    let timeout;
    DOM.inputGameName.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchRawgGames(e.target.value), 500);
    });

    // Abrir Modal de Adição
    document.getElementById('btnOpenAddModal').addEventListener('click', () => openModal());

    // Fechar Modal
    document.getElementById('btnCloseModal').addEventListener('click', () => DOM.modal.classList.add('hidden'));

    // Toggle campo de venda
    DOM.inputStatus.addEventListener('change', (e) => {
        if(e.target.value === 'Vendido') DOM.soldGroup.classList.remove('hidden');
        else DOM.soldGroup.classList.add('hidden');
    });

    // Submit Form
    DOM.form.addEventListener('submit', handleFormSubmit);

    // Delete Button
    DOM.btnDelete.addEventListener('click', async () => {
        if(confirm("Tem certeza que quer excluir este jogo?")) {
            await DB.deleteGame(state.editingId);
            DOM.modal.classList.add('hidden');
            loadUserLibrary();
        }
    });

    // Clique no Card para Editar (Delegação de Evento)
    DOM.gamesContainer.addEventListener('click', (e) => {
        // Procura o card pai
        const card = e.target.closest('.game-card');
        if (card) {
            // Acha o objeto do jogo pelo titulo (ou idealmente ID data attribute)
            const title = card.querySelector('.game-title').innerText;
            const game = state.games.find(g => (g.jogo || g.nome) === title);
            if(game) openModal(game);
        }
    });

    // Login/Logout...
    if(DOM.btnGoogle) DOM.btnGoogle.addEventListener('click', () => Auth.signInWithProvider('google'));
    document.getElementById('btnLogout').addEventListener('click', () => Auth.signOut());
    
    // Filtros
    document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value; refreshApp(); });
    document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.currentTab = e.target.dataset.tab;
        refreshApp();
    }));
};

document.addEventListener('DOMContentLoaded', init);