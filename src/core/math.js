/**
 * Small math and random helpers.
 *
 * `rng` and `hs` are the deterministic generators from V8. World generation must
 * depend only on the seed, so these are never replaced with Math.random().
 */

/** Clamp a value into [lo, hi]. */
export const cl = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Random float in [a, b). Uses Math.random — for cosmetic use only. */
export const rnd = (a, b) => a + Math.random() * (b - a);

/** Integer random in [a, b]. Cosmetic use only. */
export const rndi = (a, b) => Math.floor(rnd(a, b + 1));

/**
 * Deterministic 32-bit LCG. Same seed always yields the same sequence.
 * @param {number} s seed
 * @returns {() => number} generator returning floats in [0, 1)
 */
export const rng = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

/**
 * Deterministic 2D hash to [0, 1). Used for per-tile visual variation.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export const hs = (x, y) => ((Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0) / 4294967296;

/** Distance between two points. */
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Squared distance — avoids the sqrt when only comparing. */
export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

/** Smoothstep easing. */
export const smooth = (t) => t * t * (3 - 2 * t);

/** Ease-out cubic. */
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
