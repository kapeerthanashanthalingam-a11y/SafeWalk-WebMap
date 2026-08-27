/* ════════════════════════════════════════════════════════
   SafeWalk — script.js

   ┌─ HOW THE GOOGLE FORM / SHEET CONNECTION WORKS ──────────────────────────
   │
   │  SUBMITTING (Report → Google Sheets):
   │  Step 1 of the "Report issue" modal lets the user drop a pin on the map.
   │  Step 2 embeds your REAL Google Form in an iframe, pre-filled with that
   │  pin's Latitude/Longitude via Google's "prefilled link" mechanism. The
   │  user sees and fills in your actual form questions (issue type, severity,
   │  date, description, photo, etc.) and clicks Submit themselves, inside the
   │  form. Google saves it to the linked Sheet exactly like any normal
   │  Google Form response.
   │
   │  READING (Google Sheets → map popups + dashboard):
   │  The linked Sheet is published as a public CSV. The map fetches that CSV
   │  on load, on manual refresh, and every AUTO_REFRESH_MS — parses each row,
   │  and renders a colored pin for every response, visible to ALL users.
   │
   │  ⚠️ ONE THING YOUR GOOGLE FORM IS MISSING ───────────────────────────────
   │  Your form (from the screenshot) has no field for coordinates, so add
   │  two questions to your Google Form, both "Short answer", both required:
   │     • "Latitude"
   │     • "Longitude"
   │  (Order doesn't matter. The map fills these in automatically before the
   │  form is shown — the person reporting the issue never types them by hand.)
   │
   │  SETUP CHECKLIST (one-time):
   │  1. Add the "Latitude" / "Longitude" questions above in your Form editor.
   │  2. Form editor → ⋮ menu → "Get pre-filled link" → fill dummy answers for
   │     Latitude and Longitude → "Get link" → open it → look at the URL for
   │     "&entry.XXXXXXXXX=" next to each — copy those two numbers below.
   │  3. In the linked Google Sheet → File → Share → Publish to web
   │     → select the response sheet → CSV → Publish → copy that URL below.
   │
   └──────────────────────────────────────────────────────────────────────────

   ════ ⚠️  ONLY 2 THINGS LEFT TO FILL IN — see steps 2 & 3 above ═════════ */

const FORM_ID = 'https://docs.google.com/forms/u/0/d/e/1FAIpQLSdgncnCOESnZJ2IJYGJAc-TssjL8kB_oAfr15CEbLBS63tLDQ/formResponse';  // ← from your form's action URL (already correct)

// Entry IDs. Only latitude/longitude are actually used now (to pre-fill the
// embedded form) — the rest are kept here for reference / the CSV reader.
const ENTRY = {
  latitude:    'entry.1288249379',   // ← replace after adding the "Latitude" question
  longitude:   'entry.756715849',  // ← replace after adding the "Longitude" question
};

// Publish your Google Sheet as CSV and paste the URL here.
// (Sheet → File → Share → Publish to web → CSV → copy link)
const SHEET_CSV_URL = 'YOUR_PUBLISHED_SHEET_CSV_URL_HERE'; // ← paste here

// How often to auto-refresh public reports from the Sheet, in ms (0 = off)
const AUTO_REFRESH_MS = 60000;

/* ══════════════════════════════════════════════════════ */

const DATA = {
  boundary:  'data/western_province.geojson',
  roads:     'data/roads.geojson',
  pedpaths:  'data/pedestrian_paths.geojson',
  railway:   'data/railway.geojson',
  railstations:'data/railway_stations.geojson',
  schools:   'data/schools.geojson',
  hospitals: 'data/hospitals.geojson',
  busstops:  'data/busstops.geojson',
  parking:   'data/parking.geojson',
  trafficlights:'data/traffic_lights.geojson',
  crossings: 'data/pedestrian_crossings.geojson',
};

