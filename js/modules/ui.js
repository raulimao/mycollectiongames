import { appStore } from './store.js';

// Cache do DOM
const DOM = {
    grid: document.getElementById('gamesContainer'),
    kpi: document.getElementById('kpi-container'),
    toast: document.getElementById('toastContainer'),
    modal: document.getElementById('gameModal'),
    chartCanvas: document.getElementById('collectionChart')
};

// Utilitário para evitar XSS (Injeção de Script)
const escapeHTML = (str) => {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
};

// --- RENDER MAIN ---
export const renderApp = (state) => {
    // 1. Filtragem
    let filteredGames = state.games || [];
    const term = state.searchTerm.toLowerCase();
    
    // Filtro por Aba
    if (state.filter === 'sold') {
        filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    } else if (state.filter === 'backlog') {
        filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    } else {
        // Coleção Principal
        filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog'].includes(g.status));
    }

    // Filtro de Busca
    if (term) {
        filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));
    }

    // 2. Renderização
    renderGrid(filteredGames);
    renderKPIs(state.games); // KPIs sempre consideram TODOS os jogos
    renderChart(state.games);
};

// --- GRID ---
const renderGrid = (games) => {
    DOM.grid.innerHTML = '';
    
    if (games.length === 0) {
        DOM.grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted)">
                <i class="fa-solid fa-ghost fa-3x" style="margin-bottom:15px; opacity:0.5"></i>
                <p>Nenhum jogo encontrado nesta seção.</p>
            </div>`;
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.onclick = () => window.editGame(game.id); // Chama hook global definido no main.js

        const badgeClass = getBadgeClass(game.status);
        const safeTitle = escapeHTML(game.title);
        
        // Cálculo de Preço
        let priceDisplay;
        if (game.status === 'Vendido') {
            const profit = (game.price_sold || 0) - (game.price_paid || 0);
            const colorClass = profit >= 0 ? 'text-green' : 'text-danger'; // text-danger deve ser definido no CSS ou usar style
            const sign = profit >= 0 ? '+' : '';
            priceDisplay = `<span class="${colorClass}">${sign} R$ ${profit.toFixed(2)}</span>`;
        } else {
            priceDisplay = `R$ ${(parseFloat(game.price_paid) || 0).toFixed(2)}`;
        }

        // Imagem com fallback
        const bgImage = game.image_url ? `url('${game.image_url}')` : 'linear-gradient(45deg, #1e1e23, #2a2a30)';

        card.innerHTML = `
            <div class="card-img" style="background-image: ${bgImage}">
                <span class="badge ${badgeClass}">${game.status}</span>
            </div>
            <div class="card-body">
                <div class="card-meta">
                    <span>${game.platform}</span>
                </div>
                <h3 class="card-title" title="${safeTitle}">${safeTitle}</h3>
                <div class="card-price">${priceDisplay}</div>
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

// --- KPIS ---
const renderKPIs = (allGames) => {
    if (!DOM.kpi) return;
    
    const totalInvestido = allGames.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const vendidos = allGames.filter(g => g.status === 'Vendido');
    const totalVendas = vendidos.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);
    const custoVendidos = vendidos.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
    const lucro = totalVendas - custoVendidos;

    DOM.kpi.innerHTML = `
        <div class="kpi-card">
            <div><span class="kpi-label">Total Jogos</span><div class="kpi-value">${allGames.length}</div></div>
            <i class="fa-solid fa-gamepad fa-2x" style="opacity:0.2"></i>
        </div>
        <div class="kpi-card">
            <div><span class="kpi-label">Patrimônio (Pago)</span><div class="kpi-value">R$ ${totalInvestido.toFixed(0)}</div></div>
            <i class="fa-solid fa-wallet fa-2x" style="opacity:0.2"></i>
        </div>
        <div class="kpi-card" style="border-color: ${lucro >= 0 ? 'var(--success)' : 'var(--danger)'}">
            <div><span class="kpi-label">Lucro (Vendidos)</span><div class="kpi-value ${lucro >= 0 ? 'text-green' : ''}">R$ ${lucro.toFixed(0)}</div></div>
            <i class="fa-solid fa-chart-line fa-2x" style="opacity:0.2; color:${lucro >= 0 ? 'var(--success)' : 'var(--danger)'}"></i>
        </div>
    `;
};

// --- CHART.JS ---
let chartInstance = null;

const renderChart = (games) => {
    if (!DOM.chartCanvas) return;

    // Prepara dados
    const platforms = {};
    games.forEach(g => {
        if (!platforms[g.platform]) platforms[g.platform] = 0;
        platforms[g.platform]++;
    });

    const labels = Object.keys(platforms);
    const data = Object.values(platforms);

    // Destrói gráfico anterior se existir
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Se não houver dados, não cria gráfico vazio feio
    if (labels.length === 0) return;

    chartInstance = new Chart(DOM.chartCanvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#bc13fe', '#00ff41', '#ecc94b', '#63b3ed', '#ff4444', 
                    '#a0aec0', '#f687b3', '#4fd1c5'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: 'white', font: { family: 'Inter' } } }
            }
        }
    });
};

// --- UTILS ---
export const showToast = (msg, type = 'success') => {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    // Ícone dinâmico
    const icon = type === 'success' ? 'check' : type === 'error' ? 'circle-exclamation' : 'info-circle';
    
    el.innerHTML = `<i class="fa-solid fa-${icon}"></i> ${msg}`;
    DOM.toast.appendChild(el);
    
    // Remove após 3s
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 3000);
};

export const toggleModal = (show) => {
    if (show) DOM.modal.classList.remove('hidden');
    else DOM.modal.classList.add('hidden');
};