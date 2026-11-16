'use strict';
/* MOD MAP prototype (KMUTT SE Team G9).
   Search (codes, nicknames, buildings) → campus map → one route: campus paths → N7 entrance → lift → corridor → room.
   Navigation is simulated (testers sit and click) or real (GPS outdoors, tap "next" indoors).
   When the position is lost indoors, a photo of the nearest room sign is read with OCR (Tesseract.js) to find it again.
   Data: data/*.json, built by tools/build_data.py. Campus map © OpenStreetMap contributors (ODbL). */

// ---------- settings
const FEEDBACK_URL = '';                 // Google Form link for testers: paste it here
const WALK = 1.25;                       // m/s, walking speed used for time estimates
const LIFT_S = 60;                       // s added for the lift ride
const ENTRANCE_R = 15;                   // m: a GPS fix this close to the entrance counts as arrived outdoors
const OFFROUTE_M = 25, OFFROUTE_S = 10;  // off route: farther than this, for this long → re-plan
const N7_FLOORS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'B'];
const OCR_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const SCENARIOS = [
  { title: 'หาห้องสอบจากชื่อเล่น', start: 'N10',
    task: 'คุณมีสอบที่ "Slope600" แต่ไม่รู้ว่าอยู่ที่ไหน ตอนนี้คุณยืนอยู่หน้าหอสมุด (N10) ลองค้นหาและนำทางไปให้ถึงห้อง' },
  { title: 'ไปห้องเรียนบนชั้น 6', start: 'S2',
    task: 'คาบต่อไปเรียนที่ห้อง SCL607 ตอนนี้คุณอยู่ที่อาคารจอดรถ (S2) ลองดูเส้นทางแล้วนำทางไปให้ถึงหน้าห้อง' },
  { title: 'สัญญาณหายระหว่างทาง', start: 'N7', loseAt: 0.35,
    task: 'คุณมาถึงอาคาร N7 แล้วและจะไปห้อง SCL600 ระหว่างเดินบนชั้น 6 ระบบจะหาตำแหน่งไม่เจอ ให้ถ่ายรูปป้ายหน้าห้องที่ใกล้ที่สุดเพื่อหาตำแหน่งใหม่' },
];

// ---------- small helpers
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const fmtDist = (m) => (m < 1000 ? `${Math.max(5, Math.round(m / 10) * 10)} เมตร` : `${(m / 1000).toFixed(1)} กิโลเมตร`);
const fmtMin = (sec) => `${Math.max(1, Math.round(sec / 60))} นาที`;

// ---------- geometry
const RAD = Math.PI / 180;
function hav(a, b) {
  const dLa = (b[0] - a[0]) * RAD, dLo = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}
const KX = 111320 * Math.cos(13.65 * RAD), KY = 110540;      // metres per degree near KMUTT
const xy = (ll) => [ll[1] * KX, ll[0] * KY];                  // lat/lng → planar metres (x east, y north)
const dXY = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dLL = (a, b) => dXY(xy(a), xy(b));
const bearing = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD + 360) % 360; // planar, clockwise from +y
function turnOf(b1, b2) { let d = b2 - b1; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; }
function mkLine(pts, dist) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function along(line, s) {
  const { pts, cum } = line;
  if (s <= 0 || pts.length < 2) return pts[0];
  if (s >= line.len) return pts[pts.length - 1];
  let i = 1; while (cum[i] < s) i++;
  const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}
function project(line, ll) {          // closest point of an outdoor line to a lat/lng: {s, d}
  const p = xy(ll); let best = { s: 0, d: Infinity };
  for (let i = 1; i < line.pts.length; i++) {
    const a = xy(line.pts[i - 1]), b = xy(line.pts[i]);
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2));
    const d = Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]);
    if (d < best.d) best = { s: line.cum[i - 1] + t * Math.sqrt(L2), d };
  }
  return best;
}

