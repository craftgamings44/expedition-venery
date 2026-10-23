/**
 * The quest chain and the endless paid jobs that follow it.
 *
 * Each quest has a name, the ore it demands, a price, and the dialogue that
 * plays before and after the delivery.
 *
 * @typedef {Object} QuestDef
 * @property {string} name
 * @property {Object<string, number>} req ore requirements
 * @property {number} price
 * @property {string} intro
 * @property {string} outro
 */

/** @type {QuestDef[]} */
export const QUESTS = [
  {
    name: 'First Descent',
    req: { copper: 5, iron: 3 },
    price: 150,
    intro: "Take the elevator down. Bring me copper and iron. Dig down and sideways, never up, and come home before the dark finds you.",
    outro: "Copper and iron. It's a start. Mack's nurse smiled today because of you.",
  },
  {
    name: 'Cold Veins',
    req: { iron: 8, gold: 3 },
    price: 220,
    intro: "Iron again, and gold this time. The tunnels branch deeper now. Listen for anything that listens back.",
    outro: "Gold! You're a natural. Keep your routes unpredictable.",
  },
  {
    name: 'Copper Debt',
    req: { copper: 8, iron: 6, gold: 4 },
    price: 300,
    intro: "The hospital wants a deposit. Copper, iron and gold. Mind the noise you make while digging.",
    outro: "That covers the deposit. Something down there is paying attention to you, I think.",
  },
  {
    name: 'Red Glint',
    req: { ruby: 2, gold: 6, iron: 8 },
    price: 420,
    intro: "Rubies are what the buyers want. They hide deep. Don't haunt the same tunnel twice.",
    outro: "Rubies! Mack saw one and called it a dragon's tear.",
  },
  {
    name: 'Deeper Still',
    req: { ruby: 3, gold: 8, copper: 6, iron: 10 },
    price: 560,
    intro: "Bigger haul today. Whatever lives down there is learning your habits. Be a different miner every trip.",
    outro: "You came back. Good. Rest your hands.",
  },
  {
    name: 'Green Fire',
    req: { emerald: 2, ruby: 2, gold: 6 },
    price: 700,
    intro: "Emeralds now. They sit deep, in the cold strata, and they are still hard to find. Be patient and be careful.",
    outro: 'Emeralds. I never thought I\'d hold one. Thank you.',
  },
  {
    name: 'The Long Dark',
    req: { emerald: 3, diamond: 1, ruby: 3, iron: 10, gold: 6 },
    price: 900,
    intro: "It is clever. Don't trust a tunnel just because it worked before. Use decoys, change routes, dig your own ways.",
    outro: 'Three emeralds and a diamond. Mack is getting stronger.',
  },
  {
    name: 'Heavy Pockets',
    req: { emerald: 4, diamond: 1, ruby: 4, gold: 10 },
    price: 1100,
    intro: "Carry too much and you'll be slow. Choose what's worth the risk.",
    outro: 'Worth every ounce.',
  },
  {
    name: 'Almost There',
    req: { emerald: 4, diamond: 2, ruby: 5, gold: 10, iron: 12 },
    price: 1400,
    intro: 'Nearly enough, nearly. One more big push after this.',
    outro: 'Four emeralds and two diamonds in one trip. Unbelievable.',
  },
  {
    name: 'For Mack',
    req: { emerald: 6, diamond: 3, ruby: 6, gold: 12, iron: 12, copper: 8 },
    price: 1900,
    intro: 'This is the last one. Everything we need. Bring it all home, then we go to the hospital together.',
    outro: "That's all of it. Mack... Mack is going to live.",
  },
];

/**
 * Ore requirements for paid job N (after the story ends).
 * @param {number} job
 * @returns {Object<string, number>}
 */
export const jobReq = (job) => ({ iron: 8 + (job % 5) * 2, gold: 5 + (job % 4), ruby: 2 + (job % 3), emerald: 1 + (job % 3), diamond: 1 + (job % 2) });

/**
 * The opening dialogue, played on a new game.
 * @param {Object} bindings key bindings, for accurate key names
 * @returns {Array<[string, string]>}
 */
export const introDialogue = (bindings) => [
  ['William', "Welcome to the camp, traveler. I'm William Mussel. This mountain is all I have left."],
  ['William', "My son Mack has cancer. The treatment costs more than I could earn in ten lifetimes, but the ore under these peaks could pay for it."],
  ['William', 'Will you go down and mine for me? Every delivery, I\'ll pay.'],
  ['You', "I'll do it. Mack deserves a chance."],
  ['William', `${bindings.left}/${bindings.right} to move, ${bindings.jump} to jump. Hold ${bindings.mine} to mine where your mouse aims. You can dig down and sideways, never up. Hold jump against a wall to grip and climb.`],
  ['William', `Press ${bindings.use} at the elevator to descend or ride back. A quest only counts when you're back here alive.`],
  ['William', 'And be warned. Something hunts down there. It cannot see through rock, so it only finds you by sound. Watch your noise bar: stay silent behind stone and it won\'t know you exist. In the open, it will see you. It learns how you move and what you do. If it catches you, you lose your pack and the quest starts over. Your body ends up in its lair. Find it, and you\'ll find your pack.'],
  ['William', 'Talk to me for upgrades. First job: copper and iron. Go.'],
];
