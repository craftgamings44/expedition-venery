/**
 * Economy: the shop, the cave-item store, and money.
 *
 * Two currencies, as in V8: money comes from quest deliveries and buys
 * pickaxes, luck and gear; coins come from mining ore and buy the rope and the
 * grappling hook.
 */

import { state } from '../state/store.js';
import { PICKAXES, LUCK_PRICES, GEAR } from '../data/pickaxes.js';
import { modifiers } from '../state/selectors.js';
import { toast } from './telegraph.js';

/** Rope and grappling hook prices and upgrade ladders. */
export const ROPE_PRICE = 32;
export const HOOK_PRICE = 82;
export const ROPE_UPGRADES = [150, 300, 600, 1000, 1800, 3000, 5000, 8000, 12000, 20000];
export const HOOK_UPGRADES = [400, 900, 2000, 4500, 10000];

/** Cooldown for the grappling hook, in seconds. */
export const HOOK_COOLDOWN = () => 32 - 4 * state.campaign.gl;

/** Rope reach in blocks. */
export const ROPE_REACH = () => 8 + 2 * state.campaign.rl;

/** Grapple reach in blocks. */
export const HOOK_REACH = () => 20 + 4 * state.campaign.gl;

/**
 * Buy a pickaxe tier. Tiers must be unlocked in order.
 * @param {number} index
 * @returns {boolean} success
 */
export function buyPickaxe(index) {
  const c = state.campaign;
  const p = PICKAXES[index];
  if (!p) return false;
  if (c.own.includes(index)) return false;
  const price = Math.round(p.p * modifiers().shopDiscount);
  if (c.money < price) return false;
  if (index > 0 && !c.own.includes(index - 1)) return false;
  c.money -= price;
  c.own.push(index);
  c.pk = index;
  toast(`${p.name} bought and equipped`, '#8fe');
  return true;
}

/**
 * Equip an owned pickaxe.
 * @param {number} index
 * @returns {boolean}
 */
export function equipPickaxe(index) {
  if (!state.campaign.own.includes(index)) return false;
  state.campaign.pk = index;
  return true;
}

/**
 * Buy a luck level.
 * @param {number} index
 * @returns {boolean}
 */
export function buyLuck(index) {
  const c = state.campaign;
  const price = LUCK_PRICES[index];
  if (!price) return false;
  if (c.lk !== index) return false;
  if (c.money < price) return false;
  c.money -= price;
  c.lk++;
  toast(`Luck level ${c.lk}`, '#8fe');
  return true;
}

/**
 * Buy a gear item or a decoy bundle.
 * @param {string} key gear id, or 'd' for decoys
 * @returns {boolean}
 */
export function buyGear(key) {
  const c = state.campaign;
  if (key === 'd') {
    if ((state.inventory.decoy || 0) >= 9) return false;
    if (c.money < 60) return false;
    c.money -= 60;
    state.inventory.decoy = (state.inventory.decoy || 0) + 3;
    return true;
  }
  const g = GEAR.find((x) => x.id === key);
  if (!g) return false;
  if (c.gear[key]) return false;
  if (c.money < g.price) return false;
  c.money -= g.price;
  c.gear[key] = 1;
  return true;
}

/**
 * Buy the rope.
 * @returns {boolean}
 */
export function buyRope() {
  const c = state.campaign;
  if (c.ro || c.coins < ROPE_PRICE) return false;
  c.coins = Math.round((c.coins - ROPE_PRICE) * 10) / 10;
  c.ro = 1;
  return true;
}

/**
 * Buy the grappling hook.
 * @returns {boolean}
 */
export function buyHook() {
  const c = state.campaign;
  if (c.go || c.coins < HOOK_PRICE) return false;
  c.coins = Math.round((c.coins - HOOK_PRICE) * 10) / 10;
  c.go = 1;
  return true;
}

/**
 * Upgrade the rope reach.
 * @param {number} index
 * @returns {boolean}
 */
export function upgradeRope(index) {
  const c = state.campaign;
  const price = ROPE_UPGRADES[index];
  if (!price || !c.ro || c.rl !== index || c.coins < price) return false;
  c.coins = Math.round((c.coins - price) * 10) / 10;
  c.rl++;
  return true;
}

/**
 * Upgrade the grappling hook.
 * @param {number} index
 * @returns {boolean}
 */
export function upgradeHook(index) {
  const c = state.campaign;
  const price = HOOK_UPGRADES[index];
  if (!price || !c.go || c.gl !== index || c.coins < price) return false;
  c.coins = Math.round((c.coins - price) * 10) / 10;
  c.gl++;
  return true;
}

/** Format a number as money. */
export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

/** Format a number as coins. */
export const coins = (n) => (Math.round(n * 10) / 10).toLocaleString('en-US');
