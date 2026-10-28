import { capsule, pose, rbox, ring, setRegionUV, smoothMerge } from './charparts.js';
import { shade } from './character.js';

/**
 * Weapon definitions and procedural gun geometry.
 *
 * The gun is authored along the hand's -Y axis (the convention used by the existing blade): grip at
 * the hand, barrel forward. The muzzle/foregrip `Object3D`s are placed from the metadata below by
 * `skinned.js`, so firing does not have to know the mesh layout.
 */

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'SCRAP PISTOL',
    damage: 18,
    rpm: 300,
    pellets: 1,
    spread: 1.2,
    range: 22,
    visualSpeed: 140,
    magazine: 12,
    reload: 1.3,
    recoil: 1,
    shake: 0.04,
    mode: 'semi',
    twoHanded: false,
    hold: { forward: 0.3, right: 0.06, up: 0.04 },
    muzzle: { x: 0, y: -0.375, z: 0.008 },
    foregrip: null,
  },
};

export function isFirearm(id) {
  return !!WEAPONS[id];
}

export function getWeapon(id) {
  return WEAPONS[id] || null;
}

function buildPistol(spec) {
  const metalDark = '#5c5e60';
  const metal = '#9a9c9d';
  const wood = '#5a3f2b';
  const p = [];

  // Grip sits in the palm; receiver and barrel run forward down -Y.
  p.push(setRegionUV(rbox(0.036, 0.1, 0.05, 0.008, wood, 0, 0.005, 0.012, -0.18), 'leather'));
  p.push(setRegionUV(rbox(0.05, 0.2, 0.06, 0.01, metal, 0, -0.09, 0), 'metal'));
  p.push(setRegionUV(rbox(0.044, 0.1, 0.052, 0.008, metalDark, 0, -0.22, 0.004), 'metal'));
  p.push(setRegionUV(capsule(0.015, 0.17, metal, 0, -0.27, 0.006), 'metal'));
  p.push(setRegionUV(ring(0.024, 0.005, metalDark, 0, -0.355, 0.006), 'metal'));

  // Trigger guard, sight, magazine floor.
  const guard = ring(0.032, 0.006, metalDark);
  pose(guard, 0, -0.075, 0.045, 0, Math.PI / 2, 0);
  p.push(setRegionUV(guard, 'metal'));
  p.push(setRegionUV(rbox(0.012, 0.018, 0.03, 0.003, metalDark, 0, -0.19, 0.032), 'metal'));
  p.push(setRegionUV(rbox(0.034, 0.024, 0.046, 0.004, metalDark, 0, 0.06, 0.012), 'metal'));
  p.push(setRegionUV(rbox(0.038, 0.07, 0.014, 0.005, shade(wood, 1.1), 0, 0.015, 0.04, -0.18), 'leather'));

  return [{ bone: 'arms.R.hand', geometry: smoothMerge(p) }];
}

export function buildWeaponParts(id, spec) {
  if (id === 'pistol') return buildPistol(spec);
  return [];
}
