# Realism backlog

Items we want but are not building yet. The point of this file is to **not forget** them while the
command/economy work happens, and to make the cost explicit before anyone promises them.

Ground rules:

- Ashfall is stylised-realistic, not a simulation. Every item must survive a 30 fps mobile budget.
- Realism is judged from the **gameplay camera**: the orthographic top-down view at 0.8–2.2× zoom.
  Detail that cannot be seen from there is not worth its cost.
- Prefer items that change **readability and feel** (silhouette, timing, weight, sound space) over
  items that only add polygons.
- This file is a menu, not a sprint. Pick from it in Phase 7 of `docs/GAME_PLAN.md` and whenever a
  phase has spare budget.

---

## 1. Audio

Source and reasoning: `research/audio.md`. The hybrid engine (recorded close layers + synth
space/foley) is in place.

| Item | Why it matters | Cost | Notes |
| --- | --- | --- | --- |
| **Independent far tails** | A distant shot is mostly tail. One shared IR makes near and far feel like the same room. | M | Fire the close layer and a recorded/synth tail one-shot with separate delay and level. Kilborn/Splice recipe. |
| **Occlusion** | A shot behind an adobe house should be muffled, not just quieter. | M | Raycast shooter→listener; if blocked, low-pass ~700 Hz and drop 6 dB, with a short crossfade. |
| **Indoor IR** | Houses and the chapel currently sound like open desert. | S–M | Second `ConvolverNode` with a short, bright IR; blend by "is the listener indoors". |
| **More sample takes** | 2–3 takes per weapon is the current repetition limit. | S (asset) | Add 3–5 more close layers per gun; keep round-robin. Watch the download budget. |
| **Reload foley** | Reloads are synthesised clicks; the animation deserves matching metal. | S | Record or source mag-out/mag-in/bolt for pistol/rifle/shotgun; layer under the current clicks. |
| **Weapon raise/lower** | The gun currently snaps between poses. | S | Cloth + sling + a small metal tap on equip. |
| **Footstep variety** | One sand crunch per step becomes obvious. | S | 4–6 variants, weight by speed; gravel/wood indoors. |
| **Ghoul vocalisation** | The main enemy is silent. | M | Formant synthesis (glottal pulse + 3 band-passes) or a small set of CC0 moans; distance-filtered. |
| **Human voice barks** | Orders and reactions would make command mode feel alive. | M–L | Formant synthesis per `research/audio.md`; keep to 10–15 short barks. |
| **Ambience zones** | Wind is global today. | S | Crossfade wind/room tone by camp vs ruins vs mesa; add fire crackle near the campfire. |
| **Shell casings by weapon** | Rifle, pistol and shotgun should drop different brass/hulls. | S | Geometry/colour per calibre; shotgun red hull. |
| **Suppression audio** | Near-miss cracks and whizz-bys sell incoming fire. | M | Random supersonic crack + whine on near misses; duck the mix briefly. |
| **Music / stinger** | Raid start, nightfall, victory need a musical beat. | M | Sparse procedural drone + percussive stinger, no melody loop. |

---

## 2. Visuals and animation

Source: `research/character-realism.md` and the current skinned rig.

### Characters

| Item | Why | Cost |
| --- | --- | --- |
| **Proper walk/run cycles** | The current gait is procedural and reads stiff at close zoom. | M |
| **Aim and reload poses per weapon** | Pistol/rifle/shotgun share one pose; the sawn-off needs a break-action reload. | M |
| **Hit reactions** | Units flinch but do not stagger by hit direction. | S |
| **Death variation** | One collapse; add 2–3 directional falls and a downed crawl. | M |
| **Facial detail** | Eyes/brows exist; add blink, jaw, simple expressions for barks. | M |
| **Hair/cloth secondary motion** | Scarves and coats are rigid. | M |
| **Hand/finger grip** | Hands are mitts; fingers on the grip/foregrip would read at 2× zoom. | M |
| **Gear fit per body archetype** | Some pauldrons/backpacks float on lean/tall bodies. | S |
| **Wound/bandage decals** | Units at low HP should look hurt. | S |
| **Unit role silhouettes** | Scavenger/guard/engineer should read at a glance (pack, helmet, tool belt). | M |

### World and materials

