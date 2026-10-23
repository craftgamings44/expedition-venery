# Expedition Venery V9 — Architecture Proposal

> Target: a Vercel-free-tier web app with deeper systems than V8
> (new ores/biomes, monster variants, camp building, skill tree),
> plus an AI-generated art pipeline.

---

## 1. Stack recommendation

**Zero-build native ES modules. No framework for the game core. No bundler.**

```
index.html          ← shell only (canvas + mount points, ~40 lines)
vercel.json         ← static config + SPA rewrites
src/                ← native ES modules, plain JavaScript
api/                ← Vercel serverless functions (later phase)
assets/             ← AI-generated PNGs (icons, UI, creatures)
```

### Why not a bundler / framework

| Concern | Decision | Reason |
|---|---|---|
| Game core is a canvas rAF simulation | **Vanilla JS, no framework** | React/Vue would fight the 60fps loop for state it never renders. The game canvas owns the frame; a DOM framework on top adds reconciliation cost and a second source of truth. |
| Deploy target | **Zero build** | The repo *is* the artifact. No `node_modules`, no lockfile drift, no build failure on Vercel. For a hobby project on a free tier, this is the lowest-maintenance path that still supports a real backend. |
| Content growth (biomes, variants, skills) | **Data tables, not code** | V8 already does this well for `ORE`/`PK`/`QS`. Extending that pattern means new content = editing a data file, not editing engine code. This is where the complexity *should* live. |
| UI complexity (camp, skill tree) | **Plain DOM panels** | V8's `innerHTML` + inline-handler UI scales fine to a dozen panels and needs no toolchain. A framework only earns its place if panels become deeply interactive trees. |
| Type safety | **JSDoc + a `types.js` module** | Gives IntelliSense and catches shape errors in editors without a compile step. If you later want real TS, the module boundaries are already TS-compatible — nothing needs to be restructured. |
| Cloud accounts / saves | **`/api` serverless functions** | Vercel detects `/api/*.js` natively — same repo serves static frontend *and* backend with zero config. |

**When I would change this recommendation:** if the camp-building and skill-tree UI turns into a genuinely app-like experience (nested trees, live previews, drag-and-drop loadout editing), add Vite + React **for the UI shell only**, keeping the game core as vanilla modules. That is a contained change because the core is already isolated.

---

## 2. What V8 actually is (measured, not assumed)

Audit of `Expedition_VeneryV8.html` — 357 script lines, 66 KB of JS.

| Metric | Value |
|---|---|
| Top-level module-scope identifiers | **136** |
| Mutable game-state globals in one `let` statement | **43** (line 52: `C, Wd, MW, P, Mo, mem, hab, ad, inv, bodies, bl, parts, toasts, DL, mode, scene, paused, modal, cut, rid, busy, busy2, rb, ip, dead, keys, pr, mouse, cam, F, TW, now, lt, mt, stT, hbT, ES, mine, aimT, BQ, BP, BS, bs`) |
| More mutable globals in a second statement | **10** (line 212: shop state) |
| Top-level functions | **85** |
| Largest function | `pUp` (player update) — 20 lines / 4 KB, dense one-liners |
| External asset files | **0** — all art is drawn procedurally on canvas, all audio is synthesized WebAudio |
| Image assets / audio files / fonts | **none** |
| World generation | seeded LCG PRNG (`rng(s)`) — fully deterministic |
| Save format versioning | **none** — raw object dump to `localStorage` |

**The good news:** V8 is not a bad prototype. It is a *correct* prototype with a *bad* internal structure. The data-driven content tables, the deterministic seeded worldgen, the procedural audio, and the monster's sound-memory AI (`mem.snd`, `mem.rt`, `mem.hide`, `mem.runX`) are all genuinely strong design. That engine should be preserved.

**The bad news:** every subsystem reaches into the same 43 globals. `pUp` (player update) reads and writes `Wd`, `C`, `Mo`, `mem`, `hab`, `ad`, `inv`, `bodies`, `mine`, `aimT`, `parts`, `toasts`, `mouse`, `cam`, `now` — in one function. The monster AI (`mUp`) reads `P`, `Wd`, `mem`, `hab`, `ad`. The shop (`shopM`) reads `C`, `Wd`, `inv`, `now`. **You cannot change one system without risking the others.** That is the single reason a 10-quest prototype becomes unmaintainable the moment you add biomes, monster variants, camp building, and a skill tree.

