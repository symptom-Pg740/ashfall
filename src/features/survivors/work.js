import { REASONS } from '../../core/reasons.js';

/**
 * Workplace rules.
 *
 * Pure helpers for work-loop selection, post positions, assignment validation and the repeating
 * production timer. The legacy `npcs.js` adapter still owns the actual production callbacks.
 */

/** @param {any} building */
export function workLoopKind(building) {
  const role = building?.def?.job?.role;
  return role === 'scavenger' || role === 'water' || role === 'farmer' || role === 'artisan' ? role : null;
}

/**
 * @param {any} building
 * @param {any} job
 * @param {{ x: number, z: number }} fallback local post offset
 */
export function workPost(building, job, fallback) {
  const post = job?.post || fallback;
  return { x: building.x + post.x, z: building.z + post.z };
}

/**
 * @param {{ x: number, z: number }} position
 * @param {any} building
 * @param {any} job
 * @param {{ x: number, z: number }} fallback
 * @param {number} [extra]
 */
export function atWorkPost(position, building, job, fallback, extra = 1.5) {
  const post = workPost(building, job, fallback);
  return Math.hypot(post.x - position.x, post.z - position.z) <= building.radius + extra;
}

/**
 * @param {any} person
 * @param {any} building
 * @param {number} workerCount
 * @returns {{ ok: boolean, reason: string }}
 */
export function canAssignWorkplace(person, building, workerCount) {
  if (!person || !person.active || person.dead) return { ok: false, reason: 'UNIT DOWN' };
  if (person.pending) return { ok: false, reason: 'NEWCOMER' };
  if (person.onExpedition) return { ok: false, reason: 'AWAY' };
  const job = building?.def?.job;
  if (!job) return { ok: false, reason: REASONS.NO_WORKER };
  if (!building.built || building.destroyed) return { ok: false, reason: 'SITE NOT READY' };
  if (person.home !== building && workerCount >= job.slots) return { ok: false, reason: 'SLOTS FULL' };
  return { ok: true, reason: '' };
}

/**
 * Advance a repeating production timer.
 * @returns {{ timer: number, produced: boolean }}
 */
export function advanceWorkTimer(timer, dt, workScale, interval) {
  const next = (timer || 0) + dt * (workScale || 1);
  if (next >= interval) return { timer: next - interval, produced: true };
  return { timer: next, produced: false };
}
