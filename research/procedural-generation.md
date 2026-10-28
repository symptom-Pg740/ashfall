# Procedural generation: the backbone

- **Status:** Phase 0–6 first pass; nav/chunking/streaming still open
- **Date:** 2026-10-28
- **Question:** What should Ashfall generate procedurally, with which methods, and in what order — so
  that terrain, props, buildings, characters, textures and shaders get *better* without breaking the
  mobile frame budget?
- **Scope:** the generation stack and its architecture. Not a content design doc, not a rendering
  rewrite, not audio. Code references are to the current prototype.

---

## TL;DR

> This is the original assessment and plan. The implementation log below records what has shipped
> since, including the parts of this plan that were deliberately deferred.

We already generate everything at runtime, but most of it is **hand-authored geometry placed by a
random number generator**, not a generation *system*. The gap is not "more noise" — it is:

1. **A seeded, deterministic content pipeline.** Right now one `Math.random()` in `geo.js` breaks
   reproducibility, and `heightAt()` is a fixed sum of sines with no seed at all.
2. **A kit + rules layer** for buildings and characters, so variety comes from composition rather
   than from writing another one-off geometry function.
3. **Baked data instead of per-frame maths** where possible: a height/mask field generated once,
   sampled cheaply by terrain, props, player, buildings and erosion.
4. **LOD, instancing and atlases** so that "more detail" does not mean "more draw calls".

Recommended order:

| Phase | Work | Why first |
| --- | --- | --- |
| 0 | Seed registry + deterministic RNG, remove `Math.random` from generation | Everything else depends on reproducible worlds |
| 1 | Noise library + baked height/mask field + chunked terrain | Fixes the flat, repetitive ground and unlocks masks |
| 2 | Masked blue-noise scatter, 3-tier vegetation LOD, wind | Biggest visual gain per triangle |
| 3 | Building kit with sockets + style packs | Turns 6 fixed buildings into a settlement language |
| 4 | Parametric character bodies + modular gear + procedural animation | Ends the "one survivor" look |
| 5 | Detail textures (normal/roughness), triplanar, atlas + KTX2 | Adds surface richness without geometry |
| 6 | Streaming, save/load, collision/navmesh, validation tooling | Makes it a game rather than a demo |

The single most important architectural decision: **bake a world field once, then let every system
sample it.** Terrain, props, buildings, characters, collision and AI should agree on the same height,
slope, moisture and road masks. Today `heightAt()` is analytic and everything calls it, which is
close — but it is unseeded, has no masks, and cannot carry erosion or authored features.

## Implementation log

- **2026-10-28 — Phase 0.** `WORLD_SEED` + `deriveSeed()` in `rng.js`; seed comes from `?seed=hex`.
  Removed the `Math.random()` leak in `geo.paint()`; tree/shrub geometry now uses the seeded stream.
  Props, scrap and enemies derive their seeds from the world seed. PERF lab shows the seed and has a
  reroll button that reloads with a new one. Same seed produces an identical world hash after reload.
- **2026-10-28 — Phase 1 (first pass).** `WorldField` (`src/field.js`) bakes a 384² height/slope/
  moisture/road field with fBm, domain warp, broad dunes, ridged rim and soft terraces. Terrain is
  now a 128² mesh sampling that field (was 88² analytic sines), coloured from the masks. `heightAt()`
  remains the public wrapper so props/player/enemies/buildings did not change. Large ruins, wrecks
  and the bus tilt to the local slope and sink into it. Bake time ~230 ms on the dev machine.
- **2026-10-28 — Phase 2 (first pass).** `scatterDisc()` (jittered-grid blue noise) replaces radial
  random placement. Rocks weight toward slopes, trees and shrubs toward moisture, cacti toward dry
  ground, grass clusters toward moisture, and everything avoids roads. Grass and shrubs get a
  vertex-shader wind sway (per-instance phase). Still one instanced mesh per species; LOD tiers are
  deferred because the ortho view is only ~40 m deep and the current budget is healthy.
- **2026-10-28 — Phase 3 (first pass).** `src/kit.js` assembles the Adobe House from a style pack:
  sized footprint, cream corner quoins, facade bays (door + windows + shutters), parapet, exposed
  beams, optional porch/canopy/sign, rooftop clutter and weathering patches. Each placement is seeded
  from `hash32(WORLD_SEED, 'house', buildSeq, x, z)`; one in four uses the hand-authored hero house.
  House radius grew from 3.0 to 3.45 m to fit the modular footprint, and a deep stone plinth hides
  slope gaps. Not yet: WFC plot layout, damage states, modular chapel/tower, building LOD.
