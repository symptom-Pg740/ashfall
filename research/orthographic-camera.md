# Orthographic camera in top-down 3D games

- **Status:** implemented (first pass, 2026-10-28)
- **Date:** 2026-10-28
- **Question:** Should Ashfall's main gameplay camera be orthographic, and if so, which setup is the
  best fit for a mobile-first top-down RPG / settlement builder in Three.js?
- **Scope:** projection choice, camera rig and framing, the visual/gameplay consequences of ortho,
  and a concrete migration path for `src/main.js`. Not covered: post-processing stack, art asset
  pipeline, or control scheme changes beyond what the camera forces.

---

## TL;DR

**Yes — make orthographic the only gameplay camera**, with a fixed yaw and a fixed pitch. It fits
what the game already is: a mostly flat ground plane, a settlement you read as a miniature, and a
camera that is deliberately not draggable.

The recommended starting point:

| Setting | Landscape | Portrait |
| --- | --- | --- |
| Projection | `OrthographicCamera` | same |
| Yaw | `0°` (camera behind the player, +Z) | same |
| Pitch below horizon | `40°` | `40°` |
| Visible height (`2 × halfHeight`) | `22 m` | `34 m` |
| Visible width | `≈ 39 m` @16:9 | `≈ 16 m` @0.46 |
| Ground depth on screen | `≈ 34 m` | `≈ 53 m` |
| Zoom range | `0.85 – 1.4` | same |
| Near / far | `0.5 / 140` | same |
| Follow damping | `7 /s`, look-ahead `1.25 m` | same |
| Shadow camera | `±28 m`, 1024–2048 map | same |

Those heights are not arbitrary: they match the visible height of the **current** perspective camera
at its follow distance (`applyCameraFraming()` in `src/main.js:42-57`), so switching projection does
not re-frame the whole game. Tune from there on a real phone, not on a desktop window.

The single biggest risk is **depth readability**, not rendering. A shipped game (Tokyo 42) built its
look on an orthographic camera and then abandoned it because players could not judge depth fast
enough for the gameplay. Our mitigation is the one Sable used for its flat-shaded 3D world: lighting,
cast shadows, fog and outlines carry the depth that perspective would have carried.

## Decision log

- **2026-10-28** — Orthographic is the only gameplay camera; perspective stays as a debug view on
  `C` / the `ORTHO CAM` toggle.
- **2026-10-28** — Landscape is the primary framing. Portrait remains supported through a framings
  rule and an orientation-lock button next to fullscreen.
- **2026-10-28** — Yaw is free but owned by the compass widget: drag the ring to rotate, tap it to
  face north, `,` / `.` on desktop. The world drag is reserved for panning. Pitch stays fixed at
  40°, and yaw defaults to 0°.
- **2026-10-28** — One-finger drag pans the camera. Panning detaches the camera from the player; the
  compass centre recolours and taps to recenter. This is the slot where the RTS camera will live.
- **2026-10-28** — Buildings fade to 30 % when their screen footprint covers the player.

Implementation lives in `src/main.js` (rig, framing, pan/rotation), `src/input.js` (drag pan),
`src/settlement.js` (`updateOcclusion`), and `src/ui.js` (compass, orientation lock).

---

## 1. What "orthographic" actually means

In a perspective projection, an object's screen size is inversely proportional to its distance from
the camera: the projection matrix divides by view-space `z`. In an orthographic projection there is
no divide — every point is projected along parallel rays onto the image plane, so **one metre is the
same number of pixels everywhere in the scene** [1][7].

Consequences that matter to us:

- **Scale is constant.** A 2 m wall is 2 m worth of pixels whether it is next to the player or at the
  edge of the camp. There is no foreshortening and no vanishing point.
- **Depth is linear in view space.** Perspective depth is hyperbolic, which is why perspective
  cameras fight for precision near the near plane. Ortho spends its depth range evenly, so a tight
  `near/far` is a cleanliness choice, not a precision emergency [1][4].
- **All view rays are parallel.** For the same reason, every pixel's ray has the same direction; only
  its origin moves. Picking and screen→world maths get simpler and cheaper (§5.4).
- **Camera distance no longer changes framing.** You can park the camera 40 m or 400 m away and the
  image is identical. Only `left/right/top/bottom`, `zoom`, and the camera's *orientation* matter.

