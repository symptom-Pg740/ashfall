# Research

Notes from investigating problems before we build. One topic per file, findings first, sources at
the bottom. The point is to be able to re-open a note months later and know **what we decided, why,
and what we still don't know** — not to collect links.

## Index

| Topic | Status | Date | File |
| --- | --- | --- | --- |
| Orthographic camera: methods, trade-offs, and a config for Ashfall | Implemented (first pass) | 2026-10-28 | [orthographic-camera.md](orthographic-camera.md) |
| Procedural generation: terrain, scatter, buildings, characters, textures, shaders | Phase 0–6 first pass | 2026-10-28 | [procedural-generation.md](procedural-generation.md) |
| Character realism: silhouette, skinning, PBR, lighting, authored-base trade-off | R1–R4 + IK + far LOD + wardrobe implemented | 2026-10-28 | [character-realism.md](character-realism.md) |
| Firearms: hit resolution, tracers, auto-aim, weapon data and impact FX | Phase 3 slice: raid objective, cover reposition, shotgun | 2026-10-29 | [firearms.md](firearms.md) |

## Conventions

- `status` is one of: `open`, `researched`, `decided`, `implemented`, `stale`.
- Every non-obvious claim gets a source link or is marked **Judgement** (our reasoning, not a source).
- Numbers that will end up in code (angles, sizes, damping) go in a table, so they can be copied
  into a config instead of re-derived.
- If a note leads to code, link the files and line ranges it touches.
- Superseded notes are not deleted; they get `status: stale` and a line saying what replaced them.

## Template

```markdown
# Title

- Status: open
- Date: YYYY-MM-DD
- Question: one sentence
- Scope: what this note does and does not cover

## TL;DR

## Findings

## Options

## Recommendation

## Open questions

## Sources
```
