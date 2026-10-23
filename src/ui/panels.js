/**
 * In-game panels: the upgrade shop, the cave-items store, camp building and
 * the skill tree.
 *
 * All of these are DOM panels that sit over the canvas while the game keeps
 * running — the monster does not pause while you shop.
 */

import { state } from '../state/store.js';
import { PICKAXES, LUCK_PRICES, ROMAN, GEAR } from '../data/pickaxes.js';
import { BUILDINGS } from '../data/camp.js';
import { SKILLS } from '../data/skills.js';
import { ORE_IDS, ORES } from '../data/ores.js';
import { money, coins, ROPE_PRICE, HOOK_PRICE, ROPE_UPGRADES, HOOK_UPGRADES, ROPE_REACH, HOOK_REACH, HOOK_COOLDOWN } from '../systems/economy.js';
import { buildCamp, canUnlockSkill, unlockSkill, hasBuilding } from '../systems/progression.js';
import { currentTask } from '../state/selectors.js';
import { escapeHtml, setPanel } from './shell.js';
import { emit } from '../core/events.js';
import { keyName } from '../core/input.js';
import { iconHtml } from '../render/art.js';

/**
 * Show the upgrades panel.
 * @param {Object} handlers
 */
export function showShop(handlers) {
  const c = state.campaign;
  const pk = PICKAXES[c.pk] ?? PICKAXES[0];
  const pickaxes = PICKAXES.map((p, i) => {
    const own = c.own.includes(i);
    const eq = c.pk === i;
    const pre = i === 0 || c.own.includes(i - 1);
    let btn;
    if (eq) btn = '<button disabled>Equipped</button>';
    else if (own) btn = '<button data-act="equip" data-i="' + i + '">Equip</button>';
    else if (!pre) btn = '<button disabled>Locked</button>';
    else btn = '<button data-act="pick" data-i="' + i + '">' + money(p.p) + '</button>';
    return (
      '<div class="it' + (eq ? ' eq' : '') + '">' + iconHtml('pickaxe.' + i, p.name, p.c) + '<span><b>' + p.name +
      '</b><small>Strength x' + p.s + ' | luck +' + (p.l || 0) + (p.rb ? ' | rare-ore bonus' : '') + (p.d ? ' | deeprock expert' : '') +
      '</small></span>' + btn + '</div>'
    );
  }).join('');

  const luck = LUCK_PRICES.map((price, i) => {
    const own = c.lk > i;
    let btn;
    if (own) btn = '<button disabled>Owned</button>';
    else if (c.lk === i) btn = '<button data-act="luck" data-i="' + i + '">' + money(price) + '</button>';
    else btn = '<button disabled>' + money(price) + '</button>';
    return '<div class="it' + (own ? ' eq' : '') + '"><i style="background:#6af0ff"></i><span><b>Luck ' + ROMAN[i] + '</b><small>x' + (1 + 0.5 * i).toFixed(1) + ' to x' + (1.5 + 0.5 * i).toFixed(1) + '</small></span>' + btn + '</div>';
  }).join('');

  const gear = GEAR.map(
    (g) =>
      '<div class="it"><i style="background:#888"></i><span><b>' + g.name + '</b><small>' + g.desc + '</small></span>' +
      (c.gear[g.id] ? '<button disabled>Owned</button>' : '<button data-act="gear" data-k="' + g.id + '">' + money(g.price) + '</button>') +
      '</div>'
  ).join('');

  const decoys = state.inventory.decoy || 0;
  const gearHtml =
    gear +
    '<div class="it"><i style="background:#ffd54a"></i><span><b>Decoys x3</b><small>Lure the monster (' + decoys + ' carried)</small></span>' +
    (decoys < 9 ? '<button data-act="gear" data-k="d">' + money(60) + '</button>' : '<button disabled>Max</button>') +
    '</div>';

  setPanel(
    '<div class="pn w"><h2>Upgrades</h2>' +
      '<div class="r"><span>Money ' + money(c.money) + '</span><span>Luck x' + (1 + 0.5 * c.lk).toFixed(1) + '</span>' +
      '<button id="btnItems">Items</button><button id="btnClose">Close</button></div>' +
      '<small style="opacity:.7">The monster keeps hunting while you shop. Pickaxes and luck are permanent; gear is lost on death.</small>' +
      '<div id="sg"><div><h3>Pickaxes</h3>' + pickaxes + '</div><div><h3>Mining Luck</h3>' + luck + '<h3>Gear</h3>' + gearHtml + '</div></div></div>'
  );
  wire(handlers);
}

