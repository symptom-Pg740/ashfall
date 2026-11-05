/**
 * Reason codes shared by simulation, attention states and UI.
 *
 * Values are the current user-facing strings so legacy UI keeps working while the code migrates.
 * New code should compare against these constants, not copy the strings.
 */

export const REASONS = Object.freeze({
  NO_PATH: 'NO PATH',
  STORAGE_FULL: 'STORAGE FULL',
  NO_NODES: 'NO NODES',
  NO_WATER: 'NO WATER',
  NO_SCRAP: 'NO SCRAP',
  NO_RECIPE: 'NO RECIPE',
  NO_WORKER: 'NO WORKER',
  NO_POWER: 'NO POWER',
  NO_SOURCE: 'NO SOURCE',
  NO_BED: 'NO BED',
  NO_POST: 'NO POST',
  LEFT_CAMP: 'LEFT CAMP',
  NO_AMMO: 'NO AMMO',
  NOT_WIRED: 'NOT WIRED',
  UNREACHABLE: 'UNREACHABLE',
  PORTS_FULL: 'PORTS FULL',
  ALREADY_LINKED: 'ALREADY LINKED',
  OUT_OF_RANGE: 'OUT OF RANGE',
});
