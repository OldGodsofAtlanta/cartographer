// Things drawn by hand on one map: labels, markers with a name beside them, and lines or areas
// (a lot, a route, a burned district). Stored in the project as lon/lat so they survive re-framing.

/* global d3 */

import { measure, styledText, PT } from './labels.js';
import { star } from './render.js';
import { ANN_STYLES, SYMBOLS, SHAPE_STYLES } from './project.js';

export { ANN_STYLES, SYMBOLS, SHAPE_STYLES };

export function annStyle(a) {
  const base = ANN_STYLES[a.style] || ANN_STYLES.place;
  return { ...base, ...(a.size ? { size: a.size } : {}), ...(a.color ? { color: a.color } : {}) };
}

function colourOf(theme, key) {
  return theme[key] || key || theme.ink;
}

function lines(a, s) {
  return String(a.text || '')
    .split('\n')
    .map((l) => styledText(l, s));
}

// The box each label covers, so automatic lettering stays clear of it.
export function annotationBoxes(project, projection) {
  const out = [];
  for (const a of project.annotations || []) {
    if (a.type === 'shape') continue;
    const xy = projection(a.lonlat);
    if (!xy) continue;
    const s = annStyle(a);
    const ls = lines(a, s);
    const w = Math.max(0, ...ls.map((l) => measure(l, s).w));
    const lh = s.size * PT * 1.15;
    const h = ls.length * lh;
    const r = a.type === 'marker' && a.symbol !== 'none' ? 4 : 0;
    const x0 = a.type === 'marker' ? xy[0] - r : xy[0] - w / 2;
    const x1 = a.type === 'marker' ? xy[0] + r + 3 + w : xy[0] + w / 2;
    out.push([x0 - 2, xy[1] - h / 2 - 2, x1 + 2, xy[1] + h / 2 + 2]);
  }
  return out;
}

function symbol(g, kind, x, y, theme, colour) {
  const c = colourOf(theme, colour);
  switch (kind) {
    case 'dot':
      return g.append('circle').attr('cx', x).attr('cy', y).attr('r', 1.8).attr('fill', c);
    case 'ring':
      g.append('circle').attr('cx', x).attr('cy', y).attr('r', 2.6).attr('fill', theme.paper).attr('stroke', c).attr('stroke-width', 0.8);
      return g.append('circle').attr('cx', x).attr('cy', y).attr('r', 0.9).attr('fill', c);
    case 'star':
      return g.append('path').attr('d', star(x, y, 3.6, 1.5)).attr('fill', c);
    case 'cross':
      return g.append('path').attr('d', `M${x},${y - 3.6}V${y + 3.6}M${x - 2.4},${y - 1.2}H${x + 2.4}`).attr('stroke', c).attr('stroke-width', 0.9);
    case 'square':
      return g.append('rect').attr('x', x - 2.4).attr('y', y - 2.4).attr('width', 4.8).attr('height', 4.8).attr('fill', c);
    case 'triangle':
      return g.append('path').attr('d', `M${x},${y - 3.2}L${x + 2.9},${y + 2}L${x - 2.9},${y + 2}Z`).attr('fill', c);
    default:
      return null;
  }
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

export function shapeGeometry(a) {
  const pts = a.points || [];
  if (a.shapeStyle === 'line' || !a.closed) return { type: 'LineString', coordinates: pts };
  const ring = [...pts, pts[0]];
  if (signedArea(ring) > 0) ring.reverse(); // d3 wants exterior rings clockwise
  return { type: 'Polygon', coordinates: [ring] };
}

export function drawAnnotations(g, project, theme, projection, selected = null) {
  const path = d3.geoPath(projection);
  for (const a of project.annotations || []) {
    const ag = g.append('g').attr('class', 'ann').attr('data-ann', a.id);
    if (a.type === 'shape') {
      if ((a.points || []).length < 2) continue;
      const geo = shapeGeometry(a);
      const c = colourOf(theme, a.color || (a.shapeStyle === 'dashed' || a.shapeStyle === 'tint' ? 'annotation' : 'ink'));
      const p = ag.append('path').attr('d', path(geo)).attr('stroke', c).attr('stroke-linejoin', 'round');
      const st = geo.type === 'LineString' ? 'line' : a.shapeStyle;
      if (st === 'hatch') p.attr('fill', 'url(#p-hatch)').attr('stroke-width', 0.7);
      else if (st === 'tint') p.attr('fill', c).attr('fill-opacity', 0.22).attr('stroke-width', 0.9);
      else if (st === 'dashed') p.attr('fill', 'none').attr('stroke-width', 1).attr('stroke-dasharray', '4 2');
      else if (st === 'line') p.attr('fill', 'none').attr('stroke-width', a.width || 1.2).attr('stroke-dasharray', a.dash ? '5 2.5' : null);
      else p.attr('fill', 'none').attr('stroke-width', 0.9);
      // A transparent fat stroke makes thin shapes easy to click.
      ag.append('path').attr('class', 'ui-hit').attr('d', path(geo)).attr('fill', geo.type === 'Polygon' ? 'transparent' : 'none').attr('stroke', 'transparent').attr('stroke-width', 8);
      continue;
    }
    const xy = projection(a.lonlat);
    if (!xy) continue;
    const [x, y] = xy;
    const s = annStyle(a);
    const ls = lines(a, s);
    const lh = s.size * PT * 1.15;
    const px = s.size * PT;
    const marker = a.type === 'marker' && a.symbol && a.symbol !== 'none';
    if (marker) symbol(ag, a.symbol, x, y, theme, a.symbolColor || 'ink');
    const tx = a.type === 'marker' ? x + (marker ? 6 : 0) : x;
    const anchor = a.type === 'marker' ? 'start' : 'middle';
    const t = ag
      .append('text')
      .attr('font-family', s.font)
      .attr('font-size', px.toFixed(2))
      .attr('fill', colourOf(theme, s.color))
      .attr('text-anchor', anchor)
      .attr('transform', a.rotate ? `rotate(${a.rotate},${x},${y})` : null);
    if (s.italic) t.attr('font-style', 'italic');
    if (s.weight && s.weight !== 400) t.attr('font-weight', s.weight);
    if (s.spacing) t.attr('letter-spacing', (s.spacing * px).toFixed(2));
    const top = y - ((ls.length - 1) * lh) / 2 + px * 0.33;
    ls.forEach((l, i) => t.append('tspan').attr('x', tx).attr('y', (top + i * lh).toFixed(2)).text(l));
    if (a.halo) t.attr('stroke', theme.paper).attr('stroke-width', 1.8).attr('paint-order', 'stroke').attr('stroke-linejoin', 'round');
  }
  if (selected) g.selectAll(`.ann[data-ann="${selected}"]`).classed('selected', true);
}
