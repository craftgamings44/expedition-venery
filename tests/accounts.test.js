/**
 * Cloud account client tests.
 *
 * The client is the half of the cloud path that used to be broken: it read a
 * 401 as "there is no backend", it asked for "api/session" instead of
 * "/api/session", and it forgot the session token on reload. These tests
 * pin all three.
 */

import { suite, assert, assertEqual } from './run.js';
import * as accounts from '../src/services/accounts.js';
import { state } from '../src/state/store.js';

/** localStorage stand-in. */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

/** Recorded fetch calls. */
let calls = [];
/** Programmed response. */
let respond = () => ({ ok: false, status: 503, json: async () => ({}) });

globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
  return respond(url, opts);
};

/**
 * Build a fake response.
 * @param {number} status
 * @param {any} body
 */
function reply(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/**
 * Put the client back to a clean slate.
 */
function reset() {
  accounts.logout();
  state.meta.user = null;
  store.clear();
  calls = [];
  respond = () => reply(503, { error: 'not configured' });
}

await suite('accounts: the backend answers 401 when nobody is signed in', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  const detected = await accounts.detectCloud();
  assert(detected, 'a 401 still means the backend is there');
  assert(accounts.cloudConfigured(), 'the client is in cloud mode');
  assert(!accounts.usingCloud(), 'but nobody is signed in yet');
});

await suite('accounts: 503 means there is no backend', async () => {
  reset();
  respond = () => reply(503, { error: 'not configured' });
  const detected = await accounts.detectCloud();
  assert(!detected, 'a 503 means cloud accounts are off');
  assert(!accounts.cloudConfigured(), 'the client stays in local mode');
});

await suite('accounts: an unreachable backend means local mode', async () => {
  reset();
  respond = () => {
    throw new Error('network down');
  };
  const detected = await accounts.detectCloud();
  assert(!detected, 'a dead network means cloud accounts are off');
});

await suite('accounts: signup uses the cloud when it is configured', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];
  respond = () => reply(200, { token: 'tok-123', user: 'digger' });

  const res = await accounts.signup('Digger', 'lantern1');
  assert(res.ok, 'the signup succeeds');
  assertEqual(calls.length, 1, 'exactly one request was made');
  assertEqual(calls[0].url, '/api/session', 'the API is asked for with an absolute path');
  assertEqual(calls[0].method, 'POST', 'signup is a POST');
  assertEqual(JSON.parse(calls[0].body).action, 'signup', 'the action is signup');
  assertEqual(store.get('ev_cloud_token'), 'tok-123', 'the token is kept on this device');
  assert(accounts.usingCloud(), 'the client is signed in to the cloud');
  assertEqual(state.meta.user, 'digger', 'the player is signed in');
});

await suite('accounts: the API is never asked for with a relative path', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];
  respond = () => reply(200, { token: 'tok-123', user: 'digger' });
  await accounts.signup('Digger', 'lantern1');
  await accounts.listSaves();
  await accounts.writeSave({ v: 2 });
  for (const c of calls) {
    assert(c.url.startsWith('/'), `"${c.url}" is an absolute path`);
  }
});

await suite('accounts: a reload keeps the cloud session', async () => {
  reset();
  store.set('ev_cloud_token', 'tok-123');
  respond = () => reply(200, { user: 'digger' });
  await accounts.detectCloud();
  calls = [];

  const restored = await accounts.restoreSession();
  assert(restored, 'the stored token restores the session');
  assertEqual(state.meta.user, 'digger', 'the player is signed in again');
  assert(accounts.usingCloud(), 'the cloud is in use');
});

await suite('accounts: a token the server rejects is thrown away', async () => {
  reset();
  store.set('ev_cloud_token', 'stale');
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];

  const restored = await accounts.restoreSession();
  assert(!restored, 'a stale token does not restore a session');
  assertEqual(store.get('ev_cloud_token'), undefined, 'the stale token is cleared');
  assert(!accounts.usingCloud(), 'the client is not signed in');
});

await suite('accounts: logging out clears the token', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];
  respond = () => reply(200, { token: 'tok-123', user: 'digger' });
  await accounts.signup('Digger', 'lantern1');
  assert(store.get('ev_cloud_token'), 'the token is there before the logout');

  accounts.logout();
  assertEqual(store.get('ev_cloud_token'), undefined, 'the token is gone after the logout');
  assertEqual(state.meta.user, null, 'nobody is signed in');
  assert(!accounts.usingCloud(), 'the client is not using the cloud');
});

await suite('accounts: logging out revokes the token on the server', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];
  respond = () => reply(200, { token: 'tok-123', user: 'digger' });
  await accounts.signup('Digger', 'lantern1');

  calls = [];
  respond = () => reply(200, { ok: true });
  accounts.logout();
  assertEqual(calls.length, 1, 'the server was told');
  assertEqual(calls[0].url, '/api/session', 'the session route is used');
  assertEqual(calls[0].method, 'DELETE', 'the request revokes the token');
  assertEqual(calls[0].headers.Authorization, 'Bearer tok-123', 'the token being revoked is sent');
});

await suite('accounts: a weak username is refused before the server sees it', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];
  respond = () => reply(200, { token: 'tok-123', user: 'x' });

  const bad = await accounts.signup('has space', 'lantern1');
  assert(!bad.ok, 'a username with a space is refused');
  const short = await accounts.signup('digger', 'short');
  assert(!short.ok, 'a short password is refused');
  assertEqual(calls.length, 0, 'nothing was sent to the server');
});

await suite('accounts: without a backend, accounts stay on this device', async () => {
  reset();
  respond = () => reply(503, { error: 'not configured' });
  await accounts.detectCloud();
  calls = [];

  const res = await accounts.signup('Digger', 'lantern1');
  assert(res.ok, 'the local signup succeeds');
  assertEqual(calls.length, 0, 'nothing was sent to the server');
  const accounts2 = JSON.parse(store.get('ev_accounts') || '{}');
  assert(!!accounts2.digger, 'the account was stored locally');
  assertEqual(state.meta.user, 'digger', 'the player is signed in locally');
});

await suite('accounts: saves go to the cloud when signed in', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];
  respond = () => reply(200, { token: 'tok-123', user: 'digger' });
  await accounts.signup('Digger', 'lantern1');

  calls = [];
  respond = () => reply(200, { saves: { normal: { v: 2, q: 4 } } });
  const saves = await accounts.listSaves();
  assertEqual(saves.normal.q, 4, 'the cloud save is returned');
  assertEqual(calls[0].url, '/api/saves', 'saves are asked for with an absolute path');
  assertEqual(calls[0].headers.Authorization, 'Bearer tok-123', 'the token is sent');

  calls = [];
  respond = () => reply(200, { ok: true });
  state.campaign.d = 'hard';
  const wrote = await accounts.writeSave({ v: 2, q: 1 });
  assert(wrote, 'the save is written');
  assertEqual(calls[0].method, 'POST', 'writing a save is a POST');
  assertEqual(JSON.parse(calls[0].body).difficulty, 'hard', 'the save goes under this difficulty');
});

await suite('accounts: a failed cloud save does not lose the campaign', async () => {
  reset();
  respond = () => reply(401, { error: 'Not signed in.' });
  await accounts.detectCloud();
  calls = [];
  respond = () => reply(200, { token: 'tok-123', user: 'digger' });
  await accounts.signup('Digger', 'lantern1');

  // The server is unreachable from here on.
  respond = () => {
    throw new Error('network down');
  };
  const saves = await accounts.listSaves();
  assertEqual(saves, {}, 'a dead server yields no saves rather than throwing');
});
