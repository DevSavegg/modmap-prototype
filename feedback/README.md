# User-test feedback register

Every piece of feedback gets an ID, and every change made because of it says which ID it answers. Then you can check two things for each item: what changed in the code, and how the app behaves before and after.

## How it works

- **IDs:** `T<round>-<kind><n>`. For example, `T1-S4` is round 1, system item 4.
  - `U`: UI/UX feedback.
  - `S`: system feedback.
  - `D`: something found in the test logs.
  - `R`: a request from the lead.
- **Commits:**
  - Every commit that acts on an item starts its subject with the item's ID or IDs, and ends with a trailer such as `Feedback: T1-S4, T1-S5`.
  - `git log --grep "T1-S4"` lists every commit for an item. `git show <commit>` shows the exact change.
- **Before and after:**
  - **Tags:** `web-0.3.0` is the build the testers used. `web-0.3.1` is the last build before this work, and it is the "before" for round 1. `git diff web-0.3.1 main` shows everything that changed since.
  - **On a phone:** the "before" build stays online at `/v/web-0.3.1/`, and the "after" build is the main site. Both log their test runs labelled with their own version, so a tester can walk the same route with each and the logs compare directly.
    - Before: https://devsavegg.github.io/modmap-prototype/v/web-0.3.1/
    - After: https://devsavegg.github.io/modmap-prototype/
  - **At a desk:** each item below lists a check that runs the same inputs through both builds, and the result measured when the change was made. The check scripts are in [`checks/`](checks/).

## Round 1: 16 Nov 2026 (build web-0.3.0)

**Sources:**
- The team's write-up of the test ("prototype test", 17 Nov).
- The lead's notes (17 Nov).
- The 34 logged runs from 9 testers.

**Decision (lead, 17 Nov):**
- The professor asked for a real user test and feedback, and left it to the team which feedback to apply.
- This round acts on the system items and the log findings, not on the UI/UX items.
- Separately, the UI is brought in line with the team's Figma design (T1-R2).

| ID | Feedback (short) | Source | Decision | Commits |
|---|---|---|---|---|
| T1-S1 | The marker wobbles and doesn't follow the road | write-up | fix | see `git log --grep T1-S1` |
| T1-S2 | The marker freezes in places, e.g. by the N7 bridge | write-up | fix | see `git log --grep T1-S2` |
| T1-S3 | The marker jumps ahead or runs faster than the user, and the app "arrived" early | write-up | fix | see `git log --grep T1-S3` |
| T1-S4 | Starting inside the building, the route goes out and back in | write-up, lead | fix | pending |
| T1-S5 | Walking into the building shows floor 6 and the lift step at once, not the floor the tester is on | write-up, lead | fix | pending |
| T1-S6 | The position shows on a floor the tester isn't on | write-up | fix | pending |
| T1-S7 | Indoor GPS is unreliable; unclear if it's GPS or the routing | write-up | fix | pending |
| T1-S8 | After "ถึงชั้น 6 แล้ว" (reached floor 6), the dot starts nearer the lift lobby than the tester really is | lead | fix | pending |
| T1-S9 | Indoors, the dot moves faster than the tester | lead | fix | pending |
| T1-S10 | The dot turns the corner before the tester (phone) has turned | lead | fix | pending |
| T1-S11 | The camera opens with no explanation, and testers didn't know what to photograph | write-up | fix | pending |
| T1-S12 | Testers want to tap the map to pick a place or drop a pin | write-up | add | pending |
| T1-S13 | The map and marker don't turn with the tester's heading | write-up (already planned) | add | pending |
| T1-D1 | Every arrival at SCL607 came 5–16 m before the route's end | test logs | fix | pending |
| T1-D2 | A partial calibration walk was accepted (0.95 m steps) | test logs | fixed | 6d3689a |
| T1-D3 | A range sign ("601-607") was read as one room | test logs | fixed | 6d3689a |
| T1-D4 | A sign photo at the destination counted as tracker error | test logs | fixed | 6d3689a |
| T1-D5 | The "lost" log entry marked manual presses as automatic | test logs | fixed | 6d3689a |
| T1-D6 | A tester who refused the motion sensors had no way back | test logs | fixed | 6d3689a |
| T1-U1 | The lift buttons give no sign they were pressed, so testers pressed again | write-up | not this round | none |
| T1-U2 | Too much empty space at the top in a browser | write-up | not this round | none |
| T1-U3 | The quick-search chips read as "most searched" | write-up | not this round | none |
| T1-U4 | "เส้นทาง" (Route) and "เริ่มนำทาง" (Start navigation) look like the same thing | write-up | not this round | none |
| T1-U5 | The route-type icons are unclear | write-up | not this round | none |
| T1-U6 | The header and buttons are too large for a phone | write-up | not this round | none |
| T1-U7 | The X button cancels navigation, but looks like "close" | write-up | not this round | none |
| T1-U8 | No how-to guide | write-up | not this round | none |
| T1-R1 | Add every N7 floor | lead | do | pending |
| T1-R2 | Match the in-app UI to the Figma design | lead | do | pending |

