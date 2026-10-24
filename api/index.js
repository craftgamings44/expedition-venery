/**
 * Cloud accounts API — a single Vercel serverless function.
 *
 * One function handles every route so the deployment stays inside the Hobby
 * plan's per-deployment function count.
 *
 *   GET    /api/health    -> is the backend configured and reachable
 *   GET    /api/session   -> who am I
 *   POST   /api/session   -> signup | login
 *   DELETE /api/session   -> sign out and revoke the token
 *   GET    /api/saves     -> all saves for the signed-in user
 *   POST   /api/saves     -> write one save
 *   DELETE /api/saves     -> erase all saves
 *
 * Storage: a Postgres database pointed at by DATABASE_URL (Neon, Supabase,
 * Vercel Postgres and a local database all work). If DATABASE_URL is not set
 * the function reports that cloud accounts are unconfigured, and the client
 * falls back to local accounts — the game never breaks because the backend is
 * missing.
 *
 * Security notes:
 *   - every query is parameterized; nothing from the request is concatenated
 *     into SQL.
 *   - passwords are hashed with scrypt using the OWASP-recommended cost and
 *     the parameters are stored with the hash, so they can be raised later
 *     without invalidating existing accounts.
 *   - session tokens are random, and signing out revokes them server-side.
 *   - auth attempts are rate limited per client address.
 */

import crypto from 'node:crypto';
import { getPool, isConfigured } from './db.js';

/** Cached schema bootstrap — one round trip per cold start, not per request. */
let schemaPromise = null;

/** @type {Map<string, {n: number, until: number}>} */
const attempts = new Map();

/** Auth attempts allowed per client per window. */
const AUTH_LIMIT = 20;
const AUTH_WINDOW_MS = 10 * 60 * 1000;

/** scrypt cost. 2^16 is the OWASP minimum; the parameters are stored with
 *  each hash so they can be raised without breaking old accounts. */
const SCRYPT = { N: 65536, r: 8, p: 1 };
/** Cost used for hashes written before the parameters were recorded. */
const SCRYPT_LEGACY = { N: 16384, r: 8, p: 1 };

/** A save is a campaign. Anything larger than this is not one. */
const MAX_SAVE_BYTES = 256 * 1024;

/** Usernames are shown in the UI and used as a storage key. Keep them plain. */
const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,31}$/;

/** New passwords must be long enough to be worth hashing. */
const MIN_PASSWORD = 8;

/**
 * Read the caller's address for rate limiting.
 *
 * Vercel appends the real client address to x-forwarded-for, so the last
 * entry is the one the platform observed and the first is whatever the
 * caller sent. Use the last.
 * @param {import('@vercel/node').VercelRequest} req
 * @returns {string}
 */
function clientIp(req) {
  const h = req.headers['x-forwarded-for'];
  const v = Array.isArray(h) ? h.join(',') : h;
  if (v) {
    const parts = String(v).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return String(req.socket?.remoteAddress || 'unknown');
}

/**
 * Count an auth attempt for this address. Returns false when the caller is
 * over the limit.
 * @param {import('@vercel/node').VercelRequest} req
 * @returns {boolean}
 */
function allowAuth(req) {
  const now = Date.now();
  // Drop expired entries so the map cannot grow without bound.
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  }
  const ip = clientIp(req);
  const rec = attempts.get(ip);
  if (!rec || rec.until < now) {
    attempts.set(ip, { n: 1, until: now + AUTH_WINDOW_MS });
    return true;
  }
  rec.n += 1;
  return rec.n <= AUTH_LIMIT;
}

/**
 * Hash a password with scrypt and a random salt.
 *
 * The cost parameters are stored alongside the hash so they can be raised
 * later without invalidating accounts that already exist.
 * @param {string} password
 * @returns {Promise<string>} `scrypt$N$r$p$salt:hash` in hex
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { ...SCRYPT, maxmem: 128 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}:${derived.toString('hex')}`;
}

/**
 * Verify a password against a stored hash.
 *
 * Reads the cost parameters out of the stored value, so old hashes keep
 * working and newer ones can use a higher cost.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, stored) {
  const raw = String(stored || '');
  let cost = SCRYPT_LEGACY;
  let body = raw;
  if (raw.startsWith('scrypt$')) {
    const parts = raw.split('$');
    const saltHash = parts[parts.length - 1];
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 2) return false;
    cost = { N, r, p };
    body = saltHash;
  }
  const [salt, hash] = body.split(':');
  if (!salt || !hash) return false;
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { ...cost, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
  const a = Buffer.from(hash, 'hex');
  const b = derived;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Create the schema if it does not exist.
 * @param {any} pool
 */
async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ev_users (
      id         SERIAL PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      pw_hash    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ev_saves (
      user_id    INTEGER NOT NULL REFERENCES ev_users(id) ON DELETE CASCADE,
      difficulty TEXT NOT NULL,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, difficulty)
    );
    CREATE TABLE IF NOT EXISTS ev_sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES ev_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
}

/**
 * Read the bearer token from the request.
 * @param {import('@vercel/node').VercelRequest} req
 * @returns {string|null}
 */
function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1] : null;
}

/**
 * Parse a JSON body. Vercel hands over an object for JSON content types and a
 * raw string otherwise; the local dev server always hands over a string.
 * @param {any} raw
 * @returns {Object}
 */
