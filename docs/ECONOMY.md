# Workplaces, jobs and the settlement economy

**Status:** design for Phase 5 (not built yet). Numbers are provisional; we are still in the
testing phase, so costs, rates and even the job names will move.

This is the detailed design behind `docs/GAME_PLAN.md`. The short version: **assign a survivor to a
building, not to a task.** The building gives them a repeatable job. Manual orders still exist, but
they are overrides that end and return the worker to their post.

---

## 1. Why workplaces

The current command layer is good for a fight and bad for a camp. Sending a survivor to a scrap pile
and then to the warehouse every 30 seconds is admin, not a decision. The player should decide:

- which buildings exist,
- who works where,
- what the workshop is producing,
- when to pull someone off a job for a raid.

Everything else should run itself. The building is the unit of assignment, the job is the loop, and
manual orders are the exception.

This also makes the camp legible: a Scavenger Hut explains why scrap keeps arriving; a staffed Well
Wheel explains the water; an empty Workshop explains why ammo stopped.

### Guardrail: automation must not play the game for you

The counterweight is **upkeep and pressure**: food/water consumption, raids, power, storage limits and
the relay objective. If the player can assign everyone and walk away, the economy is too generous.
If they must reassign every ten seconds, the automation has failed. The test is: *one decision per
building, then watch it work.*

---

## 2. The job model

Each survivor gets:

- `home` — the workplace building they are assigned to, or `null` for a free unit.
- `role` — derived from the workplace: builder, scavenger, water carrier, farmer, artisan, gunner.
- `loop` — the workplace's repeating behavior (see below).
- `manual` — a temporary order. While a manual job is active, the loop pauses. When it finishes (or
  is cancelled), the unit returns to its post.
- `attention` — a reason the loop cannot run: `NO NODES`, `STORAGE FULL`, `NO WATER`, `NO POWER`,
  `NO PATH`. The building card shows this; the unit idles at the post instead of wandering.

A workplace has `slots`: usually 1–2. A slot is a role plus a worker. Output scales with staffed slots
(one farmer grows less than two). A worker can be released from the building card; the slot becomes
free. If a worker dies, the slot frees automatically.

### Assignment

- Tap a building → floating **building card** above it.
- Tap an empty slot → assign the nearest idle survivor (or tap a roster portrait).
- Tap an assigned slot → release.
- Dragging a roster portrait onto the building is a stretch goal; tap-to-assign ships first.
- The unit card shows `HOME: SCAVENGER HUT` and a `RELEASE` action.

### Manual overrides

- Move / attack / gather / build / repair orders pause the workplace loop.
- After the manual job ends, the unit returns to its home (or waits if the home is destroyed).
- A **guard** workplace is an exception: a guard on watch should engage hostiles and return to the
  post when the area is clear.

---

## 3. Workplaces

All costs are provisional and should be tuned against the 6-minute day.

### Builder's Yard — where builders belong

The missing piece from the current build flow. Instead of auto-assigning a random survivor to every
new site, the player assigns a **builder** to the Builder's Yard. The builder automatically walks to
the **construction queue** (oldest first, or a priority set by the player), builds it, and moves to
the next. No builder = sites wait. This is the answer to "where do builders go".

- Cost: 18 scrap; radius 2.2; mud-brick workshop with a scrap-timber frame.
- Slots: 2 builders.
- Loop: pick the nearest unbuilt site (or the oldest), path there, build at 1.0× speed; repeat.
- If no site: repair the most damaged built structure in the camp (toggle: **BUILD / REPAIR**).
- The player places sites anywhere in the camp; the builder handles the walking.

### Scavenger Hut — automated scrap

- Cost: 16 scrap; radius 2.0; a low mud hut with a scrap lean-to and a hauling cart.
- Slots: 2 scavengers.
- Work radius: 26 m around the hut.
- Loop: find the nearest active scrap node in radius → gather → haul to the nearest warehouse → repeat.
- Idle reasons: no active nodes in radius (`NO NODES`), storage full (`STORAGE FULL`), no path.
- The hut is a workplace, not an extra stockpile; scrap still goes to the warehouse.

### Well Wheel — water without a river

A water wheel needs flowing water. The map is a desert, so the coherent version is a **well wheel**:
a hand-cranked wheel over a dug well, built from mud brick, timber and a scavenged axle. If we later
add a river/oasis, a true water wheel can be a second variant.

