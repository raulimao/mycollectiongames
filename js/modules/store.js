// Gerenciador de Estado Simples (Pub/Sub)
class Store {
    constructor() {
        this.state = {
            user: null,
            games: [],
            filter: 'collection', // collection | backlog | sold
            searchTerm: ''
        };
        this.listeners = [];
    }

    // Inscreve uma função para ser chamada quando o estado mudar
    subscribe(listener) {
        this.listeners.push(listener);
    }

    // Notifica todos os ouvintes
    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    // Atualiza o estado e notifica
    setState(newState) {
        this.state = { ...this.state, ...newState };
        console.log('State Updated:', this.state); // Debug
        this.notify();
    }
    
    get() { return this.state; }
}

export const appStore = new Store();