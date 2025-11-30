import { supabase, Auth, DB } from './supabase.js';
import { renderKPIs, renderGrid, showToast } from './ui.js';

// --- CONFIG ---
const RAWG_API_KEY = 'bf9095c524314757b15a99942a202d6b'; // Sua chave limpa

// --- ESTADO ---
const state = {
    user: null,
    games: [],
    tab: 'collection', // 'collection' | 'sold'
    search: '',
    editingId: null
};

// --- DOM ELEMENTS ---
const DOM = {
    loginOverlay: document.getElementById('loginOverlay'),
    appContainer: document.getElementById('appContainer'),
    userName: document.getElementById('userName'),
    modal: document.getElementById('gameModal'),
    form: document.getElementById('gameForm'),
    apiResults: document.getElementById('apiResults'),
    inputPlatform: document.getElementById('inputPlatform'),
    gamesContainer: document.getElementById('gamesContainer')
};

// --- INICIALIZAÇÃO ---
const init = async () => {
    console.log("🚀 Iniciando GameVault...");
    
    // 1. Verifica sessão inicial
    const { data } = await Auth.getSession();
    if (data?.session) {
        handleLogin(data.session.user);
    } else {
        DOM.loginOverlay.classList.remove('hidden');
    }

    // 2. Escuta mudanças de auth (login/logout em outras abas)
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) handleLogin(session.user);
        else if (event === 'SIGNED_OUT') window.location.reload();
    });

    setupEvents();
};

const handleLogin = async (user) => {
    state.user = user;
    DOM.userName.innerText = user.email.split('@')[0]; // Mostra parte do email
    DOM.loginOverlay.classList.add('hidden');
    DOM.appContainer.classList.remove('hidden');
    
    await loadData();
};

const loadData = async () => {
    DOM.gamesContainer.innerHTML = '<div class="spinner"></div>';
    try {
        state.games = await DB.getGames();
        updateUI();
    } catch (err) {
        console.error(err);
        showToast("Erro ao carregar jogos. Verifique o console.", "error");
        DOM.gamesContainer.innerHTML = '';
    }
};

const updateUI = () => {
    // Filtros
    let data = state.games;
    
    // Aba
    if (state.tab === 'collection') data = data.filter(g => g.status !== 'Vendido');
    else data = data.filter(g => g.status === 'Vendido');

    // Busca
    if (state.search) {
        const term = state.search.toLowerCase();
        data = data.filter(g => g.jogo.toLowerCase().includes(term));
    }

    // Render
    renderKPIs(state.games.filter(g=>g.status!=='Vendido'), state.games.filter(g=>g.status==='Vendido'));
    renderGrid(data, state.tab === 'sold');
};

// --- FUNÇÕES DE FORMULÁRIO ---
const openModal = (game = null) => {
    DOM.modal.classList.remove('hidden');
    DOM.form.reset();
    DOM.apiResults.classList.add('hidden');
    document.getElementById('soldGroup').classList.add('hidden');
    
    // Reset Plataformas
    resetPlatforms();

    if (game) {
        // Edição
        state.editingId = game.id;
        document.getElementById('modalTitle').innerText = "Editar Jogo";
        document.getElementById('btnDeleteGame').classList.remove('hidden');
        
        // Popula campos
        document.getElementById('inputGameName').value = game.jogo;
        document.getElementById('inputPrice').value = game.preco;
        document.getElementById('inputStatus').value = game.status;
        
        // Garante plataforma
        ensurePlatformOption(game.plataforma);
        document.getElementById('inputPlatform').value = game.plataforma;

        if (game.status === 'Vendido') {
            document.getElementById('soldGroup').classList.remove('hidden');
            document.getElementById('inputSoldPrice').value = game.vendido;
        }
    } else {
        // Novo
        state.editingId = null;
        document.getElementById('modalTitle').innerText = "Adicionar Jogo";
        document.getElementById('btnDeleteGame').classList.add('hidden');
    }
};

