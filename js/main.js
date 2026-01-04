import { supabase, AuthService } from './services/supabase.js';
import { GameService, SocialService, PriceService } from './services/api.js';
import { ImportService } from './services/importer.js';
import { GogImportService } from './services/gogImporter.js';
import { SubscriptionService } from './services/subscriptionService.js';
import { HLTBService } from './services/hltbService.js';
import { appStore } from './modules/store.js';

import { Diagnostics } from './modules/diagnostics.js';

// Force global exposure
window.GameVaultDebug = Diagnostics;
import { renderApp, showToast, toggleModal, exportData, renderUserList, applyAdvancedFilters } from './modules/ui.js';
import { initMobileTouchHandlers, handleOrientationChange, initNetworkDetection } from './modules/mobile.js';

let editingId = null;
let isInitializing = false;
let userSubscription = null; // Cache da subscription do usuário

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
    try {
        console.log("🚀 [System] GameVault Init Started");
        appStore.subscribe(state => renderApp(state));
        appStore.subscribe(state => renderApp(state));

        // Init Diagnostics
        Diagnostics.audit();

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
    } catch (e) {
        console.error("🔥 CRITICAL INIT ERROR:", e);
        if (window.Diagnostics) window.Diagnostics.logError("INIT", e);
        alert("Erro na inicialização: " + e.message);
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
        await loadUserSubscription(user.id); // Carrega status da assinatura
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
                'gameModal', 'rouletteModal', 'nicknameModal',
                'networkModal', 'profileEditModal', 'importModal', 'compareModal'
            ];
            let closedAny = false;

            // Special handling for GameDetail to stop video
            const detailModal = document.getElementById('gameDetailModal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                if (window.closeGameDetailModal) window.closeGameDetailModal();
                else detailModal.classList.add('hidden');
                closedAny = true;
            }

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

    setupAdvancedFilters();
};

