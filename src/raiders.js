import { buildSkinnedHumanoid, bakeStatic } from './skinned.js';
import { AimController } from './aim.js';
import { WEAPONS } from './weapons.js';
import { heightAt, PLAY_RADIUS } from './terrain.js';
import { deriveSeed, makeRng, damp } from './rng.js';

const POOL = 10;

/** What a raider will carry off, and how much one trip is worth. */
const LOOT = {
  warehouse: { kind: 'scrap', min: 10, max: 18, priority: 20 },
  workshop: { kind: 'scrap', min: 6, max: 12, priority: 17 },
  house: { kind: 'scrap', min: 6, max: 10, priority: 14 },
  scavenger: { kind: 'scrap', min: 4, max: 8, priority: 12 },
  farm: { kind: 'food', min: 4, max: 8, priority: 15 },
  catcher: { kind: 'water', min: 4, max: 8, priority: 14 },
  well: { kind: 'water', min: 4, max: 8, priority: 13 },
  battery: { kind: 'scrap', min: 4, max: 8, priority: 11 },
  solar: { kind: 'scrap', min: 4, max: 7, priority: 10 },
  turret: { kind: 'scrap', min: 3, max: 6, priority: 8 },
  tower: { kind: 'scrap', min: 3, max: 6, priority: 8 },
  chapel: { kind: 'scrap', min: 3, max: 5, priority: 5 },
  relay: { kind: 'scrap', min: 3, max: 5, priority: 4 },
};

/**
 * Hostile rifle raiders. They are a smash-and-grab squad, not a extermination force: they walk in,
 * loot the nearest useful structures, shoot only the defenders close enough to stop them, and run
 * for the edge of the map once they have a load or take heavy casualties.
 */
export class Raiders {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.people = [];
    this.registry = null;
    this.firearms = null;
    this.settlement = null;
    this.onKill = null;
    this.onLoot = null;
    this.onRetreat = null;
    this.onEscape = null;
    this.baseAngle = this.rng() * Math.PI * 2;
    this._waveSize = 0;
    this._retreatAnnounced = false;
    this.lootedValue = 0;
    this.escaped = 0;

