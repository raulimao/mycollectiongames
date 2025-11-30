import { appStore } from './store.js';

const DOM = {
    grid: document.getElementById('gamesContainer'),
    kpi: document.getElementById('kpi-container'),
    toast: document.getElementById('toastContainer'),
    modal: document.getElementById('gameModal'),
    filterBadge: document.getElementById('chartFilterBadge'),
    filterName: document.getElementById('filterName')
};

window.switchChart = (mode) => {
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    const btns = document.querySelectorAll('.chart-tab');
    
    // Lógica para ativar abas
    if(mode === 'platform' && btns[0]) btns[0].classList.add('active');
    if(mode === 'status' && btns[1]) btns[1].classList.add('active');
    if(mode === 'cost' && btns[2]) btns[2].classList.add('active');

    appStore.setState({ chartMode: mode });
};

window.clearChartFilter = () => {
    appStore.setState({ activePlatform: null });
};

export const renderApp = (state) => {
    // Ajustes de Visibilidade baseados no Modo Compartilhado
    const isShared = state.isSharedMode;
    
    // Esconde controles de edição se for visitante
    const controlsPanel = document.querySelector('.filters-group');
    if(controlsPanel) {
        if(isShared) controlsPanel.classList.add('hidden');
        else controlsPanel.classList.remove('hidden');
    }

    // Esconde aba "Gastos" do gráfico se for visitante
    const costTab = document.querySelectorAll('.chart-tab')[2];
    if(costTab) {
        if(isShared) costTab.style.display = 'none';
        else costTab.style.display = 'inline-block';
    }

    let filteredGames = state.games || [];
    const term = state.searchTerm?.toLowerCase() || '';
    const filter = state.filter || 'collection';

    if (filter === 'sold') {
        filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    } else if (filter === 'backlog') {
        filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    } else {
        filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog'].includes(g.status));
    }

    if (term) filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));

    if (state.activePlatform) {
        filteredGames = filteredGames.filter(g => g.platform === state.activePlatform);
        DOM.filterBadge.classList.remove('hidden');
        DOM.filterName.innerText = state.activePlatform;
    } else {
        DOM.filterBadge.classList.add('hidden');
    }

    renderGrid(filteredGames, isShared);
    renderKPIs(state.games, isShared);
    renderChart(state.games, state.chartMode);
};

