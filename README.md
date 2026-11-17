# MOD MAP prototype

A clickable web prototype of MOD MAP, KMUTT's indoor and outdoor navigation app (SE Team G9). It is built from the team's Figma design for user testing.

**Live:** https://devsavegg.github.io/modmap-prototype/

## What testers can do

- **Search** by room code (SCL607, CB2405), nickname (Slope600) or building (N7, LX, KFC), or browse the building categories.
- **See a room** on the campus map, or on the schematic floor plan of any N7 floor (B and 1–10).
- **Pick a place on the map:**
  - Tap a building to open it, or tap anywhere else to drop a pin and route to it.
  - On a floor plan, tap a room.
- **Get a route** from where they are, across campus, into N7 at the main entrance on the ground floor, to the lift, and along the destination floor's corridor to the room door.
  - **Already inside N7:** when GPS puts the tester at the building, the app asks whether they are inside and on which floor, and starts there. A room picked as the starting point starts at its door.
  - **Several doors:** a room with several doors is routed to the one nearest the way in.
  - **Concept mock:** the "avoid sun and rain" route is labelled as a concept mock, because there is no covered-walkway data yet.
- **Navigate** in one of two modes. A route is walked in segments: campus paths, then one floor at a time, with the lift in between. The map shows the floor the tester is on, and during navigation it turns so the way ahead points up.
  - **Turning the map:** the compass button switches to a fixed map. Outdoors, the marker also shows where the phone points.
  - **Simulation:** the dot walks the route at ×1 to ×16 speed, so testers can sit and click through.
  - **Real walk, outdoors:** GPS fixes are filtered along the route.
    - The filter is one-dimensional, matched only near the current progress, and stray fixes are dropped.
    - Steps carry the marker between fixes.
    - The app switches to indoors when a fix agrees that the tester is at the entrance.
  - **Real walk, indoors:** the **browser tracker** (`motion.js`) moves the dot by itself, with steps from the accelerometer and turns from the gyroscope.
    - **Route-constrained:** this is a first version of the architecture's position tracker. The dot moves along the planned route and waits at each corner until the phone turns there.
    - **Step length:** each step's length follows the walking pace.
    - **Walking out of the lift:** steps taken before "ถึงชั้น … แล้ว" is pressed are counted.
    - **Browsers have no barometer,** so the floor is a tap ("ถึงชั้น 6 แล้ว").
    - **"ถัดไป" stays as a manual correction.** If the phone gives no motion data, it is the method.
    - **Arrival:** when the tracker reaches the door, the app asks "ถึงแล้วใช่ไหม?". The tester can also tap "ฉันถึงหน้าห้องแล้ว" at any time. Either answer is the ground truth for the tracker's error.
      - If a sign photo puts the tester at the destination door, the app asks at once. That arrival is logged, but not counted as a tracker error.
