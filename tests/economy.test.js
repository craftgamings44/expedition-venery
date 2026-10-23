/**
 * Economy and progression tests: money, shop invariants, camp and skills.
 */

import { suite, assert, assertEqual } from './run.js';
import { state } from '../src/state/store.js';
import { buyPickaxe, equipPickaxe, buyLuck, buyGear, buyRope, buyHook, upgradeRope, upgradeHook, ROPE_PRICE, HOOK_PRICE } from '../src/systems/economy.js';
import { buildCamp, unlockSkill, canUnlockSkill } from '../src/systems/progression.js';
import { addOre, removeOre, dropPack, packSnapshot, restorePack, oreCount } from '../src/systems/inventory.js';
import { canDeliver, currentTask, carriedCount, luckMultiplier, mineTime, modifiers, moveSpeed } from '../src/state/selectors.js';
import { PICKAXES } from '../src/data/pickaxes.js';

function resetCampaign() {
  state.campaign.money = 100000;
  state.campaign.coins = 1000;
  state.campaign.pk = 0;
  state.campaign.own = [0];
  state.campaign.lk = 0;
  state.campaign.gear = {};
  state.campaign.ro = 0;
  state.campaign.rl = 0;
  state.campaign.go = 0;
  state.campaign.gl = 0;
  state.campaign.q = 0;
  state.campaign.end = 0;
  state.campaign.job = 0;
  state.inventory.ores = {};
  state.inventory.decoy = 0;
  state.camp.buildings = {};
  state.skills.unlocked = [];
  state.skills.points = 0;
}

await suite('economy: pickaxes must be bought in order', () => {
  resetCampaign();
  assert(buyPickaxe(2) === false, 'a pickaxe cannot be skipped past');
  assert(buyPickaxe(1) === true, 'the next pickaxe in order can be bought');
  assert(buyPickaxe(1) === false, 'a pickaxe cannot be bought twice');
  assert(buyPickaxe(2) === true, 'the next one unlocks after buying the previous');
  assertEqual(state.campaign.own, [0, 1, 2], 'owned pickaxes are tracked');
});

await suite('economy: pickaxes need money', () => {
  resetCampaign();
  state.campaign.money = 0;
  assert(buyPickaxe(1) === false, 'a pickaxe you cannot afford is not bought');
  assertEqual(state.campaign.own, [0], 'nothing was bought');
});

await suite('economy: equipping', () => {
  resetCampaign();
  buyPickaxe(1);
  buyPickaxe(2);
  assert(equipPickaxe(1) === true, 'an owned pickaxe can be equipped');
  assertEqual(state.campaign.pk, 1, 'the equipped pickaxe changes');
  assert(equipPickaxe(5) === false, 'an unowned pickaxe cannot be equipped');
  assertEqual(state.campaign.pk, 1, 'the equipped pickaxe is unchanged after a failed equip');
});

await suite('economy: luck', () => {
  resetCampaign();
  const before = luckMultiplier();
  assert(buyLuck(0) === true, 'the first luck level can be bought');
  assert(luckMultiplier() > before, 'buying luck raises the multiplier');
  assert(buyLuck(0) === false, 'the same luck level cannot be bought twice');
  assert(buyLuck(1) === true, 'the next luck level unlocks');
});

await suite('economy: gear is lost on death', () => {
  resetCampaign();
  assert(buyGear('muff') === true, 'gear can be bought');
  assertEqual(state.campaign.gear, { muff: 1 }, 'gear is owned');
  assert(buyGear('muff') === false, 'gear cannot be bought twice');
  dropPack();
  assertEqual(state.campaign.gear, {}, 'gear is lost when the pack is dropped');
});

await suite('economy: decoys are capped', () => {
  resetCampaign();
  for (let i = 0; i < 3; i++) buyGear('d');
  assertEqual(state.inventory.decoy, 9, 'decoys accumulate in bundles of three');
  assert(buyGear('d') === false, 'decoys cannot exceed the cap');
});

await suite('economy: coins buy cave items', () => {
  resetCampaign();
  state.campaign.coins = ROPE_PRICE;
  assert(buyRope() === true, 'the rope can be bought with coins');
  assertEqual(state.campaign.coins, 0, 'coins are deducted');
  assert(buyRope() === false, 'the rope cannot be bought twice');
  state.campaign.coins = HOOK_PRICE;
  assert(buyHook() === true, 'the grappling hook can be bought with coins');
  assert(buyHook() === false, 'the hook cannot be bought twice');
});

