# Firearms: bullets, weapons, auto-aim and impact effects

- **Status:** phase 1 implemented; phase 2 first slice implemented (single-shot pipe rifle,
  two-handed arm IK, part-tagged skinning, one auto-firing camp guard). Hostile raiders, camp/player
  damage and the ammo economy remain.
- **Date:** 2026-10-28
- **Question:** If Ashfall adds firearms, what is the best way to implement hit resolution, bullets,
  weapons, auto-aim and the firing→flight→impact effects on a mobile-first, procedural,
  orthographic top-down Three.js game?
- **Scope:** the combat runtime and its presentation. Not: netcode (there is none), gun economy,
  enemy ranged AI design, or authored art. Every number below is a **starting value** for the
  config table, not a tuned result — none of it has been measured on a phone yet.

---

## Locked decisions

- **Auto-aim is shared infrastructure.** The player, camp folk, ghouls and future raiders all use the
  same `AimController`; faction, cone, reaction and `firePolicy` are data. The AI can aim and fire on
  its own; the player-controlled character aims automatically but fires only on input.
- **Two-handed weapons use arm IK.** The right arm anchors the grip and orients the gun along the aim
  vector; the left arm solves to the foregrip. Pistols stay one-handed.
- **Phase 1 ammo is magazine + infinite reserve.** No economy, no save migration. Phase 2 adds a
  per-caliber scrap-purchased reserve under save `v: 2`.
- **No free-aim stick in phase 1.** Tap a target to lock it; the drag gesture stays camera pan.

---

## TL;DR

1. **Resolve hits by hitscan, always.** Cast one ray per pellet at fire time and test it against
   analytic capsules, not against the ghoul `InstancedMesh` triangles. It is O(active ghouls),
   has no travel time and cannot tunnel. Damage lands on the tick the player pressed fire.
2. **Draw a bullet that travels.** Render a short additive streak that leaves the muzzle and
   arrives at the pre-computed impact point in `min(0.10 s, dist / 140 m/s)`. Impact FX spawn on
   arrival. This gives the readable "flight" the user asked for without making hit registration
   depend on projectile speed. The two are decoupled on purpose: gameplay is instant, the picture
   is not.
3. **Keep real projectiles for slow things only** (grenades, spitters, arrows) in phase 2, and
   move them with **swept segment tests**, so step size never decides whether a hit happens.
4. **Auto-aim is a targeting module, not a weapon feature.** Score targets by cone angle + distance
   + line of sight, keep the current target until another beats it by 20 %, slew the yaw at a capped
   rate, and only fire when the muzzle is within ~4° of the aim point. AI pulls the trigger itself;
   the player's character aims automatically but fires only on input. The player keeps facing the
   aim target while strafing, which `player.js` does not do today. The controller is actor-agnostic:
   the player, camp folk and future raiders use the same `AimController` with different fire
   policies, cones and factions.
5. **Two-handed weapons use arm IK.** The right arm solves to the grip and orients the gun along the
   aim vector; the left arm solves to the foregrip socket. Reuse the same two-bone law-of-cosines
   solve as the existing foot IK, not an IK library.
6. **Effects are 80 % of the perceived quality and ~6 draw calls.** One instanced tracer batch, one
   instanced billboard batch for flash+smoke, one `Points` batch with a *per-point size attribute*,
   one instanced decal batch, one pooled `PointLight` that is always in the scene at intensity 0.
   All additive FX use `depthWrite: false`, `toneMapped: false`, and `depthTest: true`.
7. **The existing particle system cannot carry this as-is.** `PointsMaterial.size = 0.2` under an
   **orthographic** camera produces `gl_PointSize = 0.2 × pixelRatio` — effectively one framebuffer
   pixel — because `sizeAttenuation` only applies to perspective matrices
   (`points.glsl.js:33-40`, `WebGLMaterials.js:303-308`). `src/particles.js:67-77` is a dust-mote
   system, not an impact system. Firearms needs its own point material with per-particle size.

---

## 1. Hit resolution model

### 1.1 The three models

| Model | What resolves the hit | Latency to damage | Top-down readability | Tunneling | Cost |
| --- | --- | --- | --- | --- | --- |
| **Hitscan** | Ray query at fire time | 0 ms (same tick) | Needs an artificial tracer or the shot is invisible | None | O(targets) |
| **Projectile** | A moving entity, tested each step | `dist / speed` (0.2–0.7 s here) | Excellent — the bullet *is* the effect | High unless swept | O(bullets × targets) per step |
| **Hybrid** | Hitscan resolves, a visual travels | 0 ms gameplay, 50–150 ms picture | Excellent | None | Hitscan + FX |

Hitscan is the standard "instant hit" query: a ray is intersected with the world and the closest
hit wins (Godot's `intersect_ray` returns `position`, `normal`, `collider` for the first hit [17];
PhysX exposes the same as a scene raycast [16]). Projectiles are rigid bodies that need continuous
collision detection precisely because a fast body can pass through geometry between steps — PhysX
calls the failure "tunnelling" and only enables CCD above a per-shape velocity threshold [16].

### 1.2 Latency math for this game

The whole play area is ~100 m across and the tower already engages at 13 m (`settlement.js:794`).
At a realistic engagement range of 8–20 m:

| Speed | 8 m | 12 m | 20 m | Frames at 60 fps (12 m) |
| --- | --- | --- | --- | --- |
| 45 m/s (slow round) | 178 ms | 267 ms | 444 ms | 16 |
| 90 m/s | 89 ms | 133 ms | 222 ms | 8 |
| 140 m/s (tracer visual) | 57 ms | 86 ms | 143 ms | 5 |
| Hitscan | 0 | 0 | 0 | 0 |

A 267 ms delay before the enemy reacts is a *design* choice (it is what makes projectile weapons
feel heavy). For a wasteland shooter where the player presses one button and expects the ghoul to
react, **0 ms plus a ≤100 ms streak is the better trade**. **Judgement.**

### 1.3 Tunneling math

Per-frame point tests fail at these speeds. With `dt` clamped at 50 ms (`main.js:855`):

| Speed | Distance per 16.7 ms | Distance per 50 ms | Ghoul capsule radius |
| --- | --- | --- | --- |
| 45 m/s | 0.75 m | 2.25 m | 0.32 m |
| 90 m/s | 1.50 m | 4.50 m | 0.32 m |
| 140 m/s | 2.34 m | 7.00 m | 0.32 m |

Every row moves further than the target is wide. A point-in-sphere test per frame misses most
shots. There are only two honest fixes: **sweep the segment** (test the whole path) or **substep**
until each step is smaller than the target. Sweeping is strictly better — it is speed-independent
and costs the same per frame.

### 1.4 Swept collision

