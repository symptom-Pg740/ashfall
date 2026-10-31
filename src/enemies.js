import * as THREE from 'three';
import { heightAt, PLAY_RADIUS } from './terrain.js';
import { makeRng } from './rng.js';
import { box, merge, PALETTE } from './geo.js';

const POOL = 64;
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _ray = new THREE.Ray();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _capA = new THREE.Vector3();
const _capB = new THREE.Vector3();
const _pRay = new THREE.Vector3();
const _pSeg = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export function ghoulGeometry() {
  const p = [];
  // legs
  p.push(box(0.17, 0.72, 0.2, '#41473a', -0.16, 0.37, 0));
  p.push(box(0.17, 0.72, 0.2, '#41473a', 0.16, 0.37, 0));
  p.push(box(0.2, 0.12, 0.3, '#2f332b', -0.16, 0.06, 0.06));
  p.push(box(0.2, 0.12, 0.3, '#2f332b', 0.16, 0.06, 0.06));
  // torso leaning forward
  p.push(box(0.54, 0.58, 0.34, PALETTE.ghoul, 0, 0.98, 0.02, 0.24));
  p.push(box(0.58, 0.18, 0.38, '#565d48', 0, 0.72, 0.02, 0.12));
  p.push(box(0.3, 0.22, 0.1, '#4b4f3d', 0.1, 1.02, 0.2, 0.15, 0, 0.2));
  // head + jaw
  p.push(box(0.3, 0.26, 0.3, '#969a78', 0, 1.36, 0.18, 0.25));
  p.push(box(0.2, 0.09, 0.12, '#5e624a', 0, 1.23, 0.34));
  p.push(box(0.06, 0.04, 0.03, '#1c1c17', -0.07, 1.4, 0.33));
  p.push(box(0.06, 0.04, 0.03, '#1c1c17', 0.07, 1.4, 0.33));
  p.push(box(0.035, 0.028, 0.02, '#e0704c', -0.07, 1.4, 0.348));
  p.push(box(0.035, 0.028, 0.02, '#e0704c', 0.07, 1.4, 0.348));
  // long arms
  p.push(box(0.13, 0.78, 0.14, '#7d8264', -0.39, 0.83, 0.14, 0.15, 0, 0.13));
  p.push(box(0.13, 0.78, 0.14, '#7d8264', 0.39, 0.83, 0.14, 0.15, 0, -0.13));
  p.push(box(0.15, 0.16, 0.17, '#63684f', -0.44, 0.44, 0.22));
  p.push(box(0.15, 0.16, 0.17, '#63684f', 0.44, 0.44, 0.22));
  // spines / rags
  p.push(box(0.06, 0.2, 0.06, '#8d9170', -0.2, 1.24, -0.12, 0.4, 0, 0.5));
  p.push(box(0.06, 0.16, 0.06, '#8d9170', 0.15, 1.3, -0.13, 0.2, 0, -0.4));
  p.push(box(0.48, 0.1, 0.36, '#3e4034', 0, 0.76, 0.0));
  return merge(p);
}

