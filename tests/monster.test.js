/**
 * Monster AI tests.
 *
 * The monster hunts by sound, not by sight. These tests pin that down: it
 * investigates noises it can hear, ignores ones it cannot, never sees through
 * rock, and remembers where you ran when it loses you.
 */

import { suite, assert, assertEqual } from './run.js';
import { state } from '../src/state/store.js';
import { emit } from '../src/core/events.js';
import { WW, SF } from '../src/core/constants.js';
import { spawnMonster, updateMonster, lineOfSight } from '../src/entities/monster.js';

const H = 80;
const ROW = 40;

/**
 * Build a flat tunnel world with solid rock everywhere except row ROW.
 * @param {number} from first open column
 * @param {number} to last open column
 */
function buildTunnel(from = 8, to = 70) {
  const g = new Uint8Array(WW * H);
  const o = new Uint8Array(WW * H);
  const dg = new Uint8Array(WW * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < WW; x++) {
      g[y * WW + x] = y === ROW && x >= from && x <= to ? 0 : 2;
    }
  }
  state.world.g = g;
  state.world.o = o;
  state.world.dg = dg;
  state.world.h = H;
  state.world.pad = { x: 6.5, f: 32 };
  state.world.lair = { x: 30, y: ROW };
  state.world.sl = null;
  state.world.rope = null;
  state.memory.snd = {};
  state.memory.rt = {};
  state.memory.hide = [];
  state.memory.runX = 0;
  state.player.x = 40.5;
  state.player.y = ROW + 0.5;
  state.player.vx = 0;
  state.player.vy = 0;
  state.ui.biomeSpeed = 1;
}

/** Put the monster somewhere specific. */
function placeMonster(x, y) {
  state.monster.x = x;
  state.monster.y = y;
}

await suite('monster: it investigates a noise it can hear', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(36.5, ROW + 0.5);
  state.monster.s = 'patrol';

  emit('noise', { kind: 'mine', x: state.player.x, y: state.player.y, intensity: 7 });

  assertEqual(state.monster.s, 'inv', 'the monster turns towards the noise');
  assertEqual(state.monster.dt, 'mine', 'it knows what kind of noise it was');
  assert(Object.keys(state.memory.snd).length === 1, 'the sound is remembered');
  assert(state.monster.path.length > 0, 'it starts walking to the sound');
});

await suite('monster: it ignores a noise it cannot hear', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(20.5, ROW + 0.5);
  state.monster.s = 'patrol';

  // twenty tiles away — far outside the reach of a mining noise
  emit('noise', { kind: 'mine', x: state.player.x, y: state.player.y, intensity: 7 });

  assertEqual(state.monster.s, 'patrol', 'the monster keeps patrolling');
  // The sound is logged but never gains confidence, so it never becomes a
  // lead. This matches V8, which recorded the source before the range check.
  const rec = Object.values(state.memory.snd)[0];
  assert(!rec || rec.c === 0, 'the unheard sound carries no confidence');
});

await suite('monster: footsteps only carry a short distance', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(34.5, ROW + 0.5);
  state.monster.s = 'patrol';

  // six tiles away — a footstep does not carry that far
  emit('noise', { kind: 'step', x: state.player.x, y: state.player.y, intensity: 2.5 });
  assertEqual(state.monster.s, 'patrol', 'a distant footstep is not heard');

  placeMonster(39.5, ROW + 0.5);
  emit('noise', { kind: 'step', x: state.player.x, y: state.player.y, intensity: 2.5 });
  assertEqual(state.monster.s, 'inv', 'a footstep right next to it is heard');
});

await suite('monster: a decoy carries much further than a footstep', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(28.5, ROW + 0.5);
  state.monster.s = 'patrol';

  // twelve tiles: out of earshot for a footstep, well inside it for a decoy
  emit('noise', { kind: 'decoy', x: state.player.x, y: state.player.y, intensity: 14 });
  assertEqual(state.monster.s, 'inv', 'the decoy pulls it a long way off');
});

await suite('monster: it cannot see through rock', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(40.5, ROW + 0.5);

  // a tunnel with a wall of rock across it
  for (let y = 0; y < H; y++) state.world.g[y * WW + 45] = 2;

  assert(lineOfSight(40.5, ROW + 0.5, 50.5, ROW + 0.5) === false, 'rock blocks sight');
  assert(lineOfSight(40.5, ROW + 0.5, 42.5, ROW + 0.5) === true, 'open space does not');
});

await suite('monster: it chases what it can see', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(44.5, ROW + 0.5);
  state.monster.s = 'patrol';

  updateMonster(0.05);
  assertEqual(state.monster.s, 'chase', 'the monster locks on');
  assert(state.ui.monsterRoar > 0, 'the roar plays');
});

await suite('monster: it remembers which way you ran', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(44.5, ROW + 0.5);
  state.monster.s = 'patrol';
  state.player.vx = 4;

  updateMonster(0.05);
  assertEqual(state.monster.s, 'chase', 'it starts chasing');

  // break line of sight with a wall between them, and drop the stale path
  // so the monster cannot walk through it
  for (let y = 0; y < H; y++) state.world.g[y * WW + 42] = 2;
  state.monster.path = [];
  const seen = [];
  for (let i = 0; i < 200; i++) {
    updateMonster(0.05);
    if (seen[seen.length - 1] !== state.monster.s) seen.push(state.monster.s);
  }

  assert(seen.includes('search'), 'it gives up the chase and searches: ' + seen.join(' -> '));
  assert(state.memory.runX !== 0, 'it remembers the direction you fled');
});

await suite('monster: a sleeping monster hears nothing', () => {
  buildTunnel();
  spawnMonster('watcher');
  placeMonster(36.5, ROW + 0.5);
  state.monster.s = 'patrol';
  state.world.sl = { t: 30, s: 1, b: 0 };

  emit('noise', { kind: 'mine', x: state.player.x, y: state.player.y, intensity: 7 });
  assertEqual(state.monster.s, 'patrol', 'the sleeping monster does not react');
  assert(Object.keys(state.memory.snd).length === 0, 'and remembers nothing');
});
