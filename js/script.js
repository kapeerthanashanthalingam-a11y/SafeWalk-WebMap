/* =========================================================================
   SafeWalk — script.js
   Map initialization, data layers, complaint reporting, dashboard.
   ========================================================================= */

/* -------------------------------------------------------------------------
   0. CONSTANTS
   ------------------------------------------------------------------------- */
const DATA = {
  boundary: 'data/western_province.geojson',
  roads: 'data/roads.geojson',
  pedpaths: 'data/pedestrian_paths.geojson',
  railway: 'data/railway.geojson',
  railstations: 'data/railway_stations.geojson',
  schools: 'data/schools.geojson',
  hospitals: 'data/hospitals.geojson',
  busstops: 'data/busstops.geojson',
  parking: 'data/parking.geojson',
  trafficlights: 'data/traffic_lights.geojson',
  crossings: 'data/pedestrian_crossings.geojson'
};

const ISSUE_LABELS = {
  sidewalk: 'Damaged sidewalk',
  crossing: 'Unsafe road crossing',
  lighting: 'Poor street lighting',
  parking: 'Illegal parking on walkway',
  drain: 'Open drain',
  construction: 'Construction obstruction',
  flooding: 'Flooded pathway',
  accessibility: 'Accessibility barrier'
};

const SEVERITY_COLOR = { low: '#4C8C6B', medium: '#E8A33D', high: '#D64545' };

// Western Province approximate bounds (fallback before boundary loads)
const WP_BOUNDS = L.latLngBounds([6.30, 79.78], [7.36, 80.40]);
const WP_CENTER = [6.86, 80.04];

const LS_KEY = 'safewalk_complaints_v1';

/* -------------------------------------------------------------------------
   1. MAP INIT + BASE LAYERS
   ------------------------------------------------------------------------- */
const map = L.map('map', {
  center: WP_CENTER,
  zoom: 10,
  minZoom: 8,
  maxZoom: 19,
  zoomControl: true,
  preferCanvas: true
});

const baseLayers = {
  light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
    maxZoom: 20
  }),
  streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics',
    maxZoom: 19
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
    maxZoom: 20
  })
};
baseLayers.light.addTo(map);

document.querySelectorAll('.basemap-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.basemap-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(baseLayers).forEach(l => map.removeLayer(l));
    baseLayers[btn.dataset.base].addTo(map);
  });
});

/* -------------------------------------------------------------------------
   2. HELPERS
   ------------------------------------------------------------------------- */
function setCount(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = n.toLocaleString();
}

async function loadGeoJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to load', url, err);
    return { type: 'FeatureCollection', features: [] };
  }
}

