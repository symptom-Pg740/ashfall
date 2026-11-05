# Refactor plan

This is the migration plan for `docs/ARCHITECTURE.md`. The game stays playable after every phase.
No big-bang rewrite.

## Phase 0 — Guardrails and vocabulary (this pass)

- [x] Write `docs/ARCHITECTURE.md`.
- [x] Add ADRs for the decisions that agents must not undo.
- [x] Add `AGENTS.md` with dependency rules and check commands.
- [x] Add Vitest + TypeScript `checkJs` for `src/core` and tests.
- [x] Add a boundary/cycle checker.
- [x] Add `npm run check`.
- [ ] Make CI run `npm run check` on every push (follow-up).

**Gate:** `npm run check` passes; the game still builds and boots.

## Phase 1 — Pure core rules (started)

Move rules that can be expressed without Three.js, DOM or storage.

- [x] `src/core/stockpile.js` — capacity, add/take, clamp, affordability. Wired into `grantScrap`
  and `settlement.syncStorage`.
- [x] `src/core/needs.js` — hunger/thirst/morale factors, warnings, speed. Wired into
  `campFolk.evaluateMorale`.
- [x] `src/core/random.js` — seeded RNG and pure helpers. `rng.js` is now a thin world-seed adapter.
- [x] `src/core/save.js` — schema version, parsing and validation.
- [x] `src/adapters/storage/localSave.js` — localStorage adapter; `src/save.js` is a temporary shim.
- [ ] `src/core/reasons.js` — reason codes, migrate attention strings.
- [ ] `src/core/placement.js` — building placement and warehouse adjacency predicates.
- [ ] `src/core/jobs.js` — job shapes and transitions.
- [ ] `src/core/power.js` — power graph rules (no Three.js wires).

**Gate:** the rules have unit tests, and legacy modules call them instead of duplicating the rule.

## Phase 2 — Content extraction

Move data out of logic files:

- [ ] `content/buildings.js` — costs, footprints, HP, job slots, power, visuals key.
- [ ] `content/recipes.js` — workshop recipes and caps.
- [ ] `content/items.js` — wardrobe items and weapon specs.
- [ ] `content/encounters.js` — encounter composition and levels.
- [ ] `content/balance.js` — day length, raid pressure, morale weights, storage capacity.

**Gate:** adding a building or recipe does not require editing a system file.

## Phase 3 — Feature slices (strangler fig)

Move one feature at a time behind `features/<name>/index.js`. Keep re-export shims so old imports
continue to work until the last caller is migrated.

Suggested order:

1. **survivors** — unit model, needs, morale, jobs, assignments, recruitment. Highest game-logic
   complexity and the source of most “why did they do that?” questions.
2. **economy** — stockpile, production, hauling, workshop, trade. Removes direct `state.scrap`
   mutation from the rest of the game.
3. **camp** — buildings, placement, construction, demolition, warehouse clusters.
4. **power** — graph, poles, batteries, consumers, broadcast power requirement.
5. **threats** — ghouls, raiders, bats, raids, damage, guards.
6. **expeditions** — travel, runtime cells, loot, return.
7. **world** — terrain, props, resources, encounters, road traffic.
8. **ui** — view models and commands; remove direct domain reads.

**Gate per slice:** old module shrinks, new feature has tests, no new cross-feature imports, game
boots and the relevant browser scenario passes.

## Phase 4 — Composition root and loop

- [ ] Move `main.js` wiring into `app/bootstrap.js`.
- [ ] Move the frame loop into `app/loop.js`.
- [ ] Move debug hooks into `app/debug.js`.
- [ ] Introduce a fixed-step simulation accumulator with render interpolation.
- [ ] Replace the remaining callback web with commands + domain events.

**Gate:** `main.js` is a small entry point; the game loop is testable headlessly.

## Phase 5 — Save and platform

- [ ] Save only domain state + content version.
- [ ] Migration tests for every schema version.
- [ ] Add an explicit “new run / continue / abandon” flow.
- [ ] Add a platform storage adapter for the store build (Capacitor/Tauri/PWA decision later).
- [ ] Add a headless scenario runner for long-run balance tests.

**Gate:** a save from every released version loads, and a 30-day simulation can run headlessly.

## Phase 6 — Store release hardening

- [ ] Bundle budget and asset policy.
- [ ] Mobile device matrix and thermal test.
- [ ] Error reporting/crash breadcrumbs (privacy-respecting).
- [ ] Store packaging decision.
- [ ] Onboarding and accessibility pass.

---

## Migration rules

1. **Never migrate two features in one change.** Small diffs are reviewable by the human and
   recoverable by the agent.
2. **Keep the game runnable.** Every phase ends with `npm run check` and a browser smoke test.
3. **Shims are allowed, but temporary.** A re-export shim must name the phase that removes it.
4. **No new coupling.** If a migration needs a callback from feature A into feature B, use a command
   or an event at the app boundary instead.
5. **Write the test first for rules.** The rule can be tested without Three.js.
6. **Measure before optimizing.** The current scene is ~180k triangles / ~110 calls in the headless
   camp view. Architecture work should not regress that.

## What “done” looks like

- A new building or recipe is a content edit plus, at most, a small system hook.
- A new survivor rule is a pure function with tests, not a branch in `npcs.js`.
- The UI asks for a view model and sends commands; it does not mutate resources or jobs.
- The Three.js layer can be replaced or upgraded without changing game rules.
- A headless test can run a day, a raid and an expedition without a browser.
- An AI agent can find the owner of a rule from the folder structure and the public `index.js`.
