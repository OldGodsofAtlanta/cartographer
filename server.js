// Cartographer's local server: serves the app, its data, the design system's fonts, and reads and
// writes map projects in projects/. No dependencies; binds to localhost only.
//
//   npm start                 http://localhost:5177
//   PORT=8080 npm start

import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chapterList } from './lib/chapters.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = Number(process.env.PORT) || 5177;
const PROJECTS = join(HERE, 'projects');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

// URL prefix → directory on disk. Everything else is refused.
const MOUNTS = [
  ['/vendor/d3.js', join(HERE, 'node_modules/d3/dist/d3.min.js')],
  ['/vendor/topojson.js', join(HERE, 'node_modules/topojson-client/dist/topojson-client.min.js')],
  ['/fonts/', join(HERE, 'fonts/')],
  ['/data/', join(HERE, 'data/')],
  ['/backdrops/', join(HERE, 'backdrops/')],
  ['/app/', join(HERE, 'app/')],
  ['/', join(HERE, 'index.html')],
];

function inside(base, path) {
  const b = resolve(base);
  const p = resolve(path);
  return p === b || p.startsWith(b + sep);
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function serveFile(res, path) {
  try {
    const s = await stat(path);
    if (!s.isFile()) return send(res, 404, 'Not found');
    send(res, 200, await readFile(path), TYPES[extname(path)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found');
  }
}

// Chapter presets for the app, read from the book beside this folder (see lib/chapters.js).
export function chapters() {
  return chapterList(ROOT);
}

async function body(req, limit = 5e6) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  try {
    if (path === '/api/chapters') return send(res, 200, JSON.stringify(await chapters()), TYPES['.json']);

    if (path === '/api/projects' && req.method === 'GET') {
      await mkdir(PROJECTS, { recursive: true });
      const files = (await readdir(PROJECTS)).filter((f) => f.endsWith('.json')).sort();
      return send(res, 200, JSON.stringify(files.map((f) => f.replace(/\.json$/, ''))), TYPES['.json']);
    }
    const pm = path.match(/^\/api\/projects\/([a-z0-9-]+)$/);
    if (pm) {
      const file = join(PROJECTS, `${pm[1]}.json`);
      if (req.method === 'GET') return serveFile(res, file);
      if (req.method === 'PUT') {
        const text = await body(req);
        JSON.parse(text); // refuse anything that isn't JSON
        await mkdir(PROJECTS, { recursive: true });
        await writeFile(file, text.endsWith('\n') ? text : text + '\n');
        return send(res, 200, JSON.stringify({ saved: `projects/${pm[1]}.json` }), TYPES['.json']);
      }
    }

    // Period images already in the book: /art/<chapter>/art/<file> serves chapters/<chapter>/art/<file>, images only.
    if (path.startsWith('/art/')) {
      const rel = path.slice(5);
      if (!/^[0-9a-z-]+\/art\/[^/]+\.(jpe?g|png|webp)$/i.test(rel)) return send(res, 403, 'Forbidden');
      return serveFile(res, join(ROOT, 'chapters', rel));
    }
    for (const [prefix, target] of MOUNTS) {
      if (prefix.endsWith('/') && prefix !== '/') {
        if (!path.startsWith(prefix)) continue;
        const file = join(target, path.slice(prefix.length));
        if (!inside(target, file)) return send(res, 403, 'Forbidden');
        return serveFile(res, file);
      }
      if (path === prefix || (prefix === '/' && path === '/index.html')) return serveFile(res, target);
    }
    send(res, 404, 'Not found');
  } catch (err) {
    send(res, 500, String(err.message || err));
  }
}

// Starts the server on localhost; port 0 picks a free one. Resolves to the http.Server.
export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = createServer(handle);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  console.log(`Cartographer: http://localhost:${server.address().port}`);
}
