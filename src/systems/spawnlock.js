/**
 * The monster's spawn lock.
 *
 * The thing under the mountain sleeps when you first go down. For the first
 * minute it does not move and it cannot hear you: mining is safe while it is
 * asleep. When the countdown runs out it wakes with a growl and starts
 * hunting by sound.
 *
 * V8 kept this inline in the frame update, where it was easy to forget that
 * `sl` was a three-state machine rather than a single timer. V9 makes it a
 * system so the behaviour is testable without a browser.
 */

import { state } from '../state/store.js';
import { SF } from '../core/constants.js';
import { sfx } from '../audio/audio.js';

/** How long the monster sleeps after the first descent, in seconds. */
export const SLEEP_SECONDS = 60;

/** How long the "it is awake" warning lasts, in seconds. */
export const WAKE_SECONDS = 5;

/**
 * Put the monster back to sleep.
 *
 * Only the first descent of a run gets the grace period. Once it has woken,
 * riding the elevator down again does not lull it.
 */
export function startSpawnLock() {
  state.world.sl = { t: SLEEP_SECONDS, s: 1, b: 0 };
}

/**
 * Advance the spawn lock.
 *
 * The countdown only runs while the player is actually underground — the
 * clock is the time you spend in the dark, not the time since you pressed
 * the button.
 * @param {number} dt seconds
 * @returns {boolean} true on the frame the monster wakes up
 */
export function updateSpawnLock(dt) {
  const sl = state.world.sl;
  if (!sl) return false;

  if (sl.s === 1) {
    if (state.player.y <= SF + 2) return false;
    sl.t -= dt;
    if (sl.t <= 0) {
      sl.s = 2;
      sl.b = WAKE_SECONDS;
      const m = state.monster;
      m.s = 'patrol';
      m.path = [];
      m.w = 1;
      m.cd = 3;
      sfx.growl(0.8);
      return true;
    }
    return false;
  }

  if (sl.s === 2) {
    sl.b -= dt;
    if (sl.b <= 0) sl.s = 3;
  }
  return false;
}

/**
 * Is the monster still asleep?
 * @returns {boolean}
 */
export const monsterAsleep = () => state.world.sl?.s === 1;

/**
 * Seconds left before the monster wakes up.
 * @returns {number}
 */
export const secondsLeft = () => Math.max(0, state.world.sl?.t ?? 0);

/**
 * Is the "it is awake" warning showing?
 * @returns {boolean}
 */
export const waking = () => state.world.sl?.s === 2;
