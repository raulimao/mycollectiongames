import { appStore } from './store.js';
import { GameService } from '../services/api.js';
// blockchain import removed

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

window.closeGameDetailModal = () => {
    const modal = document.getElementById('gameDetailModal');
    if (modal) modal.classList.add('hidden');

    // Stop Video Playback
    const container = document.getElementById('videoPlayerContainer');
    if (container) container.innerHTML = '';

    // Also clear the main area in case it wasn't wrapped yet (defensive)
    const area = document.getElementById('detailVideoArea');
    if (area) area.innerHTML = '';
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


    } else {
        if (btnAddGame) btnAddGame.classList.remove('hidden');
        if (btnExport) btnExport.classList.remove('hidden');
        if (costTab) costTab.style.display = 'block';
        if (DOM.xpContainer) DOM.xpContainer.classList.remove('hidden'); // Show XP for owner


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

    // BLOCKCHAIN REMOVED - functionality disabled

    // Attach Listeners if not already attached (Idempotent check could be improved, but cheap here)

    // Use allGamesStats for calculations if available (Total Collection), otherwise fallback to loaded games
    const statsSource = state.allGamesStats || state.games || [];

    // SOURCE OF TRUTH STRATEGY
    // We now use 'statsSource' (allGamesStats) for EVERYTHING, but we slice it for the grid.

    const term = state.searchTerm?.toLowerCase() || '';
    const activeFilter = state.filter || 'collection';

    let sourceData = statsSource;

    // Apply Basic Filters (Tab-based)
    let filteredGames = sourceData;

    if (activeFilter === 'sold') filteredGames = filteredGames.filter(g => g.status === 'Vendido');
    else if (activeFilter === 'wishlist') filteredGames = filteredGames.filter(g => g.status === 'Desejado');
    else if (activeFilter === 'store') filteredGames = filteredGames.filter(g => g.status === 'À venda');
    else if (activeFilter === 'backlog') filteredGames = filteredGames.filter(g => ['Backlog', 'Jogando'].includes(g.status));
    else filteredGames = filteredGames.filter(g => !['Vendido', 'Backlog', 'Desejado'].includes(g.status));

    // Search Term
    if (term) filteredGames = filteredGames.filter(g => g.title.toLowerCase().includes(term));

    // Chart Platform Filter (existing)
    if (state.activePlatform) {
        filteredGames = filteredGames.filter(g => g.platform === state.activePlatform);
        if (DOM.filterBadge) {
            DOM.filterBadge.classList.remove('hidden');
            if (DOM.filterName) DOM.filterName.innerText = state.activePlatform;
        }
    } else {
        if (DOM.filterBadge) DOM.filterBadge.classList.add('hidden');
    }

    // ADVANCED FILTERS
    filteredGames = applyAdvancedFilters(filteredGames, state.advancedFilters);

    // SORTING
    filteredGames = applySorting(filteredGames, state.advancedFilters.sortBy);

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

// --- ADVANCED FILTERS HELPER ---
const applyAdvancedFilters = (games, filters) => {
    if (!filters) return games;

    let filtered = [...games];

    // Platform Filter (multi-select)
    if (filters.platforms && filters.platforms.length > 0) {
        filtered = filtered.filter(g => filters.platforms.includes(g.platform));
    }

    // Status Filter (multi-select)
    if (filters.statuses && filters.statuses.length > 0) {
        filtered = filtered.filter(g => filters.statuses.includes(g.status));
    }

    // Tags Filter
    if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter(g => {
            if (!g.tags || !Array.isArray(g.tags)) return false;
            return filters.tags.some(tag => g.tags.includes(tag));
        });
    }

    // Price Range
    if (filters.priceRange) {
        const [min, max] = filters.priceRange;
        filtered = filtered.filter(g => {
            const price = g.price_paid || 0;
            return price >= min && price <= max;
        });
    }

    // Metacritic Range - Only filter if user changed from defaults
    if (filters.metacriticRange) {
        const [min, max] = filters.metacriticRange;
        // Only apply if user actually changed the range from default (0-100)
        if (min > 0 || max < 100) {
            filtered = filtered.filter(g => {
                if (!g.metacritic) return false; // Exclude games without rating
                return g.metacritic >= min && g.metacritic <= max;
            });
        }
    }

    return filtered;
};

