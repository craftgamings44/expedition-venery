/**
 * Cloud accounts API tests.
 *
 * The handler is exercised against a fake pool, so the suite stays
 * dependency-free and runs without a database. What is under test is the
 * routing, the authentication rules and the status codes — the SQL itself is
 * Postgres's problem.
 */

import { suite, assert, assertEqual } from './run.js';
import { setPool } from '../api/db.js';

/**
 * The real schema. The fake pool checks every SELECT against this, so a
 * query that names a column the table does not have fails here instead of
 * failing against a real database.
 */
const SCHEMA = {
  ev_users: ['id', 'username', 'pw_hash', 'created_at'],
  ev_sessions: ['token', 'user_id', 'expires_at'],
  ev_saves: ['user_id', 'difficulty', 'data', 'updated_at'],
};

/**
 * A tiny in-memory stand-in for a Postgres pool. It understands only the
 * queries the API actually sends, and it is strict about column names.
 */
function makePool() {
  /** @type {Map<string, {id: number, username: string, pw_hash: string}>} */
  const users = new Map();
  /** @type {Map<string, {user_id: number, expires_at: number}>} */
  const sessions = new Map();
  /** @type {Map<string, any>} */
  const saves = new Map();
  let nextId = 1;
  const calls = [];

  /**
   * Check that a SELECT names columns the table actually has.
   * @param {string} text
   */
  function checkColumns(text) {
    const m = /^SELECT\s+([\w\s,]+?)\s+FROM\s+(\w+)/i.exec(text);
    if (!m) return;
    const table = m[2];
    const columns = SCHEMA[table];
    if (!columns) throw new Error(`fake pool: unknown table ${table}`);
    for (const col of m[1].split(',').map((c) => c.trim())) {
      if (!columns.includes(col)) {
        throw new Error(`column "${col}" does not exist (${table} has ${columns.join(', ')})`);
      }
    }
  }

  return {
    users,
    sessions,
    saves,
    calls,
    /** @param {string} text @param {any[]} params */
    async query(text, params = []) {
      calls.push({ text, params });
      const t = text.trim();
      if (/^CREATE TABLE/i.test(t)) return { rows: [], rowCount: 0 };
      if (/^SELECT/i.test(t)) checkColumns(t);
      if (/^SELECT user_id FROM ev_sessions WHERE token/i.test(t)) {
        const s = sessions.get(params[0]);
        return { rows: s && s.expires_at > Date.now() ? [{ user_id: s.user_id }] : [], rowCount: 1 };
      }
      if (/^SELECT id FROM ev_users WHERE username/i.test(t)) {
        const u = [...users.values()].find((x) => x.username === params[0]);
        return { rows: u ? [{ id: u.id }] : [], rowCount: u ? 1 : 0 };
      }
      if (/^INSERT INTO ev_users/i.test(t)) {
        const id = nextId++;
        users.set(params[0], { id, username: params[0], pw_hash: params[1] });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (/^SELECT id, pw_hash FROM ev_users/i.test(t)) {
        const u = [...users.values()].find((x) => x.username === params[0]);
        return { rows: u ? [{ id: u.id, pw_hash: u.pw_hash }] : [], rowCount: u ? 1 : 0 };
      }
      if (/^INSERT INTO ev_sessions/i.test(t)) {
        sessions.set(params[0], { user_id: params[1], expires_at: Date.now() + 30 * 864e5 });
        return { rows: [], rowCount: 1 };
      }
      if (/^DELETE FROM ev_sessions WHERE token/i.test(t)) {
        sessions.delete(params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (/^SELECT username FROM ev_users WHERE id/i.test(t)) {
        const u = [...users.values()].find((x) => x.id === params[0]);
        return { rows: u ? [{ username: u.username }] : [], rowCount: 1 };
      }
      if (/^SELECT difficulty, data FROM ev_saves/i.test(t)) {
        const rows = [];
        for (const [k, v] of saves) {
          if (k.startsWith(params[0] + ':')) rows.push({ difficulty: k.split(':')[1], data: v });
        }
        return { rows, rowCount: rows.length };
      }
      if (/^INSERT INTO ev_saves/i.test(t)) {
        saves.set(params[0] + ':' + params[1], params[2]);
        return { rows: [], rowCount: 1 };
      }
      if (/^DELETE FROM ev_saves/i.test(t)) {
        for (const k of [...saves.keys()]) if (k.startsWith(params[0] + ':')) saves.delete(k);
        return { rows: [], rowCount: 1 };
      }
      throw new Error('fake pool: unexpected query: ' + t);
    },
  };
}

const pool = makePool();
setPool(pool);

/**
 * Build a response recorder.
 */
function makeRes() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.setHeader = (k, v) => {
    r.headers[k] = v;
  };
  r.status = (c) => {
    r.statusCode = c;
    return r;
  };
  r.json = (obj) => {
    r.body = obj;
    return r;
  };
  r.writeHead = () => r;
  r.end = () => r;
  return r;
}

let ipCounter = 0;

/**
 * Call the handler.
 * @param {string} method
 * @param {string} url
 * @param {{body?: any, token?: string}} [opts]
 */
async function call(method, url, opts = {}) {
  const req = {
    url,
    method,
    headers: {
      'x-forwarded-for': '10.0.0.' + (ipCounter++ % 250),
      ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}),
    },
    body: opts.body,
    socket: {},
  };
  const res = makeRes();
  const handler = (await import('../api/index.js')).default;
  await handler(req, res);
  return res;
}

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/evtest';