### Details

Each item gives what was reported, the cause found, the change made, and the before/after check.

#### T1-S1, T1-S2, T1-S3: outdoor marker
- **Reported:** the marker wobbles and leaves the road; it sticks in places, e.g. by the N7 bridge; it jumps ahead of the tester; the app "arrived" while the tester was still at a bend.
- **Cause (web-0.3.1):**
  - The marker was drawn at each raw GPS fix, so it showed all of GPS's scatter.
  - The progress along the route was the closest point anywhere on the route. It could only move forward, and up to 60 m per fix. So one bad fix near a later part of the route moved it ahead for good, and it then sat there until the tester caught up.
  - Nothing moved the marker between fixes. Under the bridge, where fixes stop, it froze.
  - Arrival at the entrance needed only that progress to be within 15 m of the end.
- **Change:**
  - **Filtered progress:** the progress along the route is a one-dimensional Kalman filter.
    - Steps move it between fixes. Without motion sensors, it keeps moving at the last speed for up to 15 s.
    - A fix is matched to the route only from 40 m behind to 70 m ahead of the current progress.
    - A fix that disagrees by much more than its stated accuracy, or lies far off the path, is dropped, unless three in a row agree.
  - **Marker:** it is drawn on the route at that progress. It leaves the route only after three off-path fixes in a row, and the map glides to it instead of jumping.
  - **Entering the building:** the app switches to indoors only when the filtered progress is within 4 m of the entrance and a fresh fix is within 20 m of it. If GPS is lost (no usable fix for 20 s), steps alone can carry the tester to the door.
  - **Logs:** each `gps` entry now also records the filtered progress (`sf`), the progress matched near the walker (`sw`), the distance from the path (`d`), and whether the fix was used, with the reason if not.
- **Check:** [`checks/gps.js`](checks/gps.js) replays one simulated walk with seed 7, on the scenario-2 route from S2 to SCL607 (405 m), including 25 s with no fixes.

  | Measure | Before (web-0.3.1) | After, step counter on | After, no motion sensors |
  |---|---|---|---|
  | Marker error, mean / 95th percentile | 9.1 / 31.8 m | 2.8 / 6.2 m | 4.3 / 10.4 m |
  | Marker off the path, mean | 4.6 m | 0 m | 0 m |
  | Most ahead of / behind the walker | 46 / 65 m | 6 / 8 m | 7 / 20 m |
  | Longest freeze while walking | 22.5 s | 0 s | 8 s |
  | Switched to indoors | 33 m before the door | 1.1 s after reaching it | 1.6 s after reaching it |

- **Limits:**
  - This is a simulated walk, and the GPS error model is an assumption.
  - The next walking test should compare both builds on the same route. The new log fields show what the filter did with each fix.
  - Without motion sensors, a gap of more than 15 s still freezes the marker for the rest of the gap.

#### T1-S4 to T1-S7: indoor routing and floors
- **Reported:** starting inside the building gives a route out of the building and back in. Walking in shows floor 6 and the lift step straight away, and the dot sits on a floor the tester isn't on.
- **Cause (web-0.3.1):**
  - Every route started outdoors, at the campus path nearest the GPS fix.
  - The indoor part was one leg on the destination floor, starting in the lift. So at the entrance the app jumped straight to that floor and the lift step.
  - The app had no ground floor, so it couldn't show anything else.
- **Change:** a route is now a list of segments, walked in order: outdoors, one floor at a time, and the lift between floors.
  - **Inside already:** when GPS puts the tester at N7, the app asks whether they are inside and on which floor. The route then starts at that floor's lift lobby, with no outdoor part. Picking a room in N7 as the starting point starts at that room's door.
  - **Entering:** with a plan of the entrance floor (T1-R1), the map shows that floor from the entrance to the lift. The lift card appears at the lift, still on the floor the tester is on. The destination floor appears only after "ถึงชั้น … แล้ว".
  - **Dot:** it is drawn only on the floor the tester is on. Viewing another floor from the floor menu hides it.
  - **Indoor GPS (T1-S7):** fixes are ignored indoors, as before, but the switch to indoors now happens at the door (T1-S3), not 15–33 m before it. A start inside is set by the tester's answer, not by indoor GPS.
  - **Logs:** a `segment` entry marks the start of each segment, and `start_inside` records the tester's answer.
