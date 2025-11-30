import { getInitialData } from './data.js';

const DB_KEY = 'my_game_collection_v1';

export const Storage = {
    // Carrega dados. Se vazio, carrega do data.js
    getAll: () => {
        const data = localStorage.getItem(DB_KEY);
        if (!data) {
            const initial = getInitialData();
            localStorage.setItem(DB_KEY, JSON.stringify(initial));
            return initial;
        }
        return JSON.parse(data);
    },

    // Salva o array inteiro
    saveAll: (data) => {
        localStorage.setItem(DB_KEY, JSON.stringify(data));
    },

    // Adiciona ou Atualiza um item
    saveItem: (item) => {
        const data = Storage.getAll();
        const index = data.findIndex(i => i.id === item.id);
        
        if (index >= 0) {
            data[index] = item; // Atualiza
        } else {
            data.push(item); // Cria novo
        }
        
        Storage.saveAll(data);
        return data;
    },

    // Remove item
    deleteItem: (id) => {
        const data = Storage.getAll();
        const newData = data.filter(i => i.id !== id);
        Storage.saveAll(newData);
        return newData;
    }
};