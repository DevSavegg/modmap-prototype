# MOD MAP prototype vs Figma "Prototype" page: visual audit

Spec for refining the in-app UI to match Figma. Nothing in the repo was changed.

## How to read this

**Sources.** Figma page "Prototype" (node 1:3), saved 16 Nov: `summary.txt`, `prototype_meta.xml` (layer boxes), `frames/NN_*.png` (each crop is exactly 402×874, i.e. 1 px = 1 Figma unit), and `get_design_context` for 291:5129, 318:487 and 291:5343 (exact font, colour, radius and shadow values). Colours not covered by `get_design_context` were sampled from the PNGs with a script (flat fills read exactly; anti-aliased strokes give the nearest solid value). Where a value is an estimate it says so.

**App references.** `index.html` and `style.css` are as of 16 Nov 20:29 (unchanged since). `app.js` line numbers are from **commit 8878cd8** (17 Nov 11:19). Another session is editing `app.js` right now (uncommitted, about 1,570 lines at 11:26, with multi-segment routes and a new floor-choice dialog), so lines will drift. Every app.js reference also names the function. Search for the function or the quoted snippet if a line has moved.

**Coordinates.** Figma x/y/w/h are frame pixels on a 402×874 iPhone 17 frame. Top values such as `y=70` include the iOS status bar (≈54 px) and bottom values include the home-indicator zone (≈34 px). The app runs in a phone browser, so it keeps the literal 70 px tops and its own bottom offsets. That is a known decision and is **not** flagged. Bottom-anchored numbers below are given as "distance above the bottom bar or sheet" where that matters.

**Tags.** **must** = clearly visible: wrong layout, size, colour, text or icon. **should** = noticeable on a side-by-side check. **minor** = a few px or a subtle tint. Rows marked "—" are matches (✓) or information only and are not counted.

**Known decisions respected (not flagged).** Kanit and Prompt are the fonts. Brand colours are #fb8c3a and #fff3c4. The "avoid sun and rain" route is a labelled concept mock. The app's turn icons are correctly mirrored relative to Figma's swapped ones. Test-only UI (welcome/test screen, calibration walk, tracker badge, lift-card buttons, "ฉันถึงหน้าห้องแล้ว", sim controls, test-data notice) is only checked for consistency with the design system (§3.3). Browser chrome takes space.

**Totals (per-frame tables, §2):** 26 **must**, 44 **should**, 61 **minor** = 131 tagged differences. Rows that repeat an already-counted fix on another frame are marked "—". Token-level mismatches (§1) restate these and are not counted twice.

---

## 1. Design tokens found in Figma, compared with style.css

### 1.1 Colours

