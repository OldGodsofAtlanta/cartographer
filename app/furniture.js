// Map furniture: neatline, graticule ticks, title cartouche, scale, compass rose, references, credits.
// layoutFurniture() measures and positions everything first (so lettering can avoid it), then draw().

/* global d3 */

import { measure, styledText, PT } from './labels.js';
import { metresPerPixel, IN, star } from './render.js';

const S = {
  title: { font: 'IM Fell Great Primer SC', size: 20, upper: true, spacing: 0.06, color: 'ink' },
  subtitle: { font: 'IM Fell English', italic: true, size: 10, color: 'ink' },
  dateline: { font: 'Spectral', weight: 600, size: 6.5, upper: true, spacing: 0.3, color: 'inkSoft' },
  scale: { font: 'Spectral', size: 5.5, upper: true, spacing: 0.1, color: 'ink' },
  scaleNote: { font: 'IM Fell English', italic: true, size: 6.5, color: 'ink' },
  legendHead: { font: 'IM Fell Great Primer SC', size: 7.5, upper: true, spacing: 0.25, color: 'ink' },
  legend: { font: 'Spectral', size: 5.8, color: 'ink' },
  credits: { font: 'Spectral', italic: true, size: 5, color: 'inkSoft' },
  grat: { font: 'Spectral', size: 4.8, color: 'inkSoft' },
};

function text(g, str, s, theme, attrs) {
  const px = s.size * PT;
  const t = g.append('text').attr('font-family', s.font).attr('font-size', px.toFixed(2)).attr('fill', theme[s.color] || theme.ink);
  if (s.italic) t.attr('font-style', 'italic');
  if (s.weight && s.weight !== 400) t.attr('font-weight', s.weight);
  if (s.spacing) t.attr('letter-spacing', (s.spacing * px).toFixed(2));
  for (const [k, v] of Object.entries(attrs || {})) t.attr(k, v);
  t.text(styledText(str, s));
  return t;
}

function niceFloor(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [5, 2.5, 2, 1]) if (m * p <= v) return m * p;
  return p;
}

