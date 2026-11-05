# Ashfall architecture

**Status:** target architecture + migration in progress. The game is still a single Vite/Three.js
bundle; the folder structure below is the destination, not a claim that every file has moved.

**Current migration state:** `core/stockpile`, `core/needs`, `core/random` and `core/save` exist with
tests. `rng.js` is now a world-seed adapter; `save.js` is a compatibility shim over
`adapters/storage/localSave.js`. `campFolk.evaluateMorale`, `grantScrap` and `settlement.syncStorage`
call core rules. `features/survivors/` now owns explicit activity/status derivation, job kinds, job validation,
newcomer/removal transitions, job-phase helpers, work-loop selection and assignment validation;
`npcs.js` and `commander.js` consume it. The next slices are recruitment/roster ownership, then the
economy (stockpile ownership) and placement/power rules.

This document exists because Ashfall grew from a rendering prototype into a settlement game with
survivors, needs, morale, jobs, power, raids, expeditions and a save format. The current problem is
not a lack of features. It is that **game rules, content, presentation and wiring are mixed together**,
so every new rule touches several large files and is hard to test without opening a browser.

The answer is a **modular monolith with a pure game core and thin adapters**. Not microservices, not
ECS, not an event-sourced backend, not a framework. One deployment unit, clear internal seams.

---

## 1. What the research says (and what we are taking from it)

| Source | Idea we adopt | What we deliberately do not adopt |
| --- | --- | --- |
| **Functional Core, Imperative Shell** (Gary Bernhardt; FCIS in Godot) | Pure rules operate on plain state; Three.js, DOM, audio and storage are the shell. | A fully immutable game state with a new object every tick. Too much allocation and churn for this game. |
| **Modular monolith / domain-oriented monolith** (Kamil Grzybek, microservices.io, Encapsulated Module Architecture) | One deployable app, internally split by business area with explicit contracts. | Microservices, separate databases, module build systems, team-oriented ceremony. |
| **Vertical slices** | A feature owns its model, rules, tests and adapters behind one public entry point. | Technical-layer folders such as `models/`, `services/`, `controllers/` as the primary split. |
| **ECS literature** (gamedev.stackexchange answer; Moonjump; Moonside “Archetypal ECS Considered Harmful”; A* ECS docs) | Use plain objects and explicit systems because entity counts are small and behaviour is complex. | A full ECS. Six survivors and a few dozen ghouls do not justify archetype storage; complex jobs and morale become harder to debug. |
| **Deterministic simulation / presentation split** (Storyngton Hall Match3 postmortem) | Simulation owns time and rules; presentation interpolates and reacts. Fixed-step ticks make tests and replays possible. | Fixed-point maths and a custom scripting language. Our simulation is not networked and does not need bit-exact replay yet. |
| **Strangler Fig migration** (Martin Fowler) | Keep the game playable while moving one seam at a time. | A big-bang rewrite of 20k lines. |
| **ADRs** (Michael Nygard) | Record why a boundary exists so future agents do not “clean it up” back into a god object. | A documentation bureaucracy. Short records only. |

The important conclusion: **ECS and event sourcing are not the next step.** The complexity is
already in *game rules and ownership*, not in per-frame entity iteration. The cheapest wins are
explicit modules, pure rules, tests and a composition root.

---

## 2. Current findings

Measured on the current tree:

- `src/main.js` imports **37 modules** and is the composition root, game loop, save/load layer,
  resource mutator, raid controller, objective controller and debug console.
- `src/settlement.js` (~2.2k lines) mixes building content, procedural geometry, placement rules,
  power adjacency, warehouse visuals, production, turrets and damage.
- `src/npcs.js` (~1.6k lines) mixes survivor creation, equipment, jobs, work loops, combat,
  navigation, morale, recruitment and save data.
- `src/ui.js` reads domain state directly and owns presentation decisions.
- `rng.js` imports `save.js`, so the pure random generator depends on `localStorage`.
- Resources are mutated directly through `state.scrap`, `state.water`, `state.food`,
  `state.components` across many files.
- Attention/status reasons are ad-hoc strings (`NO PATH`, `STORAGE FULL`, `NO WATER`, …) duplicated
  between simulation and UI.
- There is no test runner, no type check and no dependency-boundary check.
- Save data is schema-versioned, which is good, but migration logic lives in the storage adapter.

