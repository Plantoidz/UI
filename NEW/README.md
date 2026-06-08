# Plantoid UI — unified

One static site that serves the profile, gallery, and feed page for every Plantoid. The active Plantoid is picked at runtime from the URL — no per-Plantoid folder, no per-Plantoid deploy.

## How a Plantoid is selected

The resolver (`modules/plantoid-resolver.js`) picks an entry from `plantoids.json` using the first match of:

1. `?p=<number>` — query string (works locally, e.g. `index.html?p=14`)
2. `#<number>` — URL hash
3. Leftmost subdomain that's a number — e.g. `14.plantoid.org` → `14`
4. `registry.default` in `plantoids.json` — fallback

## Adding a new Plantoid

Edit `plantoids.json` and add a new entry under `"plantoids"`:

```json
"19": {
  "number": 19,
  "name": "PLANTOID 19",
  "subtitle": "...",
  "image": "assets/P19.jpg",
  "contracts": {
    "sepolia": "0x...",
    "mainnet": "0x..."
  },
  "contributors": ["..."]
}
```

Then drop `P19.jpg` into `assets/` and deploy. That's it.

## Deploying multiple subdomains from one site

Point all the subdomains (`14.plantoid.org`, `15.plantoid.org`, …) at the same hosting via a DNS wildcard (`*.plantoid.org`). The host needs to serve the same site for any incoming `Host` header — every static host supports this:

- **Vercel / Netlify / Cloudflare Pages**: add the wildcard domain in the project's domain settings.
- **Nginx**: one `server` block with `server_name *.plantoid.org plantoid.org;` and a single `root` pointing at this folder.
- **Apache**: a vhost with `ServerAlias *.plantoid.org`.

The page's JS reads `window.location.hostname`, sees `14`, and renders Plantoid 14.

## File layout

```
NEW/
├── index.html              # profile page (shared)
├── gallery.html            # NFT gallery (shared)
├── plantoids.json          # registry — the only file you edit per Plantoid
├── plantoid.css            # main styling
├── gallery.css
├── main-sidebar.css
├── modules/
│   ├── plantoid-resolver.js  # picks the active Plantoid from URL
│   ├── web3utils.js          # blockchain reads + wallet
│   ├── content-loader.js     # fills the page from the registry
│   └── gallery.js            # gallery page logic
├── abis/Plantoid.json
├── assets/                 # P13.jpg, P14.png, …
└── feed/
    └── wallet.html         # auto-feed (testnet) page (shared)
```

## Local testing

```bash
python -m http.server 8000
# then visit:
#   http://localhost:8000/?p=14
#   http://localhost:8000/?p=18
#   http://localhost:8000/feed/wallet.html?p=18
```
