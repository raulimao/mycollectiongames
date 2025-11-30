// --- js/main.js ---
import { DB } from './supabase.js';
import { renderGrid, updateKPIs, showToast } from './ui.js';

let appData = [];
let currentUser = null;
const state = {
    currentTab: 'collection',
    search: '',
    platform: 'all'
};

// DOM Elements
const modal = document.getElementById('gameModal');
const form = document.getElementById('gameForm');
const soldFields = document.getElementById('soldFields');
const statusInput = document.getElementById('inputStatus');
const loginOverlay = document.getElementById('loginOverlay');
const userArea = document.getElementById('userArea');
const userEmailSpan = document.getElementById('userEmail');

// --- Inicialização (Correção Mobile) ---
const init = async () => {
    // Escuta ativa: Funciona melhor no mobile pois aguarda o token da URL ser processado
    DB.auth.onStateChange(async (user) => {
        currentUser = user;

        if (currentUser) {
            // --- LOGADO ---
            loginOverlay.classList.add('hidden');
            userArea.classList.remove('hidden');
            userEmailSpan.innerText = currentUser.email;
            
            // Carrega os dados da nuvem
            await loadData();
            
            // Inicia os ouvintes de eventos da interface
            setupEventListeners();
        } else {
            // --- DESLOGADO ---
            loginOverlay.classList.remove('hidden');
            userArea.classList.add('hidden');
            setupLoginListener();
        }
    });
};

// --- Funções de Dados ---
const loadData = async () => {
    showToast('Sincronizando...', 'info');
    appData = await DB.getAll();
    populatePlatformFilter();
    refreshUI();
};

const refreshUI = () => {
    let filtered = appData.filter(item => {
        const isSoldItem = item.status === 'Vendido';
        if (state.currentTab === 'collection' && isSoldItem) return false;
        if (state.currentTab === 'sold' && !isSoldItem) return false;

        const matchText = item.nome.toLowerCase().includes(state.search.toLowerCase());
        const matchPlat = state.platform === 'all' || item.plataforma === state.platform;
        return matchText && matchPlat;
    });

    renderGrid('gamesContainer', filtered);
    updateKPIs(appData);
};

// --- Login Handler ---
const setupLoginListener = () => {
    // Removemos listener anterior para evitar duplicidade caso o init rode 2x
    const loginForm = document.getElementById('loginForm');
    const newLoginForm = loginForm.cloneNode(true);
    loginForm.parentNode.replaceChild(newLoginForm, loginForm);

    newLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnLogin');
        const msg = document.getElementById('loginMessage');
        const email = document.getElementById('emailInput').value;

        btn.disabled = true; 
        btn.innerText = "Enviando...";
        
        const { error } = await DB.auth.signIn(email);
        
        if (error) {
            msg.innerText = "Erro: " + error.message;
            msg.className = "login-msg error";
            btn.disabled = false;
            btn.innerText = "Receber Link Mágico ✨";
        } else {
            msg.innerText = "Link enviado! Verifique seu e-mail.";
            msg.className = "login-msg success";
            msg.classList.remove('hidden');
            btn.innerText = "Verifique o E-mail";
        }
    });
};

// --- CRUD Handlers ---
const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    
    btn.disabled = true; 
    btn.innerText = "Salvando...";

    const id = document.getElementById('gameId').value;
    const status = document.getElementById('inputStatus').value;
    const preco = parseFloat(document.getElementById('inputPrice').value) || 0;
    const vendido = parseFloat(document.getElementById('inputSoldPrice').value) || 0;

    const gameObj = {
        nome: document.getElementById('inputName').value,
        plataforma: document.getElementById('inputPlatform').value,
        tipo: document.getElementById('inputType').value,
        preco: preco,
        status: status,
        vendido: status === 'Vendido' ? vendido : 0,
        imagem: document.getElementById('inputImage').value,
        user_id: currentUser.id
    };

    try {
        if (id) {
            await DB.update({ ...gameObj, id });
            showToast('Jogo atualizado!');
        } else {
            await DB.add(gameObj);
            showToast('Jogo adicionado!');
        }
        
        closeModal();
        await loadData();
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar.', 'error');
    } finally {
        btn.disabled = false; 
        btn.innerText = originalText;
    }
};

const handleDelete = async (id) => {
    if(confirm('Tem certeza que deseja excluir?')) {
        try {
            await DB.delete(id);
            showToast('Item excluído.');
            await loadData();
        } catch (error) {
            showToast('Erro ao excluir.', 'error');
        }
    }
};

// --- UI Helpers ---
const openModal = (item = null) => {
    modal.classList.remove('hidden');
    document.getElementById('modalTitle').innerText = item ? 'Editar Jogo' : 'Novo Jogo';
    form.reset();
    document.getElementById('gameId').value = '';
    
    if (item) {
        document.getElementById('gameId').value = item.id;
        document.getElementById('inputName').value = item.nome;
        document.getElementById('inputPlatform').value = item.plataforma;
        document.getElementById('inputType').value = item.tipo;
        document.getElementById('inputPrice').value = item.preco;
        document.getElementById('inputStatus').value = item.status;
        document.getElementById('inputSoldPrice').value = item.vendido || '';
        document.getElementById('inputImage').value = item.imagem || '';
        
        // Dispara evento para mostrar/esconder campos de venda
        statusInput.dispatchEvent(new Event('change'));
    }
};

const closeModal = () => modal.classList.add('hidden');

const populatePlatformFilter = () => {
    const select = document.getElementById('platformFilter');
    const currentVal = select.value;
    const plats = [...new Set(appData.map(i => i.plataforma))].sort();
    
    select.innerHTML = '<option value="all">Todas as Plataformas</option>';
    plats.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p; opt.textContent = p;
        select.appendChild(opt);
    });
    select.value = currentVal;
};

// --- Event Listeners Globais ---
const setupEventListeners = () => {
    // Logout
    const btnLogout = document.getElementById('btnLogout');
    // Clone para garantir limpezas anteriores
    const newBtnLogout = btnLogout.cloneNode(true);
    btnLogout.parentNode.replaceChild(newBtnLogout, btnLogout);
    newBtnLogout.addEventListener('click', DB.auth.signOut);
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTab = btn.dataset.tab;
            refreshUI();
        });
    });

    // Filtros
    document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value; refreshUI(); });
    document.getElementById('platformFilter').addEventListener('change', (e) => { state.platform = e.target.value; refreshUI(); });

    // Modais
    const btnAdd = document.getElementById('btnAddGame');
    if (btnAdd) btnAdd.addEventListener('click', () => openModal());
    
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnCancel').addEventListener('click', closeModal);
    
    // Controle Campo Venda
    statusInput.addEventListener('change', (e) => {
        if(e.target.value === 'Vendido') soldFields.classList.remove('hidden');
        else soldFields.classList.add('hidden');
    });

    // Form Submit (Evita acumular listeners)
    form.removeEventListener('submit', handleFormSubmit);
    form.addEventListener('submit', handleFormSubmit);

    // Event Delegation para Grid (Edit/Delete)
    const grid = document.getElementById('gamesContainer');
    const newGrid = grid.cloneNode(true);
    grid.parentNode.replaceChild(newGrid, grid);
    
    newGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('btn-edit')) {
            const item = appData.find(i => i.id === id);
            openModal(item);
        } else if (btn.classList.contains('btn-delete')) {
            handleDelete(id);
        }
    });
};

// Iniciar Aplicação
document.addEventListener('DOMContentLoaded', init);