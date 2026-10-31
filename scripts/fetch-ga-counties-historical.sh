#!/usr/bin/env bash
# Rebuilds data/ga-counties-historical.geojson from the Newberry AHCB Georgia download (fetched 2026-10-27).
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=sources/raw/ga-counties-historical
URL=https://publications.newberry.org/ahcb/downloads/gis/GA_AtlasHCB.zip
mkdir -p "$RAW"
if [ ! -f "$RAW/GA_AtlasHCB.zip" ]; then
  curl -sSL --fail -o "$RAW/GA_AtlasHCB.zip" "$URL"
fi
if [ ! -d "$RAW/unzipped" ]; then
  mkdir -p "$RAW/unzipped"
  unzip -q "$RAW/GA_AtlasHCB.zip" -d "$RAW/unzipped"
fi
SHP="$RAW/unzipped/GA_AtlasHCB/GA_Historical_Counties/GA_Historical_Counties.shp"
# Keep versions overlapping 1860-1950 (START_N/END_N are YYYYMMDD); drop non-county areas.
npx mapshaper -i "$SHP" -proj wgs84 \
  -filter 'START_N<=19501231 && END_N>=18600101 && NAME!="NCA" && !/^Georgia West/.test(NAME)' \
  -filter-fields NAME,START_DATE,END_DATE,START_N,END_N,CHANGE \
  -simplify 15% keep-shapes \
  -o format=geojson precision=0.0001 "$RAW/stage.geojson"
node scripts/build-ga-counties-historical.mjs "$RAW/stage.geojson" data/ga-counties-historical.geojson
