# ASHFALL — wasteland settlement protocol

A quick, mobile-first **top-down 3D RPG / settlement-building prototype** built with Three.js.
Scavenge a procedural dust plain, raise an adobe camp, and keep the ghouls outside the firelight.
Every mesh, texture and gust of ash is generated at runtime — there are no model, image or audio assets.

This pass also targets the supplied isometric desert-town reference: **sun-bleached sand, cracked
earth, red adobe walls, cream stucco, a bell tower, flat roofs, blue shutters, cacti and crisp
directional shadows**, rendered as low-poly procedural geometry.

The goal of the prototype is not content volume. It is to find out **how much 3D atmosphere and
simulation a mobile browser can carry comfortably**, and to provide an in-game lab for finding the
ceiling.

| Provided direction | Procedural interpretation |
| --- | --- |
| ![Reference](docs/reference.jpg) | ![Gameplay](docs/gameplay.jpg) |

---

## Quick start

**Play online: https://symptom-pg740.github.io/ashfall/**

The site is deployed automatically from `main` by GitHub Actions (`.github/workflows/deploy.yml`).

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. On a phone on the same network, open the LAN address Vite prints
(the dev script already listens on `0.0.0.0`).

Production check:

```bash
npm run build
npm run preview
```

Requirements: Node 20+ and a WebGL2 browser. Tested in Chrome; Safari is the next real-device target.

---

## Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Move | Left stick | `WASD` / arrows |
| Strike / fire | `STRIKE` / `FIRE` button | `Space` |
| Gather scrap | `GATHER` button (appears near a pile) | `E` |
| Open build tray | `BUILD` | `B` |
| Pick structure | Tap a card / swipe the tray | `1`–`6` |
| Aim placement | Tap / drag the ground | Move mouse, click ground |
| Confirm / cancel | `PLACE` / `CANCEL` | `Enter` / `Esc` |
| Wardrobe | `OUTFIT` | `O` |
| Perf lab | `PERF` | `P` |
| Fullscreen | ⛶ button, top right | `F` |
| Orient / lock rotation | phone button, top right | — |
| Pan the camera | drag the ground | drag the ground |
| Zoom | pinch | mouse wheel |
| Rotate the camera | drag the compass | compass, `,` / `.` |
| Face north / recenter | tap compass / tap its centre | `R` / `H` |
| Close menus | `✕` | `Esc` |

The camera is a **fixed-pitch orthographic rig** — no free pitch or zoom. One finger drags the ground
to **pan**; the compass ring is the only touch control that **rotates** the camera (drag it, or tap
to face north). Tapping the compass centre re-centres the camera on the player. Movement stays
screen-relative, so `W` is always "up", and during placement the same ground drag aims the ghost
instead of panning. This leaves the world drag free for the upcoming RTS click-and-send controls.

---

## The 60-second loop

1. Start with **26 scrap**. Scrap piles are marked by floating amber shards; each gives **6–12 scrap**.
2. Build a **Campfire** (8) to heal inside its light, or a **Barricade** (4) for solid cover.
3. A **Rain Catcher** (12) adds **+1 water / 6 s**. An **Adobe House** (18) sends out scavengers for
   **+1 scrap / 9 s**.
4. A **Watchtower** (20) auto-fires at ghouls within 13 m. A **Chapel** (32) grants **+25 max vitality**
   and heals nearby.
5. Ghouls arrive after a grace period, drop **2 scrap**, and get denser over time. Death costs 20% of
   your scrap and respawns you at the old camp. Buildings persist.

Placement is ghost-previewed, grid-snapped, slope-checked, and blocked by structures and wreckage.
Structures are solid to both the player and ghouls.

---

## Try the performance lab first

The in-game **PERF** panel is the point of this prototype.

- **LOW / BAL / HIGH** — changes DPR cap, base render scale, grass count, ember count, natural ghoul
  cap and shadow-map size. **LOW disables shadows entirely.**
- **ADAPTIVE RES** — resolution is rescaled in 0.09 steps between 0.5× and 1.0× of the DPR cap. It
  reacts to average frame time every ~500 ms, with a cooldown so it does not oscillate.
