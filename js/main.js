import { supabase, AuthService } from './services/supabase.js';
import { GameService, SocialService } from './services/api.js';
import { ImportService } from './services/importer.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal, setupRoulette, exportData, generateSocialCard, renderUserList } from './modules/ui.js';
import { initMobileTouchHandlers, handleOrientationChange, initNetworkDetection } from './modules/mobile.js';

let editingId = null;
let isInitializing = false;

const DEFAULT_PLATFORMS = ["PC", "PlayStation 5", "PlayStation 4", "Xbox Series X/S", "Xbox One", "Nintendo Switch", "Steam Deck", "Mobile", "Outros"];

window.toggleTag = (btn) => {
    btn.classList.toggle('active');
    const actives = document.querySelectorAll('.tag-toggle.active');
    const values = Array.from(actives).map(b => b.dataset.val);
    document.getElementById('inputTags').value = JSON.stringify(values);
};

// GLOBAL STATE FOR PAGINATION
let currentPage = 0;
// GAMES_PER_PAGE Removed (Use store level paginationLimit)
let isLoadingMore = false;

// Client-Side Pagination Strategy
window.loadMoreGames = async () => {
    if (isLoadingMore) return;

    const { paginationLimit, allGamesStats } = appStore.get();

    // Safety check
    if (!allGamesStats || paginationLimit >= allGamesStats.length) return;

    isLoadingMore = true;

    // Simulate "Loading" just for UI feedback (optional, but feels nice)
    const btn = document.getElementById('btnLoadMore');
    let originalText = "";
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Carregando...';
        btn.disabled = true;
    }

    // Small timeout to allow UI update before heavy render if needed, or just immediate.
    setTimeout(() => {
        appStore.setState({ paginationLimit: paginationLimit + 16 });
        isLoadingMore = false;
        // Button state logic is handled in rencderGrid
    }, 300);
};

// Infinite Scroll Setup
// Infinite Scroll Removed - Manual Load More Button Strategy
// window.setupInfiniteScroll = () => { ... }

window.handleLogoClick = () => {
    const { user, isSharedMode } = appStore.get();
    if (isSharedMode) { window.location.href = window.location.pathname; }
    else {
        if (!user) document.getElementById('loginOverlay').classList.remove('hidden');
        else { showToast("Atualizando...", "info"); loadData(user.id); }
    }
};

window.handleLoginRequest = () => document.getElementById('loginOverlay').classList.remove('hidden');

// Initialize Scroll logic on load
document.addEventListener('DOMContentLoaded', () => {
    if (window.setupInfiniteScroll) window.setupInfiniteScroll();

    // Initialize mobile touch interactions
    initMobileTouchHandlers();
    handleOrientationChange();
    initNetworkDetection();
});
window.handleLogout = () => { if (confirm("Sair?")) AuthService.signOut(); };

window.handleFollow = async () => {
    const { user, games, sharedProfileName, visitedUserId } = appStore.get();
    if (!user) { showToast("Faça login para seguir!", "error"); return; }

    // Fix: Use visitedUserId in shared mode, fallback to games array
    const ownerId = visitedUserId || (games && games.length > 0 ? games[0].user_id : null);
    if (!ownerId) { showToast("Erro ao identificar usuário.", "error"); return; }
    if (ownerId === user.id) { showToast("Você não pode seguir a si mesmo.", "warning"); return; }

    try {
        const btn = document.getElementById('btnFollow');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        const isNowFollowing = await SocialService.toggleFollow(user.id, ownerId);
        appStore.setState({ isFollowingCurrent: isNowFollowing });
        loadData(ownerId, true);

        isNowFollowing ? showToast(`Seguindo ${sharedProfileName}!`, "success") : showToast(`Deixou de seguir ${sharedProfileName}.`, "info");
    } catch (e) {
        console.error(e);
        showToast("Erro ao seguir.", "error");
        appStore.notify();
    }
};

window.handleLike = async (btn, feedId) => {
    const { user, feedData } = appStore.get();
    if (!user) { showToast("Faça login para curtir!", "error"); return; }

    const isLiked = btn.classList.contains('liked');

    btn.classList.toggle('liked');
    const span = btn.querySelector('span');
    let count = parseInt(span.innerText);
    span.innerText = isLiked ? count - 1 : count + 1;

    try {
        const result = await SocialService.toggleLike(feedId, user.id);
        const newFeedData = feedData.map(post => {
            if (post.id === feedId) {
                return { ...post, likes_count: result === 'added' ? post.likes_count + 1 : Math.max(0, post.likes_count - 1) };
            }
            return post;
        });
        const userLikes = await SocialService.getUserLikes(user.id);
        appStore.setState({ feedData: newFeedData, userLikes });

    } catch (e) {
        console.error(e);
        showToast("Erro ao curtir.", "error");
        btn.classList.toggle('liked');
        span.innerText = count;
    }
};



window.runFeedCleanup = async () => {
    const { user } = appStore.get();
    if (!user) { showToast("Faça login primeiro.", "error"); return; }

    if (!confirm("Isso irá verificar seu feed e remover postagens de jogos que você já deletou. Deseja continuar?")) return;

    try {
        showToast("Verificando consistência do feed...", "info");
        const count = await SocialService.cleanupOrphanedFeed(user.id);
        if (count > 0) {
            showToast(`Limpeza concluída! ${count} itens órfãos removidos.`, "success");
            // Refresh feed if active
            const btn = document.querySelector('button[data-tab="feed"]');
            if (btn && btn.classList.contains('active')) btn.click();
        } else {
            showToast("Seu feed já está sincronizado.", "success");
        }
    } catch (e) {
        console.error(e);
        showToast("Erro na limpeza.", "error");
    }
};

window.openNotifications = () => {
    const { isNotificationsOpen, user, notifications } = appStore.get();

    if (isNotificationsOpen) {
        appStore.setState({ isNotificationsOpen: false });
    } else {
        if (user) SocialService.markAllNotificationsRead(user.id);
        const readNotifs = notifications.map(n => ({ ...n, read: true }));
        appStore.setState({
            isNotificationsOpen: true,
            notifications: readNotifs
        });
    }
};

window.handleNotificationClick = async (notifId, type, actorNick, relatedId) => {
    await SocialService.markNotificationRead(notifId);
    const { notifications } = appStore.get();
    const newNotifs = notifications.map(n => n.id === notifId ? { ...n, read: true } : n);

    if (type === 'FOLLOW') {
        window.location.href = `?u=${actorNick}`;
    } else if (type === 'LIKE') {
        appStore.setState({ notifications: newNotifs, isNotificationsOpen: false });
        document.querySelector('button[data-tab="feed"]').click();
        showToast(`Atividade curtida por ${actorNick}`, "info");
    } else {
        appStore.setState({ notifications: newNotifs });
    }
};

