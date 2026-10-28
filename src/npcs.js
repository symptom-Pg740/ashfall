import { buildHumanoid, buildSmoothHumanoid } from './character.js';
import { buildSkinnedHumanoid, bakeStatic } from './skinned.js';
import { heightAt } from './terrain.js';
import { makeRng, deriveSeed, damp } from './rng.js';

const NAMES = ['MARA', 'SILAS', 'REN', 'ODA', 'JUNO', 'KADE'];

/**
 * A handful of generated camp survivors. They idle, wander around their home spot, turn to look at
 * the player when close, and avoid walking into player-built structures.
 */
export class CampFolk {
  constructor(scene, count = 3, options = {}) {
    this.people = [];
    const style = options.style || 'skinned';
    for (let i = 0; i < count; i++) {
      const seed = deriveSeed(`npc:${i}`);
      const archetype = ['lean', 'stocky', 'tall'][i % 3];
      const rig =
        style === 'skinned'
          ? buildSkinnedHumanoid(seed, { castShadow: false, archetype, detail: 'low' })
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
          // A wardrobe change has to be reflected in the baked far tier too.
          rig.onEquipmentChanged = () => {
            const next = bakeStatic(rig);
            if (!next) return;
            farTier.geometry.dispose();
            farTier.geometry = next.geometry;
          };
        }
      }

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
      });
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

      let moving = false;
      let lookX = pos.x + Math.sin(p.heading);
      let lookZ = pos.z + Math.cos(p.heading);

      if (toPlayer < 4.5) {
        // Stop, face the player and watch them.
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

      // Face travel / player, then settle the head.
      let diff = p.heading - p.rig.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rig.group.rotation.y += diff * (1 - Math.exp(-9 * dt));

      if (p.isFar) continue;

      if (toPlayer < 8) p.rig.lookAt(lookX, lookZ, dt);
      else p.rig.head.rotation.y = damp(p.rig.head.rotation.y, 0, 5, dt);

      p.rig.setPose(dt, moving, p.phase);
      p.rig.head.rotation.x = Math.sin(time * 1.3 + p.phase) * 0.012;
    }
  }
}
