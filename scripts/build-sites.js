// Builds data/canon-sites.geojson: the places in canon/places.yml that can be located, with the chapters
// they appear in and the years their descriptions cover. Locations come from data/sites-sources.json, each
// with how it was found; a site not listed there has no coordinates and is reported as unlocated.
//
//   node scripts/build-sites.js

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { intersections, lineParts } from '../lib/geo.js';
import { georeference } from '../app/georef.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const canon = yaml.load(await readFile(join(HERE, '..', '..', 'canon', 'places.yml'), 'utf8'));
const sources = JSON.parse(await readFile(join(DATA, 'sites-sources.json'), 'utf8')).sites;
const read = async (f) => JSON.parse(await readFile(join(DATA, f), 'utf8'));

const streets = (await read('atlanta-streets-1928.geojson')).features;
const places = (await read('ga-places.geojson')).features;
const lakes = (await read('lakes.geojson')).features;
const backdrops = (await read('backdrops.json')).backdrops;
const starts = (s) => {
  const re = new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return (n) => re.test(n || '');
};
const corner = (a, b) => {
  const hits = intersections(lineParts(streets, starts(a)), lineParts(streets, starts(b)));
  if (!hits.length) throw new Error(`no intersection of ${a} and ${b} in the 1928 streets`);
  return hits[0];
};
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const hoods = (await read('black-neighborhoods.geojson')).features;

// Where an earlier-resolved site, a town, a neighbourhood centre, a street corner or a bare lonlat is.
const done = new Map();
const KX = 111320 * Math.cos((33.75 * Math.PI) / 180);
const KY = 110540;
const refPoint = (ref) => {
  if (ref.site) {
    if (!done.has(ref.site)) throw new Error(`site "${ref.site}" is not located before this one`);
    return done.get(ref.site);
  }
  if (ref.place) return places.find((p) => p.properties.name === ref.place).geometry.coordinates;
  if (ref.neighborhood) {
    const f = hoods.find((h) => h.properties.name === ref.neighborhood);
    if (!f) throw new Error(`no neighbourhood "${ref.neighborhood}"`);
    return f.geometry.coordinates;
  }
  if (ref.intersection) return corner(...ref.intersection).point;
  return ref.lonlat;
};
const offset = ([lon, lat], bearing, metres) => {
  const b = (bearing * Math.PI) / 180;
  return [lon + (Math.sin(b) * metres) / KX, lat + (Math.cos(b) * metres) / KY];
};
// The point on the named 1928 street (any street whose name starts with it) nearest to a point.
const snap = (pt, name) => {
  let best;
  for (const { line } of lineParts(streets, starts(name)))
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      const [ax, ay, bx, by, px, py] = [a[0] * KX, a[1] * KY, b[0] * KX, b[1] * KY, pt[0] * KX, pt[1] * KY];
      const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
      const d = Math.hypot(ax + t * (bx - ax) - px, ay + t * (by - ay) - py);
      if (!best || d < best.d) best = { d, pt: [(ax + t * (bx - ax)) / KX, (ay + t * (by - ay)) / KY] };
    }
  if (!best) throw new Error(`no street "${name}" in the 1928 layer`);
  return best;
};
const label = (ref) => ref.site ? `the located site ${ref.site}` : ref.place ? `${ref.place} (ga-places)` : ref.neighborhood ? `the ${ref.neighborhood} centre (Black neighborhoods layer)` : ref.intersection ? `${ref.intersection.join(' & ')} (1928 streets)` : 'a stated point';