await suite('api: health reports configuration', async () => {
  const res = await call('GET', '/api/health');
  assertEqual(res.statusCode, 200, 'health is 200 when the database is configured');
  assertEqual(res.body.configured, true, 'health says the backend is configured');
});

await suite('api: session needs a token', async () => {
  const res = await call('GET', '/api/session');
  assertEqual(res.statusCode, 401, 'no token is 401');
});

await suite('api: signup, session and login', async () => {
  const signup = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'Digger', password: 'lantern1' },
  });
  assertEqual(signup.statusCode, 200, 'signup succeeds');
  assert(!!signup.body.token, 'signup returns a token');
  assertEqual(signup.body.user, 'digger', 'the username is stored lower case');

  const who = await call('GET', '/api/session', { token: signup.body.token });
  assertEqual(who.statusCode, 200, 'the token identifies the player');
  assertEqual(who.body.user, 'digger', 'the session reports the username');

  const login = await call('POST', '/api/session', {
    body: { action: 'login', name: 'Digger', password: 'lantern1' },
  });
  assertEqual(login.statusCode, 200, 'login succeeds with the right password');
  assert(!!login.body.token, 'login returns a token');

  const wrong = await call('POST', '/api/session', {
    body: { action: 'login', name: 'Digger', password: 'wrong' },
  });
  assertEqual(wrong.statusCode, 401, 'login fails with the wrong password');
});

await suite('api: a username cannot be taken twice', async () => {
  const res = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'Digger', password: 'lantern1' },
  });
  assertEqual(res.statusCode, 409, 'a second signup with the same name is 409');
});

await suite('api: input is validated', async () => {
  const shortName = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'ab', password: 'lantern1' },
  });
  assertEqual(shortName.statusCode, 400, 'a name under three characters is rejected');
  const shortPass = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'Miner', password: 'no' },
  });
  assertEqual(shortPass.statusCode, 400, 'a password under four characters is rejected');
  const unknown = await call('POST', '/api/session', { body: { action: 'wat' } });
  assertEqual(unknown.statusCode, 400, 'an unknown action is rejected');
});

await suite('api: saves round trip', async () => {
  const signup = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'Sapper', password: 'lantern1' },
  });
  const token = signup.body.token;

  const noAuth = await call('GET', '/api/saves');
  assertEqual(noAuth.statusCode, 401, 'saves need a token');

  const write = await call('POST', '/api/saves', {
    token,
    body: { difficulty: 'normal', save: { v: 2, q: 3, money: 120 } },
  });
  assertEqual(write.statusCode, 200, 'a save is written');

  const read = await call('GET', '/api/saves', { token });
  assertEqual(read.statusCode, 200, 'saves are read');
  assertEqual(read.body.saves.normal.q, 3, 'the save comes back intact');
  assertEqual(read.body.saves.normal.money, 120, 'the money comes back intact');

  const other = await call('POST', '/api/saves', {
    token,
    body: { difficulty: 'hard', save: { v: 2, q: 1 } },
  });
  assertEqual(other.statusCode, 200, 'a second difficulty is written');
  const both = await call('GET', '/api/saves', { token });
  assertEqual(Object.keys(both.body.saves).sort(), ['hard', 'normal'], 'both difficulties are kept');

  const del = await call('DELETE', '/api/saves', { token });
  assertEqual(del.statusCode, 200, 'saves are erased');
  const gone = await call('GET', '/api/saves', { token });
  assertEqual(gone.body.saves, {}, 'nothing is left after the erase');
});

await suite('api: one player cannot read another player saves', async () => {
  const a = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'Alpha', password: 'lantern1' },
  });
  const b = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'Beta', password: 'lantern1' },
  });
  await call('POST', '/api/saves', { token: a.body.token, body: { difficulty: 'normal', save: { secret: 1 } } });
  const read = await call('GET', '/api/saves', { token: b.body.token });
  assertEqual(read.body.saves, {}, 'another player sees nothing');
});

