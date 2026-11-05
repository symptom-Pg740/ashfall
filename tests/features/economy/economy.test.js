import { describe, expect, it } from 'vitest';
import { Economy } from '../../../src/features/economy/economy.js';

const make = (overrides = {}) => {
  const state = {
    scrap: 0,
    water: 0,
    food: 0,
    components: 0,
    scrapCap: 80,
    waterCap: 80,
    foodCap: 80,
    ...overrides,
  };
  return { state, economy: new Economy({ state, componentCap: 40 }) };
};

describe('Economy', () => {
  it('adds and clamps against the storage capacity', () => {
    const { state, economy } = make({ scrap: 70 });
    expect(economy.add('scrap', 20)).toBe(10);
    expect(state.scrap).toBe(80);
  });

  it('takes only what is available', () => {
    const { state, economy } = make({ water: 3 });
    expect(economy.take('water', 8)).toBe(3);
    expect(state.water).toBe(0);
  });

  it('spends atomically', () => {
    const { state, economy } = make({ scrap: 10, components: 2 });
    expect(economy.spend({ scrap: 4, components: 1 })).toBe(true);
    expect(state.scrap).toBe(6);
    expect(state.components).toBe(1);
    expect(economy.spend({ scrap: 100 })).toBe(false);
    expect(state.scrap).toBe(6);
  });

  it('keeps components on their own cap', () => {
    const { state, economy } = make({ components: 38 });
    expect(economy.add('components', 10)).toBe(2);
    expect(state.components).toBe(40);
  });

  it('reports fullness and totals', () => {
    const { economy } = make({ scrap: 80, water: 2, food: 1, components: 3 });
    expect(economy.isFull('scrap')).toBe(true);
    expect(economy.total()).toBe(86);
  });

  it('re-clamps when capacity changes', () => {
    const { state, economy } = make();
    economy.setCapacity(120);
    economy.add('scrap', 120);
    economy.add('water', 120);
    economy.setCapacity(80);
    expect(state.scrap).toBe(80);
    expect(state.water).toBe(80);
    expect(state.scrapCap).toBe(80);
  });
});
