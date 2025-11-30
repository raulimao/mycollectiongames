// Simple Pub/Sub Store
class Store {
    constructor() {
        this.state = {
            user: null,
            games: [],
            filter: 'all', // all, backlog, sold
            searchTerm: ''
        };
        this.listeners = [];
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
    
    get() { return this.state; }
}

export const appStore = new Store();