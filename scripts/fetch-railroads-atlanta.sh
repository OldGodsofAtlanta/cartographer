#!/usr/bin/env bash
# Rebuilds data/railroads-atlanta.geojson: OpenStreetMap railway ways around
# Atlanta, dated from OSM start_date or matched to the Atack historical layer.
# Requires data/railroads-historical.geojson (run fetch-railroads-historical.sh first).
# Usage: scripts/fetch-railroads-atlanta.sh   (run from anywhere)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RAW="sources/raw/railroads-atlanta"
mkdir -p "$RAW"
OUT_JSON="$RAW/overpass.json"
PART="$RAW/overpass.part"
QUERY='[out:json][timeout:180];
way["railway"~"^(rail|abandoned|disused|razed|preserved)$"](33.55,-84.65,34.00,-84.10);
out geom;'

# Try each mirror; on 429/502/504 wait and go round again. Validate the JSON before keeping it.
ok=0
for attempt in 1 2 3 4 5 6; do
  for url in https://lz4.overpass-api.de/api/interpreter https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter; do
    code=$(curl -s -m 300 -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
      -H 'User-Agent: cartographer-fetch/0.1 (Old Gods of Atlanta map)' \
      --data-urlencode "data=$QUERY" -o "$PART" -w "%{http_code}" "$url" || true)
    if [ "$code" = "200" ] && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$PART" 2>/dev/null; then
      mv "$PART" "$OUT_JSON"; ok=1; break 2
    fi
    echo "attempt $attempt $url -> $code" >&2
    sleep 20
  done
  sleep 45
done
[ "$ok" = 1 ] || { echo "Overpass fetch failed" >&2; exit 1; }

node scripts/build-railroads-atlanta.js "$OUT_JSON" data/railroads-historical.geojson data/railroads-atlanta.geojson
