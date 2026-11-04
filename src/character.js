import * as THREE from 'three';
import { box, cyl, merge, paint, shadowTexture } from './geo.js';
import { makeRng } from './rng.js';
import {
  ball,
  capsule,
  getLowDetail,
  loft,
  pose,
  rbox,
  ring,
  smoothMerge,
  sphereCap,
} from './charparts.js';

/**
 * Parametric humanoid generator.
 *
 * A shared skeleton with three body archetypes, proportion jitter, a palette, and a gear kit
 * (headwrap, scarf, goggles, coat, pads, backpack, bedroll, tool). Every part is merged into one
 * mesh per bone, so an NPC costs six draws: torso, head, two arms, two legs.
 */

/**
 * Archetypes differ in build, not just in scale. `shoulder` moves the arm sockets and the deltoids,
 * `chest` deepens the ribcage, `limb` thickens arms and legs, `hip` widens the pelvis and stance,
 * and `posture` leans the upper torso (positive = forward).
 */
export const SHAPES = {
  lean: { s: 0.98, w: 0.94, head: 1.0, shoulder: 0.96, chest: 0.94, limb: 0.94, hip: 0.96, posture: 0.018, neck: 1.03 },
  stocky: { s: 0.94, w: 1.06, head: 1.04, shoulder: 1.02, chest: 1.08, limb: 1.07, hip: 1.05, posture: -0.014, neck: 0.92 },
  tall: { s: 1.08, w: 0.95, head: 0.97, shoulder: 1.0, chest: 0.97, limb: 0.98, hip: 0.98, posture: 0.03, neck: 1.07 },
};

const SKIN = ['#c08d60', '#a8734d', '#8a5a3d', '#d1a077', '#6f4a35'];
const COATS = ['#6b614e', '#5c5343', '#4f5a52', '#6d5a44', '#55606a', '#765d45'];
const ACCENTS = ['#b45c38', '#8d4c33', '#4f7d8d', '#7b6043', '#93a06b', '#c8a44f'];
const PANTS = ['#4a443a', '#3f3b33', '#514a3b', '#444b44'];
const HAIR = ['#2b241e', '#3a2e24', '#4a3527', '#5a4433', '#6b5642', '#2f2a26'];

export function shade(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k).getStyle();
}

function torsoGeometry(s, w, skin, coat, coatDark, belt, accent, gear) {
  const p = [];
  p.push(box(0.62 * w, 0.66 * s, 0.38 * w, coat, 0, 1.2 * s, 0));
  p.push(box(0.68 * w, 0.34 * s, 0.42 * w, coatDark, 0, 0.86 * s, 0));
  p.push(box(0.7 * w, 0.1 * s, 0.44 * w, belt, 0, 1.02 * s, 0));
  p.push(box(0.26 * w, 0.1 * s, 0.06 * w, '#9a7f54', 0, 1.02 * s, 0.23 * w));
  p.push(box(0.16 * w, 0.14 * s, 0.16 * w, skin, 0, 1.5 * s, 0));

  if (gear.pads) {
    p.push(box(0.2 * w, 0.13 * s, 0.38 * w, shade(coat, 0.78), 0.4 * w, 1.45 * s, 0));
    p.push(box(0.2 * w, 0.13 * s, 0.38 * w, shade(coat, 0.78), -0.4 * w, 1.45 * s, 0));
  }
  if (gear.coat) {
    p.push(box(0.7 * w, 0.42 * s, 0.12 * w, shade(coat, 0.86), 0, 0.72 * s, -0.22 * w, 0.08, 0, 0));
    p.push(box(0.12 * w, 0.4 * s, 0.34 * w, shade(coat, 0.8), -0.36 * w, 0.76 * s, 0));
    p.push(box(0.12 * w, 0.4 * s, 0.34 * w, shade(coat, 0.8), 0.36 * w, 0.76 * s, 0));
  }
  if (gear.backpack) {
    p.push(box(0.4 * w, 0.48 * s, 0.22 * w, shade(coat, 0.62), 0, 1.24 * s, -0.28 * w));
    p.push(box(0.32 * w, 0.12 * s, 0.24 * w, accent, 0, 1.53 * s, -0.3 * w));
  }
  if (gear.bedroll) {
    p.push(cyl(0.09 * w, 0.09 * w, 0.5 * w, 6, '#94795a', 0, 1.56 * s, -0.33 * w, 0, 0, Math.PI / 2));
  }
  if (gear.tool) {
    p.push(box(0.06 * w, 0.34 * s, 0.06 * w, '#6f6a5e', 0.42 * w, 0.9 * s, 0.18 * w, 0, 0, -0.35));
    p.push(box(0.14 * w, 0.06 * s, 0.06 * w, '#9b9282', 0.42 * w, 1.07 * s, 0.18 * w));
  }
  return merge(p);
}

