/**
 * Inventory: the pack you carry.
 *
 * Ore counts, decoys, and the helpers that read and mutate them. Death empties
 * the pack — that is the core risk of the game.
 */

import { state } from '../state/store.js';
import { ORE_IDS } from '../data/ores.js';

/**
 * How many of an ore are carried.
 * @param {string} id
 * @returns {number}
 */
export const oreCount = (id) => state.inventory.ores[id] || 0;

/**
 * Add ore to the pack.
 * @param {string} id
 * @param {number} n
 */
export function addOre(id, n) {
  state.inventory.ores[id] = (state.inventory.ores[id] || 0) + n;
}

/**
 * Remove ore from the pack, clamped at zero.
 * @param {string} id
 * @param {number} n
 */
export function removeOre(id, n) {
  state.inventory.ores[id] = Math.max(0, (state.inventory.ores[id] || 0) - n);
}

/**
 * Empty the pack and lose the gear. Called on death.
 */
export function dropPack() {
  const dropped = { ...state.inventory.ores };
  state.inventory.ores = {};
  state.inventory.decoy = 0;
  state.campaign.gear = {};
  return dropped;
}

/**
 * A snapshot of the pack, for saving and for the body you leave behind.
 * @returns {Object}
 */
export function packSnapshot() {
  return { ores: { ...state.inventory.ores }, decoy: state.inventory.decoy };
}

/**
 * Restore a pack snapshot.
 * @param {Object} snap
 */
export function restorePack(snap) {
  if (!snap) return;
  state.inventory.ores = { ...(snap.ores || {}) };
  state.inventory.decoy = snap.decoy || 0;
}

/**
 * List of ores currently held, for the HUD.
 * @returns {Array<[string, number]>}
 */
export function heldOres() {
  return ORE_IDS.map((k) => [k, state.inventory.ores[k] || 0]).filter(([, n]) => n > 0);
}
