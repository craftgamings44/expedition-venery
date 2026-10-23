/**
 * Pickaxe tiers, carried over from V8.
 *
 * @typedef {Object} PickaxeDef
 * @property {number} id      tier index
 * @property {string} name
 * @property {number} p       price
 * @property {number} s       strength multiplier
 * @property {number} [l]     luck bonus
 * @property {number} [rb]    rare ore bonus multiplier
 * @property {number} [d]     deeprock expert multiplier
 * @property {string} c       colour
 * @property {string} icon    key into the asset manifest
 */

/** @type {PickaxeDef[]} */
export const PICKAXES = [
  { id: 0, name: 'Rusty Pickaxe', p: 0, s: 1, c: '#8a5a3a', icon: 'pickaxe.0' },
  { id: 1, name: 'Reinforced Pickaxe', p: 150, s: 1.5, c: '#a9a9a0', icon: 'pickaxe.1' },
  { id: 2, name: 'Steel Pickaxe', p: 750, s: 2.2, c: '#c3ccd6', icon: 'pickaxe.2' },
  { id: 3, name: 'Industrial Pickaxe', p: 3000, s: 3.2, c: '#f2a31f', icon: 'pickaxe.3' },
  { id: 4, name: 'Titanium Pickaxe', p: 12000, s: 4.5, l: 0.1, c: '#9fb4d0', icon: 'pickaxe.4' },
  { id: 5, name: 'Deepcore Pickaxe', p: 40000, s: 6, d: 1.35, l: 0.25, c: '#7a4ad8', icon: 'pickaxe.5' },
  { id: 6, name: "Prospector's Pickaxe", p: 100000, s: 7.5, l: 0.25, rb: 1.25, c: '#f4c430', icon: 'pickaxe.6' },
];

/** Pickaxe names by tier. */
export const PICKAXE_NAMES = PICKAXES.map((p) => p.name);

/** Luck upgrade prices. */
export const LUCK_PRICES = [50, 500, 1e4, 5e4, 15e4, 4e5, 1e6, 25e5, 6e6, 15e6];

/** Roman numerals for upgrade tiers. */
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Mining hardness per tile type. */
export const HARDNESS = [0, 1.2, 3.4, 6];

/** Base tile colours. */
export const MATERIAL_COLORS = ['', '#74512f', '#626d79', '#2b303b'];

/** Gear upgrades that are lost on death. */
export const GEAR = [
  { id: 'muff', name: 'Padded Pick Heads', price: 120, desc: 'Mining noise -55%. Lost on death.' },
  { id: 'scan', name: 'Ore Scanner', price: 180, desc: 'Pings nearby deposits. Lost on death.' },
];