const byId = new Map(canon.map((p) => [p.id, p]));
const features = [];
const problems = [];
for (const s of sources) {
  const c = byId.get(s.id);
  if (!c) {
    problems.push(`${s.id}: not in canon/places.yml`);
    continue;
  }
  let lonlat;
  let basis;
  try {
    if (s.intersection) {
      const h = corner(...s.intersection);
      lonlat = h.point;
      basis = `intersection of ${h.names.join(' and ')} in the 1928 street layer (gap ${h.gap_m} m)`;
    } else if (s.midpoint) {
      const [a, b] = s.midpoint.map((p) => corner(...p).point);
      lonlat = [r5((a[0] + b[0]) / 2), r5((a[1] + b[1]) / 2)];
      basis = `midpoint of ${s.midpoint.map((p) => p.join(' & ')).join(' and ')} (1928 street layer)`;
    } else if (s.near) {
      let pt = refPoint(s.near);
      const bits = [label(s.near)];
      if (s.near.bearing != null) {
        pt = offset(pt, s.near.bearing, s.near.distance_m);
        bits.push(`${s.near.distance_m} m on a bearing of ${s.near.bearing}°`);
      }
      if (s.near.snap) {
        const q = snap(pt, s.near.snap);
        pt = q.pt;
        bits.push(`moved ${Math.round(q.d)} m onto ${s.near.snap}`);
      }
      lonlat = pt;
      basis = `${bits.join(', ')}; ${s.canon}`;
    } else if (s.between) {
      const [a, b] = s.between.map(refPoint);
      lonlat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      basis = `midway between ${s.between.map(label).join(' and ')}; ${s.canon}`;
    } else if (s.neighborhood) {
      lonlat = refPoint(s);
      basis = `${label(s)}; ${s.canon}`;
    } else if (s.street) {
      const parts = lineParts(streets, starts(s.street)).sort((x, y) => y.line.length - x.line.length);
      if (!parts.length) throw new Error(`no street "${s.street}"`);
      lonlat = parts[0].line[Math.floor(parts[0].line.length / 2)];
      basis = `the middle of ${parts[0].name} in the 1928 street layer; ${s.canon}`;
    } else if (s.backdrop) {
      const def = backdrops.find((b) => b.id === s.backdrop.id);
      if (!def) throw new Error(`no backdrop "${s.backdrop.id}"`);
      const G = georeference(def.points, def.fit);
      lonlat = G.pixelToLonLat(s.backdrop.px);
      basis = `traced from the backdrop "${def.title}" at pixel ${s.backdrop.px.join(',')} (${s.backdrop.read}); georeference RMS ${G.rmsM} m`;
    } else if (s.place) {
      const f = places.find((p) => p.properties.name === s.place);
      if (!f) throw new Error(`no place "${s.place}" in ga-places`);
      lonlat = f.geometry.coordinates;
      basis = `town centre, ga-places (US Census Gazetteer)`;
    } else if (s.lake) {
      const f = lakes.find((l) => l.properties.name === s.lake);
      if (!f) throw new Error(`no lake "${s.lake}"`);
      const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      lonlat = [r5((Math.min(...xs) + Math.max(...xs)) / 2), r5((Math.min(...ys) + Math.max(...ys)) / 2)];
      basis = `centre of "${s.lake}" in the lakes layer`;
    } else {
      lonlat = s.lonlat;
      basis = s.nominatim ? `${s.nominatim.startsWith("highest") ? "" : "OpenStreetMap via Nominatim: "}${s.nominatim}` : s.canon;
    }
  } catch (e) {
    problems.push(`${s.id}: ${e.message}`);
    continue;
  }
  if (s.canon && !basis.includes(s.canon)) basis += `; ${s.canon}`;
  done.set(s.id, lonlat);
  if (s.precision === 'vicinity' && !s.radius_m) problems.push(`${s.id}: a vicinity needs radius_m`);
  features.push({
    type: 'Feature',
    properties: {
      id: s.id,
      name: s.label,
      canon_name: c.name,
      kind: 'site',
      precision: s.precision,
      chapters: c.appears || [],
      years: Object.keys(c.by_year || {}).map(Number).filter(Number.isInteger),
      basis,
      ...(s.radius_m ? { radius_m: s.radius_m } : {}),
      ...(s.fictional ? { fictional: true } : {}),
      ...(s.confidence ? { confidence: s.confidence } : {}),
      ...(s.note ? { note: s.note } : {}),
      date_quality: 'unknown',
      date_source: 'Not dated: shown for the chapters and years canon/places.yml lists it under',
    },
    geometry: { type: 'Point', coordinates: lonlat.map(r5) },
  });
}

await writeFile(join(DATA, 'canon-sites.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
const located = new Set(features.map((f) => f.properties.id));
const unlocated = canon.filter((p) => !located.has(p.id));
console.log(`${features.length} of ${canon.length} canon sites located`);
for (const p of problems) console.log('  problem:', p);
console.log(`unlocated (${unlocated.length}):`, unlocated.map((p) => p.id).join(', '));
