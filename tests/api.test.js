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
 * A tiny in-memory stand-in for a Postgres pool. It understands only the
 * queries the API actually sends.
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
      if (/^SELECT id FROM ev_sessions WHERE token/i.test(t)) {
        const s = sessions.get(params[0]);
        return { rows: s && s.expires_at > Date.now() ? [{ id: s.user_id }] : [], rowCount: 1 };
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
    body: { action: 'signup', name: 'Digger', password: 'lantern' },
  });
  assertEqual(signup.statusCode, 200, 'signup succeeds');
  assert(!!signup.body.token, 'signup returns a token');
  assertEqual(signup.body.user, 'digger', 'the username is stored lower case');

  const who = await call('GET', '/api/session', { token: signup.body.token });
  assertEqual(who.statusCode, 200, 'the token identifies the player');
  assertEqual(who.body.user, 'digger', 'the session reports the username');

  const login = await call('POST', '/api/session', {
    body: { action: 'login', name: 'Digger', password: 'lantern' },
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
    body: { action: 'signup', name: 'Digger', password: 'lantern' },
  });
  assertEqual(res.statusCode, 409, 'a second signup with the same name is 409');
});

await suite('api: input is validated', async () => {
  const shortName = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'ab', password: 'lantern' },
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
    body: { action: 'signup', name: 'Sapper', password: 'lantern' },
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
    body: { action: 'signup', name: 'Alpha', password: 'lantern' },
  });
  const b = await call('POST', '/api/session', {
    body: { action: 'signup', name: 'Beta', password: 'lantern' },
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

await suite('api: repeated auth attempts are throttled', async () => {
  const ip = '203.0.113.7';
  let last = 0;
  for (let i = 0; i < 25; i++) {
    const req = {
      url: '/api/session',
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
      body: { action: 'login', name: 'Throttle', password: 'lantern' },
      socket: {},
    };
    const res = makeRes();
    const handler = (await import('../api/index.js')).default;
    await handler(req, res);
    last = res.statusCode;
  }
  assertEqual(last, 429, 'the limiter eventually says 429');
});
