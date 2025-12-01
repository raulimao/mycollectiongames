import { supabase, AuthService } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

let editingId = null;
let isInitializing = false;

// Lista padrão para quando abrir o modal vazio
const DEFAULT_PLATFORMS = [
    "PC", "PlayStation 5", "PlayStation 4", "Xbox Series X/S", 
    "Xbox One", "Nintendo Switch", "Steam Deck", "Mobile", "Outros"
];

// --- INICIALIZAÇÃO ---
const init = async () => {
    console.log("🚀 [System] Inicializando GameVault...");
    
    appStore.subscribe(state => renderApp(state));
    setupGlobalEvents();

    const urlParams = new URLSearchParams(window.location.search);
    const sharedNick = urlParams.get('u');

    if (sharedNick) {
        await handleVisitorMode(sharedNick);
    } else {
        checkAuthStatus();
    }
};

const checkAuthStatus = () => {
    const safetyTimer = setTimeout(() => {
        const loader = document.getElementById('globalLoader');
        if (loader && !loader.classList.contains('hidden')) {
            console.warn("⚠️ [System] Safety Timeout. Liberando UI.");
            loader.classList.add('hidden');
            if(document.getElementById('appContainer').classList.contains('hidden')) {
                 document.getElementById('loginOverlay').classList.remove('hidden');
            }
        }
    }, 5000);

    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`👤 [Auth] Evento: ${event}`);
        if (isInitializing && event === 'SIGNED_IN') return;
        
        clearTimeout(safetyTimer);

        const loader = document.getElementById('globalLoader');
        const loginOverlay = document.getElementById('loginOverlay');
        const appContainer = document.getElementById('appContainer');

        if (session?.user) {
            isInitializing = true;
            if(loginOverlay) loginOverlay.classList.add('hidden');
            if(loader) loader.classList.add('hidden'); 
            if(appContainer) appContainer.classList.remove('hidden');

            appStore.setState({ user: session.user, isSharedMode: false });

            handleUserLoggedIn(session.user).finally(() => {
                isInitializing = false;
            });

        } else {
            appStore.reset();
            if(appContainer) appContainer.classList.add('hidden');
            if(loginOverlay) loginOverlay.classList.remove('hidden');
            if(loader) loader.classList.add('hidden');
        }
    });
};

const handleUserLoggedIn = async (user) => {
    try {
        console.log("📥 [Data] Buscando perfil...");
        const profile = await GameService.getMyProfile(user.id);
        
        if (!profile) {
            setTimeout(() => {
                const modal = document.getElementById('nicknameModal');
                if(modal) {
                    modal.classList.remove('hidden');
                    modal.style.zIndex = "10000";
                }
            }, 500);
            setupNicknameForm(user);
        } else {
            updateUserProfileUI(profile);
            appStore.setState({ sharedProfileName: profile.nickname }); 
        }

        setupAuthEvents();
        console.log("📥 [Data] Baixando jogos...");
        await loadData(user.id);
        
    } catch (error) {
        console.error("❌ [Critico] Erro no fluxo de login:", error);
        showToast("Erro ao conectar.", "error");
    }
};

const loadData = async (userId) => {
    try {
        const games = await GameService.fetchGames(userId);
        appStore.setState({ games });
    } catch (e) { console.error("Erro loadData:", e); }
};

const handleVisitorMode = async (nickname) => {
    const userId = await GameService.getUserIdByNickname(nickname);
    document.getElementById('globalLoader').classList.add('hidden');
    document.getElementById('loginOverlay').classList.add('hidden');
    
    if (userId) {
        document.getElementById('appContainer').classList.remove('hidden');
        document.getElementById('headerActions').innerHTML = '';
        
        const games = await GameService.fetchSharedGames(userId);
        appStore.setState({ 
            games, 
            isSharedMode: true, 
            sharedProfileName: nickname 
        });
    } else {
        alert("Perfil não encontrado!");
        window.location.href = window.location.pathname;
    }
};

// --- UI HELPERS ---

