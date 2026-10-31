import { makeRng } from './rng.js';

/**
 * Streamed world encounters.
 *
 * The map keeps a list of encounter definitions — wreck camps, ruin nests, bat roosts — but only
 * the groups within the player's load radius are actually spawned. Groups outside the unload radius
 * are returned to their pools. Cleared groups stay cleared for the run.
 */
export class EncounterField {
  constructor({ seed, enemies, raiders, bats, obstacles = [] }) {
    this.rng = makeRng(seed);
    this.enemies = enemies;
    this.raiders = raiders;
    this.bats = bats;
    this.obstacles = obstacles;
    this.groups = [];
    this.active = new Map();
    this.cleared = new Set();
    this.loadRadius = 165;
    this.unloadRadius = 220;
    this.maxActive = 8;
    this.tick = 0;
  }

  build(count = 56) {
    this.groups.length = 0;
    const rng = this.rng;

    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      let placed = false;
      for (let tries = 0; tries < 30; tries++) {
        const a = rng() * Math.PI * 2;
        const r = rng.range(40, 380);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r || 0.5) + 3)) continue;
        if (this.groups.some((g) => Math.hypot(g.x - x, g.z - z) < 24)) continue;
        placed = true;
        break;
      }
      if (!placed) continue;

      let type = 'ghouls';
      const roll = rng();
      if (roll < 0.58) type = 'ghouls';
      else if (roll < 0.78) type = 'raiders';
      else type = 'bats';

      const distance = Math.hypot(x, z);
      const level = 1 + Math.min(3, Math.floor(distance / 90));
      const id = `enc:${i}`;
      let members;
      if (type === 'ghouls') members = rng.int(3, 6);
      else if (type === 'raiders') members = rng.int(2, 3);
      else members = rng.int(3, 5);
      this.groups.push({ id, type, x, z, level, members });
    }
    return this.groups;
  }

  countGroup(id) {
    let n = 0;
    for (const e of this.enemies.pool) if (e.active && e.groupId === id) n++;
    for (const p of this.raiders.people) if (p.active && p.groupId === id) n++;
    for (const b of this.bats.pool) if (b.active && b.groupId === id) n++;
    return n;
  }

  spawnDefinition(def) {
    if (def.type === 'ghouls') {
      return this.enemies.spawn(def.members, def.x, def.z, 4, {
        groupId: def.id,
        homeX: def.x,
        homeZ: def.z,
        aggro: 11,
        leash: 36,
        level: def.level,
        raidMode: false,
      });
    }
    if (def.type === 'raiders') {
      return this.raiders.spawnWave(def.members, def.x, def.z, 2, {
        groupId: def.id,
        homeX: def.x,
        homeZ: def.z,
        aggro: 13,
        leash: 34,
        level: def.level,
        raidMode: false,
      });
    }
    return this.bats.spawn(def.members, def.x, def.z, 5, {
      groupId: def.id,
      homeX: def.x,
      homeZ: def.z,
      aggro: 10,
      leash: 30,
      level: def.level,
      raidMode: false,
    });
  }

  deactivate(id) {
    this.enemies.despawnGroup(id);
    this.raiders.despawnGroup(id);
    this.bats.despawnGroup(id);
  }

  update(dt, x, z) {
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.8;

    for (const [id, def] of [...this.active]) {
      const alive = this.countGroup(id);
      if (!alive) {
        this.cleared.add(id);
        this.active.delete(id);
        continue;
      }
      if (Math.hypot(def.x - x, def.z - z) > this.unloadRadius) {
        this.deactivate(id);
        this.active.delete(id);
      }
    }

    if (this.active.size >= this.maxActive) return;
    const candidates = [];
    for (const def of this.groups) {
      if (this.active.has(def.id) || this.cleared.has(def.id)) continue;
      const d = Math.hypot(def.x - x, def.z - z);
      if (d > this.loadRadius) continue;
      candidates.push({ def, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const { def } of candidates) {
      if (this.active.size >= this.maxActive) break;
      const spawned = this.spawnDefinition(def);
      if (spawned) this.active.set(def.id, def);
    }
  }

  serialize() {
    return { cleared: [...this.cleared] };
  }

  restore(data) {
    this.cleared = new Set(Array.isArray(data?.cleared) ? data.cleared : []);
  }
}
