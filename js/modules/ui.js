import { appStore } from './store.js';
import { GameService } from '../services/api.js';

// Cache DOM Helper
const getDOM = () => ({
    grid: document.getElementById('gamesContainer'),
    kpi: document.getElementById('kpi-container'),
    toast: document.getElementById('toastContainer'),
    modal: document.getElementById('gameModal'),
    filterBadge: document.getElementById('chartFilterBadge'),
    filterName: document.getElementById('filterName')
});

// Funções Expostas ao Window
window.switchChart = (mode) => {
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    const tabs = document.querySelectorAll('.chart-tab');
    if(mode === 'platform' && tabs[0]) tabs[0].classList.add('active');
    if(mode === 'status' && tabs[1]) tabs[1].classList.add('active');
    if(mode === 'cost' && tabs[2]) tabs[2].classList.add('active');
    
    appStore.setState({ chartMode: mode });
};

window.clearChartFilter = () => {
    appStore.setState({ activePlatform: null });
};

// Utils
const formatMoney = (val) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// --- RENDER MAIN ---
export const renderApp = (state) => {
    const DOM = getDOM();
    const isShared = state.isSharedMode;

    // 1. Controle de Visibilidade UI
    const controlsPanel = document.querySelector('.controls-panel');
    const costTab = document.querySelectorAll('.chart-tab')[2];
    const headerActions = document.getElementById('headerActions');
    const btnAddGame = document.getElementById('btnOpenAddModal');

    if(isShared) {
        if(controlsPanel) controlsPanel.classList.remove('hidden'); 
        if(btnAddGame) btnAddGame.classList.add('hidden'); 
        if(costTab) costTab.style.display = 'none'; 
        if(headerActions) headerActions.innerHTML = `<span class="badge bg-playing">Visitando: ${state.sharedProfileName}</span>`;
    } else {
        if(controlsPanel) controlsPanel.classList.remove('hidden');
        if(btnAddGame) btnAddGame.classList.remove('hidden');
        if(costTab) costTab.style.display = 'inline-flex';
    }

    // 2. Filtragem de Dados
    let filteredGames = state.games || [];
    const term = state.searchTerm?.toLowerCase() || '';
    const filter = state.filter || 'collection';

    // Lógica de Filtros Atualizada
    if (filter === 'sold') {
        filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    } else if (filter === 'wishlist') {
        filteredGames = filteredGames.filter(g => g.status === 'Desejado');
    } else if (filter === 'store') {
        filteredGames = filteredGames.filter(g => g.status === 'À venda');
    } else if (filter === 'backlog') {
        filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    } else {
        filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog', 'Desejado'].includes(g.status));
    }

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

    // 3. Renderização
    renderKPIs(state.games, isShared, filter);
    renderGrid(filteredGames, isShared);
    renderChart(filteredGames, state.chartMode, filter); 
};

// --- GRID ---
const renderGrid = (games, isShared) => {
    const DOM = getDOM();
    if(!DOM.grid) return;
    DOM.grid.innerHTML = '';
    
    if (games.length === 0) {
        DOM.grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-muted);">
                <i class="fa-solid fa-ghost fa-3x" style="margin-bottom:20px; opacity:0.3;"></i>
                <p>Nenhum jogo encontrado nesta seção.</p>
            </div>`;
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        
        card.onclick = () => openGameDetails(game, isShared);

        // NOVO: Hover Dinâmico de Capa
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
        
        // Renderizar Tags Mini
        let tagsHtml = '';
        if (game.tags && Array.isArray(game.tags) && game.tags.length > 0) {
            tagsHtml = '<div class="card-tags">';
            game.tags.forEach(tag => {
                const classMap = tag.toLowerCase(); 
                tagsHtml += `<span class="mini-tag ${classMap}">${tag}</span>`;
            });
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
                 priceDisplay = `<span style="color:var(--success)">${formatMoney(game.price_sold)}</span>`;
            } else {
                priceDisplay = formatMoney(game.price_paid);
            }
        } else {
            // LÓGICA DO VISITANTE
            if (game.status === 'À venda') {
                const valorVenda = game.price_sold || 0;
                priceDisplay = `<span style="color:var(--success); font-weight:bold;">${formatMoney(valorVenda)}</span>`;
            } else {
                priceDisplay = ''; 
            }
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
            </div>
        `;
        DOM.grid.appendChild(card);
    });
};

