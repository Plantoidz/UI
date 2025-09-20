import { NETWORKS, DEFAULT_NETWORK, PLANTOID_CONFIG, NETWORK_STORAGE } from "../config.js";

// Rate limiting configuration to prevent Infura rate limit errors
const RATE_LIMIT_CONFIG = {
  maxConcurrent: 3, // Maximum concurrent requests to Infura
  delayBetweenBatches: 1000, // Milliseconds between batches
  batchSize: 5, // NFTs per batch
  retryDelay: 2000, // Delay before retrying failed requests
  randomDelay: 200, // Max random delay to spread requests
};


// Permanent TokenURI caching system - network-aware and never expires
const TOKEN_URI_CACHE = {
  cache: new Map(),

  // Generate cache key from contract address and token ID and network
  getCacheKey(contractAddress, tokenId, networkKey) {
    return `${networkKey}_${contractAddress.toLowerCase()}_${tokenId}`;
  },

  // Get cached tokenURI if available (no expiration since tokenURIs are immutable)
  get(contractAddress, tokenId, networkKey) {
    const key = this.getCacheKey(contractAddress, tokenId, networkKey);
    const cached = this.cache.get(key);

    if (cached) {
      return cached.tokenURI;
    }

    return null;
  },

  // Store tokenURI in cache permanently
  set(contractAddress, tokenId, networkKey, tokenURI) {
    const key = this.getCacheKey(contractAddress, tokenId, networkKey);
    this.cache.set(key, {
      tokenURI,
      timestamp: Date.now(),
      network: networkKey,
      contractAddress: contractAddress.toLowerCase()
    });
  },

  // Clear cache for specific network only (optional - usually not needed)
  clearNetwork(networkKey) {
    let cleared = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.network === networkKey) {
        this.cache.delete(key);
        cleared++;
      }
    }
    console.log(`🗑️ Cleared ${cleared} cache entries for network ${networkKey}`);
  },

  // Clear entire cache (optional - usually not needed since tokenURIs are immutable)
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ Cleared entire TokenURI cache (${size} entries)`);
  },

  // Get cache statistics
  getStats() {
    const stats = {
      totalSize: this.cache.size,
      byNetwork: {},
      keys: Array.from(this.cache.keys())
    };
    
    // Count entries by network
    for (const [key, value] of this.cache.entries()) {
      const network = value.network || 'unknown';
      stats.byNetwork[network] = (stats.byNetwork[network] || 0) + 1;
    }
    
    return stats;
  },
};

let currentNetwork = NETWORK_STORAGE.get();
let provider = null;
let contract = null;
let plantoidABI = null;

// Pagination for unrevealed NFTs table
const UNREVEALED_PAGINATION = {
  itemsPerPage: 5,
  currentPage: 1,
  totalItems: 0,
  data: []
};

// Get current network configuration
function getCurrentNetworkConfig() {
  return NETWORKS[currentNetwork];
}

// Cached tokenURI function to reduce API calls
async function getCachedTokenURI(contract, tokenId) {
  const networkConfig = getCurrentNetworkConfig();

  // Try to get from cache first
  const cachedURI = TOKEN_URI_CACHE.get(
    networkConfig.plantoidAddress,
    tokenId,
    currentNetwork
  );
  if (cachedURI) {
    return cachedURI;
  }

  // Not in cache, fetch from contract
  try {
    const tokenURI = await contract.tokenURI(tokenId);

    // Store in cache
    TOKEN_URI_CACHE.set(
      networkConfig.plantoidAddress,
      tokenId,
      currentNetwork,
      tokenURI
    );

    return tokenURI;
  } catch (error) {
    console.error(`Failed to fetch tokenURI for token ${tokenId}:`, error);
    throw error;
  }
}

// Generate OpenSea URL for NFT
function getOpenSeaUrl(contractAddress, tokenId, isTestnet) {
  if (isTestnet) {
    return `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`;
  } else {
    return `https://opensea.io/assets/ethereum/${contractAddress}/${tokenId}`;
  }
}

