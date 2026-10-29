# Audio: realistic gunfire and world sound without assets

- **Status:** procedural engine implemented (layered shots, generated reverb, impacts, reload,
  footsteps, wind, mute). The honest ceiling of pure synthesis and the sample-pack upgrade path are
  documented below.
- **Date:** 2026-10-29
- **Question:** What is the best way to make convincing gunfire and combat foley for Ashfall, a
  mobile-first WebGL game whose identity is "every asset generated at runtime"?

---

## 1. What a real gunshot is made of

A gunshot is not one sound. The waveform a microphone captures is a sum of physical events:

1. **Muzzle blast.** The propellant gases leave the barrel as a supersonic, highly directional
   pressure pulse (an N-wave). It is the loudest and lowest-frequency part and carries the "boom".
2. **Ballistic shockwave / crack.** A supersonic bullet drags a cone-shaped shock front. Heard from
   the side it is a sharp, high-frequency "crack" that arrives separately from the muzzle blast and
   is absent for subsonic ammunition.
3. **Mechanical action.** The bolt, slide, hammer and trigger produce dry metallic clicks a few
   milliseconds after the shot. They are quiet alone but tell the ear the object is a machine.
4. **Environment.** The report reflects off the ground, walls, vehicles and terrain. Outdoors this
   is a short slap plus a long, dark rolling tail; indoors it is dense flutter and early returns.
5. **Propagation.** Air absorbs high frequencies faster than lows, so distance removes the crack
   first and leaves a low thump; sound also takes time to arrive (≈343 m/s). A shot 100 m away is
   heard ~0.29 s late and much duller.

The physical modelling literature treats these as separate sources. Hacıhabiboğlu's chapter
*Procedural Synthesis of Gunshot Sounds Based on Physically Motivated Models* builds a gunshot from
the muzzle blast, the ballistic shockwave, the action and the environment, and cites measurements of
small-firearm waveform variation (Beck et al., *JASA* 2011) and ISO 9613-1 atmospheric absorption as
the parts that matter. That decomposition is also exactly how sound designers layer recordings.

## 2. How shipped games actually build them

The industry consensus is **layers plus variations**, not a single clip:

- **Mark Kilborn (Call of Duty, Forza), Pro Sound Effects breakdown:** body, transient, sub/LFE,
  mechanical and tail layers, routed separately in a DAW before rendering.
- **Splice's weapon-design guide:** mechanics, low end, close detail, far detail, tail. Player
  weapons get the full stack; **NPC weapons are reduced to close + distant detail** so they do not
  eat the frequency space or CPU of the player's gun.
- **Variation is mandatory.** Each layer gets several takes; pitch and volume are randomised per
  shot, and layers are nudged by a few milliseconds so transients do not sum into a single clipping
  spike. Otherwise repeated fire becomes the "machine-gun effect".
- **Distance is a filter, not just a volume.** Games low-pass distant shots, delay the onset and
  let the tail carry. A shot that is only quieter sounds like a smaller gun, not a farther one.

The open-source *Claude-of-Duty* procedural engine (zero audio files) is a useful existence proof:
seven synthesis layers (transient, body, crack, mechanical, tail/boom), six round-robin timbre
variants per weapon, and procedurally generated convolution impulse responses. It is the closest
public architecture to what Ashfall needs.

## 3. Browser implementation options

| Approach | Realism | Assets | CPU | Fit for Ashfall |
| --- | --- | --- | --- | --- |
| Recorded multi-samples + randomisation | Highest | Large (dozens of MB) | Low | Best final quality, breaks "0 assets" |
| Layered Web Audio synthesis | Good for stylised/mid-fi | None | Low–medium | **Chosen for now** |
| Physical/model-based synthesis (research) | High in papers | None | High, hard to tune | Not practical on mid mobile |
| Hybrid: synth body/tail + recorded transient | Very high | Small (a few short WAVs) | Low | **Recommended next step** |
| Convolution reverb | Essential for space | IR file or generated | Medium | Generated IR, done |

