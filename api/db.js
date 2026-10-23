/**
 * Postgres access layer for the cloud accounts API.
 *
 * One place that knows how to reach the database, so the Vercel function and
 * the local dev server speak to Postgres exactly the same way.
 *
 * The connection string comes from DATABASE_URL. When it is absent the API
 * reports that cloud accounts are unconfigured and the client falls back to
 * local accounts — the game never breaks because the backend is missing.
 */

/** @type {Promise<any>|null} */
let poolPromise = null;

/** @type {any} */
let injectedPool = null;

/**
 * Whether a database has been configured for this deployment.
 * @returns {boolean}
 */
export function isConfigured() {
  return !!process.env.DATABASE_URL;
}

/**
 * Replace the pool. Used by the headless tests, which run against a fake
 * pool instead of a real database.
 * @param {any|null} pool
 */
export function setPool(pool) {
  injectedPool = pool;
  poolPromise = null;
}

/**
 * Work out how to talk TLS to the database.
 *
 * `pg` already understands `sslmode` in a connection string, so the only
 * decision left is whether to override it. A local database usually speaks
 * plaintext and a hosted one usually wants TLS, and guessing wrong either
 * way breaks the connection.
 * @param {string} url
 * @returns {boolean|Object|undefined} the ssl option, or undefined to let pg decide
 */
export function sslFor(url) {
  if (/[?&]sslmode=/i.test(url)) return undefined;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (local) return false;
  // A hosted database wants TLS. Its certificate is usually not in Node's
  // trust store, so do not insist on verifying it.
  return { rejectUnauthorized: false };
}

/**
 * Create the pg Pool lazily and reuse it for the life of the process.
 *
 * A Vercel function is a warm process, so the pool survives between requests
 * and we do not pay a TLS handshake every time.
 * @returns {Promise<any>}
 */
export async function getPool() {
  if (injectedPool) return injectedPool;
  if (!poolPromise) {
    poolPromise = (async () => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('DATABASE_URL is not set.');
      let pg;
      try {
        ({ default: pg } = await import('pg'));
      } catch {
        throw new Error(
          "The 'pg' package is not installed. Run 'npm install' before starting the API server.",
        );
      }
      const ssl = sslFor(url);
      return new pg.Pool({
        connectionString: url,
        ...(ssl === undefined ? {} : { ssl }),
        max: 4,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
      });
    })().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/**
 * Run a parameterized query.
 * @param {string} text
 * @param {any[]} params
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
export async function query(text, params = []) {
  const pool = await getPool();
  return pool.query(text, params);
}

/**
 * Close the pool. Used when the local server shuts down.
 */
export async function closePool() {
  const p = await poolPromise?.catch(() => null);
  if (p && typeof p.end === 'function') await p.end();
  poolPromise = null;
}
