# Art direction: mud, scrap and the old world

**Status:** style guide for the current build and all new buildings. The existing settlement will be
re-skinned as new structures are added; this is not a one-pass art overhaul.

Two visual languages, one rule: **a player-built structure must be recognisable as human, low-tech
and hand-made; old-world ruins must look like they were built by a civilisation that had concrete,
glass and electricity.**

---

## 1. The settlement language — mud + scrap

The camp is built by people with no industry. The materials are whatever the ground and the ruins
give them:

- **Mud brick / adobe** — the primary wall. Earth tones, hand-smoothed, slightly uneven, patched.
  Mud is the constant: humans have built with it for millennia and it needs no supply chain.
- **Stone footings** — rough local stone for foundations and thresholds.
- **Scrap metal** — corrugated sheets, car panels, road signs, barrel lids, bent plate. Used for
  roofs, patches, doors, shutters, reinforcing and gutters. Dented, rusted, mismatched.
- **Timber and poles** — salvaged beams, pallets, branches, telephone poles. Visible joins, rope,
  wire, nails.
- **Tarps and cloth** — canvas, curtains, sacks, shade cloth; sun-bleached.
- **Tires, barrels, crates, sandbags** — reused containers and furniture.
- **Hand paint and chalk** — signs, arrows, tallies, warnings. Uneven, not corporate.
- **Salvaged tech** — solar panels, batteries, turret parts, tools: old-world components mounted on
  mud-brick and scrap frames. The tech is a find, not a manufacture.

### Silhouette and roof rules

- Low, thick walls; small windows; heavy doors; roofs that look repaired rather than designed.
- Flat mud roofs with parapets, or a scrap lean-to/pitched sheet over a mud box.
- Visible structure: posts, beams, braces, guy wires, ladders.
- Add one readable silhouette feature per building (a wheel, a chimney, a hopper, a sign, a cart).
- No clean glass curtain walls, neon, polished concrete, chrome or sci-fi panels on player buildings.

### Palette

- Earth: sand, ochre, terracotta, mud brown, straw, ash.
- Scrap: rust, oxidized steel, dull aluminium, faded paint (red, blue, green), galvanized grey.
- Accents: one faded human colour per building (a painted door, a tarp, a sign). Do not rainbow the
  camp.
- Lighting: warm sun, dusty air, deep shadow; at night, warm firelight and cold moonlight.

---

## 2. The old-world language — ruins and landmarks

Ruins are the previous civilisation. They can be any pre-apocalypse shape: concrete, rebar, glass,
asphalt, signage, vehicles, street furniture, power lines, billboards, tiled floors, steel frames.

- Sharper, thinner, more regular geometry than the camp.
- Concrete grey, faded white, rust streaks, broken glass, exposed rebar.
- Collapsed roofs, cracked slabs, missing walls, vegetation reclaiming interiors.
- Signs and markings with a corporate/industrial vocabulary; no attempt to repair them in mud.

These are landmarks and scavenging sites, not player-buildable. Do not let the player place a clean
concrete building; if a ruin is reused, it should look occupied and patched with scrap.

---

## 3. The exception: salvaged technology

Solar arrays, batteries, the Vickers turret, the workshop bench and the relay are **old-world tech**.
They are allowed to look precise and mechanical, but they must be mounted on a camp-made base:

- a solar panel on a scrap frame and mud plinth;
- a battery bank in a mud alcove with scrap straps;
- a Vickers on a tripod with sandbags and a scrap shield;
- a workshop bench bolted to a mud wall, with a hand-cranked press.

This preserves the lore: the camp cannot manufacture high tech, only salvage, mount and maintain it.

---

## 4. Building kit and details

Every new camp building should include at least:

1. a mud-brick or stone base,
2. one scrap-metal element,
3. one timber/rope element,
4. one human detail (sign, cloth, tool, chair, tally),
5. a distinct silhouette feature.

Suggested additions:

- **Builder props** — builders are a role, not a building: use a tool rack, plank stack and chalk
  plan as camp props or inside the Workshop.
- **Scavenger Hut** — low mud hut, scrap lean-to, hand cart, hanging cans, sorted piles.
- **Well Wheel** — stone/mud well ring, timber axle, scavenged wheel rim, trough, wet patch.
- **Farm** — mud-brick plot, scrap irrigation channels, scarecrow, sacks, hoe, dry stalks.
- **Workshop** — mud shed, corrugated roof, bench, press, tool wall, ammo crates, hand-painted sign.
- **Warehouse** — the existing shed should gain mud texture, scrap roof patches and a big faded
  supply sign; its crates stay.
- **Watchtower** — timber/scrap tower, sandbags, ladder, lantern, rope.
- **Chapel** — adobe, reused bell, cloth, candles; the most "built" building, still mud.
- **Barricade** — scrap sheet, tires, sandbags, wire, pallet.
- **Rain catcher** — scrap funnel, tarp, barrel, mud plinth.

---

## 5. Wear, dirt and readability

- Dust settles on horizontal surfaces; mud walls have patch repairs, straw flecks, cracks.
- Scrap has rust streaks running down from fixings; paint fades from the top.
- Contact darkening at wall bases and under roofs; no floating props.
- From the gameplay camera (orthographic, 0.8–2.2× zoom), silhouette and colour contrast matter more
  than small geometry. Test every building at 2× before adding detail.
- Keep the building footprint readable: the player must see where the walls/doors are for pathing.

---

## 6. Rules of thumb

1. If a player building could be dropped into a modern city, it is wrong.
2. If a ruin could be built by the camp, it is too soft.
3. Mud is the human constant; scrap is the adaptation; old-world tech is the salvage.
4. One accent colour per building; the rest is earth and rust.
5. Every building needs a reason to look the way it does (a wheel for water, a hopper for grain, a
   rack for tools), not decoration for its own sake.
6. The camp should read as **lived in**, not as a set: patches, clutter, repairs, signs, shade.

---

## 7. Current-build notes

- The adobe house, campfire, chapel and tower are already in the language; add scrap patches and
  human details where cheap.
- The warehouse is the most "clean" building and should be re-skinned first.
- Solar/battery/turret are acceptable as salvaged tech, but their mounts should look camp-made.
- Ruins and landmarks (bus, adobe ruin, piano, wrecked cars) stay old-world and are not re-skinned.
- New buildings in `docs/ECONOMY.md` must be modelled to this guide from the start.