- **Check:** [`checks/routes.js`](checks/routes.js) plans the same trips in either build and walks them in simulation, recording what the map shows at each stage.

  | Trip | Before (web-0.3.1) | After |
  |---|---|---|
  | A. Inside N7 on floor 2, to SCL607 | 12 m outdoors first. The map shows the campus, then floor 6 + lift card, then floor 6 | No outdoor part. The map shows floor 2 + lift card, then floor 6 |
  | B. From the S2 car park to SCL607 | The campus, then floor 6 + lift card at the entrance | See T1-R1: with the ground-floor plan, the campus, then floor 1 to the lift, then floor 6 |

#### T1-S8, T1-S9, T1-S10, T1-D1: indoor tracker
- **Reported:**
  - After "ถึงชั้น 6 แล้ว", the dot starts nearer the lift than the tester is.
  - The dot then runs faster than the tester.
  - It turns the corner before the tester turns.
  - In the logs, every arrival at SCL607 came 5–16 m before the route's end.
- **Cause (web-0.3.1):**
  - Steps were counted only after the floor button. Steps a tester took walking out of the lift before tapping it were lost.
  - The dot followed the route's polyline by distance alone, so it went round a corner as soon as the step count got there.
  - A turn anywhere within a wide window snapped the dot forward to a corner.
  - Indoors, the step length was the outdoor (or height-based) one, but testers walk slowly while reading the phone. One tester took 30 steps in 21.6 s (1.4 steps a second), so each step was shorter than outdoors.
  - **T1-D1:** room N7-607 (SCL607) has two corridor doors, at x = 39.0 m and x = 51.0 m. The data build kept only the first, so routes from the lift went to the far door: 27.2 m instead of 15.2 m.
- **Change (T1-S8, T1-S9, T1-S10):**
  - **Walking out before tapping:** steps taken while the lift card shows are counted.
    - When "ถึงชั้น … แล้ว" is pressed, the steps since the last pause of 6 s or more (waiting for or riding the lift) are credited, up to 12 m. This applies only if the tester was still walking when they pressed.
    - A turn in that time means the first corner has already been taken.
  - **Corners:** the dot waits at a corner until the phone turns (a gyroscope turn of 50° or more) or the tester taps "ถัดไป" (next).
    - A turn counts only as the next corner: when the dot is waiting at it, or is within 4 m, or 35 % of the distance since the last corner, before it.
    - Before, any corner within a wide window could be snapped to.
  - **Step length:** each indoor step uses the reference length scaled by the current pace, within 0.7–1.1×.
    - The current pace is the median of the last 8 gaps between steps.
    - The reference pace depends on where the length came from: the calibration walk's own pace (now saved with it), the outdoor walk's pace, or 1.8 steps a second for the height estimate.
  - **Logs:**
    - each `step` entry records the length used, the pace, and whether the dot is waiting at a corner;
    - `lift_exit` records the credited walk-out;
    - `corner_hold` marks a wait at a corner;
    - the run summary adds `pace_hz` and `step_len_now`.
- **Change (T1-D1):** a room with several corridor doors is routed to the door nearest the way in. The code is in the routing commit; the data lists every door from T1-R1 on.
- **Check:** [`checks/tracker.js`](checks/tracker.js) replays two simulated walks from the floor-6 lift to SCL607.
  - The walker is slow: 0.55 m steps, 1.55 steps a second.
  - The app knows neither, so it starts from its default 0.68 m step.

  | Measure | Before (web-0.3.1) | After |
  |---|---|---|
  | A. Pressed after 9 steps out of the lift: where the dot starts | 4.9 m behind the walker | 0.3 m ahead |
  | B. Pressed at the lift: dot went round the corner before the phone turned | yes, by 0.9 m | no |
  | B. Most the dot got ahead of the walker | 4.8 m | 1.8 m |
  | B. Walker's distance from the door when the dot got there | 5.2 m | 2.4 m |
  | A. Walker's distance from the door when the dot got there | 0.8 m | 2.4 m |

  In walk A the old build ends closer only by chance: it started 4.9 m behind, and its too-long steps made up the gap.
- **Limits:**
  - These are simulated walks.
  - The pace model (step length proportional to pace, within 0.7–1.1×) is an assumption. Test it against the next walking test: its logs record the pace and length of every step.
  - The numbers above use the 27.2 m route to SCL607. With the nearest door (T1-D1) the route is 15.2 m.

#### T1-S11: sign photo
- **Reported:**
  - The camera opened at once with no explanation. Testers were startled and thought the app had frozen or crashed.
  - They didn't know what or where to photograph.
  - Suggestion: show the camera inside the page.