const SEV_COLOR  = { Low:'#4C8C6B', Medium:'#E8A33D', High:'#D64545' };
const ISSUE_LABELS = {
  'Broken Sidewalk':            'Broken sidewalk',
  'Unsafe Pedestrian Crossing': 'Unsafe pedestrian crossing',
  'Poor Street Lighting':       'Poor street lighting',
  'Flooded Walkway':            'Flooded walkway',
  'Construction Obstruction':   'Construction obstruction',
  'Illegal Parking on Walkway': 'Illegal parking on walkway',
  'Open Drain':                 'Open drain',
  'Accessibility Barrier':      'Accessibility barrier',
  'Fallen Tree / Vegetation':   'Fallen tree / vegetation',
  'Traffic Signal Problem':     'Traffic signal problem',
  'Other':                      'Other',
};

/* ─── Map init ──────────────────────────────────────── */
const map = L.map('map', {
  center:[6.86,80.04], zoom:10, minZoom:8, maxZoom:19, preferCanvas:true
});

const baseLayers = {
  light:     L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; CARTO &copy; OSM',maxZoom:20}),
  streets:   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles &copy; Esri',maxZoom:19}),
  dark:      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; CARTO &copy; OSM',maxZoom:20}),
};
baseLayers.light.addTo(map);

document.querySelectorAll('.bm-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bm-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(baseLayers).forEach(l=>map.removeLayer(l));
    baseLayers[btn.dataset.base].addTo(map);
  });
});

/* ─── Layer groups ──────────────────────────────────── */
const LG = {
  boundary:     L.layerGroup(),
  roads:        L.layerGroup(),
  pedpaths:     L.layerGroup(),
  railway:      L.layerGroup(),
  railstations: L.layerGroup(),
  schools:      L.layerGroup(),
  hospitals:    L.layerGroup(),
  busstops:     L.layerGroup(),
  parking:      L.layerGroup(),
  trafficlights:L.layerGroup(),
  crossings:    L.layerGroup(),
  reports:      L.layerGroup(),
};

LG.boundary.addTo(map);
LG.roads.addTo(map);
LG.crossings.addTo(map);
LG.reports.addTo(map);

/* ─── Helpers ───────────────────────────────────────── */
async function loadGJ(url) {
  try { const r = await fetch(url); return await r.json(); }
  catch(e){ console.error('GeoJSON load failed',url,e); return {type:'FeatureCollection',features:[]}; }
}
function setCount(id, n) { const el=document.getElementById(id); if(el) el.textContent=n.toLocaleString(); }
function pRow(lbl,val){ if(!val&&val!==0) return ''; return `<div class="pu-row"><b>${lbl}:</b> ${val}</div>`; }

/* ─── Boundary ──────────────────────────────────────── */
let boundaryBounds = null;
loadGJ(DATA.boundary).then(gj=>{
  const layer = L.geoJSON(gj,{style:{color:'#D64545',weight:2.5,fillColor:'#0F4C4C',fillOpacity:.04}});
  layer.addTo(LG.boundary);
  try{ boundaryBounds=layer.getBounds(); map.fitBounds(boundaryBounds,{padding:[20,20]}); }catch(e){}
});

document.getElementById('resetBtn').addEventListener('click',()=>{
  if(boundaryBounds) map.fitBounds(boundaryBounds,{padding:[20,20]});
});

/* ─── Road network ──────────────────────────────────── */
const ROAD_STYLE = {
  motorway:{color:'#C8852A',weight:3}, motorway_link:{color:'#C8852A',weight:2},
  trunk:{color:'#8A8275',weight:2.4},  trunk_link:{color:'#8A8275',weight:1.8},
  primary:{color:'#8A8275',weight:2},  primary_link:{color:'#8A8275',weight:1.6},
  secondary:{color:'#9C9586',weight:1.6}, secondary_link:{color:'#9C9586',weight:1.3},
  tertiary:{color:'#AFA899',weight:1.1},  tertiary_link:{color:'#AFA899',weight:1},
};
loadGJ(DATA.roads).then(gj=>{
  setCount('c-roads',gj.features.length);
  L.geoJSON(gj,{
    style:f=>ROAD_STYLE[f.properties.fclass]||{color:'#8A8275',weight:1},
    onEachFeature:(f,l)=>l.bindPopup(`<div class="pu-title">${f.properties.name||'Unnamed road'}</div>${pRow('Class',f.properties.fclass)}${pRow('Max speed',f.properties.maxspeed?f.properties.maxspeed+' km/h':null)}`)
  }).addTo(LG.roads);
});