- **FOG / GRASS / DUST** — instant scene-cost toggles (fog is density-only, so there is no shader recompile).
- **SHADOWS** — toggles the single directional shadow pass at runtime (one shader recompile).
- **Automatic last resort** — if adaptive resolution reaches its floor and the game still cannot hold
  ~40 fps for 3 seconds, the shadow pass is disabled once to keep the game playable.
- **+100 DEBRIS** — 100 extra instances in **one draw call**.
- **+20 GHOULS** — adds to the fixed 64-instance ghoul pool.
- **CLEAR** — hides the stress horde and debris.
- **WORLD** — shows the current seed (`?seed=` in the URL). **REROLL SEED** reloads with a new one;
  terrain, props, scrap and ghouls all derive from it, so the whole world changes.

Read **FPS, ms, 1% low, draw calls, triangles, resolution scale, buffer DPR, ghouls and GPU**.
The graph keeps the last ~45 seconds.

| Build tray | Performance lab |
| --- | --- |
| ![Build tray](docs/build.jpg) | ![Perf lab](docs/perf-lab.jpg) |

---

## What is implemented

- **Procedural terrain** — a seeded, baked 384² height/slope/moisture/road field (fBm, domain warp,
  ridged rim, soft terraces, droplet erosion) drives the mesh, props, player, buildings and enemies.
  Vertex-coloured with a generated tiling sand albedo + normal map, winding dirt road, cross street
  and ash/rust patches.
- **Art direction** — sun-bleached sand, warm key light, cool fill, **real-time crisp shadows**,
  red adobe, cream stucco, terracotta roofs, blue shutters, exposed beams, cacti, shrubs and mesas.
- **Procedural props** — rocks, dead trees, saguaro cacti, desert shrubs, broken ruins, wrecked cars,
  a bus landmark, an **abandoned adobe ruin with a piano**, a camp banner, scrap piles, planks,
  barrels, rubble, clustered dry grass and distant mesas. Placed with blue-noise scatter masked by
  slope, moisture and roads; grass and shrubs sway in a vertex shader. Rocks use a cracked-rock
  albedo + normal set; houses use plaster detail and baked base AO.
- **Continue a run** — seed + player state + equipment + buildings + scrap + production timers are
  auto-saved to localStorage. Reload shows **CONTINUE**; **NEW RUN** clears the save, and PERF has
  **RESET SAVE**.
- **Procedural humanoids** — a parametric generator with lean/stocky/tall archetypes and proportion
  jitter. The player is a skinned R4 character: the MakeHuman `hm08` head (CC0) with a procedural
  hair shell, eyes and brows, on a slim 20-bone skinned body with automatic weights, two-bone foot
  IK, PBR-lite, IBL and a character atlas with skin/cloth/leather/metal regions. The three camp folk
  use the same skinned builder at a lower detail level, with a **static merged far LOD** above 24 m;
  `?chars=blocky` and `?chars=smooth` keep the older rigs for comparison.
- **Wardrobe** — 10 equipment slots (head, face, torso, legs, feet, shoulders, hands, back, waist,
  weapon) with multiple items each. Torso/legs/feet rebuild a skinned outfit layer that shares the
  body skeleton; the rest are meshes on bone sockets. Changes are live, saved with the run, and the
  far LOD is re-baked for NPCs. Open it with **OUTFIT** / `O` and tap a slot to cycle.
- **Firearms** — the player starts with a **scrap pistol** (12-round magazine, 1.3 s reload,
  300 rpm); the wardrobe also carries a **pipe rifle** (30 rounds, 600 rpm, 30 m). Shots are hitscan
  rays tested against analytic ghoul capsules; a shared target registry auto-aims the character,
  while firing stays on the player's input. The shot is presented with a travelling tracer, muzzle
  flash and smoke, surface-specific impacts and ground decals. The rifle is **two-handed**: its
  left hand is solved onto the foregrip with a two-bone arm IK, while the right hand holds the grip.
  Ammo is infinite for now; melee remains available by equipping the blade/club. The same aim/fire
  policy is wired for future armed camp folk and raiders.
- **Pinch or the mouse wheel zooms 0.8–2.2×.**

- **Six settlement structures** — Barricade, Campfire, Rain Catcher, Adobe House, Watchtower and Chapel.
  Generated geometry, ghost placement, costs, production, healing and auto-fire. The Adobe House is
  assembled from a modular kit (facade bays, roof, parapet, porch, rooftop clutter) and gets a seeded
  variant per placement; the other five stay hand-authored parametric shells.
