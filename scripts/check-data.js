// Checks the layers in data/catalog.json against the contract in data/README.md.
//
//   npm run check
//
// Errors (exit 1): a file that won't parse, a bad year or date, an end before its start, a documented
// date with no source. Warnings: a missing file, a file over 5 MB, a layer with no source note.

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const QUALITY = new Set(['documented', 'approximate', 'snapshot', 'natural', 'unknown']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RENDERERS = new Set(['land', 'counties', 'limits', 'waterLine', 'waterArea', 'street', 'rail', 'place', 'outline', 'blocks', 'tram', 'wards', 'site', 'contour', 'district']);

let errors = 0;
let warnings = 0;
const err = (m) => (errors++, console.log(`  error: ${m}`));
const warn = (m) => (warnings++, console.log(`  warning: ${m}`));

const catalog = JSON.parse(await readFile(join(DATA, 'catalog.json'), 'utf8'));
const ids = new Set();
for (const layer of catalog.layers) {
  console.log(`${layer.id}`);
  if (ids.has(layer.id)) err('duplicate layer id');
  ids.add(layer.id);
  if (!RENDERERS.has(layer.render)) err(`unknown render "${layer.render}"`);
  const files = layer.snapshots ? layer.snapshots.map((s) => s.file) : [layer.file];
  if (!files.every(Boolean)) err('no file');
  if (!existsSync(join(DATA, 'sources', layer.source || `${layer.id}.md`)) && !files.some((f) => f && existsSync(join(DATA, 'sources', f.replace(/\.(geo)?json$/, '.md')))))
    warn('no source note in data/sources/');
  for (const file of files.filter(Boolean)) {
    const path = join(DATA, file);
    if (!existsSync(path)) {
      warn(`${file} is missing`);
      continue;
    }
    const size = (await stat(path)).size;
    if (size > 5e6) warn(`${file} is ${(size / 1e6).toFixed(1)} MB (keep under 5)`);
    let json;
    try {
      json = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      err(`${file} doesn't parse: ${e.message}`);
      continue;
    }
    if (json.type === 'Topology') {
      console.log(`  ${file}: TopoJSON, not checked feature by feature`);
      continue;
    }
    const feats = json.features || [];
    const bad = new Map();
    const note = (k) => bad.set(k, (bad.get(k) || 0) + 1);
    const quality = {};
    for (const f of feats) {
      const p = f.properties || {};
      if (!f.geometry) note('feature without geometry');
      for (const k of ['start', 'end']) if (p[k] != null && !Number.isInteger(p[k])) note(`${k} not a whole year`);
      for (const k of ['start_date', 'end_date']) if (p[k] != null && !DATE.test(p[k])) note(`${k} not YYYY-MM-DD`);
      if (p.start != null && p.end != null && p.end < p.start) note('end before start');
      if (p.start_date && p.end_date && p.end_date < p.start_date) note('end_date before start_date');
      if (p.date_quality && !QUALITY.has(p.date_quality)) note(`date_quality "${p.date_quality}"`);
      if ((p.date_quality === 'documented' || p.date_quality === 'approximate') && (p.start != null || p.end != null) && !p.date_source) note('dated without date_source');
      quality[p.date_quality || '(none)'] = (quality[p.date_quality || '(none)'] || 0) + 1;
    }
    console.log(`  ${file}: ${feats.length} features, ${(size / 1e6).toFixed(2)} MB, ${Object.entries(quality).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    for (const [k, n] of bad) err(`${file}: ${n} × ${k}`);
  }
}
console.log(`\n${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
