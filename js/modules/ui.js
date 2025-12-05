import { appStore } from './store.js';
import { GameService } from '../services/api.js';

// Cache DOM Helper
const getDOM = () => ({
    grid: document.getElementById('gamesContainer'),
    kpi: document.getElementById('kpi-container'),
    toast: document.getElementById('toastContainer'),
    modal: document.getElementById('gameModal'),
    filterBadge: document.getElementById('chartFilterBadge'),
    filterName: document.getElementById('filterName'),
    xpContainer: document.getElementById('xpContainer'),
    xpBar: document.getElementById('xpProgressBar'),
    xpText: document.getElementById('xpText'),
    levelBadge: document.getElementById('userLevelBadge')
});

// --- FUNÇÕES EXPOSTAS AO WINDOW ---

window.switchChart = (mode) => {
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    const tabs = document.querySelectorAll('.chart-tab');
    
    if(mode === 'platform' && tabs[0]) tabs[0].classList.add('active');
    if(mode === 'status' && tabs[1]) tabs[1].classList.add('active');
    if(mode === 'dna' && tabs[2]) tabs[2].classList.add('active');
    if(mode === 'cost' && tabs[3]) tabs[3].classList.add('active');
    
    appStore.setState({ chartMode: mode });
};

window.clearChartFilter = () => {
    appStore.setState({ activePlatform: null });
};