- **Combat** — an instanced ghoul pool, chase/attack/knockback, separation, solid buildings and
  wreckage, strike arc, loot, death and respawn.
- **Atmosphere** — warm dusk sky, dust motes, campfire glow pools, contact shadows, fog, vignette.
- **Mobile shell** — safe-area-aware HUD, large touch targets, virtual stick, horizontally scrollable
  6-card build tray, keyboard hints hidden on touch, no page zoom/scroll/bounce, **fullscreen button**,
  HUD that fades in after the start screen.

| Start screen |
| --- |
| ![Start screen](docs/start.jpg) |

---

## Architecture

```
index.html            UI shell + start screen + fullscreen button
src/main.js           bootstrap, state, game loop, wiring
src/terrain.js        shared height field, terrain mesh, cracked-earth texture
src/sky.js            sky dome shader, lights, fog, shadow configuration
src/props.js          instanced scenery, landmarks, contact shadows, mesas
src/resources.js      scrap nodes, markers, respawn
src/player.js         procedural survivor + animation
src/enemies.js        instanced ghoul pool + AI
src/settlement.js     six structures, merged geometry, ghost, placement, production
src/particles.js      dust/embers and pooled bursts
src/perf.js           FPS sampling, quality presets, adaptive resolution
src/input.js          virtual stick, keyboard, ground raycast
src/ui.js             HUD, build tray, perf lab, fullscreen
src/geo.js            primitive/merge/colour helpers, procedural canvas textures
src/rng.js            seeded RNG, easing helpers
```

Everything is in one frame. There is no post-processing, no physics engine and no external asset
pipeline. The shadow pass is the only additional render pass.

---

## Measured on the prototype

These numbers were taken in **Chrome with mobile device emulation on a desktop Intel UHD GPU**.
They are useful for relative comparisons, **not proof of phone performance**. Each row is a separate
run; the scene contents differ.

| Scenario | Draw calls | Triangles | Buffer DPR | FPS | 1% low |
| --- | ---: | ---: | ---: | ---: | ---: |
| Emulated mobile 844×390, balanced, default scene | 49 | 158k | 1.28 | ~60 | — |
| Camp (6 structures), balanced, shadows on | 66 | 164k | 1.28 | ~60 | 52 |
| Camp + 300 debris + 21 ghouls, shadows on | 70 | 168k | 1.60 | 57 | 54 |
| Same scene, shadows off | 43 | 96k | 1.60 | 57 | 53 |
| Desktop high, camp + 300 debris + 20 ghouls | 67 | 169k | 1.10 | 56 | 53 |

Observations:

- **The whole ghoul pool is one draw call.** The stress debris is one more.
- **The shadow pass adds roughly +27 draw calls and +72k triangles** in the stress scene. On the
  desktop test GPU it did not move the frame rate; on real phones it is the first thing to measure.
- Shadows, not raw scene geometry, are the biggest new cost. That is why **LOW** disables them and
  the lab exposes a toggle.
- The scene sits around **~50–70 draw calls and ~160k triangles including the shadow pass**. That is
  still a reasonable mobile budget, but it is no longer "free"; fill rate and thermals matter.
- The adaptive loop raised the buffer to its 1.6 DPR cap in the stress run when there was headroom;
  on a real phone it will move the other way. The **1% low** is the number to watch.
- This is a **single main pass plus one 1024/2048 shadow map**, with no post FX.

### Where it can break next

- High-DPR phones at `HIGH` (2.0 DPR cap) are fill-rate bound long before geometry is an issue.
- Shadow-map cost on older mobile GPUs; `LOW` exists for that reason.
- Thermals over 10+ minute sessions: adaptive resolution cannot fix a device that is throttling its GPU.
- More *unique* buildings or props add draw calls unless merged/instanced.
- Dozens of campfires add transparent overdraw from glow sprites/planes.
- Scaling the ghoul pool to hundreds makes the O(n²) separation noticeable.
- Real Safari/WebGL differences need to be measured, not extrapolated from Chrome.

---

## Design choices for mobile comfort

1. **A fixed-pitch orthographic camera** with compass-driven yaw, drag-to-pan, a recenter control,
   damped follow and a separately tuned portrait framing (landscape is the primary view).
