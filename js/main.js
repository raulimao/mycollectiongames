import { AuthService, supabase } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

// --- Inicialização ---
const init = async () => {
    console.log("🚀 GameVault v2.0 Starting...");
    
    // 1. Escuta mudanças no Store para renderizar a UI
    appStore.subscribe(renderApp);

    // 2. Auth State Listener (Evita Race Conditions)
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
            document.getElementById('loginOverlay').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');
            document.getElementById('userName').innerText = session.user.email.split('@')[0];
            
            appStore.setState({ user: session.user });
            await loadGames();
        } else {
            document.getElementById('loginOverlay').classList.remove('hidden');
            document.getElementById('appContainer').classList.add('hidden');
        }
    });

    setupEventListeners();
};

const loadGames = async () => {
    try {
        const games = await GameService.fetchGames();
        appStore.setState({ games });
    } catch (error) {
        showToast("Erro ao carregar jogos", "error");
    }
};

// --- Event Handlers ---
const setupEventListeners = () => {
    // Login/Logout
    document.getElementById('btnGoogle').onclick = AuthService.signInGoogle;
    document.getElementById('btnLogout').onclick = AuthService.signOut;

    // Modal Controles
    document.getElementById('btnOpenAddModal').onclick = () => openGameModal();
    document.getElementById('btnCloseModal').onclick = () => toggleModal(false);

    // Form Submit (Adicionar/Editar)
    document.getElementById('gameForm').onsubmit = handleFormSubmit;

    // Busca RAWG
    let debounce;
    document.getElementById('inputGameName').oninput = (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
            const results = await GameService.searchRawg(e.target.value);
            renderApiResults(results);
        }, 500);
    };

    // Filtros de UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appStore.setState({ filter: e.target.dataset.tab });
        };
    });
};

// Lógica de Formulário
let isEditingId = null;

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    form.reset();
    isEditingId = gameId;
    
    if (gameId) {
        const game = appStore.get().games.find(g => g.id === gameId);
        document.getElementById('inputGameName').value = game.title;
        document.getElementById('inputPlatform').value = game.platform;
        document.getElementById('inputPrice').value = game.price_paid;
        document.getElementById('inputStatus').value = game.status;
        document.getElementById('inputImage').value = game.image_url;
        document.getElementById('modalTitle').innerText = "Editar Jogo";
    } else {
        document.getElementById('modalTitle').innerText = "Novo Jogo";
    }
    toggleModal(true);
};

// Global function para o onclick do HTML
window.editGame = (id) => openGameModal(id);

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const formData = {
        title: document.getElementById('inputGameName').value,
        platform: document.getElementById('inputPlatform').value,
        status: document.getElementById('inputStatus').value,
        price_paid: parseFloat(document.getElementById('inputPrice').value) || 0,
        image_url: document.getElementById('inputImage').value
    };

    try {
        if (isEditingId) {
            await GameService.updateGame(isEditingId, formData);
            showToast("Jogo atualizado!");
        } else {
            await GameService.addGame(formData);
            showToast("Jogo adicionado!");
        }
        toggleModal(false);
        loadGames(); // Recarrega para garantir sync
    } catch (err) {
        console.error(err);
        showToast("Erro ao salvar", "error");
    }
};

const renderApiResults = (games) => {
    const container = document.getElementById('apiResults');
    container.innerHTML = '';
    container.classList.remove('hidden');
    
    games.forEach(g => {
        const div = document.createElement('div');
        div.className = 'api-item';
        div.innerHTML = `<img src="${g.background_image}" width="30"> ${g.name}`;
        div.onclick = () => {
            document.getElementById('inputGameName').value = g.name;
            document.getElementById('inputImage').value = g.background_image;
            // Tenta adivinhar plataforma
            if(g.platforms && g.platforms.length > 0) {
                 // Lógica simples para pegar a primeira plataforma principal
                 document.getElementById('inputPlatform').value = g.platforms[0].platform.name; 
            }
            container.classList.add('hidden');
        };
        container.appendChild(div);
    });
};

// Start
document.addEventListener('DOMContentLoaded', init);