// --- MODAL RICO (HUB) ---
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
    
    // Configura Valor Exibido
    if (isShared) {
        if (game.status === 'À venda') {
            priceEl.innerText = formatMoney(game.price_sold || 0);
        } else {
            priceEl.innerText = "---";
        }
    } else {
        const valor = (game.status === 'À venda' || game.status === 'Vendido') ? game.price_sold : game.price_paid;
        priceEl.innerText = formatMoney(valor || 0);
    }

    // Renderizar Tags no Detalhe
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
        game.tags.forEach(tag => {
            list.innerHTML += `<span class="detail-tag">${tag}</span>`;
        });
    }

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
    
    descEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando dados na rede...';

    const details = await GameService.getGameDetails(game.title);
    
    if (details) {
        const cleanDesc = details.description_raw || details.description || "Sem descrição disponível.";
        descEl.innerText = cleanDesc.length > 400 ? cleanDesc.substring(0, 400) + "..." : cleanDesc;
        
        mcEl.innerText = details.metacritic ? `MC: ${details.metacritic}` : "MC: N/A";
        mcEl.style.display = 'inline-block';
        
        if (details.website) {
            linkEl.href = details.website;
            linkEl.classList.remove('hidden');
        } else {
            linkEl.classList.add('hidden');
        }
    } else {
        descEl.innerText = "Detalhes adicionais não encontrados.";
        mcEl.style.display = 'none';
        linkEl.classList.add('hidden');
    }
};

const getBadgeClass = (status) => {
    const map = {
        'Vendido': 'bg-sold',
        'Jogando': 'bg-playing',
        'Platinado': 'bg-plat',
        'Jogo Zerado': 'bg-plat',
        'Backlog': 'bg-backlog',
        'Desejado': 'bg-wishlist',
        'À venda': 'bg-sold'
    };
    return map[status] || 'bg-backlog';
};

// --- KPIs ---
const renderKPIs = (allGames = [], isShared = false, currentFilter = 'collection') => {
    const DOM = getDOM();
    if (!DOM.kpi) return;
    
    const jogosNaBase = allGames.filter(g => g.status !== 'Desejado' && g.status !== 'Vendido');
    const jogosDesejados = allGames.filter(g => g.status === 'Desejado');
    const jogosAVenda = allGames.filter(g => g.status === 'À venda');
    
    const finalizados = jogosNaBase.filter(g => ['Jogo Zerado', 'Platinado'].includes(g.status)).length;
    const totalBaseCount = jogosNaBase.length;
    const taxaConclusao = totalBaseCount > 0 ? Math.round((finalizados / totalBaseCount) * 100) : 0;
    
    const totalInvestido = jogosNaBase.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const vendidos = allGames.filter(g => g.status === 'Vendido');
    const totalRecuperado = vendidos.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);

    if (isShared) {
        DOM.kpi.innerHTML = generateVisitorKPI(totalBaseCount, taxaConclusao);
    } else {
        if (currentFilter === 'wishlist') {
            const estimativaCusto = jogosDesejados.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
            DOM.kpi.innerHTML = `
                <div class="kpi-card"><div><span class="kpi-label">Na Lista</span><div class="kpi-value" style="color:var(--warning)">${jogosDesejados.length}</div></div><i class="fa-solid fa-star fa-2x" style="opacity:0.2; color:var(--warning)"></i></div>
                <div class="kpi-card"><div><span class="kpi-label">Custo Estimado</span><div class="kpi-value">${formatMoney(estimativaCusto)}</div></div><i class="fa-solid fa-tag fa-2x" style="opacity:0.2;"></i></div>
                <div class="kpi-card" style="opacity: 0.5"><div><span class="kpi-label">Saldo Atual</span><div class="kpi-value">${formatMoney(totalInvestido - totalRecuperado)}</div></div></div>
            `;
        } else if (currentFilter === 'store') {
            const potencialReceita = jogosAVenda.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);
            DOM.kpi.innerHTML = `
                <div class="kpi-card"><div><span class="kpi-label">Itens à Venda</span><div class="kpi-value" style="color:var(--success)">${jogosAVenda.length}</div></div><i class="fa-solid fa-shop fa-2x" style="opacity:0.2; color:var(--success)"></i></div>
                <div class="kpi-card"><div><span class="kpi-label">Receita Estimada</span><div class="kpi-value" style="color:var(--success)">${formatMoney(potencialReceita)}</div></div><i class="fa-solid fa-sack-dollar fa-2x" style="opacity:0.2;"></i></div>
                <div class="kpi-card" style="opacity: 0.5"><div><span class="kpi-label">Ticket Médio</span><div class="kpi-value">${jogosAVenda.length ? formatMoney(potencialReceita / jogosAVenda.length) : 'R$ 0'}</div></div></div>
            `;
        } else {
            const investimentoLiq = totalInvestido - totalRecuperado;
            DOM.kpi.innerHTML = generateOwnerKPI(formatMoney(investimentoLiq), taxaConclusao, formatMoney(totalRecuperado));
        }
    }
};

