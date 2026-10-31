import * as THREE from 'three';
import { smoothstep, deriveSeed } from './rng.js';
import { makeDetailSet } from './textures.js';
import { WorldField } from './field.js';

export const WORLD_RADIUS = 92;
/** Actors are clamped just inside the playable disc; the nav grid ends here too. */
export const PLAY_RADIUS = 90;
export const TERRAIN_SIZE = 300;
const SEGMENTS = 144;
const WORLD_EXTENT = 300;

/** Baked once at module load; every system samples the same field. */
export const worldField = new WorldField(deriveSeed('terrain'), { size: 416, extent: WORLD_EXTENT });

export function heightAt(x, z) {
  return worldField.heightAt(x, z);
}

export function slopeAt(x, z, step = 0.9) {
  const dx = heightAt(x + step, z) - heightAt(x - step, z);
  const dz = heightAt(x, z + step) - heightAt(x, z - step);
  return Math.hypot(dx, dz) / (step * 2);
}

export function moistureAt(x, z) {
  return worldField.moistureAt(x, z);
}

export function roadAt(x, z) {
  return worldField.roadAt(x, z);
}

/** Cheap deterministic value noise for colour speckling. */
function speck(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function createTerrain(scene) {
  const field = worldField;
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
  const rock = new THREE.Color('#8f8069');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);

    const d = Math.hypot(x, z);
    const slope = field.slopeAt(x, z);
    const moist = field.moistureAt(x, z);
    const roadMix = field.roadAt(x, z);
    const broad = field.noise(x * 0.035 + 4.3, z * 0.035 - 2.1, 5) * 0.5 + 0.5;
    const patch = Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.8) * 0.5 + 0.5;
    const patch2 = Math.sin(x * 0.06 - 2.1) * Math.cos(z * 0.08 + 0.5) * 0.5 + 0.5;
    const lowness = smoothstep(-1.6, 1.8, y);

    c.copy(dust);
    c.lerp(ash, 0.12 + broad * 0.4);
    c.lerp(cool, Math.max(0, moist - 0.58) * 0.5);
    c.lerp(pale, Math.max(0, patch2 - 0.56) * 0.8);
    c.lerp(rust, Math.max(0, broad - 0.62) * 0.8);
    c.lerp(char, Math.max(0, 0.28 - broad) * 0.72);
    c.lerp(char, (1 - lowness) * 0.22);
    c.lerp(rock, smoothstep(0.2, 0.62, slope) * 0.62);
    if (d < 18) c.lerp(char, (1 - d / 18) * 0.1);

    c.lerp(road, roadMix * (0.66 + patch * 0.2));

    c.multiplyScalar(0.84 + speck(x, z) * 0.24);
    if (slope > 0.16) c.multiplyScalar(0.86);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const sand = makeDetailSet('sand', deriveSeed('sand-detail'));
  sand.map.repeat.set(24, 24);
  sand.normalMap.repeat.set(24, 24);
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: sand.map,
    normalMap: sand.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);

  return mesh;
}
