/**
 * Bus Tracker VN - Cloudflare Worker
 * Backend proxy for timbus.vn bus data and FreeRoute map tiles.
 * Hides API keys server-side, handles CORS, manages timbus.vn session cookies.
 *
 * Endpoints (reverse-engineered from timbus.vn HAR + APK decompilation):
 *   POST /Engine/Business/Search/action.ashx?act=searchfull&typ=1&key=<query>  - search routes
 *   POST /Engine/Business/Search/action.ashx?act=fleetdetail&fid=<id>           - route detail + geometry
 *   POST /Engine/Business/Vehicle/action.ashx?act=partremained                  - vehicle ETA at station
 */

// ---- Config ----
const FREEROUTE_API_KEY = 'fro_80bfff714e74d8e8e56588a544113339e40f657011771cb54d4fe32c99010d11';

const TIMBUS_HEADERS = {
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

// ---- Helpers ----
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra }
  });
}

/**
 * timbus.vn session fetch: GET homepage first to get ASP.NET_SessionId cookie,
 * then POST to action.ashx with the cookie.
 */
async function timbusPost(basePath, actParams) {
  const cookieJar = {};

  // Step 1: GET homepage to establish session cookie
  const homeRes = await fetch('http://timbus.vn/', {
    headers: { 'user-agent': TIMBUS_HEADERS['user-agent'] },
    redirect: 'follow'
  });
  const setCookie = homeRes.headers.get('set-cookie') || '';
  const sessionMatch = setCookie.match(/ASP.NET_SessionId=([^;]+)/);
  if (sessionMatch) cookieJar['ASP.NET_SessionId'] = sessionMatch[1];

  // Step 2: POST to action.ashx
  const body = Object.entries(actParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  const postRes = await fetch(`http://timbus.vn${basePath}`, {
    method: 'POST',
    headers: {
      ...TIMBUS_HEADERS,
      'cookie': Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; '),
      'content-length': String(body.length)
    },
    body
  });

  if (!postRes.ok) return null;
  const text = await postRes.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { _raw_text: text };
  }
}

/** Parse "RouteNumber - StartStation - EndStation" from timbus.vn Name field */
function parseRouteName(name) {
  const parts = (name || '').split(' - ');
  return {
    number: parts[0] || '',
    startStation: parts[1] || '',
    endStation: parts[2] || ''
  };
}

/** Convert timbus.vn Geo array (Lat,Lng) to route stops - shows ALL points */
function geoToStops(geo) {
  if (!geo || !Array.isArray(geo)) return [];
  return geo.map((p, i) => ({
    name: p.Name || `Điểm ${i + 1}`,
    lat: p.Lat || 0,
    lng: p.Lng || 0,
    seq: i + 1
  }));
}

/**
 * Get real-time vehicle positions at a station.
 * act=partremained&State=true&StationID=<id>&FleetOver=
 * Returns buses approaching/at that station with ETA.
 */
async function getVehiclesAtStation(stationId) {
  const result = await timbusPost('/Engine/Business/Vehicle/action.ashx', {
    act: 'partremained',
    State: 'true',
    StationID: String(stationId),
    FleetOver: ''
  });
  return result;
}

