// The adventures the editor offers as chapter presets: id, title, era (year), dates, read from the book's
// book.yml and each adventure's _chapter.yml. `root` is the book's folder (the one with book.yml and chapters/).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function chapterList(root) {
  const book = await readFile(join(root, 'book.yml'), 'utf8');
  const ids = [...book.matchAll(/^\s+- id:\s*(\S+)/gm)].map((m) => m[1]);
  const out = [];
  for (const id of ids) {
    const file = join(root, 'chapters', id, '_chapter.yml');
    if (!existsSync(file)) continue;
    const y = await readFile(file, 'utf8');
    const field = (k) => (y.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.replace(/\s+#.*$/, '').trim();
    const kind = field('kind');
    if (kind !== 'adventure') continue;
    out.push({ id, title: field('title'), era: Number(field('era')) || null, dates: field('dates') || '' });
  }
  return out;
}
