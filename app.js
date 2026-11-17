'use strict';
/* MOD MAP prototype (KMUTT SE Team G9).
   Search (codes, nicknames, buildings) → campus map → one route: campus paths → N7 entrance → lift → corridor → room.
   Navigation is simulated (testers sit and click) or real (GPS outdoors, tap "next" indoors).
   When the position is lost indoors, a photo of the nearest room sign is read with OCR (Tesseract.js) to find it again.
   Data: data/*.json, built by tools/build_data.py. Campus map © OpenStreetMap contributors (ODbL). */

// ---------- settings
const FEEDBACK_URL = (window.MM_CONFIG && window.MM_CONFIG.FEEDBACK_URL) || '';   // set in config.js
const CAL_DIST = 53.2;                    // m: floor 6, corridor at the central lift lobby (x 63.0) to the west stair door (x 9.8)
const DEFAULT_STEP = 0.68;               // m: step length when nothing better is known (0.415 × 1.65 m)
// indoor tracker (T1-S8, T1-S9, T1-S10)
const STEP_HZ_REF = 1.8;                 // steps a second of normal walking: the pace that the height ratio and outdoor walks stand for
const RIDE_PAUSE_MS = 6000;              // no steps for this long while the lift card shows = waiting for or riding the lift
const WALKOUT_MAX_M = 12;                // at most this much walking out of the lift (before the floor button) is credited
const WALK = 1.25;                       // m/s, walking speed used for time estimates
const LIFT_S = 60;                       // s added for the lift ride
const ENTRANCE_R = 4;                    // m: the filtered progress this close to the entrance, with a fix near it, = arrived (was 15 m)
const OFFROUTE_M = 25, OFFROUTE_S = 10;  // off route: farther than this, for this long → re-plan
// outdoor position in real walk mode (T1-S1, T1-S2, T1-S3): GPS fixes filtered along the planned route
const GPS_MAX_ACC = 50;                  // m: a fix less accurate than this doesn't move the marker
const GPS_BACK = 40, GPS_AHEAD = 70;     // m: a fix is matched to the route only this far behind / ahead of the current progress
const GPS_Q = 0.5;                       // m² a second: how fast the progress gets uncertain between fixes
const GPS_COAST_S = 15;                  // s: with no steps, keep moving at the last speed for at most this long after a fix
const GPS_LOST_S = 20;                   // s: no usable fix for this long = GPS lost (e.g. under a roof); steps alone may then reach the door
let TEST_NOW = null;                     // desk checks only (feedback/checks): a simulated clock in ms; null = the real clock
const nowMs = () => (TEST_NOW == null ? Date.now() : TEST_NOW);
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
function projectNear(line, ll, s0, back, ahead) {   // the same, but searching the route only from s0 − back to s0 + ahead
  const p = xy(ll), lo = Math.max(0, s0 - back), hi = Math.min(line.len, s0 + ahead);
  let best = { s: lo, d: Infinity };
  for (let i = 1; i < line.pts.length; i++) {
    const c0 = line.cum[i - 1], c1 = line.cum[i];
    if (c1 < lo || c0 > hi) continue;
    const a = xy(line.pts[i - 1]), b = xy(line.pts[i]);
    const vx = b[0] - a[0], vy = b[1] - a[1], L = Math.hypot(vx, vy) || 1;
    const t0 = Math.max(0, (lo - c0) / L), t1 = Math.min(1, (hi - c0) / L);
    const t = Math.max(t0, Math.min(t1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (L * L)));
    const d = Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]);
    if (d < best.d) best = { s: c0 + t * L, d };
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
  if (p.kind === 'building' || p.kind === 'pin') return p.th;
  const b = BYID[p.building], bn = b ? b.th : p.building;
  return long ? `${bn} (${p.building}) ชั้น ${p.floor}` : `${bn} ชั้น ${p.floor}`;
}
function buildingOf(p) { return p.kind === 'building' || p.kind === 'pin' ? p : BYID[p.building]; }   // a dropped pin is its own "building"

const RECENT_KEY = 'mm_recent';
const RECENT_LABEL_KEY = 'mm_recent_label';   // id → the name the user picked it by ("LX" for N16), shown in the recents list (Figma F07)
function recents() {
  const ids = store.get(RECENT_KEY, null) || ['N7-607', 'N16', 'code:CB2405', 'S13'];
  return ids.map((id) => BYID[id] || (id.startsWith('code:') ? codePlace(parseCode(id.slice(5))) : null)).filter(Boolean);
}
const recentLabel = (id) => (store.get(RECENT_LABEL_KEY, null) || { N16: 'LX' })[id] || null;
function pushRecent(p, hit) {
  const ids = [p.id, ...recents().map((x) => x.id).filter((id) => id !== p.id)].slice(0, 8);
  store.set(RECENT_KEY, ids);
  const labels = store.get(RECENT_LABEL_KEY, null) || { N16: 'LX' }, keep = {};
  if (hit) labels[p.id] = hit; else delete labels[p.id];
  for (const id of ids) if (labels[id]) keep[id] = labels[id];
  store.set(RECENT_LABEL_KEY, keep);
}

// ---------- state
const S = {
  mode: 'sim', me: null, acc: null, meSrc: null, startIn: null, scenario: null,   // meSrc: 'gps' or 'set' (a scenario's start); startIn: {floor} inside N7
  place: null, origin: { type: 'me' }, routeKind: 'fast', route: null,
  pickField: 'to', listMode: 'search', viewFloor: null,
};

// ---------- maps
let cmap, fmap;
const C = {};
const meIcon = (lost) => L.divIcon({ className: '', html: `<div class="me-marker${lost ? ' lost' : ''}"><b class="beam"></b><i></i></div>`, iconSize: [64, 64], iconAnchor: [32, 32] });
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
  cmap.on('click', onMapTap);                // pick a place by tapping the map (T1-S12)
  cmap.fitBounds(campusBounds(), { padding: [10, 10] });
  syncLabels();

  fmap = L.map('fmap', { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, minZoom: 0.5, maxZoom: 6, zoomSnap: 0.25 });
  C.floor = L.layerGroup().addTo(fmap);
  C.fpins = L.layerGroup().addTo(fmap);
  C.froute = L.layerGroup().addTo(fmap);
  C.fme = L.marker([0, 0], { icon: meIcon(false), interactive: false, keyboard: false, zIndexOffset: 1000 });
  fmap.on('zoomend', () => { document.body.classList.toggle('fz-near', fmap.getZoom() >= 2.4); });
  fmap.on('click', onFloorTap);
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

