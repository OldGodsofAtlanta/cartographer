#!/usr/bin/env bash
# Rebuilds data/atlanta-blocks-1878.geojson and data/atlanta-horsecars-1878.geojson from the ECDS
# GeoServer workspace Atlanta1878 (WFS, EPSG:4326). Fetched 2026-10-27.
set -euo pipefail
cd "$(dirname "$0")/.."
WFS="https://geoserver.ecds.emory.edu/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326"
mkdir -p sources/raw/atlanta-blocks-1878 sources/raw/atlanta-horsecars-1878
[ -s sources/raw/atlanta-blocks-1878/blocks.json ] || curl -sS -f --retry 3 -m 300 "$WFS&typeNames=Atlanta1878:ATL1878_City_Blocks" -o sources/raw/atlanta-blocks-1878/blocks.json
[ -s sources/raw/atlanta-horsecars-1878/horse.json ] || curl -sS -f --retry 3 -m 300 "$WFS&typeNames=Atlanta1878:ATL1878_Horse_Routes" -o sources/raw/atlanta-horsecars-1878/horse.json

node scripts/atlanta-1878-clean.js sources/raw/atlanta-blocks-1878/blocks.json sources/raw/atlanta-blocks-1878/clean.geojson block
node scripts/atlanta-1878-clean.js sources/raw/atlanta-horsecars-1878/horse.json sources/raw/atlanta-horsecars-1878/clean.geojson horsecar

npx mapshaper sources/raw/atlanta-blocks-1878/clean.geojson -o format=geojson precision=0.00001 sources/raw/atlanta-blocks-1878/rounded.geojson
node scripts/atlanta-1878-drop-null.js sources/raw/atlanta-blocks-1878/rounded.geojson data/atlanta-blocks-1878.geojson
npx mapshaper sources/raw/atlanta-horsecars-1878/clean.geojson -o format=geojson precision=0.00001 data/atlanta-horsecars-1878.geojson
