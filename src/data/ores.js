/**
 * Ore definitions.
 *
 * Ores are table entries, not code branches. Adding one here is enough for it
 * to appear in the world, the HUD, the shop and the quest system.
 *
 * @typedef {Object} OreDef
 * @property {string} id        internal key
 * @property {string} name      display name
 * @property {number} value     base sale value (money)
 * @property {number} coins     coin value (bought with ore, spent on cave items)
 * @property {number} hardness  mining time multiplier contribution
 * @property {string} color     UI / world colour
 * @property {string} icon      key into the asset manifest
 * @property {number} tier      rarity rank, higher = rarer
 */

/** @type {Record<string, OreDef>} */
export const ORES = {
  copper: { id: 'copper', name: 'Copper', value: 15, coins: 2.5, hardness: 1.0, color: '#d9783a', icon: 'ore.copper', tier: 1 },
  iron: { id: 'iron', name: 'Iron', value: 30, coins: 12, hardness: 1.2, color: '#c3ccd6', icon: 'ore.iron', tier: 2 },
  gold: { id: 'gold', name: 'Gold', value: 90, coins: 6, hardness: 1.4, color: '#f4c430', icon: 'ore.gold', tier: 3 },
  ruby: { id: 'ruby', name: 'Ruby', value: 400, coins: 80, hardness: 1.7, color: '#e51b4b', icon: 'ore.ruby', tier: 4 },
  emerald: { id: 'emerald', name: 'Emerald', value: 900, coins: 500, hardness: 1.85, color: '#2fce72', icon: 'ore.emerald', tier: 5 },
  diamond: { id: 'diamond', name: 'Diamond', value: 1500, coins: 12000, hardness: 2.0, color: '#6af0ff', icon: 'ore.diamond', tier: 6 },
};

/**
 * Ore keys in tier order.
 *
 * The world grid stores an ore as this list's index plus one, so the order is
 * part of the game's data contract — but nothing in a save refers to it, and
 * the world is regenerated every run, so a new ore can be slotted in.
 */
export const ORE_IDS = Object.keys(ORES);

/** Ore value lookup by 1-based index (the world grid stores ore as index+1). */
export const oreValue = (i) => ORES[ORE_IDS[i - 1]]?.value ?? 0;

/** Ore coin lookup by 1-based index. */
export const oreCoins = (i) => ORES[ORE_IDS[i - 1]]?.coins ?? 0;