window.handleEditProfile = () => {
    const { userProfile } = appStore.get();
    document.getElementById('editNick').value = userProfile?.nickname || '';
    document.getElementById('editAvatar').value = userProfile?.avatar_url || '';
    document.getElementById('profileEditModal').classList.remove('hidden');
};

window.openNetwork = async (type) => {
    const { user, games, visitedUserId, isSharedMode } = appStore.get();

    // Fix: In shared mode, use visitedUserId; otherwise use games[0] or current user
    const targetUserId = isSharedMode && visitedUserId
        ? visitedUserId
        : (games && games.length > 0 ? games[0].user_id : user?.id);

    if (!targetUserId) return;

    document.getElementById('networkModal').classList.remove('hidden');
    document.getElementById('networkTitle').innerText = type === 'followers' ? 'SEGUIDORES' : 'SEGUINDO';
    document.getElementById('networkList').innerHTML = '<div style="text-align:center; padding:20px;">Carregando...</div>';

    try {
        const profiles = await SocialService.getNetwork(targetUserId, type);
        let myFollowingIds = [];
        if (user) myFollowingIds = await SocialService.getUserFollowingIds(user.id);
        renderUserList(profiles, myFollowingIds, user?.id);
    } catch (e) {
        document.getElementById('networkList').innerHTML = '<div style="text-align:center;">Erro ao carregar.</div>';
    }
};

window.handleListFollow = async (targetId, btn) => {
    const { user } = appStore.get();
    if (!user) return;
    const originalText = btn.innerText;
    btn.innerText = "..."; btn.disabled = true;

    try {
        const isNowFollowing = await SocialService.toggleFollow(user.id, targetId);
        if (isNowFollowing) {
            btn.innerText = "Deixar de Seguir";
            btn.style.borderColor = "var(--danger)"; btn.style.color = "var(--danger)";
        } else {
            btn.innerText = "Seguir";
            btn.style.borderColor = "var(--primary)"; btn.style.color = "var(--primary)";
        }
    } catch (e) { showToast("Erro.", "error"); btn.innerText = originalText; }
    finally { btn.disabled = false; }
};

const init = async () => {
    console.log("🚀 [System] GameVault Init");
    appStore.subscribe(state => renderApp(state));
    setupGlobalEvents();

    // Infinite Scroll Removed
    // setupInfiniteScroll();

    const urlParams = new URLSearchParams(window.location.search);
    const sharedNick = urlParams.get('u');

    if (sharedNick) {
        await handleVisitorMode(sharedNick);
        checkAuthForVisitor();
    } else {
        checkAuthStatus();
    }
};

const setupRealtime = (userId) => {
    console.log("📡 [Realtime] Conectando para:", userId);
    supabase.channel('public:notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            async (payload) => {
                console.log("🔔 Nova Notificação!", payload);
                showToast("Você tem uma nova notificação!", "info");
                const notifs = await SocialService.getNotifications(userId);
                appStore.setState({ notifications: notifs });
            })
        .subscribe();
};

const checkAuthForVisitor = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        appStore.setState({ user: session.user });
        const likes = await SocialService.getUserLikes(session.user.id);
        appStore.setState({ userLikes: likes });
        setupRealtime(session.user.id);
    }
};

const checkAuthStatus = () => {
    const safetyTimer = setTimeout(() => {
        const loader = document.getElementById('globalLoader');
        if (loader && !loader.classList.contains('hidden')) {
            loader.classList.add('hidden');
            if (document.getElementById('appContainer').classList.contains('hidden')) document.getElementById('loginOverlay').classList.remove('hidden');
        }
    }, 5000);

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (isInitializing && event === 'SIGNED_IN') return;
        clearTimeout(safetyTimer);

        if (session?.user) {
            isInitializing = true;
            document.getElementById('loginOverlay').classList.add('hidden');
            document.getElementById('globalLoader').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');

            appStore.setState({ user: session.user, isSharedMode: false });
            setupRealtime(session.user.id);

            handleUserLoggedIn(session.user).finally(() => isInitializing = false);
        } else {
            const { isSharedMode } = appStore.get();
            if (!isSharedMode) {
                appStore.reset();
                document.getElementById('appContainer').classList.add('hidden');
                document.getElementById('loginOverlay').classList.remove('hidden');
                document.getElementById('globalLoader').classList.add('hidden');
            }
        }
    });
};

const handleUserLoggedIn = async (user) => {
    try {
        const profile = await GameService.getMyProfile(user.id);
        if (!profile) {
            setTimeout(() => document.getElementById('nicknameModal').classList.remove('hidden'), 500);
            setupNicknameForm(user);
        } else {
            appStore.setState({ sharedProfileName: profile.nickname, userProfile: profile });
        }
        setupAuthEvents();
        await loadData(user.id);
    } catch (error) { console.error("Login error:", error); }
};

const loadData = async (userId, isPartial = false) => {
    try {
        if (isPartial) {
            const stats = await SocialService.getProfileStats(userId);
            appStore.setState({ profileStats: stats });
            return;
        }

        // Reset pagination
        currentPage = 0;

        const userProfile = await GameService.getMyProfile(userId);

        // Parallel Fetch: Stats (All), Notifications, Likes
        // We removed 'fetchGames' (paginated) in favor of Client-Side Pagination using 'allStats'
        const [stats, notifications, userLikes, allStats] = await Promise.all([
            SocialService.getProfileStats(userId),
            SocialService.getNotifications(userId),
            SocialService.getUserLikes(userId),
            GameService.fetchStatsOnly(userId) // This returns ALL games (lightweight fields)
        ]);

        appStore.setState({
            games: [], // Deprecated for grid source, but kept for compatibility. UI uses sliced allGamesStats.
            allGamesStats: allStats || [],
            profileStats: stats,
            notifications,
            userLikes,
            userProfile,
            paginationLimit: 16 // Reset limit
        });

    } catch (e) { console.error("LoadData error:", e); }
};

const handleVisitorMode = async (nickname) => {
    const userId = await GameService.getUserIdByNickname(nickname);
    document.getElementById('globalLoader').classList.add('hidden');
    document.getElementById('loginOverlay').classList.add('hidden');

    if (userId) {
        document.getElementById('appContainer').classList.remove('hidden');
        // Fetch stats for visitor profile (blockchain removed)
        const [stats, allStats] = await Promise.all([
            SocialService.getProfileStats(userId),
            GameService.fetchStatsOnly(userId)
        ]);

        const { data: { session } } = await supabase.auth.getSession();
        let isFollowing = false;
        if (session?.user && session.user.id !== userId) {
            try { isFollowing = await SocialService.checkIsFollowing(session.user.id, userId); } catch (e) { }
        }

        appStore.setState({
            games: [], // Deprecated
            allGamesStats: allStats || [], // Full dataset
            paginationLimit: 16,
            profileStats: stats,
            isSharedMode: true,
            sharedProfileName: nickname,
            visitedUserId: userId, // Store for Follow button
            isFollowingCurrent: isFollowing
        });
    } else {
        alert("Perfil não encontrado!"); window.location.href = window.location.pathname;
    }
};

