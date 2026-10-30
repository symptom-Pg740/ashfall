import { buildSkinnedHumanoid, bakeStatic } from './skinned.js';
import { AimController } from './aim.js';
import { WEAPONS } from './weapons.js';
import { heightAt, PLAY_RADIUS } from './terrain.js';
import { deriveSeed, makeRng, damp } from './rng.js';
import { shortestAngle } from './actors.js';

const POOL = 3;

/**
 * Hostile rifle raiders. They spawn at the edge of the camp, close to rifle range, auto-aim and
 * fire through the same AimController/Firearms path as the player and camp guard. The near rig is
 * skinned; a baked static tier covers the approach.
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
    this.baseAngle = this.rng() * Math.PI * 2;

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
      const target = {
        id: `raider:${i}`,
        faction: 'hostile',
        kind: 'raider',
        x: 0, y: 0, z: 0,
        hp: 46, maxHp: 46,
        radius: 0.38,
        height: 1.8,
        dead: true,
        ref: i,
        hit: (damage, fromX, fromZ, knock) => this.damage(i, damage),
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
          faction: 'hostile',
          firePolicy: 'auto',
          cone: 70,
          turnRate: 320,
          fireGate: 3,
          reaction: 0.35,
          range: weapon.range,
        }),
        aimActor: { x: 0, y: 0, z: 0, heading: 0 },
        heading: 0,
        isFar: true,
        speed: rng.range(1.25, 1.6),
        phase: rng() * 6.28,
        reposition: null,
        repositionTimer: 0,
        suppressed: 0,
        objective: null,
        seekingCover: false,
        slotAngle: (i / POOL) * Math.PI * 2,
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

  spawnWave(count, aroundX, aroundZ, distance = 30) {
    let spawned = 0;
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
      p.hp = p.maxHp;
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
      p.reposition = null;
      p.repositionTimer = 0;
      p.suppressed = 0;
      p.seekingCover = false;
      p.objective = null;
      spawned++;
    }
    return spawned;
  }

  forEachTarget(cb) {
    for (const p of this.people) {
      if (!p.active || p.dead) continue;
      const t = p.target;
      t.x = p.rig.group.position.x;
      t.y = p.rig.group.position.y;
      t.z = p.rig.group.position.z;
      t.hp = p.hp;
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
    // Hit but alive: flinch into a new firing position and hold fire briefly.
    p.suppressed = 1.5;
    p.reposition = null;
    p.repositionTimer = 0;
    return false;
  }

  get activeCount() {
    return this.people.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }

  findFiringPosition(p, player) {
    if (!this.firearms) return null;
    const pos = p.rig.group.position;
    const approach = Math.atan2(pos.z - player.z, pos.x - player.x);
    // Squad spread: each raider prefers its own slice of the circle around the player.
    const slot = this.baseAngle + p.slotAngle;
    const base = approach + shortestAngle(approach, slot) * 0.6;
    const eyeY = player.pos.y + 1.25;
    for (let i = 0; i < 12; i++) {
      const a = base + (this.rng() * 2 - 1) * Math.PI * 0.75;
      const r = 9 + this.rng() * 6;
      const x = player.x + Math.cos(a) * r;
      const z = player.z + Math.sin(a) * r;
      const y = heightAt(x, z);
      if (this.firearms.hasLineOfSight(x, y + 1.45, z, player.x, eyeY, player.z)) {
        return { x, z };
      }
    }
    // Fallback: swing wide to one side and try again from there.
    const a = base + (this.rng() < 0.5 ? 1 : -1) * Math.PI * 0.5;
    const r = 10 + this.rng() * 4;
    return { x: player.x + Math.cos(a) * r, z: player.z + Math.sin(a) * r };
  }

  /** A point that breaks line of sight to the player, used while reloading. */
  findCoverPosition(p, player) {
    if (!this.firearms) return null;
    const pos = p.rig.group.position;
    const eyeY = player.pos.y + 1.25;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 8 + this.rng() * 8;
      const x = player.x + Math.cos(a) * r;
      const z = player.z + Math.sin(a) * r;
      const y = heightAt(x, z);
      if (this.firearms.hasLineOfSight(x, y + 1.45, z, player.x, eyeY, player.z)) continue;
      const travel = Math.hypot(x - pos.x, z - pos.z);
      // Close cover beats a long run, and ~12 m keeps the player in rifle range.
      const score = -travel * 0.18 - Math.abs(r - 12) * 0.08 + this.rng() * 0.7;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    return best || this.findFiringPosition(p, player);
  }

  chooseObjective(p) {
    const buildings = this.settlement?.buildings || [];
    const pos = p.rig.group.position;
    let best = null;
    let bestScore = Infinity;
    for (const b of buildings) {
      if (!b.built || b.destroyed) continue;
      const d = Math.hypot(b.x - pos.x, b.z - pos.z);
      let priority = 4;
      if (b.type === 'warehouse') priority = 30;
      else if (b.def?.power) priority = 26;
      else if (b.type === 'turret' || b.type === 'tower') priority = 22;
      else if (b.type === 'campfire') priority = 12;
      const score = d - priority;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  shootBuilding(p) {
    const b = p.objective;
    if (!b || !b.built || b.destroyed) return;
    const pos = p.rig.group.position;
    const shot = this.firearms.fire(
      { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading, faction: 'hostile' },
      { weapon: p.weapon, aimPoint: { x: b.x, y: b.y + 1.0, z: b.z } },
    );
    p.mag--;
    p.cooldown = 60 / p.weapon.rpm;
    p.recoil = 1;
    if (p.mag <= 0) p.reloadTimer = p.weapon.reload;
    this.settlement?.damageBuilding(b, 14);
    if (shot.killed) this.onKill?.(shot.x, shot.z);
  }

  shoot(p) {
    const pos = p.rig.group.position;
    const shot = this.firearms.fire(
      { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading, faction: 'hostile' },
      { weapon: p.weapon, aimPoint: p.aim.targetPoint },
    );
    p.mag--;
    p.cooldown = 60 / p.weapon.rpm;
    p.recoil = 1;
    if (p.mag <= 0) p.reloadTimer = p.weapon.reload;
    if (shot.killed) this.onKill?.(shot.x, shot.z);
  }

  update(dt, time, player) {
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
      if (p.reloadTimer > 0) {
        p.reloadTimer = Math.max(0, p.reloadTimer - dt);
        if (p.reloadTimer === 0) {
          p.mag = p.weapon.magazine;
          p.seekingCover = false;
        } else if (!p.seekingCover) {
          // Reloading in the open is a death sentence: step behind something until the mag is in.
          p.seekingCover = true;
          p.reposition = this.findCoverPosition(p, player);
          p.repositionTimer = p.weapon.reload + 0.4;
        }
      }

      p.aimActor.x = pos.x;
      p.aimActor.y = pos.y;
      p.aimActor.z = pos.z;
      p.aimActor.heading = p.rig.group.rotation.y;
      p.aim.update(dt, p.aimActor, this.registry, p.weapon);

      p.suppressed = Math.max(0, p.suppressed - dt);

      if (!p.objective || p.objective.destroyed || !p.objective.built) {
        p.objective = this.chooseObjective(p);
      }
      let target = p.aim.target;
      // Raiders are on a mission: they only break off for a unit that is close enough to threaten
      // them. A gunner in a distant guard post can therefore keep shooting while they work.
      if (target && p.objective) {
        const td = Math.hypot(target.x - pos.x, target.z - pos.z);
        if (td > 14) target = null;
      }
      const obj = target ? null : p.objective;
      let moving = false;
      if (target && !p.reposition) {
        p.heading = p.aim.aimYaw;
        p.repositionTimer = 0;
        p.phase += dt * 1.2;
      } else {
        const dx = player.x - pos.x;
        const dz = player.z - pos.z;
        const dist = Math.hypot(dx, dz) || 1;
        p.repositionTimer = Math.max(0, p.repositionTimer - dt);

        if (!p.reposition && p.suppressed > 0) {
          p.reposition = this.findFiringPosition(p, player);
          p.repositionTimer = 1.6;
        }

        if (p.reposition) {
          const rx = p.reposition.x - pos.x;
          const rz = p.reposition.z - pos.z;
          const rd = Math.hypot(rx, rz);
          if (rd > 0.6 && p.repositionTimer > 0) {
            const step = Math.min(p.speed * dt, rd);
            pos.x += (rx / rd) * step;
            pos.z += (rz / rd) * step;
            p.heading = Math.atan2(rx, rz);
            moving = true;
            p.phase += dt * (5 + p.speed);
          } else {
            p.reposition = null;
            p.repositionTimer = 0;
          }
        } else if (obj) {
          const bx = obj.x - pos.x;
          const bz = obj.z - pos.z;
          const bd = Math.hypot(bx, bz) || 1;
          const edgeX = obj.x + ((pos.x - obj.x) / bd) * (obj.radius + 0.7);
          const edgeZ = obj.z + ((pos.z - obj.z) / bd) * (obj.radius + 0.7);
          const los = this.firearms
            ? this.firearms.hasLineOfSight(pos.x, pos.y + 1.25, pos.z, edgeX, obj.y + 1.0, edgeZ)
            : true;
          p.heading = Math.atan2(bx, bz);
          if (bd > 10.5 || !los) {
            const step = Math.min(p.speed * dt, Math.max(0, bd - 8));
            pos.x += (bx / bd) * step;
            pos.z += (bz / bd) * step;
            moving = true;
            p.phase += dt * (5 + p.speed);
          } else {
            p.phase += dt * 1.2;
            if (p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) this.shootBuilding(p);
          }
        } else if (dist > 18) {
          const step = Math.min(p.speed * dt, dist - 18);
          pos.x += (dx / dist) * step;
          pos.z += (dz / dist) * step;
          p.heading = Math.atan2(dx, dz);
          moving = true;
          p.phase += dt * (5 + p.speed);
        } else {
          // In range but no line of sight: move to a firing position around the player.
          p.repositionTimer = 4.5 + this.rng() * 2;
          p.reposition = this.findFiringPosition(p, player);
          p.heading = Math.atan2(dx, dz);
          p.phase += dt * 1.2;
        }
      }

      pos.y = heightAt(pos.x, pos.z);
      let diff = p.heading - p.rig.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rig.group.rotation.y += diff * (1 - Math.exp(-8 * dt));

      if (!p.isFar) {
        p.rig.setPose(dt, moving, p.phase);
        p.rig.applyWeaponPose(p.aim.pitch, p.recoil, p.reloadTimer > 0, true);
      }

      if (target && p.suppressed <= 0 && p.aim.canFire && p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) {
        this.shoot(p);
      }
    }
  }
}
