/**
 * Bus Tracker VN - Cloudflare Worker
 * Backend proxy for BusMaps API and FreeRoute map tiles.
 * Hides API keys server-side, handles CORS.
 *
 * BusMaps API endpoints (https://busmaps.com/en/developers/api-docs/v1):
 *   GET /v1/rawVehiclePositions - Real-time vehicle positions within bounds
 *   GET /v1/stopsInRadius       - Find stops near coordinates
 *   GET /v1/line                - Route detail with stops and geometry
 *   GET /v1/routes              - Plan routes between origin/destination
 *   GET /v1/nextDepartures      - Real-time departures from stops
 *
 * Required headers:
 *   capi-key: Bearer YOUR_API_KEY
 *   capi-host: busmaps.com
 * Base URL: https://capi.busmaps.com:8443
 */

// ---- Config ----
const FREEROUTE_API_KEY = 'fro_80bfff714e74d8e8e56588a544113339e40f657011771cb54d4fe32c99010d11';
const BUSMAPS_API_KEY = 'BUSMAPS_API_KEY_PLACEHOLDER'; // Set your key here

const BUSMAPS_BASE = 'https://capi.busmaps.com:8443';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept'
};

const MAX_ROUTES_PER_CITY = 15;

// ---- Helpers ----
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra }
  });
}

