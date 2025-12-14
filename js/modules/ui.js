import { appStore } from './store.js';
import { GameService } from '../services/api.js';
import { GameChain } from '../services/blockchain.js';

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

    if (mode === 'platform' && tabs[0]) tabs[0].classList.add('active');
    if (mode === 'status' && tabs[1]) tabs[1].classList.add('active');
    if (mode === 'dna' && tabs[2]) tabs[2].classList.add('active');
    if (mode === 'cost' && tabs[3]) tabs[3].classList.add('active');

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

// Helper for Investment Calculation
export const calculateInvestment = (games) => {
    return games.filter(g => g.status !== 'Desejado').reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
};

export const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

    if (controlsPanel) controlsPanel.classList.remove('hidden');

    if (isShared) {
        if (btnAddGame) btnAddGame.classList.add('hidden');
        if (btnExport) btnExport.classList.add('hidden');
        if (costTab) costTab.style.display = 'none';
        if (DOM.xpContainer) DOM.xpContainer.classList.add('hidden'); // Hide XP for visitors

        // FORCE HIDE ROULETTE + WRAPPER
        const btnRoulette = document.getElementById('btnRoulette');
        if (btnRoulette) {
            btnRoulette.classList.add('hidden');
            const wrapper = btnRoulette.closest('.tools-wrapper');
            if (wrapper) wrapper.classList.add('hidden'); // Hide wrapper since export is also hidden
        }
    } else {
        if (btnAddGame) btnAddGame.classList.remove('hidden');
        if (btnExport) btnExport.classList.remove('hidden');
        if (costTab) costTab.style.display = 'block';
        if (DOM.xpContainer) DOM.xpContainer.classList.remove('hidden'); // Show XP for owner

        // SHOW ROULETTE + WRAPPER
        const btnRoulette = document.getElementById('btnRoulette');
        if (btnRoulette) {
            btnRoulette.classList.remove('hidden');
            const wrapper = btnRoulette.closest('.tools-wrapper');
            if (wrapper) wrapper.classList.remove('hidden');
        }
    }

    if (state.filter === 'feed') {
        if (DOM.kpi) DOM.kpi.style.display = 'none';
        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) chartContainer.style.display = 'none';
        renderFeed(state.feedData || [], state.userLikes || []);
        return;
    }

    if (DOM.kpi) DOM.kpi.style.display = 'flex';
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) chartContainer.style.display = 'flex';

    // BLOCKCHAIN UI
    if (typeof updateWalletUI === 'function') updateWalletUI();

    // Async Init Chain (Cloud)
    if (typeof GameChain !== 'undefined') {
        GameChain.init().then(() => {
            updateWalletUI(); // Refresh once loaded
        });
    }

    // Attach Listeners if not already attached (Idempotent check could be improved, but cheap here)
    const walletBadge = document.getElementById('walletBadge');
    if (walletBadge) {
        // Hide owner's wallet when viewing another user's profile
        if (state.isSharedMode) {
            walletBadge.classList.add('hidden');
        } else {
            walletBadge.classList.remove('hidden');
            walletBadge.onclick = () => openExplorer();
        }
    }

    const closeExp = document.getElementById('closeExplorer');
    if (closeExp) closeExp.onclick = () => document.getElementById('explorerModal').classList.add('hidden');

    // Use allGamesStats for calculations if available (Total Collection), otherwise fallback to loaded games
    const statsSource = state.allGamesStats || state.games || [];

    // SOURCE OF TRUTH STRATEGY
    // We now use 'statsSource' (allGamesStats) for EVERYTHING, but we slice it for the grid.

    const term = state.searchTerm?.toLowerCase() || '';
    const activeFilter = state.filter || 'collection';

    let sourceData = statsSource;

    // Apply Filters
    let filteredGames = sourceData;

    if (activeFilter === 'sold') filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    else if (activeFilter === 'wishlist') filteredGames = filteredGames.filter(g => g.status === 'Desejado');
    else if (activeFilter === 'store') filteredGames = filteredGames.filter(g => g.status === 'À venda');
    else if (activeFilter === 'backlog') filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    else filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog', 'Desejado'].includes(g.status));

    if (term) filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));

    if (state.activePlatform) {
        filteredGames = filteredGames.filter(g => g.platform === state.activePlatform);
        if (DOM.filterBadge) {
            DOM.filterBadge.classList.remove('hidden');
            if (DOM.filterName) DOM.filterName.innerText = state.activePlatform;
        }
    } else {
        if (DOM.filterBadge) DOM.filterBadge.classList.add('hidden');
    }

    // Client-Side Pagination Slicing
    const limit = state.paginationLimit || 16;
    const visibleGames = filteredGames.slice(0, limit);

    // Always use Full Stats for KPIs/Charts to ensure accuracy
    renderKPIs(statsSource, isShared, activeFilter);

    // Pass Visible Games AND Total Available for this filter to Grid
    renderGrid(visibleGames, isShared, filteredGames.length);

    // CHART DATA SOURCE FIX:
    // If we are simply browsing (no search/filter), we want the chart to reflect the WHOLE collection.
    // If we are filtering (e.g. "PlayStation 5"), we want the chart to reflect the filtered subset.
    const isFiltering = state.searchTerm || state.activePlatform;
    const chartData = (isFiltering || activeFilter !== 'collection') ? filteredGames : statsSource;
    renderChart(chartData, state.chartMode, activeFilter, statsSource); // 1st arg: data to visualize, 4th arg: global context (for DNA)

    renderXP(statsSource);
};

