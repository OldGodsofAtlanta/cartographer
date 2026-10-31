// Validates data/atlanta-limits.geojson: one drawn version on 1 July of every year 1870-1945.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'atlanta-limits.geojson');
const fc = JSON.parse(readFileSync(file, 'utf8'));
const bad = [];
for (let y = 1870; y <= 1945; y++) {
  const map = `${y}-07-01`;
  const hits = fc.features.filter((f) => {
    const p = f.properties;
    const afterStart = p.start_date ? p.start_date <= map : (p.start == null || p.start <= y);
    const beforeEnd = p.end_date ? map < p.end_date : (p.end == null || y < p.end);
    return afterStart && beforeEnd;
  });
  if (hits.length !== 1) bad.push(`${y}: ${hits.length}`);
}
console.log('features:', fc.features.length, 'bytes:', statSync(file).size);
console.log(bad.length ? 'years without exactly one: ' + bad.join(', ') : 'every year 1870-1945 has exactly one version');
