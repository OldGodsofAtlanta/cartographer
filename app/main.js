// The editor: controls on the left, the sheet on the right. Everything that defines a map lives in
// `project` (saved as projects/<name>.json); the sheet is redrawn from it after every change.

/* global d3 */

import { loadCatalog, layerSnapshot } from './data.js';
import { THEMES, COLOR_KEYS, resolveTheme } from './themes.js';
import { renderMap, fitView, frameOf, sheetSize, projectLines, layerOn } from './render.js';
import { PAPERS, VIEWS, POSITIONS, MONTHS, ANN_STYLES, SYMBOLS, SHAPE_STYLES, defaultProject, normalise } from './project.js';
import { svgString, rasterBlob, download, FACES } from './export.js';

// ── State ──────────────────────────────────────────────────────────────────

let catalog;
let chapters = [];
let project = defaultProject();
let last = null; // the last render's result
let tool = 'pan';
let selected = null; // annotation id
let drawing = null; // shape being drawn: {points: []}
let inspected = null; // {layer, feature}
let displayScale = 'fit';
const params = new URLSearchParams(location.search);
const headless = params.has('headless');

const $ = (sel) => document.querySelector(sel);
const svgEl = $('#sheet');
const svg = d3.select(svgEl);

function store() {
  try {
    localStorage.setItem('cartographer:last', JSON.stringify(project));
  } catch {
    /* private window: nothing to keep */
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

let rendering = false;
let dirty = false;
let lastError = null;
let timer = null;

function changed(delay = 60) {
  store();
  clearTimeout(timer);
  timer = setTimeout(redraw, delay);
}

async function redraw() {
  if (rendering) {
    dirty = true;
    return;
  }
  rendering = true;
  try {
    last = await renderMap(svgEl, project, catalog, { selected });
    lastError = null;
    decorate();
    fitDisplay();
    updateStatus();
    renderLayerList();
  } catch (err) {
    console.error(err);
    lastError = err;
    $('#status').textContent = `Couldn't draw the map: ${err.message}`;
  } finally {
    rendering = false;
  }
  if (dirty) {
    dirty = false;
    redraw();
  }
}

// Editor-only marks (selection box, shape in progress), drawn in a .ui group that export strips.
function decorate() {
  svg.selectAll('.ui').remove();
  const ui = svg.append('g').attr('class', 'ui');
  if (selected) {
    const node = svgEl.querySelector(`.ann[data-ann="${selected}"]`);
    if (node) {
      const b = node.getBBox();
      ui.append('rect').attr('class', 'sel').attr('x', b.x - 3).attr('y', b.y - 3).attr('width', b.width + 6).attr('height', b.height + 6);
    }
  }
  if (drawing?.points.length) {
    const pts = drawing.points.map((p) => last.projection(p));
    ui.append('path').attr('class', 'draft').attr('d', `M${pts.join('L')}`);
    ui.selectAll('circle.v').data(pts).join('circle').attr('class', 'v').attr('cx', (d) => d[0]).attr('cy', (d) => d[1]).attr('r', 2.5);
  }
  if (inspected) {
    const { feature } = inspected;
    const lines = feature.geometry.type === 'Point' ? [] : projectLines(last.projection, feature.geometry);
    const g = ui.append('g').attr('class', 'hilite');
    for (const l of lines) g.append('path').attr('d', `M${l.join('L')}`);
    if (feature.geometry.type === 'Point') {
      const xy = last.projection(feature.geometry.coordinates);
      if (xy) g.append('circle').attr('cx', xy[0]).attr('cy', xy[1]).attr('r', 6);
    }
  }
}

function fitDisplay() {
  const { W, H } = sheetSize(project);
  const stage = $('#stage');
  let k;
  if (displayScale === 'fit') k = Math.min((stage.clientWidth - 40) / W, (stage.clientHeight - 40) / H);
  else k = Number(displayScale);
  svgEl.style.width = `${Math.round(W * k)}px`;
  svgEl.style.height = `${Math.round(H * k)}px`;
  stage.classList.toggle('scroll', displayScale !== 'fit');
}

function fmtScale(d) {
  return `1:${Math.round(d).toLocaleString('en-US')}`;
}

function updateStatus() {
  const d = project.view.denominator;
  const inch = d < 60000 ? `1 inch = ${Math.round(d / 12).toLocaleString('en-US')} feet` : `1 inch = ${(d / 63360).toFixed(1)} miles`;
  const miss = last?.missing?.length ? ` · missing: ${last.missing.join(', ')}` : '';
  $('#status').textContent = `${project.year} · ${fmtScale(d)} · ${inch} · drawn in ${last?.ms ?? '…'} ms${miss}`;
  const sc = $('#view-scale');
  if (sc && document.activeElement !== sc) sc.value = Math.round(d);
}

// ── Pan and zoom ───────────────────────────────────────────────────────────

let resetting = false;
const zoom = d3
  .zoom()
  .scaleExtent([1 / 64, 64])
  .clickDistance(4)
  .filter((ev) => {
    if (ev.target.closest?.('.ann') && tool === 'pan') return false;
    return (!ev.ctrlKey || ev.type === 'wheel') && !ev.button;
  })
  .on('start', () => {
    if (resetting) return;
    svg.selectAll('g.map > g, g.annotations').attr('filter', null);
    svg.selectAll('.paper-overlays, .ui').attr('display', 'none');
  })
  .on('zoom', (ev) => {
    if (resetting) return;
    svg.selectAll('g.map > g, g.annotations > g').attr('transform', ev.transform);
  })
  .on('end', (ev) => {
    if (resetting) return;
    const t = ev.transform;
    if (t.k === 1 && t.x === 0 && t.y === 0) {
      svg.selectAll('.paper-overlays, .ui').attr('display', null);
      return;
    }
    const f = frameOf(project);
    const c = t.invert([f.x0 + f.w / 2, f.y0 + f.h / 2]);
    const ll = last.projection.invert(c);
    project.view.center = [round(ll[0], 6), round(ll[1], 6)];
    project.view.denominator = Math.max(500, Math.round(project.view.denominator / t.k));
    resetting = true;
    svg.call(zoom.transform, d3.zoomIdentity);
    resetting = false;
    changed(0);
  });

function round(v, n) {
  const k = 10 ** n;
  return Math.round(v * k) / k;
}

// ── Clicks on the sheet: annotation tools and feature inspection ───────────

function sheetPoint(ev) {
  return d3.pointer(ev, svgEl);
}

svg.on('click', (ev) => {
  if (!last) return;
  const xy = sheetPoint(ev);
  const ll = last.projection.invert(xy);
  if (!ll) return;
  const ll6 = [round(ll[0], 6), round(ll[1], 6)];
  if (tool === 'label' || tool === 'marker') {
    const a = {
      id: `a${Date.now().toString(36)}`,
      type: tool,
      lonlat: ll6,
      text: tool === 'label' ? 'Label' : 'Place',
      style: tool === 'label' ? 'district' : 'building',
      symbol: tool === 'marker' ? 'ring' : undefined,
    };
    project.annotations.push(a);
    selected = a.id;
    setTool('pan');
    renderAnnotationPanel();
    changed(0);
    setTimeout(() => $('#ann-text')?.select(), 50);
    return;
  }
  if (tool === 'shape') {
    if (!drawing) drawing = { points: [] };
    drawing.points.push(ll6);
    decorate();
    return;
  }
  const annNode = ev.target.closest?.('.ann');
  if (annNode) {
    selected = annNode.getAttribute('data-ann');
    inspected = null;
    renderAnnotationPanel();
    decorate();
    return;
  }
  selected = null;
  inspected = hitTest(xy, ll);
  renderInspector();
  renderAnnotationPanel();
  decorate();
});

svg.on('dblclick', (ev) => {
  if (tool !== 'shape' || !drawing) return;
  ev.preventDefault();
  ev.stopPropagation();
  finishShape();
});
svg.on('dblclick.zoom', null);

function finishShape() {
  if (!drawing) return;
  // A double-click adds the last point twice.
  const pts = drawing.points.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (pts.length >= 2) {
    const a = { id: `a${Date.now().toString(36)}`, type: 'shape', points: pts, closed: pts.length >= 3, shapeStyle: pts.length >= 3 ? 'hatch' : 'line' };
    project.annotations.push(a);
    selected = a.id;
  }
  drawing = null;
  setTool('pan');
  renderAnnotationPanel();
  changed(0);
}

function distToSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function hitTest(xy, ll) {
  const tolPx = 6;
  const near = last.projection.invert([xy[0] + tolPx, xy[1] + tolPx]);
  const tol = Math.max(Math.abs(near[0] - ll[0]), Math.abs(near[1] - ll[1]));
  let best = null;
  for (const { layer, features } of [...last.drawn].reverse()) {
    for (const f of features) {
      const b = f._bbox;
      if (ll[0] < b[0] - tol || ll[0] > b[2] + tol || ll[1] < b[1] - tol || ll[1] > b[3] + tol) continue;
      let d = Infinity;
      const g = f.geometry;
      if (g.type === 'Point') {
        const p = last.projection(g.coordinates);
        if (p) d = Math.hypot(p[0] - xy[0], p[1] - xy[1]);
      } else {
        for (const line of projectLines(last.projection, g.type.includes('Polygon') ? { type: 'MultiLineString', coordinates: g.type === 'Polygon' ? g.coordinates : g.coordinates.flat() } : g))
          for (let i = 1; i < line.length; i++) d = Math.min(d, distToSeg(xy, line[i - 1], line[i]));
        if (d > tolPx && g.type.includes('Polygon') && d3.geoContains(f, ll)) d = tolPx + 1;
      }
      if (d <= tolPx + 1 && (!best || d < best.d)) best = { layer, feature: f, d };
    }
  }
  return best;
}

// Dragging annotations.
function enableAnnotationDrag() {
  const drag = d3
    .drag()
    .filter((ev) => tool === 'pan' && !ev.button)
    .on('start', function () {
      selected = this.getAttribute('data-ann');
      d3.select(this).attr('data-dx', 0).attr('data-dy', 0);
    })
    .on('drag', function (ev) {
      const dx = Number(this.getAttribute('data-dx')) + ev.dx;
      const dy = Number(this.getAttribute('data-dy')) + ev.dy;
      d3.select(this).attr('data-dx', dx).attr('data-dy', dy).attr('transform', `translate(${dx},${dy})`);
    })
    .on('end', function () {
      const dx = Number(this.getAttribute('data-dx'));
      const dy = Number(this.getAttribute('data-dy'));
      if (!dx && !dy) return;
      const a = project.annotations.find((x) => x.id === this.getAttribute('data-ann'));
      const move = (ll) => {
        const p = last.projection(ll);
        const q = last.projection.invert([p[0] + dx, p[1] + dy]);
        return [round(q[0], 6), round(q[1], 6)];
      };
      if (a.type === 'shape') a.points = a.points.map(move);
      else a.lonlat = move(a.lonlat);
      renderAnnotationPanel();
      changed(0);
    });
  svg.selectAll('.ann').call(drag);
}

// ── Controls ───────────────────────────────────────────────────────────────

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'value' || k === 'selected' || k === 'disabled') n[k] = v;
    else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
}

