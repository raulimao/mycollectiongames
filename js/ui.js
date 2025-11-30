// Utilitários de Formatação
const formatMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const getStatusClass = (status) => {
    if (!status) return 'colecao';
    const s = status.toLowerCase();
    if (s.includes('venda')) return 'avenda';
    if (s.includes('vendido')) return 'vendido';
    if (s.includes('importado')) return 'importado';
    return 'colecao';
};

// --- Renderizar KPIs ---
export const renderKPIs = (collection, sold) => {
    // Cálculo de Totais
    const totalItems = collection.length;
    const totalInvestido = collection.reduce((acc, item) => acc + (item.preco || 0), 0);
    const totalLucro = sold.reduce((acc, item) => acc + (item.lucro || 0), 0);

    const html = `
        <div class="kpi-card">
            <span class="kpi-label">Jogos no Vault</span>
            <div class="kpi-value">${totalItems}</div>
        </div>
        <div class="kpi-card">
            <span class="kpi-label">Patrimônio Estimado</span>
            <div class="kpi-value">${formatMoney(totalInvestido)}</div>
        </div>
        <div class="kpi-card profit">
            <span class="kpi-label">Lucro Realizado</span>
            <div class="kpi-value text-success">+ ${formatMoney(totalLucro)}</div>
        </div>
    `;
    document.getElementById('kpi-container').innerHTML = html;
};

// --- Criar Card Individual ---
const createCard = (item, isSoldTab) => {
    const statusClass = getStatusClass(item.status);
    const badgeHtml = isSoldTab 
        ? `<span class="badge vendido">Vendido</span>` 
        : `<span class="badge ${statusClass}">${item.status || 'Coleção'}</span>`;

    let footerHtml = '';
    if (isSoldTab) {
        footerHtml = `
            <div style="display:flex; justify-content:space-between; margin-top:10px;">
                <small style="color:#aaa">Venda: ${formatMoney(item.vendido)}</small>
                <span class="text-success" style="font-weight:bold; font-family:'Orbitron'">+ ${formatMoney(item.lucro)}</span>
            </div>
        `;
    } else {
        footerHtml = `<div class="price-display">${formatMoney(item.preco)}</div>`;
    }

    return `
        <div class="game-card">
            <div class="card-header">
                ${badgeHtml}
                <span class="platform-tag">${item.plataforma}</span>
                <h3 class="game-title">${item.jogo}</h3>
            </div>
            <div class="card-body">
                ${footerHtml}
            </div>
        </div>
    `;
};

// --- Renderizar Grid Principal ---
export const renderGrid = (items, isSoldTab) => {
    const container = document.getElementById('gamesContainer');
    container.innerHTML = '';
    
    if (items.length === 0) {
        container.innerHTML = `<p style="text-align:center; grid-column:1/-1; padding:40px; color:#666;">Nenhum item encontrado.</p>`;
        return;
    }

    items.forEach(item => {
        container.innerHTML += createCard(item, isSoldTab);
    });
};

// --- Preencher Select de Plataformas ---
export const populateFilters = (items) => {
    const select = document.getElementById('platformSelect');
    // Pegar plataformas únicas
    const platforms = [...new Set(items.map(i => i.plataforma))].sort();
    
    // Manter a primeira opção "Todas"
    select.innerHTML = '<option value="all">Todas as Plataformas</option>';
    
    platforms.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.innerText = p;
        select.appendChild(opt);
    });
};