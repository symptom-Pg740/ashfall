import { describe, expect, it } from 'vitest';
import { validatePlacement } from '../../src/core/placement.js';

/** A plain structure definition, shaped like an entry from `content/buildings.js`. */
const def = (over = {}) => ({ id: 'house', cost: 18, radius: 3.45, ...over });

/** Placement input that passes every rule. Individual tests override one field. */
const input = (over = {}) => ({
  def: def(),
  x: 0,
  z: 0,
  buildings: [],
  obstacles: [],
  campRadius: 110,
  scrap: 100,
  components: 0,
  slope: 0,
  slopeLimit: 0.26,
  ...over,
});

describe('validatePlacement', () => {
  it('accepts a clear spot inside the camp', () => {
    expect(validatePlacement(input())).toEqual({ ok: true, reason: '' });
  });

  it('rejects when scrap is short', () => {
    expect(validatePlacement(input({ scrap: 17 }))).toEqual({
      ok: false,
      reason: 'NOT ENOUGH SCRAP',
    });
  });

  it('accepts an exact-cost purchase', () => {
    expect(validatePlacement(input({ scrap: 18 })).ok).toBe(true);
  });

  it('rejects outside the camp radius', () => {
    expect(validatePlacement(input({ x: 111 }))).toEqual({
      ok: false,
      reason: 'OUTSIDE THE CAMP',
    });
  });

  it('treats the camp edge as inside', () => {
    expect(validatePlacement(input({ x: 110 })).ok).toBe(true);
  });

  it('rejects uneven ground', () => {
    expect(validatePlacement(input({ slope: 0.27 }))).toEqual({
      ok: false,
      reason: 'UNEVEN GROUND',
    });
  });

  it('accepts ground at the slope limit', () => {
    expect(validatePlacement(input({ slope: 0.26 })).ok).toBe(true);
  });

  it('rejects a spot overlapping another structure', () => {
    const buildings = [{ type: 'house', x: 5, z: 0, radius: 3.15 }];
    expect(validatePlacement(input({ buildings }))).toEqual({
      ok: false,
      reason: 'BLOCKED BY STRUCTURE',
    });
  });

  it('accepts a spot exactly at the normal clearance', () => {
    const buildings = [{ type: 'house', x: 6.75, z: 0, radius: 3.15 }];
    expect(validatePlacement(input({ buildings })).ok).toBe(true);
  });

  it('rejects a spot overlapping wreckage', () => {
    const obstacles = [{ x: 4, z: 0, r: 1 }];
    expect(validatePlacement(input({ obstacles }))).toEqual({
      ok: false,
      reason: 'BLOCKED BY WRECKAGE',
    });
  });

  it('reports structures before wreckage', () => {
    const buildings = [{ type: 'house', x: 1, z: 0, radius: 3.15 }];
    const obstacles = [{ x: 1, z: 0, r: 1 }];
    expect(validatePlacement(input({ buildings, obstacles })).reason).toBe('BLOCKED BY STRUCTURE');
  });

  it('reports cost before camp bounds', () => {
    expect(validatePlacement(input({ scrap: 0, x: 500 })).reason).toBe('NOT ENOUGH SCRAP');
  });
});

describe('warehouse adjacency', () => {
  const warehouse = def({ id: 'warehouse', cost: 22, radius: 3.15 });

  it('allows two warehouses at 5.2m', () => {
    const buildings = [{ type: 'warehouse', x: 0, z: 0, radius: 3.15 }];
    expect(validatePlacement(input({ def: warehouse, x: 5.2, buildings }))).toEqual({
      ok: true,
      reason: '',
    });
  });

  it('blocks two warehouses closer than 5.2m', () => {
    const buildings = [{ type: 'warehouse', x: 0, z: 0, radius: 3.15 }];
    expect(validatePlacement(input({ def: warehouse, x: 5.19, buildings })).reason).toBe(
      'BLOCKED BY STRUCTURE',
    );
  });

  it('keeps normal clearance against a non-warehouse', () => {
    const buildings = [{ type: 'house', x: 5.2, z: 0, radius: 3.15 }];
    expect(validatePlacement(input({ def: warehouse, x: 0, buildings })).reason).toBe(
      'BLOCKED BY STRUCTURE',
    );
  });

  it('does not tighten clearance for non-warehouse structures', () => {
    const buildings = [{ type: 'warehouse', x: 5.2, z: 0, radius: 3.15 }];
    expect(validatePlacement(input({ x: 0, buildings })).reason).toBe('BLOCKED BY STRUCTURE');
  });
});
