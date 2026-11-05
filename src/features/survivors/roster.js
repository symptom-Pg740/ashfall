/**
 * Roster queries and newcomer state.
 *
 * These functions own the meaning of “on the roster”, “free for work” and “newcomer”. They operate
 * on plain survivor objects; the adapter still owns rigs, positions, visibility and save writes.
 */

import { isAccepted } from './model.js';

/** @param {any} person */
export function isOnRoster(person) {
  return !!person && person.active && !person.left;
}

/** A survivor with no current commitment, available for an expedition or a new assignment. */
export function isAvailableForWork(person) {
  return isAvailableForAssignment(person) && !person.home;
}

/** A survivor who can be moved onto a workplace; an idle worker may be reassigned. */
export function isAvailableForAssignment(person) {
  return (
    isAccepted(person) &&
    !person.possessed &&
    !person.onExpedition &&
    !person.manning &&
    !person.job
  );
}

/**
 * @param {any[]} people
 * @param {{ inCell?: boolean, cellMembers?: any[] | null }} [options]
 */
export function roster(people, options = {}) {
  if (options.inCell) {
    return (options.cellMembers || []).filter((p) => p.active && !p.left);
  }
  return people.filter((p) => p.active && !p.left && !p.onExpedition);
}

/** @param {any[]} people */
export function acceptedPeople(people) {
  return people.filter(isAccepted);
}

/** @param {any[]} people */
export function availableForWork(people) {
  return people.filter(isAvailableForWork);
}

/** @param {any[]} people */
export function findRecruitSlot(people) {
  return people.find((p) => !p.active) || null;
}

/**
 * Reset a pooled survivor into a newcomer or a directly accepted recruit.
 * @param {{ pending?: boolean, x: number, z: number, maxHp: number }} input
 */
export function recruitPatch({ pending = true, x, z, maxHp = 100 }) {
  return {
    active: true,
    dead: false,
    left: false,
    pending,
    onExpedition: false,
    hp: maxHp,
    role: pending ? 'newcomer' : 'scavenger',
    home: null,
    job: null,
    attention: null,
    carry: 0,
    hunger: 0,
    thirst: 0,
    morale: 70,
    moraleTarget: 70,
    moraleFactors: ['FED', 'WATERED'],
    leaveWarn: '',
    anchor: { x, z },
    spawnAnchor: { x, z },
    target: { x, z },
    holdTimer: pending ? 30 : 0,
    timer: 1,
    path: null,
    pathIndex: 0,
    pathKey: '',
    pathTimer: 0,
    activity: pending ? 'pending' : 'idle',
  };
}
