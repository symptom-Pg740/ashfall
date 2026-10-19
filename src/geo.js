import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Paint every vertex of a geometry a single colour (sRGB input). */
export function paint(geo, color, jitter = 0) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const j = jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1;
    data[i * 3] = c.r * j;
    data[i * 3 + 1] = c.g * j;
    data[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

function place(geo, x, y, z, rx, ry, rz) {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return paint(place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), color);
}

export function cyl(rTop, rBottom, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return paint(place(new THREE.CylinderGeometry(rTop, rBottom, h, seg), x, y, z, rx, ry, rz), color);
}

export function dodeca(r, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return paint(place(new THREE.DodecahedronGeometry(r, 0), x, y, z, rx, ry, rz), color);
}

export function merge(parts) {
  // DodecahedronGeometry / some primitives are non-indexed; normalize first.
  const normalized = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(normalized, false);
  if (!merged) throw new Error('geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let shadowTex = null;
export function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export const PALETTE = {
  dust: '#8a7454',
  ash: '#67645a',
  concrete: '#a78a64',
  concreteDark: '#7e6249',
  rust: '#8a4d31',
  rustDark: '#5f3a2a',
  metal: '#4b4540',
  metalLight: '#736a5f',
  wood: '#62452e',
  woodDark: '#453325',
  tarp: '#4c6560',
  tarpLight: '#627b73',
  ember: '#ff8a3c',
  flame: '#ffb15c',
  bone: '#b9ac90',
  toxic: '#93a06b',
  ghoul: '#777d62',
  ghoulDark: '#424a3b',
  coat: '#5c5343',
  skin: '#b08157',
  scarf: '#8d4c33',
};
