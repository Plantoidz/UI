import {
  getNetworks,
  getPlantoidConfig,
  DEFAULT_NETWORK,
  NETWORK_STORAGE,
  hasExplicitSelection,
} from "./plantoid-resolver.js";

let NETWORKS = null;
let PLANTOID_CONFIG = null;

let currentNetwork = NETWORK_STORAGE.get();
let readProvider = null;
let walletProvider = null;
let signer = null;
let isWalletConnected = false;

const plantoidABI = [
  "function balanceOf(address owner) public view returns (uint256)",
];

function getCurrentNetworkConfig() {
  return NETWORKS[currentNetwork];
}

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

        const connectButton = document.getElementById("connect-wallet");
        if (connectButton) {
          const address = await signer.getAddress();
          const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
          connectButton.textContent = shortAddress;
          connectButton.classList.add("connected");
        }

        await loadUserSeeds();
        return true;
      }
    } catch (error) {
      console.log("No existing wallet connection found");
    }
  }
  return false;
}

async function initializeReadProvider() {
  try {
    const networkConfig = getCurrentNetworkConfig();
    readProvider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    await loadBlockchainData(readProvider);
    console.log(`Read-only provider initialized for ${networkConfig.name}`);
  } catch (error) {
    console.error("Error initializing read provider:", error);
    if (window.ethereum) {
      readProvider = new ethers.BrowserProvider(window.ethereum);
      await loadBlockchainData(readProvider);
    }
  }
}

async function loadBlockchainData(provider) {
  try {
    const networkConfig = getCurrentNetworkConfig();
    const contractAddress = networkConfig.plantoidAddress;

    const contractABI = [
      "function totalSupply() public view returns (uint256)",
      "function artist() public view returns (address)",
    ];

    const contract = new ethers.Contract(contractAddress, contractABI, provider);

    const code = await provider.getCode(contractAddress);
    console.log("Contract code:", code);

    const seeds = await contract.totalSupply();
    const totalSeedsEl = document.querySelector("#total-seeds");
    if (totalSeedsEl) totalSeedsEl.textContent = seeds.toString();

    const balanceWei = await provider.getBalance(contractAddress);
    const balanceEther = ethers.formatEther(balanceWei);
    const balanceFormatted = parseFloat(balanceEther).toFixed(10);
    const balanceDisplay = parseFloat(balanceFormatted).toString();
    const currentBalanceEl = document.getElementById("current-balance");
    if (currentBalanceEl) currentBalanceEl.textContent = `${balanceDisplay} ETH`;

    const formattedAddress = `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}`;
    const contractAddressElement = document.getElementById("contract-address");
    if (contractAddressElement) {
      contractAddressElement.textContent = formattedAddress;
      contractAddressElement.onclick = () => {
        navigator.clipboard
          .writeText(contractAddress)
          .then(() => alert("Contract address copied to clipboard!"))
          .catch((err) => console.error("Failed to copy: ", err));
      };
      contractAddressElement.style.cursor = "pointer";
      contractAddressElement.title = `Click to copy address or view on ${networkConfig.blockExplorer}`;
    }

    try {
      const artist = await contract.artist();
      const formattedArtist = `${artist.slice(0, 6)}...${artist.slice(-4)}`;
      const artistAddressElement = document.getElementById("artist-address");
      if (artistAddressElement) {
        artistAddressElement.textContent = formattedArtist;
        artistAddressElement.onclick = () => {
          navigator.clipboard
            .writeText(artist)
            .then(() => alert("Artist address copied to clipboard!"))
            .catch((err) => console.error("Failed to copy: ", err));
        };
        artistAddressElement.style.cursor = "pointer";
        artistAddressElement.title = "Click to copy artist address";
      }
    } catch (e) {
      // artist() not exposed on every contract — silently ignore
    }

    updateNetworkIndicator();
    await loadUserSeeds();
  } catch (error) {
    console.error("Error loading blockchain data:", error);
    const totalSeedsEl = document.querySelector("#total-seeds");
    if (totalSeedsEl) totalSeedsEl.textContent = "Error loading";
    const currentBalanceEl = document.getElementById("current-balance");
    if (currentBalanceEl) currentBalanceEl.textContent = "Error loading";
  }
}

