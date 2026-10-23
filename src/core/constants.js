/**
 * Global constants for the game.
 *
 * These are the numbers V8 established. Changing them changes the feel of the
 * game, so they live in one place rather than being scattered as literals.
 */

/** Canvas logical resolution. Everything renders at this size and is scaled. */
export const W = 960;
export const H = 540;

/** Tile size in pixels. */
export const T = 32;

/** World width in tiles. The cave is a tall, narrow shaft. */
export const WW = 90;

/**
 * Surface row index: rows 0..SF-1 are sky, SF and SF+1 are the surface.
 *
 * This is V8's number. The cave's start depth (`st` in the difficulty table)
 * is measured from here, so moving the surface would move the whole cave with
 * it — and moving it the wrong way would put the start of the cave above the
 * ground.
 */
export const SF = 10;

/** Save format version. Bump this whenever the save shape changes. */
export const SAVE_VERSION = 2;

/** Oldest save version this build can still migrate forward. */
export const MIN_SAVE_VERSION = 1;

/** localStorage keys. */
export const LS_SETTINGS = 'ev_settings';
export const LS_ACCOUNTS = 'ev_accounts';
