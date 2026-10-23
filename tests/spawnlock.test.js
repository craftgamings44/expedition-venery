/**
 * The monster's spawn lock.
 *
 * V8 had a three-state machine: asleep, waking, awake. V9 shipped the object
 * but never advanced it, which left the monster frozen and deaf for the rest
 * of the run — the "it hunts by sound" invariant silently broken.
 */

import { suite, assert, assertEqual } from './run.js';
import { state } from '../src/state/store.js';
import { SF } from '../src/core/constants.js';
import { startSpawnLock, updateSpawnLock, monsterAsleep, secondsLeft, waking, SLEEP_SECONDS, WAKE_SECONDS } from '../src/systems/spawnlock.js';

function setup() {
  state.world.sl = null;
  state.player.y = SF + 6;
  state.monster.s = 'patrol';
  state.monster.path = [];
  state.monster.w = 3;
  state.monster.cd = 0;
}

await suite('spawnlock: the monster sleeps after the first descent', () => {
  setup();
  startSpawnLock();
  assert(monsterAsleep() === true, 'the monster starts asleep');
  assertEqual(state.world.sl.s, 1, 'the lock starts in the sleeping state');
  assertEqual(Math.round(secondsLeft()), SLEEP_SECONDS, 'the full grace period is granted');
});

await suite('spawnlock: the countdown only runs underground', () => {
  setup();
  startSpawnLock();
  state.player.y = SF; // still on the surface
  updateSpawnLock(5);
  assertEqual(Math.round(secondsLeft()), SLEEP_SECONDS, 'surface time does not count down');

  state.player.y = SF + 6;
  updateSpawnLock(5);
  assertEqual(Math.round(secondsLeft()), SLEEP_SECONDS - 5, 'underground time does');
});

await suite('spawnlock: the monster wakes up and starts hunting', () => {
  setup();
  startSpawnLock();
  const woke = updateSpawnLock(SLEEP_SECONDS + 1);
  assert(woke === true, 'the wake-up is reported on the frame it happens');
  assert(monsterAsleep() === false, 'the monster is no longer asleep');
  assert(waking() === true, 'the "it is awake" warning is showing');
  assertEqual(state.world.sl.s, 2, 'the lock moved to the waking state');
  assertEqual(state.monster.s, 'patrol', 'the monster is sent back out to patrol');

  updateSpawnLock(WAKE_SECONDS + 1);
  assert(waking() === false, 'the warning clears');
  assertEqual(state.world.sl.s, 3, 'the lock is fully open');
});

await suite('spawnlock: the countdown cannot run backwards', () => {
  setup();
  startSpawnLock();
  state.player.y = SF + 6;
  updateSpawnLock(1000);
  assert(secondsLeft() === 0, 'the timer stops at zero');
  updateSpawnLock(1000);
  assertEqual(state.world.sl.s, 3, 'the monster stays awake');
});
