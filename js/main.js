import { supabase, AuthService } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

// --- INICIALIZAÇÃO ---
const init = async () => {
    console.log("🚀 GameVault Pro Iniciado");

    // 1. Subscribe UI
    appStore.subscribe(renderApp);

    // 2. Listener Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        const loader = document.getElementById('globalLoader');
        
        if (session?.user) {
            await handleUserLoggedIn(session.user);
        } else {
            handleUserLoggedOut();
        }
        
        // Remove Loader apenas após processar o estado
        if (loader) loader.classList.add('hidden');
    });

    setupEvents();
};

const handleUserLoggedIn = async (user) => {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    // Header Info
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
    appStore.reset();
};

const loadData = async () => {
    try {
        const games = await GameService.fetchGames();
        appStore.setState({ games });
    } catch (err) {
        console.error(err);
        showToast("Erro ao carregar dados.", "error");
    }
};

// --- EVENTOS ---
const setupEvents = () => {
    // Auth
    const btnGoogle = document.getElementById('btnGoogle');
    btnGoogle.onclick = async () => {
        try {
            btnGoogle.innerHTML = '<div class="spinner" style="width:15px;height:15px;border-width:2px"></div> Conectando...';
            await AuthService.signInGoogle();
        } catch (e) {
            btnGoogle.innerHTML = '<i class="fa-brands fa-google"></i> Entrar com Google';
            showToast("Erro no Login: " + e.message, "error");
        }
    };
    
    document.getElementById('btnLogout').onclick = AuthService.signOut;

    // Modais
    document.getElementById('btnOpenAddModal').onclick = () => openGameModal();
    document.getElementById('btnCloseModal').onclick = () => toggleModal(false);
    
    // Fechar modal ao clicar fora
    document.getElementById('gameModal').onclick = (e) => {
        if (e.target.id === 'gameModal') toggleModal(false);
    };

    // Formulário
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

    // Busca Local
    document.getElementById('searchInput').oninput = (e) => {
        appStore.setState({ searchTerm: e.target.value });
    };

    // API RAWG (Debounce)
    let timeout;
    const apiResults = document.getElementById('apiResults');
    
    document.getElementById('inputGameName').oninput = (e) => {
        const query = e.target.value;
        
        clearTimeout(timeout);
        
        if (query.length < 3) {
            apiResults.classList.add('hidden');
            return;
        }

        timeout = setTimeout(async () => {
            apiResults.innerHTML = '<div style="padding:10px;text-align:center;color:#888">Buscando...</div>';
            apiResults.classList.remove('hidden');
            
            const results = await GameService.searchRawg(query);
            renderApiResults(results);
        }, 600);
    };

    // Toggle Status Venda
    document.getElementById('inputStatus').onchange = (e) => {
        const group = document.getElementById('soldGroup');
        if (e.target.value === 'Vendido') group.classList.remove('hidden');
        else group.classList.add('hidden');
    };
};

// --- LÓGICA FORMULÁRIO ---
let editingId = null;

// Disponível globalmente para o onclick do HTML gerado
window.editGame = (id) => openGameModal(id);

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    form.reset();
    editingId = gameId;
    
    const apiContainer = document.getElementById('apiResults');
    apiContainer.classList.add('hidden');
    apiContainer.innerHTML = '';
    
    document.getElementById('soldGroup').classList.add('hidden');
    
    // Reset Select Plataforma
    const select = document.getElementById('inputPlatform');
    select.innerHTML = `
        <option value="">Selecione ou Busque...</option>
        <option value="Nintendo Switch">Nintendo Switch</option>
        <option value="PS5">PS5</option>
        <option value="PS4">PS4</option>
        <option value="Xbox Series">Xbox Series</option>
        <option value="PC">PC</option>
    `;

    if (gameId) {
        // MODO EDIÇÃO
        const game = appStore.get().games.find(g => g.id === gameId);
        if (!game) return;

        document.getElementById('modalTitle').innerText = "Editar Jogo";
        document.getElementById('btnDeleteGame').classList.remove('hidden');

        document.getElementById('inputGameName').value = game.title;
        
        // Garante option da plataforma
        const optionExists = [...select.options].some(o => o.value === game.platform);
        if(!optionExists && game.platform) {
            const opt = document.createElement('option');
            opt.value = game.platform;
            opt.innerText = game.platform;
            select.appendChild(opt);
        }
        select.value = game.platform;

        document.getElementById('inputPrice').value = game.price_paid;
        document.getElementById('inputStatus').value = game.status;
        document.getElementById('inputImage').value = game.image_url;
        
        if (game.status === 'Vendido') {
            document.getElementById('soldGroup').classList.remove('hidden');
            document.getElementById('inputSoldPrice').value = game.price_sold;
        }
    } else {
        // MODO NOVO
        document.getElementById('modalTitle').innerText = "Novo Jogo";
        document.getElementById('btnDeleteGame').classList.add('hidden');
    }
    toggleModal(true);
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const formData = {
        title: document.getElementById('inputGameName').value,
        platform: document.getElementById('inputPlatform').value || 'Outros',
        status: document.getElementById('inputStatus').value,
        price_paid: document.getElementById('inputPrice').value,
        price_sold: document.getElementById('inputSoldPrice').value,
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
        console.error(err);
        showToast("Erro: " + err.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

const handleDelete = async () => {
    if (confirm("Excluir este jogo permanentemente?")) {
        try {
            await GameService.deleteGame(editingId);
            showToast("Jogo excluído.");
            toggleModal(false);
            await loadData();
        } catch (err) {
            showToast("Erro ao excluir", "error");
        }
    }
};

// --- RENDER API RESULTS ---
const renderApiResults = (games) => {
    const container = document.getElementById('apiResults');
    container.innerHTML = '';
    
    if(!games || games.length === 0) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">Nenhum resultado</div>';
        return;
    }

    games.forEach(g => {
        const item = document.createElement('div');
        item.className = 'api-item';
        const year = g.released ? g.released.split('-')[0] : 'N/A';
        
        item.innerHTML = `
            <img src="${g.background_image || ''}" alt="Cover"> 
            <div class="api-info">
                <strong>${g.name}</strong>
                <small>${year}</small>
            </div>
        `;
        item.onclick = () => selectApiGame(g);
        container.appendChild(item);
    });
};

const selectApiGame = (game) => {
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    
    const select = document.getElementById('inputPlatform');
    select.innerHTML = ''; 

    if (game.platforms && game.platforms.length > 0) {
        game.platforms.forEach(p => {
            const option = document.createElement('option');
            option.value = p.platform.name;
            option.innerText = p.platform.name;
            select.appendChild(option);
        });
        select.selectedIndex = 0;
    } else {
        select.innerHTML = '<option value="Outros">Outros</option>';
    }

    document.getElementById('apiResults').classList.add('hidden');
};

document.addEventListener('DOMContentLoaded', init);