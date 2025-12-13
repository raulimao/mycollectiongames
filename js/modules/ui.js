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
    levelBadge: document.getElementById('userLevelBadge'),
    headerActions: document.getElementById('headerActions'),
    authActions: document.getElementById('authActions'),
    userAvatar: document.getElementById('userAvatar'),
    networkList: document.getElementById('networkList')
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

window.updateVideoContext = (type, btn, videoUrl = null) => {
    const parent = btn.parentElement;
    parent.querySelectorAll('.video-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const container = document.getElementById('videoPlayerContainer');
    
    if (type === 'TRAILER' && videoUrl && videoUrl !== 'null' && videoUrl !== 'undefined') {
        container.innerHTML = `
            <div class="video-wrapper">
                <video controls autoplay name="media" style="width:100%; height:100%; border-radius:12px;">
                    <source src="${videoUrl}" type="video/mp4">
                    Seu navegador não suporta a tag de vídeo.
                </video>
            </div>`;
    } else {
        const gameName = document.getElementById('detailTitle').innerText;
        const platformName = document.getElementById('detailPlatform').innerText;
        const cleanName = gameName.replace(/[^a-zA-Z0-9\s]/g, ''); 
        const query = encodeURIComponent(`${cleanName} ${platformName} ${type}`);
        
        container.innerHTML = `
            <div class="video-placeholder" onclick="window.open('https://www.youtube.com/results?search_query=${query}', '_blank')">
                <div class="placeholder-content">
                    <i class="fa-brands fa-youtube fa-4x" style="color: #ff0000; margin-bottom: 15px; filter: drop-shadow(0 0 20px rgba(255,0,0,0.4));"></i>
                    <h3 style="color:white; font-family:var(--font-num); margin-bottom:5px">ASSISTIR ${type.toUpperCase()}</h3>
                    <p style="color:#aaa; font-size:0.9rem; text-transform:uppercase;">${cleanName} • ${platformName}</p>
                    <span class="btn-small" style="margin-top:15px; display:inline-block; pointer-events:none; border-color:rgba(255,255,255,0.2);">ABRIR NO YOUTUBE <i class="fa-solid fa-external-link-alt"></i></span>
                </div>
            </div>`;
    }
};

const formatMoney = (val) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// --- RENDER MAIN ---
export const renderApp = (state) => {
    const DOM = getDOM();
    const isShared = state.isSharedMode;
    const currentUser = state.user; 

    renderHeader(state, DOM, currentUser, isShared);

    const controlsPanel = document.querySelector('.controls-panel');
    const costTab = document.querySelectorAll('.chart-tab')[3]; 
    const btnAddGame = document.getElementById('btnOpenAddModal');
    const btnExport = document.getElementById('btnExport');

    if(controlsPanel) controlsPanel.classList.remove('hidden');

    if(isShared) {
        if(btnAddGame) btnAddGame.classList.add('hidden'); 
        if(btnExport) btnExport.classList.add('hidden'); 
        if(costTab) costTab.style.display = 'none'; 
        if(DOM.xpContainer) DOM.xpContainer.classList.remove('hidden');
    } else {
        if(btnAddGame) btnAddGame.classList.remove('hidden');
        if(btnExport) btnExport.classList.remove('hidden');
        if(costTab) costTab.style.display = 'inline-flex';
        if(DOM.xpContainer) DOM.xpContainer.classList.remove('hidden');
    }

    if (state.filter === 'feed') {
        if(DOM.kpi) DOM.kpi.style.display = 'none';
        const chartContainer = document.querySelector('.chart-container');
        if(chartContainer) chartContainer.style.display = 'none';
        renderFeed(state.feedData || [], state.userLikes || []);
        return;
    }

    if(DOM.kpi) DOM.kpi.style.display = 'flex';
    const chartContainer = document.querySelector('.chart-container');
    if(chartContainer) chartContainer.style.display = 'flex';

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

    renderKPIs(state.games, isShared, filter);
    renderGrid(filteredGames, isShared);
    renderChart(filteredGames, state.chartMode, filter, state.games);
    renderXP(state.games); 
};

// --- RENDER HEADER (FIX: event.stopPropagation e Visibilidade) ---
const renderHeader = (state, DOM, currentUser, isShared) => {
    const { followers_count, following_count } = state.profileStats || { followers_count: 0, following_count: 0 };
    
    let leftHtml = `
        <div style="margin-right:20px; font-size:0.75rem; color:#888; line-height:1.4; border-right:1px solid rgba(255,255,255,0.1); padding-right:20px">
            <div title="Seguidores" onclick="window.openNetwork('followers')" style="cursor:pointer; transition:0.2s; hover:color:white;">
                <strong style="color:white; font-size:0.9rem">${followers_count}</strong> Seg.
            </div>
            <div title="Seguindo" onclick="window.openNetwork('following')" style="cursor:pointer; transition:0.2s; hover:color:white;">
                <strong style="color:white; font-size:0.9rem">${following_count}</strong> Sig.
            </div>
        </div>
    `;

    if (isShared) {
        leftHtml += `<span class="badge bg-playing" style="font-size:0.8rem; margin-right:10px">Visitando: ${state.sharedProfileName.toUpperCase()}</span>`;
        if (currentUser) {
            const btnText = state.isFollowingCurrent ? '<i class="fa-solid fa-user-check"></i> SEGUINDO' : '<i class="fa-solid fa-user-plus"></i> SEGUIR';
            const btnStyle = state.isFollowingCurrent ? 'border-color:var(--success); color:var(--success)' : 'border-color:var(--primary); color:var(--primary)';
            leftHtml += `<button id="btnFollow" class="btn-small" onclick="window.handleFollow()" style="${btnStyle}">${btnText}</button>`;
        }
    } else {
        leftHtml += `
            <button id="btnShareProfile" class="btn-small" title="Copiar Link"><i class="fa-solid fa-link"></i> LINK</button>
            <button id="btnGenCard" class="btn-small" style="border-color:var(--primary); color:var(--primary)" title="Gerar Card Social"><i class="fa-solid fa-camera"></i> CARD</button>
        `;
    }
    if (DOM.headerActions) DOM.headerActions.innerHTML = leftHtml;

    if (!isShared) {
        const btnLink = document.getElementById('btnShareProfile');
        const btnCard = document.getElementById('btnGenCard');
        if (btnLink) btnLink.onclick = () => {
            const url = `${window.location.origin}${window.location.pathname}?u=${state.sharedProfileName}`;
            navigator.clipboard.writeText(url).then(() => showToast("Link copiado!", "success"));
        };
        if (btnCard) btnCard.onclick = () => generateSocialCard();
    }

    let rightHtml = '';
    if (currentUser) {
        // CORREÇÃO: Usa o nome do Perfil carregado do banco
        const profile = state.userProfile || {};
        const nick = profile.nickname || currentUser.user_metadata?.nickname || 'Eu';
        const avatarUrl = profile.avatar_url || currentUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${nick}&background=0ea5e9&color=fff`;

        if (DOM.userAvatar) {
            DOM.userAvatar.src = avatarUrl;
            DOM.userAvatar.style.display = 'block';
        }

        let notifItems = '<div style="padding:10px; color:#888; text-align:center; font-size:0.8rem">Nenhuma notificação nova.</div>';
        if (state.notifications && state.notifications.length > 0) {
            notifItems = state.notifications.map(n => {
                const isUnread = !n.read;
                const style = isUnread ? 'background:rgba(217, 70, 239, 0.1);' : '';
                const clickAction = `window.handleNotificationClick(${n.id}, '${n.action_type}', '${n.actor?.nickname || ''}', ${n.related_id || 'null'})`;
                
                return `
                <div onclick="${clickAction}" style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; gap:10px; align-items:center; cursor:pointer; ${style}">
                    <div style="width:8px; height:8px; background:${isUnread ? 'var(--primary)' : 'transparent'}; border-radius:50%; flex-shrink:0;"></div>
                    <div>
                        <strong style="color:white; font-size:0.8rem">@${n.actor?.nickname || 'Alguém'}</strong>
                        <p style="margin:0; font-size:0.75rem; color:#aaa">${n.action_type === 'FOLLOW' ? 'começou a te seguir.' : 'curtiu sua atividade.'}</p>
                    </div>
                </div>`;
            }).join('');
        }

        const unreadCount = state.notifications ? state.notifications.filter(n => !n.read).length : 0;
        const notifBadge = unreadCount > 0 ? `<span style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:var(--danger); border-radius:50%"></span>` : '';

        // FIX: Classe depende do estado e onClick para propagação
        const panelClass = state.isNotificationsOpen ? 'glass-panel' : 'glass-panel hidden';

        rightHtml = `
            <div style="position:relative; margin-right:20px;">
                <button class="btn-small" style="border:none; font-size:1.2rem; background:transparent; color:#ccc; position:relative;" onclick="event.stopPropagation(); window.openNotifications()" title="Notificações">
                    <i class="fa-solid fa-bell"></i>
                    ${notifBadge}
                </button>
                <div id="notifPanel" class="${panelClass}" style="position:absolute; top:45px; right:-10px; width:300px; max-height:350px; overflow-y:auto; padding:0; z-index:5000; border:1px solid rgba(255,255,255,0.1); background: #141416;">
                    <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.5)">
                        <span style="font-size:0.75rem; color:#888">NOTIFICAÇÕES</span>
                        <span onclick="event.stopPropagation(); window.openNotifications()" style="cursor:pointer; font-size:0.75rem;"><i class="fa-solid fa-times"></i></span>
                    </div>
                    ${notifItems}
                </div>
            </div>
            <div style="text-align:right; margin-right:10px; line-height:1.2">
                <span class="user-name" style="display:block; font-size:0.9rem">${nick.toUpperCase()}</span>
                <small style="color:var(--primary); font-size:0.65rem; cursor:pointer; font-weight:bold" onclick="window.handleEditProfile()">EDITAR PERFIL</small> &bull; 
                <small style="color:#666; font-size:0.65rem; cursor:pointer;" onclick="window.handleLogout()">SAIR</small>
            </div>
        `;
    } else {
        if (DOM.userAvatar) DOM.userAvatar.style.display = 'none';
        rightHtml = `<button onclick="window.handleLoginRequest()" class="btn-primary" style="padding: 8px 16px; font-size: 0.75rem;"><i class="fa-brands fa-google"></i> ENTRAR</button>`;
    }
    if (DOM.authActions) DOM.authActions.innerHTML = rightHtml;
};

// --- RENDER MODAL DE SEGUIDORES ---
export const renderUserList = (profiles, followingIds, currentUserId) => {
    const DOM = getDOM();
    if (!DOM.networkList) return;
    DOM.networkList.innerHTML = '';

    if (!profiles || profiles.length === 0) {
        DOM.networkList.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Ninguém aqui ainda.</div>';
        return;
    }

    profiles.forEach(p => {
        const isMe = p.id === currentUserId;
        const isFollowing = followingIds.includes(p.id);
        
        let btnHtml = '';
        if (!isMe && currentUserId) {
            if (isFollowing) {
                btnHtml = `<button class="btn-small" style="border-color:var(--danger); color:var(--danger); font-size:0.65rem;" onclick="window.handleListFollow('${p.id}', this)">Deixar de Seguir</button>`;
            } else {
                btnHtml = `<button class="btn-small" style="border-color:var(--primary); color:var(--primary); font-size:0.65rem;" onclick="window.handleListFollow('${p.id}', this)">Seguir</button>`;
            }
        }

        const item = document.createElement('div');
        item.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05)";
        item.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center; cursor:pointer;" onclick="window.location.href='?u=${p.nickname}'">
                <img src="${p.avatar_url || 'https://ui-avatars.com/api/?name='+p.nickname+'&background=random'}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
                <span style="color:white; font-weight:bold; font-size:0.9rem;">@${p.nickname}</span>
            </div>
            <div>${btnHtml}</div>
        `;
        DOM.networkList.appendChild(item);
    });
};

const renderFeed = (feedItems, userLikes = []) => {
    const DOM = getDOM();
    DOM.grid.innerHTML = '';
    
    if (!feedItems || feedItems.length === 0) {
        DOM.grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><i class="fa-solid fa-satellite-dish fa-3x" style="margin-bottom: 20px; opacity: 0.3;"></i><p>O silêncio reina no éter...</p></div>`;
        return;
    }

    const feedContainer = document.createElement('div');
    feedContainer.className = 'feed-container';
    feedContainer.style.gridColumn = "1 / -1"; 

    feedItems.forEach(item => {
        const date = new Date(item.created_at).toLocaleDateString('pt-BR');
        let icon = 'fa-gamepad'; let color = 'var(--text-muted)'; let text = 'interagiu com';
        switch(item.action_type) {
            case 'PLATINUM': icon = 'fa-trophy'; color = 'var(--gold)'; text = 'PLATINOU'; break;
            case 'COMPLETED': icon = 'fa-check-circle'; color = 'var(--success)'; text = 'ZEROU'; break;
            case 'ADDED': icon = 'fa-plus-circle'; color = 'var(--primary)'; text = 'ADICIONOU'; break;
            case 'WISHLIST': icon = 'fa-star'; color = 'var(--warning)'; text = 'DESEJA'; break;
        }

        const isLiked = userLikes.includes(item.id);
        const heartClass = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        const likeBtnColor = isLiked ? 'var(--danger)' : '#666';
        const likeBtnClass = isLiked ? 'liked' : '';

        const card = document.createElement('div');
        card.className = 'feed-card glass-panel';
        card.innerHTML = `
            <div class="feed-header">
                <div class="feed-user">
                    <img src="https://ui-avatars.com/api/?name=${item.user_nickname}&background=random" class="feed-avatar" onclick="window.location.href='?u=${item.user_nickname}'" style="cursor:pointer" title="Ver Perfil">
                    <div><span class="feed-nick" onclick="window.location.href='?u=${item.user_nickname}'">@${item.user_nickname}</span><span class="feed-date">${date}</span></div>
                </div>
                <div class="feed-badge" style="color:${color}; border-color:${color}"><i class="fa-solid ${icon}"></i> ${text}</div>
            </div>
            <div class="feed-content">
                <div class="feed-img" style="background-image: url('${item.game_image || ''}')"></div>
                <div class="feed-info" style="flex:1"><h3>${item.game_title}</h3><span class="badge" style="margin-top:5px; display:inline-block">${item.platform}</span></div>
                <div class="feed-actions" style="display:flex; align-items:flex-end; gap:10px;">
                    <button class="btn-like ${likeBtnClass}" onclick="window.handleLike(this, ${item.id})" style="background:none; border:none; color:${likeBtnColor}; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; gap:5px; transition:0.2s">
                        <i class="${heartClass}"></i> <span style="font-size:0.9rem">${item.likes_count || 0}</span>
                    </button>
                </div>
            </div>
        `;
        feedContainer.appendChild(card);
    });
    DOM.grid.appendChild(feedContainer);
};

const renderXP = (allGames) => {
    const DOM = getDOM();
    if(!DOM.xpContainer || !DOM.xpBar) return;
    const XP_TABLE = { 'Platinado': 1000, 'Jogo Zerado': 500, 'Jogando': 100, 'Coleção': 50, 'Backlog': 10, 'Vendido': 20, 'À venda': 20, 'Desejado': 0 };
    let totalXP = 0;
    allGames.forEach(g => totalXP += (XP_TABLE[g.status] || 0));
    const XP_PER_LEVEL = 2000; 
    const currentLevel = Math.floor(totalXP / XP_PER_LEVEL) + 1;
    const xpInCurrentLevel = totalXP % XP_PER_LEVEL;
    const progressPercent = (xpInCurrentLevel / XP_PER_LEVEL) * 100;

    DOM.levelBadge.innerText = `LVL ${currentLevel}`;
    DOM.xpText.innerText = `${xpInCurrentLevel} / ${XP_PER_LEVEL} XP`;
    DOM.xpBar.style.width = `${progressPercent}%`;
    if(currentLevel >= 20) DOM.xpBar.style.background = 'linear-gradient(90deg, #ffd700, #ff3366)'; 
    else if(currentLevel >= 10) DOM.xpBar.style.background = 'linear-gradient(90deg, #0ea5e9, #d946ef)'; 
    else DOM.xpBar.style.background = 'linear-gradient(90deg, #00ff9d, #0ea5e9)'; 
};

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
                const colorClass = profit >= 0 ? 'text-green' : 'text-danger';
                priceDisplay = `<span class="${colorClass}" style="font-weight:bold;">${profit >= 0 ? '+' : ''} R$ ${formatMoney(profit).replace('R$', '').trim()}</span>`;
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
    if (game.status === 'Desejado') { priceLabel.innerText = "CUSTO ESTIMADO"; priceEl.style.color = "var(--warning)"; }
    else if (game.status === 'À venda') { priceLabel.innerText = "VALOR DE VENDA"; priceEl.style.color = "var(--success)"; }
    else { priceLabel.innerText = "VALOR PAGO"; priceEl.style.color = "var(--success)"; }
    
    if (isShared && game.status !== 'À venda') { priceEl.innerText = "---"; }
    else { const valor = (game.status === 'À venda' || game.status === 'Vendido') ? game.price_sold : game.price_paid; priceEl.innerText = formatMoney(valor || 0); }

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

    const videoArea = document.getElementById('detailVideoArea');
    if(videoArea) videoArea.innerHTML = '<div style="padding:20px; text-align:center; color:#666">Carregando Media Center...</div>';

    const btnEdit = document.getElementById('btnEditFromDetail');
    if (isShared) { btnEdit.classList.add('hidden'); }
    else { btnEdit.classList.remove('hidden'); btnEdit.onclick = () => { modal.classList.add('hidden'); window.editGame(game.id); }; }

    modal.classList.remove('hidden');

    const descEl = document.getElementById('detailDesc');
    const mcEl = document.getElementById('detailMetacritic');
    const linkEl = document.getElementById('detailLink');
    descEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando informações...';

    const details = await GameService.getGameDetails(game.title);
    
    if (details) {
        descEl.innerText = details.description_ptbr || details.description_raw || "Sem descrição.";
        mcEl.innerText = details.metacritic ? `MC: ${details.metacritic}` : "MC: N/A";
        mcEl.style.display = 'inline-block';
        if (details.website) { linkEl.href = details.website; linkEl.classList.remove('hidden'); } else { linkEl.classList.add('hidden'); }

        if(videoArea) {
            const hasTrailer = details.trailers && details.trailers.length > 0;
            const trailerUrl = hasTrailer ? details.trailers[0].data['480'] : null; 
            const initialType = hasTrailer ? 'TRAILER' : 'Gameplay';
            videoArea.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h4 style="color: white; font-family: var(--font-num); font-size: 0.9rem; margin:0;"><i class="fa-brands fa-youtube" style="color: #ff0000; margin-right: 8px;"></i> MEDIA CENTER</h4>
                </div>
                <div class="video-controls">
                    <button class="video-chip ${hasTrailer ? 'active' : ''}" onclick="window.updateVideoContext('TRAILER', this, '${trailerUrl}')">TRAILER</button>
                    <button class="video-chip ${!hasTrailer ? 'active' : ''}" onclick="window.updateVideoContext('Gameplay', this)">GAMEPLAY</button>
                    <button class="video-chip" onclick="window.updateVideoContext('Longplay', this)">LONGPLAY</button>
                    <button class="video-chip" onclick="window.updateVideoContext('Análise', this)">ANÁLISE</button>
                </div>
                <div id="videoPlayerContainer"></div>
            `;
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
            options: { ...config, cutout: '60%', onClick: (evt, elements) => { if(elements.length > 0) { const index = elements[0].index; appStore.setState({ activePlatform: Object.keys(platforms)[index], chartMode: 'platform' }); } } }
        });
    } else if (mode === 'status') {
        const statuses = {};
        games.forEach(g => statuses[g.status] = (statuses[g.status] || 0) + 1);
        chartInstance = new Chart(ctx, {
            type: 'polarArea',
            data: { labels: Object.keys(statuses), datasets: [{ data: Object.values(statuses), backgroundColor: colors.map(c => c + '99'), borderColor: '#111', borderWidth: 1 }] },
            options: { ...config, scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { display: false } } }, onClick: (evt, elements) => { if(elements.length > 0) { const index = elements[0].index; appStore.setState({ activePlatform: Object.keys(statuses)[index], chartMode: 'status' }); } } }
        });
    } else if (mode === 'dna') {
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
    el.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'circle-check' : (type === 'info' ? 'circle-info' : 'triangle-exclamation')}"></i> ${msg}`;
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
        display.innerHTML = `<div class="roulette-card" style="width:200px; height:300px; background-size:cover; background-position:center; margin:0 auto; border-radius:12px; background-image: url('https://media.giphy.com/media/3o7bu3XilJ5BOiSGic/giphy.gif'); border-color:var(--secondary)"></div><p class="modal-desc">Consultando os deuses do gaming...</p>`;
        setTimeout(() => {
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            display.innerHTML = `<div class="roulette-card winner" style="width:200px; height:300px; background-size:cover; background-position:center; margin:0 auto; border-radius:12px; background-image: url('${winner.image_url || ''}'); box-shadow: 0 0 30px var(--primary-glow);"></div><h3 style="color:white; font-size:1.5rem; margin-top:20px; margin-bottom:10px">${winner.title}</h3><span class="badge bg-backlog">${winner.platform}</span>`;
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

export const generateSocialCard = async () => {
    const { user, games, sharedProfileName } = appStore.get();
    const dom = getDOM();
    
    showToast("Gerando card Pro... aguarde.", "info");

    const card = document.getElementById('socialCardHidden');
    const avatar = document.getElementById('scAvatar');
    const name = document.getElementById('scName');
    
    const statGames = document.getElementById('scTotalGames');
    const statCompleted = document.getElementById('scCompleted');
    const statValue = document.getElementById('scValue');
    const statPlatform = document.getElementById('scTopPlatform');

    name.innerText = sharedProfileName ? sharedProfileName.toUpperCase() : "GAMER";
    
    const profile = appStore.get().userProfile;
    if(profile && profile.avatar_url) {
        avatar.src = profile.avatar_url;
    } else if(user && user.user_metadata && user.user_metadata.avatar_url) {
        avatar.src = user.user_metadata.avatar_url;
    } else {
        avatar.src = "https://ui-avatars.com/api/?name=" + (sharedProfileName || "Player") + "&background=0ea5e9&color=fff";
    }
    avatar.crossOrigin = "anonymous";

    const ownedGames = games.filter(g => g.status !== 'Desejado');
    const totalGames = ownedGames.length;
    const completed = games.filter(g => ['Platinado', 'Jogo Zerado'].includes(g.status)).length;
    const totalInvest = ownedGames.reduce((acc, g) => acc + (g.price_paid || 0), 0);
    
    const platforms = {};
    ownedGames.forEach(g => { platforms[g.platform] = (platforms[g.platform] || 0) + 1; });
    let topPlat = "N/A";
    if (Object.keys(platforms).length > 0) topPlat = Object.keys(platforms).reduce((a, b) => platforms[a] > platforms[b] ? a : b);

    statGames.innerText = totalGames;
    statCompleted.innerText = completed;
    statValue.innerText = formatMoney(totalInvest);
    statPlatform.innerText = topPlat;
    if(topPlat.length > 10) statPlatform.style.fontSize = "1.4rem";

    try {
        await new Promise(r => setTimeout(r, 500)); 
        const canvas = await html2canvas(card, { backgroundColor: '#050505', scale: 1.5, useCORS: true, logging: false });
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