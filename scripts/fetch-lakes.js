// Builds data/lakes.geojson (layer "lakes").
// Usage: node scripts/fetch-lakes.js download   (fetches OSM tiles, OSM Okefenokee, NID export into sources/raw/lakes/)
//        node scripts/fetch-lakes.js build      (polygons, NID dating, mapshaper simplify, writes data/lakes.geojson)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'sources/raw/lakes');
const TILES = join(RAW, 'tiles');
const OUT = join(ROOT, 'data/lakes.geojson');
const UA = 'OldGodsCartographer/0.1 (period map maker; no contact address)';
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const NID_URL = 'https://nid.sec.usace.army.mil/api/nation/csv?state=GA';
const NID_FILE = join(RAW, 'nid-export.csv');

// south, west, north, east
const STATE = [30.2, -86.0, 35.3, -80.5];
const ATL = [33.55, -84.65, 34.0, -84.1];
const ROWS = [30.2, 31.2, 32.2, 33.2, 34.2, 35.3];
const COLS = [-86.0, -85.0, -84.0, -83.0, -82.0, -81.0, -80.5];
const NID_STATES = ['Georgia', 'Alabama', 'Florida', 'South Carolina', 'North Carolina', 'Tennessee'];
const KY = 110.574; // km per degree latitude
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- download ----------
async function overpass(query, label) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const url = ENDPOINTS[attempt % 2];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA },
        body: new URLSearchParams({ data: query }),
      });
      if (res.ok) return (await res.json()).elements;
      if ([429, 502, 503, 504].includes(res.status)) {
        console.error(`${label}: HTTP ${res.status} from ${url}, waiting`);
        await sleep(45000);
        continue;
      }
      throw new Error(`${label}: HTTP ${res.status} from ${url}`);
    } catch (e) {
      if (String(e).includes('HTTP')) throw e;
      console.error(`${label}: ${e.message}, waiting`);
      await sleep(30000);
    }
  }
  throw new Error(`${label}: gave up`);
}

const bb = (b) => `(${b.join(',')})`;

async function download() {
  mkdirSync(TILES, { recursive: true });
  for (let r = 0; r < ROWS.length - 1; r++) {
    for (let c = 0; c < COLS.length - 1; c++) {
      const file = join(TILES, `tile-${r}-${c}.json`);
      if (existsSync(file)) continue;
      const b = [ROWS[r], COLS[c], ROWS[r + 1], COLS[c + 1]];
      const q = `[out:json][timeout:300];(way["natural"="water"]${bb(b)};relation["natural"="water"]${bb(b)};way["landuse"="reservoir"]${bb(b)};relation["landuse"="reservoir"]${bb(b)};);out geom;`;
      const els = await overpass(q, `tile ${r},${c}`);
      writeFileSync(file, JSON.stringify({ elements: els }));
      console.error(`tile ${r},${c}: ${els.length} elements`);
      await sleep(3000);
    }
  }
  const okFile = join(RAW, 'okefenokee.json');
  if (!existsSync(okFile)) {
    const q = `[out:json][timeout:300];(way["natural"="wetland"]["name"~"Okefenokee"]${bb(STATE)};relation["natural"="wetland"]["name"~"Okefenokee"]${bb(STATE)};);out geom;`;
    const els = await overpass(q, 'okefenokee');
    writeFileSync(okFile, JSON.stringify({ elements: els }));
    console.error(`okefenokee: ${els.length} elements`);
  }
  if (!existsSync(NID_FILE)) {
    const res = await fetch(NID_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`NID HTTP ${res.status}`);
    writeFileSync(NID_FILE, Buffer.from(await res.arrayBuffer()));
    console.error('NID export saved');
  }
}

// ---------- geometry ----------
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];