### "Isometric" is not a synonym for "orthographic"

This is the most common confusion, and it matters when we talk about reference games.

| Term | What it means | Typical angles |
| --- | --- | --- |
| Orthographic | A projection with parallel rays, no perspective divide | any orientation |
| Isometric | A specific axonometric projection where all three axes are equally foreshortened | yaw `45°`, pitch `35.264°` |
| Dimetric (2:1) | The game-art convention where two axes are equally foreshortened | yaw `45°`, pitch `26.565°` |
| "3/4 view" / "2.5D" | Loose marketing terms for any high-angle parallel-ish view | 30–50° |
| Top-down | Camera looking straight down | pitch `90°` |

True isometric needs a `45°` yaw and `arctan(1/√2) ≈ 35.264°` pitch [7]. The 2:1 pixel-art look that
most people call "isometric" is actually **dimetric** at `arctan(0.5) ≈ 26.565°` (sometimes rounded
to 30°), because it produces the clean 2:1 pixel staircase [8]. A game can be orthographic without
being isometric, and — more importantly — a game can *look* isometric while using a perspective
camera. See §3.

---

## 2. What changes when the camera is orthographic

| Area | What ortho gives us | What it costs | Mitigation |
| --- | --- | --- | --- |
| Readability | Everything is the same size; no tiny far-away enemies; the camp reads as a plan | No size cue for distance, so near/far is ambiguous | Shadows, fog, contact AO, outlines (§5.7) |
| Composition | The frame is predictable; art direction can compose every screen | You cannot cheat scale or use perspective drama | Fixed yaw + fixed pitch; treat the camera as a level-design constraint |
| Occlusion | Tall things hide a predictable strip of ground behind them | Buildings between camera and player hide the player | Fade/cutaway + x-ray silhouette (§5.8) |
| Movement | Screen-relative input is exact; no parallax drift | Loses the "speed" feel that parallax gives | Look-ahead, camera shake, particles, ground scroll cues |
| Rotation | 90° snap keeps the grid axis-aligned and readable | Free orbit is disorienting and breaks composition | Do not ship free orbit; optional 90° animated snap |
| Zoom | Linear: 2× zoom = 2× magnification everywhere | Zooming out shrinks characters and UI targets equally | Clamp zoom, scale selection/hit areas in screen space |
| Shadows | Fits an orthographic shadow camera naturally | Shadow texel density changes with zoom → shimmer | Snap the shadow camera to texels (§5.5) |
| Depth buffer | Linear, easy to keep clean | Screen-space effects tuned for perspective need rechecking | Tight near/far; verify fog and any depth-based effect |
| Performance | Same pixels, same vertices; can tighten far plane and shadow volume | LOD popping is more obvious at constant scale | Low-poly + hysteresis, or skip LOD |

**Judgement:** the one that bites in *this* game is occlusion. The camp has 3–8 m structures, the
camera looks down at 40°, and a structure of height `h` hides `h / tan(40°) ≈ 1.19 h` metres of
ground behind it. A 6 m house therefore blanks about 7 m of ground — enough to swallow the player
standing behind it. That is a solved problem, but it has to be designed in, not discovered late.

---

## 3. What shipped games do

This is the part that changed our mind about "ortho vs perspective" being a binary.

### Monument Valley — orthographic as a mechanic

Ustwo built the game in 3D specifically so that structures only make sense from **one orthographic
camera angle**; navigable areas are often not physically connected, only adjacent from the camera's
point of view [9]. The fixed vantage is what makes the Escher illusion possible, and the art
director's stated goal was that the isometric view "makes the game more about the architecture and
less about the character" [10].

**Lesson:** if the camera never moves, ortho lets you compose the screen exactly. That is a real
design power, not just a look.

### Tokyo 42 — orthographic tried and rejected

SMAC Games prototyped with an orthographic camera, then switched:

> "After a small amount of play testing we found that the orthographic (isometric) camera was far
> too confusing for people as they couldn't read depth quickly enough for our gameplay. So we
> switched to a normal camera that was pulled like a kilometre back with a tight FOV. This allowed a
> bit of parallax as you played and allowed the Depth of Field effect, both of these giving the
> player a bit more information to use as they traversed our world." [11]

