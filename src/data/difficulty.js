/**
 * Difficulty tuning, carried over from V8 and extended with biome awareness.
 *
 * @typedef {Object} DifficultyDef
 * @property {number} h        world height in rows
 * @property {number} st       row where stone starts
 * @property {number} dirt     chance of dirt
 * @property {number} deep     chance of deeprock
 * @property {number} df       depth fraction where deeprock starts
 * @property {number} lava     lava chance
 * @property {number} L        learning rate
 * @property {number} thr      noise threshold
 * @property {number} cs       chase speed
 * @property {number} sg       sight radius
 * @property {number} hr       hearing radius
 * @property {number} lose     seconds before it loses you
 */

/** @type {Record<string, DifficultyDef>} */
export const DIFFICULTY = {
  easy: { h: 60, st: 12, dirt: 0.1, deep: 0.02, df: 0.7, lava: 0, L: 0.5, thr: 0.8, cs: 3.7, sg: 7, hr: 0.8, lose: 2.2 },
  normal: { h: 80, st: 16, dirt: 0.22, deep: 0.1, df: 0.5, lava: 0.03, L: 1, thr: 0.6, cs: 4.4, sg: 9, hr: 1, lose: 4 },
  hard: { h: 100, st: 48, dirt: 0, deep: 0.65, df: 0, lava: 0.3, L: 1.8, thr: 0.4, cs: 5, sg: 11, hr: 1.25, lose: 6 },
};

/** Difficulty keys. */
export const DIFFICULTY_IDS = Object.keys(DIFFICULTY);

/**
 * Ore probability weights per difficulty. Used for the lucky-find roll.
 *
 * Emerald carries the weight diamonds used to have — they are the deep
 * strata's common find now — and diamonds are the rare prize on top of that.
 *
 * The world itself is generated from the biome ore tables, not from here; this
 * table only decides what a lucky find turns into. Normal gets a slightly
 * better diamond roll than a first pass gave it, because a normal run was
 * rolling almost none.
 * @type {Record<string, Record<string, number>>}
 */
export const ORE_WEIGHTS = {
  easy: { copper: 0.5, iron: 0.2, gold: 0.12, ruby: 0.008, emerald: 0.0001, diamond: 0.00002 },
  normal: { iron: 0.35, copper: 0.15, gold: 0.15, ruby: 0.04, emerald: 0.006, diamond: 0.0015 },
  hard: { iron: 0.4, gold: 0.18, ruby: 0.08, copper: 0.02, emerald: 0.04, diamond: 0.008 },
};
