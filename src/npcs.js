import { buildHumanoid, buildSmoothHumanoid } from './character.js';
import { buildSkinnedHumanoid, bakeStatic } from './skinned.js';
import { AimController } from './aim.js';
import { WEAPONS } from './weapons.js';
import { heightAt } from './terrain.js';
import { makeRng, deriveSeed, damp } from './rng.js';

const NAMES = ['MARA', 'SILAS', 'REN', 'ODA', 'JUNO', 'KADE'];

/**
 * Camp survivors. They wander, watch the player, and the first skinned survivor is armed with a
 * pistol and auto-engages hostiles once `attachCombat()` provides the registry and firearms system.
 */
export class CampFolk {
  constructor(scene, count = 3, options = {}) {
    this.people = [];
    this.registry = null;
    this.firearms = null;
    this.onKill = null;
    const style = options.style || 'skinned';
    for (let i = 0; i < count; i++) {
      const seed = deriveSeed(`npc:${i}`);
      const archetype = ['lean', 'stocky', 'tall'][i % 3];
      const armed = i === 0 && style === 'skinned';
      const rigOptions = { castShadow: false, archetype };
      if (armed) rigOptions.equipment = { weapon: 'pistol' };
      const rig =
        style === 'skinned'
          ? buildSkinnedHumanoid(seed, { ...rigOptions, detail: 'low' })
          : style === 'smooth'
            ? buildSmoothHumanoid(seed, { castShadow: false, archetype })
            : buildHumanoid(seed, { castShadow: false, archetype });
      const rng = makeRng(seed ^ 0x51ed270b);

      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 24; tries++) {
        const angle = rng() * Math.PI * 2;
        const radius = rng.range(7, 16);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        if (Math.hypot(x, z) > 6) break;
      }

      rig.group.position.set(x, heightAt(x, z), z);
      rig.group.rotation.y = rng() * Math.PI * 2;
      scene.add(rig.group);

      // Far LOD tier: the whole rig baked into one static mesh. It keeps the silhouette and
      // material but drops the skeleton, skinning and every per-bone gear draw.
      let farTier = null;
      if (style === 'skinned') {
        farTier = bakeStatic(rig);
        if (farTier) {
          farTier.visible = false;
          rig.group.add(farTier);
          rig.onEquipmentChanged = () => {
            const next = bakeStatic(rig);
            if (!next) return;
            farTier.geometry.dispose();
            farTier.geometry = next.geometry;
          };
        }
      }

      const weapon = armed ? WEAPONS.pistol : null;
      this.people.push({
        name: NAMES[i % NAMES.length],
        rig,
        farTier,
        isFar: false,
        rng,
        home: { x, z },
        target: { x, z },
        timer: rng.range(0.5, 3),
        speed: rng.range(0.9, 1.45),
        heading: rig.group.rotation.y,
        phase: rng() * 6.28,
        armed,
        weapon,
        mag: weapon ? weapon.magazine : 0,
        reserve: Infinity,
        reloadTimer: 0,
        cooldown: 0,
        recoil: 0,
        aim: armed
          ? new AimController({
              faction: 'camp',
              firePolicy: 'auto',
              cone: 70,
              turnRate: 360,
              fireGate: 3,
              reaction: 0.25,
              range: weapon.range,
            })
          : null,
        aimActor: { x: 0, y: 0, z: 0, heading: 0 },
      });
    }
  }

  attachCombat({ registry, firearms, onKill }) {
    this.registry = registry;
    this.firearms = firearms;
    this.onKill = onKill || null;
    for (const p of this.people) {
      if (!p.armed || !p.aim) continue;
      p.aim.los = (x1, y1, z1, x2, y2, z2) => firearms.hasLineOfSight(x1, y1, z1, x2, y2, z2);
    }
  }

  update(dt, time, player, buildings = []) {
    for (const p of this.people) {
      const pos = p.rig.group.position;
      const toPlayer = Math.hypot(player.x - pos.x, player.z - pos.z);

      // Hysteresis so a survivor walking along the threshold does not flicker between tiers.
      if (p.farTier) {
        const wasFar = p.isFar;
        p.isFar = toPlayer > (p.isFar ? 20 : 24);
        if (p.isFar !== wasFar) {
          p.rig.mesh.visible = !p.isFar;
          p.farTier.visible = p.isFar;
        }
      }

      if (p.armed) {
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.recoil = damp(p.recoil, 0, 12, dt);
        if (p.reloadTimer > 0) {
          p.reloadTimer = Math.max(0, p.reloadTimer - dt);
          if (p.reloadTimer === 0) p.mag = p.weapon.magazine;
        }
      }

      let moving = false;
      let lookX = pos.x + Math.sin(p.heading);
      let lookZ = pos.z + Math.cos(p.heading);
      let combatTarget = null;

      if (!p.isFar && p.armed && p.aim && this.registry && this.firearms) {
        p.aimActor.x = pos.x;
        p.aimActor.y = pos.y;
        p.aimActor.z = pos.z;
        p.aimActor.heading = p.rig.group.rotation.y;
        p.aim.update(dt, p.aimActor, this.registry, p.weapon);
        combatTarget = p.aim.target;
      }

      if (combatTarget) {
        // Stop, face the target and shoot; the body catches up with the aim yaw.
        p.heading = p.aim.aimYaw;
        lookX = p.aim.targetPoint.x;
        lookZ = p.aim.targetPoint.z;
        p.phase += dt * 1.2;
      } else if (toPlayer < 4.5) {
        p.heading = Math.atan2(player.x - pos.x, player.z - pos.z);
        lookX = player.x;
        lookZ = player.z;
        p.timer = Math.min(p.timer, 1.2);
        p.phase += dt * 0.8;
      } else {
        const dx = p.target.x - pos.x;
        const dz = p.target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.35) {
          const step = Math.min(p.speed * dt, dist);
          const nx = dx / dist;
          const nz = dz / dist;
          pos.x += nx * step;
          pos.z += nz * step;
          p.heading = Math.atan2(nx, nz);
          moving = true;
          p.phase += dt * (5.2 + p.speed);
        } else {
          p.phase += dt * 1.4;
          p.timer -= dt;
          if (p.timer <= 0) {
            p.timer = p.rng.range(3.5, 8);
            for (let tries = 0; tries < 10; tries++) {
              const a = p.rng() * Math.PI * 2;
              const r = p.rng() * 3.2;
              const tx = p.home.x + Math.cos(a) * r;
              const tz = p.home.z + Math.sin(a) * r;
              let blocked = false;
              for (const b of buildings) {
                if (Math.hypot(b.x - tx, b.z - tz) < b.radius + 0.6) {
                  blocked = true;
                  break;
                }
              }
              if (!blocked) {
                p.target.x = tx;
                p.target.z = tz;
                break;
              }
            }
          }
        }
      }

      pos.y = heightAt(pos.x, pos.z);

      let diff = p.heading - p.rig.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rig.group.rotation.y += diff * (1 - Math.exp(-9 * dt));

      if (p.isFar) continue;

      if (combatTarget) p.rig.lookAt(lookX, lookZ, dt);
      else if (toPlayer < 8) p.rig.lookAt(lookX, lookZ, dt);
      else p.rig.head.rotation.y = damp(p.rig.head.rotation.y, 0, 5, dt);

      p.rig.setPose(dt, moving, p.phase);
      if (!combatTarget) p.rig.head.rotation.x = Math.sin(time * 1.3 + p.phase) * 0.012;

      if (p.armed && p.weapon) {
        p.rig.applyWeaponPose(p.aim?.pitch || 0, p.recoil, p.reloadTimer > 0, !!p.weapon.twoHanded);
        if (combatTarget && p.aim.canFire && p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) {
          const shot = this.firearms.fire(
            { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading },
            { weapon: p.weapon, aimPoint: p.aim.targetPoint },
          );
          p.mag--;
          p.cooldown = 60 / p.weapon.rpm;
          p.recoil = 1;
          if (p.mag <= 0) p.reloadTimer = p.weapon.reload;
          if (shot.killed) this.onKill?.(shot.x, shot.z);
        }
      }
    }
  }
}
