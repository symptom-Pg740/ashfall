import { box, cyl, merge, bakeBaseAO, PALETTE } from './geo.js';

/**
 * Modular adobe-house kit.
 *
 * Assembly mirrors the CGA-shape idea without the grammar: a footprint is split into bays, each
 * facade bay gets a door/window/blank panel, then a roof, parapet, beams, porch and clutter are
 * attached. The style pack is data; the RNG decides the variant.
 */
export const ADOBE_STYLE = {
  walls: ['#b9543c', '#c26448', '#a94a35', '#b85f42'],
  wallDark: '#963f2d',
  trim: '#efddba',
  roof: '#b78f5d',
  roofDark: '#8f6a44',
  stone: '#b6a184',
  wood: PALETTE.wood,
  woodDark: PALETTE.woodDark,
  dark: '#2f2821',
  shutters: ['#4f7d8d', '#3f6b73', '#5d7f63', '#557f8f'],
};

function frontWindow(p, x, y, z, shutter, style) {
  p.push(box(0.62, 0.72, 0.07, style.dark, x, y, z));
  p.push(box(0.76, 0.09, 0.1, style.trim, x, y + 0.4, z + 0.01));
  p.push(box(0.76, 0.09, 0.1, style.trim, x, y - 0.4, z + 0.01));
  p.push(box(0.09, 0.9, 0.1, style.trim, x - 0.38, y, z + 0.01));
  p.push(box(0.09, 0.9, 0.1, style.trim, x + 0.38, y, z + 0.01));
  p.push(box(0.2, 0.74, 0.06, shutter, x - 0.53, y, z + 0.02));
  p.push(box(0.2, 0.74, 0.06, shutter, x + 0.53, y, z + 0.02));
}

function sideWindow(p, x, y, z, shutter, style, out) {
  p.push(box(0.07, 0.66, 0.54, style.dark, x, y, z));
  p.push(box(0.1, 0.09, 0.66, style.trim, x + out * 0.01, y + 0.37, z));
  p.push(box(0.1, 0.09, 0.66, style.trim, x + out * 0.01, y - 0.37, z));
  p.push(box(0.1, 0.84, 0.09, style.trim, x + out * 0.01, y, z - 0.33));
  p.push(box(0.1, 0.84, 0.09, style.trim, x + out * 0.01, y, z + 0.33));
  p.push(box(0.06, 0.68, 0.18, shutter, x + out * 0.02, y, z - 0.47));
  p.push(box(0.06, 0.68, 0.18, shutter, x + out * 0.02, y, z + 0.47));
}

