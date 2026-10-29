import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { merge, paint } from './geo.js';
import { CHAR_REGIONS } from './textures.js';

/**
 * Shared low-level character primitives.
 *
 * Both the skinned body and the wardrobe build from these, so the body, outfit layers and gear use
 * the same bevel/segment counts and the same character-atlas UV projection.
 */

// Keep the limb layout in one place: the skeleton, the skin-weight segments, the body and the
// wardrobe all read these, so changing a proportion cannot leave gear floating off a bone.
export const LAYOUT = {
  shoulderX: 0.14,
  armX: 0.25,
  legX: 0.12,
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

export function capsule(r, h, color, x = 0, y = 0, z = 0) {
  const g = new THREE.CapsuleGeometry(r, h, LOW_DETAIL ? 2 : 5, LOW_DETAIL ? 8 : 12);
  paint(g, color);
  return pose(g, x, y, z);
}

export function ball(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, LOW_DETAIL ? 10 : 16, LOW_DETAIL ? 8 : 12);
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
