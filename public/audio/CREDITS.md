# Audio credits

The game synthesises almost everything, but the **gunshot close layer** uses six short recordings
so the shots read as real firearms rather than filtered noise.

## Gunshot recordings

- **Source:** "Gunshot Sounds" by Tabasco (Vincent Sevedge), OpenGameArt.org
  - https://opengameart.org/content/gunshot-sounds
- **Original archive:** `sounds.zip` (CZ-52 pistol, Mosin Nagant rifle, SKS rifle, shotgun)
- **License:** the OpenGameArt submission is marked **CC0**; the archive also carries a
  **CC BY 3.0** notice (`Copyright (c) 2009 Vincent Sevedge`). We credit the author and treat the
  recordings under CC BY 3.0 to satisfy both.
  - https://creativecommons.org/licenses/by/3.0/

## Edits

Each take was cut around a single shot (25 ms pre-roll), mixed to mono, peak-normalised to −1 dBFS,
faded in/out, resampled to 44.1 kHz and encoded to MP3 at 192 kbps. No other processing.

| File | Original | Notes |
| --- | --- | --- |
| `pistol-cz-1.mp3` | `cz.wav` at 2.82 s | CZ-52 pistol |
| `pistol-cz-2.mp3` | `cz.wav` at 5.54 s | CZ-52 pistol, second take |
| `rifle-mosin-1.mp3` | `mosin.wav` at 0.43 s | Mosin Nagant |
| `rifle-mosin-2.mp3` | `mosin.wav` at 5.98 s | Mosin Nagant, second take |
| `rifle-sks-1.mp3` | `sks.wav` at 2.29 s | SKS, third rifle variant |
| `shotgun-1.mp3` | `shotty.wav` at 0.03 s | single shotgun blast |

If the files are missing or fail to decode, `src/audio.js` falls back to the fully synthesised
gunshot for that weapon.
