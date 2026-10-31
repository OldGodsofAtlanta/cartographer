// Reads the paged WFS pages of OpenWorldAtlanta:Atlanta1928_RoadSystem (in sources/raw/atlanta-streets-1928/)
// and writes one cleaned FeatureCollection with the data-contract properties.
// Usage: node scripts/atlanta-streets-1928-clean.js <rawDir> <outFile>
import fs from 'fs';
import path from 'path';

const [rawDir, outFile] = process.argv.slice(2);
if (!rawDir || !outFile) {
  console.error('usage: node atlanta-streets-1928-clean.js <rawDir> <outFile>');
  process.exit(1);
}

const pages = fs.readdirSync(rawDir).filter(f => /^page_\d+\.json$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
let src = [];
for (const p of pages) {
  src = src.concat(JSON.parse(fs.readFileSync(path.join(rawDir, p), 'utf8')).features);
}

const DIRS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
const kindFor = (fetype) => {
  const t = (fetype || '').trim();
  if (/^(alley|aly)$/i.test(t)) return 'alley';
  if (/^(ave|av|avenue|blvd|pkwy)$/i.test(t)) return 'avenue';
  if (/^(rd|road|hwy|fwy|conn|loop)$/i.test(t)) return 'road';
  return 'street';
};
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const features = [];
let fromFields = 0;
for (const f of src) {
  const p = f.properties;
  let name = clean(p.ROAD_NAME);
  if (!name) {
    // Rebuild from the parsed name fields when the full name is blank.
    const dir = clean(p.FEDIRS).toUpperCase();
    const pre = clean(p.FEDIRP).toUpperCase();
    const parts = [
      DIRS.has(pre) ? pre : '',
      clean(p.FENAME),
      clean(p.FETYPE),
      DIRS.has(dir) ? dir : '',
    ].filter(Boolean);
    if (parts.length && clean(p.FENAME)) {
      name = parts.join(' ');
      fromFields++;
    }
  }
  features.push({
    type: 'Feature',
    properties: {
      name,
      kind: kindFor(p.FETYPE),
      id: p.OBJECTID,
      date_quality: 'snapshot',
      date_source: 'Atlanta 1928 road system, OpenWorld Atlanta (Emory Center for Digital Scholarship), 1928',
    },
    geometry: f.geometry,
  });
}

// Merge the segments of each named street (same name and kind) into one MultiLineString,
// so a street is one feature and carries its properties once. Unnamed segments stay separate.
const merged = new Map();
const out = [];
for (const f of features) {
  const p = f.properties;
  if (!p.name) { out.push(f); continue; }
  const key = p.kind + '\u0000' + p.name;
  if (!merged.has(key)) {
    const m = { type: 'Feature', properties: { name: p.name, kind: p.kind, date_quality: p.date_quality, date_source: p.date_source }, geometry: { type: 'MultiLineString', coordinates: [] } };
    merged.set(key, m);
    out.push(m);
  }
  const g = f.geometry;
  const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
  merged.get(key).geometry.coordinates.push(...lines);
}
features.length = 0;
features.push(...out);

fs.writeFileSync(outFile, JSON.stringify({ type: 'FeatureCollection', features }));
const named = features.filter(f => f.properties.name).length;
const kinds = {};
features.forEach(f => { kinds[f.properties.kind] = (kinds[f.properties.kind] || 0) + 1; });
console.log(JSON.stringify({ input: src.length, output: features.length, namedStreets: features.filter(f => f.properties.name).length, unnamedSegments: features.filter(f => !f.properties.name).length, nameFromFields: fromFields, kinds }));
