/**
 * World generation tests: determinism, biome stratification, and structure.
 */

import { suite, assert, assertEqual } from './run.js';
import { generateWorld } from '../src/world/generator.js';
import { biomeAtRow, BIOMES } from '../src/data/biomes.js';
import { WW, SF } from '../src/core/constants.js';
import { TILE_EMPTY, TILE_SURFACE } from '../src/world/tiles.js';
import { ORE_IDS } from '../src/data/ores.js';

await suite('worldgen: determinism', () => {
  const a = generateWorld(12345, 'normal', { copper: 5 });
  const b = generateWorld(12345, 'normal', { copper: 5 });
  assertEqual(Array.from(a.g), Array.from(b.g), 'same seed produces the same tile grid');
  assertEqual(Array.from(a.o), Array.from(b.o), 'same seed produces the same ore grid');
  assertEqual(a.lair, b.lair, 'same seed produces the same lair');
});

await suite('worldgen: different seeds differ', () => {
  const a = generateWorld(1, 'normal', {});
  const b = generateWorld(2, 'normal', {});
  let differences = 0;
  for (let i = 0; i < a.g.length; i++) if (a.g[i] !== b.g[i]) differences++;
  assert(differences > 0, 'different seeds produce different worlds');
});

await suite('worldgen: structure', () => {
  const w = generateWorld(999, 'normal', {});
  assert(w.h === 80, 'normal difficulty world is 80 rows tall');
  assert(w.g.length === WW * w.h, 'grid is width * height');
  assert(w.lair.x > 0 && w.lair.x < WW, 'lair is inside the world');
  assert(w.lair.y > SF, 'lair is below the surface');
});

await suite('worldgen: surface layer', () => {
  const w = generateWorld(4242, 'normal', {});
  for (let x = 0; x < WW; x++) {
    assert(w.g[SF * WW + x] === TILE_SURFACE, `surface row is solid at x=${x}`);
  }
});

await suite('worldgen: quest ores are guaranteed', () => {
  const req = { copper: 5, iron: 3 };
  const w = generateWorld(777, 'normal', req);
  const counts = {};
  for (let i = 0; i < w.o.length; i++) {
    if (w.o[i]) {
      const id = ORE_IDS[w.o[i] - 1];
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  assert((counts.copper || 0) >= 5, `world contains enough copper (got ${counts.copper || 0})`);
  assert((counts.iron || 0) >= 3, `world contains enough iron (got ${counts.iron || 0})`);
});

await suite('biomes: stratification', () => {
  // Every row below the surface maps to a defined biome.
  for (let y = SF; y < 80; y++) {
    const b = biomeAtRow(y, SF, 80);
    assert(!!b, `row ${y} maps to a biome`);
  }
  // The top row is the first biome, the bottom row is the last.
  assertEqual(biomeAtRow(SF, SF, 80).id, BIOMES[0].id, 'top row is the first biome');
  assertEqual(biomeAtRow(79, SF, 80).id, BIOMES[BIOMES.length - 1].id, 'bottom row is the last biome');
});

await suite('biomes: depth ranges are contiguous', () => {
  for (let i = 0; i < BIOMES.length - 1; i++) {
    assert(
      Math.abs(BIOMES[i].depth[1] - BIOMES[i + 1].depth[0]) < 1e-9,
      `biome ${BIOMES[i].id} ends where ${BIOMES[i + 1].id} begins`
    );
  }
});

await suite('biomes: deeper biomes are darker and richer', () => {
  for (let i = 1; i < BIOMES.length; i++) {
    assert(
      BIOMES[i].lightRadius <= BIOMES[i - 1].lightRadius,
      `${BIOMES[i].id} is at least as dark as ${BIOMES[i - 1].id}`
    );
    assert(
      BIOMES[i].monsterSpeed >= 1.0,
      `${BIOMES[i].id} monster is at least baseline speed`
    );
  }
  // The deepest biome is the fastest, and the surface is the slowest.
  const fastest = BIOMES.reduce((a, b) => (b.monsterSpeed > a.monsterSpeed ? b : a));
  const slowest = BIOMES.reduce((a, b) => (b.monsterSpeed < a.monsterSpeed ? b : a));
  assertEqual(fastest.id, BIOMES[BIOMES.length - 1].id, 'the deepest biome has the fastest monster');
  assertEqual(slowest.id, BIOMES[0].id, 'the shallowest biome has the slowest monster');
});

await suite('worldgen: open space exists', () => {
  const w = generateWorld(31337, 'normal', {});
  let open = 0;
  for (let i = 0; i < w.g.length; i++) if (w.g[i] === TILE_EMPTY) open++;
  assert(open > 200, `the cave has open space to walk in (got ${open})`);
});