// Join open ways into closed rings by matching endpoints.
function stitch(ways) {
  const segs = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const rings = [];
  while (segs.length) {
    let ring = segs.pop();
    for (;;) {
      if (ring.length > 3 && eq(ring[0], ring[ring.length - 1])) break;
      const end = ring[ring.length - 1];
      let joined = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (eq(s[0], end)) { ring = ring.concat(s.slice(1)); segs.splice(i, 1); joined = true; break; }
        if (eq(s[s.length - 1], end)) { ring = ring.concat(s.slice(0, -1).reverse()); segs.splice(i, 1); joined = true; break; }
      }
      if (!joined) break;
    }
    if (ring.length >= 4 && eq(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Returns MultiPolygon coords [[outer, ...holes], ...] or null.
function elementPolys(el) {
  if (el.type === 'way') {
    if (!el.geometry) return null;
    const ring = el.geometry.map((p) => [p.lon, p.lat]);
    if (ring.length < 4 || !eq(ring[0], ring[ring.length - 1])) return null;
    return [[ring]];
  }
  if (el.type === 'relation') {
    const outers = [], inners = [];
    for (const m of el.members || []) {
      if (m.type !== 'way' || !m.geometry) continue;
      const seg = m.geometry.map((p) => [p.lon, p.lat]);
      if (m.role === 'inner') inners.push(seg); else outers.push(seg);
    }
    const outerRings = stitch(outers);
    if (!outerRings.length) return null;
    const polys = outerRings.map((r) => [r]);
    for (const hole of stitch(inners)) {
      for (const p of polys) {
        if (pointInRing(hole[0], p[0])) { p.push(hole); break; }
      }
    }
    return polys;
  }
  return null;
}

const meanLat = (ring) => ring.reduce((s, p) => s + p[1], 0) / ring.length;
function signedArea(xy) {
  let s = 0;
  for (let i = 0; i < xy.length - 1; i++) s += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  return s / 2;
}
function polysArea(polys) {
  let total = 0;
  for (const poly of polys) {
    const kx = 111.32 * Math.cos((meanLat(poly[0]) * Math.PI) / 180);
    const xy = poly.map((r) => r.map(([lo, la]) => [lo * kx, la * KY]));
    total += Math.abs(signedArea(xy[0])) - xy.slice(1).reduce((a, r) => a + Math.abs(signedArea(r)), 0);
  }
  return total;
}
function bboxOf(polys) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of polys) for (const r of p) for (const [lo, la] of r) {
    if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo;
  }
  return [s, w, n, e];
}

// Distance in km from a point to the boundary of a MultiPolygon, planar, lon scaled by cos(lat).
function boundaryDistKm(pt, polys) {
  const kx = 111.32 * Math.cos((pt[1] * Math.PI) / 180);
  let best = Infinity;
  for (const p of polys) for (const ring of p) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i][0] - pt[0]) * kx, ay = (ring[i][1] - pt[1]) * KY;
      const bx = (ring[i + 1][0] - pt[0]) * kx, by = (ring[i + 1][1] - pt[1]) * KY;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? (-(ax * dx + ay * dy)) / L : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

// ---------- NID ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadDams() {
  const rows = parseCSV(readFileSync(NID_FILE, 'utf8'));
  const h = rows.findIndex((r) => r[0] === 'Dam Name');
  const col = Object.fromEntries(rows[h].map((k, i) => [k, i]));
  const num = (v) => (v === '' || v === undefined ? NaN : Number(v));
  const dams = [];
  for (const r of rows.slice(h + 1)) {
    if (r.length < 60 || !NID_STATES.includes(r[col['State']])) continue;
    const lat = num(r[col['Latitude']]), lon = num(r[col['Longitude']]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    dams.push({
      name: r[col['Dam Name']],
      text: `${r[col['Dam Name']]} | ${r[col['Other Names']]} | ${r[col['Former Names']]} | ${r[col['River or Stream Name']]}`.toLowerCase(),
      lat, lon,
      state: r[col['State']],
      year: num(r[col['Year Completed']]),
      normal: num(r[col['Normal Storage (Acre-Ft)']]) || 0,
      max: num(r[col['Max Storage (Acre-Ft)']]) || 0,
      acres: num(r[col['Surface Area (Acres)']]) || 0,
    });
  }
  return dams;
}

