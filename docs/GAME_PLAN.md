# Ashfall — game plan

**Vision:** a mobile-first, top-down **settlement survival game**. You command a small band of
survivors in a procedural wasteland: scavenge, haul, build, wire up power, and hold the camp through
the nights. You can still take direct control of any survivor, but the default game is command, not
a single avatar.

This document is the working plan. `docs/REALISM.md` is the separate backlog of realism items so
they are not lost while the systems work happens.

**Status:** Phases 1–3 first slices shipped (command mode/possession; warehouse and hauling;
day/night and the power chain). Defences are next. See §6 for the gate notes.

---

## 1. Where we are, and what changes

Today Ashfall is a single-character prototype: one player avatar, a camp of three decorative
survivors, a build menu, scrap/water, ghouls, raiders and firearms. The simulation is real, but the
player is the only agent.

The next version changes the unit of play from **one character** to **a faction**:

- The camp survivors become **units** with roles, jobs, inventories and orders.
- **Command mode** is the default: tap a survivor, then tap a target to give a contextual order.
- **Direct mode** remains: a selected unit can be possessed, which shows the joystick and puts the
  camera behind that unit. The RPG layer is a mode, not a separate game.
- The economy becomes physical: resources are **hauled to a warehouse** and stacked there.
- Defences become infrastructure: **solar → poles → wires → consumers**, with a **Vickers-style
  turret** that only engages non-humans, and a **watchtower** that needs an assigned gunner.

The single-character loop is not thrown away. It becomes the "take control" option, and the leader
is simply the first unit in the roster.

---

## 2. Assessment of the proposed features

### Strong ideas — keep

| Idea | Why it works |
| --- | --- |
| Contextual tap orders | The correct mobile RTS pattern. One tap selects, the next resolves to move / attack / gather / deposit by what is under the finger. No radial menus or mode buttons. |
| Command mode + possess mode | Gives the settlement scale without losing the third-person feel. Possession is the "hero moment"; command is the strategy layer. |
| Warehouse + hauling | Turns abstract resources into space and time. It gives the camp a centre of gravity, makes roads and distance matter, and creates a visible stockpile. |
| Power network with poles and wires | Strong visual identity and a real constraint. It also gives the turret a reason to exist and makes night a system, not a colour grade. |
| Turret that cannot identify humans | Excellent lore-driven rule. It splits defence cleanly: the turret handles ghouls, your people handle raiders. It also stops the turret from trivialising the game. |
| Watchtower needs a gunner | Manpower becomes a resource. Towers are strong but cost a unit that could be scavenging. |

### Risks — design around them

1. **Two control schemes can fight each other.** Command mode must own the camera and taps; direct
   mode must own the stick and the action buttons. The switch has to be explicit (`TAKE CONTROL` /
   `RELEASE`) and animated, never accidental.
2. **Pathfinding is the hidden cost.** Direct steering already catches on houses and rocks. RTS
   orders across the camp will expose it immediately. Budget a coarse navigation grid in Phase 1–2,
   not "later".
3. **Tapping a 20-pixel character on a phone is hard.** Add a generous pick radius and a **roster
   strip** of unit portraits; the roster is also the reliable way to select a unit behind a wall.
4. **Electricity linking is fiddly on touch.** Auto-link a placed pole to the nearest node in range,
   charge scrap, and keep a manual `LINK` mode for deliberate runs. Never require pixel-perfect
   dragging.
5. **Solar needs a day cycle.** Without one, a panel is a flat bonus. Commit to a short day/night
   cycle (≈6 minutes) before shipping power, and treat night lighting as part of that phase.
6. **Too many dependencies at once.** Turret = power + ammo + targeting + burst FX. Ship power-only
   first; add ammo/heat as an upgrade.
7. **Busywork.** Hauling must be short and readable. Small carry capacity, short trips, a repeating
   gather order, and a visible "deposited" beat. Do not make the player micro-manage every trip.
8. **The game still needs a finish line.** Systems alone do not make a game. Phase 6 defines a
   concrete objective and defeat condition.

### The one structural decision to make early