- Cost: 20 scrap; radius 1.8; well, wheel, trough; mud and scrap.
- Slots: 1 water carrier.
- Loop: stand at the wheel and turn it; produces **1 water / 4 s** while staffed.
- The existing **Rain Catcher** stays as a passive, slower early source (no worker); the Well Wheel is
  the reliable staffed upgrade. This gives the player a choice instead of replacing a building.
- If the stockpile is full, the worker stops (`STORAGE FULL`).

### Farm — food

- Cost: 24 scrap; radius 3.0; a mud-brick plot with scrap irrigation channels and a small scarecrow.
- Slots: 2 farmers.
- Loop: tend the plot; produces **1 food / 7 s per farmer**.
- Consumes **1 water / 20 s** while working; no water = `NO WATER`, production stops.
- Food is stored in the warehouse; units eat from it (see needs).

### Workshop — ammo and components

- Cost: 26 scrap; radius 2.4; a mud-and-scrap shed with a workbench, press and tool wall.
- Slots: 2 artisans.
- The player selects a **recipe** in the building card:
  - pistol rounds: 4 scrap → 12 rounds, 8 s;
  - rifle rounds: 6 scrap → 6 rounds, 8 s;
  - shells: 5 scrap → 4 shells, 8 s;
  - components: 8 scrap → 1 component, 12 s.
- The artisan consumes scrap from the warehouse and adds to the matching stockpile. Ammo is drawn
  from the stockpile by the armory; the current "buy ammo with scrap" button becomes an emergency
  purchase at a bad rate, or is removed once the workshop is reliable.
- The same workshop hosts the **weapon upgrade** bench; the existing armory tracks move here so the
  player has one place for guns and one for production.

### Watchtower / turret

- **Watchtower:** 1 gunner slot; the existing man/release behavior becomes a workplace assignment.
- **Turret:** power-only (no worker) in v1. A technician slot can be added later for repairs/ammo.
- The turret's lore stays: it only sees non-humans; raiders are the gunner's problem.

### Warehouse / campfire / chapel

- No job slots. The warehouse is the shared stockpile and haul destination; the campfire and chapel
  are passive support. A future **Cook** or **Medic** could use them as workplaces.

---

## 4. Resources and the stockpile

| Resource | Source | Used by | Notes |
| --- | --- | --- | --- |
| **Scrap** | scavenging, kills, raids | buildings, workshop, wires, upgrades | universal currency |
| **Water** | Rain Catcher, Well Wheel | survivors, farm | one per survivor per day |
| **Food** | Farm | survivors | one per survivor per day |
| **Ammo** | Workshop | firearms | pistol rounds / rifle rounds / shells |
| **Components** | Workshop, ruins | solar, battery, relay | rare tech resource |

- The **warehouse** stores all resources; its capacity is shared or per-resource (design choice:
  shared cap for simplicity, with a per-resource soft cap later).
- Hauling still happens physically: a scavenger carries scrap to the warehouse; the workshop draws
  from the warehouse instantly when it is staffed (no worker hauling each round).
- HUD chips show scrap, water, food, ammo and the warehouse fill. A resource at zero turns red.

---

## 5. Needs, days and recruitment

- One **day** = one 6-minute day/night cycle for the prototype. A day counter and a short dawn report
  (`DAY 3 · 4 survivors · food 8 · water 6`).
- Each survivor consumes **1 food + 1 water per day** (or a continuous drain; a per-day tick is easier
  to read).
- If either is missing: speed −20% and a morale warning; after **2 consecutive days** the survivor
  leaves (walks off the map) unless fed. No instant death.
- Surplus food/water and a free house slot attract a new survivor at dawn every **2–3 days**, up to a
  population cap raised by houses.
- The player starts with **3 survivors** and enough stores for ~2 days; the first decisions are a
  Scavenger Hut and a well/farm.
- Recruitment is a reward for a working economy, not a random gift.

---

## 6. Roles and progression

Roles are **derived from the workplace**, not a class chosen at birth:

- builder: builds/repairs faster at a Builder's Yard;
- scavenger: gathers faster and has a larger carry;
- water carrier: Well Wheel output;
- farmer: Farm output;
- artisan: Workshop speed/recipe unlocks;
- gunner: Watchtower accuracy/range.