// ---------- data
let CAMPUS, PLACES, N7, G;
const BYID = {};
async function loadData() {
  const [c, p, n] = await Promise.all(['campus', 'places', 'n7'].map((f) =>
    fetch(`data/${f}.json`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); })));
  CAMPUS = c; PLACES = p; N7 = n;
  for (const x of PLACES) BYID[x.id] = x;
  const adj = c.graph.nodes.map(() => []);
  for (const [a, b, d] of c.graph.edges) { adj[a].push([b, d]); adj[b].push([a, d]); }
  G = { nodes: c.graph.nodes, adj };
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= K[i]) break; [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p; }
  }
  pop() {
    const K = this.k, V = this.v, top = V[0], lk = K.pop(), lv = V.pop();
    if (K.length) {
      K[0] = lk; V[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < K.length && K[l] < K[m]) m = l;
        if (r < K.length && K[r] < K[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m;
      }
    }
    return top;
  }
}
function nearestNode(ll) {
  let bi = 0, bd = Infinity;
  G.nodes.forEach((p, i) => { const d = dLL(ll, p); if (d < bd) { bd = d; bi = i; } });
  return bi;
}
function astar(s, t, pen) {
  const N = G.nodes.length, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const h = (i) => dLL(G.nodes[i], G.nodes[t]);
  const heap = new Heap(); g[s] = 0; heap.push(h(s), s);
  while (heap.size) {
    const u = heap.pop(); if (done[u]) continue; done[u] = 1; if (u === t) break;
    for (const [v, d] of G.adj[u]) {
      const w = d * (pen ? pen.get(u < v ? `${u}_${v}` : `${v}_${u}`) || 1 : 1);
      if (g[u] + w < g[v]) { g[v] = g[u] + w; prev[v] = u; heap.push(g[v] + h(v), v); }
    }
  }
  if (!Number.isFinite(g[t])) return null;
  const path = []; for (let v = t; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}

// ---------- directory and search
const THD = '๐๑๒๓๔๕๖๗๘๙';
const norm = (s) => String(s || '').toLowerCase().replace(/[๐-๙]/g, (d) => THD.indexOf(d)).replace(/[\s\-_.()/]/g, '');
function parseCode(q) {                  // room codes students type → building + floor (research/04 §4)
  const s = norm(q).toUpperCase(); let m;
  const mk = (b, f, label) => ({ b, floor: String(f), label });
  if ((m = s.match(/^(?:SCL|N7)(\d)(\d{2})$/))) return mk('N7', m[1], `SCL${m[1]}${m[2]}`);
  if ((m = s.match(/^CB([12])(\d)(\d{2})$/))) return mk(m[1] === '1' ? 'N20' : 'N17', m[2], `CB${m[1]}${m[2]}${m[3]}`);
  if ((m = s.match(/^CB([345])(\d{2})(\d{2})$/))) return mk({ 3: 'S13', 4: 'S12', 5: 'S11' }[m[1]], +m[2], `CB${m[1]}${m[2]}${m[3]}`);
  if ((m = s.match(/^LIB(\d)(\d{2})$/))) return mk('N10', m[1], s);
  if ((m = s.match(/^CH(\d)(\d{2})$/))) return mk('N3', m[1], s);
  if ((m = s.match(/^LNG(\d)(\d{2})$/))) return mk('N15', m[1], s);
  if ((m = s.match(/^SC2(\d)(\d{2})$/))) return mk('N4', m[1], s);
  return null;
}
function codePlace(c) {
  const id = `code:${c.label}`;
  if (!BYID[id]) BYID[id] = { id, kind: 'coderoom', code: c.label, building: c.b, floor: c.floor, mapped: false };
  return BYID[id];
}
function keysOf(p) {
  return p.kind === 'building' ? [p.code, ...(p.aliases || []), p.th, p.en] : [p.code, p.official, ...(p.aliases || []), p.th];
}
function search(q) {
  const n = norm(q); if (!n) return [];
  const out = [];
  for (const p of PLACES) {
    let best = 0, hit = null;
    for (const k of keysOf(p)) {
      const nk = norm(k); if (!nk) continue;
      let sc = 0;
      if (nk === n) sc = 100; else if (nk.startsWith(n)) sc = 80 - Math.min(20, nk.length - n.length); else if (n.length >= 2 && nk.includes(n)) sc = 45;
      if (sc > best) { best = sc; hit = k; }
    }
    if (best) out.push({ p, score: best + (p.kind === 'building' ? 2 : 0) + (p.nick && norm(p.nick) === norm(hit) ? 5 : 0), hit });
  }
  const c = parseCode(q);
  if (c && !out.some((r) => norm(r.p.code) === norm(c.label))) out.push({ p: codePlace(c), score: 90, hit: c.label });
  out.sort((a, b) => b.score - a.score || String(a.p.code).localeCompare(String(b.p.code), undefined, { numeric: true }));
  return out.slice(0, 30);
}
function titleOf(p, hit) {
  if (p.kind === 'room') {
    const byCode = hit && (norm(hit) === norm(p.code) || norm(hit) === norm(p.official));
    return p.nick && !byCode ? `${p.nick} (${p.code})` : p.code;
  }
  if (p.kind === 'building' && hit && norm(hit) !== norm(p.code) && /^[A-Za-z0-9 ]{2,6}$/.test(hit)) return hit.toUpperCase();
  return p.code;
}
function subOf(p, long) {
  if (p.kind === 'building') return p.th;
  const b = BYID[p.building], bn = b ? b.th : p.building;
  return long ? `${bn} (${p.building}) ชั้น ${p.floor}` : `${bn} ชั้น ${p.floor}`;
}
function buildingOf(p) { return p.kind === 'building' ? p : BYID[p.building]; }

const RECENT_KEY = 'mm_recent';
function recents() {
  const ids = store.get(RECENT_KEY, null) || ['N7-607', 'N16', 'code:CB2405', 'S13'];
  return ids.map((id) => BYID[id] || (id.startsWith('code:') ? codePlace(parseCode(id.slice(5))) : null)).filter(Boolean);
}
function pushRecent(p) {
  const ids = [p.id, ...recents().map((x) => x.id).filter((id) => id !== p.id)].slice(0, 8);
  store.set(RECENT_KEY, ids);
}

// ---------- state
const S = {
  mode: 'sim', me: null, acc: null, scenario: null,
  place: null, origin: { type: 'me' }, routeKind: 'fast', route: null,
  pickField: 'to', listMode: 'search', viewFloor: null,
};

// ---------- maps
let cmap, fmap;
const C = {};
const meIcon = (lost) => L.divIcon({ className: '', html: `<div class="me-marker${lost ? ' lost' : ''}"><i></i></div>`, iconSize: [64, 64], iconAnchor: [32, 32] });
const pinIcon = () => L.divIcon({ className: 'pin-marker', html: '<img src="icons/pin.svg" alt="">', iconSize: [32, 48], iconAnchor: [16, 46] });
const pinLabel = (t) => L.divIcon({ className: 'pin-label', html: esc(t), iconSize: [140, 20], iconAnchor: [-20, 36] });

function initMaps() {
  cmap = L.map('cmap', { zoomControl: false, minZoom: 15, maxZoom: 20, zoomSnap: 0.25, attributionControl: true });
  cmap.attributionControl.setPrefix(false).addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors');
  const R = L.canvas({ padding: 0.4 });
  const base = L.layerGroup().addTo(cmap);
  for (const p of CAMPUS.green) L.polygon(p, { renderer: R, stroke: false, fillColor: '#d4e8ca', fillOpacity: 1, interactive: false }).addTo(base);
  for (const p of CAMPUS.water) L.polygon(p, { renderer: R, stroke: false, fillColor: '#a9d6f0', fillOpacity: 1, interactive: false }).addTo(base);
  for (const l of CAMPUS.waterlines) L.polyline(l, { renderer: R, color: '#a9d6f0', weight: 5, interactive: false }).addTo(base);
  const rank = { path: 0, minor: 1, major: 2 };
  const roads = [...CAMPUS.roads].sort((a, b) => rank[a.c] - rank[b.c]);
  for (const r of roads) if (r.c !== 'path') L.polyline(r.pts, { renderer: R, color: '#ffffff', weight: r.c === 'major' ? 11 : 8, lineCap: 'round', interactive: false }).addTo(base);
  for (const r of roads) {
    L.polyline(r.pts, { renderer: R, color: r.c === 'major' ? '#aebbcc' : r.c === 'minor' ? '#c3ccd8' : '#cfd6df',
      weight: r.c === 'major' ? 8 : r.c === 'minor' ? 5 : 2.5, dashArray: r.c === 'path' ? '4 4' : null, lineCap: 'round', interactive: false }).addTo(base);
  }
  for (const b of CAMPUS.buildings) L.polygon(b.poly, { renderer: R, color: '#cfcac2', weight: 1, fillColor: '#e3e0da', fillOpacity: 1, interactive: false }).addTo(base);
  C.hl = L.layerGroup().addTo(cmap);
  C.labels = L.layerGroup();
  for (const p of PLACES) {
    if (p.kind !== 'building' || !p.c) continue;
    L.marker(p.c, { interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'blabel', html: `<b>${esc(p.code)}</b><br>${esc(short(p.th, 20))}`, iconSize: [130, 26], iconAnchor: [65, 13] }) }).addTo(C.labels);
  }
  const syncLabels = () => { if (cmap.getZoom() >= 17) C.labels.addTo(cmap); else C.labels.remove(); };
  cmap.on('zoomend', syncLabels);
  C.route = L.layerGroup().addTo(cmap);
  C.pins = L.layerGroup().addTo(cmap);
  C.me = L.marker([0, 0], { icon: meIcon(false), interactive: false, keyboard: false, zIndexOffset: 1000 });
  cmap.fitBounds(campusBounds(), { padding: [10, 10] });
  syncLabels();

  fmap = L.map('fmap', { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, minZoom: 0.5, maxZoom: 6, zoomSnap: 0.25 });
  C.floor = L.layerGroup().addTo(fmap);
  C.fpins = L.layerGroup().addTo(fmap);
  C.froute = L.layerGroup().addTo(fmap);
  C.fme = L.marker([0, 0], { icon: meIcon(false), interactive: false, keyboard: false, zIndexOffset: 1000 });
  fmap.on('zoomend', () => { document.body.classList.toggle('fz-near', fmap.getZoom() >= 2.4); });
}
function campusBounds() {
  const pts = PLACES.filter((p) => p.kind === 'building' && p.c).map((p) => p.c);
  return L.latLngBounds(pts).pad(0.08);
}
function showMap(which) {
  const f = which === 'floor';
  $('#fmap').hidden = !f; $('#cmap').hidden = f;
  (f ? fmap : cmap).invalidateSize(false);
}
const fll = (p) => [p[1], p[0]];        // floor [x, y] → Leaflet CRS.Simple [lat, lng]

function liftBox(F) { const cy = F.corridor.y; return [59.6, cy - 7.2, 66.4, cy - 1.7]; }
function drawFloor(fl, hitCode) {
  S.viewFloor = fl;
  C.floor.clearLayers(); C.fpins.clearLayers();
  const F = N7.floors[fl], cy = F.corridor.y;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of F.boxes) { x0 = Math.min(x0, b.box[0]); y0 = Math.min(y0, b.box[1]); x1 = Math.max(x1, b.box[2]); y1 = Math.max(y1, b.box[3]); }
  L.rectangle([[y0 - 1.5, x0 - 1.5], [y1 + 1.5, x1 + 1.5]], { color: '#9a9a9a', weight: 1, fillColor: '#f3f3f3', fillOpacity: 1, interactive: false }).addTo(C.floor);
  L.rectangle([[cy - 1.6, F.corridor.x0], [cy + 1.6, F.corridor.x1]], { stroke: false, fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(C.floor);
  const boxes = F.boxes.map((b) => ({ ...b, box: [...b.box] }));
  boxes.push({ code: 'lift', label: 'ลิฟต์', kind: 'lift', box: liftBox(F) });
  for (const b of boxes) {
    const bx = b.box;
    if (bx[1] < cy - 1.6 && bx[3] > cy + 1.6) { if ((bx[1] + bx[3]) / 2 > cy) bx[1] = cy + 1.6; else bx[3] = cy - 1.6; } // keep the corridor clear
    const hit = b.code === hitCode;
    const fill = b.kind === 'lift' ? '#bdbdbd' : b.kind === 'wc' ? '#d8e2ea' : hit ? '#ffe3cc' : '#d3d3d3';
    L.rectangle([[bx[1], bx[0]], [bx[3], bx[2]]], { color: hit ? '#fb8c3a' : '#8c8c8c', weight: hit ? 2.5 : 1, fillColor: fill, fillOpacity: 1, interactive: false }).addTo(C.floor);
    const lab = b.kind === 'lift' ? 'ลิฟต์/บันได' : b.kind === 'wc' ? 'ห้องน้ำ' : b.label;
    if (!hit) {
      L.marker([(bx[1] + bx[3]) / 2, (bx[0] + bx[2]) / 2], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'rlabel far', html: esc(lab), iconSize: [80, 16], iconAnchor: [40, 8] }) }).addTo(C.floor);
    }
    if (hit) {
      const c = [(bx[1] + bx[3]) / 2, (bx[0] + bx[2]) / 2];
      L.marker(c, { icon: pinIcon(), interactive: false }).addTo(C.fpins);
      L.marker(c, { icon: pinLabel(BYID[b.code] ? titleOf(BYID[b.code]) : b.label), interactive: false }).addTo(C.fpins);
    }
  }
  $('#floorpill-t').textContent = `ชั้น ${fl}`;
}
function fitFloor(fl) {
  const F = N7.floors[fl];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of F.boxes) { x0 = Math.min(x0, b.box[0]); y0 = Math.min(y0, b.box[1]); x1 = Math.max(x1, b.box[2]); y1 = Math.max(y1, b.box[3]); }
  fmap.fitBounds([[y0, x0], [y1, x1]], { padding: [16, 16] });
}

