/* ════════════════════════════════════════════════════════
   SafeWalk — script.js

   ┌─ HOW THE GOOGLE FORM / SHEET CONNECTION WORKS ──────────────────────────
   │
   │  SUBMITTING (Report → Google Sheets):
   │  The web map builds a "prefilled" Google Form URL with the user's answers,
   │  then posts it silently to a hidden <iframe> (no page redirect). Google
   │  receives it exactly as if the user submitted the form normally, and saves
   │  it to the linked Google Sheet.
   │
   │  READING (Google Sheets → map popups + dashboard):
   │  The linked Sheet is published as a public CSV. The map fetches that CSV
   │  on every load (and on manual refresh), parses each row, geocodes the
   │  lat/lng from the "Location" column, and renders a colored pin on the map.
   │
   │  SETUP CHECKLIST (do this once — see README for screenshots):
   │  1. In your Google Form editor → ⋮ menu → "Get pre-filled link"
   │     Fill dummy answers → click "Get link" → paste the URL below and copy
   │     each entry.XXXXXXXXX number into the ENTRY_IDS block.
   │  2. In the linked Google Sheet → File → Share → Publish to web
   │     → choose "Sheet1" (or your sheet name) → CSV → Publish
   │     → copy the URL into SHEET_CSV_URL below.
   │
   └──────────────────────────────────────────────────────────────────────────

   ════ ⚠️  FILL THESE IN BEFORE THE MAP WILL WORK ════════════════════════ */

const FORM_ID = '1vaI_n_PsaTVzYlfzbBh4mVnpD1UG5B_SPdKiAbKVHGQ';  // ← already correct

// Paste entry IDs from your prefill URL here.
// Example prefill URL entry looks like:  ...&entry.123456789=myAnswer
// Replace each ENTRY_XXXXXXX with the real number from your form.
const ENTRY = {
  latitude:   'entry.ENTRY_LATITUDE',    // ← replace with real ID e.g. entry.123456789
  longitude:  'entry.ENTRY_LONGITUDE',   // ← replace with real ID
  issueType:  'entry.ENTRY_ISSUE_TYPE',  // ← replace with real ID
  severity:   'entry.ENTRY_SEVERITY',    // ← replace with real ID
  description:'entry.ENTRY_DESCRIPTION', // ← replace with real ID
  name:       'entry.ENTRY_NAME',        // ← replace (if you have a name field)
};

// Publish your Google Sheet as CSV and paste the URL here.
// (Sheet → File → Share → Publish to web → CSV → copy link)
const SHEET_CSV_URL = 'YOUR_PUBLISHED_SHEET_CSV_URL_HERE'; // ← paste here

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
  'Broken Sidewalk':    'Broken sidewalk',
  'Unsafe Crossing':    'Unsafe crossing',
  'Poor Lighting':      'Poor lighting',
  'Flooded Pathway':    'Flooded pathway',
  'Obstruction':        'Obstruction',
  'Accessibility Barrier':'Accessibility barrier',
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
    const sev  = row['Severity']   || row['severity']  || 'Medium';
    const desc = row['Description']|| row['description']|| '';
    const name = row['Name']       || row['Reporter']  || 'Anonymous';
    const date = row['Timestamp']  || row['timestamp'] || '';

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
   REPORT MODAL — 3-step flow
   ════════════════════════════════════════════════════════ */
const modal      = document.getElementById('reportModal');
const step1El    = document.getElementById('step1');
const step2El    = document.getElementById('step2');
const step3El    = document.getElementById('step3');
const coordBox   = document.getElementById('coordBox');
const toStep2Btn = document.getElementById('toStep2');
const submitSucc = document.getElementById('submitSuccess');

let pendingLL  = null;
let pinMarker  = null;
let pickMode   = false;
let currentSev = 'Medium';

function goStep(n){
  step1El.hidden=(n!==1); step2El.hidden=(n!==2); step3El.hidden=(n!==3);
}
function openModal(){
  modal.hidden=false; goStep(1); pickMode=true;
  coordBox.textContent='No location selected yet — click the map.';
  coordBox.classList.remove('has-loc');
  toStep2Btn.disabled=true;
  submitSucc.hidden=true;
  document.getElementById('fIssueType').value='';
  document.getElementById('fDesc').value='';
  document.getElementById('fName').value='';
  setSev('Medium');
  if(pinMarker){map.removeLayer(pinMarker);pinMarker=null;}
  pendingLL=null;
}
function closeModal(){
  modal.hidden=true; pickMode=false;
  if(pinMarker){map.removeLayer(pinMarker);pinMarker=null;}
}

document.getElementById('reportBtn').addEventListener('click',openModal);
document.getElementById('closeModal').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
document.getElementById('closeAfterSubmit').addEventListener('click',closeModal);
document.getElementById('submitAnother').addEventListener('click',openModal);

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