**Lesson:** "isometric-looking" does not require orthographic. A perspective camera with a long lens
and a high angle is the standard escape hatch when depth judgement matters. Keep this in our pocket
as plan B.

### Sable — flat 3D, readable depth

Sable is not an argument for or against ortho, but it is the best documented answer to the problem
ortho creates: a flat-shaded 3D world with weak depth cues. The creative director lists the fixes in
order of impact — **lighting and cast shadows** (so the player can see where things sit on a
surface), then **distance fog** ("the biggest impact overall"), then **outlines** and fading opacity
with distance [12].

**Lesson:** the depth budget is spent on light, shadow, fog and edges. If we go ortho and keep the
current lighting, the game will read as flat cardboard.

### The isometric lineage

Diablo and Baldur's Gate established the 2:1 dimetric look with pre-rendered sprites, precisely
because parallel projection meant no per-frame scaling and no perspective maths [8]. The modern
"isometric" look is mostly inherited composition: Tokyo 42 is a documented case of a game that kept
the high-angle framing but moved to a perspective camera [11]. **Judgement:** expect other 3D titles
that read as isometric to be doing the same, and check before copying their camera.

### Settlement and city builders

**Judgement, not a sourced claim:** 3D builders in this genre usually ship a perspective camera,
because the player spends most of their time orbiting and zooming, and perspective gives the city a
sense of scale that a plan view does not. Ortho is more common in games with a *fixed* camera, or in
2D top-down games (RimWorld, Prison Architect) that get plan readability without a 3D projection at
all. Ashfall sits in an unusual but coherent spot: 3D geometry, a fixed camera, and a settlement the
player reads as a plan. That combination is exactly where ortho earns its keep.

### Engine support (a signal about how first-class ortho is)

- **Unity:** orthographic is a first-class camera mode, but deferred rendering is not supported in
  ortho — forward only [5].
- **Godot:** `Camera3D.projection = PROJECTION_ORTHOGONAL`, with `size` and a `keep_aspect` mode that
  chooses whether width or height is preserved [4].
- **Unreal:** supported, including Lumen/Nanite/VSM, but the docs say the engine's "priority has
  always been perspective view cameras" and features "might not be optimized for Orthographic" [6].

**Judgement:** Three.js is the least opinionated of the four. Nothing breaks, but nothing helps
either — the framing, shadow fitting and occlusion handling are ours to write.

---

## 4. Camera archetypes and angle recipes

| Archetype | Yaw / pitch | Reads as | Best for |
| --- | --- | --- | --- |
| True isometric | `45° / 35.264°` | Classic, geometric, equal facades | Puzzle, architecture, grid tactics |
| 2:1 dimetric | `45° / 26.565°` | Retro pixel-art iso, long shadows | Pixel-art RPG, diorama |
| High 3/4 (recommended) | `0–45° / 38–45°` | Modern ARPG / builder; roofs and fronts visible | Ashfall |
| Low 3/4 | `0–45° / 25–32°` | Cinematic, more sky, more occlusion | Exploration, set pieces |
| Top-down | `any / 90°` | Tactical, map-like, facades invisible | Strategy, colony sim |

Two practical notes:

1. **Pitch is a readability dial, not a style dial.** Lower pitch shows facades and horizon (pretty)
   but increases occlusion (`h / tan(pitch)`). Higher pitch flattens the image but shows the ground
   around the player. For a builder where the ground is the interface, 38–45° is the sweet spot.
2. **Yaw should stay on the world grid.** At `0°` the camp grid is screen-aligned and building
   placement is trivial to read. At `45°` you get the classic diamond, but every rectangular
   building becomes a diamond and grid-snapping becomes harder to parse on a phone. The current
   game already uses screen-aligned movement, which favours `0°`.

---

## 5. Implementation in Three.js (r186)

All references are to the installed `three@0.186.1`.

### 5.1 Camera + aspect policy

`OrthographicCamera(left, right, top, bottom, near, far)` stores a frustum in **world units**, and
`zoom` divides the frustum: `dx = (right-left) / (2*zoom)` [1]. Two ways to zoom, pick one:

- **Frustum size** — rewrite `top/bottom/left/right` and call `updateProjectionMatrix()`. Explicit,
  easy to reason about, and what I recommend for the base framing.
