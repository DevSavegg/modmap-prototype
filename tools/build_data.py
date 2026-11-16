"""Build the prototype's data files.

python tools/build_data.py <overpass_campus_raw.json> <N7-Pilot/data dir>

Writes data/campus.json (OpenStreetMap extract, ODbL), data/places.json (buildings + rooms + aliases)
and data/n7.json (schematic floors 2 and 6 + indoor walk graph). The schematic keeps only room boxes,
the corridor and door positions: no walls traced from the blueprints are published.
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

places = []
for code, th, en, aliases, cats, rx in REG:
    b = match(rx)
    rec = {"id": code, "kind": "building", "code": code, "th": th, "en": en, "aliases": aliases, "cats": cats}
    if b:
        gi, gd = nearest_graph_node(b["c"], b["poly"])
        rec.update({"c": b["c"], "osm": b["osm"], "entrance_node": gi, "entrance": gnodes[gi], "entrance_gap_m": round(gd)})
    places.append(rec)

# ---------------------------------------------------------------- N7 rooms (floors 2 and 6 only)
def scl(code):
    m = re.match(r"N7-(\d{3})(.*)$", code)
    return ("SCL" + m.group(1) + m.group(2)) if m else code

rooms_csv = [r for r in csv.DictReader(open(pilot / "rooms" / "n7_rooms_all.csv", encoding="utf-8-sig")) if r["floor"] in ("2", "6")]
NICK = {"N7-216": ["Slope600", "Slope 600", "สโลป600", "สโลป 600", "Slope"]}

n7 = {"building": "N7", "floors": {}}
for fl in ("6", "2"):
    d = pilot / "map" / f"floor{fl}"
    rf = json.load(open(d / "rooms.geojson", encoding="utf-8"))["features"]
    cps = json.load(open(d / "checkpoints.geojson", encoding="utf-8"))["features"]
    grid = json.load(open(d / "grid.json", encoding="utf-8"))
    cy = grid["corridor"]["centre_y_local"]
    x0, x1 = grid["corridor"]["x_from_local"], grid["corridor"]["x_to_local"]
    boxes = []
    for f in rf:
        p = f["properties"]
        if f["geometry"]["type"] != "Polygon" or p["code"].endswith("/603") or p["code"].endswith("/205"):
            continue
        cs = f["geometry"]["coordinates"][0]
        xs, ys = [c[0] for c in cs], [c[1] for c in cs]
        if max(xs) - min(xs) < 0.5:
            continue
        kind = "lift" if "lift" in p["type_en"].lower() else "wc" if "toilet" in p["type_en"].lower() else "room"
        boxes.append({"code": p["code"], "label": scl(p["code"]), "type_th": p["type_th"], "kind": kind,
                      "box": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]})
    # corridor stops: every checkpoint on the centreline, with the rooms reached there and the side
    stops = []
    for f in cps:
        p = f["properties"]; x, y = f["geometry"]["coordinates"]
        if p["kind"] in ("grid", "door", "column") and abs(y - cy) < 0.6:
            side = ""
            m = re.findall(r"(N7[-/][\w()\-]+)[^/]*?\((N|S)[,)]", p.get("landmark") or "")
            stops.append({"id": p["id"], "x": round(x, 2), "rooms": [[c, s] for c, s in m], "landmark": p.get("landmark") or ""})
    stops.sort(key=lambda s: s["x"])
    n7["floors"][fl] = {"corridor": {"y": cy, "x0": round(x0, 2), "x1": round(x1, 2)}, "boxes": boxes, "stops": stops,
                        "lift": {"x": 63.0, "y": cy - 3.2, "door_x": 63.0}}
# room → corridor stop (door) mapping, with the vestibule and hall exceptions
for fl, F in n7["floors"].items():
    where = {}
    for s in F["stops"]:
        for c, side in s["rooms"]:
            where.setdefault(c, (s["x"], side))
    if fl == "6":
        for c in ("N7-600", "N7-601", "N7-602"):
            where.setdefault(c, (27.0, "S"))  # vestibule mouth at C07 (south side)
    F["doors"] = {c: {"x": x, "side": side} for c, (x, side) in where.items()}
    for b in F["boxes"]:
        if b["code"] not in F["doors"] and b["kind"] == "room":
            cx = (b["box"][0] + b["box"][2]) / 2
            side = "N" if (b["box"][1] + b["box"][3]) / 2 > F["corridor"]["y"] else "S"
            F["doors"][b["code"]] = {"x": round(min(max(cx, F["corridor"]["x0"]), F["corridor"]["x1"]), 1), "side": side, "approx": True}
# floor 2: the walkway from the corridor to the lecture hall N7-216 (checkpoints R01..R04, H01)
n7["floors"]["2"]["doors"]["N7-216"] = {"x": 87.0, "side": "S", "via": [[87.0, 9.2], [87.0, -8.9], [92.8, -12.9], [93.9, -17.8], [95.8, -20.6]]}
# publish only what the app draws and routes on: room boxes, corridor, door positions (no checkpoint notes)
for F in n7["floors"].values():
    F.pop("stops", None)

for r in rooms_csv:
    code = r["code"]
    names = [scl(code), code]
    if code in NICK:
        names = NICK[code] + names
    places.append({"id": code, "kind": "room", "code": scl(code), "official": code, "building": "N7", "floor": r["floor"],
                   "th": r["type_th"], "aliases": names, "nick": NICK.get(code, [None])[0],
                   "mapped": code in n7["floors"][r["floor"]]["doors"]})

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
