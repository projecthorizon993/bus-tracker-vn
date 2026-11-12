/**
 * Bus Tracker VN - Configuration
 * Fill in your FreeRoute API key and Cloudflare Worker URL below.
 */
const CONFIG = {
  // Your FreeRoute API key (from https://freeroute.org/)
  FREEROUTE_API_KEY: 'fro_80bfff714e74d8e8e56588a544113339e40f657011771cb54d4fe32c99010d11',

  // Cloudflare Worker URL (deploy worker.js, then paste the workers.dev domain here)
  WORKER_URL: 'https://bus-tracker-vn-worker.lequangglobal.workers.dev',

  // Default city: 'hcmc' or 'hanoi'
  DEFAULT_CITY: 'hcmc',

  // Auto-refresh interval in milliseconds for live bus positions
  REFRESH_INTERVAL: 10000,

  // Map centers
  CITIES: {
    hcmc: { name: 'Ho Chi Minh City', center: [10.8231, 106.6297], zoom: 13 },
    hanoi: { name: 'Hanoi', center: [21.0285, 105.8542], zoom: 13 }
  },

  // Leaflet tile layer. Replace with FreeRoute tile URL when SDK docs are available.
  // Example FreeRoute pattern: `https://tiles.freeroute.org/{z}/{x}/{y}.png?key=YOUR_KEY`
  TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTR: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
};
