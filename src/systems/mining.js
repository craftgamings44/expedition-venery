/**
 * Mining: turning a broken tile into ore in the pack.
 *
 * The 'mining:complete' event is emitted by the player entity; this system
 * decides what the tile yields.
 */

import { WW } from '../core/constants.js';
import { on } from '../core/events.js';
import { state } from '../state/store.js';
import { addOre } from './inventory.js';
import { ORE_IDS, ORES } from '../data/ores.js';
import { rollLuckOre } from '../state/selectors.js';
import { TILE_EMPTY } from '../world/tiles.js';
import { toast } from './telegraph.js';

/** Deterministic random for lucky finds — seeded from the run seed. */
let rand = Math.random;

/**
 * Set the random source used for lucky finds. Keeping this seeded means a
 * run is reproducible.
 * @param {() => number} fn
 */
export function setMiningRandom(fn) {
  rand = fn;
}

/**
 * Handle a completed mine.
 * @param {Object} e
 */
function onMined(e) {
  const w = state.world;
  const i = e.y * WW + e.x;
  let oreIndex = w.o[i];
  let lucky = false;
  if (!oreIndex) {
    oreIndex = rollLuckOre(rand);
    lucky = !!oreIndex;
  }
  w.g[i] = TILE_EMPTY;
  w.dg[i] = 1;
  w.o[i] = 0;

  if (oreIndex) {
    const id = ORE_IDS[oreIndex - 1];
    addOre(id, 1);
    const coins = ORES[id].coins;
    state.campaign.coins = Math.round((state.campaign.coins + coins) * 10) / 10;
    toast(`+1 ${id}${lucky ? ' (lucky find!)' : ''} (+${coins} coins)`, ORES[id].color);
  }
}

on('mining:complete', onMined);
