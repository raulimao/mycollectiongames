import { supabase, AuthService } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

// --- INICIALIZAÇÃO SEGURA ---
const init = async () => {
    console.log("🚀 GameVault Pro Iniciado");

    // 1. Inscrever a UI nas mudanças de estado
    appStore.subscribe(renderApp);

    // 2. Auth Listener (Resolve Race Conditions)
    supabase.auth.onAuthStateChange(async (event, session) => {
        // Remover Loader Global
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('hidden');

        if (session?.user) {
            handleUserLoggedIn(session.user);
        } else {
            handleUserLoggedOut();
        }
    });

    setupEvents();
};

const handleUserLoggedIn = async (user) => {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    // Atualiza Header
    const nameEl = document.getElementById('userName');
    const imgEl = document.getElementById('userAvatar');
    nameEl.innerText = user.user_metadata.full_name || user.email.split('@')[0];
    if(user.user_metadata.avatar_url) {
        imgEl.src = user.user_metadata.avatar_url;
        imgEl.style.display = 'block';
    }

    appStore.setState({ user });
    await loadData();
};

const handleUserLoggedOut = () => {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    appStore.setState({ user: null, games: [] });
};

const loadData = async () => {
    try {
        const games = await GameService.fetchGames();
        appStore.setState({ games });
    } catch (err) {
        console.error(err);
        showToast("Erro ao carregar dados", "error");
    }
};

// --- EVENTOS ---
const setupEvents = () => {
    // Auth
    document.getElementById('btnGoogle').onclick = async () => {
        try {
            document.getElementById('loginMessage').innerText = "Conectando ao Google...";
            await AuthService.signInGoogle();
        } catch (e) {
            showToast("Erro no Login: " + e.message, "error");
        }
    };
    document.getElementById('btnLogout').onclick = AuthService.signOut;

    // Modal
    document.getElementById('btnOpenAddModal').onclick = () => openGameModal();
    document.getElementById('btnCloseModal').onclick = () => toggleModal(false);

    // Form Submit
    document.getElementById('gameForm').onsubmit = handleFormSubmit;
    document.getElementById('btnDeleteGame').onclick = handleDelete;

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appStore.setState({ filter: e.target.dataset.tab });
        };
    });

    // Search
    document.getElementById('searchInput').oninput = (e) => {
        appStore.setState({ searchTerm: e.target.value });
    };

    // API RAWG Debounce
    let timeout;
    document.getElementById('inputGameName').oninput = (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            const results = await GameService.searchRawg(e.target.value);
            renderApiResults(results);
        }, 500);
    };

    // Venda Toggle
    document.getElementById('inputStatus').onchange = (e) => {
        const group = document.getElementById('soldGroup');
        if (e.target.value === 'Vendido') group.classList.remove('hidden');
        else group.classList.add('hidden');
    };
};

// --- LOGICA DE FORMULÁRIO ---
let editingId = null;

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    form.reset();
    editingId = gameId;
    document.getElementById('apiResults').classList.add('hidden');
    document.getElementById('soldGroup').classList.add('hidden');

    if (gameId) {
        // Modo Edição
        const game = appStore.get().games.find(g => g.id === gameId);
        document.getElementById('modalTitle').innerText = "Editar Jogo";
        document.getElementById('btnDeleteGame').classList.remove('hidden');

        document.getElementById('inputGameName').value = game.title;
        document.getElementById('inputPlatform').value = game.platform;
        document.getElementById('inputPrice').value = game.price_paid;
        document.getElementById('inputStatus').value = game.status;
        document.getElementById('inputImage').value = game.image_url;
        
        if (game.status === 'Vendido') {
            document.getElementById('soldGroup').classList.remove('hidden');
            document.getElementById('inputSoldPrice').value = game.price_sold;
        }
    } else {
        // Modo Novo
        document.getElementById('modalTitle').innerText = "Novo Jogo";
        document.getElementById('btnDeleteGame').classList.add('hidden');
    }
    toggleModal(true);
};

// Expor globalmente para o onclick do HTML
window.editGame = (id) => openGameModal(id);

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const formData = {
        title: document.getElementById('inputGameName').value,
        platform: document.getElementById('inputPlatform').value,
        status: document.getElementById('inputStatus').value,
        price_paid: parseFloat(document.getElementById('inputPrice').value) || 0,
        price_sold: parseFloat(document.getElementById('inputSoldPrice').value) || 0,
        image_url: document.getElementById('inputImage').value
    };

    try {
        if (editingId) {
            await GameService.updateGame(editingId, formData);
            showToast("Jogo atualizado!");
        } else {
            await GameService.addGame(formData);
            showToast("Jogo adicionado!");
        }
        toggleModal(false);
        await loadData();
    } catch (err) {
        showToast("Erro: " + err.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

const handleDelete = async () => {
    if (confirm("Tem certeza que deseja excluir este jogo?")) {
        try {
            await GameService.deleteGame(editingId);
            showToast("Jogo excluído");
            toggleModal(false);
            await loadData();
        } catch (err) {
            showToast("Erro ao excluir", "error");
        }
    }
};

const renderApiResults = (games) => {
    const container = document.getElementById('apiResults');
    container.innerHTML = '';
    
    if(!games.length) return container.classList.add('hidden');
    container.classList.remove('hidden');

    games.forEach(g => {
        const item = document.createElement('div');
        item.className = 'api-item';
        item.innerHTML = `
            <img src="${g.background_image}" style="width:30px;height:30px;border-radius:4px;object-fit:cover"> 
            <span>${g.name} (${g.released?.slice(0,4) || 'N/A'})</span>
        `;
        item.onclick = () => {
            document.getElementById('inputGameName').value = g.name;
            document.getElementById('inputImage').value = g.background_image;
            container.classList.add('hidden');
        };
        container.appendChild(item);
    });
};

// Start
document.addEventListener('DOMContentLoaded', init);