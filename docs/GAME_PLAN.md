# Ashfall — game plan

**Vision:** a mobile-first, top-down **settlement survival game**. You command a small band of
survivors in a procedural wasteland: scavenge, haul, build, wire up power, and hold the camp through
the nights. You can still take direct control of any survivor, but the default game is command, not
a single avatar.

This document is the working plan. `docs/ECONOMY.md` is the detailed workplace/economy design;
`docs/ART_DIRECTION.md` is the mud-and-scrap style guide; `docs/REALISM.md` is the deferred realism
backlog. We are still in the **testing phase**: the economy numbers, building names and even the
assignment model can change after playtests. Keep new systems data-driven and save-migrated.

**Status:** Phases 1–5b first slices shipped (command/possession; warehouse and hauling; day/night
and power; Vickers turret + guard post gunner + nav grid; construction jobs; raids against the grid,
building HP/damage/repair; floating building card, manual wiring and the 360° turret fix; expanded
world with spread-out scatter and clearance-aware navigation; free builder role, Scavenger Hut,
workplace assignment and saved roles; Well Wheel, Farm, daily needs and the food/water HUD). The next
slice is **Phase 5c — Workshop, ammo and recruitment**. See §6.

---

## 1. Where we are, and what changes

Today Ashfall is a **command prototype**: a player avatar, a roster of three survivors, construction
sites, a warehouse, a day/night cycle, a solar/pole/battery grid, a Vickers turret, a guard post
gunner, daytime raider raids and night ghoul raids. The player still issues most tasks by hand; the
workplace model below is the next shift.

The next version changes the unit of play from **one character** to **a faction**:

- The camp survivors become **units** with roles, jobs, inventories and orders.
- **Command mode** is the default: tap a survivor, then tap a target to give a contextual order.
- **Direct mode** remains: a selected unit can be possessed, which shows the joystick and puts the
  camera behind that unit. The RPG layer is a mode, not a separate game.
- The economy becomes physical: resources are **hauled to a warehouse** and stacked there.
- Defences become infrastructure: **solar → poles → wires → consumers**, with a **Vickers-style
  turret** that only engages non-humans, and a **guard post** that needs an assigned gunner.
- **Workplaces replace task micromanagement.** A survivor is assigned to a **building**, not to a
  pile or a trip. The building gives them a repeatable loop (scavenge, draw water, farm, craft,
  build, guard). Manual orders are temporary overrides that return the worker to their post.
  See [ECONOMY.md](ECONOMY.md).
- **The map gets bigger** and the props spread out; chunk streaming is a later phase.
- **The camp has a material identity**: mud brick + salvaged scrap. Old-world ruins keep their own
  concrete/glass language. See [ART_DIRECTION.md](ART_DIRECTION.md).

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
| Guard post needs a gunner | Manpower becomes a resource. Towers are strong but cost a unit that could be scavenging. |
| Workplaces instead of task orders | The correct colony-game abstraction. One decision per building removes the gather/haul busywork and lets the camp run while the player fights or builds. |
| Scavenger Hut / free builder role | These are the two jobs that most need automation: a hut that loops gather→haul, and a builder role that answers the construction queue. The role avoids a building that exists only to hold one worker. |
| Well Wheel, Farm, Workshop | A simple production triangle: water and food sustain the population, scrap becomes ammo. The wheel must be a **well wheel** (desert) unless a river/oasis is added. |
| Workshop ammo from scrap | Ties combat to the economy and makes scavenging matter after the first build. Must replace, not duplicate, the armory purchase. |
| Mud + scrap style | Mud is the human constant; scrap is the adaptation. It keeps the camp visually distinct from old-world ruins and is cheap to model procedurally. |
| Floating building card | The building, not the unit, becomes the management surface: job slots, link, repair, recipe, HP, attention state. |

### Risks — design around them

0. **Automation can play the game for you.** The guardrail is upkeep, raids, power, storage and the
   relay objective, plus attention states that tell the player why a workplace stopped. If assigning
   everyone and walking away wins, the economy is too generous; if the player must reassign every
   ten seconds, the abstraction is wrong.

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
   gather order, and a visible "deposited" beat. Workplaces are the answer: the player assigns the
   job once, not every trip.
8. **The game still needs a finish line.** Systems alone do not make a game. Phase 6 defines a
   concrete objective and defeat condition.
9. **Building cards vs unit orders.** If a unit is selected, tapping a building must not be
   ambiguous. Recommendation: taps on buildings open the building card; contextual orders apply to
   ground, enemies and resources only. Assignment, repair, manning, linking and recipes live in the
   card. Validate this on a phone before expanding the card.
