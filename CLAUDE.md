# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plantoid 15 is a blockchain-based autonomous art project that creates self-reproducing digital life-forms. It combines Ethereum smart contracts, NFT artwork generation, and decentralized governance.

## Development Commands

This is a static web application with no build process required. Available npm scripts:

- `npm run claude-code` - Run Claude Code in Docker sandbox
- `npm run claude-code:unrestricted` - Run Claude Code with unrestricted permissions
- No build/lint/test commands configured - serve files directly

To run locally:
```bash
# Serve files with any static web server, e.g.:
python -m http.server 8000
# or
npx serve .
```

## Setup Instructions

### 1. Configure Infura
The application uses Infura for read-only blockchain operations. To set up:

1. Sign up for a free account at https://infura.io/
2. Create a new project
3. Copy your Project ID
4. Edit `config.js` and replace `YOUR_INFURA_PROJECT_ID` with your actual Project ID

### 2. Alternative: Use without Infura
If you don't set up Infura, the app will fall back to using MetaMask's provider, but users will need to connect their wallet before seeing any blockchain data.

## Architecture

### File Structure
- `index.html` - Main entry point, contains all UI elements
- `gallery.html` - NFT gallery page showing all minted seeds
- `modules/web3utils.js` - Web3/blockchain integration logic
- `modules/gallery.js` - Gallery page functionality for loading and displaying NFTs
- `config.js` - Configuration file for Infura Project ID
- `plantoid.css` - Main styling with dark theme and glassmorphism effects
- `gallery.css` - Gallery-specific styles
- `abis/Plantoid.json` - Smart contract ABI for blockchain interaction

### Technology Stack
- Frontend: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- Web3: Ethers.js v6.7.0 (loaded via CDN)
- Blockchain Provider: Infura (read-only) + MetaMask (transactions)
- Networks: Sepolia Testnet & Ethereum Mainnet
- Contracts: 
  - Sepolia: 0x66078a2061A68d5bA6cDdBc81517837dA0C7d7b5
  - Mainnet: 0x4073E38f71b2612580E9e381031B0c38B3B4C27E

### Assets
- `assets/P15.png` - Plantoid logo/image
- `assets/header2.png` - Header background image

### Key Functionality

The web interface allows users to:
1. **Switch networks** - Toggle between Sepolia Testnet and Ethereum Mainnet
2. **View blockchain data immediately** - No wallet connection required (via Infura)
3. **Connect MetaMask wallet** - For transactions only
4. **View Plantoid statistics** - seed count, balance, artist address
5. **Feed the Plantoid** - Send ETH to receive NFT seeds
   - Sepolia: 0.001 ETH
   - Mainnet: 0.01 ETH
6. **View NFT Gallery** - Browse all minted Plantoid seeds with images and metadata
7. **Participate in governance** - Vote on proposals and artist selection

### Smart Contract Interface

Key contract functions (from ABI):
- NFT minting and management (ERC-721 compliant)
- Governance system (proposals, voting, delegation)
- Fund distribution and artist selection
- Content revelation for NFT holders

## Development Guidelines

When modifying this codebase:
1. Maintain the static nature - no build process needed
2. Test Web3 functionality on Sepolia testnet
3. Preserve the dark/futuristic design aesthetic
4. Ensure MetaMask compatibility
5. Keep the single-page application structure
6. Use ES6 modules for JavaScript organization
7. All Web3 logic should be in `modules/web3utils.js`

### Common Web3 Operations

```javascript
// Switch network
await switchNetwork('mainnet'); // or 'sepolia'

// Get current network info
const networkInfo = getCurrentNetworkInfo();
console.log(networkInfo.name, networkInfo.plantoidAddress);

// Connect wallet (automatically switches MetaMask to correct network)
const address = await handleConnectWallet();

// Feed the Plantoid (amount is automatically determined by network)
// Sepolia: 0.001 ETH, Mainnet: 0.01 ETH
await feedPlantoid();

// Read contract data (works without wallet connection)
// Data is automatically loaded for the selected network
```

## Testing

Currently no automated tests. Manual testing checklist:

#### Network Switching
- [ ] Network selector dropdown functions correctly
- [ ] Data updates when switching networks
- [ ] Network indicator shows correct status (testnet/mainnet)
- [ ] Contract addresses update properly

#### Sepolia Testnet
- [ ] MetaMask connection and network switching
- [ ] Contract data fetching (artist, balance, seed count)
- [ ] Feed transaction with 0.001 ETH
- [ ] Transaction confirmation and balance update

#### Ethereum Mainnet
- [ ] Mainnet data loads correctly
- [ ] Contract address matches: 0x4073E38f71b2612580E9e381031B0c38B3B4C27E
- [ ] MetaMask switches to mainnet for transactions
- [ ] Real ETH transaction warnings

#### General
- [ ] Wallet address display after connection
- [ ] Error handling for rejected transactions
- [ ] Responsive design on mobile/tablet/desktop
- [ ] Console errors check

### Network Setup
#### Sepolia Testnet
1. Add Sepolia to MetaMask: https://chainlist.org/chain/11155111
2. Get test ETH from faucet: https://sepoliafaucet.com/

#### Ethereum Mainnet
1. Ensure sufficient ETH balance for transactions
2. Be cautious - this uses real ETH!