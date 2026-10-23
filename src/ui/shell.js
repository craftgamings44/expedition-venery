/**
 * UI shell: the DOM panel system and the top-level screens.
 *
 * The game world is drawn on canvas; the menus are DOM. That split is
 * deliberate — DOM panels are accessible, responsive, and much easier to
 * extend than canvas-drawn buttons.
 *
 * This module only reads game state. Actions go through the systems.
 */

import { state } from '../state/store.js';
import { DIFFICULTY_IDS } from '../data/difficulty.js';
import { QUESTS } from '../data/quests.js';
import { keyName } from '../core/input.js';
import { emit } from '../core/events.js';

/** @type {HTMLElement} */
let root = null;

/**
 * Mount the UI.
 * @param {HTMLElement} el
 */
export function mountUI(el) {
  root = el;
}

/**
 * Replace the panel contents.
 * @param {string} html
 */
export function setPanel(html) {
  if (!root) return;
  root.innerHTML = html;
  const first = root.querySelector('input, button');
  if (first) first.focus();
}

/** Clear the panel. */
export function clearPanel() {
  if (root) root.innerHTML = '';
}

/**
 * Show a toast.
 * @param {string} t text
 * @param {string} [c] colour
 */
export function toast(t, c) {
  state.ui.toasts.push({ t, c: c || '#fff', l: 4.5 });
}

/**
 * The title / main menu.
 * @param {Object} handlers
 */
export function showTitle(handlers) {
  const user = state.meta.user;
  if (!user) {
    setPanel(
      '<h1>EXPEDITION VENERY <span style="font-size:.5em;letter-spacing:.05em">V9</span></h1>' +
        '<div class="pn" style="text-align:center;min-width:24em"><h2>Account</h2>' +
        '<input type="text" id="un" placeholder="Username" maxlength="16" autocomplete="username">' +
        '<input type="password" id="pw" placeholder="Password" maxlength="40" autocomplete="current-password">' +
        '<div id="er"></div>' +
        '<div class="r" style="justify-content:center"><button id="btnLogin">Login</button><button id="btnSignup">Sign up</button></div>' +
        '<small style="opacity:.65">New here? Pick a username and password, then press Sign up.</small></div>'
    );
    document.getElementById('btnLogin')?.addEventListener('click', () => handlers.auth(false));
    document.getElementById('btnSignup')?.addEventListener('click', () => handlers.auth(true));
    setTimeout(() => document.getElementById('un')?.focus(), 50);
    return;
  }
  setPanel(
    '<h1>EXPEDITION VENERY <span style="font-size:.5em;letter-spacing:.05em">V9</span></h1>' +
      '<p class="who">Signed in as <b>' + escapeHtml(user) + '</b></p>' +
      '<button id="btnStart">Start</button>' +
      '<button id="btnCamp">Camp</button>' +
      '<button id="btnSkills">Skills</button>' +
      '<button id="btnSettings">Settings</button>' +
      '<a id="btnLogout">Log out</a>'
  );
  document.getElementById('btnStart')?.addEventListener('click', () => guarded(handlers.start));
  document.getElementById('btnCamp')?.addEventListener('click', () => guarded(handlers.camp));
  document.getElementById('btnSkills')?.addEventListener('click', () => guarded(handlers.skills));
  document.getElementById('btnSettings')?.addEventListener('click', () => guarded(handlers.settings));
  document.getElementById('btnLogout')?.addEventListener('click', () => guarded(handlers.logout));
}

/**
 * Run a UI handler, surfacing any error instead of swallowing it.
 * @param {Function} fn
 */
function guarded(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch((e) => reportError(e));
  } catch (e) {
    reportError(e);
  }
}

/**
 * Report an error to the player.
 * @param {*} e
 */
export function reportError(e) {
  const msg = e && e.message ? e.message : String(e);
  console.error(msg);
  const el = document.getElementById('__err');
  if (el) {
    el.textContent = 'Error: ' + msg;
    el.style.display = 'block';
  }
}

/**
 * Difficulty select.
 * @param {Object} handlers
 */