- **`camera.zoom`** — leave the frustum alone and change `zoom`. Cheaper to animate and it is the
  property `OrbitControls` expects, but it stacks with the frustum size, so mixing both is how you
  get "why is it zoomed twice".

Drive the frustum from a single design number: `halfHeight`, the half-height of the view in world
units at `zoom = 1`.

```js
const aspect = window.innerWidth / window.innerHeight;
const halfHeight = portrait ? 17 : 11;      // metres; tune on device
const halfWidth = halfHeight * aspect;

camera.top = halfHeight;
camera.bottom = -halfHeight;
camera.left = -halfWidth;
camera.right = halfWidth;
camera.updateProjectionMatrix();
```

The visible **ground** area is larger than the frustum because the camera is tilted:

```
visibleGroundDepth = 2 * halfHeight / sin(pitch)
visibleGroundWidth = 2 * halfHeight * aspect
```

So 22 m of visible height at 40° covers ≈ 34 m of ground depth. If you want to specify the design in
ground metres instead (which is what level design actually cares about):

```js
const halfHeight = Math.max(
  minGroundDepth * Math.sin(pitch),   // depth constraint
  minGroundWidth / aspect             // width constraint
) / 2;
```

**Aspect policy.** Godot names the two options precisely: `KEEP_HEIGHT` is Hor+ (widescreen sees
more width), `KEEP_WIDTH` is Vert- (tall screens see more height) [4]. Neither is right alone for a
phone game:

- Pure `KEEP_HEIGHT` on a 0.46-aspect phone gives a ~10 m wide keyhole. Enemies approach from the
  sides; that is unfair.
- Pure `KEEP_WIDTH` on a 21:9 monitor gives a very short view and wastes the screen.

Use the `max()` form above: **guarantee a minimum width and a minimum ground depth**, whichever
needs more. It overscans on extreme aspect ratios, which is the safe failure mode for gameplay.
Clamp `halfHeight` so a foldable or tablet does not zoom out into a map.

### 5.2 Rig, orientation and follow

Do **not** re-`lookAt()` a moving target every frame. With ortho, a changing orientation tilts the
whole world and makes the horizon breathe. Use a rigid rig:

```js
const rig = new THREE.Object3D();          // position = follow target on the ground
scene.add(rig);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 140);
rig.add(camera);
camera.position.set(0, DIST * Math.sin(pitch), DIST * Math.cos(pitch));
camera.rotation.x = -pitch;                // looks back at the rig origin
rig.rotation.y = yaw;
```

The rig carries translation and yaw; the camera keeps a constant local offset and constant pitch.
No `lookAt`, no roll, no per-frame quaternion rebuild. `DIST` is arbitrary (45 m works) — with ortho
it only affects clipping, not scale.

Follow:

```js
rig.position.x = damp(rig.position.x, player.x + lookAhead.x, 7, dt);
rig.position.z = damp(rig.position.z, player.z + lookAhead.z, 7, dt);
```

Keep look-ahead in the rig plane (portrait needs more of it than landscape). If you want the player
slightly below centre, offset the camera's local `y` by a metre or two instead of tilting the rig —
tilting changes the art direction, offsetting does not.

Camera shake goes in **camera-local** space, so it does not change orientation:

```js
camera.position.x = shakeX;
camera.position.y = baseY + shakeY;
```

### 5.3 Zoom

For a fixed-camera game, zoom is a readability feature, not a gameplay one. Clamp it hard:
`0.85–1.4` spans about 1.65× and keeps the camp legible. Animate `camera.zoom` with a damp, then call
`updateProjectionMatrix()` once per frame while it is moving.

Do not change `near/far` while zooming. Do not zoom by moving the camera — in ortho that does
nothing except clip.

If you later anchor zoom to the cursor, the pixel maps to a point on the camera plane through the
rig origin:

```
planePoint = rig.position + right * ndc.x * (halfWidth / zoom) + up * ndc.y * (halfHeight / zoom)
```

March from there along the camera's forward direction to hit the ground — two lines, no raycast.

### 5.4 Picking, placement and screen→world

`THREE.Raycaster.setFromCamera()` explicitly handles ortho: the ray origin is the NDC point
unprojected onto the camera plane, and the direction is the camera's local `-Z` for every pixel [2].
So `src/input.js:127` keeps working unchanged after `input.camera = orthoCamera`.