    for (let i = 0; i < POOL; i++) {
      const rng = makeRng(deriveSeed(`raider:${i}`));
      const rig = buildSkinnedHumanoid(deriveSeed(`raider-body:${i}`), {
        castShadow: false,
        archetype: ['lean', 'stocky', 'tall'][i % 3],
        detail: 'low',
        equipment: {
          head: 'none',
          face: 'none',
          torso: 'coat',
          legs: 'trousers',
          feet: 'boots',
          shoulders: 'none',
          hands: 'none',
          back: 'none',
          waist: 'none',
          weapon: 'rifle',
        },
      });
      rig.group.visible = false;
      this.scene.add(rig.group);

      const farTier = bakeStatic(rig);
      if (farTier) {
        farTier.visible = false;
        rig.group.add(farTier);
      }

      const weapon = WEAPONS.rifle;
      const speed = rng.range(1.25, 1.6);
      const target = {
        id: `raider:${i}`,
        faction: 'raider',
        kind: 'raider',
        x: 0, y: 0, z: 0,
        hp: 46, maxHp: 46,
        radius: 0.38,
        height: 1.8,
        dead: true,
        ref: i,
        hit: (damage) => this.damage(i, damage),
      };

      this.people.push({
        rig,
        farTier,
        target,
        active: false,
        dead: true,
        hp: 46,
        maxHp: 46,
        weapon,
        mag: weapon.magazine,
        reloadTimer: 0,
        cooldown: 0,
        recoil: 0,
        aim: new AimController({
          faction: 'raider',
          firePolicy: 'auto',
          cone: 120,
          turnRate: 300,
          fireGate: 3,
          reaction: 0.3,
          range: weapon.range,
        }),
        aimActor: { x: 0, y: 0, z: 0, heading: 0 },
        heading: 0,
        isFar: true,
        speed,
        baseSpeed: speed,
        phase: rng() * 6.28,
        suppressed: 0,
        slotAngle: (i / POOL) * Math.PI * 2,
        // smash-and-grab state
        flee: false,
        loot: null,
        lootTimer: 0,
        lootCount: 0,
        lootedIds: new Set(),
        carry: 0,
        raidTime: 0,
        fleeTimer: 0,
        jut: rng() * Math.PI * 2,
        // encounter-group state (world guards are inert until someone enters their aggro ring)
        raidMode: true,
        groupId: null,
        homeX: 0,
        homeZ: 0,
        aggro: 12,
        leash: 34,
        alerted: true,
        returning: false,
        wanderTimer: 0,
        wanderX: 0,
        wanderZ: 0,
      });
    }
  }

  attachCombat({ registry, firearms, onKill }) {
    this.registry = registry;
    this.firearms = firearms;
    this.onKill = onKill || null;
    for (const p of this.people) {
      p.aim.los = (x1, y1, z1, x2, y2, z2) => firearms.hasLineOfSight(x1, y1, z1, x2, y2, z2);
    }
  }

  spawnWave(count, aroundX, aroundZ, distance = 30, opts = {}) {
    let spawned = 0;
    const raidMode = opts.raidMode ?? true;
    if (raidMode) {
      this._retreatAnnounced = false;
      this.lootedValue = 0;
    }
    for (let n = 0; n < count; n++) {
      const p = this.people.find((r) => !r.active);
      if (!p) break;
      const a = this.rng() * Math.PI * 2;
      const radius = distance + this.rng.range(-2, 3);
      const spawnX = aroundX + Math.cos(a) * radius;
      const spawnZ = aroundZ + Math.sin(a) * radius;
      const sd = Math.hypot(spawnX, spawnZ);
      const keep = sd > PLAY_RADIUS ? PLAY_RADIUS / sd : 1;
      const x = spawnX * keep;
      const z = spawnZ * keep;
      p.active = true;
      p.dead = false;
      const policy = opts.level ?? 1;
      p.level = policy;
      p.maxHp = Math.round(46 * (1 + 0.12 * (policy - 1)));
      p.hp = p.maxHp;
      p.damageScale = 1 + 0.07 * (policy - 1);
      p.speed = p.baseSpeed * (1 + 0.02 * (policy - 1));
      p.aim.target = null;
      p.aim._initialised = false;
      p.mag = p.weapon.magazine;
      p.reloadTimer = 0;
      p.cooldown = 0;
      p.recoil = 0;
      p.heading = Math.atan2(aroundX - x, aroundZ - z);
      p.rig.group.position.set(x, heightAt(x, z), z);
      p.rig.group.rotation.y = p.heading;
      p.rig.group.visible = true;
      p.rig.mesh.visible = true;
      if (p.farTier) p.farTier.visible = false;
      p.isFar = false;
      p.phase = this.rng() * 6.28;
      p.suppressed = 0;
      p.flee = false;
      p.loot = null;
      p.lootTimer = 0;
      p.lootCount = 0;
      p.lootedIds.clear();
      p.carry = 0;
      p.raidTime = 0;
      p.fleeTimer = 0;
      p.raidMode = raidMode;
      p.groupId = opts.groupId ?? null;
      p.homeX = opts.homeX ?? aroundX;
      p.homeZ = opts.homeZ ?? aroundZ;
      p.aggro = opts.aggro ?? 12;
      p.leash = opts.leash ?? 34;
      p.alerted = opts.alerted ?? raidMode;
      p.returning = false;
      p.wanderTimer = 0;
      p.wanderX = x;
      p.wanderZ = z;
      spawned++;
    }
    if (raidMode) this._waveSize = spawned;
    return spawned;
  }

  /** Free a streamed encounter group back to the pool without killing it permanently. */
  despawnGroup(id) {
    let n = 0;
    for (const p of this.people) {
      if (!p.active || p.groupId !== id) continue;
      p.active = false;
      p.dead = true;
      p.target.dead = true;
      p.rig.group.visible = false;
      if (p.farTier) p.farTier.visible = false;
      p.aim.target = null;
      p.aim.canFire = false;
      n++;
    }
    return n;
  }

  forEachTarget(cb) {
    for (const p of this.people) {
      if (!p.active || p.dead) continue;
      const t = p.target;
      t.x = p.rig.group.position.x;
      t.y = p.rig.group.position.y;
      t.z = p.rig.group.position.z;
      t.hp = p.hp;
      t.maxHp = p.maxHp;
      t.level = p.level || 1;
      t.damage = p.weapon.damage * (p.damageScale || 1);
      t.range = p.weapon.range;
      t.speed = p.speed;
      t.dead = false;
      cb(t);
    }
  }

  damage(index, amount) {
    const p = this.people[index];
    if (!p || !p.active || p.dead) return false;
    p.hp -= amount;
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.target.dead = true;
      p.active = false;
      p.rig.group.visible = false;
      if (p.farTier) p.farTier.visible = false;
      if (p.aim) {
        p.aim.target = null;
        p.aim.canFire = false;
      }
      return true;
    }
    // Hit but alive: flinch and lose the taste for a fight. A wounded raider runs sooner.
    p.suppressed = 1.2;
    if (p.groupId != null) {
      p.alerted = true;
      p.returning = false;
      this.alertGroup(p.groupId);
    }
    if (p.hp < p.maxHp * 0.35) p.flee = true;
    return false;
  }

  get activeCount() {
    return this.people.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }

  /** Pick the richest reachable structure this raider has not already emptied. */
  chooseLoot(p) {
    const pos = p.rig.group.position;
    let best = null;
    let bestScore = Infinity;
    for (const b of this.settlement?.buildings || []) {
      if (!b.built || b.destroyed) continue;
      const info = LOOT[b.type];
      if (!info) continue;
      if (p.lootedIds.has(b.id)) continue;
      const d = Math.hypot(b.x - pos.x, b.z - pos.z);
      const score = d - info.priority;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  /** Empty a structure, report the loss, then decide whether the squad has had enough. */
  takeLoot(p, building) {
    const info = LOOT[building.type];
    if (!info) return;
    const amount = Math.round(this.rng.range(info.min, info.max));
    p.lootedIds.add(building.id);
    p.carry += amount;
    p.lootCount++;
    this.lootedValue += amount;
    building.hp = Math.max(1, building.hp - 4);
    this.onLoot?.(info.kind, amount, building);
    p.loot = null;
    p.lootTimer = 0;
    if (p.lootCount >= 2 || p.raidTime > 32) this.startFlee(p);
  }

  /** One guard seeing or taking a hit wakes the whole world encounter group. */
  alertGroup(id) {
    if (id == null) return;
    for (const p of this.people) {
      if (!p.active || p.groupId !== id) continue;
      p.alerted = true;
      p.returning = false;
    }
  }

  nearestTarget(p, targets, maxDist, homeX = null, homeZ = null, homeLeash = Infinity) {
    if (!targets) return null;
    const pos = p.rig.group.position;
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < targets.length; i++) {
      const other = targets[i];
      if (!other || other.dead) continue;
      if (other.faction === 'raider') continue;
      if (homeX != null && Math.hypot(other.x - homeX, other.z - homeZ) > homeLeash) continue;
      const dx = other.x - pos.x;
      const dz = other.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }

  /** World raiders guard a site. They do not loot the player's camp unless spawned as a raid. */
  updateGuard(p, dt, player, targets) {
    const pos = p.rig.group.position;
    let moving = false;
    const startX = pos.x;
    const startZ = pos.z;

    if (!p.alerted && !p.returning) {
      const seen = this.nearestTarget(p, targets, p.aggro);
      if (seen) {
        this.alertGroup(p.groupId);
        p.alerted = true;
      } else {
        p.wanderTimer -= dt;
        if (p.wanderTimer <= 0) {
          p.wanderTimer = this.rng.range(2.5, 6);
          const a = this.rng() * Math.PI * 2;
          const r = this.rng() * 4.5;
          p.wanderX = p.homeX + Math.cos(a) * r;
          p.wanderZ = p.homeZ + Math.sin(a) * r;
        }
        const dx = p.wanderX - pos.x;
        const dz = p.wanderZ - pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) {
          this.moveToward(p, p.wanderX, p.wanderZ, dt, 0.4);
          moving = true;
        } else {
          p.phase += dt * 0.8;
        }
        pos.y = heightAt(pos.x, pos.z);
        this.applyGuardPose(p, dt, moving);
        return;
      }
    }

    if (p.returning) {
      const dh = Math.hypot(p.homeX - pos.x, p.homeZ - pos.z);
      if (dh < 1.2) {
        p.returning = false;
        p.alerted = false;
        p.hp = Math.min(p.maxHp, p.hp + 6 * dt);
        p.aim.target = null;
      } else {
        this.moveToward(p, p.homeX, p.homeZ, dt, 1.0);
        moving = true;
      }
      pos.y = heightAt(pos.x, pos.z);
      this.applyGuardPose(p, dt, moving);
      return;
    }

    let target = p.aim.target;
    if (!target || target.dead) target = null;
    if (target && Math.hypot(target.x - p.homeX, target.z - p.homeZ) > p.leash) target = null;
    if (!target) target = this.nearestTarget(p, targets, Infinity, p.homeX, p.homeZ, p.leash);
    if (!target) {
      p.lostTimer = (p.lostTimer || 0) + dt;
      if (p.lostTimer > 2) {
        p.alerted = false;
        p.returning = true;
        p.lostTimer = 0;
        p.aim.target = null;
      }
    } else {
      p.lostTimer = 0;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      p.heading = Math.atan2(dx, dz);
      if (d > 12) {
        this.moveToward(p, target.x, target.z, dt, 1.05);
        moving = true;
      } else {
        p.phase += dt * 1.1;
        if (p.suppressed <= 0 && p.aim.canFire && p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) {
          this.shoot(p);
        }
      }
      if (Math.hypot(pos.x - p.homeX, pos.z - p.homeZ) > p.leash) {
        p.alerted = false;
        p.returning = true;
        p.aim.target = null;
      }
    }

    pos.y = heightAt(pos.x, pos.z);
    this.applyGuardPose(p, dt, moving);
  }

  applyGuardPose(p, dt, moving) {
    let diff = p.heading - p.rig.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.rig.group.rotation.y += diff * (1 - Math.exp(-8 * dt));
    if (!p.isFar) {
      p.rig.setPose(dt, moving, p.phase);
      p.rig.applyWeaponPose(p.aim.pitch, p.recoil, p.reloadTimer > 0, true);
    }
  }


  startFlee(p) {
    if (p.flee) return;
    p.flee = true;
    p.fleeTimer = 0;
    p.aim.target = null;
  }

  moveToward(p, x, z, dt, speedScale = 1) {
    const pos = p.rig.group.position;
    const dx = x - pos.x;
    const dz = z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return 0;
    const step = Math.min(p.speed * speedScale * dt, d);
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    p.heading = Math.atan2(dx, dz);
    p.phase += dt * (5 + p.speed);
    return d;
  }

  updateFlee(p, dt, player) {
    const pos = p.rig.group.position;
    p.fleeTimer += dt;
    // Run outward, with a little fan-out so the squad does not stack in one line.
    const dx = pos.x - player.x;
    const dz = pos.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    const a = Math.atan2(dx / d, dz / d) + Math.sin(p.jut + p.fleeTimer * 0.7) * 0.35;
    const ex = pos.x + Math.sin(a) * 6;
    const ez = pos.z + Math.cos(a) * 6;
    p.heading = Math.atan2(dx, dz);
    this.moveToward(p, ex, ez, dt, 1.45);
    pos.y = heightAt(pos.x, pos.z);

    // Keep shooting only at a defender close enough to intercept the escape.
    const target = p.aim.target;
    if (target && Math.hypot(target.x - pos.x, target.z - pos.z) <= 9 && p.aim.canFire) {
      if (p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) this.shoot(p);
    }

    if (Math.hypot(pos.x, pos.z) > PLAY_RADIUS - 5 || p.fleeTimer > 30) {
      p.active = false;
      p.dead = true;
      p.target.dead = true;
      p.rig.group.visible = false;
      if (p.farTier) p.farTier.visible = false;
      p.aim.target = null;
      p.aim.canFire = false;
      this.escaped++;
      this.onEscape?.(p.carry || 0);
      return;
    }

    let diff = p.heading - p.rig.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.rig.group.rotation.y += diff * (1 - Math.exp(-8 * dt));
    if (!p.isFar) {
      p.rig.setPose(dt, true, p.phase);
      p.rig.applyWeaponPose(p.aim.pitch, p.recoil, p.reloadTimer > 0, true);
    }
  }

  shoot(p) {
    const pos = p.rig.group.position;
    const shot = this.firearms.fire(
      { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading, faction: 'raider' },
      { weapon: p.weapon, aimPoint: p.aim.targetPoint, damage: p.weapon.damage * (p.damageScale || 1) },
    );
    p.mag--;
    p.cooldown = 60 / p.weapon.rpm;
    p.recoil = 1;
    if (p.mag <= 0) p.reloadTimer = p.weapon.reload;
    if (shot.killed) this.onKill?.(shot.x, shot.z);
  }

  update(dt, time, player, getTargets = null) {
    const targets = getTargets ? getTargets() : null;
    const alive = this.activeCount;
    const heavyLosses = this._waveSize >= 2 && alive > 0 && alive <= Math.floor(this._waveSize * 0.5);
    if (heavyLosses && !this._retreatAnnounced) {
      this._retreatAnnounced = true;
      this.onRetreat?.(alive, this._waveSize);
      for (const p of this.people) if (p.active) this.startFlee(p);
    }

    for (const p of this.people) {
      if (!p.active) continue;
      const pos = p.rig.group.position;
      const toPlayer = Math.hypot(player.x - pos.x, player.z - pos.z);

      if (p.farTier) {
        const wasFar = p.isFar;
        p.isFar = toPlayer > (p.isFar ? 20 : 24);
        if (p.isFar !== wasFar) {
          p.rig.mesh.visible = !p.isFar;
          p.farTier.visible = p.isFar;
        }
      }

      p.cooldown = Math.max(0, p.cooldown - dt);
      p.recoil = damp(p.recoil, 0, 12, dt);
      p.suppressed = Math.max(0, p.suppressed - dt);
      if (p.reloadTimer > 0) {
        p.reloadTimer = Math.max(0, p.reloadTimer - dt);
        if (p.reloadTimer === 0) p.mag = p.weapon.magazine;
      }

      p.aimActor.x = pos.x;
      p.aimActor.y = pos.y;
      p.aimActor.z = pos.z;
      p.aimActor.heading = p.rig.group.rotation.y;
      p.aim.update(dt, p.aimActor, this.registry, p.weapon);
      p.raidTime += dt;

      if (!p.raidMode) {
        this.updateGuard(p, dt, player, targets);
        continue;
      }

      if (p.flee) {
        this.updateFlee(p, dt, player);
        continue;
      }

      const startX = pos.x;
      const startZ = pos.z;

      // Only a defender close enough to physically stop the looting draws fire. Distant guards
      // are ignored; this is the difference between a raid and a battle to the death.
      let threat = p.aim.target;
      const threatDist = threat ? Math.hypot(threat.x - pos.x, threat.z - pos.z) : Infinity;
      if (threat && threatDist > 11) threat = null;
      if (threat) {
        p.heading = p.aim.aimYaw;
        p.phase += dt * 1.1;
        p.rig.lookAt(p.aim.targetPoint.x, p.aim.targetPoint.z, dt);
        if (p.suppressed <= 0 && p.aim.canFire && p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) {
          this.shoot(p);
        }
      } else {
        if (!p.loot || !p.loot.built || p.loot.destroyed || p.lootedIds.has(p.loot.id)) {
          p.loot = this.chooseLoot(p);
          p.lootTimer = 0;
        }
        if (!p.loot) {
          this.startFlee(p);
          continue;
        }
        const b = p.loot;
        const dx = b.x - pos.x;
        const dz = b.z - pos.z;
        const bd = Math.hypot(dx, dz) || 1;
        const reach = b.radius + 1.3;
        if (bd > reach) {
          const edgeX = b.x - (dx / bd) * reach;
          const edgeZ = b.z - (dz / bd) * reach;
          this.moveToward(p, edgeX, edgeZ, dt, 1.1);
          p.lootTimer = 0;
        } else {
          p.heading = Math.atan2(dx, dz);
          p.phase += dt * 1.1;
          p.lootTimer += dt;
          if (p.lootTimer >= 2.8) this.takeLoot(p, b);
        }
      }

      pos.y = heightAt(pos.x, pos.z);
      let diff = p.heading - p.rig.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rig.group.rotation.y += diff * (1 - Math.exp(-8 * dt));

      if (!p.isFar) {
        const moved = Math.hypot(pos.x - startX, pos.z - startZ) > 0.002;
        p.rig.setPose(dt, moved, p.phase);
        p.rig.applyWeaponPose(p.aim.pitch, p.recoil, p.reloadTimer > 0, true);
      }
    }
  }
}
