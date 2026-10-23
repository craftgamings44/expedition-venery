/**
 * Save format tests: round-trip, versioning and the migration chain.
 */

import { suite, assert, assertEqual } from './run.js';
import { migrate, serializeCampaign, deserializeCampaign, newSave } from '../src/state/save.js';
import { state } from '../src/state/store.js';
import { SAVE_VERSION } from '../src/core/constants.js';

await suite('save: round trip', () => {
  state.campaign.d = 'normal';
  state.campaign.q = 3;
  state.campaign.money = 1234;
  state.campaign.coins = 56.7;
  state.campaign.pk = 2;
  state.campaign.own = [0, 1, 2];
  state.campaign.lk = 4;
  state.campaign.gear = { muff: 1 };
  state.camp.buildings = { workbench: 1 };
  state.skills.unlocked = ['quiet_step'];
  state.skills.points = 3;

  const saved = serializeCampaign();
  assertEqual(saved.v, SAVE_VERSION, 'the save carries the current version');

  // wipe, then restore
  state.campaign.q = 0;
  state.campaign.money = 0;
  state.campaign.own = [0];
  state.campaign.gear = {};
  state.camp.buildings = {};
  state.skills.unlocked = [];
  state.skills.points = 0;

  const ok = deserializeCampaign(saved);
  assert(ok, 'the save deserializes');
  assertEqual(state.campaign.q, 3, 'quest index survives');
  assertEqual(state.campaign.money, 1234, 'money survives');
  assertEqual(state.campaign.coins, 56.7, 'coins survive');
  assertEqual(state.campaign.pk, 2, 'equipped pickaxe survives');
  assertEqual(state.campaign.own, [0, 1, 2], 'owned pickaxes survive');
  assertEqual(state.campaign.lk, 4, 'luck survives');
  assertEqual(state.campaign.gear, { muff: 1 }, 'gear survives');
  assertEqual(state.camp.buildings, { workbench: 1 }, 'camp buildings survive');
  assertEqual(state.skills.unlocked, ['quiet_step'], 'skills survive');
  assertEqual(state.skills.points, 3, 'skill points survive');
});

await suite('save: new save shape', () => {
  const s = newSave('hard');
  assertEqual(s.v, SAVE_VERSION, 'a new save is at the current version');
  assertEqual(s.d, 'hard', 'a new save records its difficulty');
  assertEqual(s.q, 0, 'a new save starts at quest 0');
  assertEqual(s.own, [0], 'a new save owns only the rusty pickaxe');
  assertEqual(s.camp, {}, 'a new save has no camp buildings');
  assertEqual(s.skills, { unlocked: [], points: 0 }, 'a new save has no skills');
});

await suite('save: migration from v1', () => {
  const v1 = {
    v: 1,
    d: 'normal',
    q: 4,
    money: 500,
    coins: 10,
    pk: 1,
    own: [0, 1],
    lk: 2,
    gear: {},
    ro: 0, rl: 0, go: 0, gl: 0,
    end: 0, job: 0, ended: 0, si: 'q4',
  };
  const migrated = migrate(v1);
  assert(!!migrated, 'a v1 save migrates forward');
  assertEqual(migrated.v, SAVE_VERSION, 'the migrated save is at the current version');
  assertEqual(migrated.camp, {}, 'migration seeds empty camp buildings');
  assertEqual(migrated.skills, { unlocked: [], points: 0 }, 'migration seeds an empty skill tree');
  assertEqual(migrated.q, 4, 'migration preserves the quest index');
  assertEqual(migrated.money, 500, 'migration preserves money');
});

await suite('save: migration is idempotent', () => {
  const v1 = { v: 1, d: 'easy', q: 1, money: 10, coins: 0, pk: 0, own: [0], lk: 0, gear: {}, end: 0, job: 0, ended: 0, si: 'q1' };
  const once = migrate(v1);
  const twice = migrate(once);
  assertEqual(twice.v, SAVE_VERSION, 'migrating an already-current save is a no-op');
  assertEqual(twice.camp, once.camp, 'migrating twice does not change camp');
});

await suite('save: future versions are rejected', () => {
  const future = { v: SAVE_VERSION + 1, d: 'normal', q: 0 };
  assert(migrate(future) === null, 'a save from a newer build is not loaded');
});

await suite('save: garbage is rejected', () => {
  assert(migrate(null) === null, 'null is rejected');
  assert(migrate('nonsense') === null, 'a non-object is rejected');
  assert(migrate([]) === null, 'an array is rejected');
});

await suite('save: a V8-era save migrates forward', () => {
  // V8 stored saves with no version field at all. Those are the saves an
  // existing player already has, so they must load and keep their progress.
  const v8 = {
    q: 4, money: 2400, pk: 1, own: [0, 1], lk: 2, coins: 35,
    ro: 1, rl: 1, go: 0, gl: 0, end: 0, job: 0, ended: 0,
  };
  const migrated = migrate(v8);
  assert(!!migrated, 'a version-less V8 save migrates');
  assertEqual(migrated.v, SAVE_VERSION, 'the migrated save is at the current version');
  assertEqual(migrated.q, 4, 'the quest index is preserved');
  assertEqual(migrated.money, 2400, 'money is preserved');
  assertEqual(migrated.own, [0, 1], 'owned pickaxes are preserved');
  assertEqual(migrated.camp, {}, 'camp buildings are seeded empty');
  assertEqual(migrated.skills, { unlocked: [], points: 0 }, 'the skill tree is seeded empty');
});

await suite('save: corrupt values are clamped', () => {
  const bad = {
    v: SAVE_VERSION,
    d: 'normal',
    q: 999,
    money: -500,
    coins: -12,
    pk: 5,
    own: [0, 99, 'x', -3, 2],
    lk: 99,
    gear: null,
    end: 0, job: 0, ended: 0, si: 'q0',
  };
  const ok = deserializeCampaign(bad);
  assert(ok, 'a save with bad values still loads');
  assert(state.campaign.q >= 0 && state.campaign.q <= 9, 'the quest index is clamped');
  assert(state.campaign.money >= 0, 'money is clamped to zero or more');
  assert(state.campaign.coins >= 0, 'coins are clamped to zero or more');
  assert(state.campaign.lk <= 10, 'luck is clamped');
  assert(state.campaign.own.every((i) => Number.isInteger(i) && i >= 0 && i < 7), 'owned pickaxes are filtered');
  assert(state.campaign.own.includes(state.campaign.pk), 'the equipped pickaxe is one you own');
  assertEqual(state.campaign.gear, {}, 'a null gear object becomes empty');
});