function headGeometry(s, head, skin, wrap, accent, gear) {
  const p = [];
  p.push(box(0.34 * head, 0.32 * s, 0.34 * head, skin, 0, 0.17 * s, 0.01));
  if (gear.headwrap) {
    p.push(box(0.37 * head, 0.12 * s, 0.36 * head, wrap, 0, 0.33 * s, 0));
  } else {
    p.push(box(0.35 * head, 0.09 * s, 0.34 * head, shade('#3a332b', 1), 0, 0.33 * s, 0));
  }
  if (gear.scarf) {
    p.push(box(0.39 * head, 0.16 * s, 0.38 * head, accent, 0, 0.0 * s, 0.01));
    p.push(box(0.12 * head, 0.3 * s, 0.08 * head, shade(accent, 0.86), 0.1 * head, -0.12 * s, -0.16 * head, 0.15, 0, 0.1));
  }
  p.push(box(0.28 * head, 0.19 * s, 0.08 * head, '#5f5a4f', 0, 0.12 * s, 0.18 * head));
  p.push(box(0.08 * head, 0.015 * s, 0.02 * head, '#2e2b26', -0.07 * head, 0.22 * s, 0.19 * head));
  p.push(box(0.08 * head, 0.015 * s, 0.02 * head, '#2e2b26', 0.07 * head, 0.22 * s, 0.19 * head));
  if (gear.goggles) {
    p.push(box(0.1 * head, 0.08 * s, 0.05 * head, '#2e2b26', -0.09 * head, 0.29 * s, 0.19 * head));
    p.push(box(0.1 * head, 0.08 * s, 0.05 * head, '#2e2b26', 0.09 * head, 0.29 * s, 0.19 * head));
    p.push(box(0.32 * head, 0.03 * s, 0.04 * head, '#4a4438', 0, 0.29 * s, 0.18 * head));
  }
  return merge(p);
}

function armGeometry(s, w, coat, coatDark, skin, accent, weapon) {
  const p = [];
  p.push(box(0.16 * w, 0.46 * s, 0.18 * w, coat, 0, -0.22 * s, 0));
  p.push(box(0.145 * w, 0.1 * s, 0.165 * w, accent, 0, -0.36 * s, 0));
  p.push(box(0.14 * w, 0.38 * s, 0.16 * w, coatDark, 0, -0.6 * s, 0.02 * w));
  p.push(box(0.13 * w, 0.13 * s, 0.14 * w, skin, 0, -0.83 * s, 0.03 * w));
  if (weapon) {
    p.push(box(0.055 * w, 0.18 * s, 0.09 * w, '#5b4530', 0, -0.94 * s, 0.04 * w));
    p.push(box(0.032 * w, 0.45 * s, 0.1 * w, '#b0ad9f', 0, -1.16 * s, 0.04 * w));
    p.push(box(0.04 * w, 0.08 * s, 0.13 * w, '#d1cec0', 0, -1.38 * s, 0.04 * w));
  }
  return merge(p);
}

