import { describe, expect, it } from 'vitest';
import {
  advanceWorkTimer,
  atWorkPost,
  canAssignWorkplace,
  workLoopKind,
  workPost,
} from '../../../src/features/survivors/work.js';
import {
  arrivedAtMove,
  arrivedAtNode,
  arrivedAtRally,
  nextBuildProgress,
  nextRepairHp,
  withinManRange,
  withinWorkRange,
} from '../../../src/features/survivors/jobs.js';

const building = (overrides = {}) => ({
  x: 10,
  z: 4,
  radius: 2,
  built: true,
  destroyed: false,
  def: { job: { role: 'water', slots: 1, post: { x: 2, z: 0 } } },
  ...overrides,
});

const person = (overrides = {}) => ({
  active: true,
  dead: false,
  pending: false,
  onExpedition: false,
  home: null,
  ...overrides,
});

describe('workplace rules', () => {
  it('selects the work loop from the building job', () => {
    expect(workLoopKind(building())).toBe('water');
    expect(workLoopKind(building({ def: { job: { role: 'unknown' } } }))).toBeNull();
    expect(workLoopKind(null)).toBeNull();
  });

  it('computes the world post from the local offset', () => {
    expect(workPost(building(), { post: { x: 1, z: -1 } }, { x: 0, z: 0 })).toEqual({ x: 11, z: 3 });
  });

  it('checks the post radius', () => {
    expect(atWorkPost({ x: 12, z: 4 }, building(), { post: { x: 2, z: 0 } }, { x: 0, z: 0 })).toBe(true);
    expect(atWorkPost({ x: 20, z: 4 }, building(), { post: { x: 2, z: 0 } }, { x: 0, z: 0 })).toBe(false);
  });

  it('validates assignments', () => {
    expect(canAssignWorkplace(person(), building(), 0).ok).toBe(true);
    expect(canAssignWorkplace(person(), building(), 1).ok).toBe(false);
    expect(canAssignWorkplace(person({ pending: true }), building(), 0).ok).toBe(false);
    expect(canAssignWorkplace(person(), building({ built: false }), 0).ok).toBe(false);
    const b = building();
    expect(canAssignWorkplace(person({ home: b }), b, 1).ok).toBe(true);
  });

  it('advances repeating production timers', () => {
    expect(advanceWorkTimer(0, 1, 1, 4)).toEqual({ timer: 1, produced: false });
    expect(advanceWorkTimer(3.5, 1, 1, 4)).toEqual({ timer: 0.5, produced: true });
  });
});

describe('job phase helpers', () => {
  it('uses readable arrival radii', () => {
    expect(arrivedAtMove(0.5)).toBe(true);
    expect(arrivedAtMove(0.7)).toBe(false);
    expect(arrivedAtRally(0.7)).toBe(true);
    expect(arrivedAtNode(2)).toBe(true);
    expect(withinWorkRange(3.5, 2)).toBe(true);
    expect(withinWorkRange(4, 2)).toBe(false);
    expect(withinManRange(2.9)).toBe(true);
  });

  it('advances build and repair progress', () => {
    expect(nextBuildProgress(0.5, 1, 1, 2)).toEqual({ progress: 1, complete: true });
    expect(nextRepairHp(10, 1, 1, 100)).toEqual({ hp: 24, complete: false });
    expect(nextRepairHp(95, 1, 1, 100)).toEqual({ hp: 100, complete: true });
  });
});