/** Full modular house. Origin is the ground centre; footprint stays inside `radius` 3.0. */
export function buildAdobeHouse(rng, style = ADOBE_STYLE) {
  const p = [];
  const w = rng.range(4.4, 5.5);
  const d = rng.range(3.4, 4.2);
  const h = rng.range(2.45, 2.75);
  const wall = rng.pick(style.walls);
  const shutter = rng.pick(style.shutters);
  const baseY = 0.22;
  const roofY = baseY + h + 0.06;
  const frontZ = d / 2 + 0.03;

  // Foundation + mass + roof slab. The deep plinth is buried on flat ground and fills the gap
  // when the house is placed on a slope.
  p.push(box(w + 0.5, 1.25, d + 0.5, style.stone, 0, -0.5, 0));
  p.push(box(w + 0.5, 0.22, d + 0.5, style.stone, 0, 0.11, 0));
  p.push(box(w, h, d, wall, 0, baseY + h / 2, 0));
  p.push(box(w + 0.14, 0.12, d + 0.14, style.roof, 0, roofY, 0));

  // Cream corner quoins break up the large red walls.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.push(box(0.15, h, 0.15, style.trim, sx * (w / 2), baseY + h / 2, sz * (d / 2)));
    }
  }

  // Parapet: split the front run when the variant has a roof gap, as the old house did.
  const parapetY = roofY + 0.2;
  const ph = 0.42;
  const pt = 0.18;
  if (rng() < 0.55) {
    const gap = rng.range(0.7, 1.1);
    const seg = (w - gap) / 2;
    p.push(box(seg, ph, pt, style.wallDark, -(gap / 2 + seg / 2), parapetY, d / 2));
    p.push(box(seg, ph, pt, style.wallDark, gap / 2 + seg / 2, parapetY, d / 2));
    p.push(box(seg, 0.07, pt + 0.06, style.trim, -(gap / 2 + seg / 2), parapetY + ph / 2, d / 2));
    p.push(box(seg, 0.07, pt + 0.06, style.trim, gap / 2 + seg / 2, parapetY + ph / 2, d / 2));
  } else {
    p.push(box(w + 0.14, ph, pt, style.wallDark, 0, parapetY, d / 2));
    p.push(box(w + 0.2, 0.07, pt + 0.06, style.trim, 0, parapetY + ph / 2, d / 2));
  }
  p.push(box(w + 0.14, ph, pt, style.wallDark, 0, parapetY, -d / 2));
  p.push(box(w + 0.2, 0.07, pt + 0.06, style.trim, 0, parapetY + ph / 2, -d / 2));
  p.push(box(pt, ph, d + 0.14, style.wallDark, w / 2, parapetY, 0));
  p.push(box(pt + 0.06, 0.07, d + 0.2, style.trim, w / 2, parapetY + ph / 2, 0));
  p.push(box(pt, ph, d + 0.14, style.wallDark, -w / 2, parapetY, 0));
  p.push(box(pt + 0.06, 0.07, d + 0.2, style.trim, -w / 2, parapetY + ph / 2, 0));

  // Exposed beam ends on the front and one side.
  const beamY = baseY + h - 0.12;
  for (let i = 0; i < 4; i++) {
    p.push(box(0.12, 0.12, rng.range(0.45, 0.66), style.woodDark, -w / 2 + 0.45 + i * (w - 0.9) / 3, beamY, d / 2 + 0.18));
  }
  for (let i = 0; i < 2; i++) {
    p.push(box(0.5, 0.12, 0.12, style.woodDark, w / 2 + 0.16, beamY, -d / 2 + 0.7 + i * 1.1));
  }

  // Door on one of three facade bays.
  const doorSlot = rng.int(0, 2);
  const slots = [-w * 0.3, 0, w * 0.3];
  const doorX = slots[doorSlot];
  p.push(box(0.94, 1.52, 0.08, style.dark, doorX, baseY + 0.76, frontZ));
  p.push(box(0.11, 1.7, 0.13, style.trim, doorX - 0.53, baseY + 0.84, frontZ + 0.03));
  p.push(box(0.11, 1.7, 0.13, style.trim, doorX + 0.53, baseY + 0.84, frontZ + 0.03));
  p.push(box(1.18, 0.13, 0.15, style.trim, doorX, baseY + 1.7, frontZ + 0.03));
  p.push(box(1.3, 0.12, 0.52, style.stone, doorX, 0.06, d / 2 + 0.28));

  // Door canopy on some variants.
  if (rng() < 0.45) {
    p.push(box(1.35, 0.09, 0.42, style.roofDark, doorX, baseY + 1.95, d / 2 + 0.25));
    p.push(box(0.08, 0.36, 0.08, style.woodDark, doorX - 0.55, baseY + 1.78, d / 2 + 0.4));
    p.push(box(0.08, 0.36, 0.08, style.woodDark, doorX + 0.55, baseY + 1.78, d / 2 + 0.4));
  }

  // Windows: the two non-door front bays, plus one or two side windows.
  const winY = baseY + 1.3;
  for (let i = 0; i < 3; i++) {
    if (i === doorSlot) continue;
    if (rng() < 0.82) frontWindow(p, slots[i], winY, frontZ, shutter, style);
  }
  const sideCount = rng.int(1, 2);
  for (let i = 0; i < sideCount; i++) {
    const sx = rng() < 0.5 ? -1 : 1;
    sideWindow(p, sx * (w / 2 + 0.02), baseY + 1.3, rng.range(-d * 0.25, d * 0.25), shutter, style, sx);
  }

  // Porch (posts + awning + bench) on roughly half the variants.
  if (rng() < 0.55) {
    const pz = d / 2 + 0.52;
    const awningY = baseY + h - 0.28;
    p.push(cyl(0.07, 0.1, awningY, 5, style.wood, -w * 0.32, awningY / 2, pz));
    p.push(cyl(0.07, 0.1, awningY, 5, style.wood, w * 0.32, awningY / 2, pz));
    p.push(box(w * 0.78, 0.11, 0.95, style.roof, 0, awningY, pz - 0.05));
    p.push(box(w * 0.8, 0.07, 0.12, style.woodDark, 0, awningY + 0.08, pz + 0.42));
    p.push(box(1.4, 0.09, 0.32, style.wood, 0, 0.42, pz - 0.12));
    p.push(box(0.09, 0.42, 0.28, style.woodDark, -0.55, 0.21, pz - 0.12));
    p.push(box(0.09, 0.42, 0.28, style.woodDark, 0.55, 0.21, pz - 0.12));
  }

  // A couple of darker mud patches on the roof.
  const roofPatches = rng.int(1, 3);
  for (let i = 0; i < roofPatches; i++) {
    p.push(
      box(
        rng.range(0.5, 1.0),
        0.02,
        rng.range(0.35, 0.75),
        style.roofDark,
        rng.range(-w * 0.3, w * 0.3),
        roofY + 0.07,
        rng.range(-d * 0.3, d * 0.3),
      ),
    );
  }

  // Rooftop clutter (barrels, planks) and an optional vent/chimney.
  const clutter = rng.int(1, 3);
  for (let i = 0; i < clutter; i++) {
    const cx = rng.range(-w * 0.32, w * 0.32);
    const cz = rng.range(-d * 0.3, d * 0.3);
    if (rng() < 0.5) {
      p.push(cyl(0.2, 0.24, 0.52, 8, rng.pick(['#3b3831', '#4a4438', '#5a4433']), cx, roofY + 0.34, cz));
    } else {
      p.push(box(rng.range(0.4, 0.7), 0.14, rng.range(0.3, 0.5), style.woodDark, cx, roofY + 0.14, cz, 0, rng() * 3, 0));
    }
  }
  if (rng() < 0.4) {
    const cx = rng() < 0.5 ? -w * 0.28 : w * 0.28;
    const cz = rng() < 0.5 ? -d * 0.28 : d * 0.28;
    p.push(box(0.48, 0.72, 0.48, style.wallDark, cx, roofY + 0.42, cz));
    p.push(box(0.56, 0.08, 0.56, style.dark, cx, roofY + 0.82, cz));
  }

  // A hanging board sign on some variants.
  if (rng() < 0.32) {
    const sx = w * 0.32;
    const sz = d / 2 + 0.28;
    p.push(cyl(0.04, 0.05, 1.5, 4, style.woodDark, sx, 0.75, sz));
    p.push(box(0.66, 0.38, 0.05, style.trim, sx, 1.35, sz + 0.04, 0, 0.1, 0));
    p.push(box(0.42, 0.04, 0.03, '#5d4631', sx, 1.4, sz + 0.08, 0, 0.1, 0));
    p.push(box(0.32, 0.04, 0.03, '#5d4631', sx, 1.3, sz + 0.08, 0, 0.1, 0));
  }

  // A few weathering patches so large walls are not perfectly clean.
  const patches = rng.int(2, 4);
  for (let i = 0; i < patches; i++) {
    p.push(
      box(
        rng.range(0.25, 0.6),
        rng.range(0.14, 0.34),
        0.04,
        rng() < 0.5 ? style.trim : style.wallDark,
        rng.range(-w * 0.38, w * 0.38),
        rng.range(baseY + 0.4, baseY + h - 0.4),
        frontZ + 0.01,
      ),
    );
  }

  return bakeBaseAO(merge(p), 0.55, 0.32);
}
