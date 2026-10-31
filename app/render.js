// Draws a whole sheet (paper, layers, lettering, notes, furniture, age) into an <svg>.
// Used by the editor and by the headless renderer alike.

/* global d3 */

import { resolveTheme } from './themes.js';
import { paperDefs, paperOverlays } from './paper.js';
import { alive, featureName, population, layerFile, layerSnapshot, loadFile, mapDate } from './data.js';
import { Collider, placePoint, placeLine, placeArea, chain, measure, styledText, fontString, PT } from './labels.js';
import { layoutFurniture } from './furniture.js';
import { drawAnnotations, annotationBoxes } from './annotations.js';
import { fitAffine, georeference } from './georef.js';

export const IN = 96;
const R_EARTH = 6371008.8;
const PX_PER_M = IN / 0.0254;

export function sheetSize(project) {
  return { W: project.paper.width * IN, H: project.paper.height * IN };
}

export function frameOf(project) {
  const { W, H } = sheetSize(project);
  const m = project.paper.margin * IN;
  return { x0: m, y0: m, x1: W - m, y1: H - m, w: W - 2 * m, h: H - 2 * m };
}

function baseProjection(kind) {
  // Lambert conformal on Georgia's statewide parallels, or transverse Mercator on the
  // State Plane West meridian for city sheets.
  return kind === 'conic'
    ? d3.geoConicConformal().parallels([31.4167, 34.2833]).rotate([83.5, 0])
    : d3.geoTransverseMercator().rotate([84.1667, 0]);
}

export function makeProjection(project, frame, clip = true) {
  const v = project.view;
  const p = baseProjection(v.projection).scale((R_EARTH * PX_PER_M) / v.denominator).translate([0, 0]);
  const c = p(v.center);
  p.translate([frame.x0 + frame.w / 2 - c[0], frame.y0 + frame.h / 2 - c[1]]);
  if (clip) p.clipExtent([[frame.x0, frame.y0], [frame.x1, frame.y1]]);
  return p;
}

// The scale denominator that fits a lon/lat box in the frame.
export function fitView(project, bounds) {
  const frame = frameOf(project);
  const [x0, y0, x1, y1] = bounds;
  const pts = { type: 'MultiPoint', coordinates: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]] };
  const p = baseProjection(project.view.projection).fitExtent([[frame.x0, frame.y0], [frame.x1, frame.y1]], pts);
  return { center: [(x0 + x1) / 2, (y0 + y1) / 2], denominator: Math.round((R_EARTH * PX_PER_M) / p.scale()) };
}

// Ground metres per sheet pixel at the frame's centre.
export function metresPerPixel(projection, frame) {
  const cx = frame.x0 + frame.w / 2;
  const cy = frame.y0 + frame.h / 2;
  const a = projection.invert([cx - 50, cy]);
  const b = projection.invert([cx + 50, cy]);
  return (d3.geoDistance(a, b) * R_EARTH) / 100;
}

function viewBounds(projection, frame) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([frame.x0 + t * frame.w, frame.y0], [frame.x0 + t * frame.w, frame.y1], [frame.x0, frame.y0 + t * frame.h], [frame.x1, frame.y0 + t * frame.h]);
  }
  const ll = pts.map((p) => projection.invert(p)).filter(Boolean);
  const xs = ll.map((p) => p[0]);
  const ys = ll.map((p) => p[1]);
  const dx = (Math.max(...xs) - Math.min(...xs)) * 0.05;
  const dy = (Math.max(...ys) - Math.min(...ys)) * 0.05;
  return [Math.min(...xs) - dx, Math.min(...ys) - dy, Math.max(...xs) + dx, Math.max(...ys) + dy];
}

function overlaps(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// Projected polylines of a geometry (clipped to the frame), for lettering and hit tests.
export function projectLines(projection, geometry) {
  const lines = [];
  let cur = null;
  const ctx = {
    beginPath() {},
    moveTo(x, y) {
      cur = [[x, y]];
      lines.push(cur);
    },
    lineTo(x, y) {
      cur.push([x, y]);
    },
    closePath() {
      if (cur?.length) cur.push(cur[0].slice());
    },
    arc() {},
  };
  d3.geoPath(projection, ctx)(geometry);
  return lines;
}

function asLines(g) {
  if (g.type === 'Polygon') return { type: 'MultiLineString', coordinates: g.coordinates };
  if (g.type === 'MultiPolygon') return { type: 'MultiLineString', coordinates: g.coordinates.flat() };
  return g;
}

// Splits polygon outlines into shared edges (drawn once, as boundaries) and unshared ones (coast or
// outer edge), and finds which polygons touch, for the county washes. Cached per feature set.
const edgeCache = new Map();
function edges(features, cacheKey) {
  if (edgeCache.has(cacheKey)) return edgeCache.get(cacheKey);
  const k = (c) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
  const owners = new Map();
  const rings = [];
  features.forEach((f, fi) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys)
      for (const ring of poly) {
        rings.push([fi, ring]);
        for (let i = 0; i < ring.length - 1; i++) {
          const a = k(ring[i]);
          const b = k(ring[i + 1]);
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          if (!owners.has(key)) owners.set(key, new Set());
          owners.get(key).add(fi);
        }
      }
  });
  const shared = [];
  const outer = [];
  const seen = new Set();
  const adj = features.map(() => new Set());
  for (const set of owners.values()) {
    if (set.size > 1) {
      const ids = [...set];
      for (const a of ids) for (const b of ids) if (a !== b) adj[a].add(b);
    }
  }
  for (const [, ring] of rings) {
    let cur = null;
    let curShared = null;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = k(ring[i]);
      const b = k(ring[i + 1]);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const isShared = owners.get(key).size > 1;
      if (isShared && seen.has(key)) {
        cur = null;
        continue;
      }
      seen.add(key);
      if (!cur || curShared !== isShared) {
        cur = [ring[i]];
        curShared = isShared;
        (isShared ? shared : outer).push(cur);
      }
      cur.push(ring[i + 1]);
    }
  }
  const out = {
    shared: { type: 'MultiLineString', coordinates: shared },
    outer: { type: 'MultiLineString', coordinates: outer },
    adj,
  };
  if (edgeCache.size > 40) edgeCache.clear();
  edgeCache.set(cacheKey, out);
  return out;
}

