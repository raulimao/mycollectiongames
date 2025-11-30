import { appStore } from './store.js';

// Elementos DOM
const DOM = {
    grid: document.getElementById('gamesContainer'),
    kpi: document.getElementById('kpi-container'),
    toast: document.getElementById('toastContainer'),
    modal: document.getElementById('gameModal')
};

export const renderApp = (state) => {
    let filteredGames = state.games || [];
    const term = state.searchTerm?.toLowerCase() || '';
    const filter = state.filter || 'collection';

    // Filtragem
    if (filter === 'sold') {
        filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    } else if (filter === 'backlog') {
        filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    } else {
        filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog'].includes(g.status));
    }

    if (term) {
        filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));
    }

    renderGrid(filteredGames);
    renderKPIs(state.games);
    renderChart(state.games);
};

const renderGrid = (games) => {
    DOM.grid.innerHTML = '';
    
    if (games.length === 0) {
        DOM.grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-muted); font-size:1.1rem;"><i class="fa-solid fa-ghost fa-3x" style="margin-bottom:20px; opacity:0.3; filter:drop-shadow(0 0 10px var(--primary))"></i><br>Nenhum jogo encontrado nesta dimensão.</div>`;
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.onclick = () => window.editGame(game.id);

        const badgeClass = getBadgeClass(game.status);
        const bgImage = game.image_url || 'https://via.placeholder.com/400x600?text=No+Cover';
        
        let priceDisplay;
        if (game.status === 'Vendido') {
            const profit = (game.price_sold || 0) - (game.price_paid || 0);
            const sign = profit >= 0 ? '+' : '';
            priceDisplay = `<span class="${profit >= 0 ? 'text-green' : 'text-danger'}">${sign} R$ ${profit.toFixed(2)}</span>`;
        } else {
            priceDisplay = `R$ ${(parseFloat(game.price_paid) || 0).toFixed(2)}`;
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

// --- KPIs PREMIUM ---
const renderKPIs = (allGames) => {
    if (!DOM.kpi) return;
    
    const totalInvestido = allGames.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const vendidos = allGames.filter(g => g.status === 'Vendido');
    const totalRecuperado = vendidos.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);
    
    const totalJogos = allGames.length;
    const finalizados = allGames.filter(g => ['Zerado', 'Platinado', 'Vendido'].includes(g.status)).length;
    const backlog = allGames.filter(g => ['Backlog', 'Coleção'].includes(g.status)).length;
    const taxaConclusao = totalJogos > 0 ? Math.round((finalizados / totalJogos) * 100) : 0;
    
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

// --- CHART NEON ---
let chartInstance = null;
const renderChart = (games) => {
    const ctx = document.getElementById('collectionChart');
    if (!ctx) return;

    const platforms = {};
    games.forEach(g => { platforms[g.platform] = (platforms[g.platform] || 0) + 1; });

    if (chartInstance) chartInstance.destroy();

    const neonColors = ['#d946ef', '#0ea5e9', '#00ff9d', '#f59e0b', '#ff3366', '#ffd700'];

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(platforms),
            datasets: [{
                data: Object.values(platforms),
                backgroundColor: neonColors,
                borderColor: '#0a0a0c', borderWidth: 2, hoverBorderColor: 'white', hoverBorderWidth: 3, hoverOffset: 10
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, layout: { padding: 20 },
            plugins: {
                legend: { position: 'right', labels: { color: '#e2e8f0', font: { family: 'Inter', size: 12 }, padding: 20, usePointStyle: true } },
                tooltip: { backgroundColor: 'rgba(20, 20, 25, 0.9)', titleFont: { family: 'Orbitron' }, bodyFont: { family: 'Inter' }, borderColor: '#d946ef', borderWidth: 1, displayColors: false }
            },
            cutout: '65%'
        }
    });
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