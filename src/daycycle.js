import * as THREE from 'three';
import { SUN_DIR } from './sky.js';

/**
 * Time of day for Ashfall.
 *
 * One cycle is six minutes: ~3.2 min day, ~0.8 min dawn/dusk and ~2 min night. The cycle drives the
 * sky gradient, sun/moon direction and colour, ambient fill, fog, exposure and the solar output
 * curve. `state.time` is the clock, so saves resume at the same time of day for free.
 */

const CYCLE = 360;
const START_HOUR = 6;
// A fresh run starts at 09:00, not dawn, so the opening view keeps its warm daylight look.
const PHASE_OFFSET = 0.125;

const DAY = {
  top: '#6f9ab7', mid: '#d6b081', horizon: '#e6c08c',
  sun: '#fff0cc', hemi: '#a9c6d8', ground: '#b07f53', fog: '#d0ac7c',
};
const DUSK = {
  top: '#3f4a6b', mid: '#b06c58', horizon: '#e09a58',
  sun: '#ff9a5c', hemi: '#7a7f9f', ground: '#8a5f49', fog: '#a97a60',
};
const NIGHT = {
  top: '#070d18', mid: '#101a2c', horizon: '#1d2a40',
  sun: '#9fb8dd', hemi: '#3b4b6a', ground: '#1b2028', fog: '#141d2b',
};

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const _day = new THREE.Color();
const _dusk = new THREE.Color();
const _night = new THREE.Color();
const _out = new THREE.Color();

function blend(key, tDay, tDusk, tNight, target) {
  _day.set(DAY[key]).multiplyScalar(tDay);
  _dusk.set(DUSK[key]).multiplyScalar(tDusk);
  _night.set(NIGHT[key]).multiplyScalar(tNight);
  return target.copy(_day).add(_dusk).add(_night);
}

export class DayCycle {
  constructor({ atmosphere, scene, renderer, state }) {
    this.atmosphere = atmosphere;
    this.scene = scene;
    this.renderer = renderer;
    this.state = state;
    this.cycle = CYCLE;
    this.day = 1;
    this.phase = 0;
    this.daylight = 1;
    this.midnight = false;
    this._info = { clock: '06:00', day: 1, daylight: 1, night: false };
    this._fog = new THREE.Color();
    this.update(0);
  }

  /** 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight. */
  update(dt) {
    const t = (((this.state.time / CYCLE + PHASE_OFFSET) % 1) + 1) % 1;
    this.phase = t;
    this.day = 1 + Math.floor(this.state.time / CYCLE);

    const elevation = Math.sin(t * Math.PI * 2);
    const tDay = smoothstep(0.12, 0.42, elevation);
    const tNight = smoothstep(-0.02, -0.3, elevation);
    const tDusk = Math.max(0, 1 - tDay - tNight);
    this.daylight = smoothstep(0.02, 0.3, elevation);
    this.midnight = tNight > 0.6;

    // Sun/moon direction. At night the light comes from a high, cool moon so shadows stay readable.
    const az = t * Math.PI * 2;
    SUN_DIR.set(Math.cos(az), Math.max(0.14, elevation), Math.sin(az) * 0.45 + 0.2).normalize();

    const atmo = this.atmosphere;
    atmo.skyMat.uniforms.sunDir.value.copy(SUN_DIR);
    blend('top', tDay, tDusk, tNight, atmo.skyMat.uniforms.topColor.value);
    blend('mid', tDay, tDusk, tNight, atmo.skyMat.uniforms.midColor.value);
    blend('horizon', tDay, tDusk, tNight, atmo.skyMat.uniforms.horizonColor.value);
    blend('sun', tDay, tDusk, tNight, atmo.skyMat.uniforms.sunColor.value);

    atmo.sun.intensity = 0.5 + 3.5 * tDay + 1.2 * tDusk;
    atmo.sun.color.copy(atmo.skyMat.uniforms.sunColor.value);
    atmo.hemi.intensity = 0.28 + 0.45 * tDay + 0.25 * tDusk;
    blend('hemi', tDay, tDusk, tNight, atmo.hemi.color);
    blend('ground', tDay, tDusk, tNight, atmo.hemi.groundColor);
    atmo.fill.intensity = 0.1 + 0.15 * tDay;

    blend('fog', tDay, tDusk, tNight, this._fog);
    this.scene.fog.color.copy(this._fog);
    this.scene.fog.density = 0.008 + 0.003 * tNight;
    this.renderer.setClearColor(this._fog, 1);
    this.renderer.toneMappingExposure = 0.92 + 0.08 * tDay + 0.05 * tDusk;
    this.scene.environmentIntensity = 0.14 + 0.21 * tDay + 0.1 * tDusk;

    // 06:00 at phase 0, noon at 0.25, 18:00 at 0.5, midnight at 0.75.
    const minutes = (START_HOUR * 60 + t * 24 * 60) % 1440;
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(Math.floor(minutes % 60)).padStart(2, '0');
    this._info.clock = `${hh}:${mm}`;
    this._info.day = this.day;
    this._info.daylight = this.daylight;
    this._info.night = this.midnight;
    return this._info;
  }

  get info() {
    return this._info;
  }
}