Reassigning a worker changes their role. This keeps the roster flexible and avoids a class UI. Later,
a survivor can gain a small **specialty** after working a role for several days.

The Workshop's recipe tiers and the existing weapon upgrades are the first progression axis. The
relay (Phase 6) is the campaign objective; components gate it.

---

## 7. Failure and attention states

Automation must be honest about why it stopped. Each workplace has a status shown on the building card:

| Status | Meaning | Player action |
| --- | --- | --- |
| `WORKING` | loop running | none |
| `NO WORKER` | slot empty | assign |
| `NO NODES` | scavenger radius has no active piles | wait/respawn or move the hut |
| `STORAGE FULL` | warehouse at cap | spend/build storage |
| `NO WATER` | farm has no water | assign a well/fix supply |
| `NO POWER` | turret/workshop unpowered | link a source |
| `NO PATH` | worker cannot reach the post/target | check the map, clear the route |
| `DAMAGED` | below 40% HP | repair |

A worker with no valid task waits at the post; it does not wander across the map. This is important:
the current wander behavior is what makes the camp feel random.

---

## 8. Starting loadout and first ten minutes

1. Start with **3 survivors**: a builder, a scavenger and a guard; 26 scrap, 4 water, 4 food.
2. Place a **Scavenger Hut** and assign the scavenger; scrap starts arriving automatically.
3. Place a **Builder's Yard** and assign the builder; it finishes the hut (and any other sites).
4. Build a **Well Wheel** and assign the third survivor (or rotate the guard); water stabilises.
5. Build a **Farm**; assign a farmer; food stabilises.
6. Build a **Workshop**; set rifle/pistol rounds; the ammo economy starts.
7. Day raids test the guard/watchtower; night ghouls test the turret and power.

The player's job is placement, staffing, recipes and defence — not walking every trip.

---

## 9. Numbers to start with (all provisional)

| Thing | Value |
| --- | --- |
| Builder's Yard | 18 scrap, 2 slots, build speed 1.0 |
| Scavenger Hut | 16 scrap, 2 slots, radius 26 m |
| Well Wheel | 20 scrap, 1 slot, 1 water / 4 s |
| Farm | 24 scrap, 2 slots, 1 food / 7 s per farmer, 1 water / 20 s |
| Workshop | 26 scrap, 2 slots, 8–12 s per recipe |
| Survivor upkeep | 1 food + 1 water / day |
| Hunger/leave | −20% speed; leaves after 2 unfed days |
| Warehouse | base 80, +120 per warehouse (existing) |
| Day | one 6-minute cycle |

---

## 10. Implementation notes

New modules:

- `src/workplaces.js` — workplace defs, slots, loops, attention states.
- `src/stockpile.js` — resources, caps, deposit/withdraw, HUD.
- `src/needs.js` — daily consumption, morale, recruitment.
- `src/buildingcard.js` — floating building card, job slots, action buttons.
- `src/wire.js` — manual link mode, ports, drag line, power overlay.

Changes:

- `CampFolk` units gain `home`, `role`, `loop`, `manual`, `attention`; the existing jobs become the
  loops' primitives (move/gather/haul/build/repair/man).
- `Settlement` buildings gain `jobs`, `workers`, `attention`, `recipe`; the construction queue.
- `Settlement.place` no longer auto-assigns; a Builder's Yard builder picks up the site.
- `Armory` ammo purchases draw from the workshop stockpile; the workshop recipe is the primary source.
- Save schema: workplaces, assignments, resources, needs, recipe, day counter; migrate v4 → v5.
- The **building card** replaces building contextual orders for assignment/repair/man/wire; unit
  orders remain for move/attack/gather.

---

## 11. Open decisions

1. **Water wheel vs well wheel:** adopt the well wheel (no river needed) or add a river/oasis and a
   true water wheel.
2. **Builder's Yard vs a builder role on any site:** the yard is proposed; a free builder role is the
   alternative.
3. **Ammo:** workshop production replaces armory purchases, or both coexist with a worse manual rate.
4. **Stockpile:** one shared capacity or per-resource caps.
5. **Day length:** one 6-minute cycle as a day, or two cycles (12 minutes).
6. **Assignment UI:** tap-slot then portrait, drag portrait, or both.