export function showDifficulty(handlers) {
  const label = (d) => {
    const s = handlers.savedFor(d);
    if (!s) return '<small>New game</small>';
    return '<small>' + (s.end ? 'Campaign complete, job ' + (s.job | 0) : 'Quest ' + Math.min(10, (s.q | 0) + 1) + ' of 10') + ' | $' + (Math.round(s.money) || 0).toLocaleString('en-US') + '</small>';
  };
  let html = '<h1>EXPEDITION VENERY <span style="font-size:.5em;letter-spacing:.05em">V9</span></h1>';
  for (const d of DIFFICULTY_IDS) {
    html += '<button class="diff" data-d="' + d + '">' + d.charAt(0).toUpperCase() + d.slice(1) + label(d) + '</button>';
  }
  html += '<a id="btnBack">back</a><a id="btnErase" style="font-size:.9em;opacity:.7">erase my saves</a>';
  setPanel(html);
  root.querySelectorAll('.diff').forEach((b) => b.addEventListener('click', () => handlers.start(b.dataset.d)));
  document.getElementById('btnBack')?.addEventListener('click', handlers.back);
  document.getElementById('btnErase')?.addEventListener('click', handlers.erase);
}

/**
 * Pause menu.
 * @param {Object} handlers
 */
export function showPause(handlers) {
  setPanel(
    '<div class="pn" style="text-align:center"><h2>Paused</h2>' +
      '<div class="r" style="justify-content:center"><button id="btnResume">Resume</button></div>' +
      '<div class="r" style="justify-content:center"><button id="btnSettings">Settings</button></div>' +
      '<div class="r" style="justify-content:center"><button id="btnQuit">Quit to menu</button></div></div>'
  );
  document.getElementById('btnResume')?.addEventListener('click', handlers.resume);
  document.getElementById('btnSettings')?.addEventListener('click', handlers.settings);
  document.getElementById('btnQuit')?.addEventListener('click', handlers.quit);
}

/**
 * Settings, including key rebinding.
 * @param {Object} handlers
 * @param {Array<[string,string]>} labels action -> description
 */
export function showSettings(handlers, labels) {
  const b = state.meta.bindings;
  let html = '<div class="pn"><h2>Settings</h2>';
  html +=
    '<div class="r">Master volume<input type="range" min="0" max="1" step=".01" value="' +
    (state.meta.settings.vol) +
    '" id="setVol"></div>';
  html +=
    '<div class="r">Mouse sensitivity (aim reach)<input type="range" min=".3" max="2" step=".05" value="' +
    (state.meta.settings.sens) +
    '" id="setSens"></div>';
  for (const [action, label] of labels) {
    html += '<div class="r">' + label + '<button class="rebind" data-a="' + action + '">' + keyName(b[action]) + '</button></div>';
  }
  html += '<div class="r"><button id="btnDefaults">Restore defaults</button><button id="btnBack">Back</button></div></div>';
  setPanel(html);
  document.getElementById('setVol')?.addEventListener('input', (e) => handlers.setVolume(+e.target.value));
  document.getElementById('setSens')?.addEventListener('input', (e) => handlers.setSens(+e.target.value));
  root.querySelectorAll('.rebind').forEach((btn) => {
    btn.addEventListener('click', () => {
      const old = btn.textContent;
      btn.textContent = 'Press a key...';
      handlers.beginRebind(btn.dataset.a, () => {
        btn.textContent = old;
      });
    });
  });
  document.getElementById('btnDefaults')?.addEventListener('click', handlers.defaults);
  document.getElementById('btnBack')?.addEventListener('click', handlers.back);
}

/**
 * Escape HTML so player-supplied names can never inject markup.
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * The death screen.
 * @param {Object} handlers
 */
export function showDeath(handlers) {
  setPanel(
    '<h1>YOU LOST</h1><p style="text-align:center;font-size:1.4em;max-width:26em;margin:0">The expedition has failed. Your pack, ores and gear were left with your body in the monster\'s lair. The current quest restarts. Find the body to recover what you carried.</p>' +
      '<button id="btnReturn">Return to camp</button>'
  );
  document.getElementById('btnReturn')?.addEventListener('click', handlers.respawn);
  emit('sfx:ui');
}

export { QUESTS };
