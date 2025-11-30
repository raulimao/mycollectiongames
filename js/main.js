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

const init = async () => {
    // Verifica Auth
    currentUser = await DB.auth.getUser();

    if (currentUser) {
        loginOverlay.classList.add('hidden');
        document.getElementById('userArea').classList.remove('hidden');
        document.getElementById('userEmail').innerText = currentUser.email;
        await loadData();
        setupEventListeners();
    } else {
        loginOverlay.classList.remove('hidden');
        setupLoginListener();
    }
};

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

const setupLoginListener = () => {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnLogin');
        const msg = document.getElementById('loginMessage');
        const email = document.getElementById('emailInput').value;

        btn.disabled = true; btn.innerText = "Enviando...";
        
        const { error } = await DB.auth.signIn(email);
        
        if (error) {
            msg.innerText = "Erro: " + error.message;
            msg.className = "login-msg error";
            btn.disabled = false;
        } else {
            msg.innerText = "Link enviado! Verifique seu e-mail.";
            msg.className = "login-msg success";
            msg.classList.remove('hidden');
            btn.innerText = "Verifique o E-mail";
        }
    });
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Salvando...";

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
        if (id) await DB.update({ ...gameObj, id });
        else await DB.add(gameObj);
        
        showToast('Salvo com sucesso!');
        closeModal();
        await loadData();
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar.', 'error');
    } finally {
        btn.disabled = false; btn.innerText = "Salvar na Nuvem";
    }
};

const handleDelete = async (id) => {
    if(confirm('Tem certeza?')) {
        try {
            await DB.delete(id);
            showToast('Item excluído.');
            await loadData();
        } catch (error) {
            showToast('Erro ao excluir.', 'error');
        }
    }
};

// UI Helpers
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

const setupEventListeners = () => {
    document.getElementById('btnLogout').addEventListener('click', DB.auth.signOut);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTab = btn.dataset.tab;
            refreshUI();
        });
    });

    document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value; refreshUI(); });
    document.getElementById('platformFilter').addEventListener('change', (e) => { state.platform = e.target.value; refreshUI(); });

    document.getElementById('btnAddGame').addEventListener('click', () => openModal());
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnCancel').addEventListener('click', closeModal);
    
    statusInput.addEventListener('change', (e) => {
        if(e.target.value === 'Vendido') soldFields.classList.remove('hidden');
        else soldFields.classList.add('hidden');
    });

    form.removeEventListener('submit', handleFormSubmit);
    form.addEventListener('submit', handleFormSubmit);

    // Event Delegation para Grid
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

document.addEventListener('DOMContentLoaded', init);