- **2026-10-28 — Phase 4 (first pass).** `src/character.js` generates a humanoid from a seed: three
  archetypes (lean/stocky/tall), proportion jitter, skin/coat/accent palettes, and gear chosen from a
  kit (headwrap, scarf, goggles, coat, shoulder pads, backpack, bedroll, belt tool, optional weapon).
  Each bone is one merged mesh (six draws per character). The player now uses the generator, and
  `src/npcs.js` spawns three seeded camp survivors that wander, idle, face the player when close and
  turn their heads via a clamped look-at. NPC shadow casting is off; their blob shadows remain.
  Not yet: foot IK, character LOD, facial blendshapes, combat variants for NPCs.
- **2026-10-28 — Phase 5 (first pass).** `src/textures.js` generates tiling detail sets (256² sand,
  256² rock, 256² plaster) with a near-white albedo and a Sobel-derived normal map, all seeded. The
  terrain uses sand albedo + normal (repeat 24, normal scale 0.35); rocks and rubble use the rock set;
  the modular and hero houses use the plaster set. `bakeBaseAO()` darkens vertex colours near the
  base of houses and the chapel for a cheap contact occlusion. Not yet: triplanar mapping (UV
  stretching on steep surfaces), a packed atlas, KTX2/Basis, roughness or SSAO.
- **2026-10-28 — Phase 6 (first pass).** `WorldField` now runs 25k droplet hydraulic erosion after
  the fBm pass (seed-deterministic, camp radius <12 m protected), then bakes slope; ~0.44 s on the dev
  machine. `src/save.js` stores seed + player/state/buildings/scrap/timers in localStorage; auto-save
  runs every 5 s and on pagehide, boot resumes with CONTINUE, NEW RUN clears a save, reroll clears it,
  and PERF has RESET SAVE. `validateWorld()` checks building overlaps, scrap/props inside buildings and
  player bounds. Not yet: chunked terrain/LOD, navmesh/flow-field pathing, streaming, CI budgets.
- **Not yet:** chunked terrain/LOD, scatter impostor tiers, triplanar/atlas, navmesh/flow-field,
  streaming and CI performance budgets.

---

## 1. Where we started (baseline, before Phase 0–1)

| System | Current implementation | Strength | Ceiling |
| --- | --- | --- | --- |
| Terrain | `heightAt()` = sum of 3 sine/cosine terms + basin smoothstep; `PlaneGeometry(190, 190, 88, 88)` | Cheap, shared by everything, flat camp basin works | Repetitive, no seed, 2.16 m quads, no erosion/biomes/masks |
| Ground texture | 256² canvas cracked-earth, repeated 16×; vertex colours | One draw call, no assets, reads well | No normal/roughness, no detail at close range, tiling visible |
| Props | Instanced meshes + seeded radial scatter (`sqrt(rng())`) | Good draw-call economy, deterministic-ish | Uniform density, no slope/altitude masks, no LOD, no wind |
| Buildings | One merged geometry builder per type (`GEO_BUILDERS`), `settlement.js` | Authored silhouettes, one mesh per building | Six fixed shapes, no modularity, no damage/variation |
| Characters | One primitive rig (`player.js`), shared material | Cheap, readable, animated | One body, one outfit, no variation or LOD |
| Textures | Canvas gradients (`glowTexture`, `shadowTexture`, cracked earth) | Zero asset pipeline | No tiling detail, normal maps, atlas or compression |
| Materials | `MeshLambertMaterial` + vertex colours, flat shading | Very mobile-friendly | Flat surfaces, no per-pixel detail |
| Determinism | `mulberry32` seeds in props/resources, but `paint(..., jitter)` uses `Math.random()` (`props.js:464`) | Mostly deterministic | A single global RNG leak breaks reproducibility |

**Important:** the baseline look was not "procedural generation" in the PCG sense. It is
**parametric assembly**: a human wrote the shapes, the RNG picks positions and colours. That is a
perfectly good production technique, but it does not scale to "more accurate and more detailed" by
itself. The systems below are what add the missing variety and detail.

---

## 2. The map: what "procedural generation" covers here

