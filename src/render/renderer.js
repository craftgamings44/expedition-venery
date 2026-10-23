/**
 * Canvas rendering: the world, the actors, the lighting and the HUD.
 *
 * The renderer only reads state. All mutation happens in systems/ and
 * entities/ — that is what keeps the simulation headless-testable.
 *
 * Everything is drawn procedurally except for AI-generated assets, which are
 * layered on top through render/art.js. Tiles and sprites stay code-drawn so
 * the game still renders correctly with no image files present.
 */

import { W, H, T, WW, SF } from '../core/constants.js';
import { cl, hs } from '../core/math.js';
import { state } from '../state/store.js';
import { ORE_IDS, ORES } from '../data/ores.js';
import { biomeAtRow, BIOMES } from '../data/biomes.js';
import { MATERIAL_COLORS } from '../data/pickaxes.js';
import { TILE_EMPTY, TILE_DIRT, TILE_ROCK, TILE_DEEP, TILE_SURFACE, TILE_LAVA, TILE_SHAFT } from '../world/tiles.js';
import { aim, mine, ropeNear, floorAt } from '../entities/player.js';
import { currentVariant } from '../entities/monster.js';
import { monsterAsleep, secondsLeft, waking } from '../systems/spawnlock.js';
import { currentTask, canDeliver, carriedCount, difficulty } from '../state/selectors.js';
import { getImage, drawIcon } from './art.js';

/** @type {HTMLCanvasElement} */
let canvas = null;
/** @type {CanvasRenderingContext2D} */
let ctx = null;
/** @type {HTMLCanvasElement} */
let lightCanvas = null;
/** @type {CanvasRenderingContext2D} */
let lightCtx = null;

/** Lava glow points collected during the tile pass. */
let lavaLights = [];

/**
 * Attach the renderer to a canvas.
 * @param {HTMLCanvasElement} c
 */
export function initRenderer(c) {
  canvas = c;
  ctx = c.getContext('2d');
  lightCanvas = document.createElement('canvas');
  lightCanvas.width = W;
  lightCanvas.height = H;
  lightCtx = lightCanvas.getContext('2d');
}

/** @returns {CanvasRenderingContext2D} */
export const context = () => ctx;

/**
 * Rounded rectangle helper.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} r @param {string} c
 */
