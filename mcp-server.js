#!/usr/bin/env node
// Cartographer as an MCP server (stdio), so agents can make maps: look up layers and features,
// find where period streets met, write a map as JSON, render it to PNG/JPEG/SVG, and see a preview.
//
//   node cartographer/mcp-server.js       (registered for Claude Code in the repo's .mcp.json)
//
// Rendering uses the editor's own drawing code in headless Chromium (lib/headless.js), started on the
// first render. Stdout carries the protocol; anything else goes to stderr.

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as topojson from 'topojson-client';
import { chapters } from './server.js';
import { alive, layerSnapshot, featureName, population } from './app/data.js';
import { THEMES, COLOR_KEYS } from './app/themes.js';
import { PAPERS, VIEWS, POSITIONS, ANN_STYLES, SYMBOLS, SHAPE_STYLES, defaultProject, mergeDeep } from './app/project.js';
import { Renderer } from './lib/headless.js';
import { km, intersections } from './lib/geo.js';
import { georeference } from './app/georef.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = join(HERE, 'data');
const PROJECTS = join(HERE, 'projects');
const EXPORTS = join(HERE, 'exports');
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const FORBIDDEN = ['context', join('design', 'vendor'), 'node_modules', join('cartographer', 'node_modules'), '.git'];

const renderer = new Renderer();

// ── Data, read from disk ─────────────────────────────────────────────────────

const files = new Map();
async function catalog() {
  return JSON.parse(await readFile(join(DATA, 'catalog.json'), 'utf8'));
}

// Mirrors app/data.js's loader, so feature keys match the ones the editor uses for hide and rename.
async function features(file) {
  if (!files.has(file)) {
    files.set(
      file,
      readFile(join(DATA, file), 'utf8').then((text) => {
        let fc = JSON.parse(text);
        if (fc.type === 'Topology') {
          const feature = topojson.feature || topojson.default?.feature;
          fc = feature(fc, fc.objects[Object.keys(fc.objects)[0]]);
        }
        fc.features = fc.features.filter((f) => f.geometry);
        fc.features.forEach((f, i) => {
          f.properties ||= {};
          f._key = String(f.id ?? f.properties.id ?? f.properties.osm_id ?? i);
          f._bbox = bboxOf(f.geometry);
        });
        return fc.features;
      }),
    );
  }
  return files.get(file);
}

function bboxOf(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      b[0] = Math.min(b[0], c[0]);
      b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]);
      b[3] = Math.max(b[3], c[1]);
    } else c.forEach(walk);
  };
  if (g.type === 'GeometryCollection') g.geometries.forEach((x) => walk(x.coordinates));
  else walk(g.coordinates);
  return b.map((v) => Math.round(v * 1e5) / 1e5);
}

// A point on the feature to stand for it: the point itself, the middle of a line's longest part, or the
// middle of a polygon's box.
function anchor(f) {
  const g = f.geometry;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString' || g.type === 'MultiLineString') {
    const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    const longest = parts.reduce((a, p) => (p.length > a.length ? p : a), parts[0]);
    return longest[Math.floor(longest.length / 2)];
  }
  const b = f._bbox;
  return [Math.round(((b[0] + b[2]) / 2) * 1e5) / 1e5, Math.round(((b[1] + b[3]) / 2) * 1e5) / 1e5];
}

// The files a layer offers: the snapshot for the year, or every snapshot when no year is given.
function layerFiles(layer, year) {
  if (!layer.snapshots) return layer.file ? [layer.file] : [];
  if (year == null) return layer.snapshots.map((s) => s.file);
  const s = layerSnapshot(layer, year);
  return s ? [s.file] : [];
}

function matcher(name) {
  if (!name) return () => true;
  const m = name.match(/^\/(.+)\/([a-z]*)$/);
  const re = m ? new RegExp(m[1], m[2].includes('i') ? m[2] : `${m[2]}i`) : null;
  const lower = name.toLowerCase();
  return (s) => (re ? re.test(s || '') : (s || '').toLowerCase().includes(lower));
}

// ── Output paths ─────────────────────────────────────────────────────────────

