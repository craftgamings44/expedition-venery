/**
 * World generation.
 *
 * The cave is carved in depth strata. Each stratum draws from its biome's
 * palette, ore table and hazard set, so going deeper genuinely changes what you
 * find. Generation is seeded and deterministic: the same seed always produces
 * the same world, which the tests depend on.
 */

import { WW, SF } from '../core/constants.js';
import { rng, hs, cl } from '../core/math.js';
import { BIOMES, biomeAtRow } from '../data/biomes.js';
import { DIFFICULTY } from '../data/difficulty.js';
import { ORE_IDS } from '../data/ores.js';
import { TILE_EMPTY, TILE_DIRT, TILE_ROCK, TILE_DEEP, TILE_SURFACE, TILE_LAVA, TILE_SHAFT } from './tiles.js';

/**
 * @typedef {Object} GeneratedWorld
 * @property {Uint8Array} g tile grid
 * @property {Uint8Array} o ore grid (1-based index into ORE_IDS)
 * @property {Uint8Array} dg dug markers
 * @property {number} h height in rows
 * @property {Object} D difficulty tuning
 * @property {Object} pad elevator pad
 * @property {Object} lair monster lair
 * @property {Object[]} biomes resolved biome per stratum
 */

/**
 * Generate a world.
 *
 * @param {number} seed
 * @param {string} difficultyId
 * @param {Object<string, number>} [req] ore the quest demands, so the world always contains enough
 * @returns {GeneratedWorld}
 */