// Query main subgraph for seeds data
async function queryMainSubgraph(plantoidAddress) {
  try {
    // Main subgraph endpoints (seeds, revealed status, holders)
    const mainSubgraphs = {
      sepolia: "https://api.studio.thegraph.com/query/68539/plantoid-sep/3",
      mainnet:
        "https://gateway-arbitrum.network.thegraph.com/api/5aa71d6a9735426594a4f8c82de56afc/subgraphs/id/HCzhXN9mNjupmWemF6NsTmuoYFUonfwSmjHJ5MC8z3Rq",
    };

    const subgraphUrl = mainSubgraphs[currentNetwork];
    if (!subgraphUrl) {
      console.log(`No main subgraph configured for ${currentNetwork}`);
      return [];
    }

    const query = `
            query getSeeds {
                seeds(first: 1000) {
                    id
                    tokenId
                    revealed
                    holder {
                        address
                    }
                }
            }
        `;

    console.log("🔍 Querying main subgraph...");
    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();
    if (result.errors) {
      console.error("Main subgraph errors:", result.errors);
      return [];
    }

    // Filter for our plantoid
    const allSeeds = result.data?.seeds || [];
    const plantoidPrefix = plantoidAddress.toLowerCase();
    const filteredSeeds = allSeeds.filter((seed) =>
      seed.id.toLowerCase().startsWith(plantoidPrefix)
    );

    console.log(
      `📊 Main subgraph: ${allSeeds.length} total seeds, ${filteredSeeds.length} for plantoid ${plantoidAddress}`
    );
    return filteredSeeds;
  } catch (error) {
    console.error("Error querying main subgraph:", error);
    return [];
  }
}

// Query metadata subgraph for reveal signatures
async function queryMetadataSubgraph(plantoidAddress) {
  try {
    // Metadata subgraph endpoints (signatures)
    const metadataSubgraphs = {
      sepolia:
        "https://gateway-arbitrum.network.thegraph.com/api/5aa71d6a9735426594a4f8c82de56afc/subgraphs/id/EmnBAZcJGouYxmcApwMKspGqNTY79f5tw5oDh7AvqFue",
      mainnet:
        "https://gateway-arbitrum.network.thegraph.com/api/5aa71d6a9735426594a4f8c82de56afc/subgraphs/id/EmnBAZcJGouYxmcApwMKspGqNTY79f5tw5oDh7AvqFue",
    };

    const subgraphUrl = metadataSubgraphs[currentNetwork];
    if (!subgraphUrl) {
      console.log(`No metadata subgraph configured for ${currentNetwork}`);
      return [];
    }

    const query = `
            query MetadataQuery($id: String!) {
                plantoidMetadata(id: $id) {
                    id
                    seedMetadatas {
                        id
                        revealedUri
                        revealedSignature
                    }
                }
            }
        `;

    console.log("🔍 Querying metadata subgraph...");
    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { id: plantoidAddress.toLowerCase() },
      }),
    });

    const result = await response.json();
    if (result.errors) {
      console.error("Metadata subgraph errors:", result.errors);
      return [];
    }

    const seedMetadatas = result.data?.plantoidMetadata?.seedMetadatas || [];
    console.log(
      `🔑 Metadata subgraph: found ${seedMetadatas.length} signatures`
    );
    return seedMetadatas;
  } catch (error) {
    console.error("Error querying metadata subgraph:", error);
    return [];
  }
}

// Load ABI from JSON file
async function loadABI() {
  try {
    const response = await fetch("./abis/Plantoid.json");
    plantoidABI = await response.json();
  } catch (error) {
    console.error("Error loading ABI:", error);
    throw error;
  }
}

// Initialize provider and load NFTs
async function initializeGallery() {
  try {
    // Load ABI if not already loaded
    if (!plantoidABI) {
      await loadABI();
    }

    const networkConfig = getCurrentNetworkConfig();
    provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

    // Create contract instance
    contract = new ethers.Contract(
      networkConfig.plantoidAddress,
      plantoidABI,
      provider
    );

    // Set correct network in dropdown and update indicator
    const networkSelect = document.getElementById("network-select");
    if (networkSelect) {
      networkSelect.value = currentNetwork;
    }
    
    // Update network indicator to match current network
    updateNetworkIndicator();

    // Load both in parallel for faster initial load
    await Promise.all([loadNFTs(), loadUnrevealedNFTs()]);
  } catch (error) {
    console.error("Error initializing gallery:", error);
    showError("Failed to initialize gallery. Please check your connection.");
  }
}

