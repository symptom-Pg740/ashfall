import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { ghoulGeometry } from './enemies.js';
import { makeRng, deriveSeed } from './rng.js';
import { box, cyl, dodeca, merge } from './geo.js';

const CELL_X = 240;
const CELL_Z = 0;
const HALF = 10.5;
const MOB_COUNT = 5;

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

function caveFloor() {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 12, 12);
  geo.rotateX(-Math.PI / 2);
  return geo;
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
    this.onBite = null;
    this.onLoot = null;

    this.floorY = heightAt(CELL_X, CELL_Z) + 0.02;
    this.group = new THREE.Group();
    this.group.position.set(CELL_X, this.floorY, CELL_Z);
    this.group.visible = false;
    this.scene.add(this.group);

    this.buildEntrances(obstacles || []);
    this.buildCell();
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

  buildCell() {
    const floor = new THREE.Mesh(
      caveFloor(),
      new THREE.MeshLambertMaterial({ color: 0x4a3d31, flatShading: true }),
    );
    floor.receiveShadow = true;
    this.group.add(floor);

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
      this.group.add(wall);
    }

    // Broken pillars and rubble break up the room.
    for (const [x, z, s] of [[-6.5, -4, 1.1], [6, 4.5, 0.8], [5.5, -6, 1.3], [-6, 6, 0.9]]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * s, 0.8 * s, 3.2 * s, 7), wallDark);
      pillar.position.set(x, 1.6 * s, z);
      pillar.rotation.z = (x + z) * 0.01;
      pillar.castShadow = true;
      this.group.add(pillar);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 * s, 0), wallMat);
      rock.position.set(x + 0.8 * s, 0.35, z - 0.5);
      rock.rotation.set(0.5, x, 0.3);
      this.group.add(rock);
    }

    // Exit marker and cache.
    const exit = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.8, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xffa45e, transparent: true, opacity: 0.32, toneMapped: false }),
    );
    exit.position.set(0, 1.4, HALF - 0.15);
    this.group.add(exit);
    this.exitPos = { x: CELL_X, z: CELL_Z + HALF - 1.2 };

    const chestMat = new THREE.MeshLambertMaterial({ color: 0x8a5a32, flatShading: true });
    const chest = new THREE.Group();
    chest.position.set(0, 0, -HALF + 2.2);
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
    this.group.add(chest);
    this.chestPos = { x: CELL_X, z: CELL_Z - HALF + 2.2 };

    for (const [x, z] of [[-HALF + 1.6, -HALF + 1.6], [HALF - 1.6, -HALF + 1.6]]) {
      const light = new THREE.PointLight(0xff9a52, 2.2, 12, 1.7);
      light.position.set(x, 2.4, z);
      this.group.add(light);
    }

    // Cave mobs.
    const geo = ghoulGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mobMesh = new THREE.InstancedMesh(geo, material, MOB_COUNT);
    this.mobMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mobMesh.castShadow = true;
    this.mobMesh.receiveShadow = true;
    this.mobMesh.frustumCulled = false;
    this.group.add(this.mobMesh);

    this.mobs = [];
    for (let i = 0; i < MOB_COUNT; i++) {
      this.mobs.push({
        active: false,
        x: 0,
        z: 0,
        hp: 0,
        maxHp: 70,
        speed: 1.6,
        phase: this.rng() * 6.28,
        attackCd: 0,
        scale: 1.1,
        target: {
          id: `cavemob:${i}`,
          faction: 'hostile',
          kind: 'ghoul',
          x: 0, y: 0, z: 0,
          hp: 0, maxHp: 70,
          radius: 0.34,
          height: 1.6,
          level: 2,
          damage: 5,
          speed: 1.6,
          dead: true,
          hit: (damage) => this.damageMob(i, damage),
        },
      });
      this.hideMob(i);
    }
    this.mobMesh.instanceMatrix.needsUpdate = true;
  }

  clearMobs() {
    for (let i = 0; i < this.mobs.length; i++) this.hideMob(i);
    this.mobMesh.instanceMatrix.needsUpdate = true;
  }

  spawnMobs() {
    const rng = this.rng;
    for (let i = 0; i < MOB_COUNT; i++) {
      const m = this.mobs[i];
      const a = rng() * Math.PI * 2;
      const r = rng.range(2, 6);
      m.x = Math.cos(a) * r;
      m.z = -HALF + 4 + Math.sin(a) * r;
      m.hp = m.maxHp;
      m.active = true;
      m.attackCd = rng.range(0.3, 1.2);
      m.phase = rng() * 6.28;
      m.target.dead = false;
      m.target.hp = m.hp;
    }
    this.cleared = false;
    this.updateMobMatrices();
  }

  hideMob(i) {
    const m = this.mobs[i];
    if (!m) return;
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

  enter(entrance, unit, player) {
    if (this.active || !entrance || !unit) return false;
    this.active = {
      entrance,
      unit,
      returnPos: unit.rig.group.position.clone(),
      returnHeading: unit.heading || 0,
    };
    this.looted = false;
    this.cleared = false;
    const alreadyCleared = this.clearedCaves.has(entrance.id);
    if (alreadyCleared) {
      this.clearMobs();
      this.cleared = true;
      this.looted = true;
    } else {
      this.spawnMobs();
    }
    this.group.visible = true;
    this.setOverworldVisible(false);
    unit.rig.group.visible = true;
    unit.rig.group.position.set(CELL_X, this.floorY + 0.02, CELL_Z + HALF - 4.2);
    unit.heading = Math.PI;
    unit.targetHeading = Math.PI;
    unit.rig.group.rotation.y = Math.PI;
    player.aim.target = null;
    player.aim._initialised = false;
    player.attackCooldown = 0;
    player.bounds = {
      minX: CELL_X - HALF + 0.7,
      maxX: CELL_X + HALF - 0.7,
      minZ: CELL_Z - HALF + 0.7,
      maxZ: CELL_Z + HALF - 0.7,
    };
    player.floorY = this.floorY + 0.02;
    this.chestGlow.visible = !this.looted;
    return true;
  }

  exit() {
    if (!this.active) return null;
    const unit = this.active.unit;
    const back = this.active.entrance;
    unit.rig.group.position.set(back.x + 2.8, heightAt(back.x + 2.8, back.z), back.z);
    unit.heading = Math.atan2(-2.8, 0);
    unit.targetHeading = unit.heading;
    unit.rig.group.rotation.y = unit.heading;
    if (this.active.unit.rig) this.active.unit.rig.group.visible = true;
    this.active = null;
    this.group.visible = false;
    this.setOverworldVisible(true);
    return unit;
  }

  setOverworldVisible(visible) {
    this.terrainChunks.setVisible(visible);
    if (this.scrapField.setVisible) this.scrapField.setVisible(visible);
    for (const mesh of this.wasteland.meshes) mesh.visible = visible;
    for (const b of this.settlement.buildings) b.group.visible = visible;
    this.enemies.mesh.visible = visible;
    for (const p of this.campFolk.people) {
      p.rig.group.visible = visible && p.active && !p.dead;
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

  nearEntrance(x, z, radius = 2.8) {
    for (const e of this.entrances) {
      if (Math.hypot(e.x - x, e.z - z) <= radius) return e;
    }
    return null;
  }

  nearInteract(x, z) {
    if (!this.active) return null;
    if (Math.hypot(this.exitPos.x - x, this.exitPos.z - z) < 2.2) return 'EXIT CAVE';
    if (!this.looted && this.cleared && Math.hypot(this.chestPos.x - x, this.chestPos.z - z) < 2.2) {
      return 'LOOT CACHE';
    }
    return null;
  }

  interact() {
    if (!this.active) return null;
    const unit = this.active.unit;
    const p = unit.rig.group.position;
    if (Math.hypot(this.exitPos.x - p.x, this.exitPos.z - p.z) < 2.2) return 'exit';
    if (!this.looted && this.cleared && Math.hypot(this.chestPos.x - p.x, this.chestPos.z - p.z) < 2.2) {
      this.looted = true;
      this.clearedCaves.add(this.active.entrance.id);
      this.chestGlow.visible = false;
      this.onLoot?.();
      return 'loot';
    }
    return null;
  }

  update(dt, player) {
    if (!this.active) return;
    let living = 0;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (!m.active) continue;
      living++;
      m.attackCd = Math.max(0, m.attackCd - dt);
      const wx = CELL_X + m.x;
      const wz = CELL_Z + m.z;
      const dx = player.x - wx;
      const dz = player.z - wz;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > 1.35) {
        const step = Math.min(m.speed * dt, dist - 1.15);
        m.x += (dx / dist) * step;
        m.z += (dz / dist) * step;
      } else if (m.attackCd <= 0) {
        m.attackCd = 1.35;
        this.onBite?.(5);
      }
      m.phase += dt * (5.5 + m.speed);
      m.target.x = CELL_X + m.x;
      m.target.z = CELL_Z + m.z;
      m.target.y = this.floorY;
      m.target.hp = m.hp;
      m.target.dead = false;
      _o.position.set(m.x, 0.02 + Math.abs(Math.sin(m.phase)) * 0.04, m.z);
      _o.rotation.set(0, Math.atan2(dx, dz), Math.sin(m.phase) * 0.03);
      _o.scale.setScalar(m.scale);
      _o.updateMatrix();
      this.mobMesh.setMatrixAt(i, _o.matrix);
    }
    this.mobMesh.instanceMatrix.needsUpdate = true;
    if (!living && !this.cleared) {
      this.cleared = true;
      this.ui?.toast('CAVE CLEARED · CACHE UNSEALED', false);
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
