import { heightAt, PLAY_RADIUS } from './terrain.js';
import { damp, clamp, deriveSeed } from './rng.js';
import { buildSkinnedHumanoid } from './skinned.js';
import { baseHeadGeometry } from './baseHead.js';
import { AimController } from './aim.js';
import { WEAPONS } from './weapons.js';

const SPEED = 4.15;
const MAX_RADIUS = PLAY_RADIUS - 2;

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
    this.armory = null;
    this.possessedUnit = null;
    this._saved = null;
    this.onDry = null;
    this.onReload = null;
    this.onStep = null;
    this.stepTimer = 0;
    this.weapon = WEAPONS[this.weaponId] || null;
    this.mag = this.weapon ? this.weapon.magazine : 0;
    this.reserve = Infinity;
    this.damageScale = 1;
    this.bounds = null;
    this.floorY = null;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.aim = new AimController({
      faction: 'player',
      firePolicy: 'manual',
      cone: 180,
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

  /**
   * Swap this controller onto another survivor's rig. The leader is parked exactly as it was and
   * restored by `release()`, so possession is reversible.
   */
  possess(unit) {
    if (!unit || !unit.rig || this.possessedUnit) return false;
    this._saved = {
      rig: this.rig,
      group: this.group,
      bones: this.bones,
      mesh: this.mesh,
      shadow: this.shadow,
      weaponId: this.weaponId,
      weapon: this.weapon,
      mag: this.mag,
      reloadTimer: this.reloadTimer,
      attackCooldown: this.attackCooldown,
      attackTime: this.attackTime,
      recoil: this.recoil,
      heading: this.heading,
      targetHeading: this.targetHeading,
      phase: this.phase,
      moving: this.moving,
      hitTimer: this.hitTimer,
      damageScale: this.damageScale,
    };
    this.rig = unit.rig;
    this.group = unit.rig.group;
    this.pos = this.group.position;
    this.bones = unit.rig.bones;
    this.mesh = unit.rig.mesh;
    this.shadow = unit.rig.shadow;
    this.weaponId = this.rig.equipment.weapon;
    this.weapon = this.armory ? this.armory.weapon(this.weaponId) : WEAPONS[this.weaponId] || null;
    this.mag = this.armory
      ? this.armory.setMag(this.weaponId, this.armory.magOf(this.weaponId))
      : this.weapon
        ? this.weapon.magazine
        : 0;
    this.reloadTimer = 0;
    this.attackCooldown = 0;
    this.attackTime = 0;
    this.recoil = 0;
    this.hitTimer = 0;
    this.heading = this.group.rotation.y;
    this.targetHeading = this.heading;
    this.phase = 0;
    this.moving = 0;
    this.damageScale = unit.damageScale || 1;
    this.aim.setRange(this.weapon?.range || 22);
    this.aim.target = null;
    this.aim._initialised = false;
    this.possessedUnit = unit;
    return true;
  }

  /** Return control to the leader and park the possessed survivor where it stands. */
  release() {
    const s = this._saved;
    if (!s) return null;
    const unit = this.possessedUnit;
    if (unit) {
      // Preserve the ammo the unit spent while possessed.
      this.armory?.setMag(this.weaponId, this.mag);
      if (unit.weapon) {
        unit.mag = unit.weapon.magazine;
        unit.reloadTimer = 0;
        unit.cooldown = 0;
        unit.recoil = 0;
        if (unit.aim) unit.aim.target = null;
      }
      unit.heading = unit.rig.group.rotation.y;
      unit.target = {
        x: unit.rig.group.position.x,
        z: unit.rig.group.position.z,
      };
      unit.timer = 1.5 + Math.random() * 2;
      unit.phase = 0;
      unit.possessed = false;
    }
    this.rig = s.rig;
    this.group = s.group;
    this.pos = this.group.position;
    this.bones = s.bones;
    this.mesh = s.mesh;
    this.shadow = s.shadow;
    this.weaponId = s.weaponId;
    this.weapon = s.weapon;
    this.mag = s.mag;
    this.reloadTimer = s.reloadTimer;
    this.attackCooldown = s.attackCooldown;
    this.attackTime = s.attackTime;
    this.recoil = s.recoil;
    this.heading = s.heading;
    this.targetHeading = s.targetHeading;
    this.phase = s.phase;
    this.moving = s.moving;
    this.hitTimer = s.hitTimer;
    this.damageScale = s.damageScale;
    this.aim.setRange(this.weapon?.range || 22);
    this.aim.target = null;
    this.aim._initialised = false;
    this.possessedUnit = null;
    this._saved = null;
    return unit;
  }

  /** Wire the ammo economy and upgrade resolver. Called once from main. */
  setArmory(armory) {
    this.armory = armory;
    this.refreshWeapon();
  }

  /** Re-resolve the equipped weapon after an upgrade purchase. */
  refreshWeapon() {
    this.weapon = this.armory
      ? this.armory.weapon(this.weaponId)
      : WEAPONS[this.weaponId] || null;
    this.mag = this.armory
      ? this.armory.setMag(this.weaponId, this.armory.magOf(this.weaponId))
      : this.weapon
        ? this.weapon.magazine
        : 0;
    this.aim?.setRange(this.weapon?.range || 22);
  }

  syncWeapon() {
    this.weaponId = this.rig.equipment.weapon;
    this.weapon = this.armory
      ? this.armory.weapon(this.weaponId)
      : WEAPONS[this.weaponId] || null;
    this.mag = this.armory
      ? this.armory.setMag(this.weaponId, this.armory.magOf(this.weaponId))
      : this.weapon
        ? this.weapon.magazine
        : 0;
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
      reserve: this.armory ? this.armory.reserve(this.weaponId) : this.reserve,
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
      if (this.reloadTimer === 0 && this.weapon) this.finishReload();
    }

    const len = Math.hypot(moveX, moveZ);
    const moving = len > 0.08;
    this.moving = damp(this.moving, moving ? 1 : 0, 12, dt);

    if (moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.38 + Math.random() * 0.08;
        this.onStep?.();
      }
    } else {
      this.stepTimer = 0;
    }

    if (moving) {
      const nx = moveX / len;
      const nz = moveZ / len;
      const speed = SPEED * (this.weapon?.moveScale ?? 1) * (this.attackTime > 0 ? 0.55 : 1);
      this.pos.x += nx * speed * dt;
      this.pos.z += nz * speed * dt;
      if (this.bounds) {
        this.pos.x = clamp(this.pos.x, this.bounds.minX, this.bounds.maxX);
        this.pos.z = clamp(this.pos.z, this.bounds.minZ, this.bounds.maxZ);
      } else {
        const d = Math.hypot(this.pos.x, this.pos.z);
        if (d > MAX_RADIUS) {
          this.pos.x *= MAX_RADIUS / d;
          this.pos.z *= MAX_RADIUS / d;
        }
      }
      this.targetHeading = Math.atan2(nx, nz);
      this.phase += dt * (7.6 + this.moving * 1.2);
    } else {
      this.phase += dt * 1.4;
    }
    if (this.weapon && this.aim.target) this.targetHeading = this.aim.aimYaw;

    this.pos.y = this.floorY ?? heightAt(this.pos.x, this.pos.z);

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
      if (!this.startReload() && this.reloadTimer <= 0) {
        // Nothing in the gun and nothing in the pouch.
        this.attackCooldown = 0.35;
        this.onDry?.(this.weapon.name);
      }
      return null;
    }
    this.mag--;
    this.armory?.setMag(this.weaponId, this.mag);
    this.attackCooldown = 60 / this.weapon.rpm;
    this.attackTime = 0.12;
    this.recoil = 1;
    if (this.weapon.singleShot || this.weapon.magazine <= 1) {
      // A single-shot rifle reloads immediately after the shot; the player cannot fire until it
      // is ready again.
      this.reloadTimer = this.weapon.reload;
      this.onReload?.(this.weapon.id);
    }
    return { weapon: this.weapon, aimPoint: this.aim.target ? this.aim.targetPoint : null, damage: this.weapon.damage * (this.damageScale || 1) };
  }

  /** Called when the reload timer completes: top up from the reserve. */
  finishReload() {
    if (!this.weapon) return;
    if (this.armory) {
      this.mag = this.armory.fill(this.weaponId);
    } else {
      this.mag = this.weapon.magazine;
    }
    this.armory?.setMag(this.weaponId, this.mag);
  }

  startReload() {
    if (!this.weapon || this.reloadTimer > 0 || this.mag >= this.weapon.magazine) return false;
    if (this.armory && !this.armory.hasReserve(this.weaponId)) return false;
    this.reloadTimer = this.weapon.reload;
    this.onReload?.(this.weapon.id);
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
