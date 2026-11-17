/* Before/after check for T1-S4, T1-S5, T1-S6 and T1-D1 (routes into and inside N7).

   It plans the same trips in the build it runs in, walks each one in simulation (at ×16, pressing "ถึงชั้น … แล้ว" when the
   lift card shows), and reports how much of the route is outdoors and what the map shows at each stage:
   A. a tester already inside N7 on floor 2 asks for SCL607. In the new build they answer "ชั้น 2" when asked whether they
      are inside; the old build has no such question.
   B. a tester at the car park (S2, scenario 2) asks for SCL607.
   C. the indoor distance from the floor-6 lift to SCL607, a room with two corridor doors.
   Nothing is logged or uploaded.

   Run it in the browser console on either build, after the welcome screen has loaded:
     before: https://devsavegg.github.io/modmap-prototype/v/web-0.3.1/   → eval(await (await fetch('../../feedback/checks/routes.js')).text())
     after:  https://devsavegg.github.io/modmap-prototype/              → eval(await (await fetch('feedback/checks/routes.js')).text())
   It prints a table; reload the page afterwards. */
(async () => {
  if (window.MM_CONFIG) window.MM_CONFIG.TESTLOG_URL = '';            // never upload from a desk check
  navigator.geolocation.watchPosition = () => 1; navigator.geolocation.clearWatch = () => {};
  const isNew = typeof floorLeg === 'function';
  const outM = (r) => Math.round(r.segs ? r.segs.filter((s) => s.type === 'out').reduce((t, s) => t + s.len, 0) : r.out.len);
  const lastIn = (r) => (r.segs ? [...r.segs].reverse().find((s) => s.type === 'in') : r.inn);
  function stages(r) {                      // walk it in simulation, 2 m at a time; note what the map shows each time that changes
    S.mode = 'sim'; startNav(r); clearInterval(NAV.timer); NAV.timer = 0;   // stepped here, not by the timer
    const seen = []; let last = '';
    for (let k = 0; k < 5000; k++) {
      const now = NAV.phase === 'done' ? 'arrived' : `${$('#fmap').hidden ? 'campus map' : `floor ${S.viewFloor}`}${$('#liftcard').hidden ? '' : ' + lift card'}`;
      if (now !== last) { seen.push(now); last = now; }
      if (NAV.phase === 'done') break;
      if (NAV.phase === 'lift') liftDone(); else advance(2);
    }
    stopNav(); NAV.r = null;
    return seen.join(' → ');
  }
  S.scenario = null; S.origin = { type: 'me' };
  const rows = [];
  // A. inside N7 on floor 2 (GPS puts the tester in the building)
  S.me = BYID.N7.c.slice(); S.meSrc = 'gps'; S.acc = 15;
  if (isNew) S.startIn = { floor: '2' };
  let r = planRoute(BYID['N7-607'], 'fast');
  rows.push({ build: window.MM_CONFIG.APP_VERSION, trip: 'A. inside N7, floor 2 → SCL607', 'outdoor part m': outM(r), 'the map shows, in order': stages(r) });
  // B. from the car park
  S.startIn = null; S.me = startPointOf('S2'); S.meSrc = 'set';
  r = planRoute(BYID['N7-607'], 'fast');
  rows.push({ build: window.MM_CONFIG.APP_VERSION, trip: 'B. S2 car park → SCL607', 'outdoor part m': outM(r), 'the map shows, in order': stages(r) });
  // C. floor 6, lift → SCL607
  rows.push({ build: window.MM_CONFIG.APP_VERSION, trip: 'C. floor-6 lift → SCL607', 'indoor m': +lastIn(r).len.toFixed(1) });
  goHome();
  console.table(rows);
  return rows;
})();