// CORREÇÃO: Listener global para a tecla ESC
const setupGlobalEvents = () => {
    const safeClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    safeClick('btnGoogle', () => AuthService.signInGoogle());
    safeClick('btnCloseModal', () => toggleModal(false));
    safeClick('btnExport', () => exportData());
    safeClick('btnImport', () => handleImportClick());
    safeClick('btnCompare', () => handleCompareClick());
    safeClick('btnStartImport', () => handleImportSubmit());

    document.addEventListener('click', (e) => {
        const { isNotificationsOpen } = appStore.get();
        const panel = document.getElementById('notifPanel');
        const btn = document.querySelector('button[title="Notificações"]');

        if (isNotificationsOpen && panel && !panel.contains(e.target) && (!btn || !btn.contains(e.target))) {
            appStore.setState({ isNotificationsOpen: false });
        }
    });

    // --- NOVO: FECHAR COM ESC ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = [
                'gameDetailModal', 'gameModal', 'rouletteModal', 'nicknameModal',
                'networkModal', 'profileEditModal', 'importModal', 'compareModal'
            ];
            let closedAny = false;
            modals.forEach(id => {
                const el = document.getElementById(id);
                if (el && !el.classList.contains('hidden')) {
                    el.classList.add('hidden');
                    closedAny = true;
                }
            });
            // Também fecha o painel de notificação se estiver aberto
            const { isNotificationsOpen } = appStore.get();
            if (!closedAny && isNotificationsOpen) {
                appStore.setState({ isNotificationsOpen: false });
            }
        }
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const clickedBtn = e.target.closest('.tab-btn');
            if (!clickedBtn) return;
            const tab = clickedBtn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            clickedBtn.classList.add('active');

            if (tab === 'feed') {
                try {
                    const feed = await SocialService.getGlobalFeed();
                    const { user } = appStore.get();
                    if (user) {
                        const likes = await SocialService.getUserLikes(user.id);
                        appStore.setState({ filter: 'feed', feedData: feed, userLikes: likes });
                    } else {
                        appStore.setState({ filter: 'feed', feedData: feed });
                    }
                } catch (err) { showToast("Erro no feed.", "error"); }
            } else {
                appStore.setState({ filter: tab });
            }
        });
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', (e) => appStore.setState({ searchTerm: e.target.value }));
    setupRoulette();
    setupAdvancedFilters();
};

// --- ADVANCED FILTERS SETUP ---
const setupAdvancedFilters = () => {
    // Initialize dynamic platform/status filters when games load
    appStore.subscribe((state) => {
        if (state.allGamesStats && state.allGamesStats.length > 0) {
            initializePlatformFilters(state.allGamesStats);
            initializeStatusFilters(state.allGamesStats);
        }
    });

    // Range Sliders
    const mcMin = document.getElementById('filterMcMin');
    const mcMax = document.getElementById('filterMcMax');
    const priceMin = document.getElementById('filterPriceMin');
    const priceMax = document.getElementById('filterPriceMax');

    if (mcMin && mcMax) {
        const updateMcRange = () => {
            const min = parseInt(mcMin.value);
            const max = parseInt(mcMax.value);
            const display = document.getElementById('mcRangeDisplay');
            if (display) display.textContent = `${min} - ${max}`;
        };

        mcMin.addEventListener('input', updateMcRange);
        mcMax.addEventListener('input', updateMcRange);
    }

    if (priceMin && priceMax) {
        const updatePriceRange = () => {
            const min = parseInt(priceMin.value);
            const max = parseInt(priceMax.value);
            const display = document.getElementById('priceRangeDisplay');
            if (display) display.textContent = `R$ ${min} - R$ ${max}`;
        };

        priceMin.addEventListener('input', updatePriceRange);
        priceMax.addEventListener('input', updatePriceRange);
    }

    // Tag Filters
    document.querySelectorAll('.tag-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
        });
    });

    // Apply Filters Button
    const btnApply = document.getElementById('btnApplyFilters');
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            const filters = {
                platforms: getSelectedPlatforms(),
                statuses: getSelectedStatuses(),
                tags: getSelectedTags(),
                priceRange: [
                    parseInt(priceMin?.value || 0),
                    parseInt(priceMax?.value || 5000)
                ],
                metacriticRange: [
                    parseInt(mcMin?.value || 0),
                    parseInt(mcMax?.value || 100)
                ],
                sortBy: document.getElementById('filterSortBy')?.value || 'title'
            };

            appStore.setState({ advancedFilters: filters, paginationLimit: 16 });
            updateFilterBadge(filters);
            showToast("Filtros aplicados!", "success");
        });
    }

    // Clear Filters Button
    const btnClear = document.getElementById('btnClearFilters');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            // Reset all filters
            document.querySelectorAll('.tag-filter-btn.active').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.platform-filter-btn.active').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.status-filter-btn.active').forEach(btn => btn.classList.remove('active'));

            if (mcMin) mcMin.value = 0;
            if (mcMax) mcMax.value = 100;
            if (priceMin) priceMin.value = 0;
            if (priceMax) priceMax.value = 5000;

            const sortBy = document.getElementById('filterSortBy');
            if (sortBy) sortBy.value = 'title';

            // Update displays
            const mcDisplay = document.getElementById('mcRangeDisplay');
            if (mcDisplay) mcDisplay.textContent = '0 - 100';
            const priceDisplay = document.getElementById('priceRangeDisplay');
            if (priceDisplay) priceDisplay.textContent = 'R$ 0 - R$ 5000';

            appStore.setState({
                advancedFilters: {
                    platforms: [],
                    statuses: [],
                    tags: [],
                    priceRange: [0, 5000],
                    metacriticRange: [0, 100],
                    sortBy: 'title'
                },
                paginationLimit: 16
            });

            updateFilterBadge(null);
            showToast("Filtros limpos", "info");
        });
    }

    // Sort dropdown - real-time
    const sortSelect = document.getElementById('filterSortBy');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const { advancedFilters } = appStore.get();
            appStore.setState({
                advancedFilters: { ...advancedFilters, sortBy: e.target.value }
            });
        });
    }
};

const initializePlatformFilters = (games) => {
    const container = document.getElementById('platformFilters');
    if (!container || container.children.length > 0) return; // Already initialized

    const platforms = [...new Set(games.map(g => g.platform))].sort();
    platforms.forEach(platform => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-filter-btn platform-filter-btn';
        btn.dataset.platform = platform;
        btn.textContent = platform;
        btn.addEventListener('click', () => btn.classList.toggle('active'));
        container.appendChild(btn);
    });
};

const initializeStatusFilters = (games) => {
    const container = document.getElementById('statusFilters');
    if (!container || container.children.length > 0) return; // Already initialized

    const statuses = [...new Set(games.map(g => g.status))].filter(Boolean).sort();
    statuses.forEach(status => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-filter-btn status-filter-btn';
        btn.dataset.status = status;
        btn.textContent = status;
        btn.addEventListener('click', () => btn.classList.toggle('active'));
        container.appendChild(btn);
    });
};

