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
    this.onScrap = null;
    this.onBuildComplete = null;
    this.onBuildingRepaired = null;
    this.scrapField = options.scrapField || null;
    this.dropPoint = options.dropPoint || null;
    this.obstacles = options.obstacles || [];
    this.nav = options.nav || null;
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
        speed: rng.range(1.9, 2.5),
        heading: rig.group.rotation.y,
        phase: rng() * 6.28,
        role: armed ? 'guard' : 'scavenger',
        armed,
        weapon,
        job: null,
        possessed: false,
        carry: 0,
        holdTimer: 0,
        manning: null,
        towerWeapon: null,
        path: null,
        pathIndex: 0,
        pathKey: '',
        pathTimer: 0,
        hp: 100,
        maxHp: 100,
        dead: false,
        respawnTimer: 0,
        mag: weapon ? weapon.magazine : 0,
        reserve: Infinity,
        reloadTimer: 0,
        cooldown: 0,
        recoil: 0,
        aim: armed
          ? new AimController({
              faction: 'camp',
              firePolicy: 'auto',
              cone: 180,
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

  issueJob(person, job) {
    if (!person || person.dead) return false;
    if (person.manning && job?.type !== 'man') this.releaseTower(person);
    person.job = job;
    person.holdTimer = 0;
    person.path = null;
    person.pathIndex = 0;
    person.pathKey = '';
    person.pathTimer = 0;
    if (person.aim) person.aim.setLock(job?.type === 'attack' ? job.target?.id ?? null : null);
    return true;
  }

  cancelJob(person) {
    if (!person) return;
    person.job = null;
    person.carry = 0;
    person.aim?.setLock(null);
  }

  down(person) {
    if (!person || person.dead) return;
    person.hp = 0;
    person.dead = true;
    person.respawnTimer = 20;
    person.carry = 0;
    person.job = null;
    if (person.manning) {
      person.manning.manned = null;
      person.manning = null;
      person.towerWeapon = null;
      if (person.aim) person.aim.los = person.towerLos || null;
      person.towerLos = null;
    }
    person.possessed = false;
    person.rig.group.visible = false;
    if (person.farTier) person.farTier.visible = false;
    if (person.aim) {
      person.aim.target = null;
      person.aim.canFire = false;
      person.aim.setLock(null);
    }
    this.onDown?.(person.name);
  }

  attachCombat({ registry, firearms, onKill, onDown }) {
    this.registry = registry;
    this.firearms = firearms;
    this.onKill = onKill || null;
    this.onDown = onDown || null;
    for (const p of this.people) {
      if (!p.armed || !p.aim) continue;
      p.aim.los = (x1, y1, z1, x2, y2, z2) => firearms.hasLineOfSight(x1, y1, z1, x2, y2, z2);
    }
  }

  damage(index, amount) {
    const p = this.people[index];
    if (!p || p.dead) return false;
    p.hp -= p.manning ? amount * 0.6 : amount;
    if (p.hp <= 0) {
      this.down(p);
      return true;
    }
    return false;
  }

  mountTower(person, tower) {
    if (!person || !tower || !tower.built || !person.weapon) return false;
    if (tower.manned && tower.manned !== person) return false;
    if (person.manning) this.releaseTower(person);
    tower.manned = person;
    person.manning = tower;
    person.towerWeapon = { ...person.weapon, range: person.weapon.range + 6 };
    person.job = null;
    person.carry = 0;
    person.holdTimer = 0;
    person.phase = 0;
    person.heading = tower.group.rotation.y;
    person.rig.group.rotation.y = person.heading;
    person.rig.group.position.set(tower.x, tower.y + 3.05, tower.z);
    person.rig.mesh.visible = true;
    if (person.farTier) person.farTier.visible = false;
    person.target = { x: tower.x, z: tower.z };
    if (person.aim) {
      person.towerLos = person.aim.los;
      // Start the sight ray outside the tower's own footprint, otherwise the building blocks
      // every shot from the platform at the origin.
      person.aim.los = (x1, y1, z1, x2, y2, z2) => {
        if (!person.towerLos) return true;
        const dx = x2 - x1;
        const dz = z2 - z1;
        const d = Math.hypot(dx, dz) || 1;
        return person.towerLos(x1 + (dx / d) * 2.3, y1, z1 + (dz / d) * 2.3, x2, y2, z2);
      };
      person.aim.setRange(person.towerWeapon.range);
      person.aim.target = null;
      person.aim._initialised = false;
      person.aim.setLock(null);
    }
    this.onTowerManned?.(person, tower);
    return true;
  }

  releaseTower(person) {
    const tower = person?.manning;
    if (!tower) return false;
    tower.manned = null;
    person.manning = null;
    person.towerWeapon = null;
    const x = tower.x + 1.25;
    const z = tower.z + 1.25;
    person.rig.group.position.set(x, heightAt(x, z), z);
    person.heading = Math.atan2(-1, -1);
    person.rig.group.rotation.y = person.heading;
    person.target = { x, z };
    person.timer = 1.6;
    person.holdTimer = 2;
    if (person.aim) {
      person.aim.los = person.towerLos || null;
      person.towerLos = null;
      person.aim.setRange(person.weapon?.range || 22);
      person.aim.target = null;
      person.aim._initialised = false;
      person.aim.setLock(null);
    }
    this.onTowerReleased?.(person, tower);
    return true;
  }

  /** Steer around the nearest obstacle instead of walking into it. */
  steerAround(p, dx, dz, buildings = []) {
    let sx = dx;
    let sz = dz;
    const pos = p.rig.group.position;
    const consider = (ox, oz, or) => {
      const vx = ox - pos.x;
      const vz = oz - pos.z;
      const d = Math.hypot(vx, vz) || 1;
      const radius = (or || 0.5) + 0.45;
      if (d > radius + 1.5) return;
      const ahead = (vx / d) * sx + (vz / d) * sz;
      if (ahead < -0.15) return;
      let tx = -vz / d;
      let tz = vx / d;
      if (tx * sx + tz * sz < 0) {
        tx = -tx;
        tz = -tz;
      }
      const push = 1 - Math.max(0, Math.min(1, (d - radius) / 1.5));
      sx += tx * push * 1.5 + (vx / d) * push * 0.25;
      sz += tz * push * 1.5 + (vz / d) * push * 0.25;
    };
    for (const b of buildings) consider(b.x, b.z, b.radius);
    for (const o of this.obstacles) consider(o.x, o.z, o.r || 0.5);
    const len = Math.hypot(sx, sz) || 1;
    return { x: sx / len, z: sz / len };
  }

  /** Keep units out of buildings and props. Direct steering slides along the boundary. */
  resolveCollisions(p, buildings = []) {
    const pos = p.rig.group.position;
    const push = (ox, oz, r) => {
      const dx = pos.x - ox;
      const dz = pos.z - oz;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001 && d < r) {
        pos.x = ox + (dx / d) * r;
        pos.z = oz + (dz / d) * r;
      }
    };
    for (const b of buildings) push(b.x, b.z, b.radius + 0.4);
    for (const o of this.obstacles) push(o.x, o.z, (o.r || 0.5) + 0.4);
  }

  /**
   * Run one job step. Returns a world point to walk toward, or null when the unit should hold
   * position (harvesting, aiming, arriving). Combat keeps priority: the caller only runs this when
   * the unit has no auto-acquired target.
   */
  /** A point near the target with line of sight, used when a wall or rock blocks the direct line. */
  findFiringPosition(p, t, buildings = []) {
    const pos = p.rig.group.position;
    const los = p.aim?.los;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + p.rng() * 0.35;
      const r = 6 + p.rng() * 4;
      const x = t.x + Math.cos(a) * r;
      const z = t.z + Math.sin(a) * r;
      const y = heightAt(x, z);
      let blocked = false;
      for (const b of buildings) {
        if (Math.hypot(b.x - x, b.z - z) < b.radius + 0.6) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (los && !los(x, y + 1.25, z, t.x, t.y + 1.0, t.z)) continue;
      const score = Math.hypot(x - pos.x, z - pos.z);
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    return best || { x: t.x, z: t.z };
  }

  updateJob(p, dt, time, buildings = []) {
    const j = p.job;
    if (!j) return null;
    const pos = p.rig.group.position;
    const distTo = (x, z) => Math.hypot(x - pos.x, z - pos.z);

    if (j.type === 'move') {
      if (distTo(j.x, j.z) < 0.6) {
        p.job = null;
        p.holdTimer = 4 + Math.random() * 3;
        return null;
      }
      return { x: j.x, z: j.z };
    }

    if (j.type === 'gather') {
      const field = this.scrapField;
      const node = field?.nodes[j.node];
      if (!node) {
        p.job = null;
        return null;
      }
      if (j.phase === 'toNode') {
        if (!node.active) {
          p.job = null;
          return null;
        }
        if (distTo(node.x, node.z) < 2.2) {
          j.phase = 'harvest';
          j.timer = 1.2;
          return null;
        }
        return { x: node.x, z: node.z };
      }
      if (j.phase === 'harvest') {
        j.timer -= dt;
        if (j.timer <= 0) {
          const value = field.gather(j.node, time);
          if (!value) {
            p.job = null;
            return null;
          }
          p.carry = value;
          j.phase = 'return';
        }
        return null;
      }
      if (j.phase === 'return') {
        const drop = this.dropPoint ? this.dropPoint(p) : { x: 0, z: 0, radius: 2.4 };
        if (distTo(drop.x, drop.z) < (drop.radius || 2.4)) {
          j.retry = Math.max(0, (j.retry || 0) - dt);
          if (j.retry > 0) return null;
          const accepted = this.onScrap?.(p.carry || 0, p);
          if (accepted === false) {
            // Storage is full: wait at the drop instead of throwing the load away.
            j.retry = 2;
            return null;
          }
          p.carry = 0;
          if (node.active) {
            j.phase = 'toNode';
            j.timer = 0;
          } else {
            p.job = null;
          }
          return null;
        }
        return { x: drop.x, z: drop.z };
      }
      return null;
    }

    if (j.type === 'repair') {
      const b = j.building;
      if (!b || !b.built || b.destroyed || b.hp >= b.maxHp) {
        p.job = null;
        return null;
      }
      if (distTo(b.x, b.z) > b.radius + 1.5) return { x: b.x, z: b.z };
      b.hp = Math.min(b.maxHp, b.hp + dt * 14);
      if (b.hp >= b.maxHp) {
        p.job = null;
        p.holdTimer = 2;
        this.onBuildingRepaired?.(b);
      }
      return null;
    }

    if (j.type === 'build') {
      const b = j.building;
      if (!b || b.built) {
        p.job = null;
        return null;
      }
      if (distTo(b.x, b.z) > b.radius + 1.5) {
        return { x: b.x, z: b.z };
      }
      b.buildProgress = Math.min(1, (b.buildProgress || 0) + dt / Math.max(0.5, b.buildTime));
      if (b.buildProgress >= 1) {
        p.job = null;
        p.holdTimer = 2;
        this.onBuildComplete?.(b);
      }
      return null;
    }

    if (j.type === 'man') {
      const tower = j.tower;
      if (!p.weapon) {
        p.job = null;
        return null;
      }
      if (!tower || !tower.built || (tower.manned && tower.manned !== p)) {
        p.job = null;
        return null;
      }
      if (distTo(tower.x, tower.z) < 3.0) {
        this.mountTower(p, tower);
        return null;
      }
      return { x: tower.x, z: tower.z };
    }

    if (j.type === 'attack') {
      const t = j.target;
      if (!t || t.dead) {
        p.job = null;
        p.holdTimer = 4 + Math.random() * 3;
        p.aim?.setLock(null);
        return null;
      }
      p.aim?.setLock(t.id);
      const range = Math.max(2, (p.weapon?.range ?? 2) * 0.72);
      let los = true;
      if (p.aim?.los) {
        los = p.aim.los(pos.x, pos.y + 1.25, pos.z, t.x, t.y + 1.0, t.z);
      }
      if (distTo(t.x, t.z) > range) {
        j.flank = null;
        return { x: t.x, z: t.z };
      }
      if (!los) {
        j.flankTimer = (j.flankTimer || 0) - dt;
        if (!j.flank || j.flankTimer <= 0) {
          j.flank = this.findFiringPosition(p, t, buildings);
          j.flankTimer = 2.5;
        }
        return j.flank;
      }
      j.flank = null;
      return null;
    }

    return null;
  }

  /** A gunner on the watchtower: fixed position, +6 m range, 40% cover. */
  updateManning(p, dt) {
    const tower = p.manning;
    const pos = p.rig.group.position;
    pos.set(tower.x, tower.y + 3.05, tower.z);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.recoil = damp(p.recoil, 0, 12, dt);
    if (p.reloadTimer > 0) {
      p.reloadTimer = Math.max(0, p.reloadTimer - dt);
      if (p.reloadTimer === 0) p.mag = p.weapon.magazine;
    }

    let combatTarget = null;
    if (p.armed && p.aim && this.registry && this.firearms) {
      p.aimActor.x = pos.x;
      p.aimActor.y = pos.y;
      p.aimActor.z = pos.z;
      p.aimActor.heading = p.rig.group.rotation.y;
      p.aim.update(dt, p.aimActor, this.registry, p.towerWeapon || p.weapon);
      combatTarget = p.aim.target;
    }

    if (combatTarget) {
      p.heading = p.aim.aimYaw;
      p.rig.lookAt(p.aim.targetPoint.x, p.aim.targetPoint.z, dt);
    } else {
      p.heading = tower.group.rotation.y;
    }
    let diff = p.heading - p.rig.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.rig.group.rotation.y += diff * (1 - Math.exp(-9 * dt));
    p.phase += dt * 1.2;
    p.rig.setPose(dt, false, p.phase);
    if (p.armed) {
      p.rig.applyWeaponPose(p.aim?.pitch || 0, p.recoil, p.reloadTimer > 0, !!p.weapon.twoHanded);
      if (combatTarget && p.aim.canFire && p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) {
        const shot = this.firearms.fire(
          { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading, faction: 'camp' },
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

  update(dt, time, player, buildings = []) {
    for (const p of this.people) {
      if (p.possessed) continue;
      if (p.manning) {
        this.updateManning(p, dt);
        continue;
      }
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

      if (p.dead) {
        p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.respawnTimer === 0) {
          p.dead = false;
          p.hp = p.maxHp;
          p.isFar = false;
          p.possessed = false;
          p.job = null;
          p.carry = 0;
          p.aim?.setLock(null);
          pos.set(p.home.x, heightAt(p.home.x, p.home.z), p.home.z);
          p.rig.group.visible = true;
          p.rig.mesh.visible = true;
          if (p.farTier) p.farTier.visible = false;
          p.heading = p.rng() * Math.PI * 2;
          p.rig.group.rotation.y = p.heading;
          if (p.aim) p.aim.target = null;
          if (p.weapon) {
            p.mag = p.weapon.magazine;
            p.reloadTimer = 0;
            p.cooldown = 0;
            p.recoil = 0;
          }
        }
        continue;
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

      // An explicit move/gather order wins over auto-defend: a survivor carrying scrap should not
      // stop every two metres to trade shots. Attack jobs still use the aim controller.
      const ordered = !!p.job && p.job.type !== 'attack';
      if (!p.isFar && p.armed && p.aim && this.registry && this.firearms && !ordered) {
        p.aimActor.x = pos.x;
        p.aimActor.y = pos.y;
        p.aimActor.z = pos.z;
        p.aimActor.heading = p.rig.group.rotation.y;
        p.aim.update(dt, p.aimActor, this.registry, p.weapon);
        combatTarget = p.aim.target;
      }

      const jobTarget = combatTarget ? null : this.updateJob(p, dt, time, buildings);
      const jobActive = !!p.job;

      if (combatTarget) {
        // Stop, face the target and shoot; the body catches up with the aim yaw.
        p.heading = p.aim.aimYaw;
        lookX = p.aim.targetPoint.x;
        lookZ = p.aim.targetPoint.z;
        p.phase += dt * 1.2;
      } else if (jobTarget) {
        let tx = jobTarget.x;
        let tz = jobTarget.z;
        const type = p.job?.type;
        if (this.nav && (type === 'move' || type === 'gather' || type === 'build' || type === 'repair' || type === 'man')) {
          const key = `${Math.round(jobTarget.x * 2)}:${Math.round(jobTarget.z * 2)}`;
          p.pathTimer -= dt;
          if (p.pathKey !== key || p.pathTimer <= 0) {
            p.path = this.nav.path(pos.x, pos.z, jobTarget.x, jobTarget.z);
            p.pathIndex = 0;
            p.pathKey = key;
            p.pathTimer = 2.5;
          }
          while (
            p.path &&
            p.pathIndex < p.path.length &&
            Math.hypot(p.path[p.pathIndex].x - pos.x, p.path[p.pathIndex].z - pos.z) < 0.55
          ) {
            p.pathIndex++;
          }
          if (p.path && p.pathIndex < p.path.length) {
            tx = p.path[p.pathIndex].x;
            tz = p.path[p.pathIndex].z;
          }
        }
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const dist = Math.hypot(dx, dz) || 1;
        const step = Math.min(p.speed * dt, dist);
        const dir = this.steerAround(p, dx / dist, dz / dist, buildings);
        pos.x += dir.x * step;
        pos.z += dir.z * step;
        p.heading = Math.atan2(dir.x, dir.z);
        moving = true;
        p.phase += dt * (5.2 + p.speed);
      } else if (jobActive) {
        // Holding: harvesting, waiting for a reload, or standing at firing range. Face the work.
        const j = p.job;
        if (j?.type === 'attack' && j.target) {
          p.heading = Math.atan2(j.target.x - pos.x, j.target.z - pos.z);
          lookX = j.target.x;
          lookZ = j.target.z;
        } else if (j?.type === 'gather') {
          const node = this.scrapField?.nodes[j.node];
          if (node) {
            p.heading = Math.atan2(node.x - pos.x, node.z - pos.z);
            lookX = node.x;
            lookZ = node.z;
          }
        } else if ((j?.type === 'build' || j?.type === 'repair') && j.building) {
          p.heading = Math.atan2(j.building.x - pos.x, j.building.z - pos.z);
          lookX = j.building.x;
          lookZ = j.building.z;
        }
        p.phase += dt * 1.2;
      } else if (toPlayer < 4.5) {
        p.heading = Math.atan2(player.x - pos.x, player.z - pos.z);
        lookX = player.x;
        lookZ = player.z;
        p.timer = Math.min(p.timer, 1.2);
        p.phase += dt * 0.8;
      } else if (p.holdTimer > 0) {
        p.holdTimer = Math.max(0, p.holdTimer - dt);
        p.phase += dt * 1.2;
      } else {
        const dx = p.target.x - pos.x;
        const dz = p.target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.35) {
          const step = Math.min(p.speed * dt, dist);
          const dir = this.steerAround(p, dx / dist, dz / dist, buildings);
          pos.x += dir.x * step;
          pos.z += dir.z * step;
          p.heading = Math.atan2(dir.x, dir.z);
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

      this.resolveCollisions(p, buildings);
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
            { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading, faction: 'camp' },
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