// Step navigation
toStep2Btn.addEventListener('click',()=>{
  if(!pendingLL){ coordBox.textContent='Please select a location first.'; return; }
  goStep(2);
});
document.getElementById('toStep1').addEventListener('click',()=>goStep(1));
document.getElementById('toStep2b').addEventListener('click',()=>goStep(2));

// Severity buttons
function setSev(s){
  currentSev=s;
  document.getElementById('fSeverity').value=s;
  document.querySelectorAll('.sev-btn').forEach(b=>b.classList.remove('active-sev'));
  const btn=document.querySelector(`.sev-btn[data-sev="${s}"]`);
  if(btn) btn.classList.add('active-sev');
}
document.querySelectorAll('.sev-btn').forEach(b=>b.addEventListener('click',()=>setSev(b.dataset.sev)));

// Step 2 → Step 3: build review
document.getElementById('toStep3').addEventListener('click',()=>{
  const type=document.getElementById('fIssueType').value;
  const desc=document.getElementById('fDesc').value.trim();
  if(!type){ alert('Please select an issue type.'); return; }
  if(!desc){ alert('Please add a description.'); return; }

  const name=document.getElementById('fName').value.trim()||'Anonymous';
  document.getElementById('reviewBox').innerHTML=`
    <div><b>Location</b>${pendingLL.lat.toFixed(5)}, ${pendingLL.lng.toFixed(5)}</div>
    <div><b>Issue type</b>${ISSUE_LABELS[type]||type}</div>
    <div><b>Severity</b>${currentSev}</div>
    <div><b>Description</b>${desc}</div>
    <div><b>Name</b>${name}</div>
  `;
  goStep(3);
});

/* ─── Submit to Google Form (silent iframe POST) ────── */
document.getElementById('submitBtn').addEventListener('click',()=>{
  if(!pendingLL) return;

  const type = document.getElementById('fIssueType').value;
  const desc = document.getElementById('fDesc').value.trim();
  const name = document.getElementById('fName').value.trim()||'Anonymous';

  if(ENTRY.latitude.includes('ENTRY_')){
    // Entry IDs not configured yet — show instructions
    alert('⚠️ Google Form entry IDs not configured yet.\n\nOpen js/script.js and replace ENTRY_LATITUDE, ENTRY_LONGITUDE etc. with the real entry IDs from your Google Form prefill URL.\n\nSee README for exact steps.');
    return;
  }

  // Build the prefill submit URL
  const base=`https://docs.google.com/forms/d/${FORM_ID}/formResponse`;
  const params=new URLSearchParams({
    [ENTRY.latitude]:   pendingLL.lat.toFixed(6),
    [ENTRY.longitude]:  pendingLL.lng.toFixed(6),
    [ENTRY.issueType]:  type,
    [ENTRY.severity]:   currentSev,
    [ENTRY.description]:desc,
    [ENTRY.name]:       name,
    'submit':           'Submit',
  });

  // POST silently via hidden iframe
  const iframe=document.getElementById('gformTarget');
  const frm=document.createElement('form');
  frm.method='POST';
  frm.action=base;
  frm.target='gformTarget';
  params.forEach((v,k)=>{
    const inp=document.createElement('input');
    inp.type='hidden'; inp.name=k; inp.value=v;
    frm.appendChild(inp);
  });
  document.body.appendChild(frm);
  frm.submit();
  frm.remove();

  // Immediately add the pin locally so the user sees it right away
  // (the Sheet CSV will include it after Google processes it, ~seconds)
  const color=SEV_COLOR[currentSev]||SEV_COLOR.Medium;
  const radius=currentSev==='High'?9:currentSev==='Medium'?7:5.5;
  const newMarker=L.circleMarker(pendingLL,{radius,weight:2,color:'#fff',fillColor:color,fillOpacity:.93});
  newMarker.bindPopup(`
    <span class="sev-badge sev-${currentSev}">${currentSev} severity</span>
    <div class="pu-title">${ISSUE_LABELS[type]||type}</div>
    ${pRow('Description',desc)}
    ${pRow('Reported by',name)}
    ${pRow('Date','Just now')}
  `);
  newMarker.addTo(LG.reports);

  // Update local allReports so dashboard reflects it immediately
  allReports.push({lat:pendingLL.lat,lng:pendingLL.lng,type,sev:currentSev,desc,name,date:new Date().toISOString()});
  setCount('c-reports',allReports.length);
  updateDashboard();

  // Show success state
  submitSucc.hidden=false;
  document.getElementById('submitBtn').hidden=true;
  document.querySelector('.step-actions').hidden=true;
  pickMode=false;
  if(pinMarker){map.removeLayer(pinMarker);pinMarker=null;}
});

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
