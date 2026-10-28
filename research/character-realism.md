# Moving characters from blocky to realistic

- **Status:** R1 + R2 + R3 implemented on the player and all camp folk, plus the R4 authored player
  head and a static far LOD tier for crowds.
- **Date:** 2026-10-28
- **Question:** Why do the characters read as blocky, and what is the shortest credible path to a
  more realistic look on a mobile browser with a procedural pipeline?
- **Scope:** characters first, with the lighting/material changes they depend on. Not a full
  photorealism plan, not a rigging/animation course.

---

## TL;DR

The blockiness is **not a polygon-count problem**. It is five things stacked:

1. **Box primitives** with no bevels or round forms.
2. **Flat shading** on every part, so every facet is a hard plane.
3. **Lambert materials** with no roughness, specular response or environment light.
4. **Rigid-part animation** — shoulders and hips only, no elbows, knees, hands or spine.
5. **No facial features or cloth layering** — a box head with two box eyes.

You can get a large realism jump **without leaving procedural geometry**:

> Rounded silhouettes + smooth normals + a real skeleton + PBR-lite materials + image-based
> lighting. That is roughly a 1–2 week pass, and it keeps the runtime generation identity.

True photorealism is a different project. On a phone, with one developer and no authored assets, the
honest target is **stylized realistic** — grounded proportions, smooth forms, believable light — not
skin pores and strand hair. If the target really is "looks like a modern game character", the fastest
route is **one authored base mesh** (Blender or MakeHuman) with procedural variation on top, not more
procedural boxes.

## Implementation log

- **2026-10-28 — R1 first pass.** The player now uses `buildSmoothHumanoid()`:
  - rounded boxes for torso/gear, capsules for upper/lower arms and legs, sphere head with jaw,
    brow, nose, eyes, ears, mouth;
  - elbow and knee groups (the rig now has 12 meshes instead of 6);
  - `MeshStandardMaterial` with roughness 0.72/metalness 0.05 and smooth normals;
  - `RoomEnvironment` + `PMREMGenerator` IBL at 0.35 intensity.
  - Tone mapping was switched from Linear to **Neutral**. ACES was tested first and washed out the
    desert palette; Neutral keeps the existing colour direction while grounding the PBR material.
- **Comparison switch:** NPCs stay on the blocky builder by default, so the player and camp folk are
  visible side by side. `?chars=smooth` rebuilds the NPCs with the smooth builder too.
- **Numbers:** player smooth + blocky NPCs = ~80 draws / 219k tris / ~60 fps on the dev GPU.
  All smooth = ~92 draws / 271k tris. The smooth player body is ~4.9k vertices.
- **2026-10-28 — R2 first pass.** The player is now a single `SkinnedMesh` (`src/skinned.js`):
  - 20-bone skeleton (root, hips, spine, chest, neck, head; shoulder/upper/fore/hand per arm;
    thigh/shin/foot per leg);
  - body capsules/rounded boxes merged into one geometry, welded for smooth normals;
  - automatic skin weights from the three nearest bone segments;
  - gear parented to bones (headwear to head, backpack/bedroll to chest, pads to upper arms,
    tool to hips, weapon to the right hand);
  - bone-driven walk/idle/attack, spine counter-rotation, head look-at;
  - a cheap foot-plant correction: sample the field under each foot, offset the foot bone and
    pitch it to the local slope (not yet a full two-bone knee solve).
- **R2 numbers:** ~74 draws / 214k tris / ~53 fps on the dev GPU. The body is one draw instead of
  six, but gear adds six bone-parented meshes.
- **2026-10-28 — R3 first pass.** Added a 256² **character atlas** with four regions (skin, cloth,
  leather, metal), a normal map and a packed roughness/metalness map. The body uses position-based
  box-projected UVs, so skin hands/head, leather belt/boots and cloth body pick the right region
  without authored UVs; gear uses fixed regions per mesh. Face additions: cheekbones, eyelids,
  eyebrows, lips and a darker mouth. Cloth additions: collar, coat hem, sleeve/boot cuffs, front
  folds; headwear folds/knot; a second scarf tail; simple hair strands when there is no headwrap.
  The headwear was also raised off the brow so the eyes/face are actually visible at zoom.
