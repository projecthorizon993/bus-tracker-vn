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

/** Convert timbus.vn Geo array (Lat,Lng) to route stops */
function geoToStops(geo) {
  if (!geo || !Array.isArray(geo)) return [];
  return geo.map((p, i) => ({
    name: `Điểm ${i + 1}`,
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

          if (fleet && fleet.success && fleet.dt) {
            const fd = fleet.dt;
            stops = geoToStops(fd.Go?.Geo || []);
            // Use station list if available (has real lat/lng + ObjectID for vehicle queries)
            if (fd.Station && Array.isArray(fd.Station)) {
              stops = fd.Station.map((s, i) => ({
                name: s.Name || `Điểm ${i + 1}`,
                lat: s.Geo?.Lat || 0,
                lng: s.Geo?.Lng || 0,
                seq: s.Geo ? i + 1 : i + 1
              }));
              stationIds = fd.Station.filter(s => s.ObjectID).map(s => s.ObjectID);
            }

            // Get real-time vehicle positions from first 3 stations
            for (const sid of stationIds.slice(0, 3)) {
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
                        id: plate || `bus-${Math.random()}`,
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
                        timeRemainedSeconds: etaSeconds
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

            // If no real vehicles found, create a placeholder at start
            if (buses.length === 0 && stops.length > 0) {
              buses = [{
                id: `timbus-${item.ObjectID}`,
                routeId: item.FleedCode || item.ObjectID,
                lat: stops[0]?.lat || 0,
                lng: stops[0]?.lng || 0,
                heading: 0,
                nextStop: stops[1]?.name || '',
                eta: 'Lên lịch',
                updatedAt: new Date().toISOString(),
                vehicleNumber: '',
                speed: 0
              }];
            }
          }

          routes.push({
            id: `timbus-${item.ObjectID}`,
            number: item.FleedCode || parsed.number,
            name: item.Name || `Tuyến timbus ${item.ObjectID}`,
            startStation: parsed.startStation,
            endStation: parsed.endStation,
            color: '#1976d2',
            stops,
            buses
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

      // Get vehicle positions for this route's stations
      let buses = [];
      if (fd.Station && Array.isArray(fd.Station)) {
        const stationIds = fd.Station.filter(s => s.ObjectID).map(s => s.ObjectID);
        for (const sid of stationIds.slice(0, 3)) {
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
                    timeRemainedSeconds: v.TimeRemained || v.PartRemained || 0
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
        busCount: fd.BusCount,
        stops: geoToStops(fd.Go?.Geo || []),
        stations: (fd.Station || []).map((s, i) => ({
          id: s.ObjectID,
          code: s.Code,
          name: s.Name,
          lat: s.Geo?.Lat || 0,
          lng: s.Geo?.Lng || 0,
          seq: i + 1
        })),
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