function legGeometry(s, w, pants, pantsDark) {
  const p = [];
  p.push(box(0.2 * w, 0.46 * s, 0.22 * w, pants, 0, -0.23 * s, 0));
  p.push(box(0.18 * w, 0.4 * s, 0.2 * w, pantsDark, 0, -0.64 * s, 0));
  p.push(box(0.22 * w, 0.17 * s, 0.32 * w, '#332f29', 0, -0.84 * s, 0.04 * w));
  return merge(p);
}

export function makeSpec(seed, options = {}) {
  const rng = makeRng(seed);
  const archetype = options.archetype || rng.pick(['lean', 'stocky', 'tall']);
  const shape = SHAPES[archetype] || SHAPES.lean;
  const s = (options.scale ?? 1) * shape.s * rng.range(0.97, 1.03);
  const w = shape.w * rng.range(0.95, 1.05);
  const head = shape.head * rng.range(0.96, 1.04);

  const skin = options.skin || rng.pick(SKIN);
  const coat = options.coat || rng.pick(COATS);
  const accent = options.accent || rng.pick(ACCENTS);
  const belt = shade(coat, 0.7);
  const coatDark = shade(coat, 0.82);
  const pants = rng.pick(PANTS);
  const pantsDark = shade(pants, 0.82);
  const wrap = rng() < 0.55 ? accent : shade(coat, 0.9);

  const gear = {
    headwrap: rng() < 0.75,
    scarf: rng() < 0.72,
    goggles: rng() < 0.3,
    backpack: rng() < 0.58,
    bedroll: rng() < 0.35,
    coat: rng() < 0.5,
    pads: rng() < 0.4,
    tool: rng() < 0.35,
    weapon: !!options.weapon,
    ...(options.gear || {}),
  };

  // Keep the palette draws above untouched so a seed still picks the same colours; the build jitter
  // is drawn last, after the hair colour, which is the final random pick.
  const hair = options.hair || rng.pick(HAIR);
  const build = {
    shoulder: shape.shoulder * rng.range(0.97, 1.03),
    chest: shape.chest * rng.range(0.97, 1.03),
    limb: shape.limb * rng.range(0.96, 1.04),
    hip: shape.hip * rng.range(0.97, 1.03),
    posture: shape.posture + rng.range(-0.004, 0.004),
    neck: shape.neck,
  };

  return { rng, archetype, s, w, head, build, skin, coat, accent, belt, coatDark, pants, pantsDark, wrap, gear, hair };
}