const NAME_STOP = new Set(['lake', 'reservoir', 'the', 'lk', 'dam', 'pond', 'river', 'creek', 'north', 'south', 'east', 'west']);
function nameKeys(name) {
  return name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length >= 4 && !NAME_STOP.has(t));
}

// Manual overrides for named water bodies where a source gives a first-fill year
// that differs from, or is missing in, NID. Each carries its source. Filled in after checking sources.
const OVERRIDES = [
  { match: /^Lake Lanier$/i, start: 1956, dq: 'documented', source: 'Wikipedia "Lake Lanier": filling began 1 Feb 1956 at Buford Dam (NID year completed differs; see build-report)' },
  { match: /^Lake Allatoona$/i, start: 1949, dq: 'documented', source: 'Wikipedia "Lake Allatoona": dam completed 1949, reservoir began filling Dec 1949 (NID differs; see build-report)' },
  { match: /^Lake Harding$/i, start: 1926, dq: 'documented', source: 'Wikipedia "Lake Harding": built 1926 by Columbus Power Co. (Bartletts Ferry)' },
  { match: /^West Point Lake$/i, start: 1974, dq: 'documented', source: 'Wikipedia "West Point Lake": filling began 16 Oct 1974 (dam completed 1975 per infobox)' },
  { match: /Clarks? Hill Lake|Thurmond Lake/i, start: 1951, dq: 'documented', source: 'Wikipedia "Clarks Hill Lake": filling 1951-52, dam completed 1954 (NID differs; see build-report)' },
  { match: /^(Lake )?Tallulah( Lake)?$/i, start: 1914, dq: 'documented', source: 'Wikipedia "Lake Tallulah": formed 1914 with completion of Tallulah Falls Dam' },
  { match: /^(Lake )?Jackson( Lake)?$/i, start: 1911, dq: 'documented', source: 'Wikipedia "Lake Jackson (Georgia)": Lloyd Shoals Dam completed 1911 (built 1910); the reservoir is Jackson Lake' },
  { match: /^Lake Rabun$/i, start: 1925, dq: 'documented', source: 'NID: Mathis & Terrora (Mathis Dam at Lake Rabun, 1925; NID-matched). Wikipedia gives Mathis Dam completed 1915 and the lake filled about 1925 (disagreement noted)' },
  { match: /^Lake Seminole$/i, start: 1954, dq: 'documented', source: 'NID: Jim Woodruff Lock and Dam (1954). Wikipedia "Lake Seminole" gives dam completed 1952 (disagreement noted)' },
  { match: /Walter F\.? George/i, start: 1962, dq: 'documented', source: 'NID: Walter F. George Lock and Dam (1962). Wikipedia names the lake Eufaula in 1963 (disagreement noted)' },
  { match: /^Lake Sinclair$/i, start: 1953, dq: 'documented', source: 'Wikipedia "Lake Sinclair": "created in 1953"' },
  { match: /Clara Meer/i, start: 1895, dq: 'approximate', source: 'Piedmont Park history (WebSearch): small spring-fed lake 1887, enlarged for 1895 Cotton States Exposition as Lake Clara Meer' },
  { match: /^Lakewood/i, start: 1875, dq: 'approximate', source: 'Taken as the impoundment of the city\'s first waterworks, which stood at Lakewood and began pumping from the South River on 11 Sep 1875 (waterworkshistory.us/GA/Atlanta, citing Atlanta Constitution 12 Sep 1875; NPS Hemphill Avenue Station nomination). NID\'s 1950 for Lakewood Fairgrounds Lake Dam is read as a later dam. Check Garrett, Atlanta and Environs, 914-916' },
  { match: /Abana/i, start: 1883, end: 1960, dq: 'approximate', source: 'Grant Park history (Atlanta Magazine, Georgia Encyclopedia via WebSearch): in original park layout; drained 1960s for zoo parking; year of drainage not exact' },
];