function row(label, ...inputs) {
  return el('label', { class: 'row' }, el('span', {}, label), ...inputs);
}

function select(options, value, onchange, attrs = {}) {
  return el(
    'select',
    { ...attrs, onchange: (e) => onchange(e.target.value) },
    options.map(([v, l]) => el('option', { value: v, selected: String(v) === String(value) }, l)),
  );
}

function check(label, value, onchange) {
  return el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!value, onchange: (e) => onchange(e.target.checked) }), label);
}

function number(value, onchange, attrs = {}) {
  return el('input', { type: 'number', value, ...attrs, onchange: (e) => e.target.value !== '' && onchange(Number(e.target.value)) });
}

function text(value, onchange, attrs = {}) {
  return el('input', { type: 'text', value: value ?? '', ...attrs, oninput: (e) => onchange(e.target.value) });
}

function area(value, onchange, attrs = {}) {
  return el('textarea', { rows: 2, ...attrs, oninput: (e) => onchange(e.target.value) }, value ?? '');
}

function section(id, title, body, open = false) {
  const existing = document.getElementById(id);
  const isOpen = existing ? existing.open : open;
  const d = el('details', { id, open: isOpen }, el('summary', {}, title), el('div', { class: 'body' }, body));
  if (existing) existing.replaceWith(d);
  return d;
}