// --- RENDER HEADER (NEW UX OVERHAUL) ---
const renderHeader = (state, DOM, currentUser, isShared) => {
    const { followers_count, following_count } = state.profileStats || { followers_count: 0, following_count: 0 };

    // 1. CENTER SECTION (headerActions)
    let centerHtml = '';

    if (isShared) {
        // VISITOR MODE: Identity Badge + XP + Stats + Blockchain Count
        const blockCount = state.visitedBlockchainData?.blocks?.length || 0;
        console.log('🎨 Rendering visitor header - blockchain data:', state.visitedBlockchainData, 'count:', blockCount);

        // Calculate XP for visited user (same logic as owner)
        const visitorStats = state.allGamesStats || [];
        const totalValue = visitorStats.reduce((sum, g) => sum + (g.current_value || 0), 0);
        const totalGames = visitorStats.length;
        const visitorXP = Math.floor(totalValue / 10) + (totalGames * 50);
        const visitorLevel = Math.floor(visitorXP / 1000) + 1;
        const xpForCurrentLevel = (visitorLevel - 1) * 1000;
        const xpForNextLevel = visitorLevel * 1000;
        const xpProgress = visitorXP - xpForCurrentLevel;
        const xpNeeded = xpForNextLevel - xpForCurrentLevel;
        const xpPercentage = (xpProgress / xpNeeded) * 100;

        centerHtml = `
            <div style="display:flex; align-items:center; gap:20px">
                <div style="display:flex; flex-direction:column; align-items:center; gap:4px">
                    <span style="font-size:0.65rem; color:#888; letter-spacing:2px; text-transform:uppercase">Visitando</span>
                    <div class="badge bg-playing" style="font-size:0.9rem; padding: 5px 15px; border-radius:12px; border-color:var(--primary)">
                        <i class="fa-solid fa-eye"></i> ${state.sharedProfileName ? state.sharedProfileName.toUpperCase() : "GAMER"}
                    </div>
                </div>
                
                <!-- Visitor XP Display -->
                <div style="min-width: 180px; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:baseline">
                        <span style="color:var(--primary); font-weight:bold; font-size:1rem; font-family:var(--font-num)">LVL ${visitorLevel}</span>
                        <span style="font-size:0.7rem; color:#666">${visitorXP} / ${xpForNextLevel} XP</span>
                    </div>
                    <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden">
                        <div style="width: ${xpPercentage}%; height:100%; background:linear-gradient(90deg, var(--primary), #a855f7); transition: width 0.5s ease;"></div>
                    </div>
                </div>
                
                <div style="display:flex; gap:15px; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px; align-items:center">
                    <div title="Seguidores" onclick="window.openNetwork('followers')" style="cursor:pointer; text-align:center">
                        <strong style="color:white; display:block; line-height:1; font-size:1.1rem">${followers_count}</strong>
                        <span style="font-size:0.6rem; color:#888; text-transform:uppercase">Seguidores</span>
                    </div>
                    <div title="Seguindo" onclick="window.openNetwork('following')" style="cursor:pointer; text-align:center">
                        <strong style="color:white; display:block; line-height:1; font-size:1.1rem">${following_count}</strong>
                        <span style="font-size:0.6rem; color:#888; text-transform:uppercase">Seguindo</span>
                    </div>
                </div>
                <div class="wallet-badge" style="cursor:default; padding:6px 12px; border-radius:10px; background:rgba(217,70,239,0.1); border:1px solid var(--primary)" title="Blocos minerados por este usuário">
                    <i class="fa-solid fa-cube"></i> <span style="font-family:var(--font-num); font-weight:bold">${blockCount}</span> BLOCKS
                </div>
            </div>
        `;
    } else if (currentUser) {
        // OWNER MODE: Stats + XP Bar (Moved from Left)
        const xpStructure = `
            <div id="xpContainer" class="xp-display" style="min-width: 180px; margin-right:20px;">
                <div class="xp-info" style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:baseline">
                    <span class="level-badge" id="userLevelBadge" style="color:var(--primary); font-weight:bold; font-size:1rem; font-family:var(--font-num)">LVL 1</span>
                    <span class="xp-label" id="xpText" style="font-size:0.7rem; color:#666">0 / 1000 XP</span>
                </div>
                <div class="xp-bar-bg" style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden">
                    <div id="xpProgressBar" class="xp-bar-fill" style="width: 0%; height:100%; background:linear-gradient(90deg, var(--primary), #a855f7); transition: width 0.5s ease;"></div>
                </div>
            </div>
        `;

        centerHtml = `
            <div style="display:flex; align-items:center;">
                ${xpStructure}
                <div style="display:flex; gap:15px; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px; align-items:center">
                     <div title="Seguidores" onclick="window.openNetwork('followers')" style="cursor:pointer; text-align:center">
                        <strong style="color:white; display:block; line-height:1; font-size:1.1rem">${followers_count}</strong>
                        <span style="font-size:0.6rem; color:#888; text-transform:uppercase">Seguidores</span>
                    </div>
                    <div title="Seguindo" onclick="window.openNetwork('following')" style="cursor:pointer; text-align:center">
                        <strong style="color:white; display:block; line-height:1; font-size:1.1rem">${following_count}</strong>
                        <span style="font-size:0.6rem; color:#888; text-transform:uppercase">Seguindo</span>
                    </div>
                </div>
            </div>
        `;
    }

    if (DOM.headerActions) DOM.headerActions.innerHTML = centerHtml;
    // IMPORTANT: Re-bind DOM elements for XP logic since we just destroyed/recreated them
    if (!isShared && currentUser) {
        DOM.xpContainer = document.getElementById('xpContainer');
        DOM.xpBar = document.getElementById('xpProgressBar');
        DOM.xpText = document.getElementById('xpText');
        DOM.levelBadge = document.getElementById('userLevelBadge');
    }

    // 2. RIGHT SECTION (User Profile & Actions)
    let rightHtml = '';

    // Identity
    const displayNick = isShared ? (state.sharedProfileName || "Gamer") : (currentUser?.user_metadata?.nickname || "Gamer");
    const avatarSource = isShared ? state.userProfile?.avatar_url : currentUser?.user_metadata?.avatar_url;
    const finalAvatar = avatarSource || `https://ui-avatars.com/api/?name=${displayNick}&background=0ea5e9&color=fff`;

    if (currentUser || isShared) {
        // Hide the old avatar element since we'll include it in HTML
        if (DOM.userAvatar) {
            DOM.userAvatar.style.display = 'none';
        }

        if (isShared) {
            // VISITOR ACTIONS (Follow Button Only)
            if (currentUser) {
                const isFollowing = state.isFollowingCurrent;
                const btnIcon = isFollowing ? 'fa-user-check' : 'fa-user-plus';
                const btnColor = isFollowing ? 'var(--success)' : '#fff';
                const btnBorder = isFollowing ? 'var(--success)' : 'rgba(255,255,255,0.3)';

                rightHtml = `
                    <div style="margin-right:15px">
                        <button onclick="window.handleFollow()" class="btn-small" style="background:transparent; border:1px solid ${btnBorder}; color:${btnColor}; padding:6px 12px; border-radius:8px; font-weight:bold; transition:0.2s">
                            <i class="fa-solid ${btnIcon}"></i> ${isFollowing ? 'SEGUINDO' : 'SEGUIR'}
                        </button>
                    </div>
                    <img src="${finalAvatar}" style="width:40px; height:40px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); object-fit:cover; margin-right:10px">
                    <div style="text-align:right; line-height:1.2">
                        <span class="user-name" style="display:block; font-size:0.9rem; color:#fff">${displayNick.toUpperCase()}</span>
                        <small style="color:#666; font-size:0.65rem;">PERFIL</small>
                    </div>
                `;
            } else {
                rightHtml = `
                    <img src="${finalAvatar}" style="width:40px; height:40px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); object-fit:cover; margin-right:10px">
                    <div style="text-align:right; line-height:1.2; margin-right:10px">
                        <span class="user-name" style="display:block; font-size:0.9rem">${displayNick.toUpperCase()}</span>
                    </div>
                    <button onclick="window.handleLoginRequest()" class="btn-primary" style="font-size:0.7rem; padding:5px 10px">ENTRAR</button>
                `;
            }
        } else {
            // OWNER ACTIONS (Consolidated Action Bar)
            const unreadCount = state.notifications ? state.notifications.filter(n => !n.read).length : 0;
            const notifBadge = unreadCount > 0 ? `<span style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:var(--danger); border-radius:50%; box-shadow:0 0 5px var(--danger)"></span>` : '';
            const panelClass = state.isNotificationsOpen ? 'glass-panel' : 'glass-panel hidden';

            let notifList = `<div style="padding:20px; text-align:center; color:#666; font-size:0.8rem">Sem novidades por enquanto.</div>`;
            if (state.notifications && state.notifications.length > 0) {
                notifList = state.notifications.map(n => {
                    const isUnread = !n.read;
                    const bg = isUnread ? 'rgba(217, 70, 239, 0.05)' : 'transparent';
                    return `
                        <div onclick="window.handleNotificationClick(${n.id}, '${n.action_type}', '', null)" style="padding:12px; border-bottom:1px solid rgba(255,255,255,0.05); background:${bg}; cursor:pointer; display:flex; gap:10px;">
                            <div style="width:5px; height:5px; background:${isUnread ? 'var(--primary)' : '#444'}; border-radius:50%; margin-top:5px"></div>
                            <div>
                                <strong style="color:#fff; font-size:0.8rem">@${n.actor?.nickname || 'Sistema'}</strong>
                                <p style="margin:0; font-size:0.75rem; color:#aaa">${n.action_type === 'FOLLOW' ? 'novo seguidor!' : 'atividade recente.'}</p>
                            </div>
                        </div>
                     `;
                }).join('');
            }

            rightHtml = `
                <div class="action-bar" style="display:flex; align-items:center; gap:5px; margin-right:15px; padding-right:15px; border-right:1px solid rgba(255,255,255,0.1)">
                    <!-- Public Link -->
                    <button id="btnShareProfile" class="icon-btn" title="Copiar Link Público" style="width:32px; height:32px; border-radius:8px; border:none; background:rgba(255,255,255,0.05); color:#ccc; cursor:pointer; transition:0.2s">
                        <i class="fa-solid fa-link"></i>
                    </button>
                    <!-- Social Card -->
                    <button id="btnGenCard" class="icon-btn" title="Gerar Card Social" style="width:32px; height:32px; border-radius:8px; border:none; background:rgba(255,255,255,0.05); color:#ccc; cursor:pointer; transition:0.2s">
                         <i class="fa-solid fa-camera"></i>
                    </button>
                    <!-- Notifications -->
                    <div style="position:relative">
                        <button onclick="event.stopPropagation(); window.openNotifications()" class="icon-btn" style="width:32px; height:32px; border-radius:8px; border:none; background:rgba(255,255,255,0.05); color:#ccc; cursor:pointer; transition:0.2s">
                            <i class="fa-solid fa-bell"></i>
                            ${notifBadge}
                        </button>
                        <!-- Dropdown -->
                        <div id="notifPanel" class="${panelClass}" style="position:absolute; top:45px; right:0; width:280px; max-height:400px; overflow-y:auto; background:#141416; border:1px solid rgba(255,255,255,0.1); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.5); z-index:9999">
                            <div style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                                <span style="font-size:0.7rem; color:#888; font-weight:bold">NOTIFICAÇÕES</span>
                                <i class="fa-solid fa-xmark" onclick="event.stopPropagation(); window.openNotifications()" style="cursor:pointer; color:#666"></i>
                            </div>
                            <div style="max-height:300px; overflow-y:auto">
                                ${notifList}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Avatar -->
                <img src="${finalAvatar}" style="width:40px; height:40px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); object-fit:cover; margin-right:10px">

                <!-- User Dropdown Area -->
                 <div style="text-align:right; line-height:1.2; position:relative; cursor:pointer" onclick="document.getElementById('userDropdown').classList.toggle('hidden')">
                    <span class="user-name" style="display:block; font-size:0.9rem; color:#fff">${displayNick.toUpperCase()} <i class="fa-solid fa-caret-down" style="font-size:0.7rem; color:#666; margin-left:3px"></i></span>
                    <small style="color:var(--primary); font-size:0.65rem; font-weight:bold">PRO MEMBER</small>
                    
                    <!-- Simple Dropdown Menu -->
                    <div id="userDropdown" class="hidden glass-panel" style="position:absolute; top:40px; right:0; width:160px; padding:5px; background:#141416; border:1px solid rgba(255,255,255,0.1); z-index:9999; text-align:left">
                        <div onclick="window.handleEditProfile()" style="padding:10px; border-radius:6px; cursor:pointer; color:#ccc; font-size:0.8rem; display:flex; align-items:center; gap:10px; transition:0.2s" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                            <i class="fa-solid fa-user-pen" style="width:16px"></i> Editar Perfil
                        </div>
                        <div onclick="window.handleLogout()" style="padding:10px; border-radius:6px; cursor:pointer; color:var(--danger); font-size:0.8rem; display:flex; align-items:center; gap:10px; transition:0.2s" onmouseover="this.style.background='rgba(255,0,0,0.1)'" onmouseout="this.style.background='transparent'">
                            <i class="fa-solid fa-power-off" style="width:16px"></i> Sair
                        </div>
                    </div>
                </div>
            `;
        }
    } else {
        // GUEST
        if (DOM.userAvatar) DOM.userAvatar.style.display = 'none';
        rightHtml = `<button onclick="window.handleLoginRequest()" class="btn-primary" style="padding: 8px 16px; font-size: 0.75rem;"><i class="fa-brands fa-google"></i> ENTRAR</button>`;
    }

    if (DOM.authActions) DOM.authActions.innerHTML = rightHtml;

    // Attach Listeners for new Buttons
    if (!isShared && currentUser) {
        const btnLink = document.getElementById('btnShareProfile');
        const btnCard = document.getElementById('btnGenCard');
        if (btnLink) btnLink.onclick = () => {
            const url = `${window.location.origin}${window.location.pathname}?u=${state.sharedProfileName}`;
            navigator.clipboard.writeText(url).then(() => showToast("Link do perfil copiado!", "success"));
        };
        if (btnCard) btnCard.onclick = () => generateSocialCard();
    }
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
                <img src="${p.avatar_url || 'https://ui-avatars.com/api/?name=' + p.nickname + '&background=random'}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
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
        switch (item.action_type) {
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

        // Header
        const header = document.createElement('div');
        header.className = 'feed-header';

        const userDiv = document.createElement('div');
        userDiv.className = 'feed-user';

        const avatar = document.createElement('img');
        avatar.className = 'feed-avatar';
        avatar.src = `https://ui-avatars.com/api/?name=${item.user_nickname}&background=random`;
        avatar.style.cursor = 'pointer';
        avatar.onclick = () => window.location.href = `?u=${item.user_nickname}`;
        avatar.title = 'Ver Perfil';

        const infoDiv = document.createElement('div');
        const nickSpan = document.createElement('span');
        nickSpan.className = 'feed-nick';
        nickSpan.textContent = `@${item.user_nickname}`;
        nickSpan.onclick = () => window.location.href = `?u=${item.user_nickname}`;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'feed-date';
        dateSpan.textContent = date;

        infoDiv.appendChild(nickSpan);
        infoDiv.appendChild(dateSpan);
        userDiv.appendChild(avatar);
        userDiv.appendChild(infoDiv);

        const badge = document.createElement('div');
        badge.className = 'feed-badge';
        badge.style.color = color;
        badge.style.borderColor = color;

        const badgeIcon = document.createElement('i');
        badgeIcon.className = `fa-solid ${icon}`;
        badge.appendChild(badgeIcon);
        badge.appendChild(document.createTextNode(' ' + text));

        header.appendChild(userDiv);
        header.appendChild(badge);

        // Content
        const content = document.createElement('div');
        content.className = 'feed-content';

        const feedImg = document.createElement('div');
        feedImg.className = 'feed-img';
        feedImg.style.backgroundImage = `url('${item.game_image || ''}')`;

        const feedInfo = document.createElement('div');
        feedInfo.className = 'feed-info';
        feedInfo.style.flex = '1';

        const h3 = document.createElement('h3');
        h3.textContent = item.game_title;

        const platformBadge = document.createElement('span');
        platformBadge.className = 'badge';
        platformBadge.style.marginTop = '5px';
        platformBadge.style.display = 'inline-block';
        platformBadge.textContent = item.platform || 'Game';

        feedInfo.appendChild(h3);
        feedInfo.appendChild(platformBadge);

        const actions = document.createElement('div');
        actions.className = 'feed-actions';
        actions.style.cssText = "display:flex; align-items:flex-end; gap:10px;";

        const likeBtn = document.createElement('button');
        likeBtn.className = `btn-like ${likeBtnClass}`;
        likeBtn.onclick = () => window.handleLike(likeBtn, item.id);
        likeBtn.style.cssText = `background:none; border:none; color:${likeBtnColor}; cursor:pointer; font-size:1.2rem; display:flex; align-items:center; gap:5px; transition:0.2s`;

        const likeIcon = document.createElement('i');
        likeIcon.className = heartClass;

        const likeCount = document.createElement('span');
        likeCount.style.fontSize = '0.9rem';
        likeCount.textContent = item.likes_count || 0;

        likeBtn.appendChild(likeIcon);
        likeBtn.appendChild(likeCount);
        actions.appendChild(likeBtn);

        content.appendChild(feedImg);
        content.appendChild(feedInfo);
        content.appendChild(actions);

        card.appendChild(header);
        card.appendChild(content);
        feedContainer.appendChild(card);
    });
    DOM.grid.appendChild(feedContainer);
};

