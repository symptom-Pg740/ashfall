export const SAVE_KEY = 'ashfall-save-v1';

let suppressed = false;

export function readSave() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !Number.isFinite(data.seed)) return null;
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

export function clearSave() {
  // A clear is always followed by a reload/new run. Suppress the pagehide auto-save so the old
  // run cannot be written back between clearSave() and navigation.
  suppressed = true;
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
