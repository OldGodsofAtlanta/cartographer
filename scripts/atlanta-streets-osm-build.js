// Converts an Overpass JSON response (out geom) to a GeoJSON FeatureCollection of named streets,
// and marks the ways that are present in the 1928 road system.
// Usage: node scripts/atlanta-streets-osm-build.js <overpass.json> <hist-1928-clean.geojson> <out.geojson> [radiusKm-for-residential]
import fs from 'fs';

const [overpassFile, histFile, outFile, radiusArg] = process.argv.slice(2);
if (!overpassFile || !histFile || !outFile) {
  console.error('usage: node atlanta-streets-osm-build.js <overpass.json> <hist.geojson> <out.geojson> [radiusKm]');
  process.exit(1);
}
const RADIUS_KM = radiusArg ? Number(radiusArg) : null;
const FIVE_POINTS = { lat: 33.7537, lon: -84.3910 };
const LAT0 = 33.75;
const COS = Math.cos(LAT0 * Math.PI / 180);
const M = 111320; // metres per degree
const MATCH_M = 25;
const YEAR = 1928;
const HIST_NAME = 'Atlanta 1928 road system (Emory ECDS)';
const round5 = (v) => Math.round(v * 1e5) / 1e5;

// Local planar metres: longitude scaled by cos(33.75°).
const xy = (lon, lat) => [(lon - FIVE_POINTS.lon) * COS * M, (lat - FIVE_POINTS.lat) * M];
const distKm = (lon, lat) => Math.hypot(...xy(lon, lat)) / 1000;

// ---- 1928 grid: index every vertex-to-vertex segment in 50 m cells ----
const CELL = 50;
const cells = new Map();
const key = (cx, cy) => cx + ',' + cy;
let histSegs = 0;
const hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
for (const f of hist.features) {
  const g = f.geometry;
  const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = xy(line[i][0], line[i][1]);
      const [bx, by] = xy(line[i + 1][0], line[i + 1][1]);
      const seg = [ax, ay, bx, by];
      histSegs++;
      const x0 = Math.floor((Math.min(ax, bx) - MATCH_M) / CELL), x1 = Math.floor((Math.max(ax, bx) + MATCH_M) / CELL);
      const y0 = Math.floor((Math.min(ay, by) - MATCH_M) / CELL), y1 = Math.floor((Math.max(ay, by) + MATCH_M) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(seg);
      }
    }
  }
}

const pointSegDist = (px, py, [ax, ay, bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const nearHist = (px, py) => {
  const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const seg of cells.get(key(cx + i, cy + j)) || []) {
      if (pointSegDist(px, py, seg) <= MATCH_M) return true;
    }
  }
  return false;
};

// Point at fraction t of the way along a polyline (in planar metres).
const pointAt = (pts, t) => {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(len); total += len;
  }
  let target = total * t, i = 0;
  while (i < segs.length - 1 && target > segs[i]) { target -= segs[i]; i++; }
  const f = segs[i] === 0 ? 0 : target / segs[i];
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
};

// ---- OSM ways ----
const ov = JSON.parse(fs.readFileSync(overpassFile, 'utf8'));
const stats = { ways: 0, noGeom: 0, residentialDropped: 0, matched: 0, startFromTag: 0, unknown: 0, startTagAfter1928Matched: 0 };
const features = [];
for (const el of ov.elements || []) {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) { stats.noGeom++; continue; }
  stats.ways++;
  const t = el.tags || {};
  const pts = el.geometry.map(p => xy(p.lon, p.lat));
  const center = el.geometry.map(p => distKm(p.lon, p.lat));
  if (RADIUS_KM !== null && t.highway === 'residential') {
    const mid = el.geometry[Math.floor(el.geometry.length / 2)];
    if (distKm(mid.lon, mid.lat) > RADIUS_KM) { stats.residentialDropped++; continue; }
  }
  // Match: all three samples (25/50/75% along) within 25 m of the 1928 grid.
  const samples = [0.25, 0.5, 0.75].map(f => pointAt(pts, f));
  const matched = samples.every(([x, y]) => nearHist(x, y));

  const props = { name: t.name };
  if (t.old_name) props.old_name = t.old_name;
  props.kind = t.highway;
  const startYear = t.start_date && /^\d{4}/.test(t.start_date) ? Number(t.start_date.slice(0, 4)) : null;
  if (matched) {
    stats.matched++;
    if (startYear !== null) stats.startTagAfter1928Matched += startYear > YEAR ? 1 : 0;
    props.in_1928 = true;
    props.start = null;
    props.date_quality = 'snapshot';
    props.date_source = `present in ${HIST_NAME} ${YEAR}`;
  } else if (startYear !== null) {
    stats.startFromTag++;
    props.start = startYear;
    props.date_quality = 'documented';
    props.date_source = 'OSM start_date';
  } else {
    stats.unknown++;
    props.start = null;
    props.date_quality = 'unknown';
  }
  features.push({
    type: 'Feature',
    properties: props,
    geometry: { type: 'LineString', coordinates: el.geometry.map(p => [round5(p.lon), round5(p.lat)]) },
  });
}
fs.writeFileSync(outFile, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(JSON.stringify({ histSegments: histSegs, histCells: cells.size, ...stats, output: features.length }));