async function loadUserSeeds() {
  const yourSeedsElement = document.getElementById("your-seeds");
  if (!yourSeedsElement) return;

  if (isWalletConnected && signer) {
    try {
      const userAddress = await signer.getAddress();
      const networkConfig = getCurrentNetworkConfig();
      const provider = readProvider || walletProvider;
      const contract = new ethers.Contract(
        networkConfig.plantoidAddress,
        plantoidABI,
        provider
      );
      const balance = await contract.balanceOf(userAddress);
      yourSeedsElement.textContent = balance.toString();
    } catch (error) {
      console.error("❌ Error loading user seeds:", error);
      yourSeedsElement.textContent = "0";
    }
  } else {
    yourSeedsElement.textContent = "Connect wallet to see";
  }
}

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

export async function switchNetwork(networkKey) {
  if (!NETWORKS[networkKey]) {
    console.error(`Network ${networkKey} not found`);
    return false;
  }

  currentNetwork = networkKey;
  NETWORK_STORAGE.set(networkKey);
  await initializeReadProvider();

  if (isWalletConnected && walletProvider) {
    let walletNetwork;
    try {
      walletNetwork = await walletProvider.getNetwork();
    } catch (e) {
      // Wallet chain shifted under the old provider — recreate and retry.
      walletProvider = new ethers.BrowserProvider(window.ethereum);
      signer = await walletProvider.getSigner();
      walletNetwork = await walletProvider.getNetwork();
    }
    const targetNetwork = getCurrentNetworkConfig();

    if (walletNetwork.chainId !== BigInt(targetNetwork.chainId)) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${targetNetwork.chainId.toString(16)}` }],
        });
        walletProvider = new ethers.BrowserProvider(window.ethereum);
        signer = await walletProvider.getSigner();
      } catch (error) {
        console.error("Error switching wallet network:", error);
        alert(`Please manually switch your wallet to ${targetNetwork.name}`);
      }
    }
  }

  return true;
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("Please install MetaMask!");
    return false;
  }

  try {
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    await walletProvider.send("eth_requestAccounts", []);
    signer = await walletProvider.getSigner();

    const network = await walletProvider.getNetwork();
    const targetNetwork = getCurrentNetworkConfig();

    if (network.chainId !== BigInt(targetNetwork.chainId)) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${targetNetwork.chainId.toString(16)}` }],
        });
        // ethers v6 BrowserProvider locks to the chain it was constructed on,
        // so getNetwork() throws NETWORK_ERROR after a wallet chain switch.
        // Re-create the provider + signer against the new chain.
        walletProvider = new ethers.BrowserProvider(window.ethereum);
        signer = await walletProvider.getSigner();
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
    await loadUserSeeds();
    return true;
  } catch (error) {
    console.error("Error connecting wallet:", error);
    return false;
  }
}

export async function feedPlantoid(amount) {
  try {
    if (!isWalletConnected || !signer) {
      const connected = await connectWallet();
      if (!connected) {
        alert("Please connect your wallet first!");
        return;
      }
    }

    const networkConfig = getCurrentNetworkConfig();
    const tx = {
      to: networkConfig.plantoidAddress,
      value: ethers.parseEther(amount),
    };

    const transactionResponse = await signer.sendTransaction(tx);
    console.log("Transaction sent:", transactionResponse);
    await transactionResponse.wait();
    console.log("Transaction mined:", transactionResponse);

    await loadBlockchainData(readProvider || walletProvider);
    console.log("✅ Transaction successful!");
  } catch (error) {
    console.error("❌ Error sending transaction:", error);
  }
}

export async function handleConnectWallet() {
  const connected = await connectWallet();
  if (connected) {
    const address = await signer.getAddress();
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    await loadUserSeeds();
    return shortAddress;
  }
  return null;
}

export function getCurrentNetworkInfo() {
  return getCurrentNetworkConfig();
}

export function getAvailableNetworks() {
  return NETWORKS;
}

async function initialize() {
  // On the index/list page there is no specific plantoid — skip blockchain wiring.
  if (!(await hasExplicitSelection())) return;

  NETWORKS = await getNetworks();
  PLANTOID_CONFIG = await getPlantoidConfig();

  await initializeReadProvider();
  await checkExistingWalletConnection();

  const networkSelect = document.getElementById("network-select");
  if (networkSelect) networkSelect.value = currentNetwork;

  updateNetworkIndicator();
}

initialize();

setInterval(async () => {
  if (readProvider) {
    await loadBlockchainData(readProvider);
  }
}, 30000);
