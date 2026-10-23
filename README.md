# Expedition Venery

A 2D mining-horror game. You dig down into a mountain, light your own way, and try to
fill a quota of ore before something that hunts by sound finds you.

Built as a zero-build static web app — native ES modules, no bundler, no framework in the
game core. Deploys to Vercel free tier straight from this repository.

## Play

Run the local server — it serves the game **and** the accounts API, so local and
production behave the same way:

```bash
node tools/serve.js
```

Then open <http://localhost:8080/>.

> **Note:** the game uses native ES modules. Opening `index.html` directly via `file://`
> will be blocked by browser CORS rules — use a local HTTP server.

## Accounts

The game works offline with a local account. When a database is configured, the same
interface is used with the data on the server, so a campaign follows you across devices.
Without one the client falls back to local storage automatically — nothing to configure
to play.

The backend is one Vercel serverless function in `api/`, backed by Postgres. Supabase is
the easiest way to get that database: create a project, copy the **Session pooler**
connection string, and put it in `.env`:

```
DATABASE_URL=postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

The schema is created on first request, so there is no migration to run.

The API takes `Bearer` tokens. A session lasts 30 days; the client keeps the token in
`localStorage`, so a reload stays signed in and a second device picks up where the first
left off.

## Local and production

The same `api/index.js` handler runs in both places — the dev server adapts Node's
request and response objects to it, and Vercel calls it directly. There is no second
implementation to drift.

**Local test server** — one command, game and API together:

```bash
npm install                # once: installs pg for the API
node tools/serve.js        # http://localhost:8080
```

`tools/serve.js` reads `DATABASE_URL` from `.env` (see `.env.example`). With no
`DATABASE_URL` it still runs, and the game falls back to per-device local accounts.

Check the API end to end against any server — local or deployed:

```bash
node tools/api-check.js http://localhost:8080
node tools/api-check.js https://your-deployment.vercel.app
```

**Production on Vercel** — the repo is the deployable artifact, there is no build step:

```bash
npm install
npx vercel login
npx vercel link
npx vercel env add DATABASE_URL production     # paste the Supabase connection string
npx vercel deploy --prod
```

The only npm dependency is `pg`, used by the serverless function. The game itself has no
dependencies and no build step.


The backend is one Vercel serverless function in `api/`, backed by Postgres. Supabase is
the easiest way to get that database: create a project, copy the **Session pooler**
connection string, and put it in `.env`:

```
DATABASE_URL=postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

The schema is created on first request, so there is no migration to run.

The API takes `Bearer` tokens. A session lasts 30 days; the client keeps the token in
`localStorage`, so a reload stays signed in and a second device picks up where the first
left off.


## The game

- **Procedurally generated caves** — deterministic per seed, every run is different but reproducible.
- **Depth biomes** — the mountain is stratified into five strata: Shale Veins, Ember Shafts, Magma Vaults, Glacial Deep and The Abyss. Each has its own rock, ore table, hazards, light radius and monster speed. Going deeper genuinely changes what you find. The strata are measured from the elevator pad, so you always land in the first one.
- **Six ores, from copper to diamond** — copper, iron and gold near the top; rubies in the middle; **emeralds** (green, the second most valuable) in the cold deep; and diamonds, the rarest thing in the mountain, below them. Emerald turns up at the rate diamonds used to, and diamonds are three times rarer than that — a prize, not a rumour.
- **A monster that hunts by sound** — it cannot see through rock. It hears your pickaxe, remembers where it heard you, and learns the direction you flee. Stay silent behind stone and it won't know you exist.
- **Three monster variants** — The Watcher, the Hound and the Burrower, each with its own senses, speed and starting adaptations.
- **A camp and a skill tree** — build a workbench, forge, ward, bunk and lookout at the surface, and spend skill points across three branches.
- **Ten-quest story** for Mack, then endless paid jobs.
- **Progression** — pickaxes, mining luck, ropes, grappling hooks, decoys, and a cave-item economy.
- **Real risk** — if it catches you, you lose your pack. Your body ends up in its lair. Go back for it.

