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
    editingId: null
};

const DOM = {
    loginOverlay: document.getElementById('loginOverlay'),
    appContainer: document.getElementById('appContainer'),
    btnGoogle: document.getElementById('btnGoogle'),
    gamesContainer: document.getElementById('gamesContainer'),
    
    // Modal & Form
    modal: document.getElementById('gameModal'),
    form: document.getElementById('gameForm'),
    modalTitle: document.getElementById('modalTitle'),
    inputGameName: document.getElementById('inputGameName'),
    inputPlatform: document.getElementById('inputPlatform'), // Select de Plataforma
    apiResults: document.getElementById('apiResults'),
    inputStatus: document.getElementById('inputStatus'),
    soldGroup: document.getElementById('soldGroup'),
    btnDelete: document.getElementById('btnDeleteGame')
};

// --- INIT ---
const init = async () => {
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
    }
};

const refreshApp = () => {
    let filtered = state.games;
    
    // Filtro Aba
    if (state.currentTab === 'collection') filtered = filtered.filter(g => g.status !== 'Vendido');
    else filtered = filtered.filter(g => g.status === 'Vendido');

    // Filtro Busca
    filtered = filtered.filter(item => {
        const nome = item.jogo || item.nome || '';
        return nome.toLowerCase().includes(state.search.toLowerCase()) &&
               (state.platformFilter === 'all' || item.plataforma === state.platformFilter);
    });

    renderKPIs(state.games.filter(g=>g.status!=='Vendido'), state.games.filter(g=>g.status==='Vendido'));
    populateFilters(state.games);
    renderGrid(filtered, state.currentTab === 'sold');
};

