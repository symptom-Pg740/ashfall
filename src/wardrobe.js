import { shade } from './character.js';
import { WEAPONS, buildWeaponParts } from './weapons.js';
import {
  RIG_GROUP,
  armProfile,
  armXOf,
  ball,
  capsule,
  footProfile,
  legProfile,
  legXOf,
  loft,
  pose,
  radialSegments,
  rbox,
  ring,
  setRegionUV,
  smoothMerge,
  sphereCap,
  tagGroup,
  tagSides,
  torsoProfile,
  trimProfile,
} from './charparts.js';

/**
 * Wardrobe slots and items.
 *
 * Two kinds of slot:
 *  - `outfit` slots (torso / legs / feet) build one merged, skinned clothing layer that shares the
 *    body skeleton. Swapping one rebuilds only that geometry.
 *  - `gear` slots (head / face / back / shoulders / hands / waist / weapon) build small meshes that
 *    are parented to a bone socket.
 *
 * Every builder sets its own atlas UV region per part, so an outfit can mix cloth, leather and metal
 * without splitting into extra meshes.
 */

const cloth = (g) => setRegionUV(g, 'cloth');
const leather = (g) => setRegionUV(g, 'leather');
const metal = (g) => setRegionUV(g, 'metal');

const BODY = RIG_GROUP.BODY;
const ARM_L = RIG_GROUP.ARM_L;
const ARM_R = RIG_GROUP.ARM_R;
const LEG_L = RIG_GROUP.LEG_L;
const LEG_R = RIG_GROUP.LEG_R;

/**
 * Trouser seat: the shell that joins the two leg tubes across the pelvis. Without it the leg lofts
 * start at the hip and leave a deep dark crotch wedge between them.
 */
function trouserSeat(spec, color, from = 0.8, to = 0.905) {
  const rows = trimProfile(torsoProfile(spec), from * spec.s, to * spec.s, 0.012 * spec.w);
  return tagGroup(loft(rows, color, { segments: radialSegments(), round: 0.24 }), BODY);
}

/** Sleeve geometry follows the arm profile, so a shirt or coat sleeve cannot float off the arm. */
function sleeve(spec, sx, color, from, to, inflate) {
  const side = sx < 0 ? 'L' : 'R';
  const rows = [...armProfile(spec, side)];
  // The sleeve reaches a little above the deltoid so the shoulder cap is cloth, not skin.
  const top = rows.reduce((a, b) => (b.y > a.y ? b : a));
  if (to > top.y) rows.push({ ...top, y: to, rx: top.rx * 0.66, rz: top.rz * 0.66 });
  return loft(trimProfile(rows, from, to, inflate), color, {
    segments: radialSegments(),
    round: 0.06,
    capEnd: 0.007 * spec.s,
  });
}

export const SLOTS = [
  { id: 'head', label: 'HEAD', kind: 'gear' },
  { id: 'face', label: 'FACE', kind: 'gear' },
  { id: 'torso', label: 'TORSO', kind: 'outfit' },
  { id: 'legs', label: 'LEGS', kind: 'outfit' },
  { id: 'feet', label: 'FEET', kind: 'outfit' },
  { id: 'shoulders', label: 'SHOULDERS', kind: 'gear' },
  { id: 'hands', label: 'HANDS', kind: 'gear' },
  { id: 'back', label: 'BACK', kind: 'gear' },
  { id: 'waist', label: 'WAIST', kind: 'gear' },
  { id: 'weapon', label: 'WEAPON', kind: 'gear' },
];

export const SLOT_IDS = SLOTS.map((s) => s.id);
export const OUTFIT_SLOTS = new Set(['torso', 'legs', 'feet']);