// --- GRID ---
const renderGrid = (games, isShared) => {
    DOM.grid.innerHTML = '';
    
    if (games.length === 0) {
        DOM.grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-muted); font-size:1.1rem;">Nada encontrado.</div>`;
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        
        // Se for compartilhado, remove o clique de edição
        if(!isShared) {
            card.onclick = () => window.editGame(game.id);
        } else {
            card.style.cursor = 'default';
            card.onclick = null; // Remove ação
        }

        const badgeClass = getBadgeClass(game.status);
        const bgImage = game.image_url || 'https://via.placeholder.com/400x600?text=No+Cover';
        
        // Lógica de Preço (Ocultar se for compartilhado)
        let priceDisplay = '';
        if (!isShared) {
            if (game.status === 'Vendido') {
                const profit = (game.price_sold || 0) - (game.price_paid || 0);
                const sign = profit >= 0 ? '+' : '';
                priceDisplay = `<span class="${profit >= 0 ? 'text-green' : 'text-danger'}">${sign} R$ ${profit.toFixed(2)}</span>`;
            } else {
                priceDisplay = `R$ ${(parseFloat(game.price_paid) || 0).toFixed(2)}`;
            }
        } else {
            // Visitante vê apenas um icone ou nada
            priceDisplay = `<span style="font-size:0.8rem; opacity:0.5">---</span>`;
        }

        card.innerHTML = `
            <div class="card-img-wrapper">
                <div class="card-img" style="background-image: url('${bgImage}')"></div>
                <div class="card-overlay"></div>
            </div>
            <div class="card-body">
                <span class="card-platform">${game.platform || 'Desconhecido'}</span>
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
    switch (status) {
        case 'Vendido': return 'bg-sold';
        case 'Jogando': return 'bg-playing';
        case 'Platinado': return 'bg-plat';
        case 'Backlog': return 'bg-backlog';
        default: return 'bg-backlog';
    }
};

// --- KPIs ---
const renderKPIs = (allGames, isShared) => {
    if (!DOM.kpi) return;
    
    const totalJogos = allGames.length;
    const finalizados = allGames.filter(g => ['Zerado', 'Platinado', 'Vendido'].includes(g.status)).length;
    const backlog = allGames.filter(g => ['Backlog', 'Coleção'].includes(g.status)).length;
    const taxaConclusao = totalJogos > 0 ? Math.round((finalizados / totalJogos) * 100) : 0;
    
    // Se for compartilhado, renderiza apenas KPIs seguros
    if (isShared) {
        DOM.kpi.innerHTML = `
            <div class="kpi-card">
                <div>
                    <span class="kpi-label">Coleção Pública</span>
                    <div class="kpi-value">${totalJogos} JOGOS</div>
                </div>
                <i class="fa-solid fa-layer-group fa-3x" style="opacity:0.2; color:var(--primary)"></i>
            </div>

            <div class="kpi-card">
                <div style="width: 100%">
                    <div style="display:flex; justify-content:space-between;">
                        <span class="kpi-label">Taxa de Conclusão</span>
                        <span style="font-family:var(--font-num); color:var(--success)">${taxaConclusao}%</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${taxaConclusao}%; background:var(--success)"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:0.75rem; color:var(--text-muted);">
                        <span>${finalizados} Zerados</span>
                        <span>${backlog} Restantes</span>
                    </div>
                </div>
            </div>
        `;
        // Ajusta grid para 2 colunas apenas quando compartilhado
        DOM.kpi.style.gridTemplateColumns = "1fr 1fr"; 
        return;
    }

    // MODO DONO (Mostra Dinheiro)
    DOM.kpi.style.gridTemplateColumns = ""; // Reseta grid
    const totalInvestido = allGames.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const vendidos = allGames.filter(g => g.status === 'Vendido');
    const totalRecuperado = vendidos.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);
    
    DOM.kpi.innerHTML = `
        <div class="kpi-card">
            <div>
                <span class="kpi-label">Investimento Líquido <span class="badge-pro">PRO</span></span>
                <div class="kpi-value">R$ ${(totalInvestido - totalRecuperado).toFixed(2)}</div>
                <small style="color:var(--text-muted); font-size:0.7rem">(Gasto R$ ${totalInvestido.toFixed(0)} - Recup. R$ ${totalRecuperado.toFixed(0)})</small>
            </div>
            <i class="fa-solid fa-wallet fa-2x" style="opacity:0.2; color:#FFD700"></i>
        </div>

        <div class="kpi-card">
            <div style="width: 100%">
                <div style="display:flex; justify-content:space-between;">
                    <span class="kpi-label">Taxa de Conclusão</span>
                    <span style="font-family:var(--font-num); color:var(--primary)">${taxaConclusao}%</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${taxaConclusao}%"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:0.75rem; color:var(--text-muted);">
                    <span>${finalizados} Finalizados</span>
                    <span>${backlog} Restantes</span>
                </div>
            </div>
        </div>

        <div class="kpi-card">
             <div>
                <span class="kpi-label">Valor em Vendas</span>
                <div class="kpi-value text-green">R$ ${totalRecuperado.toFixed(2)}</div>
            </div>
            <i class="fa-solid fa-hand-holding-dollar fa-2x" style="opacity:0.2; color:var(--success)"></i>
        </div>
    `;
};

// --- CHART ---
let chartInstance = null;
const renderChart = (games, mode = 'platform') => {
    const ctx = document.getElementById('collectionChart');
    if (!ctx) return;
    if (chartInstance) chartInstance.destroy();

    const colors = ['#d946ef', '#0ea5e9', '#00ff9d', '#f59e0b', '#ff3366', '#ffd700', '#8b5cf6'];

    if (mode === 'platform') {
        const platforms = {};
        games.forEach(g => { platforms[g.platform] = (platforms[g.platform] || 0) + 1; });
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(platforms),
                datasets: [{ data: Object.values(platforms), backgroundColor: colors, borderColor: '#0a0a0c', borderWidth: 2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: { legend: { position: 'right', labels: { color: '#e2e8f0', usePointStyle: true, font: {family:'Inter'} } } },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        appStore.setState({ activePlatform: Object.keys(platforms)[index] });
                    }
                }
            }
        });
    } else if (mode === 'status') {
        const statuses = {};
        games.forEach(g => { statuses[g.status] = (statuses[g.status] || 0) + 1; });
        chartInstance = new Chart(ctx, {
            type: 'polarArea',
            data: {
                labels: Object.keys(statuses),
                datasets: [{ data: Object.values(statuses), backgroundColor: colors.map(c => c + '99'), borderColor: colors, borderWidth: 1 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { display: false, backdropColor: 'transparent' } } },
                plugins: { legend: { position: 'right', labels: { color: '#e2e8f0', usePointStyle: true } } }
            }
        });
    } else if (mode === 'cost') {
        // Se estiver no modo compartilhado, não deve mostrar nada ou deve ser bloqueado na renderApp,
        // mas por segurança, filtramos aqui também.
        if (appStore.get().isSharedMode) return;

        const sorted = [...games].sort((a,b) => b.price_paid - a.price_paid).slice(0, 5);
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(g => g.title.length > 15 ? g.title.substring(0,15)+'...' : g.title),
                datasets: [{ label: 'Custo (R$)', data: sorted.map(g => g.price_paid), backgroundColor: colors[1], borderRadius: 5 }]
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
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'circle-check' : 'triangle-exclamation'}"></i> ${msg}`;
    DOM.toast.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
};

export const toggleModal = (show) => {
    if (show) DOM.modal.classList.remove('hidden');
    else DOM.modal.classList.add('hidden');
};