/**
 * The single source of truth.
 *
 * V8 kept 43 mutable globals; every subsystem reached into all of them. Here
 * there is one state object with explicit slices. Systems mutate it, renderers
 * and UI read it. Nothing else holds mutable game state.
 *
 * @typedef {Object} CampaignState
 * @property {string} d        difficulty id
 * @property {number} q        quest index (0..9)
 * @property {number} money
 * @property {number} coins
 * @property {number} pk       equipped pickaxe tier
 * @property {number[]} own    owned pickaxe tiers
 * @property {number} lk       luck level
 * @property {Object<string, number>} gear persistent gear
 * @property {number} end      1 when the story is finished
 * @property {number} job      paid job counter
 * @property {number} ended    1 once the ending has played
 * @property {string} si       dialogue key
 *
 * @typedef {Object} PlayerState
 * @property {number} x @property {number} y
 * @property {number} vx @property {number} vy
 * @property {number} w @property {number} h
 * @property {number} hp @property {number} maxHp
 * @property {number} f facing (-1 / 1)
 *
 * @typedef {Object} MonsterState
 * @property {number} x @property {number} y
 * @property {string} s state machine state
 * @property {number[]} path
 * @property {number} pi path cursor
 * @property {string} variant variant id
 *
 * @typedef {Object} WorldState
 * @property {Uint8Array} g    tile grid
 * @property {Uint8Array} o    ore grid (1-based index into ORE_IDS)
 * @property {Uint8Array} dg   dug marker grid
 * @property {number} h         height in rows
 * @property {Object} pad       elevator pad position
 * @property {Object} lair      lair position
 * @property {Object|null} rope rope anchor
 *
 * @typedef {Object} GameState
 * @property {CampaignState} campaign
 * @property {WorldState} world
 * @property {PlayerState} player
 * @property {MonsterState} monster
 * @property {Object} memory    monster memory: snd / rt / hide / runX
 * @property {Object} inventory
 * @property {Object} camp
 * @property {Object} skills
 * @property {Object} ui
 * @property {Object} meta
 */

/** @type {GameState} */
export const state = {
  campaign: {
    d: 'normal', q: 0, money: 0, coins: 0, pk: 0, own: [0], lk: 0,
    gear: {}, end: 0, job: 0, ended: 0, si: 'q0',
  },
  world: {
    g: new Uint8Array(0), o: new Uint8Array(0), dg: new Uint8Array(0),
    h: 80, st: 10, pad: { x: 6.5, f: 16 }, lair: { x: 76, y: 72 }, rope: null, seen: 0,
  },
  player: {
    x: 9, y: 9.14, vx: 0, vy: 0, w: 0.7, h: 1.7, hp: 100, maxHp: 100, f: 1,
  },
  monster: {
    x: 0, y: 0, s: 'patrol', path: [], pi: 0, w: 3, f: -1, cd: 3, rec: 0,
    lun: 0, rp: 0, lg: 0, ph: 0, jw: 0, dt: '', sq: [], variant: 'watcher',
  },
  memory: {
    snd: {}, rt: {}, hide: [], runX: 0, t: 0, d: 0,
  },
  inventory: {
    ores: {}, decoy: 0,
  },
  camp: {
    buildings: {},
  },
  skills: {
    unlocked: [], points: 0,
  },
  ui: {
    screen: 'title', panel: null, paused: false, modal: false, cut: 0,
    dialogue: null, toasts: [], fade: 0, scene: 'play', inventoryOpen: false,
  },
  meta: {
    user: null, users: {}, settings: null, bindings: null, lastLevel: null,
  },
};

/**
 * Reset the run state to a clean expedition, keeping campaign/meta intact.
 */
export function resetRun() {
  const c = state.campaign;
  state.world.g = new Uint8Array(0);
  state.world.o = new Uint8Array(0);
  state.world.dg = new Uint8Array(0);
  state.world.rope = null;
  state.world.seen = 0;
  state.player.x = 9;
  state.player.y = 9.14;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.hp = state.player.maxHp;
  state.player.f = 1;
  state.monster.s = 'patrol';
  state.monster.path = [];
  state.monster.pi = 0;
  state.memory.snd = {};
  state.memory.rt = {};
  state.memory.hide = [];
  state.memory.runX = 0;
  state.memory.t = 0;
  state.memory.d = 0;
  state.inventory.ores = {};
  state.inventory.decoy = 0;
  state.ui.paused = false;
  state.ui.modal = false;
  state.ui.cut = 0;
  state.ui.dialogue = null;
  state.ui.scene = 'play';
  state.ui.inventoryOpen = false;
  void c;
}
