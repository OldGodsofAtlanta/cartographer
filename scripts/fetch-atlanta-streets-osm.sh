#!/usr/bin/env bash
# Rebuilds data/atlanta-streets-osm.geojson: named OSM ways with the street highway values in the
# Atlanta bbox, marked where they appear in the 1928 road system. Fetched 2026-10-27.
# Requires data/atlanta-streets-1928.geojson's source: runs fetch-atlanta-streets-1928.sh first if missing.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=sources/raw/atlanta-streets-osm
HIST=sources/raw/atlanta-streets-1928/clean.geojson
QUERY=scripts/atlanta-streets-osm.overpass.txt
RADIUS_KM="${RADIUS_KM:-6}"   # drop residential ways beyond this many km of Five Points (set empty to keep all; gives 7.6 MB)

mkdir -p "$RAW"
if [ ! -s "$RAW/overpass.json" ]; then
  # Overpass 406/502/504 happen under load: retry with a pause. The User-Agent and Accept headers are needed.
  for try in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sS -f -m 600 -X POST https://overpass-api.de/api/interpreter \
         -H "User-Agent: OldGodsofAtlanta-cartographer/0.1" -H "Accept: application/json" \
         --data-urlencode "data@$QUERY" -o "$RAW/overpass.json"; then break; fi
    rm -f "$RAW/overpass.json"; echo "retry $try" >&2; sleep 60
  done
fi
[ -s "$RAW/overpass.json" ] || { echo "Overpass fetch failed" >&2; exit 1; }

[ -s "$HIST" ] || bash scripts/fetch-atlanta-streets-1928.sh
node scripts/atlanta-streets-osm-build.js "$RAW/overpass.json" "$HIST" "$RAW/osm-streets.geojson" ${RADIUS_KM:+$RADIUS_KM}
npx mapshaper "$RAW/osm-streets.geojson" -o format=geojson precision=0.00001 data/atlanta-streets-osm.geojson
