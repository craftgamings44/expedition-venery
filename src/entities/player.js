/**
 * Player entity: movement, mining, wall grip, rope and grappling hook.
 *
 * Ported from V8's `pUp` with the same feel, but the global reads became
 * explicit state reads, and the accidental module-level `mt2` timer became a
 * local.
 */

import { WW, SF } from '../core/constants.js';
import { cl, dist } from '../core/math.js';
import { state } from '../state/store.js';
import { down, hit, mouse } from '../core/input.js';
import { emit } from '../core/events.js';
import { isSolid, isMineable, TILE_EMPTY, TILE_LAVA } from '../world/tiles.js';
import { moveSpeed, mineTime, difficulty } from '../state/selectors.js';
import { modifiers } from '../state/selectors.js';

/** Aim state, shared with the renderer. */
export const aim = { x: 0, y: 0, ok: 0, sx: 0, sy: 0, slow: 0, w: 0 };

/** Mining progress state. */
export const mine = { tx: 0, ty: 0, pr: 0 };

/** Grapple animation state, or null. */
export let grapple = null;

/** Rope anchor, mirrored into state.world.rope. */
export const rope = { x: 0, y: 0, b: 0 };

/** Input state for the rope/hook aiming mode, or null. */
export let targeting = null;

/** Cooldown timers. */
const timers = { deeprockToast: 0, grabCooldown: 0, stepTimer: 0 };

/** Set true when the player is holding a wall. */
export let gripping = false;

/**
 * @param {number} x
 * @param {number} y
 * @returns {boolean} true if the player's box overlaps a solid tile
 */
function bodyBlocked(x, y) {
  const p = state.player;
  const x0 = Math.floor(p.x - p.w / 2);
  const x1 = Math.floor(p.x + p.w / 2);
  const y0 = Math.floor(p.y - p.h / 2);
  const y1 = Math.floor(p.y + p.h / 2);
  const w = state.world;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (isSolid(w.g, WW, w.h, xx, yy)) return true;
    }
  }
  return false;
}

/**
 * Find the floor beneath a point.
 * @param {number} x
 * @param {number} y
 * @returns {number} the row of the ground
 */
export function floorAt(x, y) {
  const w = state.world;
  let yy = Math.floor(y);
  let n = 0;
  while (yy < w.h - 1 && !isSolid(w.g, WW, w.h, Math.floor(x), yy) && n++ < 60) yy++;
  return yy;
}

/**
 * Update the player.
 * @param {number} dt seconds
 */
