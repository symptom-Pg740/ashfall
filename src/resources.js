import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { makeRng } from './rng.js';
import { box, cyl, dodeca, merge, PALETTE } from './geo.js';
import { buildRuin, buildWreck } from './props.js';

const _o = new THREE.Object3D();
const _c = new THREE.Color();

/** A trader's scrap cache: crates, barrels and a tarpaulin. */
function cacheGeometry() {
  const p = [];
  p.push(box(1.7, 0.12, 1.4, '#6d563f', 0, 0.06, 0));
  p.push(box(0.78, 0.62, 0.62, '#8a6a42', -0.38, 0.38, -0.2, 0, 0.25, 0));
  p.push(box(0.62, 0.5, 0.58, '#9b7447', 0.34, 0.32, -0.36, 0, -0.18, 0));
  p.push(box(0.56, 0.42, 0.5, '#7c5a36', 0.08, 0.26, 0.34, 0, 0.5, 0));
  p.push(cyl(0.28, 0.3, 0.78, 8, '#7c4a32', -0.48, 0.45, 0.42));
  p.push(cyl(0.22, 0.24, 0.62, 8, '#8a5c40', 0.48, 0.38, 0.38));
  p.push(box(1.25, 0.05, 1.0, '#7c6447', 0, 0.74, 0.02, 0.1, 0.2, 0));
  p.push(cyl(0.035, 0.04, 1.1, 4, '#4e3522', -0.75, 0.55, -0.55));
  p.push(cyl(0.035, 0.04, 1.1, 4, '#4e3522', 0.75, 0.55, 0.55));
  return merge(p);
}

const SITE = {
  wreck: { geo: null, radius: 1.45, markerY: 1.7, value: [70, 115], scale: [0.65, 1.0] },
  ruin: { geo: null, radius: 1.9, markerY: 2.4, value: [95, 155], scale: [0.42, 0.7] },
  cache: { geo: null, radius: 0.85, markerY: 1.25, value: [45, 80], scale: [0.85, 1.25] },
};

/**
 * Finite salvage sites.
 *
 * Every pile is a real place on the map — a car wreck, a collapsed ruin or a trader cache. It holds
 * a fixed amount of scrap, yields 8–14 per trip, and never respawns. The only ways to get more scrap
 * after the map is stripped are raider loot, recycling, and the caravan.
 */
export class ScrapField {
  constructor(scene, seed = 0x5c4a9, options = {}) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.count = 150;
    this.nodes = [];
    this.time = 0;
    this.groups = {};
    this.meshes = [];
    this.obstacles = options.obstacles || [];

    SITE.wreck.geo ||= buildWreck();
    SITE.ruin.geo ||= buildRuin();
    SITE.cache.geo ||= cacheGeometry();

