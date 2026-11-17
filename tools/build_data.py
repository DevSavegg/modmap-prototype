"""Build the prototype's data files.

python tools/build_data.py <overpass_campus_raw.json> <N7-Pilot/data dir>

Writes data/campus.json (OpenStreetMap extract, ODbL), data/places.json (buildings + rooms + aliases)
and data/n7.json (schematic floors B, 1-10 + indoor walk graph). The schematic keeps only room boxes,
the corridor, the lift core box and door positions: no walls traced from the blueprints are published.

Floors 2 and 6 were reviewed by three people and are built exactly as before (their only additions are
doors[code].more and lift.box). The other floors are drafts ("draft": true) built from each floor's
access.json (tools/extract_floor.py) and data/map/lift_core.json (tools/lift_core.py) in N7-Pilot.
"""
import csv, json, math, re, sys
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data"
raw_path, pilot = Path(sys.argv[1]), Path(sys.argv[2])

R = 6371008.8
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

r6 = lambda v: round(v, 6)

# ---------------------------------------------------------------- campus (OSM)
osm = json.load(open(raw_path, encoding="utf-8"))["elements"]
nodes = {e["id"]: (e["lat"], e["lon"]) for e in osm if e["type"] == "node"}
ways = [e for e in osm if e["type"] == "way" and "tags" in e and all(n in nodes for n in e["nodes"])]

ROAD_MAJOR = {"primary", "secondary", "tertiary", "secondary_link", "tertiary_link"}
ROAD_MINOR = {"residential", "service", "unclassified", "living_street", "track", "services"}
ROAD_PATH = {"footway", "path", "pedestrian", "steps", "corridor", "cycleway"}
GREEN = {"grass", "park", "recreation_ground", "meadow", "village_green", "garden", "pitch", "wood", "scrub", "grassland", "forest"}

buildings, roads, water, green, waterlines = [], [], [], [], []
for w in ways:
    t = w["tags"]
    pts = [[r6(nodes[n][0]), r6(nodes[n][1])] for n in w["nodes"]]
    closed = w["nodes"][0] == w["nodes"][-1]
    if "building" in t and closed:
        buildings.append({"osm": w["id"], "name": t.get("name", ""), "name_en": t.get("name:en", ""),
                          "ref": t.get("ref", ""), "poly": pts})
    elif "highway" in t:
        h = t["highway"]
        cls = "major" if h in ROAD_MAJOR else "path" if h in ROAD_PATH else "minor" if h in ROAD_MINOR else None
        if cls:
            roads.append({"c": cls, "pts": pts, "name": t.get("name", "")})
    elif closed and (t.get("natural") == "water" or t.get("landuse") in ("reservoir", "basin") or "water" in t):
        water.append(pts)
    elif "waterway" in t and not closed:
        waterlines.append(pts)
    elif closed and (t.get("landuse") in GREEN or t.get("leisure") in GREEN or t.get("natural") in GREEN):
        green.append(pts)

# walk graph: every road class people can walk on
adj = defaultdict(dict)
for w in ways:
    h = w["tags"].get("highway")
    if h not in ROAD_MAJOR | ROAD_MINOR | ROAD_PATH or w["tags"].get("foot") == "no" or w["tags"].get("access") == "no":
        continue
    for a, b in zip(w["nodes"], w["nodes"][1:]):
        d = hav(nodes[a], nodes[b])
        adj[a][b] = adj[b][a] = d
# largest connected component
seen, best = set(), []
for s in adj:
    if s in seen:
        continue
    comp, stack = [], [s]
    seen.add(s)
    while stack:
        u = stack.pop(); comp.append(u)
        for v in adj[u]:
            if v not in seen:
                seen.add(v); stack.append(v)
    if len(comp) > len(best):
        best = comp