// --- ADVANCED FILTERS SETUP ---
const setupAdvancedFilters = () => {
    // 1. Initial Render & Listener for Data Changes
    appStore.subscribe((state) => {
        if (state.allGamesStats && state.allGamesStats.length > 0) {
            // First, ensure all buttons exist based on FULL dataset
            renderFacetButtons(state.allGamesStats, 'platformFilters', 'platform');
            renderFacetButtons(state.allGamesStats, 'statusFilters', 'status');
            renderFacetButtons(state.allGamesStats, 'genreFilters', 'genre');
            renderFacetButtons(state.allGamesStats, 'subgenreFilters', 'subgenre');

            // Then, trigger an initial update to set correct visibility based on current filters
            updateFacets();
        }
    });

    // 1b. Setup Tag Buttons (Static)
    document.querySelectorAll('#tagFilters .tag-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            updateFacets();
        });
    });

    // 3. Render Active Filter Chips (New Feature)
    appStore.subscribe((state) => {
        const container = document.getElementById('activeFiltersContainer');
        if (!container) return;

        const filters = state.advancedFilters;
        if (!filters) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }

        container.innerHTML = '';
        let hasChips = false;

        const createChip = (text, removeCallback) => {
            hasChips = true;
            const chip = document.createElement('div');
            chip.className = 'filter-chip badge';
            chip.style.display = 'flex';
            chip.style.alignItems = 'center';
            chip.style.gap = '8px';
            chip.style.background = 'rgba(255, 255, 255, 0.1)';
            chip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            chip.style.cursor = 'pointer';
            chip.innerHTML = `<span>${text}</span> <i class="fa-solid fa-xmark" style="font-size:0.8em; opacity:0.7"></i>`;
            chip.addEventListener('click', removeCallback);
            container.appendChild(chip);
        };

        // Arrays
        filters.platforms?.forEach(p => createChip(`Plataforma: ${p}`, () => removeFilter('platforms', p)));
        filters.statuses?.forEach(s => createChip(`Status: ${s}`, () => removeFilter('statuses', s)));
        filters.genres?.forEach(g => createChip(`Gênero: ${g}`, () => removeFilter('genres', g)));
        filters.subgenres?.forEach(s => createChip(`Sub: ${s}`, () => removeFilter('subgenres', s)));
        filters.tags?.forEach(t => createChip(`${t}`, () => removeFilter('tags', t)));

        // Ranges (Only if not default)
        const isDefault = (arr, def) => !arr || (arr[0] === def[0] && arr[1] === def[1]);

        if (!isDefault(filters.priceRange, [0, 10000])) {
            createChip(`Preço: R$${filters.priceRange[0]} - R$${filters.priceRange[1]}`, () => resetRange('priceRange', [0, 10000]));
        }
        if (!isDefault(filters.metacriticRange, [0, 100])) {
            createChip(`Metacritic: ${filters.metacriticRange[0]} - ${filters.metacriticRange[1]}`, () => resetRange('metacriticRange', [0, 100]));
        }
        if (!isDefault(filters.timeRange, [0, 500])) {
            createChip(`Tempo: ${filters.timeRange[0]}h - ${filters.timeRange[1]}h`, () => resetRange('timeRange', [0, 500]));
        }

        if (hasChips) container.classList.remove('hidden');
        else container.classList.add('hidden');
    });

    // Helper to remove filters via Chips
    const removeFilter = (category, value) => {
        const current = appStore.get().advancedFilters;
        const newArr = current[category].filter(v => v !== value);
        const newFilters = { ...current, [category]: newArr };
        updateAndApply(newFilters);
    };

    const resetRange = (category, defaultVal) => {
        const current = appStore.get().advancedFilters;
        const newFilters = { ...current, [category]: defaultVal };

        // Also update DOM inputs to reflect reset!
        if (category === 'priceRange') {
            setVal('filterPriceMin', 0); setVal('filterPriceMax', 10000);
            setVal('inputPriceMinNumber', 0); setVal('inputPriceMaxNumber', 10000);
        } else if (category === 'metacriticRange') {
            setVal('filterMcMin', 0); setVal('filterMcMax', 100);
            setVal('inputMcMinNumber', 0); setVal('inputMcMaxNumber', 100);
        } else if (category === 'timeRange') {
            setVal('filterTimeMin', 0); setVal('filterTimeMax', 500);
            setVal('inputTimeMinNumber', 0); setVal('inputTimeMaxNumber', 500);
        }

        updateAndApply(newFilters);
    };

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input')); } };

    const updateAndApply = (filters) => {
        appStore.setState({ advancedFilters: filters, paginationLimit: 16 });
        // Update DOM buttons state
        updateFilterBadge(filters);
        // Force re-render of facets to update active classes
        setTimeout(() => {
            // Reset all active classes first? No, we need to sync DOM with State.
            // Ideally we should re-render buttons based on State active values.
            // For now, let's just trigger a click or manually update class?
            // Brute force sync:
            const syncDOM = (cls, arr) => {
                document.querySelectorAll(`.${cls}`).forEach(btn => {
                    if (arr.includes(btn.dataset.value)) btn.classList.add('active');
                    else btn.classList.remove('active');
                });
            };
            syncDOM('platform-filter-btn', filters.platforms);
            syncDOM('status-filter-btn', filters.statuses);
            syncDOM('genre-filter-btn', filters.genres);
            syncDOM('subgenre-filter-btn', filters.subgenres);

            // Sync tags (different selector)
            document.querySelectorAll('#tagFilters .tag-filter-btn').forEach(btn => {
                if (filters.tags && filters.tags.includes(btn.dataset.tag)) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            updateFacets();
        }, 50);
    };

    // 2. Bind Listeners to Inputs (Reactive Updates)
    const bindReactive = (id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateFacets);
    };

    ['filterMcMin', 'filterMcMax', 'filterPriceMin', 'filterPriceMax', 'filterTimeMin', 'filterTimeMax', 'inputTimeMinNumber', 'inputTimeMaxNumber', 'inputMcMinNumber', 'inputMcMaxNumber', 'inputPriceMinNumber', 'inputPriceMaxNumber'].forEach(bindReactive);

    // Range Display Updaters
    // Range Display Updaters
    const rangeUpdate = (minId, maxId, displayId, prefix = '', suffix = '') => {
        const min = document.getElementById(minId);
        const max = document.getElementById(maxId);
        const disp = document.getElementById(displayId);
        if (min && max && disp) {
            const update = () => disp.textContent = `${prefix}${min.value}${suffix} - ${prefix}${max.value}${suffix}`;
            min.addEventListener('input', update);
            max.addEventListener('input', update);
        }
    };
    rangeUpdate('filterMcMin', 'filterMcMax', 'mcRangeDisplay');
    rangeUpdate('filterPriceMin', 'filterPriceMax', 'priceRangeDisplay', 'R$ ');

    // Generic Range Sync (Slider <-> Number)
    const setupRangeSync = (sliderMinId, sliderMaxId, inputMinId, inputMaxId, limit) => {
        const sMin = document.getElementById(sliderMinId);
        const sMax = document.getElementById(sliderMaxId);
        const iMin = document.getElementById(inputMinId);
        const iMax = document.getElementById(inputMaxId);

        if (sMin && sMax && iMin && iMax) {
            // Slider -> Number
            const updateFromSlider = () => {
                iMin.value = sMin.value;
                iMax.value = sMax.value;
            };
            sMin.addEventListener('input', updateFromSlider);
            sMax.addEventListener('input', updateFromSlider);

            // Number -> Slider
            const updateFromNumber = () => {
                const vMin = parseInt(iMin.value) || 0;
                const vMax = parseInt(iMax.value) || 0;
                sMin.value = Math.min(vMin, limit);
                sMax.value = Math.min(vMax, limit);
            };
            iMin.addEventListener('input', updateFromNumber);
            iMax.addEventListener('input', updateFromNumber);
        }
    };

    setupRangeSync('filterMcMin', 'filterMcMax', 'inputMcMinNumber', 'inputMcMaxNumber', 100);
    setupRangeSync('filterPriceMin', 'filterPriceMax', 'inputPriceMinNumber', 'inputPriceMaxNumber', 10000);
    setupRangeSync('filterTimeMin', 'filterTimeMax', 'inputTimeMinNumber', 'inputTimeMaxNumber', 500);

    // Filter Search Logic (Genre & Subgenre)
    const setupFilterSearch = (inputId, containerId) => {
        const input = document.getElementById(inputId);
        const container = document.getElementById(containerId);
        if (input && container) {
            input.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                Array.from(container.children).forEach(btn => {
                    const val = btn.dataset.value.toLowerCase();
                    if (val.includes(query)) {
                        btn.classList.remove('hidden-by-search');
                        // Use existing display logic (updateFacets will handle opacity/display based on counts)
                        // But we need to force hide if search doesn't match
                        // So we toggle a specific class 'hidden-by-search' which forces display:none via CSS or inline override
                        btn.style.display = btn.classList.contains('active') || btn.style.opacity !== '0.5' ? 'inline-block' : 'none';
                        // Re-run updateFacets logic locally or just toggle visibility? 
                        // Simpler: Just toggle visibility directly. 
                        // If mismatched query, force hide. If matched, defer to updateFacets logic (which might hide it if count is 0).
                        // To allow this collaboration, let's use a class.
                    } else {
                        btn.classList.add('hidden-by-search');
                        btn.style.display = 'none';
                    }
                });

                // If query is valid, we must ensure matched items are visible even if count is 0? 
                // No, standard logic: Filter the LIST of buttons.
                // Re-trigger updateFacets to ensure correct "Available" visibility is respected?
                // No, updateFacets controls "Is this valid for current game filter?".
                // Search controls "Can I see this button?".
                // So Search is an AND condition on top of updateFacets.
                updateFacets();
            });
        }
    };
    setupFilterSearch('genreSearch', 'genreFilters');
    setupFilterSearch('subgenreSearch', 'subgenreFilters');

    // Filter Search Logic (Genre & Subgenre) -- Previous Code --

    // Accordion Logic
    const setupAccordions = () => {
        document.querySelectorAll('.filter-group label').forEach(label => {
            const nextElem = label.nextElementSibling;
            if (nextElem) {
                label.style.cursor = 'pointer';
                label.innerHTML += ' <i class="fa-solid fa-chevron-down" style="float:right; font-size:0.8em; margin-top:2px;"></i>';

                label.addEventListener('click', () => {
                    const isHidden = nextElem.style.display === 'none';
                    nextElem.style.display = isHidden ? (nextElem.dataset.display || 'block') : 'none';

                    // Toggle Icon
                    const icon = label.querySelector('i');
                    if (icon) icon.className = isHidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';

                    if (!isHidden) nextElem.dataset.display = getComputedStyle(nextElem).display;
                });
            }
        });
    };
    // Run once after DOM settles or immediately
    setTimeout(setupAccordions, 100);

    // Tag Filters (Manual Button Toggles are handled by delegation in renderFacetButtons)

    // Apply Filters Button (Updates Main State)
    const btnApply = document.getElementById('btnApplyFilters');
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            const filters = getFiltersFromDOM();
            appStore.setState({ advancedFilters: filters, paginationLimit: 16 });
            updateFilterBadge(filters);
            showToast("Filtros aplicados!", "success");
        });
    }

    // Clear Filters
    const btnClear = document.getElementById('btnClearFilters');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            // Clear inputs
            document.querySelectorAll('.tag-filter-btn.active').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#tagFilters .tag-filter-btn.active').forEach(b => b.classList.remove('active'));
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            setVal('filterMcMin', 0); setVal('filterMcMax', 100);
            setVal('inputMcMinNumber', 0); setVal('inputMcMaxNumber', 100);

            setVal('filterPriceMin', 0); setVal('filterPriceMax', 10000);
            setVal('inputPriceMinNumber', 0); setVal('inputPriceMaxNumber', 10000);

            setVal('filterTimeMin', 0); setVal('filterTimeMax', 500);
            setVal('inputTimeMinNumber', 0); setVal('inputTimeMaxNumber', 500);
            setVal('filterSortBy', 'title');

            // Reset Displays
            const dispatch = (id) => document.getElementById(id)?.dispatchEvent(new Event('input'));
            ['filterMcMin', 'filterPriceMin', 'filterTimeMin'].forEach(dispatch);

            // Reset State & Facets
            appStore.setState({
                advancedFilters: { platforms: [], statuses: [], genres: [], subgenres: [], tags: [], priceRange: [0, 10000], metacriticRange: [0, 100], timeRange: [0, 500], sortBy: 'title' },
                paginationLimit: 16
            });
            updateFilterBadge(null);
            updateFacets(); // Re-show all options
            showToast("Filtros limpos", "info");
        });
    }

    // Sort dropdown
    const sortSelect = document.getElementById('filterSortBy');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const { advancedFilters } = appStore.get();
            appStore.setState({ advancedFilters: { ...advancedFilters, sortBy: e.target.value } });
        });
    }
};

// --- FACET LOGIC ---

// 1. Render Buttons (Ensure all options exist in DOM)
const renderFacetButtons = (allGames, containerId, type) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Extract unique values and counts
    const counts = new Map();
    allGames.forEach(g => {
        if (type === 'platform') {
            counts.set(g.platform, (counts.get(g.platform) || 0) + 1);
        } else if (type === 'status') {
            counts.set(g.status, (counts.get(g.status) || 0) + 1);
        } else if (type === 'genre' || type === 'subgenre') {
            const prefix = type === 'genre' ? 'Genre:' : 'Sub:';
            g.tags?.forEach(t => {
                if (t.startsWith(prefix)) {
                    const val = t.substring(prefix.length);
                    counts.set(val, (counts.get(val) || 0) + 1);
                }
            });
        }
    });

    // Sort by Count (Desc) -> Name (Asc)
    const sorted = [...counts.keys()].sort((a, b) => {
        const countDiff = counts.get(b) - counts.get(a);
        if (countDiff !== 0) return countDiff;
        return a.localeCompare(b);
    });

    // Re-build ONLY if container empty
    if (container.children.length === 0) {
        sorted.forEach(val => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `tag-filter-btn ${type}-filter-btn`;
            btn.dataset.value = val;
            // Initial count (Total in collection)
            btn.innerHTML = `${val} <span class="facet-count" style="font-size:0.85em; opacity:0.6; margin-left:4px;">(${counts.get(val)})</span>`;
            // Bind Click -> Toggle Active -> Trigger Facet Update
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                updateFacets();
            });
            container.appendChild(btn);
        });
    }
};

