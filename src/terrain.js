import * as THREE from 'three';
import { smoothstep, deriveSeed } from './rng.js';
import { makeDetailSet } from './textures.js';
import { WorldField, PLAY_HALF_X, PLAY_HALF_Z, highwayZ, feederX } from './field.js';

/**
 * The playable world is a rectangle, 760 m east-west by 440 m north-south, with the highway
 * running along its long axis. The rectangle is defined in field.js (the bake needs it) and
 * re-exported here as the public world-shape API.
 */
export { PLAY_HALF_X, PLAY_HALF_Z, highwayZ, feederX };

export const WORLD_RADIUS = 404;
/** Kept for compatibility (nav grid, legacy radial call sites); prefer the rectangle helpers. */
export const PLAY_RADIUS = 400;
export const TERRAIN_SIZE = 1100;
const CHUNK_SIZE = 64;
const CHUNK_SEGMENTS = 32;
const LOAD_RADIUS = 100;
const UNLOAD_RADIUS = 145;
const MAX_TILES = 34;
const WORLD_EXTENT = 1100;

/** Baked once at module load; every system samples the same field. */
export const worldField = new WorldField(deriveSeed('terrain'), { size: 700, extent: WORLD_EXTENT });

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

// ---- playable rectangle ---------------------------------------------------

/** Clamp a world position inside the playable rectangle, keeping `margin` metres off the edge. */
export function clampToPlayArea(x, z, margin = 0) {
  const hx = PLAY_HALF_X - margin;
  const hz = PLAY_HALF_Z - margin;
  return {
    x: x < -hx ? -hx : x > hx ? hx : x,
    z: z < -hz ? -hz : z > hz ? hz : z,
  };
}

/** True when (x, z) is inside the playable rectangle, `margin` metres in from the edge. */
export function inPlayArea(x, z, margin = 0) {
  return Math.abs(x) <= PLAY_HALF_X - margin && Math.abs(z) <= PLAY_HALF_Z - margin;
}

/** Distance from (x, z) to the playable rectangle; 0 anywhere inside it. */
export function distanceOutsidePlayArea(x, z) {
  const dx = Math.max(0, Math.abs(x) - PLAY_HALF_X);
  const dz = Math.max(0, Math.abs(z) - PLAY_HALF_Z);
  return Math.hypot(dx, dz);
}

/** Cheap deterministic value noise for colour speckling. */
function speck(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const dust = new THREE.Color('#d0a262');
const ash = new THREE.Color('#b18e68');
const rust = new THREE.Color('#b96a43');
const pale = new THREE.Color('#e8c98e');
const char = new THREE.Color('#805c3f');
const road = new THREE.Color('#e4d0a9');
const cool = new THREE.Color('#a09078');
const rock = new THREE.Color('#8f8069');
const _c = new THREE.Color();

function paintVertex(x, z, y, out) {
  const field = worldField;
  const d = Math.hypot(x, z);
  const slope = field.slopeAt(x, z);
  const moist = field.moistureAt(x, z);
  const roadMix = field.roadAt(x, z);
  const broad = field.noise(x * 0.035 + 4.3, z * 0.035 - 2.1, 5) * 0.5 + 0.5;
  const patch = Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.8) * 0.5 + 0.5;
  const patch2 = Math.sin(x * 0.06 - 2.1) * Math.cos(z * 0.08 + 0.5) * 0.5 + 0.5;
  const lowness = smoothstep(-1.6, 1.8, y);

  out.copy(dust);
  out.lerp(ash, 0.12 + broad * 0.4);
  out.lerp(cool, Math.max(0, moist - 0.58) * 0.5);
  out.lerp(pale, Math.max(0, patch2 - 0.56) * 0.8);
  out.lerp(rust, Math.max(0, broad - 0.62) * 0.8);
  out.lerp(char, Math.max(0, 0.28 - broad) * 0.72);
  out.lerp(char, (1 - lowness) * 0.22);
  out.lerp(rock, smoothstep(0.2, 0.62, slope) * 0.62);
  if (d < 18) out.lerp(char, (1 - d / 18) * 0.1);
  out.lerp(road, roadMix * (0.72 + patch * 0.2));

  // The highway is the map's defining line. The physical road mask is ~6 m wide, but terrain
  // vertices are 2 m apart, so it is painted as a wider graded dust band with darker shoulders;
  // that is what makes it legible from the top-down camera without changing the mask itself.
  const highwayDist = Math.abs(z - highwayZ(x));
  const highwayBand = smoothstep(7.6, 3.0, highwayDist);
  out.lerp(road, highwayBand * (0.34 + patch * 0.14));
  const shoulder = smoothstep(10.2, 6.4, highwayDist) * (1 - smoothstep(6.4, 4.4, highwayDist));
  out.lerp(char, shoulder * 0.26);

  out.multiplyScalar(0.84 + speck(x, z) * 0.24);
  if (slope > 0.16) out.multiplyScalar(0.86);
}

/**
 * One ribbon mesh along the highway. The terrain paint alone is too coarse at 2 m vertices to read
 * as a road, so the main east-west route gets a real surface: a pale dust strip with darker
 * shoulders that follows the field's road centre line. ~1800 triangles, one draw call.
 */
