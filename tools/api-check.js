/**
 * API smoke test against a running server and a real database.
 *
 *   node tools/api-check.js [baseUrl]
 *
 * Exits non-zero if anything fails, so it can be used as a deployment gate.
 */

const BASE = process.argv[2] || 'http://localhost:8080';

let failures = 0;

/**
 * @param {string} label
 * @param {boolean} ok
 * @param {*} detail
 */
function check(label, ok, detail) {
  if (ok) {
    console.log('  ok   ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' -> ' + JSON.stringify(detail)));
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {any} [body]
 * @param {string|null} [token]
 */
async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const name = 'probe' + Math.floor(Date.now() / 1000);
const password = 'lantern';

console.log('API check against ' + BASE);

const health = await call('GET', '/api/health');
if (health.status === 503) {
  console.log('The server has no database configured (DATABASE_URL is not set).');
  console.log('Point DATABASE_URL at the database, restart the server, and run this again.');
  console.log('Every check below would fail for that reason alone, so stop here.');
  process.exit(2);
}
check('health is 200', health.status === 200, health);
check('health says configured', health.json && health.json.configured === true, health.json);

const anon = await call('GET', '/api/session');
check('session without a token is 401', anon.status === 401, anon);

const signup = await call('POST', '/api/session', { action: 'signup', name, password });
check('signup is 200', signup.status === 200, signup);
const token = signup.json && signup.json.token;
check('signup returns a token', !!token, signup.json);

const who = await call('GET', '/api/session', undefined, token);
check('the token identifies the player', who.status === 200, who);
check('the username comes back', who.json && who.json.user === name, who.json);

const dup = await call('POST', '/api/session', { action: 'signup', name, password });
check('a taken username is 409', dup.status === 409, dup);

const wrong = await call('POST', '/api/session', { action: 'login', name, password: 'nope' });
check('a wrong password is 401', wrong.status === 401, wrong);

const login = await call('POST', '/api/session', { action: 'login', name, password });
check('login is 200', login.status === 200, login);
check('login returns a token', !!(login.json && login.json.token), login.json);

const save = { v: 2, d: 'normal', q: 4, money: 1234, coins: 12.5, own: [0, 1] };
const write = await call('POST', '/api/saves', { difficulty: 'normal', save }, token);
check('writing a save is 200', write.status === 200, write);

const reads = await call('GET', '/api/saves', undefined, token);
check('reading saves is 200', reads.status === 200, reads);
const got = reads.json && reads.json.saves && reads.json.saves.normal;
check('the save comes back', !!got, reads.json);
check('the quest index survives', got && got.q === 4, got);
check('the money survives', got && got.money === 1234, got);
check('the coins survive', got && got.coins === 12.5, got);

const other = await call('GET', '/api/saves', undefined, (await call('POST', '/api/session', { action: 'signup', name: name + 'b', password })).json.token);
check('another player sees no saves', other.json && Object.keys(other.json.saves || {}).length === 0, other.json);

const del = await call('DELETE', '/api/saves', undefined, token);
check('erasing saves is 200', del.status === 200, del);
const after = await call('GET', '/api/saves', undefined, token);
check('nothing is left after the erase', after.json && Object.keys(after.json.saves || {}).length === 0, after.json);

const missing = await call('GET', '/api/nope');
check('an unknown route is 404', missing.status === 404, missing);

console.log(failures ? '\n' + failures + ' check(s) failed' : '\nall checks passed');
process.exit(failures ? 1 : 0);
