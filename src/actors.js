/**
 * Combat actors, factions and the target registry.
 *
 * A `Combatant` is a plain data record: id, faction, position, hp, radius, height (and an optional
 * ref to the owning object). The ghoul pool implements `forEachTarget` in bulk; the player, camp
 * folk and future raiders implement it per rig. Nobody needs to know which is which.
 */

const TAU = Math.PI * 2;

export function shortestAngle(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Faction pairs that can damage each other. Friendly fire is intentionally off. */
export function canAttack(a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'player') return b === 'hostile' || b === 'raider';
  if (a === 'camp') return b === 'hostile' || b === 'raider';
  if (a === 'raider') return b === 'player' || b === 'camp';
  if (a === 'hostile') return b === 'player' || b === 'camp' || b === 'raider';
  return false;
}

export class TargetRegistry {
  constructor() {
    this.providers = [];
  }

  add(provider) {
    if (provider && !this.providers.includes(provider)) this.providers.push(provider);
    return this;
  }

  forEach(cb) {
    for (const provider of this.providers) provider.forEachTarget(cb);
  }
}