**Unify the player and the NPCs into one `Unit` type.** The current `Player` class builds its own rig
and owns movement, aim, weapons and camera. Possessing an arbitrary survivor later will be painful
unless the controller can attach to a `Unit`. Do this refactor in Phase 1, not after the command
layer is built on top of the old split.

Recommended shape:

- `Unit` — rig, weapon, stats, faction, job, inventory, aim controller.
- `UnitBrain` — job queue, auto-defend, needs.
- `PossessionController` — the current player movement/fire logic, attachable to any `Unit`.
- The leader is a `Unit` with `isLeader = true`.

---

## 3. Control model

### Two modes

| | Command (default) | Direct (possess) |
| --- | --- | --- |
| Camera | free pan / pinch zoom / compass yaw | follows the possessed unit |
| Joystick | hidden | visible |
| Tap ground | order selected unit to move | — |
| Tap target | contextual order | — |
| Actions | `TAKE CONTROL`, build, roster | `FIRE`, `GATHER`, `BUILD`, `RELEASE` |
| Selection | ring + roster card | unit card, no selection ring |

The stick is **hidden in command mode** by default. Selecting a unit reveals a small action card
with `TAKE CONTROL`; that button swaps modes. `RELEASE` returns to command mode with the unit still
selected. Possession never happens on a single tap, so panning and ordering cannot accidentally grab
a unit.

### Contextual order matrix

The tap resolves in this priority order: friendly unit → hostile → resource → building → ground.

| Target under the tap | Order |
| --- | --- |
| Friendly unit | select it; tapping an already-selected unit opens its card |
| Ghoul or raider | **attack** if armed; otherwise move away and report |
| Scrap pile / water | **gather**, then auto-haul to the warehouse while the node lasts |
| Warehouse | **deposit** carried resources |
| Watchtower | **man** the tower (armed units only) |
| Turret / solar / pole | **repair / connect** (engineer role only) |
| Empty ground | **move** to the point |
| Selected unit | open unit card (role, carry, release, take control) |

Long-press a unit opens its card. On desktop, right-click issues move/attack directly, and
`Tab` cycles the roster.

### Camera and selection feedback

- A ground ring under the selected unit, a soft outline on the card, and a dotted line to the order
  target while the order is active.
- Invalid orders flash red and toast the reason (`NOT ARMED`, `NO WAREHOUSE`, `NO POWER`).
- Tap vs drag: a tap is < 9 px of movement and < 350 ms. Drag pans; pinch zooms.

### Roster

A bottom strip of up to 6 portraits (name, role icon, HP/carry pips). Tapping a portrait selects the
unit; tapping it twice centres the camera. The roster solves the "small character on a phone" problem
and doubles as the army overview. In direct mode the strip stays visible but compact.

---

## 4. Systems

### 4.1 Units and jobs

Each survivor is a `Unit` with:

- **Role:** scavenger, guard, engineer, medic (start with scavenger/guard; add the rest in Phase 5).
- **Stats:** HP, speed, carry capacity, weapon, accuracy multiplier.
- **Inventory:** `carry: { scrap, water, food, components }`, capacity in units.
- **Job queue:** up to 3 orders; the brain runs the first valid one.
- **Job types:** `idle`, `move`, `attack`, `gather`, `haul`, `deposit`, `man`, `build`, `repair`,
  `flee`, `downed`.
- **Auto-defend:** an armed idle unit engages a hostile inside a short radius, then returns to idle.
  This is the current camp-guard behaviour, generalised.

Jobs are small state machines with `start`, `update(dt)`, `cancel`. The brain owns the queue; the
commands layer only enqueues jobs. That keeps orders, AI and saving in one place.

### 4.2 Warehouse and the physical economy

- New building: **Warehouse** (4×4, 24 scrap, capacity 200).
- Storage is a faction stockpile bound to the warehouse(s). With no warehouse, the camp holds a
  small field stock (50) at the campfire.
- Gathering: unit walks to the node, harvests for ~1.8 s, takes up to 10 units, hauls to the nearest
  warehouse, deposits, repeats while the node has yield.
