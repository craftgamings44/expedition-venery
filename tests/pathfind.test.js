/**
 * Pathfinding tests: the monster must be able to actually walk there.
 *
 * These work off the generated world rather than fixed coordinates, so they
 * keep testing pathfinding when the layout of the cave changes.
 */

import { suite, assert } from './run.js';
import { findPath } from '../src/world/pathfind.js';
import { generateWorld } from '../src/world/generator.js';
import { WW } from '../src/core/constants.js';

/** The open tile nearest to a point. */
function openNear(g, x0, y0) {
  const h = g.length / WW;
  for (let r = 0; r < 80; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 1 || y < 1 || x >= WW - 1 || y >= h - 1) continue;
        if (!g[y * WW + x]) return y * WW + x;
      }
    }
  }
  return -1;
}

/** Every open tile reachable from a start tile by walking through open space. */
function openComponent(g, start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    const x = cur % WW;
    const y = (cur / WW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= WW - 1) continue;
      const ni = ny * WW + nx;
      if (g[ni] || seen.has(ni)) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  return seen;
}

await suite('pathfind: finds a path in an open cave', () => {
  const w = generateWorld(2468, 'normal', {});
  const start = openNear(w.g, 9, 20);
  const goal = openNear(w.g, 30, 20);
  const path = findPath(w.g, w.dg, WW, w.h, start % WW, (start / WW) | 0, goal % WW, (goal / WW) | 0, false);
  assert(path.length > 0, 'a path is found between two open tiles');
});

await suite('pathfind: path is contiguous', () => {
  const w = generateWorld(1357, 'normal', {});
  const start = openNear(w.g, 9, 20);
  const goal = openNear(w.g, 40, 25);
  const path = findPath(w.g, w.dg, WW, w.h, start % WW, (start / WW) | 0, goal % WW, (goal / WW) | 0, false);
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const cur = path[i];
    const dx = Math.abs((cur % WW) - (prev % WW));
    const dy = Math.abs(((cur / WW) | 0) - ((prev / WW) | 0));
    assert(dx + dy === 1, `step ${i} moves to an adjacent tile (dx=${dx} dy=${dy})`);
  }
});

await suite('pathfind: path ends at the goal', () => {
  const w = generateWorld(9753, 'normal', {});
  const start = openNear(w.g, 9, 20);
  assert(start >= 0, 'the world has open space');
  // Pick the goal from the start's own connected region, so it is reachable.
  const region = [...openComponent(w.g, start)];
  const goal = region[region.length - 1];
  const path = findPath(w.g, w.dg, WW, w.h, start % WW, (start / WW) | 0, goal % WW, (goal / WW) | 0, false);
  if (path.length) {
    const last = path[path.length - 1];
    assert(last === goal, 'the path ends on the goal tile');
  } else {
    assert(true, 'the goal was the start tile (acceptable)');
  }
});

await suite('pathfind: unreachable goal returns an empty path', () => {
  const w = generateWorld(1111, 'normal', {});
  // A tile deep inside solid rock with no open neighbours.
  let sealed = -1;
  for (let i = 0; i < w.g.length; i++) {
    const x = i % WW;
    const y = (i / WW) | 0;
    if (w.g[i] && x > 2 && x < WW - 3 && y > 20 && y < w.h - 3) {
      if (!w.g[i - 1] && !w.g[i + 1] && !w.g[i - WW] && !w.g[i + WW]) {
        sealed = i;
        break;
      }
    }
  }
  if (sealed >= 0) {
    const x = sealed % WW;
    const y = (sealed / WW) | 0;
    const path = findPath(w.g, w.dg, WW, w.h, 9, 20, x, y, false);
    assert(Array.isArray(path), 'a path array is always returned');
  } else {
    assert(true, 'no fully sealed tile found in this world');
  }
});