// Update network indicator
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

// Load all NFTs
async function loadNFTs() {
  const loadingMessage = document.getElementById("loading-message");
  const errorMessage = document.getElementById("error-message");
  const gallery = document.getElementById("nft-gallery");

  try {
    loadingMessage.style.display = "block";
    errorMessage.style.display = "none";
    gallery.innerHTML = "";

    // Get total supply
    const totalSupply = await contract.totalSupply();
    document.getElementById("total-seeds").textContent = totalSupply.toString();

    if (totalSupply === 0n) {
      loadingMessage.textContent = "No NFTs minted yet";
      return;
    }

    loadingMessage.textContent = "Loading revealed NFTs with videos...";

    // Load NFTs with rate limiting to avoid Infura's request limits
    const totalNFTs = Number(totalSupply);
    const {
      maxConcurrent,
      delayBetweenBatches,
      batchSize,
      retryDelay,
      randomDelay,
    } = RATE_LIMIT_CONFIG;

    // Process NFTs in controlled batches
    for (let batchStart = totalNFTs; batchStart >= 1; batchStart -= batchSize) {
      const batchEnd = Math.max(1, batchStart - batchSize + 1);
      const batchPromises = [];

      // Create promises for this batch
      for (let i = batchStart; i >= batchEnd && i >= 1; i--) {
        const loadNFT = async (tokenId) => {
          try {
            // Add small random delay to spread out requests
            await new Promise((resolve) =>
              setTimeout(resolve, Math.random() * randomDelay)
            );

            const tokenURI = await getCachedTokenURI(contract, tokenId);
            await displayNFT(tokenId, tokenURI);
          } catch (error) {
            if (
              error.code === "BAD_DATA" ||
              error.message?.includes("Too Many Requests") ||
              error.message?.includes("429")
            ) {
              // Wait longer and retry once
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
              try {
                const tokenURI = await getCachedTokenURI(contract, tokenId);
                await displayNFT(tokenId, tokenURI);
              } catch (retryError) {
                console.error(
                  `Failed to load NFT #${tokenId} after retry:`,
                  retryError.message
                );
              }
            } else {
              console.error(`Error loading NFT #${tokenId}:`, error.message);
            }
          }
        };

        batchPromises.push(loadNFT(i));
      }

      // Process batch with limited concurrency
      const results = [];
      for (let i = 0; i < batchPromises.length; i += maxConcurrent) {
        const chunk = batchPromises.slice(i, i + maxConcurrent);
        results.push(...(await Promise.allSettled(chunk)));
      }

      // Wait before next batch to respect rate limits
      if (batchEnd > 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches)
        );
      }
    }

    // Check if any NFTs were displayed
    if (gallery.children.length === 0) {
      loadingMessage.textContent = "No revealed NFTs with videos found";
      loadingMessage.style.display = "block";
    } else {
      loadingMessage.style.display = "none";
    }
  } catch (error) {
    console.error("Error loading NFTs:", error);
    showError("Failed to load NFTs. Please try again.");
  }
}

