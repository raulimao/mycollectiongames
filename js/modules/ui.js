import { appStore } from './store.js';

// Cache DOM Helper
const getDOM = () => ({
    grid: document.getElementById('gamesContainer'),
    kpi: document.getElementById('kpi-container'),
    toast: document.getElementById('toastContainer'),
    modal: document.getElementById('gameModal'),
    filterBadge: document.getElementById('chartFilterBadge'),
    filterName: document.getElementById('filterName')
});

// Funções Expostas ao Window (Necessário para onclick no HTML)
window.switchChart = (mode) => {
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    // Encontra o botão certo baseado na ordem ou texto
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

    // 1. Controle de Visibilidade UI (Visitante vs Dono)
    const controlsPanel = document.querySelector('.controls-panel');
    const costTab = document.querySelectorAll('.chart-tab')[2];
    const headerActions = document.getElementById('headerActions');

    if(isShared) {
        if(controlsPanel) controlsPanel.classList.add('hidden');
        if(costTab) costTab.style.display = 'none';
        if(headerActions) headerActions.innerHTML = `<span class="badge bg-playing">Visitando: ${state.sharedProfileName}</span>`;
    } else {
        if(controlsPanel) controlsPanel.classList.remove('hidden');
        if(costTab) costTab.style.display = 'inline-flex';
    }

    // 2. Filtragem de Dados
    let filteredGames = state.games || [];
    const term = state.searchTerm?.toLowerCase() || '';
    const filter = state.filter || 'collection';

    // Filtro Lógico
    if (filter === 'sold') {
        filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    } else if (filter === 'wishlist') {
        // NOVO: Filtro da Lista de Desejos
        filteredGames = filteredGames.filter(g => g.status === 'Desejado');
    } else if (filter === 'backlog') {
        filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    } else {
        // COLEÇÃO (Padrão): Exclui Vendidos, Backlog e agora também o Desejado
        filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog', 'Desejado'].includes(g.status));
    }

    // Filtro de Busca
    if (term) filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));

    // Filtro de Gráfico
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
    // Passamos o filtro atual para renderKPIs saber se mostra custos ou estimativas
    renderKPIs(state.games, isShared, filter); 
    renderGrid(filteredGames, isShared);
    renderChart(state.games, state.chartMode);
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
        
        if(!isShared) {
            card.onclick = () => window.editGame(game.id);
        } else {
            card.style.cursor = 'default';
        }

        const badgeClass = getBadgeClass(game.status);
        const bgImage = game.image_url || 'https://via.placeholder.com/400x600?text=No+Cover';
        
        let priceDisplay = '';
        if (!isShared) {
            if (game.status === 'Vendido') {
                const profit = (game.price_sold || 0) - (game.price_paid || 0);
                const sign = profit >= 0 ? '+' : '';
                const colorClass = profit >= 0 ? 'text-green' : 'text-danger';
                const val = formatMoney(profit).replace('R$', '').trim();
                priceDisplay = `<span class="${colorClass}" style="font-weight:bold;">${sign} R$ ${val}</span>`;
            } else {
                // Para Wishlist, price_paid funciona como "Preço Esperado"
                priceDisplay = formatMoney(game.price_paid);
            }
        }

        card.innerHTML = `
            <div class="card-img-wrapper">
                <div class="card-img" style="background-image: url('${bgImage}')"></div>
                <div class="card-overlay"></div>
            </div>
            <div class="card-body">
                <span class="card-platform">${game.platform || 'Outros'}</span>
                <h3 class="card-title">${game.title}</h3>
                <div class="card-footer">
                    <div class="price-tag">${priceDisplay}</div>
                    <span class="badge ${badgeClass}">${game.status}</span>
                </div>
            </div>
        `;
        DOM.grid.appendChild(card);
    });
};