| Item | Why | Cost |
| --- | --- | --- |
| **Contact shadows / AO under units** | Grounds characters without another shadow map. | S |
| **Dirt and wear masks** | Buildings and gear are clean; dust accumulation sells the wasteland. | M |
| **Wind-blown dust sheets and devils** | The plain is static between gusts. | M |
| **Tracks** | Footprints and wheel ruts around the camp. | S |
| **Smoke columns** | Campfire/chapel smoke visible from afar, a navigation landmark. | S |
| **Night lighting** | Warm pools, blue ambient, lit windows, turret lamp. Part of Phase 3. | M |
| **Interior props** | Houses are shells; a table/bed/crate inside rewards the top-down peek. | M |
| **Vegetation variation** | Cacti/shrubs repeat; add scale/colour/lean variation. | S |
| **Weather** | Sandstorm: fog, wind audio, reduced visibility, turret accuracy drop. | L |

### Presentation

| Item | Why | Cost |
| --- | --- | --- |
| **Order feedback** | Dotted path, destination marker, "AFFIRMATIVE" bark. | S |
| **Selection readability** | Ring + silhouette + roster highlight; selected unit should pop. | S |
| **Diegetic HUD** | Less overlay, more in-world markers (power lamps, storage crates). | M |
| **Damage direction** | A directional arc when hit from off-screen. | S |
| **Slow-motion kill** | A very short hit-stop already exists; a rare 0.2 s zoom is a taste call. | S |

---

## 3. Simulation

These change the game, not just the look. Treat them as design features with balance work.

| Item | Why | Cost | Phase |
| --- | --- | --- | --- |
| **Bullet travel time** | Hitscan is fine at 35 m, but travel + drop would make long shots feel real. | M | after Phase 4 |
| **Suppression** | Raiders already flinch; add a real pinned state that lowers accuracy and forces cover. | M | Phase 4 |
| **Wounding/bleeding** | A downed unit that can be stabilised by a medic creates rescue gameplay. | M | Phase 5 |
| **Carry weight** | Heavier loads slow units; makes hauling a choice. | S | Phase 2 |
| **Needs (food/water/sleep)** | The backbone of a survival camp; without it the economy is only build costs. | M | Phase 5 |
| **Morale/fear** | Ghouls should scare units; guards hold, scavengers flee. | M | Phase 5 |
| **Fire spread** | Campfires, chapels and dry grass; a raid can start a fire. | L | later |
| **Structural damage** | Raiders break poles/warehouse walls; repairs become a job. | L | Phase 5 |
| **Weather effects** | Sandstorm reduces vision/accuracy and solar output. | M | Phase 6 |
| **Wildlife** | Neutral creatures for food/ambience; a reason to hunt. | M | Phase 6 |
| **Faction reputation** | Neutral traders/raiders react to your choices. | L | post-launch |

---

## 4. Command-layer realism

| Item | Why | Cost |
| --- | --- | --- |
| **Radio range** | Orders only reach units within a relay/radio radius; scouts need autonomy. | M |
| **Fog of war / vision** | Units see a radius; buildings block vision; the map is unknown until scouted. | L |
| **Unit autonomy** | Idle guards patrol, scavengers resume work, engineers repair. | M |
| **Comms chatter** | Short barks confirm orders and call contacts. | M |
| **Chain of command** | A sergeant unit extends order range and rallies morale. | L |

---

## 5. Deliberately not doing

To protect the schedule and the mobile budget:

- Full ragdoll physics and per-bone death simulation.
- Photogrammetry/PBR megascan materials.
- Facial motion capture or lip-sync.
- A full ballistic solver with wind/penetration tables.
- Real-time global illumination or volumetric fog.
- A dynamic day/night with weather simulation at weather-sim fidelity.
- Voice-acted dialogue.
- Multiplayer or netcode.

---

## 6. Priority shortlist

If Phase 7 gets one week, do these in order:

1. **Independent far tails + occlusion** (audio space; biggest realism per hour).
2. **Hit reactions + death variation** (combat readability).
3. **Contact shadows + dirt/wear masks** (grounding).
4. **Reload/raise foley + footstep variety** (moment-to-moment texture).
5. **Night lighting polish** (if Phase 3 shipped a rough version).
6. **Ghoul vocalisation** (the enemy stops being silent).

Everything else waits for a real-device playtest and a budget decision.