## Accounts

The game works offline with a local account. If a database is configured (`DATABASE_URL`
for the serverless API in `api/`), the same interface is used with the data on the server,
so a campaign follows you across devices. Without one, the client falls back to local
storage automatically — nothing to configure to play.

## Project layout

```
index.html              app shell (canvas + UI mount points)
vercel.json             static hosting config
src/                    native ES modules — the game
  core/                 loop, input, events, rng, math
  state/                single store, selectors, save/migrate
  data/                 pure content tables (ores, biomes, monsters, quests…)
  world/                generation, tiles, pathfinding
  entities/             player, monster AI
  systems/              mining, spawn lock, inventory, economy, camp, skills
  render/               canvas rendering, lighting, HUD, art loader
  audio/                procedural WebAudio (no audio files)
  ui/                   DOM panels
  services/             accounts — local storage or the cloud API
api/                    Vercel serverless function (accounts + saves)
  index.js              the only implementation of the API
  [...path].js          catch-all so /api/* reaches that one function
  db.js                 Postgres access layer
assets/                 AI-generated icons, UI art, creature portraits, biome art
tests/                  headless Node test harness (no framework)
tools/                  dev utilities (dev server, API adapter, API check, browser probe)
reference/              the original single-file prototype
ARCHITECTURE.md         the V9 architecture proposal and delivery plan
```

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full proposal: layering rules,
the store design, data-table extension points, the AI art pipeline, and the Vercel plan.

Core rules:

1. `render/` and `ui/` **read** state, never write it. All mutation lives in `systems/` and `entities/`.
2. Content is **data tables**, not code branches — a new biome is a file edit.
3. The simulation core is **pure and headless-testable** in Node (no canvas needed).

## Development

```bash
node tests/run.js      # headless test suite (zero dependencies)
node tools/serve.js    # dev server on http://localhost:8080 — game and API
```

### Verifying a change

Two harnesses, and they cover different things:

- **`node tests/run.js`** — the simulation core, headless: world generation determinism,
  pathfinding, the input layer, the monster's sound-hunting, the spawn lock, biome
  strata, ore rarity, save round-trip and migration, economy invariants, the accounts
  client and the API's routing and auth rules.
- **`tools/probe.html`** — the whole game in a real browser. It boots the real game and
  plays one expedition end to end (descend → mine → get hunted → come home and deliver),
  driving the game through genuine keyboard and mouse events, then reports every step as
  a pass/fail checklist. Open it against the dev server:

  ```bash
  node tools/serve.js
  # then open http://localhost:8080/tools/probe.html
  ```

  It also logs any uncaught error or `console.error`, so a crash shows up as a failed
  check rather than a black screen.

  Two things to know before you change it:

  - **The probe owns the clock.** A browser tab nobody is looking at freezes its
    animation frames and clamps `setTimeout` to a second, so a wall-clock wait starves
    the game and every in-game timer looks like a hang. The probe sets `__evDrive`,
    ticks the game itself through `window.__evTick(frames)`, and measures every budget
    in **frames of game time**, never in milliseconds. Keep it that way.
  - **It is a mediocre player.** It digs a route to the nearest vein and mines it, but
    it does not yet fill a full quota in one expedition, so the "quota mined" and
    "delivered" checks can fail while everything else passes. Treat those two as
    known, and read the rest of the checklist.

Anything touching canvas rendering is verified in the browser; everything else is
verified headlessly.

## Art pipeline

Game art is generated with the [MiniMax CLI](https://github.com/MiniMax-AI/cli) and committed
to the repo. Regenerate any asset reproducibly:

```bash
mmx image generate --prompt "..." --seed 4101 --out assets/icons/ore_copper.png
```

Every asset has a procedural fallback — the game never breaks if an image is missing.

> **Art rule:** generate game art **bright and saturated**. The in-game light-radius mask
> darkens everything outside it, so dark atmospheric art gets double-darkened.

## License

MIT — see [LICENSE](LICENSE).
