// Converts Overpass ways to the railroads-atlanta layer.
// usage: node build-railroads-atlanta.js <overpass.json> <railroads-historical.geojson> <out.geojson>
import fs from 'node:fs';

const [, , ovPath, histPath, outPath] = process.argv;
const M_PER_DEG_LAT = 111320;
const COS = Math.cos(33.75 * Math.PI / 180);
const M_PER_DEG_LON = M_PER_DEG_LAT * COS;
const PREC = 1e5; // 0.00001 deg

// Project lon/lat to planar metres (longitude scaled by cos 33.75).
const xy = ([lon, lat]) => [lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT];
const round5 = (v) => Math.round(v * PREC) / PREC;

// Distance from point p to segment ab, in metres (planar).
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Atack segments as planar polylines with their start year and a bbox (metres).
const hist = JSON.parse(fs.readFileSync(histPath, 'utf8')).features.map((f) => {
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const pl = lines.map((l) => l.map(xy));
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const l of pl) for (const [x, y] of l) {
    minx = Math.min(minx, x); miny = Math.min(miny, y);
    maxx = Math.max(maxx, x); maxy = Math.max(maxy, y);
  }
  return { start: f.properties.start, lines: pl, bbox: [minx, miny, maxx, maxy] };
});

// Point at fraction t of the way's total length (planar metres).
function pointAt(pl, t) {
  let total = 0;
  const segs = [];
  for (let i = 1; i < pl.length; i++) {
    const d = Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
    segs.push(d); total += d;
  }
  let target = total * t;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] === 0 ? 0 : Math.min(1, target / segs[i]);
      const a = pl[i], b = pl[i + 1];
      return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
    }
    target -= segs[i];
  }
  return pl[pl.length - 1];
}

// Match a way to one Atack segment: all three sample points within 400 m of it.
// Among qualifying segments, take the smallest total distance.
function matchStart(pl) {
  if (pl.length < 2) return null;
  const samples = [0.25, 0.5, 0.75].map((t) => pointAt(pl, t));
  let best = null;
  for (const seg of hist) {
    let sum = 0, ok = true;
    for (const p of samples) {
      const [minx, miny, maxx, maxy] = seg.bbox;
      if (p[0] < minx - 400 || p[0] > maxx + 400 || p[1] < miny - 400 || p[1] > maxy + 400) { ok = false; break; }
      let d = Infinity;
      for (const l of seg.lines) for (let i = 1; i < l.length; i++) d = Math.min(d, segDist(p, l[i - 1], l[i]));
      if (d > 400) { ok = false; break; }
      sum += d;
    }
    if (ok && (!best || sum < best.sum)) best = { sum, start: seg.start };
  }
  return best ? best.start : null;
}

// OSM start_date -> year, and whether it is a full date/year (documented) or fuzzy (approximate).
function parseStart(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})/);
  if (!m) return null;
  const exact = /^\d{4}(-\d{1,2}(-\d{1,2})?)?$/.test(s.trim());
  return { year: Number(m[1]), exact };
}

const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
const SERVICE_YARD = new Set(['yard', 'siding', 'spur', 'crossover']);
const stats = { ways: 0, dropped: { subway: 0, marta: 0, tourism: 0, nogeom: 0 }, date_quality: {}, kind: {} };
const features = [];

for (const el of ov.elements) {
  if (el.type !== 'way') continue;
  stats.ways++;
  const t = el.tags || {};
  const railway = t.railway;
  const operatorText = [t.operator, t.network].filter(Boolean).join(' ');
  if (railway === 'subway') { stats.dropped.subway++; continue; }
  if (/MARTA/i.test(operatorText)) { stats.dropped.marta++; continue; }
  if (t.usage === 'tourism') { stats.dropped.tourism++; continue; }
  if (!el.geometry || el.geometry.length < 2) { stats.dropped.nogeom++; continue; }

  const coords = el.geometry.map((g) => [round5(g.lon), round5(g.lat)]);
  const pl = coords.map(xy);

  const abandoned = ['abandoned', 'disused', 'razed'].includes(railway);
  let kind;
  if (SERVICE_YARD.has(t.service)) kind = 'yard';
  else if (t.usage === 'main') kind = 'main';
  else if (t.usage === 'branch' || t.usage === 'industrial') kind = 'branch';
  else if (!t.service) kind = 'main';
  else kind = 'other';

  const props = { kind, abandoned };
  for (const k of ['name', 'operator', 'old_name', 'old_operator', 'historic:operator']) {
    if (t[k]) props[k === 'historic:operator' ? 'historic_operator' : k] = t[k];
  }

  let start = null, quality = 'unknown', source = null;
  const sd = parseStart(t.start_date);
  if (sd) {
    start = sd.year;
    quality = sd.exact ? 'documented' : 'approximate';
    source = 'OSM start_date';
  } else {
    const m = matchStart(pl);
    if (m !== null) { start = m; quality = 'approximate'; source = 'matched to Atack segment'; }
  }
  props.start = start;
  props.end = null;
  props.date_quality = quality;
  if (source) props.date_source = source;

  stats.date_quality[quality] = (stats.date_quality[quality] || 0) + 1;
  stats.kind[kind] = (stats.kind[kind] || 0) + 1;
  const geometry = { type: 'LineString', coordinates: coords };
  features.push({ type: 'Feature', properties: props, geometry });
}

fs.writeFileSync(outPath, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
console.log(JSON.stringify(stats, null, 1));
