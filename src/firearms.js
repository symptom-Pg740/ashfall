import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { clamp, deriveSeed, makeRng } from './rng.js';
import { canAttack } from './actors.js';

/**
 * Hit resolution, static blockers and the per-shot FX dispatch.
 *
 * Gameplay is hitscan: one ray per pellet is tested against analytic ghoul capsules at fire time.
 * The tracer is a separate presentation layer that reaches the already-known impact point.
 */

const BUILDING_HEIGHT = {
  barricade: 1.0,
  campfire: 0.2,
  catcher: 1.8,
  house: 3.2,
  tower: 5.5,
  chapel: 5.0,
};

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pellet = new THREE.Vector3();
const _end = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _tRay = new THREE.Ray();
const _tRayOrigin = new THREE.Vector3();
const _tRayDir = new THREE.Vector3();
const _tCapA = new THREE.Vector3();
const _tCapB = new THREE.Vector3();
const _tPointOnRay = new THREE.Vector3();
const _tPointOnSeg = new THREE.Vector3();
const _tTmp = new THREE.Vector3();
const _tPoint = new THREE.Vector3();

export class Firearms {
  constructor({ enemies, settlement, wasteland, fx, registry = null }) {
    this.enemies = enemies;
    this.settlement = settlement;
    this.wasteland = wasteland;
    this.fx = fx;
    this.registry = registry;
    this.rng = makeRng(deriveSeed('firearms'));
    this.onShot = null;
    this.onImpact = null;
    this._impact = new THREE.Vector3();
    this._normal = new THREE.Vector3();
  }

  muzzleWorld(actor, out = _origin) {
    const muzzle = actor?.rig?.muzzle;
    if (!muzzle) return null;
    return muzzle.getWorldPosition(out);
  }

