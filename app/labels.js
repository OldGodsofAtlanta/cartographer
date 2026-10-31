// Label placement. Labels are placed greedily in priority order; anything that would overprint an
// earlier label, a symbol, or the map furniture is dropped, the way a draughtsman would leave it off.

const PT = 96 / 72;
const measureCtx = document.createElement('canvas').getContext('2d');

// A label style: { font, weight, italic, size (pt), upper, spacing (em), color }
export function fontString(s, px) {
  return `${s.italic ? 'italic ' : ''}${s.weight || 400} ${px}px "${s.font}"`;
}

export function styledText(text, s) {
  return s.upper ? text.toUpperCase() : text;
}

export function measure(text, s) {
  const px = s.size * PT;
  measureCtx.font = fontString(s, px);
  const w = measureCtx.measureText(text).width + (s.spacing || 0) * px * Math.max(0, text.length - 1);
  return { w, h: px, px };
}

export class Collider {
  constructor(width, height, cell = 48) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell) + 1;
    this.grid = new Map();
    this.width = width;
    this.height = height;
  }
  *cells(b) {
    const c = this.cell;
    for (let x = Math.floor(b[0] / c); x <= Math.floor(b[2] / c); x++)
      for (let y = Math.floor(b[1] / c); y <= Math.floor(b[3] / c); y++) yield `${x},${y}`;
  }
  hits(b) {
    for (const k of this.cells(b)) {
      const list = this.grid.get(k);
      if (!list) continue;
      for (const o of list) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true;
    }
    return false;
  }
  add(b) {
    for (const k of this.cells(b)) {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(b);
    }
  }
}

function inFrame(b, frame) {
  return b[0] >= frame.x0 && b[1] >= frame.y0 && b[2] <= frame.x1 && b[3] <= frame.y1;
}

// ── Point labels ────────────────────────────────────────────────────────────

const POINT_SLOTS = [
  [1, 0],
  [-1, 0],
  [1, -1],
  [1, 1],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
];

// Returns {x, y, anchor, box} or null. (x, y) is the text's baseline-left/right/middle point.
export function placePoint(x, y, r, text, s, collider, frame) {
  const { w, h } = measure(text, s);
  const gap = Math.max(1.5, r * 0.6);
  for (const [dx, dy] of POINT_SLOTS) {
    let bx;
    let by;
    if (dx > 0) bx = x + r + gap;
    else if (dx < 0) bx = x - r - gap - w;
    else bx = x - w / 2;
    if (dy < 0) by = y - r - gap - h * 0.8;
    else if (dy > 0) by = y + r + gap;
    else by = y - h * 0.42;
    if (dx !== 0 && dy !== 0) by = dy < 0 ? y - r - h * 0.75 : y + r - h * 0.05;
    const box = [bx, by, bx + w, by + h * 0.85];
    if (!inFrame(box, frame) || collider.hits(box)) continue;
    collider.add(box);
    return { x: bx, y: by + h * 0.7, anchor: 'start', box };
  }
  return null;
}

// ── Area labels ─────────────────────────────────────────────────────────────

export function placeArea(cx, cy, maxW, text, s, collider, frame) {
  const { w, h } = measure(text, s);
  if (w > maxW) return null;
  const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
  if (!inFrame(box, frame) || collider.hits(box)) return null;
  collider.add(box);
  return { x: cx, y: cy + h * 0.32, anchor: 'middle', box };
}

// ── Line labels ─────────────────────────────────────────────────────────────

function cumulative(line) {
  const d = [0];
  for (let i = 1; i < line.length; i++) d.push(d[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return d;
}

function pointAt(line, cum, t) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const k = Math.max(0, Math.min(1, (t - cum[i - 1]) / seg));
  return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * k, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * k];
}

function slice(line, cum, a, b, step) {
  const pts = [];
  for (let t = a; t < b; t += step) pts.push(pointAt(line, cum, t));
  pts.push(pointAt(line, cum, b));
  return pts;
}

// Joins polylines whose ends meet (within tol px), so a street split into many OSM ways labels as one.
export function chain(lines, tol = 0.75) {
  const pool = lines.filter((l) => l.length > 1).map((l) => l.slice());
  const near = (a, b) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
  const out = [];
  while (pool.length) {
    let cur = pool.pop();
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        const head = cur[0];
        const tail = cur[cur.length - 1];
        if (near(tail, l[0])) cur = cur.concat(l.slice(1));
        else if (near(tail, l[l.length - 1])) cur = cur.concat(l.slice(0, -1).reverse());
        else if (near(head, l[l.length - 1])) cur = l.concat(cur.slice(1));
        else if (near(head, l[0])) cur = l.slice().reverse().concat(cur.slice(1));
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

// Places one or more labels along a polyline. Returns [{d, box[]}] (path data reading left to right).
export function placeLine(line, text, s, collider, frame, opts = {}) {
  const { w, px } = measure(text, s);
  const cum = cumulative(line);
  const L = cum[cum.length - 1];
  const pad = px * 0.6;
  const need = w + 2 * pad;
  if (L < need) return [];
  const repeat = opts.repeat || Infinity;
  const centres = [];
  const count = Number.isFinite(repeat) ? Math.max(1, Math.floor(L / repeat)) : 1;
  for (let i = 0; i < count; i++) {
    const base = (L * (i + 0.5)) / count;
    centres.push([base, base - L / (count * 5), base + L / (count * 5), base - L / (count * 2.6), base + L / (count * 2.6)]);
  }
  const placed = [];
  for (const group of centres) {
    for (const c of group) {
      const a = c - need / 2;
      const b = c + need / 2;
      if (a < 0 || b > L) continue;
      let pts = slice(line, cum, a, b, Math.max(2, px * (opts.step || 0.5)));
      // Follow the line's general course, not every wiggle in it.
      for (let k = 0; k < (opts.smooth || 0); k++) pts = smoothed(pts);
      // Too bendy to read: the chord must be most of the arc, and no sharp turns.
      const chord = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
      if (chord < need * (opts.straightness || 0.88)) continue;
      let sharp = false;
      for (let i = 2; i < pts.length; i++) {
        const a1 = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]);
        const a2 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
        let da = Math.abs(a2 - a1);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (da > (opts.maxTurn || 0.5)) sharp = true;
      }
      if (sharp) continue;
      const half = px * 0.62;
      const boxes = pts
        .filter((_, i) => i % 2 === 0 || i === pts.length - 1)
        .map(([x, y]) => [x - half, y - half + (opts.offset || 0), x + half, y + half + (opts.offset || 0)]);
      if (boxes.some((bx) => !inFrame(bx, frame) || collider.hits(bx))) continue;
      boxes.forEach((bx) => collider.add(bx));
      const ordered = pts[0][0] > pts[pts.length - 1][0] ? pts.slice().reverse() : pts;
      placed.push({ d: smoothPath(ordered), boxes });
      break;
    }
  }
  return placed;
}

// One pass of a [1 2 1] moving average, ends fixed.
function smoothed(pts) {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
}

// A gently smoothed path through the points, so lettering doesn't kink at every vertex.
function smoothPath(pts) {
  if (pts.length < 3) return `M${pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join('L')}`;
  const sm = pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
  return `M${sm.map((p) => p.map((v) => v.toFixed(2)).join(',')).join('L')}`;
}

export { PT };