function popupRow(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="popup-row"><b>${label}:</b> ${value}</div>`;
}

/* -------------------------------------------------------------------------
   3. LAYER GROUPS (populated as data loads)
   ------------------------------------------------------------------------- */
const layers = {
  boundary: L.layerGroup(),
  roads: L.layerGroup(),
  pedpaths: L.layerGroup(),
  railway: L.layerGroup(),
  railstations: L.layerGroup(),
  schools: L.layerGroup(),
  hospitals: L.layerGroup(),
  busstops: L.layerGroup(),
  parking: L.layerGroup(),
  trafficlights: L.layerGroup(),
  crossings: L.layerGroup(),
  complaints: L.layerGroup(),
  heatmap: null // built once leaflet.heat data is ready
};

layers.boundary.addTo(map);
layers.roads.addTo(map);
layers.crossings.addTo(map);
layers.complaints.addTo(map);

/* -------------------------------------------------------------------------
   4. BOUNDARY
   ------------------------------------------------------------------------- */
loadGeoJSON(DATA.boundary).then(gj => {
  const styled = L.geoJSON(gj, {
    style: {
      color: '#D64545',
      weight: 2.5,
      fillColor: '#0F4C4C',
      fillOpacity: 0.04,
      dashArray: '0'
    }
  });
  styled.addTo(layers.boundary);
  // Fit map to the province on first load
  try { map.fitBounds(styled.getBounds(), { padding: [20, 20] }); } catch (e) { /* noop */ }
});

/* -------------------------------------------------------------------------
   5. ROAD NETWORK  (major roads — already simplified/filtered offline)
   ------------------------------------------------------------------------- */
const ROAD_STYLE_BY_CLASS = {
  motorway: { color: '#C8852A', weight: 3 },
  motorway_link: { color: '#C8852A', weight: 2 },
  trunk: { color: '#8A8275', weight: 2.4 },
  trunk_link: { color: '#8A8275', weight: 1.8 },
  primary: { color: '#8A8275', weight: 2.1 },
  primary_link: { color: '#8A8275', weight: 1.6 },
  secondary: { color: '#9C9586', weight: 1.6 },
  secondary_link: { color: '#9C9586', weight: 1.3 },
  tertiary: { color: '#AFA899', weight: 1.1 },
  tertiary_link: { color: '#AFA899', weight: 1 }
};

loadGeoJSON(DATA.roads).then(gj => {
  setCount('count-roads', gj.features.length);
  L.geoJSON(gj, {
    style: f => ROAD_STYLE_BY_CLASS[f.properties.fclass] || { color: '#8A8275', weight: 1 },
    onEachFeature: (f, layer) => {
      const p = f.properties;
      layer.bindPopup(`
        <div class="popup-title">${p.name || 'Unnamed road'}</div>
        ${popupRow('Class', p.fclass)}
        ${popupRow('Max speed', p.maxspeed ? p.maxspeed + ' km/h' : null)}
        ${popupRow('OSM ID', p.osm_id)}
      `);
    }
  }).addTo(layers.roads);
});

/* -------------------------------------------------------------------------
   6. PEDESTRIAN PATHS
   ------------------------------------------------------------------------- */
loadGeoJSON(DATA.pedpaths).then(gj => {
  setCount('count-pedpaths', gj.features.length);
  L.geoJSON(gj, {
    style: { color: '#1C8585', weight: 1.6, dashArray: '1,4', opacity: 0.85 },
    onEachFeature: (f, layer) => {
      const p = f.properties;
      layer.bindPopup(`
        <div class="popup-title">${p.name || 'Pedestrian path'}</div>
        ${popupRow('Type', p.fclass)}
        ${popupRow('OSM ID', p.osm_id)}
      `);
    }
  }).addTo(layers.pedpaths);
});

/* -------------------------------------------------------------------------
   7. RAILWAY
   ------------------------------------------------------------------------- */
loadGeoJSON(DATA.railway).then(gj => {
  setCount('count-railway', gj.features.length);
  L.geoJSON(gj, {
    style: { color: '#3B4248', weight: 2, dashArray: '6,4' },
    onEachFeature: (f, layer) => {
      const p = f.properties;
      layer.bindPopup(`<div class="popup-title">${p.name || 'Railway line'}</div>${popupRow('OSM ID', p.osm_id)}`);
    }
  }).addTo(layers.railway);
});

/* -------------------------------------------------------------------------
   8. POINT LAYERS (facilities + infrastructure)
   ------------------------------------------------------------------------- */
function circleIcon(color, radius = 5, weight = 1.5) {
  return f => L.circleMarker(L.GeoJSON.coordsToLatLng(f.geometry.coordinates), {
    radius, weight, color: '#fff', fillColor: color, fillOpacity: 0.95
  });
}

function buildPointLayer(geojsonUrl, targetGroup, color, countId, popupTitleFallback, extraRows) {
  loadGeoJSON(geojsonUrl).then(gj => {
    setCount(countId, gj.features.length);
    L.geoJSON(gj, {
      pointToLayer: circleIcon(color),
      onEachFeature: (f, layer) => {
        const p = f.properties;
        const rows = extraRows ? extraRows(p) : '';
        layer.bindPopup(`
          <div class="popup-title">${p.name || popupTitleFallback}</div>
          ${rows}
          ${popupRow('OSM ID', p.osm_id)}
        `);
      }
    }).addTo(targetGroup);
  });
}

buildPointLayer(DATA.schools, layers.schools, '#2D6FB0', 'count-schools', 'School');
buildPointLayer(DATA.hospitals, layers.hospitals, '#C24747', 'count-hospitals', 'Hospital');
buildPointLayer(DATA.busstops, layers.busstops, '#3F9D6E', 'count-busstops', 'Bus stop');
buildPointLayer(DATA.railstations, layers.railstations, '#5C4A8C', 'count-railstations', 'Railway station');
buildPointLayer(DATA.parking, layers.parking, '#8E5BAE', 'count-parking', 'Parking area');
buildPointLayer(DATA.trafficlights, layers.trafficlights, '#C8852A', 'count-trafficlights', 'Traffic signal');

// Crossings get a slightly distinct marker (small diamond-ish circle) since it's a key safety layer
loadGeoJSON(DATA.crossings).then(gj => {
  setCount('count-crossings', gj.features.length);
  L.geoJSON(gj, {
    pointToLayer: f => L.circleMarker(L.GeoJSON.coordsToLatLng(f.geometry.coordinates), {
      radius: 4, weight: 1.5, color: '#fff', fillColor: '#1C8585', fillOpacity: 0.95
    }),
    onEachFeature: (f, layer) => {
      const p = f.properties;
      layer.bindPopup(`<div class="popup-title">Pedestrian crossing</div>${popupRow('OSM ID', p.osm_id)}`);
    }
  }).addTo(layers.crossings);
});

/* -------------------------------------------------------------------------
   9. LAYER TOGGLES (checkbox wiring)
   ------------------------------------------------------------------------- */
const TOGGLE_MAP = [
  ['toggle-boundary', 'boundary'],
  ['toggle-roads', 'roads'],
  ['toggle-pedpaths', 'pedpaths'],
  ['toggle-railway', 'railway'],
  ['toggle-crossings', 'crossings'],
  ['toggle-trafficlights', 'trafficlights'],
  ['toggle-complaints', 'complaints'],
  ['toggle-parking', 'parking'],
  ['toggle-schools', 'schools'],
  ['toggle-hospitals', 'hospitals'],
  ['toggle-busstops', 'busstops'],
  ['toggle-railstations', 'railstations']
];

TOGGLE_MAP.forEach(([checkboxId, layerKey]) => {
  const cb = document.getElementById(checkboxId);
  if (!cb) return;
  cb.addEventListener('change', () => {
    if (cb.checked) map.addLayer(layers[layerKey]);
    else map.removeLayer(layers[layerKey]);
  });
});

/* -------------------------------------------------------------------------
   10. COMPLAINTS — load from localStorage, render, filter, heatmap
   ------------------------------------------------------------------------- */
function getComplaints() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveComplaints(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

// Seed a few sample reports on first run so the map/dashboard aren't empty.
// Delete this block (or clear localStorage) once real public submissions exist.
function seedSampleComplaints() {
  if (getComplaints().length > 0) return;
  const samples = [
    { lat: 6.9271, lng: 79.8612, type: 'crossing', severity: 'high', desc: 'No marked crossing near busy junction, pedestrians cross between fast traffic.', date: '2026-05-12' },
    { lat: 6.9344, lng: 79.8428, type: 'sidewalk', severity: 'medium', desc: 'Sidewalk slabs broken and uneven for ~40m, trip hazard.', date: '2026-05-20' },
    { lat: 6.7964, lng: 79.9008, type: 'lighting', severity: 'medium', desc: 'Street lights non-functional along the footpath at night.', date: '2026-06-02' },
    { lat: 6.8410, lng: 79.8770, type: 'parking', severity: 'low', desc: 'Vehicles parked on the walkway, pedestrians forced onto the road.', date: '2026-06-08' },
    { lat: 7.0840, lng: 79.9986, type: 'drain', severity: 'high', desc: 'Open drain next to footpath, uncovered for several months.', date: '2026-06-14' },
    { lat: 6.7106, lng: 79.9074, type: 'construction', severity: 'medium', desc: 'Construction materials block half the pavement width.', date: '2026-06-18' },
    { lat: 6.8649, lng: 79.8997, type: 'flooding', severity: 'high', desc: 'Pathway floods completely during monsoon rain, impassable.', date: '2026-06-20' },
    { lat: 6.9147, lng: 79.8757, type: 'accessibility', severity: 'medium', desc: 'No ramp access at this crossing, wheelchair users must detour.', date: '2026-06-22' }
  ];
  saveComplaints(samples.map((s, i) => ({ id: 'seed-' + i, ...s })));
}
seedSampleComplaints();

let heatLayer = null;
let activeFilters = { type: 'all', severities: new Set(['low', 'medium', 'high']) };

function renderComplaints() {
  layers.complaints.clearLayers();
  const all = getComplaints();
  const filtered = all.filter(c =>
    (activeFilters.type === 'all' || c.type === activeFilters.type) &&
    activeFilters.severities.has(c.severity)
  );

  filtered.forEach(c => {
    const marker = L.circleMarker([c.lat, c.lng], {
      radius: c.severity === 'high' ? 8 : c.severity === 'medium' ? 6.5 : 5,
      weight: 2,
      color: '#fff',
      fillColor: SEVERITY_COLOR[c.severity],
      fillOpacity: 0.92
    });
    marker.bindPopup(`
      <span class="popup-sev popup-sev-${c.severity}">${c.severity} severity</span>
      <div class="popup-title">${ISSUE_LABELS[c.type] || c.type}</div>
      <div class="popup-row">${c.desc || ''}</div>
      ${popupRow('Reported', c.date)}
      ${c.photo ? `<img class="popup-photo" src="${c.photo}" alt="Reported issue photo" />` : ''}
    `);
    marker.addTo(layers.complaints);
  });

  // heatmap uses ALL complaints regardless of filter, weighted by severity
  if (heatLayer) { map.removeLayer(heatLayer); }
  const heatPoints = all.map(c => [c.lat, c.lng, c.severity === 'high' ? 1 : c.severity === 'medium' ? 0.6 : 0.3]);
  heatLayer = L.heatLayer(heatPoints, { radius: 28, blur: 22, maxZoom: 17, gradient: { 0.2: '#1C8585', 0.5: '#E8A33D', 0.8: '#D64545' } });
  if (document.getElementById('toggle-heatmap').checked) heatLayer.addTo(map);

  updateStatsAndDashboard(all, filtered);
}

document.getElementById('toggle-heatmap').addEventListener('change', e => {
  if (!heatLayer) return;
  if (e.target.checked) heatLayer.addTo(map);
  else map.removeLayer(heatLayer);
});

document.getElementById('filterType').addEventListener('change', e => {
  activeFilters.type = e.target.value;
  renderComplaints();
});

document.querySelectorAll('#severityChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const sev = chip.dataset.sev;
    chip.classList.toggle('active');
    if (chip.classList.contains('active')) activeFilters.severities.add(sev);
    else activeFilters.severities.delete(sev);
    renderComplaints();
  });
});

/* -------------------------------------------------------------------------
   11. STATS + DASHBOARD
   ------------------------------------------------------------------------- */
function updateStatsAndDashboard(all, filtered) {
  setCount('count-complaints', all.length);
  setCount('statTotal', all.length);
  setCount('statHigh', all.filter(c => c.severity === 'high').length);

  const now = new Date('2026-06-26');
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);
  const openThisMonth = all.filter(c => c.date && new Date(c.date) >= monthAgo);
  setCount('statOpen', openThisMonth.length);

  // by type
  const byType = {};
  Object.keys(ISSUE_LABELS).forEach(k => byType[k] = 0);
  all.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });
  const maxType = Math.max(1, ...Object.values(byType));
  const typeEl = document.getElementById('chartByType');
  typeEl.innerHTML = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `
      <div class="bar-row">
        <span class="bar-row-label">${ISSUE_LABELS[k]}</span>
        <span class="bar-row-track"><span class="bar-row-fill" style="width:${(v / maxType * 100)}%"></span></span>
        <span class="bar-row-val">${v}</span>
      </div>
    `).join('');

  // by severity
  const bySev = { low: 0, medium: 0, high: 0 };
  all.forEach(c => { bySev[c.severity] = (bySev[c.severity] || 0) + 1; });
  const maxSev = Math.max(1, ...Object.values(bySev));
  const sevEl = document.getElementById('chartBySeverity');
  sevEl.innerHTML = Object.entries(bySev).map(([k, v]) => `
    <div class="bar-row">
      <span class="bar-row-label" style="text-transform:capitalize">${k}</span>
      <span class="bar-row-track"><span class="bar-row-fill" style="width:${(v / maxSev * 100)}%; background:${SEVERITY_COLOR[k]}"></span></span>
      <span class="bar-row-val">${v}</span>
    </div>
  `).join('');

  // recent list
  const recentEl = document.getElementById('recentList');
  const recent = [...all].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  recentEl.innerHTML = recent.length ? recent.map(c => `
    <div class="recent-item">
      <div class="ri-top">
        <span class="ri-type">${ISSUE_LABELS[c.type] || c.type}</span>
        <span class="popup-sev popup-sev-${c.severity}" style="margin:0">${c.severity}</span>
      </div>
      <div class="ri-desc">${(c.desc || '').slice(0, 90)}${(c.desc || '').length > 90 ? '…' : ''}</div>
    </div>
  `).join('') : '<div class="empty-state">No reports yet.</div>';
}

/* -------------------------------------------------------------------------
   12. REPORT MODAL — click-to-pin, geolocation, submit
   ------------------------------------------------------------------------- */
const reportModal = document.getElementById('reportModal');
const complaintForm = document.getElementById('complaintForm');
const coordDisplay = document.getElementById('coordDisplay');
let pendingLatLng = null;
let pickingLocation = false;
let pinMarker = null;

function openModal() {
  reportModal.hidden = false;
  pickingLocation = true;
  coordDisplay.textContent = 'No location selected yet — click the map.';
  pendingLatLng = null;
  if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
}
function closeModal() {
  reportModal.hidden = true;
  pickingLocation = false;
  complaintForm.reset();
  if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
}

document.getElementById('reportBtn').addEventListener('click', openModal);
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelReport').addEventListener('click', closeModal);
reportModal.addEventListener('click', e => { if (e.target === reportModal) closeModal(); });

map.on('click', e => {
  if (!pickingLocation) return;
  pendingLatLng = e.latlng;
  coordDisplay.textContent = `Selected: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
  if (pinMarker) map.removeLayer(pinMarker);
  pinMarker = L.marker(e.latlng, {
    icon: L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#D64545;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>', iconSize: [14, 14] })
  }).addTo(map);
});