    // Pick the sites first, so each InstancedMesh knows its slot count.
    const obstacles = this.obstacles;
    for (let i = 0; i < this.count; i++) {
      let x = 0;
      let z = 0;
      let placed = false;
      for (let tries = 0; tries < 30; tries++) {
        const a = this.rng() * Math.PI * 2;
        const r = this.rng.range(16, 380);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (Math.hypot(x, z) < 14) continue;
        if (this.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 11)) continue;
        if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r || 0.5) + 1.4)) continue;
        placed = true;
        break;
      }
      if (!placed) continue;

      const roll = this.rng();
      const type = roll < 0.38 ? 'wreck' : roll < 0.72 ? 'cache' : 'ruin';
      const spec = SITE[type];
      const max = this.rng.int(spec.value[0], spec.value[1]);
      const scale = this.rng.range(spec.scale[0], spec.scale[1]);
      const node = {
        x,
        z,
        y: heightAt(x, z),
        type,
        max,
        remaining: max,
        active: true,
        phase: this.rng() * 6.28,
        scale,
        rot: this.rng() * 6.28,
        slot: 0,
      };
      this.nodes.push(node);
      obstacles.push({ x, z, r: spec.radius * scale });
    }

    for (const type of Object.keys(SITE)) {
      const list = this.nodes.filter((n) => n.type === type);
      if (!list.length) continue;
      const spec = SITE[type];
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const mesh = new THREE.InstancedMesh(spec.geo, mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (let i = 0; i < list.length; i++) {
        list[i].slot = i;
        _c.set(this.rng.pick(['#c9b79a', '#a7957c', '#8c7d69']));
        mesh.setColorAt(i, _c);
      }
      mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      this.groups[type] = mesh;
      this.meshes.push(mesh);
    }

    const markGeo = new THREE.OctahedronGeometry(0.2, 0);
    this.markMat = new THREE.MeshBasicMaterial({
      color: 0xffc37a,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
    });
    this.markers = new THREE.InstancedMesh(markGeo, this.markMat, this.nodes.length);
    this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.markers.frustumCulled = false;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      _c.set(n.type === 'ruin' ? '#d99a62' : n.type === 'wreck' ? '#e0b070' : '#c9c07a');
      this.markers.setColorAt(i, _c);
    }
    this.markers.instanceColor.needsUpdate = true;
    scene.add(this.markers);

    for (const n of this.nodes) this.writeNode(n);
    this.updateMarkers(0, true);
  }

  writeNode(node) {
    const mesh = this.groups[node.type];
    if (!mesh) return;
    const ratio = node.max > 0 ? node.remaining / node.max : 0;
    const scale = node.active ? node.scale * (0.72 + ratio * 0.28) : 0.0001;
    _o.position.set(node.x, node.y - 0.03, node.z);
    _o.rotation.set(0, node.rot, 0);
    _o.scale.setScalar(scale);
    _o.updateMatrix();
    mesh.setMatrixAt(node.slot, _o.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  updateMarkers(time, force = false) {
    if (!force && time === this.time) return;
    this.time = time;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const bob = Math.sin(time * 2.1 + n.phase) * 0.12;
      const spec = SITE[n.type];
      _o.position.set(n.x, n.y + spec.markerY * n.scale + bob, n.z);
      _o.rotation.set(0.4, time * 1.2 + n.phase, 0);
      _o.scale.setScalar(n.active ? 1 : 0.0001);
      _o.updateMatrix();
      this.markers.setMatrixAt(i, _o.matrix);
    }
    this.markers.instanceMatrix.needsUpdate = true;
  }

  serialize() {
    return this.nodes.map((n) => ({ a: n.active ? 1 : 0, r: Math.round(n.remaining) }));
  }

  restore(data) {
    if (!Array.isArray(data)) return;
    for (let i = 0; i < this.nodes.length; i++) {
      const saved = data[i];
      if (!saved) continue;
      const n = this.nodes[i];
      const remaining = Number.isFinite(saved.r) ? Math.max(0, Math.min(n.max, saved.r)) : n.max;
      n.remaining = remaining;
      n.active = !!saved.a && remaining > 0;
      this.writeNode(n);
    }
    this.updateMarkers(0, true);
  }

  nearest(x, z, maxDist = 2.8) {
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!n.active) continue;
      const dx = n.x - x;
      const dz = n.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  gather(index, time) {
    const n = this.nodes[index];
    if (!n || !n.active) return 0;
    const chunk = Math.min(n.remaining, this.rng.int(8, 14));
    n.remaining -= chunk;
    if (n.remaining <= 0) {
      n.remaining = 0;
      n.active = false;
    }
    this.writeNode(n);
    this.updateMarkers(time, true);
    return chunk;
  }

  update(time) {
    this.updateMarkers(time);
  }

  setVisible(v) {
    for (const mesh of this.meshes) mesh.visible = v;
    this.markers.visible = v;
    this.visible = v;
  }

  get activeCount() {
    let n = 0;
    for (const node of this.nodes) if (node.active) n++;
    return n;
  }
}
