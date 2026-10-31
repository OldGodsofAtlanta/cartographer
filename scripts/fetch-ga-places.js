// Builds data/ga-places.geojson (layer ga-places): Georgia cities and towns as points,
// with incorporation year and 1870-1940 census counts.
//
// Sources: US Census Gazetteer 2023 place file (coordinates, candidate list);
// Wikipedia (MediaWiki API) articles "<Name>, Georgia" (census template, infobox dates);
// Wikipedia "List of counties in Georgia" (county seats).
//
// Usage: node scripts/fetch-ga-places.js   (re-downloads only what is missing from sources/raw/ga-places/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'sources', 'raw', 'ga-places');
const OUT = join(ROOT, 'data', 'ga-places.geojson');
const UA = 'OldGodsCartographer/0.1 (aaboyles@gmail.com)';
const API = 'https://en.wikipedia.org/w/api.php';
const GAZ_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_gaz_place_13.txt';
const COUNTIES_PAGE = 'List_of_counties_in_Georgia';
const CENSUS_YEARS = [1870, 1880, 1890, 1900, 1910, 1920, 1930, 1940];
const POP_KEEP = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { warnings: [], missing: [], disambiguation: [] };
const warn = (msg) => { report.warnings.push(msg); console.warn('WARN', msg); };

