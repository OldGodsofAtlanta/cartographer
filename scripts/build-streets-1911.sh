#!/usr/bin/env bash
# Rebuilds the 1911 street grid (data/atlanta-streets-1911.geojson) and applies the street renamings.
# Needs python3 with Pillow. The atlas page must be georeferenced in data/backdrops.json first.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p sources/raw/atlas
node -e "
import('./app/georef.js').then(g=>{const fs=require('fs');
const D=JSON.parse(fs.readFileSync('data/backdrops.json')).backdrops.find(b=>b.id==='atlas-atlanta-1911');
const G=g.georeference(D.points);
fs.writeFileSync('sources/raw/atlas/transform.json',JSON.stringify({T:G.transform,KX:111320*Math.cos(33.75*Math.PI/180),KY:110540,size:D.size,rms:G.rmsM}));})"
python3 -I scripts/match-atlas-streets.py --threshold "${1:-0.75}" ${2:-}
node scripts/apply-street-renames.js
node scripts/build-street-names-1903.js > /dev/null   # re-attaches former_names_1903 to every street layer
