/**
 * Survivor progression.
 *
 * Levels are intentionally quiet in the world: no floating numbers, no badges. They live in the
 * unit card and pay out as a smooth stat curve plus a role-flavoured perk label every three levels.
 */

export const MAX_LEVEL = 10;

/** XP needed to move from `level` to `level + 1`. */
export function xpToNext(level) {
  return 40 + level * 22;
}

/** Total XP needed to reach the start of `level`. */
export function xpForLevel(level) {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** Resolve total XP into the current level and the progress through it. */
export function levelInfo(xp = 0) {
  let remaining = Math.max(0, xp);
  let level = 1;
  while (level < MAX_LEVEL && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level++;
  }
  const need = level >= MAX_LEVEL ? 0 : xpToNext(level);
  return {
    level,
    xp: remaining,
    need,
    progress: need > 0 ? Math.min(1, remaining / need) : 1,
    total: Math.max(0, xp),
  };
}

export const XP = {
  gather: 10,
  build: 18,
  repair: 12,
  craft: 10,
  produce: 5,
  kill: 22,
  assist: 6,
};

const PERKS = {
  scavenger: ['FIELD RUNNER · +10% work speed', 'SALVAGE EYE · +20% work speed', 'DUST VETERAN · +30% work speed'],
  builder: ['SCAFFOLD HANDS · +10% work speed', 'MASTER BUILDER · +20% work speed', 'CAMP ARCHITECT · +30% work speed'],
  guard: ['STEADY AIM · +damage', 'HARDENED · +health', 'DEADEYE · +damage & accuracy'],
  water: ['WELL HANDS · +10% work speed', 'DEEP WELL · +20% work speed', 'WATER MASTER · +30% work speed'],
  farmer: ['GREEN THUMB · +10% work speed', 'HARDY CROP · +20% work speed', 'HARVEST MASTER · +30% work speed'],
  artisan: ['QUICK HANDS · +10% work speed', 'BENCH MASTER · +20% work speed', 'RELIC SMITH · +30% work speed'],
};

/** Flavour label for the first perk reached at or below this level. */
export function perkFor(role, level) {
  const key = role === 'water carrier' ? 'water' : role;
  const list = PERKS[key] || PERKS.scavenger;
  if (level >= 9) return list[2];
  if (level >= 6) return list[1];
  if (level >= 3) return list[0];
  return '';
}

/** Shared level scaling. Roles can read the same curve, then apply their own work scale. */
export function statScale(level = 1) {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  const t = l - 1;
  return {
    health: 1 + t * 0.1,
    damage: 1 + t * 0.07,
    speed: 1 + t * 0.02,
    work: 1 + t * 0.05,
    accuracy: 1 + t * 0.04,
  };
}
