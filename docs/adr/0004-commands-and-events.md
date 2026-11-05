# ADR 0004 — Commands in, domain events out

- **Status:** accepted
- **Date:** 2026-11-05

## Context

The current code wires systems with many constructor callbacks (`onScrap`, `onWater`,
`onBuildComplete`, …). A single player action can call into several modules in an order that is only
visible in `main.js`.

## Decision

Player intent enters a feature as a command. The feature validates it and returns
`{ ok, reason?, events }`. Cross-feature reactions (audio, FX, toasts, objectives) subscribe to
domain events at the app boundary.

Use a direct function call when both sides are in the same feature and always happen together. Do
not turn internal implementation steps into events.

## Consequences

- Every rejected action has a reason code the UI can explain.
- The order of cross-feature reactions is explicit.
- Existing callbacks remain during migration; new code must not add another callback web.