// 2. Update Visibility (The "Reactive" Part)
const updateFacets = () => {
    const allGames = appStore.get().allGamesStats || [];
    const currentDOMFilters = getFiltersFromDOM();

    // Calculate what the result WOULD be with current DOM selection
    const subset = applyAdvancedFilters(allGames, currentDOMFilters);

    // Update Apply Button Text
    const btnApply = document.getElementById('btnApplyFilters');
    if (btnApply) {
        btnApply.innerHTML = `<i class="fa-solid fa-filter"></i> VER ${subset.length} JOGOS`;
    }

    // Helper: Count frequencies in subset
    const getCounts = (games, type) => {
        const counts = new Map();
        games.forEach(g => {
            if (type === 'platform') {
                counts.set(g.platform, (counts.get(g.platform) || 0) + 1);
            } else if (type === 'status') {
                counts.set(g.status, (counts.get(g.status) || 0) + 1);
            } else {
                const prefix = type === 'genre' ? 'Genre:' : 'Sub:';
                g.tags?.forEach(t => {
                    if (t.startsWith(prefix)) {
                        const val = t.substring(prefix.length);
                        counts.set(val, (counts.get(val) || 0) + 1);
                    }
                });
            }
        });
        return counts;
    };

    const updateGroup = (containerId, type, countsMap) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        Array.from(container.children).forEach(btn => {
            const val = btn.dataset.value;
            const isActive = btn.classList.contains('active');
            const count = countsMap.get(val) || 0;

            // Logic: Show if Active OR Available. Hide if Inactive AND Unavailable (Count 0).
            if (isActive || count > 0) {
                btn.style.display = 'inline-block';

                const countSpan = btn.querySelector('.facet-count');
                if (countSpan) countSpan.textContent = `(${count})`;

                if (count === 0 && !isActive) btn.style.opacity = '0.5';
                else btn.style.opacity = '1';
            } else {
                btn.style.display = 'none';
            }
        });
    };

    updateGroup('platformFilters', 'platform', getCounts(subset, 'platform'));
    updateGroup('statusFilters', 'status', getCounts(subset, 'status'));
    updateGroup('genreFilters', 'genre', getCounts(subset, 'genre'));
    updateGroup('subgenreFilters', 'subgenre', getCounts(subset, 'subgenre'));
};

const getFiltersFromDOM = () => {
    // Helper to get active values
    const getActive = (cls) => Array.from(document.querySelectorAll(`.${cls}.active`)).map(b => b.dataset.value);

    return {
        platforms: getActive('platform-filter-btn'),
        statuses: getActive('status-filter-btn'),
        genres: getActive('genre-filter-btn'),
        subgenres: getActive('subgenre-filter-btn'),
        tags: Array.from(document.querySelectorAll('#tagFilters .tag-filter-btn.active')).map(b => b.dataset.tag),
        priceRange: [
            parseInt(document.getElementById('inputPriceMinNumber')?.value || document.getElementById('filterPriceMin')?.value || 0),
            parseInt(document.getElementById('inputPriceMaxNumber')?.value || document.getElementById('filterPriceMax')?.value || 5000)
        ],
        metacriticRange: [
            parseInt(document.getElementById('inputMcMinNumber')?.value || document.getElementById('filterMcMin')?.value || 0),
            parseInt(document.getElementById('inputMcMaxNumber')?.value || document.getElementById('filterMcMax')?.value || 100)
        ],
        timeRange: [
            parseInt(document.getElementById('inputTimeMinNumber')?.value || document.getElementById('filterTimeMin')?.value || 0),
            parseInt(document.getElementById('inputTimeMaxNumber')?.value || document.getElementById('filterTimeMax')?.value || 500)
        ],
        sortBy: document.getElementById('filterSortBy')?.value || 'title'
    };
};

const getSelectedPlatforms = () => {
    return Array.from(document.querySelectorAll('.platform-filter-btn.active'))
        .map(btn => btn.dataset.value);
};

const getSelectedStatuses = () => {
    return Array.from(document.querySelectorAll('.status-filter-btn.active'))
        .map(btn => btn.dataset.status);
};

const getSelectedGenres = () => {
    return Array.from(document.querySelectorAll('.genre-filter-btn.active'))
        .map(btn => btn.dataset.genre);
};

const getSelectedSubgenres = () => {
    return Array.from(document.querySelectorAll('.subgenre-filter-btn.active'))
        .map(btn => btn.dataset.subgenre);
};