/**
 * Show the cave-items panel.
 * @param {Object} handlers
 */
export function showItems(handlers) {
  const c = state.campaign;
  const ropeDeployed = !!state.world.rope;
  const near = handlers.ropeNear(3);
  const m = c.coins;

  const items =
    '<div class="it' + (c.ro ? ' eq' : '') + '"><i style="background:#c9a66b"></i><span><b>Rope</b><small>Reach ' +
    ROPE_REACH() +
    ' blocks up | No cooldown | One rope at a time. ' +
    (c.ro ? (ropeDeployed ? 'Status: deployed.' : 'Status: in inventory.') : '') +
    '</small></span>' +
    (!c.ro
      ? '<button data-act="buyrope"' + (m < ROPE_PRICE ? ' disabled' : '') + '>' + ROPE_PRICE + ' coins</button>'
      : ropeDeployed
        ? '<button data-act="retr" ' + (near ? '' : 'disabled') + '>' + (near ? 'Retrieve' : 'Too far') + '</button>'
        : '<button data-act="userope">Use</button>') +
    '</div>';

  const hook =
    '<div class="it' + (c.go ? ' eq' : '') + '"><i style="background:#9fb4d0"></i><span><b>Grappling Hook</b><small>Reach ' +
    HOOK_REACH() +
    ' blocks | Cooldown ' + HOOK_COOLDOWN() +
    's | Infinite uses. Point and click with line of sight.</small></span>' +
    (!c.go
      ? '<button data-act="buyhook"' + (m < HOOK_PRICE ? ' disabled' : '') + '>' + HOOK_PRICE + ' coins</button>'
      : c.gcd > 0
        ? '<button disabled>Cooldown ' + Math.ceil(c.gcd) + 's</button>'
        : '<button data-act="usehook">Use</button>') +
    '</div>';

  const ropeUp = ROPE_UPGRADES.map((price, i) => {
    const own = c.rl > i;
    let btn;
    if (own) btn = '<button disabled>Owned</button>';
    else if (!c.ro) btn = '<button disabled>Locked</button>';
    else if (c.rl === i) btn = '<button data-act="uprope" data-i="' + i + '">' + coins(price) + ' coins</button>';
    else btn = '<button disabled>' + coins(price) + ' coins</button>';
    return '<div class="it' + (own ? ' eq' : '') + '"><i style="background:#c9a66b"></i><span><b>Rope Reach ' + ROMAN[i] + '</b><small>Max reach ' + (10 + 2 * i) + ' blocks</small></span>' + btn + '</div>';
  }).join('');

  const hookUp = HOOK_UPGRADES.map((price, i) => {
    const own = c.gl > i;
    let btn;
    if (own) btn = '<button disabled>Owned</button>';
    else if (!c.go) btn = '<button disabled>Locked</button>';
    else if (c.gl === i) btn = '<button data-act="uphook" data-i="' + i + '">' + coins(price) + ' coins</button>';
    else btn = '<button disabled>' + coins(price) + ' coins</button>';
    return '<div class="it' + (own ? ' eq' : '') + '"><i style="background:#9fb4d0"></i><span><b>Hook Mk ' + ROMAN[i] + '</b><small>Reach ' + (24 + 4 * i) + ' blocks, cooldown ' + (28 - 4 * i) + 's</small></span>' + btn + '</div>';
  }).join('');

  setPanel(
    '<div class="pn w"><h2>Cave Items</h2>' +
      '<div class="r"><span>Coins ' + coins(m) + '</span><button id="btnShop">Pickaxes &amp; Luck</button><button id="btnClose">Close</button></div>' +
      '<div class="r" style="justify-content:flex-start"><button class="tab on" id="tabI">Items</button><button class="tab" id="tabU">Upgrades</button></div>' +
      '<small style="opacity:.7">The monster keeps hunting while you shop. Items and upgrades are permanent and cost coins, which you earn by mining ore.</small>' +
      '<div id="sg"><div><h3>Equipment</h3>' + items + hook + '</div><div><h3>Upgrades</h3><h3>Rope Reach</h3>' + ropeUp + '<h3>Grappling Hook</h3>' + hookUp + '</div></div></div>'
  );
  document.getElementById('btnShop')?.addEventListener('click', handlers.shop);
  document.getElementById('tabU')?.addEventListener('click', handlers.itemsUpgrades);
  wire(handlers);
}

/**
 * Show the camp building panel.
 * @param {Object} handlers
 */
