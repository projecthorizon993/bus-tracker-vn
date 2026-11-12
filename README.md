# Bus Tracker VN

Web app to track buses in **Ho Chi Minh City** and **Hanoi**, Vietnam, using **timbus.vn** for live bus data and **FreeRoute** for map tiles.

## Architecture

```
GitHub Pages (Frontend) ──→ Cloudflare Worker (Backend) ──→ timbus.vn + FreeRoute
                                │                              │
                                └─ Hides API keys              └─ Real bus data
                                └─ Handles CORS                └─ Map tiles
```

## Project structure

```
bus-tracker-vn/
├── index.html        # Frontend UI (GitHub Pages)
├── style.css         # Styles
├── app.js            # Frontend logic, calls Worker API
├── config.js         # Worker URL config
├── worker.js         # Cloudflare Worker (backend proxy)
├── wrangler.toml     # Worker deployment config
├── package.json
└── README.md
```

## Setup

### 1. Deploy Cloudflare Worker

```bash
# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy the Worker
wrangler deploy
```

After deployment, copy the Worker URL (e.g. `https://bus-tracker-vn-worker.<subdomain>.workers.dev`).

### 2. Configure frontend

Edit `config.js` and set your Worker URL:

```js
WORKER_URL: 'https://bus-tracker-vn-worker.YOUR_SUBDOMAIN.workers.dev',
```

### 3. Deploy to GitHub Pages

```bash
# Create repo and push
git init
git add .
git commit -m "Initial commit"
gh repo create bus-tracker-vn --public --source=. --remote=origin
git push -u origin main

# Enable GitHub Pages in repo settings → Source: main branch
```

Or use GitHub Actions for automatic deployment (see `.github/workflows/`).

### 4. Access your app

Open: `https://yourusername.github.io/bus-tracker-vn/`

## API Endpoints (Cloudflare Worker)

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/buses?city=hcmc` | Bus routes & positions for HCMC |
| `GET /api/buses?city=hanoi` | Bus routes & positions for Hanoi |
| `GET /api/route/:id` | Route detail with stops & geometry |
| `GET /api/map-tiles/{z}/{x}/{y}` | Map tile proxy (FreeRoute + OSM fallback) |

## Data Source

- **Bus routes & positions:** [timbus.vn](http://timbus.vn) (live data from Vietnam)
- **Map tiles:** FreeRoute (your API key) with OpenStreetMap fallback
- **FreeRoute API key:** `fro_80bfff714e74d8e8e56588a544113339e40f657011771cb54d4fe32c99010d11` (hidden in Worker)

## Features

- ✅ Live bus data from timbus.vn (Hanoi + HCMC)
- ✅ Start station → End station for every route
- ✅ FreeRoute map with your API key
- ✅ Colored route polylines
- ✅ Bus markers with popups (route, next stop, ETA)
- ✅ Bus list sidebar with search & filter
- ✅ Auto-refresh every 30 seconds
- ✅ Mobile-responsive sidebar
- ✅ No API keys exposed in frontend

## Next Steps

- Add GitHub Actions workflow for auto-deploy to Pages
- Add route detail page (`/api/route/:id`)
- Add real-time bus position polling with WebSocket or longer polling
- Add HCMC fleetdetail endpoints if timbus.vn supports them
