import { REASONS } from '../../core/reasons.js';

/**
 * Pure survivor state transitions.
 *
 * These return patches. The adapter (`npcs.js`) applies the patch and handles rigs, towers, homes,
 * callbacks and save writes. Keeping the state change here makes it testable without a scene.
 */

/**
 * Accept a newcomer waiting at the fire.
 * @param {any} person
 * @returns {any}
 */
export function welcomePatch(person) {
  return {
    pending: false,
    active: true,
    dead: false,
    left: false,
    role: person?.weapon ? 'guard' : 'scavenger',
    holdTimer: 0,
    attention: null,
    hp: Math.max(1, person?.hp || person?.maxHp || 1),
    morale: 65,
    leaveWarn: '',
    activity: 'idle',
  };
}

/**
 * Remove a survivor from the camp, whether rejected as a newcomer or expelled later.
 * @returns {any}
 */
export function removePatch() {
  return {
    active: false,
    dead: false,
    left: true,
    pending: false,
    job: null,
    carry: 0,
    attention: REASONS.LEFT_CAMP,
    activity: 'away',
  };
}

/**
 * @param {any} person
 * @returns {boolean}
 */
export function canWelcome(person) {
  return !!person && person.pending && !person.left;
}

/**
 * @param {any} person
 * @returns {boolean}
 */
export function canExpel(person) {
  return !!person && person.active && !person.pending && !person.left && !person.dead;
}