function buildHighwayRibbon() {
  const step = 3;
  const cols = [-2.9, -1.3, 1.3, 2.9];
  const tint = ['#b8996f', '#ddc8a0', '#ddc8a0', '#b8996f'];
  const start = -PLAY_HALF_X - 24;
  const end = PLAY_HALF_X + 24;
  const rows = Math.floor((end - start) / step) + 1;
  const count = rows * cols.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  const tinted = tint.map((hex) => new THREE.Color(hex));

  for (let i = 0; i < rows; i++) {
    const x = start + i * step;
    const z0 = highwayZ(x);
    const slope = (highwayZ(x + 1) - highwayZ(x - 1)) * 0.5;
    const inv = 1 / Math.hypot(slope, 1);
    const nx = -slope * inv;
    const nz = inv;
    for (let j = 0; j < cols.length; j++) {
      const px = x + nx * cols[j];
      const pz = z0 + nz * cols[j];
      const k = (i * cols.length + j) * 3;
      positions[k] = px;
      positions[k + 1] = heightAt(px, pz) + 0.07;
      positions[k + 2] = pz;
      c.copy(tinted[j]);
      colors[k] = c.r;
      colors[k + 1] = c.g;
      colors[k + 2] = c.b;
    }
  }

  const index = [];
  const stride = cols.length;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < stride - 1; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const d = a + stride;
      const e = d + 1;
      index.push(a, b, d, b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'highway';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/**
 * Terrain is streamed in 64 m tiles. The height/moisture field is global and deterministic, so a
 * tile can be built or thrown away at any time without seams; only the tiles near the camera exist
 * as meshes. That is what lets the playable rectangle grow far beyond the old one-screen map.
 */
export class TerrainStreamer {
  constructor(scene) {
    this.scene = scene;
    this.tiles = new Map();
    this.queue = [];
    this._lastKey = '';
    this.enabled = true;

    const sand = makeDetailSet('sand', deriveSeed('sand-detail'));
    const repeat = (CHUNK_SIZE / 300) * 24;
    sand.map.repeat.set(repeat, repeat);
    sand.normalMap.repeat.set(repeat, repeat);
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: sand.map,
      normalMap: sand.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
    });

    // The highway itself is not streamed: it is one static ribbon that always exists.
    this.road = buildHighwayRibbon();
    this.scene.add(this.road);

    // Populate the opening view immediately; later tiles stream in as the camera moves.
    for (let iz = -1; iz <= 1; iz++) {
      for (let ix = -1; ix <= 1; ix++) this.makeTile(ix, iz);
    }
  }

  tileKey(ix, iz) {
    return `${ix}:${iz}`;
  }

  makeTile(ix, iz) {
    const key = this.tileKey(ix, iz);
    if (this.tiles.has(key)) return this.tiles.get(key);
    const cx = ix * CHUNK_SIZE;
    const cz = iz * CHUNK_SIZE;
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const x = cx + lx;
      const z = cz + lz;
      const y = heightAt(x, z);
      pos.setY(i, y);
      paintVertex(x, z, y, _c);
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.chunk = { ix, iz, cx, cz };
    this.scene.add(mesh);
    this.tiles.set(key, mesh);
    return mesh;
  }

  disposeTile(key) {
    const mesh = this.tiles.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    this.tiles.delete(key);
  }

  update(x, z) {
    if (!this.enabled) return;
    const cx = Math.round(x / CHUNK_SIZE);
    const cz = Math.round(z / CHUNK_SIZE);
    const key = `${cx}:${cz}`;
    if (key === this._lastKey && this.queue.length === 0) {
      this.cull(x, z);
      return;
    }
    this._lastKey = key;

    const span = Math.ceil((LOAD_RADIUS + CHUNK_SIZE) / CHUNK_SIZE);
    this.queue.length = 0;
    for (let iz = cz - span; iz <= cz + span; iz++) {
      for (let ix = cx - span; ix <= cx + span; ix++) {
        const tx = ix * CHUNK_SIZE;
        const tz = iz * CHUNK_SIZE;
        if (Math.hypot(tx - x, tz - z) > LOAD_RADIUS + CHUNK_SIZE * 0.75) continue;
        if (this.tiles.has(this.tileKey(ix, iz))) continue;
        this.queue.push({ ix, iz, d: Math.hypot(tx - x, tz - z) });
      }
    }
    this.queue.sort((a, b) => a.d - b.d);
    let budget = 2;
    while (budget-- > 0 && this.queue.length) {
      const next = this.queue.shift();
      this.makeTile(next.ix, next.iz);
    }
    this.cull(x, z);
  }

  setVisible(v) {
    this.enabled = v;
    this.road.visible = v;
    for (const mesh of this.tiles.values()) mesh.visible = v;
  }

  cull(x, z) {
    if (this.tiles.size <= MAX_TILES) {
      // Still drop anything clearly behind the player.
      for (const [key, mesh] of [...this.tiles]) {
        const { cx, cz } = mesh.userData.chunk;
        if (Math.hypot(cx - x, cz - z) > UNLOAD_RADIUS) this.disposeTile(key);
      }
      return;
    }
    const entries = [...this.tiles.entries()].map(([key, mesh]) => {
      const { cx, cz } = mesh.userData.chunk;
      return { key, d: Math.hypot(cx - x, cz - z) };
    });
    entries.sort((a, b) => b.d - a.d);
    while (entries.length > MAX_TILES) {
      const far = entries.shift();
      if (far.d > UNLOAD_RADIUS || entries.length >= MAX_TILES) this.disposeTile(far.key);
    }
  }
}

export function createTerrain(scene) {
  return new TerrainStreamer(scene);
}