export function showCamp(handlers) {
  const c = state.campaign;
  const list = BUILDINGS.map((b) => {
    const built = hasBuilding(b.id);
    return (
      '<div class="it' + (built ? ' eq' : '') + '">' + iconHtml('camp.' + b.id, b.name, built ? '#8fe' : '#7a5a3a') + '<span><b>' + b.name +
      '</b><small>' + b.desc + '</small></span>' +
      (built ? '<button disabled>Built</button>' : '<button data-act="build" data-k="' + b.id + '">' + money(b.price) + '</button>') +
      '</div>'
    );
  }).join('');

  setPanel(
    '<div class="pn w"><h2>Camp</h2>' +
      '<div class="r"><span>Money ' + money(c.money) + '</span><span>Current task: ' + escapeHtml(currentTask().n) + '</span>' +
      '<button id="btnClose">Close</button></div>' +
      '<small style="opacity:.7">Buildings are permanent and give you permanent bonuses. Talk to William to hand in a delivery before you come back down.</small>' +
      '<div id="sg"><div><h3>Buildings</h3>' + list + '</div><div><h3>Ore prices</h3>' +
      ORE_IDS.map((k) => '<div class="it">' + iconHtml('ore.' + k, ORES[k].name, ORES[k].color) + '<span><b>' + ORES[k].name + '</b><small>' + money(ORES[k].value) + ' each</small></span></div>').join('') +
      '</div></div></div>'
  );
  document.getElementById('btnClose')?.addEventListener('click', handlers.close);
  wire(handlers);
}

/**
 * Show the skill tree.
 * @param {Object} handlers
 */
export function showSkills(handlers) {
  const branches = { body: [], gear: [], nerve: [] };
  for (const s of SKILLS) branches[s.branch].push(s);
  const render = (list) =>
    list
      .map((s) => {
        const owned = state.skills.unlocked.includes(s.id);
        const ready = canUnlockSkill(s.id);
        const blocked = s.req && !state.skills.unlocked.includes(s.req);
        let btn;
        if (owned) btn = '<button disabled>Learned</button>';
        else if (blocked) btn = '<button disabled>Needs ' + (SKILLS.find((x) => x.id === s.req)?.name ?? s.req) + '</button>';
        else if (!ready) btn = '<button disabled>' + s.cost + ' points</button>';
        else btn = '<button data-act="skill" data-k="' + s.id + '">' + s.cost + ' points</button>';
        return (
          '<div class="it' + (owned ? ' eq' : '') + '">' + iconHtml('skill.' + s.id, s.name, owned ? '#8fe' : '#5a3b24') + '<span><b>' + s.name +
          '</b><small>' + s.desc + '</small></span>' + btn + '</div>'
        );
      })
      .join('');

  setPanel(
    '<div class="pn w"><h2>Skills</h2>' +
      '<div class="r"><span>Skill points: ' + state.skills.points + '</span><button id="btnClose">Close</button></div>' +
      '<small style="opacity:.7">You earn a skill point for every delivery, and more for a run of them. Skills are permanent.</small>' +
      '<div id="sg"><div><h3>Body</h3>' + render(branches.body) + '</div><div><h3>Gear</h3>' + render(branches.gear) + '<h3>Nerve</h3>' + render(branches.nerve) + '</div></div></div>'
  );
  document.getElementById('btnClose')?.addEventListener('click', handlers.close);
  wire(handlers);
}

/**
 * Wire the data-act buttons in the current panel.
 * @param {Object} handlers
 */
function wire(handlers) {
  const root = document.getElementById('ui');
  if (!root) return;
  root.querySelectorAll('button[data-act]').forEach((b) => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      const i = b.dataset.i;
      const k = b.dataset.k;
      if (act === 'pick') handlers.buyPickaxe(+i);
      else if (act === 'equip') handlers.equipPickaxe(+i);
      else if (act === 'luck') handlers.buyLuck(+i);
      else if (act === 'gear') handlers.buyGear(k);
      else if (act === 'buyrope') handlers.buyRope();
      else if (act === 'buyhook') handlers.buyHook();
      else if (act === 'uprope') handlers.upgradeRope(+i);
      else if (act === 'uphook') handlers.upgradeHook(+i);
      else if (act === 'retr') handlers.retrieveRope();
      else if (act === 'userope') handlers.useRope();
      else if (act === 'usehook') handlers.useHook();
      else if (act === 'build') handlers.build(b);
      else if (act === 'skill') handlers.skill(k);
      emit('sfx:ui');
    });
  });
  document.getElementById('btnClose')?.addEventListener('click', handlers.close);
}

export { keyName, buildCamp, unlockSkill };
