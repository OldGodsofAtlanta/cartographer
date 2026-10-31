// Turns the clipped Atack segments into the railroads-historical layer.
// usage: node build-railroads-historical.js <in.geojson> <out.geojson>
import fs from 'node:fs';
const [, , inPath, outPath] = process.argv;

const src = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const features = [];
const dropped = { noYear: 0, noGeom: 0 };

for (const f of src.features) {
  const p = f.properties || {};
  const year = Number(p.InOpBy);
  if (!f.geometry) { dropped.noGeom++; continue; }
  if (!Number.isInteger(year) || year <= 0) { dropped.noYear++; continue; }
  const props = {
    kind: 'railroad',
    start: year,
    end: null,
    date_quality: 'documented',
    date_source: 'Atack 2016, InOpBy',
  };
  const name = typeof p.RRname === 'string' ? p.RRname.trim() : '';
  if (name) props.name = name;
  features.push({ type: 'Feature', properties: props, geometry: f.geometry });
}

const out = { type: 'FeatureCollection', features };
fs.writeFileSync(outPath, JSON.stringify(out) + '\n');

const decades = {};
for (const f of features) {
  const d = Math.floor(f.properties.start / 10) * 10;
  decades[d] = (decades[d] || 0) + 1;
}
console.log('features:', features.length, 'dropped:', JSON.stringify(dropped));
console.log('by start decade:', JSON.stringify(decades));