// ATUALIZAÇÃO DO CONTEXTO DE VÍDEO (Lógica Híbrida: Trailer MP4 ou Link Externo)
// ATUALIZAÇÃO DO CONTEXTO DE VÍDEO (Com Plataforma e Análise)
window.updateVideoContext = (type, btn, videoUrl = null) => {
    // 1. Atualiza visual dos botões
    const parent = btn.parentElement;
    parent.querySelectorAll('.video-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const container = document.getElementById('videoPlayerContainer');
    
    // Lógica Trailer Nativo
    if (type === 'TRAILER' && videoUrl && videoUrl !== 'null' && videoUrl !== 'undefined') {
        container.innerHTML = `
            <div class="video-wrapper">
                <video controls autoplay name="media" style="width:100%; height:100%; border-radius:12px;">
                    <source src="${videoUrl}" type="video/mp4">
                    Seu navegador não suporta a tag de vídeo.
                </video>
            </div>`;
    } else {
        // FIX: Captura a Plataforma do DOM
        const gameName = document.getElementById('detailTitle').innerText;
        const platformName = document.getElementById('detailPlatform').innerText;
        
        const cleanName = gameName.replace(/[^a-zA-Z0-9\s]/g, ''); 
        
        // QUERY OTIMIZADA: "Yakuza 2 PlayStation 2 Análise"
        const query = encodeURIComponent(`${cleanName} ${platformName} ${type}`);
        
        container.innerHTML = `
            <div class="video-placeholder" onclick="window.open('https://www.youtube.com/results?search_query=${query}', '_blank')">
                <div class="placeholder-content">
                    <i class="fa-brands fa-youtube fa-4x" style="color: #ff0000; margin-bottom: 15px; filter: drop-shadow(0 0 20px rgba(255,0,0,0.4));"></i>
                    <h3 style="color:white; font-family:var(--font-num); margin-bottom:5px">ASSISTIR ${type.toUpperCase()}</h3>
                    <p style="color:#aaa; font-size:0.9rem; text-transform:uppercase;">
                        ${cleanName} • ${platformName}
                    </p>
                    <span class="btn-small" style="margin-top:15px; display:inline-block; pointer-events:none; border-color:rgba(255,255,255,0.2);">
                        ABRIR NO YOUTUBE <i class="fa-solid fa-external-link-alt"></i>
                    </span>
                </div>
            </div>
        `;
    }
};

// Utils
const formatMoney = (val) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// --- RENDER MAIN ---
export const renderApp = (state) => {
    const DOM = getDOM();
    const isShared = state.isSharedMode;

    const controlsPanel = document.querySelector('.controls-panel');
    const costTab = document.querySelectorAll('.chart-tab')[3]; 
    const headerActions = document.getElementById('headerActions');
    const btnAddGame = document.getElementById('btnOpenAddModal');
    const btnExport = document.getElementById('btnExport');

    // Botões do Header
    let headerButtons = '';
    if(isShared) {
        headerButtons = `<span class="badge bg-playing">Visitando: ${state.sharedProfileName}</span>`;
    } else {
        headerButtons = `
            <button id="btnShareProfile" class="btn-small" title="Copiar Link"><i class="fa-solid fa-link"></i></button>
            <button id="btnGenCard" class="btn-small" style="border-color:var(--primary); color:var(--primary)" title="Gerar Card Social"><i class="fa-solid fa-camera"></i> CARD</button>
        `;
    }

    if(headerActions) {
        headerActions.innerHTML = headerButtons;
        if(!isShared) {
            const btnLink = document.getElementById('btnShareProfile');
            const btnCard = document.getElementById('btnGenCard');
            if(btnLink) btnLink.onclick = () => {
                const url = `${window.location.origin}${window.location.pathname}?u=${state.sharedProfileName}`;
                navigator.clipboard.writeText(url).then(() => showToast("Link copiado!", "success"));
            };
            if(btnCard) btnCard.onclick = () => generateSocialCard();
        }
    }

    // Visibilidade dos controles
    if(isShared) {
        if(controlsPanel) controlsPanel.classList.remove('hidden'); 
        if(btnAddGame) btnAddGame.classList.add('hidden'); 
        if(btnExport) btnExport.classList.add('hidden'); 
        if(costTab) costTab.style.display = 'none'; 
        if(DOM.xpContainer) DOM.xpContainer.classList.add('hidden');
    } else {
        if(controlsPanel) controlsPanel.classList.remove('hidden');
        if(btnAddGame) btnAddGame.classList.remove('hidden');
        if(btnExport) btnExport.classList.remove('hidden');
        if(costTab) costTab.style.display = 'inline-flex';
        if(DOM.xpContainer) DOM.xpContainer.classList.remove('hidden');
    }

    // Filtragem
    let filteredGames = state.games || [];
    const term = state.searchTerm?.toLowerCase() || '';
    const filter = state.filter || 'collection';

    if (filter === 'sold') filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    else if (filter === 'wishlist') filteredGames = filteredGames.filter(g => g.status === 'Desejado');
    else if (filter === 'store') filteredGames = filteredGames.filter(g => g.status === 'À venda');
    else if (filter === 'backlog') filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    else filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog', 'Desejado'].includes(g.status));

    if (term) filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));

    if (state.activePlatform) {
        filteredGames = filteredGames.filter(g => g.platform === state.activePlatform);
        if(DOM.filterBadge) {
            DOM.filterBadge.classList.remove('hidden');
            if(DOM.filterName) DOM.filterName.innerText = state.activePlatform;
        }
    } else {
        if(DOM.filterBadge) DOM.filterBadge.classList.add('hidden');
    }

    // Renderização dos Componentes
    renderKPIs(state.games, isShared, filter);
    renderGrid(filteredGames, isShared);
    renderChart(filteredGames, state.chartMode, filter, state.games);
    renderXP(state.games); 
};

