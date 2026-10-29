import { heightAt } from './terrain.js';
import { damp, clamp, deriveSeed } from './rng.js';
import { buildSkinnedHumanoid } from './skinned.js';
import { baseHeadGeometry } from './baseHead.js';
import { AimController } from './aim.js';
import { WEAPONS } from './weapons.js';

const SPEED = 4.15;
const MAX_RADIUS = 52;

export class Player {
  constructor(scene) {
    // R2: one skinned body, 16-bone skeleton, gear parented to the bones.
    const rig = buildSkinnedHumanoid(deriveSeed('player'), {
      archetype: 'lean',
      scale: 1.08,
      headGeometry: baseHeadGeometry,
      skipHead: !!baseHeadGeometry,
      skin: '#c08d60',
      coat: '#5c5343',
      accent: '#b45c38',
      weapon: true,
      equipment: {
        head: 'none',
        face: 'scarf',
        torso: 'shirt',
        legs: 'trousers',
        feet: 'boots',
        shoulders: 'none',
        hands: 'none',
        back: 'bedroll',
        waist: 'tool',
        weapon: 'pistol',
      },
    });
    this.rig = rig;
    this.faction = 'player';
    this.group = rig.group;
    this.mesh = rig.mesh;
    this.bones = rig.bones;
    this.shadow = rig.shadow;
    scene.add(this.group);

    this.pos = this.group.position;
    this.pos.set(0, heightAt(0, 4.5), 4.5);
    this.heading = 0;
    this.targetHeading = 0;
    this.phase = 0;
    this.moving = 0;
    this.attackTime = 0;
    this.attackCooldown = 0;
    this.hitTimer = 0;

    this.weaponId = this.rig.equipment.weapon;
    this.weapon = WEAPONS[this.weaponId] || null;
    this.mag = this.weapon ? this.weapon.magazine : 0;
    this.reserve = Infinity;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.aim = new AimController({
      faction: 'player',
      firePolicy: 'manual',
      cone: 55,
      turnRate: 540,
      fireGate: 4,
      reaction: 0,
      range: this.weapon?.range || 22,
    });
    this.rig.onEquipmentChanged = () => {
      if (this.rig.equipment.weapon !== this.weaponId) this.syncWeapon();
    };
    // The aim/los callback is attached by main after the firearms system exists.
  }

  get armed() {
    return !!this.weapon;
  }

  syncWeapon() {
    this.weaponId = this.rig.equipment.weapon;
    this.weapon = WEAPONS[this.weaponId] || null;
    this.mag = this.weapon ? this.weapon.magazine : 0;
    this.reserve = Infinity;
    this.reloadTimer = 0;
    this.attackCooldown = 0;
    this.attackTime = 0;
    this.aim.setRange(this.weapon?.range || 22);
    this.aim.target = null;
    this.aim._initialised = false;
  }

  ammoState() {
    return {
      armed: !!this.weapon,
      mag: this.mag,
      reserve: this.reserve,
      reloading: this.reloadTimer > 0,
      name: this.weapon?.name || '',
    };
  }

  get x() {
    return this.pos.x;
  }
  get z() {
    return this.pos.z;
  }

  strike() {
    if (this.attackCooldown > 0) return false;
    this.attackCooldown = 0.52;
    this.attackTime = 0.3;
    return true;
  }

  update(dt, moveX, moveZ) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackTime = Math.max(0, this.attackTime - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.recoil = damp(this.recoil, 0, 12, dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0 && this.weapon) this.mag = this.weapon.magazine;
    }

    const len = Math.hypot(moveX, moveZ);
    const moving = len > 0.08;
    this.moving = damp(this.moving, moving ? 1 : 0, 12, dt);

    if (moving) {
      const nx = moveX / len;
      const nz = moveZ / len;
      const speed = SPEED * (this.weapon?.moveScale ?? 1) * (this.attackTime > 0 ? 0.55 : 1);
      this.pos.x = clamp(this.pos.x + nx * speed * dt, -MAX_RADIUS, MAX_RADIUS);
      this.pos.z = clamp(this.pos.z + nz * speed * dt, -MAX_RADIUS, MAX_RADIUS);
      const d = Math.hypot(this.pos.x, this.pos.z);
      if (d > MAX_RADIUS) {
        this.pos.x *= MAX_RADIUS / d;
        this.pos.z *= MAX_RADIUS / d;
      }
      this.targetHeading = Math.atan2(nx, nz);
      this.phase += dt * (7.6 + this.moving * 1.2);
    } else {
      this.phase += dt * 1.4;
    }
    if (this.weapon && this.aim.target) this.targetHeading = this.aim.aimYaw;

