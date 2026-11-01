// Builds the contour layers from USGS 3DEP bare-earth elevation (public domain).
//
//   node scripts/build-terrain.js <georgia|atlanta|city|mcdonough|gainesville|lithonia|towns|all>
//
// Downloads a grid of the area from the 3DEP ImageServer (cached in sources/raw/terrain/), smooths it a little,
// traces contours with d3-contour, drops specks and the lines the edge of the grid makes, and writes
// data/terrain-<name>.geojson (simplified with mapshaper to fit the 5 MB rule). Elevations in the layers are feet.

import { writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as d3 from 'd3';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const RAW = join(ROOT, 'sources/raw/terrain');
const DATA = join(ROOT, 'data');
const FT = 3.28084;
const SERVICE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';

// bbox [west, south, east, north]; cellM: grid spacing in metres; interval/index: contour spacing in feet;
// smooth: box-blur passes; minLenM: shortest line kept; simplify: mapshaper percentage.
const AREAS = {
  georgia: { bbox: [-85.9, 30.2, -80.6, 35.4], cellM: 250, interval: 200, index: 1000, smooth: 2, minLenM: 6000, simplify: '8%' },
  atlanta: { bbox: [-84.65, 33.55, -84.1, 34.0], cellM: 20, interval: 20, index: 100, smooth: 1, minLenM: 700, simplify: '12%' },
  city: { bbox: [-84.46, 33.68, -84.3, 33.83], cellM: 10, interval: 10, index: 50, smooth: 1, minLenM: 250, simplify: '25%' },
  // Town sheets outside the Atlanta coverage: 10 ft contours, around the town and its rail line.
  mcdonough: { bbox: [-84.2, 33.4, -84.1, 33.5], cellM: 10, interval: 10, index: 50, smooth: 1, minLenM: 250, simplify: '25%' },
  gainesville: { bbox: [-83.88, 34.26, -83.78, 34.34], cellM: 10, interval: 10, index: 50, smooth: 1, minLenM: 250, simplify: '25%' },
  lithonia: { bbox: [-84.15, 33.67, -84.05, 33.75], cellM: 10, interval: 10, index: 50, smooth: 1, minLenM: 250, simplify: '25%' },
};

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchGrid(name, a) {
  const [w, s, e, n] = a.bbox;
  const mx = 111320 * Math.cos((((s + n) / 2) * Math.PI) / 180);
  const cols = Math.round(((e - w) * mx) / a.cellM);
  const rows = Math.round(((n - s) * 110540) / a.cellM);
  if (cols > 8000 || rows > 8000) throw new Error(`${name}: ${cols}×${rows} is over the service's 8000 px limit; raise cellM`);
  const file = join(RAW, `${name}-${cols}x${rows}.tif`);
  if (!existsSync(file)) {
    const url = `${SERVICE}?bbox=${a.bbox.join(',')}&bboxSR=4326&size=${cols},${rows}&imageSR=4326&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image`;
    const res = await fetch(url, { headers: { 'User-Agent': 'OldGodsCartographer/0.1 (aaboyles@gmail.com)' } });
    if (!res.ok) { console.warn(`${name}: HTTP ${res.status} — skipping`); return null; }
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  fetched ${name} ${cols}×${rows} (${((await stat(file)).size / 1e6).toFixed(1)} MB)`);
  }
  return { file, cols, rows };
}

// Reads an uncompressed 32-bit float TIFF, stripped or tiled (the service sends 128 px tiles).
function readTiff(buf) {
  if (buf.toString('latin1', 0, 2) !== 'II') throw new Error('expected a little-endian TIFF');
  const ifd = buf.readUInt32LE(4);
  const n = buf.readUInt16LE(ifd);
  const tags = {};
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12;
    const tag = buf.readUInt16LE(o);
    const type = buf.readUInt16LE(o + 2);
    const count = buf.readUInt32LE(o + 4);
    const size = { 3: 2, 4: 4 }[type] || 1;
    if (![3, 4].includes(type)) continue;
    const at = count * size > 4 ? buf.readUInt32LE(o + 8) : o + 8;
    const vals = [];
    for (let k = 0; k < count; k++) vals.push(type === 3 ? buf.readUInt16LE(at + k * 2) : buf.readUInt32LE(at + k * 4));
    tags[tag] = vals;
  }
  const [width] = tags[256];
  const [height] = tags[257];
  if (tags[259][0] !== 1 || tags[258][0] !== 32 || (tags[339] || [3])[0] !== 3) throw new Error('expected an uncompressed 32-bit float TIFF');
  const out = new Float32Array(width * height);
  if (tags[324]) {
    const [tw] = tags[322];
    const [th] = tags[323];
    const across = Math.ceil(width / tw);
    tags[324].forEach((off, t) => {
      const x0 = (t % across) * tw;
      const y0 = Math.floor(t / across) * th;
      for (let y = 0; y < th && y0 + y < height; y++)
        for (let x = 0; x < tw && x0 + x < width; x++) out[(y0 + y) * width + x0 + x] = buf.readFloatLE(off + (y * tw + x) * 4);
    });
  } else {
    let p = 0;
    tags[273].forEach((off, i) => {
      const len = tags[279][i];
      for (let k = 0; k < len; k += 4) out[p++] = buf.readFloatLE(off + k);
    });
  }
  return { width, height, data: out };
}

// ── Contours ─────────────────────────────────────────────────────────────────

function blur(data, w, h, passes) {
  let a = data;
  for (let k = 0; k < passes; k++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += a[yy * w + xx];
            c++;
          }
        b[y * w + x] = s / c;
      }
    a = b;
  }
  return a;
}

function build(name, a, grid) {
  const [west, south, east, north] = a.bbox;
  const { width: w, height: h } = grid;
  const mx = 111320 * Math.cos((((south + north) / 2) * Math.PI) / 180);
  const bad = grid.data.reduce((c, v) => c + (v < -100 || v > 3000 ? 1 : 0), 0);
  // Void or wild pixels take the value of a neighbour, so they don't make false peaks and pits.
  const clean = Float32Array.from(grid.data);
  for (let i = 0; i < clean.length; i++) if (clean[i] < -100 || clean[i] > 3000) clean[i] = i > 0 ? clean[i - 1] : 0;
  const z = blur(clean, w, h, a.smooth);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of z) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  // Nothing at or below sea level: over the ocean the service has no data, and the coast is drawn by the states layer.
  const loFt = Math.max(a.interval, Math.ceil((lo * FT) / a.interval) * a.interval);
  const hiFt = Math.floor((hi * FT) / a.interval) * a.interval;
  const levels = [];
  for (let ft = loFt; ft <= hiFt; ft += a.interval) levels.push(ft);
  console.log(`  ${name}: ${w}×${h}, ${bad} bad pixels, ${(lo * FT).toFixed(0)}–${(hi * FT).toFixed(0)} ft, ${levels.length} levels`);

  const lon = (x) => west + (x / w) * (east - west);
  const lat = (y) => north - (y / h) * (north - south);
  const onEdge = (p) => p[0] <= 0.01 || p[1] <= 0.01 || p[0] >= w - 0.01 || p[1] >= h - 0.01;
  const gen = d3.contours().size([w, h]).smooth(true);
  const features = [];
  for (const ft of levels) {
    const poly = gen.contour(z, ft / FT);
    const lines = [];
    for (const polygon of poly.coordinates)
      for (const ring of polygon) {
        // Split the ring wherever it runs along the edge of the grid.
        let cur = [];
        const flush = () => {
          if (cur.length > 1) lines.push(cur);
          cur = [];
        };
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i];
          const q = ring[i + 1];
          if (q && onEdge(p) && onEdge(q) && (p[0] === q[0] || p[1] === q[1]) && (p[0] <= 0.01 || p[1] <= 0.01 || p[0] >= w - 0.01 || p[1] >= h - 0.01)) {
            if (cur.length) cur.push(p);
            flush();
          } else cur.push(p);
        }
        flush();
      }
    const kept = lines
      .filter((l) => {
        let len = 0;
        for (let i = 1; i < l.length; i++) len += Math.hypot((l[i][0] - l[i - 1][0]) * ((east - west) / w) * mx, (l[i][1] - l[i - 1][1]) * ((north - south) / h) * 110540);
        return len >= a.minLenM;
      })
      .map((l) => l.map(([x, y]) => [Math.round(lon(x) * 1e5) / 1e5, Math.round(lat(y) * 1e5) / 1e5]));
    if (!kept.length) continue;
    const isIndex = ft % a.index === 0;
    features.push({
      type: 'Feature',
      properties: { kind: isIndex ? 'index' : 'contour', elev_ft: ft, ...(isIndex ? { name: String(ft) } : {}), date_quality: 'natural', date_source: 'USGS 3DEP bare-earth elevation (modern): see data/sources/terrain.md' },
      geometry: { type: 'MultiLineString', coordinates: kept },
    });
  }
  return { type: 'FeatureCollection', features };
}

await mkdir(RAW, { recursive: true });
const which = process.argv[2] || 'all';
const names = which === 'all' ? ['georgia', 'atlanta', 'city'] : which === 'towns' ? ['mcdonough', 'gainesville', 'lithonia'] : [which];
for (const name of names) {
  const a = AREAS[name];
  if (!a) throw new Error(`unknown area "${name}" (georgia, atlanta, city, all)`);
  const g = await fetchGrid(name, a);
  if (!g) continue;
  const fc = build(name, a, readTiff(await readFile(g.file)));
  const raw = join(RAW, `terrain-${name}-full.geojson`);
  await writeFile(raw, JSON.stringify(fc));
  const out = join(DATA, `terrain-${name}.geojson`);
  execFileSync('npx', ['mapshaper', raw, '-simplify', 'weighted', a.simplify, 'keep-shapes', '-o', 'format=geojson', 'precision=0.00001', out], { cwd: ROOT, stdio: 'pipe' });
  console.log(`  wrote ${out} (${((await stat(out)).size / 1e6).toFixed(2)} MB, ${fc.features.length} levels)`);
}
