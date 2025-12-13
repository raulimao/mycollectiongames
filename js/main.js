import { supabase, AuthService } from './services/supabase.js';
import { GameService, SocialService } from './services/api.js';
import { appStore } from './modules/store.js';
import { renderApp, showToast, toggleModal, setupRoulette, exportData, generateSocialCard, renderUserList } from './modules/ui.js';

let editingId = null;
let isInitializing = false;

const DEFAULT_PLATFORMS = ["PC", "PlayStation 5", "PlayStation 4", "Xbox Series X/S", "Xbox One", "Nintendo Switch", "Steam Deck", "Mobile", "Outros"];

window.toggleTag = (btn) => {
    btn.classList.toggle('active');
    const actives = document.querySelectorAll('.tag-toggle.active');
    const values = Array.from(actives).map(b => b.dataset.val);
    document.getElementById('inputTags').value = JSON.stringify(values);
};

window.handleLogoClick = () => {
    const { user, isSharedMode } = appStore.get();
    if (isSharedMode) { window.location.href = window.location.pathname; } 
    else {
        if (!user) document.getElementById('loginOverlay').classList.remove('hidden');
        else { showToast("Atualizando...", "info"); loadData(user.id); }
    }
};

window.handleLoginRequest = () => document.getElementById('loginOverlay').classList.remove('hidden');
window.handleLogout = () => { if(confirm("Sair?")) AuthService.signOut(); };

window.handleFollow = async () => {
    const { user, games, sharedProfileName } = appStore.get();
    if (!user) { showToast("Faça login para seguir!", "error"); return; }
    if (!games || games.length === 0) return;

    const ownerId = games[0].user_id;
    if (ownerId === user.id) { showToast("Você não pode seguir a si mesmo.", "warning"); return; }

    try {
        const btn = document.getElementById('btnFollow');
        if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

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
            if(post.id === feedId) {
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

window.openNotifications = () => {
    const { isNotificationsOpen, user, notifications } = appStore.get();
    
    if (isNotificationsOpen) {
        appStore.setState({ isNotificationsOpen: false });
    } else {
        if(user) SocialService.markAllNotificationsRead(user.id);
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
    
    if(type === 'FOLLOW') {
        window.location.href = `?u=${actorNick}`;
    } else if(type === 'LIKE') {
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
    const { user, games } = appStore.get();
    const targetUserId = (games && games.length > 0) ? games[0].user_id : user?.id;
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
            if(document.getElementById('appContainer').classList.contains('hidden')) document.getElementById('loginOverlay').classList.remove('hidden');
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
        const userProfile = await GameService.getMyProfile(userId);
        
        const [games, stats, notifications, userLikes] = await Promise.all([
            GameService.fetchGames(userId),
            SocialService.getProfileStats(userId),
            SocialService.getNotifications(userId),
            SocialService.getUserLikes(userId)
        ]);
        appStore.setState({ games, profileStats: stats, notifications, userLikes, userProfile });
    } catch (e) { console.error("LoadData error:", e); }
};

const handleVisitorMode = async (nickname) => {
    const userId = await GameService.getUserIdByNickname(nickname);
    document.getElementById('globalLoader').classList.add('hidden');
    document.getElementById('loginOverlay').classList.add('hidden');
    
    if (userId) {
        document.getElementById('appContainer').classList.remove('hidden');
        const [games, stats] = await Promise.all([
            GameService.fetchSharedGames(userId),
            SocialService.getProfileStats(userId)
        ]);
        
        const { data: { session } } = await supabase.auth.getSession();
        let isFollowing = false;
        if (session?.user && session.user.id !== userId) {
            try { isFollowing = await SocialService.checkIsFollowing(session.user.id, userId); } catch (e) {}
        }

        appStore.setState({ games, profileStats: stats, isSharedMode: true, sharedProfileName: nickname, isFollowingCurrent: isFollowing });
    } else {
        alert("Perfil não encontrado!"); window.location.href = window.location.pathname;
    }
};

// CORREÇÃO: Listener global para a tecla ESC
const setupGlobalEvents = () => {
    const safeClick = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
    safeClick('btnGoogle', () => AuthService.signInGoogle());
    safeClick('btnCloseModal', () => toggleModal(false));
    safeClick('btnExport', () => exportData());

    document.addEventListener('click', (e) => {
        const { isNotificationsOpen } = appStore.get();
        const panel = document.getElementById('notifPanel');
        const btn = document.querySelector('button[title="Notificações"]');
        
        if(isNotificationsOpen && panel && !panel.contains(e.target) && (!btn || !btn.contains(e.target))) {
            appStore.setState({ isNotificationsOpen: false });
        }
    });

    // --- NOVO: FECHAR COM ESC ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = [
                'gameDetailModal', 'gameModal', 'rouletteModal', 'nicknameModal', 
                'networkModal', 'profileEditModal'
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
            if(!closedAny && isNotificationsOpen) {
                appStore.setState({ isNotificationsOpen: false });
            }
        }
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const clickedBtn = e.target.closest('.tab-btn');
            if(!clickedBtn) return;
            const tab = clickedBtn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            clickedBtn.classList.add('active');
            
            if (tab === 'feed') {
                try {
                    const feed = await SocialService.getGlobalFeed();
                    const { user } = appStore.get();
                    if(user) {
                        const likes = await SocialService.getUserLikes(user.id);
                        appStore.setState({ filter: 'feed', feedData: feed, userLikes: likes });
                    } else {
                        appStore.setState({ filter: 'feed', feedData: feed });
                    }
                } catch(err) { showToast("Erro no feed.", "error"); }
            } else {
                appStore.setState({ filter: tab });
            }
        });
    });

    const searchInput = document.getElementById('searchInput');
    if(searchInput) searchInput.addEventListener('input', (e) => appStore.setState({ searchTerm: e.target.value }));
    setupRoulette();
};