// Resolves an output path inside the repository, refusing the places the book says never to write.
function outputPath(out, fallback) {
  const path = resolve(ROOT, out || fallback);
  const rel = relative(ROOT, path);
  if (rel.startsWith('..') || resolve(ROOT, rel) !== path) throw new Error(`Output must be inside the repository (${ROOT}).`);
  if (FORBIDDEN.some((f) => rel === f || rel.startsWith(f + sep))) throw new Error(`Refusing to write under ${rel.split(sep)[0]}/ (read-only by the book's rules).`);
  return path;
}

const json = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

async function readProject(name) {
  if (!NAME.test(name)) throw new Error(`Bad project name "${name}": lower-case letters, digits and hyphens.`);
  const file = join(PROJECTS, `${name}.json`);
  if (!existsSync(file)) throw new Error(`No saved project "${name}". list_projects shows what there is.`);
  return JSON.parse(await readFile(file, 'utf8'));
}

// ── Server and tools ─────────────────────────────────────────────────────────

const server = new McpServer(
  { name: 'cartographer', version: '0.1.0' },
  {
    instructions: [
      'Cartographer draws period maps of Georgia and Atlanta (1870–1945) for the Old Gods of Atlanta book: dated layers rendered as an old printed map.',
      'Typical flow: project_format (once) → list_layers / list_chapters → find_features or street_intersection to place notes accurately → render_map with a spec (preview comes back as an image) → adjust → save_project.',
      'Every feature has the years it existed; the map draws only what existed on its date. Never invent a site: place markers only where a source (canon/places.yml, the chapter) puts them, and say in the map or chapter when a location is approximate.',
      'Book images go in chapters/<id>/art/ and are listed under ### Images in the chapter sources. Several data licences are unconfirmed (see cartographer/README.md) before print.',
    ].join('\n'),
  },
);

server.registerTool(
  'project_format',
  {
    title: 'Project format',
    description: 'How a map is described: the project JSON with its defaults, and every allowed value (themes, colours, paper sizes, view presets, furniture positions, note lettering, symbols, shape styles). Read this before writing a spec.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () =>
    json({
      notes: [
        'A spec may be partial: anything left out takes the default below.',
        'year/month/day set the map date (county lines and city limits change on the day).',
        "view: {center: [lon, lat], denominator: N} (scale 1:N), or {preset: 'georgia'|'region'|'city'|'downtown'}, or {bounds: [west, south, east, north]} to fit; projection 'local' (transverse Mercator, city) or 'conic' (Lambert, state).",
        "paper: a preset fills width/height/margin (inches); dpi is the default export resolution.",
        "layers: {<layer id>: {visible, labels, undated, anyScale, anyYear, tint}} switches layers per map (list_layers gives ids and defaults).",
        "annotations: [{type: 'label'|'marker', lonlat: [lon, lat], text, style, size?, rotate?, symbol? (marker), color?, halo?} | {type: 'shape', points: [[lon, lat], ...], closed, shapeStyle, color?, dash?}]. Text may contain \\n.",
        "backdrops: [{id, opacity?, guide?}] lays a georeferenced period map (list_backdrops) under the drawing; guide: true shows it on the preview but leaves it out of the exported file (for tracing). chapter: a chapter id (list_chapters); the 'canon-sites' layer then shows the story sites that appear in that chapter.",
        "hidden: ['<layer>:<key>'] hides features on this map; rename: {'<layer>:<key>': 'Wheat St'} changes a printed name. find_features returns keys.",
        "dateline is the date printed in the cartouche; it defaults to the year.",
      ],
      defaults: defaultProject(),
      themes: Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.name])),
      colorKeys: Object.fromEntries(COLOR_KEYS),
      papers: Object.fromEntries(Object.entries(PAPERS).map(([k, p]) => [k, p.label])),
      viewPresets: Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.bounds ? { label: v.label, bounds: v.bounds } : { label: v.label, center: v.center, denominator: v.denominator }])),
      furniturePositions: POSITIONS,
      border: ['double', 'single', 'none'],
      graticule: ['none', 'ticks', 'lines'],
      streetMode: ['auto', 'double', 'single'],
      effects: { age: '0–1', grain: '0–1', foxing: '0–1', inkBleed: '0–1', folds: '0–1' },
      noteStyles: Object.fromEntries(Object.entries(ANN_STYLES).map(([k, s]) => [k, `${s.font}${s.italic ? ' italic' : ''}, ${s.size}pt${s.upper ? ', capitals' : ''}`])),
      symbols: SYMBOLS,
      shapeStyles: SHAPE_STYLES,
    }),
);

