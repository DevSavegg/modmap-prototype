# MOD MAP prototype

A clickable web prototype of MOD MAP, KMUTT's indoor and outdoor navigation app (SE Team G9). It is built from the team's Figma design for user testing.

**Live:** https://devsavegg.github.io/modmap-prototype/

## What testers can do

- **Search** by room code (SCL607, CB2405), nickname (Slope600) or building (N7, LX, KFC), or browse the building categories.
- **See a room** on the campus map, or on the schematic floor plan (N7 floors 2 and 6).
- **Get a route** from where they are, across campus, to the N7 entrance, up the lift and along the corridor to the room door.
  - The "avoid sun and rain" route is a **labelled concept mock**: there is no covered-walkway data yet.
- **Navigate** in one of two modes:
  - **Simulation:** the dot walks the route at ×1 to ×16 speed, so testers can sit and click through.
  - **Real walk:** GPS outdoors. Indoors, the **browser tracker** (`motion.js`) moves the dot by itself: steps from the accelerometer, turns from the gyroscope.
    - **It is route-constrained,** a first version of the architecture's position tracker. The dot moves along the planned route, and a detected turn snaps it to the route's nearest corner.
    - **Browsers have no barometer,** so the floor is a tap ("ถึงชั้น 6 แล้ว").
    - **"ถัดไป" stays as a manual correction.** If the phone gives no motion data, it is the method.
    - **Arrival:** when the tracker reaches the door, the app asks "ถึงแล้วใช่ไหม?". The tester can also tap "ฉันถึงหน้าห้องแล้ว" at any time. Either answer is the ground truth for the tracker's error.
      - If a sign photo puts the tester at the destination door, the app asks at once. That arrival is logged, but not counted as a tracker error.
- **Recover a lost position** by photographing the nearest room sign. The app finds the room code and re-plans from that door. Two OCR layers run on the phone:
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

## Limitations (on purpose, for a one-day prototype)

- **Floors:** they are schematic. Room boxes, the corridor and door positions come from our data, but no walls traced from the blueprints are published.
- **Indoor coverage:** only N7 floors 2 and 6 have floor plans. Other rooms route to their building's entrance and then name the floor.
- **Entrances:** each one is the nearest campus path to the building outline, except N7's, which the team marked on site (south side).
- **The browser tracker** assumes the tester follows the route; it is not yet the full particle filter. Its step and turn thresholds are untested on real phones.
- **Ground floor:** N7 floor 1 isn't converted yet, so the route says "take the lift" at the entrance.
- **First OCR use:** it needs internet once, to download the OCR engine (a few MB) from jsDelivr.

## Data and licences

- `data/campus.json`: an extract of OpenStreetMap data, © OpenStreetMap contributors, under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- `data/n7.json` and the room entries in `data/places.json`: the team's own N7 data, published here in simplified form only.
- `icons/`: from the team's Figma design.
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
