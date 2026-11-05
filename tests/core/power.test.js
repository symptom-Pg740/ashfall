import { describe, expect, it } from 'vitest';
import {
  canConnect,
  linkKey,
  maxPorts,
  maxPortsForKind,
  solvePower,
  wireCost,
} from '../../src/core/power.js';

const link = (a, b) => ({ a, b });

const source = (id, output = 2) => ({ id, kind: 'source', output });
const relay = (id) => ({ id, kind: 'relay' });
const storage = (id, capacity = 10, charge = 0) => ({ id, kind: 'storage', capacity, charge });
const consumer = (id, demand = 1, priority = 1, nightOnly = false) => ({
  id,
  kind: 'consumer',
  demand,
  priority,
  nightOnly,
});

const site = (overrides = {}) => ({
  id: 'a',
  kind: 'source',
  x: 0,
  z: 0,
  built: true,
  destroyed: false,
  ports: 2,
  links: 0,
  name: 'SOLAR ARRAY',
  ...overrides,
});

const byId = (results) => new Map(results.map((result) => [result.id, result]));

describe('ports', () => {
  it('allows four ports on a relay and two on every other power kind', () => {
    expect(maxPortsForKind('relay')).toBe(4);
    expect(maxPortsForKind('source')).toBe(2);
    expect(maxPortsForKind('storage')).toBe(2);
    expect(maxPortsForKind('consumer')).toBe(2);
    expect(maxPortsForKind('wall')).toBe(0);
  });

  it('reads the kind from a plain node snapshot', () => {
    expect(maxPorts({ id: 1, kind: 'relay' })).toBe(4);
    expect(maxPorts({ id: 1, kind: 'consumer' })).toBe(2);
    expect(maxPorts(null)).toBe(0);
  });
});

describe('link keys and wire cost', () => {
  it('normalizes link order', () => {
    expect(linkKey(3, 1)).toBe('1:3');
    expect(linkKey({ id: 3 }, { id: 1 })).toBe('1:3');
    expect(linkKey(1, 3)).toBe(linkKey(3, 1));
  });

  it('charges per metre with a one-scrap minimum', () => {
    expect(wireCost(0)).toBe(1);
    expect(wireCost(0.1)).toBe(1);
    expect(wireCost(10)).toBe(4);
    expect(wireCost(10.1)).toBe(5);
  });
});

describe('canConnect', () => {
  it('accepts two built power nodes inside the span when scrap covers the wire', () => {
    const a = site();
    const b = site({ id: 'b', kind: 'consumer', x: 10, name: 'VICKERS' });
    expect(canConnect(a, b, { scrap: 4, links: [] })).toEqual({
      ok: true,
      reason: '',
      cost: 4,
      distance: 10,
    });
  });

  it('rejects a span beyond 14 m', () => {
    const a = site();
    const b = site({ id: 'b', kind: 'consumer', x: 20 });
    expect(canConnect(a, b, { scrap: 100, links: [] })).toEqual({
      ok: false,
      reason: 'OUT OF RANGE (20m)',
    });
  });

  it('accepts exactly 14 m', () => {
    const a = site();
    const b = site({ id: 'b', kind: 'consumer', x: 14 });
    expect(canConnect(a, b, { scrap: 100, links: [] }).ok).toBe(true);
  });

  it('rejects a duplicate link in either order', () => {
    const a = site();
    const b = site({ id: 'b', kind: 'consumer' });
    expect(canConnect(a, b, { scrap: 100, links: [link('a', 'b')] })).toEqual({
      ok: false,
      reason: 'ALREADY LINKED',
    });
    expect(canConnect(a, b, { scrap: 100, links: [link('b', 'a')] })).toEqual({
      ok: false,
      reason: 'ALREADY LINKED',
    });
  });

  it('rejects a node with no free port', () => {
    const fullSource = site({ links: 2 });
    const b = site({ id: 'b', kind: 'consumer' });
    expect(canConnect(fullSource, b, { scrap: 100, links: [] })).toEqual({
      ok: false,
      reason: 'SOLAR ARRAY PORTS FULL',
    });

    const fullRelay = site({ id: 'r', kind: 'relay', ports: 4, links: 4, name: 'POWER POLE' });
    expect(canConnect(fullRelay, b, { scrap: 100, links: [] })).toEqual({
      ok: false,
      reason: 'POWER POLE PORTS FULL',
    });
  });

  it('rejects when scrap cannot cover the wire', () => {
    const a = site();
    const b = site({ id: 'b', kind: 'consumer', x: 10 });
    expect(canConnect(a, b, { scrap: 3, links: [] })).toEqual({
      ok: false,
      reason: 'NEED 4 SCRAP',
      cost: 4,
    });
    expect(canConnect(a, b, { scrap: 4, links: [] }).ok).toBe(true);
  });

  it('rejects sites, non-power nodes and the same node', () => {
    const a = site();
    const b = site({ id: 'b', kind: 'consumer' });
    expect(canConnect(null, b, { scrap: 100, links: [] }).reason).toBe('PICK TWO STRUCTURES');
    expect(canConnect(a, a, { scrap: 100, links: [] }).reason).toBe('PICK TWO STRUCTURES');
    expect(canConnect(a, { ...b, built: false }, { scrap: 100, links: [] }).reason).toBe(
      'SITE NOT READY',
    );
    expect(canConnect(a, { ...b, destroyed: true }, { scrap: 100, links: [] }).reason).toBe(
      'SITE NOT READY',
    );
    expect(canConnect(a, { ...b, kind: 'wall' }, { scrap: 100, links: [] }).reason).toBe(
      'NOT A POWER NODE',
    );
    expect(canConnect(a, { ...a }, { scrap: 100, links: [] }).reason).toBe(
      'PICK TWO STRUCTURES',
    );
  });
});