Because all rays are parallel, the general form is even cheaper:

```js
// One direction for the whole screen (world space)
const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(q));

// Origin for this pixel: camera position, shifted across the image plane
origin.copy(camera.getWorldPosition(p0))
  .addScaledVector(right, ndc.x * halfWidth / camera.zoom)
  .addScaledVector(up,    ndc.y * halfHeight / camera.zoom);

// Then intersectPlane as today
```

The existing `input.js` already intersects a plane rather than the terrain mesh, which is the right
call for ortho too. Only replace `setFromCamera` if profiling says the pointermove path matters.

### 5.5 Shadows

Three.js already gives directional lights an **orthographic** shadow camera
(`DirectionalLightShadow` constructs `OrthographicCamera(-5, 5, 5, -5, 0.5, 500)`) [3]. So switching
the main camera does not change how shadows are rendered — but the shadow camera must cover the new
visible footprint, which is now fixed in world metres and independent of where the player stands.

Current config in `src/sky.js:73-81` is `±32 m`, 1024 map, `near 1 / far 100`, `bias -0.0006`,
`normalBias 0.035`. Two changes:

1. **Tighten to the ortho footprint.** A rotated 40 m × 34 m footprint needs a square of half-extent
   `√(20² + 17²) ≈ 26 m`. `±28` is enough; `±32` spends 30 % more texels than needed.
2. **Snap the shadow camera to texels.** As the rig moves continuously, the shadow map slides under
   the geometry and edges shimmer — much more visible in ortho because the world does not change
   scale with distance. Standard fix:

```js
const texel = (2 * SHADOW_EXTENT) / shadowMapSize;
const snap = (v) => Math.round(v / texel) * texel;
light.target.position.set(snap(target.x), 0, snap(target.z));
light.position.copy(light.target.position).addScaledVector(SUN_DIR, 60);
```

`normalBias` may need a small increase when the shadow extent shrinks (texels get bigger in world
units). Expect to re-tune by eye, not by formula.

### 5.6 Near/far and depth

Ortho depth is linear, so the only job of `near/far` is to contain the scene and keep screen-space
effects sane. With the camera at 45 m and a 50 m camp radius, `far = 140` is comfortable; the current
`220` buys nothing and stretches the depth range. Unreal's docs are worth reading on this: they
auto-derive ortho clip planes from the ortho width and even scale depth thickness for screen-space
effects, precisely because ortho depth values are compressed relative to perspective [6].

`logarithmicDepthBuffer` is unnecessary and should stay off.

### 5.7 Lighting, fog and the depth budget

This is where an ortho game is won or lost. With no size falloff, the eye has four cues left:

1. **Cast shadows** — the strongest. The current single directional light already does this; keep
   shadows on for the mid tier, not just high.
2. **Fog** — Three.js fog uses view-space depth (`-mvPosition.z`), which works correctly in ortho
   and gives a clean near/far ramp. Ortho provides no natural size or detail falloff of its own, so
   fog ends up as the main distance cue. Consider a *slightly* stronger density than the perspective
   build.
3. **Contact/ambient occlusion** — the existing blob shadow under the player is exactly right; extend
   the idea to buildings and props (a dark ground decal or vertex-colour darkening at the base).
   Cheap and more legible than SSAO on mobile.
4. **Edges** — rim light or a subtle outline. Sable's team used fading outlines and called them "a
   really useful tool for adding depth" [12].

Also: a uniform directional light makes every surface with the same normal the same brightness, which
is why ortho scenes look like cardboard. Break it with vertex-colour variation (the game already
paints props), surface detail in the texture, and a cool fill from the opposite side.

### 5.8 Occlusion: the design problem

At pitch `p`, a blocker of height `h` hides `h / tan(p)` metres of ground behind it:

| Height | 30° | 40° | 50° |
| --- | --- | --- | --- |
| 2 m (player) | 3.5 m | 2.4 m | 1.7 m |
| 5 m (house) | 8.7 m | 6.0 m | 4.2 m |
| 8 m (tower/chapel) | 13.9 m | 9.5 m | 6.7 m |

Two cheap fixes, in order:

1. **Fade the blocker.** About 10 times per second, test buildings whose screen-space bounds overlap
   the player and whose centre is nearer to the camera than the player. Damp their material opacity
   to ~0.35 in, back to 1 out. The test does not need to run every frame.
2. **X-ray silhouette.** Render a second copy of the player with `depthTest: false`, `transparent`,
   low opacity, on a late render order. This guarantees the player is never lost, even at 0.3
   opacity. It is ~1 extra draw call. *Not implemented yet* — the fade alone is readable in testing,
   so this is the fallback if playtests say otherwise.

Do not solve this by raising the pitch to 90°. It removes facades, kills the art direction, and makes
the game read as a spreadsheet.

### 5.9 Anti-aliasing, shimmer and pixel snapping

The renderer is created with `antialias: false` (`src/main.js:22`) and relies on DPR up to 2×. Ortho
makes aliasing *more* visible, not less: a constant-scale world has no distance blur to hide edges,
and every camera move slides the whole scene across the pixel grid at the same rate.

Options, cheapest first:

- **Raise the render scale** — already exposed through `Perf`. The adaptive resolution in
  `perf.js:82-85` is the right lever; ortho does not change it.
- **MSAA** — `antialias: true` at context creation. It cannot be toggled at runtime, so this is a
  build-time decision per quality tier. On mobile, 4× MSAA at 1.5× DPR is often slower than 2× DPR
  without MSAA; measure both.
- **Post AA** — FXAA/SMAA. Only worth it if MSAA is off, and it will soften the flat-shaded look.
- **Pixel snapping** — only if we go pixel-art. `worldPerPixel = (2 * halfHeight) / (canvasHeight * dpr * zoom)`;
  round the rig's position projected onto the camera's right/up axes to that step. This removes
  shimmer but introduces visible stepping on smooth motion. Do not do it for the current soft
  3D look.

### 5.10 Ortho ↔ perspective switching

The current `setOrtho()` (`src/main.js:477-487`) copies the position and quaternion between cameras.
That is the right instinct, but the projections cannot be made identical: perspective converges,
ortho does not. The visible mismatch is strongest at the edges of the frame.

If the toggle stays as a **debug/assessment tool**, leave it — it is good enough to compare looks.
If it ever becomes a player-facing feature (e.g. a "cinematic" mode), do a **long-lens swap**: animate
the perspective FOV down to ~6° while pulling the camera back so the framing at the target stays
constant, then swap to ortho on the frame where the two images nearly match. Reverse to exit. At 6°
the two projections differ by a few pixels and the cut is invisible.

**Recommendation:** keep it debug-only. Two live projections means two tunings of shadows, fog, LOD
and occlusion, and the game only gets one of them right.

### 5.11 Performance notes for mobile

Ortho does not reduce fragment or vertex cost — every pixel and triangle still runs. What it does
give us:

- A **fixed visible footprint**, so `far` can be tight and distant mesas/props can be culled or
  swapped for impostors deterministically.
- A **fixed shadow footprint** (no need to grow the shadow camera when the player sprints).
- **No perspective divide**, which is free but irrelevant at our scale.
- **Constant pixel size**, which makes LOD popping visible. Prefer hysteresis on any LOD switch, or
  keep everything low-poly enough that LOD is unnecessary.

The existing `PERF` lab (`src/perf.js`) remains the source of truth. Watch `ms`, `1% low`, draw calls
and resolution scale after the switch; the frame cost should be nearly identical to perspective at
the same pixel count.

---

## 6. Recommended configuration for Ashfall

### Why ortho fits this game specifically

- The play space is **mostly flat** (the terrain is a height field with gentle slopes and slope
  checks). Ortho's weakness — judging height — matters least on flat ground.
- The settlement is read as a **plan**: footprints, roads, walls, production radius. Ortho is the
  projection of plans.
- The camera is already **fixed** by design ("no camera drag", README). Ortho rewards a fixed camera;
  free orbit punishes it.
- Combat is **proximity-based** (ghouls chase, towers auto-fire within 13 m). The player does not need
  to judge a jump or a projectile arc, which is where Tokyo 42's depth problem bit.

### Starting numbers