const renderXP = (allGames) => {
    const DOM = getDOM();
    if (!DOM.xpContainer || !DOM.xpBar) return;
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
    if (currentLevel >= 20) DOM.xpBar.style.background = 'linear-gradient(90deg, #ffd700, #ff3366)';
    else if (currentLevel >= 10) DOM.xpBar.style.background = 'linear-gradient(90deg, #0ea5e9, #d946ef)';
    else DOM.xpBar.style.background = 'linear-gradient(90deg, #00ff9d, #0ea5e9)';
};

const renderGrid = (visibleGames, isShared, totalCount = 0) => {
    const DOM = getDOM();
    if (!DOM.grid) return;
    DOM.grid.innerHTML = '';

    if (visibleGames.length === 0) {
        DOM.grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-muted);"><i class="fa-solid fa-ghost fa-3x" style="margin-bottom:20px; opacity:0.3;"></i><p>Nenhum jogo encontrado nesta seção.</p></div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    visibleGames.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.onclick = () => openGameDetails(game, isShared);
        card.onmouseenter = () => {
            const bgLayer = document.getElementById('dynamic-bg-layer');
            if (bgLayer && game.image_url) {
                bgLayer.style.backgroundImage = `url('${game.image_url}')`;
                bgLayer.classList.add('active');
            }
        };
        card.onmouseleave = () => {
            const bgLayer = document.getElementById('dynamic-bg-layer');
            if (bgLayer) bgLayer.classList.remove('active');
        };

        const badgeClass = getBadgeClass(game.status);
        const bgImage = game.image_url || 'https://via.placeholder.com/400x600?text=No+Cover';

        // Image Wrapper
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'card-img-wrapper';

        const img = document.createElement('div');
        img.className = 'card-img';
        img.style.backgroundImage = `url('${bgImage}')`;

        const overlay = document.createElement('div');
        overlay.className = 'card-overlay';

        imgWrapper.appendChild(img);
        imgWrapper.appendChild(overlay);

        if (game.tags && Array.isArray(game.tags) && game.tags.length > 0) {
            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'card-tags';
            game.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = `mini-tag ${tag.toLowerCase()}`;
                tagSpan.textContent = tag;
                tagsDiv.appendChild(tagSpan);
            });
            imgWrapper.appendChild(tagsDiv);
        }

        // Card Body
        const body = document.createElement('div');
        body.className = 'card-body';

        const platform = document.createElement('span');
        platform.className = 'card-platform';
        platform.textContent = game.platform || 'Outros';

        const title = document.createElement('h3');
        title.className = 'card-title';
        if (game.status === 'Desejado') {
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-star';
            icon.style.color = 'var(--warning)';
            icon.style.marginRight = '5px';
            title.appendChild(icon);
        }
        title.appendChild(document.createTextNode(game.title));

        const footer = document.createElement('div');
        footer.className = 'card-footer';

        const priceTag = document.createElement('div');
        priceTag.className = 'price-tag';

        let priceDisplay = null;
        if (!isShared) {
            if (game.status === 'Vendido') {
                const profit = (game.price_sold || 0) - (game.price_paid || 0);
                const colorClass = profit >= 0 ? 'text-green' : 'text-danger';
                const span = document.createElement('span');
                span.className = colorClass;
                span.style.fontWeight = 'bold';
                span.textContent = `${profit >= 0 ? '+' : ''} ${formatMoney(profit).replace('R$', '').trim()}`;
                priceTag.appendChild(span);
                priceDisplay = true;
            } else if (game.status === 'À venda') {
                const span = document.createElement('span');
                span.className = 'text-green';
                span.textContent = formatMoney(game.price_sold);
                priceTag.appendChild(span);
                priceDisplay = true;
            } else {
                priceTag.textContent = formatMoney(game.price_paid);
                priceDisplay = true;
            }
        } else {
            if (game.status === 'À venda') {
                const span = document.createElement('span');
                span.className = 'text-green';
                span.style.fontWeight = 'bold';
                span.textContent = formatMoney(game.price_sold);
                priceTag.appendChild(span);
                priceDisplay = true;
            }
        }

        if (!priceDisplay) priceTag.style.display = 'none';

        const badge = document.createElement('span');
        badge.className = `badge ${badgeClass}`;
        badge.textContent = game.status;

        footer.appendChild(priceTag);
        footer.appendChild(badge);

        body.appendChild(platform);
        body.appendChild(title);
        body.appendChild(footer);

        card.appendChild(imgWrapper);
        card.appendChild(body);
        fragment.appendChild(card);
    });

    DOM.grid.appendChild(fragment);

    // Manual Load More Button Logic (Client-Side)
    // We rely on the totalCount passed from renderApp
    const currentItems = visibleGames.length;

    // Only show "Load More" if we are viewing less than what is available
    if (currentItems < totalCount) {
        const btnDiv = document.createElement('div');
        btnDiv.style.gridColumn = '1 / -1';
        btnDiv.style.textAlign = 'center';
        btnDiv.style.padding = '30px';
        // Cleaned up styles - should be in CSS but at least less inline noise
        btnDiv.innerHTML = `<button id="btnLoadMore" class="btn-primary" style="padding:10px 40px; border-radius:30px; font-weight:bold;" onclick="window.loadMoreGames()">CARREGAR MAIS JOGOS (${currentItems} / ${totalCount})</button>`;
        DOM.grid.appendChild(btnDiv);
    } else if (currentItems > 0 && totalCount > 0) {
        const endMsg = document.createElement('div');
        endMsg.style.gridColumn = '1 / -1';
        endMsg.style.padding = '40px';
        endMsg.style.textAlign = 'center';
        endMsg.style.color = '#666';
        endMsg.style.fontStyle = 'italic';
        endMsg.textContent = "Coleção Completa.";
        DOM.grid.appendChild(endMsg);
    }
};

