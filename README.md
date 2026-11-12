# Bus Tracker VN

Web app to track buses in **Ho Chi Minh City** and **Hanoi**, Vietnam, using the **FreeRoute** map SDK and a **Cloudflare Worker** for secure data fetching.

## Features
- FreeRoute-powered map (HCMC & Hanoi)
- Live bus markers with route number
- **Start station → End station** for every route
- Colored route polylines
- Bus list sidebar with search & filter
- Auto-refresh (10s) via Cloudflare Worker
- Mobile-responsive sidebar

## Project structure
```
bus-tracker-vn/
├── index.html        # Frontend UI
├── style.css         # Styles
├── config.js         # FreeRoute API key + Worker URL
├── app.js            # Map, markers, list, refresh logic
├── mock-data.js      # Demo HCMC + Hanoi data (start/end stations)
├── worker.js         # Cloudflare Worker (secure data proxy)
├── wrangler.toml     # Worker deployment config
├── package.json
└── README.md
```

## Setup

### 1. FreeRoute API key
Edit `config.js` — your key is already filled in:
```
FREEROUTE_API_KEY: 'fro_80bfff714e74d8e8e56588a544113339e40f657011771cb54d4fe32c99010d11',
```

### 2. Run locally
Open `index.html` in a browser. It uses mock data by default (Worker URL empty).

### 3. Deploy Cloudflare Worker
```bash
# Install wrangler
npm install -g wrangler

# Login
wrangler login

# Set secrets (when you have a real bus API)
wrangler secret put BUS_API_URL
wrangler secret put BUS_API_KEY

# Deploy
wrangler deploy
```

Then paste the Worker URL (e.g. `https://bus-tracker-vn-worker.<subdomain>.workers.dev`) into `config.js`:
```
WORKER_URL: 'https://bus-tracker-vn-worker.YOUR_SUBDOMAIN.workers.dev',
```

## GitHub repo
This project is set up as a Git repo. Push to GitHub:
```bash
git init
git add .
git commit -m "First prototype: HCMC + Hanoi bus tracker"
gh repo create bus-tracker-vn --public --source=. --remote=origin
git push -u origin main
```

## API
Worker endpoint: `GET /api/buses?city=hcmc` (or `hanoi`)

## Next steps
- Decompile `D:\tools\BusMap+Hà+Nội_3.1.2_APKPure (1).xapk` with `apktool.jar` to find the real BusMap API endpoints.
- Update `normalizeResponse()` in `worker.js` to match the real API contract.
- Replace `TILE_URL` in `config.js` with FreeRoute's tile URL when SDK docs are available.