| Layer | Output | Methods that matter | What we are missing |
| --- | --- | --- | --- |
| World field | Height, slope, moisture, roads, biome | fBm noise, domain warp, ridged/terraced shaping, erosion bake, Voronoi | Seeded field, masks, erosion, authored features |
| Terrain mesh | Triangles + normals + colours | Heightfield grid, chunk LOD, seams, triplanar | Chunks, LOD, normals/detail |
| Scatter | Trees, rocks, grass, scrap, props | Blue-noise/Poisson, masks, clustering, instancing, LOD | Masks, tiers, wind, impostors |
| Buildings | Massing + facade + props | Parametric massing, modular kit + sockets, shape grammar, WFC layout | Kit, rules, variation, damage |
| Characters | Body + gear + rig + animation | Parametric proportions, modular parts, blendshapes, IK/secondary motion | Variation, gear, procedural animation |
| Textures | Albedo, normal, roughness, AO | Noise, cellular/Voronoi, height→normal, atlas, triplanar, compression | Normal/roughness, atlas, compression |
| Systems | Collision, navmesh, saves, validation | Derived collision, navmesh bake, seed registry, deltas | All of it |
| Flavour | Names, lore, quests, audio | Grammars, Markov/tracery, rule systems | Out of scope for this pass |

---

## 3. Cross-cutting architecture

### 3.1 Determinism and seeds

Every generated thing needs a **stable address**, not a global RNG:

```js
// One root seed, independent streams per system and chunk.
const rand = makeRng(hash32(worldSeed, 'terrain', chunkX, chunkZ));
const propRand = makeRng(hash32(worldSeed, 'props', chunkX, chunkZ));
const npcRand = makeRng(hash32(worldSeed, 'npc', npcId));
```

Rules:

- Never call `Math.random()` in generation code. Seed a local stream. This is the one bug to fix
  before anything else (`paint(..., jitter)` in `src/geo.js`).
- The same seed must produce the same world on desktop and phone, after a reload, and after a save.
- Store `worldSeed` + **player-made deltas** (placed buildings, harvested scrap, dead NPCs), never a
  serialized copy of generated content.
- Separate streams per subsystem so adding a prop does not reshuffle every rock.
- Add a debug readout: seed, chunk, system — and a "reroll seed" button in the perf lab.

### 3.2 Bake once, sample everywhere

For a bounded 190 m world, the highest-leverage change is a **baked world field**:

- Generate a `Float32Array` height field (e.g. 512² or 1024²) at boot, optionally in a Web Worker.
- Run erosion and feature shaping on that array, not on every vertex/query.
- Build a small `WorldField` module: `height(x,z)`, `slope(x,z)`, `moisture(x,z)`, `road(x,z)`,
  `biome(x,z)`, all bilinear lookups.
- Terrain mesh, props, buildings, player, enemies, collision and AI sample the same field.
- If the world later streams, make the field chunk-based with the same API.

This also makes **seams** and **erosion** tractable: the array is the source of truth, and the mesh
is just a view of it.

### 3.3 LOD and draw-call budget

Mobile target per frame (Judgement, tune with the PERF lab):

| Metric | Target | Ceiling |
| --- | --- | --- |
| Draw calls | 60–90 | 120 |
| Triangles | 150k–250k | 350k |
| Texture memory | 32 MB | 64 MB |
| Shader variants | < 20 | 30 |
| Frame time | 16.6 ms | 25 ms |

Techniques, in order of value:

1. **InstancedMesh** for same geometry/material (rocks, grass, scrap) [16].
2. **BatchedMesh** for many *different* geometries sharing a material, via multi-draw [17].
3. **Merge static geometry** per material/atlas (current approach for buildings).
4. **LOD** (`THREE.LOD`) with hysteresis, and billboard/impostor tiers [18].
5. **Culling**: chunk-level frustum culling; do not set `frustumCulled = false` unless necessary.

---

## 4. Terrain

### 4.1 Methods

| Method | What it gives | Cost | Fit for us |
| --- | --- | --- | --- |
| Analytic sines (current) | Full control, trivial | ~0 | Prototype only; repetitive |
| fBm (value/Perlin/simplex) | Natural rolling ground | Low | **Base layer** |
| Domain warping | Organic, non-gridded shapes | Low–medium | **Yes**, one extra noise eval |
| Ridged multifractal | Mountain ridges, eroded look | Medium | **Yes**, masked to the outer ring |
| Terrace/quantize | Mesas, plateaus, badlands | ~0 | **Yes**, around the basin rim |
| Voronoi/cellular | Cracks, mesas, rock cells | Low | Optional detail |
| Hydraulic erosion (bake) | Valleys, fans, drainage | High once, free after | **Bake offline/boot**, not per frame |
| Marching cubes / SDF | Caves, overhangs | High | Not for the main terrain; optional props |

