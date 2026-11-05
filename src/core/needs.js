/**
 * Survivor needs and morale.
 *
 * Pure rules: no DOM, no Three.js, no settlement object, no timers. The caller supplies a snapshot
 * of the survivor and the camp. This is the first migrated rule slice; legacy code may still read
 * the resulting fields.
 */

/**
 * @typedef {Object} SurvivorNeedsInput
 * @property {number} hunger
 * @property {number} thirst
 * @property {number} hp
 * @property {number} maxHp
 * @property {boolean} hasHome
 * @property {boolean} onExpedition
 * @property {boolean} pending
 * @property {number} morale
 * @property {number} level
 * @property {number} baseSpeed
 */

/**
 * @typedef {Object} CampContext
 * @property {number} population
 * @property {number} beds
 * @property {boolean} chapel
 * @property {boolean} campfire
 * @property {boolean} defended
 */

/**
 * @typedef {Object} NeedsResult
 * @property {number} moraleTarget
 * @property {number} morale
 * @property {string[]} factors
 * @property {string} leaveWarn short status for the clipboard
 * @property {string} warning longer sentence without the survivor name
 * @property {number} speed
 */

const MORALE_BASE = 55;
const MORALE_KEEP = 0.35;

/**
 * Evaluate one survivor's morale for the day.
 * @param {SurvivorNeedsInput} person
 * @param {CampContext} camp
 * @returns {NeedsResult | null} null for newcomers who have not been welcomed
 */
export function evaluateSurvivorNeeds(person, camp) {
  if (!person || person.pending) return null;

  let target = MORALE_BASE;
  const factors = [];

  if (person.hunger > 0) {
    target -= 22 * person.hunger;
    factors.push(`HUNGRY ${person.hunger}/2`);
  } else {
    target += 10;
    factors.push('FED');
  }

  if (person.thirst > 0) {
    target -= 22 * person.thirst;
    factors.push(`THIRSTY ${person.thirst}/2`);
  } else {
    target += 10;
    factors.push('WATERED');
  }

  if (person.hasHome) {
    target += 6;
    factors.push('EMPLOYED');
  } else if (!person.onExpedition) {
    target -= 4;
    factors.push('NO POST');
  }

  if (camp.population > camp.beds) {
    target -= 14;
    factors.push('NO BED');
  } else {
    target += 5;
    factors.push('SHELTERED');
  }

  if (camp.chapel) {
    target += 8;
    factors.push('FAITH');
  }
  if (camp.campfire) {
    target += 4;
    factors.push('FIRELIGHT');
  }
  if (camp.defended) {
    target += 3;
    factors.push('DEFENDED');
  }

  if (person.hp < person.maxHp * 0.5) {
    target -= 10;
    factors.push('WOUNDED');
  }

  target = Math.max(0, Math.min(100, target));
  const morale = Math.round((person.morale ?? 70) * MORALE_KEEP + target * (1 - MORALE_KEEP));
  const starving = person.hunger >= 2 || person.thirst >= 2;
  const hungry = person.hunger > 0 || person.thirst > 0;

  let leaveWarn = '';
  let warning = '';
  if (starving) {
    leaveWarn = person.hunger >= 2 ? 'STARVING' : 'DEHYDRATED';
    warning = `IS ${person.hunger >= 2 ? 'STARVING' : 'DEHYDRATED'} · MORALE AND WORK ARE SUFFERING`;
  } else if (hungry) {
    leaveWarn = person.hunger > 0 ? `HUNGRY ${person.hunger}/2` : `THIRSTY ${person.thirst}/2`;
    warning = `IS ${person.hunger > 0 ? 'HUNGRY' : 'THIRSTY'} · FEED THEM AT DAWN`;
  } else if (morale <= 30) {
    leaveWarn = 'UNHAPPY';
    warning = `IS UNHAPPY · ${factors.join(' · ')}`;
  }

  const moraleFactor = morale < 25 ? 0.85 : 1;
  const unfed = hungry ? 0.8 : 1;
  const levelFactor = 1 + 0.02 * ((person.level || 1) - 1);
  const speed = (person.baseSpeed || 0) * unfed * levelFactor * moraleFactor;

  return { moraleTarget: target, morale, factors, leaveWarn, warning, speed };
}
