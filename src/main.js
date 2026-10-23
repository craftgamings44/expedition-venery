/**
 * Bootstrap: wires the modules together and owns the game loop.
 *
 * This is the only module that knows about every other module. Everything else
 * talks through the store, the event bus, or an explicit function call.
 */

import { W, H, T, WW, SF, LS_SETTINGS } from './core/constants.js';
import { cl, rng } from './core/math.js';
import { state, resetRun } from './state/store.js';
import { emit, on } from './core/events.js';
import { initInput, down, hit, setBlocked, endFrame, keyName, mouse, inputLog, isBlocked, pressedCount, hitLog, setRebinding } from './core/input.js';
import { initAudio, updateAmbience, sfx, tone } from './audio/audio.js';
import { initRenderer, render, context } from './render/renderer.js';
import { loadManifest, preload, getImage } from './render/art.js';
import { generateWorld, generateMenuWorld } from './world/generator.js';
import { updatePlayer, ropeNear, ropeBottom, validateRope, grappleTarget, startGrapple, mine, aim } from './entities/player.js';
import { updateMonster, spawnMonster } from './entities/monster.js';
import { setMiningRandom } from './systems/mining.js';
import { startSpawnLock, updateSpawnLock } from './systems/spawnlock.js';
import { talkToWilliam, completeTask, emitDialogue } from './systems/quest.js';
import { mountUI, showTitle, showDifficulty, showPause, showSettings, showDeath, clearPanel, setPanel, toast, reportError } from './ui/shell.js';
import { showShop, showItems, showCamp, showSkills } from './ui/panels.js';
import { say, advanceDialogue, skipDialogue, updateDialogue, drawDialogue } from './ui/dialogue.js';
import { biomeAtRow, BIOMES } from './data/biomes.js';
import { ORE_IDS } from './data/ores.js';
import { rollMonster } from './data/monsters.js';
import { introDialogue } from './data/quests.js';
import { currentTask, canDeliver, difficulty } from './state/selectors.js';
import { serializeCampaign, deserializeCampaign, newSave, migrate } from './state/save.js';
import * as accounts from './services/accounts.js';

/** Default key bindings. */
const DEFAULT_BINDINGS = {
  left: 'KeyA', right: 'KeyD', jump: 'Space', mine: 'Mouse0', use: 'KeyE',
  gear: 'KeyQ', inv: 'KeyI', shop: 'KeyU', up: 'KeyW', down: 'KeyS',
  items: 'KeyO', rope: 'KeyR', grap: 'KeyG',
};

/** Human-readable binding labels, in the order they are shown. */
const BINDING_LABELS = {
  left: 'Move left', right: 'Move right', jump: 'Jump / wall grip',
  mine: 'Mine (aim with mouse)', use: 'Interact', gear: 'Throw decoy',
  inv: 'Inventory panel', shop: 'Upgrades (in cave)', items: 'Items (in cave)',
  up: 'Climb rope up', down: 'Climb rope down', rope: 'Rope: place / retrieve',
  grap: 'Grappling hook',
};

/** Set while the game is a cutscene. */
let cut = false;
/** Rope anchoring mode. */
let targeting = null;
/** Grapple cooldown. */
let grappleCooldown = 0;
/** Current biome banner, if one is showing. */
let banner = null;
/** Rebinding state. */
let rebinding = null;

/**
 * Load settings and bindings from localStorage.
 */
function loadSettings() {
  let s = { vol: 0.7, sens: 1, keys: { ...DEFAULT_BINDINGS } };
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null');
    if (raw) {
      s.vol = raw.vol ?? s.vol;
      s.sens = raw.sens ?? s.sens;
      Object.assign(s.keys, raw.keys || {});
    }
  } catch {
    /* keep defaults */
  }
  state.meta.settings = { vol: s.vol, sens: s.sens };
  state.meta.bindings = s.keys;
}

/**
 * Persist settings and bindings.
 */
