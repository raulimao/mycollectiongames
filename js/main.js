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

const selectApiGame = (game) => {
    // 1. Preenche Nome e Imagem
    document.getElementById('inputGameName').value = game.name;
    document.getElementById('inputImage').value = game.background_image || '';
    
    // 2. Lógica de Automação de Plataforma
    const select = document.getElementById('inputPlatform');
    let found = false;

    // Tenta encontrar uma plataforma compatível nos dados da API
    if (game.platforms && game.platforms.length > 0) {
        // Itera sobre as plataformas que o jogo suporta
        for (let p of game.platforms) {
            const apiName = p.platform.name.toLowerCase();
            
            // Verifica nosso dicionário
            for (let [key, value] of Object.entries(platformMap)) {
                if (apiName.includes(key)) {
                    select.value = value;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    }

    // Se não achou automaticamente, reseta para "Selecione"
    if (!found) select.value = "";

    // Esconde resultados
    document.getElementById('apiResults').classList.add('hidden');
    
    // Feedback visual
    showToast(`Dados de "${game.name}" carregados!`);
};