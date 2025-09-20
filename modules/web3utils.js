import { NETWORKS, DEFAULT_NETWORK, PLANTOID_CONFIG, NETWORK_STORAGE } from "../config.js";

let currentNetwork = NETWORK_STORAGE.get();
let readProvider = null;
let walletProvider = null;
let signer = null;
let isWalletConnected = false;

// Check if wallet was previously connected
async function checkExistingWalletConnection() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });

      if (accounts.length > 0) {
        console.log("🔗 Found existing wallet connection");
        walletProvider = new ethers.BrowserProvider(window.ethereum);
        signer = await walletProvider.getSigner();
        isWalletConnected = true;

        // Update UI elements if they exist
        const connectButton = document.getElementById("connect-wallet");
        if (connectButton) {
          const address = await signer.getAddress();
          const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
          connectButton.textContent = shortAddress;
          connectButton.style.background =
            "linear-gradient(45deg, #16a085, #27ae60)";
        }

        // Load user seeds
        await loadUserSeeds();

        return true;
      }
    } catch (error) {
      console.log("No existing wallet connection found");
    }
  }
  return false;
}

// Minimal ABI for balanceOf function
const plantoidABI = [
  "function balanceOf(address owner) public view returns (uint256)",
];

// Get current network configuration
function getCurrentNetworkConfig() {
  return NETWORKS[currentNetwork];
}

// Initialize read-only provider for current network
async function initializeReadProvider() {
  try {
    const networkConfig = getCurrentNetworkConfig();
    readProvider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

    // Load blockchain data using Infura
    await loadBlockchainData(readProvider);

    console.log(`Read-only provider initialized for ${networkConfig.name}`);
  } catch (error) {
    console.error("Error initializing read provider:", error);
    // Fallback to trying MetaMask if Infura fails
    if (window.ethereum) {
      readProvider = new ethers.BrowserProvider(window.ethereum);
      await loadBlockchainData(readProvider);
    }
  }
}

// Load blockchain data with any provider
async function loadBlockchainData(provider) {
  try {
    const networkConfig = getCurrentNetworkConfig();
    const contractAddress = networkConfig.plantoidAddress;

    const contractABI = [
      "function totalSupply() public view returns (uint256)",
      "function artist() public view returns (address)",
    ];

    // Create a contract instance
    const contract = new ethers.Contract(
      contractAddress,
      contractABI,
      provider
    );

    // Check if there's code at the address
    const code = await provider.getCode(contractAddress);
    console.log("Contract code:", code);
    // Should return bytecode, not '0x'

    // Fetch data from the contract
    const seeds = await contract.totalSupply();
    document.querySelector("#total-seeds").textContent = seeds.toString();

    // Get the current balance of the contract
    const balanceWei = await provider.getBalance(contractAddress);
    const balanceEther = ethers.formatEther(balanceWei);

    // Limit to max 10 decimal places
    const balanceFormatted = parseFloat(balanceEther).toFixed(10);
    // Remove trailing zeros after decimal point
    const balanceDisplay = parseFloat(balanceFormatted).toString();

    console.log(`Balance: ${balanceDisplay} ETH`);

    document.getElementById(
      "current-balance"
    ).textContent = `${balanceDisplay} ETH`;

    // Update contract address display
    const formattedAddress = `${contractAddress.slice(
      0,
      6
    )}...${contractAddress.slice(-4)}`;
    const contractAddressElement = document.getElementById("contract-address");
    contractAddressElement.textContent = formattedAddress;

    // Update click handler for contract address
    contractAddressElement.onclick = () => {
      navigator.clipboard
        .writeText(contractAddress)
        .then(() => {
          alert("Contract address copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy: ", err);
        });
    };

    // Add click to view on block explorer
    contractAddressElement.style.cursor = "pointer";
    contractAddressElement.title = `Click to copy address or view on ${networkConfig.blockExplorer}`;

    const artist = await contract.artist();
    const formattedArtist = `${artist.slice(0, 6)}...${artist.slice(-4)}`;
    const artistAddressElement = document.getElementById("artist-address");
    artistAddressElement.textContent = formattedArtist;

    // Update click handler for artist address
    artistAddressElement.onclick = () => {
      navigator.clipboard
        .writeText(artist)
        .then(() => {
          alert("Artist address copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy: ", err);
        });
    };

    artistAddressElement.style.cursor = "pointer";
    artistAddressElement.title = "Click to copy artist address";

    // Update network indicator
    updateNetworkIndicator();

    // Load user's seeds if wallet is connected
    await loadUserSeeds();
  } catch (error) {
    console.error("Error loading blockchain data:", error);
    // Display error message to user
    document.querySelector("#total-seeds").textContent = "Error loading";
    document.getElementById("current-balance").textContent = "Error loading";
  }
}

// Load user's seed balance
async function loadUserSeeds() {
  console.log("🌱 Loading user seeds...");
  const yourSeedsElement = document.getElementById("your-seeds");
  if (!yourSeedsElement) {
    console.log("❌ your-seeds element not found");
    return;
  }

  console.log("🔗 Wallet connected?", isWalletConnected, "Signer?", !!signer);

  if (isWalletConnected && signer) {
    try {
      const userAddress = await signer.getAddress();
      console.log("👤 User address:", userAddress);

      const networkConfig = getCurrentNetworkConfig();
      const provider = readProvider || walletProvider;
      const contract = new ethers.Contract(
        networkConfig.plantoidAddress,
        plantoidABI,
        provider
      );

      // Get user's balance of NFTs
      const balance = await contract.balanceOf(userAddress);
      yourSeedsElement.textContent = balance.toString();

      console.log(`✅ User ${userAddress} owns ${balance} seeds`);
    } catch (error) {
      console.error("❌ Error loading user seeds:", error);
      yourSeedsElement.textContent = "0";
    }
  } else {
    console.log("⚠️ Wallet not connected, showing default message");
    yourSeedsElement.textContent = "Connect wallet to see";
  }
}

