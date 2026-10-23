# Expedition Venery

A 2D mining-horror game. You dig down into a mountain, light your own way, and try to
fill a quota of ore before something that hunts by sound finds you.

Built as a zero-build static web app — native ES modules, no bundler, no framework in the
game core. Deploys to Vercel free tier straight from this repository.

## Play

Open `index.html` in a browser, or run a local server:

```bash
npx serve .          # or: python -m http.server 8000
```

Then visit the served URL.

> **Note:** the game uses native ES modules. Opening `index.html` directly via `file://`
> will be blocked by browser CORS rules — use a local HTTP server.

## The game

- **Procedurally generated caves** — deterministic per seed, every run is different but reproducible.
- **A monster that hunts by sound** — it cannot see through rock. It hears your pickaxe, remembers where it heard you, and learns the direction you flee. Stay silent behind stone and it won't know you exist.
- **Ten-quest story** for Mack, then endless paid jobs.
- **Progression** — pickaxes, mining luck, ropes, grappling hooks, decoys, and a cave-item economy.
- **Real risk** — if it catches you, you lose your pack. Your body ends up in its lair. Go back for it.

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
  systems/              mining, noise, inventory, economy, camp, skills
  render/               canvas rendering, lighting, HUD, art loader
  audio/                procedural WebAudio (no audio files)
  ui/                   DOM panels
  services/             accounts + cloud (local impl now, API later)
assets/                 AI-generated icons, UI art, creature portraits
api/                    Vercel serverless functions (later phase)
tests/                  headless Node test harness (no framework)
tools/                  dev utilities (art generation, browser probe)
reference/              the original single-file prototype
docs/                   architecture proposal and notes
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
```

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
