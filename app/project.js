// What a map is: the project format, its defaults, and the presets. No DOM here, so the editor, the
// headless renderer and the MCP server (mcp-server.js) all share it.

export const PAPERS = {
  page: { label: 'Full page, 8⅜ × 10⅞ in (trim)', width: 8.375, height: 10.875, margin: 0.45 },
  block: { label: 'Text block, 5.44 × 7.5 in', width: 5.444, height: 7.5, margin: 0.3 },
  half: { label: 'Half page, 5.44 × 4 in', width: 5.444, height: 4, margin: 0.25 },
  spread: { label: 'Two-page spread, 16¾ × 10⅞ in', width: 16.75, height: 10.875, margin: 0.5 },
  handout: { label: 'Handout, 8½ × 11 in', width: 8.5, height: 11, margin: 0.5 },
  custom: { label: 'Custom' },
};

export const VIEWS = {
  georgia: { label: 'Georgia', bounds: [-85.62, 30.35, -80.83, 35.01], projection: 'conic', style: { sea: true, countyTints: true } },
  region: { label: 'Atlanta region', bounds: [-84.62, 33.58, -84.12, 33.98], projection: 'local', style: { sea: false, countyTints: false } },
  city: { label: 'Atlanta', center: [-84.388, 33.756], denominator: 24000, projection: 'local', style: { sea: false, countyTints: false } },
  downtown: { label: 'Downtown', center: [-84.3893, 33.7535], denominator: 9600, projection: 'local', style: { sea: false, countyTints: false } },
};

export const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right', 'none'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Lettering for notes on the map. Sizes are points on the printed sheet; colours are theme ink keys.
export const ANN_STYLES = {
  place: { font: 'IM Fell Great Primer SC', size: 8, upper: true, spacing: 0.06, color: 'ink' },
  district: { font: 'IM Fell Great Primer SC', size: 12, upper: true, spacing: 0.35, color: 'inkSoft' },
  water: { font: 'IM Fell English', italic: true, size: 8, spacing: 0.05, color: 'waterInk' },
  street: { font: 'Spectral', weight: 600, size: 5, upper: true, spacing: 0.05, color: 'ink' },
  building: { font: 'Spectral', size: 5.5, upper: true, spacing: 0.08, color: 'ink' },
  note: { font: 'IM Fell English', italic: true, size: 7, color: 'annotation' },
  typewriter: { font: 'Special Elite', size: 7, color: 'annotation' },
};
export const SYMBOLS = ['none', 'dot', 'ring', 'star', 'cross', 'square', 'triangle'];
export const SHAPE_STYLES = ['outline', 'hatch', 'dashed', 'tint', 'line'];

export function defaultProject() {
  return {
    version: 1,
    name: 'untitled',
    title: 'Map of the City of Atlanta',
    subtitle: 'Fulton County, Georgia',
    dateline: '1906',
    year: 1906,
    month: 7,
    day: 1,
    chapter: null,
    paper: { preset: 'page', width: 8.375, height: 10.875, margin: 0.45, dpi: 300 },
    view: { center: [-84.388, 33.756], denominator: 24000, projection: 'local' },
    theme: 'survey',
    colors: {},
    effects: {},
    style: { sea: false, countyTints: false, halo: false, streetMode: 'auto' },
    furniture: {
      title: { show: true, pos: 'top-left', box: true, size: 20 },
      scalebar: { show: true, pos: 'bottom-left', units: 'auto', box: true },
      compass: { show: true, pos: 'top-right', size: 26 },
      legend: { show: false, pos: 'bottom-right' },
      border: 'double',
      graticule: 'ticks',
      credits: true,
    },
    layers: {},
    backdrops: [], // [{id, opacity?, guide?}] from data/backdrops.json
    annotations: [],
    hidden: [],
    rename: {},
  };
}

// Fills in anything a project file (or an agent's partial spec) leaves out.
export function normalise(p) {
  const d = defaultProject();
  const out = { ...d, ...p };
  for (const k of ['paper', 'view', 'style']) out[k] = { ...d[k], ...(p[k] || {}) };
  out.furniture = { ...d.furniture, ...(p.furniture || {}) };
  for (const k of ['title', 'scalebar', 'compass', 'legend']) out.furniture[k] = { ...d.furniture[k], ...(p.furniture?.[k] || {}) };
  // A named paper size supplies its dimensions unless they were given.
  const paper = PAPERS[p.paper?.preset];
  if (paper?.width) for (const k of ['width', 'height', 'margin']) if (p.paper[k] == null) out.paper[k] = paper[k];
  if (p.dateline === undefined) out.dateline = String(out.year);
  out.annotations = (out.annotations || []).map((a, i) => ({ id: a.id || `a${i + 1}`, ...a }));
  return out;
}

// Merges b into a: plain objects merge, everything else (arrays included) replaces.
export function mergeDeep(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeDeep(out[k], v) : v;
  return out;
}