function liftBox(F) { if (F.lift.box) return F.lift.box; const cy = F.corridor.y; return [59.6, cy - 7.2, 66.4, cy - 1.7]; }
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
const SCREENS = ['home', 'list', 'place', 'preview', 'loading', 'nav', 'welcome', 'calib'];
function show(name) {
  TestLog.event('screen', { name });
  S.screen = name;
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
    renderResults(recentFirst(list.map((p) => ({ p }))), 'pin');
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
  if (!v) { $('#listtitle').hidden = false; $('#listtitle').textContent = 'ล่าสุด'; renderResults(recentRows(), 'clock'); return; }
  $('#listtitle').hidden = true;
  renderResults(recentFirst(search(v)), 'pin');
}
function renderPick() {
  const field = S.pickField === 'from' ? $('#pick-from') : $('#pick-to');
  const v = field.value.trim();
  if (!v) {
    $('#listtitle').hidden = false; $('#listtitle').textContent = 'ล่าสุด';
    const rows = recentRows();
    if (S.pickField === 'from') rows.unshift({ me: true });
    renderResults(rows, 'clock');
  } else { $('#listtitle').hidden = true; renderResults(recentFirst(search(v)), 'pin'); }
}
// the recents list (Figma F07): each place under the name it was picked by; buildings by their name alone, without a second line
const recentRows = () => recents().map((p) => ({ p, hit: recentLabel(p.id), recent: true, bare: p.kind === 'building' }));
function recentFirst(rows) {               // places the user opened before come first in a result list, with the clock icon (Figma F04, F16)
  const ids = recents().map((p) => p.id), at = (r) => (r.p ? ids.indexOf(r.p.id) : -1);
  const rec = rows.filter((r) => at(r) >= 0).sort((a, b) => at(a) - at(b)).map((r) => ({ ...r, recent: true }));
  return [...rec, ...rows.filter((r) => at(r) < 0)];
}
const ICO = {                              // Material location_on and schedule outlines, #e65100, 25 px (Figma)
  pin: '<img src="icons/location-on.svg" alt="">',
  clock: '<img src="icons/schedule.svg" alt="">',
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
      const sub = r.bare ? '' : p.kind === 'building' ? (t !== p.code ? `${p.code} · ${p.th}` : p.th) : subOf(p);
      const tag = p.kind === 'coderoom' || (p.kind === 'room' && !p.mapped) ? '<span class="tag">ยังไม่มีแผนผังชั้น</span>' : '';
      b.innerHTML = `<span class="ic">${ICO[r.recent ? 'clock' : icon]}</span><span><div class="t">${esc(t)}${tag}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</span>`;
      b.addEventListener('click', () => choose(p, r.hit));
    }
    li.appendChild(b); ul.appendChild(li);
  }
}
function choose(p, hit) {
  const typed = S.listMode === 'pick' ? (S.pickField === 'from' ? $('#pick-from').value : $('#pick-to').value) : $('#q').value;
  TestLog.event('choose', { list: S.listMode, typed: String(typed || '').slice(0, 60), picked: p.id });
  pushRecent(p, hit);
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
  note.hidden = p.kind === 'building' || p.kind === 'pin' || p.mapped;
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
// ---------- pick a place by tapping the map (T1-S12)
// Testers wanted to tap the map, as in Google Maps, instead of only searching. web-0.3.1's map ignored taps. Now a tap on a
// building opens it; a tap anywhere else drops a pin that can be routed to (the campus path nearest the pin, then straight to it);
// on a floor plan, a tap on a room opens that room.
let POLY_PLACE = null;                     // campus footprint → its building in the directory
function placeOfPoly(f) {
  if (!POLY_PLACE) {
    POLY_PLACE = new Map();
    for (const p of PLACES) if (p.kind === 'building' && p.c) { const q = polyOf(p); if (q && !POLY_PLACE.has(q)) POLY_PLACE.set(q, p); }
  }
  return POLY_PLACE.get(f) || null;
}
const tapsOn = () => (S.screen === 'home' || S.screen === 'place') && $('#arrived').hidden;
function onMapTap(e) {
  if (!tapsOn()) return;
  const ll = [e.latlng.lat, e.latlng.lng];
  const f = CAMPUS.buildings.find((x) => inPoly(ll, x.poly)), p = f && placeOfPoly(f);
  if (p) { TestLog.event('map_tap', { what: 'building', id: p.id }); pushRecent(p); openPlace(p); return; }
  const near = PLACES.filter((x) => x.kind === 'building' && x.c).reduce((b, x) => (!b || dLL(x.c, ll) < dLL(b.c, ll) ? x : b), null);
  TestLog.event('map_tap', { what: 'pin', near: near ? near.code : null });
  openPlace({ id: 'pin', kind: 'pin', code: 'หมุดที่ปักไว้', th: near ? `ใกล้ ${near.code} ${short(near.th, 26)}` : 'ตำแหน่งบนแผนที่',
              c: ll, entrance: ll, entrance_node: nearestNode(ll), aliases: [] });
}
function onFloorTap(e) {                   // a room on the floor plan
  if (!tapsOn() || !S.viewFloor) return;
  const x = e.latlng.lng, y = e.latlng.lat, F = N7.floors[S.viewFloor];
  const b = F && F.boxes.find((q) => x >= q.box[0] && x <= q.box[2] && y >= q.box[1] && y <= q.box[3] && BYID[q.code]);
  if (!b) return;
  TestLog.event('map_tap', { what: 'room', id: b.code });
  pushRecent(BYID[b.code]); openPlace(BYID[b.code]); if (BYID[b.code].mapped) toggleLayers();
}
function highlightBuilding(b) {
  if (b.kind === 'pin') return;
  const poly = polyOf(b);
  if (poly) L.polygon(poly.poly,{ color: '#fb8c3a', weight: 1.5, fillColor: '#fde3cc', fillOpacity: 1, interactive: false }).addTo(C.hl);
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
  if (p.kind === 'pin') {                  // a dropped pin: the buildings around it, and the pin
    for (const x of near) s += `<polygon points="${x.poly.map(P).map((q) => q.join(',')).join(' ')}" fill="#e0ddd7" stroke="#cbc6be" stroke-width="0.6"/>`;
    return s + '<circle cx="0" cy="0" r="4" fill="#fb8c3a" stroke="#fff" stroke-width="1.5"/></svg>';
  }
  const hit = near.reduce((best, x) => (dLL(x.c, b.c) < best.d ? { d: dLL(x.c, b.c), x } : best), { d: Infinity, x: null }).x;
  for (const x of near) {
    const pts = x.poly.map(P).map((q) => q.join(',')).join(' ');
    s += `<polygon points="${pts}" fill="${x === hit ? '#fde3cc' : '#e0ddd7'}" stroke="${x === hit ? '#fb8c3a' : '#cbc6be'}" stroke-width="${x === hit ? 1.2 : 0.6}"/>`;
  }
  if (b.entrance) { const e = P(b.entrance); s += `<circle cx="${e[0]}" cy="${e[1]}" r="3" fill="#fb8c3a"/><text x="${e[0] + 5}" y="${e[1] + 1.5}" font-size="6" fill="#fb8c3a" font-family="Kanit">${b.entrance_checked ? 'ทางเข้า' : 'ทางเข้า (โดยประมาณ)'}</text>`; }
  return s + `<text x="-86" y="-46" font-size="7" fill="#555" font-family="Kanit">${esc(b.code)} · ${esc(short(b.th, 26))}</text></svg>`;
}

// ---------- route planning
// A route is a list of segments, walked in order (T1-S4 to T1-S7):
//   { type: 'out', pts, cum, len, steps }                 outdoors, along the campus paths
//   { type: 'in', floor, pts, cum, len, from, to, steps } indoors on one floor: the corridor, plus short spurs to a lift, a door or the entrance
//   { type: 'lift', from, to, len: 0, steps }             the lift between two floors
// web-0.3.1 had exactly one outdoor leg and one indoor leg on the destination floor. So every route started outdoors (from inside
// the building it went out and back in), and at the entrance the app jumped straight to the destination floor and its lift step.
const EF = () => N7.entrance_floor || '1';                       // the floor with the building's main entrance
const floorRank = (f) => (f === 'B' ? 0 : +f);
function originInfo() {
  if (S.origin.type === 'place') {
    const p = S.origin.p;
    if (p.kind === 'room' && p.mapped && p.building === N7.building && N7.floors[p.floor]) return { inN7: { floor: p.floor, code: p.id }, label: titleOf(p) };
    const b = buildingOf(p);
    return { ll: b.entrance, node: b.entrance_node, label: titleOf(p) };
  }
  if (S.startIn && N7.floors[S.startIn.floor]) {                  // the tester said they are inside N7, on this floor
    return { inN7: { floor: S.startIn.floor }, ll: S.me, label: `ตำแหน่งของคุณ (ชั้น ${S.startIn.floor})` };
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
function legSteps(legs, firstTitle) {
  let s0 = 0;
  return legs.map((g, i) => {
    const icon = turnIcon(g.turn, i === 0);
    const st = { icon, title: i === 0 && firstTitle ? firstTitle : TURN_T[icon], len: g.L, s0, s1: s0 + g.L };
    s0 += g.L; return st;
  });
}
// anchors: where a floor leg starts or ends. x = its point on the corridor; spur = the points from there out to the lift, door or entrance
function liftAnchor(fl) { const F = N7.floors[fl]; return { kind: 'lift', x: F.lift.door_x ?? F.lift.x, spur: [[F.lift.x, F.lift.y]] }; }
function entranceAnchor(fl) { const E = N7.floors[fl] && N7.floors[fl].entrance; return E ? { kind: 'entrance', x: E.x, spur: E.via || [] } : null; }
function doorAnchors(fl, code) {
  const d = N7.floors[fl] && N7.floors[fl].doors[code];
  if (!d) return [];
  return [d, ...(d.more || [])].map((x) => ({ kind: 'door', code, x: x.x, side: x.side, spur: x.via || [] }));
}
function nearestDoor(fl, code, x) {        // a room with several corridor doors: the one nearest the tester's way in (T1-D1)
  return doorAnchors(fl, code).reduce((b, d) => (!b || Math.abs(d.x - x) < Math.abs(b.x - x) ? d : b), null);
}
function floorLeg(fl, A, B) {
  const cy = N7.floors[fl].corridor.y, pts = [];
  for (const p of [...A.spur.slice().reverse(), [A.x, cy], [B.x, cy], ...B.spur]) if (!pts.length || dXY(pts[pts.length - 1], p) > 0.3) pts.push(p);
  const line = mkLine(pts, dXY);
  const first = A.kind === 'lift' ? (A.start ? 'จากหน้าลิฟต์ เดินตรง' : 'ออกจากลิฟต์แล้วเดินตรง') : A.kind === 'entrance' ? 'เข้าอาคารแล้วเดินตรง' : null;
  const steps = legSteps(legsOf(pts, 30, 1), first);
  if (B.kind === 'door') {
    const dir = Math.sign(B.x - A.x), room = BYID[B.code];
    const sub = B.spur.length ? '' : dir === 0 ? (B.side === 'N' ? 'อยู่ตรงหน้า' : 'อยู่ด้านหลัง') : (B.side === 'N') === (dir > 0) ? 'อยู่ทางซ้าย' : 'อยู่ทางขวา';
    steps.push({ icon: 'arrive', title: `ถึง ${room ? titleOf(room) : B.code}`, sub, len: 0, s0: line.len, s1: line.len });
  } else if (B.kind === 'entrance') steps.push({ icon: 'exit', title: `ออกจากอาคาร ${N7.building}`, len: 0, s0: line.len, s1: line.len });
  return { type: 'in', floor: fl, ...line, from: A, to: B, steps };
}
function liftSeg(from, to) {
  return { type: 'lift', from, to, len: 0, steps: [{ icon: 'lift', title: `${floorRank(to) > floorRank(from) ? 'ขึ้น' : 'ลง'}ลิฟต์ไปยังชั้น ${to}`, len: 0, s0: 0, s1: 0 }] };
}
function indoorChain(fl, A, target) {      // from anchor A on floor fl to a room ({floor, code}) or out of the main entrance ({exit: true})
  const fd = target.exit ? EF() : target.floor, segs = [];
  if (fl !== fd) {
    if (A.kind !== 'lift') segs.push(floorLeg(fl, A, liftAnchor(fl)));   // already at the lift: straight in
    segs.push(liftSeg(fl, fd)); fl = fd; A = liftAnchor(fd);
  }
  segs.push(floorLeg(fl, A, target.exit ? entranceAnchor(fd) : nearestDoor(fd, target.code, A.x)));
  return segs.filter((s, i, all) => s.type !== 'in' || s.len > 0.3 || i === all.length - 1);   // e.g. starting at the lift: no empty first leg
}
function outdoorSeg(fromLL, fromNode, toNode, kind, toLL) {   // campus paths from a point (or a graph node) to an entrance node (and on to toLL)
  const sn = fromNode != null ? fromNode : nearestNode(fromLL);
  let path = astar(sn, toNode);
  if (path && kind === 'shade' && path.length > 2) {
    // Concept mock: no covered-walkway data yet, so show a plausible different route (penalise the fastest one's edges).
    const key = (a, c) => (a < c ? `${a}_${c}` : `${c}_${a}`);
    const fastEdges = new Set(path.slice(1).map((c, i) => key(path[i], c)));
    const lenOf = (p) => p.slice(1).reduce((t, c, i) => t + dLL(G.nodes[p[i]], G.nodes[c]), 0);
    const fastLen = lenOf(path);
    for (const k of [1.6, 2.5, 4, 8]) {
      const pen = new Map([...fastEdges].map((e) => [e, k]));
      const alt = astar(sn, toNode, pen); if (!alt) continue;
      const shared = alt.slice(1).filter((c, i) => fastEdges.has(key(alt[i], c))).length / Math.max(1, alt.length - 1);
      if (shared < 0.7 && lenOf(alt) <= 2 * fastLen + 50) { path = alt; break; }
    }
  }
  if (!path) return null;
  let pts = path.map((i) => G.nodes[i]);
  if (fromLL && dLL(fromLL, pts[0]) > 2) pts = [fromLL, ...pts];
  if (toLL && dLL(toLL, pts[pts.length - 1]) > 2) pts = [...pts, toLL];   // a dropped pin: the last bit off the path, straight to it
  const line = mkLine(pts, dLL);
  return { type: 'out', ...line, steps: line.len > 3 ? legSteps(legsOf(pts.map(xy), 35, 8), null) : [] };
}
function flatSteps(r) {                    // the route's step list: every segment's steps, each tagged with its segment
  r.steps = [];
  r.segs.forEach((s, i) => s.steps.forEach((st) => r.steps.push({ ...st, seg: i })));
}
function planRoute(dest, kind) {
  const b = buildingOf(dest);
  if (!b || b.entrance_node == null) return null;
  const o = originInfo();
  if (!o.inN7 && !o.ll) return null;
  const n7 = BYID[N7.building], entry = entranceAnchor(EF());
  const destIn = dest.kind === 'room' && dest.mapped && dest.building === N7.building && !!N7.floors[dest.floor];
  const segs = [];
  if (o.inN7) {                            // starting inside N7 (T1-S4): no outdoor part before reaching the room
    const fl = o.inN7.floor;
    const A = o.inN7.code ? nearestDoor(fl, o.inN7.code, destIn && dest.floor === fl ? doorAnchors(fl, dest.id)[0].x : liftAnchor(fl).x)
      : { ...liftAnchor(fl), start: true };   // inside, floor known: start at that floor's lift lobby
    if (destIn) segs.push(...indoorChain(fl, A, { floor: dest.floor, code: dest.id }));
    else if (b !== n7) {                   // to another building: down to the entrance, then outdoors
      const out = outdoorSeg(n7.entrance, n7.entrance_node, b.entrance_node, kind, dest.kind === 'pin' ? dest.c : null); if (!out) return null;
      if (entry) segs.push(...indoorChain(fl, A, { exit: true }));   // without a plan of the entrance floor: from the entrance, as before
      segs.push(out);
    } else {                               // N7 itself, or a room in N7 without a plan: nothing to walk
      const st = dest.kind === 'room' ? { title: `ห้อง ${dest.code} อยู่ชั้น ${dest.floor}`, sub: 'ห้องนี้ยังไม่มีแผนผัง' } : { title: `คุณอยู่ในอาคาร ${b.code} แล้ว`, sub: '' };
      segs.push({ type: 'in', floor: fl, ...mkLine([[A.x, N7.floors[fl].corridor.y]], dXY), from: A, to: A, steps: [{ icon: 'arrive', ...st, len: 0, s0: 0, s1: 0 }] });
    }
  } else {
    const out = outdoorSeg(o.ll, o.node, b.entrance_node, kind, dest.kind === 'pin' ? dest.c : null); if (!out) return null;
    if (destIn) {
      if (out.len > 3) segs.push(out);
      if (entry) segs.push(...indoorChain(EF(), entry, { floor: dest.floor, code: dest.id }));   // in at the entrance floor, then the lift
      else { const A = liftAnchor(dest.floor); segs.push(liftSeg(EF(), dest.floor), floorLeg(dest.floor, A, nearestDoor(dest.floor, dest.id, A.x))); }
    } else segs.push(out);
  }
  // an outdoor part ends with "enter the building" when indoor segments follow, or with the arrival
  segs.forEach((s, i) => {
    if (s.type !== 'out') return;
    const end = { len: 0, s0: s.len, s1: s.len };
    if (segs[i + 1]) s.steps = [...s.steps, { icon: 'enter', title: `เข้าอาคาร ${n7.code}`, sub: n7.entrance_checked ? '' : 'ทางเข้าโดยประมาณ', ...end }];
    else s.steps = [...s.steps, { icon: 'arrive', ...end,
      title: dest.kind === 'building' ? `ถึง ${b.code}` : dest.kind === 'pin' ? 'ถึงหมุดที่ปักไว้' : `ถึงอาคาร ${b.code} แล้วขึ้นไปชั้น ${dest.floor}`,
      sub: dest.kind === 'building' || dest.kind === 'pin' ? b.th : `ห้องอยู่ชั้น ${dest.floor} · ยังไม่มีแผนผังภายในอาคารนี้` }];
  });
  const r = { dest, kind, originLabel: o.label, segs, out: segs.find((s) => s.type === 'out') || null, startFloor: o.inN7 ? o.inN7.floor : null };
  flatSteps(r);
  r.total = segs.reduce((t, s) => t + s.len, 0);
  r.secs = r.total / WALK + segs.filter((s) => s.type === 'lift').length * LIFT_S;
  return r;
}

// ---------- inside N7 already? (T1-S4: a route that starts inside the building must not go out and back in)
function polyOf(b) {                       // the campus footprint of a building
  return CAMPUS.buildings.reduce((best, x) => { const d = dLL(x.c, b.c); return d < best.d ? { d, x } : best; }, { d: Infinity, x: null }).x;
}
function inPoly(ll, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[0] > ll[0]) !== (b[0] > ll[0]) && ll[1] < ((b[1] - a[1]) * (ll[0] - a[0])) / (b[0] - a[0]) + a[1]) c = !c;
  }
  return c;
}
function distToPoly(ll, poly) {
  const p = xy(ll); let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = xy(poly[i - 1]), b = xy(poly[i]), vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2));
    best = Math.min(best, Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]));
  }
  return best;
}
function nearN7(ll, buf) {
  const b = BYID[N7.building], f = b && b.c && polyOf(b);
  return !!f && (inPoly(ll, f.poly) || distToPoly(ll, f.poly) < buf);
}
function askWhere(then) {                  // GPS puts the tester at N7: ask whether they are inside, and on which floor
  S.startIn = null;
  if (S.origin.type !== 'me' || S.meSrc !== 'gps' || !S.me || !nearN7(S.me, Math.min(30, Math.max(10, S.acc || 10)))) { then(); return; }
  const grid = document.createElement('div'); grid.className = 'floorgrid';
  for (const f of N7_FLOORS.filter((x) => N7.floors[x]).reverse()) {
    const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = f === 'B' ? 'ใต้ดิน' : `ชั้น ${f}`;
    b.addEventListener('click', () => { S.startIn = { floor: f }; TestLog.event('start_inside', { floor: f }); closeDialog(); then(); });
    grid.appendChild(b);
  }
  dialog({ title: `คุณอยู่ในอาคาร ${N7.building} แล้วหรือยัง?`, text: 'ถ้าอยู่ข้างในแล้ว เลือกชั้นที่คุณอยู่ เส้นทางจะเริ่มจากลิฟต์ของชั้นนั้น', extra: [grid],
    buttons: [{ t: 'ยังอยู่นอกอาคาร', ghost: true, on: () => { TestLog.event('start_inside', { floor: null }); closeDialog(); then(); } }] });
}