function fmt(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function box(g, x, y, w, h, theme, double = true) {
  g.append('rect').attr('x', x).attr('y', y).attr('width', w).attr('height', h).attr('fill', theme.paper).attr('stroke', theme.ink).attr('stroke-width', double ? 1.1 : 0.6);
  if (double) g.append('rect').attr('x', x + 2.6).attr('y', y + 2.6).attr('width', w - 5.2).attr('height', h - 5.2).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', 0.4);
}

// ── Items: each returns {w, h, draw(g, x, y)} ─────────────────────────────

function titleItem(project, theme) {
  const f = project.furniture.title;
  const lines = (project.title || '').split('\n').filter(Boolean);
  const ts = { ...S.title, size: f.size || S.title.size };
  const rows = [];
  for (const l of lines) rows.push({ str: l, s: ts, m: measure(styledText(l, ts), ts) });
  const hasSub = !!project.subtitle;
  if (hasSub) for (const l of project.subtitle.split('\n')) rows.push({ str: l, s: S.subtitle, m: measure(l, S.subtitle), gapBefore: rows.length && rows[rows.length - 1].s === ts ? 9 : 0 });
  const dl = project.dateline ?? '';
  if (dl) rows.push({ str: dl, s: S.dateline, m: measure(styledText(dl, S.dateline), S.dateline), gapBefore: 5 });
  if (!rows.length) return null;
  const pad = f.box ? 12 : 4;
  const w = Math.max(...rows.map((r) => r.m.w)) + pad * 2;
  const h = rows.reduce((a, r) => a + r.m.h * 1.18 + (r.gapBefore || 0), 0) + pad * 2 - 2;
  return {
    w,
    h,
    draw(g, x, y) {
      if (f.box) box(g, x, y, w, h, theme);
      let cy = y + pad;
      for (const r of rows) {
        cy += r.gapBefore || 0;
        if (r.gapBefore === 9) {
          // a rule with a lozenge between the title and the subtitle
          const mid = x + w / 2;
          g.append('line').attr('x1', mid - 34).attr('x2', mid - 6).attr('y1', cy - 4.5).attr('y2', cy - 4.5).attr('stroke', theme.ink).attr('stroke-width', 0.5);
          g.append('line').attr('x1', mid + 6).attr('x2', mid + 34).attr('y1', cy - 4.5).attr('y2', cy - 4.5).attr('stroke', theme.ink).attr('stroke-width', 0.5);
          g.append('path').attr('d', `M${mid - 3.5},${cy - 4.5}L${mid},${cy - 7}L${mid + 3.5},${cy - 4.5}L${mid},${cy - 2}Z`).attr('fill', theme.ink);
        }
        text(g, r.str, r.s, theme, { x: x + w / 2, y: cy + r.m.h * 0.85, 'text-anchor': 'middle' });
        cy += r.m.h * 1.18;
      }
    },
  };
}

function scaleItem(project, theme, projection, frame, denom) {
  const f = project.furniture.scalebar;
  const mpp = metresPerPixel(projection, frame);
  const feet = f.units === 'feet' || (f.units !== 'miles' && denom < 60000);
  const unitM = feet ? 0.3048 : 1609.344;
  const target = 1.7 * IN;
  const len = niceFloor((target * mpp) / unitM);
  const px = (len * unitM) / mpp;
  const segs = [5, 4, 2].find((n) => Number.isInteger((len / n) * 100)) || 4;
  // Worded the way the period sheets put it: "Scale 1000 Feet to One Inch".
  const ftPerIn = denom / 12;
  const ftR = ftPerIn >= 1000 ? Math.round(ftPerIn / 50) * 50 : Math.round(ftPerIn / 10) * 10;
  const miPerIn = denom / 63360;
  const miR = miPerIn >= 10 ? Math.round(miPerIn) : Math.round(miPerIn * 2) / 2;
  const miStr = Number.isInteger(miR) ? String(miR) : `${Math.floor(miR) || ''}½`;
  const approx = feet ? ftR !== ftPerIn : miR !== miPerIn;
  const note = feet
    ? `Scale ${approx ? 'about ' : ''}${ftR.toLocaleString('en-US')} Feet to One Inch`
    : `Scale ${approx ? 'about ' : ''}${miStr} ${miR === 1 ? 'Mile' : 'Miles'} to One Inch`;
  const nm = measure(note, S.scaleNote);
  const unit = feet ? 'Feet' : len === 1 ? 'Mile' : 'Miles';
  const um = measure(styledText(unit, S.scale), S.scale);
  const barW = 8 + px + 5 + um.w + 8;
  const w = Math.max(barW, nm.w + 16);
  const h = 40;
  return {
    w,
    h,
    draw(g, x, y) {
      if (f.box) box(g, x, y, w, h, theme, false);
      const bx = x + (w - (px + 5 + um.w)) / 2;
      const by = y + 14;
      for (let i = 0; i < segs; i++) {
        g.append('rect')
          .attr('x', bx + (i * px) / segs)
          .attr('y', by)
          .attr('width', px / segs)
          .attr('height', 3.2)
          .attr('fill', i % 2 ? theme.paper : theme.ink)
          .attr('stroke', theme.ink)
          .attr('stroke-width', 0.5);
      }
      for (const i of [0, segs / 2, segs].filter(Number.isInteger)) {
        const v = (len * i) / segs;
        text(g, fmt(v), S.scale, theme, { x: bx + (i * px) / segs, y: by - 2.5, 'text-anchor': 'middle' });
      }
      text(g, unit, S.scale, theme, { x: bx + px + 5, y: by + 3.3, 'text-anchor': 'start' });
      text(g, note, S.scaleNote, theme, { x: x + w / 2, y: by + 16, 'text-anchor': 'middle' });
    },
  };
}

function compassItem(project, theme, projection, frame) {
  const f = project.furniture.compass;
  const r = f.size || 26;
  const w = r * 2 + 8;
  const h = r * 2 + 18;
  return {
    w,
    h,
    draw(g, x, y) {
      const cx = x + w / 2;
      const cy = y + h / 2 + 5;
      // True north at this point on the sheet.
      const ll = projection.invert([cx, cy]);
      const up = projection([ll[0], ll[1] + 0.01]);
      const ang = up ? (Math.atan2(up[0] - cx, cy - up[1]) * 180) / Math.PI : 0;
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r * 0.7).attr('fill', theme.paper).attr('fill-opacity', 0.9);
      const rose = g.append('g').attr('transform', `translate(${cx},${cy}) rotate(${ang.toFixed(2)})`);
      rose.append('circle').attr('r', r * 0.62).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', 0.5);
      rose.append('circle').attr('r', r * 0.55).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', 0.3);
      const point = (deg, len, wid) => {
        const a = (deg * Math.PI) / 180;
        const tip = [Math.sin(a) * len, -Math.cos(a) * len];
        const l = [Math.sin(a - Math.PI / 2) * wid, -Math.cos(a - Math.PI / 2) * wid];
        const rr = [Math.sin(a + Math.PI / 2) * wid, -Math.cos(a + Math.PI / 2) * wid];
        rose.append('path').attr('d', `M0,0L${l}L${tip}Z`).attr('fill', theme.paper).attr('stroke', theme.ink).attr('stroke-width', 0.4);
        rose.append('path').attr('d', `M0,0L${rr}L${tip}Z`).attr('fill', theme.ink).attr('stroke', theme.ink).attr('stroke-width', 0.4);
      };
      for (const d of [45, 135, 225, 315]) point(d, r * 0.6, r * 0.11);
      for (const d of [0, 90, 180, 270]) point(d, d === 0 ? r : r * 0.85, r * 0.15);
      rose.append('circle').attr('r', 1.4).attr('fill', theme.paper).attr('stroke', theme.ink).attr('stroke-width', 0.5);
      text(rose, 'N', { ...S.legendHead, size: 8, spacing: 0 }, theme, { x: 0, y: -r - 3, 'text-anchor': 'middle' });
    },
  };
}