const getBadgeClass = (status) => {
    const map = {
        'Vendido': 'bg-sold',
        'Jogando': 'bg-playing',
        'Platinado': 'bg-plat',
        'Zerado': 'bg-plat',
        'Backlog': 'bg-backlog',
        'Desejado': 'bg-wishlist' // Badge Nova
    };
    return map[status] || 'bg-backlog';
};

// --- KPIs ---
const renderKPIs = (allGames = [], isShared = false, currentFilter = 'collection') => {
    const DOM = getDOM();
    if (!DOM.kpi) return;
    
    // Separação Lógica: O que eu tenho vs O que eu quero
    const jogosPossuidos = allGames.filter(g => g.status !== 'Desejado');
    const jogosDesejados = allGames.filter(g => g.status === 'Desejado');
    
    const totalJogos = jogosPossuidos.length;
    
    // Tratamento para estado vazio geral
    if (totalJogos === 0 && jogosDesejados.length === 0) {
        DOM.kpi.innerHTML = `
            <div class="kpi-card"><div><span class="kpi-label">Coleção</span><div class="kpi-value">0</div></div></div>
            <div class="kpi-card"><div><span class="kpi-label">Progresso</span><div class="kpi-value">0%</div></div></div>
            ${!isShared ? '<div class="kpi-card"><div><span class="kpi-label">Investido</span><div class="kpi-value">R$ 0</div></div></div>' : ''}
        `;
        return;
    }

    // Métricas Padrão (Baseadas na POSSE)
    const finalizados = jogosPossuidos.filter(g => ['Zerado', 'Platinado', 'Vendido'].includes(g.status)).length;
    const taxaConclusao = totalJogos > 0 ? Math.round((finalizados / totalJogos) * 100) : 0;
    
    const totalInvestido = jogosPossuidos.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const vendidos = jogosPossuidos.filter(g => g.status === 'Vendido');
    const totalRecuperado = vendidos.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);

    if (isShared) {
        DOM.kpi.innerHTML = generateVisitorKPI(totalJogos, taxaConclusao);
    } else {
        // Se a aba for Wishlist, mostra KPIs de planejamento financeiro
        if (currentFilter === 'wishlist') {
            const estimativaCusto = jogosDesejados.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
            
            DOM.kpi.innerHTML = `
                <div class="kpi-card">
                    <div><span class="kpi-label">Na Lista</span><div class="kpi-value" style="color:var(--warning)">${jogosDesejados.length}</div></div>
                    <i class="fa-solid fa-star fa-2x" style="opacity:0.2; color:var(--warning)"></i>
                </div>
                 <div class="kpi-card">
                    <div>
                        <span class="kpi-label">Custo Estimado</span>
                        <div class="kpi-value">${formatMoney(estimativaCusto)}</div>
                    </div>
                    <i class="fa-solid fa-tag fa-2x" style="opacity:0.2;"></i>
                </div>
                 <div class="kpi-card" style="opacity: 0.5">
                    <div><span class="kpi-label">Saldo Atual</span><div class="kpi-value">${formatMoney(totalInvestido - totalRecuperado)}</div></div>
                </div>
            `;
        } else {
            // KPI Padrão (Dono)
            const investimentoLiq = totalInvestido - totalRecuperado;
            DOM.kpi.innerHTML = generateOwnerKPI(
                formatMoney(investimentoLiq),
                taxaConclusao,
                formatMoney(totalRecuperado)
            );
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
            <span class="kpi-label">Conclusão</span>
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
const renderChart = (games, mode = 'platform') => {
    const ctx = document.getElementById('collectionChart');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    if (!games || games.length === 0) return;

    const colors = ['#d946ef', '#0ea5e9', '#00ff9d', '#f59e0b', '#ff3366', '#ffd700', '#8b5cf6'];
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
        const sorted = [...games].sort((a,b) => b.price_paid - a.price_paid).slice(0, 5);
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(g => g.title.length > 15 ? g.title.substring(0,15)+'...' : g.title),
                datasets: [{ label: 'Custo (R$)', data: sorted.map(g => g.price_paid), backgroundColor: colors[1], borderRadius: 4 }]
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