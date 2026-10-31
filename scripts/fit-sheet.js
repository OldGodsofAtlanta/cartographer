// Fits a sheet from control points and prints the residuals, scale and rotation. Usage:
//   node scripts/fit-sheet.js points.json     ([{n, px:[x,y], lonlat:[lon,lat]}, …])
import { readFile } from 'node:fs/promises';
import { georeference } from '../app/georef.js';
const pts = JSON.parse(await readFile(process.argv[2], 'utf8'));
const G = georeference(pts);
console.log('rms', G.rmsM, 'm   m/px', G.metresPerPixel.join(' / '), '  image-up bearing', ((Math.atan2(G.transform[2], -G.transform[3]) * 180) / Math.PI).toFixed(1), 'deg');
pts.forEach((p, i) => console.log(' ', (p.n || i).toString().padEnd(26), G.residualsM[i], 'm'));
