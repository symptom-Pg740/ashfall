import * as THREE from 'three';
import { heightAt, PLAY_RADIUS } from './terrain.js';
import { makeRng } from './rng.js';
import { box, merge } from './geo.js';

const POOL = 14;

/** Small body with ears and two red eyes. The wings are separate so they can flap. */
function bodyGeometry() {
  const p = [];
  p.push(box(0.2, 0.17, 0.36, '#3b3234', 0, 0, 0));
  p.push(box(0.13, 0.1, 0.13, '#4a3f41', 0, 0.08, 0.19));
  p.push(box(0.035, 0.12, 0.04, '#2b2426', -0.07, 0.18, 0.18, 0.2, 0, 0.25));
  p.push(box(0.035, 0.12, 0.04, '#2b2426', 0.07, 0.18, 0.18, 0.2, 0, -0.25));
  p.push(box(0.025, 0.025, 0.02, '#e04a3a', -0.045, 0.08, 0.26));
  p.push(box(0.025, 0.025, 0.02, '#e04a3a', 0.045, 0.08, 0.26));
  p.push(box(0.04, 0.14, 0.05, '#2b2426', 0, -0.02, -0.21, -0.3, 0, 0));
  return merge(p);
}

function wingGeometry() {
  const p = [];
  p.push(box(0.72, 0.025, 0.3, '#332b2d', 0.38, 0, 0));
  p.push(box(0.3, 0.02, 0.16, '#443a3c', 0.75, 0, 0.08));
  p.push(box(0.42, 0.02, 0.04, '#241f21', 0.5, 0, 0.17));
  return merge(p);
}

/**
 * Bio-engineered bats. They fly over walls and bite living units — camp survivors and raiders
 * alike — which makes them the first enemy that ignores the usual ground cover. They are small,
 * fragile, and very much inside a Vickers' field of fire.
 */
export class Bats {
  constructor(scene, seed = 0xba7511) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.pool = [];
    this.onBite = null;
    this._targets = [];

    const bodyGeo = bodyGeometry();
    const wingGeo = wingGeometry();
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const wingMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < POOL; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      body.receiveShadow = false;
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      wingR.scale.x = -1;
      wingL.castShadow = wingR.castShadow = true;
      group.add(body, wingL, wingR);
      group.visible = false;
      scene.add(group);

