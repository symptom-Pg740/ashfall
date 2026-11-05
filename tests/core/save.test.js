import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, parseSave } from '../../src/core/save.js';

const base = { seed: 123, player: { x: 0, z: 0 } };

describe('save schema', () => {
  it('accepts v1 and stamps the current version', () => {
    const result = parseSave(JSON.stringify({ ...base, v: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.v).toBe(SAVE_VERSION);
  });

  it('accepts the current version', () => {
    const result = parseSave(JSON.stringify({ ...base, v: SAVE_VERSION }));
    expect(result.ok).toBe(true);
  });

  it('rejects missing, invalid and future saves', () => {
    expect(parseSave(null).ok).toBe(false);
    expect(parseSave('{oops').ok).toBe(false);
    expect(parseSave(JSON.stringify({ v: SAVE_VERSION })).ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...base, v: SAVE_VERSION + 1 })).ok).toBe(false);
  });
});