// ---------- route preview
function openPreview() {
  const p = S.place;
  if (S.origin.type === 'me' && !S.me) { toast('ยังไม่ทราบตำแหน่งของคุณ เลือกจุดเริ่มต้นจากรายการ'); openList('pick'); S.pickField = 'from'; return; }
  askWhere(() => {
    S.routeKind = 'fast';
    S.route = planRoute(p, 'fast');
    if (!S.route) { toast('หาเส้นทางไปที่นี่ไม่ได้'); return; }
    show('preview');
    $('#pv-from').textContent = S.route.originLabel;
    $('#pv-to').textContent = titleOf(p);
    $('#pv-steps').hidden = true;
    renderPreview();
  });
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
  if (!r.out) {                            // the whole route is inside N7: show the floor it starts on
    const first = r.segs.find((s) => s.type === 'in');
    showMap('floor');
    if (first) { drawLegOn(first, r.dest); fitFloor(first.floor); }
    return;
  }
  showMap('campus');
  highlightBuilding(buildingOf(S.place));
  const other = planRoute(S.place, shade ? 'fast' : 'shade');
  if (other && other.out) L.polyline(other.out.pts, { color: '#f5b26f', weight: 6, opacity: 0.55, interactive: false }).addTo(C.route);
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
const STEP_ICON = { straight: 'step-straight', left: 'turn-left', right: 'turn-right', uturn: 'step-uturn', lift: 'step-lift', stairs: 'step-stairs', enter: 'pin', exit: 'pin', arrive: 'pin' };
function stepIcon(icon) {
  return `<img src="icons/${STEP_ICON[icon] || 'step-straight'}.svg" alt="" class="${icon === 'straight' ? 'rot' : ''}">`;
}

// ---------- navigation
const NAV = { r: null, seg: 0, phase: 'out', s: 0, playing: true, speed: 8, timer: 0, watch: null, lost: false, lostDone: false, offSince: 0, trk: null,
              g: null, gtimer: 0, drawn: -1 };   // seg: the segment being walked; phase: its type, or 'done'; g: the outdoor GPS filter;
                                                  // gtimer: redraws the marker between fixes; drawn: the segment whose floor is on the floor map
const curSeg = () => (NAV.r ? NAV.r.segs[NAV.seg] : null);
const isLastSeg = () => !!NAV.r && NAV.seg === NAV.r.segs.length - 1;
function newTracker() {
  // the browser tracker (real walk mode): steps move the dot along the planned indoor route; turns snap it to the route's corners.
  // segFrom: where the current leg is counted from: 'start', 'entrance', 'lift', 'sign', or 'sign at door' (a sign photo put the tester at the destination)
  return { on: S.mode === 'real' && Motion.running(), L: DEFAULT_STEP, Lsrc: 'default', Lgps: null, gps0: null, Lset: false,
           outSteps: 0, inSteps: 0, segSteps: 0, sRaw: 0, lastReset: 0, arrPrompted: false, segFrom: null,
           hzRef: STEP_HZ_REF, hz: null, Lnow: null, recent: [], outTs: [],          // pace: the reference, now; recent step times
           liftTs: [], liftTurns: [], liftT0: null, pending: null,                // steps and turns while the lift card shows
           corners: [], ci: 0, hold: false };                                     // this leg's corners, the next one, waiting at it
}
function paceOf(ts) {                    // steps a second from step times (ms): the median gap between steps, pauses left out
  const iv = [];
  for (let i = 1; i < ts.length; i++) { const d = ts[i] - ts[i - 1]; if (d > 250 && d < 1200) iv.push(d); }
  if (iv.length < 4) return null;
  iv.sort((a, b) => a - b);
  return 1000 / iv[iv.length >> 1];
}
// The step length for one step indoors (T1-S9): the reference length, scaled by the current pace against the pace it was measured at.
// Testers walk slowly while reading the phone (one took 30 steps in 21.6 s), and slow steps are short; web-0.3.1 used the
// outdoor or height-based length for every step, so the dot ran ahead.
function stepLen(T, t) {
  T.recent.push(t); if (T.recent.length > 9) T.recent.shift();
  const hz = paceOf(T.recent);
  if (!hz) return T.L;                   // the first few steps: not enough to know the pace yet
  T.hz = hz; T.Lnow = T.L * Math.max(0.7, Math.min(1.1, hz / T.hzRef));
  return T.Lnow;
}
function trackerLeg(T, seg, segFrom) {   // a new floor leg: count from its start, and wait at each corner for the turn (T1-S10)
  Object.assign(T, { sRaw: 0, lastReset: 0, segSteps: 0, arrPrompted: false, segFrom, hold: false, ci: 0,
    corners: seg.steps.filter((x) => x.icon === 'left' || x.icon === 'right' || x.icon === 'uturn').map((x) => ({ s: x.s0, icon: x.icon })) });
}
// The dot (T1-S10): at the tracker's distance, but it doesn't go round the next corner until the phone has turned there.
// web-0.3.1 followed the route's line by distance alone, so the dot turned the corner as soon as the step count got there.
function placeDot(T, seg) {
  const c = T.corners[T.ci];
  if (c && T.sRaw > c.s + 0.5) {
    if (!T.hold) { T.hold = true; TestLog.event('corner_hold', { at: +c.s.toFixed(1) }); }
    NAV.s = c.s;
  } else { T.hold = false; NAV.s = Math.min(T.sRaw, seg.len); }
}
// Steps taken walking out of the lift before the floor button was pressed (T1-S8): the steps since the last pause of 6 s or more
// (waiting for or riding the lift), as long as the tester was still walking when they pressed. web-0.3.1 dropped these steps,
// so the dot started at the lift while the tester was already in the corridor.
function walkOut(T, tPress) {
  const ts = T.liftTs.filter((x) => x <= tPress), none = { n: 0, m: 0, turned: false };
  if (!ts.length || tPress - ts[ts.length - 1] >= RIDE_PAUSE_MS) return none;          // stood still before the tap: still in the lift
  let i = ts.length - 1;
  while (i > 0 && ts[i] - ts[i - 1] < RIDE_PAUSE_MS) i--;
  const pause = ts[i] - (i > 0 ? ts[i - 1] : T.liftT0);
  if (pause < RIDE_PAUSE_MS || tPress - ts[i] > 25000) return { ...none, pause: +(pause / 1000).toFixed(1) };   // no ride before these steps
  const run = ts.slice(i), hz = paceOf(run), k = hz ? Math.max(0.7, Math.min(1.1, hz / T.hzRef)) : 0.9;
  const turned = T.liftTurns.some((x) => x.t >= ts[i] - 500 && x.t <= tPress && Math.abs(x.deg) >= 50);
  return { n: run.length, m: run.length * T.L * k, turned, pause: +(pause / 1000).toFixed(1), ts: run };
}
function applyWalkOut(T, seg, w) {
  if (!w || !w.n) return;
  T.recent = [...T.recent, ...w.ts].slice(-9);   // their pace is known from the first step on this floor
  const c = T.corners[0];
  let s = Math.min(w.m, WALKOUT_MAX_M, Math.max(0, seg.len - 1));
  if (c && w.turned) { T.ci = 1; T.lastReset = c.s; s = Math.max(s, c.s + 0.5); }   // they had already turned into the corridor
  T.sRaw = s;
  placeDot(T, seg);
}
// plausible step lengths (m) for a height in cm: about 0.415 × height, give or take 20 %; without a height, a wide adult range
const stepRange = (h) => (h ? [0.0033 * h, 0.0048 * h] : [0.45, 0.85]);
function chooseStepLength(T) {
  const prof = TestLog.stepLength(), h = TestLog.height(), [lo, hi] = stepRange(h);
  if (prof && prof >= lo && prof <= hi) return [prof, 'calibration walk'];   // also drops partial walks that web-0.3.0's looser check accepted
  if (T.Lgps) return [T.Lgps, 'GPS walk'];
  if (h) return [Math.min(0.9, Math.max(0.5, (0.415 * h) / 100)), 'height'];
  return [DEFAULT_STEP, 'default'];
}
function startLoading(then) {
  show('loading');
  setTimeout(then, 1100);
}
function routeInfo(r) {
  const ins = r.segs.filter((x) => x.type === 'in');
  return { dest: r.dest.id, dest_code: r.dest.code, kind: r.kind, out_m: r.out ? Math.round(r.out.len) : 0,
           in_m: ins.length ? +ins.reduce((t, x) => t + x.len, 0).toFixed(1) : null, floor: r.dest.kind === 'room' ? r.dest.floor : null,
           start_floor: r.startFloor, origin: r.originLabel, segs: r.segs.map((x) => (x.type === 'lift' ? `lift:${x.from}>${x.to}` : x.type === 'in' ? `in:${x.floor}:${x.len.toFixed(1)}` : `out:${Math.round(x.len)}`)).join(' '),
           steps: r.steps.map((x) => `${r.segs[x.seg].type}:${x.icon}:${Math.round(x.len)}`).join(' ') };
}
function startNav(route) {
  stopNav();
  if (!TestLog.active()) TestLog.startRun({ kind: 'free', mode: S.mode });
  Object.assign(NAV, { r: route, seg: 0, s: 0, lost: false, lostDone: false, offSince: 0, playing: true, drawn: -1 });
  if (S.mode === 'real') { Motion.start(); TestLog.recStart(); }
  NAV.trk = newTracker();
  NAV.trk.Lout = chooseStepLength(NAV.trk)[0];       // outdoors, steps carry the marker between GPS fixes
  TestLog.event('nav_start', { mode: S.mode, tracker: NAV.trk.on, motion: Motion.permission(), ...routeInfo(route) });
  show('nav');
  $('#simbadge').hidden = $('#simctl').hidden = S.mode !== 'sim';
  $('#sim-play').textContent = '❚❚'; $('#sim-speed').textContent = `×${NAV.speed}`;
  $('#nav-steps').hidden = true; $('#navbar').hidden = false;
  ROT.mode = 'route'; $('#btn-compass').hidden = false; $('#btn-compass').classList.remove('north');   // T1-S13
  if (S.mode === 'real') headingOn();
  C.route.clearLayers(); C.pins.clearLayers(); C.hl.clearLayers();
  const outs = route.segs.filter((s) => s.type === 'out');
  for (const s of outs) {
    L.polyline(s.pts, { color: '#ffffff', weight: 11, opacity: 0.9, interactive: false }).addTo(C.route);
    L.polyline(s.pts, { color: '#fb8c3a', weight: 7, interactive: false }).addTo(C.route);
  }
  if (outs.length) { const e = outs[outs.length - 1]; L.marker(e.pts[e.pts.length - 1], { icon: pinIcon(), interactive: false }).addTo(C.pins); }
  if (S.mode === 'sim') {
    let last = performance.now();
    NAV.timer = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
      if (NAV.playing && !NAV.lost && (NAV.phase === 'out' || NAV.phase === 'in')) advance(WALK * NAV.speed * dt);
    }, 100);
  } else {
    NAV.gtimer = setInterval(() => { if (NAV.phase === 'out') render(); }, 1000);   // keeps the marker moving between fixes
    startGPS();
  }
  enterSeg(0);
}
function enterSeg(i) {                       // start walking segment i: show the floor the tester is on (T1-S5, T1-S6)
  const r = NAV.r, seg = r.segs[i], prev = r.segs[i - 1], T = NAV.trk, sPrev = NAV.s;
  NAV.seg = i; NAV.phase = seg.type; NAV.s = 0;
  if (seg.type !== 'out' && T && !T.Lset) indoorsNow(prev && prev.type === 'out' ? sPrev : null);
  if (seg.type === 'out') {
    if (S.mode === 'real') gpsInit();        // indoors GPS is not used; a new outdoor part starts a fresh filter
    showMap('campus'); cmap.setView(seg.pts[0], 18.5, { animate: false });
  } else {
    drawSeg(seg); showMap('floor');
    fmap.setView(fll(seg.type === 'lift' ? liftPoint(segFloor(seg)) : seg.pts[0]), 3, { animate: false });
  }
  if (seg.type === 'lift') {
    $('#lift-text').textContent = `ออกจากลิฟต์ที่ชั้น ${seg.to} แล้วหรือยัง?`;
    $('#lift-ok').textContent = `ถึงชั้น ${seg.to} แล้ว`;
    $('#lift-in').hidden = S.mode !== 'real';
    $('#liftcard').hidden = false;
    if (T) Object.assign(T, { liftTs: [], liftTurns: [], liftT0: performance.now(), pending: null });
    TestLog.event('lift_card', { floor: seg.to, from: seg.from });
  } else $('#liftcard').hidden = true;
  if (seg.type === 'in' && T) {
    trackerLeg(T, seg, !prev ? 'start' : prev.type === 'lift' ? 'lift' : 'entrance');
    if (T.pending) { applyWalkOut(T, seg, T.pending); T.pending = null; }   // steps already taken out of the lift (T1-S8)
  }
  TestLog.event('segment', { i, type: seg.type, floor: seg.type === 'out' ? null : segFloor(seg), len: +seg.len.toFixed(1) });
  if (!r.segs.some((s) => s.len > 0) && seg.type === 'in') { arrive(); return; }   // nothing to walk at all
  render();
}
function nextSeg() { if (isLastSeg()) arrive(); else enterSeg(NAV.seg + 1); }
function indoorsNow(sOut) {                  // first time indoors: the step length, from the outdoor walk when it was long enough
  const T = NAV.trk;
  if (T.gps0 && sOut != null) {              // GPS distance along the path ÷ steps
    const dist = sOut - T.gps0.s, n = T.outSteps - T.gps0.steps, Lg = n ? dist / n : 0;
    TestLog.event('gps_calibration', { dist_m: +dist.toFixed(1), steps: n, L: +Lg.toFixed(3) });
    if (dist >= 60 && n >= 50 && Lg >= 0.45 && Lg <= 0.95) T.Lgps = Lg;
  }
  [T.L, T.Lsrc] = chooseStepLength(T); T.Lset = true;
  // the pace that length belongs to: the calibration walk's own, the outdoor walk's, or normal walking for the height estimate
  T.hzRef = T.Lsrc === 'calibration walk' ? TestLog.stepHz() || 1.75 : T.Lsrc === 'GPS walk' ? paceOf(T.outTs) || STEP_HZ_REF : STEP_HZ_REF;
  const cal = TestLog.stepLength();
  TestLog.event('step_length', { L: +T.L.toFixed(3), source: T.Lsrc, hz_ref: +T.hzRef.toFixed(2), ...(cal && T.Lsrc !== 'calibration walk' ? { cal_ignored: cal } : {}) });
}
const segFloor = (seg) => (seg.type === 'lift' ? (N7.floors[seg.from] ? seg.from : seg.to) : seg.floor);   // old data had no entrance floor
function liftPoint(fl) { const F = N7.floors[fl]; return [F.lift.x, F.lift.y]; }
function drawLegOn(seg, dest) {              // a floor with one leg of the route drawn on it
  const fl = segFloor(seg);
  const hit = dest && dest.kind === 'room' && dest.floor === fl ? dest.id : seg.type === 'lift' || (seg.to && seg.to.kind === 'lift') ? 'lift' : null;
  drawFloor(fl, hit);
  C.froute.clearLayers();
  if (seg.type === 'in' && seg.pts.length > 1) {
    L.polyline(seg.pts.map(fll), { color: '#ffffff', weight: 10, interactive: false }).addTo(C.froute);
    L.polyline(seg.pts.map(fll), { color: '#fb8c3a', weight: 6, interactive: false }).addTo(C.froute);
  }
}
function drawSeg(seg) { drawLegOn(seg, NAV.r.dest); NAV.drawn = NAV.r.segs.indexOf(seg); }
function stopNav() {
  clearInterval(NAV.timer); NAV.timer = 0;
  clearInterval(NAV.gtimer); NAV.gtimer = 0;
  if (NAV.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(NAV.watch);
  NAV.watch = null;
  $('#arrivecard').hidden = true; $('#atdoor').hidden = true; $('#trackbadge').hidden = true; $('#liftcard').hidden = true;
  if (CAM.stream) closeCamera();
  headingOff(); setBearing('c', null); setBearing('f', null); $('#btn-compass').hidden = true;   // maps back to as drawn
  if (!CAL.on) Motion.stop();
}
function advance(ds) {                       // simulation: walk ds metres along the current segment
  const seg = curSeg(); if (!seg || seg.type === 'lift') return;
  NAV.s += ds;
  if (NAV.s >= seg.len) { NAV.s = seg.len; nextSeg(); return; }
  if (seg.type === 'in' && isLastSeg() && S.mode === 'sim' && S.scenario && S.scenario.loseAt && !NAV.lostDone && NAV.s > S.scenario.loseAt * seg.len) lose(true);
  render();
}
function liftDone(t = performance.now()) {   // "ถึงชั้น … แล้ว"; t: when it was pressed (a desk check passes its own clock)
  const seg = curSeg(), T = NAV.trk; if (!seg || seg.type !== 'lift') return;
  $('#liftcard').hidden = true;
  const w = T && S.mode === 'real' ? walkOut(T, t) : null;
  if (T) T.pending = w;
  TestLog.event('lift_exit', { floor: seg.to, ...(w ? { walkout_steps: w.n, credit_m: +w.m.toFixed(1), turned: w.turned, pause_s: w.pause ?? null } : {}) });
  nextSeg();
}
// ---- the browser tracker
function onStep(ev) {
  if (CAL.on) { calStep(ev); return; }
  const T = NAV.trk, seg = curSeg();
  if (!NAV.r || !T || S.mode !== 'real' || !seg) return;
  if (seg.type === 'out') {
    T.outSteps++; T.outTs.push(ev.t); if (T.outTs.length > 300) T.outTs.shift();
    if (NAV.g && NAV.g.onRoute) { gpsStep(T.Lout); if (!gpsAtEntrance()) render(); }
    return;
  }
  if (seg.type === 'lift') { T.liftTs.push(ev.t); return; }   // maybe walking out before pressing the floor button (T1-S8)
  if (seg.type !== 'in' || NAV.lost) return;
  T.inSteps++; T.segSteps++;
  const L = stepLen(T, ev.t);
  T.sRaw += L;
  const end = seg.len, last = isLastSeg();
  placeDot(T, seg);
  TestLog.event('step', { s: +T.sRaw.toFixed(2), shown: +NAV.s.toFixed(2), L: +L.toFixed(3), hz: T.hz ? +T.hz.toFixed(2) : null, hold: T.hold || undefined,
                          peak: +ev.peak.toFixed(2), seg: NAV.seg });
  if (last && S.scenario && S.scenario.loseAt && !NAV.lostDone && NAV.s > S.scenario.loseAt * end) { lose(true); return; }
  if (NAV.s >= end - 1.0) {
    if (!last) { nextSeg(); return; }        // at the lift or the entrance: on to the next segment
    if (!T.arrPrompted) showArrivePrompt();
  }
  render();
}
function onTurn(ev) {
  const T = NAV.trk, seg = curSeg();
  if (!NAV.r || !T || S.mode !== 'real' || !seg) return;
  if (seg.type === 'lift') { T.liftTurns.push({ t: ev.t, deg: ev.deg }); TestLog.event('turn', { deg: Math.round(ev.deg), phase: 'lift' }); return; }
  if (seg.type !== 'in' || NAV.lost) { TestLog.event('turn', { deg: Math.round(ev.deg), phase: NAV.phase }); return; }
  // A turn counts only as the NEXT corner (T1-S9, T1-S10): when the dot waits at it, or is near it (the step count can run short).
  // web-0.3.1 snapped the dot to whichever corner was within a wide window, so a stray turn could jump it ahead.
  const c = T.corners[T.ci], before = T.sRaw;
  const early = c ? Math.max(4, 0.35 * Math.max(0, c.s - T.lastReset)) : 0;
  const take = !!c && Math.abs(ev.deg) >= 50 && T.sRaw >= c.s - early;
  if (take) { T.ci++; T.sRaw = c.s + 0.5; T.lastReset = c.s; placeDot(T, seg); }
  TestLog.event('turn', { deg: Math.round(ev.deg), dur_ms: Math.round(ev.dur), s_before: +before.toFixed(2), corner: c ? +c.s.toFixed(2) : null,
                          snapped_to: take ? +c.s.toFixed(2) : null });
  if (take && NAV.s >= seg.len - 1.0) { if (!isLastSeg()) { nextSeg(); return; } if (!T.arrPrompted) showArrivePrompt(); }
  render();
}
function doorSideText() {
  const st = NAV.r.steps, a = st[st.length - 1];
  return a && a.icon === 'arrive' ? a.sub || '' : '';
}
function showArrivePrompt() {
  const T = NAV.trk; T.arrPrompted = true;
  $('#arrive-text').textContent = `ถึง ${titleOf(NAV.r.dest)} แล้วใช่ไหม? ${doorSideText()}`.trim();
  $('#arrivecard').hidden = false;
  TestLog.event('arrive_prompt', { s: +T.sRaw.toFixed(2) });
}
function trueArrive(src) {
  // the tester says they are at the destination door: the tracker's error there is the ground truth for the web tracker
  const T = NAV.trk, seg = curSeg();
  if (T && seg && seg.type === 'in') {
    const end = seg.len, err = T.sRaw - end, last = isLastSeg();
    const signAtDoor = T.segFrom === 'sign at door';      // a sign photo, not the tracker, found the door: no tracker error to measure
    TestLog.event('true_arrival', { src, s: +T.sRaw.toFixed(2), route_m: +end.toFixed(2), err_m: +err.toFixed(2), seg_steps: T.segSteps, seg_from: T.segFrom, L: +T.L.toFixed(3), seg: NAV.seg, last_leg: last });
    TestLog.summary({ arrival_err_m: signAtDoor || !last ? null : +err.toFixed(2), seg_route_m: +end.toFixed(2), seg_from: T.segFrom, seg_steps: T.segSteps, in_steps: T.inSteps,
                      step_len_used: +T.L.toFixed(3), step_len_source: T.Lsrc, step_len_from_route: T.segSteps ? +(end / T.segSteps).toFixed(3) : null,
                      step_len_now: T.Lnow ? +T.Lnow.toFixed(3) : null, pace_hz: T.hz ? +T.hz.toFixed(2) : null, tracker: T.on });
  }
  $('#arrivecard').hidden = true; $('#atdoor').hidden = true;
  if (seg) NAV.s = seg.len;
  arrive();
}
function arrive() {
  stopNav();
  NAV.phase = 'done';
  const p = NAV.r.dest, last = NAV.r.segs[NAV.r.segs.length - 1];
  TestLog.event('arrived', { dest: p.id });
  TestLog.endRun('arrived');
  show('place');
  $('#arrived').hidden = false;
  $('#place-q').textContent = titleOf(p);
  $('#place-title').textContent = titleOf(p);
  $('#place-sub').textContent = subOf(p, true);
  $('#place-thumb').innerHTML = thumbSVG(p);
  $('#place-note').hidden = true;
  $('#place-btns').hidden = true; $('#btn-finish').hidden = false; $('#place-close').hidden = true; $('#btn-layers').hidden = true;
  if (last && last.type === 'in') { drawFloor(last.floor, p.id); C.froute.clearLayers(); showMap('floor'); const e = last.pts[last.pts.length - 1]; fmap.setView([e[1] - 8, e[0]], 3, { animate: false }); }
  else showMap('campus');
}
function curStepIndex() {
  const st = NAV.r.steps, seg = curSeg();
  if (!seg) return st.length - 1;
  if (seg.type === 'lift') return st.findIndex((x) => x.seg === NAV.seg);
  for (let i = 0; i < st.length; i++) { const x = st[i]; if (x.seg === NAV.seg && NAV.s >= x.s0 && NAV.s < x.s1) return i; }
  for (let i = st.length - 1; i >= 0; i--) if (st[i].seg === NAV.seg) return i;
  return 0;
}
function render() {
  const r = NAV.r, seg = curSeg(); if (!r || !seg) return;
  const st = r.steps, i = curStepIndex(), step = st[i];
  const real = S.mode === 'real';
  let pos;
  if (seg.type === 'out') {
    pos = real ? outdoorMe(nowMs()) : along(seg, NAV.s);
    if ($('#cmap').hidden) showMap('campus');
    C.me.setIcon(meIcon(false)); C.me.setLatLng(pos).addTo(cmap);
    cmap.panTo(pos, real ? { animate: true, duration: 0.6, easeLinearity: 0.9 } : { animate: false });   // real walk: glide, not jump
    $('#floorpill').hidden = true;
  } else {
    const fl = segFloor(seg);
    if (NAV.drawn !== NAV.seg) drawSeg(seg);
    if ($('#fmap').hidden) showMap('floor');
    pos = seg.type === 'lift' ? liftPoint(fl) : along(seg, NAV.s);
    if (S.viewFloor === fl) {                // the dot only on the floor the tester is on
      C.fme.setIcon(meIcon(NAV.lost)); C.fme.setLatLng(fll(pos)).addTo(fmap);
      if (!NAV.lost) fmap.panTo(fll(pos), real ? { animate: true, duration: 0.5 } : { animate: false });
    } else C.fme.remove();
    $('#floorpill').hidden = false;
  }
  const walkIn = seg.type === 'in' && !NAV.lost;
  $('#lostbtn').hidden = !walkIn;
  $('#instr-next').hidden = !(real && seg.type === 'in');
  $('#atdoor').hidden = !(real && walkIn && isLastSeg());
  $('#trackbadge').hidden = !(real && walkIn && NAV.trk && NAV.trk.on);
  if (NAV.trk) $('#trk-steps').textContent = NAV.trk.segSteps;
  // instruction card
  let icon = step.icon, title = step.title, sub = '';
  if (seg.type === 'lift') { sub = 'เมื่อถึงชั้นแล้วกดปุ่ม "ถึงชั้นแล้ว"'; }
  else {
    const rem = Math.max(0, step.s1 - NAV.s), next = st[i + 1];
    if (step.len > 0 && NAV.s - step.s0 < 6 && step.icon !== 'straight') { sub = fmtDist(rem); }
    else if (next && rem < 25 && next.icon !== 'straight') { icon = next.icon; title = next.title; sub = rem > 3 ? `อีก ${fmtDist(rem)}` : (next.sub || ''); }
    else if (step.len > 0) { icon = 'straight'; title = 'เดินตรง'; sub = fmtDist(rem); }
    else sub = step.sub || '';
  }
  const ic = $('#instr-ico');
  ic.src = `icons/${STEP_ICON[icon] || 'step-straight'}.svg`;
  ic.classList.toggle('rot', icon === 'straight');
  $('#instr-t').textContent = title; $('#instr-s').textContent = sub;
  // remaining time and distance: what is left of this segment and of every segment after it
  let rem = Math.max(0, seg.len - NAV.s), lifts = seg.type === 'lift' ? 1 : 0;
  for (const s of r.segs.slice(NAV.seg + 1)) { rem += s.len; if (s.type === 'lift') lifts++; }
  const secs = rem / WALK + lifts * LIFT_S;
  $('#nav-min').textContent = $('#nav-min2').textContent = fmtMin(secs);
  $('#nav-dist').textContent = $('#nav-dist2').textContent = fmtDist(rem);
  if (!$('#nav-steps').hidden) stepList($('#nav-steplist'), st, i);
  turnMaps(seg); drawHeading();              // the way ahead up, and where the phone points (T1-S13)
}
function nextStepReal() {           // real walk indoors: "next" = the tester's own correction (or the whole method if motion is off)
  const seg = curSeg(), T = NAV.trk;
  if (!seg || seg.type !== 'in') return;
  const i = curStepIndex(), nxt = NAV.r.steps.slice(i + 1).find((x) => x.seg === NAV.seg);
  const end = !nxt || nxt.icon === 'arrive' || nxt.icon === 'exit';
  TestLog.event('manual_next', { s_before: T ? +T.sRaw.toFixed(2) : +NAV.s.toFixed(2), to: end ? 'segment end' : +nxt.s0.toFixed(2), seg: NAV.seg });
  if (end) { if (isLastSeg()) trueArrive('next button'); else nextSeg(); return; }
  NAV.s = nxt.s0 + 0.01;
  if (T) {                                   // the tester says they are at the next step: corners before it are behind them
    T.sRaw = NAV.s; T.lastReset = NAV.s; T.hold = false;
    T.ci = T.corners.findIndex((c) => c.s > NAV.s); if (T.ci < 0) T.ci = T.corners.length;
  }
  render();
}

// GPS (real walk mode)
function startGPS() {
  if (!('geolocation' in navigator)) { toast('อุปกรณ์นี้ใช้ GPS ไม่ได้ ลองโหมดจำลองแทน'); return; }
  NAV.watch = navigator.geolocation.watchPosition(onFix, (e) => toast(e.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง' : 'ยังหาสัญญาณ GPS ไม่ได้'),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function onFix(pos) {
  S.me = [pos.coords.latitude, pos.coords.longitude]; S.acc = pos.coords.accuracy; S.meSrc = 'gps';
  if (NAV.phase !== 'out' || !NAV.g) return;            // indoors GPS is not used
  const t = nowMs(), pr = project(curSeg(), S.me), f = gpsFix(S.me, S.acc, t);
  TestLog.event('gps', { lat: +S.me[0].toFixed(6), lon: +S.me[1].toFixed(6), acc: Math.round(S.acc), s: +pr.s.toFixed(1), off: +pr.d.toFixed(1),
                         sw: +f.z.s.toFixed(1), d: +f.z.d.toFixed(1), sf: +NAV.g.s.toFixed(1), used: f.used, why: f.why || undefined,
                         steps: NAV.trk ? NAV.trk.outSteps : null });
  if (f.used && NAV.trk && !NAV.trk.gps0 && S.acc < 30) NAV.trk.gps0 = { s: f.z.s, steps: NAV.trk.outSteps };   // GPS-only distance, for the step length
  if (f.z.d > OFFROUTE_M && S.acc < 40) {
    if (!NAV.offSince) NAV.offSince = t;
    else if (t - NAV.offSince > OFFROUTE_S * 1000) { reroute(); return; }
  } else NAV.offSince = 0;
  if (!gpsAtEntrance()) render();
}
// ---- the outdoor filter (T1-S1, T1-S2, T1-S3)
// web-0.3.1 drew the marker at each raw fix (so it showed GPS's scatter), and took the progress from the closest point anywhere
// on the route: forward only and up to 60 m a fix, so one stray fix near a later part of the route moved it ahead for good.
// Nothing moved it between fixes, so it froze where fixes stop (e.g. under the N7 bridge).
// Now the progress along the route is a one-dimensional Kalman filter: steps (or, without motion sensors, the last speed) move it
// between fixes; a fix is matched to the route only near the current progress; a fix that disagrees by much more than its stated
// accuracy is dropped, unless three in a row agree. The marker sits on the route at that progress, or at the fix when the tester
// has clearly left the route.
function gpsInit() {
  NAV.g = { s: 0, P: 4, v: 0, t: null, out: 0, offN: 0, fix: null, acc: null, fixT: null, usedT: null, zs: null, zt: null, stepAt: null, onRoute: true };
}
function gpsStep(L) {                     // one step outdoors: dead reckoning along the route
  const G = NAV.g;
  G.s = Math.min(curSeg().len, G.s + L); G.P += (0.2 * L) ** 2; G.stepAt = nowMs();
  NAV.s = G.s;
}
function gpsFix(ll, acc, t) {
  const G = NAV.g, line = curSeg();
  if (G.t != null) {                      // predict to now: steps already moved G.s; without recent steps, coast at the last speed
    const dt = Math.max(0, (t - G.t) / 1000);
    if (!(G.stepAt && t - G.stepAt < 3000)) G.s = Math.min(line.len, G.s + G.v * Math.min(dt, GPS_COAST_S));
    G.P += GPS_Q * dt;
  }
  G.t = t; G.fix = ll; G.acc = acc; G.fixT = t;
  const z = projectNear(line, ll, G.s, GPS_BACK, GPS_AHEAD);
  G.offN = z.d > Math.max(20, 1.5 * acc) ? G.offN + 1 : 0;
  G.onRoute = G.offN < 3;                 // one or two stray fixes don't pull the marker off the route; three in a row do
  let used = false, why = null;
  if (acc > GPS_MAX_ACC) why = 'inaccurate';
  else {
    const R = acc * acc, y = z.s - G.s, gate = 3 * Math.sqrt(G.P + R) + 5;
    const stray = Math.abs(y) > gate || z.d > 3 * acc + 10;
    if (stray && ++G.out < 3) why = 'outlier';
    else {
      if (stray) { G.s = z.s; G.P = R; }                               // three in a row agree: the tester really is there
      else { const K = G.P / (G.P + R); G.s += K * y; G.P *= 1 - K; }
      G.out = 0; used = true; G.usedT = t;
      if (G.zs != null && t > G.zt) G.v = 0.8 * G.v + 0.2 * Math.max(0, Math.min(2.5, (z.s - G.zs) / ((t - G.zt) / 1000)));
      G.zs = z.s; G.zt = t;
    }
  }
  G.s = Math.max(0, Math.min(line.len, G.s));
  NAV.s = G.s;
  return { used, why, z };
}
function gpsAtEntrance() {                // the tester is at the building entrance: a fix near the door, or steps alone when GPS is lost
  const G = NAV.g, line = curSeg();
  if (!G || NAV.phase !== 'out') return false;
  const t = nowMs(), end = line.pts[line.pts.length - 1];
  const dFix = G.fix && t - G.fixT < 10000 ? dLL(G.fix, end) : Infinity;
  const close = G.s >= line.len - ENTRANCE_R && dFix < Math.max(20, (G.acc || 0) + 8);   // filtered progress at the door, and a fix agrees
  const lost = !G.usedT || t - G.usedT > GPS_LOST_S * 1000;
  if (!close && !(lost && G.s >= line.len - 3)) return false;                            // GPS lost (e.g. a roof): steps alone
  TestLog.event('entrance', { sf: +G.s.toFixed(1), d_fix: Number.isFinite(dFix) ? +dFix.toFixed(1) : null, gps_lost: lost });
  NAV.s = line.len; nextSeg();
  return true;
}
function outdoorMe(t) {                   // where the marker is drawn in real walk mode
  const G = NAV.g, line = curSeg();
  if (!G || G.t == null) return G && G.stepAt ? along(line, G.s) : S.me || line.pts[0];
  if (!G.onRoute && G.fix) return G.fix;
  let s = G.s;
  if (!(G.stepAt && t - G.stepAt < 3000)) s += G.v * Math.min(GPS_COAST_S, Math.max(0, (t - G.t) / 1000));
  return along(line, Math.min(s, line.len));
}
function reroute() {
  S.startIn = null; S.origin = { type: 'me' };
  const r = planRoute(NAV.r.dest, NAV.r.kind);
  if (!r) return;
  TestLog.event('reroute', { lat: +S.me[0].toFixed(6), lon: +S.me[1].toFixed(6) });
  toast('ออกนอกเส้นทาง กำลังหาเส้นทางใหม่');
  startNav(r);
}

// ---------- heading and a map that turns with the walk (T1-S13)
// web-0.3.1's maps were always north-up and the marker had no direction, so a tester who had lost their bearings couldn't tell
// which road they faced. Now, during navigation, the map turns so that the way ahead on the route points up (indoors too), and
// outdoors the marker shows a beam where the phone points (compass). The compass button switches to a fixed map and back.
// Indoors there is no beam: the floor plans' true north isn't known yet, so a compass can't be placed on them.
const HD = { deg: null, t: 0, src: null, on: false };          // the phone's compass heading, degrees clockwise from north
function compassOf(e) {
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) return { deg: e.webkitCompassHeading, src: 'ios' };
  if (!e.absolute || e.alpha == null) return null;
  // Android: the phone's top edge and back, in east/north terms; the way the user faces = their horizontal parts added together
  // (flat phone: the top edge; upright phone: the back; in between: both point ahead)
  const a = e.alpha * RAD, b = (e.beta || 0) * RAD, g = (e.gamma || 0) * RAD;
  const fe = -Math.sin(a) * Math.cos(b) - (Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g));
  const fn = Math.cos(a) * Math.cos(b) - (Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g));
  if (Math.hypot(fe, fn) < 0.2) return null;
  return { deg: (Math.atan2(fe, fn) / RAD + 360) % 360, src: 'android' };
}
function onOrient(e) {
  const c = compassOf(e); if (!c) return;
  const d = (c.deg + ((screen.orientation && screen.orientation.angle) || 0) + 360) % 360;
  HD.deg = HD.deg == null ? d : (HD.deg + 0.25 * (((d - HD.deg + 540) % 360) - 180) + 360) % 360;   // smooth the compass's jitter
  HD.src = c.src; HD.t = Date.now();
  drawHeading();
}
function headingOn() {
  if (HD.on) return;
  HD.on = true;
  window.addEventListener('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', onOrient);
}
function headingOff() {
  HD.on = false; HD.deg = null;
  window.removeEventListener('deviceorientationabsolute', onOrient); window.removeEventListener('deviceorientation', onOrient);
}
function drawHeading() {                    // the beam on the outdoor marker
  const el = C.me.getElement(), m = el && el.querySelector('.me-marker');
  if (!m) return;
  const fresh = HD.deg != null && Date.now() - HD.t < 3000 && NAV.phase === 'out';
  m.classList.toggle('hd', fresh);
  if (fresh) m.style.setProperty('--beam', `${HD.deg}deg`);   // the marker turns with the map, so the beam is set against north
}
const ROT = { mode: 'route', c: { on: false, deg: 0 }, f: { on: false, deg: 0 } };   // mode: 'route' (way ahead up) or 'fixed'
function setBearing(which, deg) {           // turn a map so that `deg` points up; null = back to as drawn
  const el = $(which === 'f' ? '#fmap' : '#cmap'), m = which === 'f' ? fmap : cmap, R = ROT[which];
  if (deg == null) {
    if (!R.on) return;
    Object.assign(el.style, { width: '', height: '', left: '', top: '', right: '', bottom: '', transform: '' });
    el.style.setProperty('--map-rot', '0deg');
    Object.assign(R, { on: false, deg: 0 });
    m.dragging.enable(); m.doubleClickZoom.enable(); m.options.touchZoom = true;
    m.invalidateSize(false);
    return;
  }
  if (!R.on) {                              // a square as big as the screen's diagonal, centred, so no corner shows when it turns
    const W = $('#app').clientWidth, H = $('#app').clientHeight, D = Math.ceil(Math.hypot(W, H));
    Object.assign(el.style, { width: `${D}px`, height: `${D}px`, left: `${(W - D) / 2}px`, top: `${(H - D) / 2}px`, right: 'auto', bottom: 'auto' });
    R.on = true;
    m.dragging.disable(); m.doubleClickZoom.disable(); m.options.touchZoom = 'center';   // gestures can't follow a turned map
    m.invalidateSize(false);
  }
  const diff = ((deg - R.deg + 540) % 360) - 180;                      // turn the short way round
  if (Math.abs(diff) < 2) return;
  R.deg += diff;
  el.style.transform = `rotate(${-R.deg}deg)`;
  el.style.setProperty('--map-rot', `${R.deg}deg`);                 // labels and pins turn back, so they stay upright
}
function wayAhead(seg) {                    // the direction of the route where the dot is, degrees clockwise from the map's up
  if (seg.type === 'out') {                 // outdoors: across ±6 m, so small bends in the path don't swing the map
    const a = xy(along(seg, Math.max(0, NAV.s - 6))), b = xy(along(seg, Math.min(seg.len, NAV.s + 6)));
    return dXY(a, b) < 1 ? null : bearing(a, b);
  }
  if (seg.type !== 'in' || seg.pts.length < 2) return null;
  let i = 1;                                // indoors: the piece the dot is on, not the one after a corner it is waiting at (T1-S10)
  while (i < seg.pts.length - 1 && seg.cum[i] < NAV.s - 0.05) i++;
  return dXY(seg.pts[i - 1], seg.pts[i]) < 0.1 ? null : bearing(seg.pts[i - 1], seg.pts[i]);
}
function turnMaps(seg) {
  const on = ROT.mode === 'route';
  if (seg.type === 'out') { setBearing('c', on ? wayAhead(seg) ?? ROT.c.deg : null); setBearing('f', null); }
  else if (seg.type === 'in') setBearing('f', on ? wayAhead(seg) ?? ROT.f.deg : null);
  $('#compass-needle').style.transform = `rotate(${-(seg.type === 'out' ? ROT.c.deg : ROT.f.deg)}deg)`;   // where the map's up is
}

