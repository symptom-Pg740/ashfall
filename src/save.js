/**
 * Compatibility shim.
 *
 * The pure schema lives in `src/core/save.js` and the browser storage adapter in
 * `src/adapters/storage/localSave.js`. Legacy modules import this file until the save feature is
 * migrated; new code should import the layer it actually needs.
 */

export { SAVE_KEY, SAVE_VERSION } from './core/save.js';
export { readSave, writeSave, clearSave, savedSeed } from './adapters/storage/localSave.js';
