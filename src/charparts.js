import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { merge, paint } from './geo.js';
import { CHAR_REGIONS } from './textures.js';
import { clamp } from './rng.js';

/**
 * Shared low-level character primitives.
 *
 * Both the skinned body and the wardrobe build from these, so the body, outfit layers and gear use
 * the same bevel/segment counts and the same character-atlas UV projection.
 */

// Keep the limb layout in one place: the skeleton, the skin-weight segments, the body and the
// wardrobe all read these, so changing a proportion cannot leave gear floating off a bone.
export const LAYOUT = {
  // Neutral proportions: a 1.83 m body with ~0.50 m shoulders and hip joints ~0.18 m apart.
  // The old 0.25 / 0.12 read as broad shoulders over a wide, bow-legged stance.
  shoulderX: 0.105,
  armX: 0.196,
  legX: 0.088,
  neckY: 1.44,
  headY: 1.56,
};

// Skinning groups: a vertex may only bind to bones from its own group. This is what keeps a
// shirt sleeve from being torn between the chest and the arm.
export const RIG_GROUP = {
  BODY: 0,
  ARM_L: 1,
  ARM_R: 2,
  LEG_L: 3,
  LEG_R: 4,
};

export function tagGroup(geo, group) {
  if (!geo) return geo;
  const count = geo.attributes.position.count;
  const values = new Float32Array(count);
  values.fill(group);
  geo.setAttribute('aGroup', new THREE.Float32BufferAttribute(values, 1));
  return geo;
}

/** Tag each vertex by its X side (left is negative). Used for sleeves, legs and boots. */
export function tagSides(geo, left = RIG_GROUP.LEG_L, right = RIG_GROUP.LEG_R) {
  if (!geo) return geo;
  const pos = geo.attributes.position;
  const values = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) values[i] = pos.getX(i) < 0 ? left : right;
  geo.setAttribute('aGroup', new THREE.Float32BufferAttribute(values, 1));
  return geo;
}

let LOW_DETAIL = false;

export function setLowDetail(v) {
  LOW_DETAIL = v;
}

export function getLowDetail() {
  return LOW_DETAIL;
}

export function pose(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export function rbox(w, h, d, r, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new RoundedBoxGeometry(w, h, d, LOW_DETAIL ? 1 : 3, Math.min(r, Math.min(w, h, d) * 0.45));
  paint(g, color);
  return pose(g, x, y, z, rx, ry, rz);
}

export function capsule(r, h, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CapsuleGeometry(r, h, LOW_DETAIL ? 2 : 5, LOW_DETAIL ? 8 : 12);
  paint(g, color);
  return pose(g, x, y, z, rx, ry, rz);
}

export function ball(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, LOW_DETAIL ? 10 : 16, LOW_DETAIL ? 8 : 12);
  g.scale(sx, sy, sz);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}

/** A top shell cut from a sphere (hair, hoods, helmets). Open underneath so a face stays clear. */
export function sphereCap(r, color, x, y, z, sx = 1, sy = 1, sz = 1, theta = 0.5) {
  const g = new THREE.SphereGeometry(
    r,
    LOW_DETAIL ? 10 : 16,
    LOW_DETAIL ? 6 : 10,
    0,
    Math.PI * 2,
    0,
    Math.PI * theta,
  );
  g.scale(sx, sy, sz);
  paint(g, color);
  g.translate(x, y, z);
  return g;
}

export function ring(r, tube, color, x = 0, y = 0, z = 0) {
  const g = new THREE.TorusGeometry(r, tube, LOW_DETAIL ? 5 : 8, LOW_DETAIL ? 12 : 20);
  paint(g, color);
  return pose(g, x, y, z, Math.PI / 2);
}

export function smoothMerge(parts) {
  const geo = merge(parts);
  const welded = mergeVertices(geo, 1e-3);
  welded.computeVertexNormals();
  welded.computeBoundingSphere();
  return welded;
}

