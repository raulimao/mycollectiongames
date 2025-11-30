// Gerenciador de Estado (Pub/Sub Pattern)
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
            searchTerm: ''
        };
    }

    subscribe(listener) {
        this.listeners.push(listener);
        // Opcional: Chama o listener imediatamente com o estado atual
        // listener(this.state); 
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        // console.log('State Updated:', this.state); // Descomente para debug
        this.notify();
    }
    
    // Reseta o estado (útil para logout)
    reset() {
        this.state = this.getInitialState();
        this.notify();
    }
    
    get() { return this.state; }
}

export const appStore = new Store();