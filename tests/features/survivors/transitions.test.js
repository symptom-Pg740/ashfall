import { describe, expect, it } from 'vitest';
import {
  canExpel,
  canWelcome,
  removePatch,
  welcomePatch,
} from '../../../src/features/survivors/transitions.js';

describe('newcomer transitions', () => {
  it('welcomes a pending newcomer into an accepted survivor', () => {
    const person = { pending: true, active: true, hp: 0, maxHp: 100, weapon: null };
    expect(canWelcome(person)).toBe(true);
    const patch = welcomePatch(person);
    expect(patch.pending).toBe(false);
    expect(patch.active).toBe(true);
    expect(patch.role).toBe('scavenger');
    expect(patch.hp).toBe(100);
    expect(patch.activity).toBe('idle');
  });

  it('does not welcome an accepted survivor twice', () => {
    expect(canWelcome({ pending: false, active: true })).toBe(false);
  });
});

describe('removal transitions', () => {
  it('marks a survivor as gone without killing them', () => {
    expect(canExpel({ active: true, pending: false, left: false, dead: false })).toBe(true);
    expect(canExpel({ active: true, pending: true, left: false, dead: false })).toBe(false);
    expect(removePatch()).toMatchObject({ active: false, dead: false, left: true, pending: false, activity: 'away' });
  });
});