10. **Wire dragging on touch.** A drag line needs a large hit area, a visible range, a snap target
   highlight and an easy cancel. Do not make the player pixel-hunt a pole.
11. **A bigger map multiplies pathfinding and draw costs.** Spread props and reduce density first;
   chunk only when the single-mesh version is measurably at its limit. Expand the nav grid and camera
   bounds with the map.
12. **Two ammo economies.** Workshop production and the armory purchase must not both be primary.
   Pick one; the other becomes an emergency option or goes away.
13. **Where do builders come from?** A **free builder role** on a survivor. Builders auto-answer the
   construction queue and can be sent to a specific site; no dedicated building. The random
   auto-assign is removed (5a).

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
| Actions | `TAKE CONTROL`, build, roster, building card | `FIRE`, `GATHER`, `BUILD`, `RELEASE` |
| Selection | ring + roster card | unit card, no selection ring |

The stick is **hidden in command mode** by default. Selecting a unit reveals a small action card
with `TAKE CONTROL`; that button swaps modes. `RELEASE` returns to command mode with the unit still
selected. Possession never happens on a single tap, so panning and ordering cannot accidentally grab
a unit.

### Contextual order matrix

The tap resolves in this priority order: friendly unit → hostile → resource → **building** → ground.
Buildings open their **building card** instead of guessing a context order. Assignment, repair,
manning, linking and recipes live there, so the player is never surprised by a tap on a wall.

| Target under the tap | Result |
| --- | --- |
| Friendly unit | select it; tapping an already-selected unit opens its card |
| Ghoul or raider | **attack** if armed; otherwise move away and report |
| Scrap pile / water | **gather**, then auto-haul to the warehouse while the node lasts |
| Building | **open the building card** (slots, link, repair, man, recipe, HP, power) |
| Empty ground | **move** the selected unit to the point |
| Selected unit | open the unit card (role, home workplace, carry, release, take control) |

Long-press a unit opens its card. On desktop, right-click issues move/attack directly, and
`Tab` cycles the roster.

### Building card

Tapping a structure opens a compact card anchored above it on screen:

- name, HP, built state, power state and the attention reason (`NO WORKER`, `STORAGE FULL`,
  `NO WATER`, `NO POWER`, `NO PATH`);
- **job slots** (role + assigned survivor), with assign/release;
- **ASSIGN**: tap an empty slot, then the nearest idle survivor or a roster portrait; dragging a
  portrait is a later stretch;
- **LINK**: enter wire mode; nearby nodes highlight; drag a wire from the building to a target (tap
  is the fallback); show span, cost and a cancel;
- **REPAIR** for a damaged structure, **MAN/RELEASE** for a tower, **RECIPE** for the workshop;
- the card closes on a tap elsewhere or the X.

A unit with a workplace has a `HOME` shown on its card. Manual orders (move/attack/gather) pause the
work loop; when the order ends, the unit returns to its home. `RELEASE` clears the assignment.

### Workplaces instead of task orders

The player assigns a survivor to a building once and the building gives them a loop:

- Builder role (free) → finish the construction queue;
- Scavenger Hut → gather in a radius and haul to the warehouse;
- Well Wheel → draw water while staffed;
- Farm → grow food, consuming water;
- Workshop → convert scrap to ammo/components with a selected recipe;
- Guard post → guard the tower.

The detailed loops, slots, costs and attention states are in [ECONOMY.md](ECONOMY.md). The
important control decision is that **buildings are managed through the card, not through a selected
unit's contextual tap**. Unit orders remain for ground, enemies and resources.

### Camera and selection feedback

- A ground ring under the selected unit, a soft outline on the card, and a dotted line to the order
  target while the order is active.
- Invalid orders flash red and toast the reason (`NOT ARMED`, `NO WAREHOUSE`, `NO POWER`).
- Tap vs drag: a tap is < 9 px of movement and < 350 ms. Drag pans; pinch zooms.

### Roster

A bottom strip of up to 6 portraits (name, role icon, home building, HP/carry pips). Tapping a
portrait selects the unit; tapping it twice centres the camera. The roster solves the "small
character on a phone" problem and doubles as the army overview. When a building slot is waiting for
a worker, the roster can be used to fill it (tap the slot, then a portrait). In direct mode the strip
stays visible but compact.

---

## 4. Systems

### 4.1 Units and jobs

Each survivor is a `Unit` with:

- **Home workplace:** a building they are assigned to, or `null` for a free unit.
- **Role:** builder is a free role; the others are derived from the workplace — scavenger, water
  carrier, farmer, artisan, gunner.
- **Stats:** HP, speed, carry capacity, weapon, accuracy multiplier.
- **Inventory:** `carry: { scrap, water, food, components }`, capacity in units.
- **Work loop:** the home building's repeating behavior; runs when the unit has no manual order.
- **Manual order:** a temporary job (move/attack/gather/build/repair) that pauses the loop and returns
  to the post when it ends.
- **Attention:** the reason a loop cannot run (`NO NODES`, `STORAGE FULL`, `NO WATER`, `NO PATH`).
- **Job types:** `idle`, `move`, `attack`, `gather`, `haul`, `deposit`, `man`, `build`, `repair`,
  `work`, `flee`, `downed`.
- **Auto-defend:** an armed idle unit engages a hostile inside a short radius, then returns to idle.

Jobs are small state machines with `start`, `update(dt)`, `cancel`. The brain owns the loop and the
manual override; the commands layer only enqueues jobs. That keeps orders, AI and saving in one
place. See [ECONOMY.md](ECONOMY.md) for the full workplace model.

### 4.2 Warehouse and the physical economy

- New building: **Warehouse** (4×4, 22 scrap, base stock 80, +120 per warehouse).
- Storage is a faction stockpile bound to the warehouse(s). With no warehouse, the camp holds a
  small field stock at the campfire.
- Resources: **scrap, water, food, components and ammo**. Scrap/water/food/components share the
  store; ammo is held per calibre in the armory.
- Gathering: unit walks to the node, harvests, takes up to 10 units, hauls to the nearest warehouse,
  deposits, repeats while the node has yield. The Scavenger Hut automates this loop.
- The warehouse visual grows crate stacks with fill (0–6 levels, instanced crates). Each resource has
  a small pile/barrel cluster.
- HUD: `SCRAP 42/200`, `WATER`, `FOOD`, with a warning when full. Full storage stops gathering and
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
- **Pole ports:** each pole has **4 connection ports**; a source/consumer has 2. A link occupies one
  port. A wire is a graph edge, not a single daisy-chain.
- **Links:** a wire between two nodes within `maxSpan` (14 m after the map expansion). Poles relay; a
  consumer must be in a connected component with a source.
- **Manual LINK first:** tap a power building → **LINK** in its card; nearby valid nodes highlight
  with a range ring; drag (or tap) from the building to the target; show span and scrap cost; release
  to connect, tap elsewhere to cancel. A wire must never silently fail: if the target is out of
  range, has no free port, or there is not enough scrap, the line turns red and explains why.
- **Auto-link fallback:** on completion a power building may auto-link to the nearest **free port**
  within span and toast the cost. It is convenience, not the only path.
- **Wires:** catenary curves (sag) in a warm dark colour, with a subtle powered glow. A powered wire
  can be selected to jump to either endpoint.
- **Simulation:** each tick, sum production (solar × daylight) and demand (turret, lights at night,
  workshop). Priority: defence > water/farm > lights > workshop > charging. Deficit sheds lower
  priorities; surplus charges batteries, then is wasted.
- **HUD / card:** the power panel shows `POWER output/demand` and the battery; the building card
  shows `POWERED / NO SOURCE / NO WIRE`, the connected ports and the consumer draw.
- **Failure states:** a turret with no power traverses to a rest pose and its indicator goes dark.
  The card explains which of power, wire, arc or target is missing.

### 4.5 Defences

**Vickers turret**

- Tripod, water-cooled ribbed barrel, top-feed block, spade grips, small shield. Built procedurally
  like the rest of the settlement kit.
- **Targeting rule:** only non-human creatures (ghouls, future beasts). It ignores raiders, camp folk
  and the player — the lore is that the scavenged fire-control can tell "not human" but not "friendly
  human".
- **360° traverse standard.** The invisible 220° arc was removed in Phase 4c: it was clamped to a
  fixed facing chosen at placement and was the main reason the turret "did nothing". A Vickers on a
  tripod can traverse fully; the card shows the range ring. If a limited arc is reintroduced later,
  it must be visible at placement with a rotate control.
- 18 m range, 8-round bursts at ~450 rpm, 6 damage per round, 1.5 s between bursts, 250-round belt,
  4 s reload. Power draw 1.2 while active.
- The sight ray starts **outside the turret's own footprint** (1.9 m out, at gun height), otherwise
  the static-building raycast treats the turret as its own blocker. It still needs a clear line to
  the ghoul.
