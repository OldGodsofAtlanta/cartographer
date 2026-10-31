// Convert an Overpass `out geom` JSON file to GeoJSON LineStrings with the
// cartographer's waterway properties. Usage:
//   node scripts/overpass-to-geojson.mjs georgia <in.json> <out-named.geojson> <out-unnamed.geojson>
//   node scripts/overpass-to-geojson.mjs atlanta <in.json> <out.geojson>
import fs from 'node:fs';

const [, , mode, input, ...outs] = process.argv;
if (!mode || !input || !outs.length) {
  console.error('usage: overpass-to-geojson.mjs georgia|atlanta <in.json> <out...>');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const R = 6371.0088;

// Rivers and creeks are natural: there throughout, so no years.
const NATURAL = {
  start: null, end: null, date_quality: 'natural',
  date_source: 'Natural watercourse (OpenStreetMap waterway tag)',
};
const UNKNOWN_CANAL = {
  start: null, end: null, date_quality: 'unknown',
  date_source: 'No opening year in OpenStreetMap or a checked source',
};
// Canals with a year from a checked source. Sources disagree (1829-1831); 1830 is the
// year the Georgia historical marker gives for completion and the year Chatham County
// records give for opening. Ends are not set: the canal worked until about 1890 but
// the sources do not give a single end year.
const SAVANNAH_OGEECHEE = {
  start: 1830, end: null, date_quality: 'approximate',
  date_source: 'Georgia historical marker (completed 1830); Chatham County HPC minutes 2006 (opened 1830-31); Georgia Encyclopedia gives 1829',
};
const CANAL_DATES = {
  'Savannah and Ogeechee Canal': SAVANNAH_OGEECHEE,
  'Savannah and Ogeechee Canal - Historical Property': SAVANNAH_OGEECHEE,
};

// Great-circle length of a polyline in km.
function lengthKm(geom) {
  let s = 0;
  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1], b = geom[i];
    const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
    const dLat = p2 - p1, dLon = (b.lon - a.lon) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
    s += 2 * R * Math.asin(Math.sqrt(h));
  }
  return s;
}

const line = (geom) => ({
  type: 'LineString',
  coordinates: geom.map((p) => [p.lon, p.lat]),
});
const feature = (props, geom) => ({ type: 'Feature', properties: props, geometry: line(geom) });
const collection = (features) => ({ type: 'FeatureCollection', features });

const ways = data.elements.filter((e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 1);
const stats = {};
const bump = (k) => (stats[k] = (stats[k] || 0) + 1);

if (mode === 'georgia') {
  const [namedOut, unnamedOut] = outs;
  const named = [], unnamed = [];
  for (const e of ways) {
    const t = e.tags || {};
    const wtype = t.waterway;
    const name = t.name ? t.name.trim() : null;
    // The query already selects these; re-check so the converter is self-contained.
    if (!(wtype === 'river' || wtype === 'canal' || (wtype === 'stream' && name && /River$/.test(name)))) continue;
    const kind = wtype === 'canal' ? 'canal' : 'river';
    const dates = kind === 'canal'
      ? (CANAL_DATES[name] || UNKNOWN_CANAL)
      : NATURAL;
    if (name) {
      named.push(feature({ name, kind, key: `${name}|${kind}`, ...dates }, e.geometry));
      bump(`named ${kind}`);
    } else {
      const km = lengthKm(e.geometry);
      if (km < 2) { bump('dropped unnamed <2 km'); continue; }
      unnamed.push(feature({ kind, ...dates }, e.geometry));
      bump(`kept unnamed ${kind} >=2 km`);
    }
  }
  fs.writeFileSync(namedOut, JSON.stringify(collection(named)));
  fs.writeFileSync(unnamedOut, JSON.stringify(collection(unnamed)));
} else if (mode === 'atlanta') {
  const [out] = outs;
  const features = [];
  for (const e of ways) {
    const t = e.tags || {};
    if (!t.name) continue;
    const kind = t.waterway === 'river' ? 'river' : t.waterway === 'canal' ? 'canal' : 'creek';
    const tunnel = t.tunnel && t.tunnel !== 'no';
    const culvert = t.tunnel === 'culvert' || t.culvert === 'yes' || (tunnel && Number(t.layer) < 0);
    const name = t.name.trim();
    const dates = kind === 'canal' ? (CANAL_DATES[name] || UNKNOWN_CANAL) : NATURAL;
    const props = { name, kind, ...dates };
    if (culvert) { props.culvert = true; bump('culvert'); }
    bump(`${kind}`);
    features.push(feature(props, e.geometry));
  }
  fs.writeFileSync(out, JSON.stringify(collection(features)));
} else {
  console.error('unknown mode', mode);
  process.exit(2);
}
console.log(JSON.stringify(stats));