async function download(url, file, isJson = false) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  mkdirSync(RAW, { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  writeFileSync(file, text);
  if (isJson) JSON.parse(text);
  await sleep(1000);
  return text;
}

// ---------- wikitext helpers ----------

// Returns the inner text of the template whose "{{" starts at index i.
function templateInner(text, i) {
  let depth = 0;
  for (let k = i; k < text.length; k++) {
    if (text.startsWith('{{', k)) { depth++; k++; }
    else if (text.startsWith('}}', k)) {
      depth--; k++;
      if (depth === 0) return text.slice(i + 2, k - 1);
    }
  }
  return null;
}

// Splits a template body on top-level "|" (ignores pipes inside {{ }} and [[ ]]).
function splitTop(body) {
  const parts = [];
  let depth = 0, cur = '';
  for (let k = 0; k < body.length; k++) {
    const two = body.slice(k, k + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; k++; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; k++; continue; }
    if (body[k] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += body[k];
  }
  parts.push(cur);
  return parts;
}

function namedParams(parts) {
  const out = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0 || /[[{]/.test(p.slice(0, eq))) continue;
    out[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
  }
  return out;
}

function findTemplates(text, nameRe) {
  const found = [];
  const re = /\{\{\s*([^|{}\n]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (!nameRe.test(m[1].trim())) continue;
    const inner = templateInner(text, m.index);
    if (inner !== null) found.push(inner);
  }
  return found;
}

// Strip refs, comments, nested templates, and link markup; keep visible text.
function plain(s) {
  let t = s.replace(/\{\{\s*(?:nobold|small|nowrap|nbsp|lang|nobr)\s*\|([^{}]*)\}\}/gi, '$1').replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  let prev;
  do { prev = t; t = t.replace(/\{\{[^{}]*\}\}/g, ''); } while (t !== prev);
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]+>/g, '');
  return t.replace(/'''?/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- extraction ----------

function parseCensus(text, title) {
  const pop = {};
  for (const inner of findTemplates(text, /^US Census population$/i)) {
    const params = namedParams(splitTop(inner));
    for (const y of CENSUS_YEARS) {
      const raw = params[String(y)];
      if (raw === undefined) continue;
      const v = plain(raw).replace(/\s/g, '');
      if (v === '') continue;
      if (!/^\d{1,3}(,?\d{3})*$|^\d+$/.test(v)) { warn(`${title}: census ${y} value "${raw}" not parsed`); continue; }
      pop[String(y)] = parseInt(v.replace(/,/g, ''), 10);
    }
  }
  return Object.keys(pop).length ? pop : null;
}

function parseStart(text, title) {
  const inner = findTemplates(text, /^Infobox\s+(settlement|city|town|populated[ _]place)$/i)[0];
  if (!inner) return { start: null, quality: 'unknown', source: 'no infobox in Wikipedia article' };
  const params = namedParams(splitTop(inner));
  const pairs = [];
  for (const key of Object.keys(params)) {
    const m = key.match(/^established_(title|date)(\d*)$/);
    if (!m || m[1] !== 'title') continue;
    const n = m[2];
    // Some infoboxes keep the label only in a comment (<!-- Incorporated (town) -->), so the label is read before comments are stripped.
    const label = plain((params[key] || '').replace(/<!--([\s\S]*?)-->/g, ' $1 '));
    const date = (params[`established_date${n}`] || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '');
    pairs.push({ title: label, date });
  }
  const tier = (t) => {
    if (/incorporat|charter|\bcity of\b|\btown of\b/i.test(t)) return 1;
    if (/establish/i.test(t)) return 2;
    if (/found|settl|laid out|platted/i.test(t)) return 3;
    return 9;
  };
  pairs.sort((a, b) => tier(a.title) - tier(b.title));
  for (const p of pairs) {
    const t = tier(p.title);
    if (t === 9) continue;
    const y = p.date.match(/\b(1[6-9]\d\d|20[0-2]\d)\b/);
    if (!y) { if (p.date) warn(`${title}: established "${p.title}" has no year ("${p.date}")`); continue; }
    if (t <= 2) return { start: +y[1], quality: 'documented', source: `Wikipedia infobox: ${title}`, label: p.title };
    return { start: +y[1], quality: 'approximate', source: `Wikipedia infobox (${p.title}): ${title}`, label: p.title };
  }
  return { start: null, quality: 'unknown', source: 'no incorporation date in Wikipedia infobox' };
}

// For the hand-listed suburbs and towns (no usable infobox date): an incorporation year stated in the article text.
function parseTextStart(text, title) {
  const m = plain(text).match(/incorporated (?:as (?:a |an )?(?:city|town|village) )?in (1[6-9]\d\d|20[0-2]\d)\b/i);
  return m ? { start: +m[1], quality: 'documented', source: `Wikipedia ${title} (article text: "incorporated ... in ${m[1]}")` } : null;
}

// First {{coord}} in the article, as [lat, lon].
function parseCoord(text) {
  const m = /\{\{\s*[Cc]oord\s*\|/.exec(text);
  if (!m) return null;
  const inner = templateInner(text, m.index);
  const toks = splitTop(inner).slice(1).filter((t) => !t.includes('=')).map((t) => t.trim());
  const groups = [];
  let nums = [];
  for (const t of toks) {
    if (/^[NSEW]$/.test(t)) {
      const v = nums.reduce((acc, x, i) => acc + x / 60 ** i, 0);
      groups.push(t === 'S' || t === 'W' ? -v : v);
      nums = [];
    } else if (/^-?\d+(\.\d+)?$/.test(t)) nums.push(Math.abs(+t) * (t.startsWith('-') ? -1 : 1));
    else nums = [];
  }
  if (groups.length >= 2) return [groups[0], groups[1]];
  const dec = toks.filter((t) => /^-?\d+(\.\d+)?$/.test(t));
  if (groups.length === 0 && dec.length >= 2) return [+dec[0], +dec[1]];
  return null;
}

function parseAnnex(text, title) {
  // Sentence about annexation by Atlanta with a year in 1870-1945.
  const body = plain(text);
  const sentences = body.split(/(?<=\.)\s+/).filter((s) => /annex/i.test(s) && /Atlanta/.test(s));
  // Prefer a year that follows "annex" in the same sentence, else any year in 1870-1945.
  for (const s of sentences) {
    const y = s.match(/annex\w*[^.]*?\b(18[7-9]\d|19\d\d)\b/i);
    if (y) return { year: +y[1], sentence: s.slice(0, 300) };
  }
  for (const s of sentences) {
    const y = s.match(/\b(18[7-9]\d|19[0-4]\d)\b/);
    if (y) return { year: +y[1], sentence: s.slice(0, 300) };
  }
  return sentences.length ? { year: null, sentence: sentences[0].slice(0, 300) } : null;
}

// ---------- Wikipedia fetch ----------

async function wikiBatch(titles, cacheName) {
  const file = join(RAW, cacheName);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `${API}?action=query&prop=revisions|coordinates&rvprop=content&rvslots=main&titles=${encodeURIComponent(titles.join('|'))}&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} wiki batch ${cacheName}`);
  const json = await res.json();
  writeFileSync(file, JSON.stringify(json));
  await sleep(1000);
  return json;
}

// Fetches article wikitext for each title. Returns Map requestedTitle -> {title, text} | null.
async function fetchArticles(titles, prefix) {
  const out = new Map();
  for (let b = 0; b < titles.length; b += 50) {
    const chunk = titles.slice(b, b + 50);
    const json = await wikiBatch(chunk, `${prefix}-${String(b / 50 + 1).padStart(2, '0')}.json`);
    const q = json.query || {};
    const link = new Map();
    for (const n of [...(q.normalized || []), ...(q.redirects || [])]) link.set(n.from, n.to);
    const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
    for (const t of chunk) {
      let final = t;
      const seen = new Set();
      while (link.has(final) && !seen.has(final)) { seen.add(final); final = link.get(final); }
      const p = byTitle.get(final);
      if (!p || p.missing) { out.set(t, null); report.missing.push(t); continue; }
      const text = p.revisions?.[0]?.slots?.main?.content ?? '';
      if (/\{\{\s*(Disambiguation|Hndis|Dab|Disambig)/i.test(text) || /may refer to/i.test(text.slice(0, 600))) {
        report.disambiguation.push(t);
        out.set(t, { title: p.title, text: '', disambig: true });
        continue;
      }
      out.set(t, { title: p.title, text });
    }
  }
  return out;
}

// ---------- candidates ----------

const ALIAS = {
  'Athens-Clarke County unified government (balance)': 'Athens',
  'Augusta-Richmond County consolidated government (balance)': 'Augusta',
  'Cusseta-Chattahoochee County unified government': 'Cusseta',
  'Echols County consolidated government': 'Statenville',
  'Georgetown-Quitman County unified government': 'Georgetown',
  'Macon-Bibb County': 'Macon',
  'Webster County unified government': 'Preston',
};
// Consolidated rows carry county-centre coordinates, so the town's own Wikipedia coordinates are used.
const WIKI_COORD_ONLY = new Set(Object.values(ALIAS));

function parseGazetteer(text) {
  const rows = text.split('\n').filter((l) => l.trim()).slice(1).map((l) => l.split('\t').map((c) => c.trim()));
  const munis = [];
  const cdps = new Map();
  for (const r of rows) {
    const [, , , name, lsad, , , , , , lat, lon] = r;
    if (lsad === '57') { cdps.set(name.replace(/ CDP$/, ''), [+lat, +lon]); continue; }
    let base;
    let consolidated = false;
    if (ALIAS[name]) { base = ALIAS[name]; consolidated = true; }
    else base = name.replace(/ (city|town|village)$/, '');
    munis.push({ base, gazName: name, lsad, coord: [+lat, +lon], consolidated });
  }
  return { munis, cdps };
}

function parseSeats(wikitext) {
  const seats = [];
  for (const inner of findTemplates(wikitext, /^Countyrow$/i)) {
    const p = namedParams(splitTop(inner));
    const seatKey = Object.keys(p).find((k) => /seat$/i.test(k));
    if (!p.Name || !seatKey) { warn(`countyrow missing Name/Seat: ${inner.slice(0, 80)}`); continue; }
    // Seat cells may name two towns (Columbia: Appling de jure, Evans de facto) or link with a piped display name.
    const linkTexts = [...p[seatKey].matchAll(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g)].map((m) => m[1].trim());
    const names = linkTexts.length ? linkTexts : [plain(p[seatKey])];
    for (const seat of names) seats.push({ county: `${plain(p.Name)} County`, seat });
  }
  return seats;
}

// ---------- main ----------

const EXTRA_TITLES = [
  { name: 'West End', title: 'West End, Atlanta', kind: 'suburb' },
  { name: 'Edgewood', title: 'Edgewood, Atlanta', kind: 'suburb' },
  { name: 'Kirkwood', title: 'Kirkwood, Atlanta', kind: 'suburb' },
  { name: 'Inman Park', title: 'Inman Park', kind: 'suburb' },
  { name: 'Buckhead', title: 'Buckhead, Atlanta', kind: 'suburb' },
  { name: 'Oakland City', title: 'Oakland City, Atlanta', kind: 'town' },
];
// Annexation years the article words as a range; the later bound is used as the year it ceased to exist.
const ANNEX_OVERRIDE = {
  Kirkwood: { year: 1924, sentence: 'Between 1922 and 1924 the City of Kirkwood (incorporated in 1892) was annexed in a long and at times contentious political and legislative process' },
};
// Milton County (seat Alpharetta) and Campbell County (seat Fairburn) were merged into Fulton in 1932.
const DEFUNCT_SEATS = [
  { county: 'Milton County', seat: 'Alpharetta', until: 1932 },
  { county: 'Campbell County', seat: 'Fairburn', until: 1932 },
];

async function main() {
  const gaz = await download(GAZ_URL, join(RAW, 'gazetteer_place_13.txt'));
  const countiesJson = await download(
    `${API}?action=parse&page=${COUNTIES_PAGE}&prop=wikitext&format=json&formatversion=2`,
    join(RAW, 'counties-list.json'), true,
  );
  const countiesWiki = JSON.parse(countiesJson).parse.wikitext;
  const seats = parseSeats(countiesWiki);
  const counties = new Set(seats.map((s) => s.county));
  if (counties.size !== 159) warn(`expected 159 counties, got ${counties.size}`);
  const seatAll = [...seats, ...DEFUNCT_SEATS];

  const { munis, cdps } = parseGazetteer(gaz);

  // Candidate map keyed by base name.
  const cand = new Map();
  for (const m of munis) {
    if (cand.has(m.base)) warn(`duplicate base name ${m.base}`);
    cand.set(m.base, { base: m.base, gazName: m.gazName, coord: m.coord, wikiCoordFirst: WIKI_COORD_ONLY.has(m.base), source: 'gazetteer', title: m.base === 'Buckhead' ? 'Buckhead, Morgan County, Georgia' : null });
  }
  for (const s of seatAll) {
    if (cand.has(s.seat)) continue;
    cand.set(s.seat, { base: s.seat, gazName: null, coord: cdps.get(s.seat) || null, source: cdps.has(s.seat) ? 'gazetteer CDP' : 'Wikipedia' });
  }

  const titleOf = (c) => c.title || `${c.base}, Georgia`;
  const titles = [...cand.values()].map(titleOf);
  const articles = await fetchArticles(titles, 'towns');
  const extraArticles = await fetchArticles(EXTRA_TITLES.map((e) => e.title), 'extras');

  const seatsOf = new Map();
  for (const s of seatAll) {
    if (!seatsOf.has(s.seat)) seatsOf.set(s.seat, []);
    seatsOf.get(s.seat).push(s);
  }

  const features = [];
  const skipped = [];
  const built = [];
  for (const c of cand.values()) {
    const art = articles.get(titleOf(c));
    if (!art || art.disambig) { skipped.push(c.base); continue; }
    const pop = parseCensus(art.text, art.title);
    const maxPop = pop ? Math.max(...Object.values(pop)) : 0;
    const seatRows = seatsOf.get(c.base) || [];
    const isCapital = c.base === 'Atlanta';
    if (!isCapital && seatRows.length === 0 && maxPop < POP_KEEP) continue;
    built.push({ c, art, pop, maxPop, seatRows, isCapital });
  }

  for (const { c, art, pop, seatRows, isCapital } of built) {
    const st = parseStart(art.text, art.title);
    let coord = c.coord;
    const wiki = parseCoord(art.text);
    if (!coord || (c.wikiCoordFirst && wiki)) coord = wiki;
    if (!coord) { warn(`${c.base}: no coordinates`); continue; }
    const props = {
      name: c.base === 'Buckhead' ? 'Buckhead (Morgan County)' : c.base,
      kind: isCapital ? 'capital' : seatRows.length ? 'county-seat' : 'town',
    };
    if (seatRows.length) {
      props.seat_of = seatRows.map((s) => s.county).join('; ');
      const defunct = seatRows.find((s) => s.until);
      if (defunct) props.seat_until = defunct.until;
    }
    props.start = st.start;
    props.end = null;
    props.date_quality = st.quality;
    props.date_source = st.source;
    if (pop) props.pop = pop;
    features.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'Point', coordinates: [round4(coord[1]), round4(coord[0])] },
    });
  }

  // Extra towns and suburbs.
  const extraReport = [];
  for (const e of EXTRA_TITLES) {
    const art = extraArticles.get(e.title);
    if (!art || art.disambig) { warn(`extra ${e.title}: missing or disambiguation`); continue; }
    const pop = parseCensus(art.text, art.title);
    let st = parseStart(art.text, art.title);
    if (st.start === null) st = parseTextStart(art.text, art.title) || st;
    const coord = parseCoord(art.text);
    if (!coord) { warn(`extra ${e.title}: no coordinates`); continue; }
    let annex = parseAnnex(art.text, art.title);
    if (ANNEX_OVERRIDE[e.name]) annex = ANNEX_OVERRIDE[e.name];
    const props = { name: e.name, kind: e.kind, start: st.start, end: null, date_quality: st.quality, date_source: st.source };
    if (annex && annex.year) {
      props.end = annex.year;
      props.date_source = `${st.source}; end: Wikipedia ${art.title} ("${annex.sentence}")`;
    }
    if (annex) extraReport.push({ name: e.name, annex });
    if (pop) props.pop = pop;
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [round4(coord[1]), round4(coord[0])] } });
  }

  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
  const fc = { type: 'FeatureCollection', features };
  writeFileSync(OUT, JSON.stringify(fc));

  console.log(`features: ${features.length}`);
  console.log('skipped (no article / disambiguation):', skipped.join(', ') || 'none');
  console.log('extra annex findings:', JSON.stringify(extraReport, null, 1));
  console.log('disambiguation:', report.disambiguation.join(', ') || 'none');
  console.log('missing:', report.missing.join(', ') || 'none');
  console.log('warnings:', report.warnings.length);
}

function round4(n) { return Math.round(n * 1e4) / 1e4; }

main().catch((e) => { console.error(e); process.exit(1); });