// Display a single NFT
async function displayNFT(tokenId, tokenURI) {
  const gallery = document.getElementById("nft-gallery");

  // Create NFT card temporarily (not added to DOM yet)
  const nftCard = document.createElement("div");
  nftCard.className = "nft-card";

  try {
    // Fetch metadata from tokenURI
    let metadata;
    
    // Trim whitespace from tokenURI (some contracts return URIs with leading/trailing spaces)
    const cleanTokenURI = tokenURI.trim();

    if (cleanTokenURI.startsWith("data:application/json;base64,")) {
      // Handle base64 encoded metadata
      const base64Data = cleanTokenURI.split(",")[1];
      const jsonString = atob(base64Data);
      metadata = JSON.parse(jsonString);
    } else if (cleanTokenURI.startsWith("ipfs://")) {
      // Handle IPFS URIs
      const ipfsGateway = "https://ipfs.io/ipfs/";
      const ipfsHash = cleanTokenURI.replace("ipfs://", "");
      const httpUrl = ipfsGateway + ipfsHash;
      
      try {
        const response = await fetch(httpUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        metadata = await response.json();
      } catch (fetchError) {
        console.error(`Failed to fetch IPFS metadata for token ${tokenId}:`, fetchError);
        throw new Error(`IPFS fetch failed: ${fetchError.message}`);
      }
    } else {
      // Handle regular HTTP URIs
      try {
        const response = await fetch(cleanTokenURI);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        metadata = await response.json();
      } catch (fetchError) {
        console.error(`Failed to fetch metadata for token ${tokenId}:`, fetchError);
        throw new Error(`HTTP fetch failed: ${fetchError.message}`);
      }
    }

    // Update card with metadata
    let imageUrl = metadata.image || "";
    let animationUrl = metadata.animation_url || "";

    // Convert IPFS URLs to HTTP gateway URLs
    if (imageUrl.startsWith("ipfs://")) {
      imageUrl = "https://ipfs.io/ipfs/" + imageUrl.replace("ipfs://", "");
    }
    if (animationUrl.startsWith("ipfs://")) {
      animationUrl =
        "https://ipfs.io/ipfs/" + animationUrl.replace("ipfs://", "");
    }

    // Check if this is a revealed seed
    // Revealed seeds will have animation_url (all revealed seeds are videos)
    // Also check for other indicators of unrevealed NFTs
    const isUnrevealed =
      !animationUrl ||
      metadata.name?.toLowerCase().includes("unrevealed") ||
      metadata.description?.toLowerCase().includes("unrevealed") ||
      metadata.image?.includes("unrevealed");

    if (isUnrevealed) {
      // Unrevealed seed, skip this NFT
      return;
    }

    // Create video element and verify it loads successfully
    const video = document.createElement("video");
    video.src = animationUrl;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsinline = true;
    video.controls = true;

    // Set up load handlers
    const loadPromise = new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve(true);
      video.onerror = () => reject(new Error("Video failed to load"));

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error("Video load timeout")), 10000);
    });

    try {
      // Wait for video to load successfully
      await loadPromise;

      // Video loaded successfully, create the card as a clickable link
      const networkConfig = getCurrentNetworkConfig();
      const openSeaUrl = getOpenSeaUrl(
        networkConfig.plantoidAddress,
        tokenId,
        networkConfig.isTestnet
      );

      // Create clickable link wrapper
      const nftLink = document.createElement("a");
      nftLink.href = openSeaUrl;
      nftLink.target = "_blank";
      nftLink.rel = "noopener noreferrer";
      nftLink.className = "nft-card";

      nftLink.innerHTML = `
                <div class="nft-image-container">
                    <video src="${animationUrl}" class="nft-media nft-video" 
                           controls autoplay muted loop playsinline
                           poster="${imageUrl}">
                    </video>
                </div>
                <div class="nft-info">
                    <div class="nft-seed-number">Seed #${tokenId}</div>
                </div>
            `;

      // Add to gallery only if video loaded successfully
      gallery.appendChild(nftLink);
    } catch (videoError) {
      // Video failed to load, skip this NFT
      return;
    }
  } catch (error) {
    // Skip NFTs that fail to load metadata
    return;
  }
}

// Show error message
function showError(message) {
  const errorMessage = document.getElementById("error-message");
  const loadingMessage = document.getElementById("loading-message");

  errorMessage.textContent = message;
  errorMessage.style.display = "block";
  loadingMessage.style.display = "none";
}

// Switch network
async function switchNetwork(networkKey) {
  if (!NETWORKS[networkKey]) {
    console.error(`Network ${networkKey} not found`);
    return false;
  }

  currentNetwork = networkKey;
  
  // Save network preference to localStorage
  NETWORK_STORAGE.set(networkKey);

  // Note: We no longer clear cache when switching networks since 
  // tokenURIs are immutable and cache is network-aware

  // Reset pagination when switching networks
  UNREVEALED_PAGINATION.currentPage = 1;
  UNREVEALED_PAGINATION.totalItems = 0;
  UNREVEALED_PAGINATION.data = [];

  // Reinitialize gallery for new network (includes unrevealed NFTs)
  await initializeGallery();

  return true;
}