- The warehouse visual grows crate stacks with fill (0–6 levels, instanced crates). Each resource has
  a small pile/barrel cluster.
- HUD: `SCRAP 42/200`, `WATER 12/200`, with a warning when full. Full storage stops gathering and
  tells the player to spend or build.
- The player's own gathering deposits to the same stockpile.

### 4.3 Day/night

- A 6-minute cycle (configurable): ~3.2 min day, ~0.8 min dusk/dawn, ~2 min night.
- Drives sun direction/intensity/colour, sky gradient, fog, ambient fill, shadow direction and the
  solar output curve.
- Night: ghoul pressure rises, raiders prefer day, campfires and electric lights matter.
- The HUD shows a small sun/moon dial and the time to the next phase.

### 4.4 Electricity

- **Nodes:** solar panel (source), battery (storage), pole (relay), consumer (turret, lights,
  workshop, relay).
- **Links:** a wire between two nodes within `maxSpan` (12 m). Poles relay; a consumer must be in a
  connected component with a source.
- **Placement:** placing a pole auto-links to the nearest unlinked node within span and charges
  scrap per metre. Manual `LINK` mode: select a node, tap the target, wire is drawn and costed.
- **Wires:** catenary curves (sag) in a warm dark colour, with a subtle powered glow.
- **Simulation:** each tick, sum production (solar × daylight) and demand (turret idle/firing,
  lights at night). Priority: defence > lights > workshop > charging. Deficit sheds lower priorities;
  surplus charges batteries, then is wasted.
- **HUD:** `POWER 8/12` and a battery bar; red deficit, amber battery, green surplus.
- **Failure states:** a turret with no power traverses to a rest pose and its indicator goes dark.

### 4.5 Defences

**Vickers turret**

- Tripod, water-cooled ribbed barrel, top-feed block, spade grips, small shield. Built procedurally
  like the rest of the settlement kit.
- **Targeting rule:** only non-human creatures (ghouls, future beasts). It ignores raiders, camp folk
  and the player — the lore is that the scavenged fire-control can tell "not human" but not "friendly
  human".
- 220° traverse arc set at placement, 18 m range, 8-round bursts at ~450 rpm, 6 damage per round,
  1.5 s between bursts, 250-round belt, 4 s reload. Power draw 0.2 idle / 1.5 firing.
- A red/green lamp shows power and engagement. Brass and muzzle FX reuse the existing systems.

**Watchtower (changed)**

- No automatic fire. An armed unit can be assigned: select the unit, tap the tower. The unit walks to
  the base, then mans the platform.
- While manned: +6 m weapon range, 40 % damage reduction, and the tower counts as the unit's position
  for targeting.
- Unassign from the tower card; the unit climbs down. If the tower is destroyed later, the gunner is
  downed.
- This makes human raids the player's problem and ghoul waves the turret's problem.

### 4.6 Raids and pressure

- Raid composition shifts with the day: ghouls at night, raiders in the day, mixed later.
- Raiders target the warehouse and power infrastructure, not just the player. Ghouls target units and
  the campfire.
- A raid warning gives 20–30 s to assign the tower, power the turret and recall gatherers.
- Defeat: all units down at once, or the campfire destroyed once building damage lands in Phase 5.
  Leader death remains a respawn (the camp drags you back), so the run is not over on one mistake.

### 4.7 Economy and progression (Phase 5)

- **Food** and **water** upkeep per unit per day. Unfed units lose speed and morale, then leave.
- **Recruitment:** surplus food/water attracts a survivor every few days, up to a population cap
  raised by houses.
- **Workshop:** unlocks weapon upgrades (the existing armory tracks), turret ammo, wire spools.
- **Components:** a rarer resource from ruins, needed for solar panels, batteries and the relay.
- **Roles:** engineer (build/repair/connect), medic (heal), guard (patrol), scavenger (gather).
- Tech tiers gate the power chain: panel → battery → turret → relay.

### 4.8 Objective (Phase 6)

**"Restore the relay."** The camp's long-range radio relay sits on the mesa. Repair it in three
stages (components, power, engineer), survive the night the signal attracts, and call for extraction.
That gives the run a beginning, a middle and an end, and a reason to build the whole power chain.

