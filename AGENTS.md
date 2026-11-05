# AGENTS.md — Ashfall

Read `docs/ARCHITECTURE.md` and `docs/REFACTOR_PLAN.md` before a refactor or feature.

## Architecture rules

- One deployment. Modular monolith. No microservices, no ECS, no DI container, no state library.
- Dependency direction: `core <- content <- features <- adapters <- app`.
- `src/core/**` must not import `three`, `window`, `document`, `localStorage`, `navigator`,
  `requestAnimationFrame`, or any feature/adapter module.
- New gameplay rules go in `src/core/` as pure functions over plain data, with tests.
- Presentation (Three.js, DOM, audio, storage) is an adapter. It must not be the source of truth for
  health, resources, jobs, ownership or morale.
- A feature exposes a public `index.js`. Do not import another feature’s internals.
- No new circular imports. A cycle is an architecture bug even if the bundler tolerates it.
- `src/main.js` is legacy. Do not add new responsibilities to it; put new work in `src/core`,
  `src/features`, `src/adapters` or `src/app`.

## Game-logic rules

- Every rule that can fail gets a `canX` predicate or a command result with a reason code.
- Use stable IDs, never array indices, in save data and cross-feature references.
- One owner per saved field. Do not let two modules mutate `state.scrap` or a unit’s job.
- Content (costs, recipes, footprints, balance numbers) belongs in `src/content/`, not in systems.
- Replace ad-hoc attention strings with reason codes when touching that area.
- Survivor state must become explicit: `pending`, `idle`, `moving`, `working`, `fighting`, `downed`,
  `away`. Do not add another boolean that encodes activity.

## Change discipline

- One feature slice per change. Keep the game playable.
- Split files before they become another `main.js`. Prefer focused modules over “utils”.
- Do not migrate two features in one diff.
- Temporary re-export shims are allowed, but say which phase removes them.
- Do not add hacks for teams, scaling, microservices or hypothetical multiplayer.

## Required checks

Run before declaring work done:

```bash
npm run check
```

This runs type checking, unit tests, boundary/cycle checks and the production build.

## Testing

- Add a Vitest test for every new pure rule.
- Test save migrations when the schema changes.
- Browser smoke test: `npm run dev`, then load `http://localhost:5173/?autostart=1&fresh=1` and check
  the console.
- Use deterministic seeds in tests. Do not depend on `Math.random()` or wall-clock time in core.

## Documentation

- Update `docs/ARCHITECTURE.md` when a boundary changes.
- Add a short ADR in `docs/adr/` for decisions future agents must not undo.
- Keep `docs/REFACTOR_PLAN.md` current; tick phases only when their gate passes.
