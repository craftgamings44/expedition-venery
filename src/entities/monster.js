/**
 * Monster AI.
 *
 * The monster hunts by sound, not sight. It cannot see through rock: line of
 * sight only applies in open space within its sight radius. It accumulates
 * memory of sound sources, investigates them, and when it loses you it
 * remembers the direction you fled and looks there next time.
 *
 * Ported from V8's `mUp`, with the difference that a variant supplies the
 * tuning and the starting adaptations.
 */

import { WW, SF } from '../core/constants.js';
import { cl, dist, rnd } from '../core/math.js';
import { state } from '../state/store.js';
import { on, emit } from '../core/events.js';
import { isSolid, TILE_EMPTY } from '../world/tiles.js';
import { findPath } from '../world/pathfind.js';
import { monsterById } from '../data/monsters.js';
import { difficulty } from '../state/selectors.js';

/** Habituation counters — how the monster adapts to you over time. */
export const habit = { decoy: 0, burrow: 0, upesc: 0, near: 0 };
/** Acquired adaptations. */
export const adapt = { climb: 0, dig: 0, lunge: 0 };

/** Current variant definition. */
let variant = monsterById('watcher');

/**
 * Create a fresh monster at the lair.
 * @param {string} variantId
 */
export function spawnMonster(variantId) {
  variant = monsterById(variantId);
  const m = state.monster;
  m.x = state.world.lair.x + 0.5;
  m.y = state.world.lair.y + 0.5;
  m.s = 'patrol';
  m.path = [];
  m.pi = 0;
  m.w = 3;
  m.f = -1;
  m.cd = 3;
  m.rec = 0;
  m.lun = 0;
  m.rp = 0;
  m.lg = 0;
  m.ph = 0;
  m.jw = 0;
  m.dt = '';
  m.sq = [];
  m.variant = variant.id;
  habit.decoy = 0;
  habit.burrow = 0;
  habit.upesc = 0;
  habit.near = 0;
  adapt.climb = 0;
  adapt.dig = 0;
  adapt.lunge = 0;
  // Variants start with their adaptations already earned.
  for (const a of variant.adaptations) adapt[a] = 1;
}

/**
 * Can the monster pass through this tile?
 * @param {number} idx tile index
 * @returns {boolean}
 */
function passable(idx) {
  const w = state.world;
  const g = w.g;
  if (!g[idx]) return true;
  if (w.dg[idx] && adapt.dig) return true;
  if (!g[idx - WW] && !g[idx + WW] && (!g[idx - 1] || !g[idx + 1])) return true;
  return false;
}

/**
 * Line of sight between two points — blocked by solid rock.
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @returns {boolean}
 */
export function lineOfSight(x0, y0, x1, y1) {
  const d = dist(x0, y0, x1, y1);
  const n = Math.ceil(d * 2);
  for (let i = 1; i < n; i++) {
    if (isSolid(state.world.g, WW, state.world.h, Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n))) return false;
  }
  return true;
}

/**
 * Register a sound. Called via the 'noise' event.
 * @param {Object} e
 */
function hearNoise(e) {
  const p = state.player;
  if (p && (e.kind === 'mine' || e.kind === 'step' || e.kind === 'land')) {
    p.nz = Math.max(p.nz || 0, Math.min(1, e.intensity / 10));
  }
  const m = state.monster;
  if (!m || p.y < SF || e.kind === 'monsterdig' || m.s === 'dead') return;
  if (state.world.sl?.s === 1) return;

  const D = difficulty();
  const d = dist(e.x, e.y, m.x, m.y);
  const key = e.kind + (e.x >> 3) + ',' + (e.y >> 3);
  const mem = state.memory.snd;
  const rec = mem[key] || (mem[key] = { t: e.kind, x: e.x, y: e.y, c: 0 });
  const R = e.intensity * (1 + rec.c * 1.2) * D.hr * variant.hearing;
  if (d > R) return;
  rec.c = Math.min(1, rec.c + D.L * 0.06);
  rec.x = e.x;
  rec.y = e.y;

  if (e.kind === 'decoy' && habit.decoy > D.thr && Math.random() < habit.decoy) return;
  if (e.kind === 'step' || e.kind === 'land') {
    if (d > 3) return;
  }
  if (m.s === 'chase') return;

  m.s = 'inv';
  m.dt = e.kind;
  goTo(e.x, e.y);
  m.w = 0;
}

// Subscribe once — the monster hears every noise event in the world.
on('noise', hearNoise);

/**
 * Path the monster to a point.
 * @param {number} x @param {number} y
 */
export function goTo(x, y) {
  const m = state.monster;
  const w = state.world;
  m.path = findPath(w.g, w.dg, WW, w.h, Math.floor(m.x), Math.floor(m.y), Math.floor(x), Math.floor(y), !!adapt.dig);
  m.pi = 0;
}