Lose if the campfire is destroyed or every unit is down. Win by completing the relay and surviving
the final assault.

---

## 5. Architecture

New modules, following the existing style (small, explicit, data-driven):

```
src/units.js        Unit model, roster, harvesting/deposit, unit-level stats
src/jobs.js         Job classes + queue runner
src/commands.js     selection, contextual orders, command/direct mode
src/nav.js          1 m navigation grid, A* + string-pulling, local avoidance
src/power.js        power graph, solve, priorities, batteries
src/daycycle.js     sun/moon, light + sky + solar curve
src/storage.js      faction stockpile, warehouse binding, capacity
src/emplacements.js turret + watchtower assignment and firing
```

Changes to existing files:

- `src/player.js` → split into `PossessionController` (movement/fire) + the leader `Unit`.
- `src/npcs.js` → becomes the unit pool and brain host; keeps `forEachTarget` / `damage`.
- `src/settlement.js` → new building defs (`warehouse`, `solar`, `pole`, `battery`, `turret`,
  `workshop`); placement hooks for links; building HP later.
- `src/input.js` → tap vs drag, `onTap`, `onLongPress`, joystick visibility.
- `src/ui.js` / `index.html` → roster, unit card, command hints, power/storage chips, take/release.
- `src/save.js` → **v3**: units (position, role, job, carry, hp), stockpile, warehouse, power links,
  day time, building state. Keep the v1→v2→v3 reader.
- `src/raiders.js` / `src/enemies.js` → target priorities (infrastructure, units), night modifiers.

Data flow:

```
tap → commands.pick() → order → unit.jobs.push(job)
                         ↓
                 unit.brain.update(dt) → nav / aim / animation
                         ↓
               storage / power / settlement update
```

Keep the existing `TargetRegistry`, `Firearms`, `AimController`, FX, audio and wardrobe. Units reuse
the same skinned rigs and weapon pose; no new character system is needed.

---

## 6. Phases

Each phase is a playable slice with a gate. Do not start the next phase until the gate is true.

### Phase 0 — Plan and seams (this document)

- `docs/GAME_PLAN.md`, `docs/REALISM.md`, README direction.
- Gate: the plan is agreed; the Unit/possession seam is decided.

### Phase 1 — Command core — **implemented (first slice)**

- Command mode, roster, selection ring, tap vs drag, contextual **move / attack / gather**.
- Possession for any survivor: the `Player` controller swaps onto the unit's rig, the stick appears,
  the camera follows, and the unit's weapon/HP come with it.
- The leader auto-fires while you command, so the camp is not helpless.
- Gather orders walk → harvest → haul to the player → deposit; jobs survive combat, and attacking
  units that lose line of sight search for a firing position.
- Gate: select Mara → tap a scrap pile → she walks, gathers, returns; tap a raider → she engages;
  take control of her → joystick appears and the camera follows; release → command camera returns.
  **Passed** (gather +9 scrap, ghoul killed in 3 pistol shots, possession moved 3.5 m and restored
  the leader cleanly).
- Deliberately not yet: a `Unit` class and a nav grid. The first slice extends `CampFolk` and gives
  `Player` a possess/release swap. Direct steering plus collision push and the flank search are
  enough for the camp; A* lands with the warehouse/hauling phase, when units cross the map.

### Phase 2 — Warehouse and hauling — **implemented (first slice)**

- Warehouse building (22 scrap, 4×4), base stock 80, +120 per warehouse, HUD `stored/capacity`.
- Gatherers haul to the nearest warehouse (or the player if none); eight crates fill with the stock.
- Full storage: the gatherer waits at the door with the load and retries every 2 s; the player's
  instant gather refuses to consume a pile while full.
- Gate: a gatherer walks node → warehouse and deposits without input; the warehouse visibly fills;
  a full warehouse holds the load and releases it after the player spends. **Passed** (100→109
  hauled, full at 200 held 9 until 150 was left, then 159).
- Deliberately not yet: per-resource warehouses, hauling between warehouses, a nav mesh.

