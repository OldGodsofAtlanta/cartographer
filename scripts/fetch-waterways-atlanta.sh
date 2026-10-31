#!/usr/bin/env bash
# Rebuilds data/waterways-atlanta.geojson (layer waterways-atlanta) from OpenStreetMap.
# Run from anywhere: bash cartographer/scripts/fetch-waterways-atlanta.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=sources/raw/waterways-atlanta
mkdir -p "$RAW" data

# 1. Download (skipped if already present). Fetched 2026-10-27 from overpass.private.coffee
#    (overpass-api.de returned HTTP 406 for this query).
[ -s "$RAW/overpass.json" ] || scripts/overpass-get.sh scripts/queries/waterways-atlanta.ql "$RAW/overpass.json"

# 2. Overpass JSON -> GeoJSON with name, kind (river|creek|canal) and culvert.
node scripts/overpass-to-geojson.mjs atlanta "$RAW/overpass.json" "$RAW/atlanta.geojson"

# 3. Not dissolved, not simplified; 5-decimal coordinates (about 1 m).
npx mapshaper -i "$RAW/atlanta.geojson" -filter-fields name,kind,culvert,start,end,date_quality,date_source \
  -o format=geojson precision=0.00001 data/waterways-atlanta.geojson

python3 -I scripts/check-waterways.py data/waterways-atlanta.geojson \
  "Peachtree Creek" "North Fork Peachtree Creek" "Proctor Creek" "Tanyard Creek" "Clear Creek" \
  "Intrenchment Creek" "Sugar Creek" "South River" "Utoy Creek" "Nancy Creek" "Flint River" "Chattahoochee River"