const LEGEND = {
  land: ['State line', (g, x, y, t) => g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.ink).attr('stroke-width', 1.1).attr('stroke-dasharray', '7 2 1.2 2')],
  counties: ['County line', (g, x, y, t) => g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.inkSoft).attr('stroke-width', 0.6).attr('stroke-dasharray', '3 1.6')],
  limits: ['City limits', (g, x, y, t) => g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.limits).attr('stroke-width', 1.5).attr('stroke-dasharray', '9 2.5 1.5 2.5')],
  rail: [
    'Railroad',
    (g, x, y, t) => {
      g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.rail).attr('stroke-width', 0.8);
      g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.rail).attr('stroke-width', 3.4).attr('stroke-dasharray', '0.5 4');
    },
  ],
  street: [
    'Street',
    (g, x, y, t) => {
      g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.street).attr('stroke-width', 4);
      g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.streetFill).attr('stroke-width', 3);
    },
  ],
  site: [
    'Place in the story',
    (g, x, y, t) => {
      g.append('rect').attr('x', x + 2).attr('y', y - 2.2).attr('width', 4.4).attr('height', 4.4).attr('fill', t.annotation);
      g.append('circle').attr('cx', x + 12).attr('cy', y).attr('r', 2.8).attr('fill', 'none').attr('stroke', t.annotation).attr('stroke-width', 1);
      g.append('circle').attr('cx', x + 23).attr('cy', y).attr('r', 4).attr('fill', 'none').attr('stroke', t.annotation).attr('stroke-width', 0.7).attr('stroke-dasharray', '2.4 1.6');
    },
  ],
  contour: [
    'Contour, in feet',
    (g, x, y, t) => {
      g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y - 1.5).attr('y2', y - 1.5).attr('stroke', t.contour).attr('stroke-width', 0.4);
      g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y + 1.5).attr('y2', y + 1.5).attr('stroke', t.contour).attr('stroke-width', 0.8);
    },
  ],
  tram: ['Street railway', (g, x, y, t) => g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.rail).attr('stroke-width', 0.8).attr('stroke-dasharray', '3 1.4')],
  wards: ['Ward line', (g, x, y, t) => g.append('line').attr('x1', x).attr('x2', x + 22).attr('y1', y).attr('y2', y).attr('stroke', t.inkSoft).attr('stroke-width', 1).attr('stroke-dasharray', '6 2.5')],
  waterLine: ['River or creek', (g, x, y, t) => g.append('path').attr('d', `M${x},${y + 1}q5.5,-4 11,0t11,0`).attr('fill', 'none').attr('stroke', t.waterInk).attr('stroke-width', 0.9)],
  waterArea: ['Lake or pond', (g, x, y, t) => g.append('rect').attr('x', x + 3).attr('y', y - 3.5).attr('width', 16).attr('height', 7).attr('rx', 3).attr('fill', t.water).attr('stroke', t.waterInk).attr('stroke-width', 0.6)],
};

