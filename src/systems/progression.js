/**
 * Progression: the camp buildings and the skill tree.
 *
 * Both spend a different currency and both grant passive modifiers, so they
 * live together — but they are separate data tables and separate buy functions.
 */

import { state } from '../state/store.js';
import { BUILDINGS, buildingById } from '../data/camp.js';
import { SKILLS, skillById } from '../data/skills.js';
import { skillPointsFor } from '../data/skills.js';
import { toast } from './telegraph.js';

/**
 * Build a camp building.
 * @param {string} id
 * @returns {boolean} success
 */
export function buildCamp(id) {
  const c = state.campaign;
  const b = buildingById(id);
  if (!b) return false;
  if (state.camp.buildings[id]) return false;
  if (c.money < b.price) return false;
  c.money -= b.price;
  state.camp.buildings[id] = 1;
  toast(`${b.name} built`, '#8fe');
  return true;
}

/**
 * Is a building already built?
 * @param {string} id
 * @returns {boolean}
 */
export const hasBuilding = (id) => !!state.camp.buildings[id];

/**
 * Can a skill be unlocked right now?
 * @param {string} id
 * @returns {boolean}
 */
export function canUnlockSkill(id) {
  const s = skillById(id);
  if (!s) return false;
  if (state.skills.unlocked.includes(id)) return false;
  if (state.skills.points < s.cost) return false;
  if (s.req && !state.skills.unlocked.includes(s.req)) return false;
  return true;
}

/**
 * Unlock a skill.
 * @param {string} id
 * @returns {boolean} success
 */
export function unlockSkill(id) {
  if (!canUnlockSkill(id)) return false;
  const s = skillById(id);
  state.skills.points -= s.cost;
  state.skills.unlocked.push(id);
  toast(`${s.name} learned`, '#8fe');
  return true;
}

/**
 * Award skill points for a completed delivery.
 * @param {number} completed how many deliveries are done
 */
export function awardSkillPoints(completed) {
  state.skills.points += skillPointsFor(completed);
}

/** @returns {BuildingDef[]} all building definitions */
export const buildingList = () => BUILDINGS;

/** @returns {SkillDef[]} all skill definitions */
export const skillList = () => SKILLS;
