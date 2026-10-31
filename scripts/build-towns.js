// Builds the base-map layers for the towns outside the Atlanta street coverage (Marietta, Decatur, Lithonia,
// McDonough, Gainesville) from the OpenStreetMap extracts in sources/raw/towns/:
//   data/town-streets.geojson     named streets within a radius of each town's centre (present-day pattern, undated)
//   data/town-waterways.geojson   named creeks and rivers (natural)
//   data/town-railroads.geojson   rail lines, dated by matching to Atack's segments where they coincide
//
//   node scripts/build-towns.js

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const RAW = join(HERE, '..', 'sources', 'raw', 'towns');

// centre = the town's square or main crossing; radiusKm = how far out the street grid is kept. Beyond it the
// streets are almost all post-war subdivisions.
const TOWNS = {
  marietta: { name: 'Marietta', centre: [-84.5497, 33.9527], radiusKm: 2.0 },
  decatur: { name: 'Decatur', centre: [-84.2965, 33.7745], radiusKm: 1.8 },
  lithonia: { name: 'Lithonia', centre: [-84.1052, 33.7123], radiusKm: 1.5 },
  mcdonough: { name: 'McDonough', centre: [-84.1469, 33.4473], radiusKm: 1.5 },
  gainesville: { name: 'Gainesville', centre: [-83.8241, 34.2979], radiusKm: 2.5 },
};
const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const km = ([lo1, la1], [lo2, la2]) => Math.hypot((lo1 - lo2) * 111.32 * Math.cos((la1 * Math.PI) / 180), (la1 - la2) * 110.54);

const atack = JSON.parse(await readFile(join(DATA, 'railroads-historical.geojson'), 'utf8')).features;
const atackParts = atack.flatMap((f) => (f.geometry.type === 'LineString' ? [[f.properties, f.geometry.coordinates]] : f.geometry.coordinates.map((l) => [f.properties, l])));

function distToLine(p, line) {
  let best = Infinity;
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]].map(([x, y]) => [(x - p[0]) * kx, (y - p[1]) * 110540]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(a[0] + t * dx, a[1] + t * dy));
  }
  return best;
}

// Dates a rail line from Atack's segments: all three sample points within 400 m of the same segment.
function dateRail(line) {
  const pts = [0.25, 0.5, 0.75].map((t) => line[Math.min(line.length - 1, Math.floor(t * (line.length - 1)))]);
  let best = null;
  for (const [props, seg] of atackParts) {
    if (pts.every((p) => distToLine(p, seg) <= 400) && (!best || props.start < best.start)) best = props;
  }
  return best;
}

const streets = [];
const waters = [];
const rails = [];
for (const [id, t] of Object.entries(TOWNS)) {
  const file = join(RAW, `${id}.json`);
  if (!existsSync(file)) {
    console.log(`${id}: no download, skipped`);
    continue;
  }
  const els = JSON.parse(await readFile(file, 'utf8')).elements.filter((e) => e.type === 'way' && e.geometry?.length > 1);
  const counts = { streets: 0, waters: 0, rails: 0, railsDated: 0 };
  for (const e of els) {
    const tags = e.tags || {};
    const line = e.geometry.map((p) => [r5(p.lon), r5(p.lat)]);
    const mid = line[Math.floor(line.length / 2)];
    if (tags.highway) {
      if (km(mid, t.centre) > t.radiusKm) continue;
      streets.push({ type: 'Feature', properties: { name: tags.name, kind: MAIN.has(tags.highway) ? 'main' : 'street', town: t.name, date_quality: 'unknown', date_source: 'OpenStreetMap, present-day street pattern within the town core: not dated' }, geometry: { type: 'LineString', coordinates: line } });
      counts.streets++;
    } else if (tags.waterway) {
      waters.push({ type: 'Feature', properties: { name: tags.name, kind: tags.waterway === 'stream' ? 'creek' : tags.waterway, town: t.name, start: null, end: null, date_quality: 'natural', date_source: 'Natural watercourse (OpenStreetMap waterway tag)' }, geometry: { type: 'LineString', coordinates: line } });
      counts.waters++;
    } else if (tags.railway) {
      if (tags.usage === 'tourism' || tags.service) continue;
      const osmStart = /^\d{4}/.test(tags.start_date || '') ? Number(tags.start_date.slice(0, 4)) : null;
      const match = osmStart ? null : dateRail(line);
      const props = { kind: tags.railway === 'rail' ? 'main' : 'abandoned', town: t.name, ...(tags.name ? { name: tags.name } : {}) };
      if (osmStart) Object.assign(props, { start: osmStart, end: null, date_quality: 'documented', date_source: 'OSM start_date' });
      else if (match) Object.assign(props, { start: match.start, end: null, date_quality: 'approximate', date_source: `matched to Atack's segment (${match.date_source || 'in operation by'} ${match.start})` });
      else Object.assign(props, { start: null, end: null, date_quality: 'unknown', date_source: 'no source: not matched to a dated railroad segment' });
      rails.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: line } });
      counts.rails++;
      if (props.start) counts.railsDated++;
    }
  }
  console.log(`${t.name}: ${counts.streets} streets, ${counts.waters} creeks/rivers, ${counts.rails} rail ways (${counts.railsDated} dated)`);
}
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
await writeFile(join(DATA, 'town-streets.geojson'), fc(streets));
await writeFile(join(DATA, 'town-waterways.geojson'), fc(waters));
await writeFile(join(DATA, 'town-railroads.geojson'), fc(rails));
