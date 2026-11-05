import { describe, expect, it } from 'vitest';
import {
  ACTIVITY,
  canIssueJob,
  deriveActivity,
  survivorStatus,
} from '../../../src/features/survivors/model.js';

const base = (overrides = {}) => ({
  dead: false,
  pending: false,
  onExpedition: false,
  manning: null,
  job: null,
  carry: 0,
  home: null,
  armed: false,
  attention: null,
  ...overrides,
});

describe('deriveActivity', () => {
  it('derives the explicit lifecycle states', () => {
    expect(deriveActivity(base({ pending: true }))).toBe(ACTIVITY.PENDING);
    expect(deriveActivity(base({ dead: true }))).toBe(ACTIVITY.DOWNED);
    expect(deriveActivity(base({ onExpedition: true }))).toBe(ACTIVITY.AWAY);
    expect(deriveActivity(base({ manning: {} }))).toBe(ACTIVITY.GUARDING);
    expect(deriveActivity(base())).toBe(ACTIVITY.IDLE);
  });

  it('derives moving, working and fighting from jobs', () => {
    expect(deriveActivity(base({ job: { type: 'move', x: 1, z: 1 } }))).toBe(ACTIVITY.MOVING);
    expect(deriveActivity(base({ job: { type: 'attack' } }))).toBe(ACTIVITY.FIGHTING);
    expect(deriveActivity(base({ job: { type: 'gather', phase: 'harvest' } }))).toBe(ACTIVITY.WORKING);
    expect(deriveActivity(base({ job: { type: 'gather', phase: 'toNode' } }))).toBe(ACTIVITY.MOVING);
  });

  it('uses the unit position to distinguish building vs travelling', () => {
    const building = { x: 0, z: 0, radius: 2, def: { name: 'WAREHOUSE' } };
    expect(deriveActivity(base({ job: { type: 'build', building } }), { x: 20, z: 0 })).toBe(ACTIVITY.MOVING);
    expect(deriveActivity(base({ job: { type: 'build', building } }), { x: 1, z: 0 })).toBe(ACTIVITY.WORKING);
  });
});

describe('survivorStatus', () => {
  it('reports newcomers and attention reasons', () => {
    expect(survivorStatus(base({ pending: true })).status).toBe('WAITING AT THE FIRE');
    expect(survivorStatus(base({ attention: 'NO PATH' })).reasonCode).toBe('NO PATH');
  });

  it('reports job progress', () => {
    expect(survivorStatus(base({ job: { type: 'gather', phase: 'return' }, carry: 7 })).status).toBe('HAULING 7');
    expect(survivorStatus(base({ job: { type: 'attack' } })).status).toBe('ENGAGING');
  });
});

describe('canIssueJob', () => {
  it('rejects downed and pending units', () => {
    expect(canIssueJob(base({ dead: true }), { type: 'move' }).ok).toBe(false);
    expect(canIssueJob(base({ pending: true }), { type: 'move' }).ok).toBe(false);
  });

  it('rejects unarmed attack and invalid build/repair', () => {
    expect(canIssueJob(base(), { type: 'attack' }).ok).toBe(false);
    expect(canIssueJob(base({ weapon: {} }), { type: 'attack' }).ok).toBe(true);
    expect(canIssueJob(base(), { type: 'build', building: { built: true } }).ok).toBe(false);
    expect(canIssueJob(base(), { type: 'repair', building: { built: true, hp: 10, maxHp: 10 } }).ok).toBe(false);
  });
});