export function updatePlayer(dt) {
  const p = state.player;
  const w = state.world;
  const D = difficulty();
  const mods = modifiers();

  const ax = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  const sp = moveSpeed();
  p.vx += (ax * sp - p.vx) * Math.min(1, dt * 14);
  if (ax) p.f = ax;

  // wall grip check
  const xs = p.x + ax * (p.w / 2 + 0.08);
  const touching = !!ax && (isSolid(w.g, WW, w.h, Math.floor(xs), Math.floor(p.y)) || isSolid(w.g, WW, w.h, Math.floor(xs), Math.floor(p.y + 0.6)));
  gripping = false;
  p.vy = Math.min(26, p.vy + 32 * dt);

  updateRopeClimb(p, dt, ax);

  if (!p.climbing && down('jump') && touching && p.gr <= 0 && p.y > SF + 2) {
    p.vy = -3.2;
    p.gr = 1;
  }
  if (hit('jump') && p.gr > 0) {
    p.vy = -11.9;
    p.gr = 0;
    p.jy = p.y;
    p.jr = 1;
    p.sq = -0.4;
  }
  if (p.jr && !down('jump')) {
    p.jr = 0;
    if (p.vy < 0) {
      const r = 1.25 - (p.jy - p.y);
      p.vy = r <= 0 ? 0 : Math.max(p.vy, -Math.sqrt(64 * r));
    }
  }

  // integrate with substeps so fast movement cannot tunnel through rock
  const vy0 = p.vy;
  const n = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 0.2) || 1;
  let dx = (p.vx * dt) / n;
  let dy = (p.vy * dt) / n;
  let onGround = 0;

  for (let i = 0; i < n; i++) {
    p.x += dx;
    if (bodyBlocked(p.x, p.y)) {
      let ok = false;
      if (p.gr > 0 || onGround) {
        p.y -= 1.02;
        if (!bodyBlocked(p.x, p.y)) ok = true;
        else p.y += 1.02;
      }
      if (!ok) {
        p.x -= dx;
        p.vx = 0;
        dx = 0;
      }
    }
    p.y += dy;
    if (bodyBlocked(p.x, p.y)) {
      p.y -= dy;
      if (dy > 0) onGround = 1;
      p.vy = 0;
      dy = 0;
    }
  }

  p.x = cl(p.x, 0.4, WW - 0.4);
  if (onGround) {
    if (vy0 > 13) emit('noise', { kind: 'land', x: p.x, y: p.y, intensity: 4 });
    p.gr = 0.1 * mods.gripTime;
    p.jr = 0;
    if (vy0 > 7) p.sq = Math.max(p.sq || 0, Math.min(1, (vy0 / 22) * mods.fallDamage));
  } else {
    p.gr = Math.max(0, p.gr - dt);
  }

  // animation drivers
  p.am = (p.am || 0) + (Math.min(1, Math.abs(p.vx) / 4.5) * (onGround ? 1 : 0.6) - (p.am || 0)) * Math.min(1, dt * 10);
  p.ai = (p.ai || 0) + ((onGround ? 0 : 1) - (p.ai || 0)) * Math.min(1, dt * 12);
  p.sq = (p.sq || 0) * Math.exp(-dt * 11);
  p.nz = Math.max(0, (p.nz || 0) - dt * 0.6);
  p.t = (p.t || 0) + dt * Math.abs(p.vx) * 1.6;

  // footstep noise
  if (Math.abs(p.vx) > 1 && onGround) {
    timers.stepTimer -= dt;
    if (timers.stepTimer <= 0) {
      timers.stepTimer = 0.4;
      const stepNoise = 2.5 * (mods.stepNoise ?? 1);
      emit('noise', { kind: 'step', x: p.x, y: p.y, intensity: stepNoise });
    }
  }
  p.still = Math.abs(p.vx) < 0.3 && Math.abs(p.vy) < 0.5 ? (p.still || 0) + dt : 0;

  // hazard damage
  const here = w.g[Math.floor(p.y) * WW + Math.floor(p.x)];
  const head = w.g[Math.floor(p.y + 0.7) * WW + Math.floor(p.x)];
  if (here === TILE_LAVA || head === TILE_LAVA) {
    p.hp -= 45 * dt;
    if (p.hp <= 0) emit('player:death', 'lava');
  } else {
    p.hp = Math.min(p.maxHp, p.hp + 1.5 * dt);
  }

  updateAim(dt);
  updateGrapple(dt);
}

/**
 * Aim and mining.
 * @param {number} dt
 */