Sources: Red Blob covers elevation, biomes, ridges, terraces, islands, trees and infinite maps [1];
iQ covers fBm and domain warping [2][3]; Cordonnier et al. is the reference for uplift + fluvial
erosion at large scale [4]; GPU Gems 3 shows GPU marching cubes for caves/overhangs [5] (it uses DX10
geometry shaders — treat it as an algorithm reference, not portable WebGL2 code); the PCG book's
chapter 4 is the textbook treatment of fractals/noise for landscapes [6].

### 4.2 Recommended pipeline

1. **Base**: 5–7 octave fBm with lacunarity ~2.0 and gain ~0.5, at ~0.008–0.02 frequency for the
   190 m world. Add one domain-warp pass (`p + 0.35 * fbm(p*2)`) before sampling.
2. **Shape**: distance-from-camp mask keeps the basin flat; ridged noise only outside 35 m; a
   terrace function quantizes the rim into 2–4 levels for mesas/badlands.
3. **Erode (bake)**: a simplified hydraulic pass on the 512² field — droplets or a stream-power
   approximation — 100–300 iterations in a worker. This is where the "real" landscape comes from.
4. **Masks**: slope, curvature, altitude, distance-to-road, moisture = second fBm. Store as separate
   `Float32Array`s or pack into RGBA textures.
5. **Mesh**: chunked grid (e.g. 48 m chunks, 1 m quads near, 2–4 m far), normals from the field,
   vertex colours from masks, skirts or stitching at LOD seams.
6. **Detail**: triplanar detail texture on steep slopes, normal map, contact AO baked into vertex
   colours at the base of rocks/buildings.

Current mesh: 88×88 over 190 m = **2.16 m per quad**, ~15.5k triangles. That is why the ground reads
as broad facets. A 1 m field over the same area is ~4.7× the vertices; chunking + LOD keeps it
affordable because only the near chunks need that density.

### 4.3 Terrain code sketch

```js
// heightfield.js (baked once, sampled everywhere)
export class WorldField {
  constructor(seed, size = 512, extent = 190) {
    this.size = size;
    this.extent = extent;
    this.height = new Float32Array(size * size);
    this.moisture = new Float32Array(size * size);
    this.slope = new Float32Array(size * size);
    // ... fill in a worker, then erode
  }
  sample(arr, x, z) { /* bilinear lookup, world -> grid */ }
  heightAt(x, z) { return this.sample(this.height, x, z); }
}
```

Everything that currently imports `heightAt` from `terrain.js` should import the field instead.
Keep `heightAt()` as a thin wrapper during the migration so nothing breaks.

---

## 5. Scatter: vegetation, rocks, scrap

Current scatter is uniform-random in a disc with `sqrt(rng())` for area correction. That gives
clumps and bald patches. Two upgrades:

1. **Blue-noise / Poisson-disk sampling** for even spacing with a minimum distance. Bridson's
   algorithm is O(n) and easy to implement [9]; Red Blob's "trees" section covers using high-frequency
   noise for irregular placement [1].
2. **Masks**: probability = `f(slope, altitude, moisture, roadDistance, campDistance)`. Rocks prefer
   slopes, shrubs prefer low slopes + moisture, grass avoids roads, scrap clusters near wrecks.

Then tier the result:

| Tier | Distance | Representation |
| --- | --- | --- |
| Near | 0–25 m | Full low-poly mesh, cast shadow |
| Mid | 25–60 m | Reduced mesh or 2-plane cross billboard |
| Far | 60 m+ | Impostor / single quad, no shadow |

Use one `InstancedMesh` per species per chunk per tier. Add **wind** in the vertex shader for grass
and shrubs (cheap sine phase offset by instance position), and per-instance colour via
`instanceColor`. Current grass is already instanced — the missing pieces are masks, tiers and wind.

---

## 6. Buildings

### 6.1 The method ladder

| Method | Variety | Detail | Effort | Use |
| --- | --- | --- | --- | --- |
| One-off builder per type (current) | None | Authored | Low | Keep as the terminal art |
| Parametric massing (box/split/roof) | Medium | Medium | Low | **Start here** |
| Modular kit + typed sockets | High | High | Medium | **Target** |
| Shape grammar (CGA) | Very high | Very high | High | Later, if we need cities |
| WFC | Layout, not shape | — | Medium | Settlement layout |
| CSG booleans | Openings, damage | High | High + fragile | Bake offline only |