- **Cause (web-0.3.1):** "เปิดกล้อง" (open camera) in the lost-position dialog opened the phone's own camera app through a file input. Testers left the page, and the only guidance was the dialog's one line.
- **Change:**
  - **In-page camera:** it shows a frame to aim at and the hint "ถ่ายป้ายเลขห้องที่อยู่ใกล้คุณที่สุด ให้เลขห้องอยู่ในกรอบ" (photograph the nearest room-number sign, with the number in the frame).
    - An example line: "เช่น ป้าย SCL607 ที่ติดข้างประตูห้อง" (e.g. the SCL607 sign beside the door).
    - Controls: a shutter button, ✕ back to the dialog, and "เลือกรูปจากเครื่องแทน" (pick a photo instead).
  - **What gets read:** only a band around the frame, across the whole visible width, so a long room number isn't cut off.
  - **Fallback:** if the page can't use the camera (no permission, or an in-app browser), it falls back to the phone's camera as before, with a short notice.
  - **Logs:** `camera` records whether the in-page camera opened and why not; `camera_close` records the ✕. Sign readings from it are labelled `camera`.
- **Check:** this is a flow, so the check is a description, not a number.
  - Before: "เปิดกล้อง" leaves the page for the camera app.
  - After: the page shows its own camera view.
  - Desk test: with a simulated upright phone camera, the photo was cropped to the band, read as SCL604, and the app asked for confirmation.
- **Limits:**
  - Not yet tried on real phones. iPhone Safari needs `playsinline`, which is set. LINE and Facebook in-app browsers may refuse the camera and fall back.
  - The dialog's own wording comes from the Figma design and is unchanged here.

#### T1-S12: pick a place on the map
- **Reported:** testers wanted to tap the map to pick a place or drop a pin, as in Google Maps, instead of only searching.
- **Cause (web-0.3.1):** the maps ignored taps. Places could be reached only through search and the quick-search chips.
- **Change:**
  - On the home and place screens:
    - Tapping a building opens its card, as if it had been searched.
    - Tapping open ground drops a pin, with a card "หมุดที่ปักไว้" (dropped pin) naming the nearest building. "เส้นทาง" / "เริ่มนำทาง" route to it along the campus paths, then straight to the pin.
    - On a floor plan, tapping a room opens that room.
  - Taps are ignored during route preview and navigation, so a stray tap can't change the trip.
  - **Logs:** `map_tap` records what was tapped.
- **Check (desk test, both builds):**
  - Before: a tap on N10 does nothing.
  - After:
    - A tap on N10 opens N10.
    - A tap on open ground 60 m east of it drops a pin "ใกล้ N5 …", with a 394 m route ending exactly at the pin.
    - A tap on SCL604 in the floor-6 plan opens SCL604 with the plan shown.
    - During navigation a tap changes nothing.

#### T1-S13: heading
- **Reported:** the map and the marker don't turn with the direction the tester faces, unlike Google Maps, so someone who has lost their bearings can't tell which road they face. The team had already planned this.
- **Cause (web-0.3.1):** the maps were always north-up (the floor plans as drawn), and the marker was a plain dot.
- **Change:**
  - **Turning map:** during navigation, the map turns so that the way ahead on the route points up, outdoors and on the floor plans.
    - Outdoors it follows the route across ±6 m, so small bends don't swing it.
    - Indoors it follows the piece of corridor the dot is on. So it doesn't turn before the tester does: the dot waits at the corner (T1-S10).
    - Labels and pins stay upright.
  - **Compass button:** at the right of the screen. It switches to a fixed map (as drawn) and back, and its needle shows where the map's north is.
  - **Beam:** outdoors, the marker shows where the phone points, from the compass.
    - iPhone: `webkitCompassHeading`, which asks for permission together with the motion sensors.
    - Android: `deviceorientationabsolute`.
  - **While the map is turned:** dragging is off, and pinch-zoom zooms about the centre.
  - **Logs:** `map_mode` records switches.
- **Check (desk test):**
  - Before: the map stays north-up throughout, and the marker has no direction.
  - After, walking the S2 → SCL607 route in simulation:
    - outdoors the map follows the route;
    - on floor 6, after the turn out of the lift, it turns −90° so the corridor runs up the screen;
    - a simulated compass reading of east draws the beam at 90°;
    - the compass button switches to the fixed map and back;
    - stopping navigation restores the maps.
- **Limits:**
  - No beam indoors: the floor plans' true north isn't known yet, so a compass can't be placed on them.
    - It could be derived: from the long axis of N7's map footprint, with the entrance known to be on the south side.
  - Not yet tried on real phones. Compass readings indoors are disturbed by steel, which is another reason the indoor map follows the route, not the compass.

#### T1-R1: every N7 floor

#### T1-R2: Figma alignment

### Not acted on this round (UI/UX)

T1-U1 to T1-U8 are recorded for the team's design discussion. Two notes from the write-up:
- **T1-U1:** the lift buttons aren't in the Figma design. They exist in the test build to record when a tester really arrived.
- **T1-U5:** the write-up compares the icons in Figma with the ones in the build.

Changes made for T1-R2 (matching Figma) may change how some of these look. Where they do, it is noted under T1-R2.