function updateAim(dt) {
  const p = state.player;
  const w = state.world;
  const cam = state.ui.camera;
  const sens = state.meta.settings?.sens ?? 1;
  const sx = (p.x - cam.x) * 32;
  const sy = (p.y - cam.y) * 32;
  const ax = sx + (mouse.x - sx) * sens;
  const ay = sy + (mouse.y - sy) * sens;
  const tx = Math.floor(cam.x + ax / 32);
  const ty = Math.floor(cam.y + ay / 32);
  const v = w.g[ty * WW + tx];

  aim.x = tx;
  aim.y = ty;
  aim.sx = ax;
  aim.sy = ay;
  aim.ok = 0;
  const reach = dist(tx + 0.5, ty + 0.5, p.x, p.y) < 3.3;
  if (tx >= 0 && tx < WW && ty >= 0 && ty < w.h && v >= 1 && v <= 3 && reach && ty >= Math.floor(p.y - p.h / 2)) {
    aim.ok = 1;
  }
  aim.slow = 0;

  if (down('mine') && aim.ok) {
    if (mine.tx !== tx || mine.ty !== ty) mine.pr = 0;
    mine.tx = tx;
    mine.ty = ty;
    const tm = mineTime(v);
    aim.slow = tm > 4.5 ? 1 : 0;
    mine.pr += dt / tm;
    p.f = Math.sign(ax - sx) || p.f;
    p.mn = (p.mn || 0) + (1 - (p.mn || 0)) * Math.min(1, dt * 12);

    p.mineTimer = (p.mineTimer || 0) - dt;
    if (p.mineTimer <= 0) {
      p.mineTimer = 0.3;
      const muff = state.campaign.gear.muff ? 0.45 : 1;
      emit('noise', { kind: 'mine', x: p.x, y: p.y, intensity: 7 * muff });
      emit('fx:chips', { x: tx + 0.5, y: ty + 0.5, tile: v });
    }

    if (mine.pr >= 1) {
      mine.pr = 0;
      emit('mining:complete', { x: tx, y: ty, tile: v });
    }
  } else {
    mine.pr = Math.max(0, mine.pr - dt * 1.5);
    p.mn = (p.mn || 0) + (0 - (p.mn || 0)) * Math.min(1, dt * 12);
  }

  timers.deeprockToast -= dt;
}

/**
 * Update the grapple flight.
 * @param {number} dt
 */
function updateGrapple(dt) {
  if (!grapple) return;
  const p = state.player;
  grapple.t += dt;
  const k = cl(grapple.t / grapple.d, 0, 1);
  const e = Math.pow(k, 1.6);
  p.x = grapple.x0 + (grapple.x1 - grapple.x0) * e;
  p.y = grapple.y0 + (grapple.y1 - grapple.y0) * e;
  p.vx = 0;
  p.vy = 0;
  p.ai = 1;
  p.climbing = 0;
  p.still = 0;
  if (k >= 1) {
    grapple = null;
    p.gr = 0.1;
    emit('noise', { kind: 'land', x: p.x, y: p.y, intensity: 4 });
  }
}

/**
 * Start a grapple flight.
 * @param {Object} target
 */
export function startGrapple(target) {
  const p = state.player;
  const d = dist(p.x, p.y, target.x, target.y);
  grapple = { x0: p.x, y0: p.y, x1: target.x, y1: target.y, ex: target.ex, ey: target.ey, t: 0, d: cl(d / 55, 0.14, 0.45) };
  p.vx = 0;
  p.vy = 0;
  p.climbing = 0;
  emit('noise', { kind: 'grap', x: p.x, y: p.y, intensity: 9 });
}

/** @returns {boolean} true while a grapple is in flight */
export const grappling = () => grapple !== null;

/**
 * Rope climbing.
 * @param {Object} p player
 * @param {number} dt
 * @param {number} ax horizontal input
 */
function updateRopeClimb(p, dt, ax) {
  const r = state.world.rope;
  p.nc = Math.max(0, (p.nc || 0) - dt);
  if (!r) {
    p.climbing = 0;
    return;
  }
  const rx = r.x + 0.5;
  const on = Math.abs(p.x - rx) < 0.6 && p.y + 0.85 > r.y + 1 && p.y - 0.85 < r.b + 1;
  const up = down('up');
  const dn = down('down');
  if (!p.climbing && on && (up || dn) && p.nc <= 0) {
    p.climbing = 1;
    emit('sfx:ui');
  }
  if (p.climbing && !on) p.climbing = 0;
  if (!p.climbing) return;

  if (hit('jump')) {
    p.climbing = 0;
    p.nc = 0.35;
    p.vy = -8;
    p.vx = ax * 5;
    return;
  }
  if (ax && !up && !dn && isSolid(state.world.g, WW, state.world.h, Math.floor(p.x), Math.floor(p.y + 0.88))) {
    p.climbing = 0;
    p.nc = 0.2;
    return;
  }
  p.vx = 0;
  p.x += (rx - p.x) * Math.min(1, dt * 14);
  p.vy = ((dn ? 1 : 0) - (up ? 1 : 0)) * 4.2;
  if (p.vy < 0 && p.y - 0.85 <= r.y + 1.02) p.vy = 0;
  p.gr = 0;
  p.jr = 0;
}

