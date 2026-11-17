'use strict';
/* Phone motion for the web prototype: permission, a sensor census, step and turn detection, and a compact raw recording.
   Browsers give the accelerometer and the gyroscope (DeviceMotion), never the barometer. Everything recorded here is "web" data.

   Vertical acceleration = accelerationIncludingGravity projected on its own low-passed direction (gravity), minus |gravity|.
   That works whichever sign convention the platform uses. A step = a peak of the smoothed vertical acceleration above an
   adaptive threshold, ending when the signal falls below zero, at least 0.3 s after the previous step.
   A turn = rotation about the vertical (gyroscope projected on gravity) of at least 45 degrees, ended by 0.4 s of calm. */
const Motion = (() => {
  const STEP_MIN = 0.7;          // m/s², lowest step threshold (hand tremor stays well below)
  const STEP_GAP_MS = 300;       // at most ~3.3 steps per second
  const TURN_START = 30, TURN_CALM = 12, TURN_MIN = 45;   // deg/s, deg/s, deg

  let perm = null;               // 'granted' | 'denied' | 'not-needed' | 'unsupported'
  let running = false;
  let g = null, lastT = null;
  const win = []; let winSum = 0;
  let state = 0, peakV = 0, peakT = 0, lastStepT = -1e12, avgPeak = 1.8, steps = 0;
  let yaw = 0, turning = false, turnYaw0 = 0, turnT0 = 0, calmSince = 0;
  let rec = null;
  const api = { onStep: null, onTurn: null };

  function ensurePermission() {
    // iPhone: must be called from inside a tap handler; it resolves at once if granted earlier in this browser session
    if (perm === 'granted' || perm === 'not-needed') return Promise.resolve(perm);
    if (!('DeviceMotionEvent' in window)) { perm = 'unsupported'; return Promise.resolve(perm); }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      return DeviceMotionEvent.requestPermission().then((s) => (perm = s === 'granted' ? 'granted' : 'denied')).catch(() => (perm = 'denied'));
    }
    perm = 'not-needed';
    return Promise.resolve(perm);
  }
  const usable = () => perm === 'granted' || perm === 'not-needed';

  function reset() {
    g = null; lastT = null; win.length = 0; winSum = 0;
    state = 0; peakV = 0; lastStepT = -1e12; steps = 0;
    yaw = 0; turning = false; calmSince = 0;
  }
  function start() {
    if (running || !usable()) return running;
    reset(); running = true;
    window.addEventListener('devicemotion', onMotion);
    return true;
  }
  function stop() { running = false; window.removeEventListener('devicemotion', onMotion); }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    process(e.timeStamp || performance.now(), a.x, a.y, a.z, e.rotationRate);
  }
  function process(t, ax, ay, az, r) {
    const dt = lastT == null ? 16 : Math.min(250, Math.max(1, t - lastT)); lastT = t;
    if (!g) g = [ax, ay, az];
    else { const k = Math.exp(-dt / 600); g[0] = g[0] * k + ax * (1 - k); g[1] = g[1] * k + ay * (1 - k); g[2] = g[2] * k + az * (1 - k); }
    const gn = Math.hypot(g[0], g[1], g[2]) || 9.81;
    const v = (ax * g[0] + ay * g[1] + az * g[2]) / gn - gn;
    win.push(v); winSum += v; if (win.length > 5) winSum -= win.shift();
    const vs = winSum / win.length;
    // steps
    const hi = Math.max(STEP_MIN, 0.5 * avgPeak);
    if (state === 0) { if (vs > hi) { state = 1; peakV = vs; peakT = t; } }
    else {
      if (vs > peakV) { peakV = vs; peakT = t; }
      if (vs < 0) {
        state = 0;
        if (peakT - lastStepT >= STEP_GAP_MS) {
          lastStepT = peakT; steps++;
          avgPeak = Math.min(8, Math.max(1.2, 0.85 * avgPeak + 0.15 * peakV));
          if (api.onStep) api.onStep({ t: peakT, peak: peakV, n: steps });
        }
      }
    }
    // turns: rotation about the vertical. rotationRate: alpha about z, beta about x, gamma about y (deg/s)
    if (r && r.alpha != null) {
      const w = (r.beta * g[0] + r.gamma * g[1] + r.alpha * g[2]) / gn;
      yaw += (w * dt) / 1000;
      const aw = Math.abs(w);
      if (!turning) { if (aw > TURN_START) { turning = true; turnYaw0 = yaw - (w * dt) / 1000; turnT0 = t; calmSince = 0; } }
      else if (t - turnT0 > 6000) turning = false;                     // a long slow rotation is not a corridor turn
      else if (aw < TURN_CALM) {
        if (!calmSince) calmSince = t;
        if (t - calmSince > 400) {
          turning = false;
          const d = yaw - turnYaw0;
          if (Math.abs(d) >= TURN_MIN && api.onTurn) api.onTurn({ t, deg: d, dur: t - turnT0 });
        }
      } else calmSince = 0;
    }
    if (rec) push(t, ax, ay, az, r);
  }

  // ---- compact recording: int32 time steps (ms), int16 acceleration incl. gravity (cm/s²), int16 rotation (0.1 deg/s)
  function recStart() { rec = { base: null, last: null, n: 0, cap: 0, cols: null, wall0: new Date().toISOString() }; grow(4096); }
  function grow(cap) {
    const old = rec.cols;
    rec.cols = { dt: new Int32Array(cap), ax: new Int16Array(cap), ay: new Int16Array(cap), az: new Int16Array(cap),
                 ra: new Int16Array(cap), rb: new Int16Array(cap), rg: new Int16Array(cap) };
    if (old) for (const k in old) rec.cols[k].set(old[k].subarray(0, rec.n));
    rec.cap = cap;
  }
  const i16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x)));
  function push(t, ax, ay, az, r) {
    if (rec.n >= rec.cap) grow(rec.cap * 2);
    if (rec.base == null) rec.base = t;
    const c = rec.cols, n = rec.n;
    c.dt[n] = Math.round(rec.last == null ? 0 : t - rec.last); rec.last = t;
    c.ax[n] = i16(ax * 100); c.ay[n] = i16(ay * 100); c.az[n] = i16(az * 100);
    c.ra[n] = r && r.alpha != null ? i16(r.alpha * 10) : 0;
    c.rb[n] = r && r.beta != null ? i16(r.beta * 10) : 0;
    c.rg[n] = r && r.gamma != null ? i16(r.gamma * 10) : 0;
    rec.n++;
  }
  function b64(arr) {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function recStop() {
    if (!rec) return null;
    const r = rec; rec = null;
    const out = { started_at: r.wall0, n: r.n, encoding: 'base64 little-endian; dt int32 ms since previous sample; ax/ay/az int16 cm/s² (accelerationIncludingGravity); ra/rb/rg int16 0.1 deg/s (rotationRate alpha/beta/gamma)', cols: {} };
    for (const k in r.cols) out.cols[k] = b64(r.cols[k].subarray(0, r.n));
    return out;
  }

  // ---- census: what this phone and browser offer
  async function census(ms = 2500) {
    const ua = navigator.userAgent;
    const c = {
      ua,
      os: /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'other',
      browser: /Line\//.test(ua) ? 'LINE in-app' : /FBAN|FBAV|Instagram/.test(ua) ? 'Facebook/Instagram in-app' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'other',
      screen: [screen.width, screen.height, window.devicePixelRatio || 1],
      motion_api: 'DeviceMotionEvent' in window, permission: perm, geolocation: 'geolocation' in navigator,
      events: 0, rate_hz: 0, has_gyro: false, has_accel_without_gravity: false, measured_ms: ms,
    };
    if (!c.motion_api || !usable()) return c;
    const ts = []; let gyro = 0, accNoG = 0;
    const h = (e) => {
      ts.push(e.timeStamp);
      const r = e.rotationRate;
      if (r && r.alpha != null && Math.abs(r.alpha) + Math.abs(r.beta) + Math.abs(r.gamma) > 1e-4) gyro++;
      if (e.acceleration && e.acceleration.x != null) accNoG++;
    };
    window.addEventListener('devicemotion', h);
    await new Promise((res) => setTimeout(res, ms));
    window.removeEventListener('devicemotion', h);
    const d = ts.slice(1).map((t, i) => t - ts[i]).filter((x) => x > 0).sort((a, b) => a - b);
    c.events = ts.length;
    c.rate_hz = d.length ? Math.round(1000 / d[d.length >> 1]) : 0;
    c.has_gyro = gyro > 0;
    c.has_accel_without_gravity = accNoG > 0;
    return c;
  }

  return Object.assign(api, {
    ensurePermission, start, stop, census, recStart, recStop,
    recording: () => !!rec, running: () => running, permission: () => perm, steps: () => steps,
    _feed: (t, ax, ay, az, r) => process(t, ax, ay, az, r),   // for desk tests only
    _reset: reset,
  });
})();