/**
 * Choose a destination when the monster has nothing better to do.
 */
function pickTarget() {
  const m = state.monster;
  const D = difficulty();
  const rand = Math.random();
  let best = null;
  let bc = 0;

  for (const k in state.memory.snd) {
    const s = state.memory.snd[k];
    if (s.t === 'mine' && s.c > D.thr * 0.6 && s.c * Math.random() > bc) {
      bc = s.c * Math.random();
      best = [s.x, s.y];
    }
  }
  let ac = 0;
  for (const k in state.memory.rt) {
    const c = state.memory.rt[k];
    const [kx, ky] = k.split(',');
    if (c > D.thr * 0.5 && c * Math.random() > bc) {
      bc = c * Math.random();
      best = [kx * 4 + 2, ky * 4 + 2];
    }
    if (Math.abs(kx * 4 - state.world.pad.x) < 10 && Math.abs(ky * 4 - state.world.pad.f) < 10) ac += c;
  }
  if (ac > D.thr && rand < 0.45) {
    goTo(state.world.pad.x + rnd(-6, 6), state.world.pad.f - 2);
    return;
  }
  if (best && rand < 0.65) {
    goTo(best[0], best[1]);
    return;
  }
  if (rand < 0.6) {
    goTo(state.world.lair.x + rnd(-9, 9), state.world.lair.y + rnd(-3, 3));
  } else {
    for (let i = 0; i < 20; i++) {
      const x = rnd(4, WW - 4) | 0;
      const y = rnd(difficulty().st, state.world.h - 4) | 0;
      if (passable(y * WW + x)) {
        goTo(x, y);
        break;
      }
    }
  }
  void m;
}

/**
 * Advance the monster along its path.
 * @param {number} dt
 * @param {number} sp speed
 * @returns {boolean} true when the path is exhausted
 */
function step(dt, sp) {
  const m = state.monster;
  if (m.pi >= m.path.length) {
    m.path = [];
    return true;
  }
  const c = m.path[m.pi];
  const tx = (c % WW) + 0.5;
  const ty = ((c / WW) | 0) + 0.5;
  const dx = tx - m.x;
  const dy = ty - m.y;
  const d = Math.hypot(dx, dy);
  let f = 1;
  if (dy < -0.1 && !adapt.climb) f = 0.5;

  if (state.world.dg[c] && adapt.dig) {
    f = 0.4;
    if (m.dc !== c) {
      m.dc = c;
      state.memory.digging = { x: tx, y: ty, t: 0.5 };
    }
  }
  if (m.rec > 0) f *= 0.3;
  if (m.lun > 0) f *= 2.6;

  const mv = sp * f * dt;
  if (d <= mv) {
    m.x = tx;
    m.y = ty;
    m.pi++;
  } else {
    m.x += (dx / d) * mv;
    m.y += (dy / d) * mv;
  }
  if (Math.abs(dx) > 0.05) m.f = Math.sign(dx);
  m.ph += dt * sp * 2;
  return 0;
}

/**
 * Update the monster.
 * @param {number} dt
 */
