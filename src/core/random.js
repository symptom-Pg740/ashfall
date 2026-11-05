/**
 * Deterministic random helpers.
 *
 * Pure and dependency-free. The world seed is supplied by the caller; this module does not read the
 * URL, localStorage or the clock.
 */

export const DEFAULT_WORLD_SEED = 0x51a7;

/** @param {number} seed */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string | null | undefined} raw */
export function parseSeed(raw) {
  if (!raw) return DEFAULT_WORLD_SEED;
  const hex = /^[0-9a-f]{1,8}$/i.test(raw) ? Number.parseInt(raw, 16) : NaN;
  if (Number.isFinite(hex)) return hex >>> 0;
  const dec = Number.parseInt(raw, 10);
  return Number.isFinite(dec) ? dec >>> 0 : DEFAULT_WORLD_SEED;
}

/** FNV-1a hash of a label, mixed with a base seed. Stable across reloads. */
export function deriveSeedFrom(label, base = DEFAULT_WORLD_SEED) {
  let h = base >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Combine integer or string parts into a stable 32-bit seed. */
export function hash32(...parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    if (typeof part === 'string') {
      for (let i = 0; i < part.length; i++) {
        h ^= part.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
    } else {
      h ^= part >>> 0;
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** @param {number} [seed] */
export function makeRng(seed = 0xa5f411) {
  /** @type {any} */
  const r = mulberry32(seed);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
