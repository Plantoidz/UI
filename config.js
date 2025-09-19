// Configuration file for Plantoid UI
export const INFURA_PROJECT_ID = "460f40a260564ac4a4f4b3fffb032dad";

// Network configurations
export const NETWORKS = {
    sepolia: {
        name: "Sepolia Testnet",
        chainId: 11155111,
        rpcUrl: `https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}`,
        plantoidAddress: "0x66078a2061A68d5bA6cDdBc81517837dA0C7d7b5",
        blockExplorer: "https://sepolia.etherscan.io",
        isTestnet: true
    },
    mainnet: {
        name: "Ethereum Mainnet",
        chainId: 1,
        rpcUrl: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
        plantoidAddress: "0x4073E38f71b2612580E9e381031B0c38B3B4C27E",
        blockExplorer: "https://etherscan.io",
        isTestnet: false
    }
};

// Default network (can be changed)
export const DEFAULT_NETWORK = "mainnet";

// Rate limiting configuration for NFT loading
export const RATE_LIMIT_CONFIG = {
    maxConcurrent: 3,        // Maximum concurrent requests to Infura
    delayBetweenBatches: 1000, // Milliseconds between batches
    batchSize: 5,            // NFTs per batch
    retryDelay: 2000,        // Delay before retrying failed requests
    randomDelay: 200         // Max random delay to spread requests
};