export function updateMonster(dt) {
  const m = state.monster;
  const D = difficulty();
  const p = state.player;
  const underground = p.y > SF + 2;
  if (m.s === 'dead') return;

  m.cd -= dt;
  m.rec -= dt;
  m.lun -= dt;
  if (m.lun > 0) m.fl = 1;
  else if (m.fl) {
    m.fl = 0;
    m.rec = 1.4;
  }

  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.hypot(dx, dy);
  const vis =
    underground &&
    ((d < variant.sight && lineOfSight(m.x, m.y, p.x, p.y)) ||
      (dist(p.x, p.y, state.world.lair.x, state.world.lair.y) < 9 && d < variant.sight * 1.4 && lineOfSight(m.x, m.y, p.x, p.y)));

  if (vis) {
    if (m.s !== 'chase') {
      m.s = 'chase';
      state.ui.monsterRoar = 1;
      m.rs = Math.sign(p.vx) || 0;
      m.rp = 0;
    }
    m.ls = [p.x, p.y];
    m.lg = 0;
    if (p.grip) habit.upesc += D.L * dt * 0.6;
    if (adapt.lunge && m.cd <= 0 && d < 5 && m.lun <= 0) {
      m.lun = 0.5;
      m.cd = 6;
      state.ui.monsterRoar = 1.6;
    }
  } else if (m.s === 'chase') {
    m.lg += dt;
    if (m.lg > D.lose) {
      habit.near += D.L;
      state.memory.runX = state.memory.runX * 0.7 + (m.rs || 0) * 0.3;
      const cf = cl(Math.abs(state.memory.runX) * D.L, 0, 1);
      m.s = 'search';
      m.sq = [[m.ls[0], m.ls[1]]];
      if (cf > D.thr * 0.6) m.sq.push([m.ls[0] + Math.sign(state.memory.runX) * 9 * cf, m.ls[1]]);
      state.memory.hide.filter((h) => h.c > D.thr * 0.5).slice(-2).forEach((h) => m.sq.push([h.x, h.y]));
      m.path = [];
      m.w = 0;
    }
  }

  if (m.s === 'chase') {
    if (!vis && (p.nz || 0) > 0.15 && d < 10 * D.hr) m.ls = [p.x, p.y];
    m.rp -= dt;
    if (m.rp <= 0) {
      goTo(m.ls[0], m.ls[1]);
      m.rp = 0.35;
    }
    step(dt, variant.chaseSpeed * D.cs * 0.5 * (state.ui.biomeSpeed ?? 1));
    if (vis && m.s === 'chase' && Math.abs(dx) < 1.05 && Math.abs(dy) < 1.7) {
      emit('player:death', 'monster');
    }
  } else if (m.w > 0) {
    m.w -= dt;
  } else if (!m.path.length) {
    if (m.s === 'search' && m.sq.length) {
      const t = m.sq.shift();
      goTo(t[0], t[1]);
      if (!m.path.length) m.w = 1;
    } else if (m.s === 'search' || m.s === 'patrol' || m.s === 'home') {
      m.s = 'patrol';
      pickTarget();
      if (!m.path.length) m.w = 1;
    } else {
      m.s = 'search';
      m.w = 2.5;
    }
  } else {
    if (step(dt, m.s === 'patrol' ? variant.patrolSpeed : variant.patrolSpeed * 1.4)) {
      if (m.s === 'inv') {
        if (m.dt === 'decoy') habit.decoy = Math.min(1, habit.decoy + D.L * 0.2);
        m.s = 'search';
        m.sq = [
          [m.x + rnd(-7, 7), m.y + rnd(-3, 3)],
          [m.x + rnd(-7, 7), m.y + rnd(-3, 3)],
        ];
        m.w = 2.5;
      } else {
        m.w = rnd(1, 3);
      }
    } else if (m.s === 'search' && !m.path.length) {
      m.w = 2;
    }
  }

  // It learns where you hide.
  if (m.s === 'search' && p.still > 2.5 && state.world.dg[Math.floor(p.y) * WW + Math.floor(p.x)] && d < 14) {
    habit.burrow += D.L * dt * 0.5;
    if (!state.memory.hide.some((h) => dist(h.x, h.y, p.x, p.y) < 4)) {
      state.memory.hide.push({ x: p.x, y: p.y, c: 0 });
    }
    state.memory.hide.forEach((h) => {
      if (dist(h.x, h.y, p.x, p.y) < 4) h.c = Math.min(1, h.c + D.L * dt * 0.1);
    });
  }

  // Memory of where you have walked, and decay.
  state.memory.t += dt;
  if (underground && state.memory.t > 0.5) {
    state.memory.t = 0;
    const k = (p.x >> 2) + ',' + (p.y >> 2);
    state.memory.rt[k] = Math.min(1, (state.memory.rt[k] || 0) + D.L * 0.06);
  }
  state.memory.d += dt;
  if (state.memory.d > 2) {
    state.memory.d = 0;
    for (const k in state.memory.rt) {
      state.memory.rt[k] *= 0.97;
      if (state.memory.rt[k] < 0.01) delete state.memory.rt[k];
    }
    for (const k in state.memory.snd) state.memory.snd[k].c *= 0.99;
  }

  // Acquired adaptations.
  const threshold = Math.max(0.6, D.thr * 1.1);
  if (!adapt.climb && habit.upesc >= 8 * threshold) {
    adapt.climb = 1;
    state.ui.toast('Scratching on stone, high above you.', '#ff9a7a');
  }
  if (!adapt.dig && habit.burrow >= 6 * threshold) {
    adapt.dig = 1;
    state.ui.toast('Claws rasp through rock nearby.', '#ff9a7a');
  }
  if (!adapt.lunge && habit.near >= 5 * threshold) {
    adapt.lunge = 1;
    state.ui.toast('A coiled rattle in the dark.', '#ff9a7a');
  }

  // Heartbeat proximity cue.
  if (underground) {
    const dd = Math.hypot(dx, dy);
    if ((dd < 16 && m.s !== 'patrol') || dd < 8) {
      state.ui.heartbeat -= dt;
      if (state.ui.heartbeat <= 0) {
        state.ui.heartbeat = 0.35 + dd / 22;
        state.ui.heartbeatLevel = 0.22 * (1 - dd / 16);
      }
    }
  }
}

export { variant as currentVariant };