const handleSave = async (e) => {
    e.preventDefault();
    const btn = DOM.form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "Salvando...";

    const formData = {
        jogo: document.getElementById('inputGameName').value,
        plataforma: document.getElementById('inputPlatform').value,
        preco: document.getElementById('inputPrice').value,
        status: document.getElementById('inputStatus').value,
        vendido: document.getElementById('inputSoldPrice').value,
        imagem: document.getElementById('inputImage').value
    };

    try {
        if (state.editingId) {
            await DB.updateGame(state.editingId, formData);
            showToast("Jogo atualizado!");
        } else {
            await DB.addGame(formData, state.user.id);
            showToast("Jogo adicionado!");
        }
        DOM.modal.classList.add('hidden');
        await loadData();
    } catch (err) {
        showToast("Erro ao salvar: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Salvar";
    }
};

// --- API RAWG ---
let timeout;
const searchAPI = (query) => {
    if (query.length < 3) return DOM.apiResults.classList.add('hidden');
    
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
        try {
            const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${query}&page_size=5`);
            const data = await res.json();
            renderApiResults(data.results);
        } catch (e) {
            console.error(e);
        }
    }, 500);
};

const renderApiResults = (games) => {
    DOM.apiResults.innerHTML = '';
    if(!games.length) return DOM.apiResults.classList.add('hidden');
    
    games.forEach(g => {
        const item = document.createElement('div');
        item.className = 'api-item';
        item.innerHTML = `
            <img src="${g.background_image || ''}" class="api-thumb">
            <div><strong>${g.name}</strong> <small>(${g.released?.split('-')[0] || 'N/A'})</small></div>
        `;
        item.onclick = () => selectApiGame(g);
        DOM.apiResults.appendChild(item);
    });
    DOM.apiResults.classList.remove('hidden');
};

const selectApiGame = (game) => {
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    DOM.apiResults.classList.add('hidden');
    
    // Atualiza plataformas dinamicamente
    DOM.inputPlatform.innerHTML = '<option value="">Selecione...</option>';
    if(game.platforms) {
        game.platforms.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.platform.name;
            opt.innerText = p.platform.name;
            DOM.inputPlatform.appendChild(opt);
        });
        if(game.platforms.length > 0) DOM.inputPlatform.selectedIndex = 1; // Seleciona o primeiro
    } else {
        resetPlatforms();
    }
};

// --- HELPERS ---
const resetPlatforms = () => {
    DOM.inputPlatform.innerHTML = `
        <option value="">Selecione...</option>
        <option value="Nintendo Switch">Nintendo Switch</option>
        <option value="PS5">PS5</option>
        <option value="PS4">PS4</option>
        <option value="PC">PC</option>
    `;
};

const ensurePlatformOption = (platName) => {
    const exists = [...DOM.inputPlatform.options].some(o => o.value === platName);
    if (!exists) {
        const opt = document.createElement('option');
        opt.value = platName;
        opt.innerText = platName;
        DOM.inputPlatform.appendChild(opt);
    }
};

// --- EVENTOS ---
const setupEvents = () => {
    // Auth
    document.getElementById('btnGoogle').onclick = Auth.signInGoogle;
    document.getElementById('btnLogout').onclick = Auth.signOut;

    // Modais
    document.getElementById('btnOpenAddModal').onclick = () => openModal();
    document.getElementById('btnCloseModal').onclick = () => DOM.modal.classList.add('hidden');
    DOM.form.onsubmit = handleSave;

    // API Search
    document.getElementById('inputGameName').oninput = (e) => searchAPI(e.target.value);

    // Toggle Venda
    document.getElementById('inputStatus').onchange = (e) => {
        const group = document.getElementById('soldGroup');
        if (e.target.value === 'Vendido') group.classList.remove('hidden');
        else group.classList.add('hidden');
    };

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tab = e.target.dataset.tab;
            updateUI();
        }
    });

    // Delete
    document.getElementById('btnDeleteGame').onclick = async () => {
        if(confirm("Excluir jogo permanentemente?")) {
            await DB.deleteGame(state.editingId);
            showToast("Jogo excluído");
            DOM.modal.classList.add('hidden');
            await loadData();
        }
    };

    // Click no Card (Delegação)
    DOM.gamesContainer.onclick = (e) => {
        const card = e.target.closest('.game-card');
        if (card) {
            const gameData = JSON.parse(card.dataset.game);
            openModal(gameData);
        }
    };
    
    // Busca Local
    document.getElementById('searchInput').oninput = (e) => {
        state.search = e.target.value;
        updateUI();
    };
};

// Start
document.addEventListener('DOMContentLoaded', init);