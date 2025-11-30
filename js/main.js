// --- NOVO: Dicionário de Mapeamento de Plataformas ---
// Esquerda: O que vem da API RAWG (parcial) | Direita: O value do seu <select> HTML
const platformMap = {
    'playstation 5': 'PS5',
    'playstation 4': 'PS4',
    'xbox series': 'Xbox Series',
    'xbox one': 'Xbox Series', // Mapeando One para Series ou crie uma option separada
    'nintendo switch': 'Nintendo Switch',
    'pc': 'PC',
    'macos': 'PC',
    'linux': 'PC'
};

// --- API RAWG (Atualizada para Debug) ---
let timeout;
// Certifique-se que o ID no HTML é inputGameName
const inputSearch = document.getElementById('inputGameName');

inputSearch.oninput = (e) => {
    const query = e.target.value;
    
    // Feedback visual que está digitando
    const container = document.getElementById('apiResults');
    
    if (query.length < 3) {
        container.classList.add('hidden');
        return;
    }

    // Debounce para não chamar API a cada letra
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
        container.innerHTML = '<div style="padding:10px; text-align:center; color:#888"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div> Buscando...</div>';
        container.classList.remove('hidden');
        
        const results = await GameService.searchRawg(query);
        renderApiResults(results);
    }, 600); // Espere 600ms após parar de digitar
};

const renderApiResults = (games) => {
    const container = document.getElementById('apiResults');
    container.innerHTML = '';
    
    if(!games || games.length === 0) {
        container.innerHTML = '<div style="padding:10px; text-align:center; color:#888">Nenhum jogo encontrado</div>';
        return;
    }

    container.classList.remove('hidden');

    games.forEach(g => {
        const item = document.createElement('div');
        item.className = 'api-item';
        
        // Pega o ano de lançamento
        const year = g.released ? g.released.split('-')[0] : 'N/A';
        
        item.innerHTML = `
            <img src="${g.background_image || 'assets/no-img.jpg'}"> 
            <div class="api-info">
                <strong>${g.name}</strong>
                <small>${year} • ${g.platforms?.map(p => p.platform.name).slice(0, 2).join(', ')}</small>
            </div>
        `;
        
        // Ao clicar, preenche tudo automaticamente
        item.onclick = () => selectApiGame(g);
        container.appendChild(item);
    });
};

// --- FUNÇÃO DE SELEÇÃO DINÂMICA (SEM MAPA MANUAL) ---
const selectApiGame = (game) => {
    // 1. Preenche Nome e Imagem
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    
    // 2. Lógica Dinâmica de Plataforma
    const select = document.getElementById('inputPlatform');
    
    // Limpa as opções "fixas" que estavam no HTML
    select.innerHTML = '';

    // Verifica se o jogo tem plataformas listadas na API
    if (game.platforms && game.platforms.length > 0) {
        
        // Cria uma opção para cada plataforma que o jogo suporta
        game.platforms.forEach(p => {
            const option = document.createElement('option');
            // O valor e o texto serão exatamente o que vem da API (ex: "PlayStation 5", "Xbox Series S/X")
            option.value = p.platform.name; 
            option.innerText = p.platform.name;
            select.appendChild(option);
        });

        // Opcional: Seleciona a primeira opção automaticamente
        select.selectedIndex = 0;
        
    } else {
        // Fallback: Se a API não trouxer plataformas (raro, mas acontece em jogos indie/antigos)
        // Mantemos uma opção genérica ou restauramos uma lista básica
        select.innerHTML = '<option value="Outros">Outros / Desconhecido</option>';
    }

    // Esconde a lista de resultados
    document.getElementById('apiResults').classList.add('hidden');
    
    // Feedback visual
    showToast(`Plataformas de "${game.name}" carregadas!`);
};