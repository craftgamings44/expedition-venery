/**
 * Dialogue runner.
 *
 * Dialogue is a queue of [speaker, line] pairs. It advances on a key press,
 * types out character by character, and pauses the simulation while it runs.
 */

import { state } from '../state/store.js';
import { emit } from '../core/events.js';
import { W, H } from '../core/constants.js';
import { text, wrapText, context } from '../render/renderer.js';
import { getImage } from '../render/art.js';

/** Current dialogue state. */
const dlg = { lines: [], i: 0, c: 0, onDone: null };

/**
 * Start a dialogue sequence.
 * @param {Array<[string, string]>} lines
 * @returns {Promise<void>}
 */
export function say(lines) {
  return new Promise((resolve) => {
    dlg.lines = lines;
    dlg.i = 0;
    dlg.c = 0;
    dlg.onDone = resolve;
    state.ui.dialogue = dlg;
  });
}

/**
 * Advance the dialogue if the player pressed a key.
 */
export function advanceDialogue() {
  if (!state.ui.dialogue) return false;
  const line = dlg.lines[dlg.i]?.[1] ?? '';
  if (dlg.c < line.length) {
    dlg.c = line.length;
  } else {
    dlg.i++;
    dlg.c = 0;
    if (dlg.i >= dlg.lines.length) {
      state.ui.dialogue = null;
      const done = dlg.onDone;
      dlg.onDone = null;
      if (done) done();
    }
  }
  emit('sfx:ui');
  return true;
}

/**
 * Skip the rest of the dialogue sequence.
 *
 * Players should not have to click through eight lines one at a time, so
 * Escape jumps straight to the end of the current sequence.
 * @returns {boolean} true if a sequence was skipped
 */
export function skipDialogue() {
  if (!state.ui.dialogue) return false;
  dlg.i = dlg.lines.length;
  dlg.c = 0;
  state.ui.dialogue = null;
  const done = dlg.onDone;
  dlg.onDone = null;
  if (done) done();
  return true;
}

/**
 * Update the typewriter effect.
 * @param {number} dt
 */
export function updateDialogue(dt) {
  if (!state.ui.dialogue) return;
  dlg.c += dt * 48;
  const line = dlg.lines[dlg.i]?.[1] ?? '';
  if (dlg.c > line.length) dlg.c = line.length;
}

/**
 * Draw the dialogue box.
 */
export function drawDialogue() {
  if (!state.ui.dialogue) return;
  const line = dlg.lines[dlg.i];
  if (!line) return;
  const colors = { William: '#f0c27a', You: '#8fd0ff', Nurse: '#9fe3c8', Mack: '#f0b8b8' };
  const c = colors[line[0]] || '#ddd';
  const ctx = context();
  if (!ctx) return;
  const boxTop = H - 170;
  ctx.fillStyle = 'rgba(6,10,18,.92)';
  ctx.beginPath();
  ctx.roundRect(40, boxTop, W - 80, 150, 12);
  ctx.fill();
  ctx.strokeStyle = '#5b88ad';
  ctx.lineWidth = 2;
  ctx.stroke();
  // The speaker's portrait, when there is one.
  const portraitKey = { William: 'creature.william', Mack: 'creature.mack' }[line[0]];
  let nameX = 62;
  const img = portraitKey ? getImage(portraitKey) : null;
  if (img && img.complete && img.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(50, boxTop + 12, 40, 40, 6);
    ctx.clip();
    ctx.drawImage(img, 50, boxTop + 12, 40, 40);
    ctx.restore();
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(50, boxTop + 12, 40, 40, 6);
    ctx.stroke();
    nameX = 100;
  }
  text(line[0], nameX, boxTop + 30, 20, c);

  ctx.font = '19px Georgia';
  ctx.fillStyle = '#eef';
  ctx.textAlign = 'left';
  wrapText(line[1].slice(0, dlg.c | 0), 62, boxTop + 58, W - 124, 26);
  text('Click / Space / E    —    Esc to skip', W - 62, H - 30, 12, '#89a', 'right');
}