### Phase 3 — Day/night and power — **implemented (first slice)**

- Six-minute day/night cycle: sun/moon direction, sky gradient, fog, ambient/fill, exposure and the
  solar curve. A clock sits in the HUD's power panel.
- Solar array (2.2), power pole (12 m span), battery bank (30) and yard light (0.5 at night).
- Placing a power building auto-wires it to the nearest node within 12 m for scrap; wires sag and
  change colour when energised. The HUD shows output/demand and a battery bar.
- Gate: panels charge a battery by day; at night the light runs from the battery and drains it; an
  empty battery leaves the light off; wires are visible and costed. **Passed** (30 stored at noon,
  battery 29.4 and the lamp on at 00:04, 27.4 after 4 s; empty battery → light off).
- Deliberately not yet: manual LINK mode, wire damage, indoor power, turret consumers.

### Phase 4 — Defences

- Vickers turret model, power draw, non-human targeting, burst FX, ammo.
- Watchtower assignment and release; gunner range/cover.
- Raid composition by time of day; raiders target infrastructure.
- Gate: the turret ignores raiders and shreds ghouls; the tower gunner fires only when assigned;
  unpowering the turret stops it; releasing the gunner returns them to the ground.

### Phase 5 — Economy and progression

- Food/water upkeep, recruitment, workshop, components, roles, tech tiers, turret ammo.
- Gate: a self-sustaining camp of 5–6 units for several days, with a reason to build each new
  building.

### Phase 6 — The game loop

- Relay objective, staged milestones, final assault, defeat conditions, save v3, onboarding.
- Gate: a new player can start, learn the loop, and either win or lose a run in 20–30 minutes.

### Phase 7 — Realism and polish

- Work the `docs/REALISM.md` backlog: audio tails/occlusion, animation, materials, weather, wounds,
  UI polish, device performance.
- Gate: physical-device playtest at 30/60 fps with no control regressions.

---

## 7. Scope guardrails

- **Single-unit selection** for v1. No box-select, no control groups, no formations.
- **No multiplayer.**
- **No full physics.** Buildings are static; units use capsules and a nav grid.
- **No production art.** Procedural geometry and the existing character system.
- **No new engine.** Three.js + the current architecture.
- **One map seed at a time**, but keep determinism and save compatibility.
- **Mobile first.** Every new interaction must work with one thumb and no hover.
- **Do not break direct mode.** It is the fallback when the command layer is confusing.

---

## 8. Open decisions

1. **Possession scope in Phase 1:** any unit or leader only? Recommendation: any unit, because the
   refactor is cheaper now.
2. **Turret manning:** power only, or power + one gunner? Recommendation: power only in Phase 4;
   add a gunner/ammo belt later if the turret trivialises nights.
3. **Day length:** 6 minutes for the prototype, or a slower 10–12 minutes? Recommendation: 6 now,
   tune after the relay objective exists.
4. **Warehouse capacity:** one global pool or per-warehouse local pools with hauling between them?
   Recommendation: one global pool bound to all warehouses; local pools are a later depth option.
5. **Building damage:** do raiders destroy buildings in Phase 4 or Phase 5? Recommendation: Phase 5,
   once the defence loop is stable.
6. **Art direction at night:** warm campfire pools with deep blue ambient, or a flatter moonlit
   grade? Recommendation: warm pools + blue ambient; it makes the turret lamp and wires read.

---

## 9. Immediate next slice

Phases 1–3 are in. The next slice is **Phase 4 — defences**:

1. Build the Vickers-style turret as a power consumer: tripod, water-cooled jacket, 220° arc.
2. Targeting rule: ghouls/non-human creatures only; raiders, camp folk and the player are ignored.
3. Burst fire, power draw, a visible powered lamp, and an ammo belt that can empty.
4. Watchtower assignment: select an armed survivor, tap the tower; the gunner gains range and cover.
5. Raid composition by time of day; raiders target the warehouse and power infrastructure.

The next visible milestone: **the turret shreds a night ghoul wave while ignoring the raiders, and a
gunner on the watchtower covers the human attack — then the player can unassign them.**