idx = {n: i for i, n in enumerate(best)}
gnodes = [[r6(nodes[n][0]), r6(nodes[n][1])] for n in best]
gedges = sorted({(min(idx[a], idx[b]), max(idx[a], idx[b]), round(d, 1))
                 for a in best for b, d in adj[a].items() if b in idx})

# Entrances checked on site by the team. Each one becomes a graph node, joined to the nearest path by
# splitting that path's edge, so routes end at the real door instead of the path point closest to the outline.
ENTRANCE_FIX = {
    "N7": [13.653671, 100.494731],   # south side, ~7 m east of the building centre (marked by the lead, 16 Nov)
}
KXm, KYm = 111320 * math.cos(math.radians(13.65)), 110540
def _pxy(ll):
    return ll[1] * KXm, ll[0] * KYm
def add_entrance(pt):
    """Split the edge nearest to pt at the foot of the perpendicular and hang pt off it. Returns pt's node index."""
    px, py = _pxy(pt)
    best = None
    for k, (a, b, _) in enumerate(gedges):
        ax, ay = _pxy(gnodes[a]); bx, by = _pxy(gnodes[b])
        vx, vy = bx - ax, by - ay; L2 = vx * vx + vy * vy or 1e-9
        t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / L2))
        qx, qy = ax + t * vx, ay + t * vy
        d = math.hypot(px - qx, py - qy)
        if best is None or d < best[0]:
            best = (d, k, t, qx, qy)
    d, k, t, qx, qy = best
    a, b, _ = gedges[k]
    if t <= 0.02 or t >= 0.98:
        q = a if t <= 0.02 else b
    else:
        q = len(gnodes); gnodes.append([r6(qy / KYm), r6(qx / KXm)])
        gedges[k] = (min(a, q), max(a, q), round(hav(gnodes[a], gnodes[q]), 1))
        gedges.append((min(q, b), max(q, b), round(hav(gnodes[q], gnodes[b]), 1)))
    n = len(gnodes); gnodes.append([r6(pt[0]), r6(pt[1])])
    gedges.append((min(q, n), max(q, n), round(max(0.5, d), 1)))
    return n

def centroid(poly):
    a = cx = cy = 0.0
    for (y0, x0), (y1, x1) in zip(poly, poly[1:]):
        f = x0 * y1 - x1 * y0
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
    if abs(a) < 1e-15:
        return [sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)]
    return [cy / (3 * a), cx / (3 * a)]

def poly_area_m2(poly):
    lat0 = math.radians(poly[0][0])
    xy = [((p[1]) * 111320 * math.cos(lat0), p[0] * 110540) for p in poly]
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(xy, xy[1:]))) / 2

for b in buildings:
    b["c"] = [r6(v) for v in centroid(b["poly"])]
    b["area"] = round(poly_area_m2(b["poly"]))

