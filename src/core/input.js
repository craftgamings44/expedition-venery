/**
 * Input handling.
 *
 * Owns the keyboard and mouse state and exposes a small, testable surface:
 * `down(action)`, `hit(action)` (pressed this frame), and the aim point.
 * Bindings live in meta.bindings so they can be remapped.
 */

import { state } from '../state/store.js';
import { cl } from './math.js';

/** Raw key state, keyed by KeyboardEvent.code. */
export const keys = Object.create(null);
/** Keys pressed since the last frame was consumed. */
export const pressed = Object.create(null);

/** Pointer position in canvas pixels. */
export const mouse = { x: 480, y: 270, down: false };

/**
 * Is the keyboard currently owned by a modal panel?
 * @returns {boolean}
 */
export const isBlocked = () => blocked;

/**
 * How many keys are currently flagged as pressed this frame.
 * @returns {number}
 */
export const pressedCount = () => Object.keys(pressed).length;

/**
 * Diagnostics: the last key code the page actually received, and how many
 * key events have arrived. Shown by the `?debug=1` overlay so an input
 * problem can be told apart from a handling problem.
 */
export const inputLog = { code: '-', key: '-', count: 0, target: '-', repeat: 0 };

/** Set while a modal panel owns the keyboard. */
let blocked = false;

/** Set while the player is choosing a new key binding. */
let rebindingActive = false;

/**
 * Enable or disable rebind capture.
 *
 * The rebinding *handler* is always installed, so the input module cannot
 * decide whether to capture a key by the presence of that handler. It needs
 * this explicit flag: without it every keydown was swallowed by the rebind
 * branch and the game registered no presses at all.
 * @param {boolean} v
 */
export function setRebinding(v) {
  rebindingActive = v;
}

/**
 * Block or unblock gameplay input (used while menus are open).
 * @param {boolean} v
 */
export function setBlocked(v) {
  blocked = v;
  if (v) {
    for (const k in keys) keys[k] = false;
  }
}

/** Clear per-frame pressed flags. Called at the end of each frame. */
export function endFrame() {
  for (const k in pressed) delete pressed[k];
}

/**
 * Is the key bound to this action held down?
 * @param {string} action
 * @returns {boolean}
 */
export function down(action) {
  if (blocked) return false;
  const code = state.meta.bindings?.[action];
  return !!code && !!keys[code];
}

/**
 * How many times `hit()` has returned true. Used by the debug overlay to
 * separate "the key never arrived" from "the key arrived but the binding
 * never matched".
 */
export const hitLog = { count: 0, last: '-' };

/**
 * Was the key bound to this action pressed this frame?
 * @param {string} action
 * @returns {boolean}
 */
export function hit(action) {
  if (blocked) return false;
  const code = state.meta.bindings?.[action];
  const ok = !!code && !!pressed[code];
  if (ok) {
    hitLog.count++;
    hitLog.last = action;
  }
  return ok;
}

/**
 * Human-readable name for a key code.
 * @param {string} code
 * @returns {string}
 */
export function keyName(code) {
  if (code === 'Mouse0') return 'Left click';
  if (code === 'Mouse2') return 'Right click';
  return code.replace('Key', '').replace('Digit', '');
}

/**
 * Attach DOM listeners. Safe to call once at boot.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} handlers
 */
export function initInput(canvas, handlers = {}) {
  const onKeyDown = (e) => {
    const t = e.target;
    inputLog.code = e.code;
    inputLog.key = e.key;
    inputLog.count++;
    inputLog.target = t && t.tagName ? t.tagName : '?';
    inputLog.repeat = e.repeat ? 1 : 0;
    if (t && t.tagName === 'INPUT' && t.type !== 'range') {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        handlers.submit?.();
      }
      return;
    }
    handlers.wake?.();
    // Only capture the key while a rebind is actually in progress.
    if (rebindingActive) {
      e.preventDefault();
      handlers.rebinding?.(e.code);
      return;
    }
    if (e.code === 'Escape') {
      // Escape is recorded like any other key so the dialogue can skip on it,
      // and the menu handler still runs.
      if (!e.repeat) pressed[e.code] = true;
      keys[e.code] = true;
      handlers.escape?.();
      return;
    }
    // A press is registered when the key was not already held down. That
    // covers a normal fresh keydown, a key whose keyup was missed (a stuck
    // key used to block every later press of it), and an event that arrives
    // flagged as a repeat even though the key was up. OS auto-repeat is
    // excluded, because there the key is already held.
    if (!e.repeat || !keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };

  const onKeyUp = (e) => {
    keys[e.code] = false;
  };

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = cl((e.clientX - r.left) * (canvas.width / r.width), 0, canvas.width);
    mouse.y = cl((e.clientY - r.top) * (canvas.height / r.height), 0, canvas.height);
  };

  const onDown = (e) => {
    handlers.wake?.();
    if (e.target !== canvas) return;
    if (handlers.canvasDown?.(e.button)) {
      e.preventDefault();
      return;
    }
    const c = 'Mouse' + e.button;
    keys[c] = true;
    pressed[c] = true;
  };

  const onUp = (e) => {
    keys['Mouse' + e.button] = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    handlers.blur?.();
  });
}