export function rr(x, y, w, h, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/**
 * Text helper.
 * @param {string} s @param {number} x @param {number} y
 * @param {number} sz @param {string} [c] @param {string} [al]
 */
export function text(s, x, y, sz, c, al) {
  ctx.font = (sz >= 18 ? 'bold ' : '') + sz + 'px Georgia';
  ctx.fillStyle = c || '#fff';
  ctx.textAlign = al || 'left';
  ctx.fillText(s, x, y);
}

/**
 * Wrapped text.
 * @param {string} t @param {number} x @param {number} y
 * @param {number} w @param {number} lh
 */
export function wrapText(t, x, y, w, lh) {
  const words = t.split(' ');
  let line = '';
  for (const wd of words) {
    const test = line + wd + ' ';
    if (ctx.measureText(test).width > w && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = wd + ' ';
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

/** Screen position of a world x. */
export const sx = (x) => (x - state.ui.camera.x) * T;
/** Screen position of a world y. */
export const sy = (y) => (y - state.ui.camera.y) * T;

/**
 * Draw the whole frame.
 */
export function render() {
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);

  if (state.ui.scene === 'hospital' || state.ui.scene === 'recovery') {
    drawHospital();
  } else if (state.ui.screen === 'title') {
    drawMenuScene();
  } else {
    drawWorld();
    drawEntities();
    drawLighting();
    drawAim();
    drawHud();
  }

  if (state.ui.fade > 0) {
    ctx.globalAlpha = state.ui.fade;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

/**
 * Draw the biome backdrop behind the cave.
 *
 * Rock tiles are opaque, so the backdrop is only visible through open space —
 * which is exactly where the depth of the stratum should read. It scrolls at a
 * fraction of the camera speed so the parallax sells the distance.
 *
 * If the AI art is missing the ambient wash alone carries the biome, so this
 * never depends on an image being present.
 * @param {Object} cam camera
 */
function drawBiomeBackdrop(cam) {
  const b = biomeAtRow(Math.floor(cam.y + H / T / 2), state.world.st, state.world.h);
  ctx.fillStyle = b.palette.ambient;
  ctx.fillRect(0, 0, W, H);

  const img = getImage('biome.backdrop.' + b.id);
  if (!img || !img.complete || !img.naturalWidth) return;

  const par = 0.3;
  const dw = W * 1.4;
  const dh = H * 1.4;
  const ox = -((cam.x * T * par) % dw);
  const oy = -((cam.y * T * par) % dh);
  ctx.globalAlpha = 0.6;
  for (let i = 0; i <= 1; i++) {
    for (let j = 0; j <= 1; j++) {
      ctx.drawImage(img, ox + i * dw, oy + j * dh, dw, dh);
    }
  }
  ctx.globalAlpha = 1;

  // Ambient wash so the backdrop sits behind the rock instead of in front of it.
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = b.palette.ambient;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

/**
 * Draw the cave.
 */
function drawWorld() {
  const w = state.world;
  const cam = state.ui.camera;
  ctx.fillStyle = '#10141b';
  ctx.fillRect(0, 0, W, H);

  // biome backdrop, behind the rock
  drawBiomeBackdrop(cam);

  // sky above the surface
  const surfaceY = sy(SF);
  if (surfaceY > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, surfaceY);
    g.addColorStop(0, '#7fb3da');
    g.addColorStop(1, '#e6f1f8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, surfaceY);
    for (let L = 0; L < 2; L++) {
      ctx.fillStyle = L ? '#8aa2b8' : '#a9bdd0';
      ctx.beginPath();
      ctx.moveTo(0, surfaceY);
      for (let x = 0; x <= W + 40; x += 40) {
        const wx = x + cam.x * T * (0.15 + L * 0.15);
        ctx.lineTo(x, surfaceY - 70 - L * 30 - Math.abs(Math.sin(wx * 0.007 + L * 2)) * 130 - Math.sin(wx * 0.021) * 20);
      }
      ctx.lineTo(W, surfaceY);
      ctx.fill();
    }
  }

  lavaLights = [];
  const x0 = Math.floor(cam.x);
  const y0 = Math.floor(cam.y);
  const g = w.g;
  const o = w.o;
  for (let y = Math.max(0, y0); y < y0 + 19 && y < w.h; y++) {
    for (let x = Math.max(0, x0); x < x0 + 32 && x < WW; x++) {
      const v = g[y * WW + x];
      if (!v) continue;
      const px = Math.floor((x - cam.x) * T);
      const py = Math.floor((y - cam.y) * T);
      const h = hs(x, y) & 7;
      const biome = biomeAtRow(y, w.st, w.h);

      if (v === TILE_LAVA) {
        ctx.fillStyle = 'hsl(' + (18 + h * 3) + ',100%,' + (48 + Math.sin(state.ui.time * 3 + x) * 6) + '%)';
        ctx.fillRect(px, py, T, T);
        lavaLights.push([px + 16, py + 8]);
        continue;
      }
      if (v === TILE_SURFACE) {
        const shaft = x >= 5 && x <= 6 && y <= SF + 1;
        if (y > SF + 1) {
          ctx.fillStyle = '#6b4b2c';
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = '#8a6a44';
          ctx.fillRect(px, py, T, 4);
        } else {
          ctx.fillStyle = y === SF ? (shaft ? '#7b5a3a' : '#e9f3f9') : shaft ? '#0d1015' : '#a5b9c9';
          ctx.fillRect(px, py, T, T);
          if (y === SF && !shaft) {
            ctx.fillStyle = '#9fc4a0';
            ctx.fillRect(px, py, T, 3);
          }
        }
        continue;
      }
      if (v === TILE_SHAFT) {
        ctx.fillStyle = '#0d1015';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#3a3f48';
        ctx.fillRect(px + 15, py, 2, T);
        continue;
      }

      // biome-tinted rock
      const base = biome.palette.rock;
      ctx.fillStyle = v === TILE_DIRT ? biome.palette.dirt : base;
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = h & 1 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
      ctx.fillRect(px + (h & 3) * 6, py + (h >> 1) * 7, 12, 10);
      if (y > 0 && !g[(y - 1) * WW + x]) {
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(px, py, T, 3);
      }
      const ore = o[y * WW + x];
      if (ore) drawOre(px, py, ore, h);
    }
  }
}

/**
 * Draw ore inside a block.
 * @param {number} px @param {number} py
 * @param {number} k 1-based ore index
 * @param {number} h hash variation
 */
function drawOre(px, py, k, h) {
  const def = ORES[ORE_IDS[k - 1]];
  if (!def) return;
  ctx.fillStyle = def.color;
  if (k === 5) {
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 5);
    ctx.lineTo(px + 25, py + 14);
    ctx.lineTo(px + 16, py + 27);
    ctx.lineTo(px + 7, py + 14);
    ctx.fill();
    ctx.fillStyle = '#fffa';
    ctx.fillRect(px + 14, py + 9, 3, 5);
  } else {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(px + 7 + ((i * 7 + h * 3) % 18), py + 8 + ((i * 11 + h * 5) % 17), k === 4 ? 5.5 : 4.5, 0, 6.3);
      ctx.fill();
    }
  }
}

/**
 * Draw actors: the player, the monster, bodies, the rope, the elevator.
 */
function drawEntities() {
  const w = state.world;
  const p = state.player;
  const m = state.monster;

  drawCamp();

  // rope
  if (w.rope) {
    const r = w.rope;
    const x = sx(r.x + 0.5);
    const y0 = sy(r.y + 1);
    const y1 = sy(r.b + 1);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#caa26a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // elevator shaft
  drawElevator();

  // lair bones
  const lr = w.lair;
  if (Math.abs(lr.x - state.ui.camera.x - 15) < 22) {
    for (let i = 0; i < 8; i++) {
      const x = lr.x - 8 + i * 2.3;
      const f = floorAt(x, lr.y - 3);
      ctx.fillStyle = '#d8d0c0';
      ctx.beginPath();
      ctx.arc(sx(x), sy(f) - 6, 6, 0, 6.3);
      ctx.fill();
      ctx.fillRect(sx(x) - 9, sy(f) - 3, 18, 3);
    }
  }

  // monster
  if (m && m.y > SF + 2) {
    const f = Math.min(floorAt(m.x, m.y), m.y + 1.5);
    drawMonster(sx(m.x), sy(f), m.f, m.ph, m.jw, m.lun);
  }

  // player
  if (p) {
    const portrait = getImage('creature.william');
    void portrait;
    drawHero(sx(p.x), sy(p.y + 0.85) + (state.ui.elevatorY || 0) * T, p.f, {
      t: p.t || 0,
      amp: p.am || 0,
      air: p.ai || 0,
      vy: p.vy,
      sq: p.sq || 0,
      mn: (p.mn || 0) > 0.5,
      pk: state.campaign.pk,
      up: p.climbing ? 1 : 0,
    });
  }
}

/**
 * Draw the surface camp.
 */
function drawCamp() {
  if (state.ui.camera.y > SF + 1) return;
  const b = sy(SF);
  for (let i = 0; i < 7; i++) {
    const x = sx(1 + i * 3.7 + (i % 2) * 0.6);
    ctx.fillStyle = '#5a3b24';
    ctx.fillRect(x - 3, b - 14, 6, 14);
    ctx.fillStyle = '#2f5a45';
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.moveTo(x - 22 + j * 3, b - 12 - j * 26);
      ctx.lineTo(x, b - 48 - j * 26);
      ctx.lineTo(x + 22 - j * 3, b - 12 - j * 26);
      ctx.fill();
    }
    ctx.fillStyle = '#e8f3f8';
    ctx.beginPath();
    ctx.moveTo(x - 9, b - 62);
    ctx.lineTo(x, b - 100);
    ctx.lineTo(x + 9, b - 62);
    ctx.fill();
  }
  // tent
  const tx = sx(14);
  ctx.fillStyle = '#b85a3a';
  ctx.beginPath();
  ctx.moveTo(tx, b);
  ctx.lineTo(tx + 60, b - 70);
  ctx.lineTo(tx + 120, b);
  ctx.fill();
  ctx.fillStyle = '#3a1f18';
  ctx.beginPath();
  ctx.moveTo(tx + 45, b);
  ctx.lineTo(tx + 60, b - 34);
  ctx.lineTo(tx + 75, b);
  ctx.fill();
  // crates + lamp post
  rr(sx(3) - 6, b - 34, 34, 34, 2, '#8a6a44');
  rr(sx(3) + 22, b - 22, 28, 22, 2, '#7a5a3a');
  ctx.fillStyle = '#3a3f48';
  ctx.fillRect(sx(8.5), b - 86, 5, 86);
  rr(sx(8.5) - 6, b - 96, 17, 12, 3, '#ffe9a0');
}

/**
 * Draw the elevator.
 */
function drawElevator() {
  const y = state.ui.elevatorY;
  if (y === null || y === undefined) return;
  const x = sx(5);
  const w = 2 * T;
  const top = sy(SF);
  const dy = top + y * T;
  ctx.fillStyle = '#0d1015';
  ctx.fillRect(x, top, w, H - top + 4);
  ctx.fillStyle = '#3a3f48';
  ctx.fillRect(sx(6) - 1, top, 2, H);
  ctx.fillStyle = '#4a4f58';
  ctx.fillRect(x - 4, dy - 66, 5, 66);
  ctx.fillRect(x + w - 1, dy - 66, 5, 66);
  ctx.fillRect(x - 4, dy - 68, w + 8, 5);
  ctx.fillRect(x - 4, dy, w + 8, 8);
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(x, dy + 1, w, 5);
}

/**
 * Draw the player character.
 * @param {number} x @param {number} y @param {number} f facing
 * @param {Object} o animation options
 */
function drawHero(x, y, f, o) {
  const t = o.t || 0;
  const am = o.amp || 0;
  const ai = o.air || 0;
  const sq = o.sq || 0;
  const sit = o.sit;
  const br = Math.sin(state.ui.time * 2.2) * (1 - am);
  const bob = Math.abs(Math.cos(t)) * 2.4 * am * (1 - ai);
  const sw = Math.sin(t) * 0.8 * am;
  const idl = (1 - am) * Math.sin(state.ui.time * 2.2 + 1) * 0.05;
  let lf = -sw;
  let lb = sw;
  let af = sw * 0.9 + idl;
  let ab = -sw * 0.9 - idl;
  if (ai > 0) {
    const u = (cl(-(o.vy || 0) / 8, -1, 1) + 1) / 2;
    lf += -0.3 - 0.4 * u - lf;
    lb += 0.4 + 0.1 * u - lb;
    af += -1.4 - 1.1 * u - af;
    ab += 1.2 - 3.2 * u - ab;
  }
  if (o.up) {
    af = -2.9;
    ab = 2.9;
  }
  if (o.mn) af = -2.2 + Math.sin(state.ui.time * 13) * 0.9;
  if (sit) {
    lf = lb = -1.5;
    af = 0.1;
    ab = -0.1;
  }
  const hy = sit ? 9 : 0;
  const hip = sit ? -9 : -17;
  const ty = -bob - br * 0.6 + hy;
  const hd = ty + Math.sin(state.ui.time * 2.2 + 1) * 0.5 * (1 - am);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f * (1 + sq * 0.14), 1 - sq * 0.14);
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111';

  const R = (a, b, ww, hh, r, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(a, b, ww, hh, r);
    ctx.fill();
    ctx.stroke();
  };
  const L = (px, py, an, ww, hh, c, hc) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(an);
    R(-ww / 2, 0, ww, hh, 3, c);
    if (hc) R(-ww / 2, hh - 5, ww, 7, 3, hc);
    ctx.restore();
  };

  L(-3, hip, lb, 8, 17, '#2a2b2f');
  L(0, -35 + ty, ab, 6, 17, '#eceef2', '#fdd5ad');
  R(-17, -35 + ty, 10, 19, 4, '#2563d8');
  R(-20, -27 + ty, 5, 9, 2, '#1d4fb3');
  R(-10, -36 + ty, 20, 19, 3, '#f5f6f8');
  L(3, hip, lf, 8, 17, '#2a2b2f');
  R(-10, -54 + hd, 20, 18, 7, '#fdd5ad');
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(2, -43 + hd, 1.5, 2.6, 0, 0, 6.3);
  ctx.ellipse(8, -43 + hd, 1.5, 2.6, 0, 0, 6.3);
  ctx.fill();
  R(-11, -60 + hd, 22, 14, 7, '#3f85e0');
  R(-2, -64 + hd, 4, 4, 2, '#3f85e0');
  R(2, -50 + hd, 18, 5, 2.5, '#1f4fb0');
  L(0, -35 + ty, af, 6, 17, '#f5f6f8', '#fdd5ad');
  ctx.restore();
}

/**
 * Draw the monster.
 * @param {number} x @param {number} y @param {number} f facing
 * @param {number} ph phase @param {number} jw jaw @param {number} lun lunging
 */
function drawMonster(x, y, f, ph, jw, lun) {
  const variant = currentVariant;
  const accent = variant.accent;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f, 1);
  const b = Math.sin(ph) * 3;
  const l = Math.sin(ph) * 9;
  ctx.fillStyle = '#1b1226';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-30 + i * 13, -90 + b + i * 4);
    ctx.lineTo(-24 + i * 13, -112 + b + i * 3);
    ctx.lineTo(-16 + i * 13, -94 + b + i * 4);
    ctx.fill();
  }
  rr(-26 + l, -36, 18, 36, 5, '#241a2e');
  rr(8 - l, -36, 18, 36, 5, '#241a2e');
  rr(-34, -100 + b, 66, 72, 22, '#33254a');
  rr(-22, -88 + b, 38, 40, 16, '#42305f');
  rr(16, -84 + b, 14, 56 + l * 0.6, 6, '#2a1d3a');
  rr(-38, -80 + b, 14, 54 - l * 0.6, 6, '#2a1d3a');
  ctx.fillStyle = '#e8e0d0';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(18 + i * 4, -28 + b + l * 0.6, 2, 9);
    ctx.fillRect(-36 + i * 4, -28 + b - l * 0.6, 2, 9);
  }
  rr(18, -106 + b, 46, 30, 10, '#3a2a52');
  ctx.save();
  ctx.translate(22, -80 + b);
  ctx.rotate((jw || 0) * 0.7);
  rr(0, 0, 40, 13, 6, '#2a1d3a');
  ctx.fillStyle = '#f4efe4';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(3 + i * 7, 0);
    ctx.lineTo(6 + i * 7, -8);
    ctx.lineTo(9 + i * 7, 0);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,217,74,.3)';
  ctx.beginPath();
  ctx.arc(52, -94 + b, 9, 0, 6.3);
  ctx.arc(38, -94 + b, 9, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(52, -94 + b, 3.5, 0, 6.3);
  ctx.arc(38, -94 + b, 3.5, 0, 6.3);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw the light-radius mask. Everything outside the lamp is dark.
 */
function drawLighting() {
  const p = state.player;
  if (p.y < SF + 1) return;
  const c = lightCtx;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(2,4,8,.95)';
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'destination-out';
  const L = (x, y, r, a) => {
    const g = c.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(0.6, 'rgba(0,0,0,' + a * 0.6 + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const biome = biomeAtRow(Math.floor(p.y), state.world.st, state.world.h);
  const radius = biome.lightRadius * T;
  L(sx(p.x), sy(p.y), radius, 1);
  L(sx(state.world.pad.x), sy(state.world.pad.f - 2), 4 * T, 0.9);
  for (const l of lavaLights) L(l[0], l[1], 2.6 * T, 0.8);
  ctx.drawImage(lightCanvas, 0, 0);
}

/**
 * Draw the aim reticle and the ore scanner.
 */
function drawAim() {
  const p = state.player;
  if (state.ui.screen !== 'play' || !aim) return;
  const px = sx(aim.x);
  const py = sy(aim.y);
  ctx.strokeStyle = aim.ok ? '#fff' : '#f55';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, T, T);
  if (aim.ok && mine.pr > 0 && mine.tx === aim.x && mine.ty === aim.y) {
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(px, py + T - 6, T, 6);
    ctx.fillStyle = aim.slow ? '#f90' : '#6f6';
    ctx.fillRect(px, py + T - 6, T * mine.pr, 6);
  }
  ctx.beginPath();
  ctx.arc(aim.sx, aim.sy, 4, 0, 6.3);
  ctx.fillStyle = '#fff8';
  ctx.fill();
}

/**
 * Draw the HUD.
 */
function drawHud() {
  if (state.ui.screen !== 'play' && state.ui.screen !== 'death') return;
  const p = state.player;
  const task = currentTask();
  const ores = ORE_IDS.filter((k) => task.r[k]);
  const ok = canDeliver();
  const h = 62 + ores.length * 20;
  rr(10, 10, 290, h, 8, 'rgba(8,14,22,.78)');
  text('Health', 20, 30, 14, '#cfe');
  rr(70, 19, 200, 12, 4, '#322');
  rr(70, 19, (200 * p.hp) / p.maxHp, 12, 4, p.hp > 35 ? '#4c7' : '#e43');
  text(task.n, 20, 52, 15, '#ffd9a0');
  ores.forEach((k, i) => {
    const have = state.inventory.ores[k] || 0;
    text(k + ': ' + have + '/' + task.r[k], 38, 72 + i * 20, 14, have >= task.r[k] ? '#8f8' : ORES[k].color);
    drawIcon(ctx, 'ore.' + k, 26, 70 + i * 20, 14, ORES[k].color);
  });
  const depth = Math.max(0, p.y - SF | 0);
  const biome = biomeAtRow(Math.floor(p.y), state.world.st, state.world.h);
  text(
    p.y < SF + 1 ? (ok ? 'Ready: talk to William to submit' : 'Collect ores, return alive') : ok ? 'Ores ready: return to the elevator!' : biome.name + ' — ' + depth + 'm',
    20,
    92 + ores.length * 20,
    13,
    ok ? '#8f8' : '#9bb'
  );

  // right panel
  rr(W - 190, 10, 180, 48, 8, 'rgba(8,14,22,.78)');
  text('$' + state.campaign.money.toLocaleString('en-US'), W - 20, 32, 18, '#ffe08a', 'right');
  text('Coins ' + (Math.round(state.campaign.coins * 10) / 10).toLocaleString('en-US'), W - 20, 50, 12, '#ffd76a', 'right');
  if (p.y > SF + 2) {
    text('click for upgrades / items', W - 20, 70, 11, '#89a', 'right');
  }

  // biome strip
  if (p.y > SF + 2) {
    const biome2 = biomeAtRow(Math.floor(p.y), state.world.st, state.world.h);
    rr(10, h + 20, 210, 26, 6, 'rgba(8,14,22,.78)');
    text(biome2.name, 20, h + 37, 14, biome2.accent);
    // depth ladder
    const ladder = 8;
    for (let i = 0; i < BIOMES.length; i++) {
      const bx = W - 30 - (BIOMES.length - 1 - i) * 16;
      ctx.fillStyle = BIOMES[i].id === biome2.id ? BIOMES[i].accent : 'rgba(255,255,255,.18)';
      ctx.fillRect(bx, h + 24, 12, 16);
    }
    void ladder;
  }

  // the monster's portrait, once it is awake and close enough to matter
  if (p.y > SF + 2 && !monsterAsleep()) {
    const m = state.monster;
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d < 34) {
      const size = 64;
      const bx = W - 20 - size;
      const by = 70;
      rr(bx - 6, by - 6, size + 12, size + 30, 8, 'rgba(8,14,22,.78)');
      const img = getImage('creature.monster_' + (m.variant || 'watcher'));
      if (img && img.complete && img.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx, by, size, size, 6);
        ctx.clip();
        ctx.drawImage(img, bx, by, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = '#331';
        ctx.beginPath();
        ctx.roundRect(bx, by, size, size, 6);
        ctx.fill();
      }
      text(Math.round(d) + 'm', bx + size / 2, by + size + 16, 13, d < 12 ? '#ff6a5a' : '#cde', 'center');
    }
  }

  // noise bar
  if (p.y > SF + 2) {
    const n = p.nz || 0;
    rr(10, H - 34, 270, 24, 6, 'rgba(8,14,22,.78)');
    text('Noise', 18, H - 17, 13, '#cde');
    rr(62, H - 28, 130, 12, 4, '#222');
    const g = ctx.createLinearGradient(62, 0, 192, 0);
    g.addColorStop(0, '#4c7');
    g.addColorStop(0.5, '#ec4');
    g.addColorStop(1, '#e33');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(62, H - 28, 130 * n, 12, 4);
    ctx.fill();
    text(n < 0.05 ? 'silent' : n < 0.35 ? 'quiet' : n < 0.65 ? 'loud' : 'very loud', 200, H - 17, 12, n < 0.05 ? '#8f8' : '#cde');
  }

  // the monster's grace period, and the moment it wakes up
  if (p.y > SF + 2 && monsterAsleep()) {
    const left = Math.ceil(secondsLeft());
    const by = 10 + h + 52;
    rr(10, by, 250, 34, 8, 'rgba(8,14,22,.85)');
    text(
      'Monster asleep: ' + (left / 60 | 0) + ':' + String(left % 60).padStart(2, '0'),
      20,
      by + 23,
      19,
      '#ffd9a0',
      'left'
    );
  }
  if (waking()) {
    ctx.globalAlpha = Math.max(0, Math.min(1, state.world.sl.b));
    text('THE MONSTER IS AWAKE', W / 2 + 3, H / 2 - 57, 50, '#000', 'center');
    text('THE MONSTER IS AWAKE', W / 2, H / 2 - 60, 50, '#ff4a3a', 'center');
    ctx.globalAlpha = 1;
  }

  // pack contents
  const extras = ORE_IDS.filter((k) => state.inventory.ores[k] && !task.r[k]).map((k) => k + ' ' + state.inventory.ores[k]).join(', ');
  if (extras || state.inventory.decoy) {
    text((extras ? 'Extra: ' + extras + '  ' : '') + (state.inventory.decoy ? 'Decoys: ' + state.inventory.decoy : ''), W / 2, H - 12, 13, '#ccd', 'center');
  }
}

/**
 * The animated menu background.
 */
function drawMenuScene() {
  const w = state.world;
  const hy = w.hy ?? 50;
  const fy = sy(hy + 4);
  const t = (state.ui.time % 20) / 9;
  const show = t < 1;
  const mx = W + 90 - Math.min(t, 1) * (W + 240);
  const ph = state.ui.time * 5;
  drawWorld();
  if (show) drawMonster(mx, fy, -1, ph, 0, 0);
  // lamps
  const c = lightCtx;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(2,4,8,.8)';
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'destination-out';
  for (const lx of [33, 41, 49, 57]) {
    const g = c.createRadialGradient(sx(lx), sy(hy + 0.8), 5.5 * T * 0.1, sx(lx), sy(hy + 0.8), 5.5 * T);
    g.addColorStop(0, 'rgba(0,0,0,.95)');
    g.addColorStop(0.6, 'rgba(0,0,0,.57)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(sx(lx) - 5.5 * T, sy(hy + 0.8) - 5.5 * T, 11 * T, 11 * T);
  }
  ctx.drawImage(lightCanvas, 0, 0);
  for (const lx of [33, 41, 49, 57]) {
    rr(sx(lx) - 2, sy(hy), 4, 9, 2, '#3a3f48');
    rr(sx(lx) - 6, sy(hy) + 8, 12, 10, 3, '#ffe9a0');
  }
}

/**
 * The hospital cutscene.
 */
function drawHospital() {
  const hosp = state.ui.scene === 'hospital';
  ctx.fillStyle = hosp ? '#cfe0e2' : '#e3ddd0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = hosp ? '#8c9aa5' : '#9a8a76';
  ctx.fillRect(0, 400, W, 140);
  ctx.fillStyle = '#fff';
  rr(380, 60, 200, 140, 6, '#bfe0f5');
  ctx.fillRect(478, 60, 4, 140);
  ctx.fillRect(380, 128, 200, 4);
  text(hosp ? 'WAITING ROOM' : 'RECOVERY WARD', W / 2, 40, 16, '#678', 'center');
  if (hosp) {
    rr(150, 360, 380, 22, 4, '#3d6b8a');
    rr(150, 320, 380, 40, 6, '#4a7d9e');
    const jy = state.ui.hospitalJump ? -Math.abs(Math.sin(state.ui.time * 9)) * 22 : 0;
    drawHero(260, 368 + jy * 0.5, 1, { up: state.ui.hospitalUp ? 1 : 0, sit: !state.ui.hospitalJump });
    drawHero(420, 368 + jy, 1, { up: state.ui.hospitalUp ? 1 : 0, sit: !state.ui.hospitalJump });
  } else {
    rr(300, 340, 320, 50, 6, '#fff');
    rr(300, 310, 120, 40, 8, '#d7e6f2');
    drawHero(390, 378, -1, { sit: 1 });
    rr(640, 260, 6, 150, 2, '#667');
    rr(626, 258, 34, 26, 4, '#9cd');
    drawHero(200, 440, 1, {});
  }
}

export { MATERIAL_COLORS, difficulty, ropeNear };