/**
 * Is the player near the deployed rope?
 * @param {number} d radius
 * @returns {boolean}
 */
export function ropeNear(d) {
  const r = state.world.rope;
  if (!r) return false;
  const p = state.player;
  return dist(p.x, cl(p.y, r.y + 1, r.b + 1), r.x + 0.5, r.y + 0.5) <= d;
}

/**
 * The row the rope hangs down to.
 * @param {number} tx
 * @param {number} ty
 * @returns {number}
 */
export function ropeBottom(tx, ty) {
  const w = state.world;
  let b = ty + 1;
  while (b + 1 < w.h - 1 && w.g[(b + 1) * WW + tx] === TILE_EMPTY && b - ty < 60) b++;
  return b;
}

/**
 * Validate a rope anchor position.
 * @param {number} tx
 * @param {number} ty
 * @param {number} reach
 * @returns {string} empty string if valid, otherwise the reason
 */
export function validateRope(tx, ty, reach) {
  const p = state.player;
  if (tx < 1 || tx >= WW - 1 || ty < 1 || ty >= state.world.h - 2) return 'Out of bounds.';
  if (dist(tx + 0.5, ty + 0.5, p.x, p.y) > reach) return `Out of range (max ${reach} blocks).`;
  if (ty > Math.floor(p.y) + 1) return 'The rope must anchor at or above you.';
  const v = state.world.g[ty * WW + tx];
  if (!(v >= 1 && v <= 4)) return 'Pick a solid block.';
  if (state.world.g[(ty + 1) * WW + tx] !== TILE_EMPTY) return 'Needs open space below the block.';
  return '';
}

/**
 * Compute a grapple target from the mouse.
 * @param {number} reach
 * @returns {Object}
 */
export function grappleTarget(reach) {
  const p = state.player;
  const cam = state.ui.camera;
  const mx = cam.x + mouse.x / 32;
  const my = cam.y + mouse.y / 32;
  const dx = mx - p.x;
  const dy = my - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  let hx = -1;
  let hy = -1;
  let len = reach;
  for (let s = 0.2; s <= reach; s += 0.1) {
    const x = p.x + ux * s;
    const y = p.y + uy * s;
    if (y >= 0 && isSolid(state.world.g, WW, state.world.h, Math.floor(x), Math.floor(y))) {
      hx = Math.floor(x);
      hy = Math.floor(y);
      len = s;
      break;
    }
  }
  const ex = p.x + ux * len;
  const ey = p.y + uy * len;
  if (hx < 0) return { msg: `Nothing to hook within ${reach} blocks.`, ex, ey };

  let best = null;
  let bd = 1e9;
  for (let cx = hx - 3; cx <= hx + 3; cx++) {
    for (let sy = hy - 3; sy <= hy + 2; sy++) {
      if (cx < 1 || cx >= WW - 1 || sy < 2 || sy >= state.world.h - 1) continue;
      if (isSolid(state.world.g, WW, state.world.h, cx, sy)) continue;
      if (state.world.g[sy * WW + cx] === TILE_LAVA) continue;
      if (isSolid(state.world.g, WW, state.world.h, cx, sy - 1) || isSolid(state.world.g, WW, state.world.h, cx, sy - 2)) continue;
      const dd = Math.hypot(cx - hx, sy - hy) + (sy > hy ? 0.7 : 0);
      if (dd < bd) {
        bd = dd;
        best = { x: cx + 0.5, y: sy - 0.86 };
      }
    }
  }
  if (!best) return { msg: 'No safe landing: a ledge needs 2 blocks of clearance above it.', hx, hy, ex, ey };
  if (dist(best.x, best.y, p.x, p.y) < 2) return { msg: 'Target is too close.', hx, hy, ex, ey };
  return { land: best, hx, hy, ex, ey };
}

export { isMineable };
