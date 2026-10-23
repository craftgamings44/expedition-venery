/**
 * Cloud accounts API — a single Vercel serverless function.
 *
 * One function handles every route so the deployment stays inside the Hobby
 * plan's per-deployment function count.
 *
 *   GET    /api/session   -> who am I
 *   POST   /api/session   -> signup | login
 *   GET    /api/saves     -> all saves for the signed-in user
 *   POST   /api/saves     -> write one save
 *   DELETE /api/saves     -> erase all saves
 *
 * Storage: a Postgres database pointed at by DATABASE_URL (Neon, Supabase and
 * Vercel Postgres all work). If DATABASE_URL is not set the function reports
 * that cloud accounts are unconfigured, and the client falls back to local
 * accounts — the game never breaks because the backend is missing.
 *
 * Passwords are hashed server-side with scrypt. The client never sees a hash.
 */

import crypto from 'node:crypto';

/** @type {import('@vercel/node').VercelRequest|undefined} */
let cachedPg = null;

/**
 * Lazily create a pg Pool. Returns null when the database is not configured.
 */
async function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (cachedPg) return cachedPg;
  const { default: pg } = await import('pg');
  cachedPg = new pg.Pool({ connectionString: url, ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false } });
  return cachedPg;
}

/**
 * Hash a password with scrypt and a random salt.
 * @param {string} password
 * @returns {Promise<string>} `salt:hash` in hex
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return salt + ':' + derived.toString('hex');
}

/**
 * Verify a password against a stored `salt:hash`.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  const a = Buffer.from(hash, 'hex');
  const b = derived;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Create the schema if it does not exist.
 * @param {import('pg').Pool} pool
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
 * Look up the user id for a bearer token.
 * @param {import('pg').Pool} pool
 * @param {string|null} token
 * @returns {Promise<number|null>}
 */
async function userForToken(pool, token) {
  if (!token) return null;
  const res = await pool.query('SELECT id FROM ev_sessions WHERE token = $1 AND expires_at > NOW()', [token]);
  return res.rows[0]?.id ?? null;
}

/**
 * Handle the request.
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const url = (req.url || '').split('?')[0];

  const pool = await getPool();
  if (!pool) {
    res.status(503).json({
      error: 'Cloud accounts are not configured on this deployment.',
      hint: 'Set DATABASE_URL to a Postgres connection string to enable them.',
    });
    return;
  }

  try {
    await ensureSchema(pool);

    if (url.endsWith('/session')) {
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

      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        const action = body.action;
        const name = String(body.name || '').trim();
        const password = String(body.password || '');
        if (name.length < 3) {
          res.status(400).json({ error: 'Username must be at least 3 characters.' });
          return;
        }
        if (password.length < 4) {
          res.status(400).json({ error: 'Password must be at least 4 characters.' });
          return;
        }
        const key = name.toLowerCase();

        if (action === 'signup') {
          const existing = await pool.query('SELECT id FROM ev_users WHERE username = $1', [key]);
          if (existing.rows.length) {
            res.status(409).json({ error: 'That username is already taken.' });
            return;
          }
          const h = await hashPassword(password);
          const ins = await pool.query('INSERT INTO ev_users (username, pw_hash) VALUES ($1, $2) RETURNING id', [key, h]);
          const token = crypto.randomBytes(32).toString('hex');
          await pool.query('INSERT INTO ev_sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')', [token, ins.rows[0].id]);
          res.status(200).json({ token, user: key });
          return;
        }

        if (action === 'login') {
          const u = await pool.query('SELECT id, pw_hash FROM ev_users WHERE username = $1', [key]);
          if (!u.rows.length || !(await verifyPassword(password, u.rows[0].pw_hash))) {
            res.status(401).json({ error: 'Wrong username or password.' });
            return;
          }
          const token = crypto.randomBytes(32).toString('hex');
          await pool.query('INSERT INTO ev_sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')', [token, u.rows[0].id]);
          res.status(200).json({ token, user: key });
          return;
        }

        res.status(400).json({ error: 'Unknown action.' });
        return;
      }
    }

    if (url.endsWith('/saves')) {
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
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        const difficulty = String(body.difficulty || 'normal');
        await pool.query(
          `INSERT INTO ev_saves (user_id, difficulty, data, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, difficulty) DO UPDATE SET data = $3, updated_at = NOW()`,
          [uid, difficulty, body.save ?? {}]
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
