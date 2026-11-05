import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, SUPPORTED_VERSIONS, parseSave } from '../../src/core/save.js';

/**
 * Representative saves for every supported schema version. The fixtures are cumulative: each one
 * keeps the older fields and adds the fields that version introduced, so a migration test fails if a
 * version is dropped from `SUPPORTED_VERSIONS` or the version stamp stops being updated.
 *
 * No localStorage and no DOM: the storage adapter is tested separately.
 */

const SEED = 987654321;
const PLAYER = { x: 12.5, z: -8.25, heading: Math.PI / 4 };

function saveV1() {
  return {
    v: 1,
    seed: SEED,
    player: { ...PLAYER },
    state: {
      scrap: 26,
      water: 4,
      food: 4,
      kills: 0,
      health: 100,
      maxHealth: 100,
      time: 0,
    },
    equipment: { weapon: 'pistol' },
    buildings: [],
    scrap: [],
    timers: { prodTimer: 0, houseTimer: 0 },
  };
}

function saveV2() {
  const save = saveV1();
  save.v = 2;
  save.state.ammo = { pistol: 24, rifle: 0, shells: 0 };
  save.state.mags = { pistol: 12 };
  save.state.upgrades = { pistol: { damage: 1 } };
  return save;
}

function saveV3() {
  const save = saveV2();
  save.v = 3;
  save.buildings = [{ id: 1, type: 'campfire', x: 0, z: 0, charge: 0 }];
  save.power = { links: [] };
  return save;
}

function saveV4() {
  const save = saveV3();
  save.v = 4;
  save.buildings = [
    { id: 1, type: 'campfire', x: 0, z: 0, charge: 0, built: true, buildProgress: 1 },
    { id: 2, type: 'warehouse', x: 4, z: -2, charge: 0, built: false, buildProgress: 0.4 },
  ];
  return save;
}

function saveV5() {
  const save = saveV4();
  save.v = 5;
  save.state.food = 8;
  save.units = [
    {
      role: 'scavenger',
      active: true,
      home: 1,
      hp: 100,
      dead: false,
      left: false,
      hunger: 0,
      thirst: 0,
      x: 4,
      z: 2,
      equipment: { weapon: 'pistol' },
    },
  ];
  return save;
}

function saveV6() {
  const save = saveV5();
  save.v = 6;
  save.state.components = 3;
  save.state.nextRecruit = 4;
  save.units[0].active = true;
  save.buildings.push({
    id: 3,
    type: 'workshop',
    x: -3,
    z: 5,
    charge: 0,
    built: true,
    buildProgress: 1,
    recipe: 'pistol',
  });
  return save;
}

function saveV7() {
  const save = saveV6();
  save.v = 7;
  save.units[0].pending = false;
  save.units[0].morale = 72;
  save.units[0].leaveWarn = '';
  save.buildings[0].heading = Math.PI / 8;
  save.comms = { broadcastDay: 2, lastResult: 'NEWCOMER' };
  return save;
}

const fixtures = [
  ['v1', saveV1()],
  ['v2', saveV2()],
  ['v3', saveV3()],
  ['v4', saveV4()],
  ['v5', saveV5()],
  ['v6', saveV6()],
  ['v7', saveV7()],
];

describe('save migrations', () => {
  it.each(fixtures)('accepts a representative %s save and stamps the current version', (_name, save) => {
    const result = parseSave(JSON.stringify(save));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.v).toBe(SAVE_VERSION);
    expect(result.data.seed).toBe(SEED);
    expect(result.data.player).toEqual(PLAYER);
  });

  it('supports every schema version up to the current one', () => {
    expect(SUPPORTED_VERSIONS).toEqual([1, 2, 3, 4, 5, 6, SAVE_VERSION]);
  });

  it('parses a v1-shaped save that has no newer fields', () => {
    const save = saveV1();
    expect(save.units).toBeUndefined();
    expect(save.power).toBeUndefined();
    expect(save.comms).toBeUndefined();

    const result = parseSave(JSON.stringify(save));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.v).toBe(SAVE_VERSION);
  });

  it('rejects empty, invalid JSON and missing seeds', () => {
    expect(parseSave(null)).toEqual({ ok: false, reason: 'EMPTY' });
    expect(parseSave('')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(parseSave('{oops')).toEqual({ ok: false, reason: 'INVALID_JSON' });
    expect(parseSave(JSON.stringify({ v: SAVE_VERSION, player: PLAYER }))).toEqual({
      ok: false,
      reason: 'NO_SEED',
    });
    expect(parseSave(JSON.stringify({ v: SAVE_VERSION, seed: 'abc', player: PLAYER }))).toEqual({
      ok: false,
      reason: 'NO_SEED',
    });
  });

  it('rejects a future version', () => {
    const save = saveV7();
    save.v = SAVE_VERSION + 1;
    expect(parseSave(JSON.stringify(save))).toEqual({ ok: false, reason: 'UNSUPPORTED_VERSION' });
  });

  it('rejects an unsupported version', () => {
    for (const version of [0, -1, 1.5, 99]) {
      const save = saveV7();
      save.v = version;
      expect(parseSave(JSON.stringify(save))).toEqual({ ok: false, reason: 'UNSUPPORTED_VERSION' });
    }
  });
});
