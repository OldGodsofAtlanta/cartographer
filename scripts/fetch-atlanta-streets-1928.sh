#!/usr/bin/env bash
# Rebuilds data/atlanta-streets-1928.geojson from the ECDS GeoServer layer
# OpenWorldAtlanta:Atlanta1928_RoadSystem (WFS, EPSG:4326). Fetched 2026-10-27.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=sources/raw/atlanta-streets-1928
WFS="https://geoserver.ecds.emory.edu/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=OpenWorldAtlanta:Atlanta1928_RoadSystem&outputFormat=application/json&sortBy=OBJECTID"

mkdir -p "$RAW"
if [ -z "$(ls -A "$RAW" 2>/dev/null)" ]; then
  # 23,042 features in pages of 3,000
  for s in $(seq 0 3000 23042); do
    curl -sS -f --retry 3 -m 180 "$WFS&count=3000&startIndex=$s" -o "$RAW/page_$s.json"
  done
fi

node scripts/atlanta-streets-1928-clean.js "$RAW" "$RAW/clean.geojson"
npx mapshaper "$RAW/clean.geojson" \
  -filter-fields name,kind,date_quality,date_source \
  -simplify 60% keep-shapes \
  -o format=geojson precision=0.00001 data/atlanta-streets-1928.geojson