// ---------------------------------------------------------------------------
// Lofts and body profiles
//
// Boxes stack into a blocky silhouette. A human torso is a single tapered volume: hips, a narrow
// waist, a ribcage and a shoulder line that slopes into the neck. The body and every torso/leg/feet
// outfit item therefore build from the *same* cross-section profiles, so clothing can be inflated a
// few millimetres from the body instead of boxed around it, and changing a proportion cannot leave
// a sleeve floating off the arm.
// ---------------------------------------------------------------------------

export function radialSegments() {
  return LOW_DETAIL ? 10 : 16;
}

/**
 * Loft a closed tube through cross-sections.
 *
 * `axis: 'y'` (default) stacks rings up the body: `{ y, rx, rz, x?, z? }`.
 * `axis: 'z'` builds along the foot: `{ z, rx, ry, x?, y? }`.
 * `round` is 0 for an ellipse and 1 for a rounded square (superellipse exponent), which is what
 * keeps a torso from reading as a pipe. `capStart`/`capEnd` are dome heights in world units.
 */
export function loft(sections, color, opts = {}) {
  const segments = opts.segments ?? radialSegments();
  const axis = opts.axis === 'z' ? 'z' : 'y';
  const round = opts.round ?? 0.2;
  const exp = 2 / (2 + 2 * round);
  const positions = [];
  const indices = [];
  // Triangle winding assumes the rings run in +axis order. Profiles read top-down (arms, legs) as
  // often as bottom-up, and a reversed list turns the tube inside out: the near wall is back-face
  // culled and the part disappears behind whatever it was meant to cover.
  const key = axis === 'z' ? 'z' : 'y';
  sections = [...sections].sort((a, b) => a[key] - b[key]);

  const pushRing = (sec, scale, along) => {
    const cx = sec.x || 0;
    const cz = sec.z || 0;
    const cy = sec.y || 0;
    const rx = sec.rx * scale;
    const r2 = (axis === 'z' ? (sec.ry ?? sec.rx) : (sec.rz ?? sec.rx)) * scale;
    const start = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      const px = Math.sign(c) * Math.pow(Math.abs(c), exp) * rx;
      const p2 = Math.sign(sn) * Math.pow(Math.abs(sn), exp) * r2;
      if (axis === 'z') positions.push(cx + px, cy + p2, along ?? cz);
      else positions.push(cx + px, along ?? cy, cz + p2);
    }
    return start;
  };

  // A ring parameterised as (cos, sin) faces outward for a +Y tube but inward for a +Z tube,
  // so the foot needs the opposite winding.
  const tri = (p0, p1, p2) => {
    if (axis === 'z') indices.push(p0, p2, p1);
    else indices.push(p0, p1, p2);
  };

  const rings = sections.map((sec) => pushRing(sec, 1));
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k];
    const b = rings[k + 1];
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      tri(a + i, b + i, b + j);
      tri(a + i, b + j, a + j);
    }
  }

  const cap = (sec, ring, dir, height) => {
    if (!height) return;
    const base = axis === 'z' ? sec.z : sec.y;
    const midSec = {
      ...sec,
      rx: sec.rx * 0.78,
      ry: (sec.ry ?? sec.rx) * 0.78,
      rz: (sec.rz ?? sec.rx) * 0.78,
    };
    const mid = pushRing(midSec, 1, base + dir * height * 0.55);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      if (dir > 0) {
        tri(ring + i, mid + i, mid + j);
        tri(ring + i, mid + j, ring + j);
      } else {
        tri(ring + i, mid + j, mid + i);
        tri(ring + i, ring + j, mid + j);
      }
    }
    const pole = positions.length / 3;
    if (axis === 'z') positions.push(sec.x || 0, sec.y || 0, base + dir * height);
    else positions.push(sec.x || 0, base + dir * height, sec.z || 0);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      if (dir > 0) tri(mid + i, pole, mid + j);
      else tri(mid + i, mid + j, pole);
    }
  };
  if (sections.length) {
    cap(sections[0], rings[0], -1, opts.capStart || 0);
    cap(sections[sections.length - 1], rings[rings.length - 1], 1, opts.capEnd || 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Placeholder UVs keep the attribute set identical to the primitive helpers so the body and the
  // outfit can be merged; the atlas projection overwrites them right after.
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  paint(geo, color);
  return geo;
}

/** Sample a profile between two heights and return a new inflated section list. */
export function trimProfile(profile, from, to, inflate = 0, axis = 'y') {
  const key = axis === 'z' ? 'z' : 'y';
  // Profiles read top-down as often as bottom-up; sample them in a known order.
  profile = [...profile].sort((a, b) => a[key] - b[key]);
  const at = (t) => {
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i];
      const b = profile[i + 1];
      if (t >= a[key] && t <= b[key]) {
        const span = b[key] - a[key] || 1;
        const f = (t - a[key]) / span;
        const out = {};
        for (const k of ['rx', 'ry', 'rz', 'x', 'y', 'z']) {
          if (a[k] === undefined && b[k] === undefined) continue;
          out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * f;
        }
        out[key] = t;
        return out;
      }
    }
    // Past either end, extend the end section. Hems and boot toes must be able to sit *beyond*
    // the body profile: otherwise a boot ends at exactly the same point as the foot it covers and
    // the toes poke through the leather.
    const end = t > profile[profile.length - 1][key] ? profile[profile.length - 1] : profile[0];
    if (!end) return null;
    return { ...end, [key]: t };
  };
  const list = [at(from), ...profile.filter((sec) => sec[key] > from && sec[key] < to), at(to)];
  return list.filter(Boolean).map((sec) => {
    const out = { ...sec };
    out.rx = sec.rx + inflate;
    if (sec.ry !== undefined) out.ry = sec.ry + inflate;
    if (sec.rz !== undefined) out.rz = sec.rz + inflate;
    return out;
  });
}

