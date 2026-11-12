/**
 * Bus Tracker VN - Local API Server
 * Runs on your Windows machine. Serves the frontend and proxies
 * requests to the real BusMap API endpoints discovered from APK decompilation,
 * with mock fallback when APIs are unreachable.
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Real BusMap API endpoints (discovered from APK decompilation) ----
const EMBUS_BASE = 'https://api-embus.busmap.vn/client/public';
const BUSMAP_BASE = 'https://api.busmap.vn/v2/public/busmap';

// ---- Timbus.vn API (accessible from Vietnam, needs session/cookies) ----
const TIMBUS_BASE = 'http://timbus.vn/Engine/Business/Search/action.ashx';
const TIMBUS_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
  'referer': 'http://timbus.vn/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'origin': 'http://timbus.vn'
};

const CITY_ROUTE_IDS = {
  hcmc: [1, 4, 15, 18, 19],
  hanoi: [1, 9, 14, 32, 44]
};

// ---- Mock data (fallback when real API unreachable) ----
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
          { id: 'hcmc-01-a', routeId: 'hcmc-01', lat: 10.7720, lng: 106.6780, heading: 90, nextStop: 'Nguyễn Huệ', eta: '3 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hcmc-04-a', routeId: 'hcmc-04', lat: 10.7950, lng: 106.6950, heading: 180, nextStop: 'Chợ Lớn', eta: '7 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hcmc-15-a', routeId: 'hcmc-15', lat: 10.7600, lng: 106.6900, heading: 45, nextStop: 'Chợ Rùng', eta: '12 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hcmc-18-a', routeId: 'hcmc-18', lat: 10.7450, lng: 106.6550, heading: 270, nextStop: 'Bến Xe Miền Tây', eta: '5 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hcmc-19-a', routeId: 'hcmc-19', lat: 10.7650, lng: 106.6750, heading: 0, nextStop: 'Điện Biên Phủ', eta: '4 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hn-01-a', routeId: 'hn-01', lat: 21.0100, lng: 105.8100, heading: 90, nextStop: 'Long Biên', eta: '6 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hn-09-a', routeId: 'hn-09', lat: 21.0300, lng: 105.8400, heading: 180, nextStop: 'Bát Tràng', eta: '8 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hn-14-a', routeId: 'hn-14', lat: 21.0250, lng: 105.8000, heading: 45, nextStop: 'Long Biên', eta: '10 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hn-32-a', routeId: 'hn-32', lat: 20.9800, lng: 105.8000, heading: 270, nextStop: 'Bạch Mai', eta: '5 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
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
          { id: 'hn-44-a', routeId: 'hn-44', lat: 21.0300, lng: 105.8200, heading: 0, nextStop: 'Long Biên', eta: '3 phút', updatedAt: new Date().toISOString(), vehicleNumber: '', speed: 0 }
        ]
      }
    ]
  }
};

// ---- Middleware ----
app.use(cors());
app.use(express.static(path.join(__dirname)));

// ---- Helper: fetch JSON with timeout ----
async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRouteDetail(routeId) {
  // Try embus API first (Vietnam-internal), then public busmap API
  const urls = [
    `${EMBUS_BASE}/route/detail?routeId=${routeId}`,
    `${BUSMAP_BASE}/estimate_bus_to_station?regionCode=hcmc&stationId=${routeId}&group=0`
  ];
  for (const url of urls) {
    const result = await fetchJson(url);
    if (result) return result;
  }
  return null;
}

async function fetchBusList(routeId, direction) {
  const url = `${EMBUS_BASE}/bus/list?routeId=${routeId}&direction=${direction}`;
  return fetchJson(url);
}

// ---- Timbus.vn fetch with session ----
async function timbusFetch(act, key, fid) {
  try {
    // Use Node's http/https for cookie handling without external deps
    const http = require('http');
    const https = require('https');
    const urlModule = require('url');

    return new Promise((resolve) => {
      let cookies = '';

      // Step 1: GET homepage to establish session
      const req1 = http.request({
        hostname: 'timbus.vn',
        port: 80,
        path: '/',
        method: 'GET',
        headers: { 'user-agent': TIMBUS_HEADERS['user-agent'] },
        timeout: 10000
      }, (res1) => {
        cookies = (res1.headers['set-cookie'] || []).join('; ');

        // Step 2: POST search/fleet request
        const body = act === 'fleetdetail'
          ? `act=fleetdetail&fid=${fid}`
          : `act=searchfull&typ=1&key=${key}`;

        const req2 = http.request({
          hostname: 'timbus.vn',
          port: 80,
          path: '/Engine/Business/Search/action.ashx',
          method: 'POST',
          headers: {
            ...TIMBUS_HEADERS,
            'cookie': cookies,
            'content-length': Buffer.byteLength(body)
          },
          timeout: 10000
        }, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({ _raw_text: data });
            }
          });
        });
        req2.on('error', (err) => { resolve(null); });
        req2.on('timeout', () => { req2.destroy(); resolve(null); });
        req2.write(body);
        req2.end();
      });
      req1.on('error', (err) => { resolve(null); });
      req1.on('timeout', () => { req1.destroy(); resolve(null); });
      req1.end();
    });
  } catch (err) {
    console.warn('timbus fetch error:', err.message);
    return null;
  }
}

// ---- API endpoint: GET /api/buses?city=hcmc|hanoi ----
app.get('/api/buses', async (req, res) => {
  const city = (req.query.city || 'hcmc').toLowerCase();
  const routeIds = CITY_ROUTE_IDS[city] || CITY_ROUTE_IDS.hcmc;

  const routes = [];
  let liveData = false;

  // --- Try BusMap APIs first ---
  for (const routeId of routeIds) {
    try {
      console.log(`Fetching route ${routeId} for ${city} (BusMap)...`);

      const route = await fetchRouteDetail(routeId);
      if (!route) {
        console.log(`Route ${routeId}: no BusMap route data`);
        continue;
      }

      const busesRaw = await fetchBusList(routeId, 0) || [];
      liveData = true;

      console.log(`Route ${routeId}: ${busesRaw.length} buses found (BusMap)`);

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
          updatedAt: b.time ? new Date(b.time * 1000).toISOString() : new Date().toISOString(),
          vehicleNumber: b.vehicleNumber || '',
          speed: b.speed || 0
        }))
      });
    } catch (err) {
      console.warn(`Route ${routeId} failed:`, err.message);
      continue;
    }
  }

  // --- Try timbus.vn if BusMap returned nothing ---
  if (routes.length === 0) {
    console.log(`Trying timbus.vn for ${city}...`);
    const timbusResult = await timbusFetch('searchfull', city === 'hcmc' ? '60B' : '01');
    console.log('timbus.vn result:', JSON.stringify(timbusResult).slice(0, 500));

    if (timbusResult && timbusResult.success && timbusResult.dt) {
      liveData = true;
      const data = timbusResult.dt.Data || timbusResult.dt || [];
      if (Array.isArray(data)) {
        data.forEach((item, i) => {
          // Parse "RouteNumber - StartStation - EndStation" from Name field
          const nameParts = (item.Name || '').split(' - ');
          const routeNumber = nameParts[0] || `TB${i}`;
          const startStation = nameParts[1] || '';
          const endStation = nameParts[2] || '';

          routes.push({
            id: `timbus-${item.ObjectID || i}`,
            number: item.FleedCode || routeNumber,
            name: item.Name || `Tuyến timbus ${i}`,
            startStation: startStation,
            endStation: endStation,
            color: '#1976d2',
            stops: [
              { name: startStation, lat: 0, lng: 0, seq: 1 },
              { name: endStation, lat: 0, lng: 0, seq: 2 }
            ],
            buses: [] // timbus.vn searchfull doesn't include real-time positions
          });
        });
      }
    }
  }

  if (routes.length === 0) {
    const mock = MOCK_DATA[city] || MOCK_DATA.hcmc;
    console.log(`No live data for ${city}, using mock data`);
    res.json({ ...mock, updatedAt: new Date().toISOString(), source: 'mock' });
    return;
  }

  res.json({
    city,
    cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
    updatedAt: new Date().toISOString(),
    routes,
    source: liveData ? 'live' : 'mock'
  });
});

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, time: new Date().toISOString() });
});

// ---- FreeRoute map tile proxy ----
app.get('/api/map-tiles/:z/:x/:y', async (req, res) => {
  const { z, x, y } = req.params;
  const freerouteKey = process.env.FREEROUTE_API_KEY || 'fro_80bfff714e74d8e8e56588a544113339e40f657011771cb54d4fe32c99010d11';
  const tileUrls = [
    `https://tiles.freeroute.org/${z}/${x}/${y}.png?key=${freerouteKey}`,
    `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  ];

  for (const tileUrl of tileUrls) {
    try {
      const tileRes = await fetch(tileUrl, {
        headers: { 'User-Agent': 'BusTrackerVN/1.0' }
      });
      if (tileRes.ok) {
        res.set('Content-Type', tileRes.headers.get('content-type') || 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        const buffer = await tileRes.arrayBuffer();
        res.send(Buffer.from(buffer));
        return;
      }
    } catch (err) {
      continue;
    }
  }
  res.status(502).json({ error: 'Tile proxy failed', message: 'All tile sources unavailable' });
});

// ---- Serve frontend ----
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Bus Tracker VN local server running at http://localhost:${PORT}`);
  console.log(`Open: http://localhost:${PORT}/`);
});
