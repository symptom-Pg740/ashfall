# ADR 0003 — No ECS rewrite

- **Status:** accepted
- **Date:** 2026-11-05

## Context

ECS is often proposed as the answer to growing game complexity. Ashfall has roughly six survivors,
a few raiders, dozens of ghouls and a handful of buildings. Most complexity is in jobs, morale,
assignments and interactions, not in iterating thousands of identical entities.

## Decision

Use plain objects and explicit feature systems. Do not introduce an ECS, archetype storage or a
component query language. Use ECS only if a future feature has hundreds of homogeneous entities
where profiling proves the iteration cost matters.

## Consequences

- Behaviour stays close to its data and is easier to debug.
- No generic component/query boilerplate.
- If a performance-critical population appears (for example hundreds of projectiles), it can get a
  local data-oriented implementation without rewriting the rest of the game.
