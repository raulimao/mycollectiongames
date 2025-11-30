// Formata Moeda
export const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

// Cria o Card HTML
export const createCard = (item) => {
    // Define cores e textos baseados no status
    let statusClass = 'st-colecao';
    if (item.status === 'Vendido') statusClass = 'st-vendido';
    else if (item.status === 'À venda') statusClass = 'st-venda';
    else if (item.status === 'Importado') statusClass = 'st-importado';

    // Imagem (Usa placeholder se não houver URL)
    // Dica: Use serviços como placehold.co se a URL estiver quebrada
    const bgImage = item.imagem 
        ? `background-image: url('${item.imagem}')` 
        : `background: linear-gradient(135deg, #2a2a2e 0%, #1a1a1d 100%)`; // Fundo neutro se sem img

    // Footer dinâmico (se vendido, mostra lucro)
    let footerHTML = '';
    if (item.status === 'Vendido') {
        const lucro = (item.vendido || 0) - (item.preco || 0);
        footerHTML = `
            <div><small class="text-muted">Venda</small><div class="price-val">${formatCurrency(item.vendido)}</div></div>
            <div style="text-align:right"><small class="text-muted">Lucro</small><div class="profit-val">${lucro > 0 ? '+' : ''}${formatCurrency(lucro)}</div></div>
        `;
    } else {
        footerHTML = `
            <div><small style="opacity:0.6">Pago</small><div class="price-val">${formatCurrency(item.preco)}</div></div>
        `;
    }

    const div = document.createElement('div');
    div.className = 'game-card';
    div.innerHTML = `
        <div class="card-actions">
            <button class="action-btn btn-edit" data-id="${item.id}" title="Editar">✎</button>
            <button class="action-btn btn-delete" data-id="${item.id}" title="Excluir">🗑</button>
        </div>
        <div class="card-image" style="${bgImage}"></div>
        <div class="card-body">
            <div class="card-meta">
                <span class="platform-tag">${item.plataforma}</span>
            </div>
            <h3 class="game-title">${item.jogo}</h3>
            <span class="status-badge ${statusClass}">${item.status}</span>
            <div class="card-footer">${footerHTML}</div>
        </div>
    `;
    return div;
};

// Renderiza Grid
export const renderGrid = (containerId, data) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (data.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:gray; padding:2rem;">Nenhum item encontrado.</div>';
        return;
    }
    data.forEach(item => container.appendChild(createCard(item)));
};

// KPIs
export const updateKPIs = (data) => {
    const collection = data.filter(i => i.status !== 'Vendido');
    const sold = data.filter(i => i.status === 'Vendido');

    const totalVal = collection.reduce((acc, i) => acc + Number(i.preco || 0), 0);
    const totalProfit = sold.reduce((acc, i) => acc + (Number(i.lucro) || (Number(i.vendido||0) - Number(i.preco||0))), 0);

    document.getElementById('kpi-container').innerHTML = `
        <div class="kpi-card"><span class="kpi-label">Jogos na Coleção</span><span class="kpi-value">${collection.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Valor Investido</span><span class="kpi-value">${formatCurrency(totalVal)}</span></div>
        <div class="kpi-card"><span class="kpi-label">Lucro Vendas</span><span class="kpi-value profit">${formatCurrency(totalProfit)}</span></div>
    `;
};

// Notificação Toast
export const showToast = (msg, type = 'success') => {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};