/** Fetch from BusMaps API with API key headers */
async function busmapsFetch(path, params = {}) {
  const busMapsKey = BUSMAPS_API_KEY || '';
  if (!busMapsKey || busMapsKey === 'BUSMAPS_API_KEY_PLACEHOLDER') {
    return null;
  }

  const url = new URL(`${BUSMAPS_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.append(k, v);
    }
  });

  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'capi-key': `Bearer ${busMapsKey}`,
      'capi-host': 'busmaps.com'
    }
  });

  if (!res.ok) return null;
  return res.json();
}

/** Convert BusMaps raw vehicle positions to bus objects */
function vehiclePositionsToBuses(vehicles) {
  if (!vehicles || !Array.isArray(vehicles)) return [];
  return vehicles.map((v, i) => ({
    id: v.vehicle_id || v.id || `bus-${Math.random()}`,
    routeId: v.route_id || '',
    lat: v.lat || v.latitude || 0,
    lng: v.lng || v.longitude || 0,
    heading: v.heading || 0,
    nextStop: v.next_stop || '',
    eta: v.eta || '',
    updatedAt: v.timestamp || new Date().toISOString(),
    vehicleNumber: v.vehicle_number || v.license_plate || '',
    speed: v.speed || 0,
    realTime: true
  }));
}

/** Create simulated buses spaced along route geometry */
function createSimulatedBuses(stops, routeId, routeNumber, busCount = 4) {
  if (!stops || stops.length === 0) return [];
  const buses = [];
  const count = Math.min(Math.max(busCount, 1), stops.length);
  const step = Math.floor((stops.length - 1) / (count - 1)) || 1;
  for (let i = 0; i < count; i++) {
    const idx = Math.min(i * step, stops.length - 1);
    const stop = stops[idx];
    const isLast = idx >= stops.length - 1;
    buses.push({
      id: `sim-${routeId}-${i}`, routeId, lat: stop.lat, lng: stop.lng,
      heading: isLast ? 0 : 90,
      nextStop: isLast ? stop.name : stops[idx + 1]?.name || '',
      eta: isLast ? 'Đến cuối' : `${Math.max(1, (idx + 1) * 3)} phút`,
      updatedAt: new Date().toISOString(), vehicleNumber: `Xe ${i + 1}`,
      speed: isLast ? 0 : 25, simulated: true
    });
  }
  return buses;
}

// Mock route data for HCMC and Hanoi (fallback when no API key)
const MOCK_ROUTES = {
  hcmc: [
    {
      id: 'hcmc-01', number: '01', name: 'Bến Thành – Chợ Lớn',
      startStation: 'Bến Thành', endStation: 'Chợ Lớn', color: '#1976d2',
      stops: [
        { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 1 },
        { name: 'Điện Biên Phủ', lat: 10.7800, lng: 106.6800, seq: 2 },
        { name: 'Nguyễn Huệ', lat: 10.7780, lng: 106.7000, seq: 3 },
        { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 4 }
      ]
    },
    {
      id: 'hcmc-04', number: '04', name: 'Bến Xe Miền Đông – Chợ Lớn',
      startStation: 'Bến Xe Miền Đông', endStation: 'Chợ Lớn', color: '#4caf50',
      stops: [
        { name: 'Bến Xe Miền Đông', lat: 10.8100, lng: 106.7100, seq: 1 },
        { name: 'Điện Biên Phủ', lat: 10.7900, lng: 106.6900, seq: 2 },
        { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 3 }
      ]
    },
    {
      id: 'hcmc-15', number: '15', name: 'Bến Thành – Chợ Rùng',
      startStation: 'Bến Thành', endStation: 'Chợ Rùng', color: '#ff9800',
      stops: [
        { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 1 },
        { name: 'Nguyễn Huệ', lat: 10.7780, lng: 106.7000, seq: 2 },
        { name: 'Chợ Rùng', lat: 10.7300, lng: 106.7200, seq: 3 }
      ]
    },
    {
      id: 'hcmc-18', number: '18', name: 'Chợ Lớn – Bến Xe Miền Tây',
      startStation: 'Chợ Lớn', endStation: 'Bến Xe Miền Tây', color: '#e91e63',
      stops: [
        { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 1 },
        { name: 'Nguyễn Trọng Trí', lat: 10.7400, lng: 106.6600, seq: 2 },
        { name: 'Bến Xe Miền Tây', lat: 10.7600, lng: 106.6200, seq: 3 }
      ]
    },
    {
      id: 'hcmc-19', number: '19', name: 'Chợ Lớn – Bến Thành',
      startStation: 'Chợ Lớn', endStation: 'Bến Thành', color: '#9c27b0',
      stops: [
        { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 1 },
        { name: 'Điện Biên Phủ', lat: 10.7800, lng: 106.6800, seq: 2 },
        { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 3 }
      ]
    }
  ],
  hanoi: [
    {
      id: 'hn-01', number: '01', name: 'Yên Nghĩa – Long Biên',
      startStation: 'Yên Nghĩa', endStation: 'Long Biên', color: '#1976d2',
      stops: [
        { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 1 },
        { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 2 },
        { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 3 }
      ]
    },
    {
      id: 'hn-09', number: '09', name: 'Long Biên – Yên Nghĩa',
      startStation: 'Long Biên', endStation: 'Yên Nghĩa', color: '#4caf50',
      stops: [
        { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 1 },
        { name: 'Bát Tràng', lat: 21.0300, lng: 105.8300, seq: 2 },
        { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 3 }
      ]
    },
    {
      id: 'hn-14', number: '14', name: 'Cầu Giấy – Bát Tràng',
      startStation: 'Cầu Giấy', endStation: 'Bát Tràng', color: '#ff9800',
      stops: [
        { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 1 },
        { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 2 },
        { name: 'Bát Tràng', lat: 21.0300, lng: 105.8300, seq: 3 }
      ]
    },
    {
      id: 'hn-32', number: '32', name: 'Yên Nghĩa – Bạch Mai',
      startStation: 'Yên Nghĩa', endStation: 'Bạch Mai', color: '#e91e63',
      stops: [
        { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 1 },
        { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 2 },
        { name: 'Bạch Mai', lat: 21.0000, lng: 105.8300, seq: 3 }
      ]
    },
    {
      id: 'hn-44', number: '44', name: 'Cầu Giấy – Long Biên',
      startStation: 'Cầu Giấy', endStation: 'Long Biên', color: '#9c27b0',
      stops: [
        { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 1 },
        { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 2 }
      ]
    }
  ]
};

// ---- Worker ----
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const path = url.pathname;

    // ---- Health ----
    if (path === '/api/health' || path === '/api/health/') {
      return json({ status: 'ok', service: 'bus-tracker-vn-worker', time: new Date().toISOString() });
    }

    // ---- Bus data: /api/buses?city=hcmc|hanoi ----
    if (path === '/api/buses' || path === '/api/buses/') {
      const city = (url.searchParams.get('city') || 'hcmc').toLowerCase();

      const routes = [];

      // Try real-time vehicle positions from BusMaps API
      const busMapsKey = BUSMAPS_API_KEY || '';
      const hasApiKey = busMapsKey && busMapsKey !== 'BUSMAPS_API_KEY_PLACEHOLDER';

      if (hasApiKey) {
        // City bounding boxes for vehicle position queries
        const cityBounds = {
          hcmc: { minLat: 10.6, minLng: 106.5, maxLat: 10.9, maxLng: 106.9 },
          hanoi: { minLat: 20.9, minLng: 105.7, maxLat: 21.1, maxLng: 105.9 }
        };

        const bounds = cityBounds[city];
        if (bounds) {
          const vehicleData = await busmapsFetch('/v1/rawVehiclePositions', {
            minLat: bounds.minLat,
            minLng: bounds.minLng,
            maxLat: bounds.maxLat,
            maxLng: bounds.maxLng
          });

          if (vehicleData && vehicleData.vehicles) {
            // Group vehicles by route ID
            const routeBuses = {};
            for (const v of vehicleData.vehicles) {
              const rid = v.route_id || 'unknown';
              if (!routeBuses[rid]) routeBuses[rid] = [];
              routeBuses[rid].push({
                id: v.vehicle_id || `bus-${Math.random()}`,
                routeId: rid,
                lat: v.lat || v.latitude || 0,
                lng: v.lng || v.longitude || 0,
                heading: v.heading || 0,
                nextStop: v.next_stop || '',
                eta: v.eta || '',
                updatedAt: v.timestamp || new Date().toISOString(),
                vehicleNumber: v.vehicle_number || v.license_plate || '',
                speed: v.speed || 0,
                realTime: true
              });
            }

            // Create route entries from vehicles found
            for (const [routeId, buses] of Object.entries(routeBuses)) {
              routes.push({
                id: `busmap-${routeId}`, number: routeId,
                name: `Tuyến ${routeId}`,
                startStation: buses[0]?.nextStop || '',
                endStation: '',
                color: '#1976d2',
                stops: [],
                buses,
                busCount: buses.length
              });
            }
          }
        }
      }

      // If no real data or no API key, use mock data
      if (routes.length === 0) {
        const mockRoutes = MOCK_ROUTES[city] || MOCK_ROUTES.hcmc;
        for (const route of mockRoutes) {
          const buses = createSimulatedBuses(route.stops, route.id, route.number, 4);
          routes.push({
            ...route,
            buses,
            busCount: buses.length
          });
        }
      }

      return json({
        city,
        cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
        updatedAt: new Date().toISOString(),
        routes,
        source: hasApiKey && routes.some(r => r.buses.some(b => b.realTime)) ? 'live' : 'mock'
      });
    }

    // ---- Route detail: /api/route/:id ----
    if (path.startsWith('/api/route/')) {
      const id = path.split('/').pop();

      // Try BusMaps API for route detail
      const busMapsKey = BUSMAPS_API_KEY || '';
      if (busMapsKey && busMapsKey !== 'BUSMAPS_API_KEY_PLACEHOLDER') {
        // Try line endpoint
        const lineData = await busmapsFetch('/v1/line', {
          route_id: id
        });
        if (lineData && lineData.route) {
          return json({
            id: lineData.route.route_id || id,
            number: lineData.route.route_id || id,
            name: lineData.route.route_name || `Tuyến ${id}`,
            startStation: lineData.route.start_stop_name || '',
            endStation: lineData.route.end_stop_name || '',
            color: '#1976d2',
            stops: lineData.route.stops || [],
            buses: [],
            updatedAt: new Date().toISOString(), source: 'live'
          });
        }
      }

      // Fallback: mock data
      return json({
        id: `route-${id}`, number: id, name: `Tuyến ${id}`,
        startStation: '', endStation: '', color: '#1976d2',
        stops: [], buses: [], busCount: 4,
        routes: { go: [], back: [] },
        updatedAt: new Date().toISOString(), source: 'mock'
      });
    }

    // ---- Map tile proxy: /api/map-tiles/:z/:x/:y ----
    if (path.startsWith('/api/map-tiles/')) {
      const parts = path.split('/');
      const z = parts[3];
      const x = parts[4];
      const y = parts[5].replace('.png', '');

      const tileUrls = [
        `https://tiles.freeroute.org/${z}/${x}/${y}.png?key=${FREEROUTE_API_KEY}`,
        `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
      ];

      for (const tileUrl of tileUrls) {
        try {
          const tileRes = await fetch(tileUrl, {
            headers: { 'User-Agent': 'BusTrackerVN/1.0' }
          });
          if (tileRes.ok) {
            return new Response(tileRes.body, {
              status: 200,
              headers: {
                'Content-Type': tileRes.headers.get('content-type') || 'image/png',
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        } catch (e) {
          continue;
        }
      }

      return json({ error: 'Tile unavailable' }, 502);
    }

    return json({ error: 'Not found' }, 404);
  }
};