export function buildHumanoid(seed, options = {}) {
  const spec = makeSpec(seed, options);
  const { s, w, head, skin, coat, coatDark, belt, accent, wrap, pants, pantsDark, gear, archetype } = spec;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);

  const torso = new THREE.Mesh(torsoGeometry(s, w, skin, coat, coatDark, belt, accent, gear), material);
  bob.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.55 * s, 0);
  headGroup.add(new THREE.Mesh(headGeometry(s, head, skin, wrap, accent, gear), material));
  bob.add(headGroup);

  const armL = new THREE.Group();
  armL.position.set(-0.41 * w, 1.43 * s, 0);
  armL.add(new THREE.Mesh(armGeometry(s, w, coat, coatDark, skin, accent, false), material));
  bob.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.41 * w, 1.43 * s, 0);
  armR.add(new THREE.Mesh(armGeometry(s, w, coat, coatDark, skin, accent, gear.weapon), material));
  bob.add(armR);

  const legL = new THREE.Group();
  legL.position.set(-0.17 * w, 0.86 * s, 0);
  legL.add(new THREE.Mesh(legGeometry(s, w, pants, pantsDark), material));
  bob.add(legL);

  const legR = new THREE.Group();
  legR.position.set(0.17 * w, 0.86 * s, 0);
  legR.add(new THREE.Mesh(legGeometry(s, w, pants, pantsDark), material));
  bob.add(legR);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
    toneMapped: false,
    color: 0x000000,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35 * w, 1.35 * w), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  shadow.renderOrder = 1;
  group.add(shadow);

  bob.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = options.castShadow !== false;
      obj.receiveShadow = false;
    }
  });

  const rig = {
    group,
    bob,
    torso,
    head: headGroup,
    armL,
    armR,
    legL,
    legR,
    shadow,
    material,
    archetype,
    params: { s, w, head },
    gear,
    lookAt(x, z, dt) {
      const dx = x - group.position.x;
      const dz = z - group.position.z;
      let yaw = Math.atan2(dx, dz) - group.rotation.y;
      while (yaw > Math.PI) yaw -= Math.PI * 2;
      while (yaw < -Math.PI) yaw += Math.PI * 2;
      const target = Math.max(-1.05, Math.min(1.05, yaw));
      headGroup.rotation.y += (target - headGroup.rotation.y) * (1 - Math.exp(-8 * dt));
    },
    setPose(dt, moving, phase) {
      const m = moving ? 1 : 0;
      const swing = Math.sin(phase) * m;
      bob.position.y = Math.abs(Math.sin(phase)) * 0.035 * m + Math.sin(phase * 0.5) * 0.008;
      bob.rotation.z = Math.sin(phase) * 0.018 * m;
      legL.rotation.x = swing * 0.62;
      legR.rotation.x = -swing * 0.62;
      armL.rotation.x = -swing * 0.5;
      armL.rotation.z = 0.06;
      armR.rotation.x = swing * 0.5;
      armR.rotation.z = -0.06;
      headGroup.rotation.x = Math.sin(phase * 0.5) * 0.015;
    },
  };
  return rig;
}

// ---------------------------------------------------------------------------
// Smooth (R1) variant
//
// The primitives now come from charparts.js so this variant, the skinned body and the wardrobe
// all share the low-detail switching and the loft/profile system.
// ---------------------------------------------------------------------------

/** Small facial forms do not need a full-resolution sphere; keep the head cheap. */
function smallSphere(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 8, 6);
  g.scale(sx, sy, sz);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}



function smoothTorso(spec) {
  const { s, w, skin, coat, coatDark, belt, accent, gear } = spec;
  const p = [];
  p.push(rbox(0.62 * w, 0.66 * s, 0.38 * w, 0.1 * w, coat, 0, 1.2 * s, 0));
  p.push(rbox(0.68 * w, 0.34 * s, 0.42 * w, 0.1 * w, coatDark, 0, 0.86 * s, 0));
  p.push(rbox(0.7 * w, 0.1 * s, 0.44 * w, 0.04 * w, belt, 0, 1.02 * s, 0));
  p.push(rbox(0.24 * w, 0.09 * s, 0.06 * w, 0.02 * w, '#9a7f54', 0, 1.02 * s, 0.23 * w));
  p.push(capsule(0.07 * w, 0.08 * s, skin, 0, 1.52 * s, 0));

  if (gear.pads) {
    p.push(rbox(0.2 * w, 0.13 * s, 0.38 * w, 0.06 * w, shade(coat, 0.78), 0.4 * w, 1.45 * s, 0));
    p.push(rbox(0.2 * w, 0.13 * s, 0.38 * w, 0.06 * w, shade(coat, 0.78), -0.4 * w, 1.45 * s, 0));
  }
  if (gear.coat) {
    p.push(rbox(0.7 * w, 0.42 * s, 0.12 * w, 0.05 * w, shade(coat, 0.86), 0, 0.72 * s, -0.22 * w, 0.08, 0, 0));
    p.push(rbox(0.12 * w, 0.4 * s, 0.34 * w, 0.05 * w, shade(coat, 0.8), -0.36 * w, 0.76 * s, 0));
    p.push(rbox(0.12 * w, 0.4 * s, 0.34 * w, 0.05 * w, shade(coat, 0.8), 0.36 * w, 0.76 * s, 0));
  }
  if (gear.backpack) {
    p.push(rbox(0.4 * w, 0.48 * s, 0.22 * w, 0.06 * w, shade(coat, 0.62), 0, 1.24 * s, -0.28 * w));
    p.push(rbox(0.32 * w, 0.12 * s, 0.24 * w, 0.05 * w, accent, 0, 1.53 * s, -0.3 * w));
  }
  if (gear.bedroll) {
    p.push(capsule(0.09 * w, 0.5 * w, '#94795a', 0, 1.56 * s, -0.33 * w, 0, 0, Math.PI / 2));
  }
  if (gear.tool) {
    p.push(capsule(0.025 * w, 0.3 * s, '#6f6a5e', 0.42 * w, 0.95 * s, 0.18 * w, 0, 0, -0.35));
    p.push(ball(0.06 * w, '#9b9282', 0.42 * w, 1.1 * s, 0.18 * w));
  }
  return smoothMerge(p);
}