This is a normal prototype trajectory. It is fixable without a rewrite.

---

## 3. Target structure

```
src/
  core/                  pure domain rules. No Three.js, DOM, storage, audio or timers.
    needs.js             hunger/thirst/morale factors and warnings
    stockpile.js         capacity, add/take/clamp, affordability
    random.js            seeded RNG and deterministic helpers
    save.js              schema version, migrations, validation (pure)
    reasons.js           reason codes used by attention and UI
    commands.js          command shapes + validators (grows over time)
    events.js            small synchronous domain-event bus (app boundary only)
  content/               data-only definitions with stable IDs
    buildings.js
    recipes.js
    items.js
    encounters.js
    balance.js
  features/              vertical slices; each has a public index.js
    world/
    camp/
    survivors/
    economy/
    power/
    threats/
    expeditions/
  adapters/              implementation details for the outside world
    three/               scene builders, meshes, animation, camera, FX
    ui/                  DOM shell, panels, view models
    storage/             localStorage / future platform storage
    audio/
    input/
  app/                   composition root and orchestration only
    bootstrap.js
    game.js
    loop.js
    debug.js
  shared/                tiny pure helpers with no game rules
```

### Dependency direction

```
core  <-  content  <-  features  <-  adapters  <-  app
```

- `core` imports only `core` and `shared`.
- `content` imports `core` types/IDs, never `features` or `adapters`.
- A feature may import `core` and `content`. It must not import another feature’s internals; only its
  public `index.js`.
- `adapters` may import feature contracts and core types. They never import another adapter directly.
- `app` is the only place allowed to wire everything together.
- **No circular imports.** A cycle is an architecture bug, even if the bundler tolerates it.

Current flat files are “legacy modules”. They may violate these rules until migrated, but new code
must not add new violations.

---

## 4. State, commands and events

### Game state

The simulation owns one plain, serializable `GameState` (or a small set of feature-owned state
objects). Three.js objects and DOM nodes are **view state**, keyed by stable IDs and rebuilt from
the simulation.

Rules:

- No gameplay decision reads a Three.js object or a DOM node.
- No Three.js object is the source of truth for health, resources, jobs or ownership.
- Every saved field has an owner. If two modules both write `state.scrap`, that is a bug.
- IDs are stable strings/numbers. Never identify a building by array index in save data.

### Commands

Player intent enters the simulation as a command:

```
{ type: 'MOVE_UNIT', unitId, x, z }
{ type: 'PLACE_BUILDING', buildingType, x, z, heading }
{ type: 'ASSIGN_WORKER', unitId, buildingId, slot }
{ type: 'WELCOME_NEWCOMER', unitId }
{ type: 'BROADCAST_RELAY', buildingId }
```

A command is validated and applied by the owning feature. It returns a result:

```
{ ok: true, events: [...] }
{ ok: false, reason: 'NO_FREE_BED' }
```

This replaces “UI calls a random method on a random system and hopes the state is consistent”.

### Events

Events are facts, not requests:

```
UNIT_LEFT, UNIT_DOWNED, BUILDING_COMPLETED, RESOURCE_CHANGED,
JOB_FAILED, POWER_LOST, NEWCOMER_ARRIVED, RAID_STARTED
```

Use a **small synchronous event bus** at the app boundary for cross-feature reactions (audio, FX,
toasts, objective progress). Do not turn every internal call into an event. If two things always
happen together and are in the same feature, call a function.

Existing callbacks (`onScrap`, `onWater`, `onBuildComplete`, …) stay until the owning feature is
migrated. New code should not add another callback web.

---

## 5. Managing game-logic complexity

The current “game logic bugs” mostly come from implicit rules spread across files. The target is
explicit rules with names, reasons and tests.

### Explicit state machines

**Survivor activity** should be a small explicit state:

```
pending -> idle -> moving -> working -> idle
                  -> fighting -> idle
                  -> downed -> recovering -> idle
                  -> away (expedition) -> returning -> idle
```

A unit has one `activity` state, one optional `job`, one assignment and one attention reason.
Today these are implied by `job`, `manning`, `onExpedition`, `pending`, `dead`, `home` and several
timers. The migration will make the state explicit and keep the old fields as derived views during
the transition.

**Buildings** have `site -> built -> damaged -> destroyed`, plus power state and job slots. Warehouse
adjacency is a derived view of building positions, not a second source of truth.