describe('solvePower', () => {
  it('powers consumers in priority order when production is short', () => {
    const nodes = [source('s', 1), consumer('low', 1, 1), consumer('high', 1, 5)];
    const links = [link('s', 'low'), link('s', 'high')];
    const { info, results } = solvePower(nodes, links, { dt: 1, daylight: 1 });
    const patch = byId(results);

    expect(patch.get('high').powered).toBe(true);
    expect(patch.get('low').powered).toBe(false);
    expect(info).toEqual({
      output: 1,
      demand: 2,
      battery: 0,
      capacity: 0,
      powered: false,
      hasGrid: true,
      note: 'DEFICIT · ADD POWER',
    });
  });

  it('charges batteries from surplus after consumers are paid', () => {
    const nodes = [source('s', 2), consumer('c', 1), storage('bat', 10, 0)];
    const links = [link('s', 'c'), link('s', 'bat')];
    const { info, results } = solvePower(nodes, links, { dt: 1, daylight: 1 });

    expect(byId(results).get('c').powered).toBe(true);
    expect(byId(results).get('bat').charge).toBe(1);
    expect(info.battery).toBe(1);
    expect(info.capacity).toBe(10);
    expect(info.note).toBe('SOLAR ONLINE');
  });

  it('splits stored charge evenly across batteries and clamps to capacity', () => {
    const nodes = [
      source('s', 4),
      consumer('c', 1),
      storage('b1', 5, 0),
      storage('b2', 5, 0),
    ];
    const links = [link('s', 'c'), link('s', 'b1'), link('s', 'b2')];
    const { info, results } = solvePower(nodes, links, { dt: 1, daylight: 1 });

    expect(byId(results).get('b1').charge).toBe(1.5);
    expect(byId(results).get('b2').charge).toBe(1.5);
    expect(info.battery).toBe(3);
    expect(info.capacity).toBe(10);
  });

  it('clamps an overcharged battery to its capacity', () => {
    const { info, results } = solvePower([storage('bat', 10, 20)], [], {
      dt: 1,
      daylight: 1,
    });

    expect(byId(results).get('bat').charge).toBe(10);
    expect(info.battery).toBe(10);
    expect(info.note).toBe('IDLE · 10 STORED');
  });

  it('draws from a battery at night', () => {
    const nodes = [source('s', 2), storage('bat', 10, 5), consumer('c', 1)];
    const links = [link('s', 'bat'), link('s', 'c')];
    const { info, results } = solvePower(nodes, links, { dt: 1, daylight: 0 });

    expect(byId(results).get('c').powered).toBe(true);
    expect(byId(results).get('bat').charge).toBe(4);
    expect(info.output).toBe(0);
    expect(info.battery).toBe(4);
    expect(info.note).toBe('BATTERY · NIGHT');
  });

  it('ignores night-only consumers during the day and preserves their powered flag', () => {
    const nodes = [source('s', 2), consumer('lamp', 0.5, 1, true)];
    const links = [link('s', 'lamp')];
    const day = solvePower(nodes, links, { dt: 1, daylight: 0.5 });

    expect(day.info.demand).toBe(0);
    expect(day.info.note).toBe('GRID READY');
    expect(byId(day.results).get('lamp').powered).toBe(null);
  });

  it('activates a night-only consumer below the night threshold', () => {
    const nodes = [source('s', 4), consumer('lamp', 0.5, 1, true)];
    const links = [link('s', 'lamp')];
    const night = solvePower(nodes, links, { dt: 1, daylight: 0.2 });

    expect(night.info.demand).toBe(0.5);
    expect(byId(night.results).get('lamp').powered).toBe(true);
  });

  it('scales source output by daylight', () => {
    const nodes = [source('s', 2), consumer('c', 1)];
    const links = [link('s', 'c')];
    const half = solvePower(nodes, links, { dt: 1, daylight: 0.5 });

    expect(half.info.output).toBe(1);
    expect(byId(half.results).get('c').powered).toBe(true);
    expect(half.info.note).toBe('SOLAR ONLINE');

    const dim = solvePower(nodes, links, { dt: 1, daylight: 0.25 });
    expect(dim.info.output).toBe(0.5);
    expect(byId(dim.results).get('c').powered).toBe(false);
    expect(dim.info.note).toBe('DEFICIT · ADD POWER');
  });

  it('reports a deficit when demand exceeds production', () => {
    const nodes = [source('s', 0.5), consumer('c', 1)];
    const { info, results } = solvePower(nodes, [link('s', 'c')], { dt: 1, daylight: 1 });

    expect(byId(results).get('c').powered).toBe(false);
    expect(info.demand).toBe(1);
    expect(info.output).toBe(0.5);
    expect(info.powered).toBe(false);
    expect(info.note).toBe('DEFICIT · ADD POWER');
  });

  it('distinguishes no grid, no source, an empty battery and a ready grid', () => {
    expect(solvePower([], [], { dt: 1, daylight: 1 }).info).toMatchObject({
      hasGrid: false,
      powered: false,
      note: 'NO GRID · SOLAR + POLES',
    });

    expect(solvePower([consumer('c', 1)], [], { dt: 1, daylight: 1 }).info.note).toBe(
      'NO SOURCE · BUILD SOLAR',
    );

    expect(
      solvePower([source('s', 2), consumer('c', 1)], [link('s', 'c')], {
        dt: 1,
        daylight: 0,
      }).info.note,
    ).toBe('BATTERY EMPTY');

    expect(
      solvePower([source('s', 2), consumer('c', 1)], [link('s', 'c')], {
        dt: 1,
        daylight: 1,
      }).info.note,
    ).toBe('SOLAR ONLINE');
  });

  it('keeps disconnected components independent', () => {
    const nodes = [
      source('s', 2),
      consumer('wired', 1),
      consumer('island', 1),
    ];
    const { info, results } = solvePower(nodes, [link('s', 'wired')], {
      dt: 1,
      daylight: 1,
    });

    expect(byId(results).get('wired').powered).toBe(true);
    expect(byId(results).get('island').powered).toBe(false);
    expect(info.demand).toBe(2);
    expect(info.powered).toBe(false);
  });

  it('uses dt for energy and demand per tick', () => {
    const nodes = [source('s', 2), consumer('c', 1)];
    const { info, results } = solvePower(nodes, [link('s', 'c')], {
      dt: 0.5,
      daylight: 1,
    });

    expect(byId(results).get('c').powered).toBe(true);
    expect(info.demand).toBe(1);
    expect(info.output).toBe(2);
  });

  it('marks every node in an energized component', () => {
    const nodes = [source('s', 2), relay('r'), consumer('c', 1)];
    const links = [link('s', 'r'), link('r', 'c')];
    const { results } = solvePower(nodes, links, { dt: 1, daylight: 1 });
    const patch = byId(results);

    expect(patch.get('s').energized).toBe(true);
    expect(patch.get('r').energized).toBe(true);
    expect(patch.get('c').energized).toBe(true);
    expect(patch.get('c').powered).toBe(true);
  });
});