function legendItem(project, theme, layers) {
  const rows = [];
  const seen = new Set();
  for (const l of layers) {
    if (l.render === 'place') {
      if (project.view.denominator >= 120000)
        rows.push(
          ['State capital', (g, x, y, t) => {
            g.append('circle').attr('cx', x + 11).attr('cy', y).attr('r', 3.6).attr('fill', t.paper).attr('stroke', t.ink).attr('stroke-width', 0.6);
            g.append('path').attr('d', star(x + 11, y, 3, 1.3)).attr('fill', t.ink);
          }],
          ['County seat', (g, x, y, t) => {
            g.append('circle').attr('cx', x + 11).attr('cy', y).attr('r', 2.2).attr('fill', t.paper).attr('stroke', t.ink).attr('stroke-width', 0.7);
            g.append('circle').attr('cx', x + 11).attr('cy', y).attr('r', 0.75).attr('fill', t.ink);
          }],
          ['Town', (g, x, y, t) => g.append('circle').attr('cx', x + 11).attr('cy', y).attr('r', 1.3).attr('fill', t.ink)],
        );
      continue;
    }
    const entry = LEGEND[l.render];
    if (!entry || seen.has(l.render)) continue;
    seen.add(l.render);
    rows.push(entry);
  }
  if (!rows.length) return null;
  const head = measure('REFERENCES', S.legendHead);
  const rowH = 11;
  const w = Math.max(head.w, ...rows.map(([label]) => 30 + measure(label, S.legend).w)) + 20;
  const h = 16 + head.h + rows.length * rowH;
  return {
    w,
    h,
    draw(g, x, y) {
      box(g, x, y, w, h, theme);
      text(g, 'References', S.legendHead, theme, { x: x + w / 2, y: y + 8 + head.h * 0.8, 'text-anchor': 'middle' });
      rows.forEach(([label, sym], i) => {
        const ry = y + 14 + head.h + i * rowH;
        sym(g, x + 10, ry, theme);
        text(g, label, S.legend, theme, { x: x + 38, y: ry + 2.2 });
      });
    },
  };
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function layoutFurniture(project, theme, frame, projection, catalog, layers, { W, H, denom }) {
  const f = project.furniture;
  const items = [];
  const add = (cfg, item) => {
    if (cfg && cfg.show !== false && cfg.pos !== 'none' && item) items.push({ pos: cfg.pos, item });
  };
  add(f.title, titleItem(project, theme));
  add(f.legend, f.legend?.show ? legendItem(project, theme, layers) : null);
  add(f.scalebar, f.scalebar?.show ? scaleItem(project, theme, projection, frame, denom) : null);
  add(f.compass, f.compass?.show ? compassItem(project, theme, projection, frame) : null);

  const inset = 12;
  const stack = {};
  const placed = [];
  for (const { pos, item } of items) {
    const [v, hz] = pos.split('-');
    const off = stack[pos] || 0;
    const x = hz === 'left' ? frame.x0 + inset : hz === 'right' ? frame.x1 - inset - item.w : frame.x0 + (frame.w - item.w) / 2;
    const y = v === 'top' ? frame.y0 + inset + off : frame.y1 - inset - item.h - off;
    stack[pos] = off + item.h + 8;
    placed.push({ item, x, y });
  }
  const boxes = placed.map(({ item, x, y }) => [x - 3, y - 3, x + item.w + 3, y + item.h + 3]);

  return {
    boxes,
    draw(g) {
      drawBorder(g, project, theme, frame, projection);
      for (const { item, x, y } of placed) item.draw(g.append('g'), x, y);
      if (f.credits) drawCredits(g, project, theme, frame, W, H, catalog, layers);
    },
  };
}

function drawBorder(g, project, theme, frame, projection) {
  const style = project.furniture.border || 'double';
  if (style !== 'none') {
    g.append('rect').attr('x', frame.x0).attr('y', frame.y0).attr('width', frame.w).attr('height', frame.h).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', style === 'double' ? 0.6 : 0.9);
    if (style === 'double') g.append('rect').attr('x', frame.x0 - 5).attr('y', frame.y0 - 5).attr('width', frame.w + 10).attr('height', frame.h + 10).attr('fill', 'none').attr('stroke', theme.ink).attr('stroke-width', 1.8);
  }
  if (project.furniture.graticule && project.furniture.graticule !== 'none') drawGraticule(g, project, theme, frame, projection);
}

function dms(v, step) {
  // Whole seconds of arc, then shown to the precision the step needs.
  let sec = Math.round(Math.abs(v) * 3600);
  const d = Math.floor(sec / 3600);
  sec -= d * 3600;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (step >= 1) return `${d}°`;
  if (step >= 1 / 60) return `${d}°${String(m).padStart(2, '0')}′`;
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
}

function drawGraticule(g, project, theme, frame, projection) {
  const span = Math.abs(projection.invert([frame.x1, frame.y0 + frame.h / 2])[0] - projection.invert([frame.x0, frame.y0 + frame.h / 2])[0]);
  const steps = [5, 2, 1, 0.5, 0.25, 10 / 60, 5 / 60, 2 / 60, 1 / 60, 0.5 / 60];
  const step = steps.find((s) => span / s >= 3) || steps[steps.length - 1];
  const gg = g.append('g');
  if (project.furniture.graticule === 'lines') {
    const grat = d3.geoGraticule().step([step, step]).extentMajor([[-180, -80], [180, 80]]).precision(step / 10);
    gg.append('path').attr('d', d3.geoPath(projection)(grat())).attr('fill', 'none').attr('stroke', theme.inkSoft).attr('stroke-width', 0.3).attr('stroke-dasharray', '1 2');
  }
  // Ticks and figures where meridians and parallels meet the neatline.
  const edge = (fixed, from, to, horizontal, coord) => {
    const out = [];
    let prev = null;
    for (let t = from; t <= to; t += 2) {
      const ll = projection.invert(horizontal ? [t, fixed] : [fixed, t]);
      if (!ll) continue;
      const v = ll[coord] / step;
      if (prev && Math.floor(prev.v) !== Math.floor(v)) {
        const k = Math.max(Math.floor(prev.v), Math.floor(v));
        const pos = prev.t + ((k - prev.v) / (v - prev.v)) * (t - prev.t);
        out.push({ pos, value: k * step });
      }
      prev = { t, v };
    }
    return out;
  };
  const tick = 5;
  for (const [y, dir] of [[frame.y0, 1], [frame.y1, -1]]) {
    for (const { pos, value } of edge(y, frame.x0, frame.x1, true, 0)) {
      gg.append('line').attr('x1', pos).attr('x2', pos).attr('y1', y).attr('y2', y + dir * tick).attr('stroke', theme.ink).attr('stroke-width', 0.5);
      text(gg, dms(value, step), S.grat, theme, { x: pos, y: dir > 0 ? y - 9 : y + 15, 'text-anchor': 'middle' });
    }
  }
  for (const [x, dir] of [[frame.x0, 1], [frame.x1, -1]]) {
    for (const { pos, value } of edge(x, frame.y0, frame.y1, false, 1)) {
      gg.append('line').attr('y1', pos).attr('y2', pos).attr('x1', x).attr('x2', x + dir * tick).attr('stroke', theme.ink).attr('stroke-width', 0.5);
      const tx = dir > 0 ? x - 12 : x + 12;
      text(gg, dms(value, step), S.grat, theme, { x: tx, y: pos, 'text-anchor': 'middle', transform: `rotate(${dir > 0 ? -90 : 90},${tx},${pos})` });
    }
  }
}

function drawCredits(g, project, theme, frame, W, H, catalog, layers) {
  const attrs = [...new Set(layers.map((l) => l.attribution).filter(Boolean))];
  const str = project.credits || `Drawn for Old Gods of Atlanta. ${attrs.join('; ')}${attrs.length ? '.' : ''}`;
  const room = H - frame.y1;
  if (room < 12) return;
  // Wrap to the frame's width.
  const words = str.split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (measure(next, S.credits).w > frame.w && lines[lines.length - 1]) lines.push(w);
    else lines[lines.length - 1] = next;
  }
  const lh = S.credits.size * PT * 1.25;
  // Below the graticule figures, if there are any.
  const top = frame.y1 + (project.furniture.graticule && project.furniture.graticule !== 'none' ? 22 : 12);
  const y0 = Math.max(top, frame.y1 + Math.min(room / 2, 18) - ((lines.length - 1) * lh) / 2 + 2);
  lines.forEach((l, i) => text(g, l, S.credits, theme, { x: W / 2, y: y0 + i * lh, 'text-anchor': 'middle' }));
}