await suite('api: unknown routes are 404', async () => {
  const res = await call('GET', '/api/nope');
  assertEqual(res.statusCode, 404, 'an unknown route is 404');
});

await suite('api: a query string does not hide the route', async () => {
  const res = await call('GET', '/api/session?cache=1');
  assertEqual(res.statusCode, 401, 'the session route is still found');
  const health = await call('GET', '/api/health?cache=1');
  assertEqual(health.statusCode, 200, 'the health route is still found');
});

await suite('api: usernames are restricted to a plain charset', async () => {
  const spaced = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'has space', password: 'lantern1' },
  });
  assertEqual(spaced.statusCode, 400, 'a name with a space is rejected');
  const markup = await call('POST', '/api/session', {
    body: { action: 'signup', name: '<script>', password: 'lantern1' },
  });
  assertEqual(markup.statusCode, 400, 'a name with markup is rejected');
  const ok = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'good.name_1-2', password: 'lantern1' },
  });
  assertEqual(ok.statusCode, 200, 'a plain name is accepted');
});

await suite('api: new passwords must be long enough', async () => {
  const res = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'shorty', password: 'short' },
  });
  assertEqual(res.statusCode, 400, 'a short password is rejected on signup');
});

await suite('api: an old short password can still sign in', async () => {
  // The rule only applies when creating an account. Accounts that already
  // exist must keep working.
  await call('POST', '/api/session', {
    body: { action: 'signup', name: 'oldtimer', password: 'lantern1' },
  });
  const res = await call('POST', '/api/session', {
    body: { action: 'login', name: 'oldtimer', password: 'old' },
  });
  assertEqual(res.statusCode, 401, 'the wrong password is still rejected');
});

await suite('api: signing out revokes the token', async () => {
  const signup = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'leaver', password: 'lantern1' },
  });
  const token = signup.body.token;
  const before = await call('GET', '/api/session', { token });
  assertEqual(before.statusCode, 200, 'the token works before signing out');

  const out = await call('DELETE', '/api/session', { token });
  assertEqual(out.statusCode, 200, 'signing out is 200');

  const after = await call('GET', '/api/session', { token });
  assertEqual(after.statusCode, 401, 'the token is dead after signing out');
  const saves = await call('GET', '/api/saves', { token });
  assertEqual(saves.statusCode, 401, 'the token cannot read saves either');
});

await suite('api: an account made before the cost was raised still signs in', async () => {
  // Hashes written before the cost parameters were recorded look like
  // "salt:hash" and used scrypt's defaults. They must keep working.
  const crypto = await import('node:crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const legacy = await new Promise((resolve, reject) => {
    crypto.scrypt('oldpass1', salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  pool.users.set('veteran', {
    id: 99,
    username: 'veteran',
    pw_hash: salt + ':' + legacy.toString('hex'),
  });

  const res = await call('POST', '/api/session', {
    body: { action: 'login', name: 'veteran', password: 'oldpass1' },
  });
  assertEqual(res.statusCode, 200, 'the old hash still verifies');
  assert(!!res.body.token, 'the old account gets a token');
});

await suite('api: an oversized save is refused', async () => {
  const signup = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'gargantuan', password: 'lantern1' },
  });
  const big = { v: 2, junk: 'x'.repeat(300 * 1024) };
  const res = await call('POST', '/api/saves', {
    token: signup.body.token,
    body: { difficulty: 'normal', save: big },
  });
  assertEqual(res.statusCode, 413, 'a save over the limit is 413');
});

await suite('api: the scrypt cost is recorded with the hash', async () => {
  const signup = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'hashshape', password: 'lantern1' },
  });
  assertEqual(signup.statusCode, 200, 'the account was created');
  const stored = [...pool.users.values()].find((u) => u.username === 'hashshape');
  assert(!!stored, 'the user exists');
  assert(/^scrypt\$\d+\$\d+\$\d+\$/.test(stored.pw_hash), 'the hash records its cost parameters');
  assert(!stored.pw_hash.includes('lantern1'), 'the password is not in the hash');
});

await suite('api: repeated auth attempts are throttled', async () => {
  const ip = '203.0.113.7';
  let last = 0;
  for (let i = 0; i < 25; i++) {
    const req = {
      url: '/api/session',
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
      body: { action: 'login', name: 'Throttle', password: 'lantern1' },
      socket: {},
    };
    const res = makeRes();
    const handler = (await import('../api/index.js')).default;
    await handler(req, res);
    last = res.statusCode;
  }
  assertEqual(last, 429, 'the limiter eventually says 429');
});
