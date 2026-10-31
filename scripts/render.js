// Renders a saved map without opening the editor, using the book's Playwright.
//
//   node scripts/render.js <project> [--out file] [--type png|jpg|svg] [--dpi 300] [--year 1941]
//   node scripts/render.js <project> --screenshot editor.png     (the whole editor, for checking)
//
// <project> is a name in projects/ (without .json). --year renders the same map in another year.
// Set CHROMIUM_PATH to use an installed Chrome or Chromium.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../lib/headless.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const name = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!name) {
  console.error('Usage: node scripts/render.js <project> [--out file] [--type png|jpg|svg] [--dpi 300] [--year Y] [--screenshot file]');
  process.exit(2);
}
const type = opt('type', 'png');
const year = opt('year');
const shot = opt('screenshot');

const project = JSON.parse(await readFile(join(HERE, '..', 'projects', `${name}.json`), 'utf8'));
if (year) {
  if (project.dateline == null || project.dateline === String(project.year)) project.dateline = String(year);
  project.year = Number(year);
}

const renderer = new Renderer({ editor: !!shot });
try {
  const r = await renderer.render(project, shot ? [] : [{ type, dpi: opt('dpi') ? Number(opt('dpi')) : undefined }]);
  for (const w of r.warnings) console.error('page:', w);
  if (shot) {
    await renderer.screenshot(shot);
    console.log(`Wrote ${shot}`);
  } else {
    const out = resolve(opt('out', join(HERE, '..', 'exports', `${name}${year ? `-${year}` : ''}.${type}`)));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, r.files[0]);
    console.log(`Wrote ${out}`);
    console.log('Features drawn:', JSON.stringify(r.stats));
  }
} finally {
  await renderer.close();
}