- **R3 numbers:** ~74 draws / 232k tris / ~52 fps at zoom 1 on the dev GPU. Added a mouse-wheel
  camera zoom (0.8–2.2×) so the character detail is actually inspectable at this camera distance.
- **2026-10-28 — All camp folk skinned.** The three survivors now use `buildSkinnedHumanoid()` with
  `detail: 'low'` (~4k body vertices each vs ~7.7k for the player). Comparison modes remain:
  `?chars=blocky` for the old rig, `?chars=smooth` for R1 rigid smooth. Final scene: **74 draws /
  252k tris** (all humanoids skinned), inside the 250k-ish target.
- **2026-10-28 — Full two-bone foot IK.** The planted-foot correction is replaced by a real
  hip/knee solve: the rig computes the hip-to-ground vector, solves the knee with the law of cosines,
  clamps reach, blends against the walk cycle, and pitches/rolls the foot to the local slope. Works
  for both the player and the skinned camp folk. Also added **two-finger pinch zoom** on touch
  (0.8–2.2×, alongside the mouse wheel).
- **2026-10-28 — R4 authored head (player only).** MakeHuman `hm08` base mesh (CC0), extracted from
  the neck up and re-pivoted at the neck joint (`src/assets/base-head.obj`, 5,325 verts / 4,997
  quads, 259 KB). It is imported with `?raw` + `OBJLoader` (`src/baseHead.js`) and fitted at 1.14×
  on the head bone, sunk 2.5 cm into the collar so the neck stays short. The extraction originally
  included the shoulders, which made the head read as huge; cutting at the neck fixed that.
  - Procedural **hair shell** built from three sphere caps (crown, sides/back, nape) with the face
    wedge left open; hair colour is chosen deterministically per character from a new `HAIR` palette.
  - **Eyes and brows** placed in the authored sockets. The eyes are small and off-white so they do
    not read as googly at zoom.
  - **Scarf** re-parented from the head to the neck/chest, so it no longer swings with head look-at.
  - The **bedroll** is now horizontal and lower on the pack instead of a vertical cylinder behind
    the head.
  - NPCs keep the procedural head, so the authored face remains the player's hero detail.
- **2026-10-28 — Static far LOD for camp folk.** `bakeStatic()` walks the skinned rig, transforms the
  body, authored head, hair, eyes and every gear mesh into group space, strips skinning attributes and
  merges them into **one static mesh** with the same material. `CampFolk` keeps the skinned tier below
  24 m and swaps to the baked tier above it, with 4 m of hysteresis; while far it also skips the walk
  pose, foot IK and head look-at. The far tier is the same triangle count (the merge does not
  decimate) but **7 draws per survivor become 1**. All three NPCs far: **56 draws / 238k tris**;
  one near: **65 draws / 249k tris**. `?chars=blocky` and `?chars=smooth` skip the far tier.
- **2026-10-28 — bundle trim.** The extracted head originally carried MakeHuman's 21k unused UV
  records. Since the character atlas re-projects UVs at runtime, the `vt` block was dropped:
  the head asset went from 814 KB to 259 KB and the production JS from 1.5 MB to 947 KB.
- **2026-10-28 — Wardrobe and a slim base body.** The old single body mesh bundled skin, clothing and
  silhouette together, which is why every survivor looked like they were wearing the same oversized
  armour. The skinned rig now has two layers:
  - a slim **base body** (`baseBodyGeometry`) with skin limbs and a dark undersuit torso;
  - a separate **outfit SkinnedMesh** (`buildOutfit`) sharing the same skeleton and bind matrices.
  - `src/wardrobe.js` defines 10 slots and their items. Torso/legs/feet items build the outfit layer;
    head/face/back/shoulders/hands/waist/weapon items parent to bone sockets.
  - `rig.equip(slot, id)`, `rig.setEquipment(partial)` and `rig.cycleEquipment(slot, dir)` swap items
    at runtime. An outfit change rebuilds only the outfit geometry and reuses the bound skeleton.
  - Equipment is saved with the run and restored on CONTINUE. The wardrobe UI is the `OUTFIT` button
    / `O`; each row cycles its slot.
  - The default player outfit is a work shirt, trousers, boots, scarf, bedroll, hip tool and blade —
    no pauldrons. Plate, coat, vest, greaves, wraps, helmet, hood, goggles, respirator, cloak,
    rucksack, pouches, gloves and club are selectable.
