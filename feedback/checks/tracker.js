/* Before/after check for T1-S8, T1-S9 and T1-S10 (the indoor tracker in real walk mode).

   It replays two simulated walks from the floor-6 lift to SCL607 through the build's own tracker, feeding it steps and turns
   the way the phone's motion sensors would. The walker is slow, reading the phone: 0.55 m steps, 1.55 steps a second.
   The app doesn't know that; with no calibration walk and no height it starts from its default step length.
   A. Pressed late: after the lift ride (30 s, no steps) the walker steps out, turns into the corridor after 6 steps, and only
      presses "ถึงชั้น 6 แล้ว" after 9 steps. Then they walk on to the door.
   B. Pressed at the lift: the walker presses "ถึงชั้น 6 แล้ว" before stepping out, turns into the corridor after 6 steps,
      and walks on to the door.
   Measured along the route: where the dot starts against the walker, whether the dot went round the corner before the phone
   turned, and how far ahead of the walker the dot got. Nothing is logged or uploaded.

   Run it in the browser console on either build, after the welcome screen has loaded:
     before: https://devsavegg.github.io/modmap-prototype/v/web-0.3.1/   → eval(await (await fetch('../../feedback/checks/tracker.js')).text())
     after:  https://devsavegg.github.io/modmap-prototype/              → eval(await (await fetch('feedback/checks/tracker.js')).text())
   It prints a table; reload the page afterwards. */
(async () => {
  if (window.MM_CONFIG) window.MM_CONFIG.TESTLOG_URL = '';            // never upload from a desk check
  navigator.geolocation.watchPosition = () => 1; navigator.geolocation.clearWatch = () => {};
  const isNew = typeof floorLeg === 'function';
  const L_TRUE = 0.55, GAP_MS = 645, RIDE_MS = 30000, TURN_AFTER = 6;
  const leg = () => (isNew ? curSeg() : NAV.r.inn);

  function walk(pressAfter) {             // pressAfter: steps taken out of the lift before pressing the floor button
    S.mode = 'real'; S.scenario = null; S.origin = { type: 'me' };
    if (isNew) { S.startIn = { floor: '2' }; S.me = BYID.N7.c.slice(); }   // new build: a route that starts with the lift to floor 6
    else S.me = startPointOf('N7');                                            // old build: from the N7 entrance, straight to the lift
    const r = planRoute(BYID['N7-607'], 'fast'), p0 = performance.now();
    startNav(r);
    let t = RIDE_MS, sTrue = 0, n = 0, pressed = false, turned = false, startErr = null, aheadMax = 0, cornerEarly = 0, dotAtDoorWalkerAt = null;
    const step = () => { n++; sTrue += L_TRUE; t += GAP_MS; onStep({ t: p0 + t, peak: 2, n }); };
    const turn = () => { turned = true; onTurn({ t: p0 + t + 300, deg: 90, dur: 900 }); };
    const press = () => { pressed = true; liftDone(p0 + t + 200); startErr = NAV.s - sTrue; };
    // out of the lift, maybe before pressing
    for (let k = 0; k < pressAfter; k++) { step(); if (n === TURN_AFTER) turn(); }
    press();
    const g = leg(), corner = g.steps.find((x) => x.icon === 'left' || x.icon === 'right').s0, end = g.len;
    for (let k = 0; k < 200 && NAV.phase === 'in' && sTrue < end + 3; k++) {
      if (!turned && n === TURN_AFTER) turn();
      step();
      if (!turned) cornerEarly = Math.max(cornerEarly, NAV.s - corner);       // the dot past the corner while the phone hasn't turned
      if (sTrue <= end) aheadMax = Math.max(aheadMax, NAV.s - sTrue);
      if (dotAtDoorWalkerAt == null && NAV.s >= end - 1.0) dotAtDoorWalkerAt = sTrue;
    }
    const row = {
      build: window.MM_CONFIG.APP_VERSION,
      walk: pressAfter ? `A. pressed after ${pressAfter} steps out of the lift` : 'B. pressed at the lift',
      'route m': +end.toFixed(1),
      'dot start vs walker m': +startErr.toFixed(1),
      'dot round the corner before the turn m': cornerEarly > 0.3 ? +cornerEarly.toFixed(1) : 'no',
      'dot most ahead of walker m': +aheadMax.toFixed(1),
      'walker still this far from the door when the dot got there m': dotAtDoorWalkerAt == null ? 'never' : +Math.max(0, end - dotAtDoorWalkerAt).toFixed(1),
    };
    stopNav(); NAV.r = null;
    return row;
  }
  const rows = [walk(9), walk(0)];
  if (isNew) S.startIn = null;
  goHome();
  console.table(rows);
  return rows;
})();
