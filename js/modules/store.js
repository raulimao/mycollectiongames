/**
 * Gerenciador de Estado Centralizado (Observer Pattern)
 */
class Store {
    constructor() {
        this.state = this.getInitialState();
        this.listeners = [];
    }

    getInitialState() {
        return {
            user: null,
            userProfile: null, // Dados completos do perfil (avatar, etc)
            games: [],
            // 'allGamesStats' holds the complete list of games (lightweight) for charts, totals AND NOW for client-side pagination.
            allGamesStats: [],
            paginationLimit: 16, // Controls how many items are visible in the grid

            // --- DADOS SOCIAIS ---
            feedData: [],
            userLikes: [],
            notifications: [],
            profileStats: { followers_count: 0, following_count: 0, games_count: 0 },
            isFollowingCurrent: false,
            isNotificationsOpen: false, // NOVO: Controla se o painel está visível

            // --- DADOS DE UI ---
            filter: 'collection',
            searchTerm: '',
            activePlatform: null,
            chartMode: 'platform',
            isSharedMode: false,
            sharedProfileName: ''
        };
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    setState(newState) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...newState };
        this.listeners.forEach(listener => listener(this.state, prevState));
    }

    reset() {
        this.state = this.getInitialState();
        this.notify();
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    get() {
        return { ...this.state };
    }
}

// --- CONSTANTS ---
export const GAME_STATUS = {
    PLAYING: 'Jogando',
    BACKLOG: 'Backlog',
    COMPLETED: 'Jogo Zerado',
    PLATINUM: 'Platinado',
    WISHLIST: 'Desejado',
    SOLD: 'Vendido',
    FOR_SALE: 'À venda',
    DROPPED: 'Abandonado'
};

export const appStore = new Store();