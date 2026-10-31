# Performance notes — 180 m world

**Status:** Phase 7 first slice. The goal was to decide whether the expanded 180 m map actually
needs chunk streaming, and to remove any obvious waste before a physical-device test.

## What was measured

Headless Chrome, default landscape view, quality presets forced through `?quality=low|balanced|high`:

| Preset | Draw calls | Rendered triangles | Internal scale / DPR |
| --- | ---: | ---: | --- |
| High (before Phase 7) | 78 | ~351k | 1.0 / 1.375 |
| High (after) | 91 | ~322k | 1.0 / 1.375 |
| Low (after) | 60 | ~199k | 0.62 / 0.68 |

The headless frame rate was not stable enough to be a phone result (browser/GPU scheduling). Treat
the counts as the useful signal, not the fps number.

## What changed

- **Chunked prop culling.** Rocks and grass — the two largest static instanced groups — are split
  into 55 m spatial chunks with their own bounding spheres. Off-screen chunks are culled from both
  the main pass and the shadow pass. The rest of the scatter stays as one instanced mesh; splitting
  every small category only added draw calls.
- **Terrain:** 176 → 144 segments (62k → 42k triangles). The 300 m plane still reads smoothly at the
  gameplay camera; no seams or visible facets at 0.8–2.2× zoom.
- **Device tiers:** a saved/forced preset wins; otherwise mobile with ≤3 GB or ≤4 cores gets **low**,
  other mobile gets **balanced**, and desktop with ≥8 GB/8 cores gets **high**. `?quality=` forces a
  preset for tests. Manual quality changes persist in `localStorage`.
- **Adaptive resolution** remains the safety valve. Low starts at 0.62 scale and can drop to the
  existing floor; the HUD/perf panel reports the live scale and DPR.

## What was deliberately not done

- **No full world streaming.** At ~200–320k triangles, 60–91 draw calls and a 180 m disc, a streamed
  chunk manager would add save/serialization, chunk seams and streaming hitches for little gain. The
  world is one terrain mesh plus culled instanced chunks, which is the right size for this map.
- **No terrain tiling.** The terrain is one 300 m mesh (42k triangles). Splitting it would save some
  off-screen triangles but would require tile skirts/seams and a second LOD; not justified yet.
- **No entity occlusion.** Buildings still fade over the player; props do not occlude actors. This is
  a correctness/readability feature, not a measured bottleneck.

## Revisit when

Promote streaming to a real phase if any of these happen on the target phone:

1. steady-state draw calls exceed ~180;
2. the scene budget exceeds ~450k triangles at the gameplay camera;
3. terrain memory or initial bake time becomes noticeable on a low-tier device;
4. the playable radius grows past ~140 m.

The current bake is roughly 0.65 s for the 416² field; the map load is dominated by procedural
scatter and character rigs, not network assets.
