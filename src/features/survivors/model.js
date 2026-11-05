import { REASONS } from '../../core/reasons.js';
import { JOB } from './jobs.js';

/**
 * Survivor activity and status rules.
 *
 * The legacy unit object still carries booleans (`pending`, `dead`, `manning`, `onExpedition`) and a
 * `job`. This module is the single place that turns those fields into an explicit activity state and
 * a readable status. Movement, combat and animation stay in the legacy adapter until the rest of the
 * feature is migrated.
 */

export const ACTIVITY = Object.freeze({
  PENDING: 'pending',
  IDLE: 'idle',
  MOVING: 'moving',
  WORKING: 'working',
  FIGHTING: 'fighting',
  GUARDING: 'guarding',
  DOWNED: 'downed',
  AWAY: 'away',
});

/**
 * @param {any} person
 * @param {{ x: number, z: number } | null} [position]
 * @returns {string}
 */
export function deriveActivity(person, position = null) {
  if (!person) return ACTIVITY.IDLE;
  if (person.dead) return ACTIVITY.DOWNED;
  if (person.pending) return ACTIVITY.PENDING;
  if (person.onExpedition) return ACTIVITY.AWAY;
  if (person.manning) return ACTIVITY.GUARDING;

  const job = person.job;
  if (!job) return ACTIVITY.IDLE;
  if (job.type === 'attack') return ACTIVITY.FIGHTING;
  if (job.type === 'move' || job.type === 'man') return ACTIVITY.MOVING;
  if (job.type === JOB.RALLY) return ACTIVITY.WORKING;
  if (job.type === JOB.GATHER) {
    if (job.phase === 'harvest') return ACTIVITY.WORKING;
    return ACTIVITY.MOVING;
  }
  if (job.type === 'build' || job.type === 'repair') {
    const b = job.building;
    if (!b || !position) return ACTIVITY.WORKING;
    const d = Math.hypot(b.x - position.x, b.z - position.z);
    return d <= b.radius + 1.6 ? ACTIVITY.WORKING : ACTIVITY.MOVING;
  }
  return ACTIVITY.WORKING;
}

/**
 * Human-readable status used by the unit card and clipboard.
 * @param {any} person
 * @param {{ x: number, z: number } | null} [position]
 * @returns {{ activity: string, status: string, reasonCode: string | null }}
 */
export function survivorStatus(person, position = null) {
  const activity = deriveActivity(person, position);
  if (!person) return { activity, status: 'IDLE', reasonCode: null };
  if (person.dead) return { activity, status: 'DOWN', reasonCode: null };
  if (person.pending) return { activity, status: 'WAITING AT THE FIRE', reasonCode: REASONS.NO_BED };
  if (person.manning) return { activity, status: 'ON THE GUARD POST', reasonCode: null };
  if (person.onExpedition) return { activity, status: 'ON EXPEDITION', reasonCode: null };

  const job = person.job;
  if (!job) {
    if (person.attention) return { activity, status: person.attention, reasonCode: person.attention };
    if (person.carry > 0) return { activity, status: `CARRYING ${person.carry}`, reasonCode: null };
    if (person.home) return { activity, status: `AT ${person.home.def.name}`, reasonCode: null };
    return { activity, status: person.armed ? 'ON WATCH' : 'FREE', reasonCode: null };
  }

  if (job.type === 'move') return { activity, status: 'MOVING', reasonCode: null };
  if (job.type === 'attack') return { activity, status: 'ENGAGING', reasonCode: null };
  if (job.type === 'man') return { activity, status: 'TO THE GUARD POST', reasonCode: null };
  if (job.type === JOB.RALLY) return { activity, status: 'GATHERING AT THE FIRE', reasonCode: null };
  if (job.type === JOB.GATHER) {
    if (job.phase === 'harvest') return { activity, status: 'SCAVENGING', reasonCode: null };
    if (job.phase === 'return') return { activity, status: `HAULING ${person.carry || 0}`, reasonCode: null };
    return { activity, status: 'TO THE PILE', reasonCode: null };
  }
  if (job.type === 'build' || job.type === 'repair') {
    const name = job.building?.def?.name || 'STRUCTURE';
    return {
      activity,
      status: activity === ACTIVITY.WORKING ? `${job.type === 'repair' ? 'REPAIRING' : 'BUILDING'} ${name}` : `TO THE ${name}`,
      reasonCode: null,
    };
  }
  return { activity, status: 'WORKING', reasonCode: null };
}

/**
 * Cache the explicit activity on the unit. Call once after each simulation update.
 * @param {any} person
 * @param {{ x: number, z: number } | null} [position]
 */
export function syncActivity(person, position = null) {
  if (!person) return ACTIVITY.IDLE;
  person.activity = deriveActivity(person, position);
  return person.activity;
}

/**
 * Validate a job before it is assigned.
 * @param {any} person
 * @param {any} job
 * @returns {{ ok: boolean, reason: string }}
 */
export function canIssueJob(person, job) {
  if (!person || person.dead) return { ok: false, reason: 'UNIT DOWN' };
  if (person.pending) return { ok: false, reason: 'NEWCOMER' };
  if (!job) return { ok: false, reason: 'NO JOB' };
  if (job.type === 'attack' && !person.weapon) return { ok: false, reason: 'UNARMED' };
  if (job.type === 'man' && !person.weapon) return { ok: false, reason: 'UNARMED' };
  if (job.type === 'build' && (!job.building || job.building.built)) return { ok: false, reason: 'SITE DONE' };
  if (job.type === 'repair' && (!job.building || !job.building.built || job.building.hp >= job.building.maxHp)) {
    return { ok: false, reason: 'NOT DAMAGED' };
  }
  return { ok: true, reason: '' };
}

/**
 * @param {any} person
 * @returns {boolean}
 */
export function isAccepted(person) {
  return !!person && person.active && !person.pending && !person.left && !person.dead;
}
