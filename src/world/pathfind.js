/**
 * Breadth-first pathfinding.
 *
 * The monster walks tile-to-tile through open space. It can also pass through
 * tiles it has already dug, and through rock it has adapted to dig through.
 *
 * V8 used a reusable Int32Array ring to avoid allocating on every query; this
 * keeps that, but the scratch buffers live in module scope rather than in
 * globals alongside the game state.
 */

/** @type {Int32Array|null} */
let queue = null;
/** @type {Int32Array|null} */
let prev = null;
/** @type {Uint32Array|null} */
let visited = null;
let visitStamp = 0;

/**
 * Find a path from (sx, sy) to (gx, gy).
 *
 * @param {Uint8Array} g tile grid
 * @param {Uint8Array} dg dug-marker grid
 * @param {number} width world width
 * @param {number} height world height
 * @param {number} sx start tile x
 * @param {number} sy start tile y
 * @param {number} gx goal tile x
 * @param {number} gy goal tile y
 * @param {boolean} canDig whether the monster may dig through marked tiles
 * @returns {number[]} array of tile indices from start (exclusive) to goal
 */
export function findPath(g, dg, width, height, sx, sy, gx, gy, canDig) {
  const n = width * height;
  if (!queue || queue.length !== n) {
    queue = new Int32Array(n);
    prev = new Int32Array(n);
    visited = new Uint32Array(n);
    visitStamp = 0;
  }
  visitStamp++;
  const stamp = visitStamp;

  const start = sy * width + sx;
  const goal = gy * width + gx;
  let head = 0;
  let tail = 0;
  let best = start;
  let bestDist = Infinity;

  queue[tail++] = start;
  visited[start] = stamp;
  prev[start] = -1;

  const passable = (idx, x, y) => {
    const v = g[idx];
    if (v === 0) return true;
    if (dg[idx] && canDig) return true;
    // Only passable if it's open above and below, or wedged in a corridor.
    if (g[idx - width] || g[idx + width]) return false;
    if (!g[idx - 1] || !g[idx + 1]) return false;
    return true;
  };

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur / width) | 0;
    const d = Math.abs(cx - gx) + Math.abs(cy - gy);
    if (d < bestDist) {
      bestDist = d;
      best = cur;
      if (d === 0) break;
    }
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0) - (k === 1);
      const ny = cy + (k === 2) - (k === 3);
      if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
      const ni = ny * width + nx;
      if (visited[ni] === stamp) continue;
      if (!passable(ni, nx, ny)) continue;
      visited[ni] = stamp;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }

  const path = [];
  for (let c = best; c !== -1 && c !== start; c = prev[c]) path.push(c);
  return path.reverse();
}
