import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { damp, clamp } from './rng.js';
import { box, cyl, merge, shadowTexture } from './geo.js';

const SPEED = 4.15;
const MAX_RADIUS = 52;

function bodyGeometry() {
  const p = [];
  p.push(box(0.62, 0.66, 0.38, '#6b614e', 0, 1.2, 0));
  p.push(box(0.68, 0.34, 0.42, '#544c3e', 0, 0.86, 0));
  p.push(box(0.7, 0.1, 0.44, '#403a30', 0, 1.02, 0));
  p.push(box(0.26, 0.1, 0.06, '#9a7f54', 0, 1.02, 0.23));
  // head + hood + scarf + respirator
  p.push(box(0.34, 0.32, 0.34, '#c08d60', 0, 1.72, 0.01));
  p.push(box(0.37, 0.12, 0.36, '#584a39', 0, 1.88, 0));
  p.push(box(0.39, 0.16, 0.38, '#b45c38', 0, 1.55, 0.01));
  p.push(box(0.28, 0.19, 0.08, '#5f5a4f', 0, 1.67, 0.18));
  p.push(box(0.08, 0.015, 0.02, '#2e2b26', -0.07, 1.77, 0.19));
  p.push(box(0.08, 0.015, 0.02, '#2e2b26', 0.07, 1.77, 0.19));
  // pack + bedroll
  p.push(box(0.4, 0.48, 0.22, '#4a4539', 0, 1.24, -0.28));
  p.push(box(0.32, 0.12, 0.24, '#7b6043', 0, 1.53, -0.3));
  p.push(cyl(0.09, 0.09, 0.5, 6, '#94795a', 0, 1.56, -0.33, 0, 0, Math.PI / 2));
  // shoulder plates
  p.push(box(0.2, 0.13, 0.38, '#575146', 0.4, 1.45, 0));
  p.push(box(0.2, 0.13, 0.38, '#575146', -0.4, 1.45, 0));
  return merge(p);
}

function armGeometry(weapon) {
  const p = [];
  p.push(box(0.16, 0.46, 0.18, '#6b614e', 0, -0.22, 0));
  p.push(box(0.145, 0.1, 0.165, '#c98a45', 0, -0.36, 0));
  p.push(box(0.14, 0.38, 0.16, '#514a3b', 0, -0.6, 0.02));
  p.push(box(0.13, 0.13, 0.14, '#c08d60', 0, -0.83, 0.03));
  if (weapon) {
    p.push(box(0.06, 0.2, 0.1, '#5b4530', 0, -0.94, 0.03));
    p.push(box(0.035, 0.78, 0.12, '#b0ad9f', 0, -1.38, 0.02));
    p.push(box(0.045, 0.1, 0.15, '#d1cec0', 0, -1.78, 0.02));
  }
  return merge(p);
}

function legGeometry() {
  const p = [];
  p.push(box(0.2, 0.46, 0.22, '#4a443a', 0, -0.23, 0));
  p.push(box(0.18, 0.4, 0.2, '#564f42', 0, -0.64, 0));
  p.push(box(0.22, 0.17, 0.32, '#332f29', 0, -0.84, 0.04));
  return merge(p);
}

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.bob = new THREE.Group();
    this.group.add(this.bob);
    scene.add(this.group);

    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    this.torso = new THREE.Mesh(bodyGeometry(), material);
    this.bob.add(this.torso);

    this.armL = new THREE.Group();
    this.armL.position.set(-0.41, 1.43, 0);
    this.armL.add(new THREE.Mesh(armGeometry(false), material));
    this.bob.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.41, 1.43, 0);
    this.armR.add(new THREE.Mesh(armGeometry(true), material));
    this.bob.add(this.armR);

    this.legL = new THREE.Group();
    this.legL.position.set(-0.17, 0.86, 0);
    this.legL.add(new THREE.Mesh(legGeometry(), material));
    this.bob.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.17, 0.86, 0);
    this.legR.add(new THREE.Mesh(legGeometry(), material));
    this.bob.add(this.legR);

    // soft blob shadow (procedural canvas texture)
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      toneMapped: false,
      color: 0x000000,
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.035;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);

    this.bob.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });

    this.pos = this.group.position;
    this.pos.set(0, heightAt(0, 4.5), 4.5);
    this.heading = 0;
    this.targetHeading = 0;
    this.phase = 0;
    this.moving = 0;
    this.attackTime = 0;
    this.attackCooldown = 0;
    this.hitTimer = 0;
  }

  get x() {
    return this.pos.x;
  }
  get z() {
    return this.pos.z;
  }

  strike() {
    if (this.attackCooldown > 0) return false;
    this.attackCooldown = 0.52;
    this.attackTime = 0.3;
    return true;
  }

  update(dt, moveX, moveZ) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackTime = Math.max(0, this.attackTime - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);

    const len = Math.hypot(moveX, moveZ);
    const moving = len > 0.08;
    this.moving = damp(this.moving, moving ? 1 : 0, 12, dt);

    if (moving) {
      const nx = moveX / len;
      const nz = moveZ / len;
      const speed = SPEED * (this.attackTime > 0 ? 0.55 : 1);
      this.pos.x = clamp(this.pos.x + nx * speed * dt, -MAX_RADIUS, MAX_RADIUS);
      this.pos.z = clamp(this.pos.z + nz * speed * dt, -MAX_RADIUS, MAX_RADIUS);
      const d = Math.hypot(this.pos.x, this.pos.z);
      if (d > MAX_RADIUS) {
        this.pos.x *= MAX_RADIUS / d;
        this.pos.z *= MAX_RADIUS / d;
      }
      this.targetHeading = Math.atan2(nx, nz);
      this.phase += dt * (7.6 + this.moving * 1.2);
    } else {
      this.phase += dt * 1.4;
    }

    this.pos.y = heightAt(this.pos.x, this.pos.z);

    // shortest-arc heading damp
    let diff = this.targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * (1 - Math.exp(-14 * dt));
    this.group.rotation.y = this.heading;

    const m = this.moving;
    const swing = Math.sin(this.phase) * m;
    const bobY = Math.abs(Math.sin(this.phase)) * 0.035 * m + Math.sin(this.phase * 0.5) * 0.008;
    this.bob.position.y = bobY;
    this.bob.rotation.z = Math.sin(this.phase) * 0.018 * m;
    this.bob.rotation.x = 0.03 * m;

    this.legL.rotation.x = swing * 0.62;
    this.legR.rotation.x = -swing * 0.62;
    this.armL.rotation.x = -swing * 0.5;
    this.armL.rotation.z = 0.06;

    if (this.attackTime > 0) {
      const f = 1 - this.attackTime / 0.3; // 0 → 1
      const arc = Math.sin(f * Math.PI);
      this.armR.rotation.x = -1.75 + f * 2.9;
      this.armR.rotation.z = -0.5 + arc * 0.85;
      this.bob.rotation.y = -arc * 0.32;
    } else {
      this.armR.rotation.x = swing * 0.5;
      this.armR.rotation.z = -0.06;
      this.bob.rotation.y *= 1 - Math.min(1, dt * 12);
    }

    if (this.hitTimer > 0) {
      this.bob.rotation.z += Math.sin(this.hitTimer * 60) * 0.06;
    }
  }

  hit() {
    this.hitTimer = 0.28;
  }

  healthRegen(dt, amount) {
    // visual hook only; health lives in game state
    this.hitTimer = Math.max(0, this.hitTimer - dt);
  }
}
