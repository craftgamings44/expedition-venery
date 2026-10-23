/**
 * Input layer tests.
 *
 * The input module is the one place where a mistake makes the whole game
 * unplayable without any visible symptom, so it gets its own tests. The
 * regression that matters most: the rebinding handler is *always* installed,
 * so the module has to know whether a rebind is actually in progress. When it
 * guessed wrong by testing the handler's presence, every keydown was
 * swallowed and the game registered no presses at all.
 */

import { suite, assert, assertEqual } from './run.js';
import { state } from '../src/state/store.js';
import { keys, pressed, endFrame, hit, down, initInput, setBlocked, setRebinding, isBlocked } from '../src/core/input.js';

/**
 * A minimal DOM stub. The input module only needs window.addEventListener and
 * a canvas with addEventListener and getBoundingClientRect.
 */
function stubDom() {
  /** @type {Record<string, Function[]>} */
  const listeners = {};
  const canvas = {
    width: 960,
    height: 540,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener(type, fn) {
      (listeners['canvas:' + type] = listeners['canvas:' + type] || []).push(fn);
    },
  };
  globalThis.window = {
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
  };
  return {
    canvas,
    fire(type, ev) {
      (listeners[type] || []).forEach((fn) => fn(ev));
    },
  };
}

const dom = stubDom();

/** A key event that looks like the ones a browser sends. */
function keyEvent(code, key, repeat = false) {
  return { code, key, repeat, target: { tagName: 'BODY' }, preventDefault() {} };
}

let rebindCalls = 0;

initInput(dom.canvas, {
  wake: () => {},
  escape: () => {},
  rebinding: () => {
    rebindCalls++;
  },
});

state.meta.bindings = {
  left: 'KeyA', right: 'KeyD', jump: 'Space', mine: 'Mouse0', use: 'KeyE',
  gear: 'KeyQ', inv: 'KeyI', shop: 'KeyU', up: 'KeyW', down: 'KeyS',
  items: 'KeyO', rope: 'KeyR', grap: 'KeyG',
};

/** Put the input module back into a known state. */
function reset() {
  for (const k in keys) keys[k] = false;
  for (const k in pressed) delete pressed[k];
  setBlocked(false);
  setRebinding(false);
  rebindCalls = 0;
}

await suite('input: a normal key press is registered', () => {
  reset();
  dom.fire('keydown', keyEvent('KeyE', 'e'));
  assert(hit('use') === true, 'a fresh keydown registers a press');
  assert(down('use') === true, 'the key is held while it is down');
  endFrame();
  assert(hit('use') === false, 'the press is consumed at the end of the frame');
  assert(down('use') === true, 'the key stays held until keyup');
  dom.fire('keyup', keyEvent('KeyE', 'e'));
  assert(down('use') === false, 'keyup releases the key');
});

await suite('input: the rebinding handler must not swallow every key', () => {
  reset();
  rebindCalls = 0;
  dom.fire('keydown', keyEvent('KeyA', 'a'));
  assert(rebindCalls === 0, 'no rebind is captured when none is in progress');
  assert(hit('left') === true, 'the press still reaches the game');
  endFrame();
});

await suite('input: a rebind in progress captures the key', () => {
  reset();
  rebindCalls = 0;
  setRebinding(true);
  dom.fire('keydown', keyEvent('KeyA', 'a'));
  assert(rebindCalls === 1, 'the rebinding handler receives the key');
  assert(hit('left') === false, 'the key is not also treated as a game press');
  setRebinding(false);
  endFrame();
});

await suite('input: a missed keyup does not wedge the key', () => {
  reset();
  dom.fire('keydown', keyEvent('KeyA', 'a'));
  endFrame();
  // the keyup never arrives
  dom.fire('keydown', keyEvent('KeyA', 'a'));
  assert(hit('left') === true, 'a later press of a stuck key still registers');
  endFrame();
});

await suite('input: OS auto-repeat is not a second press', () => {
  reset();
  dom.fire('keydown', keyEvent('KeyA', 'a'));
  assert(hit('left') === true, 'the first press registers');
  endFrame();
  dom.fire('keydown', keyEvent('KeyA', 'a', true));
  assert(hit('left') === false, 'auto-repeat does not register again');
  endFrame();
});

await suite('input: a fresh press is registered even when flagged as a repeat', () => {
  reset();
  dom.fire('keydown', keyEvent('KeyA', 'a', true));
  assert(hit('left') === true, 'a key that was not held still registers');
  endFrame();
});

await suite('input: a modal panel takes the keyboard', () => {
  reset();
  dom.fire('keydown', keyEvent('KeyE', 'e'));
  assert(hit('use') === true, 'the press registers before the panel opens');
  endFrame();
  setBlocked(true);
  assert(isBlocked() === true, 'the input module reports itself blocked');
  dom.fire('keydown', keyEvent('KeyE', 'e'));
  assert(hit('use') === false, 'a blocked panel swallows presses');
  setBlocked(false);
  dom.fire('keydown', keyEvent('KeyE', 'e'));
  assert(hit('use') === true, 'unblocking restores input');
  endFrame();
});

await suite('input: the mouse is a held input like the keyboard', () => {
  reset();
  dom.fire('canvas:mousedown', { button: 0, target: dom.canvas, preventDefault() {} });
  assert(down('mine') === true, 'the mouse button is held while it is down');
  endFrame();
  dom.fire('mouseup', { button: 0 });
  assert(down('mine') === false, 'mouseup releases it');
});