server.registerTool(
  'list_layers',
  {
    title: 'List layers',
    description: 'The data layers a map can draw: id, title, how it draws, the scales it draws at by default, how features are dated, feature counts and year ranges, attribution, and the source note to read for its known problems.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const cat = await catalog();
    const out = [];
    for (const l of cat.layers) {
      const info = {
        id: l.id,
        title: l.title,
        group: l.group,
        render: l.render,
        visibleByDefault: !!l.visible,
        scaleRange: l.scaleRange || [0, null],
        undated: l.undated || 'show',
        layerYears: l.start != null || l.end != null ? [l.start ?? null, l.end ?? null] : undefined,
        snapshots: l.snapshots,
        attribution: l.attribution,
        sourceNote: `cartographer/data/sources/${l.source || `${l.id}.md`}`,
        files: [],
      };
      for (const file of layerFiles(l)) {
        if (!existsSync(join(DATA, file))) {
          info.files.push({ file, missing: true });
          continue;
        }
        const fs = await features(file);
        const starts = fs.map((f) => f.properties.start).filter(Number.isInteger);
        const quality = {};
        for (const f of fs) quality[f.properties.date_quality || 'none'] = (quality[f.properties.date_quality || 'none'] || 0) + 1;
        info.files.push({ file, features: fs.length, startYears: starts.length ? [Math.min(...starts), Math.max(...starts)] : null, dateQuality: quality });
      }
      out.push(info);
    }
    return json(out);
  },
);

