/**
 * Bus Tracker VN - Cloudflare Worker
 * Backend proxy for timbus.vn bus data and FreeRoute map tiles.
 * Hides API keys server-side, handles CORS, manages timbus.vn session cookies.
 */

// ---- Config ----
const FREEROUTE_API_KEY = 'fro_80bfff714e74d8e8e56588a544113339e40f657011771cb54d4fe32c99010d11';

const TIMBUS_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'referer': 'http://timbus.vn/'
};

const TIMBUS_API_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
  'referer': 'http://timbus.vn/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'origin': 'http://timbus.vn'
};

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

async function getSessionCookie() {
  try {
    const homeRes = await fetch('http://timbus.vn/', {
      headers: { 'user-agent': TIMBUS_HEADERS['user-agent'] },
      redirect: 'follow'
    });
    const setCookie = homeRes.headers.get('set-cookie') || '';
    const sessionMatch = setCookie.match(/ASP.NET_SessionId=([^;]+)/);
    return sessionMatch ? sessionMatch[1] : '';
  } catch (e) {
    return '';
  }
}

async function timbusPost(basePath, actParams, cookie) {
  const body = Object.entries(actParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const postRes = await fetch(`http://timbus.vn${basePath}`, {
    method: 'POST',
    headers: {
      ...TIMBUS_API_HEADERS,
      'cookie': `ASP.NET_SessionId=${cookie}`,
      'content-length': String(body.length)
    },
    body
  });
  if (!postRes.ok) return null;
  const text = await postRes.text();
  try { return JSON.parse(text); } catch (e) { return { _raw_text: text }; }
}

async function getAllRouteIds(cookie) {
  try {
    const res = await fetch('http://timbus.vn/fleets.aspx', {
      headers: { 'user-agent': TIMBUS_HEADERS['user-agent'], 'cookie': `ASP.NET_SessionId=${cookie}` },
      redirect: 'follow'
    });
    if (!res.ok) return { ids: [], routeNames: {} };
    const html = await res.text();
    const routeIdMatches = [...html.matchAll(/fleed-hide-show-(\d+)/g)];
    const ids = [...new Set(routeIdMatches.map(m => m[1]))];
    const routeNames = {};
    const nameMatches = [...html.matchAll(/Tuy[nê]?n\s*\[(\d+)\]\s*([^<]+)/g)];
    for (const m of nameMatches) {
      routeNames[m[1]] = m[2].trim();
    }
    return { ids, routeNames };
  } catch (e) {
    return { ids: [], routeNames: {} };
  }
}

function parseRouteName(name) {
  const parts = (name || '').split(' - ');
  return { number: parts[0] || '', startStation: parts[1] || '', endStation: parts[2] || '' };
}

function geoToStops(geo) {
  if (!geo || !Array.isArray(geo)) return [];
  return geo.map((p, i) => ({ name: p.Name || `Điểm ${i + 1}`, lat: p.Lat || 0, lng: p.Lng || 0, seq: i + 1 }));
}

function pathWithDistances(points) {
  if (!points || points.length === 0) return [];
  const result = [{ lat: points[0].lat, lng: points[0].lng, dist: 0 }];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng);
    result.push({ lat: points[i].lat, lng: points[i].lng, dist: total });
  }
  return result;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dphi = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function pointAtDistance(pathWithDist, distFromStart) {
  if (!pathWithDist || pathWithDist.length === 0) return { lat: 0, lng: 0 };
  if (distFromStart <= 0) return { lat: pathWithDist[0].lat, lng: pathWithDist[0].lng };
  if (distFromStart >= pathWithDist[pathWithDist.length-1].dist) {
    const last = pathWithDist[pathWithDist.length-1];
    return { lat: last.lat, lng: last.lng };
  }
  for (let i = 0; i < pathWithDist.length - 1; i++) {
    const p1 = pathWithDist[i], p2 = pathWithDist[i+1];
    if (distFromStart >= p1.dist && distFromStart <= p2.dist) {
      const t = (distFromStart - p1.dist) / (p2.dist - p1.dist);
      return { lat: p1.lat + (p2.lat - p1.lat)*t, lng: p1.lng + (p2.lng - p1.lng)*t };
    }
  }
  const last = pathWithDist[pathWithDist.length-1];
  return { lat: last.lat, lng: last.lng };
}

async function getVehiclesAtStation(cookie, stationId) {
  return timbusPost('/Engine/Business/Vehicle/action.ashx', {
    act: 'partremained', State: 'true', StationID: String(stationId), FleetOver: ''
  }, cookie);
}

