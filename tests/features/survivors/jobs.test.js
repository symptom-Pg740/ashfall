import { describe, expect, it } from 'vitest';
import { JOB, isRally, isScrapGather, isTravelJob, isWorkJob } from '../../../src/features/survivors/jobs.js';
import { ACTIVITY, deriveActivity, survivorStatus } from '../../../src/features/survivors/model.js';

describe('job kinds', () => {
  it('keeps rally and scrap gather separate', () => {
    expect(isRally({ type: JOB.RALLY, fire: {} })).toBe(true);
    expect(isRally({ type: JOB.GATHER, node: 1 })).toBe(false);
    expect(isScrapGather({ type: JOB.GATHER, node: 1 })).toBe(true);
    expect(isScrapGather({ type: JOB.RALLY, fire: {} })).toBe(false);
  });

  it('classifies travel and work jobs', () => {
    expect(isTravelJob({ type: JOB.MOVE })).toBe(true);
    expect(isTravelJob({ type: JOB.MAN })).toBe(true);
    expect(isTravelJob({ type: JOB.GATHER })).toBe(false);
    expect(isWorkJob({ type: JOB.RALLY })).toBe(true);
    expect(isWorkJob({ type: JOB.BUILD })).toBe(true);
  });
});

describe('rally activity', () => {
  it('is working, not a scrap trip', () => {
    const person = { dead: false, pending: false, onExpedition: false, manning: null, job: { type: JOB.RALLY, x: 0, z: 0 } };
    expect(deriveActivity(person)).toBe(ACTIVITY.WORKING);
    expect(survivorStatus(person).status).toBe('GATHERING AT THE FIRE');
  });
});
