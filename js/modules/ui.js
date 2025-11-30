import { appStore } from './store.js';

const DOM = {
    grid: document.getElementById('gamesContainer'),
    kpiContainer: document.getElementById('kpi-container'),
    modal: document.getElementById('gameModal'),
    apiResults: document.getElementById('apiResults'),
    toast: document.getElementById('toastContainer')
};

// --- Renderização Principal ---
export const renderApp = (state) => {
    // 1. Filtragem Local
    let games = state.games;
    
    if (state.filter === 'sold') {
        games = games.filter(g => g.status === 'Vendido');
    } else if (state.filter === 'backlog') {
        games = games.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    } else {
        games = games.filter(g => g.status !== 'Vendido'); // Coleção padrão
    }

    if (state.searchTerm) {
        games = games.filter(g => g.title.toLowerCase().includes(state.searchTerm.toLowerCase()));
    }

    // 2. Render KPIs
    renderKPIs(state.games);

    // 3. Render Grid
    DOM.grid.innerHTML = games.length 
        ? games.map(g => createCard(g)).join('') 
        : '<div class="empty-state">Nenhum jogo encontrado nesta categoria.</div>';
};

// --- Componentes ---
const createCard = (game) => {
    const isSold = game.status === 'Vendido';
    const profit = (game.price_sold || 0) - (game.price_paid || 0);
    const profitClass = profit >= 0 ? 'text-success' : 'text-danger';

    return `
    <div class="game-card" data-id="${game.id}" onclick="window.editGame('${game.id}')">
        <div class="card-img" style="background-image: url('${game.image_url || 'assets/no-img.jpg'}')">
            <span class="badge ${getStatusColor(game.status)}">${game.status}</span>
        </div>
        <div class="card-content">
            <small>${game.platform}</small>
            <h3>${game.title}</h3>
            <div class="card-footer">
                ${isSold 
                    ? `<span>Lucro: <strong class="${profitClass}">R$ ${profit.toFixed(2)}</strong></span>`
                    : `<span>Pago: R$ ${parseFloat(game.price_paid).toFixed(2)}</span>`
                }
            </div>
        </div>
    </div>`;
};

const getStatusColor = (status) => {
    const map = {
        'Vendido': 'badge-sold',
        'À venda': 'badge-warning',
        'Jogando': 'badge-active',
        'Backlog': 'badge-neutral',
        'Platinado': 'badge-pro'
    };
    return map[status] || 'badge-neutral';
};

const renderKPIs = (allGames) => {
    const totalInvestido = allGames.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const totalJogos = allGames.length;
    const vendidos = allGames.filter(g => g.status === 'Vendido');
    const totalLucro = vendidos.reduce((acc, g) => acc + ((Number(g.price_sold) || 0) - (Number(g.price_paid) || 0)), 0);

    DOM.kpiContainer.innerHTML = `
        <div class="kpi-card"><span>Total Jogos</span><strong>${totalJogos}</strong></div>
        <div class="kpi-card"><span>Investido</span><strong>R$ ${totalInvestido.toFixed(2)}</strong></div>
        <div class="kpi-card highlight"><span>Lucro Real</span><strong>R$ ${totalLucro.toFixed(2)}</strong></div>
    `;
};

export const showToast = (msg, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    DOM.toast.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};

export const toggleModal = (show) => {
    if(show) DOM.modal.classList.remove('hidden');
    else DOM.modal.classList.add('hidden');
};