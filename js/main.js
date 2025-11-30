import { Storage } from './storage.js';
import { renderGrid, updateKPIs, showToast } from './ui.js';

// --- Estado Global ---
let appData = [];
const state = {
    currentTab: 'collection', // 'collection' | 'sold'
    search: '',
    platform: 'all'
};

// --- DOM Elements ---
const modal = document.getElementById('gameModal');
const form = document.getElementById('gameForm');
const soldFields = document.getElementById('soldFields');
const statusInput = document.getElementById('inputStatus');

// --- Inicialização ---
const init = () => {
    appData = Storage.getAll();
    refreshUI();
    setupEventListeners();
};

// --- Core Logic ---
const refreshUI = () => {
    // 1. Filtrar dados baseados na aba e inputs
    let filtered = appData.filter(item => {
        // Aba Coleção: mostra tudo MENOS vendidos. Aba Histórico: SÓ vendidos.
        const isSoldItem = item.status === 'Vendido';
        if (state.currentTab === 'collection' && isSoldItem) return false;
        if (state.currentTab === 'sold' && !isSoldItem) return false;

        // Filtros de texto e plataforma
        const matchText = item.jogo.toLowerCase().includes(state.search.toLowerCase());
        const matchPlat = state.platform === 'all' || item.plataforma === state.platform;
        
        return matchText && matchPlat;
    });

    // 2. Renderizar
    renderGrid('gamesContainer', filtered);
    updateKPIs(appData); // KPIs olham para o todo
    populatePlatformFilter();
};

// Popula dropdown de filtro dinamicamente
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

// --- Modal & Form Actions ---
const openModal = (item = null) => {
    modal.classList.remove('hidden');
    document.getElementById('modalTitle').innerText = item ? 'Editar Jogo' : 'Novo Jogo';
    
    // Reset form
    form.reset();
    document.getElementById('gameId').value = '';

    if (item) {
        // Preencher formulário
        document.getElementById('gameId').value = item.id;
        document.getElementById('inputName').value = item.jogo;
        document.getElementById('inputPlatform').value = item.plataforma;
        document.getElementById('inputType').value = item.tipo;
        document.getElementById('inputPrice').value = item.preco;
        document.getElementById('inputStatus').value = item.status;
        document.getElementById('inputSoldPrice').value = item.vendido || '';
        document.getElementById('inputImage').value = item.imagem || '';
        
        // Disparar evento para mostrar campos de venda se necessário
        statusInput.dispatchEvent(new Event('change'));
    }
};

const closeModal = () => modal.classList.add('hidden');

const handleFormSubmit = (e) => {
    e.preventDefault();
    
    const id = document.getElementById('gameId').value;
    const status = document.getElementById('inputStatus').value;
    const preco = parseFloat(document.getElementById('inputPrice').value) || 0;
    const vendido = parseFloat(document.getElementById('inputSoldPrice').value) || 0;

    const newItem = {
        id: id || Date.now().toString(36), // Gera ID se for novo
        jogo: document.getElementById('inputName').value,
        plataforma: document.getElementById('inputPlatform').value,
        tipo: document.getElementById('inputType').value,
        preco: preco,
        status: status,
        vendido: status === 'Vendido' ? vendido : 0,
        lucro: status === 'Vendido' ? (vendido - preco) : 0,
        imagem: document.getElementById('inputImage').value
    };

    appData = Storage.saveItem(newItem);
    refreshUI();
    closeModal();
    showToast('Jogo salvo com sucesso!');
};

const handleDelete = (id) => {
    if(confirm('Tem certeza que deseja excluir este item?')) {
        appData = Storage.deleteItem(id);
        refreshUI();
        showToast('Item removido.', 'error');
    }
};

// --- Event Listeners ---
const setupEventListeners = () => {
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
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.search = e.target.value;
        refreshUI();
    });
    document.getElementById('platformFilter').addEventListener('change', (e) => {
        state.platform = e.target.value;
        refreshUI();
    });

    // Modal - Abrir/Fechar
    document.getElementById('btnAddGame').addEventListener('click', () => openModal());
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnCancel').addEventListener('click', closeModal);
    
    // Mostrar campo de venda se status for "Vendido"
    statusInput.addEventListener('change', (e) => {
        if(e.target.value === 'Vendido') soldFields.classList.remove('hidden');
        else soldFields.classList.add('hidden');
    });

    // Form Submit
    form.addEventListener('submit', handleFormSubmit);

    // Grid Actions (Edit/Delete - Event Delegation)
    document.getElementById('gamesContainer').addEventListener('click', (e) => {
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

// Start
document.addEventListener('DOMContentLoaded', init);