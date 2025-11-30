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
            activePlatform: null, // NOVO: Filtro vindo do gráfico
            chartMode: 'platform' // NOVO: platform | status | cost
        };
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }
    
    reset() {
        this.state = this.getInitialState();
        this.notify();
    }
    
    get() { return this.state; }
}

export const appStore = new Store();