const generateVisitorKPI = (total, taxa) => `
    <div class="kpi-card">
        <div><span class="kpi-label">Jogos na Base</span><div class="kpi-value">${total}</div></div>
        <i class="fa-solid fa-layer-group fa-2x" style="opacity:0.2;"></i>
    </div>
    <div class="kpi-card">
        <div style="width:100%">
            <span class="kpi-label">Conclusão da Base</span>
            <div style="display:flex; justify-content:space-between; align-items:center">
                <div class="kpi-value" style="color:var(--success)">${taxa}%</div>
                <i class="fa-solid fa-trophy fa-2x" style="opacity:0.2;"></i>
            </div>
            <div class="progress-container"><div class="progress-bar" style="width: ${taxa}%; background:var(--success)"></div></div>
        </div>
    </div>
`;

const generateOwnerKPI = (investLiq, taxa, recuperado) => `
    <div class="kpi-card">
        <div>
            <span class="kpi-label">Investimento Líquido <span class="badge-pro">PRO</span></span>
            <div class="kpi-value">${investLiq}</div>
        </div>
        <i class="fa-solid fa-wallet fa-2x" style="opacity:0.2; color:#FFD700"></i>
    </div>
    <div class="kpi-card">
        <div style="width: 100%">
            <span class="kpi-label">Taxa de Conclusão</span>
            <div style="display:flex; justify-content:space-between; align-items:baseline">
                <span class="kpi-value" style="color:var(--primary)">${taxa}%</span>
            </div>
            <div class="progress-container"><div class="progress-bar" style="width: ${taxa}%"></div></div>
        </div>
    </div>
    <div class="kpi-card">
        <div><span class="kpi-label">Retorno Vendas</span><div class="kpi-value" style="color:var(--success)">${recuperado}</div></div>
        <i class="fa-solid fa-hand-holding-dollar fa-2x" style="opacity:0.2; color:var(--success)"></i>
    </div>
`;

