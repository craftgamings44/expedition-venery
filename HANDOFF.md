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
  `api/` (Vercel function: `index.js`, `[...path].js`, `db.js`) and `src/main.js`
  (composition root).
- **929 headless tests pass, 0 fail** — `node tests/run.js`. The new ones cover the
  accounts client and the API's routing and auth rules.
- **`tools/probe.html`** boots the real game in a browser and plays an expedition through
  genuine keyboard and mouse events, reporting a pass/fail checklist. Serve with
  `node tools/serve.js` and open `http://localhost:8080/tools/probe.html`.
- **42 AI-generated art assets** (~7 MB) under `assets/`, all with procedural fallbacks.
  Regenerate any of them with the `mmx` CLI — see `assets/PROMPTS.md`.
- **The cloud account path works, in production.** The database is a Supabase project
  (`expedition-venery`, ref `qwsbtoagxkazsrcskdkd`) reached through the session pooler on
  port 5432. `DATABASE_URL` is a Vercel production secret and lives in `.env` locally.
  `node tools/api-check.js <url>` exercises the whole API against any server — 21 checks,
  all passing against both localhost and the deployment.
- **The deployment is live** at `https://expedition-venery.vercel.app`.

Last commit: `7a23cc2` "Provision the database, and harden the whole stack", pushed to
`main`.

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

## What changed in the cloud-path pass

The cloud accounts were **unreachable**, for three separate reasons, all fixed:

1. `detectCloud()` read a **401** as "there is no backend". The server answers 401 when
   nobody is signed in and 503 when it is not configured — different answers, and the
   client now tells them apart. Before the fix the client always fell back to local
   accounts, so the backend could never be used.
2. The client asked for `api/session` — a **relative** URL. From `/index.html` that
   resolves correctly, but from `/tools/probe.html` it resolves to `/tools/api/session`
   and 404s. Every call now uses `/api/...`.
3. The session token lived only in a module variable, so a reload dropped the cloud
   session. It is now kept in `localStorage` under `ev_cloud_token`.

Also: `api/index.js` imported `pg` without it ever being in `package.json`, so with
`DATABASE_URL` set the function threw *outside* its try block and returned a raw 500.
The schema bootstrap now runs once per cold start instead of on every request, there is
a `GET /api/health` route, and auth attempts are rate limited per IP.

`api/[...path].js` is a catch-all that re-exports the handler. Without it Vercel maps
`api/index.js` to `/api` only, and `/api/session` 404s in production — the local dev
server routes straight to the handler and never noticed.

`pg` is the **only** npm dependency and it belongs to the serverless function. The game
itself has no dependencies and no build step.

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
   never pass it on a command line. `DATABASE_URL` holds the database password: it lives
   in `.env` (gitignored) and in the Vercel environment, and nowhere else. Never paste it
   into chat or a commit.

## Known gaps

- **The probe is a mediocre player.** It digs a route to the nearest vein and mines it,
  but it does not reliably fill a full quota in one expedition, so its "quota mined" and
  "ore delivered" checks can fail while everything else passes. The game itself is fine —
  the probe's navigation is the weak part. Fixing it means making its dig route pick
  better goals and keeping it from walking into holes.
- **The probe signs up before the game boots**, so it registers a local account even when
  the cloud is configured — `detectCloud()` has not run yet at that point. Not a game bug,
  but the probe therefore does not exercise the cloud path.
- **The campaign is only saved at the camp.** Shop purchases, camp building, skill
  unlocks and signing out persist it; nothing is written while you are underground. That
  is V9's existing cadence, now mirrored by the cloud. A player who closes the tab
  mid-expedition loses that expedition's progress.
- **The network cannot resolve `*.vercel.app`.** The UniFi gateway answers NXDOMAIN for
  every `vercel.app` name while resolving `vercel.com` fine; `8.8.8.8` answers correctly.
  Fix it on the gateway (Network → Internet → DNS) or per device (Private DNS). Until
  then the deployment is reachable through the local proxy on port 8443.
- The campaign's later quests and the paid-job loop have only been exercised in the
  first quest.
- `tests/pathfind.test.js` was rewritten to be layout-independent; the cave layout is
  free to change again.

## Security

A full OWASP pass is done and the findings are fixed. What is in place:

- Parameterised SQL everywhere; scrypt hashing at the OWASP cost with the parameters
  stored per hash; plain usernames; 8-character minimum for new passwords only;
  server-side session revocation on sign-out; rate limiting; a cap on save size;
  security headers including a CSP that allows no inline scripts.
- The dev server used to serve `.env` — which held the database password — and its path
  check was a string prefix that let sibling directories through. Both fixed.
- `tools/supabase-setup.js` and `tools/vercel-env.js` keep secrets off the command line:
  the token and the connection string are read from `.env` and piped in.
- **The Supabase access token in `.env` is disposable and should be revoked.** The
  database password was set by the setup script and appeared in one terminal output, so
  rotate it if that matters.

## If you want to keep momentum

The natural next pieces, in the order I would take them:

1. Make the probe fill a quota, so the delivery path is covered end to end.
2. Play the late game — quests 6 to 10 are where emeralds and diamonds live, and the
   monster variants have never been seen in a real run.
3. The remaining headline content: monster variants per biome, and the camp buildings
   earning their keep.

Ask me which one. If I do not say, take the first.
