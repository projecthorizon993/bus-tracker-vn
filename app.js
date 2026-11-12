/**
 * Bus Tracker VN - Application Logic
 * - FreeRoute map (Leaflet) with your API key
 * - City toggle: HCMC / Hanoi
 * - Bus markers with start/end station popups
 * - Route polylines
 * - Bus list sidebar with search
 * - Auto-refresh from Cloudflare Worker (mock fallback if Worker not set)
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
    data: null,
    refreshTimer: null,
    isSidebarOpen: false
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
    routeSearch: document.getElementById('routeSearch'),
    btnRefresh: document.getElementById('btnRefresh'),
    lastUpdated: document.getElementById('lastUpdated'),
    busList: document.getElementById('busList'),
    mapInfo: document.getElementById('mapInfo')
  };

  // ---------- Init ----------
  function init() {
    setupEventListeners();
    initMap();
    loadCity(state.city);
    startAutoRefresh();
  }

  function setupEventListeners() {
    els.sidebarToggle.addEventListener('click', () => {
      state.isSidebarOpen = !state.isSidebarOpen;
      els.sidebar.classList.toggle('open', state.isSidebarOpen);
    });

    els.cityHCMC.addEventListener('click', () => switchCity('hcmc'));
    els.cityHanoi.addEventListener('click', () => switchCity('hanoi'));

    els.routeSearch.addEventListener('input', (e) => renderList(e.target.value));

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

    // Tile layer. FreeRoute tile URL goes here when SDK docs are available.
    // Example: https://tiles.freeroute.org/{z}/{x}/{y}.png?key=FREEROUTE_API_KEY
    L.tileLayer(CONFIG.TILE_URL, {
      attribution: CONFIG.TILE_ATTR,
      maxZoom: 19
    }).addTo(state.map);

    state.layerGroup = L.layerGroup().addTo(state.map);
  }

  function fitMapToRoutes() {
    if (!state.data || !state.data.routes) return;
    const group = L.featureGroup();
    state.polylines.forEach((pl) => group.addLayer(pl));
    state.markers.forEach((m) => group.addLayer(m));
    if (group.getLayers().length > 0) {
      state.map.fitBounds(group.getBounds().pad(0.15));
    } else {
      state.map.setView(CONFIG.CITIES[state.city].center, CONFIG.CITIES[state.city].zoom);
    }
  }

  function clearMap() {
    state.layerGroup.clearLayers();
    state.polylines = [];
    state.markers = [];
  }

  function renderMap() {
    clearMap();
    if (!state.data || !state.data.routes) return;

    state.data.routes.forEach((route) => {
      // Route polyline from start station to end station
      const latlngs = route.stops.map((s) => [s.lat, s.lng]);
      const polyline = L.polyline(latlngs, {
        color: route.color,
        weight: 4,
        opacity: 0.8,
        className: 'route-line'
      }).addTo(state.layerGroup);
      state.polylines.push(polyline);

      // Start & end station markers
      const start = route.stops[0];
      const end = route.stops[route.stops.length - 1];

      L.marker([start.lat, start.lng], {
        title: `Đầu: ${start.name}`,
        icon: L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background:${route.color};color:#fff;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);">${start.name.charAt(0)}</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      }).addTo(state.layerGroup);

      L.marker([end.lat, end.lng], {
        title: `Cuối: ${end.name}`,
        icon: L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background:${route.color};color:#fff;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);">${end.name.charAt(0)}</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      }).addTo(state.layerGroup);

      // Bus markers
      (route.buses || []).forEach((bus) => {
        const marker = L.marker([bus.lat, bus.lng], {
          title: `Xe ${bus.id}`,
          icon: L.divIcon({
            className: 'bus-marker',
            html: `<div style="background:#1a73e8;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${route.number}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(state.layerGroup);

        marker.bindPopup(`
          <div class="popup-title">Tuyến ${route.number}</div>
          <div class="popup-stations">${route.startStation} <span class="arrow">→</span> ${route.endStation}</div>
          <div><strong>Xe:</strong> ${bus.id}</div>
          <div><strong>Điểm tiếp theo:</strong> ${bus.nextStop}</div>
          <div class="popup-eta">⏱ ${bus.eta}</div>
          <div class="popup-updated">Cập nhật: ${new Date(bus.updatedAt).toLocaleTimeString('vi-VN')}</div>
        `);

        state.markers.push(marker);
      });
    });

    fitMapToRoutes();
    els.mapInfo.textContent = `${state.data.cityName} — ${state.data.routes.length} tuyến`;
  }

  // ---------- Data ----------
  async function loadData() {
    let data = null;
    const workerUrl = CONFIG.WORKER_URL;

    if (workerUrl) {
      try {
        const res = await fetch(`${workerUrl}/api/buses?city=${state.city}`, {
          headers: { Accept: 'application/json' }
        });
        if (res.ok) {
          data = await res.json();
        } else {
          throw new Error(`Worker returned ${res.status}`);
        }
      } catch (err) {
        console.warn('Worker fetch failed, using mock data:', err);
        data = getMockData(state.city);
      }
    } else {
      data = getMockData(state.city);
    }

    state.data = data;
    state.data.updatedAt = new Date().toISOString();
    renderMap();
    renderList(els.routeSearch.value);
    els.lastUpdated.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;
    return data;
  }

  function loadCity(city) {
    state.city = city;
    const cfg = CONFIG.CITIES[city];
    els.cityTitle.textContent = cfg.name;
    els.citySubtitle.textContent = city === 'hcmc' ? 'Xe buýt theo thời gian thực' : 'Xe buýt theo thời gian thực';
    els.cityHCMC.classList.toggle('active', city === 'hcmc');
    els.cityHanoi.classList.toggle('active', city === 'hanoi');

    if (state.map) {
      state.map.setView(cfg.center, cfg.zoom);
    }

    loadData();
  }

  function switchCity(city) {
    if (state.city === city) return;
    loadCity(city);
  }

  // ---------- List ----------
  function renderList(filter = '') {
    const term = filter.toLowerCase();
    els.busList.innerHTML = '';

    if (!state.data || !state.data.routes) {
      els.busList.innerHTML = '<li class="empty-state">Chưa có dữ liệu</li>';
      return;
    }

    const routes = state.data.routes.filter((r) =>
      r.number.toLowerCase().includes(term) ||
      r.startStation.toLowerCase().includes(term) ||
      r.endStation.toLowerCase().includes(term)
    );

    if (routes.length === 0) {
      els.busList.innerHTML = '<li class="empty-state">Không tìm thấy tuyến nào</li>';
      return;
    }

    routes.forEach((route) => {
      const li = document.createElement('li');
      li.className = 'route-item';
      const bus = (route.buses && route.buses[0]) || {};
      const isExpanded = false;

      li.innerHTML = `
        <div class="route-header" onclick="this.parentElement.querySelector('.route-body').classList.toggle('show')">
          <div>
            <span class="route-number">${route.number}</span>
            <span class="route-name">${route.name}</span>
            <div class="route-stations">
              <span>${route.startStation}</span>
              <span class="arrow">→</span>
              <span>${route.endStation}</span>
            </div>
          </div>
          <span class="route-expand">▾</span>
        </div>
        <div class="route-body">
          <div class="bus-row">
            <div class="bus-info">
              <div class="bus-id">Xe ${bus.id || '—'}</div>
              <div class="bus-eta">Tiếp theo: ${bus.nextStop || '—'} · ${bus.eta || '—'}</div>
            </div>
            <div class="bus-status">Đang chạy</div>
          </div>
          <div style="margin-top:6px; font-size:11px; color:#666;">
            ${route.stops.map((s) => s.name).join(' → ')}
          </div>
        </div>
      `;
      els.busList.appendChild(li);
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

  // ---------- Expose for inline onclick ----------
  window.renderList = renderList;

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', init);

})();