### Bugs found during the audit (all confirmed by instrumented runtime probe, not by reading alone)

I ran the real game in a browser with a console/error harness (`reference/baseline-probe.html`) that auto-starts a Normal game, descends the elevator, and captures every thrown error and `console.error`. Result: **0 runtime errors — V8 genuinely works.** The following are *structural* faults that work today but will break under V9's scope:

1. **`mt2` is an accidental global** (`Expedition_VeneryV8.html:181`). It is declared at module scope but only ever used inside `pUp` as a toast-cooldown timer. It works by accident because script evaluation completes before any game function runs. In a module split it must become explicit local state.
2. **Monster knowledge survives death.** `resp()` (`Expedition_VeneryV8.html:158`) resets only `mem.rt`, leaving `mem.snd`, `mem.hide` and `mem.runX` intact — the monster still remembers where you buried and which way you fled. Either a bug or an intentional feature, but currently it is neither documented nor reset consistently.
3. **No save-format version.** `saveG()` writes a raw object; the first V9 content change makes every existing V8 save unloadable.
4. **Inline `onclick` string HTML** (`shopM`, `itemsM`) — acceptable while all data is local, but it becomes an injection vector the moment player-authored data (cloud save names, custom camp names) enters that path.
5. **Silent coupling to campaign state in hot paths.** `lroll()` reads `PB[C.d]` and `C.pk`; `hud()` reads `Wd.rope`. Pure functions are not pure.

---

## 3. Target architecture

### 3.1 Layering (one direction of dependency only)

```
                    ┌──────────────────────────────┐
                    │        main.js (bootstrap)   │  ← owns the loop, wires modules
                    └──────────────┬───────────────┘
                                   │
        ┌──────────────┬───────────┼───────────┬──────────────┐
        ▼              ▼           ▼           ▼              ▼
    ┌────────┐   ┌──────────┐ ┌────────┐ ┌──────────┐  ┌────────┐
    │ render │   │   ui     │ │ audio  │ │ services │  │  data  │
    │ (reads │   │ (DOM     │ │(proced)│ │ (acct,   │  │(tables │
    │  only) │   │  panels) │ │        │ │  cloud)  │  │ only)  │
    └────────┘   └──────────┘ └────────┘ └──────────┘  └────────┘
        ▲              ▲
        └──────────────┴──────────────┐
                                      ▼
                            ┌──────────────────┐
                            │     systems      │  ← simulate: mutate state
                            │ (mining, noise,  │
                            │  inventory, AI)  │
                            └────────┬─────────┘
                                     ▼
                            ┌──────────────────┐
                            │   world / entities│  ← simulate
                            └────────┬─────────┘
                                     ▼
                            ┌──────────────────┐
                            │  state/store.js  │  ← single source of truth
                            └──────────────────┘
```

**The one rule that matters:** `render/` and `ui/` may **read** state but never write it. All mutation happens in `systems/` and `entities/`. V8 violates this constantly (the HUD reads `Wd.rope`; `shopM` writes `C.own`).

### 3.2 Module map