const getSelectedTags = () => {
    return Array.from(document.querySelectorAll('.tag-filter-btn.active'))
        .map(btn => btn.dataset.tag)
        .filter(Boolean); // Filter out undefined (platforms, genres, etc)
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
        (filters.genres?.length || 0) +
        (filters.subgenres?.length || 0) +
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
            const val = e.target.value;
            const soldGroup = document.getElementById('soldGroup');
            const priceLabel = document.querySelector('label[for="inputPrice"]');

            // Toggle Sold Inputs
            if (['Vendido', 'À venda'].includes(val)) soldGroup.classList.remove('hidden');
            else soldGroup.classList.add('hidden');

            // Toggle Price Label (Cost vs Target)
            if (val === 'Desejado') {
                priceLabel.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Preço Alvo (R$)';
                priceLabel.classList.add('text-warning');
            } else {
                priceLabel.innerHTML = 'Preço Pago (R$)';
                priceLabel.classList.remove('text-warning');
            }
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
    document.querySelectorAll('.tag-toggle').forEach(b => b.classList.remove('active'));
    document.getElementById('inputTags').value = '[]';
    // Reset Auto Tags
    const autoTagsInput = document.getElementById('inputAutoTags');
    if (autoTagsInput) autoTagsInput.value = '[]';
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
                // Extract Playtime from tags (Time:Xh)
                const timeTag = game.tags.find(t => t.startsWith('Time:'));
                if (timeTag) {
                    const hours = timeTag.replace('Time:', '').replace('h', '');
                    document.getElementById('inputPlaytime').value = hours;
                }
            }
            if (['Vendido', 'À venda'].includes(game.status)) document.getElementById('soldGroup').classList.remove('hidden');

            // Trigger label update based on status
            const priceLabel = document.querySelector('label[for="inputPrice"]');
            if (game.status === 'Desejado') {
                priceLabel.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Preço Alvo (R$)';
                priceLabel.classList.add('text-warning');
            } else {
                priceLabel.innerHTML = 'Preço Pago (R$)';
                priceLabel.classList.remove('text-warning');
            }
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

    // FEATURE GATING: Verificar limite de jogos para usuários Free
    const { user, games } = appStore.get();
    if (!editingId && user) { // Só verifica no ADD, não no EDIT
        const canAdd = await SubscriptionService.checkGameLimit(user.id, games.length);
        if (!canAdd) {
            window.showUpgradeModal('Jogos ilimitados');
            showToast('Limite de 50 jogos atingido. Seja PRO!', 'warning');
            return;
        }
    }

    const platform = document.getElementById('inputPlatform').value || 'Outros';

    btn.innerText = "VERIFICANDO..."; btn.disabled = true;

    try {
        const currentUser = appStore.get().user;
        if (!currentUser) throw new Error("Usuário não autenticado.");

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
            image_url: document.getElementById('inputImage').value,
            // OLD: tags: JSON.parse(document.getElementById('inputTags').value || '[]'),
            // NEW: Merge Manual Tags with Playtime & Auto-detected Genre/Sub tags
            tags: (() => {
                let manual = JSON.parse(document.getElementById('inputTags').value || '[]');
                const auto = JSON.parse(document.getElementById('inputAutoTags')?.value || '[]');

                // Handle Playtime
                const playtime = document.getElementById('inputPlaytime').value;
                manual = manual.filter(t => !t.startsWith('Time:')); // Remove old time tag
                if (playtime && playtime > 0) {
                    manual.push(`Time:${playtime}h`);
                }

                // Use Set to avoid duplicates if user edits twice
                return [...new Set([...manual, ...auto])];
            })(),
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

// --- DEAL HUNTER ENGINE ---
window.runDealHunter = async () => {
    const { allGamesStats } = appStore.get();
    if (!allGamesStats) return;

    // Filter Wishlist items
    const wishlist = allGamesStats.filter(g => g.status === 'Desejado');
    if (wishlist.length === 0) {
        showToast("Sua Wishlist está vazia.", "info");
        return;
    }

    const btn = document.getElementById('btnDealHunter');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 0%';
        btn.disabled = true;
    }

    showToast(`Iniciando busca para ${wishlist.length} jogos...`, "info");

    let dealsFound = 0;

    // Process sequentially with delay to respect API Rate Limits (CheapShark is sensitive)
    for (let i = 0; i < wishlist.length; i++) {
        const game = wishlist[i];

        // Update UI Progress
        const percent = Math.floor(((i + 1) / wishlist.length) * 100);
        if (btn) btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${percent}%`;

        try {
            const deal = await PriceService.getLowestPrice(game.title);

            if (deal) {
                // If Target (price_paid) is 0 or null, we assume any deal is interesting, 
                // OR we could require a target. Let's assume target is required for "DEAL" badge.
                const target = game.price_paid || 0;

                // Logic: If price < target OR (no target & savings > 50%)
                if ((target > 0 && deal.price < target) || (target === 0 && deal.savings >= 50)) {
                    dealsFound++;
                    game.latest_deal = deal;
                }
            }
        } catch (e) {
            console.warn(`Erro ao buscar oferta para ${game.title}`, e);
        }

        // DELAY: 1.2 seconds between requests to avoid 429 Errors
        await new Promise(r => setTimeout(r, 1200));
    }

    // Force Reactivity
    appStore.setState({ allGamesStats: [...allGamesStats] });

    if (btn) { btn.innerHTML = '<i class="fa-solid fa-tags"></i> Buscar Ofertas'; btn.disabled = false; }

    if (dealsFound > 0) {
        showToast(`Sucesso! ${dealsFound} ofertas encontradas.`, "success");
    } else {
        showToast("Busca finalizada. Nenhuma oferta nova.", "info");
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


// --- IMPORT LOGIC ---
let currentImportCandidates = [];

// Helpers accessible by HTML
window.updateImportCount = () => {
    const checked = document.querySelectorAll('.import-checkbox:checked').length;
    const btn = document.getElementById('btnStartImport');
    if (btn) btn.innerHTML = `<i class="fa-solid fa-check"></i> CONFIRMAR IMPORTAÇÃO (${checked})`;
};

window.selectAllImport = (source) => {
    document.querySelectorAll('.import-checkbox').forEach(cb => cb.checked = source.checked);
    window.updateImportCount();
};

const handleSteamImport = async () => {
    const apiKey = document.getElementById('steamApiKey').value.trim();
    const steamId = document.getElementById('steamId').value.trim();
    const rememberKey = document.getElementById('rememberApiKey')?.checked;

    // Validation
    if (!apiKey) { showToast("Insira sua Steam API Key", "error"); return; }
    if (!steamId || !/^[0-9]{17}$/.test(steamId)) { showToast("Steam ID inválido", "error"); return; }

    const btn = document.getElementById('btnStartImport');
    const progressDiv = document.getElementById('importProgress');
    const resultsDiv = document.getElementById('importResults');
    const progressText = document.getElementById('importProgressText');
    const resultsText = document.getElementById('importResultsText');

    // Check if we are in "Confirm" mode (button text changed)
    const isConfirmMode = btn.getAttribute('data-mode') === 'confirm';

    if (isConfirmMode) {
        // --- PHASE 2: CONFIRM IMPORT ---
        try {
            // 1. READ SELECTION BEFORE CLEARING UI
            const checkboxes = document.querySelectorAll('.import-checkbox:checked');
            const selectedAppIds = Array.from(checkboxes).map(cb => cb.value);

            if (selectedAppIds.length === 0) {
                showToast("Selecione pelo menos um jogo.", "warning");
                return; // Return early, DO NOT reset UI
            }

            // 2. NOW WE CAN RESET UI FOR PROGRESS
            btn.disabled = true;
            progressDiv.classList.remove('hidden');
            resultsDiv.classList.add('hidden');
            // resultsText.innerHTML = ''; // Optional: keep list or clear. Let's clear to show progress.

            const gamesToImport = currentImportCandidates.filter(g => selectedAppIds.includes(String(g.steamAppId)));

            progressText.textContent = `Importando ${gamesToImport.length} jogos...`;

            const count = await ImportService.confirmSteamImport(gamesToImport, apiKey, steamId, (p) => {
                if (p.stage === 'enriching') progressText.textContent = `Enriquecendo dados (${p.current}/${p.total}): ${p.game}`;
                if (p.stage === 'saving') progressText.textContent = `Salvando no cofre...`;
            });

            // Success
            console.log(`[ImportSuccess] Import completed with count: ${count}`);
            try {
                showToast(`${count} jogos importados!`, "success");

                // Close Import Modal Explicitly
                document.getElementById('importModal').classList.add('hidden');

                // Reset Internal Modal State
                progressDiv.classList.add('hidden');
                resultsDiv.classList.add('hidden');

                const { user } = appStore.get();
                if (user) await loadData(user.id); // Add await to ensure data loads
            } catch (uiError) {
                console.error("[ImportSuccess] UI Update Failed:", uiError);
                showToast("Importação concluída, mas erro na interface. Recarregue a página.", "warning");
            }

            // Clean state
            currentImportCandidates = [];
            btn.removeAttribute('data-mode');
            btn.innerHTML = '<i class="fa-solid fa-download"></i> IMPORTAR BIBLIOTECA';
            btn.className = 'btn-primary';
            btn.style.background = ''; // Clear overrides
            btn.style.boxShadow = '';

        } catch (error) {
            console.error(error);
            showToast("Erro na importação: " + error.message, "error");
            // If error, restore UI so user can try again? 
            // Ideally we should catch specific errors. For now, just hide progress.
            progressDiv.classList.add('hidden');
            resultsDiv.classList.remove('hidden'); // Show list again
            btn.disabled = false;
        }

    } else {
        // --- PHASE 1: FETCH PREVIEW ---
        // UI Reset
        btn.disabled = true;
        progressDiv.classList.remove('hidden');
        resultsDiv.classList.add('hidden');
        resultsText.innerHTML = '';

        try {
            progressText.textContent = 'Conectando à Steam e verificando biblioteca...';

            // Generate list
            const games = await ImportService.getSteamPreview(steamId, apiKey);
            currentImportCandidates = games;

            if (games.length === 0) {
                showToast("Nenhum jogo encontrado.", "info");
                btn.disabled = false;
                progressDiv.classList.add('hidden');
                return;
            }

            // Save Credentials if requested
            if (rememberKey) localStorage.setItem('steam_api_key', apiKey);
            else localStorage.removeItem('steam_api_key');
            localStorage.setItem('steam_id', steamId);

            // Render Preview List
            renderImportPreview(games, resultsText);

            // Switch Button to Confirm Mode
            resultsDiv.classList.remove('hidden');
            progressDiv.classList.add('hidden');
            btn.innerHTML = `<i class="fa-solid fa-check"></i> CONFIRMAR IMPORTAÇÃO (0)`;
            btn.setAttribute('data-mode', 'confirm');

            // FIX: Reuse btn-primary (shape/border) but override color to Green
            btn.className = 'btn-primary';
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btn.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.3)';
            btn.style.borderColor = 'transparent'; // Ensure no border issues
            btn.disabled = false;

        } catch (error) {
            console.error(error);
            showToast("Erro ao buscar: " + error.message, "error");
            progressDiv.classList.add('hidden');
        } finally {
            btn.disabled = false;
        }
    }
};

window.handleResetSteam = async () => {
    if (!confirm("Isso apagará TODOS os jogos importados da Steam.\n\nTem certeza que deseja recomeçar?")) return;

    try {
        const { user } = appStore.get();
        if (!user) return;

        showToast("Removendo jogos...", "info");
        const count = await GameService.deleteByPlatform(user.id, 'Steam');

        showToast(`${count} jogos removidos.`, "success");
        loadData(user.id);

        // Reset button state
        const btn = document.getElementById('btnStartImport');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-download"></i> IMPORTAR BIBLIOTECA';
            btn.removeAttribute('data-mode');
            btn.className = 'btn-primary';
            // Clear manual overrides
            btn.style.background = '';
            btn.style.boxShadow = '';
        }
        document.getElementById('importResultsText').innerHTML = '';
        document.getElementById('importResults').classList.add('hidden');


    } catch (e) {
        console.error(e);
        showToast("Erro ao remover: " + e.message, "error");
    }
};

const renderImportPreview = (games, container) => {
    // Generate HTML
    let html = `
        <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
             <label style="color:white; cursor:pointer;"><input type="checkbox" onchange="window.selectAllImport(this)"> Selecionar Tudo</label>
             <span style="color:#888; font-size:0.8rem">${games.length} jogos encontrados</span>
        </div>
        <div class="import-list" style="max-height:300px; overflow-y:auto; border:1px solid #333; border-radius:8px; background:rgba(0,0,0,0.2);">`;

    games.forEach(g => {
        const isDup = g.isDuplicate;
        html += `
            <div style="display:flex; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.05); ${isDup ? 'opacity:0.5;' : ''}">
                <input type="checkbox" class="import-checkbox" value="${g.steamAppId}" onchange="window.updateImportCount()" ${!isDup ? 'checked' : ''} style="margin-right:10px; width:16px; height:16px;">
                <img src="${g.image_url}" style="width:32px; height:48px; object-fit:cover; margin-right:10px; border-radius:4px;" onerror="this.style.display='none'">
                <div style="flex:1;">
                    <div style="color:${isDup ? '#888' : 'white'}; font-weight:bold; font-size:0.9rem;">${g.title}</div>
                    <div style="color:#666; font-size:0.75rem;">${(g.playtime_minutes / 60).toFixed(1)}h jogadas ${isDup ? '• <span style="color:#d4af37">JÁ NA COLEÇÃO</span>' : '• NOVO'}</div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Initial count update
    window.updateImportCount();
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
// GOG GALAXY IMPORT HANDLERS
// ===================================================================================================

let gogGalaxyData = null;
let gogPreviewGames = [];
let gogAvailablePlatforms = [];

// Handler para mudança de plataforma de importação
window.handleImportPlatformChange = (value) => {
    const steamConfig = document.getElementById('steamConfig');
    const gogConfig = document.getElementById('gogGalaxyConfig');
    const btnStartImport = document.getElementById('btnStartImport');
    const steamDeleteSection = document.getElementById('steamDeleteSection');
    const gogDeleteSection = document.getElementById('gogDeleteSection');

    // Reset estado do GOG Galaxy quando muda de plataforma
    resetGogGalaxyState();

    if (value === 'goggalaxy') {
        steamConfig.classList.add('hidden');
        gogConfig.classList.remove('hidden');
        steamDeleteSection.classList.add('hidden');
        gogDeleteSection.classList.remove('hidden');
        btnStartImport.innerHTML = '<i class="fa-solid fa-eye"></i> CARREGAR E VISUALIZAR';
        btnStartImport.onclick = () => handleGogGalaxyPreview();
        btnStartImport.style.background = '';
        btnStartImport.disabled = false;
    } else {
        steamConfig.classList.remove('hidden');
        gogConfig.classList.add('hidden');
        steamDeleteSection.classList.remove('hidden');
        gogDeleteSection.classList.add('hidden');
        btnStartImport.innerHTML = '<i class="fa-solid fa-download"></i> IMPORTAR BIBLIOTECA';
        btnStartImport.onclick = () => handleImportSubmit();
        btnStartImport.style.background = '';
        btnStartImport.disabled = false;
    }
};

// Reset do estado do GOG Galaxy
const resetGogGalaxyState = () => {
    gogGalaxyData = null;
    gogPreviewGames = [];
    gogAvailablePlatforms = [];

    // Reset UI elements se existirem
    const jsonInput = document.getElementById('gogJsonInput');
    if (jsonInput) jsonInput.value = '';

    const platformSelection = document.getElementById('gogPlatformSelection');
    if (platformSelection) platformSelection.classList.add('hidden');

    const quickActions = document.getElementById('gogQuickActions');
    if (quickActions) quickActions.classList.add('hidden');

    const previewStats = document.getElementById('gogPreviewStats');
    if (previewStats) previewStats.classList.add('hidden');

    const platformCheckboxes = document.getElementById('gogPlatformCheckboxes');
    if (platformCheckboxes) platformCheckboxes.innerHTML = '';

    // Reset stats
    const stats = ['gogStatTotal', 'gogStatNew', 'gogStatDuplicate', 'gogStatSelected'];
    stats.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
};

// Handler para upload de arquivo JSON
window.handleGogFileUpload = (input) => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('gogJsonInput').value = e.target.result;
        showToast('Arquivo carregado! Clique em "Carregar e Visualizar"', 'success');
    };
    reader.onerror = () => {
        showToast('Erro ao ler arquivo', 'error');
    };
    reader.readAsText(file);
};