`THREE.Ray.distanceSqToSegment(v0, v1, pointOnRay, pointOnSegment)` returns the squared distance
between a ray and a line segment, and optionally the closest points (`Ray.js:180-235`, implemented
from Geometric Tools' `GteDistRaySegment`) [5]. A capsule is exactly "segment + radius" ([11]), so:

```
d2 = ray.distanceSqToSegment(capsule.start, capsule.end, _pRay, _pSeg)
hit = d2 <= radius * radius && _pRay.distanceTo(ray.origin) <= range
```

Two traps, both real:

- `distanceSqToSegment` treats the ray as **infinite**. Without the `pointOnRay` distance check you
  will hit targets behind the shooter.
- It gives you a **distance**, not an entry point. For the impact position, project
  `pSeg - pRay` onto the ray, or simply use `pSeg` (close enough at 0.3 m radii) [22].

For a *moving* bullet, the same call is the sweep: keep the previous position, pass
`prev → next` as the segment. Cost is constant per bullet per frame, and no amount of speed can
tunnel it. This is the cheap version of what PhysX calls conservative advancement [16].

`THREE.Ray` also has `intersectSphere` (`Ray.js:307`), `intersectBox` (`Ray.js:449`) and
`intersectsSphere` (`Ray.js:345`). A sphere test is cheaper but wrong for a 1.4 m tall ghoul: aim
at the chest and a sphere of radius 0.5 misses the head and the knees. Use one capsule per
character.

**Do not raycast the ghoul `InstancedMesh`.** `InstancedMesh.raycast` iterates every instance and
runs a full triangle mesh raycast per instance (`InstancedMesh.js:258-305`); it returns a triangle
hit and an `instanceId`. The ghoul geometry is 20 merged boxes ≈ 240 triangles
(`src/enemies.js:10-38`), so one shot against 22 active ghouls is ~5,300 triangle tests, and it
*still* gives a worse answer than a capsule (bullets slip between ribs). The analytic test is
~60 flops × 22.

### 1.5 Fixed timestep and substepping

The game runs one variable-`dt` step per frame, clamped to 50 ms (`main.js:855`), and existing
cooldowns decrement by `dt` (`enemies.js:137`, `player.js:66`). That is fine for hitscan: a timer,
not a position, decides the fire rate.

Rules for firearms:

1. **Fire rate is an absolute time stamp**, not a countdown: `if (time < nextFireAt) return;
   nextFireAt = time + 60 / rpm;`. It survives `dt` clamping and dropped frames.
2. **Hitscan needs no substep.** It is a query, not an integration.
3. **Projectiles need a sweep, not a substep.** If you also integrate gravity (grenades), substep
   only for the *curve*: `steps = clamp(ceil(dt / (1/60)), 1, 4)`, each step sweeping its own
   segment and advancing velocity with semi-implicit Euler [13].
4. A fully fixed simulation step is the textbook solution to "behaviour depends on frame rate"
   (Gaffer On Games' accumulator loop [12]), but retrofitting it to `simulate(dt)` would change the
   feel of every existing system. **Judgement:** keep the current loop and make the weapon layer
   time-stamp based; adopt the accumulator only if phase 2 projectiles start behaving differently
   at 30 fps.

### 1.6 Recommendation

**Hitscan-authoritative, travelling tracer.** One ray per pellet at fire time → analytic capsule
tests against the ghoul pool → optional 2.5D blockers → damage applied immediately through the
existing `Enemies.damage(index, amount, fromX, fromZ)` (`enemies.js:230`). The tracer and impact
FX are a *presentation* of a hit that is already resolved.

Phase 2 adds a genuine projectile path for slow ordnance only. Both paths share the same impact
and damage dispatch, so the weapon table just gets a `ballistic: 'hitscan' | 'projectile'` field.

---

## 2. Bullet representation

### 2.1 Options

| Representation | Draw calls | Per-shot alloc | Ortho readability | Notes |
| --- | --- | --- | --- | --- |
| Pooled `Mesh` per bullet | 1 per bullet | none if pooled | Good | What the tower does today (10 boxes, `settlement.js:451-468`) |
| `InstancedMesh` of a stretched box/quad | **1 total** | none | Good | Best cost/quality ratio; per-instance colour = fade |
| `Points` | 1 total | none | Poor | 1 px unless you write a shader; square, unrotated, clipped when centre leaves screen |
| `Line2` / `LineSegments2` | 1 total | some | Good, screen-space width | `LineMaterial` width in CSS px or world units (`LineMaterial.js:502-543`); overkill for one segment |
| Shader quad / billboard batch | 1 total | none | Best | Camera-facing, per-instance size/rotation/alpha; needed for flash + smoke anyway |
| `DecalGeometry` | 1 per decal | **yes** (clips triangles on CPU) | N/A (surface marks) | Needs a `Mesh`, not an `InstancedMesh`; new geometry per hit |

The `InstancedMesh`, `Points`, `Line2` and `Raycaster` behaviours in that table are read from the
installed three.js sources [1][3][4][10], not from documentation claims.

### 2.2 Making a tracer readable through a 40° ortho camera

The camera is fixed-pitch (40°), orthographic, `halfHeight` 11 (landscape) to 22 m, zoom 0.8–2.2×
(`main.js:50-107`). Screen scale therefore:

| View | px per metre (zoom 1) | 1.75 m human | 12 m shot |
| --- | --- | --- | --- |
| Phone landscape, 844×390 | 17.7 | 31 px | 212 px |
| Phone portrait, 390×844 | 22.9 | 40 px | 275 px |
| Phone landscape, zoom 1.7 | 30.1 | 53 px | 361 px |
| Desktop 1920×1080 | 49.1 | 86 px | 589 px |

Consequences:

- A 12 m shot spans **half the screen height**. The streak is long enough to read, so it does not
  need to be thick — but at 0.035 m (the tower's current tracer, `settlement.js:453`) it is
  **0.6 px** on a phone. It only reads because additive blending smears a 1 px line. **Use 0.10–0.14 m
  width** (1.8–2.5 px phone, 5–7 px desktop) and a brighter head.
- The 40° pitch compresses the vertical axis by `sin(40°) = 0.64` on the ground plane, so a tracer
  fired "up-screen" covers fewer pixels on the ground than the same length sideways. Do not tune
  tracer length in pixels; tune it in metres.
- Because the camera is ortho, **world size is screen size** — there is no perspective foreshortening
  to exploit. A tracer that is 0.12 m wide is 2 px at every distance. That is the correct behaviour
  here, and it is why `Points`' lack of attenuation (see §2.1) is not a bug in ortho.

The look that reads best at this angle **Judgement:** a short bright *head* (a 0.18 m sprite for
30 ms) plus a long thin *tail* (the instanced quad, fading from 0.9 to 0 over 75 ms). The head sells
the direction, the tail sells the speed. A pure full-length streak spawned at once (the current
tower tracer, 0.11 s, `settlement.js:713-716`) reads as a laser, not a bullet.

### 2.3 No per-shot allocations

The hot path must never construct objects. Concrete traps in the current codebase to avoid copying:

- `settlement.fireTracer()` allocates two `Vector3`s per shot (`settlement.js:799-800`).
- `particles.burst()` allocates a `THREE.Color` per call (`particles.js:94`) and uses
  `Math.random()` (breaks seeded determinism).
- `Enemies.spawn()` uses `pool.find()` (`enemies.js:86`) — fine at spawn rates, wrong per bullet.

Pattern: fixed-size ring buffers of plain numbers, a free-list cursor, and preallocated
`Vector3`/`Color` scratch objects at module scope. `Object3D` and `Matrix4` can be reused across all
instances. This is the Object Pool pattern applied to FX slots — allocate once, fully reinitialise on
reuse, never rely on the previous state [14].

### 2.4 Target volumes and the two collision worlds

| Volume | Where | Test |
| --- | --- | --- |
| Ghoul | `(e.x, e.y + 0.35·scale, e.z)` → `(e.x, e.y + 1.35·scale, e.z)`, r = 0.32·scale | ray vs segment |
| Player (for future enemy fire) | `(x, y + 0.4, z)` → `(x, y + 1.55, z)`, r = 0.38 | ray vs segment |
| Buildings | circle `(x, z, radius)` from `settlement.buildings` | 2D ray vs circle, plus a per-type height |
| Wreckage/rocks | circle `(x, z, r)` from `wasteland.obstacles` (`props.js:389-550`) | 2D ray vs circle |
| Terrain | height field | sample every 1.0 m along the ray, `y <= heightAt(x,z)` → stop |

Buildings currently store only `radius` (`settlement.js:282-323`, `:589`) — no height. Add a
`bulletHeight` per type (barricade 1.0, campfire 0, catcher 1.8, house 3.0, tower 6.0, chapel 5.0) so
the ray is blocked only when it passes below that height at the impact distance. Without it the
player cannot shoot over their own barricade, which reads as a bug at a 40° camera.

Terrain blocking: a 20 m ray with 1 m samples is 20 `heightAt` calls (bilinear lookup,
`terrain.js:14`). Only do it if the ray's far end is above the ground by less than ~2 m, otherwise
skip. **Judgement.**

---

## 3. Weapon system

### 3.1 Data-driven definitions

Use a Type Object: one `WEAPONS` table of plain data, instances reference it [15]. This is how the
wardrobe already works (`ITEMS[slot][id]` in `wardrobe.js:41-472`), so the pattern is familiar.

```js
// src/weapons.js — starting values, not tuned
pistol:  { name:'Scrap pistol', damage:18, rpm:360, pellets:1, spread:1.3, range:22,
           visualSpeed:140, ammo:12, reload:1.30, recoil:1.5, shake:0.05,
           mode:'semi',  socketJitter:0.02 }
rifle:   { name:'Pipe rifle',   damage:60, rpm:50,  pellets:1, spread:0.3, range:35,
           visualSpeed:150, ammo:30, reload:1.90, recoil:1.0, shake:0.04,
           mode:'auto',  bloom:0.45, bloomMax:4.0, bloomDecay:6 }
shotgun: { name:'Sawn-off',     damage:9,  rpm:75,  pellets:6, spread:9.0, range:11,
           visualSpeed:110, ammo:6,  reload:2.20, recoil:5.0, shake:0.18,
           mode:'pump',  shellReload:0.35 }
```

Balance against the existing numbers: ghoul HP 46 (`enemies.js:94`), melee 34 per swing
(`main.js:389`), tower 22 per 1.15–1.5 s (`settlement.js:796-798`). Pistol = 3 shots, rifle = 4,
shotgun = 54 damage if all six pellets land.

Spread model: pick a random direction inside a cone with `sqrt(u)` radial distribution (uniform in
area, not clustered at the centre). Seed it from the world RNG (`src/rng.js`) so a replay with the
same seed and the same inputs produces the same shot pattern.

### 3.2 Procedural geometry and the muzzle socket

Weapons are wardrobe gear: `ITEMS.weapon[id].build(spec)` returns `[{ bone, geometry }]`
(`wardrobe.js:287-317`), and `skinned.js` attaches it with `boneFor(part.bone).add(mesh)`
(`skinned.js:416-435`). Today `blade` hangs down the hand bone's −Y axis.

Keep that convention: **author the gun along −Y in hand space**, grip at y≈0, muzzle at y≈−0.42.
The arm IK orients the hand so that −Y points at the aim target (§4.8), so no socket rotation is
needed and `muzzleWorldPosition` becomes one `localToWorld` on a child `Object3D`.

```
firearm body:  leather grip 0.03×0.10, metal receiver 0.055×0.20, barrel 0.022 dia × 0.26,
               wooden stock, a sight blade, a magazine box — 8–14 primitives, ~200 tris
muzzle socket: Object3D at (0, -0.42, 0.02) in the hand bone, named 'muzzle'
```

Add two things to the rig (`skinned.js`, integration point, not a rewrite):
`rig.weaponSlot` (the equipped weapon's item id) and `rig.muzzle` (the `Object3D`). Reuse
`rig.equip('weapon', id)`, which already rebuilds gear and calls `onEquipmentChanged`.

Materials: reuse the character atlas's `metal` and `leather` regions
(`textures.js:166-259`) via `setRegionUV`, exactly as `buildGearItem` does. Zero new textures.

### 3.3 Recoil, reload and switching

The player rig has no animation clips — every pose is written per frame in `player.update`
(`player.js:100-150`). So weapon animation is an **additive layer applied after the walk pose**,
inside a firearm-equipped branch:

| Channel | Hold pose | Recoil kick | Recovery |
| --- | --- | --- | --- |
| `upperArmR.rotation.x` | −1.35 (arm forward) | −0.35 rad in 45 ms | 0.18 s, exp |
| `forearmR.rotation.x` | −0.30 | +0.12 rad | 0.22 s |
| `upperArmL.rotation.x/z` | −1.05 / +0.42 (support hand) | — | 0.15 s |
| `chest.rotation.y` | −0.18 (bladed stance) | +0.05 | 0.20 s |
| `head.rotation.x` | 0.05 | −0.06 | 0.25 s |

Reload: the left hand releases the foregrip and blends to a hip/mag pose at `t=0`, returns at
`0.55·reload`, and is back on the grip at `t=reload`. The right arm holds or lowers the gun. The
hand does not need to touch the magazine — at 31 px per character that is invisible. **Judgement.**

Switching: 0.35 s holster (weapon lowers out of frame), swap, 0.25 s draw. Fire is locked during
both. Cancel a reload on switch and keep the partially filled magazine (or reset it — decide, see
open questions).

### 3.4 Hit registration order (per pellet, deterministic)

1. Build the ray from the **muzzle world position** toward the aim point, with spread applied.
   Origin at the muzzle, not the character centre — otherwise you shoot through your own cover.
2. Clip the ray against static blockers. Keep `tStatic` (distance) and the blocking surface type.
3. Test every active ghoul capsule (§2.4). Keep the smallest `t`, tie-broken by pool index so the
   result is deterministic.
4. If `tEnemy < tStatic`: apply `Enemies.damage(index, damage, originX, originZ)`; record
   `{ index, point, normal, killed }`.
   Else if `tStatic < range`: record a surface impact with the blocker's material tag.
   Else: record a "no hit" endpoint at `range`.
5. Emit the tracer and queue the impact FX with `arriveAt = tNow + min(0.10, dist / visualSpeed)`.
6. Player-fired only: HUD hit marker + damage number.
7. Apply recoil, shake, muzzle flash, casing, and ammo decrement — after the hit is resolved, so a
   dry-fire never plays a flash.

`Enemies.damage` currently always applies knockback 5.5 (`enemies.js:238-239`). A shotgun's six
pellets would fling the ghoul. Add an optional `knock` multiplier (default 1) and pass `0.35` for
bullets.

### 3.5 Ammo, reserve and save policy

**Phase 1: magazine ammo + infinite reserve.** Every weapon has a magazine and a reload time, but the
reserve never runs out. The reload is the cost; there is no economy and no save migration. This lets
us tune whether the gun feels good before adding scarcity, and keeps the current save format intact.

**Phase 2: per-caliber reserve, crafted from scrap.** A global reserve per caliber (light / heavy /
shell) bought or crafted at the campfire (`2 scrap → 12 rounds`), with magazines reloading from it.
Save the reserve under `v: 2`. `readSave()` accepts both v1 and v2: a v1 save gets full magazines and a
starting reserve, so old runs continue without a reset. Bump `v` only when the shape actually changes.

**Why not per-weapon reserve in phase 1:** it multiplies the save schema and the HUD before the weapon
balance exists. One reserve per caliber is enough variety for a prototype and survives weapon
switching.

---

## 4. Auto-aim / targeting

### 4.1 Actors, factions and the target registry

Auto-aim is a shared combat service, not a player perk. Every armed actor — the player, camp folk,
future raiders, ghouls with guns — gets the same `AimController` and differs only in data:

| Field | Player | Camp folk | Raider / armed ghoul |
| --- | --- | --- | --- |
| `firePolicy` | `manual` | `auto` | `auto` |
| Faction | `player` | `camp` | `hostile` |
| Cone half-angle | 55° | 70° | 70° |
| Turn rate | 540°/s | 360°/s | 270–360°/s |
| Reaction delay | 0 | 0.15–0.35 s | 0.2–0.5 s |
| Spread multiplier | 1.0 | 1.2 | 1.4 |

A `TargetRegistry` aggregates targets so the controller never knows whether a target is an instanced
ghoul, a skinned NPC or the player:

```js
registry.forEach((target) => {
  // target: { id, faction, x, y, z, vx, vz, hp, maxHp, radius, height, ref }
});
```

Implementations:
- `Enemies` (instanced pool) exposes a bulk iterator over active slots — no per-ghoul objects.
- `CampFolk` and future raiders expose one target per rig.
- The player exposes one target.
- A faction matrix (`canAttack(a, b)`) replaces hard-coded "ghouls only"; friendly fire is off by
  default and configurable per faction pair.

This is the part that makes the later battle work: adding a raider faction is a data row, not a
second aiming implementation. **Judgement.**

### 4.2 Scoring

Two-stage: **filter**, then **score**.

```
filter:  active && dist <= weapon.range + 2 && |angleTo| <= coneHalf
         && hasLineOfSight(shooter, target) && target.faction !== shooter.faction

score = 0.55 * (1 - |angleTo| / coneHalf)      // angle dominates
      + 0.30 * (1 - dist / range)              // closer is better
      + 0.15 * (1 - target.hp / target.maxHp)  // finish wounded targets
```

| Parameter | Player | Armed AI / tower | Why |
| --- | --- | --- | --- |
| Cone half-angle | 55° | 70° | Player must feel in control; AI needs to be less fussy |
| Range | weapon range | weapon range | Never shoot past the damage falloff |
| Retarget hysteresis | +20 % score to switch | +20 % | Stops flicker between two equidistant ghouls |
| Retarget cooldown | 0.25 s | 0.25 s | Same |
| Max turn rate | 540 °/s | 360 °/s | A human snap, not a turret |
| Fire gate | `abs(aimError) < 4°` | `abs(aimError) < 3°` | The muzzle must actually point at the target before the shot |
| Lead prediction | yes, for projectiles only | yes | Hitscan needs no lead |

Smoothing: exponential toward the target yaw with `heading += shortestArc * (1 - exp(-λ·dt))`,
which `player.js:95-98` already does at λ = 14. For aiming use **λ = 18** and clamp the per-frame
delta to `maxTurnRate · dt` so a 180° flip takes ~0.33 s instead of one frame.

Lead prediction (phase 2 only): solve for intercept time `t` in
`|P_target + V_target·t − P_muzzle| = v_bullet·t`. That is a quadratic in `t`
(`a = |V|² − v²`, `b = 2·P·V`, `c = |P|²`), take the smaller positive root, clamp to 1.5 s, and
aim at `P + V·t`. If there is no positive root the target cannot be intercepted — do not fire.

### 4.3 Who aims, who fires

| Actor | Aims | Fires |
| --- | --- | --- |
| Player-controlled character | automatically | **only on the FIRE input** |
| Armed camp folk (future) | automatically | automatically when the gate is satisfied |
| Hostile raider / armed ghoul (future) | automatically | automatically when the gate is satisfied |
| Watchtower (exists) | `enemies.nearest` — no cone, no LOS | automatically, 1.15–1.5 s |

All of them run the same `AimController`; only `firePolicy`, faction, cone and reaction delay differ.
The distinction matters for feel: the player must be able to hold fire, bait a ghoul around a corner,
and choose the moment. If the player's character also auto-fired, the fire button would become a
cooldown meter, not a decision. **Judgement.**

### 4.4 Player facing vs movement

Today `player.targetHeading = atan2(nx, nz)` from the movement vector (`player.js:85`), so the
character always faces where they walk. With a gun that means you cannot back away while shooting.

Recommendation: when a firearm is equipped and a target is acquired, `targetHeading` comes from the
**aim yaw**, movement stays independent (strafe), and movement speed drops to 0.85× while firing.
When no target is in the cone, fall back to movement facing. This is a ~15-line change in
`player.update` plus an `aimHeading` argument. **Judgement.**

### 4.5 Can the player override the auto-aim?

The touch layout has one stick and buttons (`index.html` HUD, `input.js:52-106`); the world drag is
taken by camera pan and building placement (`input.js:184-197`). There is no second stick, so a
free-aim stick would mean a new HUD element and a new gesture conflict.

**Recommendation: no free aim in phase 1.** Instead:

- Auto-aim is *sticky but not magnetic*: it never bends a bullet, it only turns the character. The
  ray is cast along the character's actual facing, so spread and cover still matter.
- If the player taps a ghoul directly (a tap that is not a drag and not a placement), lock that
  ghoul as the preferred target for 1.5 s, even if it is behind a closer one. This is the "manual
  override" and it costs one raycast against 22 capsules.
- Add a visible aim cone on the ground (a thin ring/arc decal, 0.5 s after the last shot) so the
  auto-aim is legible rather than mysterious. **Judgement.**

### 4.6 Friendly fire and LOS

- Factions: `player`, `camp`, `hostile` (ghouls today, raiders later). Auto-aim filters through
  `canAttack(shooter.faction, target.faction)`, not through "is it a ghoul".
- Phase 1 keeps friendly fire off. Bullets do **not** collide with camp folk yet (they would need
  capsules and a reaction system). If the player shoots through one, nothing happens. When friendly
  NPCs join the battle, they get the same capsule and the faction matrix decides whether a hit is
  applied.
- LOS uses the same blockers as the ray (§3.4), at chest height (1.2 m). A ghoul behind a house is
  not targetable; a ghoul behind a barricade is.
- Own buildings never block the player's *aim*, only the *ray* if the height test fails (§2.4).

### 4.7 Fairness

Single-player PvE, so "fair" means: the aim assist must not (a) shoot through walls, (b) acquire
targets outside the weapon's range, (c) hit anything the player cannot see, or (d) fire without the
player pressing the button. All four are enforced by the filter above. Against ghouls (melee only,
1.35–1.95 m/s, `enemies.js:95`) a 55° cone is generous but not degenerate.

### 4.8 Two-handed weapon arm IK

The rig is shoulder → upper arm → forearm → hand, with the weapon parented to `handR` and authored
along the hand's −Y (`wardrobe.js:287-317`). The existing foot IK (`skinned.js`, `plantFeet`) already
does a two-bone law-of-cosines solve, so reuse that approach rather than adding an IK library.

**Right arm (weapon anchor).**
- Choose a right-hand target from the shoulder:
  `hand = shoulder + aimDir * hold.forward + right * hold.right − up * hold.up`.
  `hold` is per weapon: pistol 0.30 / 0.06 / 0.04, rifle 0.38 / 0.08 / 0.06, sawn-off 0.32 / 0.07 /
  0.05 (forward / right / up, metres).
- Solve shoulder→hand with the two-bone solve (L1 upper arm, L2 forearm), clamping reach.
- Orient the hand so the weapon's local −Y points along `aimDir`: build a world basis whose **Y axis
  is −aimDir** (because the gun is authored down the hand's −Y) and whose Z axis is a world-up hint,
  convert it to a quaternion, then convert to the hand bone's local space.
- Elbow pole: down and slightly out, `(±0.6, −1, −0.2)` in character space.

**Left arm (support hand).**
- The weapon carries a `foregrip` `Object3D` at `(0, −0.24, 0.02)` in hand space (rifle; sawn-off
  `(0, −0.16, 0.02)`; pistols have none).
- Feed its world position into the left-arm two-bone solve; pole down/out. The left hand does not
  need an aim orientation, only a grip.

**Blending and states.**
- `aimWeight` 0..1, damped at 12/s. 0 = locomotion arms, 1 = both hands on the gun. Blend by slerp
  after the normal walk pose so weapon draw, melee and unarmed states stay untouched.
- Reload: the left hand leaves the foregrip and blends to a hip/mag pose; the right arm holds or
  lowers the gun. No hand-to-mag contact is required at gameplay zoom.
- Recoil: kick the aim yaw/pitch by the recoil curve so the IK follows. Do not animate the arm
  independently of the aim.
- Fire gate: after the IK, measure the actual muzzle→target angle; if it is worse than 4° (player) /
  3° (AI), do not fire. This makes the gate honest even when the arm is reach-clamped.

**Cost.** Two solves per armed character per frame: ~20 trig ops each. Twenty-two armed ghouls is 44
solves — less than the existing per-frame foot IK already pays for the camp. **Judgement.**

---

## 5. Effects pipeline

The priority. Broken down per stage, with starting numbers.

### 5.1 Muzzle flash

| Property | Value |
| --- | --- |
| Representation | 2 camera-facing quads (core + petals), pooled `Sprite` (phase 1) or billboard instance |
| Size | core 0.22 m, petals 0.55 m (random 0.45–0.65) |
| Life | core 0.030 s, petals 0.055 s |
| Fade | `alpha = (1 - t/life)^2`, no fade-in (full brightness on frame 1) |
| Colour | core `#fff4d6`, petals `#ffb95e` |
| Blend | `AdditiveBlending`, `depthWrite:false`, `depthTest:true`, `toneMapped:false` |
| Rotation | random 0–2π, and a 1.4× stretch along the barrel axis |
| Jitter | ±0.02 m along the aim direction per shot (different frames) |

`SpriteMaterial` scales its quad by the object's model matrix and, when `sizeAttenuation` is
disabled, multiplies by view depth only for a perspective matrix (`sprite.glsl.js:20-32`). So a
sprite of world size 0.55 m is exactly 0.55 m in this ortho view — 10 px on a phone, 27 px on
desktop. That is the right size; anything under 0.35 m disappears into a single pixel.

Sprite rotation is supported (`SpriteMaterial.rotation`) [2], so one material serves every flash.
`toneMapped: false` makes the renderer skip Neutral tone mapping for that material
(`Material.js:458`) [9], which is why the flash stays hot instead of being compressed with the sand.

### 5.2 Muzzle smoke and heat shimmer

- 2–3 puffs per shot, size 0.35 m growing to 0.9 m over life, life 0.55–0.85 s.
- `alpha = 0.22 * (1 - t/life)^1.5`, `NormalBlending`, `toneMapped: true` so smoke sits in the
  scene's colour range instead of glowing.
- Velocity: 0.45 m/s forward + 0.25 m/s up, drag `exp(-3·dt)`; no gravity (it is hot air).
- Colour `#c9bda8`, tinted 10 % toward the ground colour so it does not read as a white blob.
- Cap: 24 live puffs. Beyond that, recycle the oldest — smoke is the first thing to become visual
  noise.
- **Heat shimmer: skip.** It needs a refraction/distortion pass and there is no post-processing
  pipeline (`main.js:24-38`, single pass + shadow pass). Note it as a later option.

### 5.3 Shell casings

- 1 per shot, pooled 48-instance `InstancedMesh`, box 0.03 × 0.03 × 0.055 m, brass `#c8a24a`.
- Eject at 1.8 m/s sideways + 1.2 m/s up, gravity −9.8 m/s², one bounce (restitution 0.35, spin
  decay), rest on the ground, life 2.5 s then hide.
- At 0.03 m the casing is **0.5 px** on a phone. It is a detail for zoom and desktop, not a
  readability element. Keep it in phase 3, not phase 1.
- Cheaper alternative if the budget is tight: a single 0.05 m brass spark at the ejection port for
  60 ms. **Judgement.**

### 5.4 Tracer / beam

| Property | Value |
| --- | --- |
| Representation | `InstancedMesh` of a 1×1 plane (or 0.05 × 0.05 box), one instance per live tracer |
| Width | 0.12 m (2.1 px phone, 5.9 px desktop) |
| Length | full shot distance, stretched per instance |
| Life | `travel + 0.03 s`, floor 0.075 s — it must still be visible when it lands |
| Fade | colour × `(1 - t/life)`, additive → colour-to-black *is* opacity-to-zero |
| Head | separate 0.18 m additive sprite, 0.030 s at the streak tip |
| Travel | head reaches the impact point in `min(0.10, dist/140)`; tail trails 35 % behind |
| Colour | `#ffd9a0` core, `#ff9a52` at the tail |

**Per-instance fade without a custom shader:** `InstancedMesh.setColorAt` writes an `instanceColor`
attribute (`InstancedMesh.js:318-330`). With additive blending, scaling that colour toward black is
mathematically the same as fading opacity to zero. That gives per-tracer fade in **one draw call**
with zero new materials. This is the single most useful trick in the whole note.

`mesh.count` can be lowered to draw only the live instances (`InstancedMesh.js:84`), so the pool can
be 64 and typically draw 2–6.

### 5.5 Impact by surface

All impacts are authored per surface tag. The tag comes from whatever the ray hit
(`stone | sand | metal | wood | flesh`).

| Surface | Particles | Size | Life | Velocity | Gravity | Blend | Extras |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Sand** | 7 dust points + 3 grit | 0.25–0.45 m / 0.05 m | 0.5 s / 0.35 s | 1.2–2.6 m/s cone | −2.5 | Normal / additive | soft ring puff 0.5 m, 0.15 s |
| **Stone** | 5 chips + 4 sparks | 0.06 m / 0.03 m | 0.35 s / 0.15 s | 2.5–5 m/s | −9.8 | Normal / additive | 0.25 m chalk puff |
| **Metal** | 10 sparks + 1 flash | 0.03 m / 0.22 m | 0.25 s / 0.06 s | 4–7 m/s | −9.8 | Additive | spark colour `#ffcf8a` → `#ff7a3c` |
| **Wood** | 4 splinters | 0.05 m | 0.4 s | 2–4 m/s | −9.8 | Normal | dust puff, `#8a6a45` |
| **Flesh** | 8 blood points + 1 mist | 0.12–0.2 m / 0.4 m | 0.30 s / 0.25 s | 1.5–3.5 m/s | −4 | Normal | `#7d2b23`; ground stain decal |

Blood mist is *dark and matte*, not additive: additive blood reads as glowing pink at this camera
angle. Sparks are the opposite — additive and near-white. **Judgement.**

### 5.6 Decals and bullet holes

`DecalGeometry` projects a box onto a mesh and clips the triangles on the CPU
(`DecalGeometry.js:41-160`) [6]. It needs a real `Mesh` (the terrain is one, `terrain.js:102`) and
allocates a new `BufferGeometry` per decal. For 10 shots/second that is 10 geometries/second of
garbage — workable but wasteful, and it cannot mark the ghouls (an `InstancedMesh` of merged boxes).

**Recommendation:** a pooled `InstancedMesh` of 32 horizontal quads for ground stains and bullet
scuffs:

- size 0.18–0.30 m, life 12–20 s, fade over the last 2 s
- `polygonOffset: true`, `polygonOffsetFactor: -2`, `depthWrite: false`, `renderOrder: 2`
- rotate randomly around Y, lie flat at `heightAt(x,z) + 0.01`
- one procedural 32×32 canvas texture (dark scorch ring + a lighter centre), reusable from
  `geo.js`'s canvas-texture pattern (`geo.js:64-96`)
- cap 32; recycle oldest

Keep `DecalGeometry` in reserve for authored static props (bus, adobe ruin) where a real wall hole
matters. **Judgement.**

### 5.7 Hit markers, damage numbers, shake, audio hooks

| Feedback | Spec | Cost |
| --- | --- | --- |
| Hit marker | HUD reticle flashes white 90 ms + scales 1.0→1.25→1.0, only for player shots, only on the first pellet of a shotgun blast | reuse `ui.flashDamage()` CSS pattern (`ui.js:525-532`); 0 draws |
| Damage numbers | DOM element, 0.55 s, rise 18 px, fade last 0.2 s, crit 1.3×, pooled 8 elements, only for player damage | 8 DOM nodes, `project()` per frame |
| Killing blow | slightly larger marker + a 0.12 m white ring sprite at the impact, 0.15 s | 1 sprite |
| Camera shake | add trauma: pistol +0.04, rifle +0.03, shotgun +0.14, capped 0.45; existing decay `exp(-7·dt)` | free (`main.js:703-712`) |
| Hit-stop | optional: scale `dt` by 0.15 for 40 ms on a kill | risky with the clamped loop; phase 3 |
| Audio | no audio system exists. Synthesize: 40 ms noise burst through a bandpass + a 90 Hz sine thump, one `AudioContext`, ≤8 voices, distance-attenuated [26] | phase 3 |

Camera shake is already wired: `cameraShake = Math.max(cameraShake, 0.3)` on a melee hit
(`main.js:403`) and it decays inside `updateCamera`. Recoil should feed the same variable, not a
second shake system — two shakes fight each other. The usual recipe is a trauma value in [0,1] with
linear decay and shake amplitude proportional to trauma² [23]; the game's existing exponential decay
(`exp(-7·dt)`) is a fine substitute for one-shot recoil. Impact feedback belongs in the feel budget,
not the polish pass [24].

### 5.8 Light budget

There are exactly three lights today: hemisphere 0.7, sun 4.0 (shadow caster), fill directional 0.25
(`sky.js:67-88`). **Zero point lights.** Adding one is not free:

- The *number* of lights is part of the shader program cache key
  (`WebGLPrograms.js:341-343`, `:477-479`) and the renderer asks for a new program when the lights
  state version changes (`WebGLRenderer.js:2428`) [8]. Adding a `PointLight` at runtime therefore
  misses the program cache for every lit material and compiles a new permutation — a visible hitch.
- Fix: create **one** `PointLight(0xffc37a, 0, 7, 2)` at boot and park it at the muzzle with
  intensity 0. Firing sets intensity to ~12 and the light is already in the permutation.
- Cost: every lit fragment in the scene now evaluates one more light. On LOW, clamp the intensity to
  0 (the light stays in the scene, so no recompile) and rely on the additive sprite alone.
- Never let a muzzle flash cast a shadow.

`PointLight` intensity is physical in r186 (candela). Start at 12, expect to land between 5 and 20;
compare against the sun's 4.0. **Unverified on device.**

### 5.9 Transparency, depth and render order

Three rules, all grounded in the renderer's actual behaviour:

1. **Transparent objects are sorted by `groupOrder → renderOrder → depth (back to front)`**
   (`WebGLRenderLists.js:31-51`) [7], and that sort is *per object*, not per instance. A pooled batch is
   one sort unit, so smoke puffs inside one batch cannot be ordered against each other.
   Consequence: keep smoke in its own batch with `depthWrite:false` and accept the artifact, or use
   very low alpha so the order does not matter.
2. **`depthWrite: false` on every blended FX batch.** On tile-based mobile GPUs a transparent draw
   that writes depth terminates the renderer's Fragment Prepass (Arm's render-order guidance [19]),
   and writing depth in a fragment shader forces a late-Z test. Blending alone already disables
   early-Z/FPK [18] and removes a deferred renderer's ability to reject hidden fragments [20]. With
   `depthTest: true` the FX are still correctly hidden behind the terrain and buildings.
3. **Explicit `renderOrder`** so the layers never depend on Object3D ids:

| Layer | renderOrder | Notes |
| --- | --- | --- |
| Terrain, props, characters | 0 (default) | Opaque, front-to-back is the GPU's job |
| Contact shadows | 1 | existing (`skinned.js:449`) |
| Ground decals | 2 | `depthWrite:false`, polygon offset |
| Smoke / blood mist | 20 | alpha blended |
| Tracers | 30 | additive |
| Muzzle flash / sparks | 32 | additive, always on top of smoke |
| Hit ring / markers | 34 | additive |

Alpha-blended FX must be drawn **before** additive ones, otherwise the smoke multiplies the sparks
down. The table above does that.

### 5.10 Readability at gameplay zoom, without noise

- **One idea per stage**: flash says "fired", streak says "where", impact says "what it hit". Do not
  put a flash, a ring, and a number at the muzzle. At this camera scale each effect is only a few
  pixels tall, so contrast and timing carry the read, not detail [21].
- **Budget the frame, not the shot.** Cap concurrently visible: 4 flashes, 8 tracers, 24 smoke
  puffs, 24 blood puffs, 64 sparks, 32 decals. When full, recycle the oldest; if the screen is
  already full, the next effect is unnoticeable (Object Pool, "just don't create the object" [14]).
- **Scale by camera zoom.** At zoom 0.8 a 0.12 m tracer is 1.7 px and the shot reads as a laser.
  Multiply FX world size by `clamp(pow(zoom, 0.35), 0.9, 1.2)` — a gentle compensation, not a
  linear one, so world scale stays believable. **Judgement.**
- **Cull by distance from the camera focus**, not the player: FX beyond 28 m from `focus` are
  skipped, and casings/smoke beyond 20 m. The whole view is 22 m tall, so this only trims the far
  corners.
- **Suppress FX under the LOW preset**: no smoke, no casings, no decals, fewer sparks (halve the
  counts), flash and tracer unchanged. Those two carry all the information.

---

## 6. Performance and architecture

### 6.1 Draw-call budget

Current scene: ~50–75 calls, 160–250k triangles, one shadow pass (`README.md:194-213`).

| New batch | Draws | Instances | Notes |
| --- | --- | --- | --- |
| Tracers | 1 | 64 | instanced quad, instanceColor fade |
| Flash + smoke billboards | 1 | 48 | one shader, per-instance size/alpha/rotation (phase 1 may use a small `Sprite` pool, ≤4 draws) |
| Impact particles (`Points`) | 1 | 256 | **custom shader with a size attribute** |
| Decals | 1 | 32 | instanced quads |
| Casings | 1 | 48 | instanced box (phase 3) |
| Muzzle light | 0 | — | one permanent `PointLight` |
| **Total** | **5 (6 with casings)** | | Target ceiling: +8 |

That keeps the scene at ~80 calls worst case. Tracers, impacts and smoke are each **one** call
regardless of how many shots are in flight.

### 6.2 Instancing and pooling

- Every FX family is one `InstancedMesh` or `Points` with a fixed capacity, `DynamicDrawUsage` on
  the matrix/attribute, `frustumCulled = false` (the existing pools do this:
  `enemies.js:50-55`, `particles.js:51-52`).
- Free-list cursor, not `find()`. Write the whole instance matrix every frame for live slots only,
  and set `count` to the live count so dead slots cost nothing.
- Dead slots: write a zero-scale matrix and park it below the world (the ghoul pool does exactly
  this, `enemies.js:72-75`, `:242-245`) or simply reduce `count` and compact.
- Determinism: all jitter from `makeRng(deriveSeed('fx'))`, never `Math.random()`. The existing
  particle system violates this (`particles.js:21-32`, `:100-106`); do not copy it.

### 6.3 CPU vs GPU particles

| | CPU (current pattern) | GPU (shader-animated) |
| --- | --- | --- |
| Cost at 256 particles | 256 × ~20 flops + 3 KB upload/frame | ~0 CPU, ~0 upload |
| Collision with ground | easy (`heightAt`) | needs a heightmap texture |
| Pooling/recycling | simple | needs a time/seed attribute |
| Debuggability | high | low |

At 256–512 particles the CPU cost is well under 0.2 ms, and the upload is 3–6 KB per frame — noise
next to a 250k-triangle scene. Arm's guidance is to avoid bandwidth and blended layers, not to
avoid a 3 KB buffer update [18][19]. **Recommendation: CPU particles, GPU shader only for the point
size/fade math.** Revisit at >2k particles.

### 6.4 LOD and culling

- FX batches are never frustum-culled (they are one object spanning the map), like the ghoul pool.
  Instead, cull *emission* by distance from `focus` (§5.10).
- Muzzle flash and tracer never LOD — they are the information.
- Smoke/casings/decals get a hard distance cutoff rather than a lower-detail version.

### 6.5 Module plan

```
src/actors.js      TargetRegistry + faction matrix + the small Combatant interface. The ghoul pool,
                   camp folk, the player and future raiders all register here.
src/aim.js         generic AimController: filter, score, hysteresis, smoothing, lead, fire policy.
                   One instance per armed actor, including the player and AI.
src/weapons.js     WEAPONS table, fire-mode state machine, ammo/reload, procedural gun geometry,
                   muzzle/foregrip offsets, twoHanded/hold metadata, recoil curves.
src/firearms.js    runtime: pooled tracers/casings/decals, fire(), hit resolution, damage dispatch,
                   impact tag → FX call. Owns the per-shot ordering of §3.4.
src/fx.js          generic pooled effect batches: billboard batch (flash + smoke), point batch
                   (dust/sparks/blood), decal batch, hit ring, per-surface presets, the one
                   PointLight. No knowledge of weapons.
src/skinned.js     `rig.solveArmIK(side, targetWorld, poleWorld, weight)` + `rig.muzzle` and
                   `rig.foregrip` sockets. Same two-bone solver as `plantFeet`.
src/ballistics.js  (phase 2) projectile integration + swept tests, shares fx.js and the damage path.
```

Then the integration edits (small, each in one place):

| File | Change |
| --- | --- |
| `src/enemies.js` | `forEachTarget(cb)` for the registry; `raycast(ox,oy,oz,dx,dy,dz,maxDist)` returning `{index,t,point}`; optional `knock` arg on `damage()`; keep `strike()` and `nearest()` untouched |
| `src/npcs.js` | give each camp folk a `Combatant` record and an `AimController` (`firePolicy: 'auto'`); register them so friendlies can fight later |
| `src/player.js` | accept an `aimHeading`; shared `AimController` (`firePolicy: 'manual'`); weapon hold/recoil/reload additive pose; `fire()` gate replacing `strike()` when a firearm is equipped; keep melee on the same cooldown field |
| `src/skinned.js` | `solveArmIK()` (two-bone, with hand orientation) and `rig.muzzle` / `rig.foregrip` sockets; track the equipped weapon id |
| `src/wardrobe.js` | add pistol, rifle and shotgun items to the `weapon` slot with `muzzle`, `foregrip`, `twoHanded` and `hold` metadata; keep `blade`/`club` for melee |
| `src/main.js` | build the registry, update aim for every actor, call `firearms.update`, `fx.update` inside `simulate()`; feed recoil into `cameraShake`; wire the FIRE input and the FIRE/STRIKE button label |
| `src/input.js` | a `fire` callback (reuse `Space` and the `STRIKE` button); a tap-select for target override |
| `src/ui.js` | ammo readout, reload spinner, hit marker, damage numbers |
| `src/save.js` | phase 1: no schema change. Phase 2: save the per-caliber reserve under `v: 2`, with a v1→v2 defaulted read |
| `src/perf.js` | LOW/BAL/HIGH FX caps: flashes, smoke, sparks, decals |
| future `src/raiders.js` | implement the same `Combatant` interface; no new aim or fire code |

### 6.6 Frame order

Today: `player.update → collidePlayer → settlement.update → enemies.update` (`main.js:782-795`).
Insert after `enemies.update` so hit tests use this frame's ghoul positions:

```
actorTargets.refresh()                     // rebuild the target registry
player.update(dt, move, aimHeading)
collidePlayer()
settlement.update(...)
enemies.update(...)                        // ghouls move
for each armed actor: aim.update(actor, registry)   // acquire/score/smooth
firearms.update(dt, actors)               // fire gate, hitscan, damage, recoil
fx.update(dt)                             // tracers, impacts, smoke, decals
particles.update(dt, time)
```

One frame of aim latency is unavoidable and invisible; shooting at last frame's ghoul positions is
not. Order matters.

---

## 7. Options

Master comparison. Cost is per shot or per frame as noted; readability is at 17.7 px/m (phone
landscape, zoom 1).

| Option | Cost | Latency | Readability | Complexity | Verdict |
| --- | --- | --- | --- | --- | --- |
| Hitscan, instant streak (tower's current model) | ~22 capsule tests | 0 ms | Fair — reads as a laser | Very low | Baseline |
| **Hitscan + travelling tracer** | same + 1 instance | 0 ms / 50–100 ms picture | **Best** | Low | **Recommended** |
| True projectile, swept segment | 1 sweep/bullet/frame | `dist/speed` | Best, but slow rounds feel laggy | Medium | Phase 2, slow ordnance |
| True projectile, per-frame point test | 1 sphere test/step | `dist/speed` | Good until it tunnels | Low | **Reject** — tunnels at 45 m/s |
| Raycast the ghoul `InstancedMesh` | ~5,300 tri tests/shot | 0 ms | Poor — slips through limbs | Low | **Reject** |
| Pooled tracer meshes (one per shot) | +1 draw/shot | — | Good | Very low | Reject at >4 concurrent |
| `InstancedMesh` tracer, `instanceColor` fade | 1 draw total | — | Good | Low | **Recommended** |
| `Points` tracer | 1 draw total | — | Poor (square, 1 px, edge-clipped) | Low | Reject |
| `Line2` tracer | 1 draw total | — | Good, crisp width | Medium | Alternative |
| `DecalGeometry` per hit | CPU clip + alloc | — | Accurate on any mesh | Medium | Reserve for static props |
| Instanced quad decals | 1 draw total | — | Good on flat ground | Low | **Recommended** |
| Point light per shot | shader recompile | — | Nice | Low | **Reject** — use one permanent light |
| One permanent point light at intensity 0 | +1 light in all lit shaders | — | Nice | Low | **Recommended** (HIGH/BAL only) |

---

## 8. Recommendation

### Phase 1 — hitscan, tracers, flash, impacts (the whole feel, ~1–2 days)

1. `src/actors.js`: the `TargetRegistry` and faction matrix. Register the player, the ghoul pool and
   the camp folk (friendlies, unarmed for now). This is the shared foundation, even though phase 1
   only arms the player.
2. `src/weapons.js`: the `WEAPONS` table, semi/auto/pump state machine, magazine ammo + infinite
   reserve, procedural pistol geometry (8–12 primitives) on the existing `weapon` wardrobe slot,
   `muzzle` `Object3D`.
3. `src/enemies.js`: `forEachTarget()` + `raycast()` (capsule tests) + `damage(..., knock)`.
4. `src/aim.js`: the generic `AimController` — cone filter, score, hysteresis, λ = 18 smoothing,
   4° fire gate, no lead. The player uses `firePolicy: 'manual'`; the AI policy is wired but no armed
   AI ships yet.
5. `src/firearms.js`: fire gate → hitscan → damage → tracer endpoint; pooled 64-instance tracer
   batch with `instanceColor` fade; muzzle flash sprite pool.
6. `src/fx.js`: point batch with a size attribute, three surface presets (sand, stone, flesh),
   pooled decals, hit marker.
7. `src/player.js`: shared aim facing, pistol hold pose, recoil, fire vs strike.
8. `src/main.js` / `input.js` / `ui.js`: FIRE input, ammo HUD, `cameraShake` recoil.
9. Ship with one weapon (pistol) and one ghoul type. Measure: draw calls, ms, 1 % low, and whether
   the flash reads at 0.55 m.

Phase 1 answers the real question — **does a bullet feel good through this camera?** — with the
smallest amount of code. Everything after it is additive.

### Phase 2 — two-handed arms, AI combatants and ballistics (3–5 days)

1. `src/skinned.js`: `solveArmIK()` — two-bone shoulder/elbow solve plus hand orientation — and
   `muzzle` / `foregrip` sockets. Same law-of-cosines approach as `plantFeet`.
2. Rifle + shotgun in the weapon table, including two-handed hold offsets, foregrip targets, bloom
   and per-shell reload. Rifle/sawn-off use arm IK; the pistol stays one-handed.
3. Arm the camp folk and add a raider faction: both register as `Combatant`s and use the same
   `AimController` with `firePolicy: 'auto'`. This is the friendly/hostile battle proof.
4. `src/ballistics.js`: swept projectiles for grenades/spitters only; reuse the phase 1 impact path.
5. Lead prediction in `aim.js` for those weapons (quadratic intercept).
6. Weapon switching with holster/draw; per-weapon recoil curves.
7. Refactor the tower onto the shared aim/hitscan so there is one tracer/impact look
   (it currently hand-rolls both, `settlement.js:703-717`, `:788-805`).

### Phase 3 — polish

1. Shell casings, smoke, blood decals, muzzle light on HIGH.
2. Hit-stop (40 ms, 0.15× `dt`) on kills, A/B it — the loop clamps `dt`, so test at 30 fps.
3. Procedural audio: noise burst + bandpass, ≤8 voices, distance attenuation.
4. Aim cone indicator on the ground; target-lock tap override.
5. Arcing grenades with a visible arc preview.

---

## 9. Concrete numbers

### 9.1 Effects

| Effect | Count/concurrency | Size (m) | Life (s) | Fade curve | Blend | depthWrite | toneMapped | renderOrder |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Muzzle flash core | 1 | 0.22 | 0.030 | `(1-t)²` | Additive | false | false | 32 |
| Muzzle flash petals | 1 | 0.45–0.65 | 0.055 | `(1-t)²` | Additive | false | false | 32 |
| Muzzle smoke | 2–3 / shot, 24 live | 0.35→0.90 | 0.55–0.85 | `0.22·(1-t)^1.5` | Normal | false | true | 20 |
| Tracer body | 64 pool, ~6 live | 0.12 wide | 0.075–0.13 (travel + 0.03) | colour→black | Additive | false | false | 30 |
| Tracer head | 8 pool | 0.18 | 0.030 | `(1-t)²` | Additive | false | false | 32 |
| Sand dust | 7 / impact | 0.25–0.45 | 0.50 | `(1-t)` | Normal | false | true | 20 |
| Stone chips | 5 / impact | 0.06 | 0.35 | `(1-t)` | Normal | false | true | 20 |
| Metal sparks | 10 / impact | 0.03 | 0.25 | `(1-t)²` | Additive | false | false | 32 |
| Blood points | 8 / impact | 0.12–0.20 | 0.30 | `(1-t)` | Normal | false | true | 20 |
| Blood mist | 1 / impact | 0.40 | 0.25 | `0.5·(1-t)` | Normal | false | true | 20 |
| Ground decal | 32 pool, 12–20 s | 0.18–0.30 | 12–20 | flat 0.55, last 2 s fade | Normal | false | true | 2 |
| Casing | 48 pool | 0.03 | 2.5 | none | Opaque | true | true | 0 |

### 9.2 Timing and feel

| Parameter | Value |
| --- | --- |
| Fire rate | pistol 360 rpm (0.167 s), rifle 50 rpm (1.200 s, single-shot), shotgun 75 rpm (0.800 s) |
| Spread | 1.2° / 1.8° (+0.45°/shot to 4°) / 9° |
| Tracer travel | `min(0.10 s, dist / 140)` |
| Recoil recovery | 0.18 s arm, 0.22 s chest, 0.25 s aim yaw |
| Shot camera trauma | 0.04 / 0.03 / 0.14, cap 0.45, decay `exp(-7·dt)` |
| Reload | 1.30 / 1.90 / 2.20 s (0.35 s per shell) |
| Switch | 0.35 s holster + 0.25 s draw |
| Aim turn rate | 540 °/s player, 360 °/s AI |
| Fire gate | 4° player, 3° AI |
| Retarget | +20 % score, 0.25 s cooldown |
| Hit marker | 90 ms flash, 1.25× scale |
| Damage number | 0.55 s, +18 px rise |
| Capsule (ghoul) | y+0.35 → y+1.35, r 0.32 |
| Capsule (player) | y+0.40 → y+1.55, r 0.38 |
| FX pools | 64 tracers, 48 billboards, 256 points, 32 decals, 8 heads, 48 casings |

### 9.3 Quality scaling

| Preset | Flashes | Smoke | Sparks | Decals | Casings | Muzzle light |
| --- | --- | --- | --- | --- | --- | --- |
| LOW | 2 | off | ×0.5 | off | off | 0 |
| BAL | 4 | 12 live | ×1 | 16 | on | 8 |
| HIGH | 6 | 24 live | ×1 | 32 | on | 14 |

---

## 10. Open questions

1. **Ammo economy — decided for phase 1.** Magazine + infinite reserve, no save change. Phase 2 adds
   a per-caliber reserve (`2 scrap → 12 rounds`) under save `v: 2`. Revisit the exchange rate after
   playtests; the open part is the rate, not the model.
2. **Free aim on touch.** Is a second stick worth the HUD? The drag gesture is already taken by pan
   and placement (`input.js:184-197`). Phase 1 says no; revisit if playtests complain.
3. **Which hostiles get guns?** The shared controller makes it a data row, but the game needs an
   incoming-direction indicator and a reaction/accuracy profile per hostile type.
4. **Shooting over cover.** Without per-building `bulletHeight`, barricades block the player's own
   shots. This needs a value per structure type and a decision about what "cover" means at 40°.
5. **Does the muzzle light pay for itself?** It adds one light to every lit shader. Unverified on
   device; the LOW switch is the escape hatch.
6. **Point-sprite size limits.** `gl_PointSize` has a device-dependent maximum (often 64–1024 px) and
   a point is clipped when its centre leaves the clip volume [25]. Large soft puffs should be
   billboards, not points. Needs a device check before sizing smoke.
7. **Arm IK during reload/melee.** Two-handed aiming is decided (§4.8). Still open: how far the left
   hand should leave the foregrip during a reload, and whether melee should blend back to the
   locomotion pose or keep the support hand on the gun.
8. **Hit-stop against a clamped `dt`.** `dt` is clamped at 50 ms (`main.js:855`); scaling it needs a
   separate simulation scale so the camera and input do not also stutter.
9. **Audio.** No audio system at all. Procedural gunshots are feasible with WebAudio, but mix,
   polyphony and mobile unlock behaviour are unverified.
10. **Does the auto-aim feel like aim-bot?** The 55° cone is a guess. Needs playtesting, not more
    math. The same question applies to AI accuracy: reaction delay and spread are the levers, not
    the cone.
11. **Faction matrix content.** Which pairs are hostile? Does friendly fire exist? The registry makes
    this data, but the battle design has to choose the pairs.
12. **AI battle behaviour.** The controller covers acquire → aim → fire. Cover use, suppression,
    repositioning and squad focus are a separate behaviour layer — worth designing with the raider
    faction, not bolted onto the aim loop.

---

## 11. Phase 1 implementation log (2026-10-28)

### Files

| File | What landed |
| --- | --- |
| `src/actors.js` | `TargetRegistry`, faction matrix (`canAttack`), shortest-angle helper. |
| `src/aim.js` | Generic `AimController`: cone filter, score, 20 % sticky target, λ = 18 slew with a turn-rate clamp, reaction delay, fire gate. One instance per armed actor. |
| `src/weapons.js` | `WEAPONS` table and the procedural scrap pistol; muzzle/foregrip metadata. |
| `src/firearms.js` | Per-pellet hitscan against ghoul capsules, static blockers (buildings, obstacles, terrain), LOS, spread, damage and FX dispatch. |
| `src/fx.js` | Pooled instanced tracers, two custom point batches (additive + alpha) with a per-point size attribute, surface impacts, ground decals, one permanent muzzle `PointLight`. |
| `src/enemies.js` | `forEachTarget()`, `raycast()` against capsules, optional `knock` multiplier on `damage()`. |
| `src/skinned.js` | `muzzle` / `foregrip` sockets on the hand bone; gear rebuild updates them. |
| `src/wardrobe.js` | `pistol` weapon item (the existing blade/club remain). |
| `src/player.js` | Shared aim controller, pistol hold/recoil/reload pose, `tryFire()`, `startReload()`, ammo state. |
| `src/main.js` | Registry wiring, aim update before the player pose, firearms/FX updates, FIRE branch, shared kill award, quality hooks. |
| `src/ui.js`, `index.html`, `src/style.css` | Ammo chip, FIRE/STRIKE label, hit marker, reload state. |

### Behaviour

- The player starts with the pistol; the wardrobe can swap it for the blade or club, which restores
  the old melee path and hides the ammo chip.
- `Space` / the FIRE button calls `player.tryFire()`. The shot is resolved on the same tick; the
  tracer reaches the pre-computed impact and the impact FX spawn after `min(0.06, dist / 140)`.
- Auto-aim is a shared service. The player's faction is `player`, ghouls are `hostile`, camp folk
  are `camp`; the player's registry excludes friendlies. The AI `firePolicy: 'auto'` path exists but
  no armed AI ships yet.
- Static blockers include building heights (barricade 1.0 m … chapel 5.0 m), the obstacle discs and
  the terrain height field. The same test drives LOS, so a ghoul behind a house is not targetable.
- The pistol is a magazine + infinite reserve in phase 1. Empty magazine starts an automatic reload;
  the HUD shows `··` and the FIRE button cools down for the reload.

### Numbers measured

- Default scene with the pistol: **77 draws / 276k triangles** at gameplay zoom (the FX batches
  account for ~3–4 of the draws; the pistol adds ~5k triangles).
- Pistol: 18 damage, 300 rpm, 12-round magazine, 1.3 s reload, 22 m range, 1.2° spread. Ghouls have
  46 HP, so three body shots kill.
- The shot resolves immediately; the tracer is visible for 60–100 ms.
- A headless browser check confirmed: auto-aim acquires a ghoul in the cone, 3 shots kill it, ammo
  decrements 12→9, the kill awards +2 scrap, the hit marker fires, the reload refills to 12, melee
  still does 34 damage, and the wardrobe switches pistol↔blade without console errors.

### Deviations from the spec

- **The player's 4° fire gate was removed.** Because the shot is cast to the auto-aim point, blocking
  the trigger while the character's heading catches up felt unresponsive. The AI gate remains in
  `AimController` for future armed NPCs. The player still cannot fire during the fire cooldown,
  reload, or with an empty magazine.
- **The impact burst is pulled toward the camera** (0.14 m, 0.32 m for flesh) after the first test
  showed a far-side hit being hidden by the target's body at the top-down angle.
- **The two-handed IK and rifle/shotgun are not in phase 1** — they remain phase 2 as specified. The
  pistol is one-handed, so the support-hand IK is not exercised yet.
- **Ammo is not saved.** The equipment weapon is saved; a reload/relaunch starts with a full magazine.
  The per-caliber reserve and `v: 2` save remain phase 2.

### Known limits / next

- The muzzle flash and impacts read at high zoom but are intentionally small at the default zoom;
  tuning against a real phone is still pending.
- No audio, damage numbers, casings or hit-stop yet.
- The tower still uses its own tracer/impact path; phase 2 moves it onto the shared system.
- The pistol pose is one-handed. The rifle/sawn-off and the arm IK are the next visual milestone.
- The player's aim target is one frame behind movement, which is invisible at 60 fps.

---

## 12. Phase 2 — first slice (2026-10-29)

- **Two-handed arm IK.** `rig.solveArmIK(side, target, pole, weight)` in `src/skinned.js` solves a
  two-bone shoulder/elbow chain with the law of cosines, orients the bones in world space and slerps
  the result over the walk pose. The player calls it for the left arm with the rifle's `foregrip`
  socket as the target; the right arm keeps the grip pose. Reloading releases the support hand.
- **Pipe rifle.** A single-shot rifle: 60 damage (one-shots the 46 HP ghoul), 0.3° spread, 35 m,
  one round and a 1.1 s reload that starts **after every shot**. It has a dedicated `foregrip` socket
  and a longer procedural mesh (`src/weapons.js`). The pistol is the fast/light counterpart
  (360 rpm, 18 damage, 1.3° spread). There are no automatic player weapons; more guns and upgrades
  will come later.
- **Part-tagged skinning.** The root cause of the persistent "fan" from the arm to the hip was the
  shirt's top/chest vertices sharing arm weights. Base body and outfit parts now carry an `aGroup`
  attribute (`BODY`, `ARM_L/R`, `LEG_L/R`); `skinGeometry()` restricts each vertex to its own limb
  and removes the attribute after weighting. This eliminated the fan and the hand-to-leg bleed
  instead of tuning distance masks.
- **Proportion fixes.** The player is scaled to 1.08 of the lean archetype (he was visibly shorter
  than the tall camp folk), the base hip joint is painted as the dark undersuit instead of skin,
  the boots have a taller shaft over the ankle, and the trousers carry a knee ball so bent legs do
  not show skin between thigh and shin.
- **Camp guard.** The first skinned camp survivor is armed with a pistol and uses the shared
  `AimController` with `firePolicy: 'auto'`: it acquires a ghoul, turns, stops, fires, reloads and
  awards scavenge. This is the first friendly AI combatant; raiders, camp damage and the generic
  target ray are the next step.
- **Verification.** Headless Chrome (SwiftShader) captures confirm: clean side/front poses with the
  rifle held two-handed, no fan, no hip/ankle skin, the player at or above the stocky camp folk's
  height, the rifle's one-shot kill with the HUD showing the reload state, and the camp guard firing
  a tracer at a ghoul. The browser was not available through the old MCP catalog this session, so
  the captures used `google-chrome --headless` with `?autostart`, `?zoom`, `?heading`, `?hide`,
  `?weapon`, `?ghoul`, `?fire` and `?guardtest` development URL flags.
- **Still open.** Hostile raiders and camp/player damage, more weapons and per-weapon variants/
  upgrades, per-caliber ammo and save `v: 2`, casings/audio/damage numbers. Automatic player weapons
  are intentionally out for now.

---

## Sources

1. Three.js `InstancedMesh` — `setMatrixAt`, `setColorAt`, `instanceColor`, `count`,
   `DynamicDrawUsage`; per-instance triangle raycast.
   `node_modules/three/src/objects/InstancedMesh.js:57,84,258-305,318-330,339`
2. Three.js `Sprite` + sprite shader — quad scaled by the model matrix; depth scaling only under a
   perspective matrix. `node_modules/three/src/objects/Sprite.js`;
   `node_modules/three/src/renderers/shaders/ShaderLib/sprite.glsl.js:20-32`
3. Three.js `Points` / `PointsMaterial` — `sizeAttenuation` applies only when the projection matrix
   is perspective; under an ortho camera `gl_PointSize = size` in device pixels, and `size` is
   multiplied by the pixel ratio when uniforms are refreshed.
   `node_modules/three/src/renderers/shaders/ShaderLib/points.glsl.js:33-40`;
   `node_modules/three/src/renderers/webgl/WebGLMaterials.js:303-308`;
   `node_modules/three/src/materials/PointsMaterial.js`
4. Three.js `Raycaster` — `near`/`far`, layers, `intersectObject(s)`.
   `node_modules/three/src/core/Raycaster.js:23-69,198-218`
5. Three.js `Ray` — `distanceSqToSegment` (ray↔segment distance, from Geometric Tools
   `GteDistRaySegment`), `intersectSphere`, `intersectBox`.
   `node_modules/three/src/math/Ray.js:180-235,307,345,449`
6. Three.js `DecalGeometry` — CPU triangle clipping, one `Mesh`, new geometry per call.
   `node_modules/three/examples/jsm/geometries/DecalGeometry.js:41-160`
7. Three.js transparent sort — `groupOrder → renderOrder → depth (back to front) → id`.
   `node_modules/three/src/renderers/webgl/WebGLRenderLists.js:31-51`
8. Three.js light-count and tone-mapping shader permutations.
   `node_modules/three/src/renderers/webgl/WebGLPrograms.js:179-188,341-343,477-479`;
   `node_modules/three/src/renderers/WebGLRenderer.js:2428`
9. Three.js `Material.toneMapped` — `false` forces `NoToneMapping` for that material.
   `node_modules/three/src/materials/Material.js:458`
10. Three.js `Line2` / `LineMaterial` — screen-space or world-unit line width.
    `node_modules/three/examples/jsm/lines/LineMaterial.js:502-543`
11. Three.js `Capsule` helper — segment + radius representation.
    `node_modules/three/examples/jsm/math/Capsule.js:13-46`
12. G. Fiedler, "Fix Your Timestep!", *Gaffer On Games*, 2004 — fixed dt, accumulator, why variable
    dt makes behaviour frame-rate dependent and lets fast objects tunnel.
    <https://gafferongames.com/post/fix_your_timestep/>
13. G. Fiedler, "Integration Basics", *Gaffer On Games* — semi-implicit Euler for projectile motion.
    <https://gafferongames.com/post/integration_basics/>
14. R. Nystrom, "Object Pool", *Game Programming Patterns* — preallocate, fully reinitialise on
    reuse, and "just don't create the object" when the pool is full.
    <https://gameprogrammingpatterns.com/object-pool.html>
15. R. Nystrom, "Type Object", *Game Programming Patterns* — data-driven "breeds" instead of a
    subclass per weapon. <https://gameprogrammingpatterns.com/type-object.html>
16. NVIDIA, *PhysX SDK — Advanced Collision Detection* — CCD exists to stop "tunnelling"; CCD only
    activates above a velocity threshold; conservative advancement with a finite number of passes;
    raycast CCD as the cheap alternative.
    <https://nvidia-omniverse.github.io/PhysX/physx/5.6.0/docs/AdvancedCollisionDetection.html>
17. Godot Engine docs, "Ray-casting" — `intersect_ray` returns position/normal/collider for the
    closest hit; collision masks/exclusions; under an **orthogonal** camera the ray origin changes
    while the direction does not (parallel rays).
    <https://docs.godotengine.org/en/stable/tutorials/physics/ray-casting.html>
18. Arm, *GPU Best Practices — Blending* — blending disables early-Z/forward pixel kill; high
    blended layer counts consume cycles; reduce overdraw before optimising the blend.
    <https://support.arm.com/documentation/101897/0304/Fragment-shading/Blending>
19. Arm, *GPU Best Practices — Optimizing the draw call render order* — opaque front-to-back,
    transparent back-to-front; "transparent draws that write ZS" terminate the Fragment Prepass and
    force late depth testing.
    <https://support.arm.com/documentation/101897/0304/Optimizing-application-logic/Optimizing-the-draw-call-render-order>
20. Imagination Technologies, *PowerVR Architecture — Do Not Use Alpha Blend Unnecessarily* —
    alpha blending removes the deferred renderer's ability to reject hidden fragments.
    <https://docs.imgtec.com/starter-guides/powervr-architecture/html/topics/rules/do-not-use-alpha-blend-unnecessarily.html>
21. T. Akenine-Möller, E. Haines, N. Hoffman, A. Pesce, M. Iwanicki, S. Hillaire,
    *Real-Time Rendering*, 4th ed. — collision queries, temporal artifacts, particle rendering.
    <https://www.realtimerendering.com/>
22. C. Ericson, *Real-Time Collision Detection* — ray/segment/capsule distance tests, conservative
    advancement. <https://realtimecollisiondetection.net/>
23. S. Eiserloh, "Math for Game Programmers: Juicing Your Cameras With Math", GDC 2016 — trauma in
    [0,1], shake proportional to trauma² (or ³), additive trauma, and the case for smoothed noise
    over per-frame random. Slides:
    <http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf>
    (talk: <https://www.youtube.com/watch?v=tu-Qe66AvtY>)
24. S. Swink, *Game Feel* — input latency, impact feedback and the "collision response" layer of
    feel.
25. Khronos, *OpenGL ES 3.0 Specification* §3.4 (Points) — point rasterisation, `gl_PointSize`,
    centre-based clipping. <https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf>
26. W3C, *Web Audio API* — `AudioBufferSourceNode` / `BiquadFilterNode` for procedurally synthesised
    gunshots. <https://www.w3.org/TR/webaudio/>

### Local game files referenced

- `src/enemies.js` — 64-instance pool, `damage()` 230-250, `strike()` 253-264, `nearest()` 266-281,
  O(n²) separation 161-174, spawn 83-109.
- `src/player.js` — strike cooldown 58-63, movement facing 74-89, heading damp 95-98, attack pose
  134-141, foot IK call 149.
- `src/skinned.js` — hand bone 153-156, gear parenting 413-435, rig API 460-572, contact shadow 438-450.
- `src/wardrobe.js` — slots 25-39, weapon items 287-317, `buildGearItem` 521-525.
- `src/particles.js` — `PointsMaterial` 40-50 and 67-77, `burst()` 92-113, update 115-160.
- `src/geo.js` — `glowTexture()` 64-80, `shadowTexture()` 82-96, `PALETTE` 98-120.
- `src/settlement.js` — tracer pool 451-468, `fireTracer` 703-717, occlusion raycasts 719-764,
  tower auto-fire 788-805.
- `src/main.js` — renderer/tone mapping 24-46, camera 50-107, `cameraShake` 217 and 703-712,
  `doStrike` 386-405, `simulate` 772-842, loop and dt clamp 851-892.
- `src/sky.js` — hemisphere/sun/fill lights 67-88.
- `src/perf.js` — quality presets 1-32.
- `src/input.js` — keyboard bindings 108-134, world pointer/pan/aim 136-214.
- `src/ui.js` — HUD diffing 460-483, `flashDamage` 525-532.
- `src/textures.js` — character atlas regions 166-259.
- `src/terrain.js` — terrain mesh 96-107, `heightAt` 14.