```
src/
├── main.js                 bootstrap: build store, mount UI, start loop
│
├── core/
│   ├── loop.js             fixed-timestep loop (60Hz sim, interpolated render)
│   ├── input.js            keybinds, pointer, rebind, focus handling
│   ├── events.js           tiny pub/sub (decouples systems from each other)
│   ├── rng.js              seeded LCG + hash noise (from V8 `rng`/`hs`)
│   └── math.js             clamp, lerp, aabb, easing
│
├── state/
│   ├── store.js            THE state object — replaces all 43 globals
│   ├── selectors.js        derived reads (canDeliver(), noiseLevel(), ...)
│   └── save.js             serialize / deserialize / migrate / version
│
├── data/                   ← pure data. The main place content gets added.
│   ├── ores.js             ore types: value, hardness, weight, color, icon
│   ├── biomes.js           NEW: depth strata (name, tiles, ore table, hazards, palette)
│   ├── monsters.js         NEW: base archetype + variant definitions
│   ├── difficulty.js       per-difficulty tuning (from V8 DF/PB)
│   ├── pickaxes.js         pickaxe tiers (from V8 PK)
│   ├── quests.js           quest chain + endless jobs (from V8 QS)
│   ├── skills.js           NEW: skill tree nodes + prerequisites
│   ├── camp.js             NEW: camp buildings + effects
│   └── types.js            JSDoc typedefs for every record shape
│
├── world/
│   ├── generator.js        seeded cave generation, biome-aware
│   ├── tiles.js            tile constants + property tables
│   └── pathfind.js         BFS (from V8 bfs)
│
├── entities/
│   ├── player.js           physics, mining, rope, grapple (from V8 pUp)
│   ├── monster.js          AI state machine (from V8 mUp)
│   └── variants.js         NEW: per-variant behavior overrides
│
├── systems/
│   ├── noise.js            sound propagation + monster memory model
│   ├── mining.js           mining progress, ore rolls, luck
│   ├── inventory.js        pack, ore counts, gear
│   ├── economy.js          money, coins, shop transactions
│   ├── quest.js            quest lifecycle, delivery, unlocks
│   ├── camp.js             NEW: camp building state + effects
│   ├── skills.js           NEW: skill tree allocation + effects
│   └── telegraph.js        toast/notification queue
│
├── render/
│   ├── renderer.js         canvas draw orchestration
│   ├── tiles.js            tile drawing (procedural)
│   ├── creatures.js        hero/monster drawing (procedural + AI sprite overlay)
│   ├── lighting.js         light-radius darkness mask (from V8 dk)
│   ├── hud.js              in-canvas HUD
│   ├── art.js              AI-asset loader, atlas, procedural fallback
│   └── assets/             generated PNGs land here
│
├── audio/
│   └── audio.js            procedural WebAudio (from V8 sfx/tn/nz)
│
├── ui/
│   ├── shell.js            DOM mount, panel manager, focus trap
│   ├── screens.js          title, auth, difficulty select, pause
│   ├── shop.js             upgrades + items panels (from V8 shopM/itemsM)
│   ├── dialogue.js         dialogue runner (from V8 say)
│   ├── camp.js             NEW: camp building UI
│   ├── skills.js           NEW: skill tree UI
│   └── toast.js            DOM toasts
│
└── services/
    ├── accounts.js         interface: local impl now, API impl later
    └── cloud.js            interface: no-op now, cloud sync later
```

### 3.3 The store replaces the 43 globals

```js
// state/store.js
export const state = {
  run: {
    campaign: { d, q, money, coins, pk, own, lk, gear, job, end, si },
    world:   { grid, ores, height, biome, pad, lair, rope },
    player:  { x, y, vx, vy, hp, facing, ... },
    monster: { x, y, state, path, ... },
    memory:  { snd, rt, hide, runX },   // ← explicitly reset on respawn
    inventory: { ores, decoys, tools },
    camp:    { buildings: {} },
    skills:  { unlocked: [], points: 0 },
  },
  ui:    { screen, panel, paused, dialogue, toasts },
  meta:  { settings, bindings, version }
};
```

Every system receives the slice it needs explicitly (`updateMonster(state.run, dt)`) instead of closing over globals. This is what makes the AI testable **headlessly in Node** — see §5.

### 3.4 Data-table extension (the V9 content surface)

New content becomes data, so the engine does not change when you add a biome:

```js
// data/biomes.js
export const BIOMES = [
  {
    id: 'shale',
    name: 'Shale Veins',
    depthRange: [0, 18],
    tiles: { wall: 2, floor: 1 },
    palette: { rock: '#626d79', dirt: '#74512f', ambient: '#2b303b' },
    oreTable: { copper: 0.5, iron: 0.2, gold: 0.12 },
    hazards: [],
    lightRadius: 6.5,
    monsterSpeed: 1.0
  },
  {
    id: 'magma',
    name: 'Magma Vaults',
    depthRange: [18, 42],
    tiles: { wall: 3, floor: 2 },
    palette: { rock: '#4a2a22', dirt: '#7a3a20', ambient: '#ff6a2a' },
    oreTable: { iron: 0.4, gold: 0.25, ruby: 0.08 },
    hazards: ['lava', 'heat'],
    lightRadius: 5.0,
    monsterSpeed: 1.25
  }
];
```

