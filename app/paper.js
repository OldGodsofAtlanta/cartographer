// The sheet's age: grain, mottled toning, browned edges, foxing spots, and ink that has spread into
// the fibres. All of it is SVG (filters and gradients), so it survives export at any resolution.

/* global d3 */

// A small seeded random generator, so a map's foxing lands in the same places every render.
export function rng(seed) {
  let h = 2166136261 >>> 0;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

// Defines filters and gradients in <defs>. Returns nothing; overlays reference them by id.
export function paperDefs(defs, theme, seed) {
  const e = theme.effects;
  const stain = theme.paper === '#1d4a78' ? [0.05, 0.12, 0.25] : [0.42, 0.29, 0.12];

  // Fine grain: high-frequency noise turned into flecks of brown.
  const grain = defs.append('filter').attr('id', 'f-grain').attr('x', 0).attr('y', 0).attr('width', '100%').attr('height', '100%');
  grain.append('feTurbulence').attr('type', 'fractalNoise').attr('baseFrequency', 0.85).attr('numOctaves', 2).attr('seed', seed % 97);
  grain
    .append('feColorMatrix')
    .attr('type', 'matrix')
    .attr('values', `0 0 0 0 ${stain[0]}  0 0 0 0 ${stain[1]}  0 0 0 0 ${stain[2]}  ${-2.2 * e.grain} 0 0 0 ${1.1 * e.grain}`);

  // Mottling: big soft blotches where the paper has yellowed unevenly.
  const mottle = defs.append('filter').attr('id', 'f-mottle').attr('x', 0).attr('y', 0).attr('width', '100%').attr('height', '100%');
  mottle.append('feTurbulence').attr('type', 'fractalNoise').attr('baseFrequency', 0.0045).attr('numOctaves', 4).attr('seed', (seed * 7) % 89);
  mottle
    .append('feColorMatrix')
    .attr('type', 'matrix')
    .attr('values', `0 0 0 0 ${stain[0]}  0 0 0 0 ${stain[1]}  0 0 0 0 ${stain[2]}  ${1.4 * e.age} 0 0 0 ${-0.55 * e.age}`);

  // Browned edges.
  const tone = defs.append('radialGradient').attr('id', 'g-tone').attr('cx', '50%').attr('cy', '48%').attr('r', '75%');
  const [r, g, b] = stain.map((v) => Math.round(v * 255));
  tone.append('stop').attr('offset', '55%').attr('stop-color', `rgb(${r},${g},${b})`).attr('stop-opacity', 0);
  tone.append('stop').attr('offset', '85%').attr('stop-color', `rgb(${r},${g},${b})`).attr('stop-opacity', 0.18 * e.age);
  tone.append('stop').attr('offset', '100%').attr('stop-color', `rgb(${r},${g},${b})`).attr('stop-opacity', 0.5 * e.age);

  // A foxing spot: darker at the heart, ragged at the rim.
  const fox = defs.append('radialGradient').attr('id', 'g-fox');
  fox.append('stop').attr('offset', '0%').attr('stop-color', `rgb(${r - 20},${g - 20},${b - 10})`).attr('stop-opacity', 0.55);
  fox.append('stop').attr('offset', '45%').attr('stop-color', `rgb(${r},${g},${b})`).attr('stop-opacity', 0.25);
  fox.append('stop').attr('offset', '100%').attr('stop-color', `rgb(${r},${g},${b})`).attr('stop-opacity', 0);
  const foxEdge = defs.append('filter').attr('id', 'f-fox');
  foxEdge.append('feTurbulence').attr('type', 'fractalNoise').attr('baseFrequency', 0.25).attr('numOctaves', 2).attr('result', 'n');
  foxEdge.append('feDisplacementMap').attr('in', 'SourceGraphic').attr('in2', 'n').attr('scale', 6);

  // Ink spread: lines and letters roughened by a fraction of a pixel and softened.
  const ink = defs.append('filter').attr('id', 'f-ink').attr('x', '-1%').attr('y', '-1%').attr('width', '102%').attr('height', '102%');
  ink.append('feTurbulence').attr('type', 'fractalNoise').attr('baseFrequency', 0.7).attr('numOctaves', 1).attr('seed', seed % 13).attr('result', 'n');
  ink.append('feDisplacementMap').attr('in', 'SourceGraphic').attr('in2', 'n').attr('scale', (1.1 * e.inkBleed).toFixed(2)).attr('xChannelSelector', 'R').attr('yChannelSelector', 'G').attr('result', 'd');
  ink.append('feGaussianBlur').attr('in', 'd').attr('stdDeviation', (0.18 * e.inkBleed).toFixed(2));

  // Hatching for drawn areas.
  const hatch = defs.append('pattern').attr('id', 'p-hatch').attr('patternUnits', 'userSpaceOnUse').attr('width', 4).attr('height', 4).attr('patternTransform', 'rotate(45)');
  hatch.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 4).attr('stroke', theme.ink).attr('stroke-width', 0.6);
}

// Overlays laid over the finished map (multiplied, so they darken paper and ink together).
export function paperOverlays(g, theme, W, H, seed) {
  const e = theme.effects;
  const layer = g.append('g').attr('class', 'paper-overlays').style('mix-blend-mode', theme.overlayBlend).attr('pointer-events', 'none');
  if (e.age > 0) {
    layer.append('rect').attr('width', W).attr('height', H).attr('filter', 'url(#f-mottle)');
    layer.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#g-tone)');
  }
  if (e.grain > 0) layer.append('rect').attr('width', W).attr('height', H).attr('filter', 'url(#f-grain)').attr('opacity', 0.9);
  if (e.foxing > 0) {
    const rand = rng(`fox-${seed}`);
    const n = Math.round(6 + 34 * e.foxing);
    const spots = layer.append('g').attr('filter', 'url(#f-fox)');
    for (let i = 0; i < n; i++) {
      // Foxing gathers toward the edges.
      const edge = rand() < 0.6;
      let x = rand() * W;
      let y = rand() * H;
      if (edge) {
        if (rand() < 0.5) x = rand() < 0.5 ? rand() * W * 0.12 : W - rand() * W * 0.12;
        else y = rand() < 0.5 ? rand() * H * 0.12 : H - rand() * H * 0.12;
      }
      const r = 1.5 + rand() ** 3 * 9;
      spots.append('circle').attr('cx', x).attr('cy', y).attr('r', r).attr('fill', 'url(#g-fox)').attr('opacity', 0.5 + 0.5 * e.foxing);
    }
  }
  if (e.folds > 0) {
    // The sheet was folded in half each way: a pale crease with a shadow on one side.
    const folds = layer.append('g').attr('opacity', e.folds);
    folds.append('line').attr('x1', W / 2).attr('x2', W / 2).attr('y1', 0).attr('y2', H).attr('stroke', '#5a4128').attr('stroke-width', 2.5).attr('opacity', 0.18);
    folds.append('line').attr('x1', W / 2 + 1.2).attr('x2', W / 2 + 1.2).attr('y1', 0).attr('y2', H).attr('stroke', '#fff8e4').attr('stroke-width', 0.8).attr('opacity', 0.5);
    folds.append('line').attr('y1', H / 2).attr('y2', H / 2).attr('x1', 0).attr('x2', W).attr('stroke', '#5a4128').attr('stroke-width', 2.5).attr('opacity', 0.18);
    folds.append('line').attr('y1', H / 2 + 1.2).attr('y2', H / 2 + 1.2).attr('x1', 0).attr('x2', W).attr('stroke', '#fff8e4').attr('stroke-width', 0.8).attr('opacity', 0.5);
  }
}

export { hexToRgb };