function saveSettings() {
  try {
    localStorage.setItem(
      LS_SETTINGS,
      JSON.stringify({ vol: state.meta.settings.vol, sens: state.meta.settings.sens, keys: state.meta.bindings })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Start a new expedition on the given difficulty.
 * @param {string} d
 */
function newGame(d) {
  state.campaign.d = d;
  const saved = accounts.listSaves ? null : null;
  void saved;
  loadOrStart(d);
}

/**
 * Load the saved campaign for a difficulty, or start fresh.
 * @param {string} d
 */
async function loadOrStart(d) {
  const saves = await accounts.listSaves();
  const raw = saves?.[d];
  const save = raw ? migrate(raw) : null;
  if (save) deserializeCampaign(save);
  else {
    const fresh = newSave(d);
    deserializeCampaign(fresh);
  }
  state.player.maxHp = 100 + (state.skills.unlocked.includes('hardy') ? 40 : 0);
  beginRun();
}

/**
 * Generate a fresh world and start playing.
 */
function beginRun() {
  resetRun();
  const c = state.campaign;
  const D = difficulty();
  const task = currentTask();
  const seed = ({ easy: 1, normal: 2, hard: 3 }[c.d] ?? 2) * 9973 + (c.end ? c.job * 131 + 500 : c.q * 7919);
  const world = generateWorld(seed, c.d, task.r);
  state.world.g = world.g;
  state.world.o = world.o;
  state.world.dg = world.dg;
  state.world.h = world.h;
  state.world.st = world.st;
  state.world.pad = world.pad;
  state.world.lair = world.lair;
  state.world.seen = 0;
  // A fresh expedition gets the monster's grace period again.
  state.world.sl = null;

  setMiningRandom(rng(seed ^ 0x9e3779b9));

  const depthFrac = 0.4;
  const variant = rollMonster(depthFrac, rng(seed ^ 0x5bf03635));
  spawnMonster(variant.id);

  state.ui.screen = 'play';
  state.ui.scene = 'play';
  state.ui.fade = 1;
  state.ui.camera = { x: 0, y: SF - 8, sn: 1 };
  clearPanel();
  setBlocked(false);

  tween('fade', 0, 1.2);

  if (!state.meta.seenIntro) {
    state.meta.seenIntro = true;
    const lines = introDialogue(state.meta.bindings);
    say(lines).then(() => say([['William', 'Quest ' + currentTask().n + ': ' + currentTask().i]]));
  } else {
    say([['William', 'Quest ' + currentTask().n + ': ' + currentTask().i]]);
  }
}

/**
 * Update the camera to follow the player.
 */
function updateCamera() {
  const p = state.player;
  const cam = state.ui.camera;
  const tx = cl(p.x - 15, 0, WW - 30);
  const ty = cl(p.y - 8.5, 0, state.world.h - 17);
  if (targeting === 'rope') {
    const R = state.meta.ropeReach ?? 10;
    const m = state.ui.mouseWorld;
    tx = cl(p.x - 15 + cl((m.x - W / 2) / T * 0.9, -R, R), 0, WW - 30);
    ty = cl(p.y - 8.5 + cl((m.y - H / 2) / T * 0.9, -R, R), 0, state.world.h - 17);
  }
  if (cam.sn) {
    cam.x = tx;
    cam.y = ty;
    cam.sn = 0;
  } else {
    cam.x += (tx - cam.x) * 0.12;
    cam.y += (ty - cam.y) * 0.12;
  }
}

/**
 * The main update.
 * @param {number} dt
 */
function update(dt) {
  state.ui.time += dt;

  // toasts
  state.ui.toasts = state.ui.toasts.filter((t) => (t.l -= dt) > 0);

  // dialogue
  if (state.ui.dialogue) {
    updateDialogue(dt);
    if (hit('Escape')) skipDialogue();
    else if (hit('use') || hit('jump') || hit('mine')) advanceDialogue();
    return;
  }

  if (state.ui.pendingWait) {
    state.ui.pendingWait.remaining -= dt;
    if (state.ui.pendingWait.remaining <= 0) {
      const w = state.ui.pendingWait;
      state.ui.pendingWait = null;
      w.resolve();
    }
    return;
  }

  if (state.ui.pendingDialogue) {
    const d = state.ui.pendingDialogue;
    state.ui.pendingDialogue = null;
    say(d.lines).then(d.resolve);
    return;
  }

  if (state.ui.screen !== 'play') return;
  if (state.ui.paused || state.ui.modal) return;

  const p = state.player;
  const w = state.world;

  // biome banner
  if (banner) {
    banner.t += dt;
    if (banner.t > 3.4) banner = null;
  } else if (p.y > SF + 2) {
    const b = biomeAtRow(Math.floor(p.y), w.st, w.h);
    if (state.ui.lastBiome !== b.id) {
      state.ui.lastBiome = b.id;
      banner = { biome: b, t: 0 };
      sfx.biome();
    }
  }

  // panel hotkeys
  if (p.y > SF + 2 && !G) {
    if (hit('shop')) toggleShop();
    if (hit('items')) toggleItems();
    if (!state.ui.modal) {
      if (hit('rope')) ropeKey();
      if (hit('grap')) grapKey();
      if (hit('inv')) state.ui.inventoryOpen = !state.ui.inventoryOpen;
    }
  }

  updatePlayer(dt);
  if (targeting === 'grap') updateGrappleTargeting();
  if (targeting === 'rope') updateRopeTargeting();

  // monster
  updateSpawnLock(dt);
  if (!(w.sl && w.sl.s === 1)) updateMonster(dt);

  // biome speed modifier
  const b = biomeAtRow(Math.floor(p.y), w.st, w.h);
  state.ui.biomeSpeed = b.monsterSpeed;

  // hazards
  applyHazards(dt, b);

  // elevator interaction
  if (hit('use')) handleInteract();

  // decoy
  if (hit('gear') && (state.inventory.decoy || 0) > 0) throwDecoy();

  // chase tint
  if (state.monster.s === 'chase' && state.monster.lg < 0.01) {
    const ctx = context();
    if (ctx) {
      ctx.fillStyle = 'rgba(180,0,0,' + (0.15 + 0.1 * Math.sin(state.ui.time * 10)) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // heartbeat
  if (state.ui.heartbeatLevel > 0) {
    sfx.heartbeat(state.ui.heartbeatLevel);
    state.ui.heartbeatLevel = 0;
  }

  updateCamera();
  updateAmbience(p.y > SF + 2, state.ui.screen === 'title');
}

/** Grapple flight in progress. */
let G = null;

/**
 * Apply the current biome's hazards.
 * @param {number} dt
 * @param {Object} b biome
 */
function applyHazards(dt, b) {
  if (!b.hazards.length) return;
  const p = state.player;
  const resist = 0.5;
  for (const h of b.hazards) {
    if (h === 'lava') continue; // lava is handled by tile damage
    if (h === 'slick') continue;
    p.hp -= 4 * dt * resist;
  }
  if (p.hp <= 0) emit('player:death', 'hazard');
}

/**
 * Handle the interact key.
 */
function handleInteract() {
  const p = state.player;
  const w = state.world;
  // recover a body
  const body = state.ui.bodies?.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < 2.2);
  if (body) {
    for (const [k, v] of Object.entries(body.inv.ores || {})) {
      state.inventory.ores[k] = (state.inventory.ores[k] || 0) + v;
    }
    state.inventory.decoy = (state.inventory.decoy || 0) + (body.inv.decoy || 0);
    state.ui.bodies.splice(state.ui.bodies.indexOf(body), 1);
    sfx.ore();
    toast('Recovered your lost pack. Bring it home alive.', '#8fe');
    return;
  }
  if (p.y < SF + 1) {
    if (Math.abs(p.x - 10.5) < 2.6) talkToWilliam();
    else if (Math.abs(p.x - 6) < 2.2) ride(1);
    return;
  }
  if (Math.abs(p.x - w.pad.x) < 3 && Math.abs(p.y - (w.pad.f - 1)) < 3) ride(0);
}

/**
 * Throw a decoy.
 */
function throwDecoy() {
  const p = state.player;
  const dx = cl(aim.x + 0.5 - p.x, -12, 12);
  const dy = cl(aim.y + 0.5 - p.y, -8, 8);
  let x = p.x + dx;
  let y = p.y + dy;
  let n = 0;
  while (state.world.g[Math.floor(y) * WW + Math.floor(x)] && n++ < 30) {
    x -= dx / 30;
    y -= dy / 30;
  }
  state.inventory.decoy--;
  emit('noise', { kind: 'decoy', x, y, intensity: 14 });
  tone(300, 0.4, 'square', 0.15, 600);
  toast('Decoy thrown.', '#ffd54a');
}

/**
 * Place or retrieve the rope.
 */
function ropeKey() {
  if (targeting) {
    targeting = null;
    return;
  }
  if (!state.campaign.ro) {
    toast('Buy the Rope in Items.', '#fc8');
    return;
  }
  if (state.world.rope) {
    if (ropeNear(3)) retrieveRope();
    else toast('Your rope is deployed. Go near it to retrieve it.', '#fc8');
    return;
  }
  targeting = 'rope';
}

/**
 * Fire the grappling hook.
 */
function grapKey() {
  if (targeting) {
    targeting = null;
    return;
  }
  if (!state.campaign.go) {
    toast('Buy the Grappling Hook in Items.', '#fc8');
    return;
  }
  if (grappleCooldown > 0) {
    toast('Grappling hook recharging: ' + Math.ceil(grappleCooldown) + 's', '#fc8');
    return;
  }
  targeting = 'grap';
}

/**
 * Update the rope placement preview.
 */
function updateRopeTargeting() {
  const c = state.ui.mouseCell;
  state.ui.ropeError = validateRope(c.x, c.y, state.meta.ropeReach ?? 10);
}

/**
 * Update the grapple preview.
 */
function updateGrappleTargeting() {
  const r = grappleTarget(state.meta.hookReach ?? 20);
  state.ui.grapplePreview = r;
}

/**
 * Confirm the current targeting mode.
 */
function confirmTargeting() {
  if (targeting === 'rope') {
    const c = state.ui.mouseCell;
    const err = validateRope(c.x, c.y, state.meta.ropeReach ?? 10);
    if (err) {
      toast(err, '#f88');
      return;
    }
    state.world.rope = { x: c.x, y: c.y, b: ropeBottom(c.x, c.y) };
    targeting = null;
    sfx.ore();
    toast('Rope anchored.', '#8fe');
  } else if (targeting === 'grap') {
    const r = state.ui.grapplePreview;
    if (!r || !r.land) {
      toast(r?.msg || 'No target.', '#f88');
      return;
    }
    startGrapple(r.land);
    grappleCooldown = state.meta.hookCooldown ?? 32;
    targeting = null;
    tone(220, 0.25, 'sawtooth', 0.12, 900);
  }
}

/**
 * Cancel targeting.
 */
function cancelTargeting() {
  targeting = null;
}

/**
 * Retrieve the deployed rope.
 */
function retrieveRope() {
  if (!state.world.rope) return;
  if (!ropeNear(3)) {
    toast('Move closer to the rope to retrieve it.', '#fc8');
    return;
  }
  state.world.rope = null;
  state.player.climbing = 0;
  sfx.ui();
  toast('Rope retrieved.', '#8fe');
}

/**
 * Ride the elevator.
 * @param {number} dir 1 = down, 0 = up
 */
async function ride(dir) {
  if (state.ui.riding) return;
  state.ui.riding = true;
  const p = state.player;
  if (dir) {
    p.x = 6;
    p.y = SF - 0.86;
    p.vx = 0;
    p.vy = 0;
    p.f = 1;
    state.ui.elevatorY = 0;
    sfx.elev();
    await tween('elevatorY', (H - (SF - 8.5) * T) / T + 3, 2.2);
  } else {
    sfx.elev();
  }
  state.ui.fade = 1;
  await tween('fade', 1, 0.7);
  state.ui.elevatorY = null;
  if (dir) {
    p.x = state.world.pad.x;
    p.y = state.world.pad.f - 1;
    state.ui.lastBiome = null;
  } else {
    p.x = 9;
    p.y = SF - 0.86;
    if (state.monster.s === 'chase') {
      state.monster.s = 'patrol';
      state.monster.path = [];
    }
    state.monster.w = 2;
  }
  p.vx = 0;
  p.vy = 0;
  state.ui.camera.sn = 1;
  await tween('fade', 0, 0.7);
  state.ui.riding = false;
  if (dir && !state.world.sl) startSpawnLock();
}

/**
 * Active tweens. Each one eases a number on the ui slice towards a target.
 * @type {Array<{key: string, from: number, to: number, t: number, dur: number, resolve: Function}>}
 */
const tweens = [];

/**
 * Tween a numeric value on the ui slice.
 *
 * Time-based, like V8: the animation takes the same number of seconds
 * whatever the frame rate. A frame-count tween also ran at the wrong speed on
 * a slow machine, and — worse — never resolved when the start and end values
 * were equal, which is exactly what the elevator's fade-out does.
 *
 * The tween is advanced by the game loop rather than by its own animation
 * frames, so it keeps time with the rest of the simulation — and so a test
 * harness that drives the clock also drives the tweens.
 * @param {string} key
 * @param {number} to
 * @param {number} dur seconds
 * @returns {Promise<void>}
 */
function tween(key, to, dur) {
  return new Promise((resolve) => {
    tweens.push({ key, from: state.ui[key] ?? 0, to, t: 0, dur, resolve });
  });
}

/**
 * Advance every running tween.
 * @param {number} dt seconds
 */
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i];
    w.t += dt;
    const k = cl(w.t / w.dur, 0, 1);
    state.ui[w.key] = w.from + (w.to - w.from) * k;
    if (k >= 1) {
      state.ui[w.key] = w.to;
      tweens.splice(i, 1);
      w.resolve();
    }
  }
}

/* ------------------------------------------------------------------ *
 * Shop / panel handlers
 * ------------------------------------------------------------------ */

/**
 * Save the campaign to the current account.
 */
function persist() {
  accounts.writeSave(serializeCampaign());
}

const shopHandlers = {
  buyPickaxe: (i) => {
    import('./systems/economy.js').then((m) => {
      if (m.buyPickaxe(i)) {
        persist();
        showShop(shopHandlers);
      }
    });
  },
  equipPickaxe: (i) => {
    import('./systems/economy.js').then((m) => {
      if (m.equipPickaxe(i)) {
        persist();
        showShop(shopHandlers);
      }
    });
  },
  buyLuck: (i) => {
    import('./systems/economy.js').then((m) => {
      if (m.buyLuck(i)) {
        persist();
        showShop(shopHandlers);
      }
    });
  },
  buyGear: (k) => {
    import('./systems/economy.js').then((m) => {
      if (m.buyGear(k)) {
        persist();
        showShop(shopHandlers);
      }
    });
  },
  close: closePanel,
};

const itemHandlers = {
  shop: () => {
    state.ui.modal = 'shop';
    showShop(shopHandlers);
  },
  itemsUpgrades: () => {
    showItems(itemHandlers);
  },
  buyRope: () => economy('buyRope'),
  buyHook: () => economy('buyHook'),
  upgradeRope: (i) => economy('upgradeRope', i),
  upgradeHook: (i) => economy('upgradeHook', i),
  retrieveRope: () => {
    retrieveRope();
    showItems(itemHandlers);
  },
  useRope: () => {
    closePanel();
    ropeKey();
  },
  useHook: () => {
    closePanel();
    grapKey();
  },
  ropeNear: () => ropeNear(3),
  close: closePanel,
};

/**
 * Run an economy action and refresh the panel.
 * @param {string} fn
 * @param {number} [arg]
 */
function economy(fn, arg) {
  import('./systems/economy.js').then((m) => {
    const r = arg === undefined ? m[fn]() : m[fn](arg);
    if (r) {
      persist();
      showItems(itemHandlers);
    }
  });
}

/**
 * Close the open panel.
 */
function closePanel() {
  state.ui.modal = 0;
  setBlocked(false);
  clearPanel();
  // A panel opened from the title screen has to put the title back, or
  // closing it leaves the player looking at an empty screen.
  if (state.ui.screen !== 'play') showTitle(titleHandlers);
}

/**
 * Open or close the upgrade shop.
 */
function toggleShop() {
  state.ui.modal = state.ui.modal === 'shop' ? 0 : 'shop';
  if (state.ui.modal) {
    setBlocked(true);
    showShop(shopHandlers);
  } else {
    setBlocked(false);
    clearPanel();
  }
}

/**
 * Open or close the cave-items store.
 */
function toggleItems() {
  state.ui.modal = state.ui.modal === 'items' ? 0 : 'items';
  if (state.ui.modal) {
    setBlocked(true);
    showItems(itemHandlers);
  } else {
    setBlocked(false);
    clearPanel();
  }
}

/* ------------------------------------------------------------------ *
 * Death
 * ------------------------------------------------------------------ */

on('player:death', (cause) => {
  if (state.ui.screen !== 'play') return;
  const p = state.player;
  const inv = { ores: { ...state.inventory.ores }, decoy: state.inventory.decoy };
  state.inventory.ores = {};
  state.inventory.decoy = 0;
  state.campaign.gear = {};
  p.hp = 0;
  state.ui.screen = 'death';
  state.ui.deathCause = cause;
  setBlocked(true);
  showDeath({ respawn });
});

/**
 * Respawn at the camp after death.
 */
function respawn() {
  const p = state.player;
  p.x = 9;
  p.y = SF - 0.86;
  p.vx = 0;
  p.vy = 0;
  p.hp = p.maxHp;
  p.f = 1;
  // The body is left in the lair with the pack.
  const n = (state.ui.bodies || []).length;
  state.ui.bodies = state.ui.bodies || [];
  state.ui.bodies.push({
    x: state.world.lair.x - 6 + (n % 7) * 2,
    y: state.world.lair.y - 3,
    inv: { ores: { ...state.inventory.ores }, decoy: state.inventory.decoy },
  });
  // The monster forgets you. V8 left mem.snd and mem.hide intact after death,
  // which meant it still remembered where you buried.
  state.memory.snd = {};
  state.memory.rt = {};
  state.memory.hide = [];
  state.memory.runX = 0;
  spawnMonster(state.monster.variant);
  state.monster.w = 8;
  state.ui.screen = 'play';
  state.ui.deathCause = null;
  clearPanel();
  setBlocked(false);
  state.ui.camera.sn = 1;
  tween('fade', 0, 1);
  toast('You wake at the camp. Your pack is gone.', '#f88');
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

/**
 * Show a fatal error to the player.
 *
 * A game that dies silently is unreportable. This puts the message on screen
 * and in the console, and keeps the details in the title for a bug report.
 * @param {string} msg
 */
function showFatal(msg) {
  reportError(msg);
}

/**
 * Start the game.
 */
async function boot() {
  loadSettings();
  const canvas = document.getElementById('c');
  const ui = document.getElementById('ui');
  initRenderer(canvas);
  mountUI(ui);

  // A visible error strip, so a crash is reportable rather than a black screen.
  const errStrip = document.createElement('pre');
  errStrip.id = '__err';
  errStrip.style.cssText =
    'position:absolute;left:0;right:0;top:0;z-index:9999;margin:0;padding:8px 12px;' +
    'background:#3a0f12;color:#ff9a9a;font:12px/1.4 monospace;display:none;white-space:pre-wrap;max-height:30vh;overflow:auto';
  document.body.appendChild(errStrip);
  window.addEventListener('error', (e) => showFatal(e.message + '  @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => showFatal('Promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));
  state.ui.camera = { x: 0, y: SF - 8, sn: 1 };
  state.ui.bodies = [];
  state.ui.time = 0;
  state.ui.heartbeat = 0;
  state.ui.heartbeatLevel = 0;
  state.ui.mouseCell = { x: 0, y: 0 };
  state.ui.mouseWorld = { x: 0, y: 0 };
  state.ui.lastBiome = null;
  state.ui.elevatorY = null;

  // menu background
  const menu = generateMenuWorld();
  state.world.g = menu.g;
  state.world.o = menu.o;
  state.world.dg = menu.dg;
  state.world.h = menu.h;
  state.world.hy = menu.hy;
  state.ui.screen = 'title';

  initInput(canvas, {
    wake: () => initAudio(),
    escape: handleEscape,
    rebinding: (code) => {
      if (!rebinding) return;
      const { action, restore } = rebinding;
      rebinding = null;
      setRebinding(false);
      if (code !== 'Escape') {
        const other = Object.keys(state.meta.bindings).find((k) => k !== action && state.meta.bindings[k] === code);
        if (other) state.meta.bindings[other] = state.meta.bindings[action];
        state.meta.bindings[action] = code;
        saveSettings();
      }
      restore();
      showSettings(settingsHandlers, Object.entries(BINDING_LABELS));
    },
    canvasDown: (button) => {
      if (button === 2) {
        if (targeting) {
          cancelTargeting();
          return true;
        }
        return false;
      }
      if (button === 0) {
        if (state.ui.dialogue) {
          advanceDialogue();
          return true;
        }
        if (targeting) {
          confirmTargeting();
          return true;
        }
        // The money panel opens the shops, the way V8 did: the left half is
        // the upgrade shop, the right half the cave-items store.
        const pl = state.player;
        if (pl.y > SF + 2 && !G && mouse.x > W - 190 && mouse.x < W - 10 && mouse.y > 64 && mouse.y < 90) {
          if (mouse.x < W - 90) toggleShop();
          else toggleItems();
          return true;
        }
      }
      return false;
    },
    blur: () => {
      if (state.ui.screen === 'play' && !state.ui.paused && !state.ui.modal && !state.ui.dialogue) {
        pause();
      }
    },
    submit: () => {
      const un = document.getElementById('un');
      const pw = document.getElementById('pw');
      if (un && pw) handleAuth(false);
    },
  });

  // mouse cell for targeting
  setInterval(() => {
    const m = state.ui.mouseWorld;
    m.x = state.ui.camera.x + mouse.x / T;
    m.y = state.ui.camera.y + mouse.y / T;
    state.ui.mouseCell = { x: Math.floor(m.x), y: Math.floor(m.y) };
  }, 16);

  // assets load in the background and never block play
  const man = await loadManifest();
  preload(man);

  await accounts.detectCloud();
  await accounts.restoreSession();
  state.ui.saves = await accounts.listSaves();
  showTitle(titleHandlers);

  requestAnimationFrame(loop);
}

const titleHandlers = {
  auth: (signUp) => handleAuth(signUp),
  start: () => {
    state.ui.screen = 'menu';
    showDifficulty({
      start: (d) => {
        state.ui.screen = 'play';
        newGame(d);
      },
      back: () => {
        state.ui.screen = 'title';
        showTitle(titleHandlers);
      },
      erase: async () => {
        if (!confirm('Erase all saved progress for this account? This cannot be undone.')) return;
        await accounts.eraseSaves();
        showDifficulty(titleHandlers.start ? difficultyHandlers : difficultyHandlers);
      },
      savedFor: (d) => {
        const saves = state.ui.saves || {};
        return saves[d];
      },
    });
  },
  camp: () => {
    state.ui.modal = 'camp';
    setBlocked(true);
    showCamp(campHandlers);
  },
  skills: () => {
    state.ui.modal = 'skills';
    setBlocked(true);
    showSkills(skillHandlers);
  },
  settings: () => {
    state.ui.modal = 'settings';
    setBlocked(true);
    showSettings(settingsHandlers, Object.entries(BINDING_LABELS));
  },
  logout: () => {
    accounts.logout();
    showTitle(titleHandlers);
  },
};

const difficultyHandlers = {
  start: (d) => {
    state.ui.screen = 'play';
    newGame(d);
  },
  back: () => {
    state.ui.screen = 'title';
    showTitle(titleHandlers);
  },
  erase: async () => {
    if (!confirm('Erase all saved progress for this account? This cannot be undone.')) return;
    await accounts.eraseSaves();
  },
  savedFor: (d) => (state.ui.saves || {})[d],
};

const campHandlers = {
  build: (b) => {
    import('./systems/progression.js').then((m) => {
      if (m.buildCamp(b.id)) {
        persist();
        showCamp(campHandlers);
      }
    });
  },
  close: closePanel,
};

const skillHandlers = {
  skill: (id) => {
    import('./systems/progression.js').then((m) => {
      if (m.unlockSkill(id)) {
        persist();
        showSkills(skillHandlers);
      }
    });
  },
  close: closePanel,
};

const settingsHandlers = {
  setVolume: (v) => {
    state.meta.settings.vol = v;
    saveSettings();
    import('./audio/audio.js').then((m) => m.setVolume(v));
  },
  setSens: (v) => {
    state.meta.settings.sens = v;
    saveSettings();
  },
  beginRebind: (action, restore) => {
    rebinding = { action, restore };
    setRebinding(true);
  },
  defaults: () => {
    state.meta.bindings = { ...DEFAULT_BINDINGS };
    saveSettings();
    showSettings(settingsHandlers, Object.entries(BINDING_LABELS));
  },
  back: () => {
    rebinding = null;
    setRebinding(false);
    state.ui.modal = 0;
    setBlocked(false);
    clearPanel();
    showTitle(titleHandlers);
  },
};

/**
 * Handle the login / signup form.
 * @param {boolean} signUp
 */
async function handleAuth(signUp) {
  const un = document.getElementById('un');
  const pw = document.getElementById('pw');
  const er = document.getElementById('er');
  const name = (un?.value || '').trim();
  const password = pw?.value || '';
  const res = signUp ? await accounts.signup(name, password) : await accounts.login(name, password);
  if (!res.ok) {
    if (er) {
      er.textContent = res.error;
      er.className = '';
    }
    return;
  }
  if (er) {
    er.textContent = 'Signed in.';
    er.className = 'ok';
  }
  sfx.ui();
  state.ui.saves = await accounts.listSaves();
  showTitle(titleHandlers);
}

/**
 * Pause the game.
 */
function pause() {
  state.ui.paused = true;
  setBlocked(true);
  showPause({
    resume: () => {
      state.ui.paused = false;
      setBlocked(false);
      clearPanel();
    },
    settings: () => {
      state.ui.modal = 'settings';
      showSettings(settingsHandlers, Object.entries(BINDING_LABELS));
    },
    quit: () => {
      persist();
      state.ui.screen = 'title';
      state.ui.paused = false;
      state.ui.modal = 0;
      setBlocked(false);
      clearPanel();
      const menu = generateMenuWorld();
      state.world.g = menu.g;
      state.world.o = menu.o;
      state.world.dg = menu.dg;
      state.world.h = menu.h;
      state.world.hy = menu.hy;
      showTitle(titleHandlers);
    },
  });
}

/**
 * Handle the escape key.
 */
function handleEscape() {
  if (rebinding) {
    const r = rebinding;
    rebinding = null;
    setRebinding(false);
    r.restore();
    showSettings(settingsHandlers, Object.entries(BINDING_LABELS));
    return;
  }
  // Escape skips the current dialogue rather than opening the menu.
  if (state.ui.dialogue) {
    skipDialogue();
    return;
  }
  if (state.ui.modal) {
    closePanel();
    return;
  }
  if (targeting) {
    cancelTargeting();
    return;
  }
  if (state.ui.screen === 'play') {
    state.ui.paused ? (state.ui.paused = false, setBlocked(false), clearPanel()) : pause();
  } else if (state.ui.screen === 'title') {
    showTitle(titleHandlers);
  }
}

/**
 * One frame of the game: update, render, and clear the per-frame input.
 * @param {number} dt seconds
 */
function frame(dt) {
  try {
    // Tweens run before the update so an awaited tween resolves on the same
    // frame it reaches its target.
    updateTweens(dt);
    if (state.ui.screen === 'play') update(dt);
    else state.ui.time += dt;
    render();
    // The dialogue is drawn after the world so the canvas clear cannot wipe it.
    if (state.ui.dialogue) drawDialogue();
    if (banner) drawBanner(banner);
    drawToasts();
  } catch (err) {
    if (!window.__evErrorLogged) {
      window.__evErrorLogged = true;
      showFatal('update/render failed: ' + (err && err.message ? err.message : String(err)));
    }
  }
  endFrame();
}

/**
 * The frame loop.
 * @param {number} t timestamp
 */
let last = 0;
/** Rolling frame time, used by the debug readout. */
const perf = { ms: 0, frames: 0, fps: 0, acc: 0 };
const showDebug = typeof location !== 'undefined' && location.search.includes('debug');

function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  const frameStart = performance.now();
  last = t;
  // A test harness can take over the clock: a browser tab the user cannot
  // see has its animation frames frozen, and a probe driving a game that is
  // not ticking learns nothing. While the probe drives, this loop does
  // nothing at all — not even endFrame(), which would clear the key presses
  // the probe has just dispatched but not yet ticked.
  if (!window.__evDrive) frame(dt);
  const ms = performance.now() - frameStart;
  perf.ms = perf.ms * 0.9 + ms * 0.1;
  perf.acc += dt;
  perf.frames++;
  if (perf.acc >= 0.5) {
    perf.fps = perf.frames / perf.acc;
    perf.frames = 0;
    perf.acc = 0;
  }
  if (showDebug) {
    const ctx = context();
    if (ctx) {
      const p = state.player;
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8fe';
      ctx.fillText(perf.ms.toFixed(1) + 'ms  ' + perf.fps.toFixed(0) + 'fps', W - 10, H - 12);
      ctx.fillText(
        'x=' + p.x.toFixed(1) + ' y=' + p.y.toFixed(1) +
        ' biome=' + (biomeAtRow(Math.floor(p.y), state.world.st, state.world.h)?.id ?? '?') +
        ' m=' + state.monster.s + ' d=' + Math.round(Math.hypot(p.x - state.monster.x, p.y - state.monster.y)),
        W - 10,
        H - 28
      );
      // aim + pack readout, so a browser run can be verified without guessing
      const ac = Math.floor(aim.y) * WW + Math.floor(aim.x);
      const pack = ORE_IDS.map((k) => (state.inventory.ores[k] ? k[0] + state.inventory.ores[k] : '')).join(' ');
      ctx.fillText(
        'aim ' + aim.x + ',' + aim.y + ' v' + (state.world.g[ac] ?? 0) +
        ' ore' + (state.world.o[ac] ?? 0) + ' ok=' + aim.ok + ' | ' + pack,
        W - 10,
        H - 44
      );
      ctx.fillText(
        'keys n=' + inputLog.count + ' last=' + inputLog.code + '/' + inputLog.key +
        ' tgt=' + inputLog.target + ' rep=' + inputLog.repeat,
        W - 10,
        H - 60
      );
      ctx.fillText(
        'use=' + (state.meta.bindings?.use ?? 'NONE') +
        ' blk=' + isBlocked() + ' pr=' + pressedCount() +
        ' dlg=' + (state.ui.dialogue ? 'y' : 'n') +
        ' hit=' + hitLog.count + '/' + hitLog.last,
        W - 10,
        H - 76
      );
    }
  }
  requestAnimationFrame(loop);
}

/**
 * Draw the biome banner.
 * @param {Object} b
 */
function drawBanner(b) {
  const ctx = context();
  if (!ctx) return;
  const t = b.t;
  const alpha = t < 0.4 ? t / 0.4 : t > 2.8 ? Math.max(0, (3.4 - t) / 0.6) : 1;
  ctx.globalAlpha = alpha;

  // The biome's own artwork, cover-fitted into the banner strip. The flat
  // panel is the fallback when the asset is missing.
  const img = getImage('biome.banner.' + b.biome.id);
  let painted = false;
  if (img && img.complete && img.naturalWidth) {
    const s = Math.max(W / img.naturalWidth, 120 / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.drawImage(img, (W - dw) / 2, H / 2 - 60 + (120 - dh) / 2, dw, dh);
    ctx.fillStyle = 'rgba(6,8,12,.55)';
    ctx.fillRect(0, H / 2 - 60, W, 120);
    painted = true;
  }
  if (!painted) {
    ctx.fillStyle = 'rgba(6,8,12,.82)';
    ctx.fillRect(0, H / 2 - 60, W, 120);
  }
  ctx.strokeStyle = b.biome.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H / 2 - 60);
  ctx.lineTo(W, H / 2 - 60);
  ctx.moveTo(0, H / 2 + 60);
  ctx.lineTo(W, H / 2 + 60);
  ctx.stroke();
  const ctx2 = ctx;
  ctx2.font = 'bold 34px Georgia';
  ctx2.fillStyle = b.biome.accent;
  ctx2.textAlign = 'center';
  ctx2.fillText(b.biome.name.toUpperCase(), W / 2, H / 2 - 6);
  ctx2.font = '17px Georgia';
  ctx2.fillStyle = '#cfd8e2';
  ctx2.fillText(b.biome.desc, W / 2, H / 2 + 26);
  ctx.globalAlpha = 1;
}

/**
 * Draw the toast stack.
 */
function drawToasts() {
  const ctx = context();
  if (!ctx) return;
  ctx.font = '17px Georgia';
  ctx.textAlign = 'center';
  state.ui.toasts.forEach((t, i) => {
    ctx.fillStyle = t.c;
    ctx.fillText(t.t, W / 2, 60 + i * 22);
  });
}

/**
 * A test hook.
 *
 * The probe in tools/probe.html drives the game through real events, but it
 * cannot rely on the browser's animation frames: a tab the user cannot see
 * has them frozen, and a probe driving a game that is not ticking learns
 * nothing. Setting `__evDrive` hands the clock over to the probe, which then
 * calls `__evTick(frames)` itself.
 */
window.__evTick = (frames) => {
  for (let i = 0; i < frames; i++) frame(1 / 60);
};

boot();