// ---------- screens
const SCREENS = ['home', 'list', 'place', 'preview', 'loading', 'nav', 'welcome'];
function show(name) {
  for (const s of SCREENS) $(`#${s}`).hidden = s !== name;
  if (name !== 'nav') { $('#arrived').hidden = true; }
  $('#dim').hidden = true;
}

// home
function goHome() {
  show('home'); showMap('campus');
  C.route.clearLayers(); C.pins.clearLayers(); C.hl.clearLayers();
  placeMe();
  renderTask();
}
function placeMe() {
  if (!S.me) return;
  C.me.setIcon(meIcon(false)); C.me.setLatLng(S.me).addTo(cmap);
}
function renderTask() {
  let t = $('#task');
  if (!t) { t = document.createElement('button'); t.id = 'task'; t.className = 'task'; $('#home').appendChild(t); t.addEventListener('click', openWelcome); }
  const sc = S.scenario;
  t.hidden = !sc;
  if (sc) t.innerHTML = `<b>สถานการณ์ ${SCENARIOS.indexOf(sc) + 1}:</b> ${esc(sc.task)}`;
}

// list page: search, category, picker
function openList(mode, opts = {}) {
  S.listMode = mode;
  show('list');
  $('#pickhead').hidden = mode !== 'pick';
  $('#listtitle').hidden = true;
  const q = $('#q');
  if (mode === 'category') {
    q.value = opts.label; $('#q-clear').hidden = false;
    const list = PLACES.filter((p) => p.kind === 'building' && p.cats.includes(opts.cat))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    renderResults(list.map((p) => ({ p })), 'pin');
    return;
  }
  if (mode === 'pick') {
    $('#pick-from').value = S.origin.type === 'me' ? '' : titleOf(S.origin.p);
    $('#pick-to').value = S.place ? titleOf(S.place) : '';
    S.pickField = 'to';
    renderPick();
    setTimeout(() => $('#pick-to').focus(), 50);
    return;
  }
  q.value = opts.q || ''; $('#q-clear').hidden = !q.value;
  renderSearch();
  setTimeout(() => q.focus(), 50);
}
function renderSearch() {
  const v = $('#q').value.trim();
  $('#q-clear').hidden = !v;
  if (!v) { $('#listtitle').hidden = false; $('#listtitle').textContent = 'ล่าสุด'; renderResults(recents().map((p) => ({ p })), 'clock'); return; }
  $('#listtitle').hidden = true;
  renderResults(search(v), 'pin');
}
function renderPick() {
  const field = S.pickField === 'from' ? $('#pick-from') : $('#pick-to');
  const v = field.value.trim();
  if (!v) {
    $('#listtitle').hidden = false; $('#listtitle').textContent = 'ล่าสุด';
    const rows = recents().map((p) => ({ p }));
    if (S.pickField === 'from') rows.unshift({ me: true });
    renderResults(rows, 'clock');
  } else { $('#listtitle').hidden = true; renderResults(search(v), 'pin'); }
}
const ICO = {
  pin: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="none" stroke="#fb8c3a" stroke-width="1.8"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fb8c3a" stroke-width="1.8"/><path d="M12 7v5l3 2" fill="none" stroke="#fb8c3a" stroke-width="1.8" stroke-linecap="round"/></svg>',
  me: '<span class="you-dot"></span>',
};
function renderResults(rows, icon) {
  const ul = $('#results'); ul.innerHTML = '';
  if (!rows.length) { ul.innerHTML = '<li class="empty">ไม่พบสถานที่ที่ค้นหา ลองพิมพ์รหัสห้อง เช่น SCL607 หรือชื่อเล่น เช่น Slope600</li>'; return; }
  for (const r of rows) {
    const li = document.createElement('li'), b = document.createElement('button');
    if (r.me) {
      b.innerHTML = `<span class="ic">${ICO.me}</span><span><div class="t">ตำแหน่งของคุณ</div></span>`;
      b.addEventListener('click', () => { S.origin = { type: 'me' }; $('#pick-from').value = ''; S.pickField = 'to'; $('#pick-to').focus(); renderPick(); });
    } else {
      const p = r.p, t = titleOf(p, r.hit);
      const sub = p.kind === 'building' ? (t !== p.code ? `${p.code} · ${p.th}` : p.th) : subOf(p);
      const tag = p.kind === 'coderoom' || (p.kind === 'room' && !p.mapped) ? '<span class="tag">ยังไม่มีแผนผังชั้น</span>' : '';
      b.innerHTML = `<span class="ic">${ICO[icon]}</span><span><div class="t">${esc(t)}${tag}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</span>`;
      b.addEventListener('click', () => choose(p));
    }
    li.appendChild(b); ul.appendChild(li);
  }
}
function choose(p) {
  pushRecent(p);
  if (S.listMode === 'pick') {
    if (S.pickField === 'from') { S.origin = { type: 'place', p }; $('#pick-from').value = titleOf(p); S.pickField = 'to'; $('#pick-to').focus(); renderPick(); return; }
    S.place = p; openPreview(); return;
  }
  openPlace(p);
}