await suite('economy: upgrades require the base item', () => {
  resetCampaign();
  state.campaign.coins = 100000;
  assert(upgradeRope(0) === false, 'rope upgrades are locked before the rope is owned');
  buyRope();
  assert(upgradeRope(0) === true, 'rope upgrades unlock once the rope is owned');
  assertEqual(state.campaign.rl, 1, 'the rope level advances');
  assert(upgradeHook(0) === false, 'hook upgrades are locked before the hook is owned');
  buyHook();
  assert(upgradeHook(0) === true, 'hook upgrades unlock once the hook is owned');
});

await suite('inventory: add, remove, drop', () => {
  resetCampaign();
  addOre('copper', 5);
  assertEqual(oreCount('copper'), 5, 'ore is added to the pack');
  removeOre('copper', 3);
  assertEqual(oreCount('copper'), 2, 'ore is removed from the pack');
  removeOre('copper', 99);
  assertEqual(oreCount('copper'), 0, 'removing more than you have clamps at zero');
  addOre('gold', 2);
  const snap = packSnapshot();
  dropPack();
  assertEqual(carriedCount(), 0, 'dropping the pack empties it');
  restorePack(snap);
  assertEqual(oreCount('gold'), 2, 'a pack snapshot can be restored');
});

await suite('inventory: load slows you down', () => {
  resetCampaign();
  const empty = moveSpeed();
  for (let i = 0; i < 50; i++) addOre('diamond', 1);
  assert(moveSpeed() < empty, 'a heavy pack slows you down');
});

await suite('quest: delivery requires the right ore', () => {
  resetCampaign();
  const task = currentTask();
  assert(!canDeliver(), 'an empty pack cannot deliver');
  for (const [k, n] of Object.entries(task.r)) addOre(k, n);
  assert(canDeliver(), 'a full pack can deliver');
});

await suite('progression: camp buildings', () => {
  resetCampaign();
  state.campaign.money = 100000;
  assert(buildCamp('workbench') === true, 'a building can be built');
  assertEqual(state.camp.buildings, { workbench: 1 }, 'the building is recorded');
  assert(buildCamp('workbench') === false, 'a building cannot be built twice');
  const before = modifiers().mineSpeed;
  state.camp.buildings = {};
  const base = modifiers().mineSpeed;
  state.camp.buildings = { workbench: 1 };
  assert(modifiers().mineSpeed > base, 'the workbench raises mining speed');
  assert(before >= base, 'modifiers never drop below baseline');
});

await suite('progression: camp buildings need money', () => {
  resetCampaign();
  state.campaign.money = 0;
  assert(buildCamp('forge') === false, 'a building you cannot afford is not built');
  assertEqual(state.camp.buildings, {}, 'nothing was built');
});

await suite('progression: skill tree prerequisites', () => {
  resetCampaign();
  state.skills.points = 10;
  assert(canUnlockSkill('keen_hearing') === false, 'a skill with an unmet prerequisite is locked');
  assert(unlockSkill('keen_hearing') === false, 'a locked skill cannot be unlocked');
  assert(unlockSkill('quiet_step') === true, 'the root skill can be unlocked');
  assert(canUnlockSkill('keen_hearing') === true, 'the prerequisite unlocks the next skill');
  assert(unlockSkill('keen_hearing') === true, 'the next skill can now be unlocked');
  assert(unlockSkill('quiet_step') === false, 'a learned skill cannot be learned again');
});

await suite('progression: skills cost points', () => {
  resetCampaign();
  state.skills.points = 1;
  assert(unlockSkill('quiet_step') === true, 'a skill is unlocked when you can afford it');
  assertEqual(state.skills.points, 0, 'the points are spent');
  assert(unlockSkill('deep_pockets') === false, 'a skill you cannot afford is not unlocked');
});

await suite('progression: skills change how you play', () => {
  resetCampaign();
  const baseMine = mineTime(2);
  const baseLuck = luckMultiplier();
  state.skills.unlocked = ['quick_hands', 'lucky_find'];
  assert(mineTime(2) < baseMine, 'quick hands mines faster');
  assert(luckMultiplier() > baseLuck, 'lucky find raises luck');
  state.skills.unlocked = [];
});

await suite('progression: pickaxe strength affects mining time', () => {
  resetCampaign();
  const rusty = mineTime(2);
  state.campaign.pk = 0;
  buyPickaxe(1);
  buyPickaxe(2);
  state.campaign.pk = 2;
  assert(mineTime(2) < rusty, 'a better pickaxe mines faster');
  assert(PICKAXES[2].s > PICKAXES[0].s, 'the steel pickaxe is stronger than the rusty one');
});