Web Audio gives the primitives needed:

- `AudioBufferSourceNode` for pre-baked noise colours (white/pink/brown), started at random offsets.
- `BiquadFilterNode` for the crack band-pass, body low-pass sweep and air absorption.
- `WaveShaperNode` for saturation that makes the body read as pressurised air rather than filtered
  noise.
- `OscillatorNode` sweeps for the sub thump and mechanical resonances.
- `ConvolverNode` with a **generated impulse response** for the tail. The standard recipe is
  exponentially decaying noise, but the convincing version adds discrete early-reflection taps and a
  frequency-dependent decay so the highs die first (the same recipe used by the procedural engines
  above).
- `DynamicsCompressorNode` on the master bus so overlapping layers and raids do not clip.
- `StereoPannerNode` from the camera-right axis for the stereo image, plus a distance delay
  (`distance / 343`) and low-pass.

## 4. What Ashfall now does

`src/audio.js` synthesises each shot from six layers, picked from four pre-jittered variants per
weapon:

| Layer | Source | Role |
| --- | --- | --- |
| Transient | white noise, high-pass 1.5–2.4 kHz, <15 ms | the "now" click |
| Crack | band-passed noise sweeping 2.9→2.1 kHz (pistol), 2.1→1.3 kHz (rifle), 1.4→0.8 kHz (shotgun) | supersonic/calibre signature |
| Body | pink noise through a falling low-pass (1.9→0.4 kHz) and `tanh` saturation | chest of the report |
| Sub | sine sweep 155→54 Hz (pistol), 120→38 Hz (rifle), 100→32 Hz (shotgun) | pressure wave |
| Mechanical | two metallic partials + a noise click, delayed 32–60 ms | bolt/action |
| Tail | generated open-desert IR through a `ConvolverNode`, send scaled by weapon and distance | space |

Supporting behaviour:

- **Round-robin + jitter.** Four variants per weapon, plus per-shot random noise offsets, pitch
  jitter and filter drift, so a 360 rpm pistol does not loop.
- **Distance.** Gain falls with `1/(1 + d/14)`, a low-pass closes with distance, the shot is delayed
  by `d/343`, and the wet send rises. Far shots swap the mechanical layer for a low rolling boom.
- **Stereo.** Pan comes from the camera-right axis, so a raider on screen-right fires on the right.
- **NPC economy.** Raiders get the same call, but at their usual 15–30 m the click and action are
  already filtered out; the player's gun keeps the detail.
- **Reverb.** A 1.5 s stereo IR is generated once at start: decaying noise with a falling cutoff plus
  six band-limited early-reflection taps, normalised to a fixed send level.
- **Master chain.** Dry + wet → compressor (−16 dB, 7:1) → master gain 0.5 → destination. Muting
  persists in `localStorage` and is exposed as **SOUND** in the PERF panel.
- **Other sounds.** Impacts per surface (click + body thump + material texture + metal ring/debris),
  reload (three or four mechanical beats), dry-fire click, casing tink, footstep sand crunch on the
  player's gait, and a low wind bed with two slow LFOs.
- **Quality.** `low` disables the reverb send, the mechanical layer and the wind bed.

## 5. Verification

The graph was measured in a live Chrome page by attaching an `AnalyserNode` to the compressor and
reading peak/RMS after each trigger (48 kHz):

| Sound | Peak | RMS |
| --- | --- | --- |
| Pistol, 0 m | 0.43 | 0.141 |
| Rifle, 0 m | 0.75 | 0.249 |
| Shotgun, 0 m | 1.04 | 0.309 |
| Rifle, 40 m | 0.42 | 0.128 |
| Stone impact, 2 m | 0.65 | 0.125 |
| Sand impact, 3 m | 0.70 | 0.081 |
| Rifle reload | 0.32 | 0.077 |
| Footstep | 0.10 | 0.009 |
| Dry fire | 0.25 | 0.068 |

