"""Finds which of the 1928 streets already existed in 1911, by testing each against the 1911 atlas page.

  python3 -I scripts/match-atlas-streets.py [--threshold 0.75] [--report]

The atlas page (chapters/1911-coal-oil/art/atlas-atlanta-1911.jpg) draws the whole city's streets as black
line work. Its georeference (data/backdrops.json) is good to about 35 m, which is too loose to test a street
against, so the page is first aligned to the 1928 street layer cell by cell (a search for the shift that puts
the most street points on ink), and then each street is scored by the fraction of its length that falls on ink.
Streets that score above the threshold are written to data/atlanta-streets-1911.geojson. The method cannot
see streets outside the page, or streets drawn too faintly to survive, so it undercounts.
Run `node` first to write sources/raw/atlas/transform.json (see scripts/build-streets-1911.sh).
"""
import json, math, sys, statistics
from PIL import Image, ImageFilter

ROOT = __import__('os').path.join(__import__('os').path.dirname(__file__), '..')
thr = float(sys.argv[sys.argv.index('--threshold') + 1]) if '--threshold' in sys.argv else 0.75
tr = json.load(open(f'{ROOT}/sources/raw/atlas/transform.json'))
a, b, c, d, e, f = tr['T']
KX, KY = tr['KX'], tr['KY']
W, H = tr['size']
det = a * d - b * c

def to_px(lon, lat):
    X, Y = lon * KX - e, lat * KY - f
    return ((d * X - c * Y) / det, (-b * X + a * Y) / det)

im = Image.open(f'{ROOT}/../chapters/1911-coal-oil/art/atlas-atlanta-1911.jpg').convert('L')
assert im.size == (W, H), im.size
dark = im.point(lambda v: 255 if v < 140 else 0)
m1 = dark.filter(ImageFilter.MaxFilter(3)).tobytes()   # ink dilated by 1 px: for alignment
m2 = dark.filter(ImageFilter.MaxFilter(5)).tobytes()   # dilated by 2 px: for scoring
def hit(mask, x, y):
    xi, yi = int(round(x)), int(round(y))
    return 0 <= xi < W and 0 <= yi < H and mask[yi * W + xi] == 255

streets = json.load(open(f'{ROOT}/data/atlanta-streets-1928.geojson'))['features']
items = []  # (feature, [parts]) with parts = list of lists of pixel points
for ft in streets:
    g = ft['geometry']
    lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
    parts = []
    for ln in lines:
        pts = [to_px(*p) for p in ln]
        out = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(q[0] - p[0], q[1] - p[1]) / 3))
            out += [(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n) for k in range(1, n + 1)]
        parts.append(out)
    items.append((ft, parts))

# Local alignment: for each 220 px cell, the shift that puts the most street points on ink.
CELL = 220
cells = {}
for ft, parts in items:
    if ft['properties'].get('kind') == 'alley':
        continue
    for pts in parts:
        for p in pts[::2]:
            if 20 < p[0] < W - 20 and 20 < p[1] < H - 20:
                cells.setdefault((int(p[0] // CELL), int(p[1] // CELL)), []).append(p)
shift, quality = {}, {}
RANGE = 16
for k, pts in cells.items():
    if len(pts) < 40:
        continue
    sample = pts[:: max(1, len(pts) // 160)]
    best = (-1, 0, 0)
    for dy in range(-RANGE, RANGE + 1):
        for dx in range(-RANGE, RANGE + 1):
            s = sum(1 for p in sample if hit(m1, p[0] + dx, p[1] + dy))
            if s > best[0] or (s == best[0] and abs(dx) + abs(dy) < abs(best[1]) + abs(best[2])):
                best = (s, dx, dy)
    shift[k] = (best[1], best[2])
    quality[k] = best[0] / len(sample)
good = [shift[k] for k in shift if quality[k] > 0.5]
gx = statistics.median(s[0] for s in good) if good else 0
gy = statistics.median(s[1] for s in good) if good else 0
print(f'{len(cells)} cells, {len(shift)} aligned; median shift ({gx:.0f}, {gy:.0f}) px; cell match quality median {statistics.median(quality.values()):.2f}')

def offset(p):
    k = (int(p[0] // CELL), int(p[1] // CELL))
    if k in shift and quality[k] > 0.5:
        return shift[k]
    nb = [shift[(k[0] + i, k[1] + j)] for i in (-1, 0, 1) for j in (-1, 0, 1) if (k[0] + i, k[1] + j) in shift and quality[(k[0] + i, k[1] + j)] > 0.5]
    if nb:
        return (statistics.median(s[0] for s in nb), statistics.median(s[1] for s in nb))
    return (gx, gy)

kept, scored, hist = [], 0, [0] * 11
report = [] # (parts_with_offsets, score)
for ft, parts in items:
    pts = [p for ln in parts for p in ln]
    inside = [p for p in pts if 12 < p[0] < W - 12 and 12 < p[1] < H - 12]
    if len(inside) < 6 or len(inside) < 0.9 * len(pts):
        continue  # off the page, or only partly on it
    hits = 0
    for p in inside:
        dx, dy = offset(p)
        hits += hit(m2, p[0] + dx, p[1] + dy)
    s = hits / len(inside)
    scored += 1
    hist[int(s * 10)] += 1
    if '--report' in sys.argv:
        report.append(([[(p[0] + offset(p)[0], p[1] + offset(p)[1]) for p in ln] for ln in parts], s))
    if s >= thr:
        pr = {k: v for k, v in ft['properties'].items() if k in ('name', 'kind')}
        pr.update(atlas_score=round(s, 2), date_quality='snapshot',
                  date_source='1928 street (ECDS) that also appears on the 1911 atlas page, matched by image; the name is the 1928 name')
        kept.append({'type': 'Feature', 'properties': pr, 'geometry': ft['geometry']})
print('scored', scored, 'streets; score histogram (0.0-0.1 ... 1.0):', hist)
print(f'kept {len(kept)} at threshold {thr}')
json.dump({'type': 'FeatureCollection', 'features': kept}, open(f'{ROOT}/data/atlanta-streets-1911.geojson', 'w'), separators=(',', ':'))

if '--report' in sys.argv:
    from PIL import ImageDraw
    ov = Image.open(f'{ROOT}/../chapters/1911-coal-oil/art/atlas-atlanta-1911.jpg').convert('RGB')
    dr = ImageDraw.Draw(ov)
    for parts, sc in sorted(report, key=lambda r: r[1]):
        col = (0, 170, 0) if sc >= thr else (255, 140, 0) if sc >= 0.5 else (230, 0, 0)
        for ln in parts:
            dr.line([(x, y) for x, y in ln], fill=col, width=2)
    ov.save(f'{ROOT}/sources/raw/atlas/overlay.png')
    print('wrote overlay.png (green kept, orange 0.5-threshold, red dropped)')
