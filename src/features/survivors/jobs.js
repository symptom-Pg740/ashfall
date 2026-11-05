/**
 * Job kinds and small predicates.
 *
 * A `gather` job is a scrap trip; a `rally` job is a call to the campfire. Keeping them separate
 * avoids the handler-order bug where a rally job was interpreted as a scrap gather.
 */

export const JOB = Object.freeze({
  MOVE: 'move',
  GATHER: 'gather',
  RALLY: 'rally',
  BUILD: 'build',
  REPAIR: 'repair',
  MAN: 'man',
  ATTACK: 'attack',
});

/** @param {any} job */
export function isRally(job) {
  return job?.type === JOB.RALLY;
}

/** @param {any} job */
export function isScrapGather(job) {
  return job?.type === JOB.GATHER;
}

/** @param {any} job */
export function isTravelJob(job) {
  return job?.type === JOB.MOVE || job?.type === JOB.MAN;
}

/** @param {any} job */
export function isWorkJob(job) {
  return job?.type === JOB.BUILD || job?.type === JOB.REPAIR || job?.type === JOB.RALLY;
}

/** Arrival distances for the simple job kinds. */
export const JOB_REACH = Object.freeze({
  MOVE: 0.6,
  RALLY: 0.75,
  NODE: 2.2,
  WORK_EXTRA: 1.5,
  MAN: 3.0,
});

export function arrivedAtMove(distance) {
  return distance < JOB_REACH.MOVE;
}

export function arrivedAtRally(distance) {
  return distance < JOB_REACH.RALLY;
}

export function arrivedAtNode(distance) {
  return distance < JOB_REACH.NODE;
}

export function withinWorkRange(distance, buildingRadius) {
  return distance <= buildingRadius + JOB_REACH.WORK_EXTRA;
}

export function withinManRange(distance) {
  return distance < JOB_REACH.MAN;
}

/** @returns {{ progress: number, complete: boolean }} */
export function nextBuildProgress(progress, dt, workScale, buildTime) {
  const next = Math.min(1, (progress || 0) + (dt * (workScale || 1)) / Math.max(0.5, buildTime || 1));
  return { progress: next, complete: next >= 1 };
}

/** @returns {{ hp: number, complete: boolean }} */
export function nextRepairHp(hp, dt, workScale, maxHp) {
  const next = Math.min(maxHp, hp + dt * 14 * (workScale || 1));
  return { hp: next, complete: next >= maxHp };
}
