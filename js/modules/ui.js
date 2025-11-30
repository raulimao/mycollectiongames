import { appStore } from './store.js';

// Elementos DOM cacheados
const DOM = {
    grid: document.getElementById('gamesContainer'),
    kpi: document.getElementById('kpi-container'),
    toast: document.getElementById('toastContainer'),
    modal: document.getElementById('gameModal')
};

// --- RENDERIZAÇÃO PRINCIPAL ---
export const renderApp = (state) => {
    // 1. Filtragem Lógica
    let filteredGames = state.games;

    // Filtro por Aba
    if (state.filter === 'sold') {
        filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    } else if (state.filter === 'backlog') {
        filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    } else {
        // Coleção Principal (tudo que não é vendido nem backlog puro)
        filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog'].includes(g.status));
    }

    // Filtro de Busca
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));
    }

    // 2. Renderizar UI
    renderGrid(filteredGames);
    renderKPIs(state.games);
    renderChart(state.games);
};

// --- GRID ---
const renderGrid = (games) => {
    DOM.grid.innerHTML = '';
    
    if (games.length === 0) {
        DOM.grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#666">Nenhum jogo encontrado.</div>`;
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.onclick = () => window.editGame(game.id); // Hook global

        const badgeClass = getBadgeClass(game.status);
        const priceDisplay = game.status === 'Vendido' 
            ? `<span class="text-green">+ R$ ${(game.price_sold - game.price_paid).toFixed(2)}</span>`
            : `R$ ${parseFloat(game.price_paid || 0).toFixed(2)}`;

        card.innerHTML = `
            <div class="card-img" style="background-image: url('${game.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}')">
                <span class="badge ${badgeClass}">${game.status}</span>
            </div>
            <div class="card-body">
                <div class="card-meta">
                    <span>${game.platform}</span>
                </div>
                <h3 class="card-title">${game.title}</h3>
                <div class="card-price">${priceDisplay}</div>
            </div>
        `;
        DOM.grid.appendChild(card);
    });
};

const getBadgeClass = (status) => {
    if (status === 'Vendido') return 'bg-sold';
    if (status === 'Jogando') return 'bg-playing';
    if (status === 'Platinado') return 'bg-plat';
    if (status === 'Backlog') return 'bg-backlog';
    return 'bg-backlog'; // Default
};

// --- KPIS ---
const renderKPIs = (allGames) => {
    const totalInvestido = allGames.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const vendidos = allGames.filter(g => g.status === 'Vendido');
    const lucro = vendidos.reduce((acc, g) => acc + ((Number(g.price_sold) || 0) - (Number(g.price_paid) || 0)), 0);

    DOM.kpi.innerHTML = `
        <div class="kpi-card">
            <div><span class="kpi-label">Jogos Totais</span><div class="kpi-value">${allGames.length}</div></div>
            <i class="fa-solid fa-gamepad fa-2x" style="opacity:0.2"></i>
        </div>
        <div class="kpi-card">
            <div><span class="kpi-label">Investido</span><div class="kpi-value">R$ ${totalInvestido.toFixed(0)}</div></div>
            <i class="fa-solid fa-wallet fa-2x" style="opacity:0.2"></i>
        </div>
        <div class="kpi-card" style="border-color:var(--success)">
            <div><span class="kpi-label">Lucro Vendas</span><div class="kpi-value text-green">R$ ${lucro.toFixed(0)}</div></div>
            <i class="fa-solid fa-chart-line fa-2x" style="opacity:0.2; color:var(--success)"></i>
        </div>
    `;
};

// --- CHART.JS ---
let chartInstance = null;
const renderChart = (games) => {
    const ctx = document.getElementById('collectionChart');
    if (!ctx) return;

    // Agrupar por plataforma
    const platforms = {};
    games.forEach(g => {
        platforms[g.platform] = (platforms[g.platform] || 0) + 1;
    });

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(platforms),
            datasets: [{
                data: Object.values(platforms),
                backgroundColor: ['#bc13fe', '#00ff41', '#ecc94b', '#63b3ed', '#ff4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: 'white' } }
            }
        }
    });
};

// --- UTILS ---
export const showToast = (msg, type = 'success') => {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : 'circle-exclamation'}"></i> ${msg}`;
    DOM.toast.appendChild(el);
    setTimeout(() => el.remove(), 3000);
};

export const toggleModal = (show) => {
    if (show) DOM.modal.classList.remove('hidden');
    else DOM.modal.classList.add('hidden');
};