- A red/green lamp shows power and engagement. The building card shows `POWER`, `AMMO`, `RANGE`,
  `TARGETS: GHOULS ONLY` and the current target count, so "not working" is diagnosable. Brass and
  muzzle FX reuse the existing systems.
- **Lore:** it cannot identify humans. Raiders, camp folk and the player are never targets. If the
  player expects it to shoot raiders, the card says why it will not.

**Guard post (changed)**

- No automatic fire. An armed unit is assigned through the **guard post card's gunner slot** (or a
  selected unit → tap the post as a shortcut). The unit walks to the position, then mans the firing
  step.
- While manned: +6 m weapon range, 40 % damage reduction, and the tower counts as the unit's position
  for targeting.
- Unassign from the post card; the unit steps out. If the post is destroyed, the gunner is downed.
- **Fixed in 5b:** the gunner's shots now ignore the post's own collision cylinder (previously every
  round hit the structure they were standing in and never left). The silhouette is a low sandbagged
  fighting position, not a tall tower, so incoming fire can still reach the gunner above the parapet.
- This makes human raids the player's problem and ghoul waves the turret's problem.

### 4.6 Raids and pressure

- Raid composition shifts with the day: ghouls at night, raiders in the day, mixed later.
- Raiders target the warehouse and power infrastructure, not just the player. **Ghouls attack only
  living things** — survivors and the player — and never buildings. This is a hard rule; the turret
  and the raiders already encode the human/non-human split.
- A raid warning gives 20–30 s to assign the tower, power the turret and recall gatherers.
- Defeat: all units down at once, or the campfire destroyed. Leader death remains a respawn (the camp
  drags you back), so the run is not over on one mistake.

### 4.7 Workplaces and progression (Phase 5)

The full design is in [ECONOMY.md](ECONOMY.md). Summary:

- **Builder role** — a survivor set to builder finishes the construction queue automatically; no
  building required. **Implemented in 5a.**
- **Scavenger Hut** — assigned scavengers loop gather → haul within a work radius. **Implemented in
  5a** (two slots, 26 m, `NO NODES` / `STORAGE FULL`).
- **Well Wheel** — a staffed, hand-cranked well wheel produces water (the Rain Catcher remains a
  passive early source). **Implemented in 5b** (1 slot, 1 water / 4 s).
- **Farm** — staffed farmers produce food and consume water. **Implemented in 5b** (2 slots,
  1 food / 7 s per farmer, 1 water / 20 s).
- **Workshop** — assigned artisans convert scrap into pistol/rifle rounds, shells or components with
  a selected recipe; the weapon upgrade bench lives here. **Next in 5c.**
- **Needs:** one food and one water per survivor per day; missing supplies slow them by 20% and two
  consecutive unfed dawns make them leave. **Implemented in 5b** (dawn tick, `hunger`/`thirst`,
  dawn report, HUD caps). Surplus and a free house slot attracting a new survivor is 5c.
- **Roles:** builder is a free role; the rest are derived from the workplace (scavenger, water
  carrier, farmer, artisan, gunner); reassigning changes the role. No class-selection screen.
- The former armory "buy ammo" becomes a draw from the workshop stockpile (or a bad-rate emergency
  purchase); there must not be two primary ammo economies.

### 4.8 Objective (Phase 6)

**"Restore the relay."** The camp's long-range radio relay sits on the mesa. Repair it in three
stages (components, power, engineer), survive the night the signal attracts, and call for extraction.
That gives the run a beginning, a middle and an end, and a reason to build the whole power chain.

Lose if the campfire is destroyed or every unit is down. Win by completing the relay and surviving
the final assault.

### 4.9 Map scale and unit navigation — **implemented in 4d**

The playable disc is now **radius 90 m (180 m across)**, up from 50 m. The terrain plane grew to
300 m so the old rim still reads as distant badlands; the baked field is 416² and the same seed is
kept. The camera pan limit, actor clamp, enemy/raider spawn clamp, nav bounds and scrap radius all
follow `WORLD_RADIUS` / `PLAY_RADIUS` from `src/terrain.js`.

- **Scatter:** rock/grass-shrub density dropped by roughly half; trees, cacti, ruins and wrecks use
  wider minimum spacing (9–20 m) and the camp keeps a 14–18 m clear approach. Ruins now sit across
  the whole disc instead of a tight 42 m ring.
- **Navigation (`src/nav.js`):** a 1 m grid over the disc (185×185 cells) with inflated building and
  prop footprints, a soft clearance field, A* on a binary heap, a direct-line fast path, and
  string-pulled waypoints that finish on the exact target when it is walkable.
