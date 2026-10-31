// Loading layers and deciding which features exist on the map's date. See data/README.md for the contract.

/* global topojson */

const cache = new Map(); // file → Promise<FeatureCollection>

export async function loadCatalog() {
  const res = await fetch('data/catalog.json');
  if (!res.ok) throw new Error(`data/catalog.json: ${res.status}`);
  const catalog = await res.json();
  // Georeferenced period maps to lay under the drawing (data/backdrops.json); optional.
  catalog.backdrops = await fetch('data/backdrops.json')
    .then((r) => (r.ok ? r.json() : { backdrops: [] }))
    .then((j) => j.backdrops || [])
    .catch(() => []);
  return catalog;
}

// The snapshot a layer draws from in a given year: the survey nearest the year (the earlier one on a
// tie), skipping any whose `within` (years either side of its survey) doesn't reach the year.
// Undefined for an ordinary layer; null when no survey is near enough to draw.
// A project may pin a survey with the layer's `snapshot` setting (the survey's year), for a map whose
// area the nearest survey doesn't cover.
export function layerSnapshot(layer, year, pin) {
  if (!layer.snapshots?.length) return undefined;
  const pinned = pin != null && layer.snapshots.find((s) => s.year === pin);
  if (pinned) return pinned;
  const near = layer.snapshots.filter((s) => s.within == null || Math.abs(s.year - year) <= s.within);
  return near.sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year) || a.year - b.year)[0] ?? null;
}

export function layerFile(layer, year, pin) {
  const snap = layerSnapshot(layer, year, pin);
  return snap === undefined ? layer.file : snap?.file ?? null;
}

export function loadFile(file) {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(`data/${file}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${file}: ${r.status}`);
          return r.json();
        })
        .then(prepare)
        .catch((err) => {
          cache.delete(file);
          throw err;
        }),
    );
  }
  return cache.get(file);
}

function prepare(json) {
  let fc = json;
  if (json.type === 'Topology') {
    const key = Object.keys(json.objects)[0];
    fc = topojson.feature(json, json.objects[key]);
  }
  if (fc.type === 'Feature') fc = { type: 'FeatureCollection', features: [fc] };
  fc.features = fc.features.filter((f) => f.geometry);
  fc.features.forEach((f, i) => {
    f.properties ||= {};
    f._key = String(f.id ?? f.properties.id ?? f.properties.osm_id ?? i);
    rewind(f.geometry);
    f._bbox = bbox(f.geometry);
  });
  return fc;
}

// d3-geo wants exterior rings clockwise and holes counter-clockwise (in lon/lat with y up);
// GeoJSON from most tools is the other way round. Planar area is fine at these sizes.
function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}
function rewindPolygon(rings) {
  rings.forEach((ring, i) => {
    const a = ringArea(ring);
    if ((i === 0 && a > 0) || (i > 0 && a < 0)) ring.reverse();
  });
}
function rewind(g) {
  if (g.type === 'Polygon') rewindPolygon(g.coordinates);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(rewindPolygon);
  else if (g.type === 'GeometryCollection') g.geometries.forEach(rewind);
}

function bbox(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < b[0]) b[0] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] > b[3]) b[3] = c[1];
    } else c.forEach(walk);
  };
  if (g.type === 'GeometryCollection') g.geometries.forEach((x) => walk(x.coordinates));
  else walk(g.coordinates);
  return b;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function mapDate(project) {
  return `${String(project.year).padStart(4, '0')}-${pad2(project.month || 7)}-${pad2(project.day || 1)}`;
}

// Is this feature on the map on the project's date? cfg is the map's settings for the layer:
// `undated` draws features of unknown date, `anyYear` ignores the layer's own year span.
export function alive(f, layer, project, cfg = {}) {
  const p = f.properties;
  const year = project.year;
  const date = mapDate(project);
  if (!cfg.anyYear && layer.start != null && year < layer.start) return false;
  if (!cfg.anyYear && layer.end != null && year >= layer.end) return false;
  if (p.date_quality === 'unknown' && layer.undated === 'hide' && !cfg.undated) return false;
  if (p.start_date) {
    if (date < p.start_date) return false;
  } else if (p.start != null && p.start > year) return false;
  if (p.end_date) {
    if (date >= p.end_date) return false;
  } else if (p.end != null && year >= p.end) return false;
  // Story sites (canon/places.yml) show for the map's chapter, else for years their canon entry covers.
  if (layer.render === 'site' && !cfg.anyYear) {
    if (project.chapter) return !!p.chapters?.includes(project.chapter);
    return !!p.years?.includes(year);
  }
  // A place with no start year whose first census count comes well after the map year probably
  // wasn't there yet.
  if (p.start == null && !p.start_date && p.pop && layer.render === 'place') {
    const years = Object.keys(p.pop).map(Number).filter((y) => p.pop[y] > 0);
    if (years.length && Math.min(...years) > year + 10) return false;
  }
  return true;
}

// The name to print: a per-map rename, else the period name for the year, else `name`.
export function featureName(f, layer, project) {
  const key = `${layer.id}:${f._key}`;
  if (project.rename?.[key] != null) return project.rename[key];
  const p = f.properties;
  if (Array.isArray(p.names)) {
    for (const n of p.names) {
      if ((n.start == null || n.start <= project.year) && (n.end == null || project.year < n.end)) return n.name;
    }
  }
  return p.name || '';
}

// The latest census count at or before the year.
export function population(p, year) {
  if (!p.pop) return null;
  let best = null;
  let bestYear = -Infinity;
  for (const [y, v] of Object.entries(p.pop)) {
    const yr = Number(y);
    if (yr <= year && yr > bestYear && v > 0) {
      best = v;
      bestYear = yr;
    }
  }
  return best;
}
