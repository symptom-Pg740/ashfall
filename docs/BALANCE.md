# Balance sheet — prototype tuning

**Status:** Phase 7 first balance pass. Every number here is provisional and meant to be changed
after playtests. The target run is **20–30 minutes**: start with three survivors, build the
workplaces, craft components, raise and power the relay, and hold the final assault.

## Target shape

- **First 10 minutes:** place a Scavenger Hut and Builder's Yard-equivalent role, stabilise water and
  food, build a Workshop, start ammo production.
- **Next 10 minutes:** grow to 4–6 survivors, build the relay, connect power, craft 8 components.
- **Final 2–4 minutes:** power check, activation, 90-second hold with mixed raider/ghoul waves.

The camp should not starve when it is staffed correctly, but staffing is the real cost: every
worker is a fighter or hauler who is not doing something else.

## Economy (current values)

| Item | Value | Notes |
| --- | --- | --- |
| Starting stores | 26 scrap, 4 water, 4 food | 3 survivors, about one day of food/water |
| Scavenger pile | 6–12 scrap, 55 s respawn | 46 piles across the 180 m disc |
| House | 18 scrap, +1 scrap / 9 s, +1 survivor cap | base cap 3, max 6 |
| Warehouse | 22 scrap, +120 capacity | scrap/water/food share the numeric capacity |
| Well Wheel | 20 scrap, 1 worker, +1 water / 4 s | Rain Catcher is the passive +1 / 6 s |
| Farm | 24 scrap, 2 workers, +1 food / 7 s per farmer, −1 water / 20 s | stops at `NO WATER` |
| Workshop | 26 scrap, 2 artisans | 8 s per round/shell recipe; 12 s per component |
| Pistol rounds | 4 scrap → 12 | cap 144 |
| Rifle rounds | 6 scrap → 6 | cap 48 |
| Shells | 5 scrap → 4 | cap 32 |
| Components | 8 scrap → 1 | cap 40; relay needs 8 |
| Relay | 40 scrap + 8 components, 520 HP | power consumer 0.8, priority 6 |
| Upkeep | 1 food + 1 water per living survivor per dawn | 2 unfed dawns → leaves |
| Recruitment | 2 spare food/water per survivor, free cap slot, every 2–3 days | arrives as a scavenger |

A full relay chain is therefore roughly **26 (workshop) + 40 (relay) + 64 (8 components) = 130
scrap**, before wires, ammo and repairs. Scavenging, houses and raid rewards must cover the gap.

## Final assault

- Initial wave: **4 raiders + 5 ghouls**; raiders prioritise the relay and campfire, ghouls press
  the player.
- A new wave every **20 s** while the hold is above 10 s; raiders cap at the 5-person pool, ghoul
  counts scale with the wave.
- **Hold: 90 s.** Losing relay power pauses the hold; it does not cancel it.
- Relay 520 HP and campfire 260 HP are deliberately higher than ordinary buildings so a few seconds
  of inattention do not instantly end the run. The 90 s hold is the real test.
- Defeat: campfire destroyed, relay destroyed during the assault, or every survivor leaves.

## What to watch in a playtest

1. **Time to first workshop** — should be under ~8 minutes on a fresh run.
2. **Scrap starvation** — if the relay chain takes more than ~15 minutes of pure scavenging, raise
   house/scavenger output or lower component cost.
3. **Ammo drought** — the player should feel the workshop before the final, not during it. If the
   guard is always dry, lower recipe scrap or raise starting reserves.
4. **Final assault length** — 90 s should feel tense, not like waiting. If the camp is never
   threatened, increase wave size; if the relay dies in under 10 s, raise relay HP or lower raider
   building damage.
5. **Food/water pressure** — currently generous when staffed. If upkeep never matters, reduce
   production or increase consumption; if it is tedious, leave it and rely on manpower/raids.

## Known imbalance at this commit

- Well and farm output comfortably exceed a 6-person camp's dawn upkeep. The intended pressure is
  staffing and raids, not starvation.
- The final assault's difficulty has not been human-playtested end-to-end.
- No morale, wounds or weather yet; those can add pressure without changing the economy table.