function renderControls() {
  const panel = $('#panel');
  panel.replaceChildren(
    el('h1', {}, 'Cartographer'),
    projectSection(),
    dateSection(),
    viewSection(),
    paperSection(),
    styleSection(),
    furnitureSection(),
    el('details', { id: 'layers', open: true }, el('summary', {}, 'Layers'), el('div', { class: 'body', id: 'layer-list' })),
    el('details', { id: 'backdrops' }, el('summary', {}, 'Backdrops'), el('div', { class: 'body', id: 'backdrop-list' })),
    el('details', { id: 'annotations', open: true }, el('summary', {}, 'Notes on the map'), el('div', { class: 'body', id: 'ann-panel' })),
    el('details', { id: 'inspect', open: true }, el('summary', {}, 'Inspect'), el('div', { class: 'body', id: 'inspector' }, el('p', { class: 'hint' }, 'Click a feature on the map.'))),
    exportSection(),
  );
  renderLayerList();
  renderBackdropList();
  renderAnnotationPanel();
  renderInspector();
}

function projectSection() {
  const list = el('select', { id: 'project-list' }, el('option', { value: '' }, 'Open a saved map…'));
  fetch('api/projects')
    .then((r) => r.json())
    .then((names) => names.forEach((n) => list.append(el('option', { value: n }, n))))
    .catch(() => {});
  list.addEventListener('change', async () => {
    if (!list.value) return;
    const r = await fetch(`api/projects/${list.value}`);
    project = normalise(await r.json());
    selected = null;
    inspected = null;
    renderControls();
    changed(0);
  });
  const chapterSel = select(
    [['', 'Set date from a chapter…'], ...chapters.map((c) => [c.id, `${c.era} · ${c.title}`])],
    project.chapter || '',
    (id) => {
      const c = chapters.find((x) => x.id === id);
      if (!c) return;
      project.chapter = id;
      project.year = c.era;
      const m = c.dates.match(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{1,2})`));
      if (m) {
        project.month = MONTHS.indexOf(m[1]) + 1;
        project.day = Number(m[2]);
      }
      if (project.name === 'untitled') project.name = `${id}-map`;
      project.dateline = String(c.era);
      renderControls();
      changed(0);
    },
  );
  return section(
    'sec-project',
    'Map',
    [
      row('Name', text(project.name, (v) => (project.name = v.toLowerCase().replace(/[^a-z0-9]+/g, '-')), { id: 'project-name' })),
      el(
        'div',
        { class: 'buttons' },
        el('button', { onclick: saveProject }, 'Save'),
        el('button', {
          onclick: () => {
            project = defaultProject();
            selected = null;
            inspected = null;
            renderControls();
            changed(0);
          },
        }, 'New'),
      ),
      list,
      chapterSel,
      el('p', { class: 'hint', id: 'save-msg' }),
    ],
    true,
  );
}

async function saveProject() {
  const name = project.name || 'untitled';
  const r = await fetch(`api/projects/${name}`, { method: 'PUT', body: JSON.stringify(project, null, 2) });
  $('#save-msg').textContent = r.ok ? `Saved to cartographer/projects/${name}.json` : `Not saved: ${await r.text()}`;
}

function dateSection() {
  const yearNum = number(project.year, (v) => setYear(v), { min: 1700, max: 2100, id: 'year-num' });
  const slider = el('input', {
    type: 'range',
    min: 1860,
    max: 1950,
    value: project.year,
    id: 'year-range',
    oninput: (e) => {
      yearNum.value = e.target.value;
      setYear(Number(e.target.value), true);
    },
  });
  return section(
    'sec-date',
    'Date',
    [
      el('div', { class: 'year' }, slider, yearNum),
      row('Month', select(MONTHS.map((m, i) => [i + 1, m]), project.month, (v) => ((project.month = Number(v)), changed()))),
      row('Day', number(project.day, (v) => ((project.day = v), changed()), { min: 1, max: 31 })),
      el('p', { class: 'hint' }, 'Features appear from their start year and disappear at their end. County lines and city limits change on the day.'),
    ],
    true,
  );
}

// Turns a view given as a preset name ({preset: 'city'}) or a box ({bounds: [west, south, east, north]})
// into a centre and scale. Anything the spec states outright (projection, centre, scale, style) wins.
function resolveView(p, spec = {}, specStyle = {}) {
  const preset = VIEWS[spec.preset];
  if (spec.preset && !preset) throw new Error(`Unknown view preset "${spec.preset}". Use one of: ${Object.keys(VIEWS).join(', ')}`);
  const bounds = spec.bounds || (preset?.bounds && !spec.center ? preset.bounds : null);
  if (preset) {
    p.view.projection = spec.projection || preset.projection;
    p.style = { ...p.style, ...preset.style, ...specStyle };
    if (!bounds) Object.assign(p.view, { center: spec.center || preset.center, denominator: spec.denominator || preset.denominator });
  } else if (bounds && !spec.projection) {
    p.view.projection = bounds[2] - bounds[0] > 1.5 ? 'conic' : 'local';
  }
  if (bounds) Object.assign(p.view, fitView(p, bounds));
  delete p.view.preset;
  delete p.view.bounds;
  return p;
}

function setYear(y, fromSlider) {
  const old = project.year;
  project.year = y;
  if (!fromSlider) $('#year-range').value = y;
  if (project.dateline === String(old)) {
    project.dateline = String(y);
    const dl = $('#dateline');
    if (dl) dl.value = project.dateline;
  }
  changed(fromSlider ? 150 : 0);
}

function viewSection() {
  return section('sec-view', 'View', [
    el(
      'div',
      { class: 'buttons' },
      Object.entries(VIEWS).map(([k, v]) =>
        el('button', {
          onclick: () => {
            resolveView(project, { preset: k });
            renderControls();
            changed(0);
          },
        }, v.label),
      ),
    ),
    row('Scale 1:', number(Math.round(project.view.denominator), (v) => ((project.view.denominator = Math.max(500, v)), changed(0)), { id: 'view-scale', step: 100 })),
    row(
      'Projection',
      select(
        [['local', 'Transverse Mercator (city)'], ['conic', 'Lambert conformal (state)']],
        project.view.projection,
        (v) => ((project.view.projection = v), changed(0)),
      ),
    ),
    el('p', { class: 'hint' }, 'Drag to pan, scroll to zoom.'),
  ]);
}

function paperSection() {
  const p = project.paper;
  return section('sec-paper', 'Paper', [
    row(
      'Size',
      select(
        Object.entries(PAPERS).map(([k, v]) => [k, v.label]),
        p.preset,
        (k) => {
          p.preset = k;
          if (k !== 'custom') Object.assign(p, { width: PAPERS[k].width, height: PAPERS[k].height, margin: PAPERS[k].margin });
          renderControls();
          changed(0);
        },
      ),
    ),
    row('Width (in)', number(p.width, (v) => ((p.width = v), (p.preset = 'custom'), changed(0)), { step: 0.125, min: 1 })),
    row('Height (in)', number(p.height, (v) => ((p.height = v), (p.preset = 'custom'), changed(0)), { step: 0.125, min: 1 })),
    row('Margin (in)', number(p.margin, (v) => ((p.margin = v), changed(0)), { step: 0.05, min: 0 })),
  ]);
}

function styleSection() {
  const theme = resolveTheme(project);
  const colors = COLOR_KEYS.map(([k, label]) =>
    el(
      'label',
      { class: 'swatch' },
      el('input', {
        type: 'color',
        value: theme[k],
        oninput: (e) => {
          project.colors[k] = e.target.value;
          changed(120);
        },
      }),
      label,
    ),
  );
  const fx = [['age', 'Age'], ['grain', 'Grain'], ['foxing', 'Foxing'], ['inkBleed', 'Ink spread'], ['folds', 'Folds']].map(([k, label]) =>
    row(
      label,
      el('input', {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        value: theme.effects[k],
        oninput: (e) => {
          project.effects[k] = Number(e.target.value);
          changed(200);
        },
      }),
    ),
  );
  return section('sec-style', 'Style', [
    row(
      'Theme',
      select(
        Object.entries(THEMES).map(([k, v]) => [k, v.name]),
        project.theme,
        (v) => {
          project.theme = v;
          project.colors = {};
          project.effects = {};
          renderControls();
          changed(0);
        },
      ),
    ),
    el('div', { class: 'swatches' }, colors),
    el('button', { class: 'small', onclick: () => ((project.colors = {}), renderControls(), changed(0)) }, 'Reset colours'),
    ...fx,
    check('Sea and coast water-lining', project.style.sea, (v) => ((project.style.sea = v), changed(0))),
    check('County washes', project.style.countyTints, (v) => ((project.style.countyTints = v), changed(0))),
    check('Block washes (Sanborn colours)', project.style.blockWash, (v) => ((project.style.blockWash = v), changed(0))),
    check('Paper halo behind lettering', project.style.halo, (v) => ((project.style.halo = v), changed(0))),
    row(
      'Streets',
      select(
        [['auto', 'Double line when close in'], ['double', 'Double line'], ['single', 'Single line']],
        project.style.streetMode,
        (v) => ((project.style.streetMode = v), changed(0)),
      ),
    ),
  ]);
}

function furnitureSection() {
  const f = project.furniture;
  const pos = (cfg) => select(POSITIONS.map((p) => [p, p.replace('-', ' ')]), cfg.pos, (v) => ((cfg.pos = v), changed(0)));
  return section('sec-furniture', 'Title and furniture', [
    row('Title', area(project.title, (v) => ((project.title = v), changed(250)))),
    row('Subtitle', area(project.subtitle, (v) => ((project.subtitle = v), changed(250)))),
    row('Date line', text(project.dateline, (v) => ((project.dateline = v), changed(250)), { id: 'dateline' })),
    el('div', { class: 'inline' }, check('Title', f.title.show, (v) => ((f.title.show = v), changed(0))), pos(f.title), check('Box', f.title.box, (v) => ((f.title.box = v), changed(0)))),
    row('Title size (pt)', number(f.title.size, (v) => ((f.title.size = v), changed(0)), { min: 6, max: 72 })),
    el('div', { class: 'inline' }, check('Scale', f.scalebar.show, (v) => ((f.scalebar.show = v), changed(0))), pos(f.scalebar), select([['auto', 'auto'], ['feet', 'feet'], ['miles', 'miles']], f.scalebar.units, (v) => ((f.scalebar.units = v), changed(0))), check('Box', f.scalebar.box, (v) => ((f.scalebar.box = v), changed(0)))),
    el('div', { class: 'inline' }, check('Compass', f.compass.show, (v) => ((f.compass.show = v), changed(0))), pos(f.compass)),
    el('div', { class: 'inline' }, check('References', f.legend.show, (v) => ((f.legend.show = v), changed(0))), pos(f.legend)),
    row('Border', select([['double', 'Double rule'], ['single', 'Single rule'], ['none', 'None']], f.border, (v) => ((f.border = v), changed(0)))),
    row('Graticule', select([['none', 'None'], ['ticks', 'Ticks on the border'], ['lines', 'Lines across']], f.graticule, (v) => ((f.graticule = v), changed(0)))),
    check('Credits line below the border', f.credits, (v) => ((f.credits = v), changed(0))),
    row('Credits', area(project.credits, (v) => ((project.credits = v || undefined), changed(250)), { placeholder: 'Automatic: the sources of the layers shown' })),
  ]);
}

function renderLayerList() {
  const box = $('#layer-list');
  if (!box) return;
  const groups = new Map();
  for (const l of catalog.layers) {
    if (!groups.has(l.group)) groups.set(l.group, []);
    groups.get(l.group).push(l);
  }
  const d = project.view.denominator;
  const kids = [];
  for (const [g, layers] of groups) {
    kids.push(el('h3', {}, g));
    for (const l of [...layers].sort((a, b) => (b.z ?? 0) - (a.z ?? 0))) {
      const cfg = (project.layers[l.id] ||= {});
      const unavailable = last?.missing?.includes(l.id);
      if (unavailable) cfg.visible = false; // data isn't there: don't leave the switch stuck on
      const on = cfg.visible ?? l.visible ?? false;
      const drawn = layerOn(l, project, d);
      let note = '';
      if (unavailable) note = 'data not available';
      else if (on && !drawn) note = 'not at this scale';
      else if (on && !cfg.anyYear && ((l.start != null && project.year < l.start) || (l.end != null && project.year >= l.end))) note = `${l.start ?? ''}–${l.end ?? ''} only`;
      else if (drawn && last?.stats?.[l.id] != null) note = `${last.stats[l.id].toLocaleString('en-US')}`;
      if (l.snapshots && drawn) {
        const snap = layerSnapshot(l, project.year);
        if (!snap) note = 'no survey near this year';
        else if (snap.year !== project.year) note += ` · ${snap.year} survey`;
      }
      const opts = unavailable
        ? []
        : [
            check('labels', cfg.labels ?? layerSnapshot(l, project.year)?.labels ?? l.labels ?? true, (v) => ((cfg.labels = v), changed(0))),
            check('any scale', cfg.anyScale, (v) => ((cfg.anyScale = v), changed(0))),
          ];
      if (!unavailable && l.undated === 'hide') opts.push(check('undated', cfg.undated, (v) => ((cfg.undated = v), changed(0))));
      if (!unavailable && (l.start != null || l.end != null)) opts.push(check('any year', cfg.anyYear, (v) => ((cfg.anyYear = v), changed(0))));
      if (!unavailable && l.render === 'counties') opts.push(check('wash', cfg.tint ?? project.style.countyTints, (v) => ((cfg.tint = v), changed(0))));
      kids.push(
        el(
          'div',
          { class: `layer${unavailable ? ' unavailable' : on ? '' : ' off'}`, title: l.attribution || '' },
          el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: on, disabled: unavailable, onchange: (e) => ((cfg.visible = e.target.checked), changed(0)) }), l.title),
          el('span', { class: 'note' }, note),
          on ? el('div', { class: 'opts' }, opts) : null,
        ),
      );
    }
  }
  if (project.hidden.length || Object.keys(project.rename).length)
    kids.push(
      el(
        'p',
        { class: 'hint' },
        `${project.hidden.length} hidden, ${Object.keys(project.rename).length} renamed on this map. `,
        el('button', { class: 'small', onclick: () => ((project.hidden = []), (project.rename = {}), changed(0)) }, 'Restore all'),
      ),
    );
  box.replaceChildren(...kids);
}

function renderBackdropList() {
  const box = $('#backdrop-list');
  if (!box) return;
  const defs = catalog.backdrops || [];
  if (!defs.length) {
    box.replaceChildren(el('p', { class: 'hint' }, 'No georeferenced period maps yet. See cartographer/README.md, "Backdrops".'));
    return;
  }
  box.replaceChildren(
    el('p', { class: 'hint' }, 'A period map laid under the drawing. "Guide" shows it on screen for tracing but leaves it out of the export.'),
    ...defs.map((d) => {
      const cur = project.backdrops.find((b) => b.id === d.id);
      const set = (patch) => {
        let b = project.backdrops.find((x) => x.id === d.id);
        if (!b) project.backdrops.push((b = { id: d.id, opacity: 0.5, guide: true }));
        Object.assign(b, patch);
        changed(0);
      };
      return el(
        'div',
        { class: `layer${cur ? '' : ' off'}`, title: d.credit || '' },
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!cur, onchange: (e) => (e.target.checked ? set({}) : ((project.backdrops = project.backdrops.filter((x) => x.id !== d.id)), changed(0))) }), d.title),
        cur
          ? el(
              'div',
              { class: 'opts' },
              el('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: cur.opacity ?? 0.5, oninput: (e) => set({ opacity: Number(e.target.value) }) }),
              check('guide', cur.guide, (v) => set({ guide: v })),
            )
          : null,
      );
    }),
  );
}

function setTool(t) {
  tool = t;
  if (t !== 'shape') drawing = null;
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  svgEl.classList.toggle('placing', t !== 'pan');
}

function renderAnnotationPanel() {
  const box = $('#ann-panel');
  if (!box) return;
  const tools = el(
    'div',
    { class: 'buttons tools' },
    [['pan', 'Move'], ['label', 'Label'], ['marker', 'Marker'], ['shape', 'Line or area']].map(([t, l]) =>
      el('button', { 'data-tool': t, class: tool === t ? 'active' : '', onclick: () => setTool(t) }, l),
    ),
  );
  const hint = el('p', { class: 'hint' }, tool === 'shape' ? 'Click to add points; double-click to finish.' : 'Pick a tool, then click the map. Drag a note to move it.');
  const list = el(
    'ul',
    { class: 'ann-list' },
    project.annotations.map((a) =>
      el('li', { class: a.id === selected ? 'sel' : '', onclick: () => ((selected = a.id), renderAnnotationPanel(), decorate()) }, `${a.type}: ${(a.text || a.shapeStyle || '').split('\n')[0]}`),
    ),
  );
  const a = project.annotations.find((x) => x.id === selected);
  const editor = a ? annotationEditor(a) : null;
  box.replaceChildren(tools, hint, list, editor || '');
}

function annotationEditor(a) {
  const upd = (k) => (v) => {
    a[k] = v;
    if (k === 'text') {
      const li = document.querySelector('.ann-list li.sel');
      if (li) li.textContent = `${a.type}: ${String(v).split('\n')[0]}`;
    }
    changed(200);
  };
  const colours = [['', 'style default'], ['ink', 'ink'], ['inkSoft', 'faint ink'], ['waterInk', 'water ink'], ['annotation', 'notes'], ['limits', 'city limits']];
  const kids = [];
  if (a.type !== 'shape') {
    kids.push(row('Text', area(a.text, upd('text'), { id: 'ann-text' })));
    kids.push(row('Lettering', select(Object.keys(ANN_STYLES).map((k) => [k, k]), a.style, upd('style'))));
    kids.push(row('Size (pt)', number(a.size ?? '', (v) => upd('size')(v || undefined), { min: 3, max: 60, step: 0.5, placeholder: 'style' })));
    kids.push(row('Rotate (°)', number(a.rotate ?? 0, upd('rotate'), { min: -180, max: 180 })));
    kids.push(check('Paper halo', a.halo, upd('halo')));
  }
  if (a.type === 'marker') kids.push(row('Symbol', select(SYMBOLS.map((s) => [s, s]), a.symbol || 'none', upd('symbol'))));
  if (a.type === 'shape') {
    kids.push(row('Style', select(SHAPE_STYLES.map((s) => [s, s]), a.shapeStyle, upd('shapeStyle'))));
    kids.push(check('Closed', a.closed, upd('closed')));
    kids.push(check('Dashed line', a.dash, upd('dash')));
  }
  kids.push(row('Colour', select(colours, a.color || '', (v) => upd('color')(v || undefined))));
  kids.push(
    el('button', {
      class: 'danger',
      onclick: () => {
        project.annotations = project.annotations.filter((x) => x !== a);
        selected = null;
        renderAnnotationPanel();
        changed(0);
      },
    }, 'Delete'),
  );
  return el('div', { class: 'ann-editor' }, kids);
}

function renderInspector() {
  const box = $('#inspector');
  if (!box) return;
  if (!inspected) {
    box.replaceChildren(el('p', { class: 'hint' }, 'Click a feature on the map to see its data and dates.'));
    return;
  }
  const { layer, feature } = inspected;
  const key = `${layer.id}:${feature._key}`;
  const props = Object.entries(feature.properties).map(([k, v]) => el('tr', {}, el('th', {}, k), el('td', {}, typeof v === 'object' ? JSON.stringify(v) : String(v))));
  box.replaceChildren(
    el('p', {}, el('strong', {}, feature.properties.name || '(no name)'), ` · ${layer.title}`),
    el('table', { class: 'props' }, props),
    el(
      'div',
      { class: 'buttons' },
      el('button', {
        onclick: () => {
          project.hidden.push(key);
          inspected = null;
          renderInspector();
          changed(0);
        },
      }, 'Hide on this map'),
      el('button', {
        onclick: () => {
          const v = prompt('Name to print on this map (empty to restore):', project.rename[key] ?? feature.properties.name ?? '');
          if (v === null) return;
          if (v === '') delete project.rename[key];
          else project.rename[key] = v;
          changed(0);
        },
      }, 'Rename on this map'),
    ),
  );
}

function exportSection() {
  const base = () => {
    const n = project.name || 'map';
    return n.endsWith(String(project.year)) ? n : `${n}-${project.year}`;
  };
  const p = project.paper;
  const go = async (type) => {
    const msg = $('#export-msg');
    msg.textContent = 'Drawing at full quality…';
    try {
      await redraw();
      if (type === 'svg') download(new Blob([await svgString(svgEl, p.width, p.height)], { type: 'image/svg+xml' }), `${base()}.svg`);
      else {
        const mime = type === 'png' ? 'image/png' : 'image/jpeg';
        download(await rasterBlob(svgEl, p.width, p.height, p.dpi, mime), `${base()}.${type}`);
      }
      msg.textContent = `Exported ${base()}.${type}. Put book images in chapters/<id>/art/ and list them under ### Images in the chapter's sources.`;
    } catch (err) {
      msg.textContent = `Export failed: ${err.message}`;
    }
  };
  return section(
    'sec-export',
    'Export',
    [
      row('Resolution', select([[150, '150 dpi'], [300, '300 dpi (print)'], [600, '600 dpi']], p.dpi, (v) => (p.dpi = Number(v)))),
      el('div', { class: 'buttons' }, el('button', { onclick: () => go('png') }, 'PNG'), el('button', { onclick: () => go('jpg') }, 'JPEG'), el('button', { onclick: () => go('svg') }, 'SVG')),
      el('p', { class: 'hint', id: 'export-msg' }),
    ],
    true,
  );
}

