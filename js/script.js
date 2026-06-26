/* =========================================================================
   SafeWalk — script.js
   Map initialization and the 10 real OpenStreetMap data layers for the
   Western Province. No complaint/hazard-report system in this build —
   that gets added later once public report data actually exists.
   ========================================================================= */

/* -------------------------------------------------------------------------
   0. DATA FILE PATHS
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

// Western Province approximate bounds (fallback before boundary loads)
const WP_CENTER = [6.86, 80.04];

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
   3. LAYER GROUPS
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
  crossings: L.layerGroup()
};

// Layers visible by default: boundary, roads, crossings.
// Everything else starts off so the first view isn't overcrowded —
// switch any of them on from the panel.
layers.boundary.addTo(map);
layers.roads.addTo(map);
layers.crossings.addTo(map);

/* -------------------------------------------------------------------------
   4. BOUNDARY — Western Province outline
   ------------------------------------------------------------------------- */
loadGeoJSON(DATA.boundary).then(gj => {
  const styled = L.geoJSON(gj, {
    style: {
      color: '#D64545',
      weight: 2.5,
      fillColor: '#0F4C4C',
      fillOpacity: 0.04
    }
  });
  styled.addTo(layers.boundary);
  // Fit the map to the actual province boundary on first load
  try { map.fitBounds(styled.getBounds(), { padding: [20, 20] }); } catch (e) { /* noop */ }

  // "Reset view" button re-fits to the boundary at any time
  document.getElementById('resetViewBtn').addEventListener('click', () => {
    try { map.fitBounds(styled.getBounds(), { padding: [20, 20] }); } catch (e) { /* noop */ }
  });
});

/* -------------------------------------------------------------------------
   5. ROAD NETWORK (major roads — pre-simplified/filtered offline)
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
   7. RAILWAY LINES
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

function buildPointLayer(geojsonUrl, targetGroup, color, countId, popupTitleFallback) {
  loadGeoJSON(geojsonUrl).then(gj => {
    setCount(countId, gj.features.length);
    L.geoJSON(gj, {
      pointToLayer: circleIcon(color),
      onEachFeature: (f, layer) => {
        const p = f.properties;
        layer.bindPopup(`
          <div class="popup-title">${p.name || popupTitleFallback}</div>
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

// Crossings get a slightly distinct marker since it's a key pedestrian-safety layer
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
   9. LAYER TOGGLES (checkbox wiring) — all 10 layers + boundary
   ------------------------------------------------------------------------- */
const TOGGLE_MAP = [
  ['toggle-boundary', 'boundary'],
  ['toggle-roads', 'roads'],
  ['toggle-pedpaths', 'pedpaths'],
  ['toggle-railway', 'railway'],
  ['toggle-railstations', 'railstations'],
  ['toggle-crossings', 'crossings'],
  ['toggle-trafficlights', 'trafficlights'],
  ['toggle-parking', 'parking'],
  ['toggle-schools', 'schools'],
  ['toggle-hospitals', 'hospitals'],
  ['toggle-busstops', 'busstops']
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
   10. PANEL COLLAPSE
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

/* -------------------------------------------------------------------------
   11. LOCATION SEARCH (Nominatim, scoped to Western Province bounding box)
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
