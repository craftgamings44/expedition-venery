/**
 * Tiny static file server for local development.
 *
 * The game uses native ES modules, so it cannot be opened over file:// —
 * browsers block module loading from the filesystem. Run this and open the
 * printed URL.
 *
 *   node tools/serve.js [port]
 *
 * It also serves the cloud accounts API at /api/*, using the same handler the
 * Vercel deployment uses, so local and production behave identically. Point
 * it at a database with DATABASE_URL in a .env file (see .env.example).
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { handleApi } from './api-local.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);

  if (path === '/api' || path.startsWith('/api/')) {
    await handleApi(req, res);
    return;
  }

  try {
    let p = path;
    if (p.endsWith('/')) p += 'index.html';
    const full = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(full);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: path + '/' }).end();
      return;
    }
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      // Development server: never let the browser cache a module.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
  }
});

const loaded = await loadEnv();

server.listen(PORT, () => {
  console.log(`Expedition Venery running at http://localhost:${PORT}/`);
  if (process.env.DATABASE_URL) {
    console.log('Cloud accounts: enabled (DATABASE_URL is set).');
  } else {
    console.log('Cloud accounts: local only (no DATABASE_URL).');
  }
  if (loaded.length) console.log(`Loaded from .env: ${loaded.join(', ')}`);
});