The CGA-shape paper is the canonical reference: rules first create a mass model, then split it into
facades, then place windows/doors/roof details, with context-sensitive rules (occlusion, snapping) so
elements do not intersect [7]. We do not need the full grammar. We need its **three ideas**:

1. **Scopes**: an oriented box with position, axes and size; rules subdivide it.
2. **Split/repeat**: floors, bays, window rows.
3. **Context queries**: do not put a door where another volume intersects; snap floors across wings.

### 6.2 Recommended: kit + sockets + style pack

Define a small data-driven kit:

```js
// A part is geometry + typed attachment points + placement constraints.
{
  id: 'wall_adobe_3m',
  geo: wallGeo,
  sockets: [
    { type: 'wall', pos: [-1.5, 0, 0], dir: [-1, 0, 0] },
    { type: 'wall', pos: [ 1.5, 0, 0], dir: [ 1, 0, 0] },
    { type: 'roof', pos: [0, 3, 0], dir: [0, 1, 0] },
  ],
  tags: ['adobe', 'wall'],
  weight: 1,
}
```

Assembly:

1. Pick a **footprint** (rectangle, L, U) from the style pack.
2. Split into **bays** (3–5 m) and **floors** (2.8–3.2 m).
3. Fill each cell with a wall/door/window part by rule + seeded choice.
4. Close the top with a roof part chosen from the style pack.
5. Add props (awning, sign, barrel, banner) on tagged sockets.
6. Merge by material/atlas, build one LOD per building, keep the part list for damage/upgrades.

Style packs are data, not code: `{ palette, proportions, allowedParts, roofTypes, decay }`. That
lets the same kit produce adobe, scrap, chapel and future factions.

**WFC is for the settlement plan, not the building.** Use it to choose which footprint/type goes on
which plot given adjacency rules (house next to house, chapel central, tower on the perimeter) [8].
WFC guarantees local consistency, not global playability — add explicit constraints and validate.

**CSG**: avoid at runtime. If we need door holes or blown-out walls, author the broken variant or
bake the boolean offline. `three-bvh-csg` is the practical library if we must.

### 6.3 Detail without polygons

- **Trim sheets / atlases**: one texture for walls, roofs, wood, metal; UVs per part.
- **Decals** (`DecalGeometry` in three.js examples) for cracks, stains, posters, bullet holes.
- **Vertex-colour weathering** at edges/bases, plus a grime gradient by height.
- **Damage states** as part swaps (`wall_intact` → `wall_broken`) rather than boolean geometry.
- **Interiors**: only for enterable buildings; otherwise a dark inset plane behind windows.

---

## 7. Characters

Current: one primitive rig (`player.js`) with a shared Lambert material. Enemies are a separate
instanced pool. There is no body variation.

### 7.1 What "procedural humanoid" actually means

| Layer | Method | Cost |
| --- | --- | --- |
| Body shape | Proportion sliders + bone scaling; blendshapes for muscle/fat | Low–medium |
| Parts | Modular head/torso/arms/legs/gear on a shared skeleton | Low |
| Surface | Palette + decals + vertex colour; optional detail normal | Low |
| Rig | Shared skeleton, skin weights copied per part | Low |
| Animation | Baked clips + additive layers (breathing, hit, look-at) + IK feet | Medium |
| Faces | 2D eyes/mouth decals or a small blendshape set | Low |

SMPL is the reference for what a parametric body model is: a skinned mesh with shape and pose blend
shapes learned from thousands of scans [11]. We should **not** ship SMPL (too heavy and licence-gated), but
the principle is right: a small number of **shape parameters** + a skeleton beats modelling each NPC.
UMA is the game-side proof that modular slots + overlays + a shared rig produce large character
variety from a small asset set [12].

### 7.2 Recommended for Ashfall

- One shared skeleton and 2–3 body archetypes (lean, stocky, tall).
- Proportion parameters: height ±8 %, shoulder/hip width ±12 %, limb length ±6 %, head scale ±5 %.
  Apply as bone scale + a few blendshapes, not new meshes.
- Modular gear: headwrap, goggles, scarf, coat, backpack, tool; attach to bone sockets.
- Palette variation seeded per NPC; one atlas for skin/cloth.
- Procedural animation:
  - foot IK on slopes (raycast the field at each foot),
  - look-at for the head within a cone,
  - breathing/lean idle additive,
  - hit reaction additive,
  - weapon trail.
- LOD: full rig near, 2-bone silhouette mid, billboard far. Cull shadow casting beyond ~30 m.

This is how we get "more accurate and more detailed" without a character artist: **silhouette and
proportion first, gear second, surface third.**