// --- GAMIFICAÇÃO: XP & LEVEL ---
const renderXP = (allGames) => {
    const DOM = getDOM();
    if(!DOM.xpContainer || !DOM.xpBar) return;

    const XP_TABLE = { 'Platinado': 1000, 'Jogo Zerado': 500, 'Jogando': 100, 'Coleção': 50, 'Backlog': 10, 'Vendido': 20, 'À venda': 20, 'Desejado': 0 };
    let totalXP = 0;
    allGames.forEach(g => totalXP += (XP_TABLE[g.status] || 0));

    const XP_PER_LEVEL = 1000;
    const currentLevel = Math.floor(totalXP / XP_PER_LEVEL) + 1;
    const xpInCurrentLevel = totalXP % XP_PER_LEVEL;
    const progressPercent = (xpInCurrentLevel / XP_PER_LEVEL) * 100;

    DOM.levelBadge.innerText = `LVL ${currentLevel}`;
    DOM.xpText.innerText = `${xpInCurrentLevel} / ${XP_PER_LEVEL} XP`;
    DOM.xpBar.style.width = `${progressPercent}%`;
    
    if(currentLevel >= 10) DOM.xpBar.style.background = 'linear-gradient(90deg, #ffd700, #ff3366)'; 
    else if(currentLevel >= 5) DOM.xpBar.style.background = 'linear-gradient(90deg, #0ea5e9, #d946ef)'; 
    else DOM.xpBar.style.background = 'linear-gradient(90deg, #00ff9d, #0ea5e9)'; 
};

// --- GRID DOS JOGOS ---
const renderGrid = (games, isShared) => {
    const DOM = getDOM();
    if(!DOM.grid) return;
    DOM.grid.innerHTML = '';
    
    if (games.length === 0) {
        DOM.grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-muted);"><i class="fa-solid fa-ghost fa-3x" style="margin-bottom:20px; opacity:0.3;"></i><p>Nenhum jogo encontrado nesta seção.</p></div>`;
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.onclick = () => openGameDetails(game, isShared);

        // Capas Dinâmicas
        card.onmouseenter = () => {
            const bgLayer = document.getElementById('dynamic-bg-layer');
            if(bgLayer && game.image_url) {
                bgLayer.style.backgroundImage = `url('${game.image_url}')`;
                bgLayer.classList.add('active');
            }
        };
        card.onmouseleave = () => {
            const bgLayer = document.getElementById('dynamic-bg-layer');
            if(bgLayer) bgLayer.classList.remove('active');
        };

        const badgeClass = getBadgeClass(game.status);
        const bgImage = game.image_url || 'https://via.placeholder.com/400x600?text=No+Cover';
        const wishIcon = game.status === 'Desejado' ? '<i class="fa-solid fa-star" style="color:var(--warning); margin-right:5px;"></i>' : '';
        
        let tagsHtml = '';
        if (game.tags && Array.isArray(game.tags) && game.tags.length > 0) {
            tagsHtml = '<div class="card-tags">';
            game.tags.forEach(tag => tagsHtml += `<span class="mini-tag ${tag.toLowerCase()}">${tag}</span>`);
            tagsHtml += '</div>';
        }

        let priceDisplay = '';
        if (!isShared) {
            if (game.status === 'Vendido') {
                const profit = (game.price_sold || 0) - (game.price_paid || 0);
                const sign = profit >= 0 ? '+' : '';
                const colorClass = profit >= 0 ? 'text-green' : 'text-danger';
                const val = formatMoney(profit).replace('R$', '').trim();
                priceDisplay = `<span class="${colorClass}" style="font-weight:bold;">${sign} R$ ${val}</span>`;
            } else if (game.status === 'À venda') {
                 priceDisplay = `<span class="text-green">${formatMoney(game.price_sold)}</span>`;
            } else {
                priceDisplay = formatMoney(game.price_paid);
            }
        } else {
            if (game.status === 'À venda') priceDisplay = `<span class="text-green" style="font-weight:bold;">${formatMoney(game.price_sold)}</span>`;
        }

        card.innerHTML = `
            <div class="card-img-wrapper">
                <div class="card-img" style="background-image: url('${bgImage}')"></div>
                <div class="card-overlay"></div>
                ${tagsHtml}
            </div>
            <div class="card-body">
                <span class="card-platform">${game.platform || 'Outros'}</span>
                <h3 class="card-title">${wishIcon}${game.title}</h3>
                <div class="card-footer">
                    <div class="price-tag" style="${priceDisplay ? '' : 'display:none'}">${priceDisplay}</div>
                    <span class="badge ${badgeClass}">${game.status}</span>
                </div>
            </div>`;
        DOM.grid.appendChild(card);
    });
};