export const ITEMS = {
  // Head gear is sized for the authored head (the hero): skull radius ~0.14, crown ~0.28 above the
  // head bone. It sits on the skull as a shell, so the brow and eyes stay visible.
  head: {
    none: { label: 'Bare head' },
    wrap: {
      label: 'Head wrap',
      build: (spec) => {
        const { s, head, wrap } = spec;
        return [{
          bone: 'head',
          geometry: smoothMerge([
            cloth(sphereCap(0.147 * head, wrap, 0, 0.155 * s, -0.006, 1.0, 0.96, 1.0, 0.54)),
            cloth(ring(0.143 * head, 0.018 * head, shade(wrap, 0.88), 0, 0.158 * s, -0.004)),
            cloth(rbox(0.09 * head, 0.02 * s, 0.035, 0.008, shade(wrap, 0.8), 0, 0.168 * s, 0.12 * head, 0, 0.25, 0)),
          ]),
        }];
      },
    },
    cap: {
      label: 'Field cap',
      build: (spec) => {
        const { s, head } = spec;
        return [{
          bone: 'head',
          geometry: smoothMerge([
            cloth(sphereCap(0.144 * head, '#3a332b', 0, 0.17 * s, -0.008, 1.02, 0.8, 1.02, 0.56)),
            cloth(rbox(0.15 * head, 0.018 * s, 0.1, 0.008, '#2f2a26', 0, 0.175 * s, 0.112 * head, 0.06)),
          ]),
        }];
      },
    },
    hood: {
      label: 'Cloth hood',
      build: (spec) => {
        const { s, head, wrap } = spec;
        return [{
          bone: 'head',
          geometry: smoothMerge([
            cloth(ball(0.17 * head, wrap, 0, 0.13 * s, -0.06, 1.1, 1.05, 0.8)),
            cloth(ring(0.1 * head, 0.026 * head, shade(wrap, 0.86), 0, 0.05 * s, -0.02 * s)),
          ]),
        }];
      },
    },
    helmet: {
      label: 'Scrap helmet',
      build: (spec) => {
        const { s, head } = spec;
        return [{
          bone: 'head',
          geometry: smoothMerge([
            metal(sphereCap(0.146 * head, '#9a9c9d', 0, 0.155 * s, 0, 1.02, 0.9, 1.02, 0.56)),
            metal(ring(0.143 * head, 0.014 * head, '#b2b4b4', 0, 0.158 * s, 0)),
            metal(rbox(0.018 * head, 0.08 * s, 0.1 * head, 0.006, '#9a9c9e', 0, 0.24 * s, 0.01 * head)),
          ]),
        }];
      },
    },
  },

  face: {
    none: { label: 'Open face' },
    scarf: {
      label: 'Scarf',
      build: (spec) => {
        const { s, accent } = spec;
        return [
          {
            bone: 'neck',
            geometry: smoothMerge([
              cloth(ring(0.072 * s, 0.024 * s, accent, 0, 0.02 * s, 0)),
              cloth(ring(0.086 * s, 0.016 * s, shade(accent, 0.85), 0, 0, 0)),
            ]),
          },
          {
            bone: 'chest',
            geometry: cloth(rbox(0.085 * s, 0.26 * s, 0.04 * s, 0.02, shade(accent, 0.82), 0.05 * s, -0.15 * s, -0.13 * s, 0.12, 0, 0.12)),
          },
        ];
      },
    },
    goggles: {
      label: 'Goggles',
      build: (spec) => {
        const { s, head } = spec;
        return [{
          bone: 'head',
          geometry: smoothMerge([
            metal(rbox(0.045 * head, 0.032 * head, 0.04, 0.01, '#2e2b26', -0.042 * head, 0.152 * s, 0.108 * head)),
            metal(rbox(0.045 * head, 0.032 * head, 0.04, 0.01, '#2e2b26', 0.042 * head, 0.152 * s, 0.108 * head)),
            leather(ring(0.132 * head, 0.011, '#4a4438', 0, 0.156 * s, 0)),
          ]),
        }];
      },
    },
    mask: {
      label: 'Respirator',
      build: (spec) => {
        const { s, head } = spec;
        return [{
          bone: 'head',
          geometry: smoothMerge([
            leather(rbox(0.085 * head, 0.07 * head, 0.045, 0.018, '#4a4438', 0, 0.085 * s, 0.105 * head)),
            leather(ring(0.12 * head, 0.011, '#3a332b', 0, 0.11 * s, 0)),
            metal(ball(0.018 * head, '#b2b4b4', -0.028 * head, 0.07 * s, 0.128 * head)),
            metal(ball(0.018 * head, '#b2b4b4', 0.028 * head, 0.07 * s, 0.128 * head)),
          ]),
        }];
      },
    },
  },

  back: {
    none: { label: 'Bare back' },
    // The back of the new torso is at z ≈ -0.11 w, so the pack sits against it instead of floating.
    pack: {
      label: 'Rucksack',
      build: (spec) => {
        const { s, w, coat } = spec;
        return [{
          bone: 'chest',
          geometry: smoothMerge([
            leather(rbox(0.32 * w, 0.4 * s, 0.2 * w, 0.05 * w, shade(coat, 0.62), 0, 0.04 * s, -0.2 * w)),
            leather(rbox(0.26 * w, 0.08 * s, 0.22 * w, 0.04 * w, shade(coat, 0.52), 0, 0.24 * s, -0.22 * w)),
            cloth(rbox(0.09 * w, 0.3 * s, 0.22 * w, 0.02, shade(coat, 0.56), 0, 0.02 * s, -0.21 * w)),
          ]),
        }];
      },
    },
    bedroll: {
      label: 'Bedroll',
      build: (spec) => {
        const { s, w, coat } = spec;
        const roll = capsule(0.06 * w, 0.24 * w, '#94795a');
        pose(roll, 0, -0.06 * s, -0.24 * w, 0, 0, Math.PI / 2);
        leather(roll);
        return [{
          bone: 'chest',
          geometry: smoothMerge([
            roll,
            leather(rbox(0.28 * w, 0.16 * s, 0.2 * w, 0.04 * w, shade(coat, 0.62), 0, 0.04 * s, -0.2 * w)),
          ]),
        }];
      },
    },
    cape: {
      label: 'Cloak',
      build: (spec) => {
        const { s, w, coat } = spec;
        return [{
          bone: 'chest',
          geometry: smoothMerge([
            cloth(rbox(0.36 * w, 0.62 * s, 0.03 * w, 0.02, shade(coat, 0.8), 0, -0.02 * s, -0.125 * w, 0.02)),
            cloth(ring(0.105 * w, 0.018 * w, shade(coat, 0.72), 0, 0.38 * s, 0)),
          ]),
        }];
      },
    },
  },

  shoulders: {
    none: { label: 'No pauldrons' },
    pads: {
      label: 'Arm pads',
      build: (spec) => {
        const { s, w, coat } = spec;
        const pad = () => leather(rbox(0.13 * w, 0.07 * s, 0.24 * w, 0.035 * w, shade(coat, 0.78), 0, 0.02, 0));
        return [
          { bone: 'arms.L.upper', geometry: pad() },
          { bone: 'arms.R.upper', geometry: pad() },
        ];
      },
    },
    plate: {
      label: 'Plate pauldrons',
      build: (spec) => {
        const { w } = spec;
        const plate = () => smoothMerge([
          metal(ball(0.085 * w, '#9a9c9d', 0, 0.015, 0, 1.15, 0.72, 1.05)),
          metal(rbox(0.14 * w, 0.02, 0.2 * w, 0.007, '#b2b4b4', 0, 0.055, 0)),
        ]);
        return [
          { bone: 'arms.L.upper', geometry: plate() },
          { bone: 'arms.R.upper', geometry: plate() },
        ];
      },
    },
  },

  hands: {
    none: { label: 'Bare hands' },
    wraps: {
      label: 'Wrist wraps',
      build: (spec) => {
        const { w } = spec;
        const wrap = () => smoothMerge([
          leather(ring(0.058 * w, 0.014 * w, '#6b5233', 0, 0, 0)),
          leather(ring(0.054 * w, 0.012 * w, '#5a4433', 0, -0.07, 0)),
        ]);
        return [
          { bone: 'arms.L.fore', geometry: wrap() },
          { bone: 'arms.R.fore', geometry: wrap() },
        ];
      },
    },
    gloves: {
      label: 'Gloves',
      build: (spec) => {
        const { s, w } = spec;
        // Hand-local: the hand bone sits at the palm centre, fingers extend down -Y.
        const glove = () =>
          leather(
            smoothMerge([
              rbox(0.056 * w, 0.078 * s, 0.036 * w, 0.014, '#5a4433', 0, -0.002 * s, 0.012 * w),
              rbox(0.05 * w, 0.05 * s, 0.032 * w, 0.012, '#5a4433', 0, -0.052 * s, 0.015 * w, -0.22),
            ]),
          );
        return [
          { bone: 'arms.L.hand', geometry: glove() },
          { bone: 'arms.R.hand', geometry: glove() },
        ];
      },
    },
  },

  waist: {
    none: { label: 'Empty belt' },
    // Hips are ~0.15 w wide and ~0.10 w deep, so belt gear has to sit on that ellipse.
    tool: {
      label: 'Hip tool',
      build: (spec) => {
        const { s, w } = spec;
        return [{
          bone: 'hips',
          geometry: smoothMerge([
            leather(capsule(0.02 * w, 0.18 * s, '#6f6a5e', 0.115 * w, 0.04 * s, 0.07 * w)),
            metal(ball(0.045 * w, '#9b9282', 0.115 * w, 0.17 * s, 0.07 * w)),
          ]),
        }];
      },
    },
    pouches: {
      label: 'Belt pouches',
      build: (spec) => {
        const { s, w } = spec;
        return [{
          bone: 'hips',
          geometry: smoothMerge([
            leather(rbox(0.1 * w, 0.13 * s, 0.09 * w, 0.028, '#5a4433', -0.1 * w, 0.07 * s, 0.075 * w)),
            leather(rbox(0.085 * w, 0.1 * s, 0.075 * w, 0.024, '#4a3728', 0.1 * w, 0.07 * s, 0.075 * w)),
          ]),
        }];
      },
    },
  },

  weapon: {
    none: { label: 'Empty hand' },
    pistol: {
      label: 'Scrap pistol',
      build: (spec) => buildWeaponParts('pistol', spec),
      muzzle: WEAPONS.pistol.muzzle,
      foregrip: WEAPONS.pistol.foregrip,
      twoHanded: WEAPONS.pistol.twoHanded,
    },
    rifle: {
      label: 'Pipe rifle',
      build: (spec) => buildWeaponParts('rifle', spec),
      muzzle: WEAPONS.rifle.muzzle,
      foregrip: WEAPONS.rifle.foregrip,
      twoHanded: WEAPONS.rifle.twoHanded,
    },
    shotgun: {
      label: 'Sawn-off',
      build: (spec) => buildWeaponParts('shotgun', spec),
      muzzle: WEAPONS.shotgun.muzzle,
      foregrip: WEAPONS.shotgun.foregrip,
      twoHanded: WEAPONS.shotgun.twoHanded,
    },
    blade: {
      label: 'Scrap blade',
      build: (spec) => {
        const { w } = spec;
        return [{
          bone: 'arms.R.hand',
          geometry: smoothMerge([
            leather(capsule(0.022 * w, 0.14, '#5b4530', 0, -0.08, 0.04 * w)),
            metal(rbox(0.028 * w, 0.4, 0.075 * w, 0.012, '#b0ad9f', 0, -0.32, 0.04 * w)),
            metal(rbox(0.04 * w, 0.05, 0.1 * w, 0.01, '#d1cec0', 0, -0.55, 0.04 * w)),
          ]),
        }];
      },
    },
    club: {
      label: 'Wooden club',
      build: (spec) => {
        const { w } = spec;
        return [{
          bone: 'arms.R.hand',
          geometry: smoothMerge([
            leather(capsule(0.026 * w, 0.34, '#6b5233', 0, -0.28, 0.04 * w)),
            leather(ball(0.062 * w, '#7a5f3d', 0, -0.5, 0.04 * w, 1, 1.15, 1)),
            metal(ball(0.018 * w, '#b2b4b4', 0.02 * w, -0.44, 0.04 * w)),
          ]),
        }];
      },
    },
  },

  torso: {
    none: {
      label: 'Undersuit',
      outfit: () => null,
    },
    shirt: {
      label: 'Work shirt',
      outfit: (spec) => {
        const { s, w, coat } = spec;
        const seg = radialSegments();
        const shell = trimProfile(torsoProfile(spec), 1.015 * s, 1.452 * s, 0.013 * w);
        const p = [
          tagGroup(cloth(loft(shell, coat, { segments: seg, round: 0.24 })), BODY),
          // Rolled collar and a hem band: cloth volumes rather than the hard edge of a box.
          tagGroup(cloth(ring(0.068 * w, 0.014 * w, shade(coat, 0.9), 0, 1.452 * s, -0.004 * w)), BODY),
          tagGroup(cloth(ring(0.128 * w, 0.017 * w, shade(coat, 0.86), 0, 1.03 * s, 0)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(cloth(sleeve(spec, sx, shade(coat, 0.95), 0.9 * s, 1.41 * s, 0.013 * w)), ARM_L, ARM_R));
          p.push(tagSides(cloth(ring(0.043 * w, 0.011 * w, shade(coat, 0.86), sx * armXOf(spec), 0.925 * s, 0.01 * w)), ARM_L, ARM_R));
        }
        return smoothMerge(p);
      },
    },
    vest: {
      label: 'Leather vest',
      outfit: (spec) => {
        const { s, w } = spec;
        const seg = radialSegments();
        const shell = trimProfile(torsoProfile(spec), 1.06 * s, 1.405 * s, 0.012 * w);
        const p = [
          tagGroup(leather(loft(shell, '#6b4a33', { segments: seg, round: 0.24 })), BODY),
          tagGroup(leather(ring(0.118 * w, 0.016 * w, '#7d5a3f', 0, 1.06 * s, 0)), BODY),
          // Shoulder straps run over the trapezius so the vest is not a floating tube.
          tagGroup(leather(rbox(0.052 * w, 0.024 * s, 0.2 * w, 0.01, '#7d5a3f', -0.082 * w, 1.398 * s, 0)), BODY),
          tagGroup(leather(rbox(0.052 * w, 0.024 * s, 0.2 * w, 0.01, '#7d5a3f', 0.082 * w, 1.398 * s, 0)), BODY),
          tagGroup(leather(rbox(0.02 * w, 0.3 * s, 0.02 * w, 0.006, '#5a3d29', 0, 1.24 * s, 0.118 * w)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(leather(ball(0.066 * w, '#6b4a33', sx * armXOf(spec), 1.372 * s, 0, 1.0, 0.9, 0.95)), ARM_L, ARM_R));
        }
        return smoothMerge(p);
      },
    },
    coat: {
      label: 'Dust coat',
      outfit: (spec) => {
        const { s, w, coat } = spec;
        const seg = radialSegments();
        const shell = trimProfile(torsoProfile(spec), 0.87 * s, 1.452 * s, 0.016 * w);
        // Flare the hem so the coat hangs instead of clamping to the hips.
        if (shell.length) {
          shell[0].rx += 0.022 * w;
          shell[0].rz += 0.022 * w;
        }
        const p = [
          tagGroup(cloth(loft(shell, coat, { segments: seg, round: 0.24 })), BODY),
          tagGroup(cloth(ring(0.136 * w, 0.019 * w, shade(coat, 0.82), 0, 0.888 * s, 0)), BODY),
          tagGroup(cloth(ring(0.074 * w, 0.017 * w, shade(coat, 0.86), 0, 1.452 * s, -0.004 * w)), BODY),
          // Front placket and two lapels: the coat reads as cloth wrapped over the chest.
          tagGroup(cloth(rbox(0.05 * w, 0.42 * s, 0.02 * w, 0.008, shade(coat, 0.88), 0, 1.2 * s, 0.108 * w)), BODY),
          tagGroup(cloth(rbox(0.09 * w, 0.3 * s, 0.02 * w, 0.008, shade(coat, 0.94), -0.07 * w, 1.29 * s, 0.104 * w, 0, 0, -0.16)), BODY),
          tagGroup(cloth(rbox(0.09 * w, 0.3 * s, 0.02 * w, 0.008, shade(coat, 0.94), 0.07 * w, 1.29 * s, 0.104 * w, 0, 0, 0.16)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(cloth(sleeve(spec, sx, shade(coat, 0.95), 0.86 * s, 1.41 * s, 0.017 * w)), ARM_L, ARM_R));
          p.push(tagSides(cloth(ring(0.047 * w, 0.013 * w, shade(coat, 0.84), sx * armXOf(spec), 0.88 * s, 0.011 * w)), ARM_L, ARM_R));
          // Coat tails hang off the hips, a little behind the leg.
          p.push(tagGroup(cloth(rbox(0.1 * w, 0.3 * s, 0.06 * w, 0.025, shade(coat, 0.84), sx * 0.12 * w, 0.92 * s, -0.1 * w, 0.05, 0, sx * 0.03)), BODY));
        }
        return smoothMerge(p);
      },
    },
    plate: {
      label: 'Plate carrier',
      outfit: (spec) => {
        const { s, w } = spec;
        const seg = radialSegments();
        const shell = trimProfile(torsoProfile(spec), 1.09 * s, 1.405 * s, 0.02 * w);
        const p = [
          tagGroup(metal(loft(shell, '#9a9c9d', { segments: seg, round: 0.28 })), BODY),
          tagGroup(metal(rbox(0.24 * w, 0.2 * s, 0.03 * w, 0.012, '#b2b4b4', 0, 1.26 * s, 0.118 * w)), BODY),
          tagGroup(leather(ring(0.126 * w, 0.018 * w, '#5a4433', 0, 1.085 * s, 0)), BODY),
          tagGroup(metal(rbox(0.4 * w, 0.02 * s, 0.02 * w, 0.006, '#5f6164', 0, 1.35 * s, 0.108 * w)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(metal(ball(0.07 * w, '#9a9c9d', sx * armXOf(spec), 1.372 * s, 0, 1.0, 0.9, 0.95)), ARM_L, ARM_R));
        }
        return smoothMerge(p);
      },
    },
  },

  legs: {
    none: {
      label: 'Bare legs',
      outfit: () => null,
    },
    trousers: {
      label: 'Trousers',
      outfit: (spec) => {
        const { s, w, pants } = spec;
        const seg = radialSegments();
        const p = [trouserSeat(spec, pants)];
        for (const sx of [-1, 1]) {
          const side = sx < 0 ? 'L' : 'R';
          const rows = trimProfile(legProfile(spec, side), 0.105 * s, 0.9 * s, 0.01 * w);
          p.push(tagSides(cloth(loft(rows, pants, { segments: seg, round: 0.1, capStart: 0.012 * s })), LEG_L, LEG_R));
          // Cuff at the ankle and a seam above the knee: cloth edges with volume.
          p.push(tagSides(cloth(ring(0.043 * w, 0.012 * w, shade(pants, 0.88), sx * legXOf(spec), 0.118 * s, 0)), LEG_L, LEG_R));
          p.push(tagSides(cloth(ring(0.059 * w, 0.009 * w, shade(pants, 0.94), sx * legXOf(spec), 0.468 * s, 0.005 * w)), LEG_L, LEG_R));
        }
        return smoothMerge(p);
      },
    },
    greaves: {
      label: 'Greaves',
      outfit: (spec) => {
        const { s, w, pants } = spec;
        const seg = radialSegments();
        const p = [trouserSeat(spec, pants)];
        for (const sx of [-1, 1]) {
          const side = sx < 0 ? 'L' : 'R';
          const rows = trimProfile(legProfile(spec, side), 0.105 * s, 0.9 * s, 0.009 * w);
          p.push(tagSides(cloth(loft(rows, pants, { segments: seg, round: 0.1, capStart: 0.012 * s })), LEG_L, LEG_R));
          p.push(tagSides(cloth(ring(0.043 * w, 0.012 * w, shade(pants, 0.88), sx * legXOf(spec), 0.118 * s, 0)), LEG_L, LEG_R));
          // Shin plate curved over the front of the calf, plus a knee cop.
          p.push(tagSides(metal(rbox(0.09 * w, 0.26 * s, 0.09 * w, 0.03 * w, '#9a9c9d', sx * legXOf(spec), 0.27 * s, 0.032 * w)), LEG_L, LEG_R));
          p.push(tagSides(metal(ball(0.062 * w, '#b2b4b4', sx * legXOf(spec), 0.425 * s, 0.03 * w, 1, 0.78, 0.9)), LEG_L, LEG_R));
        }
        return smoothMerge(p);
      },
    },
    wraps: {
      label: 'Leg wraps',
      outfit: (spec) => {
        const { s, w, pants } = spec;
        const seg = radialSegments();
        const p = [];
        for (const sx of [-1, 1]) {
          const side = sx < 0 ? 'L' : 'R';
          const rows = trimProfile(legProfile(spec, side), 0.105 * s, 0.72 * s, 0.008 * w);
          p.push(cloth(loft(rows, pants, { segments: seg, round: 0.1 })));
          for (let i = 0; i < 3; i++) {
            p.push(leather(ring(0.041 * w, 0.011 * w, i % 2 ? '#7d5a3f' : '#6b5233', sx * legXOf(spec), 0.16 * s + i * 0.07 * s, 0)));
          }
        }
        return tagSides(smoothMerge(p));
      },
    },
  },

  feet: {
    none: {
      label: 'Bare feet',
      outfit: () => null,
    },
    boots: {
      label: 'Boots',
      outfit: (spec) => {
        const { s, w } = spec;
        const seg = radialSegments();
        const p = [];
        for (const sx of [-1, 1]) {
          const side = sx < 0 ? 'L' : 'R';
          const x = sx * legXOf(spec);
          const foot = trimProfile(footProfile(spec, side), -0.075 * s, 0.218 * s, 0.014 * w, 'z');
          p.push(leather(loft(foot, '#332f29', { axis: 'z', segments: seg, round: 0.42, capStart: 0.016 * s, capEnd: 0.012 * s })));
          // Ankle shaft and cuff over the trouser hem.
          const shaft = [
            [0.0, 0.05, 0.048],
            [0.06, 0.047, 0.046],
            [0.132, 0.044, 0.044],
          ].map(([y, rx, rz]) => ({ y: y * s, x, rx: rx * w, rz: rz * w }));
          p.push(leather(loft(shaft, '#332f29', { segments: seg, round: 0.12 })));
          p.push(leather(ring(0.047 * w, 0.013 * w, '#4a3728', x, 0.132 * s, 0)));
        }
        return tagSides(smoothMerge(p));
      },
    },
    wraps: {
      label: 'Foot wraps',
      outfit: (spec) => {
        const { s, w } = spec;
        const seg = radialSegments();
        const p = [];
        for (const sx of [-1, 1]) {
          const side = sx < 0 ? 'L' : 'R';
          const x = sx * legXOf(spec);
          const foot = trimProfile(footProfile(spec, side), -0.07 * s, 0.212 * s, 0.01 * w, 'z');
          p.push(leather(loft(foot, '#6b5233', { axis: 'z', segments: seg, round: 0.42, capStart: 0.014 * s, capEnd: 0.01 * s })));
          p.push(leather(ring(0.044 * w, 0.011 * w, '#7d5a3f', x, 0.09 * s, 0)));
          p.push(leather(ring(0.042 * w, 0.011 * w, '#5a4433', x, 0.14 * s, 0)));
        }
        return tagSides(smoothMerge(p));
      },
    },
  },
};

export function defaultEquipment(spec, options = {}) {
  const { gear } = spec;
  const authoredHead = !!options.headGeometry;
  return {
    head: 'none',
    face: authoredHead && gear.scarf ? 'scarf' : 'none',
    torso: gear.coat ? 'coat' : 'shirt',
    legs: 'trousers',
    feet: 'boots',
    shoulders: 'none',
    hands: 'none',
    back: gear.backpack ? 'pack' : gear.bedroll ? 'bedroll' : 'none',
    waist: gear.tool ? 'tool' : 'none',
    weapon: gear.weapon ? 'blade' : 'none',
    ...(options.equipment || {}),
  };
}

export function normalizeEquipment(equipment) {
  const out = {};
  for (const slot of SLOT_IDS) {
    const id = equipment?.[slot];
    out[slot] = ITEMS[slot][id] ? id : 'none';
  }
  return out;
}

export function itemIds(slot) {
  return Object.keys(ITEMS[slot] || {});
}

export function itemLabel(slot, id) {
  return ITEMS[slot]?.[id]?.label || id;
}

export function nextItemId(slot, current) {
  const ids = itemIds(slot);
  const i = Math.max(0, ids.indexOf(current));
  return ids[(i + 1) % ids.length];
}

export function prevItemId(slot, current) {
  const ids = itemIds(slot);
  const i = Math.max(0, ids.indexOf(current));
  return ids[(i - 1 + ids.length) % ids.length];
}

export function buildGearItem(slot, id, spec) {
  const def = ITEMS[slot]?.[id];
  if (!def || !def.build) return [];
  return def.build(spec);
}

export function buildOutfit(spec, equipment) {
  const parts = [];
  for (const slot of ['torso', 'legs', 'feet']) {
    const def = ITEMS[slot]?.[equipment[slot]];
    if (!def || !def.outfit) continue;
    const geo = def.outfit(spec);
    if (geo) parts.push(geo);
  }
  if (!parts.length) return null;
  // Weld after merging: each item already welded its own parts, but `merge` re-expands indices, and
  // an unwelded outfit layer triples its vertex count for no visual gain.
  return smoothMerge(parts);
}
