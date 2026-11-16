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
  - **Real walk:** GPS outdoors. Indoors, the tester taps *next* at each step, because phones and browsers can't get a live indoor position.
- **Recover a lost position** by photographing the nearest room sign. The app reads it with Tesseract.js OCR, on the phone, and re-plans from that door. Typing the room number is the fallback.
  - In simulation mode, "use a sample sign" generates a sign image and runs the same OCR on it.

The welcome screen has three test scenarios. They are listed in `SCENARIOS` at the top of `app.js`; edit the text there. Paste the Google Form link into `FEEDBACK_URL` in the same place to show the feedback button.

## Limitations (on purpose, for a one-day prototype)

- **Floors:** they are schematic. Room boxes, the corridor and door positions come from our data, but no walls traced from the blueprints are published.
- **Indoor coverage:** only N7 floors 2 and 6 have floor plans. Other rooms route to their building's entrance and then name the floor.
- **Entrances:** each one is the nearest campus path to the building outline. The N7 entrance is approximate.
- **Ground floor:** N7 floor 1 isn't converted yet, so the route says "take the lift" at the entrance.
- **First OCR use:** it needs internet once, to download the OCR engine (a few MB) from jsDelivr.

## Data and licences

- `data/campus.json`: an extract of OpenStreetMap data, © OpenStreetMap contributors, under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- `data/n7.json` and the room entries in `data/places.json`: the team's own N7 data, published here in simplified form only.
- `icons/`: from the team's Figma design.
- Leaflet 1.9.4 (BSD-2), Tesseract.js 5.1.1 (Apache-2.0), and the Kanit and Prompt fonts (OFL) all load from public CDNs.

## Rebuild the data

```bash
python tools/build_data.py <overpass_campus_raw.json> <path-to/N7-Pilot/data>
```

## Run locally

```bash
python -m http.server 8765
```