| Knob | Value | Where |
| --- | --- | --- |
| `pitch` | `40°` (≈ current `atan(24/28) = 40.6°`) | new camera config |
| `yaw` | `0°` | new camera config |
| `halfHeight` landscape | `11 m` | matches current perspective framing |
| `halfHeight` portrait | `17 m` | matches current perspective framing |
| `zoom` | `1.0`, clamped `0.85–1.4` | new |
| `near / far` | `0.5 / 140` | `main.js:38` |
| rig follow | `damp(…, 7, dt)` | keep `main.js:447-449` |
| look-ahead | `1.25 m`, damped `4/s` | keep `main.js:444-445` |
| shadow extent | `±28 m` | `sky.js:74-77` |
| shadow map | 1024 (BAL) / 2048 (HIGH) | `sky.js:73` |
| fog | keep, consider +15 % density | `sky.js` |
| occlusion fade | 10 Hz test, opacity `0.3` | `settlement.js` |
| player x-ray | not implemented — add only if the fade alone fails playtests | — |

For portrait, the width is still only ~16 m. If playtests say that is too narrow, raise `halfHeight`
to ~20 (≈ 18.5 m wide, 62 m of ground depth) or raise the pitch to 46° to trade depth for width.
That is experiment #2 in §7.

### What I would *not* do

- **True isometric (35.264°/45°).** It is the strongest visual identity but the diamond grid is harder
  to parse on a phone and the current input/placement is screen-axis aligned. The 40° high-3/4 look
  keeps the same "miniature" feel with less friction.
- **Free orbit.** It breaks composition, makes occlusion unpredictable, and requires re-tuning shadow
  and input every frame.
- **Ship both projections.** Pick one and spend the tuning budget on it.

---

## 7. Experiments to run before committing

| # | Experiment | Pass condition |
| --- | --- | --- |
| 1 | Side-by-side screenshots of the same camp at 40° ortho vs the current perspective | Ortho reads as the intended art direction, not flatter/cheaper |
| 2 | Portrait framing at `halfHeight` 17 vs 20 vs pitch 46° | Player can see approaching ghouls from all sides without panning |
| 3 | Occlusion pass: stand behind a house, tower and chapel | Player is always visible (fade or x-ray), no popping |
| 4 | Height judgement: walk a slope and place a building | Placement feels predictable without perspective cues |
| 5 | Shadow shimmer: sprint across the camp | No crawling shadow edges at 1024 and 2048 |
| 6 | Perf: same scene, both projections, `PERF` panel | Within ~5 % frame time at equal render scale |
| 7 | Long-lens fallback: perspective, FOV 8–12°, camera pulled back | Usable plan B if #1 or #4 fails |

---

## 8. Migration plan (code-level)

Files and lines are current as of this note.

1. **Flip the default.** In `src/main.js:36-40`, make `orthoCamera` the active camera and keep the
   perspective camera as the `C` debug toggle. Update `src/ui.js:13` (`ortho: true`) and
   `index.html:147` (label it `PERSP CAM` instead).
2. **Extract a camera config.** One object with `pitch`, `yaw`, `halfHeightLandscape`,
   `halfHeightPortrait`, `zoomMin`, `zoomMax`, `near`, `far`. Replace the perspective-matching maths
   in `applyCameraFraming()` (`main.js:42-57`) with the `halfHeight × aspect` form from §5.1.
3. **Introduce the rig.** Replace the free-floating camera with `rig` + child camera (§5.2). Move
   `camTarget` damping onto `rig.position`; delete the per-frame `lookAt` (`main.js:459`). Keep
   `cameraShake` but apply it to `camera.position` in rig space (`main.js:468-472`).
4. **Keep the sun attached to the rig.** `main.js:462-466` already targets `camTarget`; point it at
   `rig.position` and add texel snapping in `sky.js`.
5. **Tighten the shadow volume** (`sky.js:74-77`) to `±28` and re-check `normalBias`.
6. **Verify picking.** `input.js:127` works as-is once `input.camera` is the ortho camera; only
   replace it with the parallel-ray form if the pointer path shows up in a profile.
7. **Add occlusion handling** (§5.8). This is the only genuinely new system; budget a day, not an
   hour.
8. **Re-tune fog density and contact shadows** by eye on a phone (§5.7).
9. **Re-run the PERF matrix** at LOW/BAL/HIGH in both orientations.

Do **not** change `near/far`, pitch or halfHeight in the same commit as the rig refactor. Change one
knob at a time or the screenshots will be useless.

