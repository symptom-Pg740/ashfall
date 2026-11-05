import { describe, expect, it } from 'vitest';
import { evaluateSurvivorNeeds } from '../../src/core/needs.js';

const camp = {
  population: 3,
  beds: 3,
  chapel: false,
  campfire: true,
  defended: false,
};

const person = (overrides = {}) => ({
  hunger: 0,
  thirst: 0,
  hp: 100,
  maxHp: 100,
  hasHome: true,
  onExpedition: false,
  pending: false,
  morale: 70,
  level: 1,
  baseSpeed: 2,
  ...overrides,
});

describe('evaluateSurvivorNeeds', () => {
  it('rewards a fed, watered, sheltered, employed survivor', () => {
    const result = evaluateSurvivorNeeds(person(), camp);
    expect(result.factors).toContain('FED');
    expect(result.factors).toContain('WATERED');
    expect(result.factors).toContain('SHELTERED');
    expect(result.factors).toContain('FIRELIGHT');
    expect(result.morale).toBeGreaterThan(70);
    expect(result.warning).toBe('');
  });

  it('warns and slows a starving survivor without expelling them', () => {
    const result = evaluateSurvivorNeeds(person({ hunger: 2, thirst: 2 }), camp);
    expect(result.leaveWarn).toBe('STARVING');
    expect(result.warning).toContain('STARVING');
    expect(result.morale).toBeLessThan(30);
    expect(result.speed).toBeLessThan(2);
  });

  it('penalises overcrowding relative to a sheltered camp', () => {
    const sheltered = evaluateSurvivorNeeds(person(), camp);
    const crowded = evaluateSurvivorNeeds(person(), { ...camp, population: 5, beds: 3 });
    expect(crowded.factors).toContain('NO BED');
    expect(crowded.moraleTarget).toBeLessThan(sheltered.moraleTarget);
  });

  it('skips newcomers who have not been welcomed', () => {
    expect(evaluateSurvivorNeeds(person({ pending: true }), camp)).toBeNull();
  });

  it('keeps an expedition member from getting the no-post penalty', () => {
    const result = evaluateSurvivorNeeds(person({ hasHome: false, onExpedition: true }), camp);
    expect(result.factors).not.toContain('NO POST');
  });
});