- **2026-10-28 — NPC head placement bug fixed.** `smoothHead()` is already in head-local space, but
  the skinned fallback was also translating it by `-1.55 s`, which put every camp folk head down
  around the ankles. The extra translate was removed; heads now sit at 1.57–1.82 m above the group.
- **Numbers:** the default look is **63 draws / 250k tris** at zoom 1.7 with all three camp folk
  near. The player outfit layer is ~6.1k triangles. The slim body is ~4.6k vertices.
- **Known limit:** the wardrobe head slot is designed for the player's authored head. Camp folk still
  use the procedural head's built-in cap/scarf, so an NPC hat can be hidden by it. Making NPC
  headwear wardrobe-driven needs a per-head-type fit (crown height/radius), which is the next
  wardrobe step.
- **2026-10-28 — Skinning mask fix (body no longer drags with the arms).** With the slimmer body,
  plain nearest-bone weights gave the upper-arm bones the dominant influence over the outer chest
  wall: the arm bone is only ~5 cm from the torso surface, so swinging an arm visibly pulled the
  chest sides with it. `skinGeometry()` now fades arm influence out inside the torso silhouette and
  leg influence out above the hip, while keeping the shoulder cap arm-weighted. Torso vertices in
  both the base body and the outfit now carry **0 arm weight**; the shoulder cap keeps ~0.48
  shoulder / 0.48 upper-arm. Verified in the rest, walk and near-full-arm-raise poses.
- **Not yet:** blink/talk blendshapes, a decimating far LOD (the current far tier is draw-call-only),
  and world-wide PBR.

---

## 1. Why the current characters read as blocky

| Current choice | Where | Why it reads blocky |
| --- | --- | --- |
| `box()` for torso, limbs, head, gear | `src/character.js` | Every surface is planar; no bevels, no round volumes |
| `flatShading: true` on the material | `character.js` | Hard facet per triangle; kills smooth forms |
| `MeshLambertMaterial` | `character.js` | No roughness/specular; skin and cloth look like painted plastic |
| 6 meshes: torso, head, 2 arms, 2 legs | `character.js` | No elbow, knee, wrist, ankle, spine or neck joints |
| Arms/legs are rigid groups | `player.js` | Limbs swing as planks; no bend, no counter-rotation |
| Head is a box with box eyes | `headGeometry()` | No brow, nose, cheek, jaw, ears, hair or eye sockets |
| Palette colours only | `character.js` | No skin/cloth texture, normal or roughness variation |
| No environment lighting | `main.js` | Lambert + one directional light; no reflections, no ambient bounce |
| Blob shadow only | `character.js` | Characters feel pasted on the ground |

A useful rule: **silhouette and shading dominate perceived realism at game distance**. A smooth
1.5k-triangle character with good proportions and light reads far better than a 20k-triangle box
character. Do not start by adding polygons.

---

## 2. The realism ladder

Ordered by visual gain per unit of work, not by technical sophistication.

### 2.1 Silhouette and shading (highest gain, lowest effort)

- Replace boxes with:
  - `RoundedBoxGeometry` for torso, gear, packs, shoulder pads [4].
  - `CapsuleGeometry` for upper/lower arms, thighs, shins, fingers [5].
  - `LatheGeometry` for tapered torsos, necks and boots.
  - `TubeGeometry` along a curve for belts, straps, hoses and hair ties.
  - `IcosahedronGeometry`/sphere for heads, shoulders, joints, eyes.
