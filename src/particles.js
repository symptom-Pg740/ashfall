import * as THREE from 'three';
import { glowTexture } from './geo.js';

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.emberCount = 420;
    this.embers = this.buildEmbers(this.emberCount);
    this.bursts = this.buildBursts(180);
    scene.add(this.embers.points);
    scene.add(this.bursts.points);
    this.time = 0;
  }

  buildEmbers(count) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const data = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.sqrt(Math.random()) * 44;
      data.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: Math.random() * 7,
        speed: 0.18 + Math.random() * 0.5,
        drift: 0.12 + Math.random() * 0.25,
        phase: Math.random() * 6.28,
      });
      c.set(Math.random() > 0.62 ? '#ffd9a0' : Math.random() > 0.35 ? '#ff9a52' : '#b9a58a');
      c.multiplyScalar(0.55 + Math.random() * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTexture(),
      size: 0.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, data, positions, geo, mat };
  }

  buildBursts(count) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 0, g: 0, b: 0 });
      positions[i * 3 + 1] = -100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTexture(),
      size: 0.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, data, positions, colors, geo, mat, cursor: 0 };
  }

  setEmberCount(n) {
    this.emberCount = Math.min(this.embers.data.length, n);
    this.embers.geo.setDrawRange(0, this.emberCount);
  }

  setEmbersVisible(v) {
    this.embers.points.visible = v;
  }

  burst(x, y, z, color = '#ffb36a', count = 10, power = 2.2) {
    const b = this.bursts;
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const p = b.data[b.cursor];
      b.cursor = (b.cursor + 1) % b.data.length;
      p.x = x;
      p.y = y + Math.random() * 0.5;
      p.z = z;
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.8;
      const spread = power * (0.25 + Math.random() * 0.9);
      p.vx = Math.cos(a) * spread;
      p.vz = Math.sin(a) * spread;
      p.vy = up;
      p.max = 0.45 + Math.random() * 0.6;
      p.life = p.max;
      p.r = c.r * (0.8 + Math.random() * 0.4);
      p.g = c.g * (0.8 + Math.random() * 0.4);
      p.b = c.b * (0.8 + Math.random() * 0.4);
    }
  }

  update(dt, time) {
    this.time = time;
    const { data, positions, geo } = this.embers;
    for (let i = 0; i < this.emberCount; i++) {
      const p = data[i];
      p.y += p.speed * dt;
      p.x += Math.sin(time * 0.7 + p.phase) * p.drift * dt;
      p.z += Math.cos(time * 0.6 + p.phase) * p.drift * dt;
      if (p.y > 7.5) {
        p.y = 0.15;
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.sqrt(Math.random()) * 44;
        p.x = Math.cos(a) * r;
        p.z = Math.sin(a) * r;
      }
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    geo.attributes.position.needsUpdate = true;

    const b = this.bursts;
    for (let i = 0; i < b.data.length; i++) {
      const p = b.data[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        b.positions[i * 3 + 1] = -100;
        b.colors[i * 3] = b.colors[i * 3 + 1] = b.colors[i * 3 + 2] = 0;
        continue;
      }
      p.vy -= 3.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const f = p.life / p.max;
      b.positions[i * 3] = p.x;
      b.positions[i * 3 + 1] = p.y;
      b.positions[i * 3 + 2] = p.z;
      b.colors[i * 3] = p.r * f;
      b.colors[i * 3 + 1] = p.g * f;
      b.colors[i * 3 + 2] = p.b * f;
    }
    b.geo.attributes.position.needsUpdate = true;
    b.geo.attributes.color.needsUpdate = true;
  }
}
