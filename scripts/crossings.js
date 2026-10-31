// Prints where named streets cross, in the 1928 and OSM street layers, for georeferencing a sheet.
//   node scripts/crossings.js "Auburn:Fort" "Edgewood:Bell" ...   [--box west,south,east,north]
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { intersections, lineParts } from '../lib/geo.js';
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const args = process.argv.slice(2);
const bi = args.indexOf('--box');
const box = bi >= 0 ? args.splice(bi, 2)[1].split(',').map(Number) : [-84.5, 33.6, -84.2, 33.9];
const L = {
  1928: JSON.parse(await readFile(join(DATA, 'atlanta-streets-1928.geojson'), 'utf8')).features,
  osm: JSON.parse(await readFile(join(DATA, 'atlanta-streets-osm.geojson'), 'utf8')).features,
};
const starts = (s) => {
  const re = new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return (n) => re.test(n || '');
};
for (const pair of args) {
  const [a, b] = pair.split(':');
  for (const k of Object.keys(L)) {
    const h = intersections(lineParts(L[k], starts(a)), lineParts(L[k], starts(b))).filter((x) => x.point[0] > box[0] && x.point[0] < box[2] && x.point[1] > box[1] && x.point[1] < box[3]);
    console.log(`${pair.padEnd(26)} ${k.padEnd(5)}`, h.slice(0, 3).map((x) => `${x.point.join(',')} (${x.names.join('/')}, gap ${x.gap_m})`).join(' | ') || 'none');
  }
}
