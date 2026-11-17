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
| T1-S1 | The marker wobbles and doesn't follow the road | write-up | fix | pending |
| T1-S2 | The marker freezes in places, e.g. by the N7 bridge | write-up | fix | pending |
| T1-S3 | The marker jumps ahead or runs faster than the user, and the app "arrived" early | write-up | fix | pending |
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

#### T1-S4 to T1-S7: indoor routing and floors
- **Reported:** starting inside the building gives a route out of the building and back in. Walking in shows floor 6 and the lift step straight away, and the dot sits on a floor the tester isn't on.
- **Cause (web-0.3.1):**
  - Every route started outdoors, at the campus path nearest the GPS fix.
  - The indoor part was one leg on the destination floor, starting in the lift. So at the entrance the app jumped straight to that floor and the lift step.
  - The app had no ground floor, so it couldn't show anything else.

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

#### T1-S11: sign photo

#### T1-S12: pick a place on the map

#### T1-S13: heading

#### T1-R1: every N7 floor

#### T1-R2: Figma alignment

### Not acted on this round (UI/UX)

T1-U1 to T1-U8 are recorded for the team's design discussion. Two notes from the write-up:
- **T1-U1:** the lift buttons aren't in the Figma design. They exist in the test build to record when a tester really arrived.
- **T1-U5:** the write-up compares the icons in Figma with the ones in the build.

Changes made for T1-R2 (matching Figma) may change how some of these look. Where they do, it is noted under T1-R2.
