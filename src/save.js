export const SAVE_KEY = 'ashfall-save-v1';

/**
 * Schema history (the key stays `-v1` so existing runs are found and migrated in place):
 *  1 — scrap/water/kills/health/time, equipment, buildings, scrap field, timers
 *  2 — adds `ammo`, `mags` and `upgrades` (the armory economy)
 *  3 — adds `power` links, building ids and battery charge
 *  4 — adds construction sites (`built`, `buildProgress`)
 *  5 — adds survivor roles, workplace assignments, survivor positions and needs; also stores food
 */
export const SAVE_VERSION = 5;

let suppressed = false;

export function readSave() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Number.isFinite(data.seed)) return null;
    if (![1, 2, 3, 4, SAVE_VERSION].includes(data.v)) return null;
    // v1 runs simply have no armory block; `loadGame` fills the starter ammo.
    data.v = SAVE_VERSION;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  if (suppressed || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(suppressWrites = true) {
  // A normal clear is followed by a reload/new run, so suppress the pagehide auto-save. The `fresh`
  // test hook clears in place and must keep saving enabled.
  suppressed = suppressWrites;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function savedSeed() {
  const save = readSave();
  return save ? save.seed >>> 0 : null;
}