// ---------- lost position → photo of the nearest room sign → OCR
function lose(auto = false) {     // auto: the scenario's planned loss; false: the tester pressed "หาตำแหน่งไม่เจอ?"
  NAV.lost = true; NAV.lostDone = true;
  TestLog.event('lost', { s: +NAV.s.toFixed(2), auto });
  $('#arrivecard').hidden = true;
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
    buttons: [{ t: 'ยกเลิก', ghost: true, on: cancelLost }, { t: failed ? 'ลองอีกครั้ง' : 'เปิดกล้อง', on: openCamera }] });
}
// ---- the camera inside the page (T1-S11)
// web-0.3.1's "เปิดกล้อง" opened the phone's own camera app (a file input), so testers left the page, thought it had crashed,
// and didn't know what to photograph. Now the camera shows inside the page, with a frame to aim at and a hint; only the part
// in (and just around) the frame is read. The file input stays as the fallback (no camera access, or an in-app browser).
const CAM = { stream: null };
async function openCamera() {
  closeDialog();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { TestLog.event('camera', { inpage: false, why: 'no getUserMedia' }); pickPhoto(); return; }
  try {
    CAM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch (e) {
    TestLog.event('camera', { inpage: false, why: e && e.name });
    toast('เปิดกล้องในหน้านี้ไม่ได้ จะใช้กล้องของโทรศัพท์แทน', 3500);
    pickPhoto(); return;
  }
  const v = $('#cam-video'); v.srcObject = CAM.stream; $('#camview').hidden = false;
  try { await v.play(); } catch { /* autoplay muted video normally plays */ }
  TestLog.event('camera', { inpage: true });
}
function closeCamera() {
  if (CAM.stream) CAM.stream.getTracks().forEach((t) => t.stop());
  CAM.stream = null; $('#cam-video').srcObject = null; $('#camview').hidden = true;
}
function pickPhoto() { $('#cam').value = ''; $('#cam').click(); }
function keepPhoto(src, w, h) {            // a small copy of the sign photo, only with the tester's OK
  if (!(TestLog.on() && TestLog.tester().photos)) return;
  const k = Math.min(1, 800 / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  TestLog.addPhoto(c.toDataURL('image/jpeg', 0.7), 'sign photo');
}
async function shoot() {
  const v = $('#cam-video'), W = v.videoWidth, H = v.videoHeight;
  if (!W || !H) return;
  // read the band around the frame, across the whole visible width (a long room number may stick out of the frame's sides).
  // Screen → video pixels: the video fills the screen with object-fit: cover.
  const fr = $('#cam-frame').getBoundingClientRect(), vr = v.getBoundingClientRect();
  const k = Math.max(vr.width / W, vr.height / H), ox = (vr.width - W * k) / 2, oy = (vr.height - H * k) / 2;
  const vx = (sx) => Math.max(0, Math.min(W, (sx - vr.left - ox) / k)), vy = (sy) => Math.max(0, Math.min(H, (sy - vr.top - oy) / k));
  const x = vx(vr.left), w = vx(vr.right) - x, y = vy(fr.top - 0.5 * fr.height), h = vy(fr.bottom + 0.5 * fr.height) - y;
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
  c.getContext('2d').drawImage(v, x, y, w, h, 0, 0, c.width, c.height);
  closeCamera();
  keepPhoto(c, c.width, c.height);
  await readSign(c, c.width, c.height, c.toDataURL('image/jpeg', 0.85), 'camera');
}
function cancelLost() {
  closeDialog(); $('#dim').hidden = true;
  TestLog.event('lost_cancel', {});
  NAV.lost = false; render();
  toast('ใช้ตำแหน่งล่าสุดต่อ อาจคลาดเคลื่อนได้');
}
function typeRoom() {
  const inp = document.createElement('input'); inp.placeholder = 'เช่น SCL607 หรือ 607'; inp.id = 'typed-room'; inp.autocomplete = 'off';
  dialog({ ico: LOST_ICO, title: 'ห้องที่อยู่ใกล้ที่สุด', text: 'พิมพ์เลขห้องจากป้ายหน้าห้องที่คุณยืนอยู่', extra: [inp],
    buttons: [{ t: 'ยกเลิก', ghost: true, on: () => dlgLost(false) }, { t: 'ยืนยัน', on: () => {
      const room = matchSign(inp.value.toUpperCase(), curSeg().floor);
      TestLog.event('typed_room', { text: inp.value.slice(0, 20), room: room ? room.code : null });
      if (room) recover(room, 'พิมพ์'); else dlgLost(true, 'ไม่พบห้องนี้บนชั้นนี้ ลองพิมพ์อีกครั้งหรือถ่ายรูปป้าย');
    } }] });
  setTimeout(() => inp.focus(), 50);
}
async function onPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    keepPhoto(img, img.naturalWidth, img.naturalHeight);
    await readSign(img, img.naturalWidth, img.naturalHeight, url, 'photo');
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
async function readSign(img, w, h, previewUrl, src) {
  dialog({ ico: '<div class="ants"><img src="icons/ant4.svg" alt=""><img src="icons/ant3.svg" alt=""><img src="icons/ant2.svg" alt=""><img src="icons/ant1.svg" alt=""></div>',
    title: 'กำลังแทรกสัญญาณใหม่', text: 'กรุณารอสักครู่...', img: previewUrl });
  const fl = curSeg().floor;
  const log = { at:new Date().toISOString(), floor: fl, tesseract: '', openthai: '', engine: null, room: null, cands: [] };
  let cands = [], loadFail = 0;
  // layer 1: Tesseract (Latin letters and digits), normal then inverted
  try {
    log.tesseract = await ocr(prep(img, w, h, false));
    cands = matchSigns(log.tesseract, fl);
    if (!cands.length) { log.tesseract += '\n' + await ocr(prep(img, w, h, true)); cands = matchSigns(log.tesseract, fl); }
    if (cands.length) log.engine = 'Tesseract';
  } catch { loadFail++; }
  // layer 2: OpenThai2.0-OCR-Text (Thai + English line OCR) when Tesseract found no room code
  if (!cands.length) {
    try {
      $('#dlg-p').textContent = 'ลองอ่านป้ายอีกวิธี...';
      log.openthai = (await OpenThaiOCR.read(img, w, h)).text;
      cands = matchSigns(log.openthai, fl);
      if (cands.length) log.engine = 'OpenThai';
    } catch { loadFail++; }
  }
  log.room = cands.length ? cands[0].code : null; log.cands = cands.map((r) => r.code);
  const hist = store.get('mm_ocr_log', []); hist.unshift(log); store.set('mm_ocr_log', hist.slice(0, 30));
  console.info('[sign OCR]', log);
  TestLog.event('ocr', { src, floor: fl, tesseract: log.tesseract.slice(0, 300), openthai: log.openthai.slice(0, 300), engine: log.engine, room: log.room, cands: log.cands, load_fail: loadFail });
  if (!cands.length && loadFail === 2) { dlgLost(true, 'โหลดตัวอ่านป้ายไม่สำเร็จ (ต้องต่ออินเทอร์เน็ตครั้งแรก) ลองพิมพ์เลขห้องแทน'); return; }
  const here = cands.filter((r) => r.floor === fl && N7.floors[fl].doors[r.id]).slice(0, 4);
  if (!here.length) {
    const other = cands.find((r) => r.floor !== fl);
    dlgLost(true, other ? `ป้ายนี้คือห้อง ${other.code} ซึ่งอยู่ชั้น ${other.floor} ไม่ใช่ชั้นที่คุณกำลังเดิน` : undefined);
    return;
  }
  // the tester confirms what was read: ground truth for the OCR, and no wrong jump if it misread
  const yes = (room, extra) => { TestLog.event('ocr_confirm', { room: room.code, ok: true, engine: log.engine, ...extra }); recover(room, `ป้าย · ${log.engine}`); };
  const no = (room, extra) => { TestLog.event('ocr_confirm', { room: room ? room.code : null, ok: false, engine: log.engine, ...extra }); dlgLost(true, 'ถ่ายให้เห็นเลขห้องชัด ๆ แล้วลองอีกครั้ง'); };
  if (here.length === 1) {
    const room = here[0];
    dialog({ title: `อ่านป้ายได้ว่า ${room.code}`, text: 'ถูกต้องไหม?', img: previewUrl,
      buttons: [{ t: 'ไม่ใช่ ถ่ายใหม่', ghost: true, on: () => no(room) }, { t: 'ถูกต้อง', on: () => yes(room) }] });
    return;
  }
  // several room numbers on one sign (e.g. a range such as "601-607"): the tester picks the door they are standing at
  const picked_from = here.map((r) => r.code);
  const pick = (r) => { const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = r.code; b.addEventListener('click', () => yes(r, { picked_from })); return b; };
  dialog({ title: 'ป้ายนี้มีเลขห้องหลายเลข', text: 'คุณยืนอยู่หน้าห้องไหน?', img: previewUrl, extra: here.map(pick),
    buttons: [{ t: 'ไม่ใช่ทั้งหมด ถ่ายใหม่', ghost: true, on: () => no(null, { picked_from }) }] });
}
function matchSigns(text, floor) {        // every room number on an N7 sign, most likely first: "SCL607", "N7-607", or just "607"
  const T = String(text).toUpperCase();
  const fix = (s) => s.replace(/O/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  const re = /(SCL|N7)?[\s\-–]*([0-9OILSBZ|]{3})(?![0-9])/g; const score = new Map(); let m;
  while ((m = re.exec(T))) {
    const num = fix(m[2]); if (!/^\d{3}$/.test(num)) continue;
    const id = `N7-${num}`; if (!BYID[id]) continue;
    const w = (m[1] ? 2 : 1) + (num[0] === String(floor) ? 2 : 0);
    score.set(id, Math.max(score.get(id) || 0, w));
  }
  return [...score].sort((a, b) => b[1] - a[1]).map(([id]) => BYID[id]);   // a stable sort: equal scores keep their reading order
}
function matchSign(text, floor) { return matchSigns(text, floor)[0] || null; }   // a typed room number: the best match only
function recover(room, how) {
  closeDialog(); $('#dim').hidden = true;
  const r = NAV.r, seg = curSeg(), fl = seg.floor;
  const door = nearestDoor(fl, room.id, along(seg, NAV.s)[0]);   // the room's door nearest to where the dot was
  const leg = floorLeg(fl, door, seg.to);                         // re-plan this floor's leg from that door to where it was going
  r.segs[NAV.seg] = leg; flatSteps(r);
  NAV.lost = false; NAV.s = 0;
  const atDest = isLastSeg() && (room.id === r.dest.id || leg.len <= 1.0);   // the sign is the destination's own, or a door within 1 m of it
  TestLog.event('recover', { room: room.code, how, door_x: door.x, new_in_m: +leg.len.toFixed(1), at_dest: atDest });
  if (NAV.trk) trackerLeg(NAV.trk, leg, atDest ? 'sign at door' : 'sign');
  drawSeg(leg);
  render();
  toast(`พบตำแหน่งแล้ว: หน้าห้อง ${room.code} (จาก${how})`);
  if (atDest && S.mode === 'real' && NAV.phase === 'in' && NAV.trk) showArrivePrompt();   // nothing left to walk: ask now, not after a step
}
async function sampleSign() {
  // a printed-style sign for the room nearest to where the position was lost, for testers who are not at N7
  const r = NAV.r, seg = curSeg(), F = N7.floors[seg.floor], pos = along(seg, NAV.s);
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
  await readSign(c, c.width, c.height, c.toDataURL('image/jpeg', 0.8), 'sample sign');
}

// ---------- welcome, scenarios, modes
function openWelcome() {
  show('welcome');
  const ol = $('#scenarios'); ol.innerHTML = '';
  SCENARIOS.forEach((sc) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.innerHTML = `<div class="t">${esc(sc.title)}</div><div class="s">${esc(sc.task)}</div>`;
    b.addEventListener('click', () => { if (S.mode === 'real') askMotion(); runScenario(sc); });
    li.appendChild(b); ol.appendChild(li);
  });
  for (const b of document.querySelectorAll('.modeswitch button')) b.classList.toggle('on', b.dataset.mode === S.mode);
  const fb = $('#feedback'); fb.hidden = !FEEDBACK_URL; if (FEEDBACK_URL) fb.href = FEEDBACK_URL;
  $('#inapp').hidden = !/Line\/|FBAN|FBAV|Instagram/.test(navigator.userAgent);
  renderTester();
}
function renderTester() {
  const decided = TestLog.decided(), t = TestLog.tester();
  $('#consent').hidden = decided; $('#wl-main').hidden = !decided; $('#testerline').hidden = !decided;
  if (!decided) { if (!$('#c-code').value) $('#c-code').value = TestLog.newCode(); return; }
  $('#t-code').textContent = t.consent ? t.code : 'ไม่บันทึกข้อมูล';
  renderTesterStatus();
}
async function renderTesterStatus() {
  const t = TestLog.tester(), tm = $('#t-motion');
  if (tm) tm.hidden = !(t && t.consent && motionDenied());        // "เปิดเซนเซอร์": how to allow the motion sensors again
  if (!t || !t.consent) { $('#t-status').textContent = ''; $('#t-export').hidden = true; return; }
  const c = await TestLog.counts(), L = TestLog.stepLength(), [lo, hi] = stepRange(TestLog.height());
  const parts = [];
  if (L && L >= lo && L <= hi) parts.push(`ก้าว ${L.toFixed(2)} ม.`);
  if (c.pending) parts.push(TestLog.endpoint() ? `รอส่ง ${c.pending} รายการ` : `เก็บในเครื่อง ${c.pending} รายการ`);
  else if (c.unconfirmed) parts.push(`ส่งแล้ว (ยังไม่ยืนยัน ${c.unconfirmed})`);
  else parts.push('ข้อมูลส่งครบแล้ว');
  $('#t-status').textContent = parts.join(' · ');
  $('#t-export').hidden = !c.total;
}
function startPointOf(code) {
  const b = BYID[code]; return b && b.entrance ? [...b.entrance] : null;
}
function runScenario(sc) {
  S.scenario = sc; S.origin = { type: 'me' }; S.place = null;
  TestLog.startRun({ kind: 'scenario', scenario: SCENARIOS.indexOf(sc) + 1, title: sc.title, mode: S.mode });
  const atN7 = sc.start === 'N7';          // the tester is already at N7: start from its entrance, no GPS needed
  if (S.mode === 'sim' || atN7) { S.me = startPointOf(sc.start); S.meSrc = 'set'; }
  goHome();
  if (S.me) cmap.setView(S.me, 17.5, { animate: false });
  if (S.mode === 'real' && !atN7) locateOnce();
}
function freeUse() {
  S.scenario = null; S.origin = { type: 'me' };
  TestLog.startRun({ kind: 'free', mode: S.mode });
  if (S.mode === 'sim' && !S.me) { S.me = startPointOf('N16'); S.meSrc = 'set'; }
  goHome();
  if (S.mode === 'real') locateOnce();
}

// ---------- motion sensors: asked inside a tap (iPhone asks, and so does Chrome on Android from about version 157)
function askMotion() {
  const asked = Motion.ensurePermission();  // first: the step counter depends on it
  // iPhone: the compass (T1-S13) needs its own call, also inside the tap; it shares the motion prompt
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().catch(() => {});
  return asked.then((p) => {
    const t = TestLog.tester();
    if (t && t.consent && t.census && t.census.permission !== p) {   // the answer changed, e.g. allowed after a refusal: measure again
      Motion.census().then((c) => { TestLog.setCensus(c); if (!$('#welcome').hidden) renderTesterStatus(); });
    }
    return p;
  });
}
function motionDenied() {          // refused on this page or, after a reload and before anything asks again, at the consent screen
  const p = Motion.permission(), t = TestLog.tester();
  return p === 'denied' || (p == null && !!(t && t.census && t.census.permission === 'denied'));
}
function motionHelp() {            // how to allow the sensors again, with a retry
  const ua = navigator.userAgent;
  const how = /Line\/|FBAN|FBAV|Instagram/.test(ua) ? 'เปิดลิงก์นี้ใน Safari หรือ Chrome แทนเบราว์เซอร์ในแอป'
    : /iPhone|iPad|iPod/.test(ua) ? 'ปัดปิดแอป Safari แล้วเปิดลิงก์ทดสอบอีกครั้ง เมื่อมีคำถามเรื่องการเคลื่อนไหว ให้กด "อนุญาต"'
    : 'แตะไอคอนทางซ้ายของช่องที่อยู่เว็บ เปิดสิทธิ์ "Motion sensors" (เซนเซอร์การเคลื่อนไหว) แล้วกด "ลองอีกครั้ง" ถ้ายังไม่ได้ให้โหลดหน้านี้ใหม่';
  dialog({ title: 'ยังไม่ได้อนุญาตเซนเซอร์การเคลื่อนไหว', text: `แอปใช้เซนเซอร์นี้นับก้าวตอนเดินในอาคาร วิธีเปิด: ${how}`,
    buttons: [{ t: 'ไว้ก่อน', ghost: true, on: closeDialog },
              { t: 'ลองอีกครั้ง', on: () => askMotion().then((p) => {
                if (p === 'denied') { $('#dlg-p').textContent = `ยังไม่ได้รับอนุญาต วิธีเปิด: ${how}`; return; }
                closeDialog(); toast('เปิดเซนเซอร์แล้ว');
                if (!$('#welcome').hidden) renderTesterStatus();
              }) }] });
}

// ---------- calibration walk: N7 floor 6, from the corridor at the central lift lobby to the west stair door
const CAL = { on: false, steps: 0, t0: 0 };
function openCalib() {
  show('calib');
  $('#cal-steps').textContent = '0';
  $('#cal-start').hidden = false; $('#cal-done').hidden = true;
  $('#cal-msg').textContent = `ระยะทาง ${Math.round(CAL_DIST)} เมตร`;
}
function calStart() {
  askMotion().then((p) => {
    if (p === 'denied') { motionHelp(); return; }
    if (p === 'unsupported') { toast('เบราว์เซอร์นี้ไม่มีเซนเซอร์การเคลื่อนไหว ลองเปิดใน Safari หรือ Chrome', 4000); return; }
    TestLog.startRun({ kind: 'calibration', mode: 'real', distance_m: CAL_DIST, where: 'N7 floor 6: corridor at the central lift lobby to the west stair door' });
    Motion.stop(); Motion.start(); TestLog.recStart();
    Object.assign(CAL, { on: true, steps: 0, t0: Date.now(), ts: [] });
    TestLog.event('cal_start', {});
    $('#cal-steps').textContent = '0'; $('#cal-start').hidden = true; $('#cal-done').hidden = false;
    $('#cal-msg').textContent = 'เดินด้วยความเร็วปกติ แล้วกด "ถึงแล้ว" เมื่ออยู่ตรงประตูบันได';
  });
}
function calStep(ev) {
  CAL.steps++;
  if (ev && ev.t != null) CAL.ts.push(ev.t);                 // step times: the walking pace (T1-S9)
  $('#cal-steps').textContent = CAL.steps;
  TestLog.event('step', { n: CAL.steps });
}
function calDone() {
  if (!CAL.on) return;
  CAL.on = false; Motion.stop();
  const secs = (Date.now() - CAL.t0) / 1000, n = CAL.steps, L = n ? CAL_DIST / n : 0;
  const why = calCheck(n, L), ok = !why, hz = paceOf(CAL.ts);
  TestLog.event('cal_done', { steps: n, secs: +secs.toFixed(1), L: +L.toFixed(3), hz: hz && +hz.toFixed(2), accepted: ok, why });
  if (ok) TestLog.setStepLength(L, 'calibration walk', hz ? { hz: +hz.toFixed(2) } : {});
  TestLog.endRun('calibrated', { steps: n, secs: +secs.toFixed(1), step_len: +L.toFixed(3), accepted: ok, why });
  $('#cal-done').hidden = true; $('#cal-start').hidden = false; $('#cal-start').textContent = 'เดินอีกครั้ง';
  $('#cal-msg').textContent = ok
    ? `ก้าวของคุณยาวประมาณ ${L.toFixed(2)} ม. (${n} ก้าว ใน ${Math.round(secs)} วินาที) ระบบจะใช้ค่านี้ตอนนำทาง`
    : why === 'short step'
      ? `นับได้ ${n} ก้าว มากเกินไปสำหรับ ${Math.round(CAL_DIST)} เมตร ลองเดินใหม่ด้วยก้าวปกติ ถือโทรศัพท์ไว้ข้างหน้าเหมือนตอนดูแผนที่`
      : `นับได้ ${n} ก้าว น้อยเกินไปสำหรับ ${Math.round(CAL_DIST)} เมตร ลองใหม่ให้ครบตั้งแต่หน้าลิฟต์ถึงประตูบันได ถือโทรศัพท์ไว้ข้างหน้าเหมือนตอนดูแผนที่ แล้วค่อยกด "ถึงแล้ว"`;
}
function calCheck(n, L) {          // why a calibration walk can't be used (null if it can): it must look like the whole corridor
  const [lo, hi] = stepRange(TestLog.height());
  return n < 60 ? 'few steps' : L > hi ? 'long step' : L < lo ? 'short step' : null;
}
function calCancel() {
  if (CAL.on) { CAL.on = false; Motion.stop(); TestLog.event('cal_cancel', { steps: CAL.steps }); TestLog.endRun('cancelled'); }
  openWelcome();
}
function locateOnce() {
  if (!('geolocation' in navigator)) { toast('อุปกรณ์นี้ใช้ GPS ไม่ได้'); return; }
  toast('กำลังหาตำแหน่งของคุณ...');
  navigator.geolocation.getCurrentPosition((p) => {
    S.me = [p.coords.latitude, p.coords.longitude]; S.acc = p.coords.accuracy; S.meSrc = 'gps';
    placeMe(); cmap.setView(S.me, 18, { animate: false });
    if (dLL(S.me, [13.6513, 100.4945]) > 900) toast('คุณอยู่นอกมหาวิทยาลัย ใช้ปุ่ม "เส้นทาง" เพื่อเปิด Google Maps มาที่ มจธ.', 4500);
    else toast(`พบตำแหน่งแล้ว (คลาดเคลื่อน ±${Math.round(S.acc)} ม.)`);
  }, () => { toast('หาตำแหน่งไม่ได้ ใช้ตำแหน่งจำลองแทน'); S.me = startPointOf('N16'); S.meSrc = 'set'; placeMe(); },
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
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = recentFirst(search($('#q').value)); if (r[0]) choose(r[0].p, r[0].hit); } });   // the top row shown
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
    if (S.mode === 'real') askMotion();                             // inside the tap, so iPhone can ask
    S.origin = { type: 'me' }; S.routeKind = 'fast';
    askWhere(() => {                                                 // inside N7 already? then start on that floor (T1-S4)
      const r = planRoute(S.place, 'fast');
      if (!r) { toast('หาเส้นทางไปที่นี่ไม่ได้'); return; }
      S.route = r; startLoading(() => startNav(r));
    });
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
  $('#pv-start').addEventListener('click', () => { if (S.mode === 'real') askMotion(); const r = S.route; startLoading(() => startNav(r)); });
  $('#nav-x').addEventListener('click', () => {
    stopNav(); TestLog.event('nav_cancel', { phase: NAV.phase }); TestLog.endRun('cancelled');
    NAV.r = null; S.place ? openPlace(S.place) : goHome();
  });
  $('#nav-x2').addEventListener('click', () => $('#nav-x').click());
  $('#nav-expand').addEventListener('click', () => { $('#nav-steps').hidden = false; $('#navbar').hidden = true; render(); });
  $('#nav-steps').addEventListener('click', (e) => { if (e.target.classList.contains('grab')) { $('#nav-steps').hidden = true; $('#navbar').hidden = false; } });
  $('#sim-play').addEventListener('click', () => { NAV.playing = !NAV.playing; $('#sim-play').textContent = NAV.playing ? '❚❚' : '▶'; });
  $('#sim-speed').addEventListener('click', () => { const v = [1, 4, 8, 16]; NAV.speed = v[(v.indexOf(NAV.speed) + 1) % v.length]; $('#sim-speed').textContent = `×${NAV.speed}`; });
  $('#lift-ok').addEventListener('click', () => liftDone());
  $('#btn-compass').addEventListener('click', () => {           // way ahead up ⇄ the map as drawn (T1-S13)
    ROT.mode = ROT.mode === 'route' ? 'fixed' : 'route';
    $('#btn-compass').classList.toggle('north', ROT.mode === 'fixed');
    TestLog.event('map_mode', { mode: ROT.mode });
    render();
  });
  $('#lift-in').addEventListener('click', () => { TestLog.event('lift_in', {}); toast('บันทึกแล้ว กดอีกปุ่มเมื่อออกจากลิฟต์'); });
  $('#instr-next').addEventListener('click', nextStepReal);
  $('#atdoor').addEventListener('click', () => trueArrive('at-door button'));
  $('#arrive-yes').addEventListener('click', () => trueArrive('arrival prompt'));
  $('#arrive-no').addEventListener('click', () => { $('#arrivecard').hidden = true; TestLog.event('arrive_prompt_no', { s: NAV.trk ? +NAV.trk.sRaw.toFixed(2) : null }); });
  Motion.onStep = onStep; Motion.onTurn = onTurn;
  $('#lostbtn').addEventListener('click', () => lose(false));
  $('#cam').addEventListener('change', (e) => onPhoto(e.target.files[0]));
  $('#cam-shot').addEventListener('click', shoot);
  $('#cam-x').addEventListener('click', () => { closeCamera(); TestLog.event('camera_close', {}); dlgLost(false); });
  $('#cam-file').addEventListener('click', () => { closeCamera(); pickPhoto(); });
  $('#floorpill').addEventListener('click', () => {
    const m = $('#floormenu');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = '';
    for (const f of N7_FLOORS) {
      const b = document.createElement('button'); b.textContent = `ชั้น ${f}`;
      b.disabled = !N7.floors[f]; b.classList.toggle('on', f === S.viewFloor);
      b.addEventListener('click', () => {
        m.hidden = true;
        const seg = NAV.phase !== 'done' && curSeg();
        if (seg && seg.type !== 'out' && segFloor(seg) === f) { drawSeg(seg); render(); }         // back to the tester's own floor
        else { drawFloor(f, NAV.r && NAV.r.dest.floor === f ? NAV.r.dest.id : null); C.froute.clearLayers(); C.fme.remove(); }
        fitFloor(f);
      });
      m.appendChild(b);
    }
    if (N7_FLOORS.some((f) => !N7.floors[f])) { const sm = document.createElement('small'); sm.textContent = 'ชั้นอื่นยังไม่มีแผนผัง'; m.appendChild(sm); }
    m.hidden = false;
  });
  for (const b of document.querySelectorAll('.modeswitch button')) {
    b.addEventListener('click', () => { S.mode = b.dataset.mode; for (const x of document.querySelectorAll('.modeswitch button')) x.classList.toggle('on', x === b); });
  }
  $('#free-use').addEventListener('click', () => { if (S.mode === 'real') askMotion(); freeUse(); });
  // test data: consent, tester code, calibration walk, file export
  $('#c-yes').addEventListener('click', () => {
    const pm = Motion.ensurePermission();                          // inside the tap: iPhone shows its motion prompt now
    TestLog.decide({ consent: true, code: $('#c-code').value, height_cm: parseFloat($('#c-height').value), photos: $('#c-photos').checked });
    renderTester();
    pm.then(() => Motion.census()).then((c) => {
      TestLog.setCensus(c);
      if (c.motion_api && Motion.permission() === 'denied') { renderTesterStatus(); motionHelp(); }
    });
  });
  $('#c-no').addEventListener('click', () => { TestLog.decide({ consent: false }); renderTester(); });
  $('#t-change').addEventListener('click', () => { TestLog.reset(); $('#c-code').value = TestLog.newCode(); $('#c-height').value = ''; $('#c-photos').checked = false; renderTester(); });
  $('#t-motion')?.addEventListener('click', motionHelp);           // missing only while an older index.html is still cached
  $('#t-export').addEventListener('click', async () => {
    const r = await TestLog.exportFile();
    toast(r === 'empty' ? 'ไม่มีข้อมูลค้างในเครื่อง' : r === 'shared' ? 'ส่งไฟล์แล้ว ขอบคุณครับ' : 'บันทึกไฟล์แล้ว ส่งไฟล์นี้ให้ทีมได้เลย', 3500);
  });
  TestLog.onChange(() => { if (!$('#welcome').hidden) renderTesterStatus(); });
  $('#calib-open').addEventListener('click', openCalib);
  $('#cal-start').addEventListener('click', calStart);
  $('#cal-done').addEventListener('click', calDone);
  $('#cal-cancel').addEventListener('click', calCancel);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, a');
    if (b) TestLog.tap(b.id || b.dataset.mode || b.dataset.cat || 'other');
  }, true);
  window.addEventListener('pagehide', () => { if (TestLog.active()) TestLog.endRun('page closed'); });
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