export function smoothHead(spec) {
  const { s, head, skin, wrap, accent, gear } = spec;
  const low = getLowDetail();
  const seg = low ? 10 : 16;
  const p = [];

  // Skull as one loft: chin, jaw, cheekbone, brow, forehead and crown share a surface. The old
  // version stacked three squashed balls, which is what gave the head its snowman silhouette.
  // Heights are in `s` and widths in `head`, so a broad archetype gets a broad face, not a taller one.
  const skull = [
    [0.0, 0.034, 0.04],
    [0.028, 0.066, 0.07],
    [0.068, 0.088, 0.091],
    [0.112, 0.103, 0.106],
    [0.158, 0.108, 0.111],
    [0.2, 0.103, 0.107],
    [0.236, 0.082, 0.092],
    [0.258, 0.044, 0.055],
  ].map(([y, rx, rz]) => ({ y: y * s, rx: rx * head, rz: rz * head }));
  p.push(loft(skull, skin, { segments: seg, round: 0.12, capStart: 0.005 * s, capEnd: 0.012 * s }));

  // Cheek planes, brow ridge, nose and ears: the forms that read as a face at 2x zoom.
  for (const sx of [-1, 1]) {
    p.push(smallSphere(0.05 * head, skin, sx * 0.064 * head, 0.104 * s, 0.068 * head, 0.9, 0.74, 0.62));
    p.push(smallSphere(0.037 * head, skin, sx * 0.106 * head, 0.145 * s, -0.008 * head, 0.3, 1.0, 0.64));
  }
  p.push(rbox(0.138 * head, 0.014 * s, 0.03 * head, 0.007 * head, shade(skin, 0.97), 0, 0.163 * s, 0.086 * head));
  p.push(capsule(0.012 * head, 0.04 * s, skin, 0, 0.127 * s, 0.099 * head));
  p.push(smallSphere(0.022 * head, skin, 0, 0.099 * s, 0.102 * head, 1.0, 0.78, 0.9));
  p.push(rbox(0.058 * head, 0.013 * s, 0.013 * head, 0.005 * head, '#5e3d33', 0, 0.064 * s, 0.094 * head));
  p.push(rbox(0.056 * head, 0.02 * s, 0.02 * head, 0.008 * head, shade(skin, 0.94), 0, 0.03 * s, 0.082 * head));

  // Eyes: ~4.6 cm spheres, small enough to stop reading as googly at zoom.
  for (const sx of [-1, 1]) {
    p.push(smallSphere(0.023 * head, '#ddd6c6', sx * 0.043 * head, 0.145 * s, 0.093 * head, 1, 0.92, 0.72));
    p.push(smallSphere(0.0105 * head, '#241f1a', sx * 0.043 * head, 0.145 * s, 0.106 * head, 1, 1, 0.7));
    p.push(rbox(0.058 * head, 0.009 * s, 0.014 * head, 0.004 * head, shade(spec.hair, 0.9), sx * 0.045 * head, 0.172 * s, 0.096 * head, 0, 0, sx * -0.08));
  }

  // Headwear is a shell over the skull, not a second ball: it leaves the brow and eyes visible.
  if (gear.headwrap) {
    p.push(sphereCap(0.118 * head, wrap, 0, 0.181 * s, -0.006 * head, 1.0, 0.93, 1.04, 0.46));
    p.push(ring(0.112 * head, 0.016 * head, shade(wrap, 0.88), 0, 0.186 * s, -0.004 * head));
  } else {
    p.push(sphereCap(0.117 * head, shade('#3a332b', 1), 0, 0.181 * s, -0.006 * head, 1.0, 0.93, 1.04, 0.46));
    p.push(smallSphere(0.083 * head, shade('#3a332b', 1), 0, 0.11 * s, -0.045 * head, 1.0, 0.95, 0.8));
  }
  if (gear.scarf) {
    p.push(ring(0.062 * s, 0.02 * s, accent, 0, 0.004 * s, 0));
    p.push(rbox(0.085 * s, 0.19 * s, 0.028 * s, 0.012, shade(accent, 0.86), 0.042 * s, -0.1 * s, -0.045 * s, 0.15, 0, 0.1));
  }
  if (gear.goggles) {
    const lens = (x) => {
      const g = new THREE.CylinderGeometry(0.042 * head, 0.042 * head, 0.028 * head, low ? 8 : 12);
      paint(g, '#2e2b26');
      return pose(g, x, 0.172 * s, 0.098 * head, Math.PI / 2, 0, 0);
    };
    p.push(lens(-0.065 * head));
    p.push(lens(0.065 * head));
    p.push(ring(0.114 * head, 0.013, '#4a4438', 0, 0.176 * s, 0));
  }
  return smoothMerge(p);
}

