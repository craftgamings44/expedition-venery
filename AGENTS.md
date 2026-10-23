# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

Expedition Venery — a 2D mining-horror game. Zero-build static web app using native ES
modules. No bundler, no framework in the game core, no runtime dependencies.

## Hard rules

1. **Never introduce a build step without explicit approval.** The repo must stay
   deployable to Vercel free tier as-is, with `vercel.json` and no `node_modules`.
2. **`render/` and `ui/` must not mutate game state.** They read from the store; all
   mutation belongs in `systems/` and `entities/`. This is what keeps the simulation
   headless-testable.
3. **Content goes in `data/`, not in engine code.** New ores, biomes, monster variants,
   skills and camp buildings are table entries. If you find yourself adding an `if` chain
   for content, that is the wrong place.
4. **Every asset has a procedural fallback.** The game must render correctly with zero
   image files present.
5. **Preserve seeded determinism.** World generation must depend only on the seed. The
   same seed must always produce the same world — tests depend on this.

## Gameplay invariants

- The monster **hunts by sound**, not sight. It cannot see through rock. Line-of-sight only
  applies in open space within its sight radius.
- Noise is the core resource. Mining, walking and landing all emit noise; the monster
  accumulates memory of sound sources and investigates them.
- The monster **learns**: it remembers where it heard you and which way you fled, and uses
  that on later hunts.
- Dying costs you your pack. Your body stays in the lair and can be recovered — by you,
  if you dare go back.
- You cannot dig upward. That constraint is fundamental to the genre.

## Save format

Saves are versioned. When the shape changes, bump `SAVE_VERSION` in `src/state/save.js` and
add a migration step in the migration chain. **Never** change a save shape without a
migration — existing players must keep their progress.

## Testing

```bash
node tests/run.js
```

The harness is dependency-free on purpose (Node is the only requirement). Tests cover the
simulation core: world generation determinism, pathfinding, monster AI state transitions,
save round-trip and migration, and economy invariants.

Anything touching canvas rendering is verified in a real browser instead. `tools/probe.html`
is an instrumented harness that boots the game, drives a scripted sequence, and reports
thrown errors and console output — use it to verify gameplay changes.

## Conventions

- Plain JavaScript with JSDoc types (`src/data/types.js` holds shared typedefs).
- `const` by default; `let` only for genuinely reassigned bindings.
- Prefer pure functions that take state explicitly over functions that close over globals.
- Keep modules focused; if a file exceeds ~300 lines, it probably wants splitting.

## Reference material

- `reference/Expedition_VeneryV8.html` — the original single-file prototype (V8).
  It is the source of truth for **gameplay behaviour** during the port, and the baseline
  for comparison when refactoring. Read it before changing anything that affects feel.
- `ARCHITECTURE.md` — the V9 architecture proposal and delivery plan.
- `tools/Expedition_VeneryV8.original.html` — pristine copy of the prototype for diffing.
