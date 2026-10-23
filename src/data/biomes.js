/**
 * Biome definitions — the V9 headline mechanic.
 *
 * The cave is divided into depth strata. Each stratum has its own tile palette,
 * ore table, hazards, lighting and monster behaviour. The generator walks these
 * entries in order, so a new biome is a data edit, not an engine change.
 *
 * `depth` is expressed as a fraction of total world height below the surface
 * (0 = just under the surface, 1 = the bottom). Fractions keep biomes working
 * across all three difficulty world heights (60 / 80 / 100 rows).
 *
 * The ore tables are where the rare gems live. Emerald took the weight
 * diamonds used to carry in these same three strata — so emerald turns up at
 * the rate the old diamond did — and diamonds are a third of that, which
 * keeps them the prize without making them a rumour.
 *
 * @typedef {Object} BiomeDef
 * @property {string} id
 * @property {string} name
 * @property {string} desc              shown on the depth banner
 * @property {[number, number]} depth   fraction range below the surface
 * @property {number} wall              tile id for solid walls
 * @property {number} floor             tile id for walkable ground
 * @property {Object} palette           colours: rock, dirt, ambient
 * @property {Object} oreTable          ore id -> relative weight (0 = absent)
 * @property {number} oreDensity        chance of an ore vein per candidate cell
 * @property {string[]} hazards         hazard ids active in this biome
 * @property {number} lightRadius       player light radius in tiles
 * @property {number} monsterSpeed      multiplier on monster move speed
 * @property {number} ambientNoise      background noise floor (0..1)
 * @property {string} accent            colour used for this biome's UI accents
 */

/** @type {BiomeDef[]} */
export const BIOMES = [
  {
    id: 'shale',
    name: 'Shale Veins',
    desc: 'Soft rock. Copper and iron, and the sound of your own pick.',
    depth: [0.0, 0.26],
    wall: 2,
    floor: 1,
    palette: { rock: '#626d79', dirt: '#74512f', ambient: '#2b303b' },
    oreTable: { copper: 0.5, iron: 0.2, gold: 0.12 },
    oreDensity: 0.1,
    hazards: [],
    lightRadius: 6.5,
    monsterSpeed: 1.0,
    ambientNoise: 0.0,
    accent: '#8fb7d6',
  },
  {
    id: 'ember',
    name: 'Ember Shafts',
    desc: 'The rock remembers the heat. Gold, and something that digs.',
    depth: [0.26, 0.52],
    wall: 2,
    floor: 1,
    palette: { rock: '#5a4438', dirt: '#6b4a2c', ambient: '#3a2a20' },
    oreTable: { iron: 0.35, gold: 0.25, ruby: 0.08 },
    oreDensity: 0.12,
    hazards: ['embers'],
    lightRadius: 5.8,
    monsterSpeed: 1.15,
    ambientNoise: 0.06,
    accent: '#fc8',
  },
  {
    id: 'magma',
    name: 'Magma Vaults',
    desc: 'Lava in the seams. Rubies, and a heat that eats your strength.',
    depth: [0.52, 0.76],
    wall: 3,
    floor: 2,
    palette: { rock: '#4a3a30', dirt: '#7a3a20', ambient: '#4a1f10' },
    oreTable: { gold: 0.3, ruby: 0.14, emerald: 0.02, diamond: 0.007 },
    oreDensity: 0.14,
    hazards: ['lava', 'heat'],
    lightRadius: 5.0,
    monsterSpeed: 1.3,
    ambientNoise: 0.1,
    accent: '#ff6a2a',
  },
  {
    id: 'glacial',
    name: 'Glacial Deep',
    desc: 'Ice over black water. Green stones and diamonds sit in the cold, and so does patience.',
    depth: [0.76, 0.92],
    wall: 3,
    floor: 2,
    palette: { rock: '#3e4a58', dirt: '#5a6a7a', ambient: '#1e2a38' },
    oreTable: { ruby: 0.16, emerald: 0.06, gold: 0.1, diamond: 0.02 },
    oreDensity: 0.13,
    hazards: ['cold', 'slick'],
    lightRadius: 4.6,
    monsterSpeed: 1.2,
    ambientNoise: 0.05,
    accent: '#8fe8ff',
  },
  {
    id: 'abyss',
    name: 'The Abyss',
    desc: 'Past the map. Nothing here has ever been mined, and it knows.',
    depth: [0.92, 1.01],
    wall: 3,
    floor: 3,
    palette: { rock: '#241f2e', dirt: '#33283f', ambient: '#120d18' },
    oreTable: { ruby: 0.2, emerald: 0.12, diamond: 0.04 },
    oreDensity: 0.12,
    hazards: ['void', 'cold'],
    lightRadius: 4.0,
    monsterSpeed: 1.45,
    ambientNoise: 0.14,
    accent: '#a06aff',
  },
];

/**
 * Resolve the biome for a depth fraction.
 *
 * The fraction is clamped: rows above the surface belong to the top stratum,
 * and rows past the bottom belong to the deepest one. Without the clamp a
 * surface row fell through every range and reported the last biome.
 * @param {number} f depth fraction below the surface (0..1)
 * @returns {BiomeDef}
 */
export function biomeAt(f) {
  const k = f < 0 ? 0 : f > 1 ? 1 : f;
  for (const b of BIOMES) {
    if (k >= b.depth[0] && k < b.depth[1]) return b;
  }
  return BIOMES[BIOMES.length - 1];
}

/**
 * Resolve the biome for a world row.
 *
 * The fraction is measured from the first row of the cave, not from the
 * surface: the difficulty table starts the cave at different depths, and the
 * strata have to cover the cave that actually exists — otherwise the hard
 * difficulty would begin below the top stratum and never reach it.
 *
 * The fraction is clamped: rows above the cave belong to the top stratum, and
 * rows past the bottom belong to the deepest one. Without the clamp a surface
 * row fell through every range and reported the last biome.
 * @param {number} y world row
 * @param {number} startRow first row of the cave
 * @param {number} height world height in rows
 * @returns {BiomeDef}
 */
export function biomeAtRow(y, startRow, height) {
  const span = Math.max(1, height - startRow);
  return biomeAt((y - startRow) / span);
}

/**
 * Look up a biome by id.
 * @param {string} id
 * @returns {BiomeDef|undefined}
 */
export const biomeById = (id) => BIOMES.find((b) => b.id === id);

/**
 * Hazard definitions. `tick` runs inside the world update.
 * @type {Record<string, {name: string, desc: string, dmg: number}>}
 */
export const HAZARDS = {
  lava: { name: 'Lava', desc: 'Burns you where you stand.', dmg: 45 },
  heat: { name: 'Heat', desc: 'Deep heat drains your strength.', dmg: 8 },
  cold: { name: 'Cold', desc: 'The cold slows your hands.', dmg: 5 },
  slick: { name: 'Slick rock', desc: 'Your footing goes early.', dmg: 0 },
  void: { name: 'The void', desc: 'It takes what you carry.', dmg: 12 },
  embers: { name: 'Embers', desc: 'Ash drifts down and stings.', dmg: 6 },
};