// --- SORTING HELPER ---
const applySorting = (games, sortBy) => {
    if (!sortBy || sortBy === 'title') {
        return [...games].sort((a, b) => a.title.localeCompare(b.title));
    }

    const sorted = [...games];

    switch (sortBy) {
        case 'title-desc':
            return sorted.sort((a, b) => b.title.localeCompare(a.title));

        case 'date':
            return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        case 'date-desc':
            return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        case 'price':
            return sorted.sort((a, b) => (a.price_paid || 0) - (b.price_paid || 0));

        case 'price-desc':
            return sorted.sort((a, b) => (b.price_paid || 0) - (a.price_paid || 0));

        case 'metacritic':
            return sorted.sort((a, b) => (b.metacritic || 0) - (a.metacritic || 0));

        case 'metacritic-desc':
            return sorted.sort((a, b) => (a.metacritic || 0) - (b.metacritic || 0));

        default:
            return sorted;
    }
};

// --- RENDER HEADER (NEW UX OVERHAUL) ---
const renderHeader = (state, DOM, currentUser, isShared) => {
    const { followers_count, following_count } = state.profileStats || { followers_count: 0, following_count: 0 };

    // 1. CENTER SECTION (headerActions)
    let centerHtml = '';

    if (isShared) {
        // VISITOR MODE: Identity Badge + XP + Stats + Games Count
        const visitorStats = state.allGamesStats || [];
        const totalGames = visitorStats.length;

        // Calculate XP for visited user (SAME FORMULA as renderXP)
        const XP_TABLE = { 'Platinado': 2000, 'Jogo Zerado': 1000, 'Jogando': 200, 'Coleção': 100, 'Backlog': 20, 'Vendido': 40, 'À venda': 40, 'Desejado': 0 };
        let visitorXP = 0;
        visitorStats.forEach(g => visitorXP += (XP_TABLE[g.status] || 0));

        const XP_PER_LEVEL = 2000;
        const visitorLevel = Math.floor(visitorXP / XP_PER_LEVEL) + 1;
        const xpInCurrentLevel = visitorXP % XP_PER_LEVEL;
        const xpForNextLevel = XP_PER_LEVEL;
        const xpPercentage = (xpInCurrentLevel / XP_PER_LEVEL) * 100;

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
                        <span style="font-size:0.7rem; color:#666">${xpInCurrentLevel} / ${xpForNextLevel} XP</span>
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
                <div style="cursor:default; padding:6px 12px; border-radius:10px; background:rgba(0,212,255,0.1); border:1px solid var(--secondary)" title="Total de jogos na coleção">
                    <i class="fa-solid fa-gamepad"></i> <span style="font-family:var(--font-num); font-weight:bold">${totalGames}</span> JOGOS
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
            // OWNER ACTIONS - Define notification variables first
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

            // Detect mobile viewport
            const isMobile = window.innerWidth < 768;

            if (isMobile) {
                // MOBILE OWNER LAYOUT: Hamburger Menu
                rightHtml = `
                    <div style="display:flex; align-items:center; gap:8px">
                        <!-- Avatar -->
                        <img src="${finalAvatar}" style="width:32px; height:32px; border-radius:10px; border:2px solid rgba(255,255,255,0.1); object-fit:cover">
                        
                        <!-- Nick -->
                        <span style="font-size:0.75rem; color:#fff; font-weight:600">${displayNick}</span>
                        
                        <!-- Hamburger Menu -->
                        <button onclick="document.getElementById('mobileMenu').classList.toggle('hidden')" class="icon-btn" style="width:32px; height:32px; border-radius:8px; border:none; background:rgba(255,255,255,0.08); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; position:relative">
                            <i class="fa-solid fa-bars"></i>
                            ${unreadCount > 0 ? `<span style="position:absolute; top:2px; right:2px; width:8px; height:8px; background:var(--danger); border-radius:50%; box-shadow:0 0 5px var(--danger)"></span>` : ''}
                        </button>
                        
                        <!-- Mobile Dropdown Menu -->
                        <div id="mobileMenu" class="hidden glass-panel" style="position:fixed; top:60px; right:10px; width:200px; padding:8px; background:#141416; border:1px solid rgba(255,255,255,0.1); z-index:9999; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.8)">
                            <!-- Link -->
                            <div id="btnShareProfile" style="padding:10px; border-radius:8px; cursor:pointer; color:#ccc; font-size:0.85rem; display:flex; align-items:center; gap:10px; transition:0.2s" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                                <i class="fa-solid fa-link" style="width:16px; color:var(--secondary)"></i> Link Público
                            </div>

                            <!-- Notifications -->
                            <div onclick="window.openNotifications(); document.getElementById('mobileMenu').classList.add('hidden')" style="padding:10px; border-radius:8px; cursor:pointer; color:#ccc; font-size:0.85rem; display:flex; align-items:center; gap:10px; transition:0.2s; position:relative" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                                <i class="fa-solid fa-bell" style="width:16px; color:var(--warning)"></i> Notificações
                                ${unreadCount > 0 ? `<span style="background:var(--danger); color:#fff; padding:1px 6px; border-radius:10px; font-size:0.6rem; font-weight:bold">${unreadCount}</span>` : ''}
                            </div>
                            <div style="height:1px; background:rgba(255,255,255,0.1); margin:5px 0"></div>
                            <!-- Edit Profile -->
                            <div onclick="window.handleEditProfile()" style="padding:10px; border-radius:8px; cursor:pointer; color:#ccc; font-size:0.85rem; display:flex; align-items:center; gap:10px; transition:0.2s" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                                <i class="fa-solid fa-user-pen" style="width:16px"></i> Editar Perfil
                            </div>
                            <!-- Logout -->
                            <div onclick="window.handleLogout()" style="padding:10px; border-radius:8px; cursor:pointer; color:var(--danger); font-size:0.85rem; display:flex; align-items:center; gap:10px; transition:0.2s" onmouseover="this.style.background='rgba(255,0,0,0.1)'" onmouseout="this.style.background='transparent'">
                                <i class="fa-solid fa-power-off" style="width:16px"></i> Sair
                            </div>
                        </div>
                        
                        <!-- Notifications Panel (shows when clicked) -->
                        <div id="notifPanel" class="${panelClass}" style="position:fixed; top:60px; right:10px; width:280px; max-height:400px; overflow-y:auto; background:#141416; border:1px solid rgba(255,255,255,0.1); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.8); z-index:10000">
                            <div style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                                <span style="font-size:0.7rem; color:#888; font-weight:bold">NOTIFICAÇÕES</span>
                                <i class="fa-solid fa-xmark" onclick="event.stopPropagation(); window.openNotifications()" style="cursor:pointer; color:#666"></i>
                            </div>
                            <div style="max-height:300px; overflow-y:auto">
                                ${notifList}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // DESKTOP OWNER LAYOUT (existing)
                rightHtml = `
                <div class="action-bar" style="display:flex; align-items:center; gap:5px; margin-right:15px; padding-right:15px; border-right:1px solid rgba(255,255,255,0.1)">
                    <!-- Public Link -->
                    <button id="btnShareProfile" class="icon-btn" title="Copiar Link Público" style="width:32px; height:32px; border-radius:8px; border:none; background:rgba(255,255,255,0.05); color:#ccc; cursor:pointer; transition:0.2s">
                        <i class="fa-solid fa-link"></i>
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
        if (btnLink) btnLink.onclick = () => {
            const url = `${window.location.origin}${window.location.pathname}?u=${state.sharedProfileName}`;
            navigator.clipboard.writeText(url).then(() => showToast("Link do perfil copiado!", "success"));
        };
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

        // Defensive parsing for game_title (sometimes comes as JSON from DB trigger)
        let gameTitle = item.game_title || 'Jogo sem título';
        if (typeof gameTitle === 'string' && gameTitle.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(gameTitle);
                gameTitle = parsed.title || parsed.name || 'Jogo sem título';
            } catch (e) {
                console.warn('Failed to parse game_title JSON:', gameTitle);
                // Keep original if parse fails
            }
        }

        const h3 = document.createElement('h3');
        h3.textContent = gameTitle;

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
    const XP_TABLE = { 'Platinado': 2000, 'Jogo Zerado': 1000, 'Jogando': 200, 'Coleção': 100, 'Backlog': 20, 'Vendido': 40, 'À venda': 40, 'Desejado': 0 };
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

        // Metacritic Badge (Top Left)
        if (game.metacritic && game.metacritic > 0) {
            const mcBadge = document.createElement('div');
            mcBadge.className = 'metacritic-badge';

            // Color coding
            let mcColor = '#ef4444'; // red for < 50
            if (game.metacritic >= 75) mcColor = '#22c55e'; // green
            else if (game.metacritic >= 50) mcColor = '#eab308'; // yellow

            mcBadge.style.cssText = `
                position: absolute;
                top: 10px;
                left: 10px;
                background: ${mcColor};
                color: #000;
                font-weight: bold;
                font-size: 0.7rem;
                padding: 4px 8px;
                border-radius: 4px;
                font-family: var(--font-num);
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                z-index: 2;
            `;
            mcBadge.textContent = game.metacritic;
            mcBadge.title = `Metacritic: ${game.metacritic}/100`;
            imgWrapper.appendChild(mcBadge);
        }

        // --- DEAL BADGE (New) ---
        if (game.status === 'Desejado' && game.latest_deal) {
            const dealBadge = document.createElement('div');
            dealBadge.className = 'deal-badge';
            dealBadge.innerHTML = `<i class="fa-solid fa-tags"></i> ${game.latest_deal.savings}% OFF`;
            dealBadge.style.cssText = `
                position: absolute; top: 10px; right: 10px;
                background: var(--primary); color: white;
                font-weight: bold; font-size: 0.7rem;
                padding: 4px 8px; border-radius: 4px;
                font-family: var(--font-num);
                box-shadow: 0 0 10px var(--primary-glow);
                z-index: 2; animation: pulse 2s infinite;
            `;
            imgWrapper.appendChild(dealBadge);
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
                span.textContent = formatMoney(game.price_sold);
                priceTag.appendChild(span);
                priceDisplay = true;
            } else if (game.status === 'Desejado' && game.latest_deal) {
                // Wishlist with Deal Found
                const span = document.createElement('span');
                span.className = 'text-green';
                span.style.fontWeight = 'bold';
                span.innerHTML = `${formatMoney(game.latest_deal.price)} <small style='text-decoration:line-through; color:#666; font-size:0.7em'>${formatMoney(game.latest_deal.retailPrice)}</small>`;
                priceTag.appendChild(span);
                priceDisplay = true;
            } else if (game.status === 'Desejado') {
                // Wishlist Target Price
                const span = document.createElement('span');
                span.style.color = '#666';
                span.style.fontSize = '0.8em';
                span.innerHTML = `Alvo: ${formatMoney(game.price_paid)}`;
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
    if (game.status === 'Desejado') {
        priceLabel.innerText = "PREÇO ALVO";
        priceEl.style.color = "var(--text-muted)";
        if (game.latest_deal) {
            const dealInfo = document.createElement('div');
            dealInfo.innerHTML = `<br><span style="color:var(--primary); font-weight:bold; font-size:1.2rem">OFERTA: ${formatMoney(game.latest_deal.price)}</span>`;
            priceEl.appendChild(dealInfo);
        }
    }
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
            // Removed 'initialType' logic as it was unused or implicit
            videoArea.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h4 style="color: white; font-family: var(--font-num); font-size: 0.9rem; margin:0;"><i class="fa-brands fa-youtube" style="color: #ff0000; margin-right: 8px;"></i> MEDIA CENTER</h4>
                </div>
                <div class="video-controls">
                    <button class="video-chip ${hasTrailer ? 'active' : ''}" onclick="window.updateVideoContext('TRAILER', this, '${trailerUrl}')">TRAILER</button>
                    <button class="video-chip ${!hasTrailer ? 'active' : ''}" onclick="window.updateVideoContext('Gameplay', this, 'QUERY')">GAMEPLAY</button>
                    <button class="video-chip" onclick="window.updateVideoContext('Review', this, 'QUERY')">ANÁLISE</button>
                    <button class="video-chip" onclick="window.updateVideoContext('Soundtrack', this, 'QUERY')">SOUNDTRACK</button>
                </div>
                <div id="videoPlayerContainer">
                    <div class="video-wrapper">
                        <iframe id="videoFrame" src="${hasTrailer ? trailerUrl : 'about:blank'}" frameborder="0" allowfullscreen></iframe>
                    </div>
                </div>
            `;

            if (!hasTrailer) {
                // Trigger gameplay search if no trailer
                window.updateVideoContext('Gameplay', videoArea.querySelector('button:nth-child(2)'), null);
            }
        }
    } else {
        // Handle Error / Null Case
        descEl.innerHTML = '<span style="color:var(--text-muted)">Não foi possível carregar os detalhes adicionais (API).</span>';
        if (videoArea) videoArea.innerHTML = '<div style="padding:20px; text-align:center; color:#666">Media Center indisponível offline.</div>';
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

    // SIMPLE & DISTINCT - Maximum visual separation between all platforms
    // Each color chosen for maximum contrast with neighbors
    const distinctColors = [
        '#8b5cf6',  // Violet
        '#00d4ff',  // Cyan  
        '#10b981',  // Emerald
        '#f97316',  // Orange
        '#ec4899',  // Pink
        '#facc15',  // Yellow
        '#3b82f6',  // Blue
        '#ef4444',  // Red
        '#14b8a6',  // Teal
        '#f472b6',  // Rose
        '#84cc16',  // Lime
        '#a855f7',  // Purple
        '#06b6d4',  // Light Cyan
        '#fb923c',  // Light Orange
        '#22c55e',  // Green
        '#f43f5e',  // Coral
    ];

    // Center text plugin
    const centerTextPlugin = {
        id: 'centerText',
        beforeDraw: (chart) => {
            if (chart.config.type !== 'doughnut') return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;

            const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);

            // Calculate TRUE center of the doughnut (excluding legend)
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;

            ctx.save();
            ctx.shadowColor = '#8b5cf6';
            ctx.shadowBlur = 15;

            ctx.font = 'bold 2rem Orbitron';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(total, centerX, centerY - 8);

            ctx.shadowBlur = 0;
            ctx.font = '600 0.65rem Inter';
            ctx.fillStyle = '#8b5cf6';
            ctx.fillText('JOGOS', centerX, centerY + 18);

            ctx.restore();
        }
    };

    const config = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#ccc',
                    usePointStyle: true,
                    pointStyle: 'circle',
                    font: { family: 'Inter', size: 11 },
                    padding: 10
                }
            },
            tooltip: {
                backgroundColor: 'rgba(10,10,15,0.95)',
                titleColor: '#fff',
                bodyColor: '#aaa',
                borderColor: 'rgba(139,92,246,0.5)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 6,
                callbacks: {
                    label: (ctx) => ` ${ctx.raw} jogos (${((ctx.raw / games.length) * 100).toFixed(1)}%)`
                }
            }
        }
    };

    if (mode === 'platform') {
        const platforms = {};
        games.forEach(g => platforms[g.platform] = (platforms[g.platform] || 0) + 1);

        const sorted = Object.entries(platforms).sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(([n]) => n);
        const data = sorted.map(([, c]) => c);
        const colors = labels.map((_, i) => distinctColors[i % distinctColors.length]);

        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            plugins: [centerTextPlugin],
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: '#0a0a0f',
                    borderWidth: 2,
                    hoverOffset: 10
                }]
            },
            options: {
                ...config,
                cutout: '60%',
                onClick: (evt, el) => {
                    if (el.length > 0) appStore.setState({ activePlatform: labels[el[0].index], chartMode: 'platform' });
                }
            }
        });
    } else if (mode === 'status') {
        // Semantic colors for game statuses
        const statusColors = {
            'Coleção': '#0ea5e9',        // Sky blue - Owned
            'Backlog': '#8b5cf6',        // Purple - To Play
            'Jogando': '#22d3ee',        // Cyan - Playing
            'Jogo Zerado': '#10b981',    // Green - Completed
            'Platinado': '#facc15',      // Gold - Platinum
            'Wishlist': '#f97316',       // Orange - Want
            'Abandonado': '#ef4444',     // Red - Abandoned
            'Emprestado': '#ec4899',     // Pink - Lent
            'Vendido': '#64748b',        // Gray - Sold
        };

        const statuses = {};
        games.forEach(g => statuses[g.status] = (statuses[g.status] || 0) + 1);

        // Sort by count
        const sortedStatuses = Object.entries(statuses).sort((a, b) => b[1] - a[1]);
        const labels = sortedStatuses.map(([name]) => name);
        const data = sortedStatuses.map(([, count]) => count);
        const chartColors = labels.map((name, i) => statusColors[name] || fallbackColors[i % fallbackColors.length]);

        chartInstance = new Chart(ctx, {
            type: 'polarArea',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: chartColors.map(c => c + 'cc'),
                    borderColor: chartColors,
                    borderWidth: 2
                }]
            },
            options: {
                ...config,
                scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { display: false } } },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        appStore.setState({ activePlatform: labels[index], chartMode: 'status' });
                    }
                }
            }
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
            data: {
                labels: Object.keys(stats),
                datasets: [{
                    label: 'Gamer DNA',
                    data: Object.values(stats),
                    backgroundColor: 'rgba(217, 70, 239, 0.2)',
                    borderColor: '#d946ef',
                    pointBackgroundColor: '#0ea5e9',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        pointLabels: { color: '#fff', font: { family: 'Orbitron', size: 10 } },
                        ticks: { display: false, backdropColor: 'transparent' },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    } else if (mode === 'cost') {
        if (appStore.get().isSharedMode) return;
        const sorted = [...games].sort((a, b) => (context === 'store' ? b.price_sold - a.price_sold : b.price_paid - a.price_paid)).slice(0, 5);
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(g => g.title.substring(0, 12) + '...'),
                datasets: [{
                    label: 'R$',
                    data: sorted.map(g => context === 'store' ? g.price_sold : g.price_paid),
                    backgroundColor: '#0ea5e9',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' } },
                    y: { grid: { display: false }, ticks: { color: 'white' } }
                },
                plugins: { legend: { display: false } }
            }
        });
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

// --- BLOCKCHAIN REMOVED ---



// --- MODIFIED GENERATE CARD ---





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