    this.pos.y = heightAt(this.pos.x, this.pos.z);

    // shortest-arc heading damp
    let diff = this.targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * (1 - Math.exp(-14 * dt));
    this.group.rotation.y = this.heading;

    const b = this.bones;
    const thighL = b.legs.L.thigh;
    const thighR = b.legs.R.thigh;
    const shinL = b.legs.L.shin;
    const shinR = b.legs.R.shin;
    const upperArmL = b.arms.L.upper;
    const upperArmR = b.arms.R.upper;
    const forearmL = b.arms.L.fore;
    const forearmR = b.arms.R.fore;
    const m = this.moving;
    const swing = Math.sin(this.phase) * m;
    const bob = Math.abs(Math.sin(this.phase)) * 0.03 * m + Math.sin(this.phase * 0.5) * 0.006;

    b.hips.position.y = this.rig.hipsBaseY + bob;
    b.hips.rotation.z = Math.sin(this.phase) * 0.018 * m;
    b.spine.rotation.y = -swing * 0.05;
    b.chest.rotation.y = -swing * 0.08;

    thighL.rotation.x = swing * 0.55;
    thighR.rotation.x = -swing * 0.55;
    shinL.rotation.x = Math.max(0, -swing) * 0.6 + 0.04;
    shinR.rotation.x = Math.max(0, swing) * 0.6 + 0.04;

    upperArmL.rotation.x = -swing * 0.45;
    upperArmL.rotation.z = 0.06;
    upperArmR.rotation.x = swing * 0.45;
    upperArmR.rotation.z = -0.06;
    forearmL.rotation.x = -0.15 - Math.max(0, swing) * 0.25;
    forearmR.rotation.x = -0.15 - Math.max(0, -swing) * 0.25;

    // Head leads sharp turns slightly, then settles.
    b.head.rotation.y = damp(b.head.rotation.y, clamp(diff, -0.5, 0.5), 8, dt);
    b.head.rotation.x = Math.sin(this.phase * 0.5) * 0.015;

    if (!this.weapon && this.attackTime > 0) {
      const f = 1 - this.attackTime / 0.3; // 0 → 1
      const arc = Math.sin(f * Math.PI);
      upperArmR.rotation.x = -1.75 + f * 2.9;
      upperArmR.rotation.z = -0.5 + arc * 0.85;
      forearmR.rotation.x = -0.15 + arc * 0.35;
      b.chest.rotation.y = -arc * 0.3;
    }

    if (this.weapon) {
      this.rig.applyWeaponPose(this.aim.pitch, this.recoil, this.reloadTimer > 0, !!this.weapon.twoHanded);
    }

    if (this.hitTimer > 0) {
      b.spine.rotation.z = Math.sin(this.hitTimer * 60) * 0.06;
    } else {
      b.spine.rotation.z = 0;
    }

    this.rig.plantFeet(this.moving);
  }

  tryFire() {
    if (!this.weapon) return null;
    if (this.reloadTimer > 0 || this.attackCooldown > 0) return null;
    if (this.mag <= 0) {
      this.startReload();
      return null;
    }
    this.mag--;
    this.attackCooldown = 60 / this.weapon.rpm;
    this.attackTime = 0.12;
    this.recoil = 1;
    if (this.weapon.singleShot || this.weapon.magazine <= 1) {
      // A single-shot rifle reloads immediately after the shot; the player cannot fire until it
      // is ready again.
      this.reloadTimer = this.weapon.reload;
    }
    return { weapon: this.weapon, aimPoint: this.aim.target ? this.aim.targetPoint : null };
  }

  startReload() {
    if (!this.weapon || this.reloadTimer > 0 || this.mag >= this.weapon.magazine) return false;
    this.reloadTimer = this.weapon.reload;
    return true;
  }

  hit() {
    this.hitTimer = 0.28;
  }

  healthRegen(dt, amount) {
    // visual hook only; health lives in game state
    this.hitTimer = Math.max(0, this.hitTimer - dt);
  }
}