// Network selector handler
document
  .getElementById("network-select")
  .addEventListener("change", async function () {
    const selectedNetwork = this.value;
    console.log(`Switching to ${selectedNetwork}`);

    // Show loading state
    const indicator = document.getElementById("network-indicator");
    indicator.textContent = "Switching...";
    indicator.className = "network-indicator switching";

    // Switch network
    await switchNetwork(selectedNetwork);
  });

// Load unrevealed NFTs that can be revealed (replicates plantoid-ui-ui4all logic)
async function loadUnrevealedNFTs() {
  const unrevealedSection = document.getElementById("unrevealed-section");
  const unrevealedLoading = document.getElementById("unrevealed-loading");
  const unrevealedTable = document.getElementById("unrevealed-table");

  try {
    console.log("🔍 Starting to load unrevealed NFTs...");
    unrevealedLoading.style.display = "block";

    const networkConfig = getCurrentNetworkConfig();
    console.log("📡 Network config:", networkConfig);

    // Query both subgraphs and combine data (exactly like plantoid-ui-ui4all)
    console.log("🔍 Querying both subgraphs...");
    const [mainSeeds, metadataSignatures] = await Promise.all([
      queryMainSubgraph(networkConfig.plantoidAddress),
      queryMetadataSubgraph(networkConfig.plantoidAddress),
    ]);

    console.log("📊 Main seeds:", mainSeeds);
    console.log("🔑 Metadata signatures:", metadataSignatures);

    // Debug the data structures to understand the matching issue
    if (mainSeeds.length > 0) {
      console.log("🔍 Sample main seed:", mainSeeds[0]);
    }
    if (metadataSignatures.length > 0) {
      console.log("🔍 Sample metadata signature:", metadataSignatures[0]);
    }

    // Update total seeds count
    document.getElementById("total-seeds").textContent =
      mainSeeds.length.toString();

    // Combine data exactly like plantoid-ui-ui4all Reveal.jsx
    const combinedData = mainSeeds.map((seed) => {
      // Try different matching strategies to find the right one
      const tokenIdStr = seed.tokenId.toString();

      console.log(`🔗 Looking for metadata for seed tokenId: ${tokenIdStr}`);
      console.log(
        `🔗 Available metadata IDs:`,
        metadataSignatures.map((md) => md.id)
      );

      // Find matching metadata for this seed by tokenId
      // Try multiple matching strategies since the ID format might be different
      const metadata = metadataSignatures.find((md) => {
        console.log(
          `🔗 Comparing metadata id "${md.id}" with seed tokenId "${tokenIdStr}"`
        );

        // Strategy 1: Direct match
        if (md.id === tokenIdStr) return true;

        // Strategy 2: Match if metadata id ends with the tokenId (format: address_tokenId)
        if (md.id.endsWith("_" + tokenIdStr)) return true;

        // Strategy 3: Match if metadata id ends with hex tokenId
        const hexTokenId = "0x" + parseInt(tokenIdStr).toString(16);
        if (md.id.endsWith("_" + hexTokenId)) return true;

        // Strategy 4: Match if metadata id is just the hex tokenId
        if (md.id === hexTokenId) return true;

        return false;
      });

      console.log(`🔗 Found metadata for seed ${tokenIdStr}:`, metadata);

      return {
        ...seed,
        revealedUri: metadata?.revealedUri || null,
        revealedSignature: metadata?.revealedSignature || null,
      };
    });

    // Filter for unrevealed NFTs that have signatures
    // Also check actual on-chain status to avoid showing already revealed NFTs
    const unrevealedWithSignatures = [];

    for (const seed of combinedData) {
      const hasSignature =
        seed.revealedSignature && seed.revealedSignature !== "0x";
      const notRevealed = !seed.revealed;

      if (notRevealed && hasSignature) {
        // Double-check by querying the actual token URI from the contract
        try {
          const currentUri = await getCachedTokenURI(contract, seed.tokenId);
          const isActuallyRevealed = currentUri === seed.revealedUri;

          console.log(
            `🔍 Seed ${seed.tokenId}: subgraph revealed=${seed.revealed}, hasSignature=${hasSignature}, actuallyRevealed=${isActuallyRevealed}`
          );

          if (!isActuallyRevealed) {
            unrevealedWithSignatures.push(seed);
          } else {
            console.log(
              `⚠️ Seed ${seed.tokenId} is already revealed on-chain but subgraph shows unrevealed`
            );
          }
        } catch (error) {
          console.log(
            `⚠️ Could not check on-chain status for seed ${seed.tokenId}:`,
            error.message
          );
          // If we can't check, include it anyway
          unrevealedWithSignatures.push(seed);
        }
      } else {
        console.log(
          `🔍 Seed ${seed.tokenId}: revealed=${seed.revealed}, hasSignature=${hasSignature}, revealedSignature=${seed.revealedSignature}`
        );
      }
    }

    console.log("🔒 Unrevealed with signatures:", unrevealedWithSignatures);

    unrevealedLoading.style.display = "none";

    if (unrevealedWithSignatures.length > 0) {
      console.log(
        `✅ Displaying ${unrevealedWithSignatures.length} unrevealed NFTs with pagination`
      );
      
      // Store data in pagination system
      UNREVEALED_PAGINATION.data = unrevealedWithSignatures;
      UNREVEALED_PAGINATION.totalItems = unrevealedWithSignatures.length;
      UNREVEALED_PAGINATION.currentPage = 1; // Reset to first page
      
      displayUnrevealedTablePaginated();
      unrevealedSection.style.display = "block";
    } else {
      console.log("❌ No unrevealed NFTs with signatures found");
      unrevealedSection.style.display = "none";
    }
  } catch (error) {
    console.error("Error loading unrevealed NFTs:", error);
    unrevealedLoading.style.display = "none";
    unrevealedTable.innerHTML =
      '<div class="no-unrevealed">Error loading unrevealed NFTs</div>';
  }
}

