#!/usr/bin/env bash
# Rebuilds data/waterways-georgia.geojson (layer waterways-georgia) from OpenStreetMap.
# Run from anywhere: bash cartographer/scripts/fetch-waterways-georgia.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=sources/raw/waterways-georgia
mkdir -p "$RAW" data

# 1. Download (skipped if already present; delete overpass.json to refresh). Fetched 2026-10-27.
[ -s "$RAW/overpass.json" ] || scripts/overpass-get.sh scripts/queries/waterways-georgia.ql "$RAW/overpass.json"

# 2. Overpass JSON -> two GeoJSON files: named pieces (kind river|canal) and unnamed pieces >= 2 km.
node scripts/overpass-to-geojson.mjs georgia "$RAW/overpass.json" "$RAW/named.geojson" "$RAW/unnamed.geojson"

# 3. Dissolve named pieces into one feature per name+kind, then combine with the unnamed pieces,
#    keep name and kind only, simplify to 15% (keep-shapes),
#    write 4-decimal coordinates, then drop the features the simplifier collapsed to null.
npx mapshaper -i "$RAW/named.geojson" -dissolve key copy-fields=name,kind,start,end,date_quality,date_source -o format=geojson "$RAW/named-dissolved.geojson"
npx mapshaper -i combine-files "$RAW/named-dissolved.geojson" "$RAW/unnamed.geojson" -merge-layers force \
  -filter-fields name,kind,start,end,date_quality,date_source -simplify 15% keep-shapes \
  -o format=geojson precision=0.0001 "$RAW/simplified.geojson"

# Simplification collapses a few very short canal pieces to null geometry; drop those.
node -e '
const fs = require("node:fs");
const [src, dst] = process.argv.slice(1);
const d = JSON.parse(fs.readFileSync(src, "utf8"));
d.features = d.features.filter((f) => f.geometry && f.geometry.coordinates.length > 1);
fs.writeFileSync(dst, JSON.stringify(d));
console.log("kept", d.features.length, "features");
' "$RAW/simplified.geojson" data/waterways-georgia.geojson

python3 -I scripts/check-waterways.py data/waterways-georgia.geojson \
  "Chattahoochee River" "Flint River" "Ocmulgee River" "Oconee River" "Altamaha River" "Savannah River" \
  "Etowah River" "Oostanaula River" "Coosa River" "Satilla River" "Saint Marys River" "Ogeechee River" "Chattooga River"
