# Features

Each folder is a vertical slice with one public `index.js`. A feature may import `core` and
`content`; it must not import another feature’s internals. Adapters and the app compose features.

Current slices:

- `survivors/` — activity/status derivation, job validation and newcomer/removal transitions.
  The legacy `npcs.js` adapter still owns movement, combat, rigs and save writes.
