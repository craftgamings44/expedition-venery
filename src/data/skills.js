/**
 * The skill tree.
 *
 * Skills are bought with skill points earned from deliveries. Each node has a
 * prerequisite, so the tree has a shape, and each declares its effect as a
 * numeric modifier that the systems read. That keeps the tree data-only — the
 * engine never asks "is this skill a movement skill?".
 *
 * @typedef {Object} SkillDef
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {string} branch  'body' | 'gear' | 'nerve'
 * @property {number} cost    skill points
 * @property {string} [req]   prerequisite skill id
 * @property {Object} effects numeric modifiers consumed by the systems
 * @property {string} icon    key into the asset manifest
 */

/** @type {SkillDef[]} */
export const SKILLS = [
  {
    id: 'quiet_step',
    name: 'Quiet Step',
    desc: 'You place your feet. Footstep noise -40%.',
    branch: 'nerve',
    cost: 1,
    effects: { stepNoise: 0.6 },
    icon: 'skill.quiet_step',
  },
  {
    id: 'strong_grip',
    name: 'Strong Grip',
    desc: 'Hold a wall longer and fall softer. Wall grip lasts 50% longer.',
    branch: 'body',
    cost: 1,
    effects: { gripTime: 1.5, fallDamage: 0.5 },
    icon: 'skill.strong_grip',
  },
  {
    id: 'deep_pockets',
    name: 'Deep Pockets',
    desc: 'Carry more without slowing down. Load penalty reduced by half.',
    branch: 'gear',
    cost: 2,
    effects: { loadPenalty: 0.5 },
    icon: 'skill.deep_pockets',
  },
  {
    id: 'keen_hearing',
    name: 'Keen Hearing',
    desc: 'You hear it before it hears you. The monster is marked on screen while it stalks.',
    branch: 'nerve',
    cost: 2,
    req: 'quiet_step',
    effects: { senseMonster: 1 },
    icon: 'skill.keen_hearing',
  },
  {
    id: 'hardy',
    name: 'Hardy',
    desc: 'You take more punishment. Max health +40.',
    branch: 'body',
    cost: 2,
    req: 'strong_grip',
    effects: { maxHp: 40 },
    icon: 'skill.hardy',
  },
  {
    id: 'lucky_find',
    name: 'Lucky Find',
    desc: 'More of your ore is the good kind. Mining luck +0.4.',
    branch: 'gear',
    cost: 3,
    req: 'deep_pockets',
    effects: { luck: 0.4 },
    icon: 'skill.lucky_find',
  },
  {
    id: 'iron_gut',
    name: 'Iron Gut',
    desc: 'Heat and cold mean less. Hazard damage -50%.',
    branch: 'body',
    cost: 3,
    req: 'hardy',
    effects: { hazardResist: 0.5 },
    icon: 'skill.iron_gut',
  },
  {
    id: 'quick_hands',
    name: 'Quick Hands',
    desc: 'You work faster. Mining speed +25%.',
    branch: 'gear',
    cost: 3,
    req: 'lucky_find',
    effects: { mineSpeed: 1.25 },
    icon: 'skill.quick_hands',
  },
];

/**
 * Skill points awarded for completing a quest or job.
 * @param {number} completed number of deliveries completed
 * @returns {number}
 */
export const skillPointsFor = (completed) => 1 + Math.floor(completed / 3);

/**
 * Look up a skill by id.
 * @param {string} id
 * @returns {SkillDef|undefined}
 */
export const skillById = (id) => SKILLS.find((s) => s.id === id);
