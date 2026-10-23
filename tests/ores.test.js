/**
 * Ore table tests.
 *
 * The ore list is a data table, but a few things depend on its shape: the
 * world grid stores ore as an index into it, the HUD lists it in order, and
 * the lucky-find roll weights it per difficulty.
 */

import { suite, assert, assertEqual } from './run.js';
import { ORES, ORE_IDS } from '../src/data/ores.js';
import { ORE_WEIGHTS, DIFFICULTY_IDS } from '../src/data/difficulty.js';
import { BIOMES } from '../src/data/biomes.js';
import { QUESTS, jobReq } from '../src/data/quests.js';
import { generateWorld } from '../src/world/generator.js';
import { WW } from '../src/core/constants.js';

await suite('ores: the list is ordered by value', () => {
  let last = -1;
  for (const k of ORE_IDS) {
    const o = ORES[k];
    assert(o.value > last, k + ' is worth more than the tier below it');
    last = o.value;
  }
  assertEqual(ORE_IDS[ORE_IDS.length - 1], 'diamond', 'diamond is the most valuable');
  assertEqual(ORE_IDS[ORE_IDS.length - 2], 'emerald', 'emerald is the second most valuable');
  assertEqual(ORES.emerald.color, '#2fce72', 'emerald is green');
});

await suite('ores: every ore is fully specified', () => {
  for (const k of ORE_IDS) {
    const o = ORES[k];
    assert(!!o.id && !!o.name, k + ' has an id and a name');
    assert(o.value > 0, k + ' is worth something');
    assert(o.coins > 0, k + ' has a coin value');
    assert(o.hardness >= 1, k + ' has a hardness');
    assert(/^#[0-9a-f]{6}$/i.test(o.color), k + ' has a colour');
    assert(o.tier >= 1, k + ' has a tier');
  }
});

await suite('ores: every difficulty weights every ore', () => {
  for (const d of DIFFICULTY_IDS) {
    for (const k of ORE_IDS) {
      const w = ORE_WEIGHTS[d]?.[k];
      assert(w !== undefined, d + ' has a weight for ' + k);
      assert(w >= 0, d + '/' + k + ' has a non-negative weight');
    }
  }
});

await suite('ores: diamonds are rarer than emeralds, which are rarer than rubies', () => {
  for (const d of DIFFICULTY_IDS) {
    const w = ORE_WEIGHTS[d];
    assert(w.diamond < w.emerald, d + ': diamonds are rarer than emeralds');
    assert(w.emerald < w.ruby, d + ': emeralds are rarer than rubies');
  }
});

await suite('ores: emerald carries the weight diamonds used to have', () => {
  // The old numbers, before emerald existed. Emerald takes the old diamond
  // weight and diamonds become a fifth of it.
  const oldDiamond = { easy: 0.0001, normal: 0.006, hard: 0.04 };
  for (const d of DIFFICULTY_IDS) {
    assertEqual(ORE_WEIGHTS[d].emerald, oldDiamond[d], d + ': emerald has the old diamond weight');
    assert(ORE_WEIGHTS[d].diamond < oldDiamond[d], d + ': diamonds are now rarer than they were');
  }
});

await suite('ores: emerald grows deep at the rate the old diamond did', () => {
  // The world is generated from the biome tables, so this is the contract that
  // actually decides how rare a gem is in a real run.
  const oldDiamond = { magma: 0.02, glacial: 0.06, abyss: 0.12 };
  for (const b of BIOMES) {
    if (!oldDiamond[b.id]) continue;
    assertEqual(b.oreTable.emerald, oldDiamond[b.id], b.id + ': emerald has the old diamond weight');
    assert(
      b.oreTable.diamond <= b.oreTable.emerald / 2,
      b.id + ': diamonds are at most half as common as emeralds'
    );
    assert(b.oreTable.diamond > 0, b.id + ': diamonds still grow here');
  }
});

await suite('ores: every biome names only ores that exist', () => {
  for (const b of BIOMES) {
    for (const k of Object.keys(b.oreTable)) {
      assert(ORE_IDS.includes(k), b.id + ' only names ores that exist (' + k + ')');
    }
  }
});

await suite('ores: emerald and diamond only grow deep', () => {
  for (const b of BIOMES) {
    if (b.id === 'shale' || b.id === 'ember') {
      assert(!b.oreTable.emerald, b.id + ' has no emerald');
      assert(!b.oreTable.diamond, b.id + ' has no diamond');
    }
  }
});

await suite('ores: the world generates emerald and diamond', () => {
  const w = generateWorld(31337, 'normal', { copper: 5, iron: 3 });
  const counts = {};
  for (let i = 0; i < w.o.length; i++) {
    if (!w.o[i]) continue;
    const k = ORE_IDS[w.o[i] - 1];
    counts[k] = (counts[k] || 0) + 1;
  }
  assert((counts.copper || 0) > 0, 'the world has copper');
  assert((counts.emerald || 0) > 0, 'the world has emerald');
  assert((counts.diamond || 0) > 0, 'the world has diamond');
});

await suite('ores: quests only ask for ores that exist', () => {
  for (const q of QUESTS) {
    for (const k of Object.keys(q.req)) {
      assert(ORE_IDS.includes(k), q.name + ' only asks for ores that exist (' + k + ')');
    }
  }
  for (let job = 0; job < 4; job++) {
    for (const k of Object.keys(jobReq(job))) {
      assert(ORE_IDS.includes(k), 'job ' + job + ' only asks for ores that exist (' + k + ')');
    }
  }
});

await suite('ores: the late quests ask for emeralds and diamonds', () => {
  const late = QUESTS.slice(5);
  assert(late.length > 0, 'there are late quests');
  assert(late.some((q) => q.req.emerald), 'a late quest asks for emeralds');
  assert(late.some((q) => q.req.diamond), 'a late quest asks for diamonds');
});