// --- CHART ---
let chartInstance = null;
const renderChart = (games, mode = 'platform', context = 'collection') => {
    const ctx = document.getElementById('collectionChart');
    if (!ctx) return;

    const titleDeco = document.querySelector('.chart-title-deco');
    if(titleDeco) {
        let contextName = 'SYSTEM';
        if (context === 'wishlist') contextName = 'WISHLIST';
        if (context === 'store') contextName = 'STORE';
        titleDeco.innerText = `ANALYTICS // ${contextName}`;
    }

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    if (!games || games.length === 0) return;

    const colors = ['#d946ef', '#0ea5e9', '#00ff9d', '#f59e0b', '#ff3366', '#ffd700', '#8b5cf6'];
    let barColor = colors[1];
    if (context === 'wishlist') barColor = '#f59e0b';
    if (context === 'store') barColor = '#00ff9d';

    const config = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: '#e2e8f0', usePointStyle: true, font: {family:'Inter'} } } }
    };

    if (mode === 'platform') {
        const platforms = {};
        games.forEach(g => { platforms[g.platform] = (platforms[g.platform] || 0) + 1; });
        
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(platforms),
                datasets: [{ data: Object.values(platforms), backgroundColor: colors, borderColor: '#0a0a0c', borderWidth: 2 }]
            },
            options: { ...config, cutout: '60%', onClick: (evt, el) => {
                if(el.length > 0) appStore.setState({ activePlatform: Object.keys(platforms)[el[0].index] });
            }}
        });
    } else if (mode === 'status') {
        const statuses = {};
        games.forEach(g => { statuses[g.status] = (statuses[g.status] || 0) + 1; });
        chartInstance = new Chart(ctx, {
            type: 'polarArea',
            data: {
                labels: Object.keys(statuses),
                datasets: [{ data: Object.values(statuses), backgroundColor: colors.map(c => c + '99'), borderColor: '#111', borderWidth: 1 }]
            },
            options: { ...config, scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { display: false, backdropColor: 'transparent' } } } }
        });
    } else if (mode === 'cost') {
        if (appStore.get().isSharedMode) return;
        
        const sorted = [...games].sort((a,b) => {
            const priceA = context === 'store' ? a.price_sold : a.price_paid;
            const priceB = context === 'store' ? b.price_sold : b.price_paid;
            return priceB - priceA;
        }).slice(0, 5);
        
        let label = 'Custo Real (R$)';
        if (context === 'wishlist') label = 'Estimativa (R$)';
        if (context === 'store') label = 'Valor Venda (R$)';

        const dataPoints = sorted.map(g => context === 'store' ? g.price_sold : g.price_paid);

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(g => g.title.length > 15 ? g.title.substring(0,15)+'...' : g.title),
                datasets: [{ label: label, data: dataPoints, backgroundColor: barColor, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' } }, y: { grid: { display: false }, ticks: { color: 'white' } } },
                plugins: { legend: { display: false } }
            }
        });
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

// --- NOVO: LÓGICA DO BACKLOG KILLER ---
export const setupRoulette = () => {
    const btn = document.getElementById('btnRoulette');
    if(!btn) return;

    btn.onclick = () => {
        const { games } = appStore.get();
        // Filtra apenas Backlog e Jogando e Coleção (Jogos não finalizados)
        // Ignora Vendidos, Desejados, Zerados e Platinados
        const candidates = games.filter(g => ['Backlog', 'Coleção', 'Jogando'].includes(g.status));
        
        if(candidates.length === 0) {
            showToast("Nenhum jogo jogável no backlog!", "error");
            return;
        }

        // Abre Modal
        const modal = document.getElementById('rouletteModal');
        const display = document.getElementById('rouletteDisplay');
        modal.classList.remove('hidden');
        
        // Estado de "Embaralhando"
        display.innerHTML = `
            <div class="roulette-card" style="background-image: url('https://media.giphy.com/media/3o7bu3XilJ5BOiSGic/giphy.gif'); border-color:var(--secondary)"></div>
            <p class="modal-desc">Consultando os deuses do gaming...</p>
        `;

        // Delay para suspense (2.5s)
        setTimeout(() => {
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            const bg = winner.image_url || 'https://via.placeholder.com/400x600';
            
            display.innerHTML = `
                <div class="roulette-card winner" style="background-image: url('${bg}')"></div>
                <h3 style="color:white; font-size:1.5rem; margin-bottom:10px">${winner.title}</h3>
                <span class="badge bg-backlog">${winner.platform}</span>
            `;
            
            // Confetti Effect (Se a lib estiver carregada)
            if(window.confetti) {
                window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            }
        }, 2500);
    };
};