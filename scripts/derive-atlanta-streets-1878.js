// Derives an 1878 street layer: the parts of the 1928 street centrelines that run in the gaps
// between the 1878 city blocks. A 1928 street that cuts through an 1878 block, or runs where there
// were no blocks yet, is left out.
//
//   node scripts/derive-atlanta-streets-1878.js
//
// Reads data/atlanta-streets-1928.geojson and data/atlanta-blocks-1878.geojson; writes
// data/atlanta-streets-1878.geojson. Names are the 1928 dataset's (often later) names.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const LAT0 = 33.75;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110540;
const STEP = 12; // metres between samples along a street
const NEAR = 32; // a sample this close to a block edge is "in the street grid"
const MIN_RUN = 50; // shortest run of street kept, metres

const toM = ([lon, lat]) => [lon * KX, lat * KY];
const toLL = ([x, y]) => [Math.round((x / KX) * 1e5) / 1e5, Math.round((y / KY) * 1e5) / 1e5];

const blocks = JSON.parse(await readFile(join(DATA, 'atlanta-blocks-1878.geojson'), 'utf8'));
const streets = JSON.parse(await readFile(join(DATA, 'atlanta-streets-1928.geojson'), 'utf8'));

// Block rings in metres, with a grid index of edges.
const CELL = 60;
const grid = new Map();
const rings = [];
for (const f of blocks.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0].map(toM);
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of ring) {
      bb[0] = Math.min(bb[0], x);
      bb[1] = Math.min(bb[1], y);
      bb[2] = Math.max(bb[2], x);
      bb[3] = Math.max(bb[3], y);
    }
    const ri = rings.push({ ring, bb }) - 1;
    for (let i = 1; i < ring.length; i++) {
      const [a, b] = [ring[i - 1], ring[i]];
      for (let cx = Math.floor(Math.min(a[0], b[0]) / CELL); cx <= Math.floor(Math.max(a[0], b[0]) / CELL); cx++)
        for (let cy = Math.floor(Math.min(a[1], b[1]) / CELL); cy <= Math.floor(Math.max(a[1], b[1]) / CELL); cy++) {
          const k = `${cx},${cy}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push([a, b, ri]);
        }
    }
  }
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// In the street grid: near a block edge, and not inside a block.
function ok(p) {
  const cx = Math.floor(p[0] / CELL);
  const cy = Math.floor(p[1] / CELL);
  let near = false;
  const seen = new Set();
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      for (const [a, b, ri] of grid.get(`${cx + dx},${cy + dy}`) || []) {
        if (!near && segDist(p, a, b) <= NEAR) near = true;
        if (seen.has(ri)) continue;
        seen.add(ri);
        const { ring, bb } = rings[ri];
        if (p[0] >= bb[0] && p[0] <= bb[2] && p[1] >= bb[1] && p[1] <= bb[3] && inRing(p, ring)) return false;
      }
    }
  return near;
}

function resample(line) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

const features = [];
let kept = 0;
let total = 0;
for (const f of streets.features) {
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const runs = [];
  for (const part of parts) {
    const pts = resample(part.map(toM));
    total += pts.length;
    let run = [];
    const flush = () => {
      if (run.length * STEP >= MIN_RUN) runs.push(run.map(toLL));
      run = [];
    };
    for (const p of pts) {
      if (ok(p)) run.push(p);
      else flush();
    }
    flush();
  }
  if (!runs.length) continue;
  kept += runs.reduce((a, r) => a + r.length, 0);
  // Simplify back down: the resampled points are dense and nearly collinear.
  const simple = runs.map((r) => r.filter((_, i) => i === 0 || i === r.length - 1 || i % 3 === 0));
  features.push({
    type: 'Feature',
    properties: {
      ...(f.properties.name ? { name: f.properties.name } : {}),
      kind: f.properties.kind,
      date_quality: 'snapshot',
      date_source: '1928 street centrelines (ECDS) kept where they run between the ECDS 1878 blocks; names are the 1928 names',
    },
    geometry: simple.length === 1 ? { type: 'LineString', coordinates: simple[0] } : { type: 'MultiLineString', coordinates: simple },
  });
}

await writeFile(join(DATA, 'atlanta-streets-1878.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} streets kept; ${Math.round((kept / total) * 100)}% of the 1928 street length sampled lies in the 1878 grid.`);