export class Enemies {
  constructor(scene, seed = 0x6d0f1) {
    this.rng = makeRng(seed);
    this.pool = [];
    this.active = 0;
    this.maxActive = 22;
    this.onPlayerHit = null;

    const geo = ghoulGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, material, POOL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    for (let i = 0; i < POOL; i++) {
      this.pool.push({
        active: false,
        x: 0,
        z: 0,
        y: 0,
        hp: 0,
        speed: 1.5,
        phase: this.rng() * 6.28,
        attackCd: 0,
        hitTimer: 0,
        knockX: 0,
        knockZ: 0,
        scale: 1,
        target: {
          id: `ghoul:${i}`,
          faction: 'hostile',
          kind: 'ghoul',
          x: 0,
          y: 0,
          z: 0,
          hp: 0,
          maxHp: 46,
          radius: 0.32,
          height: 1.5,
          dead: true,
          ref: i,
          hit: (damage, fromX, fromZ, knock = 1) => this.damage(i, damage, fromX, fromZ, knock),
        },
      });
      _o.position.set(0, -50, 0);
      _o.scale.setScalar(0.0001);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      _c.setRGB(1, 1, 1);
      this.mesh.setColorAt(i, _c);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(count, aroundX = 0, aroundZ = 0, spread = 34, opts = {}) {
    let spawned = 0;
    for (let n = 0; n < count; n++) {
      const e = this.pool.find((x) => !x.active);
      if (!e) break;
      const a = this.rng() * Math.PI * 2;
      const r = spread + this.rng.range(-4, 8);
      const spawnX = aroundX + Math.cos(a) * r;
      const spawnZ = aroundZ + Math.sin(a) * r;
      const sd = Math.hypot(spawnX, spawnZ);
      const keep = sd > PLAY_RADIUS ? PLAY_RADIUS / sd : 1;
      e.x = spawnX * keep;
      e.z = spawnZ * keep;
      e.y = heightAt(e.x, e.z);
      e.active = true;
      const level = opts.level ?? 1;
      e.maxHp = Math.round(46 * (1 + 0.12 * (level - 1)));
      e.hp = e.maxHp;
      e.level = level;
      e.damage = 4.5 * (1 + 0.1 * (level - 1));
      e.speed = this.rng.range(1.35, 1.95) * (1 + 0.02 * (level - 1));
      e.phase = this.rng() * 6.28;
      e.attackCd = this.rng.range(0, 1);
      e.hitTimer = 0;
      e.knockX = 0;
      e.knockZ = 0;
      e.scale = this.rng.range(1.0, 1.2) * (1 + 0.02 * (level - 1));
      e.groupId = opts.groupId ?? null;
      e.raidMode = opts.raidMode ?? !opts.groupId;
      e.homeX = opts.homeX ?? aroundX;
      e.homeZ = opts.homeZ ?? aroundZ;
      e.aggro = opts.aggro ?? 12 + (level - 1);
      e.leash = opts.leash ?? 36;
      e.alerted = opts.alerted ?? !!e.raidMode;
      e.returning = false;
      e.wanderAngle = this.rng() * Math.PI * 2;
      e.wanderTimer = this.rng() * 2;
      e.yaw = this.rng() * Math.PI * 2;
      const i = this.pool.indexOf(e);
      _c.set(this.rng.pick(['#c3c6a1', '#a9ad8d', '#d2d0ac', '#9aa07c']));
      this.mesh.setColorAt(i, _c);
      spawned++;
    }
    if (spawned) this.mesh.instanceColor.needsUpdate = true;
    return spawned;
  }

  clear() {
    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i];
      e.active = false;
      _o.position.set(0, -60, 0);
      _o.scale.setScalar(0.0001);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Free a streamed encounter group back to the pool without killing it permanently. */
  despawnGroup(id) {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i];
      if (!e.active || e.groupId !== id) continue;
      e.active = false;
      e.target.dead = true;
      _o.position.set(0, -60, 0);
      _o.scale.setScalar(0.0001);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      n++;
    }
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
    return n;
  }

  get activeCount() {
    return this.pool.reduce((n, e) => n + (e.active ? 1 : 0), 0);
  }

  /** One member seeing or being hit by a living unit wakes the whole encounter group. */
  alertGroup(id) {
    if (id == null) return;
    for (const e of this.pool) {
      if (!e.active || e.groupId !== id) continue;
      e.alerted = true;
      e.returning = false;
    }
  }

  /**
   * Nearest living target. In group mode the target must also be inside the group's home leash,
   * which is what stops a patrol from following a survivor across the entire map.
   */
  nearestTarget(e, targets, maxDist, homeX = null, homeZ = null, homeLeash = Infinity) {
    if (!targets) return null;
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < targets.length; i++) {
      const other = targets[i];
      if (!other || other.dead) continue;
      if (homeX != null && Math.hypot(other.x - homeX, other.z - homeZ) > homeLeash) continue;
      const dx = other.x - e.x;
      const dz = other.z - e.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }

  /** A lazy wander point inside the encounter's home radius. */
  idlePoint(e, dt) {
    e.wanderTimer -= dt;
    if (e.wanderTimer <= 0 || !Number.isFinite(e.wanderX)) {
      e.wanderTimer = this.rng.range(2.5, 6);
      const a = this.rng() * Math.PI * 2;
      const r = this.rng() * 4.5;
      e.wanderX = e.homeX + Math.cos(a) * r;
      e.wanderZ = e.homeZ + Math.sin(a) * r;
    }
    return { x: e.wanderX, z: e.wanderZ };
  }