---

## 8. Textures

### 8.1 Three viable tracks

| Track | How | Best for | Cost |
| --- | --- | --- | --- |
| Boot-time canvas/DataTexture | Generate once on CPU, upload | Cracked earth, glow, decals, UI | Cheap at runtime |
| GPU procedural | Noise in the fragment shader | Infinite detail, cliffs, water | Per-pixel ALU; mobile-sensitive |
| Baked atlas | Generate offline, ship KTX2 | Walls, roofs, character atlas | Best runtime, needs pipeline |

We already use the first track. The next step is not "more canvas textures" — it is **detail maps and
normals**, then **atlases**, then **compression** if the texture count grows.

### 8.2 Concrete texture plan

1. Generate 4–6 **tiling detail textures** at boot at 256²: sand, cracked earth, rock, plaster, wood,
   metal. Use value-noise fBm + Worley/Voronoi for cracks; derive a normal map from the height with a
   Sobel filter.
2. Pack them into a **2D atlas** (or a `DataArrayTexture` if WebGL2 support is confirmed). One
   material, one texture bind, UV offset per part.
3. Terrain/rocks use **triplanar mapping** so cliffs and props without UVs still get detail [13].
   iQ's biplanar variant uses two fetches instead of three — a good mobile trade-off [13].
4. Store **roughness/metalness** in a packed texture if we move beyond Lambert; for now, a detail
   normal + vertex colour is enough.
5. Bake **AO** into vertex colours for static geometry (terrain basins, building bases, prop
   contacts). It is free at runtime and sells the detail more than another texture.
6. If we ever ship authored textures, use **KTX2 + Basis Universal**: supercompressed source that
   transcodes to the GPU's native format, reducing download and GPU memory [14][15]. Three.js ships
   `KTX2Loader` in `examples/jsm/loaders/` [19].

### 8.3 Texture budget

- 256² RGBA = 256 KB uncompressed; mipmaps +33 %.
- 10 detail textures = 2.5 MB + mips — fine.
- One 1024² atlas = 4 MB + mips — fine.
- Do **not** generate textures every frame (the current canvas textures are boot-time; keep it that
  way).
- Anisotropy 4 is a good mobile default; 1–2 on LOW.

---

## 9. Shaders and rendering

Current materials are `MeshLambertMaterial` with vertex colours and flat shading. That is the right
starting point for mobile. The upgrades should be **surgical**, not a move to `MeshStandardMaterial`
everywhere.

| Effect | Technique | Where |
| --- | --- | --- |
| Wind on grass/shrubs | Vertex shader offset, phase from instance position | Grass, shrubs, banners |
| Triplanar detail | Blend 3 projections by normal weights, or biplanar 2 fetches | Terrain, rocks |
| Detail normal | Sample a tiling normal map in the fragment shader | Walls, ground |
| Per-instance variation | `InstancedBufferAttribute` (tint, phase, scale) | Props, foliage |
| Many different parts | `BatchedMesh` multi-draw | Modular buildings |
| Distance detail | `THREE.LOD` + impostors | Props, buildings, NPCs |
| Cracks/stains | Decals or a second UV set | Walls, ground |
| Cheap AO | Baked vertex colour + contact blob shadows | Everything |

Implementation notes:

- Patch `MeshLambertMaterial` with `material.onBeforeCompile` instead of writing a full shader; we
  keep three.js lighting/fog/shadows and only add the wind or triplanar chunk.
- Keep shader **variants** low. Every boolean that changes the shader costs a compile and a pipeline.
  Prefer uniforms/attributes.
- Avoid transparency overdraw for foliage; use alpha-test (or alpha-hash) and a 2-sided material.
- Shadow casting is a per-object decision; distant props and grass should not cast.
- Use `renderer.info` + the PERF lab to watch draw calls/triangles after every generation change.

The current PERF lab already exposes resolution scale, shadows, grass, embers and stress tests — it
is the right instrument. Add a "content" tab later: seed, chunk, prop count, building count, texture
memory.

---

## 10. What we are missing (the honest list)

**Pipeline**
- Seed registry and deterministic RNG everywhere (the `Math.random` in `paint` is a real bug).
- A `WorldField` that owns height/slope/moisture/road/biome.
- Chunking + LOD for terrain, props and buildings.
- Save/load of seed + deltas.
- A content browser/lab: reroll seed, toggle layers, inspect a chunk.

