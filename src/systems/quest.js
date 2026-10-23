/**
 * Quest lifecycle: deliveries, unlocks and the ending.
 *
 * A quest only counts when the player is back at the camp alive with the ore.
 */

import { state } from '../state/store.js';
import { ORE_IDS, ORES } from '../data/ores.js';
import { currentTask, canDeliver } from '../state/selectors.js';
import { awardSkillPoints } from './progression.js';
import { emit } from '../core/events.js';
import { QUESTS } from '../data/quests.js';

/**
 * Complete the current task: pay the player, advance the quest chain.
 * @returns {Promise<void>}
 */
export async function completeTask() {
  const c = state.campaign;
  const task = currentTask();
  // Take the required ore out of the pack; anything left over is sold at 70%.
  let extra = 0;
  for (const k of ORE_IDS) {
    const needed = task.r[k] || 0;
    const held = state.inventory.ores[k] || 0;
    const surplus = Math.max(0, held - needed);
    if (surplus) extra += surplus * ORES[k].value * 0.7;
    state.inventory.ores[k] = needed;
  }
  c.money += task.p + Math.round(extra);
  emit('sfx:ore');

  await emitDialogue([
    ['William', task.d],
    ['William', 'Payment: $' + task.p + (extra ? ' plus $' + Math.round(extra) + ' for the extra ore' : '') + '.'],
  ]);

  const completed = c.end ? c.job : c.q + 1;
  if (c.end) c.job++;
  else c.q++;

  awardSkillPoints(completed);

  if (!c.end && c.q >= QUESTS.length) {
    if (!c.ended) {
      c.ended = 1;
      await playEnding();
    }
  } else {
    c.si = c.end ? 'j' + c.job : 'q' + c.q;
    emit('quest:advanced');
    await emitDialogue([['William', 'Next: ' + currentTask().n + '. ' + currentTask().i]]);
  }
}

/**
 * The ending sequence — the story payoff, then paid jobs unlock.
 * @returns {Promise<void>}
 */
export async function playEnding() {
  const c = state.campaign;
  state.ui.cut = 1;
  await emitDialogue([
    ['William', "You did it. Ten deliveries. Here is everything I owe you."],
    ['William', "Mack's treatment is today. Come with me. I don't want to wait alone."],
  ]);
  emit('scene:hospital');
  await wait(3);
  emit('scene:recovery');
  await wait(3);
  await emitDialogue([
    ['Mack', "Thank you for saving my life."],
    ['William', "Now I'll reward you with money. Going down and mining is officially a job, so if you ever want to mine ores for me and earn money, come over to the camp and I'll give you quests."],
    ['', 'The ten-quest story is complete. Paid jobs are now open at the camp.'],
  ]);
  c.money += 8000;
  c.end = 1;
  c.job = 1;
  c.si = '';
  emit('quest:ended');
}

/**
 * Speak to William at the camp.
 * @returns {Promise<void>}
 */
export async function talkToWilliam() {
  if (canDeliver()) {
    await completeTask();
    return;
  }
  const c = state.campaign;
  const key = c.end ? 'j' + c.job : 'q' + c.q;
  if (c.si !== key) {
    c.si = key;
    await emitDialogue([['William', currentTask().i]]);
  } else {
    const missing = ORE_IDS.filter((k) => currentTask().r[k]).map((k) => currentTask().r[k] + ' ' + k).join(', ');
    await emitDialogue([['William', 'Still need: ' + missing + '. Upgrades are sold down in the cave.']]);
  }
}

/**
 * Request a dialogue sequence. The UI layer listens for this.
 * @param {Array<[string, string]>} lines
 * @returns {Promise<void>}
 */
export function emitDialogue(lines) {
  return new Promise((resolve) => {
    state.ui.pendingDialogue = { lines, resolve };
  });
}

/**
 * Wait a number of seconds (driven by the game loop, not wall time).
 * @param {number} seconds
 * @returns {Promise<void>}
 */
export function wait(seconds) {
  return new Promise((resolve) => {
    state.ui.pendingWait = { remaining: seconds, resolve };
  });
}
