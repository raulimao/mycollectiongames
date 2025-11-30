import { supabase, AuthService } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

const init = async () => {
    console.log("🚀 GameVault Pro Iniciado");
    appStore.subscribe(renderApp);

    // 1. VERIFICAÇÃO DE ROTA (Link Compartilhado?)
    const urlParams = new URLSearchParams(window.location.search);
    const sharedProfileId = urlParams.get('profile');

    if (sharedProfileId) {
        // --- MODO VISITANTE (LINK COMPARTILHADO) ---
        console.log("👀 Visitando perfil:", sharedProfileId);
        appStore.setState({ isSharedMode: true });
        
        // Esconde telas de login e carrega app direto
        document.getElementById('globalLoader').classList.add('hidden');
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');

        // Ajusta Header
        document.querySelector('.user-profile').innerHTML = `
            <a href="index.html" class="btn-small" style="border-color:var(--primary); color:var(--primary)">
                <i class="fa-solid fa-right-to-bracket"></i> MEU LOGIN
            </a>
        `;
        document.querySelector('.logo h1').innerHTML = `VAULT <small style="font-size:0.4em; color:var(--success)">VISITANTE</small>`;

        await loadSharedData(sharedProfileId);

    } else {
        // --- MODO NORMAL (LOGIN) ---
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            const loader = document.getElementById('globalLoader');
            try {
                if (session?.user) {
                    if (loader) loader.classList.add('hidden');
                    await handleUserLoggedIn(session.user);
                } else {
                    handleUserLoggedOut();
                    if (loader) loader.classList.add('hidden');
                }
            } catch (error) {
                console.error("Erro crítico:", error);
                if (loader) loader.classList.add('hidden');
            }
        });
    }

    setupEvents();
};

// --- MODO LOGIN ---
const handleUserLoggedIn = async (user) => {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    const nameEl = document.getElementById('userName');
    const imgEl = document.getElementById('userAvatar');
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0];
    
    if (nameEl) nameEl.innerText = fullName;
    if (imgEl && user.user_metadata?.avatar_url) {
        imgEl.src = user.user_metadata.avatar_url;
        imgEl.style.display = 'block';
    }

    // Adiciona botão de compartilhar no Header
    addShareButton(user.id);

    appStore.setState({ user, isSharedMode: false });
    loadData(); 
};

const handleUserLoggedOut = () => {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    appStore.reset();
};

const addShareButton = (userId) => {
    const profileDiv = document.querySelector('.user-profile');
    // Verifica se já existe para não duplicar
    if(document.getElementById('btnShareProfile')) return;

    const btnShare = document.createElement('button');
    btnShare.id = 'btnShareProfile';
    btnShare.className = 'btn-small';
    btnShare.style.marginRight = '10px';
    btnShare.style.borderColor = 'var(--secondary)';
    btnShare.style.color = 'var(--secondary)';
    btnShare.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
    btnShare.title = "Copiar link do meu perfil";
    
    btnShare.onclick = () => {
        const url = `${window.location.origin}${window.location.pathname}?profile=${userId}`;
        navigator.clipboard.writeText(url).then(() => {
            showToast("Link do perfil copiado!", "success");
        });
    };

    profileDiv.prepend(btnShare);
};

// --- DATA LOADERS ---
const loadData = async () => {
    try {
        const games = await GameService.fetchGames();
        appStore.setState({ games });
    } catch (err) {
        console.error(err);
        showToast("Erro ao carregar dados.", "error");
    }
};

const loadSharedData = async (userId) => {
    try {
        const games = await GameService.fetchSharedGames(userId);
        appStore.setState({ games });
        showToast("Visualizando coleção compartilhada");
    } catch (err) {
        console.error(err);
        showToast("Perfil não encontrado ou privado.", "error");
    }
};

// --- EVENTS ---
const setupEvents = () => {
    const safeClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
    };

    safeClick('btnGoogle', async () => await AuthService.signInGoogle());
    safeClick('btnLogout', AuthService.signOut);
    
    // Só ativa eventos de edição se NÃO for compartilhado
    if (!appStore.get().isSharedMode) {
        safeClick('btnOpenAddModal', () => openGameModal());
        safeClick('btnDeleteGame', handleDelete);
        const form = document.getElementById('gameForm');
        if (form) form.onsubmit = handleFormSubmit;
    }

    safeClick('btnCloseModal', () => toggleModal(false));
    const gameModal = document.getElementById('gameModal');
    if (gameModal) gameModal.onclick = (e) => { if (e.target.id === 'gameModal') toggleModal(false); };

    // Tabs funcionam em ambos os modos
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

// Modais e Forms helpers (Mantidos igual, mas só chamados se isSharedMode=false)
let editingId = null;
window.editGame = (id) => openGameModal(id);

const openGameModal = (gameId = null) => {
    // Se for compartilhado, bloqueia
    if(appStore.get().isSharedMode) return;

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
    if(appStore.get().isSharedMode) return;

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
    if(appStore.get().isSharedMode) return;
    if(confirm("Excluir?")) {
        await GameService.deleteGame(editingId);
        toggleModal(false);
        loadData();
    }
};

document.addEventListener('DOMContentLoaded', init);