const getSelectedPlatforms = () => {
    return Array.from(document.querySelectorAll('.platform-filter-btn.active'))
        .map(btn => btn.dataset.platform);
};

const getSelectedStatuses = () => {
    return Array.from(document.querySelectorAll('.status-filter-btn.active'))
        .map(btn => btn.dataset.status);
};

const getSelectedTags = () => {
    return Array.from(document.querySelectorAll('.tag-filter-btn.active'))
        .map(btn => btn.dataset.tag);
};

const updateFilterBadge = (filters) => {
    const badge = document.getElementById('filterCountBadge');
    if (!badge) return;

    if (!filters) {
        badge.style.display = 'none';
        return;
    }

    const count = (filters.platforms?.length || 0) +
        (filters.statuses?.length || 0) +
        (filters.tags?.length || 0);

    if (count > 0) {
        badge.textContent = `${count}`;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
};

const setupAuthEvents = () => {
    document.getElementById('btnOpenAddModal').onclick = () => openGameModal();
    document.getElementById('gameForm').onsubmit = handleFormSubmit;
    document.getElementById('btnDeleteGame').onclick = handleDelete;

    const profileForm = document.getElementById('profileEditForm');
    if (profileForm) {
        profileForm.onsubmit = async (e) => {
            e.preventDefault();
            const { user } = appStore.get();
            const avatarUrl = document.getElementById('editAvatar').value;
            const btn = profileForm.querySelector('button');
            btn.innerText = "SALVANDO..."; btn.disabled = true;
            try {
                await GameService.updateProfile(user.id, { avatar_url: avatarUrl });
                showToast("Perfil atualizado!");
                document.getElementById('profileEditModal').classList.add('hidden');
                loadData(user.id);
            } catch (err) { showToast("Erro ao salvar.", "error"); }
            finally { btn.innerText = "SALVAR ALTERAÇÕES"; btn.disabled = false; }
        };
    }

    setupRawgSearch();
    const inputStatus = document.getElementById('inputStatus');
    if (inputStatus) {
        inputStatus.onchange = (e) => {
            const soldGroup = document.getElementById('soldGroup');
            if (['Vendido', 'À venda'].includes(e.target.value)) soldGroup.classList.remove('hidden');
            else soldGroup.classList.add('hidden');
        };
    }
};

const setupNicknameForm = (user) => {
    document.getElementById('nicknameForm').onsubmit = async (e) => {
        e.preventDefault();
        const nick = document.getElementById('inputNickname').value;
        try {
            await GameService.createProfile(nick);
            document.getElementById('nicknameModal').classList.add('hidden');
            appStore.setState({ sharedProfileName: nick });
        } catch (err) { alert("Erro: " + err.message); }
    };
};

window.editGame = (id) => openGameModal(id);

const openGameModal = (gameId = null) => {
    const form = document.getElementById('gameForm');
    form.reset();
    document.getElementById('apiResults').classList.add('hidden');
    document.getElementById('soldGroup').classList.add('hidden');
    document.querySelectorAll('.tag-toggle').forEach(b => b.classList.remove('active'));
    document.getElementById('inputTags').value = '[]';
    editingId = gameId;

    if (gameId) {
        document.getElementById('modalTitle').innerText = "EDITAR JOGO";
        document.getElementById('modalTitle').innerText = "EDITAR JOGO";
        document.getElementById('btnDeleteGame').classList.remove('hidden');

        // Fix: Look up in allGamesStats since 'games' might be partial or empty
        const { allGamesStats } = appStore.get();
        const game = allGamesStats ? allGamesStats.find(g => g.id === gameId) : null;

        if (game) {
            document.getElementById('inputGameName').value = game.title;
            const select = document.getElementById('inputPlatform');
            if (![...select.options].some(o => o.value === game.platform)) {
                const opt = document.createElement('option');
                opt.value = game.platform; opt.innerText = game.platform;
                select.appendChild(opt);
            }
            select.value = game.platform;
            document.getElementById('inputStatus').value = game.status;
            document.getElementById('inputPrice').value = game.price_paid;
            document.getElementById('inputSoldPrice').value = game.price_sold;
            document.getElementById('inputImage').value = game.image_url;
            if (game.tags) {
                game.tags.forEach(tag => {
                    const btn = document.querySelector(`.tag-toggle[data-val="${tag}"]`);
                    if (btn) btn.classList.add('active');
                });
                document.getElementById('inputTags').value = JSON.stringify(game.tags);
            }
            if (['Vendido', 'À venda'].includes(game.status)) document.getElementById('soldGroup').classList.remove('hidden');
        }
    } else {
        document.getElementById('modalTitle').innerText = "NOVO JOGO";
        document.getElementById('btnDeleteGame').classList.add('hidden');
        const select = document.getElementById('inputPlatform');
        select.innerHTML = '<option value="" disabled selected>Busque um jogo...</option>';
        DEFAULT_PLATFORMS.forEach(p => {
            const opt = document.createElement('option'); opt.value = p; opt.innerText = p; select.appendChild(opt);
        });
    }
    toggleModal(true);
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const oldText = btn.innerText;

    // VALIDATION: Negative Prices
    const pPaid = Number(document.getElementById('inputPrice').value) || 0;
    const pSold = Number(document.getElementById('inputSoldPrice').value) || 0;

    if (pPaid < 0 || pSold < 0) {
        showToast("Os preços não podem ser negativos.", "error");
        return;
    }

    const title = document.getElementById('inputGameName').value.trim();
    if (!title) {
        showToast("O jogo precisa de um nome.", "error");
        return;
    }

    const platform = document.getElementById('inputPlatform').value || 'Outros';

    btn.innerText = "VERIFICANDO..."; btn.disabled = true;

    try {
        const { user } = appStore.get();
        if (!user) throw new Error("Usuário não autenticado.");

        // VALIDATION: Duplicates (Only for new games)
        // Optimization: Use Client-Side check instead of Server call
        if (!editingId) {
            const { allGamesStats } = appStore.get();
            const normalize = s => s.toLowerCase().trim();
            const isDup = allGamesStats && allGamesStats.some(g => normalize(g.title) === normalize(title) && g.platform === platform);

            if (isDup) {
                showToast(`Você já tem "${title}" para ${platform}.`, "warning");
                return; // Stop execution
            }
        }

        btn.innerText = "SALVANDO...";

        const data = {
            title: title,
            platform: platform,
            status: document.getElementById('inputStatus').value,
            price_paid: pPaid,
            price_sold: pSold,
            image_url: document.getElementById('inputImage').value,
            tags: JSON.parse(document.getElementById('inputTags').value || '[]'),
            metacritic: parseInt(document.getElementById('inputMetacritic')?.value) || null
        };
        if (editingId) await GameService.updateGame(editingId, data);
        else await GameService.addGame(data);
        showToast("Salvo!"); toggleModal(false);
        if (user) loadData(user.id);
    } catch (error) { console.error(error); showToast("Erro: " + error.message, "error"); }
    finally { btn.innerText = oldText; btn.disabled = false; }
};

const handleDelete = async () => {
    if (confirm("Excluir jogo?")) {
        await GameService.deleteGame(editingId);
        toggleModal(false);
        const { user } = appStore.get(); if (user) loadData(user.id);
        showToast("Excluído.");
    }
};

// ===== COMPARE COLLECTIONS HANDLERS =====

let compareData = { myGames: [], friendGames: [], friendProfile: null };

const handleCompareClick = async () => {
    const { user } = appStore.get();
    if (!user) {
        showToast("Faça login para comparar coleções!", "error");
        return;
    }

    // Reset modal state
    document.getElementById('compareFriendSelector').classList.remove('hidden');
    document.getElementById('compareResults').classList.add('hidden');
    document.getElementById('compareBackBtn').classList.add('hidden');

    // Show modal
    document.getElementById('compareModal').classList.remove('hidden');

    // Load friends
    await loadCompareFriends(user.id);
};

const loadCompareFriends = async (userId) => {
    const container = document.getElementById('compareFriendsList');
    container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px; grid-column: 1/-1;"><i class="fa-solid fa-spinner fa-spin"></i> Carregando amigos...</div>';

    try {
        const friends = await SocialService.getNetwork(userId, 'following');

        if (!friends || friends.length === 0) {
            container.innerHTML = `
                <div style="color: #888; text-align: center; padding: 30px; grid-column: 1/-1;">
                    <i class="fa-solid fa-user-plus" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
                    Você ainda não segue ninguém.<br>
                    <span style="font-size: 0.8rem;">Siga outros usuários para comparar coleções!</span>
                </div>`;
            return;
        }

        container.innerHTML = friends.map(friend => `
            <div onclick="startComparison('${friend.id}', '${friend.nickname}')" 
                 style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 15px; text-align: center; cursor: pointer; transition: all 0.2s;"
                 onmouseover="this.style.background='rgba(139,92,246,0.2)'; this.style.borderColor='rgba(139,92,246,0.5)'"
                 onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(255,255,255,0.1)'">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #3b82f6); margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; color: white;">
                    ${friend.nickname ? friend.nickname[0].toUpperCase() : '?'}
                </div>
                <div style="color: white; font-size: 0.85rem; font-weight: 500;">@${friend.nickname || 'usuario'}</div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading friends:', error);
        container.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px; grid-column: 1/-1;"><i class="fa-solid fa-exclamation-triangle"></i> Erro ao carregar amigos</div>';
    }
};

window.startComparison = async (friendId, friendNickname) => {
    const { user, profile, allGamesStats } = appStore.get();
    if (!user) return;

    // Use allGamesStats instead of games to get the FULL collection
    const myGames = allGamesStats || [];

    // Show loading in results area
    document.getElementById('compareFriendSelector').classList.add('hidden');
    document.getElementById('compareResults').classList.remove('hidden');
    document.getElementById('compareBackBtn').classList.remove('hidden');
    document.getElementById('compareGamesList').innerHTML = '<div style="color: #888; text-align: center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin"></i> Comparando coleções...</div>';

    try {
        // Fetch friend's games
        const friendGames = await GameService.fetchStatsOnly(friendId);

        // Store for tab switching
        compareData = {
            myGames: myGames,
            friendGames: friendGames || [],
            friendProfile: { id: friendId, nickname: friendNickname }
        };

        // Calculate comparison
        const myTitles = new Set(compareData.myGames.map(g => g.title.toLowerCase()));
        const friendTitles = new Set(compareData.friendGames.map(g => g.title.toLowerCase()));

        const commonGames = compareData.myGames.filter(g => friendTitles.has(g.title.toLowerCase()));
        const myExclusive = compareData.myGames.filter(g => !friendTitles.has(g.title.toLowerCase()));
        const friendExclusive = compareData.friendGames.filter(g => !myTitles.has(g.title.toLowerCase()));

        // Store for tab switching
        compareData.common = commonGames;
        compareData.myExclusive = myExclusive;
        compareData.friendExclusive = friendExclusive;

        // Update UI
        document.getElementById('compareMyName').textContent = '@' + (profile?.nickname || 'você');
        document.getElementById('compareMyCount').textContent = compareData.myGames.length;
        document.getElementById('compareFriendName').textContent = '@' + friendNickname;
        document.getElementById('compareFriendCount').textContent = compareData.friendGames.length;

        document.getElementById('compareCommonCount').textContent = commonGames.length;
        document.getElementById('compareMyExclusiveCount').textContent = myExclusive.length;
        document.getElementById('compareFriendExclusiveCount').textContent = friendExclusive.length;

        // Show common games by default
        switchCompareTab('common');

    } catch (error) {
        console.error('Comparison error:', error);
        document.getElementById('compareGamesList').innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px;"><i class="fa-solid fa-exclamation-triangle"></i> Erro ao comparar coleções</div>';
    }
};

window.switchCompareTab = (tab) => {
    // Update card highlights
    ['compareCommonCard', 'compareMyExclusiveCard', 'compareFriendExclusiveCard'].forEach(id => {
        document.getElementById(id).style.transform = 'scale(1)';
        document.getElementById(id).style.boxShadow = 'none';
    });

    const activeCard = tab === 'common' ? 'compareCommonCard' : tab === 'mine' ? 'compareMyExclusiveCard' : 'compareFriendExclusiveCard';
    document.getElementById(activeCard).style.transform = 'scale(1.05)';
    document.getElementById(activeCard).style.boxShadow = '0 0 20px rgba(139,92,246,0.3)';

    // Get games for this tab
    let games, title, emptyMsg;
    if (tab === 'common') {
        games = compareData.common;
        title = 'Jogos em Comum';
        emptyMsg = 'Vocês não têm jogos em comum';
    } else if (tab === 'mine') {
        games = compareData.myExclusive;
        title = 'Jogos que só você tem';
        emptyMsg = 'Todos os seus jogos estão na coleção do amigo';
    } else {
        games = compareData.friendExclusive;
        title = 'Jogos que só o amigo tem';
        emptyMsg = 'O amigo não tem jogos exclusivos';
    }

    // Render games
    const container = document.getElementById('compareGamesList');

    if (!games || games.length === 0) {
        container.innerHTML = `<div style="color: #888; text-align: center; padding: 30px;">${emptyMsg}</div>`;
        return;
    }

    container.innerHTML = `
        <div style="color: #888; font-size: 0.8rem; margin-bottom: 10px;">${title} (${games.length})</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 8px;">
            ${games.slice(0, 50).map(g => `
                <div style="text-align: center;" title="${g.title}">
                    <img src="${g.image_url || 'https://via.placeholder.com/60x90?text=?'}" 
                         style="width: 60px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);"
                         onerror="this.src='https://via.placeholder.com/60x90?text=?'">
                    <div style="font-size: 0.65rem; color: #ccc; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60px;">
                        ${g.title.length > 10 ? g.title.substring(0, 10) + '...' : g.title}
                    </div>
                </div>
            `).join('')}
            ${games.length > 50 ? `<div style="display: flex; align-items: center; justify-content: center; color: #888; font-size: 0.75rem;">+${games.length - 50} mais</div>` : ''}
        </div>
    `;
};

window.resetCompareModal = () => {
    document.getElementById('compareFriendSelector').classList.remove('hidden');
    document.getElementById('compareResults').classList.add('hidden');
    document.getElementById('compareBackBtn').classList.add('hidden');
    compareData = { myGames: [], friendGames: [], friendProfile: null };
};

// ===== IMPORT HANDLERS =====

const handleImportClick = () => {
    const { user } = appStore.get();
    if (!user) {
        showToast("Faça login para importar jogos!", "error");
        return;
    }

    // Reset modal state
    document.getElementById('importProgress').classList.add('hidden');
    document.getElementById('importResults').classList.add('hidden');
    document.getElementById('btnStartImport').disabled = false;

    // Load saved credentials from localStorage
    const savedApiKey = localStorage.getItem('steam_api_key');
    const savedSteamId = localStorage.getItem('steam_id');
    const lastImport = localStorage.getItem('last_steam_import');

    if (savedApiKey) {
        document.getElementById('steamApiKey').value = savedApiKey;
        document.getElementById('rememberApiKey').checked = true;
        // Trigger validation
        validateApiKey(savedApiKey);
    }

    if (savedSteamId) {
        document.getElementById('steamId').value = savedSteamId;
        document.getElementById('steamIdHint').innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Último Steam ID usado`;
        // Trigger validation
        validateSteamId(savedSteamId);
    }

    // Show last import info
    if (lastImport) {
        try {
            const importData = JSON.parse(lastImport);
            const importDate = new Date(importData.date);
            const now = new Date();
            const daysDiff = Math.floor((now - importDate) / (1000 * 60 * 60 * 24));

            let timeText;
            if (daysDiff === 0) {
                timeText = 'Hoje';
            } else if (daysDiff === 1) {
                timeText = 'Ontem';
            } else if (daysDiff < 7) {
                timeText = `há ${daysDiff} dias`;
            } else if (daysDiff < 30) {
                const weeks = Math.floor(daysDiff / 7);
                timeText = `há ${weeks} semana${weeks > 1 ? 's' : ''}`;
            } else {
                const months = Math.floor(daysDiff / 30);
                timeText = `há ${months} mês${months > 1 ? 'es' : ''}`;
            }

            document.getElementById('lastImportText').textContent = `${timeText} (${importData.count} jogos)`;
            document.getElementById('lastImportInfo').classList.remove('hidden');
        } catch (e) {
            console.error('Failed to parse last import data:', e);
        }
    }

    // Setup validation listeners
    setupValidationListeners();

    // Setup Steam ID detector
    setupSteamIdDetector();

    // Show modal
    document.getElementById('importModal').classList.remove('hidden');
};

const handleImportSubmit = async () => {
    await handleSteamImport();
};

const handleSteamImport = async () => {
    const apiKey = document.getElementById('steamApiKey').value.trim();
    const steamId = document.getElementById('steamId').value.trim();
    const rememberKey = document.getElementById('rememberApiKey')?.checked;

    // Validation
    if (!apiKey) {
        showToast("Insira sua Steam API Key", "error");
        return;
    }

    if (!steamId || !/^[0-9]{17}$/.test(steamId)) {
        showToast("Steam ID inválido (deve ter 17 dígitos)", "error");
        return;
    }

    const btn = document.getElementById('btnStartImport');
    const progressDiv = document.getElementById('importProgress');
    const resultsDiv = document.getElementById('importResults');
    const progressText = document.getElementById('importProgressText');

    // Show progress
    btn.disabled = true;
    progressDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');

    try {
        progressText.textContent = 'Conectando à Steam API...';

        const result = await ImportService.importFromSteam(steamId, apiKey, (progress) => {
            if (progress.stage === 'fetched') {
                progressText.textContent = `${progress.total} jogos encontrados na biblioteca...`;
            } else if (progress.stage === 'enriching') {
                progressText.textContent = `Buscando avaliações Metacritic (${progress.current}/${progress.total})...`;
            } else if (progress.stage === 'filtered') {
                progressText.textContent = `Verificando duplicatas (${progress.newGames} novos)...`;
            }
        });

        // Save to localStorage on success
        if (rememberKey) {
            localStorage.setItem('steam_api_key', apiKey);
        } else {
            localStorage.removeItem('steam_api_key');
        }
        localStorage.setItem('steam_id', steamId);
        localStorage.setItem('last_steam_import', JSON.stringify({
            date: new Date().toISOString(),
            count: result.imported
        }));

        showImportResults(result, 'Steam');

    } catch (error) {
        handleImportError(error, 'Steam');
    } finally {
        btn.disabled = false;
    }
};


const showImportResults = (result, source) => {
    const progressDiv = document.getElementById('importProgress');
    const resultsDiv = document.getElementById('importResults');
    const resultsText = document.querySelector('#importResultsText');

    progressDiv.classList.add('hidden');
    resultsDiv.classList.remove('hidden');

    resultsText.innerHTML = `
        <p style="margin: 5px 0; color: #ddd;">
            <strong style="color: var(--success);">${result.imported}</strong> jogos importados
        </p>
        <p style="margin: 5px 0; color: #999; font-size: 0.85rem;">
            ${result.totalFound} jogos no ${source}<br>
            ${result.duplicates} já estavam na sua coleção
            ${result.invalid ? `<br>${result.invalid} inválidos (pulados)` : ''}
        </p>
    `;

    showToast(`${result.imported} jogos importados com sucesso!`, "success");

    // Reload data
    const { user } = appStore.get();
    if (user) {
        setTimeout(() => {
            loadData(user.id);
            setTimeout(() => {
                document.getElementById('importModal').classList.add('hidden');
            }, 3000);
        }, 1000);
    }
};

const handleImportError = (error, source) => {
    const progressDiv = document.getElementById('importProgress');
    const btn = document.getElementById('btnStartImport');

    progressDiv.classList.add('hidden');

    let errorMsg = `Erro ao importar de ${source}.`;
    if (error.message.includes('perfil privado') || error.message.includes('Nenhum jogo')) {
        errorMsg = 'Perfil privado ou sem jogos.';
    } else if (error.message.includes('Steam API')) {
        errorMsg = 'Erro ao conectar com Steam API.';
    } else if (error.message.includes('JSON')) {
        errorMsg = 'Formato JSON inválido.';
        errorMsg = 'Formato CSV inválido.';
    }

    showToast(errorMsg, "error");
    btn.disabled = false;
};

// ===================================================================================================
// CLEANUP FEED
// ===================================================================================================

window.cleanupFeed = async function () {
    const { user } = appStore.get();
    if (!user) {
        showToast('Você precisa estar logado', 'error');
        return;
    }

    if (!confirm('Corrigir ou deletar posts órfãos do feed?\n\n• Corrige posts com títulos malformados\n• Deleta posts de jogos que não existem mais')) {
        return;
    }

    try {
        showToast('Analisando feed...', 'info');

        // Fetch user's feed posts
        const { data: posts, error: postsError } = await supabase
            .from('social_feed')
            .select('id, game_title, platform, user_id')
            .eq('user_id', user.id);

        if (postsError) throw postsError;

        // Find posts with JSON-formatted or null titles
        const brokenPosts = posts.filter(post => {
            const title = post.game_title || '';
            return !title ||
                typeof title === 'string' && (title.trim().startsWith('{') || title === 'Jogo sem título');
        });

        if (brokenPosts.length === 0) {
            showToast('✅ Todos os posts estão OK!', 'success');
            return;
        }

        console.log(`🔧 Processando ${brokenPosts.length} posts...`);
        showToast(`Processando ${brokenPosts.length} posts...`, 'info');

        let fixed = 0;
        let deleted = 0;

        for (const post of brokenPosts) {
            // Try to find game by platform first
            let { data: games, error: gamesError } = await supabase
                .from('games')
                .select('title, image_url')
                .eq('user_id', post.user_id)
                .eq('platform', post.platform)
                .order('created_at', { ascending: false })
                .limit(1);

            // If no match, try without platform filter (fallback)
            if ((!games || games.length === 0) && post.platform) {
                const { data: fallbackGames } = await supabase
                    .from('games')
                    .select('title, image_url')
                    .eq('user_id', user.id) // Use user.id here, not post.user_id
                    .order('created_at', { ascending: false })
                    .limit(1);
                games = fallbackGames;
            }

            if (games && games.length > 0) {
                const game = games[0];

                // Update the post
                const { error: updateError } = await supabase
                    .from('social_feed')
                    .update({
                        game_title: game.title,
                        game_image: game.image_url || post.game_image
                    })
                    .eq('id', post.id);

                if (!updateError) {
                    fixed++;
                    console.log(`✅ Fixed: ${game.title}`);
                } else {
                    console.error(`Error updating post ${post.id}:`, updateError);
                }
            } else {
                // No game found - delete orphaned post
                const { error: deleteError } = await supabase
                    .from('social_feed')
                    .delete()
                    .eq('id', post.id);

                if (!deleteError) {
                    deleted++;
                    console.log(`🗑️ Deleted orphan post ${post.id}`);
                } else {
                    console.error(`Error deleting post ${post.id}:`, deleteError);
                }
            }
        }

        console.log(`✅ Corrigidos: ${fixed} | 🗑️ Deletados: ${deleted}`);
        showToast(`✅ ${fixed} corrigidos, 🗑️ ${deleted} deletados`, 'success');

        // Reload feed if on feed view
        const { currentView } = appStore.get();
        if (currentView === 'feed') {
            const feedData = await SocialService.getGlobalFeed();
            const userLikes = await SocialService.getUserLikes(user.id);
            appStore.setState({ feedData, userLikes });
            renderApp();
        }
    } catch (error) {
        console.error('Cleanup feed error:', error);
        showToast(`Erro: ${error.message}`, 'error');
    }
};

// ===================================================================================================
// RAWG SEARCH
// ===================================================================================================
const setupRawgSearch = () => {
    const input = document.getElementById('inputGameName');
    const apiDiv = document.getElementById('apiResults'); // Changed from resultsDiv
    let debounceTimer;

    input.addEventListener('input', async (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        apiDiv.innerHTML = '';
        if (query.length < 3) {
            apiDiv.classList.add('hidden');
            return;
        }

        apiDiv.classList.remove('hidden');
        apiDiv.innerHTML = '<div style="padding:10px; color:#666">...</div>';

        debounceTimer = setTimeout(async () => {
            try {
                const results = await GameService.searchRawg(query);
                if (results.length === 0) {
                    apiDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #888;">Nenhum resultado encontrado</div>';
                    return;
                }

                apiDiv.innerHTML = ''; // Clear loading message
                results.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'api-item';

                    const img = document.createElement('img');
                    img.src = item.background_image || 'https://via.placeholder.com/40';
                    img.onerror = () => { img.src = 'https://via.placeholder.com/40'; };

                    const info = document.createElement('div');
                    info.className = 'api-info';
                    info.innerHTML = `<strong>${item.name}</strong><br><small>${item.platforms?.map(p => p.platform.name).join(', ') || 'PC'}</small>`;

                    div.appendChild(img);
                    div.appendChild(info);

                    div.onclick = () => {
                        input.value = item.name;
                        document.getElementById('inputImage').value = item.background_image || '';

                        // Store Metacritic score in hidden field
                        let metacriticInput = document.getElementById('inputMetacritic');
                        if (!metacriticInput) {
                            metacriticInput = document.createElement('input');
                            metacriticInput.type = 'hidden';
                            metacriticInput.id = 'inputMetacritic';
                            // Assuming 'gameForm' is the parent element for the input fields
                            // If not, adjust this to the correct parent element where the hidden input should be appended.
                            const form = document.getElementById('gameForm') || document.querySelector('.modal-content'); // Fallback to modal-content
                            if (form) {
                                form.appendChild(metacriticInput);
                            } else {
                                console.warn("Could not find 'gameForm' or '.modal-content' to append inputMetacritic.");
                            }
                        }
                        metacriticInput.value = item.metacritic || '';

                        const platforms = item.platforms?.map(p => p.platform.name) || [];
                        const select = document.getElementById('inputPlatform');
                        select.innerHTML = '<option value="" disabled selected>Selecione a plataforma</option>';

                        // Improved platform mapping to match game's actual platforms
                        const mapRawgToPlatform = (rawgPlatformName) => {
                            const name = rawgPlatformName.toLowerCase();

                            // PlayStation platforms
                            if (name.includes('playstation 5')) return 'PlayStation 5';
                            if (name.includes('playstation 4')) return 'PlayStation 4';
                            if (name.includes('playstation 3')) return 'PlayStation 3';
                            if (name.includes('playstation 2')) return 'PlayStation 2';
                            if (name.includes('playstation vita') || name.includes('ps vita')) return 'PS Vita';
                            if (name.includes('playstation') || name.includes('psx')) return 'PlayStation';

                            // Xbox platforms
                            if (name.includes('xbox series')) return 'Xbox Series X/S';
                            if (name.includes('xbox one')) return 'Xbox One';
                            if (name.includes('xbox 360')) return 'Xbox 360';
                            if (name.includes('xbox')) return 'Xbox';

                            // Nintendo platforms
                            if (name.includes('nintendo switch')) return 'Nintendo Switch';
                            if (name.includes('wii u')) return 'Wii U';
                            if (name.includes('wii')) return 'Wii';
                            if (name.includes('nintendo 3ds') || name.includes('3ds')) return 'Nintendo 3DS';
                            if (name.includes('nintendo ds') || name.includes('nds')) return 'Nintendo DS';
                            if (name.includes('gamecube')) return 'GameCube';
                            if (name.includes('nintendo 64') || name.includes('n64')) return 'Nintendo 64';
                            if (name.includes('snes') || name.includes('super nintendo')) return 'Super Nintendo';
                            if (name.includes('nes')) return 'NES';
                            if (name.includes('game boy')) return 'Game Boy';

                            // PC and others
                            if (name.includes('pc')) return 'PC';
                            if (name.includes('steam')) return 'Steam Deck';
                            if (name.includes('linux')) return 'Linux';
                            if (name.includes('macos') || name.includes('mac')) return 'macOS';
                            if (name.includes('ios')) return 'iOS';
                            if (name.includes('android')) return 'Android';
                            if (name.includes('web')) return 'Web';

                            // Return original if no match
                            return rawgPlatformName;
                        };

                        const uniquePlatforms = [...new Set(platforms.map(mapRawgToPlatform))];

                        // Only add platforms that exist for this game from RAWG
                        uniquePlatforms.forEach(platform => {
                            const opt = document.createElement('option');
                            opt.value = platform;
                            opt.innerText = platform;
                            select.appendChild(opt);
                        });

                        apiDiv.classList.add('hidden'); // Hide results after selection
                    };

                    apiDiv.appendChild(div);
                });
            } catch (error) {
                console.error('Search error:', error);
                apiDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #f00;">Erro ao buscar jogos.</div>';
            }
        }, 300);
    });

    // Event listener to hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !apiDiv.contains(e.target)) {
            apiDiv.classList.add('hidden');
        }
    });
};


