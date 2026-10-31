// Builds data/black-neighborhoods.geojson from data/neighborhoods-sources.json. Each place is one point with
// the years a source gives and the citation for them; locations are either stated coordinates or street
// crossings in the 1928 layer. The layer draws a label only: no source gives boundaries, and none are invented.
//
//   node scripts/build-neighborhoods.js

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { intersections, lineParts } from '../lib/geo.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const src = JSON.parse(await readFile(join(DATA, 'neighborhoods-sources.json'), 'utf8')).places;
const streets = JSON.parse(await readFile(join(DATA, 'atlanta-streets-1928.geojson'), 'utf8')).features;
const starts = (s) => {
  const re = new RegExp(`^${s}\\b`, 'i');
  return (n) => re.test(n || '');
};
const corner = (a, b) => {
  const h = intersections(lineParts(streets, starts(a)), lineParts(streets, starts(b)));
  if (!h.length) throw new Error(`no crossing of ${a} and ${b}`);
  return h[0].point;
};
const r5 = (n) => Math.round(n * 1e5) / 1e5;

const features = src.map((p) => {
  let lonlat = p.lonlat;
  let basis = p.lonlat_basis;
  if (p.lonlat_from?.intersection) {
    lonlat = corner(...p.lonlat_from.intersection);
    basis = `crossing of ${p.lonlat_from.intersection.join(' and ')} in the 1928 street layer`;
  } else if (p.lonlat_from?.midpoint) {
    const [a, b] = p.lonlat_from.midpoint.map((c) => corner(...c));
    lonlat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    basis = `midpoint of ${p.lonlat_from.midpoint.map((c) => c.join(' x ')).join(' and ')} (1928 street layer)`;
  }
  return {
    type: 'Feature',
    properties: {
      id: p.id,
      name: p.name,
      ...(p.names ? { names: p.names } : {}),
      kind: p.kind,
      precision: p.precision,
      start: p.start ?? null,
      end: p.end ?? null,
      date_quality: p.date_quality,
      date_source: p.date_source,
      location: p.location,
      basis,
      ...(p.note ? { note: p.note } : {}),
    },
    geometry: { type: 'Point', coordinates: lonlat.map(r5) },
  };
});

await writeFile(join(DATA, 'black-neighborhoods.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} places; undated: ${features.filter((f) => f.properties.start == null).map((f) => f.properties.id).join(', ')}`);
