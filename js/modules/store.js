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

export const appStore = new Store();    