// Derived layout. LAYOUT holds the neutral ratios; these fold in the per-archetype build factors so
// the skeleton, the body, the outfit and the gear sockets all move together.
export function shoulderXOf(spec) {
  return LAYOUT.shoulderX * spec.w * (spec.build?.shoulder ?? 1);
}

export function armXOf(spec) {
  return LAYOUT.armX * spec.w * (spec.build?.shoulder ?? 1);
}

export function legXOf(spec) {
  return LAYOUT.legX * spec.w * (spec.build?.hip ?? 1);
}

/** Torso cross-sections from pelvis to neck base. Half-widths are in `w`, heights in `s`. */
export function torsoProfile(spec) {
  const { s, w, build } = spec;
  const chest = build?.chest ?? 1;
  const hip = build?.hip ?? 1;
  const lean = build?.posture ?? 0;
  // y, half-width, half-depth, width factor, spine offset (lumbar in, thoracic out).
  const rows = [
    [0.81, 0.142, 0.096, hip, -0.004],
    [0.85, 0.17, 0.113, hip, -0.002],
    [0.905, 0.163, 0.108, hip, 0.001],
    [0.975, 0.148, 0.099, 1, 0.004],
    [1.050, 0.144, 0.097, 1, 0.006],
    [1.120, 0.162, 0.105, 1, 0.005],
    [1.200, 0.184, 0.112, chest, 0.001],
    [1.280, 0.199, 0.117, chest, -0.003],
    [1.350, 0.192, 0.109, chest, -0.004],
    // Clavicle shelf: wide enough to meet the deltoid, then the trapezius slopes into the neck.
    [1.398, 0.16, 0.099, chest, -0.003],
    [1.428, 0.128, 0.085, 1, -0.001],
    [1.448, 0.086, 0.069, 1, 0.0],
    // The last ring hugs the neck so the open top of the torso is never a visible hole.
    [1.462, 0.056, 0.055, 1, 0.001],
  ];
  return rows.map(([y, rx, rz, k, z]) => {
    // Posture: a tall survivor carries the chest slightly forward, a stocky one sits back.
    const leanShift = lean * Math.pow(clamp((y - 0.86) / 0.6, 0, 1), 1.5);
    return {
      y: y * s,
      rx: rx * w * k,
      rz: rz * w * k,
      z: (z + leanShift) * w,
      round: 0.24,
    };
  });
}