// Display unrevealed NFTs in paginated table format
function displayUnrevealedTablePaginated() {
  const unrevealedTable = document.getElementById("unrevealed-table");
  const { currentPage, itemsPerPage, totalItems, data } = UNREVEALED_PAGINATION;

  console.log(`🎨 Displaying paginated table - Page ${currentPage} of ${Math.ceil(totalItems / itemsPerPage)}`);

  // Calculate pagination
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentPageData = data.slice(startIndex, endIndex);

  // Build table HTML
  let tableHTML = `
    <div class="reveal-table-header">
      <div>Seed</div>
      <div>Owner</div>
      <div>Action</div>
    </div>
  `;

  currentPageData.forEach((nft) => {
    // Extract holder address - it might be nested differently
    let holderAddress = nft.holder?.address || nft.holder;
    if (typeof holderAddress !== "string") {
      console.warn("⚠️ Unexpected holder format:", nft.holder);
      holderAddress = "Unknown";
    }

    // Display full address instead of shortened version
    const displayAddress = holderAddress;

    const tokenId = nft.tokenId || nft.id;
    const canReveal =
      !!nft.revealedSignature &&
      nft.revealedSignature !== "0x" &&
      !nft.revealed;

    console.log(`🎨 Rendering row for seed ${tokenId}:`, {
      holderAddress,
      canReveal,
      revealedSignature: nft.revealedSignature,
    });

    tableHTML += `
      <div class="reveal-table-row">
        <div class="reveal-seed">Seed #${tokenId}</div>
        <div class="reveal-holder" title="${holderAddress}">${displayAddress}</div>
        <div>
          <button class="reveal-button" 
                  ${!canReveal ? "disabled" : ""}
                  onclick="revealNFT('${tokenId}', '${nft.revealedUri || ""}', '${nft.revealedSignature || ""}')">
            ${canReveal ? "Reveal" : "No Signature"}
          </button>
        </div>
      </div>
    `;
  });

  // Add pagination controls if there are multiple pages
  if (totalPages > 1) {
    tableHTML += `
      <div class="reveal-pagination">
        <button class="reveal-pagination-btn reveal-pagination-left" 
                onclick="changePage(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''}>
          ←
        </button>
        <span class="reveal-pagination-info">${currentPage}/${totalPages}</span>
        <button class="reveal-pagination-btn reveal-pagination-right" 
                onclick="changePage(${currentPage + 1})" 
                ${currentPage === totalPages ? 'disabled' : ''}>
          →
        </button>
      </div>
    `;
  }

  unrevealedTable.innerHTML = tableHTML;
}

