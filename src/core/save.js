/**
 * Save schema and migration rules.
 *
 * Pure: no localStorage, no DOM. The storage adapter owns the actual read/write.
 */

export const SAVE_KEY = 'ashfall-save-v1';

/**
 * Schema history (the key stays `-v1` so existing runs are found and migrated in place):
 *  1 — scrap/water/kills/health/time, equipment, buildings, scrap field, timers
 *  2 — adds `ammo`, `mags` and `upgrades` (the armory economy)
 *  3 — adds `power` links, building ids and battery charge
 *  4 — adds construction sites (`built`, `buildProgress`)
 *  5 — adds survivor roles, workplace assignments, survivor positions and needs; also stores food
 *  6 — adds active/recruited survivors, workshop recipes, components and the next recruit day
 *  7 — command-only run: comms broadcast state, per-survivor morale, pending newcomers, equipment
 *      and building heading; relay is a command centre rather than a win condition
 */
export const SAVE_VERSION = 7;

export const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5, 6, SAVE_VERSION];

/**
 * @param {unknown} raw
 * @returns {{ ok: true, data: any } | { ok: false, reason: string }}
 */
export function parseSave(raw) {
  if (!raw) return { ok: false, reason: 'EMPTY' };
  let data;
  try {
    data = JSON.parse(/** @type {string} */ (raw));
  } catch {
    return { ok: false, reason: 'INVALID_JSON' };
  }
  if (!data || !Number.isFinite(data.seed)) return { ok: false, reason: 'NO_SEED' };
  if (!SUPPORTED_VERSIONS.includes(data.v)) return { ok: false, reason: 'UNSUPPORTED_VERSION' };
  data.v = SAVE_VERSION;
  return { ok: true, data };
}

/**
 * @param {any} data
 * @returns {boolean}
 */
export function isSupportedSave(data) {
  return !!data && Number.isFinite(data.seed) && SUPPORTED_VERSIONS.includes(data.v);
}