export function generateWorld(seed, difficultyId, req = {}) {
  const rand = rng(seed);
  const D = DIFFICULTY[difficultyId] ?? DIFFICULTY.normal;
  const h = D.h;
  const g = new Uint8Array(WW * h);
  const o = new Uint8Array(WW * h);
  const dg = new Uint8Array(WW * h);
  const I = (x, y) => y * WW + x;

  // ---- 1. carve the cave -------------------------------------------------
  // The carve runs into a mask rather than straight into the grid: the depth
  // strata are anchored to the elevator pad, and the pad's row is only known
  // once the cave's shape is known.
  const carved = new Uint8Array(WW * h);
  const carve = (cx, cy, rx, ry) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x > 1 && x < WW - 2 && y > D.st - 4 && y < h - 2) {
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
            carved[I(x, y)] = 1;
          }
        }
      }
    }
  };

  const pts = [[9, D.st]];
  carve(9, D.st, 8, 4);
  for (let w = 0; w < 17; w++) {
    const p = pts[(rand() * pts.length) | 0];
    let x = p[0];
    let y = p[1];
    let a = rand() * 6.28;
    const n = 60 + ((rand() * 80) | 0);
    const rr = 1.5 + rand() * 0.6;
    for (let i = 0; i < n; i++) {
      a += (rand() - 0.5) * 0.7;
      x += Math.cos(a);
      y += Math.sin(a) * 0.8 + 0.08;
      if (x < 4 || x > WW - 5) {
        a = Math.PI - a;
        x = cl(x, 4, WW - 5);
      }
      y = cl(y, D.st, h - 5);
      carve(x, y, rr + 1, rr + 0.5);
      pts.push([x | 0, y | 0]);
    }
    if (rand() < 0.55) carve(x, y, 4 + rand() * 3, 2.5 + rand() * 1.5);
  }

  // ---- 1b. the lair ------------------------------------------------------
  const lx = WW - 14;
  const ly = h - 8;
  carve(lx, ly, 9, 5);
  let b = pts.reduce((a, c) => (Math.hypot(c[0] - lx, c[1] - ly) < Math.hypot(a[0] - lx, a[1] - ly) ? c : a));
  let tx = b[0];
  let ty = b[1];
  for (let i = 0; i < 300 && (Math.abs(lx - tx) > 2 || Math.abs(ly - ty) > 2); i++) {
    if (Math.abs(lx - tx) > Math.abs(ly - ty)) tx += Math.sign(lx - tx);
    else ty += Math.sign(ly - ty);
    carve(tx, ty, 2.3, 2.2);
  }

  // ---- 2. the elevator pad ------------------------------------------------
  // The pad sits on the floor of the cave's first tunnel, the way V8 put it:
  // find the first solid cell in the shaft's column and stand on that. The
  // chamber above it is opened out, so the player can step off the pad into
  // the tunnels rather than being sealed in a box of bedrock.
  let fr = D.st;
  while (fr < h - 2 && carved[I(6, fr)]) fr++;

  // The depth strata are measured from the pad, not from the difficulty's
  // nominal cave start. The pad is where the elevator sets you down, so
  // anchoring the strata to it guarantees you always arrive in the first
  // stratum — where quest one's copper grows. Anchoring to `D.st` instead
  // dropped the pad into the second stratum on easy and hard.
  const st = fr;

  // ---- 3. base stone column, stratified by biome -------------------------
  for (let y = SF; y < h; y++) {
    const f = (y - SF) / (h - SF);
    const biome = biomeAtRow(y, st, h);
    for (let x = 0; x < WW; x++) {
      let m = biome.wall;
      if (y <= SF + 1) {
        m = TILE_SURFACE;
      } else {
        // difficulty dirt chance softens the biome wall
        if (rand() < D.dirt) m = TILE_DIRT;
        if (f >= D.df && rand() < D.deep) m = TILE_DEEP;
        if (biome.id !== 'shale' && rand() < D.dirt * 0.4) m = TILE_DIRT;
      }
      g[I(x, y)] = m;
    }
  }

  // ---- 4. open the carved tunnels ----------------------------------------
  for (let i = 0; i < g.length; i++) {
    if (carved[i]) {
      g[i] = TILE_EMPTY;
      o[i] = 0;
    }
  }

  // ---- 5. ore veins ------------------------------------------------------
  for (let y = D.st; y < h - 1; y++) {
    const biome = biomeAtRow(y, st, h);
    for (let x = 1; x < WW - 1; x++) {
      const i = I(x, y);
      if (!g[i]) continue;
      if (rand() < biome.oreDensity) {
        const pick = rollBiomeOre(biome.oreTable, rand);
        if (pick) {
          o[i] = pick;
          // vein: spread a little
          if (rand() < 0.3) {
            const j = rand() < 0.5 ? i + 1 : i + WW;
            if (g[j] >= 1 && g[j] <= 3 && !o[j]) o[j] = pick;
          }
        }
      }
    }
  }

  // ---- 6. the shaft, the chamber and the pad -----------------------------
  // the shaft the cage comes down, from the surface to the chamber
  for (let y = SF + 2; y < Math.max(fr - 4, SF + 2); y++) {
    g[I(5, y)] = TILE_SHAFT;
    g[I(6, y)] = TILE_SHAFT;
  }
  // the chamber the elevator opens into
  for (let y = Math.max(fr - 4, SF + 2); y < fr; y++) {
    for (let x = 4; x <= 8; x++) g[I(x, y)] = TILE_EMPTY;
  }
  for (let x = 4; x <= 8; x++) g[I(x, fr)] = TILE_SURFACE;

  // ---- 7. hazards per biome ---------------------------------------------
  for (let y = D.st + 6; y < h - 2; y++) {
    const biome = biomeAtRow(y, st, h);
    if (!biome.hazards.includes('lava')) continue;
    for (let x = 2; x < WW - 2; x++) {
      const i = I(x, y);
      if (!g[i] && g[i + WW] && g[i + WW] < TILE_LAVA && rand() < D.lava * 0.2) {
        if (Math.abs(x - lx) > 11 || Math.abs(y - ly) > 7) {
          g[i + WW] = TILE_LAVA;
          if (!g[i + 1 + WW] && g[i + 1 + WW]) g[i + 1 + WW] = TILE_LAVA;
        }
      }
    }
  }

  // ---- 8. guarantee the quest's ores exist --------------------------------
  // The backstop only fires when the world did not roll enough of an ore. It
  // places the shortfall in a stratum that actually grows that ore, so a
  // quest can never ask for copper that only exists in the abyss — and the
  // deep ores stay deep, because every band that grows them is in the pool.
  const counts = ORE_IDS.map((key, j) => {
    const rows = oreRows(key, st, h);
    let n = 0;
    for (const y of rows) {
      for (let x = 0; x < WW; x++) if (o[I(x, y)] === j + 1) n++;
    }
    return n;
  });
  ORE_IDS.forEach((key, j) => {
    const need = req[key] ? Math.ceil(req[key] * 1.5) + 2 : 0;
    if (!need) return;
    const rows = oreRows(key, st, h);
    for (let t = 0; counts[j + 1] < need && t < 5e4; t++) {
      const x = 2 + ((rand() * (WW - 4)) | 0);
      const y = rows.length
        ? rows[(rand() * rows.length) | 0]
        : D.st + 3 + ((rand() * (h - D.st - 6)) | 0);
      const i = I(x, y);
      if (g[i] >= 1 && g[i] <= 3 && !o[i] && (Math.abs(x - lx) > 9 || Math.abs(y - ly) > 5)) {
        o[i] = j + 1;
        counts[j + 1]++;
      }
    }
  });

  // ---- 9. surface layer --------------------------------------------------
  for (let x = 0; x < WW; x++) {
    for (let y = SF; y <= SF + 1; y++) {
      g[I(x, y)] = TILE_SURFACE;
      o[I(x, y)] = 0;
      dg[I(x, y)] = 0;
    }
  }

  return { g, o, dg, h, D, st, pad: { x: 6.5, f: fr }, lair: { x: lx, y: ly }, biomes: BIOMES };
}

