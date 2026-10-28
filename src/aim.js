import * as THREE from 'three';
import { canAttack, shortestAngle } from './actors.js';

/**
 * Generic auto-aim: filter, score, hysteresis, slew and fire gate.
 * One instance per armed actor; `firePolicy` decides whether it pulls the trigger.
 */
export class AimController {
  constructor(options = {}) {
    this.faction = options.faction || 'player';
    this.firePolicy = options.firePolicy || 'auto';
    this.cone = THREE.MathUtils.degToRad(options.cone ?? 70);
    this.turnRate = THREE.MathUtils.degToRad(options.turnRate ?? 360);
    this.fireGate = THREE.MathUtils.degToRad(options.fireGate ?? 3);
    this.reaction = options.reaction ?? 0;
    this.range = options.range ?? 20;
    this.los = options.los || null;

    this.target = null;
    this.targetPoint = new THREE.Vector3();
    this.aimYaw = 0;
    this.pitch = 0;
    this.error = 0;
    this.canFire = false;
    this.reactionTimer = 0;
    this.lockId = null;
    this._initialised = false;
    this._candidates = [];
  }

  setRange(range) {
    if (Number.isFinite(range)) this.range = range;
  }

  setLock(id) {
    this.lockId = id;
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number,z:number,heading:number}} actor
   * @param {TargetRegistry} registry
   * @param {object|null} weapon
   */
  update(dt, actor, registry, weapon) {
    this.canFire = false;
    if (!this._initialised) {
      this.aimYaw = actor.heading || 0;
      this._initialised = true;
    }
    if (!weapon || !registry) {
      this.target = null;
      this.error = shortestAngle(actor.heading || 0, this.aimYaw);
      return this;
    }

    const range = weapon.range || this.range;
    const originY = actor.y + 1.25;
    const candidates = this._candidates;
    candidates.length = 0;

    registry.forEach((t) => {
      if (!t || t.dead || !canAttack(this.faction, t.faction)) return;
      const dx = t.x - actor.x;
      const dz = t.z - actor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + 0.01) return;
      const yaw = Math.atan2(dx, dz);
      const angle = Math.abs(shortestAngle(actor.heading || 0, yaw));
      if (angle > this.cone) return;
      const targetY = t.y + (t.height || 1.6) * 0.55;
      if (this.los && !this.los(actor.x, originY, actor.z, t.x, targetY, t.z)) return;
      let score = 0.55 * (1 - angle / this.cone) + 0.3 * (1 - dist / range);
      score += 0.15 * (1 - t.hp / (t.maxHp || 1));
      // Sticky target: a known target gets a 20 % bonus so it does not flicker.
      if (this.target && t.id === this.target.id) score *= 1.2;
      if (this.lockId && t.id === this.lockId) score *= 1.6;
      candidates.push({ target: t, score, yaw, targetY, dist });
    });

    let best = null;
    for (const c of candidates) if (!best || c.score > best.score) best = c;

    if (!best) {
      this.target = null;
      this.reactionTimer = 0;
      this.error = shortestAngle(actor.heading || 0, this.aimYaw);
      return this;
    }

    const previousId = this.target?.id;
    this.target = best.target;
    this.targetPoint.set(best.target.x, best.targetY, best.target.z);
    if (best.target.id !== previousId) this.reactionTimer = this.reaction;

    // Exponential slew with a hard turn-rate cap: a 180° flip takes ~0.33 s, not one frame.
    const delta = shortestAngle(this.aimYaw, best.yaw);
    const smooth = delta * (1 - Math.exp(-18 * dt));
    const maxStep = this.turnRate * dt;
    this.aimYaw += THREE.MathUtils.clamp(smooth, -maxStep, maxStep);
    this.pitch = Math.atan2(best.targetY - originY, Math.max(0.001, best.dist));
    this.error = shortestAngle(actor.heading || 0, this.aimYaw);
    this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    this.canFire = this.reactionTimer <= 0 && Math.abs(this.error) <= this.fireGate;
    return this;
  }
}
