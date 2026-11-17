/* Before/after check for T1-S1, T1-S2 and T1-S3 (the outdoor marker in real walk mode).

   It replays a simulated walk through the build's own code, and reports where the marker was compared with where the walker was:
   - the route: scenario 2, from the car park (S2) to SCL607, planned by the build itself;
   - walking speed: 1.3 m/s, at 1.8 steps a second;
   - simulated GPS: one fix a second, with a slowly drifting error (about 4 m), scatter (3 m) and 6 % stray fixes 30–60 m off;
   - a 25-second stretch with no fixes at all, like walking under the N7 bridge or a roof.
   The walk runs twice: with the phone's step counter, and without it (motion sensors refused).
   A fixed random seed makes every run identical. Nothing is logged or uploaded.

   Run it in the browser console on either build, after the welcome screen has loaded:
     before: https://devsavegg.github.io/modmap-prototype/v/web-0.3.1/   → eval(await (await fetch('../../feedback/checks/gps.js')).text())
     after:  https://devsavegg.github.io/modmap-prototype/              → eval(await (await fetch('feedback/checks/gps.js')).text())
   It prints a table with one row per walk; reload the page afterwards. */
(async () => {
  if (window.MM_CONFIG) window.MM_CONFIG.TESTLOG_URL = '';            // never upload from a desk check
  const WALK_V = 1.3, STEP_HZ = 1.8;
  const GAP = [0.55, 0.62];             // share of the walk with no fixes (25 s on this route)
  const OUTLIER_P = 0.06, BIAS_SD = 4, BIAS_TAU = 30, NOISE_SD = 3, ACC = 8;
  const hasClock = typeof TEST_NOW !== 'undefined';
  const setNow = (ms) => { if (hasClock) TEST_NOW = ms; };
  navigator.geolocation.watchPosition = () => 1; navigator.geolocation.clearWatch = () => {};   // no real GPS during the check
  const outOf = (r) => (r.out && r.out.pts ? r.out : r.segs.find((x) => x.type === 'out').line);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

  function walk(withSteps) {
    let seed = 7;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    S.mode = 'real'; S.scenario = null; S.origin = { type: 'me' }; S.me = startPointOf('S2');
    const route = planRoute(BYID['N7-607'], 'fast');
    const line = outOf(route), T = line.len / WALK_V, t0 = Date.now(), p0 = performance.now();
    setNow(t0);
    startNav(route);
    // events: fixes every second (none in the gap), steps, and a look at the marker every half second
    const ev = [];
    for (let t = 1; t <= T + 40; t += 1) if (!(t > GAP[0] * T && t < GAP[1] * T)) ev.push({ t, k: 'fix' });
    if (withSteps) for (let t = 1 / STEP_HZ, n = 1; t <= T + 40; t += 1 / STEP_HZ, n++) ev.push({ t, k: 'step', n });
    for (let t = 0.5; t <= T + 40; t += 0.5) ev.push({ t, k: 'look' });
    ev.sort((a, b) => a.t - b.t || (a.k === 'look') - (b.k === 'look'));
    const truthS = (t) => Math.min(line.len, WALK_V * t);
    const progressNear = (ll, s0) => {   // where on the route the marker is, searched within 100 m of the walker
      const p = xy(ll), lo = s0 - 100, hi = s0 + 100; let best = { s: s0, d: Infinity };
      for (let i = 1; i < line.pts.length; i++) {
        const c0 = line.cum[i - 1], c1 = line.cum[i]; if (c1 < lo || c0 > hi) continue;
        const a = xy(line.pts[i - 1]), b = xy(line.pts[i]), vx = b[0] - a[0], vy = b[1] - a[1], L = Math.hypot(vx, vy) || 1;
        const t = Math.max(Math.max(0, (lo - c0) / L), Math.min(Math.min(1, (hi - c0) / L), ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (L * L)));
        const d = Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]); if (d < best.d) best = { s: c0 + t * L, d };
      }
      return best;
    };
    let bx = 0, by = 0, lastFixT = 0, enteredAt = null, leadMax = 0, behindMax = 0, freezeMax = 0, still = null;
    const errs = [], offPath = [];
    for (const e of ev) {
      setNow(t0 + e.t * 1000);
      if (NAV.phase !== 'out') { enteredAt = e.t; break; }
      if (e.k === 'fix') {
        const k = Math.exp(-(e.t - lastFixT) / BIAS_TAU); lastFixT = e.t;
        bx = bx * k + BIAS_SD * Math.sqrt(1 - k * k) * gauss(); by = by * k + BIAS_SD * Math.sqrt(1 - k * k) * gauss();
        let dx = bx + NOISE_SD * gauss(), dy = by + NOISE_SD * gauss();
        if (rnd() < OUTLIER_P) { const a = rnd() * 2 * Math.PI, r = 30 + 30 * rnd(); dx += r * Math.cos(a); dy += r * Math.sin(a); }
        const p = along(line, truthS(e.t));
        onFix({ coords: { latitude: p[0] + dy / KY, longitude: p[1] + dx / KX, accuracy: ACC }, timestamp: t0 + e.t * 1000 });
      } else if (e.k === 'step') {
        onStep({ t: p0 + e.t * 1000, peak: 2, n: e.n });
      } else {
        render();
        const m = C.me.getLatLng(), ll = [m.lat, m.lng], ts = truthS(e.t);
        errs.push(dLL(ll, along(line, ts)));
        const pr = progressNear(ll, ts); offPath.push(pr.d);
        leadMax = Math.max(leadMax, pr.s - ts); behindMax = Math.max(behindMax, ts - pr.s);
        if (!still || dLL(still.ll, ll) > 1) still = { t: e.t, ll, s: ts };
        else if (ts - still.s > 10) freezeMax = Math.max(freezeMax, e.t - still.t);
      }
    }
    errs.sort((a, b) => a - b);
    const row = {
      build: (window.MM_CONFIG && window.MM_CONFIG.APP_VERSION) || '?',
      walk: withSteps ? 'step counter on' : 'no motion sensors',
      'route m': Math.round(line.len),
      'marker error mean m': +mean(errs).toFixed(1),
      'marker error p95 m': +errs[Math.floor(0.95 * (errs.length - 1))].toFixed(1),
      'marker off the path mean m': +mean(offPath).toFixed(1),
      'most ahead of walker m': +leadMax.toFixed(1),
      'most behind walker m': +behindMax.toFixed(1),
      'longest freeze while walking s': +freezeMax.toFixed(1),
      'entered N7 this far before the door m': enteredAt == null ? 'never' : +Math.max(0, line.len - truthS(enteredAt)).toFixed(1),
      'entered N7 this long after reaching the door s': enteredAt == null ? 'never' : +Math.max(0, enteredAt - T).toFixed(1),
    };
    stopNav(); NAV.r = null; setNow(null);
    return row;
  }
  const rows = [walk(true), walk(false)];
  goHome();
  console.table(rows);
  return rows;
})();