  /**
   * Resolve and present one trigger pull.
   * @returns {{hit:boolean, killed:number, x:number, z:number}}
   */
  fire(actor, shot) {
    const weapon = shot.weapon;
    const muzzle = this.muzzleWorld(actor, _muzzle);
    if (!muzzle || !weapon) return { hit: false, killed: 0, x: 0, z: 0 };

    // The hit ray starts at the chest, not the barrel: a muzzle next to a rock or wall would
    // otherwise clip the cover the body is legitimately standing beside. The tracer still starts
    // at the muzzle, so the visual matches the gun.
    const actorY = actor.rig?.group?.position?.y ?? actor.y ?? 0;
    _origin.set(actor.x, actorY + 1.25, actor.z);

    let aimX = shot.aimPoint?.x;
    let aimY = shot.aimPoint?.y;
    let aimZ = shot.aimPoint?.z;
    if (!Number.isFinite(aimX)) {
      // No target: fire along the character's facing.
      const yaw = actor.heading || 0;
      aimX = _origin.x + Math.sin(yaw) * weapon.range;
      aimY = _origin.y;
      aimZ = _origin.z + Math.cos(yaw) * weapon.range;
    }

    _dir.set(aimX - _origin.x, aimY - _origin.y, aimZ - _origin.z).normalize();
    _end.set(_origin.x + _dir.x * weapon.range, _origin.y + _dir.y * weapon.range, _origin.z + _dir.z * weapon.range);

    let hitAny = false;
    let kills = 0;
    let lastX = 0;
    let lastZ = 0;
    const damageByTarget = new Map();
    let impactEvent = null;

    this.fx.casing(muzzle, actor.heading || 0, weapon.id);
    this.onShot?.(weapon, actor);

    for (let p = 0; p < weapon.pellets; p++) {
      _pellet.copy(_dir);
      this.applySpread(_pellet, weapon.spread);

      const targetHit = this.raycastTargets(_origin, _pellet, weapon.range, actor.faction || 'player');
      const enemyHit = this.registry
        ? null
        : this.enemies.raycast(
            _origin.x, _origin.y, _origin.z,
            _pellet.x, _pellet.y, _pellet.z,
            weapon.range,
          );
      const staticHit = this.raycastStatic(_origin, _pellet, weapon.range);
      const targetT = targetHit ? targetHit.t : Infinity;
      const enemyT = enemyHit ? enemyHit.t : Infinity;
      const staticT = staticHit ? staticHit.t : Infinity;

      if (targetHit && targetT <= staticT) {
        const target = targetHit.target;
        const killed = target.hit ? target.hit(weapon.damage, actor.x, actor.z, 0.35) : false;
        hitAny = true;
        if (killed) kills++;
        this._impact.copy(targetHit.point);
        // Lift the hit off the far side of the capsule so the spray reads from the top-down camera.
        this._impact.y += 0.15;
        _normal.set(0, 1, 0);
        lastX = this._impact.x;
        lastZ = this._impact.z;
        this.fx.fire({
          muzzle,
          impact: this._impact,
          surface: 'flesh',
          normal: _normal,
          visualSpeed: weapon.visualSpeed,
        });
        this._addDamage(damageByTarget, target.id, weapon.damage, killed, this._impact);
        if (!impactEvent) {
          impactEvent = { surface: 'flesh', x: this._impact.x, y: this._impact.y, z: this._impact.z };
        }
      } else if (enemyHit && enemyT <= staticT) {
        const killed = this.enemies.damage(enemyHit.index, weapon.damage, actor.x, actor.z, 0.35);
        hitAny = true;
        if (killed) kills++;
        this._impact.copy(enemyHit.point);
        this._impact.y += 0.15;
        _normal.set(0, 1, 0);
        lastX = this._impact.x;
        lastZ = this._impact.z;
        this.fx.fire({
          muzzle,
          impact: this._impact,
          surface: 'flesh',
          normal: _normal,
          visualSpeed: weapon.visualSpeed,
        });
        this._addDamage(damageByTarget, `ghoul:${enemyHit.index}`, weapon.damage, killed, this._impact);
        if (!impactEvent) {
          impactEvent = { surface: 'flesh', x: this._impact.x, y: this._impact.y, z: this._impact.z };
        }
      } else if (staticHit) {
        this._impact.copy(_origin).addScaledVector(_pellet, staticHit.t);
        this.fx.fire({
          muzzle,
          impact: this._impact,
          surface: staticHit.surface,
          normal: staticHit.normal,
          visualSpeed: weapon.visualSpeed,
        });
        if (!impactEvent) {
          impactEvent = {
            surface: staticHit.surface || 'sand',
            x: this._impact.x,
            y: this._impact.y,
            z: this._impact.z,
          };
        }
      } else {
        _end.copy(_origin).addScaledVector(_pellet, weapon.range);
        this.fx.fire({ muzzle, impact: _end, surface: null, normal: null, visualSpeed: weapon.visualSpeed });
      }
    }

    for (const rec of damageByTarget.values()) {
      this.fx.damageNumber(rec.point, rec.amount, rec.killed);
    }
    if (impactEvent) this.onImpact?.(impactEvent);

    return { hit: hitAny, killed: kills, x: lastX, z: lastZ };
  }

  /** Fold per-pellet hits into one number per target per trigger pull. */
  _addDamage(map, id, amount, killed, point) {
    let rec = map.get(id);
    if (!rec) {
      rec = { point: { x: point.x, y: point.y + 0.12, z: point.z }, amount: 0, killed: false };
      map.set(id, rec);
    }
    rec.amount += amount;
    rec.killed = rec.killed || killed;
  }

