/**
 * Biome strata.
 *
 * The depth biomes are the headline V9 mechanic, and their boundaries are
 * data, not code. These tests pin down the properties the renderer and the
 * generator rely on.
 */

import { suite, assert, assertEqual } from './run.js';
import { BIOMES, biomeAt, biomeAtRow, biomeById, HAZARDS } from '../src/data/biomes.js';
import { DIFFICULTY } from '../src/data/difficulty.js';
import { ORE_IDS } from '../src/data/ores.js';
import { generateWorld } from '../src/world/generator.js';
import { SF, WW } from '../src/core/constants.js';

await suite('biomes: the strata cover the whole depth without gaps', () => {
  assert(BIOMES.length >= 3, 'there is more than one stratum');
  assertEqual(BIOMES[0].depth[0], 0, 'the first stratum starts at the surface');
  for (let i = 1; i < BIOMES.length; i++) {
    assertEqual(
      BIOMES[i].depth[0],
      BIOMES[i - 1].depth[1],
      'stratum ' + i + ' starts where the previous one ends'
    );
  }
  assert(BIOMES[BIOMES.length - 1].depth[1] >= 1, 'the last stratum reaches the bottom');
});

await suite('biomes: a depth always resolves to exactly one stratum', () => {
  for (let f = 0; f <= 1.0001; f += 0.01) {
    const b = biomeAt(f);
    assert(!!b, 'depth ' + f.toFixed(2) + ' resolves to a biome');
    assert(
      f >= b.depth[0] && f < b.depth[1] || f >= 1,
      'depth ' + f.toFixed(2) + ' resolves to the stratum that contains it'
    );
  }
});

await suite('biomes: rows above the surface belong to the top stratum', () => {
  const b = biomeAtRow(SF - 8, SF, 80);
  assertEqual(b.id, BIOMES[0].id, 'the surface row is the first stratum, not the last');
  assertEqual(biomeAtRow(SF, SF, 80).id, BIOMES[0].id, 'the first underground row is the first stratum');
});

await suite('biomes: the deepest stratum is the fastest', () => {
  const top = BIOMES[0];
  const bottom = BIOMES[BIOMES.length - 1];
  assert(bottom.monsterSpeed > top.monsterSpeed, 'the monster is faster deeper down');
  assert(bottom.lightRadius < top.lightRadius, 'your light reaches less far deeper down');
});

await suite('biomes: every stratum is fully specified', () => {
  for (const b of BIOMES) {
    assert(!!b.id && !!b.name && !!b.desc, b.id + ' has an id, a name and a description');
    assert(!!b.palette.rock && !!b.palette.dirt && !!b.palette.ambient, b.id + ' has a full palette');
    assert(!!b.accent, b.id + ' has an accent colour');
    assert(b.oreDensity >= 0 && b.oreDensity <= 1, b.id + ' has a sane ore density');
    for (const h of b.hazards) {
      assert(!!HAZARDS[h], b.id + ' only names hazards that exist (' + h + ')');
    }
    assert(Object.keys(b.oreTable).length > 0, b.id + ' can yield something');
  }
});

await suite('biomes: lookup by id', () => {
  for (const b of BIOMES) {
    assertEqual(biomeById(b.id).id, b.id, b.id + ' round-trips');
  }
  assert(biomeById('nope') === undefined, 'an unknown id resolves to nothing');
});

await suite('worldgen: the cave starts below the surface', () => {
  for (const id of Object.keys(DIFFICULTY)) {
    assert(DIFFICULTY[id].st > SF, id + ': the cave starts below the surface, not above it');
  }
});

await suite('worldgen: the elevator lands the player in the top stratum', () => {  // The first quest asks for copper, which only grows in the top stratum.
  // If the elevator dropped you past it the quest would be impossible.
  for (const id of Object.keys(DIFFICULTY)) {
    const w = generateWorld(4242, id, { copper: 5, iron: 3 });
    const b = biomeAtRow(w.pad.f - 1, w.st, w.h);
    assertEqual(b.id, BIOMES[0].id, id + ': the pad is in the first stratum');
    assert(w.pad.f > SF, id + ': the pad is below the surface');
    assertEqual(w.st, w.pad.f, id + ': the strata are anchored to the pad');
    assert(w.st < w.h, id + ': the strata have room below the pad');
  }
});

await suite('worldgen: quest one can be filled from the first stratum', () => {
  // The whole point of anchoring the strata to the pad: the copper and iron
  // the first job demands are reachable without going deep.
  const cu = ORE_IDS.indexOf('copper') + 1;
  const fe = ORE_IDS.indexOf('iron') + 1;
  for (const id of Object.keys(DIFFICULTY)) {
    const w = generateWorld(4242, id, { copper: 5, iron: 3 });
    let copper = 0;
    let iron = 0;
    for (let y = w.st; y < w.h; y++) {
      if (biomeAtRow(y, w.st, w.h).id !== BIOMES[0].id) continue;
      for (let x = 0; x < WW; x++) {
        const v = w.o[y * WW + x];
        if (v === cu) copper++;
        else if (v === fe) iron++;
      }
    }
    assert(copper >= 5, id + ': the first stratum holds enough copper for quest one');
    assert(iron >= 3, id + ': the first stratum holds enough iron for quest one');
  }
});
