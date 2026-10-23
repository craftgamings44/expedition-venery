/**
 * Derived reads over the store.
 *
 * Anything that combines state into a value used by more than one system lives
 * here, so a rule like "mining speed" is defined exactly once. These are pure
 * functions of the current state.
 */

import { state } from './store.js';
import { ORES, ORE_IDS } from '../data/ores.js';
import { SKILLS } from '../data/skills.js';
import { BUILDINGS } from '../data/camp.js';
import { PICKAXES, HARDNESS } from '../data/pickaxes.js';
import { DIFFICULTY, ORE_WEIGHTS } from '../data/difficulty.js';
import { QUESTS, jobReq } from '../data/quests.js';
import { cl } from '../core/math.js';

/** Total ore carried (used for the load penalty). */
export function carriedCount() {
  let n = 0;
  for (const k of ORE_IDS) n += state.inventory.ores[k] || 0;
  return n;
}

/** Difficulty tuning for the current run. */
export function difficulty() {
  return DIFFICULTY[state.campaign.d] ?? DIFFICULTY.normal;
}

/**
 * Aggregate all numeric modifiers from unlocked skills and built camp
 * buildings. Multiplicative modifiers multiply; additive modifiers add.
 * @returns {Object<string, number>}
 */
export function modifiers() {
  /** @type {Object<string, number>} */
  const m = { mineSpeed: 1, loadPenalty: 1, gripTime: 1, fallDamage: 1, hazardResist: 1, monsterMemory: 1, shopDiscount: 1, campHeal: 1, luck: 0, maxHp: 0, senseMonster: 0, revealLair: 0 };
  const apply = (fx) => {
    for (const [k, v] of Object.entries(fx)) {
      if (k in m) m[k] = v >= 1 ? m[k] * v : m[k] + v;
    }
  };
  for (const id of state.skills.unlocked) {
    const s = SKILLS.find((x) => x.id === id);
    if (s) apply(s.effects);
  }
  for (const id of Object.keys(state.camp.buildings)) {
    const b = BUILDINGS.find((x) => x.id === id);
    if (b) apply(b.effects);
  }
  return m;
}

/** Luck multiplier: base from luck level + pickaxe + skills. */
export function luckMultiplier() {
  const pk = PICKAXES[state.campaign.pk] ?? PICKAXES[0];
  const m = modifiers();
  return 1 + 0.5 * state.campaign.lk + (pk.l || 0) + m.luck;
}

/** Time in seconds to mine a tile of the given type. */
export function mineTime(tileType) {
  const pk = PICKAXES[state.campaign.pk] ?? PICKAXES[0];
  const m = modifiers();
  const base = Math.max(0.15, HARDNESS[tileType] / (pk.s * (tileType === 3 ? pk.d || 1 : 1)));
  return base / m.mineSpeed;
}

/** Player move speed, reduced by how much ore is carried. */
export function moveSpeed() {
  const m = modifiers();
  const penalty = Math.min(0.3, carriedCount() * 0.004) * m.loadPenalty;
  return 5.2 * (1 - penalty);
}

/** The current quest or job. */
export function currentTask() {
  const c = state.campaign;
  if (c.end) {
    return {
      n: 'Paid Job #' + c.job,
      r: jobReq(c.job),
      p: 3000 + c.job * 500,
      i: 'Another order came in. Same deal: dig, survive, come home.',
      d: 'Good work. Cash in hand.',
      job: true,
    };
  }
  const q = QUESTS[cl(c.q, 0, QUESTS.length - 1)];
  return { n: `${c.q + 1}. ${q.name}`, r: q.req, p: q.price, i: q.intro, d: q.outro, job: false };
}

/** Whether the current task's ore requirements are met. */
export function canDeliver() {
  const req = currentTask().r;
  return ORE_IDS.every((k) => (state.inventory.ores[k] || 0) >= (req[k] || 0));
}

/** Total sale value of the pack. */
export function packValue() {
  let v = 0;
  for (const k of ORE_IDS) v += (state.inventory.ores[k] || 0) * ORES[k].value * 0.7;
  return Math.round(v);
}

/**
 * Roll a lucky ore find using the current luck and difficulty weights.
 * @param {() => number} rand deterministic random source
 * @returns {number} 1-based ore index, or 0 for "no ore"
 */
export function rollLuckOre(rand) {
  const m = luckMultiplier();
  if (rand() >= 0.06 * (m - 1)) return 0;
  const e = 1 / (1 + 0.15 * (m - 1));
  const weights = ORE_WEIGHTS[state.campaign.d] ?? ORE_WEIGHTS.normal;
  const pk = PICKAXES[state.campaign.pk] ?? PICKAXES[0];
  const w = ORE_IDS.map((k) => {
    const rare = ORES[k].tier >= 4;
    return Math.pow(weights[k] ?? 0, e) * (rare ? pk.rb || 1 : 1);
  });
  const total = w.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i + 1;
  }
  return 1;
}
