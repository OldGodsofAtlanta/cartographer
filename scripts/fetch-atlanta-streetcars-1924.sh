#!/usr/bin/env bash
# Rebuilds data/atlanta-streetcars-1924.geojson from StreetcarRoutes:streetcars1924 (ECDS WFS). Fetched 2026-10-27.
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=sources/raw/atlanta-streetcars-1924
mkdir -p "$RAW"
[ -s "$RAW/streetcars1924.json" ] || curl -sS -f --retry 3 -m 300 "https://geoserver.ecds.emory.edu/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326&typeNames=StreetcarRoutes:streetcars1924" -o "$RAW/streetcars1924.json"
node scripts/atlanta-streetcars-1924-clean.js "$RAW/streetcars1924.json" "$RAW/clean.geojson"
npx mapshaper "$RAW/clean.geojson" -o format=geojson precision=0.00001 data/atlanta-streetcars-1924.geojson
