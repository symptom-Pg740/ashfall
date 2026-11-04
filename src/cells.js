import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { ghoulGeometry } from './enemies.js';
import { makeRng, deriveSeed } from './rng.js';
import { box, cyl, dodeca, merge } from './geo.js';

/**
 * Expedition cells.
 *
 * Caves are no longer entered by a possessed avatar. A team walks out on an expedition, and when
 * it arrives the overworld is hidden and a runtime-generated interior is built here: floor, walls,
 * cover, a cache and a hostile pack. The player keeps commanding the same survivors with the same
 * tap orders. Clearing the pack unlocks the cache; leaving returns the team and its loot to camp.
 *
 * The old cave entrances remain as expedition destinations on the world map.
 */

const CELL_X = 520;
const CELL_Z = 0;
const HALF = 13;

function caveMouthGeometry() {
  const p = [];
  p.push(dodeca(2.6, '#6f5b48', 0, 1.25, 0, 0, 0.3, 0, 1.3, 0.9));
  p.push(dodeca(1.7, '#5b4a3b', -1.8, 0.8, 0.5, 0.2, 0.9, 0.1, 1.1, 0.8));
  p.push(dodeca(1.4, '#7c6550', 1.7, 0.65, 0.6, 0.1, 0.4, 0.3, 0.9, 0.7));
  p.push(box(1.5, 2.3, 0.8, '#17130f', 0, 1.15, 0.2));
  p.push(box(0.35, 2.7, 0.6, '#4e3f33', -0.95, 1.35, 0.25, 0, 0, -0.1));
  p.push(box(0.35, 2.5, 0.6, '#4e3f33', 0.95, 1.25, 0.25, 0, 0, 0.1));
  p.push(cyl(0.05, 0.05, 1.8, 4, '#3d3027', -1.25, 2.0, 0.35, 0.25, 0, 0.2));
  p.push(cyl(0.05, 0.05, 1.6, 4, '#3d3027', 1.25, 1.9, 0.35, 0.25, 0, -0.2));
  return merge(p);
}

export class CellSystem {
  constructor({
    scene,
    terrainChunks,
    wasteland,
    settlement,
    scrapField,
    campFolk,
    enemies,
    raiders,
    bats,
    ui,
    obstacles,
    seed = deriveSeed('cells'),
  }) {
    this.scene = scene;
    this.terrainChunks = terrainChunks;
    this.wasteland = wasteland;
    this.settlement = settlement;
    this.scrapField = scrapField;
    this.campFolk = campFolk;
    this.enemies = enemies;
    this.raiders = raiders;
    this.bats = bats;
    this.ui = ui;
    this.rng = makeRng(seed);
    this.entrances = [];
    this.clearedCaves = new Set();
    this.active = null;
    this.cleared = false;
    this.looted = false;
    this.wiped = false;
    this.onBite = null;
    this.onLoot = null;

    this.floorY = heightAt(CELL_X, CELL_Z) + 0.02;
    this.group = new THREE.Group();
    this.group.position.set(CELL_X, this.floorY, CELL_Z);
    this.group.visible = false;
    this.scene.add(this.group);
    this.arena = null;
    this.mobs = [];
    this.mobMesh = null;

    this.buildEntrances(obstacles || []);
  }

