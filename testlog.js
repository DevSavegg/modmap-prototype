'use strict';
/* Test-data logging for the web prototype. Every file is labelled platform "web" and schema "modmap-web-test/1".
   Nothing is logged without the tester's consent. A "run" = one scenario, one free navigation or one calibration walk.
   Each finished run goes to a local outbox (IndexedDB), then to the team's Google Apps Script (config.js: TESTLOG_URL).
   If that can't be reached, the tester can share the outbox as a file. */
const TestLog = (() => {
  const CFG = window.MM_CONFIG || {};
  const KEY = 'mm_tester_v1';
  const iso = () => new Date().toISOString();
  const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: memory only */ } },
    del() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
  };
  let tester = store.get();       // {decided, consent, code, height_cm, photos, at, census, step_len}
  const session = { id: rid('s'), started_at: iso() };
  let run = null, listeners = [];

  function newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = 'T-'; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }
  function decide({ consent, code, height_cm, photos }) {
    tester = { decided: true, consent: !!consent, code: (code || newCode()).trim().slice(0, 24), at: iso(),
               height_cm: height_cm && height_cm > 100 && height_cm < 230 ? Math.round(height_cm) : null,
               photos: !!photos, census: null, step_len: null };
    store.set(tester); notify();
  }
  function reset() { if (run) endRun('abandoned'); tester = null; store.del(); notify(); }
  const on = () => !!(tester && tester.consent);
  function setCensus(c) { if (tester) { tester.census = c; store.set(tester); } }
  function setStepLength(L, src, extra) { if (tester) { tester.step_len = { L: +L.toFixed(3), src, at: iso(), ...extra }; store.set(tester); notify(); } }

  // ---- runs and events
  function startRun(info) {
    if (run) endRun('abandoned');
    if (!on()) { run = null; return null; }
    run = { id: rid('r'), ...info, started_at: iso(), t0: performance.now(), events: [], taps: 0, tap_ids: {}, photos: [], summary: {} };
    event('run_start', info);
    return run.id;
  }
  const active = () => !!run;
  function event(type, data) {
    if (!run) return;
    run.events.push({ t: Math.round(performance.now() - run.t0), type, ...(data || {}) });
  }
  function tap(id) {
    if (!run) return;
    run.taps++; run.tap_ids[id] = (run.tap_ids[id] || 0) + 1;
  }
  function addPhoto(dataUrl, note) {
    if (run && tester.photos && run.photos.length < 6) run.photos.push({ t: Math.round(performance.now() - run.t0), note, jpeg: dataUrl });
  }
  function summary(obj) { if (run) Object.assign(run.summary, obj); }
  function recStart() { if (run && Motion.running() && !Motion.recording()) Motion.recStart(); }

  async function endRun(outcome, extra) {
    if (!run) return;
    const r = run; run = null;
    const motion = Motion.recording() ? Motion.recStop() : null;
    const { t0, ...body } = r;
    body.ended_at = iso(); body.outcome = outcome; body.duration_s = Math.round((performance.now() - t0) / 100) / 10;
    Object.assign(body.summary, extra || {});
    const payload = {
      schema: 'modmap-web-test/1', platform: 'web',
      app: { name: 'modmap-web', version: CFG.APP_VERSION || 'web-dev', url: location.href.split('#')[0] },
      session: { id: session.id, started_at: session.started_at, tester: tester ? tester.code : null,
                 height_cm: tester ? tester.height_cm : null, photos_ok: !!(tester && tester.photos),
                 census: tester ? tester.census : null, step_len_profile: tester ? tester.step_len : null },
      run: body, motion,
    };
    await outboxPut(payload);
    flush();
  }

  // ---- outbox (IndexedDB, falling back to memory)
  let dbp = null; const mem = new Map();
  function db() {
    if (!dbp) dbp = new Promise((res) => {
      try {
        const q = indexedDB.open('mm-outbox', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('runs', { keyPath: 'run.id' });
        q.onsuccess = () => res(q.result); q.onerror = () => res(null);
      } catch { res(null); }
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    if (!d) return fn(null);
    return new Promise((res) => {
      const t = d.transaction('runs', mode), s = t.objectStore('runs');
      const q = fn(s);
      t.oncomplete = () => res(q && 'result' in q ? q.result : undefined);
      t.onerror = () => res(undefined);
    });
  }
  async function outboxPut(p) { p._status = p._status || 'pending'; mem.set(p.run.id, p); await tx('readwrite', (s) => s && s.put(p)); notify(); }
  async function outboxAll() { const r = await tx('readonly', (s) => s && s.getAll()); return Array.isArray(r) ? r : [...mem.values()]; }
  async function outboxDel(id) { mem.delete(id); await tx('readwrite', (s) => s && s.delete(id)); notify(); }

  // ---- upload
  async function send(p) {
    if (!CFG.TESTLOG_URL) return 'no-endpoint';
    const { _status, ...clean } = p;
    const body = JSON.stringify(clean);
    try {
      const r = await fetch(CFG.TESTLOG_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
      const j = await r.json().catch(() => null);
      if (j && j.ok) return 'sent';
      if (j && j.error) return 'rejected';
    } catch { /* not readable (CORS) or offline */ }
    if (!navigator.onLine) return 'offline';
    try {   // the script dedupes by run id, so a second copy is harmless
      await fetch(CFG.TESTLOG_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
      return 'unconfirmed';
    } catch { return 'offline'; }
  }
  let flushing = false;
  async function flush() {
    if (flushing) return; flushing = true;
    try {
      const items = (await outboxAll()).filter((p) => p._status === 'pending');
      for (const p of items) {
        const res = await send(p);
        if (res === 'sent') await outboxDel(p.run.id);
        else if (res === 'unconfirmed') { p._status = 'unconfirmed'; await outboxPut(p); }
        else break;                                     // offline, no endpoint or rejected: keep for later
      }
    } finally { flushing = false; notify(); }
  }
  async function counts() {
    const all = await outboxAll();
    return { pending: all.filter((p) => p._status === 'pending').length, unconfirmed: all.filter((p) => p._status === 'unconfirmed').length, total: all.length };
  }
  async function exportFile() {
    const items = await outboxAll();
    if (!items.length) return 'empty';
    const name = `modmap-web-${tester ? tester.code : 'tester'}-${iso().slice(0, 16).replace(/[-:T]/g, '')}.json`;
    const blob = new Blob([JSON.stringify({ schema: 'modmap-web-test-bundle/1', platform: 'web', exported_at: iso(), items })], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'MOD MAP test data' }); return 'shared'; } catch { /* cancelled: fall through */ }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return 'downloaded';
  }

  function notify() { for (const f of listeners) try { f(); } catch { /* ignore */ } }
  window.addEventListener('online', flush);
  setTimeout(flush, 3000);

  return {
    decided: () => !!(tester && tester.decided), on, tester: () => tester, decide, reset, newCode, setCensus, setStepLength,
    stepLength: () => (tester && tester.step_len ? tester.step_len.L : null), height: () => (tester ? tester.height_cm : null),
    stepHz: () => (tester && tester.step_len && tester.step_len.hz) || null,      // steps a second during the calibration walk (web-0.4.0 on)
    startRun, active, event, tap, addPhoto, summary, recStart, endRun, flush, counts, exportFile,
    onChange: (f) => listeners.push(f), endpoint: () => !!CFG.TESTLOG_URL,
  };
})();
