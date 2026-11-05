import { describe, expect, it } from 'vitest';
import {
  addResource,
  canAfford,
  clampResource,
  pay,
  resourceFraction,
  storageCapacity,
  takeResource,
} from '../../src/core/stockpile.js';

describe('storageCapacity', () => {
  it('starts at 80 and adds 120 per warehouse', () => {
    expect(storageCapacity(0)).toBe(80);
    expect(storageCapacity(1)).toBe(200);
    expect(storageCapacity(3)).toBe(440);
  });

  it('ignores negative and fractional warehouse counts', () => {
    expect(storageCapacity(-2)).toBe(80);
    expect(storageCapacity(1.9)).toBe(200);
  });
});

describe('addResource', () => {
  it('accepts only up to capacity', () => {
    expect(addResource(70, 20, 80)).toEqual({ value: 80, accepted: 10 });
  });

  it('never goes negative or above capacity', () => {
    expect(addResource(-5, 10, 80)).toEqual({ value: 10, accepted: 10 });
    expect(addResource(200, 10, 80)).toEqual({ value: 80, accepted: 0 });
  });
});

describe('takeResource', () => {
  it('takes only what is available', () => {
    expect(takeResource(5, 9)).toEqual({ value: 0, taken: 5 });
  });
});

describe('affordability', () => {
  it('checks every resource', () => {
    expect(canAfford({ scrap: 10, water: 2 }, { scrap: 8, water: 3 })).toBe(false);
    expect(canAfford({ scrap: 10, water: 2 }, { scrap: 8, water: 2 })).toBe(true);
  });

  it('pays atomically', () => {
    const before = { scrap: 10, water: 2 };
    expect(pay(before, { scrap: 20 })).toEqual({ ok: false, stock: before });
    expect(pay(before, { scrap: 4 }).stock).toEqual({ scrap: 6, water: 2 });
  });
});

describe('helpers', () => {
  it('clamps and reports fractions', () => {
    expect(clampResource(150, 80)).toBe(80);
    expect(clampResource(-4, 80)).toBe(0);
    expect(resourceFraction(40, 80)).toBe(0.5);
    expect(resourceFraction(10, 0)).toBe(0);
  });
});
