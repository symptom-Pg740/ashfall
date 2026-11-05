import { SAVE_KEY, parseSave } from '../../core/save.js';

/**
 * localStorage save adapter.
 *
 * The schema and migration rules live in `src/core/save.js`; this file is the only place that
 * touches browser storage. A future platform build can replace this adapter without changing rules.
 */

let suppressed = false;

export function readSave() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const result = parseSave(raw);
    return result.ok ? result.data : null;
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
