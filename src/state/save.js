/**
 * Save and load, with a versioned format and a migration chain.
 *
 * V8 wrote raw objects to localStorage with no version marker, which meant the
 * first content change would break every existing save. This module keeps
 * `SAVE_VERSION` and a chain of migrations so old saves keep working.
 */

import { SAVE_VERSION, MIN_SAVE_VERSION, LS_ACCOUNTS } from '../core/constants.js';
import { state } from './store.js';
import { ORE_IDS } from '../data/ores.js';
import { resetRun } from './store.js';

/**
 * Serialise the campaign portion of the state.
 * @returns {Object}
 */
export function serializeCampaign() {
  const c = state.campaign;
  return {
    v: SAVE_VERSION,
    d: c.d,
    q: c.q,
    money: c.money,
    coins: c.coins,
    pk: c.pk,
    own: [...c.own],
    lk: c.lk,
    gear: { ...c.gear },
    ro: c.ro || 0,
    rl: c.rl || 0,
    go: c.go || 0,
    gl: c.gl || 0,
    end: c.end,
    job: c.job,
    ended: c.ended,
    si: c.si,
    camp: { ...state.camp.buildings },
    skills: { unlocked: [...state.skills.unlocked], points: state.skills.points },
  };
}

/**
 * Apply a saved campaign onto the current state.
 * @param {Object} save
 * @returns {boolean} success
 */
export function deserializeCampaign(save) {
  if (!save || typeof save !== 'object') return false;
  const migrated = migrate(save);
  if (!migrated) return false;

  const c = state.campaign;
  c.d = migrated.d || 'normal';
  c.end = migrated.end ? 1 : 0;
  c.ended = migrated.ended ? 1 : 0;
  c.q = c.end ? 10 : Math.max(0, Math.min(9, migrated.q | 0));
  c.job = c.end ? Math.max(1, migrated.job | 0) : 0;
  c.money = Math.max(0, Number(migrated.money) || 0);
  c.coins = Math.max(0, Math.round((Number(migrated.coins) || 0) * 10) / 10);
  c.lk = Math.max(0, Math.min(10, migrated.lk | 0));
  c.own = [0].concat(
    (Array.isArray(migrated.own) ? migrated.own : []).filter((i) => Number.isInteger(i) && i > 0 && i < 7)
  );
  c.own = c.own.filter((v, i, a) => a.indexOf(v) === i);
  c.pk = c.own.includes(migrated.pk) ? migrated.pk : 0;
  c.gear = migrated.gear && typeof migrated.gear === 'object' ? { ...migrated.gear } : {};
  c.ro = migrated.ro ? 1 : 0;
  c.rl = c.ro ? Math.max(0, Math.min(10, migrated.rl | 0)) : 0;
  c.go = migrated.go ? 1 : 0;
  c.gl = c.go ? Math.max(0, Math.min(5, migrated.gl | 0)) : 0;
  c.si = migrated.si ?? (c.end ? 'j' + c.job : 'q' + c.q);

  state.camp.buildings = migrated.camp && typeof migrated.camp === 'object' ? { ...migrated.camp } : {};
  state.skills.unlocked = Array.isArray(migrated.skills?.unlocked) ? migrated.skills.unlocked.filter((x) => typeof x === 'string') : [];
  state.skills.points = Math.max(0, Number(migrated.skills?.points) || 0);
  return true;
}

/**
 * Run a save through the migration chain.
 * @param {Object} save
 * @returns {Object|null} migrated save, or null if it cannot be migrated
 */
export function migrate(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
  let v = Number(save.v) || 1;
  if (v < MIN_SAVE_VERSION || v > SAVE_VERSION) return null;
  let s = { ...save };
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) return null;
    s = fn(s) || null;
    if (!s) return null;
    v++;
    s.v = v;
  }
  return s;
}

/**
 * Migration steps, keyed by the version they upgrade FROM.
 * @type {Record<number, (save: Object) => Object>}
 */
const MIGRATIONS = {
  /**
   * v1 -> v2: camp buildings and the skill tree did not exist. Seed them
   * empty, and normalise the `own` list so a corrupt value cannot lock the
   * player out of their pickaxes.
   */
  1: (save) => ({
    ...save,
    camp: save.camp && typeof save.camp === 'object' ? save.camp : {},
    skills: save.skills && typeof save.skills === 'object' ? save.skills : { unlocked: [], points: 0 },
    own: Array.isArray(save.own) ? save.own.filter((i) => Number.isInteger(i) && i >= 0) : [0],
  }),
};

/**
 * Read all accounts for the current user out of localStorage.
 * @returns {Object<string, Object>}
 */
function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Write all accounts back to localStorage.
 * @param {Object<string, Object>} accounts
 */
function writeAccounts(accounts) {
  try {
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(accounts));
  } catch {
    /* storage blocked — the game still runs, it just will not persist */
  }
}

/**
 * Save the campaign for the current user and difficulty.
 * @returns {boolean} success
 */
export function saveCampaign() {
  const user = state.meta.user;
  if (!user) return false;
  const c = state.campaign;
  if (c.q >= 10 && !c.end) return false;
  const accounts = readAccounts();
  if (!accounts[user]) return false;
  accounts[user].saves = accounts[user].saves || {};
  accounts[user].saves[c.d] = serializeCampaign();
  writeAccounts(accounts);
  return true;
}

/**
 * Load the campaign for the current user and difficulty.
 * @param {string} difficultyId
 * @returns {Object|null} the saved campaign, or null
 */
export function loadCampaign(difficultyId) {
  const user = state.meta.user;
  if (!user) return null;
  const accounts = readAccounts();
  const save = accounts[user]?.saves?.[difficultyId];
  return save ? migrate(save) : null;
}

/**
 * Erase every save for the current user.
 */
export function eraseSaves() {
  const user = state.meta.user;
  if (!user) return;
  const accounts = readAccounts();
  if (accounts[user]) {
    accounts[user].saves = {};
    writeAccounts(accounts);
  }
}

/**
 * Reset the run state without touching the campaign.
 */
export { resetRun };

/**
 * A minimal, stable shape for a new save.
 * @param {string} difficultyId
 * @returns {Object}
 */
export function newSave(difficultyId) {
  const s = serializeCampaign();
  s.d = difficultyId;
  s.q = 0;
  s.money = 0;
  s.coins = 0;
  s.pk = 0;
  s.own = [0];
  s.lk = 0;
  s.gear = {};
  s.end = 0;
  s.job = 0;
  s.ended = 0;
  s.si = 'q0';
  s.camp = {};
  s.skills = { unlocked: [], points: 0 };
  return s;
}

export { ORE_IDS };