2. **One low-resolution shadow map focused on the camp**, not a cascaded shadow stack. Casters are
   limited to meaningful scenery; grass only receives.
3. **Instancing and merging everywhere.** Terrain is one mesh; scenery groups, grass, contact shadows,
   scrap and ghouls are instanced; each building is one merged geometry.
4. **DPR cap + dynamic resolution scale**, defaulting to `balanced` on touch devices.
5. **Cheap materials** (`MeshLambertMaterial`, vertex colours) and **procedural canvas textures**
   only for the cracked ground, glow and contact shadows.
6. **No per-frame allocations** in the hot paths; UI DOM writes are diffed.
7. **dt clamped at 50 ms** and `requestAnimationFrame` paused on hidden tabs.
8. **Touch-first layout**: 118 px stick, 92 px strike button, large build cards, safe-area insets,
   no zoom/scroll, horizontally scrollable build tray, fullscreen support.
9. **Start-screen HUD fade** so the first view is the world, not a wall of controls.
10. **Adaptive floor fallback**: at minimum resolution, a persistently sub-40 fps session disables
    the shadow pass once rather than silently dropping frames forever.

---

## Fullscreen

The ⛶ button sits beside **PERF** and toggles the Fullscreen API (also `F` on desktop). The icon
switches between expand/compress and the game reframes after the viewport changes.

On **iPhone Safari**, element fullscreen is not available. The button reports that clearly and
suggests Add to Home Screen instead. iPad, Android Chrome and desktop browsers support the API.

---

## What to push next

1. **Real-device matrix**: iPhone 12 / SE, Pixel 6a / 8, a Galaxy A-series, iPad; Safari + Chrome;
   10-minute thermal runs with the perf lab open.
2. **Extend the automatic fallback**: the one-shot shadow disable is a floor, not a full solution.
   Add a 30 fps battery mode and a LOW-preset fallback when the adaptive floor still cannot hold.
3. **PWA/standalone install**, especially for iOS fullscreen and home-screen launches.
4. **More adobe town content**: storefronts, awnings, walls, water tower, market stalls, planters.
   Keep new structures merged/instanced and watch draw calls.
5. **Baked AO / lightmaps** to keep depth on low-end devices without a runtime shadow pass.
6. **Audio and weather**: procedural wind/fire, blowing dust sheets, a slow day cycle, smoke columns.
7. **Combat feel**: hit-stop, directional hits, a dodge, two or three enemy archetypes.
8. **Persistence**: IndexedDB/localStorage save for the settlement and resources.
9. **Device-tier calibration**: GPU string, DPR, memory and a short calibration burst to choose the
   starting preset; keep adaptive resolution as the safety net.

---

## Known limitations

- Not yet profiled on a physical phone.
- iPhone Safari does not support element fullscreen; use Add to Home Screen.
- Shadow cost on older mobile GPUs is the main open performance question.
- No audio.
- Circle collisions; no navmesh/pathfinding. Ghouls can catch on large wreckage.
- Water is produced but has no sink/economy yet.
- No save/load, building removal, upgrades or rotation.
- One enemy type, one weapon, one map.
- Procedural low-poly art, not production art.
- `window.__ashfall` is deliberately exposed for tuning. It is not part of the game UI.

### Tuning from the console

```js
__ashfall.state.scrap = 500;
__ashfall.enemies.spawn(20, __ashfall.player.x, __ashfall.player.z, 18);
__ashfall.actions.doStress('debris');
__ashfall.actions.doStress('ghouls');
__ashfall.actions.applyQuality('low');
```

---

## Why this is a useful ceiling test

The prototype now shows a clear art direction at a mobile-friendly scene budget:

- The desert settlement look — adobe, stucco, shadow, cacti, cracked ground — is achievable with
  ~50–70 draw calls and ~160k triangles including a real shadow pass.
- Shadows add the most visual value per unit of engineering, and the most cost. The next phone test
  should answer whether 1024 px / 30 m is the right point on that curve.
- If new content stays instanced/merged and the lighting model stays this simple, there is room for a
  larger town, more enemies and more props before geometry becomes the bottleneck.
- The adaptive resolution loop is the safety net that makes "smooth on mobile" survivable across
  device tiers — but it needs real-device thermal testing to be trusted.

Next step: run it on physical phones, leave the perf lab open, and use the observed 1% lows to pick
the device tiers and the content budget.