// Handler para carregar e visualizar jogos do GOG Galaxy
const handleGogGalaxyPreview = async () => {
    // FEATURE GATING: Verificar se usuário tem acesso ao GOG Import
    const { user } = appStore.get();
    if (user) {
        const canAccess = await SubscriptionService.canAccess(user.id, 'hasGogImport');
        if (!canAccess) {
            window.showUpgradeModal('Importação GOG Galaxy/Epic');
            return;
        }
    }

    const jsonInput = document.getElementById('gogJsonInput').value.trim();

    if (!jsonInput) {
        showToast('Cole o JSON do relatório GOG Galaxy primeiro', 'warning');
        return;
    }

    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CARREGANDO...';

    try {
        gogGalaxyData = JSON.parse(jsonInput);

        // Mostrar seleção de plataformas
        gogAvailablePlatforms = GogImportService.getAvailablePlatforms(gogGalaxyData);

        if (gogAvailablePlatforms.length === 0) {
            showToast('Nenhuma plataforma encontrada no JSON', 'warning');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-eye"></i> CARREGAR E VISUALIZAR';
            return;
        }

        renderGogPlatformSelection(gogAvailablePlatforms);
        updateGogDeletePlatformOptions();

        // Mostrar stats iniciais
        document.getElementById('gogPlatformSelection').classList.remove('hidden');
        document.getElementById('gogQuickActions').classList.remove('hidden');
        document.getElementById('gogPreviewStats').classList.remove('hidden');

        // Atualizar botão
        btn.innerHTML = '<i class="fa-solid fa-download"></i> IMPORTAR SELECIONADOS';
        btn.onclick = () => handleGogGalaxyImport();
        btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        btn.disabled = false;

        showToast(`${gogAvailablePlatforms.reduce((a, p) => a + p.count, 0)} jogos encontrados!`, 'success');

    } catch (error) {
        console.error('Erro ao parsear JSON:', error);
        showToast('JSON inválido. Verifique o formato do arquivo.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-eye"></i> CARREGAR E VISUALIZAR';
    }
};

// Atualiza opções do dropdown de deletar plataforma
const updateGogDeletePlatformOptions = () => {
    const select = document.getElementById('gogDeletePlatformSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione uma plataforma</option>';

    const platformTags = [
        { value: 'Xbox', label: '🟢 Xbox' },
        { value: 'Epic Games', label: '⚫ Epic Games' },
        { value: 'Steam', label: '🔵 Steam' },
        { value: 'GOG', label: '🟣 GOG' },
        { value: 'Origin', label: '🟠 Origin' },
        { value: 'Ubisoft', label: '🔴 Ubisoft' },
        { value: 'Battle.net', label: '🔵 Battle.net' },
    ];

    platformTags.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.value;
        opt.textContent = p.label;
        select.appendChild(opt);
    });
};