/** Format seconds to readable time */
function formatETA(seconds) {
  if (!seconds || seconds <= 0) return 'Lên lịch';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m} phút`;
  return `${s} giây`;
}

/**
 * Create simulated buses spaced along a route's geometry.
 * Distributes busCount buses evenly along the Go.Geo path.
 */
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
      id: `sim-${routeId}-${i}`,
      routeId,
      lat: stop.lat,
      lng: stop.lng,
      heading: isLast ? 0 : 90,
      nextStop: isLast ? stop.name : stops[idx + 1]?.name || '',
      eta: isLast ? 'Đến cuối' : `${Math.max(1, (idx + 1) * 3)} phút`,
      updatedAt: new Date().toISOString(),
      vehicleNumber: `Xe ${i + 1}`,
      speed: isLast ? 0 : 25,
      simulated: true
    });
  }
  return buses;
}

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
      const searchKey = city === 'hcmc' ? '60B' : '01';

      const timbus = await timbusPost('/Engine/Business/Search/action.ashx', {
        act: 'searchfull',
        typ: '1',
        key: searchKey
      });
      const routes = [];

      if (timbus && timbus.success && timbus.dt && Array.isArray(timbus.dt.Data)) {
        for (const item of timbus.dt.Data) {
          const parsed = parseRouteName(item.Name);
          const fleet = await timbusPost('/Engine/Business/Search/action.ashx', {
            act: 'fleetdetail',
            fid: item.ObjectID
          });
          let stops = [];
          let stationIds = [];
          let buses = [];
          let busCount = 3; // default simulated bus count

          if (fleet && fleet.success && fleet.dt) {
            const fd = fleet.dt;

            // ALWAYS use ALL Go.Geo points as stops (full route geometry)
            stops = geoToStops(fd.Go?.Geo || []);

            // Use station list for names + ObjectIDs (for vehicle queries)
            // Merge station names onto geo stops where possible
            if (fd.Station && Array.isArray(fd.Station)) {
              stationIds = fd.Station.filter(s => s.ObjectID).map(s => s.ObjectID);
              // Overlay station names onto geo stops by matching index
              stops = stops.map((s, i) => {
                const station = fd.Station[i];
                return {
                  name: station?.Name || s.name,
                  lat: station?.Geo?.Lat || s.lat,
                  lng: station?.Geo?.Lng || s.lng,
                  seq: s.seq
                };
              });
            }

            busCount = fd.BusCount || 3;

            // Get real-time vehicle positions from first 5 stations (increased from 3)
            for (const sid of stationIds.slice(0, 5)) {
              try {
                const vr = await getVehiclesAtStation(sid);
                if (vr && vr.success) {
                  const vdata = vr.dt || vr.data || vr;
                  if (Array.isArray(vdata)) {
                    for (const v of vdata) {
                      const plate = v.BienKiemSoat || v.LicensePlate || '';
                      const fleetCode = v.FleetCode || v.Fleet || '';
                      const etaSeconds = v.TimeRemained || v.PartRemained || 0;
                      const speed = v.Speed || 0;

                      // Use the station where the vehicle was detected as its position
                      const station = fd.Station.find(s => s.ObjectID == sid);
                      buses.push({
                        id: plate || `real-${Math.random()}`,
                        routeId: item.FleedCode || item.ObjectID,
                        lat: station?.Geo?.Lat || 0,
                        lng: station?.Geo?.Lng || 0,
                        heading: 0,
                        nextStop: station?.Name || (stops[1]?.name || ''),
                        eta: formatETA(etaSeconds),
                        updatedAt: new Date().toISOString(),
                        vehicleNumber: plate,
                        speed,
                        fleetCode,
                        timeRemainedSeconds: etaSeconds,
                        realTime: true
                      });
                    }
                  }
                }
              } catch (e) {
                // skip failed station queries
              }
              // Small delay between requests
              await new Promise(r => setTimeout(r, 200));
            }
          }

          // If no real vehicles found, create simulated buses along the route
          if (buses.length === 0 && stops.length > 0) {
            buses = createSimulatedBuses(stops, item.ObjectID, parsed.number, busCount);
          }

          routes.push({
            id: `timbus-${item.ObjectID}`,
            number: item.FleedCode || parsed.number,
            name: item.Name || `Tuyến timbus ${item.ObjectID}`,
            startStation: parsed.startStation,
            endStation: parsed.endStation,
            color: '#1976d2',
            stops,
            buses,
            busCount
          });
        }
      }

      if (routes.length === 0) {
        return json({
          city,
          cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
          updatedAt: new Date().toISOString(),
          routes: [],
          source: 'mock',
          error: 'No data from timbus.vn'
        });
      }

      return json({
        city,
        cityName: city === 'hcmc' ? 'Ho Chi Minh City' : 'Hanoi',
        updatedAt: new Date().toISOString(),
        routes,
        source: 'live'
      });
    }

    // ---- Route detail: /api/route/:id ----
    if (path.startsWith('/api/route/')) {
      const id = path.split('/').pop();
      const fleet = await timbusPost('/Engine/Business/Search/action.ashx', {
        act: 'fleetdetail',
        fid: id
      });

      if (!fleet || !fleet.success || !fleet.dt) {
        return json({ error: 'Route not found' }, 404);
      }

      const fd = fleet.dt;
      const parsed = parseRouteName(fd.Name);

      // Use ALL Go.Geo points as stops
      const stops = geoToStops(fd.Go?.Geo || []);

      // Merge station names
      let stations = [];
      if (fd.Station && Array.isArray(fd.Station)) {
        stations = stops.map((s, i) => {
          const station = fd.Station[i];
          return {
            id: station?.ObjectID,
            code: station?.Code,
            name: station?.Name || s.name,
            lat: station?.Geo?.Lat || s.lat,
            lng: station?.Geo?.Lng || s.lng,
            seq: s.seq
          };
        });
      } else {
        stations = stops.map((s, i) => ({
          id: null,
          code: null,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          seq: s.seq
        }));
      }

      // Get vehicle positions for this route's stations (more stations)
      let buses = [];
      if (fd.Station && Array.isArray(fd.Station)) {
        const stationIds = fd.Station.filter(s => s.ObjectID).map(s => s.ObjectID);
        for (const sid of stationIds.slice(0, 5)) {
          try {
            const vr = await getVehiclesAtStation(sid);
            if (vr && vr.success) {
              const vdata = vr.dt || vr.data || vr;
              if (Array.isArray(vdata)) {
                for (const v of vdata) {
                  const station = fd.Station.find(s => s.ObjectID == sid);
                  buses.push({
                    id: v.BienKiemSoat || `bus-${Math.random()}`,
                    lat: station?.Geo?.Lat || 0,
                    lng: station?.Geo?.Lng || 0,
                    heading: 0,
                    nextStop: station?.Name || '',
                    eta: formatETA(v.TimeRemained || v.PartRemained || 0),
                    updatedAt: new Date().toISOString(),
                    vehicleNumber: v.BienKiemSoat || '',
                    speed: v.Speed || 0,
                    fleetCode: v.FleetCode || v.Fleet || '',
                    timeRemainedSeconds: v.TimeRemained || v.PartRemained || 0,
                    realTime: true
                  });
                }
              }
            }
          } catch (e) {
            // skip
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // If no real vehicles, create simulated buses along route
      if (buses.length === 0 && stops.length > 0) {
        buses = createSimulatedBuses(stops, fd.FleetID || id, parsed.number, fd.BusCount || 3);
        buses = buses.map(b => ({ ...b, simulated: true }));
      }

      return json({
        id: fd.FleetID || id,
        number: fd.Code || parsed.number,
        name: fd.Name || `Tuyến ${id}`,
        startStation: fd.FirstStation || parsed.startStation,
        endStation: fd.LastStation || parsed.endStation,
        color: '#1976d2',
        routeNo: fd.Code,
        operationTime: fd.OperationsTime,
        frequency: fd.Frequency,
        cost: fd.Cost,
        enterprise: fd.Enterprise,
        busCount: fd.BusCount || 3,
        stops,
        stations,
        routes: {
          go: geoToStops(fd.Go?.Geo || []),
          back: geoToStops(fd.Re?.Geo || [])
        },
        buses,
        updatedAt: new Date().toISOString(),
        source: 'live'
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