document.getElementById('useMyLocation').addEventListener('click', () => {
  if (!navigator.geolocation) {
    coordDisplay.textContent = 'Geolocation is not supported by this browser.';
    return;
  }
  coordDisplay.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      pendingLatLng = ll;
      coordDisplay.textContent = `Selected: ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} (current location)`;
      map.panTo(ll);
      if (pinMarker) map.removeLayer(pinMarker);
      pinMarker = L.marker(ll, {
        icon: L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#D64545;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>', iconSize: [14, 14] })
      }).addTo(map);
    },
    () => { coordDisplay.textContent = 'Could not get your location. Click the map instead.'; }
  );
});

complaintForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!pendingLatLng) {
    coordDisplay.textContent = 'Please select a location on the map first.';
    coordDisplay.style.color = '#D64545';
    return;
  }

  const type = document.getElementById('issueType').value;
  const severity = complaintForm.querySelector('input[name="severity"]:checked').value;
  const desc = document.getElementById('issueDesc').value.trim();
  const photoFile = document.getElementById('issuePhoto').files[0];

  let photoDataUrl = null;
  if (photoFile) {
    photoDataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(photoFile);
    });
  }

  const newComplaint = {
    id: 'c-' + Date.now(),
    lat: pendingLatLng.lat,
    lng: pendingLatLng.lng,
    type, severity, desc,
    photo: photoDataUrl,
    date: new Date().toISOString().slice(0, 10)
  };

  // TODO(backend): replace this localStorage write with a POST to your real
  // collection endpoint (Google Form prefilled-link submit, Firebase, a
  // Sheets-backed API, etc). Keep the same `newComplaint` shape so the rest
  // of the map code doesn't need to change.
  const all = getComplaints();
  all.push(newComplaint);
  saveComplaints(all);

  closeModal();
  renderComplaints();
});

