// Adds `names` (period names with spans) to the street layers from data/street-renames.json. Idempotent:
// it rewrites each matching feature's `names`, and removes `names` from any feature that no longer matches.
//
//   node scripts/apply-street-renames.js
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const table = JSON.parse(await readFile(join(DATA, 'street-renames.json'), 'utf8')).renames;
const FILES = { 1878: 'atlanta-streets-1878.geojson', 1911: 'atlanta-streets-1911.geojson', 1928: 'atlanta-streets-1928.geojson' };

for (const [key, file] of Object.entries(FILES)) {
  const path = join(DATA, file);
  const fc = JSON.parse(await readFile(path, 'utf8'));
  let n = 0;
  for (const f of fc.features) {
    const p = f.properties;
    delete p.names;
    for (const r of table.filter((r) => r.layers.includes(key))) {
      if (new RegExp(r.match, 'i').test(p.name || '')) {
        p.names = [...r.names.map((x) => ({ name: x.name, start: x.start ?? null, end: x.end })), { name: p.name, start: Math.max(...r.names.map((x) => x.end)), end: null }];
        p.names_source = r.id;
        n++;
        break;
      }
    }
  }
  await writeFile(path, JSON.stringify(fc));
  console.log(`${file}: ${n} streets with period names`);
}
