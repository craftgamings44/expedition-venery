/**
 * Accounts.
 *
 * The game works with local accounts stored in localStorage. When a cloud
 * backend is configured, the same interface is used but the data lives on the
 * server and follows you across devices.
 *
 * The interface is deliberately small so the two implementations are
 * interchangeable:
 *
 *   signup(name, password) -> {ok, error?}
 *   login(name, password)  -> {ok, error?}
 *   logout()
 *   listSaves()            -> {difficulty: save}
 *   writeSave(save)
 *   currentUser()
 */

import { LS_ACCOUNTS } from '../core/constants.js';
import { state } from '../state/store.js';

/** Remembers which local account was last signed in, so a reload keeps you in. */
const LS_SESSION = 'ev_session';

/** Session token for the cloud backend, if signed in to one. */
let sessionToken = null;
/** Set when the cloud backend is reachable. */
let cloudAvailable = false;

/**
 * Read the local account table.
 * @returns {Object<string, Object>}
 */
function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Write the local account table.
 * @param {Object} accounts
 */
function writeLocal(accounts) {
  try {
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(accounts));
  } catch {
    /* storage blocked */
  }
}

/**
 * Hash a password for local storage. This is only a speed bump for a
 * single-player local profile — the cloud backend hashes server-side with a
 * proper KDF.
 * @param {string} user
 * @param {string} pass
 * @returns {Promise<string>}
 */
async function localHash(user, pass) {
  const s = 'ev|' + user + '|' + pass;
  if (globalThis.crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
    h2 = (h2 * 31 + s.charCodeAt(i) * 7) >>> 0;
  }
  return 'f' + h.toString(16) + h2.toString(16);
}

/**
 * Probe whether the cloud backend is configured and reachable.
 * @returns {Promise<boolean>}
 */
export async function detectCloud() {
  try {
    const res = await fetch('api/session', { method: 'GET', headers: authHeaders() });
    cloudAvailable = res.ok;
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.user) state.meta.user = data.user;
    }
  } catch {
    cloudAvailable = false;
  }
  return cloudAvailable;
}

/**
 * @returns {boolean} true when the cloud backend is in use
 */
export const usingCloud = () => cloudAvailable && !!sessionToken;

/**
 * Build request headers.
 * @returns {Object}
 */
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (sessionToken) h.Authorization = 'Bearer ' + sessionToken;
  return h;
}

/**
 * Restore the previous local session, if there was one.
 *
 * Players expect to stay signed in across a reload. For local accounts this
 * just remembers the username; for cloud accounts the server holds the real
 * session and this is a no-op.
 * @returns {Promise<boolean>} true when a session was restored
 */
export async function restoreSession() {
  if (usingCloud()) {
    const res = await fetch('api/session', { method: 'GET', headers: authHeaders() }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.user) {
        state.meta.user = data.user;
        return true;
      }
    }
    return false;
  }
  let name = null;
  try {
    name = localStorage.getItem(LS_SESSION);
  } catch {
    return false;
  }
  if (!name) return false;
  const accounts = readLocal();
  if (!accounts[name]) return false;
  state.meta.user = name;
  return true;
}

/**
 * Remember the signed-in local account so a reload keeps you in.
 */
function rememberSession(name) {
  try {
    localStorage.setItem(LS_SESSION, name);
  } catch {
    /* ignore */
  }
}

/**
 * Create an account.
 * @param {string} name
 * @param {string} password
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function signup(name, password) {
  if (name.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
  if (password.length < 4) return { ok: false, error: 'Password must be at least 4 characters.' };
  const key = name.toLowerCase();

  if (usingCloud()) {
    try {
      const res = await fetch('api/session', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'signup', name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Could not create the account.' };
      sessionToken = data.token;
      state.meta.user = key;
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server.' };
    }
  }

  const accounts = readLocal();
  if (accounts[key]) return { ok: false, error: 'That username is already taken.' };
  accounts[key] = { name, h: await localHash(key, password), saves: {} };
  writeLocal(accounts);
  state.meta.user = key;
  rememberSession(key);
  return { ok: true };
}

/**
 * Sign in.
 * @param {string} name
 * @param {string} password
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function login(name, password) {
  if (name.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
  if (password.length < 4) return { ok: false, error: 'Password must be at least 4 characters.' };
  const key = name.toLowerCase();

  if (usingCloud()) {
    try {
      const res = await fetch('api/session', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'login', name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Wrong username or password.' };
      sessionToken = data.token;
      state.meta.user = key;
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server.' };
    }
  }

  const accounts = readLocal();
  const acc = accounts[key];
  if (!acc || acc.h !== (await localHash(key, password))) {
    return { ok: false, error: 'Wrong username or password.' };
  }
  state.meta.user = key;
  rememberSession(key);
  return { ok: true };
}

/** Sign out. */
export function logout() {
  sessionToken = null;
  state.meta.user = null;
  try {
    localStorage.removeItem(LS_SESSION);
  } catch {
    /* ignore */
  }
}

/**
 * All saved campaigns for the current user, keyed by difficulty.
 * @returns {Promise<Object<string, Object>>}
 */
export async function listSaves() {
  if (usingCloud()) {
    try {
      const res = await fetch('api/saves', { headers: authHeaders() });
      if (res.ok) return (await res.json()).saves || {};
    } catch {
      /* fall through to local */
    }
  }
  const user = state.meta.user;
  if (!user) return {};
  return readLocal()[user]?.saves || {};
}

/**
 * Persist a campaign.
 * @param {Object} save
 * @returns {Promise<boolean>} success
 */
export async function writeSave(save) {
  const c = state.campaign;
  if (usingCloud()) {
    try {
      const res = await fetch('api/saves', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ difficulty: c.d, save }),
      });
      if (res.ok) return true;
    } catch {
      /* fall through to local */
    }
  }
  const user = state.meta.user;
  if (!user) return false;
  const accounts = readLocal();
  if (!accounts[user]) return false;
  accounts[user].saves = accounts[user].saves || {};
  accounts[user].saves[c.d] = save;
  writeLocal(accounts);
  return true;
}

/**
 * Erase every save for the current user.
 * @returns {Promise<boolean>}
 */
export async function eraseSaves() {
  if (usingCloud()) {
    try {
      await fetch('api/saves', { method: 'DELETE', headers: authHeaders() });
    } catch {
      /* ignore */
    }
  }
  const user = state.meta.user;
  if (!user) return false;
  const accounts = readLocal();
  if (accounts[user]) {
    accounts[user].saves = {};
    writeLocal(accounts);
  }
  return true;
}