- **Stuck recovery (`src/npcs.js`):** a unit that is trying to move but not covering ground replans
  once, then fails the job with a `NO PATH` attention state and a toast. It never beelines into
  scenery after a failed path.
- **Separation:** camp folk push out of each other's capsules; perfect overlaps get a deterministic
  direction so a pair cannot weld together.
- **Debug:** the perf panel has a `PATHS` switch (or `?paths=1`) that draws current paths and
  waypoints. Off by default.
- **Chunking remains Phase 7.** The single terrain mesh and instanced scatter are deliberate for now;
  streaming is not promised yet.

### 4.10 Art and lore identity

Two visual languages, one rule: player-built structures are **mud brick + salvaged scrap**; old-world
ruins keep concrete, glass, asphalt and signage. Solar panels, batteries and turrets are **salvaged
technology** mounted on camp-made frames. The full guide is [ART_DIRECTION.md](ART_DIRECTION.md).

- Mud/adobe walls, stone footings, scrap roofs, tarps, timber, tires, barrels, sandbags, hand-painted
  signs and visible repairs.
- No clean concrete/glass/neon on player buildings. Ruins may be any old-world shape.
- Re-skin the warehouse first (it is the cleanest current building); new workplaces are modelled to
  the guide from the start.
- The top-down camera is the judge: silhouette, earth palette and one accent colour per building.

---

## 5. Architecture

New modules, following the existing style (small, explicit, data-driven):

```
src/workplaces.js   workplace defs, job slots, work loops, attention states
src/stockpile.js    scrap/water/food/components/ammo, caps, deposit/withdraw
src/needs.js        daily upkeep, morale, recruitment, population cap
src/buildingcard.js floating building card, slot assignment, actions, screen anchoring
src/wire.js         manual LINK mode, pole ports, drag line, range/validity feedback
src/units.js        Unit model, roster, home workplace, roles, inventory
src/jobs.js         Job primitives + work-loop runner + manual override
src/commands.js     selection, contextual orders, command/direct mode
src/nav.js          1 m grid, binary-heap A*, clearance field, smoothing
src/pathdebug.js    optional path/waypoint overlay for testing
src/power.js        power graph, pole ports, solve, priorities, batteries
src/daycycle.js     sun/moon, light + sky + solar curve
src/emplacements.js turret + guard post assignment and firing
```

Changes to existing files:

- `src/player.js` → split into `PossessionController` (movement/fire) + the leader `Unit`.
- `src/npcs.js` → the unit pool/brain host; home workplace, loop, manual override, attention.
- `src/settlement.js` → building defs (`scavenger`, `well`, `farm`, `workshop` + existing); job
  slots, construction queue, HP, recipes, power ports. Builder is a unit role, not a building.
- `src/input.js` → tap vs drag, `onTap`, `onLongPress`, joystick visibility, link-drag mode.
- `src/ui.js` / `index.html` → roster, unit card, **building card**, job slots, link mode, power/
  storage chips, take/release.
- `src/save.js` → **v5**: units’ home/role, workplaces/slots, construction queue, resources, needs,
  day counter, recipes, power port links, building HP. Keep the v1→v5 reader.
- `src/raiders.js` / `src/enemies.js` → target priorities (infrastructure, units); ghouls never
  target buildings.
- `src/props.js` / `src/terrain.js` → expanded world bounds, lower scatter density; chunking later.

Data flow:

