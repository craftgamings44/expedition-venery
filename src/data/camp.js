/**
 * Camp buildings.
 *
 * The camp is the safe hub at the surface. You spend money on buildings that
 * grant permanent passive bonuses, which gives the money earned underground a
 * second home besides pickaxes and luck.
 *
 * @typedef {Object} BuildingDef
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {number} price
 * @property {Object} effects numeric modifiers consumed by the systems
 * @property {string} icon key into the asset manifest
 */

/** @type {BuildingDef[]} */
export const BUILDINGS = [
  {
    id: 'workbench',
    name: 'Workbench',
    desc: 'A proper bench. Mining speed +20%.',
    price: 450,
    effects: { mineSpeed: 1.2 },
    icon: 'camp.workbench',
  },
  {
    id: 'forge',
    name: 'Forge',
    desc: 'Heat and hammer. Pickaxe prices -20%.',
    price: 1200,
    effects: { shopDiscount: 0.8 },
    icon: 'camp.forge',
  },
  {
    id: 'ward',
    name: 'Ward Stones',
    desc: 'Charms against the dark. The monster forgets you a little sooner.',
    price: 2000,
    effects: { monsterMemory: 0.85 },
    icon: 'camp.ward',
  },
  {
    id: 'bunk',
    name: 'Bunk',
    desc: 'You actually sleep. Health regenerates faster at camp.',
    price: 800,
    effects: { campHeal: 2.5 },
    icon: 'camp.bunk',
  },
  {
    id: 'lookout',
    name: 'Lookout Tower',
    desc: 'You can see where the lair is before you go down.',
    price: 3000,
    effects: { revealLair: 1 },
    icon: 'camp.lookout',
  },
];

/**
 * Look up a building by id.
 * @param {string} id
 * @returns {BuildingDef|undefined}
 */
export const buildingById = (id) => BUILDINGS.find((b) => b.id === id);
