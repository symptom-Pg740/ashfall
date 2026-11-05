import { describe, expect, it } from 'vitest';
import * as core from '../../../src/core/power.js';
import * as power from '../../../src/features/power/index.js';

describe('features/power public slice', () => {
  it('re-exports the pure power rules', () => {
    expect(power.canConnect).toBe(core.canConnect);
    expect(power.solvePower).toBe(core.solvePower);
    expect(power.linkKey).toBe(core.linkKey);
    expect(power.maxPorts).toBe(core.maxPorts);
    expect(power.POWER_SPAN).toBe(14);
    expect(power.WIRE_COST_PER_M).toBe(0.4);
  });

  it('validates a link through the public slice', () => {
    const a = { id: 'a', kind: 'source', x: 0, z: 0, built: true, ports: 2, links: 0 };
    const b = { id: 'b', kind: 'consumer', x: 10, z: 0, built: true, ports: 2, links: 0 };
    expect(power.canConnect(a, b, { scrap: 10, links: [] })).toMatchObject({
      ok: true,
      cost: 4,
    });
  });
});
