// Turns the mapshaper output of the Newberry AHCB Georgia file into the
// cartographer data contract. Usage: node build-ga-counties-historical.mjs <stage.geojson> <out.geojson>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
const SOURCE = 'Newberry AHCB';
const PRESENT_N = 20001231; // the AHCB's last date: versions that run to the end of its coverage

const SPECIAL = { DEKALB: 'DeKalb', McINTOSH: 'McIntosh', McDUFFIE: 'McDuffie' };

function titleCase(raw) {
  const name = raw.replace(/\s*\((ext|extinct|orig|original)[^)]*\)\s*/gi, ' ').trim();
  return name
    .split(/\s+/)
    .map((w) => {
      if (SPECIAL[w]) return SPECIAL[w];
      if (w !== w.toUpperCase()) return w; // mixed case already
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function isoFromN(n) {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function dayAfterN(n) {
  const y = Math.floor(n / 10000), m = Math.floor((n % 10000) / 100), d = n % 100;
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

const geo = JSON.parse(readFileSync(inPath, 'utf8'));
const out = [];
for (const f of geo.features) {
  const p = f.properties;
  const startN = Number(p.START_N), endN = Number(p.END_N);
  // A version overlaps 1860-01-01..1950-12-31 when it starts by 1950-12-31 and ends on or after 1860-01-01 (END is the last day it existed)
  if (!(startN <= 19501231 && endN >= 18600101)) continue;
  if (isoFromN(startN) !== String(p.START_DATE).slice(0, 10)) throw new Error('START_N/START_DATE mismatch for ' + p.NAME);
  if (endN !== PRESENT_N && isoFromN(endN) !== String(p.END_DATE).slice(0, 10)) throw new Error('END_N/END_DATE mismatch for ' + p.NAME);
  const startDate = isoFromN(startN);
  const endDate = endN === PRESENT_N ? null : dayAfterN(endN);
  out.push({
    type: 'Feature',
    properties: {
      name: titleCase(p.NAME),
      kind: 'county',
      start_date: startDate,
      end_date: endDate,
      start: Number(startDate.slice(0, 4)),
      end: endDate ? Number(endDate.slice(0, 4)) : null,
      date_quality: 'documented',
      date_source: SOURCE,
      change: p.CHANGE ? String(p.CHANGE).slice(0, 200) : null,
    },
    geometry: f.geometry,
  });
}
out.sort((a, b) => a.properties.start_date.localeCompare(b.properties.start_date) || a.properties.name.localeCompare(b.properties.name));
writeFileSync(outPath, JSON.stringify({ type: 'FeatureCollection', features: out }));
console.log(`wrote ${out.length} features to ${outPath}`);
