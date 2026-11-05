import { describe, expect, it } from 'vitest';
import { isAccepted } from '../../../src/features/survivors/index.js';
import {
  acceptedPeople,
  availableForWork,
  findRecruitSlot,
  isAvailableForAssignment,
  isAvailableForWork,
  isOnRoster,
  recruitPatch,
  roster,
} from '../../../src/features/survivors/roster.js';

const person = (overrides = {}) => ({
  active: true,
  left: false,
  dead: false,
  pending: false,
  possessed: false,
  onExpedition: false,
  manning: null,
  home: null,
  job: null,
  maxHp: 100,
  ...overrides,
});

describe('roster predicates', () => {
  it('distinguishes on-roster, accepted and available', () => {
    expect(isOnRoster(person())).toBe(true);
    expect(isOnRoster(person({ active: false }))).toBe(false);
    expect(isAccepted(person({ pending: true }))).toBe(false);
    expect(isAvailableForWork(person())).toBe(true);
    expect(isAvailableForWork(person({ home: {} }))).toBe(false);
    expect(isAvailableForAssignment(person({ home: {} }))).toBe(true);
    expect(isAvailableForAssignment(person({ job: {} }))).toBe(false);
  });

  it('filters the roster and work pool', () => {
    const people = [
      person(),
      person({ pending: true }),
      person({ onExpedition: true }),
      person({ left: true }),
      person({ home: {} }),
    ];
    expect(roster(people).length).toBe(3);
    expect(roster(people, { inCell: true, cellMembers: [people[2]] }).length).toBe(1);
    expect(acceptedPeople(people).length).toBe(3);
    expect(availableForWork(people).length).toBe(1);
  });
});

describe('newcomer recruitment', () => {
  it('finds a free pool slot', () => {
    const people = [person(), person({ active: false })];
    expect(findRecruitSlot(people)).toBe(people[1]);
    expect(findRecruitSlot([person()])).toBeNull();
  });

  it('creates a pending newcomer patch without touching the rig', () => {
    const patch = recruitPatch({ pending: true, x: 3, z: 4, maxHp: 120 });
    expect(patch).toMatchObject({
      active: true,
      pending: true,
      role: 'newcomer',
      hp: 120,
      activity: 'pending',
      anchor: { x: 3, z: 4 },
      holdTimer: 30,
    });
    expect(patch.job).toBeNull();
    expect(patch.home).toBeNull();
  });

  it('creates an accepted recruit when pending is false', () => {
    const patch = recruitPatch({ pending: false, x: 0, z: 0, maxHp: 100 });
    expect(patch.pending).toBe(false);
    expect(patch.role).toBe('scavenger');
    expect(patch.activity).toBe('idle');
    expect(patch.holdTimer).toBe(0);
  });
});
