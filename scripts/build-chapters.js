// Writes data/chapters.json, the chapter presets the editor offers, from the book's folder. The Pages build
// has no book beside it, so this runs here (where the book is) and the file is committed.
//
//   node scripts/build-chapters.js [book folder]     default: the folder beside this repo, as server.js uses
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapterList } from '../lib/chapters.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] || join(HERE, '../..'));
const out = join(HERE, '../data/chapters.json');

const list = await chapterList(root);
await writeFile(out, JSON.stringify(list, null, 2) + '\n');
console.log(`${list.length} chapters from ${root} -> ${out}`);