// place sheet
function openPlace(p) {
  S.place = p;
  show('place'); showMap('campus');
  $('#place-q').textContent = titleOf(p);
  $('#place-title').textContent = titleOf(p);
  $('#place-sub').textContent = subOf(p, true);
  $('#place-thumb').innerHTML = thumbSVG(p);
  const b = buildingOf(p);
  const note = $('#place-note');
  note.hidden = p.kind === 'building' || p.mapped;
  note.textContent = 'อาคารนี้ยังไม่มีแผนผังภายใน เส้นทางจะพาไปถึงทางเข้าอาคาร แล้วบอกชั้นของห้อง';
  $('#place-btns').hidden = false; $('#btn-finish').hidden = true; $('#place-close').hidden = false;
  $('#btn-layers').hidden = !(p.kind === 'room' && p.mapped);
  $('#btn-route').disabled = $('#btn-start').disabled = !(b && b.entrance);
  C.route.clearLayers(); C.pins.clearLayers(); C.hl.clearLayers();
  if (b && b.c) {
    highlightBuilding(b);
    L.marker(b.c, { icon: pinIcon(), interactive: false }).addTo(C.pins);
    L.marker(b.c, { icon: pinLabel(titleOf(p)), interactive: false }).addTo(C.pins);
    cmap.setView(b.c, 18, { animate: false });
    cmap.panBy([0, 160], { animate: false });
  }
  placeMe();
}
function highlightBuilding(b) {
  const poly = CAMPUS.buildings.reduce((best, x) => {
    const d = dLL(x.c, b.c); return d < best.d ? { d, x } : best;
  }, { d: Infinity, x: null }).x;
  if (poly) L.polygon(poly.poly, { color: '#fb8c3a', weight: 1.5, fillColor: '#fde3cc', fillOpacity: 1, interactive: false }).addTo(C.hl);
}
function toggleLayers() {
  const p = S.place;
  if (!$('#fmap').hidden) { showMap('campus'); return; }
  drawFloor(p.floor, p.id); showMap('floor'); C.froute.clearLayers();
  const F = N7.floors[p.floor], box = F.boxes.find((x) => x.code === p.id);
  if (box) fmap.setView([(box.box[1] + box.box[3]) / 2 - 8, (box.box[0] + box.box[2]) / 2], 3, { animate: false });
  else fitFloor(p.floor);
}
function thumbSVG(p) {
  if (p.kind === 'room' && p.mapped) {
    const F = N7.floors[p.floor]; const cy = F.corridor.y;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of F.boxes) { x0 = Math.min(x0, b.box[0]); y0 = Math.min(y0, b.box[1]); x1 = Math.max(x1, b.box[2]); y1 = Math.max(y1, b.box[3]); }
    const hit = F.boxes.find((b) => b.code === p.id);
    if (hit) { const cx = (hit.box[0] + hit.box[2]) / 2; x0 = Math.max(x0, cx - 45); x1 = Math.min(x1, cx + 45); y0 = Math.max(y0, Math.min(hit.box[1], cy) - 10); y1 = Math.min(y1, Math.max(hit.box[3], cy) + 10); }
    const r = (b, fill, stroke, w) => `<rect x="${b[0]}" y="${-b[3]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
    let s = `<svg viewBox="${x0 - 2} ${-y1 - 2} ${x1 - x0 + 4} ${y1 - y0 + 4}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="แผนผังชั้น ${p.floor} ตำแหน่งห้อง ${esc(p.code)}">`;
    s += `<rect x="${x0 - 2}" y="${-y1 - 2}" width="${x1 - x0 + 4}" height="${y1 - y0 + 4}" fill="#f3f3f3"/>`;
    s += r([F.corridor.x0, cy - 1.6, F.corridor.x1, cy + 1.6], '#fff', 'none', 0);
    for (const b of F.boxes) s += r(b.box, b === hit ? '#ffe3cc' : b.kind === 'wc' ? '#d8e2ea' : '#d3d3d3', b === hit ? '#fb8c3a' : '#8c8c8c', b === hit ? 0.6 : 0.25);
    if (hit) s += `<text x="${(hit.box[0] + hit.box[2]) / 2}" y="${-(hit.box[1] + hit.box[3]) / 2 + 1.5}" font-size="4" text-anchor="middle" fill="#fb8c3a" font-family="Prompt">${esc(p.code)}</text>`;
    return s + `<text x="${x0}" y="${-y0 + 1}" font-size="3" fill="#757575" font-family="Kanit">แผนผังชั้น ${p.floor} (แบบย่อ)</text></svg>`;
  }
  const b = buildingOf(p); if (!b || !b.c) return '';
  const near = CAMPUS.buildings.filter((x) => dLL(x.c, b.c) < 110);
  const P = (ll) => { const q = xy(ll), o = xy(b.c); return [q[0] - o[0], -(q[1] - o[1])]; };
  let s = '<svg viewBox="-90 -55 180 110" preserveAspectRatio="xMidYMid slice" role="img" aria-label="ตำแหน่งอาคาร">';
  s += '<rect x="-90" y="-55" width="180" height="110" fill="#eeeeec"/>';
  const hit = near.reduce((best, x) => (dLL(x.c, b.c) < best.d ? { d: dLL(x.c, b.c), x } : best), { d: Infinity, x: null }).x;
  for (const x of near) {
    const pts = x.poly.map(P).map((q) => q.join(',')).join(' ');
    s += `<polygon points="${pts}" fill="${x === hit ? '#fde3cc' : '#e0ddd7'}" stroke="${x === hit ? '#fb8c3a' : '#cbc6be'}" stroke-width="${x === hit ? 1.2 : 0.6}"/>`;
  }
  if (b.entrance) { const e = P(b.entrance); s += `<circle cx="${e[0]}" cy="${e[1]}" r="3" fill="#fb8c3a"/><text x="${e[0] + 5}" y="${e[1] + 1.5}" font-size="6" fill="#fb8c3a" font-family="Kanit">${b.entrance_checked ? 'ทางเข้า' : 'ทางเข้า (โดยประมาณ)'}</text>`; }
  return s + `<text x="-86" y="-46" font-size="7" fill="#555" font-family="Kanit">${esc(b.code)} · ${esc(short(b.th, 26))}</text></svg>`;
}

// ---------- route planning
function originInfo() {
  if (S.origin.type === 'place') {
    const b = buildingOf(S.origin.p);
    return { ll: b.entrance, node: b.entrance_node, label: titleOf(S.origin.p) };
  }
  return { ll: S.me, node: null, label: 'ตำแหน่งของคุณ' };
}
function legsOf(P, minTurn, minLeg) {
  const legs = [];
  for (let i = 1; i < P.length; i++) {
    const L = dXY(P[i - 1], P[i]); if (L < 0.3) continue;
    const b = bearing(P[i - 1], P[i]), last = legs[legs.length - 1];
    if (!last) { legs.push({ turn: 0, b, L }); continue; }
    const d = turnOf(last.b, b);
    if (Math.abs(d) >= minTurn && last.L >= minLeg) legs.push({ turn: d, b, L });
    else { last.L += L; last.b = b; }
  }
  for (let i = legs.length - 1; i > 0; i--) if (legs[i].L < minLeg) { legs[i - 1].L += legs[i].L; legs.splice(i, 1); }
  return legs;
}
const TURN_T = { straight: 'เดินตรง', left: 'เลี้ยวซ้าย', right: 'เลี้ยวขวา', uturn: 'หันหลังกลับ' };
function turnIcon(t, first) { if (first || Math.abs(t) < 30) return 'straight'; if (Math.abs(t) > 150) return 'uturn'; return t > 0 ? 'right' : 'left'; }
function legSteps(legs, phase, firstTitle) {
  let s0 = 0;
  return legs.map((g, i) => {
    const icon = turnIcon(g.turn, i === 0);
    const st = { icon, title: i === 0 && firstTitle ? firstTitle : TURN_T[icon], len: g.L, s0, s1: s0 + g.L, phase };
    s0 += g.L; return st;
  });
}
function indoorPlan(floor, code, fromX) {
  const F = N7.floors[floor], cy = F.corridor.y, door = F.doors[code];
  if (!door) return null;
  const pts = fromX == null ? [[63, cy - 3.2], [63, cy]] : [[fromX, cy]];
  if (Math.abs(door.x - pts[pts.length - 1][0]) > 0.3) pts.push([door.x, cy]);
  let sideTxt = '';
  if (door.via) for (const v of door.via) pts.push(v);
  else {
    const walkDir = Math.sign(door.x - (fromX == null ? 63 : fromX));
    const left = walkDir === 0 ? null : (door.side === 'N') === (walkDir > 0);
    sideTxt = walkDir === 0 ? (door.side === 'N' ? 'อยู่ตรงหน้า' : 'อยู่ด้านหลัง') : left ? 'อยู่ทางซ้าย' : 'อยู่ทางขวา';
  }
  const line = mkLine(pts, dXY);
  const legs = legsOf(pts, 30, 1);
  const steps = legSteps(legs, 'in', fromX == null ? 'ออกจากลิฟต์แล้วเดินตรง' : null);
  const room = BYID[code];
  steps.push({ icon: 'arrive', title: `ถึง ${room ? titleOf(room) : code}`, sub: sideTxt, len: 0, s0: line.len, s1: line.len, phase: 'in' });
  return { floor, ...line, steps, door };
}
function planRoute(dest, kind) {
  const b = buildingOf(dest);
  if (!b || b.entrance_node == null) return null;
  const o = originInfo();
  if (!o.ll) return null;
  const sn = o.node != null ? o.node : nearestNode(o.ll);
  let path = astar(sn, b.entrance_node);
  if (path && kind === 'shade' && path.length > 2) {
    // Concept mock: no covered-walkway data yet, so show a plausible different route (penalise the fastest one's edges).
    const key = (a, c) => (a < c ? `${a}_${c}` : `${c}_${a}`);
    const fastEdges = new Set(path.slice(1).map((c, i) => key(path[i], c)));
    const lenOf = (p) => p.slice(1).reduce((t, c, i) => t + dLL(G.nodes[p[i]], G.nodes[c]), 0);
    const fastLen = lenOf(path);
    for (const k of [1.6, 2.5, 4, 8]) {
      const pen = new Map([...fastEdges].map((e) => [e, k]));
      const alt = astar(sn, b.entrance_node, pen); if (!alt) continue;
      const shared = alt.slice(1).filter((c, i) => fastEdges.has(key(alt[i], c))).length / Math.max(1, alt.length - 1);
      if (shared < 0.7 && lenOf(alt) <= 2 * fastLen + 50) { path = alt; break; }
    }
  }
  if (!path) return null;
  let pts = path.map((i) => G.nodes[i]);
  if (dLL(o.ll, pts[0]) > 2) pts = [o.ll, ...pts];
  const out = mkLine(pts, dLL);
  const steps = out.len > 3 ? legSteps(legsOf(pts.map(xy), 35, 8), 'out', null) : [];
  const inn = dest.kind === 'room' && dest.mapped ? indoorPlan(dest.floor, dest.id) : null;
  if (inn) {
    steps.push({ icon: 'enter', title: `เข้าอาคาร ${b.code}`, sub: b.entrance_checked ? '' : 'ทางเข้าโดยประมาณ', len: 0, s0: out.len, s1: out.len, phase: 'out' });
    steps.push({ icon: 'lift', title: `ขึ้นลิฟต์ไปยังชั้น ${dest.floor}`, len: 0, s0: 0, s1: 0, phase: 'lift' });
    steps.push(...inn.steps);
  } else {
    const sub = dest.kind === 'building' ? b.th : `ห้องอยู่ชั้น ${dest.floor} · ยังไม่มีแผนผังภายในอาคารนี้`;
    steps.push({ icon: 'arrive', title: dest.kind === 'building' ? `ถึง ${b.code}` : `ถึงอาคาร ${b.code} แล้วขึ้นไปชั้น ${dest.floor}`, sub, len: 0, s0: out.len, s1: out.len, phase: 'out' });
  }
  const total = out.len + (inn ? inn.len : 0);
  const secs = total / WALK + (inn ? LIFT_S : 0);
  return { dest, kind, originLabel: o.label, out, inn, steps, total, secs };
}

