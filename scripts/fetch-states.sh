#!/usr/bin/env bash
# Rebuilds data/states.geojson from the Census 2023 cartographic boundary file (1:500,000), fetched 2026-10-27.
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=sources/raw/states
URL=https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_500k.zip
mkdir -p "$RAW"
if [ ! -f "$RAW/cb_2023_us_state_500k.zip" ]; then
  curl -sSL --fail -o "$RAW/cb_2023_us_state_500k.zip" "$URL"
fi
if [ ! -d "$RAW/unzipped" ]; then
  mkdir -p "$RAW/unzipped"
  unzip -q "$RAW/cb_2023_us_state_500k.zip" -d "$RAW/unzipped"
fi
# 13 Georgia, 01 Alabama, 12 Florida, 45 South Carolina, 37 North Carolina, 47 Tennessee
npx mapshaper -i "$RAW/unzipped/cb_2023_us_state_500k.shp" -proj wgs84 \
  -filter '["13","01","12","45","37","47"].includes(STATEFP)' \
  -clip bbox=-88.5,29.0,-78.5,36.8 \
  -each 'kind="state"; date_quality="natural"' \
  -filter-fields NAME,kind,date_quality \
  -rename-fields name=NAME \
  -o format=geojson precision=0.0001 data/states.geojson
