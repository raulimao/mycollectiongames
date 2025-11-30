// --- js/data.js ---

// Função auxiliar para criar IDs únicos (necessário para o CRUD funcionar)
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// Dados do arquivo Colecao.csv
const rawCollection = [
    { jogo: "GameSir G8 Galileo", tipo: "Controle", plataforma: "Android", preco: 345.59, status: "À venda" },
    { jogo: "Animal Crossing", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 235.5, status: "Coleção" },
    { jogo: "Astral Chain", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 237.74, status: "Coleção" },
    { jogo: "Donkey Kong Country Tropical Freeze", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 283.5, status: "Coleção" },
    { jogo: "Fire Emblem Warriors: Three Hopes", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 161.4, status: "À venda" },
    { jogo: "Hyrule Warriors: Age of Calamity", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 215.85, status: "Coleção" },
    { jogo: "Mario + Rabbids Kingdom Battle", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 152.26, status: "À venda" },
    { jogo: "Mario + Rabbids Sparks of Hope", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 144.38, status: "À venda" },
    { jogo: "Mario e Sonic Olympic Games", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 162.85, status: "À venda" },
    { jogo: "Mario Party Jamboree", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 235.6, status: "Coleção" },
    { jogo: "Metroid Dread", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 205.25, status: "Coleção" },
    { jogo: "Pokemon Legends Arceus", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 249.45, status: "Coleção" },
    { jogo: "Pokemon Lets Go Pikachu", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 256.59, status: "Coleção" },
    { jogo: "Pokemon Shinning Pearl", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 212, status: "Coleção" },
    { jogo: "Splatoon 3", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 212, status: "Coleção" },
    { jogo: "Super Mario 3D All Stars", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 800, status: "Coleção" },
    { jogo: "Super Mario 3D World + Bowser's Fury", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 267.4, status: "Coleção" },
    { jogo: "Super Mario Galaxy", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 222.77, status: "Coleção" },
    { jogo: "Super Mario Maker 2", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 172, status: "Coleção" },
    { jogo: "Super Mario RPG", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 214.4, status: "Coleção" },
    { jogo: "The Legend of Zelda: Breath of the Wild", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 201.38, status: "Coleção" },
    { jogo: "The Legend of Zelda: Skyward Sword HD", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 210.55, status: "Coleção" },
    { jogo: "The Legend of Zelda: Tears of the Kingdom", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 278, status: "Coleção" },
    { jogo: "Xenoblade Chronicles 3 Std Edition", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 229.45, status: "Coleção" },
    { jogo: "Yoshi Crafted World", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 243.97, status: "Coleção" },
    { jogo: "Chrono Cross", tipo: "Jogo", plataforma: "Playstation 1", preco: 109.69, status: "Importado" },
    { jogo: "Shrek Treasure Hunt", tipo: "Jogo", plataforma: "Playstation 1", preco: 81.87, status: "Importado" },
    { jogo: "Crash Nitro Kart", tipo: "Jogo", plataforma: "Playstation 2", preco: 34.3, status: "Importado" },
    { jogo: "Guitar Hero", tipo: "Jogo", plataforma: "Playstation 2", preco: 57.81, status: "Importado" },
    { jogo: "Jak II", tipo: "Jogo", plataforma: "Playstation 2", preco: 40.57, status: "Importado" },
    { jogo: "Playstation 2 Slim", tipo: "Console", plataforma: "Playstation 2", preco: 600, status: "Coleção" },
    { jogo: "Shin Megami Tensei Nocturne", tipo: "Jogo", plataforma: "Playstation 2", preco: 250, status: "Coleção" },
    { jogo: "The Lord of the Rings The Third Age", tipo: "Jogo", plataforma: "Playstation 2", preco: 75.34, status: "Importado" },
    { jogo: "The Lord of the Rings Two Towers", tipo: "Jogo", plataforma: "Playstation 2", preco: 75.34, status: "Importado" },
    { jogo: "Yakuza", tipo: "Jogo", plataforma: "Playstation 2", preco: 250, status: "Coleção" },
    { jogo: "Yakuza 2", tipo: "Jogo", plataforma: "Playstation 2", preco: 250, status: "Coleção" },
    { jogo: "Bioshock 2", tipo: "Jogo", plataforma: "Playstation 3", preco: 38.14, status: "Importado" },
    { jogo: "Playstation 3 Slim", tipo: "Console", plataforma: "Playstation 3", preco: 2900, status: "Coleção" },
    { jogo: "Switch Oled", tipo: "Console", plataforma: "Switch", preco: 2494.26, status: "À venda" },
    { jogo: "Switch 2", tipo: "Console", plataforma: "Switch 2", preco: 4999, status: "Coleção" },
    { jogo: "Xbox One", tipo: "Console", plataforma: "Xbox One", preco: 500, status: "Coleção" },
    { jogo: "Xbox Series S", tipo: "Console", plataforma: "Xbox Series S", preco: 2501.78, status: "À venda" },
    { jogo: "GameSir G7 SE", tipo: "Controle", plataforma: "Xbox", preco: 332.05, status: "Coleção" },
    { jogo: "Mario & Luigi: Brothership", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 240.11, status: "Coleção" },
    { jogo: "Super Mario Odyssey", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 257.89, status: "Coleção" }
];

// Dados do arquivo Vendidos.csv
const rawSold = [
    { jogo: "Luigi's Mansion 2 HD", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 215.86, vendido: 240, lucro: 24.14, status: "Vendido" },
    { jogo: "Metroid Prime Remastered", tipo: "Jogo", plataforma: "Nintendo Switch", preco: 214.19, vendido: 230, lucro: 15.81, status: "Vendido" }
];

// Esta função processa os dados brutos para o formato da aplicação
// Ela é chamada apenas se o LocalStorage estiver vazio
export const getInitialData = () => {
    // 1. Processa Coleção
    const collectionItems = rawCollection.map(item => ({
        ...item,
        id: generateId(),
        vendido: 0,
        lucro: 0,
        imagem: "" // URL da imagem vazia inicialmente
    }));

    // 2. Processa Vendidos
    const soldItems = rawSold.map(item => ({
        ...item,
        id: generateId(),
        status: "Vendido", // Força o status correto
        imagem: ""
    }));

    // 3. Retorna array unificado
    return [...collectionItems, ...soldItems];
};