```
tap building → building card → assign slot → unit.home
                                      ↓
                          work loop (or manual override)
                                      ↓
                     nav / aim / animation → stockpile / power
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
- The 1 m A* nav grid arrived with Phase 4; move/gather/man orders now route around houses and rock
  clusters. A dedicated `Unit` class is still deferred: `CampFolk` + the `Player` possess/release
  swap carry the slice without a second abstraction.

### Phase 2 — Warehouse and hauling — **implemented (first slice)**

- Warehouse building (22 scrap, 4×4), base stock 80, +120 per warehouse, HUD `stored/capacity`.
- Gatherers haul to the nearest warehouse (or the player if none); eight crates fill with the stock.
- Full storage: the gatherer waits at the door with the load and retries every 2 s; the player's
  instant gather refuses to consume a pile while full.
- Gate: a gatherer walks node → warehouse and deposits without input; the warehouse visibly fills;
  a full warehouse holds the load and releases it after the player spends. **Passed** (100→109
  hauled, full at 200 held 9 until 150 was left, then 159).
- **Construction jobs (added after Phase 4):** placing a structure creates a site (pad, scaffold,
  progress bar) anywhere in the camp, with no player range. The nearest free survivor is auto-assigned
  (or the player selects one and taps the site), walks with the nav grid, and builds over
  `2 + cost × 0.16` seconds. The real model only appears and activates on completion; storage, power,
  production, healing and defence ignore unfinished sites. Saves store `built` and
  `buildProgress` (schema v4). Verified: barricade site → Mara auto-assigned → built → model/site
  swap; far warehouse site 12.9 m away → cap 80 → 200 on completion; solar + pole + turret sites
  auto-wired on completion (2.2 output, 1.2 demand, turret powered).
- Deliberately not yet: per-resource warehouses, hauling between warehouses, cancel/refund.

### Phase 3 — Day/night and power — **implemented (first slice)**

- Six-minute day/night cycle: sun/moon direction, sky gradient, fog, ambient/fill, exposure and the
  solar curve. A clock sits in the HUD's power panel.
- Solar array (2.2), power pole (14 m span, four ports), battery bank (30) and yard light (0.5 at
  night).
- Placing a power building auto-wires it to the nearest node with a free port within 14 m for scrap;
  wires sag and change colour when energised. The HUD shows output/demand and a battery bar.
- Gate: panels charge a battery by day; at night the light runs from the battery and drains it; an
  empty battery leaves the light off; wires are visible and costed. **Passed** (30 stored at noon,
  battery 29.4 and the lamp on at 00:04, 27.4 after 4 s; empty battery → light off).
- Deliberately not yet: wire damage, indoor power, turret consumers. Manual LINK mode arrived in
  Phase 4c.

### Phase 4 — Defences — **implemented (first slice)**

- Vickers turret (26 scrap, 1.2 power, 18 m, 8-round bursts, 250 belt, 4 s reload). The 220° arc was
  removed in Phase 4c; it now traverses 360°.
  Target selection walks the ghoul pool only; raiders/camp/player are invisible to it. The head
  turns, the lamp goes green/red with power, and bursts use the shared tracer/FX/audio.
- Guard post auto-fire removed. An armed survivor ordered to the tower walks there via A*, mounts
  the platform, gains +6 m range and 40% damage reduction, and fires their own weapon. Tapping the
  tower again or issuing another order releases them to the ground.
- 1 m A* nav grid (settlement + props, 8-neighbour, line-simplified) for move/gather/man orders.
- Gate: turret ignores raiders and kills ghouls; unpowered turret does not fire; tower gunner fires
  only while assigned; release returns them to the ground. **Passed** (ghoul 500 → 266 under turret
  fire; raider untouched; tower gunner 12 shots, 500 → 284; unpowered mag stayed 250).
- Not saved yet: tower manning and turret belt/cooldown.

### Phase 4b — Raids against the grid — **implemented (first slice)**

- Raid composition: daytime raids spawn rifle raiders, night raids spawn ghouls; the banner labels
  the kind (`RAIDERS` / `GHOULS`). The night ambient ghoul spawn is doubled.
- Raiders pick the nearest **warehouse or power building** (priority over campfire/other), move to
  ~10.5 m, and fire at it for 14 structure damage per shot. They only break off for a unit within
  14 m, so a distant guard post gunner can keep firing while they work.
- Structures have HP (`60 + cost × 8`), a floating damage bar and low-health smoke. Destruction:
  remove from the scene, cut power links/wires, drop warehouse capacity, remove a chapel's +25
  vitality, down a tower gunner, rebuild the nav grid on the next path.
- Repair: select any survivor and tap a damaged structure; they walk within radius + 1.5 and restore
  14 HP/s. Towers keep manning priority for armed units; an unarmed survivor repairs a damaged tower.
- Gate: a day raid hits the warehouse; a night raid sends ghouls; a destroyed pole removes its wire;
  a destroyed tower downs its gunner; a repair restores a damaged warehouse. **Passed** (raider 222 →
  152 warehouse HP; pole/tower destruction cleared 1 link/wire and downed the gunner; repair 136 →
  149 and climbing; raid banners RAIDERS/GHOULS; scheduled 13:45 raiders vs 22:25 ghouls).

### Phase 4c — Building management and power UX — **implemented (first slice)**

- **Building card** anchored above the tapped structure: name, HP, build progress, power state and
  port count, attention reason, status rows and actions. It closes on an outside tap or the X.
- **Manual wire mode** with pole ports (4 per pole), range ring, node markers (green valid / red with
  a reason), drag-to-connect with a tap fallback, live span/cost feedback and an explicit cancel.
  Auto-link on completion is a fallback and filters out nodes whose ports are full.
- **Turret fixes:** 360° traverse, sight ray starting outside its own footprint (the real
  "never fires" bug — the turret blocked its own line-of-sight), 18 m range ring, and card rows for
  `TARGETS: GHOULS ONLY`, targets in range, belt/reload, `POWERED`/`NO SOURCE`/`NOT WIRED`, plus a
  blocked-line message. Lore unchanged: it never targets humans.
- **Building selection** is unambiguous: tapping a structure opens its card; contextual orders stay
  for units, ground, enemies and resources. `REPAIR`, `BUILD`, `ASSIGN` and `RELEASE` moved into the
  card.
- Gate: connect a turret to a source by dragging a wire, watch it traverse and fire on ghouls,
  leave it unpowered or fill its ports and read the reason; assign/release a tower gunner from the
  card. **Passed** (wire 5.4 m/3 scrap, status and cost shown before release; turret fired on the
  previously blind side after the self-LOS fix; a full-port node marks red and the card reads
  `PORTS 2/2`; tower `ASSIGN` mounted Mara and `RELEASE` returned her).
- Not yet: wire removal, workplace job slots (the card has the surface and the rows ready), needs,
  recipes, construction cancel/refund.

### Phase 4d — World scale and navigation — **implemented (first slice)**

- The playable disc is **180 m across** (radius 90); terrain 300 m; same seed. Camera far plane
  raised to 240 and the pan limit follows the play radius.
- Scatter density cut by roughly half (rocks 130→190 over a 2.7× larger disc, grass clusters
  130→210 with fewer blades each), spacing widened and the camp cleared to 14–18 m.
- Nav grid rebuilt around the play radius (185×185 cells), inflated footprints, soft clearance
  penalty, binary-heap A*, direct-line fast path, exact-target endings.
- Stuck detection: replan once, then fail with `NO PATH` and toast; unit status shows it.
- Unit separation and perfect-overlap handling.
- `PATHS` debug overlay (perf switch or `?paths=1`).
- Ghouls still attack only living things; raiders still attack infrastructure; player structures
  stay mud + scrap.
- Gate: a unit crosses the expanded camp and around a ruin cluster without sticking; no job runs
  forever without a `NO PATH` report; frame budget holds on the low preset. **Passed** (13 m move
  around a ruin completed with 0.59 m error and 3.09 m clearance; 60 m cross-map move 25 s; a
  warehouse placed directly on the route was routed around with 4.4 m clearance; an unreachable
  order failed after 0.4 s as `NO PATH`; validation ok; ~285–340 k triangles and 55–56 fps in the
  headless baseline).
- Chunk streaming is deliberately Phase 7.

### Phase 5 — Workplaces and economy

Detailed design: [ECONOMY.md](ECONOMY.md). Three slices:

- **5a — Free builder role + Scavenger Hut + assignment — implemented (first slice).**
  Job slots and work loops; a survivor set to builder answers the construction queue; the scavenger
  loops gather→haul in a 26 m radius. The random auto-assign on placement is gone. The building card
  has clickable slots; the unit card shows `HOME` and `MAKE BUILDER` / `RELEASE BUILDER` /
  `RELEASE POST`. Manual orders pause the loop and the worker returns when the order ends. Roles,
  home assignments and survivor positions are saved in schema v5.
  **Gate:** a builder finishes a freshly placed hut with no orders; two scavengers work distinct
  piles to storage cap and report `STORAGE FULL`; a manual move returns the worker to the hut
  afterwards; a reload restores the builder role and both slots. **Passed** (builder claimed on the
  first tick and completed; two slots picked distinct nodes; scrap 26→80 then `STORAGE FULL`;
  manual move resumed gathering after 70 frames; v5 save/reload restored REN as builder and SILAS on
  the hut; unreachable sites are skipped for 15 s instead of looping `NO PATH`).
- **5b — Well Wheel + Farm + needs — implemented (first slice).**
  One water-carrier slot (**+1 water / 4 s**) and two farmer slots (**+1 food / 7 s**, **1 water /
  20 s** each). The Rain Catcher remains the passive early source. At each dawn every living survivor
  consumes 1 water + 1 food; missing supplies apply a 20% speed penalty and two consecutive unfed
  dawns make them leave camp (removed from the roster, saved as left). The HUD gained a food chip and
  both water/food show `stored/cap`; a dawn line reports day, survivors and stores.
  **Gate:** staff the well and farm, watch water/food rise and the farm consume water; empty the
  water and see the farm report `NO WATER`; fill a store and see `STORAGE FULL`; run two dawns with
  no supplies and watch a survivor leave; reload and keep the assignments and needs. **Passed**
  (15 s staffing: water +3, food +2 after travel; farm stopped at 0 water with `NO WATER`; dawn
  10→7 water/food for 3 survivors; two unfed dawns left all three, hid them and freed the slots;
  v5 save/reload kept roles, homes, hunger/thirst and the left state; HUD reads `water/cap` and
  `food/cap`).
- **5c — Workshop + ammo + recruitment/roles.** Scrap→ammo/components recipes; the workshop is the
  **only** ammo source, and the armory displays the stock (no scrap purchase), weapon upgrades at the
  workshop, population growth and roles derived from workplaces.
- Gate: a camp of 5–6 survivors feeds itself and keeps the guns supplied for several days, with a
  reason to build and staff each workplace.

### Phase 6 — The game loop

- Relay objective, staged milestones, final assault, defeat conditions, save migration, onboarding.
- Gate: a new player can start, learn the loop, and either win or lose a run in 20–30 minutes.

### Phase 7 — Streaming, chunks and performance

- Split the world into streamed chunks (terrain, props, nav, actors) when the expanded single-mesh
  version is measurably at its limit; keep the deterministic seed and save compatibility.
- LOD/batching/occlusion work, device-tier calibration.
- Gate: the expanded map holds 30/60 fps on the target phone profile without a load hitch at chunk
  boundaries.

### Phase 8 — Art, realism and polish

- Apply [ART_DIRECTION.md](ART_DIRECTION.md) to the existing buildings (warehouse first), audio
  tails/occlusion, animation, materials, weather, wounds, UI polish, device performance.
- Gate: physical-device playtest at 30/60 fps with no control regressions and a coherent camp
  silhouette.

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

## 8. Decisions and open questions

Resolved in this pass:

1. **Water:** the **well wheel** — hand-cranked, no river needed. The Rain Catcher stays as the
   passive early source; a river/oasis wheel is a later map variant.
2. **Builders:** a **free builder role**, not a Builder's Yard. A builder auto-answers the construction
   queue and can be sent to a specific site; implemented in 5a, with no random auto-assign.
3. **Ammo:** **workshop only.** The armory scrap purchase is removed; the workshop recipe is the only
   source and the armory shows the stock. Running dry is a real failure state.
4. **Building interaction:** tapping a building opens its **card**; contextual orders stay for
   ground/enemies/resources. Settled and implemented in 4c.
5. **Turret arc:** **360°**, implemented in 4c. The invisible 220° arc was the main cause of the
   "not working" report; a limited arc may return only with a visible placement preview and rotate
   control.

Still open:

6. **Map size:** ~180 m or ~220 m across for the first expansion? Recommendation: 180–200 m, then
   measure; chunk streaming is Phase 7.
7. **Day length / upkeep:** one 6-minute cycle = one day, or two cycles? Recommendation: one cycle
   first; a 12-minute day is easier to survive but slower to learn.
8. **Stockpile:** one shared capacity for all resources, or per-resource caps? Recommendation: shared
   first; per-resource caps only if the warehouse becomes a real constraint.
9. **Work loops:** after a manual order, should a worker auto-return to its post, or wait for the
   player? Recommendation: auto-return; the player can `RELEASE` to make them free.
10. **Assignment UI:** tap slot → portrait, drag portrait → building, or both? Recommendation: tap
    first (reliable on phone); drag is a stretch.
11. **Confirmed rules:** the turret never targets humans; ghouls never attack buildings; raiders do.
    These are lore, not toggles.

---

## 9. Immediate next slice

Phases 1–5b are in. The next slice is **Phase 5c — Workshop, ammo and recruitment**:

1. **Workshop** with two artisan slots and recipes: pistol rounds, rifle rounds, shells, components.
2. **Workshop-only ammo:** remove the armory scrap purchase; guns draw from the workshop stock and
   can run dry. Weapon upgrades move to the workshop/armory card.
3. **Recruitment:** surplus food/water and a free house slot attract a survivor every 2–3 days, up to
   a population cap; roles follow the workplace.
4. **Morale** around raids and hunger, then **Phase 6** (the relay objective and a complete run).

The next visible milestone: **set a workshop recipe, watch scrap become rounds, and recruit a new
survivor because the camp has food to spare.**