// Update network indicator in UI
function updateNetworkIndicator() {
  const networkConfig = getCurrentNetworkConfig();
  const networkIndicator = document.getElementById("network-indicator");
  if (networkIndicator) {
    networkIndicator.textContent = networkConfig.name;
    networkIndicator.className = `network-indicator ${
      networkConfig.isTestnet ? "testnet" : "mainnet"
    }`;
  }
}

// Switch network
export async function switchNetwork(networkKey) {
  if (!NETWORKS[networkKey]) {
    console.error(`Network ${networkKey} not found`);
    return false;
  }

  currentNetwork = networkKey;
  
  // Save network preference to localStorage
  NETWORK_STORAGE.set(networkKey);

  // Reinitialize read provider for new network
  await initializeReadProvider();

  // If wallet is connected, check if it's on the correct network
  if (isWalletConnected && walletProvider) {
    const walletNetwork = await walletProvider.getNetwork();
    const targetNetwork = getCurrentNetworkConfig();

    if (walletNetwork.chainId !== BigInt(targetNetwork.chainId)) {
      // Attempt to switch wallet network
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${targetNetwork.chainId.toString(16)}` }],
        });
      } catch (error) {
        console.error("Error switching wallet network:", error);
        alert(`Please manually switch your wallet to ${targetNetwork.name}`);
      }
    }
  }

  return true;
}

// Connect wallet for transactions
async function connectWallet() {
  if (!window.ethereum) {
    alert("Please install MetaMask!");
    return false;
  }

  try {
    walletProvider = new ethers.BrowserProvider(window.ethereum);

    // Request account access
    await walletProvider.send("eth_requestAccounts", []);
    signer = await walletProvider.getSigner();

    // Check if on correct network
    const network = await walletProvider.getNetwork();
    const targetNetwork = getCurrentNetworkConfig();

    console.log(
      `Wallet connected to network: ${network.chainId}, target: ${targetNetwork.chainId}`
    );

    // Verify we're on the correct network
    if (network.chainId !== BigInt(targetNetwork.chainId)) {
      // Try to switch network
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${targetNetwork.chainId.toString(16)}` }],
        });
        // Re-get network info after switch
        const newNetwork = await walletProvider.getNetwork();
        if (newNetwork.chainId !== BigInt(targetNetwork.chainId)) {
          alert(`Please switch to ${targetNetwork.name} in MetaMask!`);
          return false;
        }
      } catch (error) {
        console.error("Error switching network:", error);
        alert(`Please manually switch your wallet to ${targetNetwork.name}`);
        return false;
      }
    }

    isWalletConnected = true;
    console.log(
      "✅ Wallet connection successful, isWalletConnected:",
      isWalletConnected
    );
    console.log("✅ Signer:", !!signer);

    // Load user's seeds after successful connection
    console.log("🌱 Calling loadUserSeeds from connectWallet...");
    await loadUserSeeds();

    return true;
  } catch (error) {
    console.error("Error connecting wallet:", error);
    return false;
  }
}

export async function feedPlantoid(amount) {
  try {
    // Ensure wallet is connected
    if (!isWalletConnected || !signer) {
      const connected = await connectWallet();
      if (!connected) {
        alert("Please connect your wallet first!");
        return;
      }
    }

    const networkConfig = getCurrentNetworkConfig();

    // Define the transaction
    const tx = {
      to: networkConfig.plantoidAddress,
      value: ethers.parseEther(amount),
    };

    console.log("Sending transaction with signer:", signer);

    // Send the transaction
    const transactionResponse = await signer.sendTransaction(tx);
    console.log("Transaction sent:", transactionResponse);

    // Wait for the transaction to be mined
    await transactionResponse.wait();
    console.log("Transaction mined:", transactionResponse);

    // Refresh the balance after transaction
    await loadBlockchainData(readProvider || walletProvider);

    console.log("✅ Transaction successful!");
  } catch (error) {
    console.error("❌ Error sending transaction:", error);
  }
}

// Add a connect wallet button handler
export async function handleConnectWallet() {
  console.log("🔗 handleConnectWallet called");
  const connected = await connectWallet();
  console.log("🔗 Connected result:", connected);
  if (connected) {
    const address = await signer.getAddress();
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    console.log("🔗 Wallet connected, calling loadUserSeeds...");
    await loadUserSeeds();
    return shortAddress;
  }
  return null;
}

// Get current network info for UI
export function getCurrentNetworkInfo() {
  return getCurrentNetworkConfig();
}

// Get all available networks
export function getAvailableNetworks() {
  return NETWORKS;
}

// Initialize on page load
async function initialize() {
  await initializeReadProvider();
  await checkExistingWalletConnection();
  
  // Set correct network in dropdown to match saved preference
  const networkSelect = document.getElementById("network-select");
  if (networkSelect) {
    networkSelect.value = currentNetwork;
  }
  
  // Update network indicator to match current network
  updateNetworkIndicator();
}

initialize();

// Set up periodic refresh of data (every 30 seconds)
setInterval(async () => {
  if (readProvider) {
    await loadBlockchainData(readProvider);
  }
}, 30000);
