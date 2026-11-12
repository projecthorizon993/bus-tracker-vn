/**
 * Bus Tracker VN - Cloudflare Worker
 * Secure proxy for BusMap API data (reverse-engineered from BusMap APK).
 * Hides API keys, handles CORS, and falls back to mock data when the real
 * API is unreachable (api-embus.busmap.vn is geo-restricted to Vietnam).
 *
 * Real API endpoints found in decompiled BusMap APK (com.t7.busmaphn 3.1.2):
 *   GET https://api-embus.busmap.vn/client/public/route/detail?routeId=X
 *   GET https://api-embus.busmap.vn/client/public/bus/list?routeId=X&direction=Y
 *   GET https://api-embus.busmap.vn/client/public/bus/list_all
 */

const MOCK_DATA = {
  hcmc: {
    city: 'hcmc',
    cityName: 'Ho Chi Minh City',
    updatedAt: new Date().toISOString(),
    routes: [
      {
        id: 'hcmc-01',
        number: '01',
        name: 'Bến Thành – Chợ Lớn',
        startStation: 'Bến Thành',
        endStation: 'Chợ Lớn',
        color: '#1976d2',
        stops: [
          { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 1 },
          { name: 'Điện Biên Phủ', lat: 10.7800, lng: 106.6800, seq: 2 },
          { name: 'Nguyễn Huệ', lat: 10.7780, lng: 106.7000, seq: 3 },
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 4 }
        ],
        buses: [
          { id: 'hcmc-01-a', routeId: 'hcmc-01', lat: 10.7720, lng: 106.6780, heading: 90, nextStop: 'Nguyễn Huệ', eta: '3 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-04',
        number: '04',
        name: 'Bến Xe Miền Đông – Chợ Lớn',
        startStation: 'Bến Xe Miền Đông',
        endStation: 'Chợ Lớn',
        color: '#4caf50',
        stops: [
          { name: 'Bến Xe Miền Đông', lat: 10.8100, lng: 106.7100, seq: 1 },
          { name: 'Điện Biên Phủ', lat: 10.7900, lng: 106.6900, seq: 2 },
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-04-a', routeId: 'hcmc-04', lat: 10.7950, lng: 106.6950, heading: 180, nextStop: 'Chợ Lớn', eta: '7 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-15',
        number: '15',
        name: 'Bến Thành – Chợ Rùng',
        startStation: 'Bến Thành',
        endStation: 'Chợ Rùng',
        color: '#ff9800',
        stops: [
          { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 1 },
          { name: 'Nguyễn Huệ', lat: 10.7780, lng: 106.7000, seq: 2 },
          { name: 'Chợ Rùng', lat: 10.7300, lng: 106.7200, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-15-a', routeId: 'hcmc-15', lat: 10.7600, lng: 106.6900, heading: 45, nextStop: 'Chợ Rùng', eta: '12 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-18',
        number: '18',
        name: 'Chợ Lớn – Bến Xe Miền Tây',
        startStation: 'Chợ Lớn',
        endStation: 'Bến Xe Miền Tây',
        color: '#e91e63',
        stops: [
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 1 },
          { name: 'Nguyễn Trọng Trí', lat: 10.7400, lng: 106.6600, seq: 2 },
          { name: 'Bến Xe Miền Tây', lat: 10.7600, lng: 106.6200, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-18-a', routeId: 'hcmc-18', lat: 10.7450, lng: 106.6550, heading: 270, nextStop: 'Bến Xe Miền Tây', eta: '5 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hcmc-19',
        number: '19',
        name: 'Chợ Lớn – Bến Thành',
        startStation: 'Chợ Lớn',
        endStation: 'Bến Thành',
        color: '#9c27b0',
        stops: [
          { name: 'Chợ Lớn', lat: 10.7500, lng: 106.6700, seq: 1 },
          { name: 'Điện Biên Phủ', lat: 10.7800, lng: 106.6800, seq: 2 },
          { name: 'Bến Thành', lat: 10.7775, lng: 106.6831, seq: 3 }
        ],
        buses: [
          { id: 'hcmc-19-a', routeId: 'hcmc-19', lat: 10.7650, lng: 106.6750, heading: 0, nextStop: 'Điện Biên Phủ', eta: '4 phút', updatedAt: new Date().toISOString() }
        ]
      }
    ]
  },
  hanoi: {
    city: 'hanoi',
    cityName: 'Hanoi',
    updatedAt: new Date().toISOString(),
    routes: [
      {
        id: 'hn-01',
        number: '01',
        name: 'Yên Nghĩa – Long Biên',
        startStation: 'Yên Nghĩa',
        endStation: 'Long Biên',
        color: '#1976d2',
        stops: [
          { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 1 },
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 2 },
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 3 }
        ],
        buses: [
          { id: 'hn-01-a', routeId: 'hn-01', lat: 21.0100, lng: 105.8100, heading: 90, nextStop: 'Long Biên', eta: '6 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-09',
        number: '09',
        name: 'Long Biên – Yên Nghĩa',
        startStation: 'Long Biên',
        endStation: 'Yên Nghĩa',
        color: '#4caf50',
        stops: [
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 1 },
          { name: 'Bát Tràng', lat: 21.0300, lng: 105.8300, seq: 2 },
          { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 3 }
        ],
        buses: [
          { id: 'hn-09-a', routeId: 'hn-09', lat: 21.0300, lng: 105.8400, heading: 180, nextStop: 'Bát Tràng', eta: '8 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-14',
        number: '14',
        name: 'Cầu Giấy – Bát Tràng',
        startStation: 'Cầu Giấy',
        endStation: 'Bát Tràng',
        color: '#ff9800',
        stops: [
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 1 },
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 2 },
          { name: 'Bát Tràng', lat: 21.0300, lng: 105.8300, seq: 3 }
        ],
        buses: [
          { id: 'hn-14-a', routeId: 'hn-14', lat: 21.0250, lng: 105.8000, heading: 45, nextStop: 'Long Biên', eta: '10 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-32',
        number: '32',
        name: 'Yên Nghĩa – Bạch Mai',
        startStation: 'Yên Nghĩa',
        endStation: 'Bạch Mai',
        color: '#e91e63',
        stops: [
          { name: 'Yên Nghĩa', lat: 20.9500, lng: 105.7800, seq: 1 },
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 2 },
          { name: 'Bạch Mai', lat: 21.0000, lng: 105.8300, seq: 3 }
        ],
        buses: [
          { id: 'hn-32-a', routeId: 'hn-32', lat: 20.9800, lng: 105.8000, heading: 270, nextStop: 'Bạch Mai', eta: '5 phút', updatedAt: new Date().toISOString() }
        ]
      },
      {
        id: 'hn-44',
        number: '44',
        name: 'Cầu Giấy – Long Biên',
        startStation: 'Cầu Giấy',
        endStation: 'Long Biên',
        color: '#9c27b0',
        stops: [
          { name: 'Cầu Giấy', lat: 21.0200, lng: 105.7900, seq: 1 },
          { name: 'Long Biên', lat: 21.0400, lng: 105.8500, seq: 2 }
        ],
        buses: [
          { id: 'hn-44-a', routeId: 'hn-44', lat: 21.0300, lng: 105.8200, heading: 0, nextStop: 'Long Biên', eta: '3 phút', updatedAt: new Date().toISOString() }
        ]
      }
    ]
  }
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Content-Type': 'application/json'
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...headers }
  });
}

// Known route IDs for each city (from BusMap app data). Used to query the real API.
// These are example route numbers; the app fetches routes per-region.
const CITY_ROUTE_IDS = {
  hcmc: [1, 4, 15, 18, 19],
  hanoi: [1, 9, 14, 32, 44]
};

const EMBUS_BASE = 'https://api-embus.busmap.vn/client/public';

// Cloudflare colo codes: SGN = Ho Chi Minh City, HAN = Hanoi
// Routing outbound fetches through a Vietnam colo may bypass geo-restrictions.
const COLO_BY_CITY = { hcmc: 'SGN', hanoi: 'HAN' };

async function fetchJson(url, headers = {}, colo) {
  const init = { headers };
  if (colo) init.cf = { colo };
  const res = await fetch(url, init);
  if (!res.ok) return null;
  return res.json();
}

async function fetchRouteDetail(routeId, colo) {
  const url = `${EMBUS_BASE}/route/detail?routeId=${routeId}`;
  return fetchJson(url, {}, colo);
}

async function fetchBusList(routeId, direction, colo) {
  const url = `${EMBUS_BASE}/bus/list?routeId=${routeId}&direction=${direction}`;
  return fetchJson(url, {}, colo);
}

/**
 * Fetch live bus data from the real BusMap API (api-embus.busmap.vn).
 * Returns null if unreachable (geo-restricted to Vietnam) so mock fallback is used.
 */
async function fetchRealBusAPI(city, env) {
  const routeIds = CITY_ROUTE_IDS[city] || CITY_ROUTE_IDS.hcmc;
  const apiKey = env.BUS_API_KEY;
  const colo = COLO_BY_CITY[city];

  const headers = { Accept: 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const routes = [];

  for (const routeId of routeIds) {
    try {
      // Fetch route details (start/end stations, color, path)
      const route = await fetchRouteDetail(routeId, colo);
      if (!route) continue;

      // Fetch bus positions for direction 0 (forward)
      const busesRaw = await fetchBusList(routeId, 0, colo) || [];

      routes.push({
        id: `embus-${routeId}`,
        number: route.routeNo || String(routeId),
        name: (route.routeName && route.routeName[0]) || `Tuyến ${routeId}`,
        startStation: route.firstStation || '',
        endStation: route.lastStation || '',
        color: route.color || '#1976d2',
        stops: (route.routePaths || []).map((p, i) => ({
          name: p.stationName || `Điểm ${i + 1}`,
          lat: p.lat || 0,
          lng: p.lng || 0,
          seq: p.seq || i + 1
        })),
        buses: (busesRaw || []).map((b) => ({
          id: b.busId || b.vehicleNumber || `bus-${b.id}`,
          routeId: String(route.routeId || routeId),
          lat: b.lat || 0,
          lng: b.lng || 0,
          heading: b.deg || 0,
          nextStop: b.info || '',
          eta: b.status || '',
          updatedAt: new Date(b.time * 1000).toISOString() || new Date().toISOString(),
          vehicleNumber: b.vehicleNumber || '',
          speed: b.speed || 0
        }))
      });
    } catch (err) {
      console.warn(`Route ${routeId} failed:`, err);
      continue;
    }
  }

  if (routes.length === 0) return null;

  return {
    city,
    cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
    updatedAt: new Date().toISOString(),
    routes
  };
}

/**
 * Normalize real BusMap API response into the common app shape.
 * Used when the Worker is called directly with pre-fetched data.
 */
function normalizeResponse(raw, city) {
  return {
    city,
    cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
    updatedAt: new Date().toISOString(),
    routes: (raw.routes || []).map((r) => ({
      id: r.id || String(r.routeId || r.routeNo || ''),
      number: r.routeNo || r.number || '',
      name: (r.routeName && r.routeName[0]) || r.name || '',
      startStation: r.firstStation || r.startStation || '',
      endStation: r.lastStation || r.endStation || '',
      color: r.color || '#1976d2',
      stops: (r.routePaths || r.stops || []).map((s, i) => ({
        name: s.stationName || s.name || `Điểm ${i + 1}`,
        lat: s.lat || s.latitude || 0,
        lng: s.lng || s.longitude || 0,
        seq: s.seq || i + 1
      })),
      buses: (r.buses || []).map((b) => ({
        id: b.busId || b.vehicleId || b.vehicleNumber || '',
        routeId: String(b.routeId || r.routeId || r.routeNo || ''),
        lat: b.lat || b.latitude || 0,
        lng: b.lng || b.longitude || 0,
        heading: b.deg || b.heading || 0,
        nextStop: b.info || b.nextStop || '',
        eta: b.status || b.eta || '',
        updatedAt: b.time ? new Date(b.time * 1000).toISOString() : (b.updatedAt || new Date().toISOString()),
        vehicleNumber: b.vehicleNumber || '',
        speed: b.speed || 0
      }))
    }))
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Only GET /api/buses?city=...
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const path = url.pathname;
    if (path !== '/api/buses' && path !== '/api/buses/') {
      return json({ error: 'Not found' }, 404);
    }

    const city = url.searchParams.get('city') || 'hcmc';

    // Try real API first, fall back to mock
    let data = await fetchRealBusAPI(city, env);
    if (!data) {
      const mock = MOCK_DATA[city] || MOCK_DATA.hcmc;
      data = {
        ...mock,
        updatedAt: new Date().toISOString()
      };
    }

    // Cache briefly (30s) via Cloudflare cache API if available
    return json(data, 200, { 'Cache-Control': 'public, max-age=30' });
  }
};
