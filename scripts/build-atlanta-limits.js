// Builds data/atlanta-limits.geojson from Emory's AtlantaAnnexations layer (annexations_1847-1945): for every
// year the city's boundary changed, the dataset has a 'boundary' polygon (the cumulative limits after that
// year) and 'annexation' polygons (the part added). One version per year; each holds until the next.
//
//   node scripts/build-atlanta-limits.js     (reads sources/raw/annex/AtlantaAnnexations_annexations_1847-1945.json,
//                                             downloaded by scripts/fetch-atlanta-limits.sh)

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(await readFile(join(HERE, '..', 'sources/raw/annex/AtlantaAnnexations_annexations_1847-1945.json'), 'utf8'));
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const round = (c) => (typeof c[0] === 'number' ? [r5(c[0]), r5(c[1])] : c.map(round));

// Planar acres, for the plausibility check only.
const acres = (g) => {
  const kx = 111320 * Math.cos((33.75 * Math.PI) / 180);
  const ring = (r) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + (p[0] * kx * q[1] * 110540 - q[0] * kx * p[1] * 110540); }, 0)) / 2;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.reduce((s, poly) => s + poly.reduce((a, r, i) => a + (i ? -ring(r) : ring(r)), 0), 0) / 4046.86;
};

const wholes = raw.features.filter((f) => f.properties.TYPE === 'boundary').sort((a, b) => Number(a.properties.YEAR) - Number(b.properties.YEAR));
const parts = raw.features.filter((f) => f.properties.TYPE === 'annexation');
const features = wholes.map((f, i) => {
  const year = Number(f.properties.YEAR);
  const next = wholes[i + 1] ? Number(wholes[i + 1].properties.YEAR) : 1946;
  const added = parts.filter((p) => p.properties.YEAR === f.properties.YEAR);
  return {
    type: 'Feature',
    properties: {
      name: 'Atlanta city limits',
      kind: 'city-limits',
      start: year,
      end: next,
      date_quality: 'documented',
      date_source: `Emory ECDS AtlantaAnnexations, annexations_1847-1945 (boundary after the ${year} annexation); the version holds until the next year's`,
      acres: Math.round(acres(f.geometry)),
      annexed_acres: Math.round(added.reduce((s, p) => s + acres(p.geometry), 0)),
      annexed_parts: added.length,
    },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  };
});
await writeFile(join(HERE, '..', 'data/atlanta-limits.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
for (const f of features) console.log(`${f.properties.start}-${f.properties.end}  ${String(f.properties.acres).padStart(6)} acres  (+${f.properties.annexed_acres} in ${f.properties.annexed_parts} part${f.properties.annexed_parts > 1 ? 's' : ''})`);
