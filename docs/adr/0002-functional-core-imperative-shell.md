# ADR 0002 — Pure core rules, imperative adapters

- **Status:** accepted
- **Date:** 2026-11-05

## Context

Game rules currently live beside Three.js geometry, DOM updates and `localStorage`. This makes rules
hard to test and causes the UI and simulation to disagree about what is allowed.

## Decision

Rules that decide *what happens* live in `src/core/` as pure functions over plain data. Three.js,
DOM, audio, input and storage live in adapters. The app composes them.

Core code must not import `three`, `window`, `document`, `localStorage`, `navigator` or
`requestAnimationFrame`, and must not read or write view objects.

## Consequences

- Rules can be tested in Node without a browser.
- UI and simulation share the same `canX` predicates.
- Some duplication is acceptable during migration: legacy modules may still mutate state until their
  feature is migrated, but new rules go to core first.