/* ─── Pedestrian paths ──────────────────────────────── */
loadGJ(DATA.pedpaths).then(gj=>{
  setCount('c-pedpaths',gj.features.length);
  L.geoJSON(gj,{
    style:{color:'#1C8585',weight:1.5,dashArray:'1,4',opacity:.85},
    onEachFeature:(f,l)=>l.bindPopup(`<div class="pu-title">${f.properties.name||'Pedestrian path'}</div>${pRow('Type',f.properties.fclass)}`)
  }).addTo(LG.pedpaths);
});

/* ─── Railway ───────────────────────────────────────── */
loadGJ(DATA.railway).then(gj=>{
  setCount('c-railway',gj.features.length);
  L.geoJSON(gj,{
    style:{color:'#3B4248',weight:2,dashArray:'6,4'},
    onEachFeature:(f,l)=>l.bindPopup(`<div class="pu-title">${f.properties.name||'Railway line'}</div>`)
  }).addTo(LG.railway);
});

/* ─── Point layer builder ───────────────────────────── */
function mkCircle(color,r=5){
  return f=>L.circleMarker(L.GeoJSON.coordsToLatLng(f.geometry.coordinates),
    {radius:r,weight:1.5,color:'#fff',fillColor:color,fillOpacity:.95});
}
function buildPoints(url,lg,color,countId,fallbackName){
  loadGJ(url).then(gj=>{
    setCount(countId,gj.features.length);
    L.geoJSON(gj,{
      pointToLayer:mkCircle(color),
      onEachFeature:(f,l)=>l.bindPopup(`<div class="pu-title">${f.properties.name||fallbackName}</div>`)
    }).addTo(lg);
  });
}
buildPoints(DATA.schools,    LG.schools,    '#2D6FB0','c-schools',   'School');
buildPoints(DATA.hospitals,  LG.hospitals,  '#C24747','c-hospitals', 'Hospital');
buildPoints(DATA.busstops,   LG.busstops,   '#3F9D6E','c-busstops',  'Bus stop');
buildPoints(DATA.railstations,LG.railstations,'#5C4A8C','c-railstations','Railway station');
buildPoints(DATA.parking,    LG.parking,    '#8E5BAE','c-parking',   'Parking area');
buildPoints(DATA.trafficlights,LG.trafficlights,'#C8852A','c-trafficlights','Traffic signal');

loadGJ(DATA.crossings).then(gj=>{
  setCount('c-crossings',gj.features.length);
  L.geoJSON(gj,{
    pointToLayer:mkCircle('#1C8585',4),
    onEachFeature:(f,l)=>l.bindPopup('<div class="pu-title">Pedestrian crossing</div>')
  }).addTo(LG.crossings);
});

/* ─── Layer toggles ─────────────────────────────────── */
[
  ['t-boundary','boundary'],['t-roads','roads'],['t-pedpaths','pedpaths'],
  ['t-railway','railway'],['t-railstations','railstations'],['t-crossings','crossings'],
  ['t-trafficlights','trafficlights'],['t-parking','parking'],
  ['t-schools','schools'],['t-hospitals','hospitals'],['t-busstops','busstops'],
  ['t-reports','reports'],
].forEach(([cbId,key])=>{
  const cb=document.getElementById(cbId);
  if(!cb) return;
  cb.addEventListener('change',()=>{ cb.checked?map.addLayer(LG[key]):map.removeLayer(LG[key]); });
});

/* ════════════════════════════════════════════════════════
   PUBLIC REPORTS — read from Google Sheets CSV
   ════════════════════════════════════════════════════════ */
let allReports = [];   // holds parsed report objects for dashboard

function parseCSV(text){
  // Split into lines, handle quoted fields with commas inside them
  const lines = text.trim().split('\n');
  if(lines.length < 2) return [];
  const headers = lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cells = [];
    let cur='', inQ=false;
    for(const ch of lines[i]){
      if(ch==='"'){ inQ=!inQ; }
      else if(ch===','&&!inQ){ cells.push(cur.trim()); cur=''; }
      else cur+=ch;
    }
    cells.push(cur.trim());
    const obj={};
    headers.forEach((h,idx)=>{ obj[h]=cells[idx]||''; });
    rows.push(obj);
  }
  return rows;
}

