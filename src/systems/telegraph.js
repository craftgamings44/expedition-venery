/**
 * Telegraph: short on-screen notices.
 *
 * Systems call this to tell the player something happened. It writes to the
 * store and the renderer draws the stack. Systems never touch the DOM, and the
 * UI never has to be imported by a system.
 */

import { state } from '../state/store.js';

/**
 * Queue a notice.
 * @param {string} text
 * @param {string} [color]
 */
export function toast(text, color) {
  state.ui.toasts.push({ t: text, c: color || '#fff', l: 4.5 });
}