# ---------------------------------------------------------------- building register (research/04) + matching
REG = [
    # code, Thai, English, aliases, categories, OSM match (regex on name/name_en/ref)
    ("N1", "อาคารศูนย์ต้อนรับ", "Welcome Center", [], ["N"], r"^N1$"),
    ("N2", "อาคารสำนักงานอธิการบดี", "Office of the President", [], ["N"], r"^N2$"),
    ("N3", "อาคารภาควิชาเคมี", "Dept. of Chemistry", ["CH"], ["N"], r"\bN3\b"),
    ("N4", "อาคารภาควิชาฟิสิกส์-คณิตศาสตร์", "Dept. of Physics–Mathematics", ["SC", "ตึกฟิสิกส์"], ["N"], r"\bN4\b"),
    ("N5", "อาคารศูนย์เครื่องมือวิทยาศาสตร์เพื่อมาตรฐานและอุตสาหกรรม", "Scientific Instrument Center", [], ["N"], r"\bN5\b"),
    ("N6", "อาคารภาควิชาจุลชีววิทยา", "Dept. of Microbiology", ["MI"], ["N"], r"^N6$"),
    ("N7", "อาคารปฏิบัติการพื้นฐานทางวิทยาศาสตร์", "Fundamental Science Laboratory Building", ["SCL", "ตึก SCL"], ["N"], r"^N7$|Slope N7"),
    ("N8", "สถานีสูบน้ำ", "Water pump station", [], ["N"], r"^N8$"),
    ("N9", "อาคารสถาบันวิทยาการหุ่นยนต์ภาคสนาม", "Institute of Field Robotics", ["FIBO"], ["N"], r"Field Robotics"),
    ("N10", "อาคารสำนักหอสมุด", "KMUTT Library", ["LIB", "หอสมุด", "ห้องสมุด"], ["N"], r"\bN10\b"),
    ("N11", "อาคารคณะเทคโนโลยีสารสนเทศ", "School of Information Technology", ["SIT", "ตึก IT"], ["N"], r"\bN11\b"),
    ("N12", "อาคารอเนกประสงค์", "Utility Exchange", ["UX"], ["N"], r"^N12$"),
    ("N13", "อาคาร Workshop & Green House", "Workshop & Greenhouse", [], ["N"], r"^N13$"),
    ("N14", "อาคารไฟฟ้าแรงสูง", "Hi-Voltage Building", [], ["N"], r"^N14$"),
    ("N15", "อาคารเรียนและปฏิบัติการทางศิลปศาสตร์", "School of Liberal Arts", ["LNG", "ตึก sola", "ตึกศิลปศาสตร์"], ["N"], r"^N15$"),
    ("N16", "อาคารการเรียนรู้พหุวิทยาการ", "Learning Exchange", ["LX"], ["N"], r"\bN16\b"),
    ("N17", "อาคารเรียนรวม 2", "Classroom Building 2", ["CB2"], ["N"], r"\bN17\b"),
    ("N18", "อาคารปฏิบัติการทางวิศวกรรมอุตสาหการ 4", "Production Eng. Lab 4", [], ["N"], r"^N18$"),
    ("N19", "อาคารบัณฑิตวิทยาลัยการจัดการและนวัตกรรม", "Graduate School of Management & Innovation", ["GMI"], ["N"], r"^N19$"),
    ("N20", "อาคารเรียนรวม 1", "Classroom Building 1", ["CB1"], ["N"], r"\bN20\b"),
    ("S1", "อาคารวิศวกรรมเครื่องกล 4", "Mechanical Engineering 4", [], ["S"], r"^S1$"),
    ("S2", "อาคารจอดรถ", "Car parking building", ["ตึกจอดรถ"], ["S"], r"Parking Building S2|^S2$"),
    ("S3", "อาคารสถาบันนวัตกรรมการเรียนรู้เฉลิมพระเกียรติ", "Institute for Innovative Learning", [], ["S"], r"^S3$"),
    ("S4", "อาคารวิศววัฒนะ", "Wissawa Wattana", ["ตึกแดง", "Red building"], ["S"], r"วิศวะวัฒนะ|Witsawa"),
    ("S5", "บ้านธรรมรักษา 2", "Dhammaraksa Residence Hall 2", ["หอใน", "หอชาย"], ["S", "food", "dorm"], r"ธรรมรักษา 2"),
    ("S6", "บ้านธรรมรักษา 1", "Dhammaraksa Residence Hall 1", ["หอใน", "หอหญิง"], ["S", "food", "dorm"], r"ธรรมรักษา 1"),
    ("S7", "อาคารพัฒนาเด็กเล็ก มจธ.", "Child Development Center", [], ["S"], r"ศูนย์พัฒนาเด็กเล็ก"),
    ("S9", "อาคารคณะพลังงานสิ่งแวดล้อมและวัสดุ", "School of Energy, Environment & Materials", [], ["S"], r"คณะพลังงาน"),
    ("S10", "อาคารสังคมสีเขียว มจธ.", "KMUTT Green Society Building", ["ตึกกรีน"], ["S"], r"Green Society"),
    ("S11", "อาคารเรียนรวม 5", "Classroom Building 5", ["CB5"], ["S"], r"^CB5$"),
    ("S12", "อาคารเรียนรวม 4", "Classroom Building 4", ["CB4"], ["S"], r"^CB4$"),
    ("S13", "อาคารเรียนรวม 3", "Classroom Building 3", ["CB3"], ["S"], r"^CB3$"),
    ("S14", "อาคารพระจอมเกล้าราชานุสรณ์ 190 ปี", "King Mongkut's 190th Anniversary Memorial Building", ["KFC", "โรงอาหาร KFC", "GYM", "โรงยิม"], ["S", "food"], r"KMUTT Canteen"),
    ("S15", "อาคารภาควิชาวิศวกรรมเคมี", "Dept. of Chemical Engineering", [], ["S"], r"วิศวกรรมเคมี|Chemistry Engineering"),
]