- Turn off `flatShading` on characters. Merge vertices and recompute normals so surfaces are smooth
  (`BufferGeometryUtils.mergeVertices` + `computeVertexNormals`).
- Add **joints**: elbow, knee, wrist, ankle, neck, waist. Even without skinning, two-segment limbs
  with rounded capsules look dramatically less like planks.
- Bevel the gear: a rounded box for a backpack reads as fabric; a box reads as a crate.

This alone is the "is that the same game?" change. It costs almost nothing at runtime.

### 2.2 Skinning and proportions

- Move from rigid child groups to a `SkinnedMesh` with a `Skeleton` of 10–16 bones [1][2]:
  root/hips, spine, chest, neck, head, two clavicles, upper/lower arms, hands, upper/lower legs,
  feet.
- Build the body as a single smooth mesh (rings/loft along the skeleton, or merged capsules) and
  assign `skinIndex`/`skinWeight` per vertex by distance to the nearest bone segments.
- Keep gear as separate meshes parented to bones (backpack to chest, tool to belt, headwrap to head).
- Parameterize proportions on the skeleton: height, shoulder width, hip width, limb length, head
  scale. That preserves the generator's variety with a believable body.
- Add **foot IK** (sample the field under each foot) and a **look-at** head. These two make idle and
  walk cycles feel alive.

### 2.3 Materials: PBR-lite

- Switch characters to `MeshStandardMaterial` [3]:
  - skin: roughness ~0.55, metalness 0;
  - cloth: roughness ~0.85–0.95, metalness 0;
  - leather: roughness ~0.6;
  - metal buckles/tools: metalness 0.7–0.9, roughness 0.35–0.5.
- Add a **normal map** and a subtle **roughness map** for cloth weave and skin pores. The same
  procedural texture generator can produce them.
- Keep the existing palette for variation, but multiply it into a **texture atlas** rather than
  painting every vertex. A 512² character atlas is tiny and removes the "painted vertex colour" look.
- Skin is not just a colour: a little **subsurface-ish warm bounce** can be faked with a wrap-light
  term or a warm fill light. Do not attempt real subsurface scattering on mobile.

### 2.4 Lighting and environment

- Add **image-based lighting**: `PMREMGenerator` + `RoomEnvironment`, assigned to
  `scene.environment`, with `envMapIntensity` tuned per material [6][7]. This is the single biggest
  "grounded" change after smooth normals: metal and cloth stop looking like flat paint.
- Switch tone mapping from `LinearToneMapping` to `ACESFilmicToneMapping` (or AgX) and retune the
  palette. Linear tone mapping is why the current scene looks like a flat illustration.
- Shadows: one directional shadow is fine, but use a softer filter and a slightly larger normal bias
  on characters. Character self-shadowing (nose, chin, arms) is a big realism cue.
- Optional: **GTAO/SSAO** [8] for contact occlusion. It is expensive on mobile; gate it behind the
  HIGH tier or skip it and rely on baked vertex AO + blob shadows.
- Add a cool **rim/fill** from the opposite side. The current single sun makes every character read
  as a silhouette with one lit plane.

### 2.5 Faces, hair and cloth

- Face: replace the box head with a rounded head shape; add a brow ridge, nose, cheek/jaw planes,
  ears, and eye sockets. Eyes as spheres with an iris/pupil texture; eyelids as thin meshes.
- Hair: alpha-tested cards or a few chunky strands. Avoid strand hair on mobile.
- Mouth: a small dark inset + lip geometry; optional blendshapes for talk/blink.
- Cloth: layered panels (coat, scarf, hood) with rounded edges and a normal map; no cloth simulation.
- Hands: mittens or 3-finger low-poly hands read better than box hands at this camera distance.

### 2.6 Animation

- Blend idle/walk/run instead of a single sine swing.
- Add spine counter-rotation, shoulder/hip opposition, head stabilization, breathing, blinking.
- Foot IK + pelvis drop on slopes; hand IK on tools if they matter.
- Hit reactions and look-at are cheap and add a lot of life.

---

## 3. Three routes (pick one)