Same shape for `monsters.js` (base archetype + variant overrides for hearing range, speed, aggression), `skills.js` (nodes + prereqs + effect hooks), and `camp.js` (buildings + effect hooks).

### 3.5 Headline mechanic: depth biomes

Chosen as the V9 milestone-1 feature because it exercises the *entire* new architecture at once — it forces real data tables (not branches), it gives monster variants a natural home (each biome has different acoustics, so a variant that hears differently matters), and it gives the skill tree and camp building concrete hooks (deeper = more ore = more upgrades).

Generator changes from V8's single `gen()` to a stratified pass:

```
surface (sky, trees, camp, elevator head)
  └── stratum 0: Shale Veins     → generator draws using BIOMES[0]
        └── stratum 1: Magma Vaults → generator draws using BIOMES[1]
              └── ... N strata, each with its own ore table + palette + hazard
```

Each stratum is generated with the same seeded PRNG (so a given seed always yields the same run), stamped with its palette, and its hazards are applied per-stratum. The existing V8 `gen()` already separates "stone type" (1/2/3) from ore placement, so this is a natural extension rather than a rewrite.

---

## 4. The AI art pipeline

### 4.1 What generation is good for (and what it is not)

`mmx image generate` was verified working on this machine (Node 24.22.1 + mmx-cli 1.0.28, M Plan active: 95% interval / 71% weekly remaining).

**Use AI art for** (readable at small size, sits above the lighting mask):
- ore icons, pickaxe icons, tool icons
- shop/upgrade panel art, skill-tree node icons, camp building icons
- creature portraits (monster variants, William, Mack)
- title/splash art, key art for marketing

**Keep procedural for** (must tile seamlessly, must work under the light mask):
- tiles, terrain, ore-in-block decoration
- lighting, particles, blood, decoy glow
- the in-world hero/monster sprites (they animate procedurally; a static generated sprite would fight the animation code)

> The generated biome background came out *very dark* — which double-darkens under V8's `dk()` light-radius mask. **Rule: generate game art bright and saturated, then let the lighting mask darken it.** Never generate dark atmospheric art for in-world surfaces.

### 4.2 Asset contract

```
assets/
├── icons/        ore_copper.png, pickaxe_3.png, skill_climb.png ...
├── ui/           panel_upgrades.png, button_frame.png ...
├── creatures/    monster_watcher.png, monster_howler.png ...
└── manifest.json ← name → file, generated by the art script
```

Rules that keep the game unbreakable:

1. **Every AI asset has a procedural fallback.** `render/art.js` tries the PNG; on failure it draws the V8-style vector shape. The game must never show a broken-image box.
2. **Load async, never block boot.** The title screen appears instantly; art fades in.
3. **Deterministic regeneration.** `mmx image generate --seed <n>` reproduces an identical image. Store the seed in `manifest.json` next to each asset so any icon can be regenerated byte-identically.
4. **Fixed, small dimensions.** Icons at 128×128, portraits at 512×512, scaled down in-engine. Keeps the download under ~200 KB total.
5. **Generation is a build-time script, not a runtime call.** `tools/gen-art.ps1` runs the `mmx` commands; the game never talks to the API.

### 4.3 Example generation command

```powershell
mmx image generate `
  --prompt "Game item icon, chunk of raw copper ore, clean pixel art, bold readable shape, bright saturated orange-copper, centered, flat pure white background, no text" `
  --aspect-ratio 1:1 --width 512 --height 512 `
  --seed 4101 --out assets/icons/ore_copper.png