const setupAuthEvents = () => {
    document.getElementById('btnOpenAddModal').onclick = () => openGameModal();
    document.getElementById('gameForm').onsubmit = handleFormSubmit;
    document.getElementById('btnDeleteGame').onclick = handleDelete;
    
    const profileForm = document.getElementById('profileEditForm');
    if(profileForm) {
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
            } catch(err) { showToast("Erro ao salvar.", "error"); }
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
        } catch(err) { alert("Erro: " + err.message); }
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
        document.getElementById('btnDeleteGame').classList.remove('hidden');
        const game = appStore.get().games.find(g => g.id === gameId);
        if(game) {
            document.getElementById('inputGameName').value = game.title;
            const select = document.getElementById('inputPlatform');
            if(![...select.options].some(o => o.value === game.platform)) {
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
                    if(btn) btn.classList.add('active');
                });
                document.getElementById('inputTags').value = JSON.stringify(game.tags);
            }
            if(['Vendido', 'À venda'].includes(game.status)) document.getElementById('soldGroup').classList.remove('hidden');
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
    btn.innerText = "SALVANDO..."; btn.disabled = true;
    try {
        const data = {
            title: document.getElementById('inputGameName').value,
            platform: document.getElementById('inputPlatform').value || 'Outros',
            status: document.getElementById('inputStatus').value,
            price_paid: Number(document.getElementById('inputPrice').value) || 0,
            price_sold: Number(document.getElementById('inputSoldPrice').value) || 0,
            image_url: document.getElementById('inputImage').value,
            tags: JSON.parse(document.getElementById('inputTags').value || '[]')
        };
        if (editingId) await GameService.updateGame(editingId, data);
        else await GameService.addGame(data);
        showToast("Salvo!"); toggleModal(false);
        const { user } = appStore.get(); if(user) loadData(user.id);
    } catch (error) { showToast("Erro: " + error.message, "error"); } 
    finally { btn.innerText = oldText; btn.disabled = false; }
};

const handleDelete = async () => {
    if(confirm("Excluir jogo?")) {
        await GameService.deleteGame(editingId);
        toggleModal(false);
        const { user } = appStore.get(); if(user) loadData(user.id);
        showToast("Excluído.");
    }
};

const setupRawgSearch = () => {
    let timeout;
    const input = document.getElementById('inputGameName');
    const resultsDiv = document.getElementById('apiResults');
    if (!input) return;

    input.addEventListener('input', (e) => {
        clearTimeout(timeout);
        const query = e.target.value;
        if (query.length < 3) { resultsDiv.classList.add('hidden'); return; }

        timeout = setTimeout(async () => {
            resultsDiv.classList.remove('hidden');
            resultsDiv.innerHTML = '<div style="padding:10px; color:#666">...</div>';
            const games = await GameService.searchRawg(query);
            resultsDiv.innerHTML = '';
            if(games.length === 0) { resultsDiv.classList.add('hidden'); return; }

            games.forEach(g => {
                const el = document.createElement('div');
                el.className = 'api-item';
                el.innerHTML = `<img src="${g.background_image || ''}"><div class="api-info"><strong>${g.name}</strong></div>`;
                el.onclick = () => {
                    document.getElementById('inputGameName').value = g.name;
                    document.getElementById('inputImage').value = g.background_image;
                    resultsDiv.classList.add('hidden');
                    const select = document.getElementById('inputPlatform');
                    select.innerHTML = ''; 
                    const platforms = g.platforms || [];
                    if (platforms.length === 1) {
                        const opt = document.createElement('option'); opt.value = platforms[0].platform.name; opt.text = platforms[0].platform.name; opt.selected = true; select.appendChild(opt);
                    } else if (platforms.length > 1) {
                        const ph = document.createElement('option'); ph.text = "Selecione a versão..."; ph.disabled = true; ph.selected = true; select.appendChild(ph);
                        platforms.forEach(p => { const opt = document.createElement('option'); opt.value = p.platform.name; opt.text = p.platform.name; select.appendChild(opt); });
                    } else {
                        DEFAULT_PLATFORMS.forEach(p => { const opt = document.createElement('option'); opt.value = p; opt.text = p; select.appendChild(opt); });
                    }
                };
                resultsDiv.appendChild(el);
            });
        }, 600);
    });
    document.addEventListener('click', (e) => { if (!input.contains(e.target) && !resultsDiv.contains(e.target)) resultsDiv.classList.add('hidden'); });
};

document.addEventListener('DOMContentLoaded', init);