  buildEntrances(obstacles) {
    const geo = caveMouthGeometry();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const rng = this.rng;
    const angles = [0.7, 2.45, 4.4];
    for (let i = 0; i < angles.length; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 14; tries++) {
        const a = angles[i] + rng.range(-0.3, 0.3);
        const r = rng.range(95, 170);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r || 0.5) + 4)) continue;
        break;
      }
      const y = heightAt(x, z);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = Math.atan2(-x, -z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.24, 0),
        new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.9, toneMapped: false }),
      );
      marker.position.set(x, y + 3.1, z);
      this.scene.add(marker);
      this.entrances.push({ id: `cave:${i}`, x, z, y, group: mesh, marker });
      obstacles.push({ x, z, r: 2.0 });
    }
  }

  // -------------------------------------------------------------------------
  // runtime arena
  // -------------------------------------------------------------------------

  clearArena() {
    if (this.arena) {
      this.group.remove(this.arena);
      this.arena.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.arena = new THREE.Group();
    this.group.add(this.arena);
    if (this.mobMesh) {
      this.group.remove(this.mobMesh);
      this.mobMesh.geometry.dispose();
      this.mobMesh.material.dispose();
      this.mobMesh = null;
    }
    this.mobs.length = 0;
  }

  buildArena(seed, danger) {
    this.clearArena();
    const rng = makeRng(seed);
    const arena = this.arena;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0x4a3d31, flatShading: true }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    arena.add(floor);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x5b4a3b, flatShading: true });
    const wallDark = new THREE.MeshLambertMaterial({ color: 0x45382d, flatShading: true });
    const walls = [
      [HALF * 2 + 1, 4.6, 1, 0, 2.3, -HALF, wallDark],
      [HALF * 2 + 1, 4.6, 1, 0, 2.3, HALF, wallMat],
      [1, 4.6, HALF * 2 + 1, -HALF, 2.3, 0, wallMat],
      [1, 4.6, HALF * 2 + 1, HALF, 2.3, 0, wallDark],
    ];
    for (const [w, h, d, x, y, z, m] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      arena.add(wall);
    }

    // Seeded cover: broken pillars, rubble and a few low walls. The layout changes per expedition.
    const cover = [];
    const pieces = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < pieces; i++) {
      const x = rng.range(-HALF + 2.5, HALF - 2.5);
      const z = rng.range(-HALF + 2.5, HALF - 2.5);
      if (Math.hypot(x, z) < 4) continue;
      if (Math.hypot(x - (HALF - 2.5), z - (HALF - 2.5)) < 3.5) continue;
      const s = rng.range(0.7, 1.35);
      if (rng() < 0.55) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * s, 0.8 * s, 3.2 * s, 7), wallDark);
        pillar.position.set(x, 1.6 * s, z);
        pillar.rotation.z = (x + z) * 0.01;
        pillar.castShadow = true;
        arena.add(pillar);
      } else {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 * s, 0), wallMat);
        rock.position.set(x, 0.4 * s, z);
        rock.rotation.set(rng() * 2, rng() * 6, rng() * 2);
        rock.castShadow = true;
        arena.add(rock);
      }
      cover.push({ x: CELL_X + x, z: CELL_Z + z, radius: 0.9 * s });
    }
    this.cover = cover;

    // Exit marker at the south wall.
    const exit = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.8, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xffa45e, transparent: true, opacity: 0.32, toneMapped: false }),
    );
    exit.position.set(0, 1.4, HALF - 0.15);
    arena.add(exit);
    this.exitPos = { x: CELL_X, z: CELL_Z + HALF - 1.2 };

    // Cache at the far corner, sealed until the pack is down.
    const chestMat = new THREE.MeshLambertMaterial({ color: 0x8a5a32, flatShading: true });
    const chest = new THREE.Group();
    chest.position.set(HALF - 2.5, 0, -HALF + 2.5);
    const boxBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.95), chestMat);
    boxBase.position.y = 0.4;
    boxBase.castShadow = true;
    chest.add(boxBase);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 1.0), new THREE.MeshLambertMaterial({ color: 0xb07842 }));
    lid.position.set(0, 0.88, -0.18);
    lid.rotation.x = -0.35;
    chest.add(lid);
    const glow = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.9, toneMapped: false }),
    );
    glow.position.set(0, 1.5, 0.1);
    chest.add(glow);
    this.chest = chest;
    this.chestGlow = glow;
    arena.add(chest);
    this.chestPos = { x: CELL_X + HALF - 2.5, z: CELL_Z - HALF + 2.5 };

    for (const [x, z] of [[-HALF + 1.6, -HALF + 1.6], [HALF - 1.6, -HALF + 1.6], [-HALF + 1.6, HALF - 1.6]]) {
      const light = new THREE.PointLight(0xff9a52, 2.0, 12, 1.7);
      light.position.set(x, 2.4, z);
      arena.add(light);
    }

    // Hostile pack. Danger scales the count and the health.
    const count = Math.max(3, Math.min(10, Math.round(3 + danger * 7)));
    const geo = ghoulGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mobMesh = new THREE.InstancedMesh(geo, material, count);
    this.mobMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mobMesh.castShadow = true;
    this.mobMesh.receiveShadow = true;
    this.mobMesh.frustumCulled = false;
    arena.add(this.mobMesh);

    const level = 1 + Math.min(5, Math.floor(danger * 4));
    for (let i = 0; i < count; i++) {
      const m = {
        active: false,
        x: 0,
        z: 0,
        hp: 0,
        maxHp: 58 + level * 12,
        speed: 1.45 + danger * 0.7,
        phase: rng() * 6.28,
        attackCd: 0,
        scale: 0.95 + danger * 0.25,
        target: {
          id: `cellmob:${i}`,
          faction: 'hostile',
          kind: 'ghoul',
          x: 0, y: 0, z: 0,
          hp: 0, maxHp: 58 + level * 12,
          radius: 0.34,
          height: 1.6,
          level,
          damage: 4 + level,
          speed: 1.45 + danger * 0.7,
          dead: true,
          hit: (damage) => this.damageMob(i, damage),
        },
      };
      this.mobs.push(m);
      this.hideMob(i);
    }
    this.mobMesh.instanceMatrix.needsUpdate = true;
    this.spawnMobs(rng);
  }

  spawnMobs(rng) {
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      const a = rng() * Math.PI * 2;
      const r = rng.range(3, 8);
      m.x = Math.cos(a) * r;
      m.z = -HALF + 4 + Math.sin(a) * r;
      m.hp = m.maxHp;
      m.active = true;
      m.attackCd = rng.range(0.3, 1.4);
      m.phase = rng() * 6.28;
      m.target.dead = false;
      m.target.hp = m.hp;
    }
    this.cleared = false;
    this.updateMobMatrices();
  }

  hideMob(i) {
    const m = this.mobs[i];
    if (!m || !this.mobMesh) return;
    m.active = false;
    m.target.dead = true;
    m.hp = 0;
    _o.position.set(0, -20, 0);
    _o.scale.setScalar(0.0001);
    _o.updateMatrix();
    this.mobMesh.setMatrixAt(i, _o.matrix);
    this.mobMesh.instanceMatrix.needsUpdate = true;
  }

  updateMobMatrices() {
    if (!this.mobMesh) return;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (!m.active) continue;
      _o.position.set(m.x, 0.02, m.z);
      _o.rotation.set(0, Math.atan2(-m.x, -m.z), 0);
      _o.scale.setScalar(m.scale);
      _o.updateMatrix();
      this.mobMesh.setMatrixAt(i, _o.matrix);
    }
    this.mobMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // expedition entry / exit
  // -------------------------------------------------------------------------

  enterExpedition(mission, members, player) {
    if (this.active || !mission || !members?.length) return false;
    this.clearArena();
    const seed = deriveSeed(`cell:${mission.id}:${mission.targetId || mission.label}`);
    this.buildArena(seed, mission.danger ?? 0.4);
    this.active = {
      kind: 'expedition',
      mission,
      members: members.slice(),
    };
    this.looted = false;
    this.wiped = false;
    this.lootScrap = Math.min(mission.scrap ?? 40, Math.round((mission.scrap ?? 40) * (0.8 + this.rng() * 0.5)));
    this.lootComponents = mission.components ?? (mission.danger > 0.6 ? 1 : 0);
    this.group.visible = true;
    this.setOverworldVisible(false);
    const spots = [
      [0, HALF - 4.5], [-2.2, HALF - 4.2], [2.2, HALF - 4.2],
    ];
    members.forEach((p, i) => {
      const [ox, oz] = spots[i % spots.length];
      const x = CELL_X + ox;
      const z = CELL_Z + oz;
      p.rig.group.visible = true;
      p.rig.mesh.visible = true;
      if (p.farTier) p.farTier.visible = false;
      p.rig.group.position.set(x, this.floorY + 0.02, z);
      p.heading = Math.PI;
      p.targetHeading = Math.PI;
      p.rig.group.rotation.y = Math.PI;
      p.job = null;
      p.path = null;
      p.attention = null;
      p.onExpedition = true;
      p.anchor = { x, z };
      p.target = { x, z };
      p.holdTimer = 4;
      p.timer = 2;
      p.aim?.setLock(null);
    });
    player.bounds = {
      minX: CELL_X - HALF + 0.7,
      maxX: CELL_X + HALF - 0.7,
      minZ: CELL_Z - HALF + 0.7,
      maxZ: CELL_Z + HALF - 0.7,
    };
    player.floorY = this.floorY + 0.02;
    player.pos.set(CELL_X, this.floorY, CELL_Z + HALF - 4.2);
    this.chestGlow.visible = true;
    return true;
  }

  exitExpedition() {
    if (!this.active) return null;
    const active = this.active;
    const result = {
      mission: active.mission,
      members: active.members,
      cleared: this.cleared,
      looted: this.looted,
      scrap: this.looted ? this.lootScrap : 0,
      components: this.looted ? this.lootComponents : 0,
    };
    this.active = null;
    this.group.visible = false;
    this.setOverworldVisible(true);
    this.cleared = false;
    this.looted = false;
    this.clearArena();
    return result;
  }

  setOverworldVisible(visible) {
    this.terrainChunks.setVisible(visible);
    if (this.scrapField.setVisible) this.scrapField.setVisible(visible);
    for (const mesh of this.wasteland.meshes) mesh.visible = visible;
    for (const b of this.settlement.buildings) b.group.visible = visible;
    if (this.settlement.wallGroup) this.settlement.wallGroup.visible = visible;
    this.enemies.mesh.visible = visible;
    for (const p of this.campFolk.people) {
      p.rig.group.visible = visible && p.active && !p.dead && !p.left;
    }
    for (const p of this.raiders.people) {
      p.rig.group.visible = visible && p.active && !p.dead;
    }
    for (const b of this.bats.pool) {
      b.group.visible = visible && b.active;
    }
    if (!visible) {
      for (const p of this.campFolk.people) p.rig.group.visible = false;
      for (const p of this.raiders.people) p.rig.group.visible = false;
      for (const b of this.bats.pool) b.group.visible = false;
    }
  }

  // -------------------------------------------------------------------------
  // cell state
  // -------------------------------------------------------------------------

  livingMembers() {
    return (this.active?.members || []).filter((p) => p && !p.dead && !p.left);
  }

  nearestMemberTo(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.livingMembers()) {
      const pos = p.rig.group.position;
      const d = Math.hypot(pos.x - x, pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  interact() {
    if (!this.active) return null;
    const unit = this.nearestMemberTo(this.chestPos.x, this.chestPos.z);
    if (!unit) return null;
    const pos = unit.rig.group.position;
    if (!this.looted && this.cleared && Math.hypot(this.chestPos.x - pos.x, this.chestPos.z - pos.z) < 2.6) {
      this.looted = true;
      this.chestGlow.visible = false;
      this.onLoot?.();
      return 'loot';
    }
    return null;
  }

  nearInteract(x, z) {
    if (!this.active) return null;
    if (!this.looted && this.cleared && Math.hypot(this.chestPos.x - x, this.chestPos.z - z) < 2.6) {
      return 'LOOT CACHE';
    }
    return null;
  }

  hudView() {
    if (!this.active) return null;
    const living = this.livingMembers().length;
    const enemies = this.mobs.filter((m) => m.active).length;
    const selected = this.nearestMemberTo(this.chestPos.x, this.chestPos.z);
    let canLoot = false;
    if (selected && this.cleared && !this.looted) {
      const pos = selected.rig.group.position;
      canLoot = Math.hypot(this.chestPos.x - pos.x, this.chestPos.z - pos.z) < 2.6;
    }
    let note = 'CLEAR THE SITE · LOOT THE CACHE · RETURN TO CAMP';
    if (this.wiped || living === 0) note = 'THE TEAM IS DOWN · RETURN TO CAMP';
    else if (this.cleared && !this.looted) note = 'SITE CLEAR · SEND A SURVIVOR TO THE CACHE';
    else if (this.looted) note = 'CACHE LOOTED · RETURN TO CAMP';
    return {
      title: this.active.mission.label || 'EXPEDITION',
      enemies,
      note,
      canLoot,
      looted: this.looted,
      canLeave: true,
    };
  }

  update(dt, player, selected = null) {
    if (!this.active) return;
    const members = this.livingMembers();
    if (!members.length && !this.wiped) {
      this.wiped = true;
      this.ui?.toast('THE TEAM IS DOWN · RETURN TO CAMP', true);
    }
    let living = 0;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (!m.active) continue;
      living++;
      m.attackCd = Math.max(0, m.attackCd - dt);
      // Chase the nearest living member, preferring the selected one when they are close.
      let target = selected && !selected.dead ? selected : null;
      let bestD = target
        ? Math.hypot(target.rig.group.position.x - (CELL_X + m.x), target.rig.group.position.z - (CELL_Z + m.z))
        : Infinity;
      for (const p of members) {
        const pos = p.rig.group.position;
        const d = Math.hypot(pos.x - (CELL_X + m.x), pos.z - (CELL_Z + m.z));
        if (d < bestD) {
          bestD = d;
          target = p;
        }
      }
      const wx = CELL_X + m.x;
      const wz = CELL_Z + m.z;
      if (!target) {
        m.phase += dt;
        continue;
      }
      const tpos = target.rig.group.position;
      const dx = tpos.x - wx;
      const dz = tpos.z - wz;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > 1.35) {
        const step = Math.min(m.speed * dt, dist - 1.15);
        m.x += (dx / dist) * step;
        m.z += (dz / dist) * step;
      } else if (m.attackCd <= 0) {
        m.attackCd = 1.35;
        const index = this.campFolk.people.indexOf(target);
        const killed = this.campFolk.damage(index, m.target.damage);
        this.onBite?.(m.target.damage, target);
        if (killed) this.ui?.toast(`${target.name} IS DOWN`, true);
      }
      m.phase += dt * (5.5 + m.speed);
      m.target.x = wx;
      m.target.z = wz;
      m.target.y = this.floorY;
      m.target.hp = m.hp;
      m.target.dead = false;
      _o.position.set(m.x, 0.02 + Math.abs(Math.sin(m.phase)) * 0.04, m.z);
      _o.rotation.set(0, Math.atan2(dx, dz), Math.sin(m.phase) * 0.03);
      _o.scale.setScalar(m.scale);
      _o.updateMatrix();
      this.mobMesh.setMatrixAt(i, _o.matrix);
    }
    if (this.mobMesh) this.mobMesh.instanceMatrix.needsUpdate = true;
    if (!living && !this.cleared) {
      this.cleared = true;
      this.ui?.toast('SITE CLEARED · CACHE UNSEALED', false);
    }
    if (this.chestGlow.visible) {
      this.chestGlow.position.y = 1.5 + Math.sin(performance.now() * 0.003) * 0.12;
    }
  }

  damageMob(index, amount) {
    const m = this.mobs[index];
    if (!m || !m.active) return false;
    m.hp -= amount;
    if (m.hp <= 0) {
      this.hideMob(index);
      return true;
    }
    return false;
  }

  serialize() {
    return { clearedCaves: [...this.clearedCaves] };
  }

  restore(data) {
    this.clearedCaves = new Set(Array.isArray(data?.clearedCaves) ? data.clearedCaves : []);
  }

  forEachTarget(cb) {
    if (!this.active) return;
    for (const m of this.mobs) {
      if (!m.active) continue;
      const t = m.target;
      t.x = CELL_X + m.x;
      t.y = this.floorY;
      t.z = CELL_Z + m.z;
      t.hp = m.hp;
      t.maxHp = m.maxHp;
      t.dead = false;
      cb(t);
    }
  }
}

const _o = new THREE.Object3D();