### Reason codes

Replace ad-hoc strings with constants in `core/reasons.js`:

```
NO_PATH, STORAGE_FULL, NO_WATER, NO_SCRAP, NO_WORKER,
NO_POWER, NO_NODE, NO_BED, NO_RECIPE, UNREACHABLE
```

UI translates codes to text. Simulation never formats user-facing sentences.

### Invariants and “can X?” functions

Every rule that can fail gets a pure predicate:

- `canPlaceBuilding(state, type, x, z, heading)`
- `canAddResource(store, type, amount)`
- `canAssignWorker(state, unitId, buildingId)`
- `canWelcomeNewcomer(state, unitId)`
- `canAfford(store, cost)`
- `canPower(building, network)`

The predicate and the mutation share the same implementation, so UI and simulation cannot disagree.

### Content vs rules

Balance numbers, costs, recipes, item stats, building footprints and encounter tables belong in
`content/`. Rules read data by ID. A designer can change a cost without editing a system. No new
magic numbers in systems.

### Fixed-step simulation

The long-term loop:

- simulation at a fixed step (start at 20 Hz, tune later);
- render at display rate with interpolation for positions and camera;
- input is sampled once per render and converted into commands;
- save snapshots only simulation state.

This makes headless tests and bug reproduction possible. It is a later phase because it changes
movement and animation timing; do not mix it with a feature migration.

---

## 6. Testing and guardrails

The project is built by an AI agent. The guardrails are therefore part of the architecture, not
optional extras.

### Required checks

```
npm run typecheck        # tsc --noEmit over core/shared/tests
npm run test             # Vitest unit tests
npm run check:boundaries # no core -> Three/DOM/storage; no cycles
npm run build
npm run check            # all of the above
```

### What gets tested first

1. Pure core rules: needs/morale, stockpile, save migrations, placement predicates.
2. Headless simulation scenarios: “dawn with no food”, “newcomer waits”, “warehouse capacity”.
3. Save round-trips and migrations.
4. Browser smoke test for the shell (later Playwright).

### Boundary rules enforced by script

- `src/core/**` may import only `src/core/**` and `src/shared/**`.
- No `three`, `window`, `document`, `localStorage`, `navigator`, `requestAnimationFrame` in core.
- No import cycles in `src/**`.
- Legacy files are reported, not failed, until their migration phase.

---

## 7. AI-agent workflow

Read `AGENTS.md` before changing code. In short:

- one feature slice per change;
- do not add cross-feature imports;
- keep files focused; split before 300–400 lines where practical;
- add a test for every new rule;
- do not put gameplay logic in Three.js or DOM code;
- do not add a new global mutable singleton;
- do not add ECS, a state-management library, a DI container or a scripting language;
- update this document and an ADR when a boundary changes.

The human is the product designer/architect. The agent is the implementer. The architecture must
make the agent’s work reviewable: small diffs, explicit contracts, tests and a runnable check command.

---

## 8. Non-goals

- No microservices, server, multiplayer or netcode.
- No full ECS rewrite.
- No event sourcing or replay system yet.
- No TypeScript rewrite of the whole codebase. JSDoc + `checkJs` in core first.
- No generic plugin framework, DI container or UI framework.
- No “team scale” abstractions. One developer + agents, one deployment.

---

## 9. References

- Functional Core, Imperative Shell — https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell
- FCIS in Godot — https://dev.to/sammburr/fcis-in-godot-2433
- Modular monolith primer — https://kamilgrzybek.com/blog/posts/modular-monolith-primer
- Modular monolith patterns — https://microservices.io/post/architecture/2024/09/09/modular-monolith-patterns-for-fast-flow.html
- Encapsulated Module Architecture — https://modularmonoliths.com/approaches/encapsulated-module-architecture/
- Game Programming Patterns — https://gameprogrammingpatterns.com/
- When not to use ECS — https://gamedev.stackexchange.com/questions/114301/should-i-implement-entity-component-system-in-all-my-projects
- Archetypal ECS considered harmful — https://moonside.games/posts/archetypal-ecs-considered-harmful/
- Deterministic simulation / presentation split — https://80.lv/articles/divide-and-conquer-deterministic-and-scripted-match3-engine/
- Strangler Fig — https://martinfowler.com/bliki/StranglerFigApplication.html
- Architecture Decision Records — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
