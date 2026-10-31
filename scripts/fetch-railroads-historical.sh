#!/usr/bin/env bash
# Rebuilds data/railroads-historical.geojson from Jeremy Atack's US railroad
# shapefile (1826-1911), clipped to Georgia plus a margin.
# Usage: scripts/fetch-railroads-historical.sh   (run from anywhere)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

URL="https://cdn.vanderbilt.edu/t2-my/my-prd/wp-content/uploads/sites/133/2024/09/RR1826-1911Modified103123.zip"
RAW="sources/raw/railroads-historical"
ZIP="$RAW/RR1826-1911.zip"
UNZ="$RAW/unz"
WORK="$RAW/work"
SHP="$UNZ/RR1826-1911Modified103123.shp"
BBOX="-86.0,30.2,-80.5,35.3"   # xmin,ymin,xmax,ymax (WGS84)

mkdir -p "$RAW"
if [ ! -f "$ZIP" ]; then
  curl -sL --fail -m 300 -o "$ZIP" "$URL"
fi
if [ ! -f "$SHP" ]; then
  rm -rf "$UNZ" && mkdir -p "$UNZ"
  unzip -q -o "$ZIP" -x '__MACOSX/*' -d "$UNZ"
fi

rm -rf "$WORK" && mkdir -p "$WORK"
# Reproject from Albers (NAD83), clip to the bbox, keep only segments with an opening year.
npx mapshaper "$SHP" -proj wgs84 -clip bbox="$BBOX" -filter 'InOpBy > 0' \
  -o format=geojson precision=0.0001 "$WORK/clip.geojson"

node scripts/build-railroads-historical.js "$WORK/clip.geojson" data/railroads-historical.geojson