// Greedy four-colouring for the county washes.
function colour(adj, n) {
  const order = [...adj.keys()].sort((a, b) => adj[b].size - adj[a].size);
  const c = new Array(adj.length).fill(-1);
  for (const i of order) {
    const used = new Set([...adj[i]].map((j) => c[j]));
    let pick = 0;
    while (used.has(pick) && pick < n - 1) pick++;
    c[i] = pick;
  }
  return c;
}

// Street names the way the 1911 atlas sets them: PEACHTREE ST, no quadrant suffix.
const ABBR = [
  [/\s+(Northeast|Northwest|Southeast|Southwest|NE|NW|SE|SW)$/i, ''],
  [/\bStreet$/i, 'St'],
  [/\bAvenue$/i, 'Av'],
  [/\bRoad$/i, 'Rd'],
  [/\bPlace$/i, 'Pl'],
  [/\bDrive$/i, 'Dr'],
  [/\bTerrace$/i, 'Ter'],
  [/\bCircle$/i, 'Cir'],
  [/\bCourt$/i, 'Ct'],
  [/\bAlley$/i, 'Al'],
];
function abbreviate(name) {
  let n = name;
  for (const [re, rep] of ABBR) n = n.replace(re, rep);
  return n;
}

// Label styles by role. Sizes are in points on the printed sheet.
export const LABEL = {
  city1: { font: 'IM Fell Great Primer SC', size: 11, upper: true, spacing: 0.08, color: 'ink' },
  city2: { font: 'IM Fell Great Primer SC', size: 8.5, upper: true, spacing: 0.06, color: 'ink' },
  town: { font: 'IM Fell English', size: 7, color: 'ink' },
  village: { font: 'IM Fell English', size: 6, color: 'ink' },
  district: { font: 'IM Fell Great Primer SC', size: 9, upper: true, spacing: 0.3, color: 'inkSoft' },
  state: { font: 'IM Fell Great Primer SC', size: 16, upper: true, spacing: 0.45, color: 'inkSoft' },
  county: { font: 'Spectral', size: 5.5, upper: true, spacing: 0.22, color: 'inkSoft' },
  river: { font: 'IM Fell English', italic: true, size: 6.5, spacing: 0.06, color: 'waterInk' },
  creek: { font: 'IM Fell English', italic: true, size: 5.5, spacing: 0.04, color: 'waterInk' },
  lake: { font: 'IM Fell English', italic: true, size: 6, spacing: 0.04, color: 'waterInk' },
  street: { font: 'Spectral', weight: 600, size: 4.8, upper: true, spacing: 0.05, color: 'ink' },
  rail: { font: 'Spectral', italic: true, size: 5, upper: true, spacing: 0.08, color: 'ink' },
  limits: { font: 'Spectral', weight: 600, size: 5, upper: true, spacing: 0.35, color: 'limits' },
  contour: { font: 'IM Fell English', italic: true, size: 5.6, spacing: 0.03, color: 'inkSoft' },
  site: { font: 'Spectral', weight: 600, size: 5.6, upper: true, spacing: 0.08, color: 'annotation' },
};

function textEl(g, str, s, theme, attrs = {}) {
  const px = s.size * PT;
  const t = g
    .append('text')
    .attr('font-family', s.font)
    .attr('font-size', px.toFixed(2))
    .attr('fill', theme[s.color] || s.color || theme.ink);
  if (s.italic) t.attr('font-style', 'italic');
  if (s.weight && s.weight !== 400) t.attr('font-weight', s.weight);
  if (s.spacing) t.attr('letter-spacing', (s.spacing * px).toFixed(2));
  for (const [k, v] of Object.entries(attrs)) t.attr(k, v);
  if (str) t.text(str);
  return t;
}

export function haloize(t, theme, on) {
  if (on) t.attr('stroke', theme.paper).attr('stroke-width', 1.6).attr('stroke-linejoin', 'round').attr('paint-order', 'stroke').attr('stroke-opacity', 0.85);
}

// Whether a layer is drawn: the project's switch, else the catalog default, and the scale range.
export function layerOn(layer, project, denominator) {
  const cfg = project.layers?.[layer.id] || {};
  const on = cfg.visible ?? layer.visible ?? false;
  if (!on) return false;
  if (cfg.anyScale) return true;
  const [lo, hi] = layer.scaleRange || [0, Infinity];
  return denominator >= lo && denominator <= (hi ?? Infinity);
}