// --- MODAL DETALHES ---
const openGameDetails = async (game, isShared) => {
    const modal = document.getElementById('gameDetailModal');
    if(!modal) return;

    document.getElementById('detailTitle').innerText = game.title.toUpperCase();
    document.getElementById('detailHero').style.backgroundImage = `url('${game.image_url}')`;
    document.getElementById('detailPlatform').innerText = game.platform;
    
    const badge = document.getElementById('detailStatusBadge');
    badge.innerText = game.status;
    badge.className = `badge ${getBadgeClass(game.status)}`;

    const priceEl = document.getElementById('detailPrice');
    const priceLabel = document.getElementById('detailPriceLabel');
    
    if (game.status === 'Desejado') {
        priceLabel.innerText = "CUSTO ESTIMADO";
        priceEl.style.color = "var(--warning)";
    } else if (game.status === 'À venda') {
         priceLabel.innerText = "VALOR DE VENDA";
         priceEl.style.color = "var(--success)";
    } else {
        priceLabel.innerText = "VALOR PAGO";
        priceEl.style.color = "var(--success)";
    }
    
    if (isShared) {
        if (game.status === 'À venda') priceEl.innerText = formatMoney(game.price_sold || 0);
        else priceEl.innerText = "---";
    } else {
        const valor = (game.status === 'À venda' || game.status === 'Vendido') ? game.price_sold : game.price_paid;
        priceEl.innerText = formatMoney(valor || 0);
    }

    const statsContainer = modal.querySelector('.modal-content > div > div:nth-child(2)');
    let tagsContainer = document.getElementById('detailTagsContainer');
    if (!tagsContainer) {
        tagsContainer = document.createElement('div');
        tagsContainer.id = 'detailTagsContainer';
        tagsContainer.style.marginTop = '15px';
        statsContainer.appendChild(tagsContainer);
    }
    tagsContainer.innerHTML = ''; 

    if (game.tags && Array.isArray(game.tags) && game.tags.length > 0) {
        tagsContainer.innerHTML = '<span style="display:block; font-size:0.75rem; color:#888; margin-bottom:5px">DETALHES</span><div class="detail-tags-list"></div>';
        const list = tagsContainer.querySelector('.detail-tags-list');
        game.tags.forEach(tag => list.innerHTML += `<span class="detail-tag">${tag}</span>`);
    }

    // Media Center Loading
    const videoArea = document.getElementById('detailVideoArea');
    if(videoArea) videoArea.innerHTML = '<div style="padding:20px; text-align:center; color:#666">Carregando Media Center...</div>';

    const btnEdit = document.getElementById('btnEditFromDetail');
    if (isShared) {
        btnEdit.classList.add('hidden');
    } else {
        btnEdit.classList.remove('hidden');
        btnEdit.onclick = () => {
            modal.classList.add('hidden');
            window.editGame(game.id);
        };
    }

    modal.classList.remove('hidden');

    const descEl = document.getElementById('detailDesc');
    const mcEl = document.getElementById('detailMetacritic');
    const linkEl = document.getElementById('detailLink');
    descEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando informações...';

    // API Call (Cache + Tradução + Trailers)
    const details = await GameService.getGameDetails(game.title);
    
    if (details) {
        const cleanDesc = details.description_ptbr || details.description_raw || "Sem descrição.";
        descEl.innerText = cleanDesc;
        
        mcEl.innerText = details.metacritic ? `MC: ${details.metacritic}` : "MC: N/A";
        mcEl.style.display = 'inline-block';
        
        if (details.website) {
            linkEl.href = details.website;
            linkEl.classList.remove('hidden');
        } else {
            linkEl.classList.add('hidden');
        }

        // Renderização do Media Center
        if(videoArea) {
            const hasTrailer = details.trailers && details.trailers.length > 0;
            const trailerUrl = hasTrailer ? details.trailers[0].data['480'] : null; 
            
            // Define o conteúdo inicial. Se tiver trailer, começa com ele. Se não, começa com Gameplay (Placeholder).
            let initialType = hasTrailer ? 'TRAILER' : 'Gameplay';
            
            videoArea.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h4 style="color: white; font-family: var(--font-num); font-size: 0.9rem; margin:0;">
                        <i class="fa-brands fa-youtube" style="color: #ff0000; margin-right: 8px;"></i> MEDIA CENTER
                    </h4>
                </div>

                <div class="video-controls">
                    <button class="video-chip ${hasTrailer ? 'active' : ''}" onclick="window.updateVideoContext('TRAILER', this, '${trailerUrl}')">TRAILER</button>
                    <button class="video-chip ${!hasTrailer ? 'active' : ''}" onclick="window.updateVideoContext('Gameplay', this)">GAMEPLAY</button>
                    <button class="video-chip" onclick="window.updateVideoContext('Longplay', this)">LONGPLAY</button>
                    <button class="video-chip" onclick="window.updateVideoContext('Análise', this)">ANÁLISE</button>
                </div>

                <div id="videoPlayerContainer"></div>
            `;

            // Dispara a primeira renderização
            setTimeout(() => {
                const btn = document.querySelector(`.video-chip.active`);
                if(btn) window.updateVideoContext(initialType, btn, trailerUrl);
            }, 50);
        }
    } else {
        descEl.innerText = "Detalhes não encontrados.";
        if(videoArea) videoArea.innerHTML = '';
        mcEl.style.display = 'none';
        linkEl.classList.add('hidden');
    }
};

const getBadgeClass = (status) => {
    const map = { 'Vendido': 'bg-sold', 'Jogando': 'bg-playing', 'Platinado': 'bg-plat', 'Jogo Zerado': 'bg-plat', 'Backlog': 'bg-backlog', 'Desejado': 'bg-wishlist', 'À venda': 'bg-sold' };
    return map[status] || 'bg-backlog';
};

// --- KPI & CHART ---
const renderKPIs = (allGames = [], isShared = false, currentFilter = 'collection') => {
    const DOM = getDOM();
    if (!DOM.kpi) return;
    
    // Filtro Lógico para KPI
    const jogosNaBase = allGames.filter(g => g.status !== 'Desejado' && g.status !== 'Vendido');
    const jogosDesejados = allGames.filter(g => g.status === 'Desejado');
    const jogosAVenda = allGames.filter(g => g.status === 'À venda');
    
    const finalizados = jogosNaBase.filter(g => ['Jogo Zerado', 'Platinado'].includes(g.status)).length;
    const totalBaseCount = jogosNaBase.length;
    const taxaConclusao = totalBaseCount > 0 ? Math.round((finalizados / totalBaseCount) * 100) : 0;
    
    // Correção: Investimento não deve somar jogos da Wishlist
    const totalInvestido = jogosNaBase.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const totalRecuperado = allGames.filter(g => g.status === 'Vendido').reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);

    if (isShared) {
        DOM.kpi.innerHTML = generateVisitorKPI(totalBaseCount, taxaConclusao);
    } else {
        if (currentFilter === 'wishlist') {
            const estimativa = jogosDesejados.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
            DOM.kpi.innerHTML = `<div class="kpi-card"><div><span class="kpi-label">Na Lista</span><div class="kpi-value" style="color:var(--warning)">${jogosDesejados.length}</div></div><i class="fa-solid fa-star fa-2x" style="opacity:0.2; color:var(--warning)"></i></div><div class="kpi-card"><div><span class="kpi-label">Custo Estimado</span><div class="kpi-value">${formatMoney(estimativa)}</div></div><i class="fa-solid fa-tag fa-2x" style="opacity:0.2;"></i></div><div class="kpi-card" style="opacity: 0.5"><div><span class="kpi-label">Saldo Atual</span><div class="kpi-value">${formatMoney(totalInvestido - totalRecuperado)}</div></div></div>`;
        } else if (currentFilter === 'store') {
            const potencial = jogosAVenda.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);
            DOM.kpi.innerHTML = `<div class="kpi-card"><div><span class="kpi-label">Itens à Venda</span><div class="kpi-value" style="color:var(--success)">${jogosAVenda.length}</div></div><i class="fa-solid fa-shop fa-2x" style="opacity:0.2; color:var(--success)"></i></div><div class="kpi-card"><div><span class="kpi-label">Receita Estimada</span><div class="kpi-value" style="color:var(--success)">${formatMoney(potencial)}</div></div><i class="fa-solid fa-sack-dollar fa-2x" style="opacity:0.2;"></i></div><div class="kpi-card" style="opacity: 0.5"><div><span class="kpi-label">Ticket Médio</span><div class="kpi-value">${jogosAVenda.length ? formatMoney(potencial / jogosAVenda.length) : 'R$ 0'}</div></div></div>`;
        } else {
            DOM.kpi.innerHTML = generateOwnerKPI(formatMoney(totalInvestido - totalRecuperado), taxaConclusao, formatMoney(totalRecuperado));
        }
    }
};

const generateVisitorKPI = (total, taxa) => `
    <div class="kpi-card"><div><span class="kpi-label">Jogos na Base</span><div class="kpi-value">${total}</div></div><i class="fa-solid fa-layer-group fa-2x" style="opacity:0.2;"></i></div>
    <div class="kpi-card"><div style="width:100%"><span class="kpi-label">Conclusão da Base</span><div style="display:flex; justify-content:space-between; align-items:center"><div class="kpi-value" style="color:var(--success)">${taxa}%</div><i class="fa-solid fa-trophy fa-2x" style="opacity:0.2;"></i></div><div class="progress-container"><div class="progress-bar" style="width: ${taxa}%; background:var(--success)"></div></div></div></div>`;

const generateOwnerKPI = (investLiq, taxa, recuperado) => `
    <div class="kpi-card"><div><span class="kpi-label">Investimento Líquido <span class="badge-pro">PRO</span></span><div class="kpi-value">${investLiq}</div></div><i class="fa-solid fa-wallet fa-2x" style="opacity:0.2; color:#FFD700"></i></div>
    <div class="kpi-card"><div style="width: 100%"><span class="kpi-label">Taxa de Conclusão</span><div style="display:flex; justify-content:space-between; align-items:baseline"><span class="kpi-value" style="color:var(--primary)">${taxa}%</span></div><div class="progress-container"><div class="progress-bar" style="width: ${taxa}%"></div></div></div></div>
    <div class="kpi-card"><div><span class="kpi-label">Retorno Vendas</span><div class="kpi-value" style="color:var(--success)">${recuperado}</div></div><i class="fa-solid fa-hand-holding-dollar fa-2x" style="opacity:0.2; color:var(--success)"></i></div>`;

let chartInstance = null;
const renderChart = (games, mode = 'platform', context = 'collection', allGames = []) => {
    const ctx = document.getElementById('collectionChart');
    if (!ctx) return;

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    if (!games || games.length === 0) return;

    const colors = ['#d946ef', '#0ea5e9', '#00ff9d', '#f59e0b', '#ff3366', '#ffd700', '#8b5cf6', '#ffffff'];
    const config = { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { 
            legend: { position: 'right', labels: { color: '#e2e8f0', usePointStyle: true, font: {family:'Inter'} } },
            tooltip: { backgroundColor: 'rgba(20,20,25,0.9)', titleColor: '#d946ef' }
        } 
    };

    if (mode === 'platform') {
        const platforms = {};
        games.forEach(g => platforms[g.platform] = (platforms[g.platform] || 0) + 1);
        
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: Object.keys(platforms), datasets: [{ data: Object.values(platforms), backgroundColor: colors, borderColor: '#0a0a0c', borderWidth: 2 }] },
            options: { 
                ...config, 
                cutout: '60%',
                // FIX: Evento de Clique
                onClick: (evt, elements) => {
                    if(elements.length > 0) {
                        const index = elements[0].index;
                        const label = Object.keys(platforms)[index];
                        appStore.setState({ activePlatform: label, chartMode: 'platform' });
                    }
                }
            }
        });
    } else if (mode === 'status') {
        const statuses = {};
        games.forEach(g => statuses[g.status] = (statuses[g.status] || 0) + 1);
        
        chartInstance = new Chart(ctx, {
            type: 'polarArea',
            data: { labels: Object.keys(statuses), datasets: [{ data: Object.values(statuses), backgroundColor: colors.map(c => c + '99'), borderColor: '#111', borderWidth: 1 }] },
            options: { 
                ...config, 
                scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { display: false } } },
                // FIX: Evento de Clique
                onClick: (evt, elements) => {
                    if(elements.length > 0) {
                        const index = elements[0].index;
                        const label = Object.keys(statuses)[index];
                        appStore.setState({ activePlatform: label, chartMode: 'status' });
                    }
                }
            }
        });
    } else if (mode === 'dna') {
        // ... (Manter código DNA anterior, radar não precisa de clique de filtro)
        const stats = { 'Acumulador': Math.min(allGames.length * 2, 100), 'Completista': 0, 'Investidor': 0, 'Diversificado': 0, 'Focado': 0 };
        const total = allGames.length || 1;
        stats['Completista'] = Math.round((allGames.filter(g => ['Platinado', 'Jogo Zerado'].includes(g.status)).length / total) * 100);
        stats['Focado'] = Math.round((1 - (allGames.filter(g => g.status === 'Backlog').length / total)) * 100);
        stats['Investidor'] = Math.min((allGames.reduce((acc, g) => acc + (g.price_paid || 0), 0) / 2000) * 100, 100);
        stats['Diversificado'] = Math.min((new Set(allGames.map(g => g.platform)).size / 5) * 100, 100);
        
        chartInstance = new Chart(ctx, { 
            type: 'radar', 
            data: { labels: Object.keys(stats), datasets: [{ label: 'Gamer DNA', data: Object.values(stats), backgroundColor: 'rgba(217, 70, 239, 0.2)', borderColor: '#d946ef', pointBackgroundColor: '#0ea5e9', borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { r: { angleLines: { color: 'rgba(255,255,255,0.1)' }, grid: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#fff', font: { family: 'Orbitron', size: 10 } }, ticks: { display: false, backdropColor: 'transparent' }, suggestedMin: 0, suggestedMax: 100 } }, plugins: { legend: { display: false } } } 
        });
    } else if (mode === 'cost') {
        // ... (Manter código Cost anterior)
        if (appStore.get().isSharedMode) return;
        const sorted = [...games].sort((a,b) => (context === 'store' ? b.price_sold - a.price_sold : b.price_paid - a.price_paid)).slice(0, 5);
        chartInstance = new Chart(ctx, { type: 'bar', data: { labels: sorted.map(g => g.title.substring(0,12)+'...'), datasets: [{ label: 'R$', data: sorted.map(g => context === 'store' ? g.price_sold : g.price_paid), backgroundColor: colors[1], borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' } }, y: { grid: { display: false }, ticks: { color: 'white' } } }, plugins: { legend: { display: false } } } });
    }
};

export const showToast = (msg, type = 'success') => {
    const DOM = getDOM();
    if(!DOM.toast) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'circle-check' : 'triangle-exclamation'}"></i> ${msg}`;
    DOM.toast.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
};

export const toggleModal = (show) => {
    const DOM = getDOM();
    if (show) DOM.modal.classList.remove('hidden');
    else DOM.modal.classList.add('hidden');
};

export const setupRoulette = () => {
    const btn = document.getElementById('btnRoulette');
    if(!btn) return;
    btn.onclick = () => {
        const { games } = appStore.get();
        const candidates = games.filter(g => ['Backlog', 'Coleção', 'Jogando'].includes(g.status));
        if(candidates.length === 0) { showToast("Nenhum jogo jogável no backlog!", "error"); return; }
        const modal = document.getElementById('rouletteModal');
        const display = document.getElementById('rouletteDisplay');
        modal.classList.remove('hidden');
        display.innerHTML = `<div class="roulette-card" style="background-image: url('https://media.giphy.com/media/3o7bu3XilJ5BOiSGic/giphy.gif'); border-color:var(--secondary)"></div><p class="modal-desc">Consultando os deuses do gaming...</p>`;
        setTimeout(() => {
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            display.innerHTML = `<div class="roulette-card winner" style="background-image: url('${winner.image_url || ''}')"></div><h3 style="color:white; font-size:1.5rem; margin-bottom:10px">${winner.title}</h3><span class="badge bg-backlog">${winner.platform}</span>`;
            if(window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 6000 });
        }, 2500);
    };
};

export const exportData = () => {
    const { games } = appStore.get();
    if(!games || games.length === 0) { showToast("Nada para exportar!", "error"); return; }
    const dataStr = JSON.stringify(games, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gamevault_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Backup baixado com sucesso!");
};

// --- NOVO: GERADOR DE CARD SOCIAL (HTML2CANVAS) ---
export const generateSocialCard = async () => {
    const { user, games, sharedProfileName } = appStore.get();
    const dom = getDOM();
    
    showToast("Gerando card Pro... aguarde.", "success");

    // 1. Popular os dados no Template Oculto
    const card = document.getElementById('socialCardHidden');
    const avatar = document.getElementById('scAvatar');
    const name = document.getElementById('scName');
    const level = document.getElementById('scLevel');
    
    const statGames = document.getElementById('scTotalGames');
    const statCompleted = document.getElementById('scCompleted');
    const statValue = document.getElementById('scValue');
    const statPlatform = document.getElementById('scTopPlatform');

    // Dados Básicos
    name.innerText = sharedProfileName ? sharedProfileName.toUpperCase() : "GAMER";
    level.innerText = dom.levelBadge.innerText; 
    
    if(user && user.user_metadata && user.user_metadata.avatar_url) {
        avatar.src = user.user_metadata.avatar_url;
    } else {
        avatar.src = "https://ui-avatars.com/api/?name=" + (sharedProfileName || "Player") + "&background=0ea5e9&color=fff";
    }

    // --- LÓGICA CORRIGIDA (Sprint 4) ---
    // Total de Jogos (Exclui Desejados do total da "Base")
    const ownedGames = games.filter(g => g.status !== 'Desejado');
    const totalGames = ownedGames.length;
    
    // Completados
    const completed = games.filter(g => ['Platinado', 'Jogo Zerado'].includes(g.status)).length;
    
    // Investimento (CORREÇÃO: Filtra fora 'Desejado' antes de somar)
    const totalInvest = ownedGames.reduce((acc, g) => acc + (g.price_paid || 0), 0);
    
    // Calcula Top Plataforma
    const platforms = {};
    ownedGames.forEach(g => { platforms[g.platform] = (platforms[g.platform] || 0) + 1; });
    
    let topPlat = "N/A";
    if (Object.keys(platforms).length > 0) {
        topPlat = Object.keys(platforms).reduce((a, b) => platforms[a] > platforms[b] ? a : b);
    }

    // Injeta Valores
    statGames.innerText = totalGames;
    statCompleted.innerText = completed;
    statValue.innerText = formatMoney(totalInvest);
    
    statPlatform.innerText = topPlat;
    if(topPlat.length > 10) statPlatform.style.fontSize = "1.4rem";
    else statPlatform.style.fontSize = "1.8rem";

    // 2. Gerar Canvas
    try {
        await new Promise(r => setTimeout(r, 100)); // Delay para imagens

        const canvas = await html2canvas(card, {
            backgroundColor: '#050505',
            scale: 1.5,
            useCORS: true,
            logging: false
        });

        const link = document.createElement('a');
        link.download = `GameVault_Card_${sharedProfileName || 'Gamer'}.png`;
        link.href = canvas.toDataURL("image/png", 1.0);
        link.click();
        
        showToast("Card gerado com sucesso!");
    } catch (err) {
        console.error(err);
        showToast("Erro ao gerar imagem. Tente novamente.", "error");
    }
};