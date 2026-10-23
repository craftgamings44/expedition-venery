/**
 * Monster archetypes and variants.
 *
 * The base archetype is the V8 behaviour. A variant is a set of overrides, so a
 * new monster is a data entry rather than a new code path. Variants also
 * determine which adaptations the creature starts with (digging, climbing,
 * lunging) — V8 taught those to the monster as it adapted, and variants can
 * simply begin with them.
 *
 * @typedef {Object} MonsterVariant
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {number} sight       sight radius in tiles
 * @property {number} chaseSpeed  tiles per second while chasing
 * @property {number} patrolSpeed tiles per second while patrolling
 * @property {number} hearing     sound sensitivity multiplier
 * @property {number} memory      how long it holds a sound memory (seconds)
 * @property {number} loseChase   seconds of lost sight before it gives up
 * @property {number} aggression  0..1 chance to prioritise the player
 * @property {string[]} adaptations adaptations it starts with
 * @property {number} minDepth     minimum depth fraction to spawn
 * @property {number} weight       relative spawn weight
 * @property {string} accent      colour used in UI and effects
 * @property {string} portrait    key into the asset manifest
 */

/** @type {MonsterVariant[]} */
export const MONSTERS = [
  {
    id: 'watcher',
    name: 'The Watcher',
    desc: 'It waits in the dark and listens.',
    sight: 9,
    chaseSpeed: 4.4,
    patrolSpeed: 2.4,
    hearing: 1.0,
    memory: 12,
    loseChase: 4.0,
    aggression: 0.5,
    adaptations: [],
    minDepth: 0.0,
    weight: 1.0,
    accent: '#ffd94a',
    portrait: 'creature.monster_watcher',
  },
  {
    id: 'hound',
    name: 'Hound',
    desc: 'Faster than you, and it hears further.',
    sight: 11,
    chaseSpeed: 5.6,
    patrolSpeed: 3.0,
    hearing: 1.35,
    memory: 8,
    loseChase: 3.0,
    aggression: 0.75,
    adaptations: ['lunge'],
    minDepth: 0.3,
    weight: 0.75,
    accent: '#ff5a3a',
    portrait: 'creature.monster_hound',
  },
  {
    id: 'burrower',
    name: 'Burrower',
    desc: 'It comes up through the rock. Walls do not stop it.',
    sight: 7,
    chaseSpeed: 3.9,
    patrolSpeed: 2.0,
    hearing: 1.15,
    memory: 20,
    loseChase: 6.0,
    aggression: 0.6,
    adaptations: ['dig'],
    minDepth: 0.5,
    weight: 0.7,
    accent: '#c8b89a',
    portrait: 'creature.monster_burrower',
  },
];

/**
 * Look up a variant by id.
 * @param {string} id
 * @returns {MonsterVariant}
 */
export function monsterById(id) {
  return MONSTERS.find((m) => m.id === id) ?? MONSTERS[0];
}

/**
 * Pick a monster variant for a depth fraction, weighted by `weight`.
 * Deterministic given the supplied random source.
 * @param {number} depthFrac
 * @param {() => number} rand
 * @returns {MonsterVariant}
 */
export function rollMonster(depthFrac, rand) {
  const pool = MONSTERS.filter((m) => depthFrac >= m.minDepth);
  const total = pool.reduce((a, m) => a + m.weight, 0);
  let r = rand() * total;
  for (const m of pool) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return pool[pool.length - 1];
}

/**
 * Adaptation definitions. V8 taught these to the monster as it adapted to you;
 * variants grant them up front.
 * @type {Record<string, {id: string, label: string, desc: string}>}
 */
export const ADAPTATIONS = {
  climb: { id: 'climb', label: 'Climber', desc: 'Scratching on stone, high above you.' },
  dig: { id: 'dig', label: 'Digger', desc: 'Claws rasp through rock nearby.' },
  lunge: { id: 'lunge', label: 'Lunger', desc: 'A coiled rattle in the dark.' },
};