function renderReports(rows){
  LG.reports.clearLayers();
  allReports = [];

  rows.forEach(row=>{
    // ─ Column name mapping ─────────────────────────────
    // These names must match the COLUMN HEADERS in your Google Sheet exactly.
    // If your form questions are named differently, update the keys below.
    const lat  = parseFloat(row['Latitude']  || row['latitude']  || row['LAT'] || '');
    const lng  = parseFloat(row['Longitude'] || row['longitude'] || row['LNG'] || '');
    const type = row['Issue Type'] || row['Issue type'] || row['IssueType'] || '';
    const sev  = row['Severity Level'] || row['Severity'] || row['severity'] || 'Medium';
    const desc = row['Description of the Problem'] || row['Description'] || row['description'] || '';
    const name = row['Reporter Name'] || row['Name'] || row['Reporter'] || 'Anonymous';
    const date = row['Date Observed'] || row['Timestamp'] || row['timestamp'] || '';

    if(!isFinite(lat)||!isFinite(lng)) return; // skip rows with no valid coordinates

    const report = {lat,lng,type,sev,desc,name,date};
    allReports.push(report);

    const color = SEV_COLOR[sev] || SEV_COLOR.Medium;
    const radius = sev==='High'?9:sev==='Medium'?7:5.5;

    const marker = L.circleMarker([lat,lng],{
      radius, weight:2, color:'#fff', fillColor:color, fillOpacity:.93
    });

    marker.bindPopup(`
      <span class="sev-badge sev-${sev}">${sev} severity</span>
      <div class="pu-title">${ISSUE_LABELS[type]||type||'Safety issue'}</div>
      ${pRow('Description',desc)}
      ${pRow('Reported by',name)}
      ${pRow('Date',date?date.split(' ')[0]:'')}
    `);

    marker.addTo(LG.reports);
  });

  setCount('c-reports', allReports.length);
  document.getElementById('loadingReports').style.display='none';
  updateDashboard();
}

