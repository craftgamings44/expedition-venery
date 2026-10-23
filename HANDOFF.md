# Handoff — Expedition Venery V9

Paste this into a fresh session to pick the project up cold.

---

You are continuing **Expedition Venery**, a 2D mining-horror game. The repo is at
`D:\expedition-venery`, the remote is `https://github.com/craftgamings44/expedition-venery`
(public, `main`). Everything below is already done and pushed — read it, then ask me
what to build next rather than re-deriving it.

## What this is

The V8 prototype (`reference/Expedition_VeneryV8.html`, kept pristine) rebuilt as **V9**:
a zero-build static web app — native ES modules, no bundler, no framework in the game
core, no runtime dependencies. It deploys to Vercel free tier straight from the repo.

**V8 is the source of truth for gameplay behaviour.** Before changing anything that
affects feel, read V8. The port is only faithful where it matches it.

## Where it stands

- **35 modules, ~6,100 lines** under `src/`: `core/` (constants, math, events, input),
  `data/` (ores, biomes, monsters, difficulty, pickaxes, quests, skills, camp),
  `world/` (tiles, generator, pathfind), `entities/` (player, monster), `systems/`
  (mining, spawnlock, inventory, economy, progression, quest, telegraph), `state/`
  (store, selectors, save), `render/`, `audio/`, `ui/`, `services/accounts.js`, plus
  `api/index.js` (Vercel function) and `src/main.js` (composition root).
- **839 headless tests pass, 0 fail** — `node tests/run.js`.
- **`tools/probe.html`** boots the real game in a browser and plays an expedition through
  genuine keyboard and mouse events, reporting a pass/fail checklist. Serve with
  `node tools/serve.js` and open `http://localhost:8080/tools/probe.html`.
- **42 AI-generated art assets** (~7 MB) under `assets/`, all with procedural fallbacks.
  Regenerate any of them with the `mmx` CLI — see `assets/PROMPTS.md`.
- Accounts work against a local fallback; the cloud path needs `DATABASE_URL` for the
  serverless API. Without it the client silently uses local storage.

Last commit: `b32f315` "V9: the port — depth biomes, emerald, and a working expedition
loop". The whole V9 engine is committed and pushed.

## The decisions that are already made

- **Stack** — zero-build native ES modules. The repo *is* the deployable artifact. No
  bundler without explicit approval.
- **Art** — hybrid. AI art for icons, UI and creatures; procedural canvas for tiles,
  lighting and particles, because the light-radius mask darkens everything outside it.
  **Generate art bright and saturated.**
- **Architecture** — one store with explicit slices instead of 43 globals. `render/` and
  `ui/` are read-only; all mutation lives in `systems/` and `entities/`. Content is data
  tables, never `if` chains. The simulation core is pure so it can be tested headlessly.
- **Headline mechanic** — depth biomes: five strata, each with its own rock, ore table,
  hazards, light radius and monster speed. The strata are **anchored to the elevator
  pad**, so every run starts in the first stratum, where quest one's copper grows.
- **Ores** — copper, iron, gold, ruby, **emerald** (green, second most valuable, grows at
  the rate diamonds used to) and diamond (a third of that rate — the prize, not a rumour).
  A normal world yields ~4 diamonds and ~19 emeralds.
- **Save format** — versioned, with a migration chain. A missing `v` is a V8-era save and
  migrates forward. Never change a save shape without a migration.

## The traps that will bite you

1. **The probe owns the clock.** A browser tab nobody is looking at freezes its
   animation frames and clamps `setTimeout` to a second. The probe sets `__evDrive`,
   ticks the game through `window.__evTick(frames)`, and counts **every budget in frames
   of game time, never milliseconds**. It also yields to the event loop with a
   `MessageChannel` between frames — a microtask-only loop never lets the game's asset
   loading finish and the boot silently stalls.
2. **Use both harnesses.** A change that passes the headless suite can still be broken in
   the browser and vice versa. The input layer and the tween loop each broke in one
   harness and looked fine in the other.
3. **`reference/Expedition_VeneryV8.html` is the behaviour reference.** `SF = 10`,
   difficulty `{easy:{h:60,st:12}, normal:{h:80,st:16}, hard:{h:100,st:48}}`, V8's tween
   is time-based, V8's spawn lock is `sl={t:60,s:1,b:0}` with `s:1→2→3`, and V8's pad
   rule is `let fr=D.st; while(!g[I(6,fr)]) fr++;`.
4. **The dev server dies every hour** (`maxRunMs` on background tasks). Restart it with
   `node tools/serve.js 8080` and check it is up before opening the probe.
5. **Git identity** is repo-local: `Craftgammings44 / craftgamings44@users.noreply.github.com`.
6. **Secrets** — the `mmx` API key lives only in `~/.mmx/config.json`. Never print it,
   never pass it on a command line.

## Known gaps

- **The probe is a mediocre player.** It digs a route to the nearest vein and mines it,
  but it does not reliably fill a full quota in one expedition, so its "quota mined" and
  "ore delivered" checks can fail while everything else passes. The game itself is fine —
  the probe's navigation is the weak part. Fixing it means making its dig route pick
  better goals and keeping it from walking into holes.
- No Postgres is provisioned, so the cloud account path is untested end to end.
- The campaign's later quests and the paid-job loop have only been exercised in the
  first quest.
- `tests/pathfind.test.js` was rewritten to be layout-independent; the cave layout is
  free to change again.

## If you want to keep momentum

The natural next pieces, in the order I would take them:

1. Make the probe fill a quota, so the delivery path is covered end to end.
2. Provision a database and exercise the cloud account path across two devices.
3. Play the late game — quests 6 to 10 are where emeralds and diamonds live, and the
   monster variants have never been seen in a real run.
4. The remaining headline content: monster variants per biome, and the camp buildings
   earning their keep.

Ask me which one. If I do not say, take the first.
