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
