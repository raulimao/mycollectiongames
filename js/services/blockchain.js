import { supabase } from './supabase.js';

// --- GAMEVAULT CLOUD BLOCKCHAIN ---
// A persistent blockchain ledger stored on Supabase.

export class Block {
    constructor(index, timestamp, data, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data; // { owner, cardType, stats, platform, date, signature, tier }
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
        this.nonce = 0;
    }

    calculateHash() {
        return CryptoJS.SHA256(this.index + this.previousHash + this.timestamp + JSON.stringify(this.data) + this.nonce).toString();
    }

    // Proof of Work (Basic Mining)
    mineBlock(difficulty) {
        while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
    }
}

export class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 2; // Low difficulty
        this.initialized = false;
        // removing synchronous loadChain()
    }

    createGenesisBlock() {
        return new Block(0, "2024-01-01", "Genesis Block - GameVault Ledger", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    // Initialize: Load from Cloud or Sync Local
    async init() {
        if (this.initialized) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // Not logged in

        try {
            // 1. Try Fetch from Supabase
            const { data, error } = await supabase
                .from('ledger')
                .select('*')
                .eq('user_id', user.id)
                .order('index', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                // Cloud Data Exists -> Use it
                this.chain = data.map(row => {
                    const b = new Block(row.index, row.timestamp, row.data, row.previous_hash);
                    b.hash = row.hash;
                    b.nonce = row.nonce;
                    return b;
                });
                console.log("☁️ Blockchain Loaded from Cloud:", this.chain.length);
            } else {
                // Cloud Empty -> Check LocalStorage (Migration)
                const local = localStorage.getItem('gameVaultChainV2');
                if (local) {
                    const parsed = JSON.parse(local);
                    if (parsed.length > 1) { // More than Genesis
                        console.log("🔄 Migrating Local Blockchain to Cloud...");
                        await this.migrateChain(parsed, user.id);
                    }
                }
            }
            this.initialized = true;
        } catch (e) {
            console.error("Blockchain Init Error:", e);
        }
    }

    async migrateChain(localChain, userId) {
        // Upload all local blocks to Supabase
        // Skip Genesis (index 0) if we want to enforce standard genesis, 
        // but user might have custom data. Let's upload all except duplicated Genesis (?)
        // Actually, just upload everything that looks valid.

        const rows = localChain.map(b => ({
            user_id: userId,
            index: b.index,
            hash: b.hash,
            previous_hash: b.previousHash,
            data: b.data,
            nonce: b.nonce,
            timestamp: b.timestamp
        }));

        const { error } = await supabase.from('ledger').insert(rows);
        if (!error) {
            this.chain = localChain;
            // Clear local storage after success to prevent user mixing
            localStorage.removeItem(this.storageKey);
            console.log("✅ Migration Success!");
        } else {
            console.error("Migration Failed:", error);
        }
    }

    async addBlock(data) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not logged in");

        const latestInfo = this.getLatestBlock();
        const newBlock = new Block(
            this.chain.length,
            new Date().toISOString(),
            data,
            latestInfo.hash
        );

        // Mine
        console.log("⛏️ Mining Block...");
        newBlock.mineBlock(this.difficulty);

        // Save to Cloud
        const row = {
            user_id: user.id,
            index: newBlock.index,
            hash: newBlock.hash,
            previous_hash: newBlock.previousHash,
            data: newBlock.data,
            nonce: newBlock.nonce,
            timestamp: newBlock.timestamp
        };

        const { error } = await supabase.from('ledger').insert([row]);
        if (error) {
            console.error("Cloud Save Failed:", error);
            throw error;
        }

        this.chain.push(newBlock);
        return newBlock;
    }

    // Helper to get Explorer Data (Sync because chain is in-memory after init)
    getExplorerData() {
        return this.chain.map(b => ({
            height: b.index,
            hash: b.hash,
            prev: b.previousHash ? b.previousHash.substring(0, 10) + '...' : 'GENESIS',
            time: b.timestamp.split('T')[0],
            data: b.data
        })).reverse();
    }


}

export const GameChain = new Blockchain();

// Helper function to load blockchain data for any user (for visitor profiles)
export const loadBlockchainData = async (userId) => {
    if (!userId) return { blocks: [] };

    try {
        const { data, error } = await supabase
            .from('ledger')
            .select('*')
            .eq('user_id', userId)
            .order('index', { ascending: true });

        if (error) {
            console.error('Error loading blockchain for user:', error);
            return { blocks: [] };
        }

        return {
            blocks: data || [],
            count: data?.length || 0
        };
    } catch (e) {
        console.error('Failed to load blockchain:', e);
        return { blocks: [] };
    }
};