// Period map scans, fetched once and kept as data URLs so exported SVG and PNG carry them.
const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    const url = src.startsWith('backdrops/') ? src : `art/${src}`;
    imageCache.set(
      src,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${url}: ${r.status}`);
          return r.blob();
        })
        .then(async (blob) => {
          const bmp = await createImageBitmap(blob);
          const href = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          });
          return { href, w: bmp.width, h: bmp.height };
        })
        .catch((err) => {
          imageCache.delete(src);
          throw err;
        }),
    );
  }
  return imageCache.get(src);
}

export async function renderMap(svgEl, project, catalog, opts = {}) {
  const t0 = performance.now();
  const theme = resolveTheme(project);
  const { W, H } = sheetSize(project);
  const frame = frameOf(project);
  const projection = makeProjection(project, frame);
  const path = d3.geoPath(projection);
  const denom = project.view.denominator;
  const bounds = viewBounds(projection, frame);
  const seed = [...(project.name || 'map')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const style = project.style || {};
  const stats = {};

  // Load what's needed before touching the DOM, so a slow file doesn't leave half a map.
  const layers = catalog.layers.filter((l) => layerOn(l, project, denom)).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const loaded = new Map();
  const missing = [];
  await Promise.all(
    layers.map(async (l) => {
      const file = layerFile(l, project.year, project.layers?.[l.id]?.snapshot);
      if (!file) return; // a survey layer with no survey near this year
      try {
        loaded.set(l.id, await loadFile(file));
      } catch {
        missing.push(l.id);
      }
    }),
  );
  // Backdrops: each fitted to the sheet from its control points.
  const backdrops = [];
  for (const spec of project.backdrops || []) {
    const def = (catalog.backdrops || []).find((b) => b.id === spec.id);
    if (!def) {
      missing.push(`backdrop:${spec.id}`);
      continue;
    }
    try {
      const img = await loadImage(def.src);
      // Fit the image's corners (placed by its georeference) onto the sheet, so any georeference method works.
      const G = georeference(def.points, def.fit);
      const corners = [[0, 0], [img.w, 0], [0, img.h], [img.w, img.h]];
      const xy = corners.map((c) => projection(G.pixelToLonLat(c)));
      if (xy.some((p) => !p)) throw new Error('corner off the projection');
      backdrops.push({ spec, def, img, matrix: fitAffine(corners, xy), rmsM: G.rmsM });
    } catch (err) {
      missing.push(`backdrop:${spec.id} (${err.message})`);
    }
  }
  // County seats depend on which counties exist on the date.
  let liveCounties = null;
  const countyLayer = catalog.layers.find((l) => l.render === 'counties' && l.historical);
  if (countyLayer && layers.some((l) => l.render === 'place')) {
    try {
      const fc = await loadFile(countyLayer.file);
      liveCounties = new Set(fc.features.filter((f) => alive(f, countyLayer, project, { undated: true })).map((f) => f.properties.name));
    } catch {
      /* no county data: every seat stays a seat */
    }
  }

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('xmlns', 'http://www.w3.org/2000/svg');
  const defs = svg.append('defs');
  paperDefs(defs, theme, seed);
  defs.append('clipPath').attr('id', 'frame-clip').append('rect').attr('x', frame.x0).attr('y', frame.y0).attr('width', frame.w).attr('height', frame.h);

  svg.append('rect').attr('class', 'paper').attr('width', W).attr('height', H).attr('fill', theme.paper);

  const inkFilter = theme.effects.inkBleed > 0 && !opts.fast ? 'url(#f-ink)' : null;
  const mapG = svg.append('g').attr('class', 'map').attr('clip-path', 'url(#frame-clip)');
  for (const { spec, def, img, matrix } of backdrops) {
    mapG
      .append('image')
      .attr('class', spec.guide ? 'backdrop ui' : 'backdrop')
      .attr('data-backdrop', def.id)
      .attr('href', img.href)
      .attr('width', img.w)
      .attr('height', img.h)
      .attr('transform', `matrix(${matrix.map((v) => +v.toFixed(8)).join(',')})`)
      .attr('opacity', spec.opacity ?? 0.5)
      .style('mix-blend-mode', spec.blend || 'multiply');
  }
  const ink = mapG.append('g').attr('class', 'ink').attr('filter', inkFilter);

  const hidden = new Set(project.hidden || []);
  const prepared = [];
  for (const layer of layers) {
    const fc = loaded.get(layer.id);
    if (!fc) continue;
    const cfg = project.layers?.[layer.id] || {};
    const feats = fc.features.filter(
      (f) => overlaps(f._bbox, bounds) && !hidden.has(`${layer.id}:${f._key}`) && alive(f, layer, project, cfg),
    );
    stats[layer.id] = feats.length;
    prepared.push({ layer, cfg, fc, feats });
  }

  // The furniture is laid out before the lettering, so the lettering keeps clear of it.
  const collider = new Collider(W, H);
  const shown = prepared.filter((p) => p.feats.length).map((p) => p.layer);
  const furniture = layoutFurniture(project, theme, frame, projection, catalog, shown, { W, H, denom });
  furniture.boxes.forEach((b) => collider.add(b));
  annotationBoxes(project, projection).forEach((b) => collider.add(b));

  const drawn = [];
  const labelJobs = [];
  const landOn = shown.some((l) => l.render === 'land');
  if (landOn && style.sea) ink.append('rect').attr('x', frame.x0).attr('y', frame.y0).attr('width', frame.w).attr('height', frame.h).attr('fill', theme.sea);

  for (const { layer, cfg, fc, feats } of prepared) {
    drawn.push({ layer, features: feats });
    const g = ink.append('g').attr('class', `layer layer-${layer.id}`).attr('data-layer', layer.id);
    const labelsOn = cfg.labels ?? layerSnapshot(layer, project.year, cfg.snapshot)?.labels ?? layer.labels ?? true;
    const R = RENDERERS[layer.render];
    if (R) R({ g, defs, layer, cfg, feats, fc, theme, path, projection, project, frame, denom, style, labelJobs, labelsOn, liveCounties, layers: shown });
  }

  // Lettering, in priority order.
  const labelG = mapG.append('g').attr('class', 'labels').attr('filter', inkFilter);
  labelJobs.sort((a, b) => a.priority - b.priority);
  for (const job of labelJobs) job.place(labelG, collider);

  drawAnnotations(svg.append('g').attr('class', 'annotations').attr('clip-path', 'url(#frame-clip)').attr('filter', inkFilter), project, theme, projection);
  furniture.draw(svg.append('g').attr('class', 'furniture').attr('filter', inkFilter));
  if (!opts.fast) paperOverlays(svg, theme, W, H, seed);

  return { stats, missing, projection, frame, drawn, backdrops: backdrops.map((b) => ({ id: b.def.id, rmsM: b.rmsM })), ms: Math.round(performance.now() - t0) };
}

// ── Renderers, one per catalog `render` value ─────────────────────────────

function lineLabelJob(ctx, feats, roleFor, priority, opts = {}) {
  const { layer, theme, projection, frame, project, labelJobs, style } = ctx;
  // Group by name, so one river or street gets one set of labels however many pieces it's in.
  const byName = new Map();
  for (const f of feats) {
    let name = featureName(f, layer, project);
    if (opts.text) name = opts.text;
    if (!name) continue;
    if (layer.abbreviate) name = abbreviate(name);
    const role = roleFor(f);
    const key = `${name}|${role}`;
    if (!byName.has(key)) byName.set(key, { name, role, feats: [] });
    byName.get(key).feats.push(f);
  }
  for (const { name, role, feats: group } of byName.values()) {
    const s = { ...LABEL[role], ...(opts.styleFor?.(role) || {}) };
    const text = styledText(name, s);
    const pr = priority + (opts.rank ? opts.rank(group) : 0);
    labelJobs.push({
      priority: pr,
      place(g, collider) {
        const lines = chain(group.flatMap((f) => projectLines(projection, asLines(f.geometry))));
        lines.sort((a, b) => b.length - a.length);
        let n = 0;
        for (const line of lines.slice(0, 6)) {
          const placed = placeLine(line, text, s, collider, frame, { repeat: opts.repeat, offset: opts.offset, straightness: opts.straightness, maxTurn: opts.maxTurn, step: opts.step, smooth: opts.smooth });
          for (const p of placed) {
            const id = `lp-${layer.id}-${labelJobs.indexOf(this)}-${n++}`;
            g.append('path').attr('id', id).attr('d', p.d).attr('fill', 'none').attr('stroke', 'none');
            const t = textEl(g, '', s, theme, opts.central ? { 'dominant-baseline': 'central' } : { dy: opts.dy ?? -(s.size * PT * 0.35) });
            haloize(t, theme, (style.halo || opts.halo) && !opts.central);
            t.append('textPath').attr('href', `#${id}`).attr('startOffset', '50%').attr('text-anchor', 'middle').text(text);
          }
          if (n && !opts.repeat) break;
        }
      },
    });
  }
}