// ===== STEAM IMPORT HELPER FUNCTIONS =====

const setupValidationListeners = () => {
    const apiKeyInput = document.getElementById('steamApiKey');
    const steamIdInput = document.getElementById('steamId');

    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', (e) => validateApiKey(e.target.value));
    }

    if (steamIdInput) {
        steamIdInput.addEventListener('input', (e) => validateSteamId(e.target.value));
    }
};

const validateApiKey = (value) => {
    const icon = document.getElementById('apiKeyValidation');
    if (!icon) return;

    if (!value) {
        icon.style.display = 'none';
        return;
    }

    const isValid = /^[A-Fa-f0-9]{32}$/.test(value);
    icon.style.display = 'block';
    icon.className = isValid ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';
    icon.style.color = isValid ? '#22c55e' : '#ef4444';
    icon.title = isValid ? 'Formato válido' : 'Formato inválido (deve ter 32 caracteres hexadecimais)';
};

const validateSteamId = (value) => {
    const icon = document.getElementById('steamIdValidation');
    if (!icon) return;

    if (!value) {
        icon.style.display = 'none';
        return;
    }

    const isValid = /^7656119[0-9]{10}$/.test(value);
    icon.style.display = 'block';
    icon.className = isValid ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';
    icon.style.color = isValid ? '#22c55e' : '#ef4444';
    icon.title = isValid ? 'Steam ID válido' : 'Steam ID inválido (deve ter 17 dígitos)';
};

