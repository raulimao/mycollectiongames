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
            games: [],
            filter: 'collection', // collection | backlog | sold
            searchTerm: '',
            activePlatform: null,
            chartMode: 'platform',
            isSharedMode: false,
            sharedProfileName: ''
        };
    }

    /**
     * Inscreve uma função para ser notificada quando o estado mudar
     * @param {Function} listener 
     */
    subscribe(listener) {
        this.listeners.push(listener);
    }

    /**
     * Atualiza o estado e notifica os ouvintes
     * @param {Object} newState - Parte do estado a ser atualizada
     */
    setState(newState) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        // Notifica listeners passando estado novo e antigo
        this.listeners.forEach(listener => listener(this.state, prevState));
    }
    
    /**
     * Reseta o estado (ex: Logout)
     */
    reset() {
        this.state = this.getInitialState();
        this.notify();
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
    
    /**
     * Retorna uma cópia do estado atual
     */
    get() { 
        return { ...this.state }; 
    }
}

export const appStore = new Store();