/**
 * Every world row in a stratum that grows an ore.
 *
 * Used by the quest backstop: a shortfall of copper is placed in the shale,
 * a shortfall of diamonds in the deep strata where diamonds live, never in a
 * band where that ore could not have formed.
 * @param {string} ore ore id
 * @param {number} st first row of the cave
 * @param {number} h world height in rows
 * @returns {number[]}
 */
function oreRows(ore, st, h) {
  const rows = [];
  const span = Math.max(1, h - st);
  for (const b of BIOMES) {
    if (!(b.oreTable[ore] > 0)) continue;
    const top = st + Math.ceil(b.depth[0] * span);
    const bot = Math.min(st + Math.ceil(b.depth[1] * span), h - 3);
    for (let y = Math.max(top, st); y < bot; y++) rows.push(y);
  }
  return rows;
}

/**
 * Roll an ore type from a biome's ore table.
 * @param {Object<string, number>} table ore id -> weight
 * @param {() => number} rand
 * @returns {number} 1-based index into ORE_IDS, or 0
 */
function rollBiomeOre(table, rand) {
  const entries = ORE_IDS.map((k) => [k, table[k] || 0]).filter(([, w]) => w > 0);
  if (!entries.length) return 0;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return ORE_IDS.indexOf(k) + 1;
  }
  return ORE_IDS.indexOf(entries[0][0]) + 1;
}

/**
 * Build the decorative menu background: a deeprock hall inside the mountain.
 * @returns {GeneratedWorld}
 */
export function generateMenuWorld() {
  const w = generateWorld(77, 'hard', {});
  const rand = rng(4242);
  const HY = 50;
  for (let y = HY - 12; y <= HY + 12; y++) {
    for (let x = 0; x < WW; x++) {
      const i = y * WW + x;
      w.g[i] = rand() < 0.05 ? TILE_ROCK : TILE_DEEP;
      w.o[i] = 0;
      if (rand() < 0.17) {
        const q = rand();
        w.o[i] = q < 0.28 ? 1 : q < 0.52 ? 2 : q < 0.76 ? 3 : q < 0.92 ? 4 : 5;
      }
    }
  }
  for (let y = HY; y <= HY + 3; y++) for (let x = 0; x < WW; x++) { w.g[y * WW + x] = TILE_EMPTY; w.o[y * WW + x] = 0; }
  for (let x = 0; x < WW; x++) w.g[(HY + 4) * WW + x] = TILE_DEEP;
  w.hy = HY;
  return w;
}
