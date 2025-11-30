import { supabase, AuthService } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

// --- INICIALIZAÇÃO ---
const init = async () => {
    console.log("🚀 GameVault Pro Iniciado");

    appStore.subscribe(renderApp);

    // Listener de Autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        const loader = document.getElementById('globalLoader');
        
        try {
            if (session?.user) {
                console.log("✅ Usuário logado:", session.user.email);
                // 1. TIRA A TELA PRETA IMEDIATAMENTE
                if (loader) loader.classList.add('hidden');
                
                // 2. Carrega a Interface
                await handleUserLoggedIn(session.user);
            } else {
                handleUserLoggedOut();
                if (loader) loader.classList.add('hidden');
            }
        } catch (error) {
            console.error("Erro crítico:", error);
            if (loader) loader.classList.add('hidden'); // Garante que sai do loader mesmo com erro
        }
    });

    setupEvents();
};

const handleUserLoggedIn = async (user) => {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    // Header Info
    const nameEl = document.getElementById('userName');
    const imgEl = document.getElementById('userAvatar');
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0];
    
    if (nameEl) nameEl.innerText = fullName;
    if (imgEl && user.user_metadata?.avatar_url) {
        imgEl.src = user.user_metadata.avatar_url;
        imgEl.style.display = 'block';
    }

    appStore.setState({ user });
    
    // Carrega dados em background (sem travar a tela)
    loadData(); 
};

const handleUserLoggedOut = () => {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    appStore.reset();
};

const loadData = async () => {
    console.log("⏳ Buscando jogos...");
    try {
        const games = await GameService.fetchGames();
        console.log("📦 Jogos carregados:", games.length);
        appStore.setState({ games });
    } catch (err) {
        console.error("❌ Erro ao buscar jogos:", err);
        // Mostra erro visual para o usuário
        showToast("Erro no Banco de Dados. Você rodou o SQL?", "error");
        
        // Remove mensagem de "Nenhum jogo" e põe aviso
        const grid = document.getElementById('gamesContainer');
        if(grid) grid.innerHTML = `<div style="text-align:center; padding:40px; color:#ff4444">
            <i class="fa-solid fa-database fa-2x"></i><br><br>
            Tabela 'games' não encontrada ou erro de conexão.<br>
            Verifique o passo SQL no Supabase.
        </div>`;
    }
};

// --- EVENTOS (Setup padrão) ---
const setupEvents = () => {
    const safeClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
    };

    safeClick('btnGoogle', async () => {
        await AuthService.signInGoogle();
    });
    safeClick('btnLogout', AuthService.signOut);
    safeClick('btnOpenAddModal', () => openGameModal());
    safeClick('btnCloseModal', () => toggleModal(false));
    safeClick('btnDeleteGame', handleDelete);

    const gameModal = document.getElementById('gameModal');
    if (gameModal) {
        gameModal.onclick = (e) => {
            if (e.target.id === 'gameModal') toggleModal(false);
        };
    }

    const form = document.getElementById('gameForm');
    if (form) form.onsubmit = handleFormSubmit;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appStore.setState({ filter: e.target.dataset.tab });
        };
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.oninput = (e) => appStore.setState({ searchTerm: e.target.value });

    // API Search Logic
    let timeout;
    const apiResults = document.getElementById('apiResults');
    const inputGameName = document.getElementById('inputGameName');
    
    if (inputGameName) {
        inputGameName.oninput = (e) => {
            const query = e.target.value;
            clearTimeout(timeout);
            if (query.length < 3) {
                if(apiResults) apiResults.classList.add('hidden');
                return;
            }
            if(apiResults) {
                apiResults.classList.remove('hidden');
                apiResults.innerHTML = '<div style="padding:15px;text-align:center;color:#666">Digitando...</div>';
            }
            timeout = setTimeout(async () => {
                try {
                    const results = await GameService.searchRawg(query);
                    renderApiResults(results);
                } catch (e) { console.error(e); }
            }, 600);
        };
    }

    const inputStatus = document.getElementById('inputStatus');
    if (inputStatus) {
        inputStatus.onchange = (e) => {
            const group = document.getElementById('soldGroup');
            if (e.target.value === 'Vendido') group.classList.remove('hidden');
            else group.classList.add('hidden');
        };
    }
};

// --- MODAIS & FORMS ---
let editingId = null;
window.editGame = (id) => openGameModal(id);

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    form.reset();
    editingId = gameId;
    
    document.getElementById('apiResults').classList.add('hidden');
    document.getElementById('soldGroup').classList.add('hidden');
    
    const select = document.getElementById('inputPlatform');
    select.innerHTML = '';

    if (gameId) {
        const game = appStore.get().games.find(g => g.id === gameId);
        if (!game) return;

        document.getElementById('modalTitle').innerText = "Editar Jogo";
        document.getElementById('btnDeleteGame').classList.remove('hidden');
        document.getElementById('inputGameName').value = game.title;
        
        const opt = document.createElement('option');
        opt.value = game.platform;
        opt.innerText = game.platform;
        select.appendChild(opt);
        
        document.getElementById('inputPrice').value = game.price_paid;
        document.getElementById('inputStatus').value = game.status;
        document.getElementById('inputImage').value = game.image_url;
        
        if (game.status === 'Vendido') {
            document.getElementById('soldGroup').classList.remove('hidden');
            document.getElementById('inputSoldPrice').value = game.price_sold;
        }
    } else {
        document.getElementById('modalTitle').innerText = "Novo Jogo";
        document.getElementById('btnDeleteGame').classList.add('hidden');
        select.innerHTML = '<option value="" disabled selected>Busque o nome do jogo...</option>';
    }
    toggleModal(true);
};

const renderApiResults = (games) => {
    const container = document.getElementById('apiResults');
    container.innerHTML = '';
    if(!games.length) {
        container.innerHTML = '<div style="padding:10px;text-align:center">Sem resultados</div>';
        return;
    }
    games.forEach(g => {
        const div = document.createElement('div');
        div.className = 'api-item';
        div.innerHTML = `<img src="${g.background_image||''}" width="40"> <strong>${g.name}</strong>`;
        div.onclick = () => selectApiGame(g);
        container.appendChild(div);
    });
};

const selectApiGame = (game) => {
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    const select = document.getElementById('inputPlatform');
    select.innerHTML = '';
    if(game.platforms) {
        game.platforms.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.platform.name;
            opt.innerText = p.platform.name;
            select.appendChild(opt);
        });
        select.selectedIndex = 0;
    }
    document.getElementById('apiResults').classList.add('hidden');
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const oldText = btn.innerText;
    btn.innerText = "..."; btn.disabled = true;

    try {
        const data = {
            title: document.getElementById('inputGameName').value,
            platform: document.getElementById('inputPlatform').value || 'Outros',
            status: document.getElementById('inputStatus').value,
            price_paid: document.getElementById('inputPrice').value,
            price_sold: document.getElementById('inputSoldPrice').value,
            image_url: document.getElementById('inputImage').value
        };

        if (editingId) await GameService.updateGame(editingId, data);
        else await GameService.addGame(data);
        
        showToast("Salvo com sucesso!");
        toggleModal(false);
        loadData();
    } catch (error) {
        showToast("Erro: " + error.message, "error");
    } finally {
        btn.innerText = oldText; btn.disabled = false;
    }
};

const handleDelete = async () => {
    if(confirm("Excluir?")) {
        await GameService.deleteGame(editingId);
        toggleModal(false);
        loadData();
    }
};

document.addEventListener('DOMContentLoaded', init);