async function fetchReports(){
  document.getElementById('loadingReports').style.display='block';

  if(SHEET_CSV_URL==='YOUR_PUBLISHED_SHEET_CSV_URL_HERE'){
    // No Sheet connected yet — show placeholder message
    document.getElementById('loadingReports').textContent='⚠️ Connect your Google Sheet to see public reports (see README).';
    setCount('c-reports',0);
    updateDashboard();
    return;
  }

  try{
    // Google Sheets published CSVs require no-cors proxy in some environments.
    // If you see CORS errors in the console, use the allorigins proxy below.
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEET_CSV_URL)}`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = parseCSV(text);
    renderReports(rows);
  }catch(err){
    console.error('Failed to load Google Sheet CSV',err);
    document.getElementById('loadingReports').textContent='Failed to load reports. Check your Sheet URL.';
    updateDashboard();
  }
}
fetchReports();
document.getElementById('refreshBtn').addEventListener('click', fetchReports);
if(AUTO_REFRESH_MS>0) setInterval(fetchReports, AUTO_REFRESH_MS);

/* ════════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════════ */
function updateDashboard(){
  const total = allReports.length;
  const high  = allReports.filter(r=>r.sev==='High').length;
  const now   = new Date();
  const month = allReports.filter(r=>{
    if(!r.date) return false;
    const d = new Date(r.date);
    return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
  }).length;

  document.getElementById('dTotal').textContent = total;
  document.getElementById('dHigh').textContent  = high;
  document.getElementById('dMonth').textContent  = month;

  // By type
  const byType = {};
  Object.keys(ISSUE_LABELS).forEach(k=>byType[k]=0);
  allReports.forEach(r=>{ byType[r.type]=(byType[r.type]||0)+1; });
  const maxT = Math.max(1,...Object.values(byType));
  document.getElementById('chartType').innerHTML = Object.entries(byType)
    .sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>`
      <div class="br">
        <span class="br-lbl" title="${ISSUE_LABELS[k]||k}">${ISSUE_LABELS[k]||k}</span>
        <span class="br-track"><span class="br-fill" style="width:${(v/maxT*100).toFixed(1)}%"></span></span>
        <span class="br-val">${v}</span>
      </div>`).join('');

  // By severity
  const bySev = {Low:0,Medium:0,High:0};
  allReports.forEach(r=>{ bySev[r.sev]=(bySev[r.sev]||0)+1; });
  const maxS = Math.max(1,...Object.values(bySev));
  document.getElementById('chartSev').innerHTML = Object.entries(bySev).map(([k,v])=>`
    <div class="br">
      <span class="br-lbl">${k}</span>
      <span class="br-track"><span class="br-fill" style="width:${(v/maxS*100).toFixed(1)}%;background:${SEV_COLOR[k]}"></span></span>
      <span class="br-val">${v}</span>
    </div>`).join('');

  // Recent list (last 6)
  const recent = [...allReports].reverse().slice(0,6);
  document.getElementById('recentList').innerHTML = recent.length ? recent.map(r=>`
    <div class="ri">
      <div class="ri-top">
        <span class="ri-type">${ISSUE_LABELS[r.type]||r.type||'Issue'}</span>
        <span class="sev-badge sev-${r.sev}">${r.sev}</span>
      </div>
      <div class="ri-desc">${(r.desc||'').slice(0,100)}${(r.desc||'').length>100?'…':''}</div>
      <div class="ri-meta">${r.name||'Anonymous'} · ${r.date?r.date.split(' ')[0]:''}</div>
    </div>`).join('')
  : '<div class="empty-note">No reports yet — be the first!</div>';
}

/* ════════════════════════════════════════════════════════
   REPORT MODAL — 2-step flow: pin location, then the real
   Google Form embedded (pre-filled with Latitude/Longitude)
   ════════════════════════════════════════════════════════ */
const modal      = document.getElementById('reportModal');
const modalBox   = document.querySelector('.modal');
const step1El    = document.getElementById('step1');
const step2El    = document.getElementById('step2');
const coordBox   = document.getElementById('coordBox');
const toStep2Btn = document.getElementById('toStep2');
const chosenCoordsEl = document.getElementById('chosenCoords');
const gformFrame = document.getElementById('gformFrame');

let pendingLL  = null;
let pinMarker  = null;
let pickMode   = false;

function goStep(n){
  step1El.hidden=(n!==1); step2El.hidden=(n!==2);
  modalBox.classList.toggle('modal-wide', n===2);
}
function openModal(){
  modal.hidden=false; goStep(1); pickMode=true;
  coordBox.textContent='No location selected yet — click the map.';
  coordBox.classList.remove('has-loc');
  toStep2Btn.disabled=true;
  gformFrame.src=''; // clear any previous embedded form
  if(pinMarker){map.removeLayer(pinMarker);pinMarker=null;}
  pendingLL=null;
}
function closeModal(){
  modal.hidden=true; pickMode=false;
  gformFrame.src='';
  if(pinMarker){map.removeLayer(pinMarker);pinMarker=null;}
  // Reports may have changed while the form was open — refresh from the Sheet
  fetchReports();
}

document.getElementById('reportBtn').addEventListener('click',openModal);
document.getElementById('closeModal').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
document.getElementById('closeAfterSubmit').addEventListener('click',closeModal);

// Click map to drop pin
map.on('click',e=>{
  if(!pickMode) return;
  pendingLL=e.latlng;
  coordBox.textContent=`📍 ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
  coordBox.classList.add('has-loc');
  toStep2Btn.disabled=false;
  if(pinMarker) map.removeLayer(pinMarker);
  pinMarker=L.marker(e.latlng,{
    icon:L.divIcon({className:'',html:`<div style="width:14px;height:14px;border-radius:50%;background:#D64545;border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,.5)"></div>`,iconSize:[14,14],iconAnchor:[7,7]})
  }).addTo(map);
});

// GPS
document.getElementById('gpsBtn').addEventListener('click',()=>{
  if(!navigator.geolocation){ coordBox.textContent='Geolocation not supported.'; return; }
  coordBox.textContent='Locating…';
  navigator.geolocation.getCurrentPosition(pos=>{
    const ll=L.latLng(pos.coords.latitude,pos.coords.longitude);
    pendingLL=ll;
    coordBox.textContent=`📍 ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} (GPS)`;
    coordBox.classList.add('has-loc');
    toStep2Btn.disabled=false;
    map.panTo(ll);
    if(pinMarker) map.removeLayer(pinMarker);
    pinMarker=L.marker(ll,{
      icon:L.divIcon({className:'',html:`<div style="width:14px;height:14px;border-radius:50%;background:#D64545;border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,.5)"></div>`,iconSize:[14,14],iconAnchor:[7,7]})
    }).addTo(map);
  },()=>{ coordBox.textContent='Could not get location. Try clicking the map instead.'; });
});

