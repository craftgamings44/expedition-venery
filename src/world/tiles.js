/**
 * Tile constants and property tables.
 *
 * Tile ids are numeric so the world grid can stay a flat Uint8Array.
 */

/** Empty / open space. */
export const TILE_EMPTY = 0;
/** Dirt — soft, quick to mine. */
export const TILE_DIRT = 1;
/** Rock. */
export const TILE_ROCK = 2;
/** Deeprock — slow, and the pickaxe struggles without an upgrade. */
export const TILE_DEEP = 3;
/** Surface bedrock — the ground you walk on, and the cave roof. */
export const TILE_SURFACE = 4;
/** Lava. Burns. */
export const TILE_LAVA = 5;
/** Elevator shaft structure. */
export const TILE_SHAFT = 6;

/** Tile ids that block movement. */
export const SOLID = [false, true, true, true, true, true, true];

/** Tile ids that can be mined. */
export const MINEABLE = [false, true, true, true, false, false, false];

/**
 * Is a tile solid at world position (x, y)?
 * Out-of-bounds above the world is open sky; out-of-bounds below is solid.
 * @param {Uint8Array} g tile grid
 * @param {number} width world width in tiles
 * @param {number} height world height in rows
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isSolid(g, width, height, x, y) {
  if (x < 0 || x >= width || y >= height) return true;
  if (y < 0) return false;
  const v = g[y * width + x];
  return !!v && v !== TILE_EMPTY;
}

/**
 * Is a tile mineable at (x, y)?
 * @param {Uint8Array} g
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isMineable(g, width, height, x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  return MINEABLE[g[y * width + x]] ?? false;
}