function dateFor(feature, polys, dams, osmTags) {
  const cands = dams.filter((d) => {
    if (!Number.isFinite(d.year)) return false;
    const pad = 1 / KY;
    const padLon = 1 / (111.32 * Math.cos((feature.lat * Math.PI) / 180));
    return d.lat > feature.bbox[0] - pad && d.lat < feature.bbox[2] + pad && d.lon > feature.bbox[1] - padLon && d.lon < feature.bbox[3] + padLon;
  }).filter((d) => boundaryDistKm([d.lon, d.lat], polys) <= 1);
  if (!cands.length) return null;
  const keys = nameKeys(feature.name || '');
  const named = cands.filter((d) => keys.length && keys.some((k) => d.text.includes(k)));
  const pool = named.length ? named : cands;
  pool.sort((a, b) => (b.normal || b.max) - (a.normal || a.max) || b.acres - a.acres);
  const d = pool[0];
  return { year: d.year, dam: d.name, nameMatch: named.length > 0, nCands: cands.length, storage: d.normal || d.max };
}

const sameName = (a, b) => a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '');

function classify(el, feature, polys, dams) {
  const tags = el.tags || {};
  const osmStart = /^\d{4}/.test(tags.start_date || '') ? Number(tags.start_date.slice(0, 4)) : null;
  const nid = dateFor(feature, polys, dams, tags);
  let kind = 'lake';
  if (tags.water === 'pond') kind = 'pond';
  else if (tags.water === 'reservoir' || tags.landuse === 'reservoir' || nid) kind = 'reservoir';

  let start = null, dq = 'unknown', src = 'no source found';
  const ov = OVERRIDES.find((o) => feature.name && o.match.test(feature.name));
  let end = null;
  if (ov) {
    start = ov.start; end = ov.end ?? null; dq = ov.dq; src = ov.source;
  } else if (nid) {
    // A dam matched only by being the biggest one nearby may belong to another pond, or be a later rebuild.
    start = nid.year; dq = nid.nameMatch ? 'documented' : 'approximate';
    src = `NID: ${nid.dam}${nid.nameMatch ? '' : ' (nearest largest; name not matched)'}`;
  } else if (osmStart) {
    start = osmStart; dq = 'documented'; src = `OSM start_date=${tags.start_date}`;
  }
  const disagree = nid && osmStart && osmStart !== nid.year ? { name: feature.name, nid: nid.year, osm: osmStart } : null;
  return { kind, start, end, dq, src, disagree, nidCands: nid ? nid.nCands : 0 };
}

