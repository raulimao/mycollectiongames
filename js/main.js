import { supabase, AuthService } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

// --- INICIALIZAÇÃO ---
const init = async () => {
    console.log("🚀 GameVault Pro Iniciado");

    appStore.subscribe(renderApp);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        const loader = document.getElementById('globalLoader');
        if (session?.user) {
            await handleUserLoggedIn(session.user);
        } else {
            handleUserLoggedOut();
        }
        if (loader) loader.classList.add('hidden');
    });

    setupEvents();
};

const handleUserLoggedIn = async (user) => {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
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
            btnGoogle.innerHTML = '<div class="spinner" style="width:15px;height:15px;border-width:2px"></div> ...';
            await AuthService.signInGoogle();
        } catch (e) {
            btnGoogle.innerHTML = '<i class="fa-brands fa-google"></i> Entrar com Google';
            showToast("Erro: " + e.message, "error");
        }
    };
    
    document.getElementById('btnLogout').onclick = AuthService.signOut;

    // Modais
    document.getElementById('btnOpenAddModal').onclick = () => openGameModal();
    document.getElementById('btnCloseModal').onclick = () => toggleModal(false);
    document.getElementById('gameModal').onclick = (e) => {
        if (e.target.id === 'gameModal') toggleModal(false);
    };

    // Form
    document.getElementById('gameForm').onsubmit = handleFormSubmit;
    document.getElementById('btnDeleteGame').onclick = handleDelete;

    // Tabs & Busca Local
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appStore.setState({ filter: e.target.dataset.tab });
        };
    });
    document.getElementById('searchInput').oninput = (e) => {
        appStore.setState({ searchTerm: e.target.value });
    };

    // --- LÓGICA DE BUSCA API (RAWG) ---
    let timeout;
    const apiResults = document.getElementById('apiResults');
    const inputGameName = document.getElementById('inputGameName');

    inputGameName.oninput = (e) => {
        const query = e.target.value;
        
        // 1. Limpa timeout anterior
        clearTimeout(timeout);
        
        // 2. Se for muito curto, esconde
        if (query.length < 3) {
            apiResults.classList.add('hidden');
            return;
        }

        // 3. Feedback visual imediato (UX)
        apiResults.classList.remove('hidden');
        apiResults.innerHTML = '<div style="padding:15px;text-align:center;color:#888"><i class="fa-solid fa-circle-notch fa-spin"></i> Digitando...</div>';

        // 4. Executa busca após 600ms de pausa
        timeout = setTimeout(async () => {
            console.log("🔍 Buscando na API:", query); // Debug
            apiResults.innerHTML = '<div style="padding:15px;text-align:center;color:var(--primary)"><i class="fa-solid fa-circle-notch fa-spin"></i> Buscando jogos...</div>';
            
            try {
                const results = await GameService.searchRawg(query);
                renderApiResults(results);
            } catch (error) {
                console.error("Erro API:", error);
                apiResults.innerHTML = '<div style="padding:10px;text-align:center;color:var(--danger)">Erro na busca. Tente novamente.</div>';
            }
        }, 600);
    };

    // Toggle Status
    document.getElementById('inputStatus').onchange = (e) => {
        const group = document.getElementById('soldGroup');
        if (e.target.value === 'Vendido') group.classList.remove('hidden');
        else group.classList.add('hidden');
    };
};

// --- FUNÇÕES DE FORMULÁRIO E MODAL ---
let editingId = null;
window.editGame = (id) => openGameModal(id);

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    form.reset();
    editingId = gameId;
    
    // Reseta visual da busca
    const apiContainer = document.getElementById('apiResults');
    apiContainer.classList.add('hidden');
    apiContainer.innerHTML = '';
    
    document.getElementById('soldGroup').classList.add('hidden');
    
    // --- LÓGICA DE PLATAFORMA ---
    const select = document.getElementById('inputPlatform');
    select.innerHTML = ''; // Limpa opções antigas

    if (gameId) {
        // MODO EDIÇÃO
        const game = appStore.get().games.find(g => g.id === gameId);
        if (!game) return;

        document.getElementById('modalTitle').innerText = "Editar Jogo";
        document.getElementById('btnDeleteGame').classList.remove('hidden');
        document.getElementById('inputGameName').value = game.title;
        
        // Injeta a plataforma salva (já que não temos lista fixa)
        const opt = document.createElement('option');
        opt.value = game.platform;
        opt.innerText = game.platform;
        select.appendChild(opt);
        select.value = game.platform;

        document.getElementById('inputPrice').value = game.price_paid;
        document.getElementById('inputStatus').value = game.status;
        document.getElementById('inputImage').value = game.image_url;
        
        if (game.status === 'Vendido') {
            document.getElementById('soldGroup').classList.remove('hidden');
            document.getElementById('inputSoldPrice').value = game.price_sold;
        }
    } else {
        // MODO NOVO JOGO
        document.getElementById('modalTitle').innerText = "Novo Jogo";
        document.getElementById('btnDeleteGame').classList.add('hidden');
        
        // Placeholder obrigando a busca
        select.innerHTML = '<option value="" disabled selected>Busque o nome do jogo acima...</option>';
    }
    toggleModal(true);
};

// --- SELEÇÃO DE JOGO DA API ---
const renderApiResults = (games) => {
    const container = document.getElementById('apiResults');
    container.innerHTML = '';
    
    if(!games || games.length === 0) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">Nenhum jogo encontrado</div>';
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
        // Passa o objeto completo 'g' para a função
        item.onclick = () => selectApiGame(g);
        container.appendChild(item);
    });
};

const selectApiGame = (game) => {
    console.log("Jogo Selecionado:", game); // Debug
    
    // 1. Preenche Nome e Imagem
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    
    // 2. Preenchimento Dinâmico de Plataformas
    const select = document.getElementById('inputPlatform');
    select.innerHTML = ''; // Limpa o placeholder

    if (game.platforms && game.platforms.length > 0) {
        // A API RAWG retorna: platforms: [{ platform: { id: 1, name: "Xbox One" } }, ... ]
        game.platforms.forEach(p => {
            const option = document.createElement('option');
            option.value = p.platform.name; // ex: "PlayStation 5"
            option.innerText = p.platform.name;
            select.appendChild(option);
        });
        
        // Seleciona o primeiro automaticamente
        select.selectedIndex = 0;
        showToast(`Plataformas de ${game.name} carregadas!`);
    } else {
        // Fallback se a API não trouxer plataformas
        select.innerHTML = '<option value="Outros">Outros / Desconhecido</option>';
    }

    // 3. Esconde lista de resultados
    document.getElementById('apiResults').classList.add('hidden');
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    
    btn.innerText = "Salvando...";
    btn.disabled = true;

    // Se a plataforma estiver vazia (usuário não buscou), define padrão
    let platformValue = document.getElementById('inputPlatform').value;
    if (!platformValue || platformValue === "") platformValue = "Outros";

    const formData = {
        title: document.getElementById('inputGameName').value,
        platform: platformValue,
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

document.addEventListener('DOMContentLoaded', init);