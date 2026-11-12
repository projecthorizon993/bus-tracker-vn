/**
 * Bus Tracker VN - Config (GitHub Pages + Cloudflare Worker)
 * Your Worker URL goes here after deploying to Cloudflare.
 */
const CONFIG = {
  // Cloudflare Worker URL (deploy worker.js, then paste the workers.dev domain here)
  WORKER_URL: '',

  // Default city: 'hcmc' or 'hanoi'
  DEFAULT_CITY: 'hcmc',

  // Auto-refresh interval in milliseconds
  REFRESH_INTERVAL: 30000,

  // Map centers
  CITIES: {
    hcmc: { name: 'Ho Chi Minh City', center: [10.8231, 106.6297], zoom: 13 },
    hanoi: { name: 'Hanoi', center: [21.0285, 105.8542], zoom: 13 }
  },

  // Map tile URL proxied through Cloudflare Worker
  TILE_URL: '${WORKER_URL}/api/map-tiles/{z}/{x}/{y}',
  TILE_ATTR: '&copy; FreeRoute / OpenStreetMap'
};
