// --- js/main.js ---
import { DB } from './supabase.js';
import { renderGrid, updateKPIs, showToast } from './ui.js';

let appData = [];
let currentUser = null;
let listenersSetup = false; // Controle para não duplicar eventos

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

// --- Inicialização ---
const init = async () => {
    console.log("Iniciando aplicação...");
    
    // Escuta mudanças na autenticação (Login/Logout/Recarregar)
    DB.auth.onStateChange(async (user) => {
        currentUser = user;
        console.log("Estado Auth alterado. Usuário:", user ? user.email : "Deslogado");

        if (currentUser) {
            // --- LOGADO ---
            // 1. Atualiza UI
            if(loginOverlay) loginOverlay.classList.add('hidden');
            if(userArea) userArea.classList.remove('hidden');
            if(userEmailSpan) userEmailSpan.innerText = currentUser.email;
            
            // 2. Carrega dados
            await loadData();
            
            // 3. Configura eventos (apenas uma vez)
            if (!listenersSetup) {
                setupEventListeners();
                listenersSetup = true;
            }
        } else {
            // --- DESLOGADO ---
            if(loginOverlay) loginOverlay.classList.remove('hidden');
            if(userArea) userArea.classList.add('hidden');
            
            // Configura o form de login
            setupLoginForm();
        }
    });
};

// --- Funções de Dados ---
const loadData = async () => {
    try {
        showToast('Sincronizando...', 'info');
        appData = await DB.getAll();
        
        if (!appData) appData = []; // Garante que é array
        
        populatePlatformFilter();
        refreshUI();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        showToast("Erro de conexão. Verifique o console.", "error");
    }
};

const refreshUI = () => {
    if (!appData) return;

    let filtered = appData.filter(item => {
        const isSoldItem = item.status === 'Vendido';
        if (state.currentTab === 'collection' && isSoldItem) return false;
        if (state.currentTab === 'sold' && !isSoldItem) return false;

        const matchText = item.nome ? item.nome.toLowerCase().includes(state.search.toLowerCase()) : false;
        const matchPlat = state.platform === 'all' || item.plataforma === state.platform;
        return matchText && matchPlat;
    });

    renderGrid('gamesContainer', filtered);
    updateKPIs(appData);
};

// --- Login Handler (Simplificado) ---
const setupLoginForm = () => {
    const loginForm = document.getElementById('loginForm');
    // Remove listener antigo recriando o elemento (seguro aqui pois é modal isolado)
    const newForm = loginForm.cloneNode(true);
    loginForm.parentNode.replaceChild(newForm, loginForm);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnLogin');
        const msg = document.getElementById('loginMessage');
        const email = document.getElementById('emailInput').value;

        btn.disabled = true; 
        btn.innerText = "Enviando...";
        
        const { error } = await DB.auth.signIn(email);
        
        if (error) {
            console.error(error);
            msg.innerText = "Erro: " + error.message;
            msg.className = "login-msg error";
            btn.disabled = false;
            btn.innerText = "Tentar Novamente";
        } else {
            msg.innerText = "Link enviado! Verifique seu e-mail.";
            msg.className = "login-msg success";
            msg.classList.remove('hidden');
            btn.innerText = "Aguardando confirmação...";
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
    const preco = parseFloat(document.getElementById('inputPrice').value) || 0;
    const vendido = parseFloat(document.getElementById('inputSoldPrice').value) || 0;
    const status = document.getElementById('inputStatus').value;

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
        console.error("Erro no submit:", error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    } finally {
        btn.disabled = false; 
        btn.innerText = originalText;
    }
};

const handleDelete = async (id) => {
    if(confirm('Tem certeza que deseja excluir este item?')) {
        try {
            await DB.delete(id);
            showToast('Item excluído.');
            await loadData();
        } catch (error) {
            console.error(error);
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
        statusInput.dispatchEvent(new Event('change'));
    }
};

const closeModal = () => modal.classList.add('hidden');

const populatePlatformFilter = () => {
    const select = document.getElementById('platformFilter');
    if (!select) return;

    const currentVal = select.value;
    // Proteção contra dados vazios ou sem plataforma
    const validData = appData.filter(i => i.plataforma); 
    const plats = [...new Set(validData.map(i => i.plataforma))].sort();
    
    select.innerHTML = '<option value="all">Todas as Plataformas</option>';
    plats.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p; opt.textContent = p;
        select.appendChild(opt);
    });
    select.value = currentVal;
};

// --- Setup Global de Eventos (Executa apenas uma vez) ---
const setupEventListeners = () => {
    console.log("Configurando listeners globais...");

    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.onclick = () => DB.auth.signOut();
    }
    
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
    const searchInput = document.getElementById('searchInput');
    if(searchInput) searchInput.addEventListener('input', (e) => { state.search = e.target.value; refreshUI(); });
    
    const platformFilter = document.getElementById('platformFilter');
    if(platformFilter) platformFilter.addEventListener('change', (e) => { state.platform = e.target.value; refreshUI(); });

    // Modais
    const btnAdd = document.getElementById('btnAddGame');
    if (btnAdd) btnAdd.onclick = () => openModal();
    
    const btnClose = document.getElementById('btnCloseModal');
    if(btnClose) btnClose.onclick = closeModal;
    
    const btnCancel = document.getElementById('btnCancel');
    if(btnCancel) btnCancel.onclick = closeModal;
    
    // Campo Venda
    if(statusInput) {
        statusInput.addEventListener('change', (e) => {
            if(e.target.value === 'Vendido') soldFields.classList.remove('hidden');
            else soldFields.classList.add('hidden');
        });
    }

    // Form Submit
    if(form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Grid Actions (Delegation)
    const grid = document.getElementById('gamesContainer');
    if(grid) {
        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;
            
            if (btn.classList.contains('btn-edit')) {
                const item = appData.find(i => i.id === id);
                if(item) openModal(item);
            } else if (btn.classList.contains('btn-delete')) {
                handleDelete(id);
            }
        });
    }
};

// Iniciar Aplicação
document.addEventListener('DOMContentLoaded', init);