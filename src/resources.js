import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { makeRng } from './rng.js';
import { box, cyl, dodeca, merge, PALETTE } from './geo.js';

const _o = new THREE.Object3D();

function buildPile() {
  const p = [];
  p.push(box(1.35, 0.14, 1.1, '#4a4238', 0, 0.07, 0));
  p.push(box(0.72, 0.34, 0.52, '#6d563f', -0.2, 0.26, 0.12, 0, 0.4, 0.04));
  p.push(box(0.48, 0.28, 0.62, '#8b6745', 0.34, 0.2, -0.18, 0, -0.3, 0.1));
  p.push(cyl(0.27, 0.27, 0.72, 8, '#7c4a32', 0.28, 0.45, 0.25, 0.15, 0, 1.35));
  p.push(cyl(0.06, 0.06, 1.55, 5, '#5d4a3a', -0.4, 0.55, -0.28, Math.PI / 2, 0, 0.4));
  p.push(box(0.34, 0.1, 0.5, '#8a7a5f', 0.42, 0.48, 0.35, 0.3, 0.8, 0.2));
  p.push(dodeca(0.16, '#a68a63', -0.5, 0.42, 0.42, 0.4, 0.2, 0.8));
  return merge(p);
}

export class ScrapField {
  constructor(scene, seed = 0x5c4a9) {
    this.rng = makeRng(seed);
    this.count = 46;
    this.nodes = [];
    this.time = 0;

    const geo = buildPile();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    const markGeo = new THREE.OctahedronGeometry(0.17, 0);
    this.markMat = new THREE.MeshBasicMaterial({
      color: 0xffc37a,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
    });
    this.markers = new THREE.InstancedMesh(markGeo, this.markMat, this.count);
    this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.markers.frustumCulled = false;

    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 40; tries++) {
        const a = this.rng() * Math.PI * 2;
        const r = this.rng.range(9, 82);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        const tooClose = this.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 5);
        if (!tooClose) break;
      }
      const node = {
        x,
        z,
        y: heightAt(x, z),
        active: true,
        respawnAt: 0,
        value: this.rng.int(6, 12),
        phase: this.rng() * 6.28,
        scale: this.rng.range(0.85, 1.2),
        rot: this.rng() * 6.28,
      };
      this.nodes.push(node);
      this.writePile(i, node);
      c.set(this.rng.pick(['#c9b79a', '#a7957c', '#8c7d69']));
      this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    scene.add(this.markers);

    this.updateMarkers(0, true);
  }

  writePile(i, node) {
    _o.position.set(node.x, node.y - 0.03, node.z);
    _o.rotation.set(0, node.rot, 0);
    _o.scale.setScalar(node.active ? node.scale : 0.0001);
    _o.updateMatrix();
    this.mesh.setMatrixAt(i, _o.matrix);
  }

  updateMarkers(time, force = false) {
    if (!force && time === this.time) return;
    this.time = time;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const bob = Math.sin(time * 2.1 + n.phase) * 0.12;
      _o.position.set(n.x, n.y + 1.35 + bob, n.z);
      _o.rotation.set(0.4, time * 1.2 + n.phase, 0);
      _o.scale.setScalar(n.active ? 1 : 0.0001);
      _o.updateMatrix();
      this.markers.setMatrixAt(i, _o.matrix);
    }
    this.markers.instanceMatrix.needsUpdate = true;
  }

  serialize() {
    return this.nodes.map((n) => ({ a: n.active ? 1 : 0, r: Math.round(n.respawnAt * 10) / 10 }));
  }

  restore(data) {
    if (!Array.isArray(data)) return;
    for (let i = 0; i < this.nodes.length; i++) {
      const saved = data[i];
      if (!saved) continue;
      const n = this.nodes[i];
      n.active = !!saved.a;
      n.respawnAt = Number.isFinite(saved.r) ? saved.r : 0;
      this.writePile(i, n);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
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
    n.active = false;
    n.respawnAt = time + 55;
    this.writePile(index, n);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.updateMarkers(time, true);
    return n.value;
  }

  update(time) {
    let dirtyPiles = false;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!n.active && time >= n.respawnAt) {
        n.active = true;
        this.writePile(i, n);
        dirtyPiles = true;
      }
    }
    if (dirtyPiles) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.updateMarkers(time, true);
    } else {
      this.updateMarkers(time);
    }
  }

  setVisible(v) {
    this.mesh.visible = v;
    this.markers.visible = v;
  }

  get activeCount() {
    let n = 0;
    for (const node of this.nodes) if (node.active) n++;
    return n;
  }
}
