import { describe, expect, it } from 'vitest';
import { deriveSeedFrom, makeRng, parseSeed } from '../../src/core/random.js';

describe('deterministic random helpers', () => {
  it('derives stable seeds', () => {
    expect(deriveSeedFrom('camp', 123)).toBe(deriveSeedFrom('camp', 123));
    expect(deriveSeedFrom('camp', 123)).not.toBe(deriveSeedFrom('road', 123));
  });

  it('produces the same sequence for the same seed', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('parses hex, decimal and fallback seeds', () => {
    expect(parseSeed('ff')).toBe(255);
    expect(parseSeed('123456789')).toBe(123456789);
    expect(parseSeed('not-a-seed')).toBe(0x51a7);
    expect(parseSeed(null)).toBe(0x51a7);
  });
});