| Token (proposed name) | Figma hex | Where Figma uses it | style.css / app now | Change |
|---|---|---|---|---|
| brand orange | **#fb8c3a** | buttons, step icons, pin body, loading text, layers icon, floor-plan route band, map pin label, current floor | `--orange` #fb8c3a (style.css:3) | ✓ |
| soft fill | **#fff3c4** | "เริ่มนำทาง" soft button, travelled route band | `--orange-soft` #fff3c4 (style.css:4) | ✓ (but the floor pill uses it wrongly, see `--tint`) |
| icon circle | **#ffd7b3** | 40 px circles behind list icons | `--orange-tint` **#ffe1c7** (style.css:5) | → #ffd7b3 |
| deep orange | **#e65100** | Material location_on and Clock icons (lists, OD card, picker), dialog titles, "!" in the dialog icon, pin inner dot and stroke, ant icons, 1 px edge of route bands | not a token (only inside pin.svg and ant*.svg) | add `--orange-deep:#e65100` |
| vivid orange | **#ff6a00** | home "go" FAB arrowhead, compass needle, floor-pill label "ชั้น N" | not used | add `--orange-vivid:#ff6a00` |
| nav orange | **#ff8c19** (sampled #ff8c18/#ff8c19) | nav bar minutes "15 นาที", instruction-card arrow | app uses #fb8c3a | add `--orange-nav:#ff8c19` |
| outdoor route | **#f57c00** | active route on the route-preview map | app.js:616 `#fb8c3a` | use on preview line |
| tint | **#fff7ed** | go FAB, layers FAB, compass FAB, floor pill, floor menu | only in icons/layers-bg.svg; `.floorpill` uses #fff3c4 (style.css:183); `.fab` #fff (style.css:62) | add `--tint:#fff7ed` |
| amber soft | **#ffe082** | selected route-mode button | `.modebtn.on` uses #fff3c4 (style.css:142) | add `--amber-soft:#ffe082` |
| you | **#ffc107** | user dot | `--you` #ffc107 (style.css:6) | ✓ |
| you halo | **rgba(255,193,7,.25)** (renders #faeabd on the map) | 64 px (home) / 90 px (nav) / 32 px (preview) halo | `.me-marker` rgba(255,193,7,.25) (style.css:73) | ✓ colour |
| locate halo | **#fff0c3** | inner 34 px circle in the locate FAB | — (FAB holds a 14 px `.you-dot`) | add |
| floor-plan core | **#fff9e6** | lift and stair core area on floor plans | lift box #bdbdbd (app.js:305) | add |
| field | **#f5f5f5** | search bar, chips, OD card, instruction and arrival cards, picker fields, dialog ghost button, floor-plan corridor | `--field` #f5f5f5 (style.css:7) | ✓ (chips don't use it, see F00) |
| muted | **#757575** | placeholder, typed query, chip label, search/back/clear icons, grabber, **full-bleed section rules in sheets**, floor-plan walls, dialog body | `--muted` #757575 (style.css:8) | ✓ value; add `--rule:#757575` for sheet rules |
| disc grey | **#d9d9d9** | close-button discs, OD/picker connector dots, unselected route-mode icons | sheet-close.svg ✓; `.dots i` #c4c4c4 (style.css:93); `.modebtn` #9e9e9e (style.css:140) | add `--disc:#d9d9d9` |
| line | **#e0e0e0** | list and step dividers, floor-plan room fill | `--line` **#e3e3e3** (style.css:10); rooms #d3d3d3 (app.js:305) | → #e0e0e0 |
| placeholder light | **#bdbdbd** | picker placeholder "เลือกจุดหมาย" | browser default | add |
| ghost text | **#424242** | dialog "ยกเลิก" text | `.btn.ghost` #333 (style.css:236) | → #424242 |
| OD divider | **#000** (1 px) | line between origin and destination in the OD card | none | add |
| ink | **#000** | all body text | `--ink` #000 (style.css:9) | ✓ |
| scrim | **rgba(0,0,0,.30)** (measured: #e0e0e0 → #9d9d9d) | dialog overlay | `#dim` .32 (style.css:32) **plus** `.dlgwrap` .35 (style.css:225), shown together (app.js:990) ≈ .56 | single .30 |
| map: background | #f7f6f6 | base map (Google-style screenshot) | `--map-bg` #eeeeec (style.css:13) | optional |
| map: buildings | #e7e8eb (others), #fcf8ef (campus blocks) | | #e3e0da fill, #cfcac2 stroke (app.js:256) | optional |
| map: roads | #c6d0da (#a9b8c8 at high zoom), no white casing | | white casing + #aebbcc/#c3ccd8/#cfd6df (app.js:251-254) | optional |
| map: water / green / labels | #90d9ed / #c2f0d4 / #77909b | | #a9d6f0 (app.js:247-248) / #d4e8ca (app.js:246) / #6b6b6b (style.css:79) | optional |

### 1.2 Typography

Line heights are Figma "normal" (Kanit/Prompt ≈ 1.495 × size, so 14→21, 16→24, 18→27, 20→30, 28→42). **Bold** = confirmed by `get_design_context`; the rest are inferred from text-box heights, text widths (Kanit is narrower than Prompt for the same string) and glyph shapes.

| Role | Figma | App now | Change |
|---|---|---|---|
| Search placeholder (home, list, place bar) | **Prompt 400 14 #757575** | `.searchbar` Prompt 14 #757575 (style.css:43-44) | ✓ |
| Typed query / category label in the list field | Kanit 400 16 #757575 (box h24; "SCL600" is 57 px wide = Kanit, Prompt would be ≈61) | `.searchbar input` Prompt 14 #000 (style.css:46) | Kanit 16 #757575 |
| Chip label | Kanit 400 14 #757575 (width check) | Prompt 14, colour #000 (style.css:57, body colour style.css:20) | Kanit 14 #757575 |
| List section heading "ล่าสุด" | Kanit 400 16 #000 | `.listtitle` 15 (style.css:98) | 16 |
| List row title | Kanit 18 #000 (weight looks 400; can't confirm 400 vs 500) | `.results .t` Prompt 16 (style.css:104) | Kanit 18 |
| List row subtitle | Kanit 400 14 #000 | 12.5 #222 (style.css:105) | 14 #000 |
| Map pin label | **Prompt 400 16 #fb8c3a**, no halo | `.pin-label` 15 + white text-shadow (style.css:78) | 16, no halo |
| Place title | **Kanit 500 20 #000** | `.sheet h2` 500 20 (style.css:112) | ✓ |
| Place subtitle | **Kanit 400 14 #000** | `.sheet .sub` 14 (style.css:113) | ✓ |
| Button label | **Kanit 400 13** | `.btn` 13 (style.css:120) | ✓ |
| Route sheet title | **Kanit 500 18** | `.sheet h2` 20 (style.css:112) | 18 for `#pv-name` |
| Route stats | **Kanit 400 16** | `.pvstats` 16 (style.css:145) | ✓ |
| Steps heading "ขั้นตอน" | **Kanit 400 18** | `.steps h3` 400 18 (style.css:147) | ✓ |
| Step title / step sub | **Kanit 400 14 / 12** | 14 / 12 (style.css:153-154) | ✓ |
| OD card text | **Kanit 400 13** | `.odcard` 13 (style.css:135) | ✓ |
| Picker field | Kanit 400 13; value #000, typed query #757575, placeholder #bdbdbd | 13, colours default (style.css:90) | colours |
| Loading text | **Kanit 500 16 #fb8c3a** | `.loadtxt` (style.css:163) | ✓ |
| Instruction title | Kanit 500 20 | `.instr-t` 500 20 (style.css:171) | ✓ |
| Instruction sub | Kanit 400 12 (box h18) | `.instr-s` 13 (style.css:172) | 12 |
| Nav minutes | Kanit 500 28 #ff8c19 | `.navstat b` 500 24 #fb8c3a (style.css:198) | 28, #ff8c19 |
| Nav distance | Kanit 400 14 | `.navstat span` 13 (style.css:199) | 14 |
| Floor pill label | 16 #ff6a00 (family not confirmed, looks Kanit) | 15 #fb8c3a (style.css:183) | 16 #ff6a00 |
| Floor menu items | 16 #000; current = white on #fb8c3a | 14 (style.css:188) | 16 |
| Dialog title | Kanit 500 18 #e65100 | `.dlg h3` 500 18 #fb8c3a (style.css:227) | #e65100 |
| Dialog body | Kanit 400 14 #757575, line-height 24 (2 lines in a 48 box) | 13, lh 1.5, #000 (style.css:228) | 14/24 #757575 |
| Dialog buttons | 16 (box h24); ghost #424242 | 15, ghost #333 (style.css:235-236) | 16, #424242 |
| Arrival card | Kanit 500 20 | `.arrived` 500 20 (style.css:204) | ✓ |
| Floor-plan room label | ≈14, white fill with #757575 outline | `.rlabel` 11 #6f6f6f + white halo, hidden until zoom ≥ 2.4 (style.css:82, 249-250) | 14, outlined, visible |

### 1.3 Corner radii

| Element | Figma | App | |
|---|---|---|---|
| Search bar | **16** | 16 (style.css:42) | ✓ |
| Chip | 20 (pill on h40) | 20 (style.css:57) | ✓ |
| OD card | **12** | 12 (style.css:135) | ✓ |
| Instruction and arrival cards | ≈12 (pixel fit 12–13.5) | 12 (style.css:167, 204) | ✓ |
| Bottom sheets | **28 28 0 0** | 28 (style.css:110, 194) | ✓ |
| Buttons | **28** (renders as a pill on 41/43 px) | 28 (style.css:120) | ✓ |
| Picker fields | ≈12 (pixel fit) | 10 (style.css:90) | → 12 |
| Floor pill / floor menu | ≈12 | 12 (style.css:182, 186) | ✓ |
| Dialog card | ≈10 (pixel fit; both dialog sizes) | 6 (style.css:226) | → 10 |
| Dialog buttons | pill | 28 | ✓ |
| Place-sheet photo | 0 | `.thumb` 4 (style.css:116) | → 0 |
| Grabber | **4** | 4 (style.css:144) | ✓ |

### 1.4 Shadows and overlay

| Element | Figma | App | |
|---|---|---|---|
| Search bar, chips, OD card | **0 1px 5px rgba(0,0,0,.25)** | `--bar-shadow` (style.css:12) | ✓ |
| Bottom sheets | **0 0 6px rgba(0,0,0,.1)** | `--sheet-shadow` (style.css:11) | ✓ |
| FABs (go, locate, layers, compass) | 0 0 6px rgba(0,0,0,.25) (exact for layers: filter in layers-bg.svg, stdDeviation 3) | `.fab` uses `--bar-shadow` (style.css:62) | → 0 0 6 .25 |
| Route-mode buttons | soft all-round, ≈0 0 6px rgba(0,0,0,.1) (estimate) | `--bar-shadow` (style.css:140) | minor |
| Instruction and arrival cards | heavier and offset: ≈**0 4px 4px rgba(0,0,0,.25)** (estimate: −24% at +1 px below, fades by +8 px; sides fade in 4 px) | `--bar-shadow` (style.css:167, 204) | → card shadow |
| Floor pill / floor menu | light, ≈0 0 4px rgba(0,0,0,.1) (estimate) | `--bar-shadow` | minor |
| Dialog card | none visible | none | ✓ |
| Scrim | rgba(0,0,0,.30) | .32 + .35 stacked | see §1.1 |

### 1.5 Spacing rhythm

- Screen gutters: **13** (search bar, chips row, list dividers, home FAB right edge, layers FAB). **18** (OD card). **25–27** (sheet content: 25 on route sheets, 27 on the place sheet, 26 for the instruction and arrival cards). **14** (floor pill, compass FAB right edge).
- Top stack: search bar y 70 (h50) → chips y 136 (h40) → layers FAB y 136.
- List rows: **96 px pitch** (icon circle 40 at x 35, centred; text x 96; title top +25, sub top +51). Section heading "ล่าสุด" top 24 px under the field. No divider under the last row.
- Step rows: **80 px pitch** (title top +19, sub top +43, icons centred at x≈57, text x 97). Separators span x 15–387. No separator under the last row.
- Sheets: grabber 50×3 at +12 (route sheet) / +10 (nav sheets). Title at +21…+24. Full-bleed **#757575** rules separate sheet sections (route-sheet stats ↔ steps, steps ↔ start button, nav header ↔ steps).
- Buttons: place-sheet pair 169×43, gap 13. Full-width buttons 352×**41** (x 25).
- FAB sizes: home 55, nav compass 50, route modes 70, nav close 60.

### 1.6 Icon sizes

| Icon | Figma size | App now |
|---|---|---|
| Search magnifier (bar) | 25×25 (#757575, stroke ≈2.5) at x 27 | CSS ring 22×22 (style.css:49-50) |
| Back arrow (list) | 25×25 box, ≈18 px thin arrow #757575 at x 25 | "←" glyph 22 px in 28 box (style.css:51) |
| Back arrow (picker) | 25×25, **#000**, top-left at (11,52) | "←" glyph, #757575, vertically centred (style.css:51, 87) |
| Clear (list field) | 20×20 outlined circle + × (1 px #757575) | icons/search-clear.svg is **empty** |
| Clear (place bar) | 30×30 (#f5f5f5 disc + 2 px × #757575 = search-x.svg) | same asset at 26×26 (style.css:48) |
| List icons (location_on / schedule) | 25×25 (27×27 in F16) Material outline, #e65100, in a 40 circle #ffd7b3 | custom SVG 22×22, #fb8c3a, stroke 1.8 (app.js:399-400; style.css:103) |
| Chip icons | building 13×25.4, fork+spoon 18×26.4, #757575 | CSS shapes 16×18 / 14×18, #555 (style.css:58-60) |
| Go FAB | navigation arrowhead ≈18×20 #ff6a00 | nav-arrow.svg rotated, 24 px, #fb8c3a (style.css:66) |
| Locate FAB | 34 circle #fff0c3 + 11 dot #ffc107 | `.you-dot.sm` 14 px with rings |
| Layers FAB | 30×24 icon in 55 disc | ✓ (style.css:129-131) |
| Compass FAB (nav) | needle ≈20 px #ff6a00 in 50 disc #fff7ed | missing |
| OD / picker origin dot | 20×20 (you-dot.svg) | 14 px `.you-dot.sm` |
| OD / picker destination | location_on 25×25 #e65100 | pin.svg 14×21 (style.css:94) |
| Swap ⇅ | two 12 px arrows, 1 px black (icons/swap-up.svg + swap-down.svg) | "⇅" / "✕" glyphs (index.html:45, 80) |
| Step icons | 32 tall (turns 35×32), 1–2 px #fb8c3a | `.si img` max 34×32 ✓ (style.css:151) |
| Instruction icon | 32 (#ff8c19) | 32 (#fb8c3a) ✓ size |
| Route-mode icons | ≈40 px | 30 px (style.css:141) |
| Place buttons | route 26×24.4, start 17×16 | both 18 px tall (style.css:121) |
| Dialog icon | group 56×53 (pin + "!") | pin 44 px + "!" 40 px (app.js:1006) |
| Arrival icon | 45×45 pin-with-tick #fb8c3a | 40 px circle with "✓" (style.css:205) |
| Nav close | 60 disc, ≈22 px ×, stroke ≈3 | 60 disc, "✕" glyph 26 px (style.css:196) |
| Floor-pill icon | 22×24 layers outline #fb8c3a | 22×22 (style.css:184) ✓ |
| Finish-button icon | location_on 25×25 white | pin.svg filtered white, 18 tall (style.css:127) |
| Map pin | 32×47 (place), 20.5×30 (preview), 23.8×35 or 26×38 (floor plan) | always 32×48 (style.css:77; app.js:238) |

### 1.7 Icon assets

Assets in `icons/` that match Figma 1:1: pin.svg (Group 45), route.svg (Group 21), nav-arrow(-white).svg (Vector 1, the button arrow), sheet-close.svg / close-sm.svg, search-x.svg (Group 90), layers.svg + layers-bg.svg, you-dot.svg (Group 26, **unused**), swap-up/down.svg (Arrow 5/6, **unused**), step-*.svg, turn-*.svg (intentionally mirrored), ant1–4.svg.

**Broken:** `search-clear.svg` (Group 8) contains only empty `<g>` elements.

**Missing** (need exporting from Figma when the MCP quota allows, or redrawing): home go-FAB arrowhead (291:4966 "map-arrow-up-svgrepo-com 1"), compass needle (291:4962 / 291:4629), location_on and Clock outlines (Material instances), chip building icon (291:4972 "Group 31") and fork+spoon (291:4993 "Group 42"), fast-mode icon with speed lines (Group 49), arrival pin-with-tick (291:4839 "map-point-tick-cutout 1"), floor-plan POI tiles for lift, stairs and toilet (Groups 34/64/66/68 inside the plan groups), dialog pin+! (Group 76).

---

## 2. Per-frame audit (reading order F00–F38)

Each block gives the frame, the app screen or state it maps to, the key Figma layer boxes, then the differences. Duplicate frames point to their twin and list deltas only.

### F00 · 291:4954 · หน้าหลัก1 → `#home` (index.html:21-34; goHome app.js:337)

Figma: search bar Group 39 (13,70 376×50); Search icon (27,81 25×25); placeholder (68,84). Chips Frame 1 (13,132): chips at y 136, h 40, widths 93/93/120/120, x 13/122/231/367 (gap 16). Labels at chip-x+44 (N, S) or +48 (food, dorm); icons at +19 (building 13×25.4) or +18 (food 18×26.4). FAB "Group 35" compass (334,697 55×55, white, #ffc107 needle). FAB "Group 36" go (334,769 55×55, #fff7ed, arrowhead #ff6a00). User dot Group 62 (178,471 64×64; dot 20 #ffc107, no ring).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| H1 | Chip fill | #f5f5f5 | `#fff` (style.css:56) | `background:#f5f5f5` | should |
| H2 | Chip label | Kanit 400 14 #757575 | Prompt 14, #000 (style.css:57; colour from style.css:20) | `font-family:Kanit; color:#757575` | **must** |
| H3 | Chip text "หอหญิง" | 4th chip reads "หอหญิง" | "หอพัก" (index.html:29) | change the text (confirm: the app's `dorm` category = S5, S6 บ้านธรรมรักษา) | **must** |
| H4 | Chip geometry | 93/93/120/120 × 40, gap 16, top y 136; label at +44/+48; right padding 16–18 | gap 10, top 134+4 = 138, padding 0 16 0 12, icon-label gap 8 → "ตึก N" chip ≈83 wide, label at +36 (style.css:53-57) | `.chips{top:132px;gap:16px}` `.chips button{padding:0 18px 0 19px;gap:12px}`; food/dorm `min-width:120px;padding-left:18px` | should |
| H5 | Chip icons | outlined building (window grid + door) and fork+spoon, #757575, 13×25.4 and 18×26.4 | CSS boxes and gradient bars #555, 16×18 and 14×18 (style.css:58-60); the "food" icon is three bars, not a fork and spoon | SVG icons in #757575 at Figma sizes | **must** |
| H6 | Go FAB icon | solid navigation arrowhead (map-arrow-up), #ff6a00, ≈18×20 | nav-arrow.svg ("send" arrow from the buttons), #fb8c3a, 24 px, rotated −90° (index.html:33; style.css:66) | new arrowhead SVG, #ff6a00 | **must** |
| H7 | Go FAB fill | #fff7ed | #fff (style.css:62) | `.fab-go{background:#fff7ed}` | should |
| H8 | FAB size and right edge | 55×55; right edge 13 px from the screen edge (x 334) | 56×56, right 18 (style.css:62) | `width:55px;height:55px;right:13px` | minor |
| H9 | FAB vertical gap | 17 px between the two FABs | 16 px (bottoms 110/38, style.css:64-65) | locate `bottom:` = go bottom + 72 | minor |
| H10 | FAB shadow | 0 0 6px rgba(0,0,0,.25) | 0 1 5 .25 (style.css:62) | `box-shadow:0 0 6px rgba(0,0,0,.25)` | minor |
| H11 | User dot | 20 px #ffc107, **no** white ring, no drop shadow; halo 64 px | ring `0 0 0 3px #fff` + `0 1px 4px rgba(0,0,0,.3)` (style.css:74) | `.me-marker i{box-shadow:none}` | should |
| H12 | Search icon | 25×25 magnifier #757575 at x 27 | CSS ring 22×22 at x 29 (style.css:49-50) | 25 px SVG | minor |
| H13 | Placeholder x | 68 | 65 (16 + 22 + 14 + 13; style.css:42, 49) | `padding-left:14px;gap:16px` with 25 px icon | minor |
| H14 | Map palette | bg #f7f6f6, buildings #e7e8eb, campus blocks #fcf8ef, roads #c6d0da (no white casing), water #90d9ed, green #c2f0d4, POI labels #77909b | #eeeeec, #e3e0da/#cfcac2, white casing + #aebbcc…, #a9d6f0, #d4e8ca (style.css:13; app.js:246-256) | optional: adopt the Figma hexes | minor |
| H15 | First FAB variant | compass FAB in this frame; F01/F02 show the locate FAB | locate FAB | keep locate (see §5) | — |
| H16 | "?" FAB | not in Figma (test-only entry to the welcome screen) | index.html:31; style.css:67-68 | keep; see §3.3 | — |

### F01 · 291:4902 · หน้าหลัก2 → `#home`

Same as F00 (H1–H14 apply). The first FAB is the **locate** FAB "Group 80" (334,697 55×55).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| H17 | Locate FAB content | white disc; 34 px circle #fff0c3; 11 px dot #ffc107, no ring | `.you-dot.sm`: 14 px dot with 2 px white + 1.5 px yellow ring (index.html:32; style.css:69-70) | inner markup: 34 px #fff0c3 circle + 11 px #ffc107 dot | should |

### F02 · 297:198 · หน้าหลัก N7 → `#home` zoomed to N7

Same as F01. No further UI deltas (only map zoom differs).

### F03 · 291:5097 · Search3 "ตึก N" → `#list`, category mode (openList('category') app.js:356-367)

Figma: field Rectangle 24 (13,70 376×50, #f5f5f5, r16, **no shadow**). Back "Group 89" (25,81 25×25, thin #757575 arrow). Label "ตึก N" (68,81, Kanit 16 #757575). Clear "Group 8" (352,85 20×20, outlined ⊗). Rows: circle 40 #ffd7b3 at (35, row+28); location_on 25×25 #e65100 at (43, row+35); title (96, row+24) Kanit 18; sub (96, row+50) Kanit 14. Dividers 1 px #e0e0e0, x 13–389, at 216/312/408/507/603/699/795, none after the last row. N5's sub is truncated "…มาตรฐานแ...".

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| C1 | Clear (×) button | visible 20×20 outlined circle with × (1 px #757575) | icons/search-clear.svg is empty, so the button is invisible (index.html:50; style.css:47) | redraw the asset (see §4 ICON-1) | **must** |
| C2 | Row height | 96 px pitch | ≈78 px (padding 16/16 + ≈45; style.css:101) | `.results button{padding:24px 10px 24px 22px}` (with C3/C4 sizes this gives 96) | **must** |
| C3 | Row title | Kanit 18 #000 | Prompt 16 (style.css:104) | `font:400 18px/27px Kanit` | **must** |
| C4 | Row sub | Kanit 14 #000 | 12.5 #222 (style.css:105) | `font-size:14px;line-height:21px;color:#000;margin-top:0` | **must** |
| C5 | Icon circle fill | #ffd7b3 | #ffe1c7 (style.css:5, 102) | `--orange-tint:#ffd7b3` | should |
| C6 | Row icon | Material location_on outline, 25×25, #e65100 | custom pin, stroke 1.8 #fb8c3a, 22×22 (app.js:399; style.css:103) | 25 px, #e65100 | should |
| C7 | Field text | Kanit 400 16 #757575 at x 68 | Prompt 14 #000 at x ≈71 (style.css:46) | `.searchbar input{font:400 16px Kanit;color:#757575}` | should |
| C8 | Long subtitles | single line, truncated with "..." | wrap to two lines (style.css:105, no nowrap) | `white-space:nowrap;overflow:hidden;text-overflow:ellipsis` (text span needs `min-width:0`) | should |
| C9 | Text x | 96 (gap 21 after the circle) | 93 (gap 18, style.css:101) | `gap:21px` | minor |
| C10 | Dividers | #e0e0e0; none under the last row | #e3e3e3 under every row (style.css:10, 100) | `--line:#e0e0e0`; `.results li:last-child{border-bottom:0}` | minor |
| C11 | Back arrow | thin drawn arrow 25×25 #757575 at x 25 | "←" glyph 22 px, box 28 at x 29 (index.html:48; style.css:51) | SVG arrow; field `padding-left:12px` | minor |
| C12 | Clear position | x 352 (20 px) | x ≈355 (style.css:42, 47) | `padding-right:17px` | minor |
| — | Order / content | N1…N8 by code | sorted by code (app.js:364-365) | ✓ | — |

### F04 · 292:5745 · Search3 "ตึก S" → `#list`, category S

Same as F03, plus:

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| C13 | Recently viewed item | S13 (in recents) is listed **first** with the **Clock** icon, then S1…S7 by code | all rows use the pin icon, pure code order (app.js:364-366, renderResults app.js:403-416) | in category and search results, move items found in recents() to the top and give them the clock icon | should |

### F05 · 292:5806 · Search3 "โรงอาหาร" → `#list`, category food

Same as F03. Rows S5, S6, S14 match the app data. No further deltas.

### F06 · 297:362 · Search2, typed "SCL600" → `#list` search with query (renderSearch app.js:381-387)

Field: back arrow, "SCL600" (Kanit 16 #757575, 68,82), clear (352,85). One row: **Clock** icon (a recent) SCL600 / "อาคารปฏิบัติการพื้นฐานทางวิทยาศาสตร์ ชั้น 6", no divider.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| C14 | Icon for a recent match | Clock | pin (renderSearch passes 'pin', app.js:386) | same fix as C13 (not counted again) | — |
| — | Title and sub text | "SCL600" / "...ชั้น 6" | titleOf/subOf (app.js:202-214) | ✓ | — |

### F07 · 325:647 · Search1, empty field → `#list` search, recents

Figma: field Group 93 with placeholder (Prompt 14 #757575 at 68,84), back arrow, no clear. "ล่าสุด" (27,144 Kanit 16). Rows from y 168, pitch 96: SCL607 + sub; **LX** (no sub); CB2405 + "อาคารเรียนรวม 2 ชั้น 4"; S13 (no sub). Clock icons. Dividers 264/360/456.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| R1 | 2nd recent label | "LX" (the alias the user picked) | "N16" + sub "อาคารการเรียนรู้พหุวิทยาการ" (default ids app.js:219; titleOf app.js:202) | store the chosen label with the id (pushRecent app.js:222) and show it | **must** |
| R2 | Building rows in recents | title only, vertically centred (LX, S13) | buildings always get a sub `p.th` (app.js:413) | in recents, omit the sub for buildings | should |
| R3 | Clock icon | Material "schedule" outline 25×25 #e65100 | custom clock 22 px #fb8c3a (app.js:400) | 25 px #e65100 | should |
| R4 | Heading | Kanit 16 #000 at x 27, top 24 below the field | 15 px, x 26, top 18 (style.css:98) | `.listtitle{padding:24px 27px 0;font-size:16px;line-height:24px}` | minor |
| R5 | "ยังไม่มีแผนผังชั้น" pill on CB2405 | none | tag pill (app.js:414; style.css:106) | app-only; see §3.2 | minor |

### F08 · 325:632 · iPhone 17 - 19, typed "Slope600" → `#list` search

Field shows a **magnifier** (Search instance 27,81) instead of the back arrow. Typed text "Slope600" Kanit 16 #757575 (68,81), clear (352,85). One recent row "Slope600 (SCL216)" / "...ชั้น 2" with the clock icon.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| C15 | Leading icon while typing | magnifier here and in F12; back arrow in F03–F07 and F16 (Figma is inconsistent) | always the back arrow | keep the back arrow (see §5) | — |
| C16 | Recent icon | Clock | pin (app.js:386) | same fix as C13 (not counted again) | — |
| — | Title | "Slope600 (SCL216)" | titleOf(p, hit) gives the same (app.js:202-206) | ✓ | — |

### F09 · 325:680 · ข้อมูลห้อง อาคาร (Slope600) → `#place` (openPlace app.js:433-455)

Figma: sheet Rectangle 28 (0,484 402×408, white, r28 top, shadow 0 0 6 .1). Bar Group 9 (13,70) with Search icon (27,81), text "Slope600" (Prompt 14 #757575, 68,84), × Group 90 (346,80 30×30). Layers FAB (334,136 55×55). Pin Group 45 (200,234 32×47) and label "SCL216" (242,241, Prompt 16 #fb8c3a). Title "Slope600 (SCL216)" (27,505, Kanit 500 20). Sub (27,539 Kanit 14). Close (356,506 22×22). **Photo** "19-5 1" (27,576 351×203). Buttons: เส้นทาง (27,801 169×43 #fb8c3a; icon 71,811 26×24.4; text 111,813) and เริ่มนำทาง (209,801 169×43 #fff3c4; icon 252,815 17×16; text 281,813).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| P1 | Media | room **photo** 351×203, square corners (the same placeholder classroom photo in all six place frames, faces blurred) | generated SVG floor-plan crop or building map, 190 tall, r4, bg #efefef (index.html:64; thumbSVG app.js:471; style.css:116) | decide: real room photos, or keep the plan crop. Either way `height:203px;border-radius:0` | should |
| P2 | Search-bar text | the label the user searched: "Slope600" | titleOf(p) gives "Slope600 (SCL216)" (app.js:436) | carry the search hit from choose() (app.js:421-429) into openPlace and show it | **must** |
| P3 | Map pin label | room code only: "SCL216" | pinLabel(titleOf(p)) gives "Slope600 (SCL216)" (app.js:451) | rooms: `p.code` | **must** |
| P4 | Route-button icon | 26×24.4; icon–label gap 14 | 18 px tall (≈19×18), gap 10 (style.css:120-121) | `#btn-route img{width:26px;height:24px}` `#btn-route{gap:14px}` | should |
| P5 | Sheet inset | left 27 (title, sub, photo, buttons); right 24 | padding 22 24 (style.css:111) | `#place-sheet{padding:21px 24px calc(30px + env(safe-area-inset-bottom,0px)) 27px}` (makes each button 169 wide, as in Figma) | minor |
| P6 | Vertical rhythm | sub top 4 px under the 30 px title box; photo 16 under sub; buttons 22 under photo; 30 below buttons | sub margin 6/14; btnrow margin-top 20; bottom 22 (style.css:111-119) | `.sheet .sub{margin:4px 0 16px}` `.btnrow{margin-top:22px}` | minor |
| P7 | Start-button icon | 17×16, gap 12 | 18 tall, gap 10 | `#btn-start img{width:17px;height:16px}` gap 12 | minor |
| P8 | Pin label style | Prompt 16, no halo; label left = pin centre + 26, top = tip − 40 | 15 px + white text-shadow (style.css:78); anchor [-20,36] (app.js:239) | 16 px, no shadow, anchor [-26,40] | minor |
| P9 | × in the bar | 30×30 at x 346 | 26×26 at x ≈349 (style.css:48) | `width:30px;height:30px` | minor |
| P10 | Building highlight | none (only pin + label) | orange 1.5 outline + #fde3cc fill (highlightBuilding app.js:461) | optional: drop | minor |
| P11 | Subtitle spacing | double spaces around "(N7)" (text node has `whitespace-pre`) | single spaces (subOf app.js:213) | optional: `${bn}  (${p.building})  ชั้น ${p.floor}` | minor |
| — | Layers FAB, close button, button colours and radius, title and sub fonts | | style.css:110-131 | ✓ | — |

### F10 · 325:760 · ข้อมูลห้อง แผนผัง (Slope600) → `#place` + floor map (toggleLayers app.js:463-470)

Same sheet and bar as F09 (P1–P11 apply). The map area is a floor plan in blueprint style: light-grey rooms, **near-black** 3 px walls, white tiles with toilet and stairs pictograms, cream core. F18 (same state, floor 6) uses **#757575** walls instead; follow F18 (§5).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| FP0 | Floor-plan look | see FP1–FP7 (F18) | drawFloor app.js:291-318 | as F18 | — |

### F11 · 325:1435 · Search1 → identical to F07.

### F12 · 325:1571 · iPhone 17 - 20, typed "SCL216" → `#list` search

Like F08. The title is "SCL216" (searched by code). The app's titleOf(p, hit) also gives "SCL216" ✓. C16 applies.

### F13 · 325:1460 · ข้อมูลห้อง อาคาร (SCL216) → `#place`

Like F09, with bar, title and pin label all "SCL216".

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| P12 | Title when found by code | "SCL216" in the bar, title and pin | openPlace uses titleOf(p) without the hit, so it shows "Slope600 (SCL216)" in the bar and title (app.js:436-437) and on the pin (app.js:451) | pass the hit (same fix as P2/P3) | **must** |

### F14 · 325:1505 · ข้อมูลห้อง แผนผัง (SCL216) → same as F10 with SCL216 texts (P12 applies).

### F15 · 291:5033 · Search1 → identical to F07.

### F16 · 291:5055 · Search2, typed "SCL6" → `#list` search results

Rows: SCL607 with the **Clock** icon first (a recent), then SCL600, 602, 606, 609, 610, 612 with location_on 27×27 (at x 42). Dividers 216…696. Subs "อาคารปฏิบัติการพื้นฐานทางวิทยาศาสตร์ ชั้น 6".

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| C17 | Recent first with clock | SCL607 first, clock icon | code order, pin icon (search app.js:161-177; renderSearch app.js:386) | same fix as C13 (not counted again) | — |
| — | Result set | designer's sample subset | all matching rooms | ✓ (data) | — |

### F17 · 291:5129 · ข้อมูลห้อง อาคาร (SCL600) → `#place` (exact `get_design_context` values)

Exact values: bar text Prompt 400 14 #757575. Pin label Prompt 400 16 #fb8c3a at (211,241). Title Kanit 500 20 at (27,505). Sub Kanit 400 14, double spaces, `whitespace-pre`. Buttons Kanit 400 13, fills #fb8c3a / #fff3c4, r28. Sheet shadow 0 0 6 .1. Bar shadow 0 1 5 .25. "SCL600" in the bar and the title matches the app (no nickname). Rows P1, P4–P11 apply. No extra deltas.

### F18 · 291:5188 · ข้อมูลห้อง แผนผัง (SCL600) → `#place` + floor map (toggleLayers app.js:463-470; drawFloor app.js:291-318)

Figma floor plan: rooms #e0e0e0, walls #757575 ≈3 px, corridor #f5f5f5, outside #ffffff. Labels "SCL607/606/601" ≈14 px white with a #757575 outline. The destination room is **not** filled. Pin 26.1×38.3 and label "SCL600" (box 76.5×30.6, ≈20 px) in orange.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| FP1 | Room fill | #e0e0e0 (all rooms) | #d3d3d3; wc #d8e2ea; lift #bdbdbd (app.js:305) | #e0e0e0 | should |
| FP2 | Walls | #757575, ≈3 px | #8c8c8c, 1 px (app.js:306) | `color:'#757575', weight:3` | should |
| FP3 | Corridor and outside | corridor #f5f5f5, outside #ffffff | floor bbox #f3f3f3 with #9a9a9a stroke (app.js:297); corridor #fff (app.js:298); `#fmap` bg #d4d4d4 (style.css:29) | corridor #f5f5f5; `#fmap` and bbox #fff, no bbox stroke | should |
| FP4 | Room labels | always visible, ≈14 px, white fill with #757575 outline | 11 px #6f6f6f + white halo, hidden below zoom 2.4 (style.css:82, 249-250; app.js:277, 310) | 14 px, `color:#fff;-webkit-text-stroke:1px #757575` (or a 4-way #757575 text-shadow); show at the default zoom | should |
| FP5 | Destination room | no fill; pin + label only | #ffe3cc fill + #fb8c3a 2.5 stroke (app.js:305-306) | optional: drop (app-only aid) | minor |
| FP6 | Pin and label on the plan | pin 26×38, label ≈20 px | pin 32×48, label 15 px (style.css:77-78) | floor-plan pin variant 26×38; plan label 20 px | minor |
| FP7 | Lift and toilet boxes | white rounded tiles with grey pictograms (see F29) | grey boxes with text labels "ลิฟต์/บันได", "ห้องน้ำ" (app.js:307) | see FL4 | — |

### F19 · 291:5275 · เส้นทาง, fastest → `#preview` (openPreview / renderPreview app.js:590-620)

Figma OD card Group 10 (18,70 366×90, #f5f5f5, r12, shadow 0 1 5 .25): you-dot 20×20 (32,81); "ตำแหน่งของคุณ" (67,82 Kanit 13); dots 4×4 #d9d9d9 (x 40; y 107/113/119); divider Line 13 (63,114 w288, 1 px #000); location_on 25×25 #e65100 (29,127); "SCL600" (67,129); swap Arrow 5/6 (x 361 and 367, y 133–145, 12 px, 1 px black).

Mode buttons: Group 49 fast (16,509 70×70; **selected**: #ffe082 fill, #fb8c3a icon) and Group 48 shade (15,604 70×70; unselected: #fff fill, #d9d9d9 icon).

Map: active route #f57c00 ≈7 px; alternative route #fff3c4 ≈6 px with 1 px #f2a262 edges; pin 20.5×30 (101,214); entrance tile 11×11 (131,239); user 32×32 (299,599).

Sheet (0,703): grab (176,715 50×3 #757575 r4); title (25,727 Kanit 500 18); "5 นาที" (25,762 Kanit 16); "ระยะทาง:  780 เมตร" (171,762); close 22×22 (355,722); **full-bleed rule** Line 7 (0,802 w402, 1 px #757575); start button (25,815 352×41, icon 17×16 at 159,828, label 188,826).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| PV1 | OD-card right control | **swap ⇅** (two 12 px 1 px black arrows) beside the destination row, x 361–367, y 133–145 | "✕" back button, right 14, vertically centred, 16 px #444 (index.html:80; style.css:95, 138; app.js:1361) | swap control using icons/swap-up.svg + swap-down.svg (already in repo, unused); going back stays on the sheet × (`#pv-close`) | **must** |
| PV2 | Mode-button size and position | 70×70 at x 16; y 509 and 604 (gap 25); lower button 29 px above the sheet top (200 px above the screen bottom) | 56×56 at x 18, gap 14, `bottom:330px`, so about 130 px higher than Figma (style.css:139-141) | `.modebtns{left:16px;bottom:calc(200px + env(safe-area-inset-bottom,0px));gap:25px}` `.modebtn{width:70px;height:70px}` `svg{width:40px;height:40px}` | **must** |
| PV3 | Selected mode | fill #ffe082, icon #fb8c3a, **no ring** | fill #fff3c4 + 2 px #fb8c3a ring (style.css:142) | `.modebtn.on{background:#ffe082;box-shadow:0 0 6px rgba(0,0,0,.1)}` | **must** |
| PV4 | Unselected mode icon | #d9d9d9 | #9e9e9e (style.css:140) | `color:#d9d9d9` | should |
| PV5 | Fast icon | bolt with three speed lines on its left | plain bolt (index.html:83) | add the speed lines (or export Group 49) | should |
| PV6 | OD divider | 1 px #000, x 63–351, y 114 | none (index.html:76-81) | add (card-relative left 45, right 33, top 44) | should |
| PV7 | OD origin icon box | you-dot 20×20 at x 32; text x 67 | `.you-dot.sm` 14 px box, gap 14, text x 60 (index.html:77; style.css:70, 136) | 20 px icon box, `gap:15px` | should |
| PV8 | OD destination icon | Material location_on outline 25×25 #e65100 at x 29 | pin.svg (filled teardrop) 14×21 (index.html:79; style.css:94) | location_on SVG | **must** |
| PV9 | Sheet title | Kanit 500 **18** | 20 (`.sheet h2`, style.css:112) | `#pv-name{font-size:18px}` | should |
| PV10 | Stats layout | "ระยะทาง:" starts at x 171 (146 from "5 นาที") | flex gap 60, so ≈x 124, 47 px too far left (style.css:145) | `.pvstats{display:grid;grid-template-columns:146px auto;gap:0}` | **must** |
| PV11 | Rule above the start button | full-width 1 px #757575, 16 px under the stats, 13 px above the button | none (index.html:91-93) | add a full-bleed rule (`margin:16px -24px 13px`) | should |
| PV12 | Active route line | #f57c00, ≈7 px, no white casing | #fb8c3a 6 px over a white 10 px casing (app.js:615-616) | `color:'#f57c00', weight:7`; drop the casing | should |
| PV13 | Alternative route line | #fff3c4 ≈6 px with 1 px #f2a262 edges, opaque | #f5b26f 6 px, opacity .55 (app.js:614) | two polylines: `#f2a262` w8, then `#fff3c4` w6 | should |
| PV14 | OD dots | #d9d9d9 | #c4c4c4 (style.css:93) | #d9d9d9 | minor |
| PV15 | Start button | 352×41; icon–label gap 12 | 354×43, gap 10 (style.css:120, 124) | `#pv-start{height:41px;gap:12px}` | minor |
| PV16 | Grab and title spacing | grab at +12; title at +24 | grab +14; title +29 (style.css:144) | `.grab{margin:-10px auto 9px}` | minor |
| PV17 | Destination pin | 20.5×30 | 32×48 (app.js:617) | smaller pin variant on preview | minor |
| PV18 | Origin marker | 32 halo, ≈10 px dot | 64 / 20 (app.js:619) | small variant | minor |
| PV19 | Entrance tile | 11×11 white tile at the route end | none | optional | minor |
| PV20 | Stats text | "ระยะทาง:  780 เมตร" (two spaces) | one space (app.js:608) | optional | minor |
| PV21 | Mode-button shadow | soft, ≈0 0 6 .1 (estimate) | 0 1 5 .25 (style.css:140) | as PV3 | minor |
| — | Close (×) | close-sm.svg at x 355, top +19 | right 22, top 20 (style.css:114) | ✓ (≤ 2 px) | — |
| — | Shade icon | outlined sun behind a filled cloud | similar (index.html:84) | ✓ | — |

### F20 · 292:5913 · เส้นทาง, shade → `#preview` shade mode

Same as F19 (PV1–PV21 apply) with the states reversed: shade selected (#ffe082 / #fb8c3a), fast unselected (#fff / #d9d9d9). Title "เส้นทางหลบแดดหลบฝน", "9 นาที", "ระยะทาง:  1.1 กิโลเมตร". The fast route is drawn pale (#fff3c4 + edges) and the shade route orange.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| PV22 | Concept-mock label | none (known decision: app labels the mock) | "ตัวอย่างแนวคิด…" pill, text #a35a1e on #fff3c4 (index.html:90; style.css:146) | keep; off-palette brown. Consider #757575 or #e65100 text | minor |

### F21 · 291:5343 · ขั้นตอนเส้นทาง, fastest → `#preview` with steps open (`#pv-steps` visible)

Figma (exact): sheet (0,168 402×706). Grab (176,185). Title (25,197 Kanit 500 18). Stats (25 / 171, 232 Kanit 16). Close (355,192). **Rule** Line 7 (0,272 full width, #757575). "ขั้นตอน" (28,292 Kanit 18). Rows: title x 97 (Kanit 14), sub +24 (Kanit 12), icons ≈32 tall centred near x 57. Separators x 15–387 #e0e0e0 at 399/479/559/639/719 (pitch 80), none after the last row. **Rule** Line 7 at 802. Start button pinned at (25,815).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| ST1 | Start button position | stays at the screen bottom (y 815) under a full-bleed rule; the list scrolls above | the last item inside the scrolling sheet (index.html:93; style.css:143) | `#pv-start` sticky at the bottom (white backing + rule), or move it out of the scroll area | should |
| ST2 | Rule under the stats | full-bleed 1 px **#757575**, 16 px under the stats | h3 `border-top:1px solid #e3e3e3`, inset 24 px (style.css:147) | full-bleed #757575 rule; remove the h3 border | should |
| ST3 | Row pitch | 80 | ≈68 (padding 14/14 + 39; style.css:149) | `.steps li{padding:19px 4px 19px 14px}` | should |
| ST4 | Sheet height | top at y 168, so the OD card (bottom 160) stays visible | `max-height:74%` (top ≈ 26%) (style.css:143) | `#pv-sheet{max-height:calc(100% - 168px)}` | should |
| ST5 | Heading position | x 28, 20 px under the rule | x 24, margin 18 + padding 16 (style.css:147) | `.steps h3{margin:0;padding:20px 0 0 4px;border:0}` | minor |
| ST6 | Row separators | #e0e0e0, x 15–387 (wider than the text column); none after the last row | #e3e3e3, x 24–378, under every row (style.css:149) | `li{margin:0 -9px;padding-left:23px}` `li:last-child{border-bottom:0}` | minor |
| ST7 | Title to sub | sub top 24 under title top | 21 | `.steps li .s{margin-top:3px}` | minor |
| ST8 | Enter / arrive steps | not in Figma (walk, turn, U-turn, lift, stairs only) | "เข้าอาคาร N7" and "ถึง SCL600" use the filled map pin icon (app.js:547, 577, 632) | keep; use the location_on outline (#e65100, 25 px) for consistency | minor |
| — | Step icons | 1–2 px #fb8c3a, 32 tall | icons/step-*.svg, turn-*.svg (mirrored on purpose) | ✓ | — |
| — | Step texts and "100 เมตร" format | | TURN_T app.js:521; fmtDist app.js:49 | ✓ | — |

### F22 · 292:6058 · ขั้นตอนเส้นทาง, shade → same as F21 with shade texts. No further deltas.

### F23 · 291:4577 · เริ่มนำทาง (picker, empty) → `#list` pick mode (openList('pick') app.js:369-375; renderPick app.js:388-397)

Figma: back Group 88 (11,52 25×25, **black** thin arrow). From field Rectangle 34 (75,70 274×41 #f5f5f5 r≈12) with "ตำแหน่งของคุณ" (85,81 Kanit 13 #000). To field Rectangle 35 (75,118 274×41) with placeholder "เลือกจุดหมาย" (#bdbdbd). you-dot 20×20 (49,81). Dots #d9d9d9 (x 57; y 107/113/119). location_on 25×25 #e65100 (46,127). Swap Group 11 (367,109 6×12, 1 px black ⇅). "ล่าสุด" (27,184). Recent rows from y 208, pitch 96. Dividers 304/400/496.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| PK1 | Back arrow | top-left (11,52) 25×25, #000, above the fields | "←" glyph in grid column 1, vertically centred (≈y 106, 42 px too low), #757575 (index.html:39; style.css:51, 87) | absolute at left 11, top 52; #000; SVG | **must** |
| PK2 | Field box | x 75–349 (274×41), y 70 and 118 (gap 7), r≈12 | x 79–353, 40 tall, r10, first field top 56 (style.css:87-90) | see §4 S14 | should |
| PK3 | Destination icon | location_on 25×25 #e65100 | pin.svg 14×21 (index.html:43; style.css:94) | as PV8 | **must** |
| PK4 | Swap control | thin black ⇅ (two 12 px arrows), x ≈367–373, centred between the fields | "⇅" glyph 20 px #444 (index.html:45; style.css:95) | swap-up.svg + swap-down.svg | should |
| PK5 | Text inset | x 85 (10 px inside) | x 91 (padding 12) | `padding:0 10px` | minor |
| PK6 | Origin value | "ตำแหน่งของคุณ" shown as **black text** (a value) | empty input with a grey placeholder (app.js:370; index.html:41) | show it as a value, or style this placeholder #000 | minor |
| PK7 | Placeholder colour | #bdbdbd | browser default (≈#757575) | `.pickrow input::placeholder{color:#bdbdbd}` | minor |
| PK8 | Connector dots | #d9d9d9; overlay the icon column (no extra row height) | #c4c4c4; a grid row between the fields (style.css:92-93) | as PV14; position absolutely | minor |
| — | Recent list | as F07 (R1–R4 apply; C2–C6 row styling) | | | — |

### F24 · 297:58 · เริ่มนำทาง (typing "SCL6") → `#list` pick mode with query

Typed "SCL6" in the to-field: Kanit 13 **#757575**. Results: SCL607 (Clock, a recent) first, then pins. Row subs read "อาคาร ชั้น 6" (see §5).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| PK9 | Typed text colour | #757575 | #000 (style.css:90) | `color:#757575` while it is a query | minor |
| PK10 | Recent first with clock | yes | no (renderPick app.js:396) | as C13 | should |

### F25 · 318:487 · กำลังโหลด → `#loading` (startLoading app.js:654) (exact)

Ants 12×10, 18×15, 25×21, 35×30 at x 138/162/192/229, bottoms aligned at y 436, **gap 12**. Text Kanit 500 16 #fb8c3a, centred, top 448 (12 under the ants).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| LD1 | Ant spacing | 12 | 10 (style.css:159) | `.ants{gap:12px}` | minor |
| — | Ant assets, colour #e65100, text style | | icons/ant*.svg; style.css:163 | ✓ | — |
| — | Hop animation | static | style.css:160-162 | app-only motion; keep | — |

### F26 · 291:4611 · เริ่มนำทาง (outdoor navigation) → `#nav`, outdoor phase (startNav app.js:662; render app.js:837)

Figma: instruction card Rectangle 34 (26,70 350×90, #f5f5f5, r12, shadow ≈0 4 4 .25). Arrow 11 (x 64, y 100–132, #ff8c19). "เดินตรง" (106,88 Kanit 500 20). "200 เมตร" (106,123 Kanit 12). Route Vector 39: ≈20 px #fb8c3a band with 1 px #e65100 edges. User Group 62 (179,555 90×90: dot 28 #ffc107, halo .25, no ring). Compass FAB Group 35 (338,689 50×50, #fff7ed, needle #ff6a00).

Bottom bar Rectangle 32 (0,764 402×110, white, r28 top): grab (176,774 50×3 #757575); × Group 34 (23,791 60×60: 1 px #000 ring, ≈22 px × with ≈3 px black stroke); "15 นาที" (162,789 Kanit 500 28 #ff8c19); "2.5 กิโลเมตร" (166,835 Kanit 14).

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| N1 | Route band (outdoor) | ≈20 px #fb8c3a with 1 px #e65100 edges, no white casing | 7 px #fb8c3a over an 11 px white casing (app.js:676-677) | `#e65100` w22, then `#fb8c3a` w20 | **must** |
| N2 | Bottom-bar grab / steps trigger | 50×3 #757575 grab, centred 10 px under the bar top; there is no right-hand button | no grab; "⌃" button on the right (index.html:131; style.css:200; app.js:1373) | add the grab (tap opens the steps); remove "⌃" | **must** |
| N3 | Minutes | Kanit 500 28 #ff8c19 | 24 #fb8c3a (style.css:198) | `font-size:28px;line-height:42px;color:#ff8c19` | should |
| N4 | Card shadow | ≈0 4px 4px rgba(0,0,0,.25) (estimate) | 0 1 5 .25 (style.css:167) | `box-shadow:0 4px 4px rgba(0,0,0,.25)` | should |
| N5 | User marker in navigation | halo 90 px, dot 28 px, no ring | 64 / 20 with a white ring (app.js:237; style.css:73-74) | navigation variant 90 / 28, no ring | should |
| N6 | Compass FAB | 50×50 #fff7ed disc, #ff6a00 needle, right edge 14 px, bottom 25 px above the bar | missing; the sim controls sit in that area (style.css:180-181) | add (re-centre / heading-up); move `.simctl` (e.g. up or left) | should |
| N7 | Card x and text x | card x 26–376; text x 106 (icon centre 64, gap 26) | x 25–377; gap 22, text x 101 (style.css:166-167) | `left:26px;right:26px;gap:26px` | minor |
| N8 | Instruction sub | 12 px | 13 (style.css:172) | 12 | minor |
| N9 | Distance | 14 px | 13 (style.css:199) | 14 | minor |
| N10 | × button | 1 px #000 ring; drawn × ≈22 px, 3 px stroke | 1.5 px #333 ring; "✕" glyph 26 px (style.css:196; index.html:129) | `border:1px solid #000`; SVG × | minor |
| N11 | Bar height and layout | 110 tall (content occupies the top 92: × at +27, minutes top +25, distance top +71) | 92 + safe-area, padding 6 24 (style.css:194-195) | 92 is acceptable in a browser; align contents to Figma offsets | minor |
| N12 | Instruction arrow colour | #ff8c19 | #fb8c3a (step-straight.svg) | optional | minor |
| — | "โหมดจำลอง" badge, sim controls | test-only | index.html:118, 121-124 | keep; §3.3 | — |

### F27 · 291:4850 · ขั้นตอนเริ่มนำทาง → `#nav` steps sheet open (`#nav-steps`; app.js:1373)

Figma: sheet (0,225 402×649). Grab (178,235). × (23,256). Minutes (162,250). Distance (166,296). **Rule** Line 7 (0,335 full width, #757575). "ขั้นตอน" (28,355). Rows pitch 80 (titles 401…801). Separators x 15–387. No start button. The instruction card stays visible above.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| NS1 | Rule under the header | full-bleed #757575 | inset #e3e3e3 h3 border (style.css:147) | shared `.steps` CSS: same fix as ST2 (not counted again) | — |
| NS2 | Row pitch and separators | 80 px; #e0e0e0, x 15–387 | ≈68 px; #e3e3e3, x 24–378 (style.css:149) | shared CSS: same fix as ST3 / ST6 (not counted again) | — |
| NS3 | Sheet top | y 225 | `max-height:74%` (style.css:143) | `#nav-steps{max-height:calc(100% - 225px)}` | minor |
| NS4 | Current / done row states | none (all rows equal) | `.cur` #fff8ef, `.done` opacity .45 (style.css:155-156; app.js:625) | app-only state; keep or drop | minor |
| — | Header structure (× + minutes + distance, grab on top) | | index.html:134-135 | ✓ (N3/N9 sizes apply) | — |

### F28 · 291:4636 · นำทาง ในอาคาร (floor 1) → `#nav`, indoor phase

Figma: instruction card as F26. Floor plan. Route: **remaining** part (lift to user) is an orange band; the **travelled** part (entrance to user) is a pale #fff3c4 band with #e65100 edges. Floor pill Group 61 (14,706 116×42: #fff7ed, r12, light shadow; layers icon 22×24 #fb8c3a at +12; "ชั้น 1" 16 px #ff6a00 at +47; black chevron at +99). Compass (338,698). POI tiles: lift (−17,524 45×45) and toilet (152,184 40×40), white rounded tiles.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| FL1 | Indoor route band and travelled part | remaining: ≈18–20 px #fb8c3a + 1 px #e65100 edges; travelled: ≈16 px #fff3c4 + 1 px #e65100 edges | the whole route is 6 px #fb8c3a over a 10 px white casing (drawIndoorRoute app.js:699-700) | split the route at the current position; draw both bands as specified | **must** |
| FL2 | Floor pill colours | fill #fff7ed; label #ff6a00 16 px; icon #fb8c3a; chevron #000 thin | fill #fff3c4; everything #fb8c3a; label 15 px; "⌄" glyph in orange (style.css:182-185; index.html:125) | `background:#fff7ed` `#floorpill-t{color:#ff6a00;font-size:16px}` black SVG chevron | should |
| FL3 | POI tiles on the plan | white rounded tiles (≈34–45 px), #757575 pictograms (lift, stairs, toilet), light border | grey boxes with text labels hidden until zoom (app.js:305-310) | draw tiles at box centres (icons need exporting) | should |
| FL4 | Floor pill size and position | 116×42 at x 14; 16 px above the bar | auto width, 40 tall, x 13, bottom 108 (16 above the 92 px bar ✓) (style.css:182) | `width:116px;height:42px;left:14px;gap:13px` | minor |
| — | Compass FAB, card, bar | | | as N1–N12 | — |

### F29 · 325:917 · GPS (floor 6, indoor) → `#nav`, indoor phase on floor 6

Floor plan tokens as F18. Stair/lift core area #fff9e6 with POI tiles. Labels SCL601/606/607. Destination pin 23.8×35 + "SCL600" (box h28). Remaining band ≈18 px. Travelled thin band below the user. User 90/28. Pill "ชั้น 6". Compass. FP1–FP4, FL1–FL4 and N1–N12 apply.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| G1 | Lift/stair core | cream #fff9e6 behind the lift and stairs | lift box #bdbdbd (app.js:305) | #fff9e6 | minor |

### F30 · 291:4803 · เสร็จสิ้น → `#place` arrived state (arrive() app.js:810-826) + `#arrived` (index.html:141)

Figma: arrival card Rectangle 35 (26,70 350×90, #f5f5f5, r12, shadow as N4). Icon "map-point-tick-cutout" (45,92 45×45 #fb8c3a). "คุณมาถึงแล้ว" (106,98 Kanit 500 20). Floor plan with the SCL600 pin and label (no fill). Sheet (0,734): title (27,748 Kanit 500 20); sub (27,782 Kanit 14); finish button Group 92 (25,815 352×41; location_on outline 25×25 white at 135,823; label 169,826). **No photo, no ×, no search bar.**

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| A1 | Media in the sheet | none: the sheet is title + sub + button only (top at y 734) | thumbSVG still rendered (app.js:821), so the sheet is ≈200 px taller | hide `#place-thumb` in the arrived state (and un-hide in openPlace) | **must** |
| A2 | Arrival icon | 45×45 map pin with a tick cut-out, #fb8c3a | white "✓" in a 40 px orange circle (index.html:141; style.css:205) | new SVG (Figma 291:4839) | **must** |
| A3 | Finish-button icon | Material location_on **outline**, white, 25×25; gap 9 | pin.svg filtered white (filled), 18 tall, gap 10 (index.html:70; style.css:121, 127) | outline icon 25 px | should |
| A4 | Arrival card shadow and x | as N4 / N7 (text x 106) | bar shadow; text x 105 (style.css:203-205) | `box-shadow:0 4px 4px rgba(0,0,0,.25);left:26px;right:26px` | should |
| A5 | Sheet spacing | title top +14; sub +48; button 12 under the sub; 18 below the button; button 41 tall | +22; sub +58; button margin-top 14; height 43 (style.css:111-113, 120, 124) | `padding-top:14px` in this state; `#btn-finish{margin-top:12px;height:41px}` | minor |
| A6 | Search bar | hidden | still shown, covered by `.arrived` (z 520 over 500) (index.html:58) | hide it explicitly | minor |
| — | Destination on the plan | pin + label only | orange fill and stroke (app.js:824 via drawFloor) | FP5 | — |
| — | Texts "คุณมาถึงแล้ว", "เสร็จสิ้นการนำทาง" | | | ✓ | — |

### F31 · 297:147 · เริ่มนำทาง (picker after swap) → `#list` pick mode after swap (app.js:1335-1341)

Top field (you-dot) shows the placeholder "เลือกจุดหมาย"; bottom field (pin) shows "ตำแหน่งของคุณ". Icons stay put. The app swaps origin and destination and opens the preview when both are set. That is behavioural, not a visual change. PK1–PK8 apply.

### F32 · 292:5546 · นำทาง ในอาคาร (floor menu open) → `#nav` + `#floormenu` (app.js:1386-1398)

Figma floor menu Group 70 (14,518 50×176, #fff7ed, r12, 12 px above the pill): items 4, 3, 2, 1, G (16 px #000, 36 px pitch). The current floor is a 32×32 #fb8c3a circle with a white number. The pill chevron points **up** while open.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| FM1 | Menu shape | vertical capsule 50 wide, numbers only, 36 px rows, #fff7ed, r12 | white card 132 wide, "ชั้น N" pills 34 px (style.css:186-188; app.js:1391) | restyle as a capsule; label = floor number only | **must** |
| FM2 | Current floor | 32×32 #fb8c3a circle, white 16 px number | full-width orange pill (style.css:189) | circle | should |
| FM3 | Chevron when open | "^" (up) | always "⌄" (index.html:125) | flip on open | minor |
| FM4 | Menu position | left 14; bottom 12 px above the pill | left 13; bottom 156 (style.css:186) | `bottom:calc(162px + env(safe-area-inset-bottom,0px))` for a 108 px pill bottom | minor |
| — | Disabled floors and the "ชั้นอื่นยังไม่มีแผนผัง" note | not in Figma | style.css:190-191; app.js:1396 | app-only; keep (§3.2) | — |

### F33 · 325:1010 · GPS → identical to F29.

### F34 · 291:4713 · GPS หาย → `#dlgwrap` lost dialog (lose / dlgLost app.js:986-1012)

Figma: overlay Rectangle 47 (full frame, black 30%). Card Rectangle 48 (36,298 332×248, white, r≈10). Icon Group 76 (173,330 56×53: pin #fb8c3a with #e65100 dot + "!" #e65100). Title (119,395 Kanit 500 18 #e65100). Body (56,430 291×48: Kanit 14 #757575, line-height 24, centred; breaks after "…เพื่อทำการแทรก"). Buttons (56,484 and 207,484, 140×43, pill, gap 11): "ยกเลิก" #f5f5f5 / #424242 and "เปิดกล้อง" #fb8c3a / #fff, 16 px.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| D1 | Title colour | #e65100 | #fb8c3a (style.css:227) | `color:#e65100` | should |
| D2 | Body | 14 / 24 #757575 | 13, lh 1.5, #000 (style.css:228) | `font-size:14px;line-height:24px;color:#757575` | should |
| D3 | Overlay | one scrim, rgba(0,0,0,.30) | `#dim` (.32) **and** `.dlgwrap` (.35) shown together, ≈.56 combined, almost twice as dark (app.js:990; style.css:32, 225) | one scrim at .30 (don't show `#dim` under the dialog) | **must** |
| D4 | Card radius | ≈10 | 6 (style.css:226) | 10 | minor |
| D5 | Card rhythm | icon top +32; title 12 under the icon; body 8 under the title; buttons 6 under the body; bottom 19 | padding 26/20/20; h3 margin 8 0 6; buttons margin-top 14 (style.css:226-234) | `.dlg{padding:32px 20px 19px}` `h3{margin:12px 0 8px}` `.dlg-btns{margin-top:6px}` | minor |
| D6 | Buttons | 140×43, gap 11, 16 px; ghost text #424242 | height 42, gap 12, 15 px, ghost #333 (style.css:234-236) | 43 / 11 / 16 / #424242 | minor |
| D7 | Icon | pin ≈32×47 + "!" in #e65100 (group 56×53) | pin 44 px + bold "!" 40 px in #fb8c3a (LOST_ICO app.js:1006; style.css:229) | "!" #e65100; pin height ≈47 | minor |
| D8 | Body copy | "…เพื่อทำการแทรก สัญญาณอีกครั้ง" (a space before สัญญาณ, which sets the line break) | no space (app.js:1009) | optional: add the space | minor |
| — | Extra links "ไม่ได้อยู่ที่ N7? ใช้รูปป้ายตัวอย่าง" and "พิมพ์เลขห้องแทน" | not in Figma | app.js:1010 | app-only (§3.2) | — |
| — | Titles, buttons, order (cancel left, camera right) | | app.js:1008-1011 | ✓ | — |

### F35 · 325:1086 · GPS หาย2 → `#dlgwrap` "กำลังแทรกสัญญาณใหม่" (readSign app.js:1068-1070)

Figma: card Rectangle 48 (64,323 **273×184**, r≈10). Ants (x 139–265, bottoms ≈398, gap ≈12). Title (112,410 Kanit 500 18 #e65100). "กรุณารอสักครู่..." (156,445 Kanit 14 #757575, box h24). No buttons, no photo.

| # | Element | Figma | App now | Change | Tag |
|---|---|---|---|---|---|
| D9 | Card width | 273 (narrower than the 332 alert) | max-width 332 (style.css:226) | busy variant `max-width:273px` | minor |
| D10 | Photo preview | none | shows the sign photo, max-height 150 (app.js:1070; style.css:230) | app-only feedback; keep or hide | minor |
| D11 | Ant gap inside the dialog | ≈12 | 10 (`.ants` style.css:159) | same fix as LD1 (not counted again) | — |
| — | Title and sub colours | | | covered by D1 / D2 | — |

### F36 · 325:1184 · GPS → identical to F29.
### F37 · 325:1259 · GPS หาย2 → identical to F35.
### F38 · 325:1341 · GPS หาย (photo failed) → dlgLost(true)

Title "ไม่สามารถจับรูปถ่ายได้" and primary "ลองอีกครั้ง" match the app (app.js:1008, 1011). D1–D8 apply.

---

## 3. Gaps

### 3.1 Figma screens or states the app lacks entirely

1. **Compass / re-centre FAB** on all navigation frames (F26, F28, F29, F32–F38) and as the first home FAB in F00 (N6).
2. **Room photo** in the place sheet (P1). There is no photo source in the repo; Figma uses one placeholder photo for every room.
3. **Travelled-route styling** (pale #fff3c4 band) indoors and outdoors (FL1).
4. **Floor-plan POI tiles** (lift, stairs, toilet) and the cream core area (FL3, G1).
5. **Swap control** in the route-preview OD card (PV1), and the black divider inside that card (PV6).
6. **Grabber** on the navigation bottom bar (N2).
7. **Capsule floor menu** with a circled current floor (FM1, FM2).
8. **Recent-first ordering with clock icons** inside search and category results (C13).
9. **Alias labels in recents** ("LX") and single-line building recents (R1, R2).
10. **Entrance tile** on the route-preview map (PV19).

### 3.2 App UI that is not in Figma (beyond the test-only list)

- "หาตำแหน่งไม่เจอ?" pill (`#lostbtn`, index.html:127; style.css:192-193). Manual trigger for the lost dialog.
- Dialog links "พิมพ์เลขห้องแทน" and the sim-only "ไม่ได้อยู่ที่ N7? ใช้รูปป้ายตัวอย่าง" (app.js:1010); the typed-room dialog (typeRoom app.js:1019); OCR confirm dialogs "อ่านป้ายได้ว่า …" / "ป้ายนี้มีเลขห้องหลายเลข" (app.js:1106-1115); the team-only OCR log dialog (index.html:181).
- Photo preview inside the "กำลังแทรกสัญญาณใหม่" dialog (D10).
- Toasts (style.css:240-241).
- "ยังไม่มีแผนผังชั้น" pill in results (app.js:414), the "อาคารนี้ยังไม่มีแผนผังภายใน…" note in the place sheet (app.js:443), and the empty-results message (app.js:405).
- Disabled floors and the "ชั้นอื่นยังไม่มีแผนผัง" note in the floor menu (app.js:1391-1396).
- "ตำแหน่งของคุณ" row at the top of the picker's from-list (renderPick).
- Current / done highlighting in step lists (NS4).
- Building highlight polygon on the campus map (P10) and the destination-room fill on floor plans (FP5).
- "⌃" expand button on the nav bar (N2) and "✕" in the OD card (PV1). Both replace Figma controls.
- Campus building labels (code + Thai name) on the Leaflet map (app.js:262; style.css:79-81). This is base-map content.
- "ถัดไป" button inside the instruction card in real-walk mode (index.html:108).
- Lift card text "ออกจากลิฟต์ที่ชั้น N แล้วหรือยัง?" (index.html:110-113) and the instruction sub "เมื่อถึงชั้นแล้วกดปุ่ม "ถึงชั้นแล้ว"" (app.js:862). Both pair with the test-only lift buttons.
- Arrival check card "ถึง … แล้วใช่ไหม?" (index.html:114-117), part of the real-walk tracker.
- Hop animation on the loading ants (style.css:160-162).
- **Uncommitted work in app.js:** a floor-choice dialog "คุณอยู่ในอาคาร N7 แล้วหรือยัง?" with a `.floorgrid` of `btn ghost` buttons. `.floorgrid` has no CSS, and `.btn.ghost` is only styled inside `.dlg-btns` (style.css:236), so these buttons render without a fill in `.dlg-extra`. If it ships, give them the Figma ghost style (#f5f5f5 fill, #424242 text, 43 px pill).

### 3.3 Test-only UI: styling inconsistent with the design system (keep the UI, consider aligning)

- Off-palette colours: `.badge` and `.warn` use #6b4a00 text and a #f0c66b border (style.css:177-178, 253). `.mock` uses #a35a1e (style.css:146). `.lostbtn` uses #555, `.testerline` #555, `.scenarios .s` #333, `.consent label` #333 (style.css:193, 261, 221, 257). The Figma greys are #757575 / #424242 / #000.
- Off-scale font sizes: 11, 11.5, 12.5, 13.5, 15 and 24 px are used across welcome, consent, task strip, lift card and badges (style.css:98, 175, 177, 211, 222, 246, 255). The Figma scale is 12 / 13 / 14 / 16 / 18 / 20 / 28.
- Radii 14 and 10 (`.modeswitch`, `.scenarios li button`, `.warn`, consent inputs; style.css:212-217, 253, 258) vs Figma 12 / 16 / 28.
- Consent inputs have a 1 px #e3e3e3 border and r10 (style.css:258). Figma fields (picker) are borderless #f5f5f5 with r≈12.
- Scenario number badges use `--orange-tint`. They change automatically when the token becomes #ffd7b3 (C5).
- The lift card and arrival-check card are white (#fff) with the light bar shadow (style.css:173-175). The instruction card they sit under is #f5f5f5 with the heavier card shadow. Use #f5f5f5 + card shadow for visual unity.
- The "?" help FAB is 44 px with weight 600 (style.css:67-68). Other FABs are 55 px; 44 is acceptable for a secondary control.
- Glyph icons (`❚❚`, `▶`, `×8`, `⇅`, `✕`, `⌃`, `⌄`, `✓`, `←`) render in system fallback fonts because Kanit and Prompt lack them, so they look different per phone. Replace the non-test ones with SVGs (listed in §4).

---

## 4. Prioritised change list (top 25), grouped by file

Order inside each file is priority order. The tag in brackets is the highest tag the item fixes. Exact values come from §1–§2.

### icons/ (assets)

**ICON-1 [must] Fix `icons/search-clear.svg`** (C1). Replace its body with:
`<circle cx="10" cy="10" r="9.5" stroke="#757575"/><path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" stroke="#757575"/>` (20×20, fill none).

**ICON-2 [must] Add the missing icons** (H6, A2, PV5, C6/R3/PV8/PK3/A3, H5, N6, FL3): navigation arrowhead (#ff6a00, ≈18×20), map-pin-with-tick (#fb8c3a, 45×45), fast-mode bolt with speed lines, Material **location_on** and **schedule** outlines (24-unit paths, stroke #e65100), chip building and fork+spoon (#757575), compass needle (#ff6a00), and POI tiles (lift, stairs, toilet). Figma node ids are listed in §1.7. Export them when the Figma quota allows, or redraw them.

### style.css

**CSS-1 [should] Tokens** (style.css:3-15). Change `--orange-tint:#ffd7b3; --line:#e0e0e0; --map-bg:#f7f6f6`. Add `--orange-deep:#e65100; --orange-vivid:#ff6a00; --orange-nav:#ff8c19; --tint:#fff7ed; --amber-soft:#ffe082; --rule:#757575; --disc:#d9d9d9; --card-shadow:0 4px 4px rgba(0,0,0,.25); --fab-shadow:0 0 6px rgba(0,0,0,.25); --scrim:rgba(0,0,0,.30)`.

**CSS-2 [must] Result rows** (style.css:98-107; C2–C10, R4).
```css
.listtitle{padding:24px 27px 0;font:400 16px/24px "Kanit",sans-serif}
.results button{gap:21px;padding:24px 10px 24px 22px}
.results li:last-child{border-bottom:0}
.results .ic{background:#ffd7b3}
.results .ic svg{width:25px;height:25px}
.results .t{font:400 18px/27px "Kanit",sans-serif;color:#000}
.results .s{font-size:14px;line-height:21px;color:#000;margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.results button > span:last-child{min-width:0}
```

**CSS-3 [must] Chips** (style.css:53-60 + index.html:29; H1–H5). Also change the 4th chip text in index.html:29 from "หอพัก" to **"หอหญิง"**. Confirm with the team first, since the app's dorm category holds S5 and S6.
```css
.chips{top:calc(132px + env(safe-area-inset-top,0px));gap:16px}
.chips button{background:#f5f5f5;color:#757575;font:400 14px/21px "Kanit",sans-serif;padding:0 18px 0 19px;gap:12px}
.chips button[data-cat=food],.chips button[data-cat=dorm]{min-width:120px;padding-left:18px}
```
Use icon sizes 13×25 (building) and 18×26 (food) in #757575.

**CSS-4 [must] Route-mode buttons** (style.css:139-142; PV2–PV4, PV21).
```css
.modebtns{left:16px;bottom:calc(200px + env(safe-area-inset-bottom,0px));gap:25px}
.modebtn{width:70px;height:70px;color:#d9d9d9;box-shadow:0 0 6px rgba(0,0,0,.1)}
.modebtn svg{width:40px;height:40px}
.modebtn.on{background:#ffe082;color:#fb8c3a;box-shadow:0 0 6px rgba(0,0,0,.1)}
```

**CSS-5 [must] Navigation bar** (style.css:194-200; N2, N3, N9–N11).
```css
.navbar .grab{position:absolute;top:10px;left:50%;margin:0 0 0 -25px}
.navstat b{font-size:28px;line-height:42px;color:#ff8c19}
.navstat span{font-size:14px}
.xbtn{border:1px solid #000}
```
Remove `.expand`.

**CSS-6 [should] OD card** (style.css:134-138; PV6, PV7, PV14).
```css
.odrow{gap:15px}
.odrow > :first-child{width:20px;flex:none;display:grid;place-items:center}
.odcard .dots i{background:#d9d9d9}
.odcard .rule{position:absolute;left:45px;right:33px;top:44px;height:1px;background:#000}
.odcard .swap{right:11px;top:63px;transform:none}
```
The swap control is two 12 px arrows; see HTML-1.

**CSS-7 [must] Route sheet and steps** (style.css:143-156; PV9–PV11, PV15, PV16, ST1–ST7, NS1–NS3).
```css
#pv-name{font-size:18px}
.grab{margin:-10px auto 9px}
.pvstats{display:grid;grid-template-columns:146px auto;gap:0}
.sheet .rule{height:1px;background:#757575;margin:16px -24px 13px}
#pv-start{height:41px;gap:12px;position:sticky;bottom:0}
#pv-sheet{max-height:calc(100% - 168px)}
#nav-steps{max-height:calc(100% - 225px)}
.steps{border-top:1px solid #757575;margin:16px -24px 0;padding:0 24px}
.steps h3{margin:0;padding:20px 0 0 4px;border:0}
.steps li{padding:19px 4px 19px 23px;margin:0 -9px;border-bottom:1px solid #e0e0e0}
.steps li:last-child{border-bottom:0}
.steps li .s{margin-top:3px}
```
For `position:sticky` on `#pv-start`, give it a white backing and put the rule just above it.

**CSS-8 [should] Place sheet** (style.css:110-127; P1, P4–P7).
```css
#place-sheet{padding:21px 24px calc(30px + env(safe-area-inset-bottom,0px)) 27px}
.sheet .sub{margin:4px 0 16px}
.thumb{height:203px;border-radius:0}
.btnrow{margin-top:22px}
#btn-route{gap:14px} #btn-route img{width:26px;height:24px}
#btn-start{gap:12px} #btn-start img{width:17px;height:16px}
```

**CSS-9 [must] Dialog** (style.css:225-237 + app.js; D1–D11).
```css
.dlgwrap{background:rgba(0,0,0,.30)}
.dlg{border-radius:10px;padding:32px 20px 19px}
.dlg h3{color:#e65100;margin:12px 0 8px}
.dlg p{font-size:14px;line-height:24px;color:#757575}
.dlg-btns{gap:11px;margin-top:6px}
.dlg-btns .btn{height:43px;font-size:16px}
.dlg-btns .btn.ghost{color:#424242}
.dlg.busy{max-width:273px}
```
Companion edits in app.js:
- lose() (app.js:990): don't show `#dim` while `#dlgwrap` is open, so there is one .30 scrim.
- LOST_ICO (app.js:1006): make the "!" #e65100 and the pin ≈47 px tall.
- readSign (app.js:1069-1070): add class `busy` to `.dlg` for the relocating dialog.

**CSS-10 [must] Floor pill and floor menu** (style.css:182-191 + app.js:1386-1398; FL2, FL4, FM1–FM4).
```css
.floorpill{left:14px;width:116px;height:42px;padding:0 12px;gap:13px;background:#fff7ed;color:#fb8c3a;font-size:16px;box-shadow:0 0 4px rgba(0,0,0,.1)}
#floorpill-t{color:#ff6a00}
.floorpill .chev{margin-left:auto;color:#000}
.floormenu{left:14px;width:50px;padding:2px 0;gap:4px;background:#fff7ed;border-radius:12px;bottom:calc(162px + env(safe-area-inset-bottom,0px))}
.floormenu button{width:32px;height:32px;margin:0 auto;padding:0;border-radius:50%;text-align:center;font-size:16px;color:#000}
.floormenu button.on{background:#fb8c3a;color:#fff}
```
This gives 32 px buttons with a 4 px gap, i.e. the 36 px Figma pitch. In app.js (wire floorpill, app.js:1391), make the button text the floor number only (`f`, not `ชั้น ${f}`). Toggle a class on `#floorpill` while the menu is open so the chevron points up.

**CSS-11 [should] Instruction and arrival cards, user marker** (style.css:166-172, 203-205, 73-76; N4, N5, N7, N8, A4, H11).
```css
.instr,.arrived{left:26px;right:26px;box-shadow:0 4px 4px rgba(0,0,0,.25)}
.instr{gap:26px}
.instr-s{font-size:12px}
.me-marker i{box-shadow:none}
.me-marker.nav{width:90px;height:90px}
.me-marker.nav i{width:28px;height:28px}
```
In app.js, make meIcon (app.js:237) emit `me-marker nav` for the markers on `fmap` / `cmap` while navigating.

**CSS-12 [should] List search field and home FABs** (style.css:46-51, 62-66; C7, C11, C12, H7–H10, H17).
```css
.searchbar input{font:400 16px "Kanit",sans-serif;color:#757575}
.searchbar input::placeholder{font:400 14px "Prompt",sans-serif;color:#757575}
.fab{right:13px;width:55px;height:55px;box-shadow:0 0 6px rgba(0,0,0,.25)}
.fab-go{background:#fff7ed}
.fab-locate .halo{width:34px;height:34px;border-radius:50%;background:#fff0c3;display:grid;place-items:center}
.fab-locate .halo i{width:11px;height:11px;border-radius:50%;background:#ffc107}
```

**CSS-13 [must] Picker head** (style.css:87-95; PK1, PK2, PK5, PK7, PK8).
```css
.pickhead{position:relative;display:block;height:167px;padding:0}
#pick-back{position:absolute;left:11px;top:52px;width:25px;height:25px;color:#000}
.pickfields{position:absolute;left:49px;top:70px;display:grid;gap:7px}
.pickfields .dots{position:absolute;left:8px;top:37px;margin:0}
.pickrow{gap:6px}
.pickrow input{flex:none;width:274px;height:41px;border-radius:12px;padding:0 10px}
.pickrow input::placeholder{color:#bdbdbd}
#pick-swap{position:absolute;left:365px;top:109px}
```

### index.html

**HTML-1 [must] OD card** (index.html:76-81; PV1, PV6, PV8). Replace `<button class="swap" id="pv-back">✕</button>` with a swap button made of `icons/swap-up.svg` (rotated to point up) and `icons/swap-down.svg` (rotated to point down), 12 px tall, 6 px apart. Add `<i class="rule"></i>`. Replace `pin.svg` on line 79 with the location_on icon. Rewire `#pv-back` in app.js:1361 to swap instead of going back.

**HTML-2 [must] Navigation bar** (index.html:128-132; N2). Add `<div class="grab" id="nav-grab"></div>` inside `.navbar` and remove `<button class="expand" id="nav-expand">`. Wire the grab to open the steps, as app.js:1373 does today.

**HTML-3 [must] Arrival and home icons** (index.html:141, 33, 32; A2, H6, H17). Swap "✓" for the 45×45 pin-with-tick SVG. Use the arrowhead SVG in `#btn-go`. Change `#btn-locate` to `<span class="halo"><i></i></span>`.

**HTML-4 [must] Compass FAB, mode icon, glyphs** (N6, PV5, FL2, PK1, PK4, C11). Add `<button class="fab fab-compass">` in `#nav` (50×50, `right:14px`, 25 px above the bar; move `.simctl` up or left). Add the speed lines to the fast-mode SVG (line 83). Replace the glyphs `⌄` (125), `←` (39, 48) and `⇅` (45) with SVGs.

### app.js (line numbers at commit 8878cd8)

**JS-1 [must] Route bands** (startNav app.js:676-677; drawIndoorRoute app.js:699-700; N1, FL1). Outdoor: `L.polyline(pts,{color:'#e65100',weight:22})` then `{color:'#fb8c3a',weight:20}`, with no white casing. Indoor: split at the current position. Travelled part: `#e65100` w18 under `#fff3c4` w16. Remaining part: `#e65100` w20 under `#fb8c3a` w18. Redraw the split in `render()` (app.js:837) or on each step.

**JS-2 [must] Arrived state** (arrive app.js:821; A1). Set `$('#place-thumb').hidden = true` instead of re-rendering it, and un-hide it in openPlace (app.js:439). Also hide `#place-bar` (A6) and apply the A5 spacing via a class such as `#place.arrived`.

**JS-3 [should] Floor-plan styling** (drawFloor app.js:297-310; thumbSVG app.js:480-484; FP1–FP4, G1). Rooms `fillColor:'#e0e0e0'`, walls `color:'#757575', weight:3`, corridor `#f5f5f5`, background and bbox `#fff` with no stroke, core `#fff9e6`. Labels visible at the default zoom. Drop `.far` hiding (app.js:277, 310; style.css:249-250).

**JS-4 [must] List icons, recents, ordering** (ICO app.js:398-401; recents / pushRecent app.js:218-225; renderResults app.js:403-416; renderSearch / renderPick / openList app.js:356-397; C6, C13, C14, C16, C17, R1–R3, PK10). Use Material location_on and schedule outlines in `#e65100` at 25 px. Store `{id,label}` in recents and show the label. Recents rows for buildings have no subtitle. In search and category results, list recent matches first with the clock icon.

**JS-5 [must] Place texts** (choose app.js:421-429; openPlace app.js:433-451; P2, P3, P12). Pass the search hit into openPlace. Bar text = the label the user picked. Title = `titleOf(p, hit)`. Pin label = `p.code` for rooms.

**JS-6 [should] Preview route lines** (renderPreview app.js:614-616; PV12, PV13). Active: `{color:'#f57c00',weight:7}` with no casing. Alternative: `{color:'#f2a262',weight:8}` then `{color:'#fff3c4',weight:6}`, opacity 1.
---

## 5. Ambiguities and values I could not determine

- **Status bar and home indicator.** Figma tops (y 70) include the iOS status bar and bottoms include the home indicator. The app copies the 70 px tops literally. In a browser that leaves ≈54 px of empty band above the search bar. This is a known decision, so it is not flagged. If the team wants the same *visual* gap as the phone mock-up, `top: 16px + env(safe-area-inset-top)` would be the browser equivalent.
- **Home FAB variants.** F00 has a compass FAB where F01/F02 have the locate FAB. I treated F01/F02 (locate) as current.
- **Field leading icon while typing.** F08/F12 show a magnifier, the other list frames a back arrow. I kept the back arrow.
- **Picker row subtitles "อาคาร ชั้น 6"** (F23/F24/F31) look like a designer placeholder. The full building name used in F07/F16 and by the app is kept.
- **Room photo** (P1): Figma uses one classroom photo for every room (also in the SCL600 frames). It is unclear whether the design intends per-room photos, so it needs a product decision. No photo assets exist in the repo.
- **Floor-plan wall colour.** F10/F14 (Slope600) use near-black walls; F18/F29/F30 use #757575. I followed the later frames.
- **Floor menu length.** Figma shows 5 floors (G–4) for a sample building. N7 has 11 (B, 1–10). At 36 px per row the capsule would be 396 px tall. Show only mapped floors, or scroll.
- **Estimated, not exact:** the instruction/arrival card shadow (≈0 4 4 .25), FAB shadow for the home FABs (inferred from layers-bg.svg), mode-button shadow (≈0 0 6 .1), floor-pill shadow, dialog radius (≈10), picker radius (≈12), route-band widths (≈20/18/16 px measured at the mock-up zoom; Leaflet weights are screen px, so they render the same width at any zoom), list title weight (400 vs 500), floor-pill and floor-menu font family, and the "!" glyph size in the dialog icon.
- **Nav orange #ff8c19 vs brand #fb8c3a.** Figma uses both. Visually close; whether the difference is deliberate is unknown.
- **Chip label "หอหญิง" vs "หอพัก".** The app's `dorm` category contains S5/S6; check whether "หอหญิง" is accurate before changing the text.
- **Hidden Figma layers** (Group 70, floor menu, hidden in most nav frames) have no rendered colours except in F32, which is where the floor-menu values come from.
- **Base map.** Figma's maps are screenshots of a third-party map. Colour matching (H14) is optional and only approximate.
- **app.js is moving.** Line numbers are for commit 8878cd8. The uncommitted refactor touches startNav, drawIndoorRoute, enterLift, render and the floor menu, so apply JS-1 and the app.js parts of CSS-9, CSS-10 and CSS-11 to whatever those functions look like once that work lands.
