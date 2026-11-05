import { savedSeed } from './save.js';
import { DEFAULT_WORLD_SEED, deriveSeedFrom, parseSeed } from './core/random.js';

/**
 * World-seed adapter.
 *
 * The pure random helpers live in `src/core/random.js`. This file is the app-level adapter that
 * chooses the seed from `?seed=` or the saved run, then binds `deriveSeed` to it. Legacy modules
 * import from here; core modules import `core/random.js` directly.
 */

// One seed from the URL (?seed=hex) or the saved run, shared by every generator.
// Same seed -> same world.
export const WORLD_SEED = (() => {
  if (typeof location !== 'undefined') {
    const raw = new URLSearchParams(location.search).get('seed');
    if (raw) return parseSeed(raw);
  }
  const saved = savedSeed();
  return saved === null ? DEFAULT_WORLD_SEED : saved;
})();

/** FNV-1a hash of a label, mixed with the world seed. Stable across reloads. */
export function deriveSeed(label, base = WORLD_SEED) {
  return deriveSeedFrom(label, base);
}

export {
  mulberry32,
  hash32,
  makeRng,
  smoothstep,
  clamp,
  lerp,
  damp,
  parseSeed,
} from './core/random.js';