| Route | What it is | Realism ceiling | Effort | Fits "0 assets"? |
| --- | --- | --- | --- | --- |
| **A. Smooth procedural** | Rounded/capsule body, 10–16 bones, PBR-lite, IBL, procedural textures | Stylized realistic | 1–2 weeks | Yes |
| **B. Authored base + procedural variation** | One good humanoid base mesh (Blender/MakeHuman) with morphs/skin, gear generated procedurally | High | 1–2 weeks + pipeline | No (one base asset) |
| **C. Full asset pipeline** | Several authored characters, rigs, animations, LODs, textures | Photoreal-ish | Months | No |

### Route A — smooth procedural (recommended first)

This is the natural continuation of the current generator. Replace `box()` body parts with rounded
volumes, add joints, switch to smooth normals and PBR-lite, add IBL, and skin the body. It preserves
the seed-driven variety and the "no authored assets" identity. The ceiling is "stylized realistic" —
think a smooth low-poly game character, not a film character.

### Route B — authored base + procedural variation

Build **one** neutral humanoid in Blender (or export one from MakeHuman [10]) with clean topology,
a 16-bone rig and UVs. Then the runtime still varies:
- body proportions via bone scaling/morph targets,
- skin/cloth palettes and textures,
- gear (procedural or a small authored kit),
- hair/headwrap/scarf variants.

This is the fastest way to a genuinely believable body. It costs one asset and a small pipeline, but
it removes the hardest part of procedural character modelling: topology, hands, faces and skin
weights. MakeHuman's base meshes are designed for this; check the licence for the exact asset you
ship. SMPL is the reference for parametric bodies but is licence-gated and heavier than we need [11].

### Route C — full pipeline

Only if "realistic" means matching a modern console game. It needs authored meshes, rigs, animation
clips, LODs, texture atlases, likely a DCC pipeline, and a much larger download. It is not compatible
with a mobile browser prototype built around runtime generation.

---

## 4. Recommended plan for Ashfall

### Pass R1 — silhouette, shading, light (1–2 days)

1. Characters become smooth-shaded (`flatShading: false`), with merged vertices.
2. Replace boxes with rounded boxes/capsules for torso, limbs, head, gear.
3. Add elbow/knee/wrist/ankle joints (even if still rigid groups).
4. Switch character material to `MeshStandardMaterial` with skin/cloth roughness.
5. Add `PMREMGenerator` + `RoomEnvironment` and ACES tone mapping.
6. Retune the palette under the new tone mapping; add a cool fill light.
7. Benchmark: draw calls, ms, and visual comparison at gameplay distance.

This is the highest-value pass and avoids touching the generator's data model.

### Pass R2 — skinned body (3–5 days)

1. Generate one smooth body mesh from cross-section rings along the skeleton (or merged capsules).
2. Add a 12–16 bone skeleton and per-vertex skin weights.
3. Keep gear parented to bones; add foot IK and head look-at.
4. Keep the three archetypes and proportion parameters on the skeleton.
5. Add idle/walk blending and spine counter-rotation.

### Pass R3 — face, hair, cloth, textures (3–5 days)

1. Rounded head, brow/nose/cheek/jaw, eye spheres, eyelids.
2. Hair/headwrap cards; scarf and coat layers.
3. Character atlas: albedo + normal + roughness for skin, cloth, leather, metal.
4. Optional blink/talk blendshapes.

### Pass R4 — authored fallback (implemented for the player head)

Author one base humanoid, keep the procedural variation on top. This is the pragmatic route to
"realistic" if the stylized-realistic ceiling is too low.

Implemented: the player's head is the MakeHuman `hm08` base mesh (CC0) with a procedural hair shell,
eyes/brows and the existing gear. The body stays procedural so the settlement/NPC pipeline keeps its
seeded variation. A full authored body is the next step only if the head/body style split becomes a
problem.

---

## 5. Mobile budget notes

- PBR + IBL + normal maps cost fragment time, not draw calls. A 512² character atlas and one
  environment map are cheap; SSAO/GTAO is the expensive part.
- Keep characters at 6–8 meshes (or one skinned mesh + gear) and **disable per-NPC shadow casting**
  as we already do.