      this.pool.push({
        group,
        wingL,
        wingR,
        active: false,
        x: 0,
        z: 0,
        y: 0,
        hp: 0,
        speed: 3.2,
        phase: this.rng() * 6.28,
        attackCd: 0,
        hitTimer: 0,
        groupId: null,
        raidMode: true,
        homeX: 0,
        homeZ: 0,
        aggro: 10,
        leash: 30,
        alerted: true,
        returning: false,
        wanderAngle: this.rng() * Math.PI * 2,
        yaw: 0,
        target: {
          id: `bat:${i}`,
          faction: 'hostile',
          kind: 'bat',
          x: 0, y: 0, z: 0,
          hp: 0, maxHp: 12,
          radius: 0.28,
          height: 0.5,
          dead: true,
          ref: i,
          hit: (damage) => this.damage(i, damage),
        },
      });
    }
  }

  spawn(count, aroundX = 0, aroundZ = 0, spread = 28, opts = {}) {
    let spawned = 0;
    for (let n = 0; n < count; n++) {
      const b = this.pool.find((x) => !x.active);
      if (!b) break;
      const a = this.rng() * Math.PI * 2;
      const r = spread + this.rng.range(-4, 6);
      const sx = aroundX + Math.cos(a) * r;
      const sz = aroundZ + Math.sin(a) * r;
      const sd = Math.hypot(sx, sz);
      const keep = sd > PLAY_RADIUS ? PLAY_RADIUS / sd : 1;
      b.x = sx * keep;
      b.z = sz * keep;
      b.y = heightAt(b.x, b.z) + 1.9;
      b.active = true;
      const policy = opts.level ?? 1;
      b.level = policy;
      b.maxHp = Math.round(12 * (1 + 0.25 * (policy - 1)));
      b.hp = b.maxHp;
      b.damage = 2.6 * (1 + 0.15 * (policy - 1));
      b.speed = this.rng.range(2.9, 3.8) * (1 + 0.02 * (policy - 1));
      b.phase = this.rng() * 6.28;
      b.attackCd = this.rng.range(0.2, 1);
      b.hitTimer = 0;
      b.groupId = opts.groupId ?? null;
      b.raidMode = opts.raidMode ?? !opts.groupId;
      b.homeX = opts.homeX ?? aroundX;
      b.homeZ = opts.homeZ ?? aroundZ;
      b.aggro = opts.aggro ?? 10;
      b.leash = opts.leash ?? 30;
      b.alerted = opts.alerted ?? !!b.raidMode;
      b.returning = false;
      b.wanderAngle = this.rng() * Math.PI * 2;
      b.yaw = this.rng() * Math.PI * 2;
      b.level = opts.level ?? 1;
      b.group.visible = true;
      b.group.position.set(b.x, b.y, b.z);
      spawned++;
    }
    return spawned;
  }

  clear() {
    for (const b of this.pool) {
      b.active = false;
      b.group.visible = false;
    }
  }

  /** Free a streamed roost back to the pool without killing it permanently. */
  despawnGroup(id) {
    let n = 0;
    for (const b of this.pool) {
      if (!b.active || b.groupId !== id) continue;
      b.active = false;
      b.group.visible = false;
      b.target.dead = true;
      n++;
    }
    return n;
  }

  get activeCount() {
    return this.pool.reduce((n, b) => n + (b.active ? 1 : 0), 0);
  }

  damage(index, amount) {
    const b = this.pool[index];
    if (!b || !b.active) return false;
    b.hp -= amount;
    b.hitTimer = 0.2;
    if (b.groupId != null) {
      b.alerted = true;
      b.returning = false;
      this.alertGroup(b.groupId);
    }
    if (b.hp <= 0) {
      b.active = false;
      b.group.visible = false;
      b.target.dead = true;
      return true;
    }
    return false;
  }

  alertGroup(id) {
    if (id == null) return;
    for (const b of this.pool) {
      if (!b.active || b.groupId !== id) continue;
      b.alerted = true;
      b.returning = false;
    }
  }

  /** The nearest living unit inside the optional home leash, or null when the sky is empty. */
  pickTarget(x, z, targets, maxD2 = 52 * 52, homeX = null, homeZ = null, leash = Infinity) {
    let best = null;
    let bestD = maxD2;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t || t.dead) continue;
      if (homeX != null && Math.hypot(t.x - homeX, t.z - homeZ) > leash) continue;
      const dx = t.x - x;
      const dz = t.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  update(dt, time, player, getTargets) {
    const targets = getTargets ? getTargets() : null;
    for (const b of this.pool) {
      if (!b.active) continue;
      b.attackCd = Math.max(0, b.attackCd - dt);
      b.hitTimer = Math.max(0, b.hitTimer - dt);

      let combatTarget = null;
      let moveTarget = null;
      const groupMode = b.groupId != null && !b.raidMode;
      if (targets) {
        if (groupMode) {
          if (!b.alerted) {
            const seen = this.pickTarget(b.x, b.z, targets, b.aggro * b.aggro);
            if (seen) {
              this.alertGroup(b.groupId);
              combatTarget = seen;
            } else {
              const a = time * 0.35 + b.wanderAngle;
              moveTarget = { x: b.homeX + Math.cos(a) * 4, z: b.homeZ + Math.sin(a) * 4 };
            }
          }
          if (b.alerted) {
            combatTarget = this.pickTarget(
              b.x, b.z, targets, Infinity, b.homeX, b.homeZ, b.leash,
            );
            if (!combatTarget) {
              b.alerted = false;
              b.returning = true;
            }
          }
          if (b.returning && !b.alerted) {
            if (Math.hypot(b.homeX - b.x, b.homeZ - b.z) < 1.8) {
              b.returning = false;
            } else {
              moveTarget = { x: b.homeX, z: b.homeZ };
            }
          }
        } else {
          combatTarget = this.pickTarget(b.x, b.z, targets);
          if (!combatTarget) {
            const cx = player?.x || 0;
            const cz = player?.z || 0;
            const a = time * 0.5 + b.phase;
            moveTarget = { x: cx + Math.cos(a) * 9, z: cz + Math.sin(a) * 9 };
          }
        }
      }

      let dx = 0;
      let dz = 0;
      let dist = 0;
      if (combatTarget) {
        dx = combatTarget.x - b.x;
        dz = combatTarget.z - b.z;
        dist = Math.hypot(dx, dz) || 1;
        if (dist > 1.35) {
          const step = Math.min(b.speed * dt, dist - 1.1);
          b.x += (dx / dist) * step;
          b.z += (dz / dist) * step;
        } else if (b.attackCd <= 0) {
          b.attackCd = 1.25;
          const killed = combatTarget.hit?.(b.damage || 2.6) ?? false;
          this.onBite?.(combatTarget, killed);
        }
      } else if (moveTarget) {
        dx = moveTarget.x - b.x;
        dz = moveTarget.z - b.z;
        dist = Math.hypot(dx, dz) || 1;
        if (dist > 0.4) {
          const step = Math.min(b.speed * 0.65 * dt, dist);
          b.x += (dx / dist) * step;
          b.z += (dz / dist) * step;
        }
      }

      if (groupMode && b.alerted && Math.hypot(b.x - b.homeX, b.z - b.homeZ) > b.leash) {
        b.alerted = false;
        b.returning = true;
      }

      const yaw = (combatTarget || moveTarget) && dist > 0.001
        ? Math.atan2(dx, dz)
        : b.yaw || 0;
      b.yaw = yaw;
      b.group.rotation.y = yaw;

      const d = Math.hypot(b.x, b.z);
      if (d > PLAY_RADIUS) {
        b.x *= PLAY_RADIUS / d;
        b.z *= PLAY_RADIUS / d;
      }
      b.y = heightAt(b.x, b.z) + 1.85 + Math.sin(time * 3.1 + b.phase) * 0.28;
      const flap = Math.sin(time * 13 + b.phase) * 0.9;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
      const pulse = b.hitTimer > 0 ? 1 + b.hitTimer * 0.8 : 1;
      b.group.position.set(b.x, b.y, b.z);
      b.group.scale.setScalar(pulse);
    }
  }

  forEachTarget(cb) {
    for (let i = 0; i < this.pool.length; i++) {
      const b = this.pool[i];
      if (!b.active) {
        b.target.dead = true;
        continue;
      }
      const t = b.target;
      t.x = b.group.position.x;
      t.y = b.group.position.y;
      t.z = b.group.position.z;
      t.hp = b.hp;
      t.maxHp = b.maxHp || 12;
      t.level = b.level || 1;
      t.damage = b.damage || 2.6;
      t.speed = b.speed || 3.2;
      t.dead = false;
      cb(t);
    }
  }
}