// Renderiza checkboxes de seleção de plataformas
const renderGogPlatformSelection = (platforms) => {
    const container = document.getElementById('gogPlatformCheckboxes');

    const platformIcons = {
        'Xbox One': { icon: 'fa-xbox', color: '#107c10', bg: 'rgba(16, 124, 16, 0.2)' },
        'Epic Games': { icon: 'fa-square', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' },
        'Steam': { icon: 'fa-steam', color: '#66c0f4', bg: 'rgba(102, 192, 244, 0.2)' },
        'GOG': { icon: 'fa-compact-disc', color: '#86328a', bg: 'rgba(134, 50, 138, 0.2)' },
        'Origin': { icon: 'fa-gamepad', color: '#f56c2d', bg: 'rgba(245, 108, 45, 0.2)' },
        'Ubisoft': { icon: 'fa-gamepad', color: '#0070ff', bg: 'rgba(0, 112, 255, 0.2)' },
        'Battle.net': { icon: 'fa-gamepad', color: '#148eff', bg: 'rgba(20, 142, 255, 0.2)' },
    };

    container.innerHTML = platforms.map(p => {
        const config = platformIcons[p.name] || { icon: 'fa-gamepad', color: '#888', bg: 'rgba(100,100,100,0.2)' };
        return `
            <label class="platform-checkbox" style="
                display: flex; 
                align-items: center; 
                gap: 8px; 
                padding: 8px 12px; 
                background: ${config.bg}; 
                border: 1px solid ${config.color}60; 
                border-radius: 8px; 
                cursor: pointer;
                transition: all 0.2s;
                user-select: none;
            " onmouseover="this.style.transform='scale(1.02)'; this.style.borderColor='${config.color}'" 
               onmouseout="this.style.transform='scale(1)'; this.style.borderColor='${config.color}60'">
                <input type="checkbox" 
                    class="gog-platform-cb" 
                    value="${p.name}" 
                    checked 
                    onchange="window.updateGogPreview()"
                    style="width: 18px; height: 18px; accent-color: ${config.color}; cursor: pointer;">
                <i class="fa-brands ${config.icon}" style="color: ${config.color}; font-size: 1.1rem;"></i>
                <span style="color: #ddd; font-size: 0.85rem; font-weight: 500;">${p.name}</span>
                <span style="color: #aaa; font-size: 0.75rem; background: rgba(0,0,0,0.4); padding: 2px 8px; border-radius: 10px; margin-left: auto;">${p.count}</span>
            </label>
        `;
    }).join('');

    // Atualizar preview inicial
    window.updateGogPreview();
};

// Atualiza preview com base nas plataformas selecionadas
window.updateGogPreview = async () => {
    if (!gogGalaxyData) {
        console.warn('updateGogPreview chamado sem dados carregados');
        return;
    }

    const selectedPlatforms = Array.from(document.querySelectorAll('.gog-platform-cb:checked'))
        .map(cb => cb.value);

    // Atualizar stats mesmo se vazio
    if (selectedPlatforms.length === 0) {
        gogPreviewGames = [];
        document.getElementById('gogStatTotal').textContent = '0';
        document.getElementById('gogStatNew').textContent = '0';
        document.getElementById('gogStatDuplicate').textContent = '0';
        document.getElementById('gogStatSelected').textContent = '0';
        return;
    }

    try {
        gogPreviewGames = await GogImportService.getGogPreview(gogGalaxyData, selectedPlatforms);

        const total = gogPreviewGames.length;
        const newGames = gogPreviewGames.filter(g => !g.isDuplicate).length;
        const duplicates = gogPreviewGames.filter(g => g.isDuplicate).length;
        const selected = gogPreviewGames.filter(g => g.selected).length;

        document.getElementById('gogStatTotal').textContent = total;
        document.getElementById('gogStatNew').textContent = newGames;
        document.getElementById('gogStatDuplicate').textContent = duplicates;
        document.getElementById('gogStatSelected').textContent = selected;

    } catch (error) {
        console.error('Erro ao atualizar preview:', error);
        showToast('Erro ao processar dados', 'error');
    }
};

// Selecionar todos os jogos
window.gogSelectAll = () => {
    if (!gogPreviewGames || gogPreviewGames.length === 0) {
        showToast('Carregue os dados primeiro', 'warning');
        return;
    }
    gogPreviewGames.forEach(g => g.selected = true);
    document.getElementById('gogStatSelected').textContent = gogPreviewGames.length;
    showToast(`${gogPreviewGames.length} jogos selecionados`, 'info');
};

// Limpar seleção
window.gogSelectNone = () => {
    if (!gogPreviewGames || gogPreviewGames.length === 0) {
        showToast('Carregue os dados primeiro', 'warning');
        return;
    }
    gogPreviewGames.forEach(g => g.selected = false);
    document.getElementById('gogStatSelected').textContent = '0';
    showToast('Seleção limpa', 'info');
};

// Selecionar apenas jogos novos
window.gogSelectNew = () => {
    if (!gogPreviewGames || gogPreviewGames.length === 0) {
        showToast('Carregue os dados primeiro', 'warning');
        return;
    }
    gogPreviewGames.forEach(g => g.selected = !g.isDuplicate);
    const selected = gogPreviewGames.filter(g => g.selected).length;
    document.getElementById('gogStatSelected').textContent = selected;

    if (selected === 0) {
        showToast('Todos os jogos já estão na sua coleção!', 'info');
    } else {
        showToast(`${selected} jogos novos selecionados`, 'success');
    }
};

// Handler para deletar jogos de uma plataforma específica
window.handleDeleteGogPlatform = async () => {
    const select = document.getElementById('gogDeletePlatformSelect');
    const platformTag = select.value;

    if (!platformTag) {
        showToast('Selecione uma plataforma para remover', 'warning');
        return;
    }

    const { user } = appStore.get();
    if (!user) {
        showToast('Faça login primeiro', 'error');
        return;
    }

    const confirmMsg = `Isso irá REMOVER TODOS os jogos com a tag "${platformTag}" da sua coleção.\n\nTem certeza?`;
    if (!confirm(confirmMsg)) return;

    try {
        showToast(`Buscando jogos ${platformTag}...`, 'info');

        // Buscar jogos com essa tag
        const { data: games, error: fetchError } = await supabase
            .from('games')
            .select('id, tags')
            .eq('user_id', user.id);

        if (fetchError) throw fetchError;

        // Filtrar jogos que têm a tag da plataforma
        const gamesToDelete = games.filter(g => {
            if (!g.tags) return false;
            const tags = Array.isArray(g.tags) ? g.tags : JSON.parse(g.tags || '[]');
            return tags.includes(platformTag);
        });

        if (gamesToDelete.length === 0) {
            showToast(`Nenhum jogo com tag "${platformTag}" encontrado`, 'info');
            return;
        }

        showToast(`Removendo ${gamesToDelete.length} jogos ${platformTag}...`, 'info');

        // Deletar em batches de 50 para evitar erro 400 (URL muito longa)
        const BATCH_SIZE = 50;
        let deletedCount = 0;

        for (let i = 0; i < gamesToDelete.length; i += BATCH_SIZE) {
            const batch = gamesToDelete.slice(i, i + BATCH_SIZE);
            const batchIds = batch.map(g => g.id);

            const { error: deleteError } = await supabase
                .from('games')
                .delete()
                .in('id', batchIds);

            if (deleteError) {
                console.error(`Erro no batch ${i / BATCH_SIZE + 1}:`, deleteError);
                throw deleteError;
            }

            deletedCount += batch.length;

            // Feedback de progresso para muitos jogos
            if (gamesToDelete.length > BATCH_SIZE) {
                showToast(`Removidos ${deletedCount}/${gamesToDelete.length}...`, 'info');
            }
        }

        showToast(`${deletedCount} jogos ${platformTag} removidos!`, 'success');

        // Recarregar dados
        await loadData(user.id);

        // Reset select
        select.value = '';

    } catch (error) {
        console.error('Erro ao remover jogos:', error);
        showToast('Erro ao remover: ' + (error.message || 'erro desconhecido'), 'error');
    }
};

// Importar jogos selecionados do GOG Galaxy
const handleGogGalaxyImport = async () => {
    const gamesToImport = gogPreviewGames.filter(g => g.selected);

    if (gamesToImport.length === 0) {
        showToast('Selecione pelo menos um jogo para importar', 'warning');
        return;
    }

    const btn = document.getElementById('btnStartImport');
    const progressDiv = document.getElementById('importProgress');
    const progressText = document.getElementById('importProgressText');

    btn.disabled = true;
    progressDiv.classList.remove('hidden');
    progressText.textContent = `Importando ${gamesToImport.length} jogos...`;

    try {
        const count = await GogImportService.confirmGogImport(gamesToImport, (progress) => {
            if (progress.stage === 'processing') {
                progressText.textContent = `Processando (${progress.current}/${progress.total}): ${progress.game}`;
            } else if (progress.stage === 'saving') {
                progressText.textContent = 'Salvando no cofre...';
            }
        });

        showToast(`${count} jogos importados com sucesso!`, 'success');

        // Fechar modal e recarregar dados
        document.getElementById('importModal').classList.add('hidden');

        const { user } = appStore.get();
        if (user) await loadData(user.id);

        // Reset estado
        resetGogGalaxyState();

    } catch (error) {
        console.error('Erro na importação:', error);
        showToast('Erro na importação: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        progressDiv.classList.add('hidden');
        btn.innerHTML = '<i class="fa-solid fa-eye"></i> CARREGAR E VISUALIZAR';
        btn.style.background = '';
        btn.onclick = () => handleGogGalaxyPreview();
    }
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

                    div.onclick = async () => {
                        input.value = item.name;
                        document.getElementById('inputImage').value = item.background_image || '';

                        // --- NEW: AUTO-TAGGING (GENRES & SUBGENRES) ---
                        // We store these in a hidden input to merge on submit
                        // Prefixes: "Genre:" for main genres, "Sub:" for tags (subgenres)
                        let autoTags = [];

                        if (item.genres && Array.isArray(item.genres)) {
                            autoTags = autoTags.concat(item.genres.map(g => `Genre:${g.name}`));
                        }

                        // Use top 5 tags as subgenres to avoid clutter
                        if (item.tags && Array.isArray(item.tags)) {
                            const meaningfulTags = item.tags
                                .filter(t => t.language === 'eng' || !t.language) // Filter garbage
                                .slice(0, 5)
                                .map(t => `Sub:${t.name}`);
                            autoTags = autoTags.concat(meaningfulTags);
                        }

                        // --- REPLACED: HLTB INTEGRATION (More Accurate than RAWG) ---
                        // Old RAWG playtime is inaccurate (shows 1h when HLTB shows 7h)
                        // Now we fetch from HowLongToBeat for accurate completion times
                        const hltbData = await HLTBService.search(item.name);
                        if (hltbData && hltbData.averageTime > 0) {
                            autoTags.push(`Time:${hltbData.averageTime}h`);
                            console.log(`[HLTB] ${item.name}: ${hltbData.averageTime}h (Main: ${hltbData.mainStory}h, +Extras: ${hltbData.mainExtras}h)`);
                        } else {
                            // Fallback to RAWG if HLTB fails (rare games might not be in HLTB)
                            if (item.playtime && item.playtime > 0) {
                                autoTags.push(`Time:${item.playtime}h`);
                                console.log(`[RAWG Fallback] ${item.name}: ${item.playtime}h`);
                            }
                        }

                        let autoTagsInput = document.getElementById('inputAutoTags');
                        if (!autoTagsInput) {
                            autoTagsInput = document.createElement('input');
                            autoTagsInput.type = 'hidden';
                            autoTagsInput.id = 'inputAutoTags';
                            const form = document.getElementById('gameForm');
                            if (form) form.appendChild(autoTagsInput);
                        }
                        autoTagsInput.value = JSON.stringify(autoTags);
                        // -----------------------------------------------

                        // Store Metacritic score in hidden field
                        let metacriticInput = document.getElementById('inputMetacritic');
                        if (!metacriticInput) {
                            metacriticInput = document.createElement('input');
                            metacriticInput.type = 'hidden';
                            metacriticInput.id = 'inputMetacritic';
                            const form = document.getElementById('gameForm');
                            if (form) form.appendChild(metacriticInput);
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


// ===================================================================================================
// UTILS & SYNC
// ===================================================================================================

window.handleSyncPlaytime = async (gameId, gameTitle, btnElement) => {
    // 1. Show loading state on button
    const originalContent = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnElement.disabled = true;

    try {
        showToast('Buscando dados no HowLongToBeat...', 'info');

        // 2. Fetch from HLTB
        // Verify if HLTBService is available
        if (typeof HLTBService === 'undefined') {
            throw new Error('Serviço HLTB não carregado');
        }

        const hltbData = await HLTBService.search(gameTitle);

        if (!hltbData) {
            showToast('Jogo não encontrado no HowLongToBeat', 'warning');
            return; // Stop here, don't update
        }

        // 3. Update Tags
        const { games, user } = appStore.get();
        if (!games || !user) throw new Error('Estado da aplicação inválido');

        const game = games.find(g => g.id == gameId);
        if (!game) throw new Error('Jogo não encontrado localmente');

        let tags = game.tags || [];
        // Remove old Time tag (regex or startsWith)
        tags = tags.filter(t => !t.startsWith('Time:'));

        // Add new tag if time > 0
        const newTime = hltbData.averageTime;
        if (newTime > 0) {
            tags.push(`Time:${newTime}h`);
        }

        // 4. Update Supabase
        const { error } = await supabase
            .from('games')
            .update({ tags: tags })
            .eq('id', game.id);

        if (error) throw error;

        // 5. Update Local State (Manual Mutation for speed)
        game.tags = tags;
        // Force update of state to trigger any listeners, but we will manually update DOM to avoid modal close
        appStore.setState({ games: [...games] });

        // 6. Update UI Manually (Active Modal)
        const tagsContainer = document.getElementById('detailTagsContainer');
        if (tagsContainer) {
            const list = tagsContainer.querySelector('.detail-tags-list');
            if (list) {
                list.innerHTML = '';
                tags.forEach(tag => {
                    const tagSpan = document.createElement('span');
                    tagSpan.className = 'detail-tag';
                    tagSpan.textContent = tag;
                    list.appendChild(tagSpan);
                });
            }
        }

        // Also update background grid card if visible
        renderApp(); // This is safe? Usually re-renders grid. Modal overlay is separate in index.html structure usually.
        // If renderApp clears modal, we skip it. 
        // Based on ui.js, renderApp -> setupUI -> renderGrid. It shouldn't close modal if modal is just a hidden/shown div.
        // But to be safe, just updating the modal is enough for the user interaction. The grid will update on next refresh/action.

        showToast(`Tempo atualizado: ${newTime}h (HLTB)`, 'success');

    } catch (e) {
        console.error(e);
        showToast('Erro ao sincronizar: ' + e.message, 'error');
    } finally {
        if (btnElement) {
            btnElement.innerHTML = originalContent;
            btnElement.disabled = false;
        }
    }
};


window.handleBulkSyncPlaytime = async (btnElement) => {
    // 1. Confirm action
    if (!confirm("Isso irá buscar o tempo de todos os jogos da sua coleção no HowLongToBeat.\n\nPode levar alguns minutos. Deseja continuar?")) return;

    // 2. Setup UI state
    const originalContent = btnElement ? btnElement.innerHTML : '';
    if (btnElement) {
        btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
        btnElement.disabled = true;
    }

    try {
        const { games, allGamesStats, user } = appStore.get();
        if (!user) throw new Error('Estado inválido: Usuário não identificado');

        // Use allGamesStats (Full Collection) if available, otherwise fallback to current view
        // This fixes the issue where 'games' might be filtered or empty
        const gamesToSync = (allGamesStats && allGamesStats.length > 0) ? allGamesStats : (games || []);

        if (gamesToSync.length === 0) {
            showToast('Nenhum jogo encontrado para sincronizar.', 'warning');
            return;
        }

        let updatedCount = 0;
        let errorCount = 0;

        showToast(`Iniciando sincronização de ${gamesToSync.length} jogos...`, 'info');

        // Process in chunks to avoid overwhelming everything
        for (let i = 0; i < gamesToSync.length; i++) {
            const game = gamesToSync[i];

            // Update button progress
            if (btnElement) btnElement.innerHTML = `< i class="fa-solid fa-spinner fa-spin" ></i > ${i + 1}/${gamesToSync.length}`;

            try {
                // Initial delay to be nice to API
                await new Promise(r => setTimeout(r, 800));

                // Always CLEAR old HLTB tags first (Reset logic)
                let tags = game.tags || [];
                tags = tags.filter(t => !t.startsWith('Time:') && !t.startsWith('hltb:'));

                const hltbData = await HLTBService.search(game.title);

                if (hltbData) {
                    // Add standard time (Average)
                    if (hltbData.averageTime > 0) {
                        tags.push(`Time:${hltbData.averageTime}h`);
                    }

                    // Add rich tags (optional, future proofing)
                    if (hltbData.mainStory > 0) tags.push(`hltb:main:${hltbData.mainStory}h`);
                    if (hltbData.mainExtras > 0) tags.push(`hltb:extras:${hltbData.mainExtras}h`);
                    if (hltbData.completionist > 0) tags.push(`hltb:100:${hltbData.completionist}h`);
                }

                // Update Supabase (This saves the cleared state if no data found, satisfying "Reset")
                const { error } = await supabase
                    .from('games')
                    .update({ tags: tags })
                    .eq('id', game.id);

                if (error) {
                    console.warn(`Supabase update failed for ${game.title}`, error);
                    errorCount++;
                } else {
                    // Update Local
                    game.tags = tags;
                    updatedCount++;
                }
            } catch (err) {
                console.warn(`Failed to sync ${game.title}:`, err);
                errorCount++;
            }
        }

        // Final UI Update
        appStore.setState({ games: [...games] }); // Trigger re-render
        renderApp(appStore.get());

        showToast(`Sincronização concluída! ${updatedCount} atualizados. ${errorCount > 0 ? `(${errorCount} falhas)` : ''}`, 'success');

    } catch (e) {
        console.error(e);
        showToast('Erro no processo de bulk sync: ' + e.message, 'error');
    } finally {
        if (btnElement) {
            btnElement.innerHTML = originalContent;
            btnElement.disabled = false;
        }
    }
};

// ===================================================================================================


// SUBSCRIPTION & PRO FEATURES
// ===================================================================================================

// Carrega subscription do usuário
const loadUserSubscription = async (userId) => {
    if (!userId) return null;
    userSubscription = await SubscriptionService.getStatus(userId);
    updateProBadge();
    return userSubscription;
};

// Atualiza badge PRO no header baseado no status da subscription
const updateProBadge = () => {
    const isPro = SubscriptionService.isPro(userSubscription);
    const isTrialing = userSubscription?.status === 'trialing';

    // Atualiza badge no dropdown do usuário (ui.js renderiza isso)
    const userBadge = document.getElementById('userPlanBadge');
    if (userBadge) {
        if (isPro) {
            if (isTrialing) {
                const trialEnd = new Date(userSubscription.trial_ends_at);
                const daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
                userBadge.textContent = `TRIAL (${daysLeft}d)`;
                userBadge.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
            } else {
                userBadge.textContent = 'PRO';
                userBadge.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            }
        } else {
            userBadge.textContent = 'SEJA PRO';
            userBadge.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        }
    }

    // Atualiza também o botão separado no header (se existir)
    const btn = document.getElementById('proBadgeBtn');
    const text = document.getElementById('proBadgeText');
    if (btn && text) {
        btn.style.display = 'flex';
        if (isPro) {
            if (isTrialing) {
                const trialEnd = new Date(userSubscription.trial_ends_at);
                const daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
                text.textContent = `TRIAL (${daysLeft}d)`;
                btn.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
            } else {
                text.textContent = 'PRO';
                btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            }
        } else {
            text.textContent = 'SEJA PRO';
            btn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        }
    }

    console.log('[Subscription] Badge atualizado - isPro:', isPro, 'isTrialing:', isTrialing);
};

// Mostra modal de upgrade com feature específica
window.showUpgradeModal = (featureName = null) => {
    const modal = document.getElementById('upgradeModal');
    const blockedFeature = document.getElementById('upgradeBlockedFeature');
    const featureNameEl = document.getElementById('upgradeFeatureName');

    if (featureName) {
        blockedFeature.classList.remove('hidden');
        featureNameEl.textContent = featureName + ' é uma feature PRO';
    } else {
        blockedFeature.classList.add('hidden');
    }

    modal.classList.remove('hidden');
};

// Handler para upgrade (mensal ou anual)
window.handleUpgrade = async (planType) => {
    const { user } = appStore.get();
    if (!user) {
        showToast('Faça login primeiro', 'error');
        return;
    }

    document.getElementById('upgradeModal').classList.add('hidden');

    // Chama o checkout do serviço
    await SubscriptionService.checkout(planType, user.email);
};

// Handler para iniciar trial
window.handleStartTrial = async () => {
    const { user } = appStore.get();
    if (!user) {
        showToast('Faça login primeiro', 'error');
        return;
    }

    // Verifica se já usou trial
    if (userSubscription && userSubscription.trial_ends_at) {
        showToast('Você já utilizou o período de teste', 'warning');
        return;
    }

    try {
        await SubscriptionService.startTrial(user.id);
        userSubscription = await SubscriptionService.getStatus(user.id);

        showToast('🎉 Trial de 7 dias ativado! Aproveite todas as features PRO', 'success');
        document.getElementById('upgradeModal').classList.add('hidden');

        updateProBadge();
    } catch (error) {
        console.error('Erro ao iniciar trial:', error);
        showToast('Erro ao iniciar trial', 'error');
    }
};

// Verifica se pode acessar feature PRO
window.checkProFeature = async (featureName, displayName) => {
    const { user } = appStore.get();
    if (!user) {
        showToast('Faça login primeiro', 'error');
        return false;
    }

    const canAccess = await SubscriptionService.canAccess(user.id, featureName);

    if (!canAccess) {
        window.showUpgradeModal(displayName);
        return false;
    }

    return true;
};

// Verifica limite de jogos
window.checkGameLimit = async () => {
    const { user, games } = appStore.get();
    if (!user) return false;

    const canAdd = await SubscriptionService.checkGameLimit(user.id, games.length);

    if (!canAdd) {
        window.showUpgradeModal('Jogos ilimitados');
        showToast('Limite de 50 jogos atingido. Seja PRO para adicionar mais!', 'warning');
        return false;
    }

    return true;
};







document.addEventListener('DOMContentLoaded', init);