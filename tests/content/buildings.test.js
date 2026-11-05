import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../src/content/buildings.js';

describe('BUILDINGS content', () => {
  it('keeps the shipped roster', () => {
    expect(BUILDINGS.map((b) => b.id)).toEqual([
      'wall',
      'barricade',
      'campfire',
      'catcher',
      'house',
      'warehouse',
      'scavenger',
      'well',
      'farm',
      'workshop',
      'trade',
      'relay',
      'solar',
      'pole',
      'battery',
      'light',
      'turret',
      'tower',
      'chapel',
    ]);
  });

  it('gives every entry a stable id, name, cost, radius and description', () => {
    for (const def of BUILDINGS) {
      expect(def.id).toMatch(/^[a-z]+$/);
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.cost).toBeGreaterThan(0);
      expect(def.radius).toBeGreaterThan(0);
      expect(typeof def.desc).toBe('string');
    }
  });

  it('has unique ids', () => {
    const ids = BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays data only, with no presentation fields', () => {
    for (const def of BUILDINGS) {
      expect(def).not.toHaveProperty('geometry');
      expect(def).not.toHaveProperty('mesh');
    }
  });

  it('keeps costs, health, components and power intact', () => {
    const byId = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
    expect(byId.relay).toMatchObject({
      cost: 40,
      components: 8,
      hp: 520,
      radius: 2,
      power: { kind: 'consumer', demand: 0.8, priority: 6, attach: 2.8 },
    });
    expect(byId.campfire).toMatchObject({ cost: 8, hp: 260, radius: 1.15 });
    expect(byId.trade).toMatchObject({ cost: 28, hp: 180, radius: 2.8 });
    expect(byId.tower).toMatchObject({ cost: 20, hp: 240, radius: 1.65 });
    expect(byId.solar.power).toEqual({ kind: 'source', output: 2.2, attach: 1.0 });
    expect(byId.battery.power).toEqual({ kind: 'storage', capacity: 150, attach: 1.0 });
  });

  it('keeps job definitions intact', () => {
    const byId = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
    expect(byId.scavenger.job).toEqual({ role: 'scavenger', label: 'SCAVENGER', slots: 2, radius: 26 });
    expect(byId.well.job).toEqual({
      role: 'water',
      label: 'WATER CARRIER',
      slots: 1,
      radius: 2.6,
      post: { x: 2.2, z: 0.4 },
      output: '1 WATER / 4S',
    });
    expect(byId.farm.job).toEqual({
      role: 'farmer',
      label: 'FARMER',
      slots: 2,
      radius: 3.2,
      post: { x: 0, z: 3.3 },
      output: '1 FOOD / 7S',
      waterUse: '1 / 20S',
    });
    expect(byId.workshop.job).toEqual({
      role: 'artisan',
      label: 'ARTISAN',
      slots: 2,
      radius: 2.4,
      post: { x: 0, z: 2.75 },
    });
  });
});