const openGameDetails = async (game, isShared) => {
    const modal = document.getElementById('gameDetailModal');
    if (!modal) return;
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
        const label = document.createElement('span');
        label.style.cssText = "display:block; font-size:0.75rem; color:#888; margin-bottom:5px";
        label.textContent = "DETALHES";
        tagsContainer.appendChild(label);

        const list = document.createElement('div');
        list.className = 'detail-tags-list';
        game.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'detail-tag';
            tagSpan.textContent = tag;
            list.appendChild(tagSpan);
        });
        tagsContainer.appendChild(list);
    }

    const videoArea = document.getElementById('detailVideoArea');
    if (videoArea) videoArea.innerHTML = '<div style="padding:20px; text-align:center; color:#666">Carregando Media Center...</div>';

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

        if (videoArea) {
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
                if (btn) window.updateVideoContext(initialType, btn, trailerUrl);
            }, 50);
        }
    } else {
        descEl.innerText = "Detalhes não encontrados.";
        if (videoArea) videoArea.innerHTML = '';
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

    // Use Helper
    const totalInvestido = calculateInvestment(jogosNaBase);

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
            legend: { position: 'right', labels: { color: '#e2e8f0', usePointStyle: true, font: { family: 'Inter' } } },
            tooltip: { backgroundColor: 'rgba(20,20,25,0.9)', titleColor: '#d946ef' }
        }
    };

    if (mode === 'platform') {
        const platforms = {};
        games.forEach(g => platforms[g.platform] = (platforms[g.platform] || 0) + 1);
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: Object.keys(platforms), datasets: [{ data: Object.values(platforms), backgroundColor: colors, borderColor: '#0a0a0c', borderWidth: 2 }] },
            options: { ...config, cutout: '60%', onClick: (evt, elements) => { if (elements.length > 0) { const index = elements[0].index; appStore.setState({ activePlatform: Object.keys(platforms)[index], chartMode: 'platform' }); } } }
        });
    } else if (mode === 'status') {
        const statuses = {};
        games.forEach(g => statuses[g.status] = (statuses[g.status] || 0) + 1);
        chartInstance = new Chart(ctx, {
            type: 'polarArea',
            data: { labels: Object.keys(statuses), datasets: [{ data: Object.values(statuses), backgroundColor: colors.map(c => c + '99'), borderColor: '#111', borderWidth: 1 }] },
            options: { ...config, scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { display: false } } }, onClick: (evt, elements) => { if (elements.length > 0) { const index = elements[0].index; appStore.setState({ activePlatform: Object.keys(statuses)[index], chartMode: 'status' }); } } }
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
        const sorted = [...games].sort((a, b) => (context === 'store' ? b.price_sold - a.price_sold : b.price_paid - a.price_paid)).slice(0, 5);
        chartInstance = new Chart(ctx, { type: 'bar', data: { labels: sorted.map(g => g.title.substring(0, 12) + '...'), datasets: [{ label: 'R$', data: sorted.map(g => context === 'store' ? g.price_sold : g.price_paid), backgroundColor: colors[1], borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' } }, y: { grid: { display: false }, ticks: { color: 'white' } } }, plugins: { legend: { display: false } } } });
    }
};

export const showToast = (msg, type = 'success') => {
    const DOM = getDOM();
    if (!DOM.toast) return;
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
    if (!btn) return;

    // HIDE ROULETTE IF SHARED VIEW
    if (appStore.get().isSharedMode) {
        btn.classList.add('hidden'); // Hide just the roulette button

        // Check if we should also hide the wrapper if it's empty/irrelevant
        const wrapper = btn.closest('.tools-wrapper');
        const exportBtn = document.getElementById('btnExport');
        // If export is also hidden or doesn't exist, hide the wrapper to avoid ugly border
        if (wrapper && (exportBtn.classList.contains('hidden') || exportBtn.style.display === 'none')) {
            wrapper.classList.add('hidden');
        }
        return;
    } else {
        btn.classList.remove('hidden');
        const wrapper = btn.closest('.tools-wrapper');
        if (wrapper) wrapper.classList.remove('hidden');
    }

    btn.onclick = () => {
        // FIX: Use ALL Games (Global), not just loaded page
        const { allGamesStats, games } = appStore.get();
        // PRIMARIAMENTE usa allGamesStats (Full), fallback para games (Parcial)
        const source = (allGamesStats && allGamesStats.length > 0) ? allGamesStats : (games || []);

        const candidates = source.filter(g => ['Backlog', 'Coleção', 'Jogando'].includes(g.status));
        if (candidates.length === 0) { showToast("Nenhum jogo jogável no backlog!", "error"); return; }
        const modal = document.getElementById('rouletteModal');
        const display = document.getElementById('rouletteDisplay');
        modal.classList.remove('hidden');
        display.innerHTML = `<div class="roulette-card" style="width:200px; height:300px; background-size:cover; background-position:center; margin:0 auto; border-radius:12px; background-image: url('https://media.giphy.com/media/3o7bu3XilJ5BOiSGic/giphy.gif'); border-color:var(--secondary)"></div><p class="modal-desc">Consultando os deuses do gaming...</p>`;
        setTimeout(() => {
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            display.innerHTML = `<div class="roulette-card winner" style="width:200px; height:300px; background-size:cover; background-position:center; margin:0 auto; border-radius:12px; background-image: url('${winner.image_url || ''}'); box-shadow: 0 0 30px var(--primary-glow);"></div><h3 style="color:white; font-size:1.5rem; margin-top:20px; margin-bottom:10px">${winner.title}</h3><span class="badge bg-backlog">${winner.platform}</span>`;
            if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 6000 });
        }, 2500);
    };
};

export const exportData = () => {
    const { games, allGamesStats, sharedProfileName } = appStore.get();
    const source = (allGamesStats && allGamesStats.length > 0) ? allGamesStats : (games || []);

    if (!source || source.length === 0) { showToast("Nada para exportar!", "error"); return; }

    showToast("Gerando Excel...", "info");

    try {
        // 1. Prepare Data Buckets
        const tabs = {
            'Coleção': [],
            'Desejados': [],
            'Loja': [],
            'Vendidos': []
        };

        // 2. Map Status to Tabs
        source.forEach(game => {
            // Flatten object for Excel
            const row = {
                Nome: game.title,
                Plataforma: game.platform,
                Status: game.status,
                'Preço Pago': game.price_paid || 0,
                'Preço Venda': game.price_sold || 0,
                'Imagem': game.image_url || ''
            };

            const s = game.status;
            // Merged Backlog into Coleção as requested
            if (['Coleção', 'Jogando', 'Platinado', 'Jogo Zerado', 'Backlog'].includes(s)) {
                tabs['Coleção'].push(row);
            } else if (s === 'Desejado') {
                tabs['Desejados'].push(row);
            } else if (s === 'À venda') {
                tabs['Loja'].push(row);
            } else if (s === 'Vendido') {
                tabs['Vendidos'].push(row);
            } else {
                // Fallback
                tabs['Coleção'].push(row);
            }
        });

        // 3. Create Workbook
        const wb = XLSX.utils.book_new();

        Object.keys(tabs).forEach(tabName => {
            const data = tabs[tabName];
            // Sort by Name
            data.sort((a, b) => a.Nome.localeCompare(b.Nome));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, tabName);
        });

        // 4. Download
        XLSX.writeFile(wb, `GameVault_Colecao_${sharedProfileName || 'MyGames'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast("Excel exportado com sucesso!");

    } catch (err) {
        console.error("Export Error:", err);
        showToast("Erro ao exportar Excel.", "error");
    }
};

// --- BLOCKCHAIN UI HELPERS ---

export const updateWalletUI = () => {
    // Don't show wallet badge in visitor mode
    const { isSharedMode } = appStore.get();

    // Show Badge only if NOT in shared mode
    const badge = document.getElementById('walletBadge');
    if (badge) {
        if (isSharedMode) {
            badge.classList.add('hidden');
        } else {
            badge.classList.remove('hidden');
        }
    }

    // Update Count
    const count = GameChain.chain.length;
    const countEl = document.getElementById('blockCount');
    if (countEl) countEl.innerText = count;

    // Update Explorer Stats
    const expTotal = document.getElementById('expTotalBlocks');
    if (expTotal) expTotal.innerText = count;

    const genesis = GameChain.chain[0];
    const expGen = document.getElementById('expGenesis');
    if (expGen && genesis) expGen.innerText = genesis.timestamp.split('T')[0];

    // Calc Net Worth (Latest)
    const latest = GameChain.getLatestBlock();
    const expNet = document.getElementById('expNetWorth');
    if (expNet && latest && latest.data && latest.data.stats && latest.data.stats.value) {
        expNet.innerText = formatMoney(latest.data.stats.value);
    }
};

export const openExplorer = () => {
    const modal = document.getElementById('explorerModal');
    const timeline = document.getElementById('explorerTimeline');
    if (!modal || !timeline) return;

    modal.classList.remove('hidden');

    // Populate Timeline
    const data = GameChain.getExplorerData();
    let html = '';

    data.forEach(block => {
        const isGenesis = block.height === 0;
        const tier = block.data && block.data.tier ? block.data.tier : 'COMMON';
        let tierColor = '#888';
        if (tier === 'RARE') tierColor = '#00d4ff';
        if (tier === 'LEGENDARY') tierColor = '#ffd700';

        html += `
            <div class="timeline-item">
                <div class="timeline-dot" style="background:${tierColor}; box-shadow: 0 0 10px ${tierColor}"></div>
                <div class="timeline-content">
                    <div class="timeline-hash" title="${block.hash}">#${block.height} - ${block.hash}</div>
                    <div class="timeline-meta">
                        <span>${block.time}</span>
                        <span style="color:${tierColor}; font-weight:bold">${tier}</span>
                    </div>
                    ${!isGenesis ? `
                    <div style="margin-top:5px; font-size:0.8rem; border-top:1px solid rgba(255,255,255,0.1); padding-top:5px;">
                        <div>💰 Worth: ${formatMoney(block.data.stats.value)}</div>
                        <div>🎮 Games: ${block.data.stats.games}</div>
                        <div>🏆 MVP: ${block.data.stats.mvp}</div>
                    </div>` : '<div style="margin-top:5px; font-size:0.8rem">🚀 The Beginning</div>'}
                </div>
            </div>
        `;
    });
    timeline.innerHTML = html;
};

// --- MODIFIED GENERATE CARD ---



export const generateSocialCard = async () => {
    const { user, games, allGamesStats, sharedProfileName, profileStats } = appStore.get();
    const source = (allGamesStats && allGamesStats.length > 0) ? allGamesStats : (games || []);

    showToast("Analisando Raridade e Minerando... aguarde.", "info");

    try {
        if (typeof CryptoJS === 'undefined') {
            alert("Erro: Biblioteca de Criptografia não carregada. Recarregue a página.");
            return;
        }

        const card = document.getElementById('socialCardHidden');
        const avatar = document.getElementById('scAvatar');
        const name = document.getElementById('scName');
        const statGames = document.getElementById('scGames');
        const statCompletion = document.getElementById('scCompletion');
        const statValue = document.getElementById('scValue');
        const statPlatform = document.getElementById('scTopPlatform');
        const statMVP = document.getElementById('scMVP');

        // Elements
        const statZerados = document.getElementById('scZerados');
        const statSold = document.getElementById('scSold');
        const statProfit = document.getElementById('scProfit');
        const hashEl = document.getElementById('scHash');
        const dateEl = document.getElementById('scDate');
        const levelEl = document.getElementById('scLevel');

        // 1. POPULATE IDENTITY
        name.innerText = sharedProfileName ? sharedProfileName.toUpperCase() : "PLAYER ONE";
        const profile = appStore.get().userProfile;
        avatar.src = (profile && profile.avatar_url) ? profile.avatar_url : "https://ui-avatars.com/api/?name=" + (sharedProfileName || "Player") + "&background=0ea5e9&color=fff";
        avatar.crossOrigin = "anonymous";

        // 2. CALCULATE STATS
        const baseGames = source.filter(g => g.status && g.status.trim() !== 'Desejado' && g.status.trim() !== 'Vendido');
        const soldGames = source.filter(g => g.status && g.status.trim() === 'Vendido');

        const costBase = baseGames.reduce((acc, g) => acc + (Number(g.price_paid) || 0), 0);
        const recovered = soldGames.reduce((acc, g) => acc + (Number(g.price_sold) || 0), 0);
        const netInvestment = costBase - recovered;

        const mvpGame = [...baseGames].sort((a, b) => (Number(b.price_paid) || 0) - (Number(a.price_paid) || 0))[0];
        const mvpName = mvpGame ? mvpGame.title : 'N/A';

        const zeradosCount = source.filter(g => ['Platinado', 'Jogo Zerado'].includes(g.status)).length;
        const soldCount = soldGames.length;
        const soldProfitVal = soldGames.reduce((acc, g) => acc + ((Number(g.price_sold) || 0) - (Number(g.price_paid) || 0)), 0);

        const displayGamesCount = baseGames.length;
        const completionRate = displayGamesCount > 0 ? Math.floor((zeradosCount / displayGamesCount) * 100) : 0;

        // Platform
        const platforms = {};
        baseGames.forEach(g => { platforms[g.platform] = (platforms[g.platform] || 0) + 1; });
        let topPlat = "PC";
        if (Object.keys(platforms).length > 0) topPlat = Object.keys(platforms).reduce((a, b) => platforms[a] > platforms[b] ? a : b);

        // 3. UPDATE DOM
        statGames.innerText = displayGamesCount;
        statCompletion.innerText = `${completionRate}%`;
        statValue.innerText = formatMoney(netInvestment);
        const platIcons = { 'PC': 'fa-brands fa-windows', 'Steam': 'fa-brands fa-steam', 'PlayStation 4': 'fa-brands fa-playstation', 'PlayStation 5': 'fa-brands fa-playstation', 'Switch': 'fa-brands fa-nintendo-switch', 'Xbox One': 'fa-brands fa-xbox', 'PS3': 'fa-brands fa-playstation', 'Nintendo Switch': 'fa-brands fa-nintendo-switch', 'Xbox Series X': 'fa-brands fa-xbox', 'Wii U': 'fa-solid fa-gamepad' };
        statPlatform.innerHTML = `<i class="${platIcons[topPlat] || 'fa-solid fa-gamepad'}" style="margin-right:5px; color:#fff;"></i> ${topPlat.replace('Nintendo ', '')}`;
        statMVP.innerText = mvpName;

        if (statZerados) statZerados.innerText = zeradosCount;
        if (statSold) statSold.innerText = soldCount;
        if (statProfit) {
            statProfit.innerText = formatMoney(soldProfitVal);
            statProfit.className = soldProfitVal >= 0 ? 'success' : 'danger';
        }

        if (mvpGame && mvpGame.image_url) {
            const mvpCard = statMVP.parentElement;
            mvpCard.style.backgroundImage = `url('${mvpGame.image_url}')`;
            mvpCard.classList.add('mvp-card');
        }

        // Level
        const level = Math.floor(displayGamesCount / 10) + 1;
        levelEl.innerText = `LVL ${level}`;

        // 3.5 DETERMINE RARITY
        let tier = "COMMON";
        if (soldProfitVal > 0 || displayGamesCount > 20) tier = "RARE";
        if (soldProfitVal > 2000 || displayGamesCount > 50) tier = "LEGENDARY";

        // Create Rarity Badge Element
        const rarityBadgePill = document.createElement('div');
        rarityBadgePill.className = `nft-badge tier-${tier.toLowerCase()}`;
        rarityBadgePill.style.background = tier === 'LEGENDARY' ? '#ffd700' : (tier === 'RARE' ? '#00d4ff' : '#888');
        rarityBadgePill.style.color = '#000';
        rarityBadgePill.style.boxShadow = `0 0 10px ${rarityBadgePill.style.background}`;
        rarityBadgePill.innerText = tier;

        // Apply visual styles to card
        card.classList.remove('tier-rare', 'tier-legendary');
        if (tier === 'RARE') card.classList.add('tier-rare');
        if (tier === 'LEGENDARY') card.classList.add('tier-legendary');


        // 4. MINT BLOCK
        const nftData = {
            owner: sharedProfileName || "User",
            date: new Date().toISOString(),
            stats: { games: displayGamesCount, value: netInvestment, mvp: mvpName },
            edition: "Genesis",
            tier: tier
        };

        let newBlock = { index: 'X' };

        // Ensure GameChain is ready
        if (typeof GameChain === 'undefined') {
            console.error("Blockchain service not loaded");
        } else {
            // Async Add Block (Cloud)
            await GameChain.addBlock(nftData);
            newBlock = GameChain.getLatestBlock();

            const fullHash = newBlock.hash;
            hashEl.innerText = fullHash;
            hashEl.title = fullHash;

            // Fix: Update Block Count on Card
            const scBlockCount = document.getElementById('scBlockCount');
            if (scBlockCount) scBlockCount.innerText = GameChain.chain.length;

            const dateObj = new Date(newBlock.timestamp);
            const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
            dateEl.innerText = `${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

            showToast(`Bloco #${newBlock.index} Minerado! (${tier})`, "success");
            updateWalletUI(); // Refresh Wallet Badge
        }

        // INJECT RARITY BADGE INTO HEADER RIGHT
        const headerRight = card.querySelector('.nft-header-right');
        if (headerRight) {
            headerRight.innerHTML = rarityBadgePill.outerHTML;
        } else {
            // Fallback
            card.querySelector('.nft-header').appendChild(rarityBadgePill);
        }

        // QR Code - Link to user profile
        // Priority: 1) userProfile.nickname (current profile), 2) sharedProfileName (visitor mode), 3) user.nickname (logged user)
        const currentProfile = appStore.get().userProfile;
        const userNickname = (currentProfile?.nickname) || sharedProfileName || (user?.user_metadata?.nickname) || 'gamer';
        const profileUrl = `${window.location.origin}${window.location.pathname}?u=${userNickname}`;
        console.log('🔍 QR Code - Nickname:', userNickname, 'URL:', profileUrl);
        const qrContainer = card.querySelector('.nft-qr');
        if (qrContainer) {
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(profileUrl)}&color=000000&bgcolor=FFFFFF" style="width:100%; height:100%; object-fit:contain; display:block;" crossorigin="anonymous">`;
        }

        // 5. GENERATE IMAGE
        await new Promise(r => setTimeout(r, 1200));
        const canvas = await html2canvas(card, {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            logging: false,
            allowTaint: true,
            ignoreElements: (element) => element.classList.contains('nft-holo')
        });
        const link = document.createElement('a');
        link.download = `GameVault_NFT_${sharedProfileName || 'Genesis'}_Block${newBlock.index}_${tier}.png`;
        link.href = canvas.toDataURL("image/png", 1.0);
        link.click();
        showToast("Card Salvo! Verifique sua carteira.", "success");

    } catch (e) {
        console.error(e);
        alert("Erro fatal ao gerar card: " + e.message);
    }
};

// --- INITIALIZATION ---
// Ensure Wallet updates on load if not called by renderApp
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof updateWalletUI === 'function') updateWalletUI();
    }, 500);
});

// Helper for close button which might be outside React-like flow
const closeBtn = document.getElementById('closeExplorer');
if (closeBtn) {
    closeBtn.onclick = () => {
        document.getElementById('explorerModal').classList.add('hidden');
    };
}