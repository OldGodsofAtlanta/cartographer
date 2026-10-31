// Renders a backdrop under thin street lines, framed to the sheet, so a georeference can be judged by eye.
//   node scripts/check-backdrop.js <backdrop id> [--out file] [--dpi 110] [--opacity 0.8] [--lakes]
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../lib/headless.js';
import { georeference } from '../app/georef.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const id = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const def = JSON.parse(await readFile(join(HERE, '..', 'data', 'backdrops.json'), 'utf8')).backdrops.find((b) => b.id === id);
if (!def) throw new Error(`No backdrop "${id}"`);
const G = georeference(def.points, def.fit);
const [w, h] = def.size;
const corners = [[0, 0], [w, 0], [0, h], [w, h]].map((c) => G.pixelToLonLat(c));
const lons = corners.map((c) => c[0]);
const lats = corners.map((c) => c[1]);
const center = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
const widthM = (Math.max(...lons) - Math.min(...lons)) * 92400;
const heightM = (Math.max(...lats) - Math.min(...lats)) * 110500;
const inches = 9;
const denominator = Math.ceil((Math.max(widthM, heightM) * 1.08) / (0.0254 * (inches - 0.6)));
const r = new Renderer();
try {
  const res = await r.render(
    {
      name: 'check', year: def.year, title: id, theme: 'atlas', style: { streetMode: 'single' }, view: { center, denominator, projection: 'local' },
      paper: { preset: 'custom', width: inches, height: inches, margin: 0.3 },
      backdrops: [{ id, opacity: Number(opt('opacity', 0.85)), guide: false }],
      layers: { 'atlanta-streets': { visible: false }, 'atlanta-streets-osm': { visible: true, labels: false, undated: true, anyScale: true }, 'railroads-atlanta': { visible: false }, 'waterways-atlanta': { visible: false }, lakes: { visible: args.includes('--lakes'), anyScale: true }, 'atlanta-limits': { visible: false }, 'terrain-city': { visible: false } },
      furniture: { title: { show: false }, legend: { show: false }, credits: false, compass: { show: false }, graticule: 'none', scalebar: { show: false } },
    },
    [{ type: 'png', dpi: Number(opt('dpi', 110)) }],
  );
  const out = resolve(opt('out', join(HERE, '..', 'exports', `check-${id}.png`)));
  await writeFile(out, res.files[0]);
  console.log(`rms ${G.rmsM} m  -> ${out}`, res.missing.length ? `missing: ${res.missing}` : '');
} finally {
  await r.close();
}