const RENDERERS = {
  land(ctx) {
    const { g, feats, theme, path, cfg, layer, style } = ctx;
    const highlight = new Set(cfg.highlight || layer.highlight || ['Georgia']);
    const e = edges(feats, `${layer.id}:${feats.length}`);
    if (style.sea) {
      // Water-lining along the coast, under the land fill: each stroke is half covered by land.
      const coast = path(e.outer);
      const gap = 1.7;
      for (let k = 5; k >= 1; k--) {
        g.append('path').attr('d', coast).attr('fill', 'none').attr('stroke', theme.waterInk).attr('stroke-opacity', 0.25 + 0.12 * (5 - k)).attr('stroke-width', 2 * k * gap);
        g.append('path').attr('d', coast).attr('fill', 'none').attr('stroke', theme.sea).attr('stroke-width', 2 * k * gap - 0.8);
      }
    }
    g.selectAll('path.land')
      .data(feats)
      .join('path')
      .attr('class', 'land')
      .attr('d', path)
      .attr('fill', (f) => (highlight.has(f.properties.name) ? theme.land : theme.landOther));
    if (style.sea) g.append('path').attr('d', path(e.outer)).attr('fill', 'none').attr('stroke', theme.waterInk).attr('stroke-width', 0.7);
    g.append('path').attr('d', path(e.shared)).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', 1.1).attr('stroke-dasharray', '7 2 1.2 2');
    if (ctx.labelsOn) {
      for (const f of feats) {
        if (highlight.has(f.properties.name) && ctx.denom < 4e6) continue; // the subject state needn't be named on its own map
        ctx.labelJobs.push({
          priority: 5,
          place(lg, collider) {
            const s = LABEL.state;
            const text = styledText(f.properties.name, s);
            const p = placeInside(f, text, s, collider, ctx);
            if (p) textEl(lg, text, { ...s, size: p.size }, theme, { x: p.x, y: p.y, 'text-anchor': 'middle', opacity: 0.8, transform: p.rotate ? `rotate(${p.rotate},${p.x},${p.y})` : null });
          },
        });
      }
    }
  },

  counties(ctx) {
    const { g, feats, theme, path, cfg, layer, style, project, layers } = ctx;
    const key = `${layer.id}:${feats.map((f) => f._key).join(',')}`;
    const e = edges(feats, key);
    if ((cfg.tint ?? style.countyTints) && theme.tints) {
      const c = colour(e.adj, theme.tints.length);
      g.append('g')
        .style('mix-blend-mode', 'multiply')
        .selectAll('path')
        .data(feats)
        .join('path')
        .attr('d', path)
        .attr('fill', (_, i) => theme.tints[c[i]])
        .attr('fill-opacity', 0.55);
    }
    g.append('path').attr('d', path(e.shared)).attr('fill', 'none').attr('stroke', theme.inkSoft).attr('stroke-width', 0.6).attr('stroke-dasharray', '3 1.6');
    if (!layers.some((l) => l.render === 'land')) g.append('path').attr('d', path(e.outer)).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', 0.9);
    if (ctx.labelsOn) {
      feats.forEach((f) => {
        ctx.labelJobs.push({
          priority: 40,
          place(lg, collider) {
            const [cx, cy] = path.centroid(f);
            if (!Number.isFinite(cx)) return;
            const b = path.bounds(f);
            const s = LABEL.county;
            const text = styledText(featureName(f, layer, project), s);
            const p = placeArea(cx, cy, (b[1][0] - b[0][0]) * 0.92, text, s, collider, ctx.frame);
            if (p) textEl(lg, text, s, theme, { x: p.x, y: p.y, 'text-anchor': 'middle' });
          },
        });
      });
    }
  },

  limits(ctx) {
    const { g, feats, theme, path } = ctx;
    g.selectAll('path')
      .data(feats)
      .join('path')
      .attr('d', (f) => path(asLines(f.geometry)))
      .attr('fill', 'none')
      .attr('stroke', theme.limits)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '9 2.5 1.5 2.5');
    if (ctx.labelsOn) lineLabelJob(ctx, feats, () => 'limits', 60, { text: ctx.layer.labelText || 'City Limits', repeat: 4 * IN, dy: -3.5 });
  },

  waterLine(ctx) {
    const { g, feats, theme, path, denom } = ctx;
    const fine = denom < 200000;
    const width = (k) => (k === 'river' ? (fine ? 1.4 : 0.95) : k === 'canal' ? 0.9 : fine ? 0.75 : 0.5);
    g.selectAll('path')
      .data(feats)
      .join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', theme.waterInk)
      .attr('stroke-width', (f) => width(f.properties.kind))
      // Culverted today: the line is the pipe's course, not the old channel, so it's drawn uncertain.
      .attr('stroke-dasharray', (f) => (f.properties.culvert ? '3 2' : null))
      .attr('stroke-linecap', (f) => (f.properties.culvert ? 'butt' : 'round'))
      .attr('stroke-linejoin', 'round');
    if (ctx.labelsOn)
      lineLabelJob(ctx, feats, (f) => (f.properties.kind === 'river' ? 'river' : 'creek'), 30, {
        repeat: (fine ? 3.5 : 2.6) * IN,
        // Long rivers are lettered before the towns, as on the period state maps.
        rank: (group) => (group.reduce((n, f) => n + JSON.stringify(f.geometry.coordinates).length, 0) > 12000 ? -21 : 0) - Math.min(5, group.length / 10),
        // Rivers wind: let the lettering follow a looser curve than a street's.
        straightness: 0.7,
        maxTurn: 0.6,
        step: 0.6,
        smooth: 4,
      });
  },

  waterArea(ctx) {
    const { g, defs, feats, theme, path, layer, project } = ctx;
    if (!feats.length) return;
    const clipId = `clip-${layer.id}`;
    defs.append('clipPath').attr('id', clipId).selectAll('path').data(feats).join('path').attr('d', path);
    const all = feats.map(path).join('');
    const wl = g.append('g').attr('clip-path', `url(#${clipId})`);
    wl.append('path').attr('d', all).attr('fill', theme.water);
    // Water-lining: concentric lines inside the shore, fading outward.
    const gap = 1.5;
    for (let k = 3; k >= 1; k--) {
      wl.append('path').attr('d', all).attr('fill', 'none').attr('stroke', theme.waterInk).attr('stroke-opacity', 0.3 + 0.15 * (3 - k)).attr('stroke-width', 2 * k * gap);
      wl.append('path').attr('d', all).attr('fill', 'none').attr('stroke', theme.water).attr('stroke-width', 2 * k * gap - 0.7);
    }
    g.append('path').attr('d', all).attr('fill', 'none').attr('stroke', theme.waterInk).attr('stroke-width', 0.6);
    if (ctx.labelsOn) {
      for (const f of feats) {
        const name = featureName(f, layer, project);
        if (!name) continue;
        ctx.labelJobs.push({
          priority: 35,
          place(lg, collider) {
            const b = path.bounds(f);
            const [cx, cy] = path.centroid(f);
            if (!Number.isFinite(cx)) return;
            const s = LABEL.lake;
            const text = styledText(name, s);
            const p = placeArea(cx, cy, Math.max(b[1][0] - b[0][0], 40), text, s, collider, ctx.frame);
            if (p) textEl(lg, text, s, theme, { x: p.x, y: p.y, 'text-anchor': 'middle' });
          },
        });
      }
    }
  },

  rail(ctx) {
    const { g, feats, theme, path, denom } = ctx;
    const yard = (f) => f.properties.kind === 'yard';
    const main = feats.filter((f) => !yard(f));
    const yards = feats.filter(yard);
    const fine = denom < 60000;
    g.append('path').attr('d', yards.map(path).join('')).attr('fill', 'none').attr('stroke', theme.rail).attr('stroke-width', 0.4);
    const d = main.map(path).join('');
    g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', theme.rail).attr('stroke-width', fine ? 0.9 : 0.75);
    // Cross-ties: a wide stroke dashed down to short ticks.
    g.append('path')
      .attr('d', d)
      .attr('fill', 'none')
      .attr('stroke', theme.rail)
      .attr('stroke-width', fine ? 4 : 3.2)
      .attr('stroke-dasharray', fine ? '0.55 4.5' : '0.5 4');
    if (ctx.labelsOn) lineLabelJob(ctx, main, () => 'rail', 50, { repeat: 4 * IN, dy: -4.5 });
  },

  street(ctx) {
    const { g, feats, theme, path, denom, style, cfg } = ctx;
    const cls = (f) => {
      const k = f.properties.kind || 'street';
      if (k === 'trunk' || k === 'primary' || k === 'boulevard') return 'major';
      if (k === 'secondary' || k === 'tertiary' || k === 'avenue' || k === 'road' || k === 'main') return 'medium';
      if (k === 'alley') return 'alley';
      return 'minor';
    };
    const mode = cfg.streetMode || style.streetMode || 'auto';
    const double = mode === 'double' || (mode === 'auto' && denom <= 30000);
    const groups = { major: [], medium: [], minor: [], alley: [] };
    feats.forEach((f) => groups[cls(f)].push(f));
    const order = ['alley', 'minor', 'medium', 'major'];
    const feet = { major: 80, medium: 60, minor: 45, alley: 18 };
    const width = (c) => Math.max(c === 'alley' ? 1.2 : 2.4, Math.min(9, (feet[c] * 0.3048 * PX_PER_M) / denom));
    if (double) {
      // All casings first, then all fills, so crossings open into each other.
      for (const c of order) {
        const d = groups[c].map(path).join('');
        if (d) g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', theme.street).attr('stroke-width', width(c) + 0.9).attr('stroke-linecap', 'butt');
      }
      for (const c of order) {
        const d = groups[c].map(path).join('');
        if (d) g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', theme.streetFill).attr('stroke-width', width(c)).attr('stroke-linecap', 'square');
      }
    } else {
      const w = { major: 1.0, medium: 0.7, minor: 0.45, alley: 0.3 };
      for (const c of order) {
        const d = groups[c].map(path).join('');
        if (d) g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', theme.street).attr('stroke-width', w[c]).attr('stroke-linejoin', 'round');
      }
    }
    if (ctx.labelsOn) {
      const rankOf = { major: 0, medium: 1, minor: 2, alley: 3 };
      lineLabelJob(ctx, feats, (f) => `street`, 70, {
        repeat: 3.2 * IN,
        central: double,
        dy: double ? 0 : -2,
        rank: (group) => rankOf[cls(group[0])] * 2 - Math.min(1.5, group.length / 8),
        styleFor: () => {
          if (!double) return { size: 4.2 };
          const w = width('minor');
          return { size: Math.max(3.6, Math.min(5.4, (w * 0.95) / PT)) };
        },
      });
    }
  },

  place(ctx) {
    const { g, feats, theme, projection, project, denom, layer, liveCounties } = ctx;
    const large = denom < 120000; // a city sheet: names only, as districts
    const pts = [];
    for (const f of feats) {
      const p = f.properties;
      if (large && p.kind === 'capital') continue;
      const xy = projection(f.geometry.coordinates);
      if (!xy || xy[0] < ctx.frame.x0 || xy[0] > ctx.frame.x1 || xy[1] < ctx.frame.y0 || xy[1] > ctx.frame.y1) continue;
      const pop = population(p, project.year);
      let seat = p.kind === 'county-seat' && (!liveCounties || liveCounties.has(String(p.seat_of).replace(/ County$/, '')));
      if (p.seat_until && project.year >= p.seat_until) seat = false;
      const role = pop >= 50000 ? 'city1' : pop >= 10000 ? 'city2' : pop >= 2500 || seat ? 'town' : 'village';
      pts.push({ f, xy, pop: pop || 0, seat, role, capital: p.kind === 'capital' && project.year >= 1868 });
    }
    pts.sort((a, b) => b.capital - a.capital || b.pop - a.pop || b.seat - a.seat);
    if (!large) {
      const sym = g.append('g');
      for (const p of pts) {
        const [x, y] = p.xy;
        const r = p.role === 'city1' ? 3.4 : p.role === 'city2' ? 2.8 : p.seat ? 2.2 : 1.3;
        p.r = r;
        if (p.capital) {
          sym.append('circle').attr('cx', x).attr('cy', y).attr('r', r + 1.2).attr('fill', theme.paper).attr('stroke', theme.ink).attr('stroke-width', 0.7);
          sym.append('path').attr('d', star(x, y, r + 0.4, (r + 0.4) * 0.42)).attr('fill', theme.ink);
        } else if (p.role === 'city1' || p.role === 'city2') {
          sym.append('circle').attr('cx', x).attr('cy', y).attr('r', r).attr('fill', theme.paper).attr('stroke', theme.ink).attr('stroke-width', 0.8);
          sym.append('circle').attr('cx', x).attr('cy', y).attr('r', r * 0.45).attr('fill', theme.ink);
        } else if (p.seat) {
          sym.append('circle').attr('cx', x).attr('cy', y).attr('r', r).attr('fill', theme.paper).attr('stroke', theme.ink).attr('stroke-width', 0.7);
          sym.append('circle').attr('cx', x).attr('cy', y).attr('r', 0.75).attr('fill', theme.ink);
        } else {
          sym.append('circle').attr('cx', x).attr('cy', y).attr('r', r).attr('fill', theme.ink);
        }
      }
    }
    if (!ctx.labelsOn) return;
    // The capital and the cities are lettered first, then the rivers, then the towns.
    const major = (p) => p.capital || p.role === 'city1' || p.role === 'city2';
    const job = (priority, set, symbols) => ({
      priority,
      place(lg, collider) {
        // Symbols are obstacles for every label.
        if (symbols && !large) for (const p of pts) collider.add([p.xy[0] - p.r, p.xy[1] - p.r, p.xy[0] + p.r, p.xy[1] + p.r]);
        for (const p of set) {
          const name = featureName(p.f, layer, project);
          if (!name) continue;
          const s = large ? LABEL.district : LABEL[p.role];
          const text = styledText(name, s);
          if (large) {
            const q = placeArea(p.xy[0], p.xy[1], Infinity, text, s, collider, ctx.frame);
            if (q) textEl(lg, text, s, theme, { x: q.x, y: q.y, 'text-anchor': 'middle' });
            continue;
          }
          const q = placePoint(p.xy[0], p.xy[1], p.r, text, s, collider, ctx.frame);
          if (q) {
            const t = textEl(lg, text, s, theme, { x: q.x.toFixed(2), y: q.y.toFixed(2) });
            haloize(t, theme, ctx.style.halo);
          }
        }
      },
    });
    ctx.labelJobs.push(job(6, pts.filter(major), true), job(10, pts.filter((p) => !major(p)), false));
  },

  // Named districts: a letter-spaced label at the district's centre, no symbol and no outline, because the
  // sources give a centre and not a boundary.
  district(ctx) {
    const { feats, theme, projection, layer, project } = ctx;
    if (!ctx.labelsOn) return;
    const pts = [];
    for (const f of feats) {
      const xy = projection(f.geometry.coordinates);
      if (xy && xy[0] >= ctx.frame.x0 && xy[0] <= ctx.frame.x1 && xy[1] >= ctx.frame.y0 && xy[1] <= ctx.frame.y1) pts.push({ f, xy });
    }
    ctx.labelJobs.push({
      priority: 7,
      place(lg, collider) {
        for (const { f, xy } of pts) {
          const name = featureName(f, layer, project);
          if (!name) continue;
          const s = { ...LABEL.district, size: ctx.denom > 60000 ? 7 : 9, spacing: 0.32 };
          const text = styledText(name, s);
          // At the centre if there is room; else a line above or below it.
          const step = s.size * PT * 1.15;
          let q = null;
          for (const dy of [0, step, -step]) {
            q = placeArea(xy[0], xy[1] + dy, Infinity, text, s, collider, ctx.frame);
            if (q) break;
          }
          if (q) haloize(textEl(lg, text, s, theme, { x: q.x, y: q.y, 'text-anchor': 'middle', 'font-style': 'italic' }), theme, true);
        }
      },
    });
  },

  // Story sites from the canon: a square for a point, an open ring for a place located only by its area, and a
  // dashed ring as wide as the doubt for a vicinity (a place known only roughly, or invented).
  site(ctx) {
    const { g, feats, theme, projection, project, layer } = ctx;
    const pts = [];
    for (const f of feats) {
      const xy = projection(f.geometry.coordinates);
      if (!xy || xy[0] < ctx.frame.x0 || xy[0] > ctx.frame.x1 || xy[1] < ctx.frame.y0 || xy[1] > ctx.frame.y1) continue;
      const vicinity = f.properties.precision === 'vicinity';
      let wide = 0;
      if (vicinity) {
        const [lon, lat] = f.geometry.coordinates;
        const e = projection([lon + f.properties.radius_m / (111320 * Math.cos((lat * Math.PI) / 180)), lat]);
        wide = e ? Math.max(Math.hypot(e[0] - xy[0], e[1] - xy[1]), 3) : 3;
      }
      pts.push({ f, xy, wide, r: vicinity ? Math.min(wide, 9) : f.properties.precision === 'point' ? 2.6 : 3.4 });
    }
    for (const { f, xy: [x, y], r, wide } of pts) {
      if (f.properties.precision === 'vicinity') {
        g.append('circle').attr('cx', x).attr('cy', y).attr('r', wide).attr('fill', theme.annotation).attr('fill-opacity', 0.07).attr('stroke', theme.annotation).attr('stroke-width', 0.7).attr('stroke-dasharray', '2.4 1.6');
        g.append('circle').attr('cx', x).attr('cy', y).attr('r', 0.9).attr('fill', theme.annotation);
      } else if (f.properties.precision === 'point') g.append('rect').attr('x', x - r).attr('y', y - r).attr('width', 2 * r).attr('height', 2 * r).attr('fill', theme.annotation).attr('stroke', theme.paper).attr('stroke-width', 0.5);
      else g.append('circle').attr('cx', x).attr('cy', y).attr('r', r).attr('fill', 'none').attr('stroke', theme.annotation).attr('stroke-width', 1).attr('stroke-dasharray', f.properties.precision === 'town' ? '1.2 1.2' : null);
    }
    if (!ctx.labelsOn) return;
    ctx.labelJobs.push({
      priority: 8,
      place(lg, collider) {
        for (const p of pts) collider.add([p.xy[0] - p.r, p.xy[1] - p.r, p.xy[0] + p.r, p.xy[1] + p.r]);
        for (const p of pts) {
          const base = featureName(p.f, layer, project);
          if (!base) continue;
          const name = p.f.properties.fictional ? `${base} (invented)` : base;
          const s = LABEL.site;
          const text = styledText(name, s);
          const q = placePoint(p.xy[0], p.xy[1], p.r, text, s, collider, ctx.frame);
          if (q) haloize(textEl(lg, text, s, theme, { x: q.x.toFixed(2), y: q.y.toFixed(2) }), theme, true);
        }
      },
    });
  },

  // Contours: fine lines with a heavier index line, lettered in feet where the index lines run long enough.
  contour(ctx) {
    const { g, feats, theme, path, denom } = ctx;
    const index = feats.filter((f) => f.properties.kind === 'index');
    const minor = feats.filter((f) => f.properties.kind !== 'index');
    const fine = denom < 60000;
    g.append('path').attr('d', minor.map(path).join('')).attr('fill', 'none').attr('stroke', theme.contour).attr('stroke-width', fine ? 0.45 : denom > 600000 ? 0.5 : 0.35).attr('stroke-linejoin', 'round');
    g.append('path').attr('d', index.map(path).join('')).attr('fill', 'none').attr('stroke', theme.contour).attr('stroke-width', fine ? 0.9 : denom > 600000 ? 0.9 : 0.65).attr('stroke-linejoin', 'round');
    if (ctx.labelsOn) lineLabelJob(ctx, index, () => 'contour', 62, { repeat: 3.5 * IN, dy: 1.6, halo: true, straightness: 0.6, maxTurn: 0.7, step: 0.8, smooth: 3 });
  },

  // City blocks traced from a period map: the streets are the paper between them.
  blocks(ctx) {
    const { g, feats, theme, path, style } = ctx;
    const wash = style.blockWash && theme.tints;
    g.append('g')
      .style('mix-blend-mode', 'multiply')
      .selectAll('path')
      .data(feats)
      .join('path')
      .attr('d', path)
      .attr('fill', (f, i) => (wash ? theme.tints[(Number(f.properties.id) || i) % theme.tints.length] : theme.inkSoft))
      .attr('fill-opacity', wash ? 0.6 : 0.1)
      .attr('stroke', theme.ink)
      .attr('stroke-width', 0.55);
  },

  // Horsecar and streetcar lines: a fine dashed line down the street.
  tram(ctx) {
    const { g, feats, theme, path } = ctx;
    g.append('path')
      .attr('d', feats.map(path).join(''))
      .attr('fill', 'none')
      .attr('stroke', theme.rail)
      .attr('stroke-width', 0.8)
      .attr('stroke-dasharray', '3 1.4')
      .attr('stroke-linecap', 'butt');
    if (ctx.labelsOn) lineLabelJob(ctx, feats, () => 'rail', 55, { repeat: 4 * IN, dy: -3 });
  },

  wards(ctx) {
    const { g, feats, theme, path, layer, project } = ctx;
    const e = edges(feats, `${layer.id}:${feats.map((f) => f._key).join(',')}`);
    g.append('path').attr('d', path(e.shared)).attr('fill', 'none').attr('stroke', theme.inkSoft).attr('stroke-width', 1).attr('stroke-dasharray', '6 2.5');
    g.append('path').attr('d', path(e.outer)).attr('fill', 'none').attr('stroke', theme.inkSoft).attr('stroke-width', 1).attr('stroke-dasharray', '6 2.5');
    if (!ctx.labelsOn) return;
    for (const f of feats) {
      ctx.labelJobs.push({
        priority: 45,
        place(lg, collider) {
          const [cx, cy] = path.centroid(f);
          if (!Number.isFinite(cx)) return;
          const s = { ...LABEL.district, size: 8, color: 'inkSoft' };
          const text = styledText(featureName(f, layer, project), s);
          const p = placeArea(cx, cy, Infinity, text, s, collider, ctx.frame);
          if (p) textEl(lg, text, s, theme, { x: p.x, y: p.y, 'text-anchor': 'middle', opacity: 0.85 });
        },
      });
    }
  },

  outline(ctx) {
    const { g, feats, theme, path } = ctx;
    g.selectAll('path').data(feats).join('path').attr('d', path).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', 0.6);
  },
};