/* -------------------------------------------------------------------------
   13. PANEL COLLAPSE / DASHBOARD TOGGLE
   ------------------------------------------------------------------------- */
const layerPanel = document.getElementById('layerPanel');
const reopenLeft = document.getElementById('reopenLeft');
document.getElementById('collapseLeft').addEventListener('click', () => {
  layerPanel.classList.add('collapsed');
  reopenLeft.hidden = false;
});
reopenLeft.addEventListener('click', () => {
  layerPanel.classList.remove('collapsed');
  reopenLeft.hidden = true;
});

const dashboardPanel = document.getElementById('dashboardPanel');
const dashboardBtn = document.getElementById('dashboardBtn');
dashboardBtn.addEventListener('click', () => {
  const isOpen = !dashboardPanel.hidden;
  dashboardPanel.hidden = isOpen;
  dashboardBtn.setAttribute('aria-pressed', String(!isOpen));
  if (!isOpen) updateStatsAndDashboard(getComplaints(), getComplaints());
});
document.getElementById('closeDashboard').addEventListener('click', () => {
  dashboardPanel.hidden = true;
  dashboardBtn.setAttribute('aria-pressed', 'false');
});

/* -------------------------------------------------------------------------
   14. LOCATION SEARCH (Nominatim, scoped to Western Province bounding box)
   ------------------------------------------------------------------------- */