// ── Start ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, textarea, select')) return;
  if (ev.key === 'Escape') {
    drawing = null;
    setTool('pan');
    decorate();
  }
  if (ev.key === 'Enter' && drawing) finishShape();
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected) {
    project.annotations = project.annotations.filter((a) => a.id !== selected);
    selected = null;
    renderAnnotationPanel();
    changed(0);
  }
});

new ResizeObserver(() => fitDisplay()).observe($('#stage'));
$('#display-scale').addEventListener('change', (e) => {
  displayScale = e.target.value;
  fitDisplay();
});

// Re-attach drag handlers after every draw.
const observer = new MutationObserver(() => enableAnnotationDrag());
observer.observe(svgEl, { childList: true });

async function start() {
  await Promise.all(FACES.map(([family, weight, style]) => document.fonts.load(`${style} ${weight} 12px "${family}"`))).catch(() => {});
  catalog = await loadCatalog();
  chapters = await fetch('api/chapters')
    .then((r) => r.json())
    .catch(() => []);
  const named = params.get('project');
  if (named) {
    const r = await fetch(`api/projects/${named}`);
    if (r.ok) project = normalise(await r.json());
  } else {
    try {
      const saved = localStorage.getItem('cartographer:last');
      if (saved) project = normalise(JSON.parse(saved));
    } catch {
      /* nothing saved */
    }
  }
  if (headless) document.body.classList.add('headless');
  renderControls();
  svg.call(zoom);
  svg.on('dblclick.zoom', null);
  await redraw();
}

const ready = start();

// For scripts/render.js and the console.
window.cartographer = {
  ready,
  get project() {
    return project;
  },
  async exportBlob(type = 'png', dpi) {
    await ready;
    await redraw();
    if (lastError) throw lastError;
    const p = project.paper;
    if (type === 'svg') return new Blob([await svgString(svgEl, p.width, p.height)], { type: 'image/svg+xml' });
    return rasterBlob(svgEl, p.width, p.height, dpi || p.dpi, type === 'png' ? 'image/png' : 'image/jpeg');
  },
  stats: () => last?.stats,
  // Replaces the map with a project (whole or partial) and draws it; for scripts and the MCP server.
  async load(spec) {
    await ready;
    project = resolveView(normalise(spec), spec.view || {}, spec.style || {});
    selected = null;
    inspected = null;
    renderControls();
    await redraw();
    if (lastError) throw lastError;
    return { project, stats: last?.stats || {}, missing: last?.missing || [], backdrops: last?.backdrops || [] };
  },
};