  update(dt, player, buildings, obstacles, getTargets = null) {
    const px = player.x;
    const pz = player.z;
    const targets = getTargets ? getTargets() : null;
    let count = 0;

    for (let i = 0; i < POOL; i++) {
      const e = this.pool[i];
      if (!e.active) continue;
      count++;

      e.attackCd = Math.max(0, e.attackCd - dt);
      e.hitTimer = Math.max(0, e.hitTimer - dt);

      // Encounter groups idle at their home until a living body enters the aggro ring. Camp-event
      // ghouls are `raidMode` and keep the old relentless chase toward the camp.
      let combatTarget = null;
      let moveTarget = null;
      const groupMode = e.groupId != null && !e.raidMode;
      if (groupMode) {
        if (!e.alerted) {
          const seen = this.nearestTarget(e, targets, e.aggro);
          if (seen) {
            this.alertGroup(e.groupId);
            combatTarget = seen;
          } else {
            moveTarget = this.idlePoint(e, dt);
          }
        }
        if (e.alerted) {
          combatTarget = this.nearestTarget(e, targets, Infinity, e.homeX, e.homeZ, e.leash);
          if (!combatTarget) {
            e.alerted = false;
            e.returning = true;
          }
        }
        if (e.returning && !e.alerted) {
          if (Math.hypot(e.homeX - e.x, e.homeZ - e.z) < 1.6) {
            e.returning = false;
            e.hp = Math.min(e.maxHp, e.hp + 10 * dt);
            moveTarget = null;
          } else {
            moveTarget = { x: e.homeX, z: e.homeZ };
          }
        }
      } else if (targets) {
        combatTarget = this.nearestTarget(e, targets, Infinity);
        if (!combatTarget) moveTarget = { x: px, z: pz };
      }

      const tx = combatTarget ? combatTarget.x : moveTarget ? moveTarget.x : e.x;
      const tz = combatTarget ? combatTarget.z : moveTarget ? moveTarget.z : e.z;
      let dx = tx - e.x;
      let dz = tz - e.z;
      let dist = Math.hypot(dx, dz);
      const nx = dist > 0.001 ? dx / dist : 0;
      const nz = dist > 0.001 ? dz / dist : 0;
      const hasMove = !!combatTarget || !!moveTarget;

      // knockback
      e.x += e.knockX * dt;
      e.z += e.knockZ * dt;
      e.knockX *= Math.exp(-9 * dt);
      e.knockZ *= Math.exp(-9 * dt);

      if (hasMove && dist > (combatTarget ? 1.35 : 0.45)) {
        const speed = combatTarget ? e.speed : e.speed * 0.45;
        e.x += nx * speed * dt;
        e.z += nz * speed * dt;
      } else if (combatTarget && dist <= 1.35 && e.attackCd <= 0) {
        e.attackCd = this.rng.range(1.3, 1.8);
        if (combatTarget.hit) combatTarget.hit(e.damage, e.x, e.z);
        else if (this.onPlayerHit) this.onPlayerHit(e.damage, e);
      }

      // A chasing group cannot be dragged past its home leash.
      if (groupMode && e.alerted && Math.hypot(e.x - e.homeX, e.z - e.homeZ) > e.leash) {
        e.alerted = false;
        e.returning = true;
      }

      // separate the horde so it doesn't collapse into one silhouette
      for (let j = i + 1; j < POOL; j++) {
        const o = this.pool[j];
        if (!o.active) continue;
        const sx = o.x - e.x;
        const sz = o.z - e.z;
        const sd = Math.hypot(sx, sz);
        if (sd > 0.001 && sd < 0.78) {
          const push = (0.78 - sd) * 0.5;
          e.x -= (sx / sd) * push;
          e.z -= (sz / sd) * push;
          o.x += (sx / sd) * push;
          o.z += (sz / sd) * push;
        }
      }

      // buildings are solid — push the ghouls out of the footprint
      for (let b = 0; b < buildings.length; b++) {
        const bd = buildings[b];
        const bx = e.x - bd.x;
        const bz = e.z - bd.z;
        const rad = bd.radius + 0.35;
        const bdist = Math.hypot(bx, bz);
        if (bdist > 0.001 && bdist < rad) {
          e.x = bd.x + (bx / bdist) * rad;
          e.z = bd.z + (bz / bdist) * rad;
        }
      }

      // and so is the pre-existing wreckage
      if (obstacles) {
        for (let o = 0; o < obstacles.length; o++) {
          const ob = obstacles[o];
          const bx = e.x - ob.x;
          const bz = e.z - ob.z;
          const rad = ob.r + 0.3;
          const bdist = Math.hypot(bx, bz);
          if (bdist > 0.001 && bdist < rad) {
            e.x = ob.x + (bx / bdist) * rad;
            e.z = ob.z + (bz / bdist) * rad;
          }
        }
      }

      const rr = Math.hypot(e.x, e.z);
      if (rr > PLAY_RADIUS) {
        e.x *= PLAY_RADIUS / rr;
        e.z *= PLAY_RADIUS / rr;
      }

      e.y = heightAt(e.x, e.z);
      dx = tx - e.x;
      dz = tz - e.z;
      dist = Math.hypot(dx, dz);
      const yaw = hasMove && dist > 0.001 ? Math.atan2(dx, dz) : e.yaw || 0;
      e.yaw = yaw;
      e.phase += dt * (6.2 + e.speed * (hasMove ? 1 : 0.35));

      const hitPulse = e.hitTimer > 0 ? 1 + e.hitTimer * 0.55 : 1;
      const bob = Math.abs(Math.sin(e.phase)) * 0.045;
      _o.position.set(e.x, e.y + bob, e.z);
      _o.rotation.set(Math.sin(e.phase * 0.5) * 0.025, yaw, Math.sin(e.phase) * 0.035);
      _o.scale.set(e.scale * hitPulse, e.scale, e.scale * hitPulse);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }

    this.active = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  damage(index, amount, fromX, fromZ, knock = 1) {
    const e = this.pool[index];
    if (!e || !e.active) return false;
    e.hp -= amount;
    e.hitTimer = 0.22;
    if (e.groupId != null) {
      e.alerted = true;
      e.returning = false;
      this.alertGroup(e.groupId);
    }
    const dx = e.x - fromX;
    const dz = e.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    e.knockX = (dx / d) * 5.5 * knock;
    e.knockZ = (dz / d) * 5.5 * knock;
    if (e.hp <= 0) {
      e.active = false;
      _o.position.set(e.x, -60, e.z);
      _o.scale.setScalar(0.0001);
      _o.updateMatrix();
      this.mesh.setMatrixAt(index, _o.matrix);
      this.mesh.instanceMatrix.needsUpdate = true;
      return true;
    }
    return false;
  }

  /** Damage all ghouls in a radius; returns hit positions and kills. */
  strike(x, z, radius, amount) {
    const results = [];
    for (let i = 0; i < POOL; i++) {
      const e = this.pool[i];
      if (!e.active) continue;
      if (Math.hypot(e.x - x, e.z - z) <= radius) {
        const killed = this.damage(i, amount, x, z);
        results.push({ x: e.x, z: e.z, killed });
      }
    }
    return results;
  }

  /** Iterate the active pool without allocating per-ghoul records. */
  forEachTarget(cb) {
    for (let i = 0; i < POOL; i++) {
      const e = this.pool[i];
      if (!e.active) {
        e.target.dead = true;
        continue;
      }
      const t = e.target;
      t.x = e.x;
      t.y = e.y;
      t.z = e.z;
      t.hp = e.hp;
      t.maxHp = e.maxHp || 46;
      t.level = e.level || 1;
      t.damage = e.damage || 4.5;
      t.speed = e.speed || 1.5;
      t.radius = 0.32 * e.scale;
      t.height = 1.5 * e.scale;
      t.dead = false;
      cb(t);
    }
  }

  /**
   * Ray against every active ghoul capsule. Returns the nearest hit or null.
   * `dir` must be normalized; `maxDist` is in metres.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    _rayOrigin.set(ox, oy, oz);
    _rayDir.set(dx, dy, dz);
    _ray.set(_rayOrigin, _rayDir);
    let bestT = maxDist;
    let bestIndex = -1;
    _pSeg.set(0, 0, 0);
    for (let i = 0; i < POOL; i++) {
      const e = this.pool[i];
      if (!e.active) continue;
      const scale = e.scale;
      _capA.set(e.x, e.y + 0.35 * scale, e.z);
      _capB.set(e.x, e.y + 1.35 * scale, e.z);
      const d2 = _ray.distanceSqToSegment(_capA, _capB, _pRay, _pSeg);
      const r = 0.32 * scale;
      if (d2 > r * r) continue;
      const t = _tmp.subVectors(_pRay, _rayOrigin).dot(_rayDir);
      if (t < 0 || t > bestT) continue;
      bestT = t;
      bestIndex = i;
    }
    if (bestIndex < 0) return null;
    const e = this.pool[bestIndex];
    return {
      index: bestIndex,
      t: bestT,
      point: new THREE.Vector3(ox + dx * bestT, oy + dy * bestT, oz + dz * bestT),
      dead: e.hp <= 0,
    };
  }

  nearest(x, z, maxDist) {
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < POOL; i++) {
      const e = this.pool[i];
      if (!e.active) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  getAt(index) {
    return this.pool[index];
  }
}