The relative levels are deliberate: the shotgun is the heaviest, distance costs the rifle roughly
6 dB of RMS, foley sits well under gunfire, and footsteps are almost subliminal. The final master
gain of 0.5 keeps the compressor overshoot (shotgun peak 1.04 pre-master) below full scale.

`?audiotest=1` plays the whole set in sequence for a quick listening pass.

## 6. Honest assessment

Layered synthesis now has the right *structure* — transient, crack, body, sub, action and a real
convolution tail — and it is clearly better than the previous two-layer burst. But the ceiling of
pure synthesis is "convincing stylised gunshot", not "indistinguishable from a recording". The
elements that sell realism most are:

1. a recorded **transient + body** from the actual calibre,
2. a recorded **tail** from a real outdoor space,
3. many variations of both.

Those are exactly the parts synthesis approximates least well. If Ashfall wants true realism, the
pragmatic upgrade is a **hybrid**: keep the generated sub/mechanical/space layers, but load a small
set of CC0 gunshot transients (two or three per weapon, a few hundred KB total) and randomise them.
That keeps the download small and the code procedural, but breaks the literal "0 asset files" line
in the README. The alternative — a full commercial library (e.g. the King Collection) — is the
film/game industry answer but adds tens of MB and licensing.

Other next steps that would help more than more synthesis layers:

- **Occlusion** — low-pass + gain when a building blocks the line from shooter to listener.
- **Indoor IR** — a second convolver for interiors; the settlement has houses.
- **Tails as separate one-shots** — the Kilborn/Splice approach: fire the close layer and the tail
  with independent delays and levels.
- **More foley** — cloth, gear rattle, weapon raise/lower, ghoul vocalisations.
- **Voice barks** — formant synthesis is feasible (glottal pulse + three band-pass formants), which
  would do more for the scene than another gunshot layer.

---

## Sources

1. H. Hacıhabiboğlu, "Procedural Synthesis of Gunshot Sounds Based on Physically Motivated Models",
   in *Game Dynamics*, Springer, 2017. DOI 10.1007/978-3-319-53088-8_4.
2. S. D. Beck, H. Nakasone, K. W. Marr, "Variations in recorded acoustic gunshot waveforms generated
   by small firearms", *J. Acoust. Soc. Am.* 129(4), 2011. DOI 10.1121/1.3557045.
3. ISO 9613-1:1993, *Acoustics — Attenuation of sound during propagation outdoors — Part 1:
   Calculation of the absorption of sound by the atmosphere*.
4. G. B. Whitham, "The flow pattern of a supersonic projectile", *Comm. Pure Appl. Math.* 5(3), 1952.
5. M. Kilborn, "How to Sound Design First-Person Shooter Gunshot Sound Effects", Pro Sound Effects
   blog. https://blog.prosoundeffects.com/how-to-sound-design-first-person-shooter-gunshot-sound-effects-with-mark-kilborn
6. "How to design a weapon sound for video games", Splice blog.
   https://splice.com/blog/design-weapon-sound-video-games/
7. *Claude-of-Duty* procedural audio architecture (zero audio files, seven-layer shots, generated
   IRs). https://deepwiki.com/mshumer/Claude-of-Duty/10.1-audio-synthesis-and-dsp
8. MDN, `ConvolverNode`. https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode
9. BBC R&D, "gunfire.coffee" Web Audio prototype (noise + envelope + distance low-pass).
   https://webaudio.prototyping.bbc.co.uk/docs/gunfire.html
10. D. B. Lloyd, N. Raghuvanshi, N. K. Govindaraju, "Sound Synthesis for Impact Sounds in Video
    Games", ACM I3D 2011. https://dl.acm.org/doi/pdf/10.1145/1944745.1944755
