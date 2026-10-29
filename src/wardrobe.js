import { merge } from './geo.js';
import { shade } from './character.js';
import { WEAPONS, buildWeaponParts } from './weapons.js';
import { LAYOUT, RIG_GROUP, ball, capsule, pose, rbox, ring, setRegionUV, smoothMerge, tagGroup, tagSides } from './charparts.js';

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

const armX = (w) => LAYOUT.armX * w;
const legX = (w) => LAYOUT.legX * w;
const BODY = RIG_GROUP.BODY;
const ARM_L = RIG_GROUP.ARM_L;
const ARM_R = RIG_GROUP.ARM_R;

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
  head: {
    none: { label: 'Bare head' },
    wrap: {
      label: 'Head wrap',
      build: (spec) => {
        const { s, head, wrap } = spec;
        return [{
          bone: 'head',
          geometry: smoothMerge([
            cloth(ball(0.185 * head, wrap, 0, 0.285 * s, -0.005, 1.05, 0.45, 1.05)),
            cloth(ring(0.185 * head, 0.022 * head, shade(wrap, 0.88), 0, 0.275 * s, 0)),
            cloth(rbox(0.11 * head, 0.02 * s, 0.04, 0.008, shade(wrap, 0.8), 0, 0.305 * s, 0.14 * head, 0, 0.25, 0)),
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
            cloth(ball(0.175 * head, '#3a332b', 0, 0.265 * s, -0.01, 1.0, 0.5, 1.02)),
            cloth(rbox(0.2 * head, 0.018 * s, 0.12, 0.008, '#2f2a26', 0, 0.215 * s, 0.12 * head, 0.06)),
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
            cloth(ball(0.21 * head, wrap, 0, 0.22 * s, -0.13, 1.18, 1.05, 0.8)),
            cloth(ring(0.16 * head, 0.03 * head, shade(wrap, 0.86), 0, 0.09 * s, -0.03 * s)),
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
            metal(ball(0.18 * head, '#9a9c9d', 0, 0.275 * s, 0, 1.05, 0.58, 1.05)),
            metal(ring(0.178 * head, 0.018 * head, '#b2b4b4', 0, 0.215 * s, 0)),
            metal(rbox(0.02 * head, 0.12 * s, 0.14 * head, 0.006, '#9a9c9e', 0, 0.3 * s, 0.02 * head)),
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
            metal(rbox(0.06 * head, 0.04 * head, 0.05, 0.012, '#2e2b26', -0.065 * head, 0.17 * s, 0.1 * head)),
            metal(rbox(0.06 * head, 0.04 * head, 0.05, 0.012, '#2e2b26', 0.065 * head, 0.17 * s, 0.1 * head)),
            leather(ring(0.17 * head, 0.012, '#4a4438', 0, 0.18 * s, 0)),
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
            leather(rbox(0.12 * head, 0.09 * head, 0.06, 0.02, '#4a4438', 0, 0.075 * s, 0.07 * head)),
            leather(ring(0.16 * head, 0.012, '#3a332b', 0, 0.12 * s, 0)),
            metal(ball(0.025 * head, '#b2b4b4', -0.04 * head, 0.06 * s, 0.12 * head)),
            metal(ball(0.025 * head, '#b2b4b4', 0.04 * head, 0.06 * s, 0.12 * head)),
          ]),
        }];
      },
    },
  },

  back: {
    none: { label: 'Bare back' },
    pack: {
      label: 'Rucksack',
      build: (spec) => {
        const { s, w, coat } = spec;
        return [{
          bone: 'chest',
          geometry: smoothMerge([
            leather(rbox(0.34 * w, 0.4 * s, 0.2 * w, 0.05 * w, shade(coat, 0.62), 0, 0.04 * s, -0.24 * w)),
            leather(rbox(0.28 * w, 0.08 * s, 0.22 * w, 0.04 * w, shade(coat, 0.52), 0, 0.24 * s, -0.26 * w)),
            cloth(rbox(0.1 * w, 0.3 * s, 0.22 * w, 0.02, shade(coat, 0.56), 0, 0.02 * s, -0.25 * w)),
          ]),
        }];
      },
    },
    bedroll: {
      label: 'Bedroll',
      build: (spec) => {
        const { s, w, coat } = spec;
        const roll = capsule(0.06 * w, 0.24 * w, '#94795a');
        pose(roll, 0, -0.06 * s, -0.26 * w, 0, 0, Math.PI / 2);
        leather(roll);
        return [{
          bone: 'chest',
          geometry: smoothMerge([
            roll,
            leather(rbox(0.3 * w, 0.16 * s, 0.2 * w, 0.04 * w, shade(coat, 0.62), 0, 0.04 * s, -0.24 * w)),
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
            cloth(rbox(0.38 * w, 0.62 * s, 0.03 * w, 0.02, shade(coat, 0.8), 0, -0.02 * s, -0.17 * w, 0.02)),
            cloth(ring(0.12 * w, 0.018 * w, shade(coat, 0.72), 0, 0.38 * s, 0)),
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
        const { w } = spec;
        const glove = () => leather(ball(0.062 * w, '#5a4433', 0, 0.0, 0.015 * w, 1, 0.92, 0.9));
        return [
          { bone: 'arms.L.hand', geometry: glove() },
          { bone: 'arms.R.hand', geometry: glove() },
        ];
      },
    },
  },

  waist: {
    none: { label: 'Empty belt' },
    tool: {
      label: 'Hip tool',
      build: (spec) => {
        const { w } = spec;
        return [{
          bone: 'hips',
          geometry: smoothMerge([
            leather(capsule(0.02 * w, 0.2, '#6f6a5e', 0.28 * w, 0.0, 0.14 * w)),
            metal(ball(0.05 * w, '#9b9282', 0.28 * w, 0.12, 0.14 * w)),
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
            leather(rbox(0.11 * w, 0.14 * s, 0.1 * w, 0.03, '#5a4433', -0.2 * w, -0.02, 0.16 * w)),
            leather(rbox(0.09 * w, 0.11 * s, 0.08 * w, 0.025, '#4a3728', 0.2 * w, -0.02, 0.16 * w)),
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
        const p = [
          tagGroup(cloth(rbox(0.44 * w, 0.34 * s, 0.3 * w, 0.08 * w, coat, 0, 1.19 * s, 0)), BODY),
          tagGroup(cloth(rbox(0.36 * w, 0.14 * s, 0.27 * w, 0.07 * w, shade(coat, 0.92), 0, 1.38 * s, 0)), BODY),
          tagGroup(cloth(ring(0.125 * w, 0.014 * w, shade(coat, 0.86), 0, 1.42 * s, 0)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(cloth(ball(0.08 * w, shade(coat, 0.92), sx * armX(w), 1.38 * s, 0)), ARM_L, ARM_R));
          p.push(tagSides(cloth(capsule(0.062 * w, 0.22 * s, shade(coat, 0.95), sx * armX(w), 1.18 * s, 0)), ARM_L, ARM_R));
          p.push(tagSides(cloth(capsule(0.052 * w, 0.2 * s, shade(coat, 0.9), sx * armX(w), 0.85 * s, 0.005 * w)), ARM_L, ARM_R));
        }
        return smoothMerge(p);
      },
    },
    vest: {
      label: 'Leather vest',
      outfit: (spec) => {
        const { s, w } = spec;
        const p = [
          tagGroup(leather(rbox(0.43 * w, 0.32 * s, 0.31 * w, 0.06 * w, '#6b4a33', 0, 1.2 * s, 0)), BODY),
          tagGroup(leather(rbox(0.3 * w, 0.09 * s, 0.29 * w, 0.03, '#7d5a3f', 0, 1.38 * s, 0)), BODY),
          tagGroup(leather(rbox(0.1 * w, 0.1 * s, 0.32 * w, 0.02, '#7d5a3f', 0, 1.34 * s, 0)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(leather(ball(0.078 * w, '#6b4a33', sx * armX(w), 1.38 * s, 0)), ARM_L, ARM_R));
        }
        return smoothMerge(p);
      },
    },
    coat: {
      label: 'Dust coat',
      outfit: (spec) => {
        const { s, w, coat } = spec;
        const p = [
          tagGroup(cloth(rbox(0.45 * w, 0.36 * s, 0.31 * w, 0.08 * w, coat, 0, 1.2 * s, 0)), BODY),
          tagGroup(cloth(rbox(0.47 * w, 0.34 * s, 0.33 * w, 0.08 * w, shade(coat, 0.92), 0, 0.93 * s, 0)), BODY),
          tagGroup(cloth(ring(0.14 * w, 0.02 * w, shade(coat, 0.82), 0, 1.42 * s, 0)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(cloth(ball(0.082 * w, shade(coat, 0.94), sx * armX(w), 1.38 * s, 0)), ARM_L, ARM_R));
          p.push(tagSides(cloth(capsule(0.066 * w, 0.22 * s, shade(coat, 0.96), sx * armX(w), 1.18 * s, 0)), ARM_L, ARM_R));
          p.push(tagSides(cloth(capsule(0.056 * w, 0.2 * s, shade(coat, 0.88), sx * armX(w), 0.85 * s, 0.005 * w)), ARM_L, ARM_R));
          p.push(tagGroup(cloth(rbox(0.12 * w, 0.34 * s, 0.12 * w, 0.03, shade(coat, 0.84), sx * 0.23 * w, 0.98 * s, -0.02 * w, 0, 0, sx * 0.04)), BODY));
        }
        return smoothMerge(p);
      },
    },
    plate: {
      label: 'Plate carrier',
      outfit: (spec) => {
        const { s, w } = spec;
        const p = [
          tagGroup(metal(rbox(0.43 * w, 0.34 * s, 0.3 * w, 0.05 * w, '#9a9c9d', 0, 1.2 * s, 0)), BODY),
          tagGroup(metal(rbox(0.3 * w, 0.12 * s, 0.31 * w, 0.03, '#b2b4b4', 0, 1.34 * s, 0)), BODY),
          tagGroup(metal(rbox(0.34 * w, 0.28 * s, 0.02, 0.01, '#5f6164', 0, 1.2 * s, 0.16 * w)), BODY),
          tagGroup(leather(ring(0.2 * w, 0.018 * w, '#5a4433', 0, 1.06 * s, 0)), BODY),
        ];
        for (const sx of [-1, 1]) {
          p.push(tagSides(metal(ball(0.08 * w, '#9a9c9d', sx * armX(w), 1.38 * s, 0)), ARM_L, ARM_R));
          p.push(tagSides(metal(capsule(0.064 * w, 0.2 * s, '#6b6d70', sx * armX(w), 1.18 * s, 0)), ARM_L, ARM_R));
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
        const { s, w, pants, pantsDark } = spec;
        const p = [];
        for (const sx of [-1, 1]) {
          p.push(cloth(capsule(0.083 * w, 0.26 * s, pants, sx * legX(w), 0.62 * s, 0)));
          p.push(cloth(capsule(0.068 * w, 0.24 * s, pantsDark, sx * legX(w), 0.26 * s, 0)));
          p.push(cloth(ball(0.086 * w, pants, sx * legX(w), 0.43 * s, 0, 1, 0.85, 1)));
        }
        return tagSides(smoothMerge(p));
      },
    },
    greaves: {
      label: 'Greaves',
      outfit: (spec) => {
        const { s, w, pants, pantsDark } = spec;
        const p = [];
        for (const sx of [-1, 1]) {
          p.push(cloth(capsule(0.082 * w, 0.26 * s, pants, sx * legX(w), 0.62 * s, 0)));
          p.push(cloth(capsule(0.068 * w, 0.24 * s, pantsDark, sx * legX(w), 0.26 * s, 0)));
          p.push(metal(rbox(0.13 * w, 0.28 * s, 0.14 * w, 0.035 * w, '#9a9c9d', sx * legX(w), 0.27 * s, 0.02 * w)));
          p.push(metal(ball(0.068 * w, '#b2b4b4', sx * legX(w), 0.42 * s, 0.03 * w, 1, 0.8, 0.9)));
        }
        return tagSides(smoothMerge(p));
      },
    },
    wraps: {
      label: 'Leg wraps',
      outfit: (spec) => {
        const { s, w, pants, pantsDark } = spec;
        const p = [];
        for (const sx of [-1, 1]) {
          p.push(cloth(capsule(0.08 * w, 0.2 * s, pants, sx * legX(w), 0.68 * s, 0)));
          p.push(cloth(capsule(0.066 * w, 0.22 * s, pantsDark, sx * legX(w), 0.26 * s, 0)));
          for (let i = 0; i < 3; i++) {
            p.push(leather(ring(0.068 * w, 0.012 * w, '#6b5233', sx * legX(w), 0.12 * s + i * 0.07 * s, 0)));
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
        const p = [];
        for (const sx of [-1, 1]) {
          p.push(leather(rbox(0.14 * w, 0.15 * s, 0.26 * w, 0.035 * w, '#332f29', sx * legX(w), 0.04 * s, 0.045 * w)));
          p.push(leather(ring(0.072 * w, 0.014 * w, '#4a3728', sx * legX(w), 0.105 * s, 0)));
        }
        return tagSides(smoothMerge(p));
      },
    },
    wraps: {
      label: 'Foot wraps',
      outfit: (spec) => {
        const { s, w } = spec;
        const p = [];
        for (const sx of [-1, 1]) {
          p.push(leather(rbox(0.13 * w, 0.08 * s, 0.24 * w, 0.025 * w, '#6b5233', sx * legX(w), 0.03 * s, 0.04 * w)));
          p.push(leather(ring(0.07 * w, 0.012 * w, '#7d5a3f', sx * legX(w), 0.07 * s, 0)));
          p.push(leather(ring(0.068 * w, 0.012 * w, '#5a4433', sx * legX(w), 0.11 * s, 0)));
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
  return parts.length === 1 ? parts[0] : merge(parts);
}
