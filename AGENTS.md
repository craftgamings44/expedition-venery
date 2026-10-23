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
- The monster **sleeps** for the first minute after you go down (`src/systems/spawnlock.js`).
  It neither moves nor hears during that time, and the countdown only runs while you are
  underground. It wakes with a growl, and it will camp the elevator once it knows you were
  loud near the pad.
- Dying costs you your pack. Your body stays in the lair and can be recovered — by you,
  if you dare go back.
- You cannot dig upward. That constraint is fundamental to the genre.
- **The depth strata are anchored to the elevator pad**, not to the difficulty's nominal
  cave start. The pad is where the elevator sets you down, so anchoring to it guarantees
  you always arrive in the first stratum — where quest one's copper grows. Anchoring to
  `D.st` dropped the pad into the second stratum on easy and hard, and the first quest
  became impossible.
- **Emerald carries the weight diamonds used to carry**, in both the biome ore tables and
  the per-difficulty lucky-find weights. Diamonds are rarer than that — roughly a third of
  the old rate. If you retune one, retune the other, or a stratum will stop yielding the
  gem the quests ask for.

## Save format

Saves are versioned. When the shape changes, bump `SAVE_VERSION` in `src/state/save.js` and
add a migration step in the migration chain. **Never** change a save shape without a
migration — existing players must keep their progress.

## Testing

```bash
node tests/run.js
```

The harness is dependency-free on purpose (Node is the only requirement). Tests cover the
simulation core: world generation determinism, pathfinding, the input layer, the monster's
sound-hunting and state transitions, the spawn lock, biome strata, ore rarity, save
round-trip and migration, and economy invariants.

Anything touching canvas rendering is verified in a real browser instead.
`tools/probe.html` is an instrumented harness that boots the real game and plays one
expedition end to end — descend, mine, get hunted, come home and deliver — driving the
game through genuine keyboard and mouse events and reporting every step as a pass/fail
checklist. Serve the repo (`node tools/serve.js`) and open
`http://localhost:8080/tools/probe.html`.

**The probe owns the clock.** A tab nobody is looking at freezes its animation frames and
clamps `setTimeout` to a second, so a wall-clock budget starves the game and every
in-game timer looks like a hang. The probe sets `__evDrive`, drives the game through
`window.__evTick(frames)`, and counts every budget in **frames of game time**. It also
yields to the event loop with a `MessageChannel` between frames — a microtask-only loop
never lets the game's own asset loading finish, and the boot silently stalls.

Use both. A change that passes the headless suite can still be broken in the browser, and
vice versa — the input layer and the tween loop have each broken in one and looked fine in
the other.

## Conventions

- Plain JavaScript with JSDoc types (`src/data/types.js` holds shared typedefs).
- `const` by default; `let` only for genuinely reassigned bindings.
- Prefer pure functions that take state explicitly over functions that close over globals.
- Keep modules focused; if a file exceeds ~300 lines, it probably wants splitting.

## Reference material

- `reference/Expedition_VeneryV8.html` — the original single-file prototype (V8).
  It is the source of truth for **gameplay behaviour** during the port, and the baseline
  for comparison when refactoring. Read it before changing anything that affects feel.
  It is dense, but it is complete: the spawn lock, the tween semantics and the monster's
  hearing rules all live in there, and the port is only faithful where it matches.
- `ARCHITECTURE.md` — the V9 architecture proposal and delivery plan.
- `tools/baseline-probe.html` — the V8 audit harness used to measure the prototype before
  the port.