```

---

## 5. Verification strategy (no test framework needed)

Because the simulation core is pure and store-driven, it can run **headlessly in Node** — no browser, no canvas. This is the single biggest practical win of the module split over V8's single file, where nothing was testable.

```
tests/
├── run.js              tiny assert harness (~40 lines, zero deps)
├── worldgen.test.js    same seed → identical world; biome layout valid
├── pathfind.test.js    BFS returns valid connected paths
├── ai.test.js          monster state machine transitions under scripted input
├── save.test.js        save → load → identical state; v1 → v2 migration
└── economy.test.js     buy/equip/sell invariants; no negative balances
```

Node is now installed on this machine, so `node tests/run.js` works immediately. The canvas-facing code is verified separately in the real browser via the same instrumented-probe technique used in this audit.

---

## 6. Vercel deployment (free tier)

```
vercel.json
{
  "cleanUrls": true,
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "headers": [{ "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }]
}
```

- **Static phase:** the repo root is the site. No build step, no `node_modules`.
- **Backend phase:** add `/api/auth.js`, `/api/saves.js`. Vercel detects `/api/*.js` as serverless functions automatically — **same repo, still zero config.**
- Keep the API surface to 1–2 consolidated functions (Hobby plan has a per-deployment function count limit; a single `api/index.js` handling routes stays well inside it).
- `/api` must be excluded from the SPA rewrite (the negative lookahead above does this).
- Data: use a free-tier hosted Postgres (Neon via Vercel Marketplace) or Vercel KV. The `services/accounts.js` interface is written so the local-storage implementation can be swapped for the API implementation without touching game code.

**Security note:** V8 hashes passwords client-side with SHA-256 and stores them in `localStorage`. That is fine for a local single-player build and **not acceptable** for a real multi-user server. In the backend phase, hashing moves server-side (bcrypt/argon2), the client only ever holds a session token, and saves are scoped by authenticated user id.

---

## 7. Delivery plan

**Milestone 1 — playable V9 baseline (target: this is the next build)**
1. Scaffold `index.html` + `vercel.json` + `src/` module tree.
2. Port V8 into modules with **zero behavior change** — a faithful refactor first.
3. Fix the four structural bugs from §2 during the port (they are unavoidable to fix once state is explicit).
4. Add save-format versioning + migration.
5. Implement **depth biomes** as the headline mechanic (new `data/biomes.js` + stratified generator).
6. Add the headless test harness and land the first tests.
7. Verify in-browser with the instrumented probe: menu → descend → mine → monster → elevator → deliver.

**Milestone 2** — monster variants, skill tree, camp building (all ride the data tables + store from M1).
**Milestone 3** — AI art pipeline: `gen-art.ps1`, manifest, per-asset fallback, ship icons for ores/pickaxes/skills.
**Milestone 4** — `/api` serverless: real accounts, cloud saves, server-side hashing.
**Milestone 5** — polish, mobile/touch controls, PWA manifest, marketing art.

---

## 8. Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| Stack | Zero-build native ES modules | Repo = deployable artifact; canvas game fights frameworks; no lockfile/build risk |
| Framework | None for core; optional later for UI shell only | Game loop owns the frame |
| Types | JSDoc + `data/types.js` | IntelliSense without a compile step; TS-compatible later |
| Module system | Native ESM | Browser-native; Vercel serves as-is |
| Art | Hybrid — AI for icons/UI/creatures, procedural for tiles/lighting/sprites | Generated dark art double-darkens under the light mask |
| Art pipeline | Build-time script + manifest + procedural fallback | Game never depends on the API at runtime |
| Tests | Headless Node harness, zero deps | Node now installed; sim core is pure |
| Backend | Vercel `/api` serverless + free-tier Postgres/KV | Same repo, zero config, real accounts |
| Saves | Versioned with migration | Unlocks continuous updates without breaking saves |

## 9. Open questions for you

1. **Cloud accounts — real or local-only?** V8's accounts are local-only (per-browser, no sync). On a published web app, do you want sign-in that follows you across devices (needs `/api` + a database), or is a per-device local profile acceptable for now?
2. **Mobile?** A mining game with mouse-aim is desktop-native. Should V9 include touch controls (virtual stick + tap-to-mine), or is desktop-only acceptable for the first published version?
3. **Difficulty of the port.** Do you want a strict 1:1 behavioral port first (safest, verifiable against V8) and content additions only after, or should biome work land in the same pass as the refactor?