function formatETA(seconds) {
  if (!seconds || seconds <= 0) return 'Lên lịch';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} phút` : `${s} giây`;
}

function createSimulatedBuses(stops, routeId, routeNumber, busCount = 3) {
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
      heading: isLast ? 0 : 90, nextStop: isLast ? stop.name : stops[idx + 1]?.name || '',
      eta: isLast ? 'Đến cuối' : `${Math.max(1, (idx + 1) * 3)} phút`,
      updatedAt: new Date().toISOString(), vehicleNumber: `Xe ${i + 1}`,
      speed: isLast ? 0 : 25, simulated: true
    });
  }
  return buses;
}

async function processRouteData(fd, routeId, cookie) {
  const parsed = parseRouteName(fd.Name || `Tuyến ${routeId}`);
  const stops = geoToStops(fd.Go?.Geo || []);
  const pathDist = pathWithDistances(fd.Go?.Geo?.map(p => ({ lat: p.Lat, lng: p.Lng })) || []);
  const totalDistance = pathDist.length > 0 ? pathDist[pathDist.length-1].dist : 0;

  let stationIds = [];
  if (fd.Station && Array.isArray(fd.Station)) {
    stationIds = fd.Station.filter(s => s.ObjectID).map(s => s.ObjectID);
  }

  let buses = [];
  for (const sid of stationIds.slice(0, 5)) {
    try {
      const vr = await getVehiclesAtStation(cookie, sid);
      if (vr && vr.success) {
        const vdata = vr.dt || vr.data || vr;
        if (Array.isArray(vdata)) {
          for (const v of vdata) {
            const plate = v.BienKiemSoat || v.LicensePlate || '';
            const etaSeconds = v.TimeRemained || v.PartRemained || 0;
            let busLat, busLng;
            if (v.PartRemained && totalDistance > 0) {
              const distFromStart = Math.max(0, totalDistance - v.PartRemained);
              const pos = pointAtDistance(pathDist, distFromStart);
              busLat = pos.lat; busLng = pos.lng;
            } else {
              const station = fd.Station.find(s => s.ObjectID == sid);
              busLat = station?.Geo?.Lat || 0; busLng = station?.Geo?.Lng || 0;
            }
            buses.push({
              id: plate || `bus-${Math.random()}`, routeId: fd.Code || routeId,
              lat: busLat, lng: busLng, heading: 0,
              nextStop: fd.LastStation || parsed.endStation,
              eta: formatETA(etaSeconds), updatedAt: new Date().toISOString(),
              vehicleNumber: plate, speed: v.Speed || 0,
              fleetCode: v.FleetCode || v.Fleet || '',
              timeRemainedSeconds: etaSeconds, distanceRemaining: v.PartRemained || 0,
              realTime: true
            });
          }
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }

  if (buses.length === 0 && stops.length > 0) {
    buses = createSimulatedBuses(stops, routeId, parsed.number, fd.BusCount || 3);
    buses = buses.map(b => ({ ...b, simulated: true }));
  }

  return {
    id: `timbus-${routeId}`, number: fd.Code || parsed.number,
    name: fd.Name || `Tuyến ${routeId}`, startStation: fd.FirstStation || parsed.startStation,
    endStation: fd.LastStation || parsed.endStation, color: '#1976d2',
    stops, buses, busCount: fd.BusCount || 3, totalDistance
  };
}

// ---- Worker ----
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

    const path = url.pathname;

    if (path === '/api/health' || path === '/api/health/') {
      return json({ status: 'ok', service: 'bus-tracker-vn-worker', time: new Date().toISOString() });
    }

    if (path === '/api/buses' || path === '/api/buses/') {
      const city = (url.searchParams.get('city') || 'hcmc').toLowerCase();
      const cookie = await getSessionCookie();
      const searchKeys = city === 'hcmc' ? ['60B', '1', '4', '15', '18', '19', '2', '3', '5', '6', '7', '8', '9', '10', '11'] : ['01', '03A', '04', '05', '06A', '07', '14', '32', '44', '09', '16', '17', '18', '19', '20'];

      const routes = [];
      for (const key of searchKeys.slice(0, MAX_ROUTES_PER_CITY)) {
        try {
          const timbus = await timbusPost('/Engine/Business/Search/action.ashx', {
            act: 'searchfull', typ: '1', key: key
          }, cookie);
          if (!timbus || !timbus.success || !timbus.dt || !Array.isArray(timbus.dt.Data)) continue;
          for (const item of timbus.dt.Data) {
            try {
              const fleet = await timbusPost('/Engine/Business/Search/action.ashx', {
                act: 'fleetdetail', fid: item.ObjectID
              }, cookie);
              if (!fleet || !fleet.success || !fleet.dt) continue;
              const routeData = await processRouteData(fleet.dt, item.ObjectID, cookie);
              if (routeData) routes.push(routeData);
            } catch (e) {}
          }
        } catch (e) {}
      }

      if (routes.length === 0) {
        return json({ city, cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
          updatedAt: new Date().toISOString(), routes: [], source: 'mock', error: 'No data from timbus.vn' });
      }
      return json({ city, cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
        updatedAt: new Date().toISOString(), routes, source: 'live', routeCount: routes.length });
    }

    if (path.startsWith('/api/route/')) {
      const id = path.split('/').pop();
      const cookie = await getSessionCookie();
      const fleet = await timbusPost('/Engine/Business/Search/action.ashx', { act: 'fleetdetail', fid: id }, cookie);
      if (!fleet || !fleet.success || !fleet.dt) return json({ error: 'Route not found' }, 404);
      const fd = fleet.dt;
      const parsed = parseRouteName(fd.Name);
      const stops = geoToStops(fd.Go?.Geo || []);
      let stations = stops;
      if (fd.Station && Array.isArray(fd.Station)) {
        stations = stops.map((s, i) => {
          const station = fd.Station[i];
          return { id: station?.ObjectID, code: station?.Code, name: station?.Name || s.name,
            lat: station?.Geo?.Lat || s.lat, lng: station?.Geo?.Lng || s.lng, seq: s.seq };
        });
      } else {
        stations = stops.map((s, i) => ({ id: null, code: null, name: s.name, lat: s.lat, lng: s.lng, seq: s.seq }));
      }
      let buses = [];
      if (fd.Station && Array.isArray(fd.Station)) {
        const stationIds = fd.Station.filter(s => s.ObjectID).map(s => s.ObjectID);
        for (const sid of stationIds.slice(0, 5)) {
          try {
            const vr = await getVehiclesAtStation(cookie, sid);
            if (vr && vr.success) {
              const vdata = vr.dt || vr.data || vr;
              if (Array.isArray(vdata)) {
                for (const v of vdata) {
                  const station = fd.Station.find(s => s.ObjectID == sid);
                  let busLat, busLng;
                  if (v.PartRemained && pathWithDistances(fd.Go?.Geo?.map(p => ({ lat: p.Lat, lng: p.Lng })) || []).length > 0) {
                    const pathDist = pathWithDistances(fd.Go?.Geo?.map(p => ({ lat: p.Lat, lng: p.Lng })) || []);
                    const distFromStart = Math.max(0, pathDist[pathDist.length-1].dist - v.PartRemained);
                    const pos = pointAtDistance(pathDist, distFromStart);
                    busLat = pos.lat; busLng = pos.lng;
                  } else {
                    busLat = station?.Geo?.Lat || 0; busLng = station?.Geo?.Lng || 0;
                  }
                  buses.push({
                    id: v.BienKiemSoat || `bus-${Math.random()}`, lat: busLat, lng: busLng, heading: 0,
                    nextStop: station?.Name || '', eta: formatETA(v.TimeRemained || v.PartRemained || 0),
                    updatedAt: new Date().toISOString(), vehicleNumber: v.BienKiemSoat || '',
                    speed: v.Speed || 0, fleetCode: v.FleetCode || v.Fleet || '',
                    timeRemainedSeconds: v.TimeRemained || v.PartRemained || 0,
                    distanceRemaining: v.PartRemained || 0, realTime: true
                  });
                }
              }
            }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 200));
        }
      }
      if (buses.length === 0 && stops.length > 0) {
        buses = createSimulatedBuses(stops, fd.FleetID || id, parsed.number, fd.BusCount || 3);
        buses = buses.map(b => ({ ...b, simulated: true }));
      }
      return json({
        id: fd.FleetID || id, number: fd.Code || parsed.number, name: fd.Name || `Tuyến ${id}`,
        startStation: fd.FirstStation || parsed.startStation, endStation: fd.LastStation || parsed.endStation,
        color: '#1976d2', routeNo: fd.Code, operationTime: fd.OperationsTime, frequency: fd.Frequency,
        cost: fd.Cost, enterprise: fd.Enterprise, busCount: fd.BusCount || 3,
        stops, stations,
        routes: { go: geoToStops(fd.Go?.Geo || []), back: geoToStops(fd.Re?.Geo || []) },
        buses, updatedAt: new Date().toISOString(), source: 'live'
      });
    }

    if (path.startsWith('/api/map-tiles/')) {
      const parts = path.split('/');
      const z = parts[3], x = parts[4], y = parts[5].replace('.png', '');
      const tileUrls = [
        `https://tiles.freeroute.org/${z}/${x}/${y}.png?key=${FREEROUTE_API_KEY}`,
        `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
      ];
      for (const tileUrl of tileUrls) {
        try {
          const tileRes = await fetch(tileUrl, { headers: { 'User-Agent': 'BusTrackerVN/1.0' } });
          if (tileRes.ok) {
            return new Response(tileRes.body, {
              status: 200,
              headers: { 'Content-Type': tileRes.headers.get('content-type') || 'image/png',
                'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' }
            });
          }
        } catch (e) { continue; }
      }
      return json({ error: 'Tile unavailable' }, 502);
    }
    return json({ error: 'Not found' }, 404);
  }
};
