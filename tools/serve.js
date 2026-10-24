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
 *
 * The server only hands out what the game needs. Dotfiles (.env, .git,
 * .vercel) and node_modules are refused — the first of those holds the
 * database password, and a dev server that publishes it to the network is a
 * problem, not a convenience.
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve, relative, isAbsolute, sep } from 'node:path';
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

/**
 * The game's content security policy. Mirrors the one in vercel.json — keep
 * them in step.
 *
 * The game has no inline scripts, so scripts may only come from this origin.
 * The UI does use inline style attributes, hence 'unsafe-inline' for styles
 * only. The tools under /tools/ get a looser script policy because the probe
 * runs as an inline script.
 */
const CSP_BASE =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const CSP_TOOLS = CSP_BASE.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");

/**
 * Security headers for a response.
 * @param {string} path
 * @returns {Object}
 */
function securityHeaders(path) {
  const headers = {
    'Content-Security-Policy': path.startsWith('/tools/') ? CSP_TOOLS : CSP_BASE,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
  };
  return headers;
}

/**
 * Whether this path may be served at all.
 *
 * Dotfiles and node_modules never are. The database password lives in .env
 * and a Vercel OIDC token in .vercel/.env.local.
 * @param {string} rel
 * @returns {boolean}
 */
function isAllowed(rel) {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (!parts.length) return true;
  if (parts[0].startsWith('.')) return false;
  if (parts[0] === 'node_modules') return false;
  if (parts.includes('node_modules')) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);

  if (path === '/api' || path.startsWith('/api/')) {
    await handleApi(req, res);
    return;
  }

  try {
    let p = path;
    if (p.endsWith('/')) p += 'index.html';
    const full = resolve(join(ROOT, normalize(p)));

    // Containment check: the target must sit inside the repo. Comparing
    // string prefixes is not enough — a sibling directory named
    // "expedition-venery-backup" would pass a startsWith test.
    const rel = relative(ROOT, full);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      res.writeHead(403, { 'Content-Type': 'text/plain', ...securityHeaders(path) }).end('Forbidden');
      return;
    }
    if (!isAllowed(rel.split(sep).join('/'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain', ...securityHeaders(path) }).end('Forbidden');
      return;
    }

    const info = await stat(full);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: path + '/', ...securityHeaders(path) }).end();
      return;
    }
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      // Development server: never let the browser cache a module.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...securityHeaders(path),
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...securityHeaders(path) }).end('404 Not Found');
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
