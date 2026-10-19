import * as THREE from 'three';
import { smoothstep, makeRng } from './rng.js';

export const WORLD_RADIUS = 54;
export const TERRAIN_SIZE = 190;
const SEGMENTS = 88;

/**
 * Shared height field. Flat-ish camp basin in the middle, dunes further out.
 * Everything (terrain mesh, props, player, buildings) samples this.
 */
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const relief = smoothstep(8, 34, d);
  let h = 0;
  h += Math.sin(x * 0.068 + 2.1) * Math.cos(z * 0.057 - 0.6) * 2.15;
  h += Math.cos((x - z) * 0.041) * 1.45;
  h += Math.sin(x * 0.29 + z * 0.22) * 0.32;
  h *= 0.1 + 0.9 * relief;
  h -= (1 - smoothstep(5, 15, d)) * 0.3;
  return h;
}

export function slopeAt(x, z, step = 0.9) {
  const dx = heightAt(x + step, z) - heightAt(x - step, z);
  const dz = heightAt(x, z + step) - heightAt(x, z - step);
  return Math.hypot(dx, dz) / (step * 2);
}

/** Cheap deterministic value noise for colour speckling. */
function noise2(x, z) {
  return Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
}

/** Cheap tileable-looking cracked-earth map. White base, dark hairlines. */
function crackedEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(0xc4ac1e);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 46; i++) {
    let x = rng() * 256;
    let y = rng() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 2 + Math.floor(rng() * 4);
    for (let s = 0; s < segments; s++) {
      x += (rng() - 0.5) * 78;
      y += (rng() - 0.5) * 78;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(96, 66, 39, ${0.05 + rng() * 0.07})`;
    ctx.lineWidth = 0.6 + rng() * 0.6;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(88, 59, 34, ${0.02 + rng() * 0.05})`;
    ctx.fillRect(rng() * 256, rng() * 256, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createTerrain(scene) {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dust = new THREE.Color('#d0a262');
  const ash = new THREE.Color('#b18e68');
  const rust = new THREE.Color('#b96a43');
  const pale = new THREE.Color('#e8c98e');
  const char = new THREE.Color('#805c3f');
  const road = new THREE.Color('#cdb68c');
  const cool = new THREE.Color('#a09078');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);

    const d = Math.hypot(x, z);
    const slope = slopeAt(x, z, 0.8);
    const speck = noise2(x, z) - Math.floor(noise2(x, z));
    const patch = Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.8) * 0.5 + 0.5;
    const patch2 = Math.sin(x * 0.06 - 2.1) * Math.cos(z * 0.08 + 0.5) * 0.5 + 0.5;
    const lowness = smoothstep(-1.6, 1.8, y);

    c.copy(dust);
    c.lerp(ash, 0.12 + patch * 0.52);
    c.lerp(pale, Math.max(0, patch2 - 0.62) * 0.9);
    c.lerp(rust, Math.max(0, patch - 0.7) * 0.7);
    c.lerp(char, Math.max(0, 0.24 - patch) * 0.9);
    c.lerp(char, (1 - lowness) * 0.22);
    c.lerp(cool, (1 - lowness) * 0.1);
    if (d < 18) c.lerp(char, (1 - d / 18) * 0.1);

    // cracked dirt roads: a winding north-south track and a cross street
    const roadX = Math.sin(z * 0.052) * 8 + Math.cos(z * 0.021) * 4;
    const roadZ = 3 + Math.sin(x * 0.055 + 0.5) * 2.5;
    const roadWobble = Math.sin(z * 0.7 + x * 0.3) * 0.5;
    const crossWobble = Math.sin(x * 0.9 + z * 0.2) * 0.35;
    const roadMix = Math.max(
      smoothstep(4.1, 1.3, Math.abs(x - roadX) + roadWobble),
      smoothstep(2.7, 0.9, Math.abs(z - roadZ) + crossWobble) * 0.9
    ) * (0.5 + patch * 0.3);
    if (Math.abs(z) < 82) c.lerp(road, roadMix);

    c.multiplyScalar(0.84 + speck * 0.24);
    if (slope > 0.16) c.multiplyScalar(0.82);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    map: crackedEarthTexture(),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);

  return mesh;
}