// Finds room for a name wholly inside the visible part of a polygon: a grid of trial points over its
// clipped extent, level then turned on end, at full size and then smaller. Returns
// {x, y, size, rotate} with (x, y) the text's baseline middle, or null.
function placeInside(f, text, s, collider, ctx) {
  const { path, projection, frame } = ctx;
  const b = path.bounds(f);
  const x0 = Math.max(b[0][0], frame.x0);
  const x1 = Math.min(b[1][0], frame.x1);
  const y0 = Math.max(b[0][1], frame.y0);
  const y1 = Math.min(b[1][1], frame.y1);
  if (!(x1 > x0 && y1 > y0)) return null;
  const inside = (x, y) => {
    const ll = projection.invert([x, y]);
    return ll && d3.geoContains(f, ll);
  };
  const [cx, cy] = path.centroid(f);
  const trials = [];
  if (Number.isFinite(cx)) trials.push([cx, cy]);
  for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) trials.push([x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * j) / 8]);
  trials.sort((a, c) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(c[0] - cx, c[1] - cy) || 0);
  const tall = y1 - y0 > (x1 - x0) * 1.6;
  for (const scale of [1, 0.75, 0.55]) {
    const sz = { ...s, size: s.size * scale };
    const { w, h } = measure(text, sz);
    for (const rotate of tall ? [-90, 0] : [0]) {
      for (const [x, y] of trials) {
        const hw = (rotate ? h : w) / 2 + 3;
        const hh = (rotate ? w : h) / 2 + 3;
        const box = [x - hw, y - hh, x + hw, y + hh];
        if (box[0] < frame.x0 || box[2] > frame.x1 || box[1] < frame.y0 || box[3] > frame.y1) continue;
        const pts = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]], [x, y]];
        if (!pts.every(([px, py]) => inside(px, py))) continue;
        if (collider.hits(box)) continue;
        collider.add(box);
        // Baseline offset so the letters, not the baseline, sit on the trial point.
        return { x: rotate ? x + h * 0.32 : x, y: rotate ? y : y + h * 0.32, size: sz.size, rotate, box };
      }
    }
  }
  return null;
}

export function star(x, y, R, r, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(x + rad * Math.cos(a)).toFixed(2)},${(y + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export { mapDate, measure, fontString, textEl };
