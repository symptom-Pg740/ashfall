import * as THREE from 'three';
import { glowTexture } from './geo.js';
import { heightAt } from './terrain.js';
import { deriveSeed, makeRng } from './rng.js';

/**
 * Pooled firearm effects: muzzle flash, smoke, tracers, surface impacts and ground decals.
 *
 * Two point batches (additive and alpha), one instanced tracer batch, one instanced decal batch and
 * one permanent point light. Everything is preallocated; the hot path never creates a mesh, a
 * material or a geometry.
 */

const MAX_TRACERS = 64;
const MAX_POINTS = 512;
const MAX_DECALS = 32;

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _o = new THREE.Object3D();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _color = new THREE.Color();

const IMPACTS = {
  sand: { additive: false, count: 8, color: '#dccbaa', size: 0.4, sizeVar: 0.14, life: 0.55, speed: 2.4, gravity: -2.5, decal: true },
  stone: { additive: false, count: 7, color: '#cfc7b6', size: 0.1, sizeVar: 0.04, life: 0.35, speed: 4.2, gravity: -9.8, decal: true },
  metal: { additive: true, count: 10, color: '#ffcf8a', size: 0.035, sizeVar: 0.015, life: 0.25, speed: 6, gravity: -9.8, decal: false },
  wood: { additive: false, count: 5, color: '#a07b50', size: 0.08, sizeVar: 0.03, life: 0.4, speed: 3.2, gravity: -9.8, decal: false },
  flesh: { additive: false, count: 8, color: '#7d2b23', size: 0.16, sizeVar: 0.05, life: 0.3, speed: 3.2, gravity: -4, decal: true },
};

function pointMaterial(additive) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: glowTexture() },
      uPixelsPerMeter: { value: 20 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 aColor;
      uniform float uPixelsPerMeter;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uPixelsPerMeter, 1.0, 120.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function makePointBatch(additive, renderOrder) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_POINTS * 3);
  const colors = new Float32Array(MAX_POINTS * 3);
  const sizes = new Float32Array(MAX_POINTS);
  const alphas = new Float32Array(MAX_POINTS);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const material = pointMaterial(additive);
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  return { points, geo, material, positions, colors, sizes, alphas };
}

function decalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
  g.addColorStop(0, 'rgba(18, 14, 11, 0.9)');
  g.addColorStop(0.35, 'rgba(24, 19, 14, 0.65)');
  g.addColorStop(0.75, 'rgba(30, 24, 18, 0.22)');
  g.addColorStop(1, 'rgba(30, 24, 18, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class FX {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.time = 0;
    this.quality = 'high';
    this.decalsEnabled = true;
    this.smokeEnabled = true;
    this.lightEnabled = true;
    this.particleScale = 1;
    this.rng = makeRng(deriveSeed('fx'));

    // Tracers: one instanced box; per-instance colour fades additively.
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.tracers = new THREE.InstancedMesh(this.tracerGeo, this.tracerMat, MAX_TRACERS);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
    this.tracers.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false;
    this.tracers.renderOrder = 30;
    this.tracers.count = 0;
    scene.add(this.tracers);
    this.tracerSlots = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      this.tracerSlots.push({
        active: false,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        t: 0,
        dur: 0.1,
        width: 0.12,
        color: new THREE.Color('#ffd9a0'),
      });
      this.tracers.setColorAt(i, _color.setRGB(0, 0, 0));
    }
    this.tracers.instanceColor.needsUpdate = true;

    this.additive = makePointBatch(true, 32);
    this.alpha = makePointBatch(false, 20);
    scene.add(this.additive.points);
    scene.add(this.alpha.points);

    this.pointSlots = [];
    for (let i = 0; i < MAX_POINTS; i++) {
      this.pointSlots.push({
        active: false,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1,
        size: 0.1, growth: 0,
        alpha: 1, additive: false,
        gravity: 0, drag: 0,
        color: new THREE.Color(),
      });
    }
    this.pointCursor = 0;

    // Ground decals.
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);
    this.decalMat = new THREE.MeshBasicMaterial({
      map: decalTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      toneMapped: false,
    });
    this.decals = new THREE.InstancedMesh(decalGeo, this.decalMat, MAX_DECALS);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3), 3);
    this.decals.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 2;
    this.decals.count = 0;
    scene.add(this.decals);
    for (let i = 0; i < MAX_DECALS; i++) {
      _o.position.set(0, -100, 0);
      _o.scale.setScalar(0.0001);
      _o.updateMatrix();
      this.decals.setMatrixAt(i, _o.matrix);
    }
    this.decals.instanceMatrix.needsUpdate = true;
    this.decalCursor = 0;
    this.decalCount = 0;

    // One permanent light, so firing never changes the shader permutation.
    this.light = new THREE.PointLight(0xffc37a, 0, 7, 2);
    this.light.castShadow = false;
    scene.add(this.light);
    this.lightTimer = 0;
    this.lightLife = 0.06;

    this.pending = [];
    this.pixelsPerMeter = 20;
  }

  setCamera(camera) {
    this.camera = camera;
  }

  setQuality(name) {
    this.quality = name;
    const low = name === 'low';
    this.decalsEnabled = !low;
    this.smokeEnabled = !low;
    this.lightEnabled = !low;
    this.particleScale = low ? 0.5 : 1;
    if (!this.lightEnabled) this.light.intensity = 0;
  }

  _spawnPoint(opts) {
    if (this.quality === 'low' && !opts.additive && !this.smokeEnabled) return;
    const slot = this.pointSlots[this.pointCursor++ % MAX_POINTS];
    slot.active = true;
    slot.x = opts.x;
    slot.y = opts.y;
    slot.z = opts.z;
    slot.vx = opts.vx || 0;
    slot.vy = opts.vy || 0;
    slot.vz = opts.vz || 0;
    slot.life = opts.life;
    slot.maxLife = opts.life;
    slot.size = opts.size;
    slot.growth = opts.growth || 0;
    slot.alpha = opts.alpha ?? 1;
    slot.additive = !!opts.additive;
    slot.gravity = opts.gravity || 0;
    slot.drag = opts.drag || 0;
    slot.color.set(opts.color || '#ffffff');
  }

  muzzleFlash(position) {
    this._spawnPoint({
      x: position.x, y: position.y, z: position.z,
      life: 0.03, size: 0.22, alpha: 0.95, additive: true, color: '#fff4d6',
    });
    this._spawnPoint({
      x: position.x + (this.rng() - 0.5) * 0.04,
      y: position.y + 0.01,
      z: position.z + (this.rng() - 0.5) * 0.04,
      life: 0.055, size: 0.5 + this.rng() * 0.15, alpha: 0.7, additive: true, color: '#ffb95e',
    });
    if (this.smokeEnabled) {
      for (let i = 0; i < 2; i++) {
        this._spawnPoint({
          x: position.x, y: position.y, z: position.z,
          vx: (this.rng() - 0.5) * 0.3,
          vy: 0.25, vz: (this.rng() - 0.5) * 0.3,
          life: 0.55 + this.rng() * 0.25,
          size: 0.3, growth: 0.9,
          alpha: 0.2, additive: false, color: '#c9bda8',
          drag: 3,
        });
      }
    }
    if (this.lightEnabled) {
      this.light.position.copy(position);
      this.light.intensity = 12;
      this.lightTimer = this.lightLife;
    }
  }

  tracer(from, to, visualSpeed = 140) {
    const slot = this.tracerSlots.find((s) => !s.active);
    if (!slot) return 0;
    slot.active = true;
    slot.from.copy(from);
    slot.to.copy(to);
    slot.t = 0;
    const dist = from.distanceTo(to);
    slot.dur = Math.max(0.06, Math.min(0.1, dist / visualSpeed));
    slot.width = 0.12;
    slot.color.set('#ffd9a0');
    return slot.dur;
  }

  fire({ muzzle, impact, surface = 'sand', normal = null, visualSpeed = 140 }) {
    this.muzzleFlash(muzzle);
    const dur = this.tracer(muzzle, impact, visualSpeed);
    if (impact && surface && impact.distanceTo(muzzle) > 0.25) {
      this.pending.push({
        delay: dur,
        point: impact.clone(),
        normal: normal ? normal.clone() : null,
        surface,
      });
    }
  }

  _impact(point, normal, surface) {
    const preset = IMPACTS[surface] || IMPACTS.sand;
    const count = Math.max(1, Math.round(preset.count * this.particleScale));
    const up = normal || _v3.set(0, 1, 0);
    // Pull the burst toward the camera so a hit on the far side of a target still reads.
    _cam.subVectors(this.camera.position, point);
    if (_cam.lengthSq() > 0.001) _cam.normalize();
    const lift = surface === 'flesh' ? 0.32 : 0.14;
    const bx = point.x + up.x * 0.07 + _cam.x * lift;
    const by = point.y + up.y * 0.07 + _cam.y * lift;
    const bz = point.z + up.z * 0.07 + _cam.z * lift;
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng();
      const spread = 1.2;
      const dx = Math.cos(a) * r * spread;
      const dz = Math.sin(a) * r * spread;
      const speed = preset.speed * (0.5 + this.rng() * 0.7);
      this._spawnPoint({
        x: bx + (this.rng() - 0.5) * 0.08,
        y: by + (this.rng() - 0.5) * 0.06,
        z: bz + (this.rng() - 0.5) * 0.08,
        vx: (up.x * 0.5 + dx) * speed,
        vy: (up.y * 0.6 + this.rng() * 0.6) * speed,
        vz: (up.z * 0.5 + dz) * speed,
        life: preset.life * (0.75 + this.rng() * 0.5),
        size: preset.size + (this.rng() - 0.5) * preset.sizeVar,
        growth: surface === 'sand' ? 0.8 : 0,
        alpha: surface === 'metal' ? 1 : 0.75,
        additive: preset.additive,
        gravity: preset.gravity,
        color: preset.color,
        drag: 1.2,
      });
    }
    if (surface === 'metal') {
      this._spawnPoint({
        x: bx, y: by, z: bz,
        life: 0.06, size: 0.26, alpha: 0.9, additive: true, color: '#ffcf8a',
      });
    } else if (surface === 'sand') {
      this._spawnPoint({
        x: bx, y: by, z: bz,
        life: 0.28, size: 0.62, alpha: 0.5, additive: false, color: '#d8c6a4',
      });
    } else if (surface === 'stone') {
      this._spawnPoint({
        x: bx, y: by, z: bz,
        life: 0.16, size: 0.32, alpha: 0.4, additive: false, color: '#d8d0bc',
      });
    } else if (surface === 'flesh') {
      this._spawnPoint({
        x: bx, y: by + 0.03, z: bz,
        life: 0.25, size: 0.44, alpha: 0.4, additive: false, color: '#6d241e',
      });
      this._spawnPoint({
        x: bx, y: by + 0.02, z: bz,
        life: 0.05, size: 0.16, alpha: 0.7, additive: true, color: '#c4644a',
      });
    } else {
      const flashColor = surface === 'sand' ? '#ffe0b0' : surface === 'wood' ? '#ffd9a0' : '#fff2d0';
      this._spawnPoint({
        x: bx, y: by, z: bz,
        life: 0.045, size: surface === 'stone' ? 0.2 : 0.16, alpha: 0.8, additive: true, color: flashColor,
      });
    }
    if (preset.decal && this.decalsEnabled && (!normal || normal.y > 0.45)) {
      this._decal(point, surface);
    }
  }

  _decal(point, surface) {
    const i = this.decalCursor++ % MAX_DECALS;
    const scale = (surface === 'sand' ? 0.34 : 0.22) + this.rng() * 0.08;
    _o.position.set(point.x, heightAt(point.x, point.z) + 0.012, point.z);
    _o.rotation.set(0, this.rng() * Math.PI * 2, 0);
    _o.scale.setScalar(scale);
    _o.updateMatrix();
    this.decals.setMatrixAt(i, _o.matrix);
    this.decals.setColorAt(i, _color.set(surface === 'flesh' ? '#5a1a16' : '#2c241c'));
    this.decalCount = Math.min(MAX_DECALS, this.decalCount + 1);
    this.decals.count = this.decalCount;
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    if (this.camera?.isOrthographicCamera) {
      const height = this.renderer.domElement.height;
      const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
      this.pixelsPerMeter = height / Math.max(0.001, worldHeight);
    } else {
      this.pixelsPerMeter = this.renderer.domElement.height / 22;
    }
    this.additive.material.uniforms.uPixelsPerMeter.value = this.pixelsPerMeter;
    this.alpha.material.uniforms.uPixelsPerMeter.value = this.pixelsPerMeter;

    // Tracers.
    let tracerCount = 0;
    for (const s of this.tracerSlots) {
      if (!s.active) continue;
      s.t += dt / s.dur;
      if (s.t >= 1) {
        s.active = false;
        continue;
      }
      const headT = s.t;
      const tailT = Math.max(0, s.t - 0.45);
      _v.lerpVectors(s.from, s.to, headT);
      _v2.lerpVectors(s.from, s.to, tailT);
      _v3.subVectors(_v, _v2);
      const len = _v3.length();
      if (len < 0.001) continue;
      _v3.multiplyScalar(1 / len);
      _q.setFromUnitVectors(Z_AXIS, _v3);
      _o.position.copy(_v2).addScaledVector(_v3, len * 0.5);
      _o.quaternion.copy(_q);
      _o.scale.set(s.width, s.width, len);
      _o.updateMatrix();
      this.tracers.setMatrixAt(tracerCount, _o.matrix);
      _color.copy(s.color).multiplyScalar(Math.max(0, 1 - s.t * 0.85));
      this.tracers.setColorAt(tracerCount, _color);
      tracerCount++;
    }
    this.tracers.count = tracerCount;
    this.tracers.instanceMatrix.needsUpdate = true;
    this.tracers.instanceColor.needsUpdate = true;

    // Impact queue.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay <= 0) {
        this._impact(p.point, p.normal, p.surface);
        this.pending.splice(i, 1);
      }
    }

    // Points.
    let addCount = 0;
    let alphaCount = 0;
    for (const p of this.pointSlots) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vz *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.growth * dt;
      const t = p.life / p.maxLife;
      const alpha = p.alpha * t;
      const batch = p.additive ? this.additive : this.alpha;
      const idx = p.additive ? addCount : alphaCount;
      batch.positions[idx * 3] = p.x;
      batch.positions[idx * 3 + 1] = p.y;
      batch.positions[idx * 3 + 2] = p.z;
      batch.colors[idx * 3] = p.color.r;
      batch.colors[idx * 3 + 1] = p.color.g;
      batch.colors[idx * 3 + 2] = p.color.b;
      batch.sizes[idx] = p.size;
      batch.alphas[idx] = alpha;
      if (p.additive) addCount++;
      else alphaCount++;
    }
    this._flushBatch(this.additive, addCount);
    this._flushBatch(this.alpha, alphaCount);

    // Muzzle light decay.
    if (this.lightTimer > 0) {
      this.lightTimer = Math.max(0, this.lightTimer - dt);
      this.light.intensity = (this.lightTimer / this.lightLife) * 12;
    } else if (this.light.intensity !== 0) {
      this.light.intensity = 0;
    }
  }

  _flushBatch(batch, count) {
    batch.geo.setDrawRange(0, count);
    batch.geo.attributes.position.needsUpdate = true;
    batch.geo.attributes.aColor.needsUpdate = true;
    batch.geo.attributes.aSize.needsUpdate = true;
    batch.geo.attributes.aAlpha.needsUpdate = true;
  }
}
