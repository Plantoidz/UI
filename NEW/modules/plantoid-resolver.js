// Resolves which Plantoid the current page should display, then exposes the
// same surface as the old config.js (NETWORKS, PLANTOID_CONFIG, etc.) so the
// rest of the code can stay unchanged.
//
// Selection priority:
//   1. ?p=<number>            — query string override
//   2. window.location.hash   — e.g. #14
//   3. <number>.<host>        — leftmost subdomain that is a number
//   4. registry.default       — fallback for local dev / apex domain

const REGISTRY_URL = new URL("../plantoids.json", import.meta.url);

let registry = null;
let activeId = null;

function pickIdFromLocation(registryIds) {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("p") || params.get("plantoid");
  if (fromQuery && registryIds.includes(fromQuery)) return fromQuery;

  const fromHash = window.location.hash.replace(/^#/, "");
  if (fromHash && registryIds.includes(fromHash)) return fromHash;

  const host = window.location.hostname || "";
  const firstLabel = host.split(".")[0];
  if (/^\d+$/.test(firstLabel) && registryIds.includes(firstLabel)) {
    return firstLabel;
  }

  return null;
}

async function loadRegistry() {
  if (registry) return registry;
  const res = await fetch(REGISTRY_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load plantoids.json: ${res.status}`);
  registry = await res.json();
  return registry;
}

export async function resolvePlantoid() {
  const reg = await loadRegistry();
  const ids = Object.keys(reg.plantoids);
  const fromLoc = pickIdFromLocation(ids);
  const picked = fromLoc || String(reg.default);
  if (!reg.plantoids[picked]) {
    throw new Error(`Plantoid "${picked}" not in registry`);
  }
  activeId = picked;
  console.log(
    `[plantoid-resolver] location.search="${window.location.search}", ` +
    `location.hostname="${window.location.hostname}", ` +
    `picked="${picked}" (${fromLoc ? "from URL" : "default"})`
  );
  return reg.plantoids[picked];
}

export async function getRegistry() {
  return loadRegistry();
}

export function getActiveId() {
  return activeId;
}

export async function hasExplicitSelection() {
  const reg = await loadRegistry();
  const ids = Object.keys(reg.plantoids);
  return pickIdFromLocation(ids) !== null;
}

// Build the PLANTOID_CONFIG shape the old code expects.
export async function getPlantoidConfig() {
  const reg = await loadRegistry();
  const p = await resolvePlantoid();
  return {
    number: p.number,
    name: p.name,
    subtitle: p.subtitle,
    image: p.image,
    headerImage: reg.shared.headerImage,
    contracts: p.contracts,
    description: {
      main: reg.shared.description.main,
      contributors: {
        title: reg.shared.contributors.title,
        intro: reg.shared.contributors.intro,
        subtitle: reg.shared.contributors.subtitle,
        list: p.contributors,
      },
    },
  };
}

// Build the NETWORKS shape (network metadata + per-plantoid contract address).
export async function getNetworks() {
  const reg = await loadRegistry();
  const p = await resolvePlantoid();
  const out = {};
  for (const [key, net] of Object.entries(reg.networks)) {
    out[key] = {
      ...net,
      plantoidAddress: p.contracts[key],
    };
  }
  return out;
}

export const DEFAULT_NETWORK = "mainnet";

export const NETWORK_STORAGE = {
  key: "plantoid_selected_network",
  get() {
    try {
      const saved = localStorage.getItem(this.key);
      return saved || DEFAULT_NETWORK;
    } catch (e) {
      return DEFAULT_NETWORK;
    }
  },
  set(networkKey) {
    try {
      localStorage.setItem(this.key, networkKey);
    } catch (e) {
      console.warn("Failed to save network preference");
    }
  },
};