/** Arm cross-sections: deltoid, elbow and forearm belly, tapering to a wrist. */
export function armProfile(spec, side) {
  const { s, w, build } = spec;
  const limb = build?.limb ?? 1;
  const x = (side === 'L' ? -1 : 1) * armXOf(spec);
  // y, radius, forward offset (the elbow hangs a little in front of the shoulder line).
  const rows = [
    [1.395, 0.059, 0.0],
    [1.358, 0.066, 0.0],
    [1.300, 0.054, 0.002],
    [1.230, 0.049, 0.004],
    [1.160, 0.047, 0.006],
    [1.105, 0.049, 0.007],
    [1.070, 0.046, 0.008],
    [1.000, 0.048, 0.009],
    [0.930, 0.039, 0.010],
    [0.866, 0.033, 0.011],
  ];
  return rows.map(([y, r, z]) => ({
    y: y * s,
    x,
    rx: r * w * limb,
    rz: r * w * limb,
    z: z * w,
  }));
}

/** Leg cross-sections: glute, thigh taper, knee cap, calf belly, ankle. */
export function legProfile(spec, side) {
  const { s, w, build } = spec;
  const limb = build?.limb ?? 1;
  const x = (side === 'L' ? -1 : 1) * legXOf(spec);
  const rows = [
    [0.860, 0.083, -0.002],
    [0.800, 0.082, 0.0],
    [0.720, 0.077, 0.002],
    [0.630, 0.071, 0.003],
    [0.540, 0.063, 0.004],
    [0.470, 0.058, 0.005],
    [0.425, 0.060, 0.007],
    [0.380, 0.055, 0.004],
    [0.315, 0.058, 0.0],
    [0.240, 0.048, -0.002],
    [0.160, 0.039, -0.002],
    [0.085, 0.034, -0.001],
  ];
  return rows.map(([y, r, z]) => ({
    y: y * s,
    x,
    rx: r * w * limb,
    rz: r * w * limb,
    z: z * w,
  }));
}

/**
 * Foot cross-sections along +Z: heel, instep and a lower toe box. The sole sits ~3.5 cm under the
 * foot bone, which is the offset `plantFeet` expects (it targets the bone 6 cm above the ground).
 */
export function footProfile(spec, side) {
  const { s, w, build } = spec;
  const limb = build?.limb ?? 1;
  const x = (side === 'L' ? -1 : 1) * legXOf(spec);
  // z, half-width, half-height, vertical centre.
  const rows = [
    [-0.060, 0.026, 0.034, 0.002],
    [-0.038, 0.036, 0.040, 0.006],
    [-0.004, 0.041, 0.044, 0.009],
    [0.038, 0.044, 0.040, 0.006],
    [0.088, 0.046, 0.038, 0.003],
    [0.136, 0.044, 0.032, -0.003],
    [0.176, 0.038, 0.026, -0.01],
    [0.198, 0.028, 0.018, -0.017],
  ];
  return rows.map(([z, rx, ry, cy]) => ({
    z: z * s,
    x,
    y: cy * s,
    rx: rx * w * (0.82 + 0.18 * limb),
    ry: ry * s,
  }));
}

export function boxUV(x, y, z, nx, ny, nz) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax > ay && ax > az) return [z * 2.4, y * 2.4];
  if (ay > az) return [x * 2.4, z * 2.4];
  return [x * 2.4, y * 2.4];
}

export function setRegionUV(geo, region) {
  if (!geo) return null;
  const r = CHAR_REGIONS[region] || CHAR_REGIONS.cloth;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    let [u, v] = boxUV(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    u -= Math.floor(u);
    v -= Math.floor(v);
    uv[i * 2] = r[0] + u * (r[2] - r[0]);
    uv[i * 2 + 1] = r[1] + v * (r[3] - r[1]);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