function smoothArmUpper(spec) {
  const { s, w, coat } = spec;
  return smoothMerge([
    ball(0.095 * w, coat, 0, 0.02 * s, 0),
    capsule(0.085 * w, 0.26 * s, coat, 0, -0.2 * s, 0),
  ]);
}

function smoothArmLower(spec, weapon) {
  const { s, w, coatDark, skin, accent } = spec;
  const p = [];
  p.push(capsule(0.075 * w, 0.22 * s, coatDark, 0, -0.16 * s, 0.01 * w));
  p.push(capsule(0.08 * w, 0.05 * s, accent, 0, -0.3 * s, 0.01 * w));
  p.push(ball(0.08 * w, skin, 0, -0.38 * s, 0.03 * w, 1, 0.9, 0.8));
  if (weapon) {
    p.push(capsule(0.025 * w, 0.16 * s, '#5b4530', 0, -0.5 * s, 0.04 * w));
    p.push(rbox(0.03 * w, 0.42 * s, 0.08 * w, 0.015, '#b0ad9f', 0, -0.76 * s, 0.04 * w));
    p.push(rbox(0.04 * w, 0.06 * s, 0.11 * w, 0.01, '#d1cec0', 0, -1.0 * s, 0.04 * w));
  }
  return smoothMerge(p);
}

function smoothLegUpper(spec) {
  const { s, w, pants } = spec;
  return smoothMerge([
    ball(0.11 * w, pants, 0, 0.02 * s, 0),
    capsule(0.105 * w, 0.28 * s, pants, 0, -0.2 * s, 0),
  ]);
}

function smoothLegLower(spec) {
  const { s, w, pantsDark } = spec;
  return smoothMerge([
    capsule(0.085 * w, 0.24 * s, pantsDark, 0, -0.16 * s, 0),
    rbox(0.18 * w, 0.12 * s, 0.3 * w, 0.04 * w, '#332f29', 0, -0.36 * s, 0.05 * w),
  ]);
}

