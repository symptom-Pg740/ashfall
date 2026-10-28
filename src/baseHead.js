import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import raw from './assets/base-head.obj?raw';

// Authored R4 head: MakeHuman hm08 base mesh, extracted above the neck (CC0).
// Parsing happens once at module load; the geometry is shared and cloned per character.
let geometry = null;
try {
  const obj = new OBJLoader().parse(raw);
  obj.traverse((o) => {
    if (!geometry && o.isMesh) geometry = o.geometry;
  });
  if (geometry) {
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
} catch {
  geometry = null;
}

export const baseHeadGeometry = geometry;
