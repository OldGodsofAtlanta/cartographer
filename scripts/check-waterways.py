# Usage: python3 -I scripts/check-waterways.py <file.geojson> <required names...>
# Prints feature counts by kind, bbox, and which required names are present.
import json, sys, collections
path, *required = sys.argv[1:]
d = json.load(open(path, encoding='utf8'))
feats = d['features']
xs, ys = [], []
def walk(c):
    if isinstance(c[0], (int, float)):
        xs.append(c[0]); ys.append(c[1])
    else:
        for x in c: walk(x)
for f in feats:
    if f['geometry']: walk(f['geometry']['coordinates'])
print('features', len(feats))
print('geometry', collections.Counter(f['geometry']['type'] for f in feats))
print('by kind', dict(collections.Counter(f['properties'].get('kind') for f in feats)))
print('culvert', sum(1 for f in feats if f['properties'].get('culvert')))
print('bbox lon %.4f..%.4f lat %.4f..%.4f' % (min(xs), max(xs), min(ys), max(ys)))
names = collections.defaultdict(set)
for f in feats:
    names[f['properties'].get('name')].add(f['properties'].get('kind'))
missing = []
for r in required:
    hits = [n for n in names if n and n.lower() == r.lower()]
    if hits:
        print('present:', r, '->', hits[0], sorted(names[hits[0]]))
    else:
        missing.append(r)
print('MISSING:', missing if missing else 'none')