export function buildSmoothHumanoid(seed, options = {}) {
  const spec = makeSpec(seed, options);
  const { s, w, gear, archetype } = spec;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);

  const torso = new THREE.Mesh(smoothTorso(spec), material);
  bob.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.55 * s, 0);
  headGroup.add(new THREE.Mesh(smoothHead(spec), material));
  bob.add(headGroup);

  const armL = new THREE.Group();
  armL.position.set(-0.41 * w, 1.43 * s, 0);
  armL.add(new THREE.Mesh(smoothArmUpper(spec), material));
  const elbowL = new THREE.Group();
  elbowL.position.set(0, -0.42 * s, 0);
  elbowL.rotation.x = -0.18;
  elbowL.add(new THREE.Mesh(smoothArmLower(spec, false), material));
  armL.add(elbowL);
  bob.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.41 * w, 1.43 * s, 0);
  armR.add(new THREE.Mesh(smoothArmUpper(spec), material));
  const elbowR = new THREE.Group();
  elbowR.position.set(0, -0.42 * s, 0);
  elbowR.rotation.x = -0.18;
  elbowR.add(new THREE.Mesh(smoothArmLower(spec, gear.weapon), material));
  armR.add(elbowR);
  bob.add(armR);

  const legL = new THREE.Group();
  legL.position.set(-0.17 * w, 0.86 * s, 0);
  legL.add(new THREE.Mesh(smoothLegUpper(spec), material));
  const kneeL = new THREE.Group();
  kneeL.position.set(0, -0.44 * s, 0);
  kneeL.rotation.x = 0.06;
  kneeL.add(new THREE.Mesh(smoothLegLower(spec), material));
  legL.add(kneeL);
  bob.add(legL);

  const legR = new THREE.Group();
  legR.position.set(0.17 * w, 0.86 * s, 0);
  legR.add(new THREE.Mesh(smoothLegUpper(spec), material));
  const kneeR = new THREE.Group();
  kneeR.position.set(0, -0.44 * s, 0);
  kneeR.rotation.x = 0.06;
  kneeR.add(new THREE.Mesh(smoothLegLower(spec), material));
  legR.add(kneeR);
  bob.add(legR);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
    toneMapped: false,
    color: 0x000000,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35 * w, 1.35 * w), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  shadow.renderOrder = 1;
  group.add(shadow);

  bob.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = options.castShadow !== false;
      obj.receiveShadow = false;
    }
  });

  return {
    group,
    bob,
    torso,
    head: headGroup,
    armL,
    armR,
    legL,
    legR,
    elbowL,
    elbowR,
    kneeL,
    kneeR,
    shadow,
    material,
    archetype,
    params: { s, w, head: spec.head },
    gear,
    lookAt(x, z, dt) {
      const dx = x - group.position.x;
      const dz = z - group.position.z;
      let yaw = Math.atan2(dx, dz) - group.rotation.y;
      while (yaw > Math.PI) yaw -= Math.PI * 2;
      while (yaw < -Math.PI) yaw += Math.PI * 2;
      const target = Math.max(-1.05, Math.min(1.05, yaw));
      headGroup.rotation.y += (target - headGroup.rotation.y) * (1 - Math.exp(-8 * dt));
    },
    setPose(dt, moving, phase) {
      const m = moving ? 1 : 0;
      const swing = Math.sin(phase) * m;
      bob.position.y = Math.abs(Math.sin(phase)) * 0.035 * m + Math.sin(phase * 0.5) * 0.008;
      bob.rotation.z = Math.sin(phase) * 0.018 * m;
      legL.rotation.x = swing * 0.62;
      legR.rotation.x = -swing * 0.62;
      armL.rotation.x = -swing * 0.5;
      armL.rotation.z = 0.06;
      armR.rotation.x = swing * 0.5;
      armR.rotation.z = -0.06;
      elbowL.rotation.x = -0.18 - Math.max(0, -swing) * 0.22;
      elbowR.rotation.x = -0.18 - Math.max(0, swing) * 0.22;
      kneeL.rotation.x = 0.06 + Math.max(0, swing) * 0.3;
      kneeR.rotation.x = 0.06 + Math.max(0, -swing) * 0.3;
      headGroup.rotation.x = Math.sin(phase * 0.5) * 0.015;
    },
  };
}