- **Recover a lost position** by photographing the nearest room sign. The camera opens inside the page, with a frame to aim at and a hint; if the browser can't do that, the phone's camera opens instead. The app finds the room code and re-plans from that door. Two OCR layers run on the phone:
  1. **Tesseract.js 5.1.1:** Latin letters and digits, tried on the photo as taken and inverted.
  2. **[OpenThai2.0-OCR-Text](https://huggingface.co/iapp/OpenThai2.0-OCR-Text)** (iApp, Apache-2.0, about 4 MB): runs only when Tesseract finds no room code. It is ported to the browser in `openthai.js` with onnxruntime-web: detector, line boxes, then the CTC recognizer. Unlike the original runtime, its line boxes are axis-aligned.

  Typing the room number is the last fallback. In simulation mode, "use a sample sign" generates a sign image and runs the same OCR on it.

  Each attempt is logged on the phone: what each engine read, and which room it matched. Open the log from the welcome screen ("บันทึกการอ่านป้าย"). Use it to measure the hit rate on real N7 sign photos.

  After a sign is read, the tester confirms the room ("อ่านป้ายได้ว่า SCL608 ถูกต้องไหม?"), so a misread never moves the dot and every attempt has a right/wrong label. If the photo shows several room numbers, such as a range sign reading "601-607", the tester picks the room they are standing at instead.
- **Measure their step length:** a 1-minute calibration walk on N7 floor 6, from the corridor at the central lift lobby to the west stair door (53.2 m). The result is used for the tester's later navigation only if at least 60 steps were counted and the step length fits the tester's height: 0.33–0.48 × height, or 0.45–0.85 m when no height was given. Otherwise the app asks for the walk again.

The welcome screen has three test scenarios. They are listed in `SCENARIOS` at the top of `app.js`; edit the text there. Settings the team changes, such as the test-data address, are in `config.js`. Tester feedback is collected by interview, so there is no feedback form. Note each tester's code from the welcome screen with the interview notes, to match them to the logged runs.

## Test data (labelled `web`)

- **Notice first:** the first screen tells testers that anonymous usage data is collected (KMUTT needs no consent form for this project, 16 Nov). It shows a tester code (generated, editable) and asks for an optional height, which predicts step length. If the phone refuses the motion sensors, the app explains how to allow them and offers a retry. (iPhone Safari asks for them, and so does Chrome on Android from about version 157.) The welcome screen keeps a "เปิดเซนเซอร์" link until they are allowed. Testers who tap "ไม่ต้องการให้เก็บข้อมูล" can use the app with nothing logged.
- **What a run is:** one scenario, one free navigation or one calibration walk. Each finished run is saved in the phone's outbox (IndexedDB), then sent to the team's Google Apps Script (`TESTLOG_URL` in `config.js`; deploy steps in [tools/apps-script/README.md](tools/apps-script/README.md)).
- **If sending fails:** runs stay in the outbox and are retried when the app opens or goes online. "ส่งไฟล์ข้อมูลการทดสอบที่ค้างอยู่" on the welcome screen shares them as a file.
- **What's logged:**
  - the phone and browser census: OS, browser, motion rate, gyroscope yes/no, motion permission;
  - screens, searches, taps and task times;
  - GPS fixes outdoors, plus steps against GPS distance (step-length calibration);
  - raw accelerometer and gyroscope during real walks, plus steps and turns;
  - lift taps, arrival answers, corrections, and the tracker's error at the door;
  - sign-reading results with the tester's yes/no;
  - sign photos only if the tester ticked the box.
- **Kept apart:** it is all browser data (about 60 Hz, no barometer), so it is stored separately from Sensor Logger and native-app data and never mixed into Gates P and G.
- **Never in this public repo.**

## Feedback from user tests

- **Register:** [feedback/README.md](feedback/README.md) lists every item from the user tests, with an ID such as `T1-S4`. Each item gives the decision, the commits that act on it (`git log --grep T1-S4`) and a before/after check.
- **Before build:** the build before the round-1 changes stays online at [/v/web-0.3.1/](https://devsavegg.github.io/modmap-prototype/v/web-0.3.1/), for side-by-side tests on phones.
- **Desk checks:** [feedback/checks/](feedback/checks/) holds scripts that replay the same simulated walks through either build.

## Limitations (on purpose, for a one-day prototype)

- **Floors:** they are schematic. Room boxes, the corridor and door positions come from our data, but no walls traced from the blueprints are published.
- **Indoor coverage:** every N7 level has a plan.
  - Floors 2 and 6 were checked against the blueprints by three reviewers.
  - The other nine are automatic drafts from the same blueprints, waiting for a site check (`N7-Pilot/data/map/ALL_FLOORS_QA.md`).
  - Other buildings route to their entrance and then name the floor.
- **Entrances:** each one is the nearest campus path to the building outline, except N7's, which the team marked on site (south side).
- **The browser tracker** assumes the tester follows the route; it is not yet the full particle filter. Its step, turn and pace settings are untested on real phones.
- **No compass indoors:** the floor plans' true north isn't set yet, so indoors the map follows the route, not the compass.
- **First OCR use:** it needs internet once, to download the OCR engine (a few MB) from jsDelivr.

## Data and licences

- `data/campus.json`: an extract of OpenStreetMap data, © OpenStreetMap contributors, under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- `data/n7.json` and the room entries in `data/places.json`: the team's own N7 data, published here in simplified form only.
- `icons/`: from the team's Figma design. `location-on*.svg` and `schedule.svg` are Material Symbols icons by Google (Apache-2.0).
- `models/openthai/`: unchanged copies of OpenThai2.0-OCR-Text's `det.onnx`, `rec.onnx` and `rec_dict.txt`, under Apache-2.0 (see `NOTICE` and `LICENSE.txt` there). onnxruntime-web 1.19.2 (MIT) loads from jsDelivr.
- Leaflet 1.9.4 (BSD-2), Tesseract.js 5.1.1 (Apache-2.0), and the Kanit and Prompt fonts (OFL) all load from public CDNs.

## Rebuild the data

```bash
python tools/build_data.py <overpass_campus_raw.json> <path-to/N7-Pilot/data>
```

## Run locally

```bash
python -m http.server 8765
```

## Releasing

- **Version:** set `APP_VERSION` in `config.js`, and the same value in the `?v=` of every local file in `index.html`.
- **Why both:** GitHub Pages lets browsers cache files for about 10 minutes. A new `?v=` makes a phone load the new set together instead of mixing new and old files. The data files take their `?v=` from `APP_VERSION`.