server.registerTool(
  'list_chapters',
  {
    title: 'List chapters',
    description: "The book's adventures with their era (year) and dates, from book.yml and each chapter's _chapter.yml, for setting a map's date.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => json(await chapters()),
);

server.registerTool(
  'list_projects',
  {
    title: 'List saved maps',
    description: 'Saved maps in cartographer/projects/: name, title, year, chapter.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    await mkdir(PROJECTS, { recursive: true });
    const names = (await readdir(PROJECTS)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    const out = [];
    for (const n of names.sort()) {
      const p = JSON.parse(await readFile(join(PROJECTS, `${n}.json`), 'utf8'));
      out.push({ name: n, title: p.title, year: p.year, chapter: p.chapter || null });
    }
    return json(out);
  },
);

server.registerTool(
  'get_project',
  {
    title: 'Get a saved map',
    description: 'The JSON of a saved map, to read or to use as the base of a new spec.',
    inputSchema: { name: z.string().describe('Project name (file name in cartographer/projects/ without .json)') },
    annotations: { readOnlyHint: true },
  },
  async ({ name }) => {
    try {
      return json(await readProject(name));
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.registerTool(
  'save_project',
  {
    title: 'Save a map',
    description: 'Writes a map spec to cartographer/projects/<name>.json, where the editor (npm start) and render_map can open it. Refuses to replace an existing map unless overwrite is true.',
    inputSchema: {
      name: z.string().describe('Lower-case letters, digits and hyphens, e.g. "lot-stake-1877"'),
      project: z.record(z.string(), z.any()).describe('The map spec (see project_format). Partial is fine; defaults fill the rest when it is drawn.'),
      overwrite: z.boolean().optional().describe('Replace an existing map of the same name'),
    },
  },
  async ({ name, project, overwrite }) => {
    if (!NAME.test(name)) return fail(`Bad name "${name}": lower-case letters, digits and hyphens.`);
    const file = join(PROJECTS, `${name}.json`);
    if (existsSync(file) && !overwrite) return fail(`projects/${name}.json exists. Read it with get_project, then pass overwrite: true to replace it.`);
    await mkdir(PROJECTS, { recursive: true });
    await writeFile(file, `${JSON.stringify({ ...project, name }, null, 2)}\n`);
    return json({ saved: `cartographer/projects/${name}.json` });
  },
);

server.registerTool(
  'find_features',
  {
    title: 'Find features',
    description:
      'Searches the layers for features by name, kind, place and year, and returns each with its key (for hidden/rename), dates and their source, a representative [lon, lat] and its bounding box. Use it to check what existed in a year, or to get coordinates for a note.',
    inputSchema: {
      layer: z.string().optional().describe('Layer id (list_layers); all layers if omitted'),
      name: z.string().optional().describe('Case-insensitive substring of the name, or /regex/'),
      kind: z.string().optional().describe('Exact kind, e.g. "county-seat", "river", "reservoir"'),
      year: z.number().int().optional().describe('Only features that existed in this year (and, for survey layers, the survey nearest it)'),
      chapter: z.string().optional().describe('A chapter id: for the canon-sites layer, only the sites that appear in that chapter'),
      include_undated: z.boolean().optional().describe('With year: also include features of unknown date'),
      bbox: z.array(z.number()).length(4).optional().describe('[west, south, east, north]'),
      near: z.array(z.number()).length(2).optional().describe('[lon, lat]: sort by distance from here'),
      radius_km: z.number().optional().describe('With near: only features whose representative point is within this distance'),
      limit: z.number().int().min(1).max(200).optional().describe('Default 25'),
    },
    annotations: { readOnlyHint: true },
  },
  async (q) => {
    const cat = await catalog();
    const layers = q.layer ? cat.layers.filter((l) => l.id === q.layer) : cat.layers;
    if (!layers.length) return fail(`No layer "${q.layer}". list_layers gives the ids.`);
    const nameOk = matcher(q.name);
    const project = { year: q.year, month: 7, day: 1, chapter: q.chapter };
    const hits = [];
    for (const layer of layers) {
      for (const file of layerFiles(layer, q.year)) {
        if (!existsSync(join(DATA, file))) continue;
        for (const f of await features(file)) {
          const p = f.properties;
          if (!nameOk(p.name)) continue;
          if (q.kind && p.kind !== q.kind) continue;
          if (q.year != null && !alive(f, layer, project, { undated: q.include_undated })) continue;
          if (q.chapter && layer.render === 'site' && !f.properties.chapters?.includes(q.chapter)) continue;
          const b = f._bbox;
          if (q.bbox && (b[2] < q.bbox[0] || b[0] > q.bbox[2] || b[3] < q.bbox[1] || b[1] > q.bbox[3])) continue;
          const pt = anchor(f);
          const dist = q.near ? km(q.near, pt) : undefined;
          if (q.radius_km != null && dist != null && dist > q.radius_km) continue;
          hits.push({
            key: `${layer.id}:${f._key}`,
            layer: layer.id,
            file,
            name: p.name ?? null,
            kind: p.kind ?? null,
            start: p.start ?? null,
            end: p.end ?? null,
            ...(p.start_date ? { start_date: p.start_date } : {}),
            ...(p.end_date ? { end_date: p.end_date } : {}),
            date_quality: p.date_quality ?? null,
            date_source: p.date_source ?? null,
            ...(p.seat_of ? { seat_of: p.seat_of } : {}),
            ...(p.former_names_1903 ? { former_names_1903: p.former_names_1903, ...(p.former_names_ambiguous ? { former_names_ambiguous: true } : {}) } : {}),
            ...(p.names ? { period_names: p.names } : {}),
            ...(p.pop && q.year ? { population: population(p, q.year) } : {}),
            point: pt,
            bbox: b,
            ...(dist != null ? { distance_km: Math.round(dist * 1000) / 1000 } : {}),
          });
        }
      }
    }
    if (q.near) hits.sort((a, b) => a.distance_km - b.distance_km);
    const limit = q.limit || 25;
    return json({ matched: hits.length, shown: Math.min(limit, hits.length), features: hits.slice(0, limit) });
  },
);

// Where two named streets meet, from the street layers: segment crossings first, else the closest
// approach between them.
server.registerTool(
  'street_intersection',
  {
    title: 'Street intersection',
    description:
      'Finds where two Atlanta streets meet ("Mitchell" and "Haynes"), for placing a note at a corner. Searches the street survey nearest the year (1878, 1911 or 1928) and OpenStreetMap streets. Names in these layers are 1928 or modern names: a street renamed since the period must be looked up by its later name.',
    inputSchema: {
      a: z.string().describe('First street, e.g. "Mitchell" (matched at the start of the name, case-insensitive)'),
      b: z.string().describe('Second street'),
      year: z.number().int().optional().describe('Map year; picks the 1878 or 1928 survey (default 1928)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ a, b, year }) => {
    const cat = await catalog();
    const sources = [];
    const streets = cat.layers.find((l) => l.id === 'atlanta-streets');
    if (streets) for (const f of layerFiles(streets, year ?? 1928)) sources.push(['atlanta-streets', f]);
    if (cat.layers.some((l) => l.id === 'atlanta-streets-osm')) sources.push(['atlanta-streets-osm', 'atlanta-streets-osm.geojson']);
    const starts = (s) => {
      const re = new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return (n) => re.test(n || '');
    };
    const results = [];
    for (const [layer, file] of sources) {
      if (!existsSync(join(DATA, file))) continue;
      const fs = await features(file);
      const parts = (pred) =>
        fs
          .filter((f) => pred(f.properties.name))
          .flatMap((f) => (f.geometry.type === 'LineString' ? [{ name: f.properties.name, line: f.geometry.coordinates }] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.map((line) => ({ name: f.properties.name, line })) : []));
      const A = parts(starts(a));
      const B = parts(starts(b));
      if (!A.length || !B.length) {
        results.push({ layer, file, found: false, matchedA: A.length, matchedB: B.length });
        continue;
      }
      const cands = intersections(A, B);
      const distinct = cands;
      results.push({ layer, file, found: distinct.length > 0, intersections: distinct.slice(0, 3) });
    }
    return json({ a, b, year: year ?? null, results, caution: "Names are the 1928 layer's (or present-day, for OpenStreetMap); the layers carry period names only for the few renamings in data/street-renames.json (Wheat Street to 1893, North Collins Street to 1886, and a few more). Check a city directory or canon/places.yml before labelling a corner with a name." });
  },
);

async function backdropDefs() {
  return JSON.parse(await readFile(join(DATA, 'backdrops.json'), 'utf8')).backdrops || [];
}

server.registerTool(
  'list_backdrops',
  {
    title: 'List backdrops',
    description:
      'The georeferenced period maps (Sanborn sheets and the like) that render_map can lay under a map or use as a guide for tracing: id, title, year, source and rights, image size, ground scale, how accurate the georeferencing is (RMS metres), and the longitude/latitude of the image corners.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const out = (await backdropDefs()).map((b) => {
      const g = georeference(b.points, b.fit);
      return {
        id: b.id,
        title: b.title,
        year: b.year,
        credit: b.credit,
        image: b.src.startsWith('backdrops/') ? `cartographer/${b.src}` : `chapters/${b.src}`,
        size: b.size || null,
        metresPerPixel: g.metresPerPixel,
        rmsMetres: g.rmsM,
        controlPoints: b.points.length,
        ...(b.size ? { corners: { topLeft: g.pixelToLonLat([0, 0]), topRight: g.pixelToLonLat([b.size[0], 0]), bottomLeft: g.pixelToLonLat([0, b.size[1]]), bottomRight: g.pixelToLonLat(b.size) } } : {}),
        note: b.georeferenced,
      };
    });
    return json(out);
  },
);

server.registerTool(
  'pixel_to_lonlat',
  {
    title: 'Convert between a backdrop and the map',
    description:
      'For tracing: converts positions on a backdrop image (pixels, origin top left, in the image\'s own resolution, e.g. a street corner you can read off the sheet) to [lon, lat], or the reverse. Look at the image first (list_backdrops gives its file) and give pixels from that file. Accuracy is the backdrop\'s rmsMetres plus how carefully the pixel was read; say so when a located site came from this.',
    inputSchema: {
      backdrop: z.string().describe('Backdrop id (list_backdrops)'),
      pixels: z.array(z.array(z.number()).length(2)).max(200).optional().describe('[[x, y], …] in image pixels → lon/lat'),
      lonlats: z.array(z.array(z.number()).length(2)).max(200).optional().describe('[[lon, lat], …] → image pixels'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ backdrop, pixels, lonlats }) => {
    const def = (await backdropDefs()).find((b) => b.id === backdrop);
    if (!def) return fail(`No backdrop "${backdrop}". list_backdrops gives the ids.`);
    if (!pixels && !lonlats) return fail('Give pixels or lonlats.');
    const g = georeference(def.points, def.fit);
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    return json({
      backdrop,
      rmsMetres: g.rmsM,
      ...(pixels ? { lonlats: pixels.map((p) => g.pixelToLonLat(p).map(r5)) } : {}),
      ...(lonlats ? { pixels: lonlats.map((p) => g.lonLatToPixel(p).map((v) => Math.round(v))) } : {}),
    });
  },
);

server.registerTool(
  'render_map',
  {
    title: 'Render a map',
    description:
      'Draws a map and writes it to a file (PNG, JPEG or SVG), returning a preview image, the features drawn per layer, and the resolved view. Give a saved project name, a spec (see project_format), or both (the spec is merged over the saved map). Renders take a few seconds at 300 dpi; the first also starts a headless browser.',
    inputSchema: {
      project: z.string().optional().describe('Saved map name to start from'),
      spec: z.record(z.string(), z.any()).optional().describe('Map spec, whole or partial; merged over the saved map if both are given'),
      year: z.number().int().optional().describe('Shortcut: draw in this year (the printed date line follows if it was the year)'),
      format: z.enum(['png', 'jpg', 'svg']).optional().describe('Default png'),
      dpi: z.number().int().min(50).max(1200).optional().describe('Raster resolution; default the map\'s paper dpi (300)'),
      out: z.string().optional().describe('Output path relative to the repository root, e.g. "chapters/1877-lot-stake/art/map.png". Default cartographer/exports/<name>.<format>'),
      overwrite: z.boolean().optional().describe('Replace an existing file outside cartographer/exports/'),
      preview: z.boolean().optional().describe('Return a small preview image (default true)'),
    },
  },
  async (args) => {
    try {
      if (!args.project && !args.spec) return fail('Give a saved project name, a spec, or both.');
      let project = args.project ? await readProject(args.project) : {};
      if (args.spec) project = mergeDeep(project, args.spec);
      if (args.year != null) {
        if (project.dateline == null || project.dateline === String(project.year ?? 1906)) project.dateline = String(args.year);
        project.year = args.year;
      }
      const format = args.format || 'png';
      const name = project.name && NAME.test(project.name) ? project.name : args.project || 'map';
      const fallback = join('cartographer', 'exports', `${name}${name.endsWith(String(project.year ?? '')) ? '' : `-${project.year ?? 1906}`}.${format}`);
      const path = outputPath(args.out, fallback);
      if (extname(path).slice(1).replace('jpeg', 'jpg') !== format) return fail(`The output's extension doesn't match format "${format}".`);
      const inExports = path.startsWith(EXPORTS + sep);
      if (existsSync(path) && !inExports && !args.overwrite) return fail(`${relative(ROOT, path)} exists. Pass overwrite: true to replace it.`);

      const outputs = [{ type: format, dpi: args.dpi }];
      const wantPreview = args.preview !== false;
      if (wantPreview) outputs.push({ type: 'png', dpi: 72 });
      const r = await renderer.render(project, outputs);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, r.files[0]);
      const p = r.project;
      const size = (await stat(path)).size;
      const summary = {
        file: relative(ROOT, path),
        bytes: size,
        format,
        ...(format !== 'svg' ? { pixels: [Math.round(p.paper.width * (args.dpi || p.paper.dpi)), Math.round(p.paper.height * (args.dpi || p.paper.dpi))], dpi: args.dpi || p.paper.dpi } : {}),
        inches: [p.paper.width, p.paper.height],
        date: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
        view: p.view,
        featuresDrawn: r.stats,
        ...(r.backdrops?.length ? { backdrops: r.backdrops } : {}),
        missingLayers: r.missing,
        ...(r.warnings.length ? { warnings: r.warnings } : {}),
      };
      const content = [{ type: 'text', text: JSON.stringify(summary, null, 2) }];
      if (wantPreview) content.push({ type: 'image', data: r.files[1].toString('base64'), mimeType: 'image/png' });
      return { content };
    } catch (e) {
      return fail(`Render failed: ${e.message}`);
    }
  },
);

// ── Run ──────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
const shutdown = async () => {
  await renderer.close();
  process.exit(0);
};
transport.onclose = shutdown;
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await server.connect(transport);
console.error('Cartographer MCP server ready (stdio).');
