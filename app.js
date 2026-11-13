/**
 * Bus Tracker VN - Frontend Logic (Compact Single-Route View)
 * Calls Cloudflare Worker API for bus data and map tiles.
 * Shows ONE route at a time with animated moving buses.
 */

(() => {
  'use strict';

  // ---------- State ----------
  let state = {
    city: CONFIG.DEFAULT_CITY,
    map: null,
    layerGroup: null,
    polylines: [],
    markers: [],
    stopMarkers: [],
    data: null,
    selectedRouteId: null,
    refreshTimer: null,
    busPositions: new Map(),
    animationFrame: null
  };

  // ---------- DOM ----------
  const els = {
    map: document.getElementById('map'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    cityHCMC: document.getElementById('cityHCMC'),
    cityHanoi: document.getElementById('cityHanoi'),
    cityTitle: document.getElementById('cityTitle'),
    citySubtitle: document.getElementById('citySubtitle'),
    routeSelect: document.getElementById('routeSelect'),
    btnRefresh: document.getElementById('btnRefresh'),
    lastUpdated: document.getElementById('lastUpdated'),
    dataSource: document.getElementById('dataSource'),
    routeInfo: document.getElementById('routeInfo'),
    emptyState: document.getElementById('emptyState'),
    routeTitle: document.getElementById('routeTitle'),
    routeStations: document.getElementById('routeStations'),
    routeMeta: document.getElementById('routeMeta'),
    busListTitle: document.getElementById('busListTitle'),
    busList: document.getElementById('busList'),
    mapInfo: document.getElementById('mapInfo')
  };

  // ---------- Init ----------
  function init() {
    setupEventListeners();
    initMap();
    loadCity(state.city);
    startAutoRefresh();
    startAnimation();
  }

  function setupEventListeners() {
    els.sidebarToggle.addEventListener('click', () => {
      state.isSidebarOpen = !state.isSidebarOpen;
      els.sidebar.classList.toggle('open', state.isSidebarOpen);
    });

    els.cityHCMC.addEventListener('click', () => switchCity('hcmc'));
    els.cityHanoi.addEventListener('click', () => switchCity('hanoi'));

    els.routeSelect.addEventListener('change', (e) => {
      state.selectedRouteId = e.target.value;
      renderList();
      renderMap();
    });

    els.btnRefresh.addEventListener('click', () => {
      els.btnRefresh.textContent = '🔄 Đang tải...';
      loadData().then(() => {
        els.btnRefresh.textContent = '🔄 Làm mới';
      });
    });
  }

  // ---------- Map ----------
  function initMap() {
    const cityCfg = CONFIG.CITIES[state.city];
    state.map = L.map('map', {
      center: cityCfg.center,
      zoom: cityCfg.zoom,
      zoomControl: true
    });

    const tileUrl = CONFIG.TILE_URL.replace('${WORKER_URL}', CONFIG.WORKER_URL || '');
    L.tileLayer(tileUrl, {
      attribution: CONFIG.TILE_ATTR,
      maxZoom: 19
    }).addTo(state.map);

    state.layerGroup = L.layerGroup().addTo(state.map);
  }

  function clearMap() {
    state.layerGroup.clearLayers();
    state.polylines = [];
    state.markers = [];
    state.stopMarkers = [];
  }

  function getOrCreateBusMarker(bus, route) {
    const existing = state.markers.find(m => m.options.busId === bus.id);
    if (existing) {
      const current = state.busPositions.get(bus.id) || {
        lat: bus.lat, lng: bus.lng, targetLat: bus.lat, targetLng: bus.lng, progress: 1
      };
      current.targetLat = bus.lat;
      current.targetLng = bus.lng;
      current.progress = 0;
      current.routeId = route.id;
      current.busData = bus;
      state.busPositions.set(bus.id, current);
      return existing;
    }

    const marker = L.marker([bus.lat, bus.lng], {
      title: `Xe ${bus.id}`,
      busId: bus.id,
      routeId: route.id,
      icon: L.divIcon({
        className: 'bus-marker',
        html: `<div style="background:${bus.simulated ? '#ff9800' : '#1a73e8'};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);">${route.number}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
    });
    marker.bindPopup(`
      <div class="popup-title">Tuyến ${route.number}</div>
      <div class="popup-stations">${route.startStation} <span class="arrow">→</span> ${route.endStation}</div>
      <div><strong>Xe:</strong> ${bus.id}</div>
      <div><strong>Điểm tiếp theo:</strong> ${bus.nextStop}</div>
      <div class="popup-eta">⏱ ${bus.eta}</div>
      <div class="popup-updated">Cập nhật: ${new Date(bus.updatedAt).toLocaleTimeString('vi-VN')}</div>
      <div style="font-size:11px;color:${bus.simulated ? '#ff9800' : '#1a73e8'}">${bus.simulated ? 'Mô phỏng' : 'Thực tế'}</div>
    `);
    state.markers.push(marker);
    marker.addTo(state.layerGroup);

    state.busPositions.set(bus.id, {
      lat: bus.lat, lng: bus.lng, targetLat: bus.lat, targetLng: bus.lng,
      progress: 1, routeId: route.id, busData: bus
    });

    return marker;
  }

  function renderMap() {
    clearMap();
    if (!state.data || !state.data.routes || !state.selectedRouteId) return;

    const route = state.data.routes.find(r => r.id === state.selectedRouteId);
    if (!route) return;

    // Route polyline
    const latlngs = route.stops.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]);
    if (latlngs.length > 1) {
      const pl = L.polyline(latlngs, { color: route.color, weight: 5, opacity: 0.85, className: 'route-line' });
      pl.options.routeId = route.id;
      pl.addTo(state.layerGroup);
      state.polylines.push(pl);
    }

    // Start station (green A)
    const start = route.stops[0];
    if (start && start.lat && start.lng) {
      const m = L.marker([start.lat, start.lng], {
        title: `ĐẦU: ${start.name}`,
        icon: L.divIcon({
          className: 'station-marker start-marker',
          html: `<div style="background:#4caf50;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.5);">A</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10]
        })
      });
      m.options.routeId = route.id;
      m.addTo(state.layerGroup);
      state.stopMarkers.push(m);
    }

    // End station (red B)
    const end = route.stops[route.stops.length - 1];
    if (end && end.lat && end.lng) {
      const m = L.marker([end.lat, end.lng], {
        title: `CUỐI: ${end.name}`,
        icon: L.divIcon({
          className: 'station-marker end-marker',
          html: `<div style="background:#f44336;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.5);">B</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10]
        })
      });
      m.options.routeId = route.id;
      m.addTo(state.layerGroup);
      state.stopMarkers.push(m);
    }

    // All intermediate stops as dots
    route.stops.forEach((stop, i) => {
      if (i === 0 || i === route.stops.length - 1) return;
      if (!stop.lat || !stop.lng) return;
      const m = L.circleMarker([stop.lat, stop.lng], {
        radius: 3.5, color: route.color, fillColor: '#fff', fillOpacity: 0.85, weight: 2
      });
      m.bindTooltip(`${stop.seq}. ${stop.name}`, { direction: 'top', offset: [0, -5] });
      m.options.routeId = route.id;
      m.addTo(state.layerGroup);
      state.stopMarkers.push(m);
    });

    // Bus markers
    (route.buses || []).forEach((bus) => {
      if (!bus.lat || !bus.lng) return;
      getOrCreateBusMarker(bus, route);
    });

    fitMapToRoute();
    els.mapInfo.textContent = `${state.data.cityName} — ${route.stops.length} trạm, ${route.buses.length} xe`;
  }

  function fitMapToRoute() {
    if (!state.data || !state.data.routes || !state.selectedRouteId) return;
    const route = state.data.routes.find(r => r.id === state.selectedRouteId);
    if (!route) return;
    const group = L.featureGroup();
    state.polylines.forEach(pl => { if (pl.options.routeId === route.id) group.addLayer(pl); });
    state.markers.forEach(m => { if (m.options.routeId === route.id) group.addLayer(m); });
    state.stopMarkers.forEach(m => { if (m.options.routeId === route.id) group.addLayer(m); });
    if (group.getLayers().length > 0) {
      state.map.fitBounds(group.getBounds().pad(0.2));
    }
  }

  function startAnimation() {
    let lastTime = Date.now();
    function animate(now) {
      const dt = now - lastTime;
      lastTime = now;
      const dtSeconds = dt / 1000;
      const speed = 0.18;
      let moved = false;

      state.markers.forEach((marker) => {
        const busId = marker.options.busId;
        const pos = state.busPositions.get(busId);
        if (!pos) return;
        if (pos.progress < 1) {
          pos.progress = Math.min(1, pos.progress + speed * dtSeconds);
          const t = pos.progress;
          const lat = pos.lat + (pos.targetLat - pos.lat) * t;
          const lng = pos.lng + (pos.targetLng - pos.lng) * t;
          marker.setLatLng([lat, lng]);
          moved = true;
        }
      });

      if (moved) state.animationFrame = requestAnimationFrame(animate);
    }
    state.animationFrame = requestAnimationFrame(animate);
  }

  // ---------- Data ----------
  async function loadData() {
    if (!CONFIG.WORKER_URL) {
      els.dataSource.textContent = '⚠️ Chưa cấu hình Worker URL';
      els.dataSource.style.color = '#e91e63';
      return;
    }

    try {
      const res = await fetch(`${CONFIG.WORKER_URL}/api/buses?city=${state.city}`, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      console.warn('Worker fetch failed:', err);
      els.dataSource.textContent = '⚠️ Lỗi kết nối Worker';
      els.dataSource.style.color = '#e91e63';
      return;
    }

    state.data.updatedAt = new Date().toISOString();
    els.dataSource.textContent = state.data.source === 'live' ? '🟢 Live (timbus.vn)' : '🟡 Mock';
    els.dataSource.style.color = state.data.source === 'live' ? '#4caf50' : '#ff9800';
    els.lastUpdated.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;

    populateRouteSelect();
    renderList();
    renderMap();
  }

  function loadCity(city) {
    state.city = city;
    state.selectedRouteId = null;
    const cfg = CONFIG.CITIES[city];
    els.cityTitle.textContent = cfg.name;
    els.citySubtitle.textContent = 'Dữ liệu trực tiếp từ timbus.vn';
    els.cityHCMC.classList.toggle('active', city === 'hcmc');
    els.cityHanoi.classList.toggle('active', city === 'hanoi');
    if (state.map) state.map.setView(cfg.center, cfg.zoom);
    loadData();
  }

  function switchCity(city) {
    if (state.city === city) return;
    loadCity(city);
  }

  function populateRouteSelect() {
    if (!state.data || !state.data.routes) return;
    const routes = state.data.routes;
    const currentVal = els.routeSelect.value;
    els.routeSelect.innerHTML = '<option value="">-- Chọn tuyến xe --</option>';
    routes.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.number} — ${r.startStation} → ${r.endStation}`;
      if (opt.value === currentVal) opt.selected = true;
      els.routeSelect.appendChild(opt);
    });
    if (routes.length > 0 && !state.selectedRouteId) {
      state.selectedRouteId = routes[0].id;
      els.routeSelect.value = routes[0].id;
    }
    renderList();
    renderMap();
  }

  function renderList() {
    if (!state.data || !state.data.routes || !state.selectedRouteId) {
      els.routeInfo.style.display = 'none';
      els.emptyState.style.display = 'flex';
      return;
    }

    const route = state.data.routes.find(r => r.id === state.selectedRouteId);
    if (!route) {
      els.routeInfo.style.display = 'none';
      els.emptyState.style.display = 'flex';
      return;
    }

    els.emptyState.style.display = 'none';
    els.routeInfo.style.display = 'block';

    els.routeTitle.textContent = `Tuyến ${route.number}`;
    els.routeStations.innerHTML = `<span>${route.startStation}</span> <span class="arrow">→</span> <span>${route.endStation}</span>`;

    const busCount = route.buses.length;
    const simCount = route.buses.filter(b => b.simulated).length;
    const realCount = busCount - simCount;

    els.routeMeta.innerHTML = `
      <span>🛣️ ${route.stops.length} trạm</span>
      <span>🚌 ${busCount} xe</span>
      <span style="color:#1a73e8">🕒 ${route.operationTime || '—'}</span>
    `;

    els.busListTitle.textContent = `Xe buýt (${busCount})`;

    els.busList.innerHTML = '';
    route.buses.forEach((bus) => {
      const div = document.createElement('div');
      div.className = 'bus-item';
      div.innerHTML = `
        <div class="bus-id">Xe ${bus.id}</div>
        <div class="bus-next">Điểm tiếp theo: ${bus.nextStop}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="bus-eta">⏱ ${bus.eta}</span>
          <span class="bus-type ${bus.simulated ? 'simulated' : 'realtime'}">${bus.simulated ? 'Mô phỏng' : 'Thực tế'}</span>
        </div>
      `;
      els.busList.appendChild(div);
    });
  }

  // ---------- Auto refresh ----------
  function startAutoRefresh() {
    state.refreshTimer = setInterval(() => {
      loadData().catch(() => {});
    }, CONFIG.REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', init);

})();