- Use LOD: full skinned mesh near, 2-bone silhouette mid, billboard far. Do not add SSAO on LOW.
- Avoid strand hair, real subsurface scattering, cloth simulation and runtime mesh generation per
  frame.
- Measure on a real phone, not the desktop GPU; the current PERF lab is the instrument.

---

## 6. What not to do

- **Do not add polygons first.** A high-poly box still looks like a box.
- **Do not use `MarchingCubes` per character per frame.** It is a fun prototype tool, not a runtime
  character pipeline [9].
- **Do not chase photoreal skin** on a mobile browser; the budget goes into silhouette, light and
  animation instead.
- **Do not mix PBR characters with a Lambert world** without retuning the world's lighting and tone
  mapping; the characters will look pasted on.
- **Do not rebuild the body mesh every frame**; generate once per character, animate the skeleton.

---

## 7. Experiment plan

| # | Experiment | Pass condition |
| --- | --- | --- |
| 1 | Current box character vs rounded/smooth character, same palette and light | Rounded reads clearly more believable at gameplay distance |
| 2 | Flat vs smooth normals on the same geometry | Smooth is the expected winner; measure any shading artifacts |
| 3 | Lambert vs Standard + IBL | Standard + IBL grounds the character; measure ms |
| 4 | 6-bone vs 12-bone rig | Elbows/knees visibly improve walk and idle |
| 5 | 512² character atlas vs vertex colours | Texture removes the painted-plastic look; measure texture memory |
| 6 | ACES vs linear tone mapping on the whole scene | Scene retains its desert palette without washing out |
| 7 | Skinned body vs rigid capsules | Skinning wins at the shoulder/hip/knee; measure CPU/GPU |

---

## Sources

1. Three.js `SkinnedMesh` — skin indices/weights, skeleton binding.
   `node_modules/three/src/objects/SkinnedMesh.js`
2. Three.js `Bone` — skeleton hierarchy. `node_modules/three/src/objects/Bone.js`
3. Three.js `MeshStandardMaterial` — roughness, metalness, normal/roughness maps.
   `node_modules/three/src/materials/MeshStandardMaterial.js`
4. Three.js `RoundedBoxGeometry` — beveled boxes for gear and body masses.
   `node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js`
5. Three.js `CapsuleGeometry` — rounded limbs and joints.
   `node_modules/three/src/geometries/CapsuleGeometry.js`
6. Three.js `PMREMGenerator` — prefiltered environment maps for IBL.
   `node_modules/three/src/extras/PMREMGenerator.js`
7. Three.js `RoomEnvironment` — neutral studio environment for IBL.
   `node_modules/three/examples/jsm/environments/RoomEnvironment.js`
8. Three.js `GTAOPass` — ground-truth ambient occlusion (mobile-expensive).
   `node_modules/three/examples/jsm/postprocessing/GTAOPass.js`
9. Three.js `MarchingCubes` — organic/blobby geometry; prototype only.
   `node_modules/three/examples/jsm/objects/MarchingCubes.js`
10. MakeHuman — open-source humanoid base mesh and modeling application.
    <https://github.com/makehumancommunity/makehuman>
11. SMPL — skinned multi-person linear body model learned from scans (licence-gated).
    <https://smpl.is.tue.mpg.de/>
12. M. Pharr, W. Jakob, G. Humphreys, *Physically Based Rendering: From Theory to Implementation* —
    the reference for PBR/material response.
13. T. Akenine-Möller et al., *Real-Time Rendering* — character rendering, skinning, LOD, shading.
14. R. M. Smelik, T. Tutenel, R. Bidarra, B. Beneš, *A Survey on Procedural Modelling for Virtual
    Worlds*, Computer Graphics Forum 33(6), 2014 — where procedural character generation sits.
    <https://doi.org/10.1111/cgf.12276>
15. Three.js `BufferGeometryUtils.mergeVertices` — weld vertices for smooth normals.
    `node_modules/three/examples/jsm/utils/BufferGeometryUtils.js`