---

## 9. Open questions

- **Rotation.** Free yaw via the compass is in. Do we also want an animated 90° snap for grid work?
  Snap is cheap to add later but needs input remapping and a re-check of occlusion on all four sides.
- **Command vs control mode.** The pan/compass split is the camera half of an RTS mode. The remaining
  half is unit selection + click-to-send, and a control mode that re-attaches the follow camera and
  shows the stick.
- **Zoom.** Is zoom a player feature or a debug/accessibility feature? The answer sets the clamp and
  whether UI hit areas need to scale.
- **Pixel-art direction.** If the game ever moves toward pixel art, the whole AA/snapping section
  changes and the camera should be re-derived from an integer pixel grid.
- **Portrait priority.** Decided: landscape is primary, portrait is a supported option. The portrait
  view is still only ~17 m wide, so watch whether that is enough on a real phone.
- **Cinematic moments.** Do we ever want a perspective hero shot (building completion, death)? If so,
  the long-lens swap in §5.10 is the transition to prototype.

---

## Sources

1. Three.js `OrthographicCamera` source, r186.1 — frustum semantics, `zoom` divides the frustum,
   near plane may be `0`. `node_modules/three/src/cameras/OrthographicCamera.js`.
2. Three.js `Raycaster.setFromCamera` source, r186.1 — explicit orthographic branch: origin
   unprojected onto the camera plane, direction fixed to camera `-Z`.
   `node_modules/three/src/core/Raycaster.js:119-137`.
3. Three.js `DirectionalLightShadow` source, r186.1 — the shadow camera is an
   `OrthographicCamera(-5, 5, 5, -5, 0.5, 500)`.
   `node_modules/three/src/lights/DirectionalLightShadow.js`.
4. Godot Engine 4.7 docs, `Camera3D` — `PROJECTION_ORTHOGONAL`, `size`, `keep_aspect`
   (`KEEP_WIDTH` = Vert-, `KEEP_HEIGHT` = Hor+), near-plane/z-fighting note, and the hint that
   "3D games that look 2D often use this projection, with size specified in pixels".
   <https://docs.godotengine.org/en/stable/classes/class_camera3d.html>
5. Unity 6.0 Manual, Camera Inspector — orthographic mode; "Deferred rendering is not supported in
   Orthographic mode. Forward rendering is always used."
   <https://docs.unity3d.com/6000.0/Documentation/Manual/class-Camera.html>
6. Unreal Engine docs, Orthographic Camera — ortho width, auto clip planes, depth-precision scaling,
   view-origin correction, volumetric-cloud limitation, and the statement that perspective cameras
   remain the engine's priority.
   <https://dev.epicgames.com/documentation/en-us/unreal-engine/orthographic-camera-in-unreal-engine>
7. Wikipedia, "Isometric projection" — parallel projection, `45°` + `35.264°` camera rotation, depth
   ambiguity and impossible-object consequences.
   <https://en.wikipedia.org/wiki/Isometric_projection>
8. Wikipedia, "Isometric video game graphics" — dimetric 2:1 (`26.565°`) convention, advantages for
   tile/sprite systems, depth-confusion caveat, and the Trent Oster quote on cameras staying out of
   the player's way. <https://en.wikipedia.org/wiki/Isometric_video_game_graphics>
9. MCV/DEVELOP, "Unity Focus: Monument Valley" — the game is 3D and only makes sense from a single
   orthographic camera; navigation is defined in screen space, not world space.
   <https://mcvuk.com/development-news/unity-focus-monument-valley/>
10. WIRED, "Out Today: A Gorgeous iPad Game That Would Make M.C. Escher Drool" — fixed isometric
    vantage, composition control, Ken Wong on the view making the game "more about the architecture
    and less about the character". <https://www.wired.com/2014/04/monument-valley/>
11. Thumbsticks, "Tokyo 42 — developer interview" — orthographic camera abandoned after playtesting
    because players could not read depth; replaced with a long-lens perspective camera for parallax
    and depth of field. <https://www.thumbsticks.com/tokyo-42-developer-interview/>
12. Game Developer, "How Shedworks refined the art of Sable in pursuit of readability" — flat-shaded
    depth readability via lighting/shadows, distance fog, outlines and distance fading.
    <https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability>