# keep only buildings near the campus centre (OSM extract includes shops across the road)
CAMPUS_C = (13.6513, 100.4945)
def match(pattern):
    rx = re.compile(pattern)
    cands = [b for b in buildings if (rx.search(b["name"]) or rx.search(b["name_en"]) or rx.search(b["ref"]))
             and hav(b["c"], CAMPUS_C) < 700]
    return max(cands, key=lambda b: b["area"]) if cands else None

gidx_nodes = gnodes
def nearest_graph_node(pt, poly=None):
    best_i, best_d = None, 1e18
    for i, p in enumerate(gidx_nodes):
        d = hav(pt, p)
        if poly:
            d = min(hav(q, p) for q in poly[::max(1, len(poly) // 24)])
        if d < best_d:
            best_i, best_d = i, d
    return best_i, best_d

fixed_entrance = {code: add_entrance(pt) for code, pt in ENTRANCE_FIX.items()}
places = []
for code, th, en, aliases, cats, rx in REG:
    b = match(rx)
    rec = {"id": code, "kind": "building", "code": code, "th": th, "en": en, "aliases": aliases, "cats": cats}
    if b:
        if code in fixed_entrance:
            gi, gd = fixed_entrance[code], 0
            rec["entrance_checked"] = True
        else:
            gi, gd = nearest_graph_node(b["c"], b["poly"])
        rec.update({"c": b["c"], "osm": b["osm"], "entrance_node": gi, "entrance": gnodes[gi], "entrance_gap_m": round(gd)})
    places.append(rec)

# ---------------------------------------------------------------- N7 rooms (all levels: B, 1-10)
def scl(code):
    m = re.match(r"N7-(\d{3})(.*)$", code)
    return ("SCL" + m.group(1) + m.group(2)) if m else code

FLOORS = ["B", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
REVIEWED = ("6", "2")        # checked by three reviewers (2026-10-08): built exactly as before, plus "more" and lift.box
rooms_csv = list(csv.DictReader(open(pilot / "rooms" / "n7_rooms_all.csv", encoding="utf-8-sig")))
NICK = {"N7-216": ["Slope600", "Slope 600", "สโลป600", "สโลป 600", "Slope"]}
cores = json.load(open(pilot / "map" / "lift_core.json", encoding="utf-8"))["floors"]

def boxes_of(rf, corridor_code):
    """Room boxes from the resolved polygons (the corridor itself is drawn from corridor x0/x1)."""
    boxes = []
    for f in rf:
        p = f["properties"]
        if f["geometry"]["type"] != "Polygon" or p["code"] == corridor_code:
            continue
        cs = f["geometry"]["coordinates"][0]
        xs, ys = [c[0] for c in cs], [c[1] for c in cs]
        if max(xs) - min(xs) < 0.5:
            continue
        kind = "lift" if "lift" in p["type_en"].lower() else "wc" if "toilet" in p["type_en"].lower() else "room"
        boxes.append({"code": p["code"], "label": scl(p["code"]), "type_th": p["type_th"], "kind": kind,
                      "box": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]})
    return boxes

def lift_of(fl, cy):
    """Lift stop as before (x 63.0, the lobby door), plus the measured lift/stair core box."""
    rec = {"x": 63.0, "y": cy - 3.2, "door_x": 63.0}
    c = cores.get(fl) or {}
    if c.get("core_x") and c.get("core_y"):
        rec["box"] = [c["core_x"][0], c["core_y"][0], c["core_x"][1], c["core_y"][1]]
    return rec

def more_doors(first, others):
    """Other corridor doors of a room, sorted by x, without repeats closer than 0.3 m (to the first or each other)."""
    more = []
    for x, side in sorted(others):
        if abs(x - first[0]) < 0.3 or (more and abs(x - more[-1]["x"]) < 0.3):
            continue
        more.append({"x": x, "side": side})
    return more

n7 = {"building": "N7", "version": 2, "entrance_floor": "1", "floors": {}}
for fl in FLOORS:
    d = pilot / "map" / f"floor{fl}"
    rf = json.load(open(d / "rooms.geojson", encoding="utf-8"))["features"]
    grid = json.load(open(d / "grid.json", encoding="utf-8"))
    cy = grid["corridor"]["centre_y_local"]
    x0, x1 = grid["corridor"]["x_from_local"], grid["corridor"]["x_to_local"]
    F = {"corridor": {"y": cy, "x0": round(x0, 2), "x1": round(x1, 2)}, "boxes": boxes_of(rf, grid["corridor"]["code"]),
         "lift": lift_of(fl, cy)}
    n7["floors"][fl] = F
    if fl in REVIEWED:
        # corridor stops: every checkpoint on the centreline, with the rooms reached there and the side
        cps = json.load(open(d / "checkpoints.geojson", encoding="utf-8"))["features"]
        stops = []
        for f in cps:
            p = f["properties"]; x, y = f["geometry"]["coordinates"]
            if p["kind"] in ("grid", "door", "column") and abs(y - cy) < 0.6:
                m = re.findall(r"(N7[-/][\w()\-]+)[^/]*?\((N|S)[,)]", p.get("landmark") or "")
                stops.append({"id": p["id"], "x": round(x, 2), "rooms": [[c, s] for c, s in m], "landmark": p.get("landmark") or ""})
        stops.sort(key=lambda s: s["x"])
        # room -> corridor stop (door): the first (west-most) one as before; the others go to "more"
        where, every = {}, defaultdict(list)
        for s in stops:
            for c, side in s["rooms"]:
                where.setdefault(c, (s["x"], side))
                every[c].append((s["x"], side))
        if fl == "6":
            for c in ("N7-600", "N7-601", "N7-602"):
                where.setdefault(c, (27.0, "S"))  # vestibule mouth at C07 (south side)
        F["doors"] = {c: {"x": x, "side": side} for c, (x, side) in where.items()}
        for c, lst in every.items():
            more = more_doors(where[c], lst[1:])
            if more:
                F["doors"][c]["more"] = more
        for b in F["boxes"]:
            if b["code"] not in F["doors"] and b["kind"] == "room":
                cx = (b["box"][0] + b["box"][2]) / 2
                side = "N" if (b["box"][1] + b["box"][3]) / 2 > F["corridor"]["y"] else "S"
                F["doors"][b["code"]] = {"x": round(min(max(cx, F["corridor"]["x0"]), F["corridor"]["x1"]), 1), "side": side, "approx": True}
        continue
    # draft floors: from access.json (door chains found on the plan; "approx" where the plan shows no usable door)
    acc = json.load(open(d / "access.json", encoding="utf-8"))
    F["draft"] = True
    clamp = lambda v: round(min(max(v, F["corridor"]["x0"]), F["corridor"]["x1"]), 1)

    def side_of(y, fallback_y):
        return "N" if y > cy + 0.3 else "S" if y < cy - 0.3 else ("N" if fallback_y > cy else "S")
    doors = {}
    for code, r in acc["rooms"].items():
        lab = r["label"]
        cds = [cd for cd in r["corridor_doors"] if cd["on_corridor"] and cd["kind"] not in ("cubicle", "shaft")]
        if r["how"] == "direct" and cds:            # straight off the corridor: west-most door first, the others in "more"
            first = (round(cds[0]["x"], 2), side_of(cds[0]["y"], lab[1]))
            rec = {"x": first[0], "side": first[1]}
            more = more_doors(first, [(round(cd["x"], 2), side_of(cd["y"], lab[1])) for cd in cds[1:]])
            if more:
                rec["more"] = more
        elif r["how"] in ("direct", "via") and r.get("x") is not None:     # door(s) off a recess or through another space
            rec = {"x": r["x"], "side": side_of(r["door"][1], lab[1])}
            if r.get("via"):
                rec["via"] = r["via"]
        elif r.get("x") is not None and (not r.get("via") or math.dist(r["via"][-1], lab) <= 15.0):
            # no door on the plan: walked to the label / to the spot next to the room (only if it ends near the room)
            rec = {"x": r["x"], "side": side_of(lab[1], lab[1]), "approx": True}
            if r.get("via"):
                rec["via"] = r["via"]
        else:                                       # not connected: the corridor point nearest the room
            rec = {"x": clamp(lab[0]), "side": side_of(lab[1], lab[1]), "approx": True}
        if r.get("shared_with"):                    # one open-plan space holds several "rooms": its door, not the room's
            rec["approx"] = True
        doors[code] = rec
    F["doors"] = doors
    if acc.get("entrance"):                          # floor 1: from the corridor point out to the main door
        F["entrance"] = {"x": acc["entrance"]["x"], "side": "S", "via": acc["entrance"]["via"],
                         # the short way from the main door to the lifts: through the lift lobby's south-east double door
                         # (F1-D41 at x 65.8, y 1.4) instead of round by the corridor (about 10 m instead of 20). Site check D1.
                         "lift_via": [[65.8, 1.4]]}
# floor 2: the walkway from the corridor to the lecture hall N7-216 (checkpoints R01..R04, H01)
n7["floors"]["2"]["doors"]["N7-216"] = {"x": 87.0, "side": "S", "via": [[87.0, 9.2], [87.0, -8.9], [92.8, -12.9], [93.9, -17.8], [95.8, -20.6]]}

for r in rooms_csv:
    code = r["code"]
    names = [scl(code), code]
    if code in NICK:
        names = NICK[code] + names
    places.append({"id": code, "kind": "room", "code": scl(code), "official": code, "building": "N7", "floor": r["floor"],
                   "th": r["type_th"], "aliases": names, "nick": NICK.get(code, [None])[0],
                   "mapped": code in n7["floors"].get(r["floor"], {}).get("doors", {})})

campus = {"attribution": "© OpenStreetMap contributors (ODbL)", "buildings": [{"c": b["c"], "poly": b["poly"], "name": b["name"] or b["ref"], "area": b["area"]} for b in buildings if hav(b["c"], CAMPUS_C) < 900],
          "roads": roads, "water": water, "waterlines": waterlines, "green": green,
          "graph": {"nodes": gnodes, "edges": [list(e) for e in gedges]}}

OUT.mkdir(parents=True, exist_ok=True)
for name, obj in (("campus.json", campus), ("places.json", places), ("n7.json", n7)):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")
    print(name, (OUT / name).stat().st_size, "bytes")
print("graph", len(gnodes), "nodes", len(gedges), "edges")
for p in places:
    if p["kind"] == "building":
        print(p["code"], "OK" if "c" in p else "NOT FOUND", p.get("entrance_gap_m", ""), p["th"])