// --- API RAWG (Busca Inteligente) ---
const searchRawgGames = async (query) => {
    if (query.length < 3) {
        DOM.apiResults.classList.add('hidden');
        return;
    }
    
    try {
        // Busca jogo e inclui info de plataformas (parent_platforms)
        const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${query}&page_size=5`;
        const res = await fetch(url);
        
        if (res.status === 401) {
            console.error("ERRO 401: Chave de API inválida. Verifique o main.js");
            DOM.apiResults.innerHTML = '<div style="padding:10px; color:red">Erro na API Key</div>';
            DOM.apiResults.classList.remove('hidden');
            return;
        }

        const data = await res.json();
        renderApiResults(data.results);
    } catch (e) {
        console.error("Erro RAWG:", e);
    }
};

const renderApiResults = (games) => {
    DOM.apiResults.innerHTML = '';
    if (!games || !games.length) return;

    games.forEach(game => {
        const div = document.createElement('div');
        div.className = 'api-item';
        // Pega o ano de lançamento
        const year = game.released ? game.released.split('-')[0] : 'N/A';
        
        div.innerHTML = `
            <img src="${game.background_image || ''}" class="api-thumb">
            <div>
                <div style="font-weight:bold">${game.name}</div>
                <div style="font-size:0.7rem; color:#888">${year} • ${game.platforms?.length || 0} Plataformas</div>
            </div>
        `;
        // Passa o objeto COMPLETO do jogo para a função de seleção
        div.onclick = () => selectApiGame(game);
        DOM.apiResults.appendChild(div);
    });
    DOM.apiResults.classList.remove('hidden');
};

// --- AQUI ACONTECE A MÁGICA DAS PLATAFORMAS ---
const selectApiGame = (game) => {
    // 1. Preenche Nome e Imagem
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    
    // 2. Limpa o select de plataformas atual
    DOM.inputPlatform.innerHTML = '';
    
    // 3. Adiciona opção padrão
    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.innerText = "Selecione a versão...";
    DOM.inputPlatform.appendChild(defaultOption);

    // 4. Preenche APENAS com as plataformas que o jogo tem
    if (game.platforms && game.platforms.length > 0) {
        game.platforms.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.platform.name; // Ex: "PlayStation 5"
            opt.innerText = p.platform.name;
            DOM.inputPlatform.appendChild(opt);
        });
        
        // Se só tiver UMA plataforma (exclusivo), seleciona automaticamente
        if (game.platforms.length === 1) {
            DOM.inputPlatform.value = game.platforms[0].platform.name;
        } else {
            // Tenta focar no select para o usuário escolher
            DOM.inputPlatform.focus();
        }
    } else {
        // Fallback se a API não trouxer plataformas (raro)
        const opt = document.createElement('option');
        opt.value = "Outros";
        opt.innerText = "Outros / Genérico";
        DOM.inputPlatform.appendChild(opt);
    }

    DOM.apiResults.classList.add('hidden');
};

// --- MODAL ACTIONS ---
const openModal = (game = null) => {
    DOM.modal.classList.remove('hidden');
    DOM.form.reset();
    DOM.apiResults.classList.add('hidden');
    DOM.soldGroup.classList.add('hidden');
    
    // Restaura lista padrão de plataformas se for novo jogo manual
    if (!game) {
        resetPlatformOptions(); 
    }

    if (game) {
        // MODO EDIÇÃO
        state.editingId = game.id;
        DOM.modalTitle.innerText = "Editar Jogo";
        DOM.btnDelete.classList.remove('hidden');
        
        document.getElementById('inputGameName').value = game.jogo || game.nome;
        
        // Garante que a plataforma do jogo exista no select (caso tenha sido importada ou editada)
        // Se não existir na lista padrão, cria ela na hora
        const exists = [...DOM.inputPlatform.options].some(o => o.value === game.plataforma);
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = game.plataforma;
            opt.innerText = game.plataforma;
            DOM.inputPlatform.appendChild(opt);
        }
        DOM.inputPlatform.value = game.plataforma;

        document.getElementById('inputPrice').value = game.preco;
        document.getElementById('inputStatus').value = game.status;
        document.getElementById('inputImage').value = game.imagem || '';
        
        if(game.status === 'Vendido') {
            DOM.soldGroup.classList.remove('hidden');
            document.getElementById('inputSoldPrice').value = game.vendido;
        }
    } else {
        state.editingId = null;
        DOM.modalTitle.innerText = "Adicionar Jogo";
        DOM.btnDelete.classList.add('hidden');
    }
};

// Restaura as plataformas genéricas caso o usuário queira digitar manualmente sem buscar na API
const resetPlatformOptions = () => {
    DOM.inputPlatform.innerHTML = `
        <option value="">Selecione...</option>
        <option value="Nintendo Switch">Nintendo Switch</option>
        <option value="PlayStation 5">PlayStation 5</option>
        <option value="PlayStation 4">PlayStation 4</option>
        <option value="Xbox Series X/S">Xbox Series X/S</option>
        <option value="PC">PC</option>
        <option value="Retro">Retro / Outros</option>
    `;
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const formData = {
        jogo: document.getElementById('inputGameName').value,
        plataforma: document.getElementById('inputPlatform').value,
        preco: document.getElementById('inputPrice').value,
        status: document.getElementById('inputStatus').value,
        imagem: document.getElementById('inputImage').value,
        vendido: document.getElementById('inputSoldPrice').value
    };

    if (formData.status === 'Vendido') {
        formData.lucro = (parseFloat(formData.vendido) - parseFloat(formData.preco)).toFixed(2);
    }

    try {
        // Feedback visual
        const btn = DOM.form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.innerText = "Salvando...";
        btn.disabled = true;

        if (state.editingId) {
            await DB.updateGame(state.editingId, formData);
        } else {
            await DB.addGame(formData, state.user.id);
        }
        
        DOM.modal.classList.add('hidden');
        loadUserLibrary();
    } catch (err) {
        alert("Erro ao salvar: " + err.message);
    } finally {
        const btn = DOM.form.querySelector('button[type="submit"]');
        btn.innerText = "Salvar Jogo";
        btn.disabled = false;
    }
};

// --- LISTENERS ---
const setupEventListeners = () => {
    let timeout;
    DOM.inputGameName.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchRawgGames(e.target.value), 500);
    });

    document.getElementById('btnOpenAddModal').addEventListener('click', () => openModal());
    document.getElementById('btnCloseModal').addEventListener('click', () => DOM.modal.classList.add('hidden'));

    DOM.inputStatus.addEventListener('change', (e) => {
        if(e.target.value === 'Vendido') DOM.soldGroup.classList.remove('hidden');
        else DOM.soldGroup.classList.add('hidden');
    });

    DOM.form.addEventListener('submit', handleFormSubmit);

    DOM.btnDelete.addEventListener('click', async () => {
        if(confirm("Tem certeza que quer excluir este jogo?")) {
            await DB.deleteGame(state.editingId);
            DOM.modal.classList.add('hidden');
            loadUserLibrary();
        }
    });

    DOM.gamesContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.game-card');
        if (card) {
            const title = card.querySelector('.game-title').innerText;
            const game = state.games.find(g => (g.jogo || g.nome) === title);
            if(game) openModal(game);
        }
    });

    if(DOM.btnGoogle) DOM.btnGoogle.addEventListener('click', () => Auth.signInWithProvider('google'));
    if(document.getElementById('btnGithub')) document.getElementById('btnGithub').addEventListener('click', () => Auth.signInWithProvider('github'));
    document.getElementById('btnLogout').addEventListener('click', () => Auth.signOut());
    
    document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value; refreshApp(); });
    document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.currentTab = e.target.dataset.tab;
        refreshApp();
    }));
    document.getElementById('platformSelect').addEventListener('change', (e) => { state.platformFilter = e.target.value; refreshApp(); });
};

document.addEventListener('DOMContentLoaded', init);