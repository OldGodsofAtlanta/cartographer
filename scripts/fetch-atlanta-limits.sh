#!/usr/bin/env bash
# Downloads Emory's AtlantaAnnexations layer (annexation and boundary polygons, 1847-1945) and builds the limits layer.
# Licence not stated by ECDS (the server says AccessConstraints NONE): see data/sources/atlanta-limits.md.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p sources/raw/annex
curl -sS -m 180 -o "sources/raw/annex/AtlantaAnnexations_annexations_1847-1945.json" \
  "https://geoserver.ecds.emory.edu/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=AtlantaAnnexations:annexations_1847-1945&outputFormat=application/json&srsName=EPSG:4326"
node scripts/build-atlanta-limits.js