const setupSteamIdDetector = () => {
    const btn = document.getElementById('btnDetectSteamId');
    if (!btn) return;

    btn.onclick = async () => {
        const input = document.getElementById('steamId');
        const value = input.value.trim();

        if (!value) {
            showToast('Cole a URL do seu perfil Steam no campo acima', 'error');
            return;
        }

        if (/^7656119[0-9]{10}$/.test(value)) {
            showToast('Já é um Steam ID válido!', 'info');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class=\"fa-solid fa-spinner fa-spin\"></i> Detectando...';

        try {
            const steamId = await detectSteamIdFromUrl(value);
            if (steamId) {
                input.value = steamId;
                validateSteamId(steamId);
                showToast('Steam ID detectado com sucesso!', 'success');
            } else {
                showToast('Não foi possível detectar o Steam ID. Verifique a URL.', 'error');
            }
        } catch (error) {
            console.error('Steam ID detection error:', error);
            showToast('Erro: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class=\"fa-solid fa-magnifying-glass\"></i> Detectar';
        }
    };
};

const detectSteamIdFromUrl = async (url) => {
    // Direct Steam ID64
    const directIdMatch = url.match(/\b(7656119[0-9]{10})\b/);
    if (directIdMatch) return directIdMatch[1];

    // Profile URL with ID
    const profileIdMatch = url.match(/steamcommunity\.com\/profiles\/(\d+)/);
    if (profileIdMatch) return profileIdMatch[1];

    // Custom URL (vanity name)
    const vanityMatch = url.match(/steamcommunity\.com\/id\/([^\/\?]+)/);
    if (vanityMatch) {
        const apiKey = document.getElementById('steamApiKey').value.trim();
        if (!apiKey) {
            throw new Error('Insira sua Steam API Key primeiro para detectar URLs customizadas');
        }

        // Use CORS proxy to avoid CORS issues
        const steamApiUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityMatch[1])}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(steamApiUrl)}`;

        console.log('[Steam ID Detector] Resolving vanity URL via proxy:', vanityMatch[1]);
        const response = await fetch(proxyUrl);
        const data = await response.json();

        if (data.response?.success === 1) {
            return data.response.steamid;
        }
        throw new Error('URL customizada não encontrada');
    }

    // Try as raw vanity name
    if (url.length > 0 && !/\s/.test(url) && !/^\d+$/.test(url)) {
        const apiKey = document.getElementById('steamApiKey').value.trim();
        if (apiKey) {
            try {
                // Use CORS proxy to avoid CORS issues
                const steamApiUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${encodeURIComponent(url)}`;
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(steamApiUrl)}`;

                console.log('[Steam ID Detector] Calling Steam API via proxy for:', url);
                const response = await fetch(proxyUrl);

                if (!response.ok) {
                    console.error('[Steam ID Detector] HTTP error:', response.status);
                    throw new Error(`Erro ao conectar com Steam API: ${response.status}`);
                }

                const data = await response.json();
                console.log('[Steam ID Detector] Steam API response:', data);

                if (data.response?.success === 1) {
                    console.log('[Steam ID Detector] ✓ Steam ID encontrado:', data.response.steamid);
                    return data.response.steamid;
                } else if (data.response?.success === 42) {
                    // Vanity name not found
                    console.log('[Steam ID Detector] Vanity name não encontrado');
                    throw new Error(`Nome de usuário "${url}" não encontrado no Steam`);
                }
            } catch (error) {
                console.error('[Steam ID Detector] Error:', error);
                throw error;
            }
        }
    }

    return null;
};

document.addEventListener('DOMContentLoaded', init);