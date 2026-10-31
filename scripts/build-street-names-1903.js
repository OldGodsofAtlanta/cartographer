// Parses sources/street-names-1903.txt (the 1903 Atlanta Constitution list) into data/street-names-1903.json and
// reports how it lines up with the street layers.   node scripts/build-street-names-1903.js
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORD = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th', eleventh: '11th', twelfth: '12th', thirteenth: '13th', fourteenth: '14th' };
const norm = (s) => s.toLowerCase().replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth)\b/g, (m) => ORD[m]).replace(/[’']/g, "'").replace(/\b(street|streets|st|avenue|ave|av|road|rd|alley|aly|place|pl|terrace|ter|square|sq|drive|dr|lane|ln|circle|cir|court|ct|way|blvd)\b/g, '').replace(/\s+(ne|nw|se|sw)$/, '').replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
const kindOf = (s) => (s.match(/\b(street|avenue|road|alley|place|terrace|square)s?\b/i) || [])[1]?.toLowerCase() || null;

const entries = [];
for (const line of (await readFile(join(ROOT, 'sources/street-names-1903.txt'), 'utf8')).split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [now, rest] = line.split(' | ');
  const note = (rest.match(/\?\s*(\(.*\))?$/) || [])[0] ? rest.replace(/^.*?\?\s*/, '').replace(/^\((.*)\)$/, '$1') || 'reading uncertain' : null;
  const former = rest.replace(/\s*\?.*$/, '').split(/;\s*/).map((x) => x.trim()).filter((x) => x && x !== '?');
  entries.push({ name_1903: now.trim(), former, ...(note ? { transcription_note: note } : {}) });
}
await writeFile(join(ROOT, 'data/street-names-1903.json'), JSON.stringify({
  about: "Streets whose names had changed by Oct. 17, 1903, from a list Forrest Adair gave Atlanta's council street committee: 'about 225' streets, each with the name it carried on that date and the names it formerly had. Source: 'Many Streets Get New Names,' Atlanta Constitution, Oct. 17, 1903, p. unknown (a scan supplied by the user; the newspaper is public domain). No change is dated: each entry says only that the former names were out of use by Oct. 1903. Most streets list several former names with no order. A street's name in 1903 was the current one, but the same name may appear twice for different stretches (Smith, Hunter, North, Peachtree, Edgewood, Auburn, Bell). Transcribed by eye; see transcription_note.",
  source: 'Atlanta Constitution, 1903-10-17', transcribed: '2026-10-28', entries,
}, null, 1));
console.log(entries.length, 'entries,', entries.reduce((n, e) => n + e.former.length, 0), 'former names');

// ── against the layers ──
const layers = {};
for (const y of ['1878', '1911', '1928']) layers[y] = JSON.parse(await readFile(join(ROOT, `data/atlanta-streets-${y}.geojson`), 'utf8')).features;
const names = (y) => new Set(layers[y].map((f) => norm(f.properties.name || '')).filter(Boolean));
const N = { 1878: names('1878'), 1911: names('1911'), 1928: names('1928') };
let nowIn = { 1878: 0, 1911: 0, 1928: 0 };
const nowMissing1928 = [];
for (const e of entries) {
  const n = norm(e.name_1903);
  for (const y of Object.keys(N)) if (N[y].has(n)) nowIn[y]++;
  if (!N['1928'].has(n)) nowMissing1928.push(e.name_1903);
}
console.log('entries whose 1903 name is in the layer:', nowIn, 'of', entries.length);
console.log('1903 names NOT in the 1928 layer (', nowMissing1928.length, '):', nowMissing1928.join('; '));
const fm = [];
for (const e of entries) for (const f of e.former) { const n = norm(f); if (n && N['1928'].has(n) && n !== norm(e.name_1903)) fm.push(`${f} (former of ${e.name_1903})`); }
console.log('former names that ARE a 1928 layer street name (', fm.length, '):', fm.join('; '));

// ── attach to the layers ──
// A feature gets `former_names_1903` when its name matches an entry's 1903 name and the two are the same kind of
// way. A name listed twice (Smith, Hunter, North, Peachtree, Edgewood, Auburn, Bell) merges its lists and sets
// `former_names_ambiguous`: the article lists different stretches separately and we can't tell which is which.
const cls = (s) => (/\b(alley|aly)\b/i.test(s) ? 'alley' : /\b(place|pl|terrace|ter|square|sq|court|ct|circle|cir)\b/i.test(s) ? 'place' : 'way');
const byName = new Map();
for (const e of entries) {
  const k = `${norm(e.name_1903)}|${cls(e.name_1903)}`;
  const cur = byName.get(k) || { former: [], n: 0 };
  cur.former.push(...e.former.filter((f) => !cur.former.includes(f)));
  cur.n++;
  byName.set(k, cur);
}
for (const y of ['1878', '1911', '1928']) {
  let n = 0;
  for (const f of layers[y]) {
    delete f.properties.former_names_1903;
    delete f.properties.former_names_ambiguous;
    const hit = byName.get(`${norm(f.properties.name || '')}|${cls(f.properties.name || '')}`);
    if (!hit) continue;
    f.properties.former_names_1903 = hit.former;
    if (hit.n > 1) f.properties.former_names_ambiguous = true;
    n++;
  }
  await writeFile(join(ROOT, `data/atlanta-streets-${y}.geojson`), JSON.stringify({ type: 'FeatureCollection', features: layers[y] }));
  console.log(`atlanta-streets-${y}: ${n} of ${layers[y].length} features carry former_names_1903`);
}