**Content**
- Modular building kit and style packs.
- Character body/gear variation.
- Detail textures, normal maps, atlas.
- Decals and damage states.
- Interiors or fake interiors.
- Weather/time-of-day, wind, dust devils.
- Procedural names/lore for settlements and NPCs (cheap, high flavour).

**Systems**
- Collision derived from generated geometry (currently hand-radius circles).
- Navmesh or flow-field for AI on generated terrain.
- Validation: no props inside buildings, no floating rocks, reachable scrap, playable spawn.
- Performance budgets enforced in CI (draw calls/tris per scene).

**Things not worth doing now**
- Runtime CSG.
- GPU marching cubes for the main terrain.
- Full CGA shape grammar.
- Realistic human scans / SMPL runtime.
- Per-frame CPU texture generation.

---

## 11. Roadmap

### Phase 0 — Determinism (1 day)
- Add `hash32(seed, ...parts)` and a seed registry.
- Replace `Math.random` in `geo.js` with a passed-in RNG.
- Add seed display + reroll in the PERF lab.

### Phase 1 — World field + terrain v2 (3–5 days)
- `WorldField` with 512²/1024² height, slope, moisture, road masks.
- fBm + domain warp + ridge/terrace shaping; optional worker erosion bake.
- Chunked terrain mesh with 1 m near / 2–4 m far LOD and seam handling.
- Keep `heightAt()` as a wrapper so props/player/enemies do not change yet.

### Phase 2 — Scatter v2 (2–3 days)
- Blue-noise candidates + masks; species rules.
- Near/mid/far tiers, instanced per chunk.
- Wind vertex shader for grass/shrubs.
- Measure draw calls and triangles before/after.

### Phase 3 — Buildings v2 (1 week)
- Part kit + sockets + style packs.
- Footprint → bays → floors → facade → roof → props.
- Merge per atlas; one LOD per building; damage part swaps.
- WFC only for plot layout, after the kit works.

### Phase 4 — Characters v2 (1 week)
- Shared skeleton, 3 body archetypes, proportion params.
- Gear sockets + palettes.
- Foot IK, look-at, additive idle/hit.
- LOD + shadow-cast distance.

### Phase 5 — Surface detail (3–5 days)
- 4–6 tiling detail textures + normals, atlas.
- Triplanar on terrain/rocks; detail normal on walls.
- Baked AO in vertex colours.
- KTX2 only when authored textures appear.

### Phase 6 — Systems (ongoing)
- Collision/navmesh from the field and building footprints.
- Save/load: seed + deltas.
- Validation pass + content lab.
- CI budget check.

---

## 12. Experiments to run

| # | Experiment | Pass condition |
| --- | --- | --- |
| 1 | Same seed, reload, compare a hash of prop transforms | Identical |
| 2 | Old sines vs fBm+warp at the same triangle count | Terrain reads less repetitive, no fps regression |
| 3 | Erosion bake 512² in a worker | < 1 s on a mid phone; visible valleys |
| 4 | 1 m vs 2.16 m terrain near the player | Close ground stops reading as facets |
| 5 | Scatter with masks vs uniform | Fewer bald patches, rocks on slopes, grass off roads |
| 6 | 3-tier vegetation | Draw calls under 90, no visible popping at 25/60 m |
| 7 | Kit building with 20 parts vs current house | Same draw calls, visibly more variety |
| 8 | 3 body archetypes + gear | Recognisably different NPCs at 1× screen |
| 9 | Triplanar terrain vs UV detail | Cliffs lose stretching, cost measured |
| 10 | Atlas + KTX2 (if textures) | Texture memory and load time improve |

---

## 13. Open questions

- **World size.** Is 190 m the final play space, or a slice of a larger streamed world? Chunking is
  cheap now; retrofitting streaming later is not.
- **Art direction.** Do we want "low-poly diorama" (current) or "stylised realism"? The detail budget
  and texture plan differ.
- **Buildings enterable?** If yes, interiors need a generation strategy and a camera strategy.
- **How many NPCs on screen?** This decides whether characters are rigged meshes, instanced parts or
  billboards.
- **Authored vs generated.** Which hero assets stay hand-authored? Pure generation rarely beats a
  good hand-made silhouette; use generation for variety around authored anchors.
- **Licensing.** FastNoiseLite, three-bvh-csg, meshoptimizer, KTX2/Basis all have permissive
  licenses, but verify before shipping.

---

## Sources

1. Red Blob Games, *Making maps with noise functions* — elevation, biomes, ridges, terraces, tree
   placement, islands, infinite maps. <https://www.redblobgames.com/maps/terrain-from-noise/>
