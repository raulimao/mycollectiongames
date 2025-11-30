// IMPORTANTE: Verifique se suas pastas estão exatamente assim no GitHub.
// Se os arquivos estiverem soltos na pasta 'js', remova o "services/" e "modules/" dos caminhos abaixo.
import { supabase, AuthService } from './services/supabase.js';
import { GameService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal } from './modules/ui.js';

// --- INICIALIZAÇÃO SEGURA ---
const init = async () => {
    console.log("🚀 GameVault Pro Iniciado");

    // 1. Inscrever a UI nas mudanças de estado (Store)
    appStore.subscribe(renderApp);

    // 2. Auth Listener (Resolve o bug da Tela Preta/Race Condition)
    // Ouve quando o usuário conecta ou desconecta
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        
        // REMOVE O LOADER GLOBAL (Tela Preta) assim que tiver resposta
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
    
    // Atualiza Header com dados do usuário
    const nameEl = document.getElementById('userName');
    const imgEl = document.getElementById('userAvatar');
    
    // Tenta pegar nome/foto do Google ou usa fallback
    nameEl.innerText = user.user_metadata.full_name || user.email.split('@')[0];
    if(user.user_metadata.avatar_url) {
        imgEl.src = user.user_metadata.avatar_url;
        imgEl.style.display = 'block';
    }

    // Salva user no estado e carrega jogos
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
        showToast("Erro ao carregar dados. Tente recarregar.", "error");
    }
};

// --- EVENTOS ---
const setupEvents = () => {
    // Auth
    document.getElementById('btnGoogle').onclick = async () => {
        const btn = document.getElementById('btnGoogle');
        try {
            btn.innerHTML = '<div class="spinner" style="width:15px;height:15px;border-width:2px"></div> Conectando...';
            await AuthService.signInGoogle();
        } catch (e) {
            btn.innerHTML = '<i class="fa-brands fa-google"></i> Entrar com Google';
            showToast("Erro no Login: " + e.message, "error");
        }
    };
    document.getElementById('btnLogout').onclick = AuthService.signOut;

    // Modal
    document.getElementById('btnOpenAddModal').onclick = () => openGameModal();
    document.getElementById('btnCloseModal').onclick = () => toggleModal(false);

    // Form Submit & Delete
    document.getElementById('gameForm').onsubmit = handleFormSubmit;
    document.getElementById('btnDeleteGame').onclick = handleDelete;

    // Tabs (Navegação)
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

    // API RAWG (Busca Externa com Debounce)
    let timeout;
    document.getElementById('inputGameName').oninput = (e) => {
        const query = e.target.value;
        const container = document.getElementById('apiResults');

        if (query.length < 3) {
            container.classList.add('hidden');
            return;
        }

        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">Buscando...</div>';
            container.classList.remove('hidden');
            const results = await GameService.searchRawg(query);
            renderApiResults(results);
        }, 600);
    };

    // Toggle do Campo de Venda
    document.getElementById('inputStatus').onchange = (e) => {
        const group = document.getElementById('soldGroup');
        if (e.target.value === 'Vendido') group.classList.remove('hidden');
        else group.classList.add('hidden');
    };
};

// --- LÓGICA DE FORMULÁRIO ---
let editingId = null;

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    form.reset();
    editingId = gameId;
    
    // Reseta visual
    document.getElementById('apiResults').classList.add('hidden');
    document.getElementById('soldGroup').classList.add('hidden');

    // Reseta o Select de Plataforma para o padrão (caso tenha sido alterado pela API)
    const select = document.getElementById('inputPlatform');
    select.innerHTML = `
        <option value="">Busque o jogo primeiro...</option>
        <option value="Nintendo Switch">Nintendo Switch</option>
        <option value="PS5">PS5</option>
        <option value="PS4">PS4</option>
        <option value="Xbox Series">Xbox Series</option>
        <option value="PC">PC</option>
    `;

    if (gameId) {
        // MODO EDIÇÃO
        const game = appStore.get().games.find(g => g.id === gameId);
        document.getElementById('modalTitle').innerText = "Editar Jogo";
        document.getElementById('btnDeleteGame').classList.remove('hidden');

        document.getElementById('inputGameName').value = game.title;
        
        // Garante que a plataforma do jogo exista no select (caso seja antiga)
        const optionExists = [...select.options].some(o => o.value === game.platform);
        if(!optionExists) {
            const opt = document.createElement('option');
            opt.value = game.platform;
            opt.innerText = game.platform;
            select.appendChild(opt);
        }
        document.getElementById('inputPlatform').value = game.platform;

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

// Hook global para o HTML chamar
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
            showToast("Jogo atualizado com sucesso!");
        } else {
            await GameService.addGame(formData);
            showToast("Jogo adicionado à coleção!");
        }
        toggleModal(false);
        await loadData(); // Recarrega para garantir sincronia
    } catch (err) {
        console.error(err);
        showToast("Erro ao salvar: " + err.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

const handleDelete = async () => {
    if (confirm("Tem certeza que deseja excluir este jogo permanentemente?")) {
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

// --- LÓGICA DA API RAWG & PLATAFORMAS DINÂMICAS ---
const renderApiResults = (games) => {
    const container = document.getElementById('apiResults');
    container.innerHTML = '';
    
    if(!games || games.length === 0) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:#888">Nenhum jogo encontrado</div>';
        return;
    }

    container.classList.remove('hidden');

    games.forEach(g => {
        const item = document.createElement('div');
        item.className = 'api-item';
        const year = g.released ? g.released.split('-')[0] : 'N/A';
        
        item.innerHTML = `
            <img src="${g.background_image || ''}"> 
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
    // 1. Preenche Nome e Imagem
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    
    // 2. Preenchimento Dinâmico de Plataformas
    const select = document.getElementById('inputPlatform');
    select.innerHTML = ''; // Limpa opções antigas

    if (game.platforms && game.platforms.length > 0) {
        // Cria uma opção para cada plataforma retornada pela API
        game.platforms.forEach(p => {
            const option = document.createElement('option');
            option.value = p.platform.name; // ex: "PlayStation 5"
            option.innerText = p.platform.name;
            select.appendChild(option);
        });
        select.selectedIndex = 0; // Seleciona a primeira
    } else {
        // Fallback se a API não trouxer plataformas
        select.innerHTML = '<option value="Outros">Outros / Desconhecido</option>';
    }

    document.getElementById('apiResults').classList.add('hidden');
    showToast(`Dados de "${game.name}" carregados!`);
};

// Start
document.addEventListener('DOMContentLoaded', init);