const searchInput = document.getElementById('locationSearch');
const searchResults = document.getElementById('searchResults');
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 3) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
  searchTimer = setTimeout(() => runSearch(q), 400);
});

async function runSearch(query) {
  // Bias results to the Western Province viewbox; OSM Nominatim public API.
  const viewbox = '79.78,7.36,80.40,6.30'; // left,top,right,bottom
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=1&limit=6`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.length) {
      searchResults.innerHTML = '<div class="search-result-item">No matches found in Western Province.</div>';
      searchResults.hidden = false;
      return;
    }
    searchResults.innerHTML = data.map(d => `
      <div class="search-result-item" data-lat="${d.lat}" data-lon="${d.lon}">
        <span class="sr-name">${d.display_name.split(',')[0]}</span>
        <span class="sr-meta">${d.display_name}</span>
      </div>
    `).join('');
    searchResults.hidden = false;
  } catch (err) {
    console.error('Search failed', err);
  }
}

searchResults.addEventListener('click', e => {
  const item = e.target.closest('.search-result-item');
  if (!item || !item.dataset.lat) return;
  const lat = parseFloat(item.dataset.lat), lon = parseFloat(item.dataset.lon);
  map.setView([lat, lon], 16);
  L.popup().setLatLng([lat, lon]).setContent(item.querySelector('.sr-name').textContent).openOn(map);
  searchResults.hidden = true;
  searchInput.value = item.querySelector('.sr-name').textContent;
});

document.addEventListener('click', e => {
  if (!e.target.closest('.topbar-search')) searchResults.hidden = true;
});

/* -------------------------------------------------------------------------
   15. INITIAL RENDER
   ------------------------------------------------------------------------- */
renderComplaints();
