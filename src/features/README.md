# Features

Each folder is a vertical slice with one public `index.js`. A feature may import `core` and
`content`; it must not import another feature’s internals. Adapters and the app compose features.

Current slices:

- `survivors/` — activity/status derivation, job phases, work loops, roster and newcomer rules.
  The legacy `npcs.js` adapter still owns movement, combat, rigs and save writes.
- `economy/` — the camp stockpile (scrap/water/food/components), capacity and atomic spending.
  Legacy modules keep the flat `state` fields for the HUD/save format, but only `Economy` writes them.