const updateUserProfileUI = (profile) => {
    const nameEl = document.getElementById('userName');
    const headerActions = document.getElementById('headerActions');
    
    if(nameEl) {
        nameEl.innerText = profile.nickname.toUpperCase();
        nameEl.style.display = 'block';
    }

    if(headerActions && !document.getElementById('btnShareProfile')) {
        const btn = document.createElement('button');
        btn.id = 'btnShareProfile';
        btn.className = 'btn-small';
        btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> LINK';
        btn.onclick = () => {
            const url = `${window.location.origin}${window.location.pathname}?u=${profile.nickname}`;
            navigator.clipboard.writeText(url).then(() => showToast("Link copiado!", "success"));
        };
        headerActions.prepend(btn);
    }
};

// Função auxiliar para resetar o select de plataformas
const resetPlatformOptions = (selectedPlatform = null) => {
    const select = document.getElementById('inputPlatform');
    if(!select) return;
    
    select.innerHTML = '<option value="" disabled selected>Selecione a plataforma...</option>';
    
    DEFAULT_PLATFORMS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.innerText = p;
        if(selectedPlatform && p === selectedPlatform) opt.selected = true;
        select.appendChild(opt);
    });
};

// --- EVENTS ---

const setupGlobalEvents = () => {
    const safeClick = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };

    safeClick('btnGoogle', () => AuthService.signInGoogle());
    safeClick('btnCloseModal', () => toggleModal(false));
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appStore.setState({ filter: e.target.dataset.tab });
        });
    });

    const searchInput = document.getElementById('searchInput');
    if(searchInput) searchInput.addEventListener('input', (e) => appStore.setState({ searchTerm: e.target.value }));
};

const setupAuthEvents = () => {
    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) {
        const newBtn = btnLogout.cloneNode(true);
        btnLogout.parentNode.replaceChild(newBtn, btnLogout);
        newBtn.onclick = () => AuthService.signOut();
    }

    const btnAdd = document.getElementById('btnOpenAddModal');
    if(btnAdd) btnAdd.onclick = () => openGameModal();

    const form = document.getElementById('gameForm');
    if(form) form.onsubmit = handleFormSubmit;

    const btnDelete = document.getElementById('btnDeleteGame');
    if(btnDelete) btnDelete.onclick = handleDelete;

    setupRawgSearch();

    const inputStatus = document.getElementById('inputStatus');
    if (inputStatus) {
        inputStatus.onchange = (e) => {
            const soldGroup = document.getElementById('soldGroup');
            if (e.target.value === 'Vendido') soldGroup.classList.remove('hidden');
            else soldGroup.classList.add('hidden');
        };
    }
};

const setupNicknameForm = (user) => {
    const form = document.getElementById('nicknameForm');
    if(form) form.onsubmit = async (e) => {
        e.preventDefault();
        const nick = document.getElementById('inputNickname').value;
        const btn = form.querySelector('button');
        const oldText = btn.innerText;
        btn.innerText = "CRIANDO..."; btn.disabled = true;

        try {
            await GameService.createProfile(nick);
            document.getElementById('nicknameModal').classList.add('hidden');
            appStore.setState({ sharedProfileName: nick });
            updateUserProfileUI({ nickname: nick });
        } catch(err) {
            alert("Erro: " + err.message);
        } finally {
            btn.innerText = oldText; btn.disabled = false;
        }
    };
};

// --- FORM LOGIC ---

