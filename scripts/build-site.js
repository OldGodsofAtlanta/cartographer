// Stages the static site for GitHub Pages into _site/: the editor, its data, backdrop scans, fonts and saved
// maps. Reads only what this repo holds, so it runs in the deploy workflow after scripts/fetch-data.sh.
//
//   node scripts/build-site.js        then serve _site/ with any static server
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'projects'), { recursive: true });

for (const path of ['index.html', 'app', 'backdrops', 'fonts', 'data']) {
  await cp(join(ROOT, path), join(OUT, path), { recursive: true });
}

// Only the saved maps, not the folder's other files. The list is what the server's /api/projects returns.
const names = (await readdir(join(ROOT, 'projects')))
  .filter((f) => f.endsWith('.json'))
  .sort();
for (const f of names) await cp(join(ROOT, 'projects', f), join(OUT, 'projects', f));
await writeFile(join(OUT, 'data/projects.json'), JSON.stringify(names.map((f) => f.replace(/\.json$/, '')), null, 2) + '\n');

console.log(`_site: ${names.length} saved maps, editor, data, backdrops and fonts`);