// Change page function for pagination
window.changePage = function(newPage) {
  const totalPages = Math.ceil(UNREVEALED_PAGINATION.totalItems / UNREVEALED_PAGINATION.itemsPerPage);
  
  if (newPage >= 1 && newPage <= totalPages) {
    UNREVEALED_PAGINATION.currentPage = newPage;
    displayUnrevealedTablePaginated();
  }
};

// Keep original function for backward compatibility
function displayUnrevealedTable(unrevealedNFTs) {
  // This function is now deprecated in favor of displayUnrevealedTablePaginated
  console.warn("displayUnrevealedTable is deprecated, use displayUnrevealedTablePaginated instead");
  
  // For backward compatibility, store data and show first page
  UNREVEALED_PAGINATION.data = unrevealedNFTs;
  UNREVEALED_PAGINATION.totalItems = unrevealedNFTs.length;
  UNREVEALED_PAGINATION.currentPage = 1;
  displayUnrevealedTablePaginated();
}

// Reveal NFT function (replicates the exact revealMetadata function from plantoid-ui-ui4all)
window.revealNFT = async function (tokenId, revealedUri, revealedSignature) {
  try {
    // Check if user has MetaMask
    if (!window.ethereum) {
      alert("Please install MetaMask to reveal NFTs!");
      return;
    }

    // Validate inputs
    if (!tokenId || !revealedUri || !revealedSignature) {
      alert("Missing required data for reveal. Please try again.");
      return;
    }

    console.log("🎭 Attempting to reveal NFT:", {
      tokenId,
      revealedUri,
      revealedSignature,
    });

    // Request wallet connection
    await window.ethereum.request({ method: "eth_requestAccounts" });

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const networkConfig = getCurrentNetworkConfig();

    // Check if user is on correct network
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(networkConfig.chainId)) {
      alert(`Please switch to ${networkConfig.name} in MetaMask!`);
      return;
    }

    // Create contract instance with signer
    const plantoidContract = new ethers.Contract(
      networkConfig.plantoidAddress,
      plantoidABI,
      signer
    );

    // Check if token is already revealed
    try {
      const currentUri = await getCachedTokenURI(plantoidContract, tokenId);
      console.log("📄 Current token URI:", currentUri);

      // If the current URI already contains the revealed content, it might already be revealed
      if (currentUri === revealedUri) {
        alert("This NFT appears to already be revealed!");
        return;
      }
    } catch (error) {
      console.log("⚠️ Could not check current token URI:", error.message);
    }

    console.log("🔗 Contract call details:", {
      contractAddress: networkConfig.plantoidAddress,
      tokenId,
      revealedUri,
      revealedSignature,
    });

    // Try to estimate gas first to get a better error message
    try {
      const gasEstimate = await plantoidContract.revealContent.estimateGas(
        tokenId,
        revealedUri,
        revealedSignature
      );
      console.log("⛽ Gas estimate:", gasEstimate.toString());
    } catch (gasError) {
      console.error("💥 Gas estimation failed:", gasError);

      // Try to decode the error
      if (gasError.data === "0xa89ac151") {
        alert(
          "Reveal failed: Invalid signature or this NFT cannot be revealed yet."
        );
      } else {
        alert(`Reveal failed: ${gasError.message || "Unknown contract error"}`);
      }
      return;
    }

    // Call revealContent function (exactly like plantoid-ui-ui4all)
    const tx = await plantoidContract.revealContent(
      tokenId,
      revealedUri,
      revealedSignature
    );

    console.log(`🎉 Reveal transaction submitted! Hash: ${tx.hash}`);

    // Wait for transaction confirmation
    await tx.wait();

    console.log(`✅ NFT #${tokenId} revealed successfully!`);

    // Reload the page data
    await loadUnrevealedNFTs();
    await loadNFTs();
  } catch (error) {
    console.error("Error revealing NFT:", error);

    // Provide more specific error messages
    if (error.code === "CALL_EXCEPTION") {
      alert(
        "Transaction failed: The smart contract rejected this reveal. This could mean the signature is invalid, expired, or the NFT is already revealed."
      );
    } else if (error.code === "ACTION_REJECTED") {
      alert("Transaction cancelled by user.");
    } else {
      alert(`Error revealing NFT: ${error.message}`);
    }
  }
};

// Initialize on page load
initializeGallery();