// Step 1 → Step 2: build the pre-filled Google Form URL and embed it
toStep2Btn.addEventListener('click',()=>{
  if(!pendingLL){ coordBox.textContent='Please select a location first.'; return; }

  if(ENTRY.latitude.includes('ENTRY_')){
    alert('⚠️ Latitude/Longitude entry IDs not configured yet.\n\n1. Add "Latitude" and "Longitude" short-answer questions to your Google Form.\n2. Use "Get pre-filled link" to find their entry.XXXXXXXXX IDs.\n3. Paste them into ENTRY.latitude / ENTRY.longitude in js/script.js.\n\nSee the comment block at the top of script.js for full steps.');
    return;
  }

  chosenCoordsEl.textContent = `${pendingLL.lat.toFixed(5)}, ${pendingLL.lng.toFixed(5)}`;

  const params = new URLSearchParams({
    usp: 'pp_url',
    [ENTRY.latitude]:  pendingLL.lat.toFixed(6),
    [ENTRY.longitude]: pendingLL.lng.toFixed(6),
  });
  gformFrame.src = `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?${params.toString()}`;

  goStep(2);
});
document.getElementById('toStep1').addEventListener('click',()=>goStep(1));

/* ════════════════════════════════════════════════════════
   PANEL CONTROLS
   ════════════════════════════════════════════════════════ */
const layerPanel = document.getElementById('layerPanel');
const reopenBtn  = document.getElementById('reopenLeft');
const dashPanel  = document.getElementById('dashPanel');

document.getElementById('collapseLeft').addEventListener('click',()=>{
  layerPanel.classList.add('collapsed'); reopenBtn.hidden=false;
});
reopenBtn.addEventListener('click',()=>{
  layerPanel.classList.remove('collapsed'); reopenBtn.hidden=true;
});

document.getElementById('dashBtn').addEventListener('click',()=>{
  dashPanel.hidden=!dashPanel.hidden;
  if(!dashPanel.hidden) updateDashboard();
});
document.getElementById('closeDash').addEventListener('click',()=>{ dashPanel.hidden=true; });

/* ════════════════════════════════════════════════════════
   LOCATION SEARCH (Nominatim, Western Province scoped)
   ════════════════════════════════════════════════════════ */
const searchInput  = document.getElementById('locationSearch');
const searchResults= document.getElementById('searchResults');
let searchTimer=null;

searchInput.addEventListener('input',()=>{
  clearTimeout(searchTimer);
  const q=searchInput.value.trim();
  if(q.length<3){searchResults.hidden=true;return;}
  searchTimer=setTimeout(()=>runSearch(q),420);
});

async function runSearch(q){
  const vb='79.78,7.36,80.40,6.30';
  const url=`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&viewbox=${vb}&bounded=1&limit=6`;
  try{
    const data=await(await fetch(url,{headers:{'Accept-Language':'en'}})).json();
    if(!data.length){searchResults.innerHTML='<div class="sri">No matches in Western Province.</div>';searchResults.hidden=false;return;}
    searchResults.innerHTML=data.map(d=>`
      <div class="sri" data-lat="${d.lat}" data-lon="${d.lon}">
        <span class="sr-name">${d.display_name.split(',')[0]}</span>
        <span class="sr-meta">${d.display_name}</span>
      </div>`).join('');
    searchResults.hidden=false;
  }catch(e){console.error('Search failed',e);}
}

searchResults.addEventListener('click',e=>{
  const item=e.target.closest('.sri');
  if(!item||!item.dataset.lat) return;
  map.setView([+item.dataset.lat,+item.dataset.lon],16);
  L.popup().setLatLng([+item.dataset.lat,+item.dataset.lon]).setContent(item.querySelector('.sr-name').textContent).openOn(map);
  searchResults.hidden=true;
  searchInput.value=item.querySelector('.sr-name').textContent;
});
document.addEventListener('click',e=>{ if(!e.target.closest('.topbar-search')) searchResults.hidden=true; });