window.editGame = (id) => openGameModal(id);

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    const modalTitle = document.getElementById('modalTitle');
    const btnDelete = document.getElementById('btnDeleteGame');
    
    form.reset();
    document.getElementById('apiResults').classList.add('hidden');
    document.getElementById('soldGroup').classList.add('hidden');
    editingId = gameId;

    if (gameId) {
        modalTitle.innerText = "EDITAR JOGO";
        btnDelete.classList.remove('hidden');
        const game = appStore.get().games.find(g => g.id === gameId);
        
        // Reseta plataformas padrão mas seleciona a correta
        resetPlatformOptions(game?.platform);
        
        if(game) {
            document.getElementById('inputGameName').value = game.title;
            // O valor do platform já foi tratado no resetPlatformOptions
            if(game.platform && !DEFAULT_PLATFORMS.includes(game.platform)) {
                // Se a plataforma salva não estiver na lista padrão, adiciona ela
                const select = document.getElementById('inputPlatform');
                const opt = document.createElement('option');
                opt.value = game.platform;
                opt.innerText = game.platform;
                opt.selected = true;
                select.appendChild(opt);
            }

            document.getElementById('inputStatus').value = game.status;
            document.getElementById('inputPrice').value = game.price_paid;
            document.getElementById('inputSoldPrice').value = game.price_sold;
            document.getElementById('inputImage').value = game.image_url;
            if(game.status === 'Vendido') document.getElementById('soldGroup').classList.remove('hidden');
        }
    } else {
        modalTitle.innerText = "NOVO JOGO";
        btnDelete.classList.add('hidden');
        resetPlatformOptions(); // Garante lista limpa para novo jogo
    }
    toggleModal(true);
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const oldText = btn.innerText;
    btn.innerText = "SALVANDO..."; btn.disabled = true;
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
        
        showToast("Salvo!");
        toggleModal(false);
        const { user } = appStore.get();
        if(user) loadData(user.id);
    } catch (error) { 
        showToast("Erro ao salvar", "error");
    } finally { 
        btn.innerText = oldText; btn.disabled = false; 
    }
};

const handleDelete = async () => {
    if(confirm("Excluir jogo?")) {
        await GameService.deleteGame(editingId);
        toggleModal(false);
        const { user } = appStore.get();
        if(user) loadData(user.id);
        showToast("Excluído.");
    }
};

const setupRawgSearch = () => {
    let timeout;
    const input = document.getElementById('inputGameName');
    const resultsDiv = document.getElementById('apiResults');
    if (!input) return;

    input.addEventListener('input', (e) => {
        clearTimeout(timeout);
        const query = e.target.value;
        if (query.length < 3) { resultsDiv.classList.add('hidden'); return; }

        timeout = setTimeout(async () => {
            resultsDiv.classList.remove('hidden');
            resultsDiv.innerHTML = '<div style="padding:10px; color:#666">...</div>';
            const games = await GameService.searchRawg(query);
            resultsDiv.innerHTML = '';
            
            if(games.length === 0) { resultsDiv.classList.add('hidden'); return; }

            games.forEach(g => {
                const el = document.createElement('div');
                el.className = 'api-item';
                el.innerHTML = `<img src="${g.background_image || ''}"><div class="api-info"><strong>${g.name}</strong></div>`;
                
                // --- AQUI ESTÁ A MÁGICA DA PLATAFORMA ---
                el.onclick = () => {
                    document.getElementById('inputGameName').value = g.name;
                    document.getElementById('inputImage').value = g.background_image;
                    resultsDiv.classList.add('hidden');
                    
                    const select = document.getElementById('inputPlatform');
                    select.innerHTML = ''; // Limpa as opções padrão
                    
                    // Verifica se a API retornou plataformas
                    if (g.platforms && g.platforms.length > 0) {
                        // Adiciona uma opção placeholder
                        const placeholder = document.createElement('option');
                        placeholder.text = "Selecione a versão...";
                        placeholder.value = "";
                        placeholder.disabled = true;
                        placeholder.selected = true;
                        select.appendChild(placeholder);

                        // Cria uma opção para cada plataforma real do jogo
                        g.platforms.forEach(p => {
                            const opt = document.createElement('option');
                            opt.value = p.platform.name; // Ex: "PlayStation 5"
                            opt.text = p.platform.name;
                            select.appendChild(opt);
                        });
                    } else {
                        // Fallback se a API não der plataformas
                        resetPlatformOptions();
                    }
                };
                resultsDiv.appendChild(el);
            });
        }, 600);
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsDiv.contains(e.target)) resultsDiv.classList.add('hidden');
    });
};

document.addEventListener('DOMContentLoaded', init);