2. Inigo Quilez, *fBM* — fractional Brownian motion, octaves, Hurst exponent, terrain/cloud use.
   <https://iquilezles.org/articles/fbm/>
3. Inigo Quilez, *Warp* — domain distortion for organic procedural shapes.
   <https://iquilezles.org/articles/warp/>
4. G. Cordonnier, J. Braun, M.-P. Cani, B. Beneš, É. Galin, A. Peytavie, É. Guérin, *Large Scale
   Terrain Generation from Tectonic Uplift and Fluvial Erosion*, Computer Graphics Forum 35(2), 2016.
   <https://doi.org/10.1111/cgf.12820>
5. R. Geiss, *Generating Complex Procedural Terrains Using the GPU*, GPU Gems 3, ch. 1 — density
   fields and marching cubes for caves/overhangs.
   <https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu>
6. N. Shaker, J. Togelius, M. J. Nelson, *Procedural Content Generation in Games* — ch. 4 (fractals,
   noise, landscapes, textures) and ch. 5 (grammars and L-systems). <http://pcgbook.com/>
7. P. Müller, P. Wonka, S. Haegler, A. Ulmer, L. Van Gool, *Procedural Modeling of Buildings*
   (CGA shape), ACM SIGGRAPH 2006.
   <https://peterwonka.net/Publications/pdfs/2006.SG.Mueller.ProceduralModelingOfBuildings.final.pdf>
8. M. Gumin, *WaveFunctionCollapse* — overlapping/tiled WFC, local similarity, observation and
   propagation. <https://github.com/mxgmn/WaveFunctionCollapse>
9. R. Bridson, *Fast Poisson Disk Sampling in Arbitrary Dimensions*, ACM SIGGRAPH 2007 — O(n)
   blue-noise sampling used for even scatter.
10. P. Prusinkiewicz, A. Lindenmayer, *The Algorithmic Beauty of Plants* — L-systems for vegetation.
    <https://algorithmicbotany.org/>
11. M. Loper, N. Mahmood, J. Romero, G. Pons-Moll, M. Black, *SMPL: A Skinned Multi-Person Linear
    Model*, ACM TOG 2015 — skinned body with shape/pose blend shapes learned from scans.
    <https://smpl.is.tue.mpg.de/>
12. UMA — Unity Multipurpose Avatar, modular character slots/overlays on a shared rig.
    <https://github.com/umasteeringgroup/UMA>
13. Inigo Quilez, *Biplanar mapping* — two-fetch alternative to triplanar for untextured/UV-less
    meshes. <https://iquilezles.org/articles/biplanar/>
14. Khronos, *KTX-Software* — KTX2 container for GPU textures.
    <https://github.com/KhronosGroup/KTX-Software>
15. Binomial, *Basis Universal* — GPU texture codec/transcoder.
    <https://github.com/BinomialLLC/basis_universal>
16. Three.js `InstancedMesh` — one geometry/material, many transforms, fewer draw calls.
    `node_modules/three/src/objects/InstancedMesh.js`
17. Three.js `BatchedMesh` — multi-draw batching for different geometries.
    `node_modules/three/src/objects/BatchedMesh.js`
18. Three.js `LOD` — distance-based detail switching.
    `node_modules/three/src/objects/LOD.js`
19. Three.js `KTX2Loader` — `node_modules/three/examples/jsm/loaders/KTX2Loader.js`
20. D. Ebert, F. K. Musgrave, D. Peachey, K. Perlin, S. Worley, *Texturing & Modeling: A Procedural
    Approach* — the reference for procedural texture primitives (noise, turbulence, cellular).
21. R. M. Smelik, T. Tutenel, R. Bidarra, B. Beneš, *A Survey on Procedural Modelling for Virtual
    Worlds*, Computer Graphics Forum 33(6), 2014. <https://doi.org/10.1111/cgf.12276>
22. FastNoiseLite — practical seeded noise library (OpenSimplex2, cellular, fBm).
    <https://github.com/Auburn/FastNoiseLite>
23. `three-bvh-csg` — practical CSG for three.js, if boolean openings/damage are ever needed at build
    time. <https://github.com/gkjohnson/three-bvh-csg>
24. `meshoptimizer` — simplification/LOD and mesh compression; three.js ships decoder/simplifier
    modules in `examples/jsm/libs/`. <https://github.com/zeux/meshoptimizer>
25. Three.js `DecalGeometry` — projected decals for cracks, stains and damage.
    `node_modules/three/examples/jsm/geometries/DecalGeometry.js`