  /** A ray against every registered combatant capsule. */
  raycastTargets(origin, dir, maxDist, faction) {
    if (!this.registry) return null;
    _tRayOrigin.copy(origin);
    _tRayDir.copy(dir);
    _tRay.set(_tRayOrigin, _tRayDir);
    let bestT = maxDist;
    let best = null;
    this.registry.forEach((t) => {
      if (!t || t.dead || !canAttack(faction, t.faction)) return;
      const h = t.height || 1.8;
      const y = t.y || 0;
      _tCapA.set(t.x, y + h * 0.2, t.z);
      _tCapB.set(t.x, y + h * 0.85, t.z);
      const r = t.radius || 0.35;
      const d2 = _tRay.distanceSqToSegment(_tCapA, _tCapB, _tPointOnRay, _tPointOnSeg);
      if (d2 > r * r) return;
      const tt = _tTmp.subVectors(_tPointOnRay, _tRayOrigin).dot(_tRayDir);
      if (tt < 0 || tt > bestT) return;
      bestT = tt;
      best = t;
    });
    if (!best) return null;
    _tPoint.set(
      origin.x + dir.x * bestT,
      origin.y + dir.y * bestT,
      origin.z + dir.z * bestT,
    );
    return { target: best, t: bestT, point: _tPoint };
  }

  /** A ray against buildings, obstacles and the height field. */
  raycastStatic(origin, dir, maxDist) {
    let bestT = maxDist;
    let bestSurface = null;
    let hasHit = false;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;

    const testCircle = (cx, cz, radius, topY, surface) => {
      const a = dx * dx + dz * dz;
      if (a < 1e-6) return;
      const fx = ox - cx;
      const fz = oz - cz;
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - radius * radius;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return;
      const root = Math.sqrt(disc);
      const t0 = (-b - root) / (2 * a);
      const t1 = (-b + root) / (2 * a);
      const t = t0 >= 0 ? t0 : t1 >= 0 ? t1 : -1;
      if (t < 0 || t > bestT) return;
      const y = oy + dy * t;
      if (y > topY) return;
      bestT = t;
      bestSurface = surface;
      hasHit = true;
      const hx = ox + dx * t;
      const hz = oz + dz * t;
      const nx = hx - cx;
      const nz = hz - cz;
      const nl = Math.hypot(nx, nz) || 1;
      this._normal.set(nx / nl, 0, nz / nl);
    };

    for (const b of this.settlement.buildings) {
      if (!b) continue;
      const top = (b.y || 0) + (BUILDING_HEIGHT[b.type] ?? 2.5);
      const surface = b.type === 'tower' || b.type === 'barricade' ? 'wood' : 'stone';
      testCircle(b.x, b.z, b.radius, top, surface);
    }

    for (const o of this.wasteland.obstacles) {
      const top = heightAt(o.x, o.z) + clamp(0.6 + o.r, 0.8, 3.2);
      testCircle(o.x, o.z, o.r, top, 'stone');
    }

    // Terrain: 1 m samples, only while the ray is close to the ground.
    const steps = Math.min(40, Math.ceil(maxDist));
    for (let i = 1; i <= steps; i++) {
      const t = Math.min(maxDist, i);
      if (t > bestT) break;
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      if (y <= heightAt(x, z) + 0.03) {
        bestT = t;
        bestSurface = 'sand';
        hasHit = true;
        this._normal.set(0, 1, 0);
        break;
      }
    }

    if (!hasHit) return null;
    return { t: bestT, surface: bestSurface, normal: this._normal };
  }

  /** True when no static blocker or terrain sits between the two points. */
  hasLineOfSight(x1, y1, z1, x2, y2, z2) {
    _origin.set(x1, y1, z1);
    _dir.set(x2 - x1, y2 - y1, z2 - z1);
    const len = _dir.length();
    if (len < 0.001) return true;
    _dir.multiplyScalar(1 / len);
    return !this.raycastStatic(_origin, _dir, len);
  }

  applySpread(dir, degrees) {
    if (!(degrees > 0)) return;
    const rad = THREE.MathUtils.degToRad(degrees) * Math.sqrt(this.rng());
    const angle = this.rng() * Math.PI * 2;
    // Build a tangent basis around the shot direction.
    _right.set(dir.z, 0, -dir.x);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, dir).normalize();
    const r = Math.tan(rad);
    dir.addScaledVector(_right, Math.cos(angle) * r);
    dir.addScaledVector(_up, Math.sin(angle) * r);
    dir.normalize();
  }
}