function parseBody(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Look up the user id for a bearer token.
 *
 * ev_sessions has no id column — the user it belongs to is user_id.
 * @param {any} pool
 * @param {string|null} token
 * @returns {Promise<number|null>}
 */
async function userForToken(pool, token) {
  if (!token) return null;
  const res = await pool.query('SELECT user_id FROM ev_sessions WHERE token = $1 AND expires_at > NOW()', [token]);
  return res.rows[0]?.user_id ?? null;
}

/**
 * Handle the request.
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const path = route(req.url);

  if (path === 'health') {
    // The client probes this to tell "no backend" apart from "not signed in".
    res.status(isConfigured() ? 200 : 503).json({
      ok: isConfigured(),
      configured: isConfigured(),
      service: 'expedition-venery',
    });
    return;
  }

  let pool = null;
  try {
    pool = await getPool();
  } catch (err) {
    console.error('api database unavailable', err);
    res.status(503).json({
      error: 'Cloud accounts are not configured on this deployment.',
      hint: 'Set DATABASE_URL to a Postgres connection string to enable them.',
    });
    return;
  }

  try {
    if (!schemaPromise) {
      schemaPromise = ensureSchema(pool).catch((err) => {
        schemaPromise = null;
        throw err;
      });
    }
    await schemaPromise;

    if (path === 'session') {
      if (req.method === 'GET') {
        const uid = await userForToken(pool, bearer(req));
        if (!uid) {
          res.status(401).json({ error: 'Not signed in.' });
          return;
        }
        const u = await pool.query('SELECT username FROM ev_users WHERE id = $1', [uid]);
        res.status(200).json({ user: u.rows[0]?.username ?? null });
        return;
      }

      if (req.method === 'DELETE') {
        // Signing out has to revoke the token, not just forget it.
        const token = bearer(req);
        if (token) await pool.query('DELETE FROM ev_sessions WHERE token = $1', [token]);
        res.status(200).json({ ok: true });
        return;
      }

      if (req.method === 'POST') {
        if (!allowAuth(req)) {
          res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
          return;
        }
        const body = parseBody(req.body);
        const action = body.action;
        const name = String(body.name || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (action === 'signup') {
          if (!USERNAME_RE.test(name)) {
            res.status(400).json({
              error: 'Usernames are 3 to 32 characters: letters, numbers, dot, dash or underscore.',
            });
            return;
          }
          if (password.length < MIN_PASSWORD) {
            res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
            return;
          }
          const existing = await pool.query('SELECT id FROM ev_users WHERE username = $1', [name]);
          if (existing.rows.length) {
            res.status(409).json({ error: 'That username is already taken.' });
            return;
          }
          const h = await hashPassword(password);
          const ins = await pool.query('INSERT INTO ev_users (username, pw_hash) VALUES ($1, $2) RETURNING id', [name, h]);
          const token = crypto.randomBytes(32).toString('hex');
          await pool.query('INSERT INTO ev_sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')', [token, ins.rows[0].id]);
          res.status(200).json({ token, user: name });
          return;
        }

        if (action === 'login') {
          // No length rule here: existing accounts keep working.
          if (!name || !password) {
            res.status(400).json({ error: 'Username and password are required.' });
            return;
          }
          const u = await pool.query('SELECT id, pw_hash FROM ev_users WHERE username = $1', [name]);
          if (!u.rows.length || !(await verifyPassword(password, u.rows[0].pw_hash))) {
            res.status(401).json({ error: 'Wrong username or password.' });
            return;
          }
          const token = crypto.randomBytes(32).toString('hex');
          await pool.query('INSERT INTO ev_sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')', [token, u.rows[0].id]);
          res.status(200).json({ token, user: name });
          return;
        }

        res.status(400).json({ error: 'Unknown action.' });
        return;
      }
    }

    if (path === 'saves') {
      const uid = await userForToken(pool, bearer(req));
      if (!uid) {
        res.status(401).json({ error: 'Not signed in.' });
        return;
      }
      if (req.method === 'GET') {
        const rows = await pool.query('SELECT difficulty, data FROM ev_saves WHERE user_id = $1', [uid]);
        const saves = {};
        for (const r of rows.rows) saves[r.difficulty] = r.data;
        res.status(200).json({ saves });
        return;
      }
      if (req.method === 'POST') {
        const body = parseBody(req.body);
        const difficulty = String(body.difficulty || 'normal');
        const save = body.save ?? {};
        const size = Buffer.byteLength(JSON.stringify(save) || '', 'utf8');
        if (size > MAX_SAVE_BYTES) {
          res.status(413).json({ error: 'That save is too large.' });
          return;
        }
        await pool.query(
          `INSERT INTO ev_saves (user_id, difficulty, data, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, difficulty) DO UPDATE SET data = $3, updated_at = NOW()`,
          [uid, difficulty, save]
        );
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'DELETE') {
        await pool.query('DELETE FROM ev_saves WHERE user_id = $1', [uid]);
        res.status(200).json({ ok: true });
        return;
      }
    }

    res.status(404).json({ error: 'Not found.' });
  } catch (err) {
    console.error('api error', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

/**
 * The last segment of the request path: /api/session -> session.
 * @param {string} url
 * @returns {string}
 */
function route(url) {
  const parts = String(url || '').split('?')[0].split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}
