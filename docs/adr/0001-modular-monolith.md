# ADR 0001 — Modular monolith, not microservices or a framework

- **Status:** accepted
- **Date:** 2026-11-05

## Context

Ashfall is a single-player browser game with one deployment unit. The codebase grew from a
prototype into a settlement game, but it is built and maintained by one human architect plus AI
agents. There is no team, server or independent scaling requirement.

## Decision

Keep one Vite/Three.js deployment and split it internally by business area:

```
core <- content <- features <- adapters <- app
```

Each feature exposes a small public `index.js`. The composition root (`app/`) is the only place that
wires features together. No microservices, no separate repositories, no plugin framework, no DI
container.

## Consequences

- Refactors are local and reviewable.
- The whole game remains easy to run and deploy.
- Module boundaries must be enforced by review and a boundary checker, because the compiler will not
  enforce them in JavaScript.
- A future platform build (Capacitor/Tauri/PWA) can wrap the same app without changing game rules.