// ---------- route preview
function openPreview() {
  const p = S.place;
  if (S.origin.type === 'me' && !S.me) { toast('ยังไม่ทราบตำแหน่งของคุณ เลือกจุดเริ่มต้นจากรายการ'); openList('pick'); S.pickField = 'from'; return; }
  S.routeKind = 'fast';
  S.route = planRoute(p, 'fast');
  if (!S.route) { toast('หาเส้นทางไปที่นี่ไม่ได้'); return; }
  show('preview'); showMap('campus');
  $('#pv-from').textContent = S.route.originLabel;
  $('#pv-to').textContent = titleOf(p);
  $('#pv-steps').hidden = true;
  renderPreview();
}
function renderPreview() {
  const r = S.route, shade = S.routeKind === 'shade';
  $('#mode-fast').classList.toggle('on', !shade); $('#mode-shade').classList.toggle('on', shade);
  $('#pv-name').textContent = shade ? 'เส้นทางหลบแดดหลบฝน' : 'เส้นทางที่ไวที่สุด';
  $('#pv-mock').hidden = !shade;
  $('#pv-min').textContent = fmtMin(r.secs);
  $('#pv-dist').textContent = `ระยะทาง: ${fmtDist(r.total)}`;
  stepList($('#pv-steplist'), r.steps, -1);
  C.route.clearLayers(); C.pins.clearLayers(); C.hl.clearLayers();
  const b = buildingOf(S.place);
  highlightBuilding(b);
  const other = planRoute(S.place, shade ? 'fast' : 'shade');
  if (other) L.polyline(other.out.pts, { color: '#f5b26f', weight: 6, opacity: 0.55, interactive: false }).addTo(C.route);
  L.polyline(r.out.pts, { color: '#ffffff', weight: 10, opacity: 0.9, interactive: false }).addTo(C.route);
  L.polyline(r.out.pts, { color: '#fb8c3a', weight: 6, interactive: false }).addTo(C.route);
  L.marker(r.out.pts[r.out.pts.length - 1], { icon: pinIcon(), interactive: false }).addTo(C.pins);
  C.me.setLatLng(r.out.pts[0]).addTo(cmap);
  cmap.fitBounds(L.latLngBounds(r.out.pts).pad(0.25), { paddingTopLeft: [20, 170], paddingBottomRight: [20, 300], animate: false });
}
function stepList(ul, steps, cur) {
  ul.innerHTML = '';
  steps.forEach((st, i) => {
    const li = document.createElement('li');
    if (i === cur) li.className = 'cur'; else if (cur >= 0 && i < cur) li.className = 'done';
    const sub = st.sub || (st.len > 0 ? fmtDist(st.len) : '');
    li.innerHTML = `<span class="si">${stepIcon(st.icon)}</span><span><div class="t">${esc(st.title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</span>`;
    ul.appendChild(li);
  });
}
function stepIcon(icon) {
  const f = { straight: 'step-straight', left: 'turn-left', right: 'turn-right', uturn: 'step-uturn', lift: 'step-lift', stairs: 'step-stairs', enter: 'pin', arrive: 'pin' }[icon] || 'step-straight';
  return `<img src="icons/${f}.svg" alt="" class="${icon === 'straight' ? 'rot' : ''}">`;
}

// ---------- navigation
const NAV = { r: null, phase: 'out', s: 0, playing: true, speed: 8, timer: 0, watch: null, lost: false, lostDone: false, offSince: 0 };
function startLoading(then) {
  show('loading');
  setTimeout(then, 1100);
}
function startNav(route) {
  stopNav();
  Object.assign(NAV, { r: route, s: 0, lost: false, lostDone: false, offSince: 0, playing: true });
  NAV.phase = route.out.len > 3 ? 'out' : route.inn ? 'lift' : 'done';
  show('nav');
  $('#simbadge').hidden = $('#simctl').hidden = S.mode !== 'sim';
  $('#sim-play').textContent = '❚❚'; $('#sim-speed').textContent = `×${NAV.speed}`;
  $('#nav-steps').hidden = true; $('#navbar').hidden = false;
  C.route.clearLayers(); C.pins.clearLayers(); C.hl.clearLayers();
  L.polyline(route.out.pts, { color: '#ffffff', weight: 11, opacity: 0.9, interactive: false }).addTo(C.route);
  L.polyline(route.out.pts, { color: '#fb8c3a', weight: 7, interactive: false }).addTo(C.route);
  L.marker(route.out.pts[route.out.pts.length - 1], { icon: pinIcon(), interactive: false }).addTo(C.pins);
  if (route.inn) drawIndoorRoute();
  if (NAV.phase === 'lift') enterLift();
  else if (NAV.phase === 'out') { showMap('campus'); cmap.setView(route.out.pts[0], 18.5, { animate: false }); }
  if (S.mode === 'sim') {
    let last = performance.now();
    NAV.timer = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
      if (NAV.playing && !NAV.lost && (NAV.phase === 'out' || NAV.phase === 'in')) advance(WALK * NAV.speed * dt);
    }, 100);
  } else startGPS();
  render();
}
function drawIndoorRoute() {
  const r = NAV.r;
  drawFloor(r.inn.floor, r.dest.id);
  C.froute.clearLayers();
  L.polyline(r.inn.pts.map(fll), { color: '#ffffff', weight: 10, interactive: false }).addTo(C.froute);
  L.polyline(r.inn.pts.map(fll), { color: '#fb8c3a', weight: 6, interactive: false }).addTo(C.froute);
}
function stopNav() {
  clearInterval(NAV.timer); NAV.timer = 0;
  if (NAV.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(NAV.watch);
  NAV.watch = null;
}
function advance(ds) {
  NAV.s += ds;
  const leg = NAV.phase === 'out' ? NAV.r.out : NAV.r.inn;
  if (NAV.s >= leg.len) {
    NAV.s = leg.len;
    if (NAV.phase === 'out') { if (NAV.r.inn) enterLift(); else arrive(); return; }
    arrive(); return;
  }
  if (NAV.phase === 'in' && S.mode === 'sim' && S.scenario && S.scenario.loseAt && !NAV.lostDone && NAV.s > S.scenario.loseAt * leg.len) lose();
  render();
}
function enterLift() {
  NAV.phase = 'lift'; NAV.s = 0;
  drawIndoorRoute(); showMap('floor');
  const start = NAV.r.inn.pts[0];
  fmap.setView(fll(start), 3, { animate: false });
  const fl = NAV.r.inn.floor;
  $('#lift-text').textContent = `ออกจากลิฟต์ที่ชั้น ${fl} แล้วหรือยัง?`;
  $('#lift-ok').textContent = `ถึงชั้น ${fl} แล้ว`;
  $('#liftcard').hidden = false;
  render();
}
function liftDone() {
  $('#liftcard').hidden = true;
  NAV.phase = 'in'; NAV.s = 0; render();
}
function arrive() {
  stopNav();
  NAV.phase = 'done';
  const p = NAV.r.dest;
  show('place');
  $('#arrived').hidden = false;
  $('#place-q').textContent = titleOf(p);
  $('#place-title').textContent = titleOf(p);
  $('#place-sub').textContent = subOf(p, true);
  $('#place-thumb').innerHTML = thumbSVG(p);
  $('#place-note').hidden = true;
  $('#place-btns').hidden = true; $('#btn-finish').hidden = false; $('#place-close').hidden = true; $('#btn-layers').hidden = true;
  if (NAV.r.inn) { drawFloor(NAV.r.inn.floor, p.id); C.froute.clearLayers(); showMap('floor'); const e = NAV.r.inn.pts[NAV.r.inn.pts.length - 1]; fmap.setView([e[1] - 8, e[0]], 3, { animate: false }); }
  else showMap('campus');
}
function curStepIndex() {
  const st = NAV.r.steps;
  if (NAV.phase === 'lift') return st.findIndex((x) => x.phase === 'lift');
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    if (x.phase === NAV.phase && NAV.s >= x.s0 && NAV.s < x.s1) return i;
  }
  for (let i = st.length - 1; i >= 0; i--) if (st[i].phase === NAV.phase) return i;
  return 0;
}
function render() {
  const r = NAV.r; if (!r) return;
  const st = r.steps, i = curStepIndex(), step = st[i];
  let pos;
  if (NAV.phase === 'out') {
    pos = S.mode === 'real' && S.me ? S.me : along(r.out, NAV.s);
    if ($('#cmap').hidden) showMap('campus');
    C.me.setIcon(meIcon(false)); C.me.setLatLng(pos).addTo(cmap);
    cmap.panTo(pos, { animate: false });
    $('#floorpill').hidden = true;
  } else if (r.inn) {
    pos = along(r.inn, NAV.phase === 'lift' ? 0 : NAV.s);
    C.fme.setIcon(meIcon(NAV.lost)); C.fme.setLatLng(fll(pos)).addTo(fmap);
    if (!NAV.lost) fmap.panTo(fll(pos), { animate: false });
    $('#floorpill').hidden = false;
  }
  $('#lostbtn').hidden = !(NAV.phase === 'in' && !NAV.lost);
  $('#instr-next').hidden = !(S.mode === 'real' && NAV.phase === 'in');
  // instruction card
  let icon = step.icon, title = step.title, sub = '';
  if (NAV.phase === 'lift') { sub = 'เมื่อถึงชั้นแล้วกดปุ่ม "ถึงชั้นแล้ว"'; }
  else {
    const rem = Math.max(0, step.s1 - NAV.s), next = st[i + 1];
    if (step.len > 0 && NAV.s - step.s0 < 6 && step.icon !== 'straight') { sub = fmtDist(rem); }
    else if (next && rem < 25 && next.icon !== 'straight') { icon = next.icon; title = next.title; sub = rem > 3 ? `อีก ${fmtDist(rem)}` : (next.sub || ''); }
    else if (step.len > 0) { icon = 'straight'; title = 'เดินตรง'; sub = fmtDist(rem); }
    else sub = step.sub || '';
  }
  const ic = $('#instr-ico');
  ic.src = `icons/${{ straight: 'step-straight', left: 'turn-left', right: 'turn-right', uturn: 'step-uturn', lift: 'step-lift', enter: 'pin', arrive: 'pin' }[icon] || 'step-straight'}.svg`;
  ic.classList.toggle('rot', icon === 'straight');
  $('#instr-t').textContent = title; $('#instr-s').textContent = sub;
  // remaining time and distance
  let rem = 0, secs = 0;
  if (NAV.phase === 'out') { rem = r.out.len - NAV.s + (r.inn ? r.inn.len : 0); secs = rem / WALK + (r.inn ? LIFT_S : 0); }
  else if (r.inn) { rem = r.inn.len - NAV.s; secs = rem / WALK + (NAV.phase === 'lift' ? LIFT_S : 0); }
  $('#nav-min').textContent = $('#nav-min2').textContent = fmtMin(secs);
  $('#nav-dist').textContent = $('#nav-dist2').textContent = fmtDist(rem);
  if (!$('#nav-steps').hidden) stepList($('#nav-steplist'), st, i);
}
function nextStepReal() {           // real walk indoors: the user taps "next" as they pass each step
  const st = NAV.r.steps, i = curStepIndex();
  const nxt = st.slice(i + 1).find((x) => x.phase === 'in');
  if (!nxt || nxt.icon === 'arrive') { NAV.s = NAV.r.inn.len; arrive(); return; }
  NAV.s = nxt.s0 + 0.01; render();
}