// ---------- build ----------
function build() {
  const dams = loadDams();
  console.error(`NID dams loaded (GA + neighbours): ${dams.length}`);

  const all = new Map();
  const wanted = (el) => {
    const t = el.tags || {};
    if (!(t.natural === 'water' || t.landuse === 'reservoir')) return false;
    return !t.water || ['lake', 'reservoir', 'pond'].includes(t.water);
  };
  for (const f of readdirSorted(TILES)) {
    for (const el of JSON.parse(readFileSync(join(TILES, f), 'utf8')).elements) {
      if (wanted(el)) all.set(`${el.type}/${el.id}`, el);
    }
  }
  const cand = [...all.values()];

  // polygons for every candidate
  const polyOf = new Map();
  for (const el of cand) { const p = elementPolys(el); if (p) polyOf.set(el, p); }
  // drop ways that are members of a relation we keep (the relation carries the geometry)
  const memberWays = new Set();
  for (const el of polyOf.keys()) if (el.type === 'relation') for (const m of el.members || []) if (m.type === 'way') memberWays.add(`way/${m.ref}`);

  const statewide = [], atlanta = [];
  const disagreements = [];
  const stats = { cands: cand.length, withGeom: 0, big: 0, atlantaSmall: 0 };
  for (const [el, polys] of polyOf) {
    if (el.type === 'way' && memberWays.has(`way/${el.id}`)) continue;
    stats.withGeom++;
    const area = polysArea(polys);
    const b = bboxOf(polys);
    const name = (el.tags || {}).name || '';
    const inAtl = b[0] <= ATL[2] && b[2] >= ATL[0] && b[1] <= ATL[3] && b[3] >= ATL[1];
    const feature = { name, bbox: b, lat: (b[0] + b[2]) / 2 };
    const osm = `${el.type}/${el.id}`;
    if (area >= 1) {
      stats.big++;
      const c = classify(el, feature, polys, dams);
      if (c.disagree) disagreements.push(c.disagree);
      statewide.push({ osm, name, polys, area, c });
    } else if (inAtl && name && area >= 0.01) {
      stats.atlantaSmall++;
      const c = classify(el, feature, polys, dams);
      if (c.disagree) disagreements.push(c.disagree);
      atlanta.push({ osm, name, polys, area, c });
    }
  }

  // Okefenokee (natural=wetland)
  const ok = readJSON(join(RAW, 'okefenokee.json')).elements;
  for (const el of ok) {
    const polys = elementPolys(el);
    if (!polys) continue;
    const area = polysArea(polys);
    if (area < 1) continue;
    statewide.push({
      osm: `${el.type}/${el.id}`, name: el.tags.name, polys, area,
      c: { kind: 'swamp', start: null, dq: 'natural', src: 'natural wetland (OSM natural=wetland); no impoundment', disagree: null },
    });
  }

  // Atlanta-area named features also get the override/NID date; statewide ones are already dated.
  const mkFeature = (f, precision) => ({
    type: 'Feature',
    properties: {
      name: f.name,
      kind: f.c.kind,
      start: f.c.start,
      end: f.c.end ?? null,
      date_quality: f.c.dq,
      date_source: f.c.src,
      area_km2: Math.round(f.area * 100) / 100,
      osm: f.osm,
    },
    geometry: { type: 'MultiPolygon', coordinates: f.polys.map((p) => p.map((r) => r.map(([lo, la]) => [round(lo, precision), round(la, precision)]))) },
  });
  const round = (v, p) => Math.round(v / p) * p;
  const decimals = (p) => Number(p.toFixed(6));

  const precise = { type: 'FeatureCollection', features: statewide.map((f) => mkFeature(f, 0.0001)) };
  const preciseFile = join(RAW, 'statewide-precise.geojson');
  const simpFile = join(RAW, 'statewide-simplified.geojson');
  writeFileSync(preciseFile, JSON.stringify(precise));
  execFileSync('npx', ['mapshaper', '-i', preciseFile, '-simplify', '15%', 'keep-shapes', '-o', 'format=geojson', 'precision=0.0001', simpFile], { cwd: ROOT, stdio: 'inherit' });
  const simp = readJSON(simpFile).features;
  const atlFeatures = atlanta.map((f) => mkFeature(f, 0.00001));
  const features = [...simp, ...atlFeatures].map((f) => {
    const multi = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    f.geometry = { type: 'MultiPolygon', coordinates: multi.map((poly) => poly.map((ring) => ring.map(([lo, la]) => [decimals(lo), decimals(la)]))) };
    return f;
  });
  features.sort((a, b) => (a.properties.name || '').localeCompare(b.properties.name || '') || b.properties.area_km2 - a.properties.area_km2);
  const fc = { type: 'FeatureCollection', features };
  writeFileSync(OUT, JSON.stringify(fc));
  writeFileSync(join(RAW, 'build-report.json'), JSON.stringify({ stats, disagreements }, null, 1));
  console.error('stats', JSON.stringify(stats), 'features', features.length);
}

function readdirSorted(dir) {
  return readdirFs(dir).sort();
}
import { readdirSync } from 'node:fs';
const readdirFs = (d) => readdirSync(d);
const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));

const cmd = process.argv[2];
if (cmd === 'download') await download();
else if (cmd === 'build') build();
else console.error('usage: fetch-lakes.js download|build');