// GPS (real walk mode)
function startGPS() {
  if (!('geolocation' in navigator)) { toast('อุปกรณ์นี้ใช้ GPS ไม่ได้ ลองโหมดจำลองแทน'); return; }
  NAV.watch = navigator.geolocation.watchPosition(onFix, (e) => toast(e.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง' : 'ยังหาสัญญาณ GPS ไม่ได้'),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function onFix(pos) {
  S.me = [pos.coords.latitude, pos.coords.longitude]; S.acc = pos.coords.accuracy;
  if (NAV.phase !== 'out') return;                     // indoors GPS is not used
  const pr = project(NAV.r.out, S.me);
  if (pr.d > OFFROUTE_M && S.acc < 40) {
    if (!NAV.offSince) NAV.offSince = Date.now();
    else if (Date.now() - NAV.offSince > OFFROUTE_S * 1000) { reroute(); return; }
  } else NAV.offSince = 0;
  NAV.s = Math.max(NAV.s, Math.min(pr.s, NAV.s + 60));
  if (NAV.r.out.len - NAV.s < ENTRANCE_R) { NAV.s = NAV.r.out.len; if (NAV.r.inn) enterLift(); else arrive(); return; }
  render();
}
function reroute() {
  const r = planRoute(NAV.r.dest, NAV.r.kind);
  if (!r) return;
  toast('ออกนอกเส้นทาง กำลังหาเส้นทางใหม่');
  S.origin = { type: 'me' }; startNav(r);
}

// ---------- lost position → photo of the nearest room sign → OCR
function lose() {
  NAV.lost = true; NAV.lostDone = true;
  render(); $('#dim').hidden = false;
  dlgLost(false);
}
function dialog({ ico = '', title, text = '', img = null, extra = [], buttons = [] }) {
  $('#dlg-ico').innerHTML = ico; $('#dlg-t').textContent = title; $('#dlg-p').textContent = text;
  const im = $('#dlg-img'); im.hidden = !img; if (img) im.src = img;
  const ex = $('#dlg-extra'); ex.innerHTML = ''; extra.filter(Boolean).forEach((e) => ex.appendChild(e));
  const bb = $('#dlg-btns'); bb.innerHTML = ''; bb.className = `dlg-btns${buttons.length === 1 ? ' one' : ''}`;
  for (const b of buttons) {
    const el = document.createElement('button'); el.className = `btn ${b.ghost ? 'ghost' : 'primary'}`; el.textContent = b.t;
    el.addEventListener('click', b.on); bb.appendChild(el);
  }
  $('#dlgwrap').hidden = false;
}
const closeDialog = () => { $('#dlgwrap').hidden = true; };
function linkBtn(t, on) { const b = document.createElement('button'); b.className = 'linkbtn'; b.textContent = t; b.addEventListener('click', on); return b; }
const LOST_ICO = '<img src="icons/pin.svg" alt="" style="height:44px"><b style="font-size:40px;margin-left:2px">!</b>';
function dlgLost(failed, why) {
  dialog({ ico: LOST_ICO, title: failed ? 'ไม่สามารถจับรูปถ่ายได้' : 'สัญญาณ GPS ขัดข้อง',
    text: why || 'กรุณาถ่ายรูปป้ายหน้าห้องที่ใกล้ที่สุดเพื่อทำการแทรกสัญญาณอีกครั้ง',
    extra: [S.mode === 'sim' ? linkBtn('ไม่ได้อยู่ที่ N7? ใช้รูปป้ายตัวอย่าง', sampleSign) : null, linkBtn('พิมพ์เลขห้องแทน', typeRoom)],
    buttons: [{ t: 'ยกเลิก', ghost: true, on: cancelLost }, { t: failed ? 'ลองอีกครั้ง' : 'เปิดกล้อง', on: () => { $('#cam').value = ''; $('#cam').click(); } }] });
}
function cancelLost() {
  closeDialog(); $('#dim').hidden = true;
  NAV.lost = false; render();
  toast('ใช้ตำแหน่งล่าสุดต่อ อาจคลาดเคลื่อนได้');
}
function typeRoom() {
  const inp = document.createElement('input'); inp.placeholder = 'เช่น SCL607 หรือ 607'; inp.id = 'typed-room'; inp.autocomplete = 'off';
  dialog({ ico: LOST_ICO, title: 'ห้องที่อยู่ใกล้ที่สุด', text: 'พิมพ์เลขห้องจากป้ายหน้าห้องที่คุณยืนอยู่', extra: [inp],
    buttons: [{ t: 'ยกเลิก', ghost: true, on: () => dlgLost(false) }, { t: 'ยืนยัน', on: () => {
      const room = matchSign(inp.value.toUpperCase(), NAV.r.inn.floor);
      if (room) recover(room, 'พิมพ์'); else dlgLost(true, 'ไม่พบห้องนี้บนชั้นนี้ ลองพิมพ์อีกครั้งหรือถ่ายรูปป้าย');
    } }] });
  setTimeout(() => inp.focus(), 50);
}
async function onPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    await readSign(img, img.naturalWidth, img.naturalHeight, url);
  } catch { dlgLost(true); }
}
function prep(img, w, h, invert) {
  const k = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < a.length; i += 4) { const v = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114; a[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < a.length; i += 4) { let v = ((a[i] - lo) * 255) / span; if (invert) v = 255 - v; a[i] = a[i + 1] = a[i + 2] = v; }
  g.putImageData(d, 0, 0);
  return c;
}
let ocrWorker = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
}
async function ocr(canvas) {
  if (!window.Tesseract) await loadScript(OCR_SRC);
  if (!ocrWorker) {
    ocrWorker = await window.Tesseract.createWorker('eng');
    await ocrWorker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' });
  }
  const { data } = await ocrWorker.recognize(canvas);
  return data.text || '';
}
async function readSign(img, w, h, previewUrl) {
  dialog({ ico: '<div class="ants"><img src="icons/ant4.svg" alt=""><img src="icons/ant3.svg" alt=""><img src="icons/ant2.svg" alt=""><img src="icons/ant1.svg" alt=""></div>',
    title: 'กำลังแทรกสัญญาณใหม่', text: 'กรุณารอสักครู่...', img: previewUrl });
  const fl = NAV.r.inn.floor;
  const log = { at: new Date().toISOString(), floor: fl, tesseract: '', openthai: '', engine: null, room: null };
  let room = null, loadFail = 0;
  // layer 1: Tesseract (Latin letters and digits), normal then inverted
  try {
    log.tesseract = await ocr(prep(img, w, h, false));
    room = matchSign(log.tesseract, fl);
    if (!room) { log.tesseract += '\n' + await ocr(prep(img, w, h, true)); room = matchSign(log.tesseract, fl); }
    if (room) log.engine = 'Tesseract';
  } catch { loadFail++; }
  // layer 2: OpenThai2.0-OCR-Text (Thai + English line OCR) when Tesseract found no room code
  if (!room) {
    try {
      $('#dlg-p').textContent = 'ลองอ่านป้ายอีกวิธี...';
      log.openthai = (await OpenThaiOCR.read(img, w, h)).text;
      room = matchSign(log.openthai, fl);
      if (room) log.engine = 'OpenThai';
    } catch { loadFail++; }
  }
  log.room = room ? room.code : null;
  const hist = store.get('mm_ocr_log', []); hist.unshift(log); store.set('mm_ocr_log', hist.slice(0, 30));
  console.info('[sign OCR]', log);
  if (!room && loadFail === 2) { dlgLost(true, 'โหลดตัวอ่านป้ายไม่สำเร็จ (ต้องต่ออินเทอร์เน็ตครั้งแรก) ลองพิมพ์เลขห้องแทน'); return; }
  if (room && room.floor !== fl) { dlgLost(true, `ป้ายนี้คือห้อง ${room.code} ซึ่งอยู่ชั้น ${room.floor} ไม่ใช่ชั้นที่คุณกำลังเดิน`); return; }
  if (room && N7.floors[fl].doors[room.id]) recover(room, `ป้าย · ${log.engine}`); else dlgLost(true);
}
function matchSign(text, floor) {         // room numbers on N7 signs: "SCL607", "N7-607", or just "607"
  const T = String(text).toUpperCase();
  const fix = (s) => s.replace(/O/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  const re = /(SCL|N7)?[\s\-–]*([0-9OILSBZ|]{3})(?![0-9])/g; const score = new Map(); let m;
  while ((m = re.exec(T))) {
    const num = fix(m[2]); if (!/^\d{3}$/.test(num)) continue;
    const id = `N7-${num}`; if (!BYID[id]) continue;
    const w = (m[1] ? 2 : 1) + (num[0] === String(floor) ? 2 : 0);
    score.set(id, Math.max(score.get(id) || 0, w));
  }
  let best = null, bw = 0; for (const [id, w] of score) if (w > bw) { bw = w; best = id; }
  return best ? BYID[best] : null;
}
function recover(room, how) {
  closeDialog(); $('#dim').hidden = true;
  const r = NAV.r, F = N7.floors[r.inn.floor], door = F.doors[room.id];
  const inn = indoorPlan(r.inn.floor, r.dest.id, door.x);
  r.inn = inn;
  r.steps = r.steps.filter((x) => x.phase !== 'in').concat(inn.steps);
  NAV.lost = false; NAV.s = 0;
  drawIndoorRoute();
  render();
  toast(`พบตำแหน่งแล้ว: หน้าห้อง ${room.code} (จาก${how})`);
}
async function sampleSign() {
  // a printed-style sign for the room nearest to where the position was lost, for testers who are not at N7
  const r = NAV.r, F = N7.floors[r.inn.floor], pos = along(r.inn, NAV.s);
  let best = null, bd = Infinity;
  for (const [code, d] of Object.entries(F.doors)) {
    if (!BYID[code] || d.approx || code === r.dest.id) continue;
    const dd = Math.abs(d.x - pos[0]); if (dd < bd) { bd = dd; best = code; }
  }
  const room = BYID[best];
  try { await document.fonts.load('600 150px Kanit'); } catch { /* fallback font */ }
  const c = document.createElement('canvas'); c.width = 1000; c.height = 640;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, 1000, 640);
  g.save(); g.translate(500, 320); g.rotate(-0.045);
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18; g.fillStyle = '#f4f2ec'; g.fillRect(-390, -210, 780, 420); g.shadowBlur = 0;
  g.fillStyle = '#1f3b63'; g.fillRect(-390, -210, 780, 70);
  g.fillStyle = '#ffffff'; g.font = '500 38px Kanit'; g.textAlign = 'center'; g.fillText('อาคารปฏิบัติการพื้นฐานทางวิทยาศาสตร์', 0, -162);
  g.fillStyle = '#1b1b1b'; g.font = '600 150px Kanit'; g.fillText(room.code, 0, 60);
  g.font = '400 42px Kanit'; g.fillText(short(room.th, 26), 0, 150);
  g.restore();
  const d = g.getImageData(0, 0, 1000, 640), a = d.data;         // a little sensor noise
  for (let i = 0; i < a.length; i += 4) { const n = (Math.random() - 0.5) * 22; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
  g.putImageData(d, 0, 0);
  await readSign(c, c.width, c.height, c.toDataURL('image/jpeg', 0.8));
}

// ---------- welcome, scenarios, modes
function openWelcome() {
  show('welcome');
  const ol = $('#scenarios'); ol.innerHTML = '';
  SCENARIOS.forEach((sc) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.innerHTML = `<div class="t">${esc(sc.title)}</div><div class="s">${esc(sc.task)}</div>`;
    b.addEventListener('click', () => runScenario(sc));
    li.appendChild(b); ol.appendChild(li);
  });
  for (const b of document.querySelectorAll('.modeswitch button')) b.classList.toggle('on', b.dataset.mode === S.mode);
  const fb = $('#feedback'); fb.hidden = !FEEDBACK_URL; if (FEEDBACK_URL) fb.href = FEEDBACK_URL;
}
function startPointOf(code) {
  const b = BYID[code]; return b && b.entrance ? [...b.entrance] : null;
}
function runScenario(sc) {
  S.scenario = sc; S.origin = { type: 'me' }; S.place = null;
  if (S.mode === 'sim') S.me = startPointOf(sc.start);
  goHome();
  if (S.me) cmap.setView(S.me, 17.5, { animate: false });
  if (S.mode === 'real') locateOnce();
}
function freeUse() {
  S.scenario = null; S.origin = { type: 'me' };
  if (S.mode === 'sim' && !S.me) S.me = startPointOf('N16');
  goHome();
  if (S.mode === 'real') locateOnce();
}
function locateOnce() {
  if (!('geolocation' in navigator)) { toast('อุปกรณ์นี้ใช้ GPS ไม่ได้'); return; }
  toast('กำลังหาตำแหน่งของคุณ...');
  navigator.geolocation.getCurrentPosition((p) => {
    S.me = [p.coords.latitude, p.coords.longitude]; S.acc = p.coords.accuracy;
    placeMe(); cmap.setView(S.me, 18, { animate: false });
    if (dLL(S.me, [13.6513, 100.4945]) > 900) toast('คุณอยู่นอกมหาวิทยาลัย ใช้ปุ่ม "เส้นทาง" เพื่อเปิด Google Maps มาที่ มจธ.', 4500);
    else toast(`พบตำแหน่งแล้ว (คลาดเคลื่อน ±${Math.round(S.acc)} ม.)`);
  }, () => { toast('หาตำแหน่งไม่ได้ ใช้ตำแหน่งจำลองแทน'); S.me = startPointOf('N16'); placeMe(); },
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
}
function offCampus() {
  return S.mode === 'real' && S.me && dLL(S.me, [13.6513, 100.4945]) > 900;
}
function googleMapsLink(b) {
  return `https://www.google.com/maps/dir/?api=1&destination=${b.entrance[0]},${b.entrance[1]}&travelmode=walking`;
}

// ---------- wiring
function wire() {
  $('#searchbar').addEventListener('click', () => openList('search'));
  for (const b of document.querySelectorAll('#chips button')) b.addEventListener('click', () => openList('category', { cat: b.dataset.cat, label: b.textContent.trim() }));
  $('#btn-locate').addEventListener('click', () => { if (S.mode === 'real') locateOnce(); else if (S.me) cmap.setView(S.me, 18); });
  $('#btn-go').addEventListener('click', () => { S.origin = { type: 'me' }; S.place = null; openList('pick'); });
  $('#btn-help').addEventListener('click', openWelcome);
  $('#list-back').addEventListener('click', goHome);
  $('#pick-back').addEventListener('click', goHome);
  $('#q').addEventListener('input', () => { if (S.listMode === 'category') S.listMode = 'search'; renderSearch(); });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = search($('#q').value); if (r[0]) choose(r[0].p); } });
  $('#q-clear').addEventListener('click', () => { $('#q').value = ''; S.listMode = 'search'; renderSearch(); $('#q').focus(); });
  $('#pick-from').addEventListener('focus', () => { S.pickField = 'from'; renderPick(); });
  $('#pick-to').addEventListener('focus', () => { S.pickField = 'to'; renderPick(); });
  $('#pick-from').addEventListener('input', renderPick);
  $('#pick-to').addEventListener('input', renderPick);
  $('#pick-swap').addEventListener('click', () => {
    const from = S.origin.type === 'place' ? S.origin.p : null, to = S.place;
    if (!to) return;
    S.origin = { type: 'place', p: to }; S.place = from;
    $('#pick-from').value = titleOf(to); $('#pick-to').value = from ? titleOf(from) : '';
    if (S.place) openPreview(); else { S.pickField = 'to'; $('#pick-to').focus(); renderPick(); }
  });
  $('#place-bar').addEventListener('click', (e) => { if (e.target.id === 'place-x') goHome(); else openList('search', { q: $('#place-q').textContent }); });
  $('#place-close').addEventListener('click', goHome);
  $('#btn-layers').addEventListener('click', toggleLayers);
  $('#btn-route').addEventListener('click', () => {
    if (offCampus()) { window.open(googleMapsLink(buildingOf(S.place)), '_blank', 'noopener'); return; }
    S.origin = { type: 'me' }; openPreview();
  });
  $('#btn-start').addEventListener('click', () => {
    if (offCampus()) { window.open(googleMapsLink(buildingOf(S.place)), '_blank', 'noopener'); return; }
    S.origin = { type: 'me' }; S.routeKind = 'fast';
    const r = planRoute(S.place, 'fast');
    if (!r) { toast('หาเส้นทางไปที่นี่ไม่ได้'); return; }
    S.route = r; startLoading(() => startNav(r));
  });
  $('#btn-finish').addEventListener('click', () => {
    goHome();
    if (FEEDBACK_URL) toast('ขอบคุณที่ทดสอบ! กด ? เพื่อเปิดแบบสอบถาม', 4000);
  });
  $('#pv-back').addEventListener('click', () => (S.place ? openPlace(S.place) : goHome()));
  $('#pv-close').addEventListener('click', () => (S.place ? openPlace(S.place) : goHome()));
  $('#pv-grab').addEventListener('click', () => { $('#pv-steps').hidden = !$('#pv-steps').hidden; });
  $('#pv-name').addEventListener('click', () => { $('#pv-steps').hidden = !$('#pv-steps').hidden; });
  $('#mode-fast').addEventListener('click', () => { S.routeKind = 'fast'; S.route = planRoute(S.place, 'fast'); renderPreview(); });
  $('#mode-shade').addEventListener('click', () => { S.routeKind = 'shade'; S.route = planRoute(S.place, 'shade'); renderPreview(); });
  $('#pv-start').addEventListener('click', () => { const r = S.route; startLoading(() => startNav(r)); });
  $('#nav-x').addEventListener('click', () => { stopNav(); NAV.r = null; S.place ? openPlace(S.place) : goHome(); });
  $('#nav-x2').addEventListener('click', () => $('#nav-x').click());
  $('#nav-expand').addEventListener('click', () => { $('#nav-steps').hidden = false; $('#navbar').hidden = true; render(); });
  $('#nav-steps').addEventListener('click', (e) => { if (e.target.classList.contains('grab')) { $('#nav-steps').hidden = true; $('#navbar').hidden = false; } });
  $('#sim-play').addEventListener('click', () => { NAV.playing = !NAV.playing; $('#sim-play').textContent = NAV.playing ? '❚❚' : '▶'; });
  $('#sim-speed').addEventListener('click', () => { const v = [1, 4, 8, 16]; NAV.speed = v[(v.indexOf(NAV.speed) + 1) % v.length]; $('#sim-speed').textContent = `×${NAV.speed}`; });
  $('#lift-ok').addEventListener('click', liftDone);
  $('#instr-next').addEventListener('click', nextStepReal);
  $('#lostbtn').addEventListener('click', lose);
  $('#cam').addEventListener('change', (e) => onPhoto(e.target.files[0]));
  $('#floorpill').addEventListener('click', () => {
    const m = $('#floormenu');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = '';
    for (const f of N7_FLOORS) {
      const b = document.createElement('button'); b.textContent = `ชั้น ${f}`;
      b.disabled = !N7.floors[f]; b.classList.toggle('on', f === S.viewFloor);
      b.addEventListener('click', () => { m.hidden = true; drawFloor(f, NAV.r && NAV.r.dest.id); if (NAV.r && NAV.r.inn && NAV.r.inn.floor === f) drawIndoorRoute(); else C.froute.clearLayers(); fitFloor(f); });
      m.appendChild(b);
    }
    const sm = document.createElement('small'); sm.textContent = 'ชั้นอื่นยังไม่มีแผนผัง'; m.appendChild(sm);
    m.hidden = false;
  });
  for (const b of document.querySelectorAll('.modeswitch button')) {
    b.addEventListener('click', () => { S.mode = b.dataset.mode; for (const x of document.querySelectorAll('.modeswitch button')) x.classList.toggle('on', x === b); });
  }
  $('#free-use').addEventListener('click', freeUse);
  $('#ocr-log-btn').addEventListener('click', () => {
    const rows = store.get('mm_ocr_log', []);
    const ok = rows.filter((r) => r.room).length;
    const pre = document.createElement('pre');
    pre.style.cssText = 'text-align:left;font-size:11px;max-height:46vh;overflow:auto;white-space:pre-wrap;margin:0';
    pre.textContent = rows.map((r) => `${r.at.slice(5, 16).replace('T', ' ')}  ชั้น ${r.floor}  →  ${r.room || 'อ่านไม่ได้'}${r.engine ? ` (${r.engine})` : ''}`).join('\n') || 'ยังไม่มีการอ่านป้ายบนเครื่องนี้';
    dialog({ title: 'บันทึกการอ่านป้าย', text: `อ่านสำเร็จ ${ok} จาก ${rows.length} ครั้ง (เก็บไว้ในเครื่องนี้เท่านั้น)`, extra: [pre],
      buttons: [{ t: 'ปิด', on: closeDialog }] });
  });
}

(async function boot() {
  try { await loadData(); } catch (e) {
    document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;top:40%;left:0;right:0;text-align:center;font-family:Kanit">โหลดข้อมูลแผนที่ไม่สำเร็จ ลองรีเฟรชหน้า</p>');
    return;
  }
  initMaps(); wire();
  openWelcome();
})();
