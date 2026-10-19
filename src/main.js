import * as THREE from 'three';
import { createTerrain, heightAt } from './terrain.js';
import { createAtmosphere, SUN_DIR } from './sky.js';
import { createWasteland } from './props.js';
import { ScrapField } from './resources.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Particles } from './particles.js';
import { Settlement, BUILDINGS } from './settlement.js';
import { Perf, QUALITY } from './perf.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { paint } from './geo.js';

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  stencil: false,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.info.autoReset = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 220);

function applyCameraFraming() {
  const portrait = window.innerHeight > window.innerWidth;
  camera.fov = portrait ? 44 : 34;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
applyCameraFraming();

const atmosphere = createAtmosphere(scene, renderer);
createTerrain(scene);
const wasteland = createWasteland(scene, 0x51a7);
const particles = new Particles(scene);
const scrapField = new ScrapField(scene, 0x5c4a9);
const player = new Player(scene);
const enemies = new Enemies(scene, 0x6d0f1);

const state = {
  started: false,
  dead: false,
  deadAt: 0,
  scrap: 26,
  water: 0,
  kills: 0,
  health: 100,
  maxHealth: 100,
  time: 0,
  lastDamage: -99,
};

const ui = new UI();
const settlement = new Settlement({
  scene,
  particles,
  state,
  onWater: (n) => {
    state.water = Math.min(999, state.water + n);
  },
  onKill: (x, z) => {
    state.kills++;
    state.scrap += 2;
    particles.burst(x, heightAt(x, z) + 0.7, z, '#a8c07a', 12, 2.6);
  },
  onScrap: (n) => {
    state.scrap += n;
  },
  obstacles: wasteland.obstacles,
});
const perf = new Perf(renderer);

// ---------------------------------------------------------------------------
// input wiring
// ---------------------------------------------------------------------------

const input = new Input(canvas, camera, {
  strike: doStrike,
  gather: doGather,
  buildToggle: toggleBuild,
  buildClose: closeBuild,
  buildSelect: selectBuilding,
  place: doPlace,
  cancelPlace: cancelPlacement,
  perf: () => ui.togglePerf(),
  fullscreen: () => ui.handleFullscreenGesture(),
  cancel: () => {
    if (settlement.placing) cancelPlacement();
    else if (ui.buildOpen) closeBuild();
    else if (ui.perfOpen) ui.togglePerf(false);
  },
  isPlacing: () => settlement.placing,
  playerY: () => player.pos.y,
  aim: (x, z) => {
    if (!settlement.placing) return;
    settlement.moveGhost(x, z, player);
    ui.setPlaceStatus(settlement.canPlace, settlement.reason);
  },
});

let nearScrap = -1;
let shadowsOn = true;
let shadowAutoFallback = false;
let autoLowTime = 0;
window.__ashfall = {
  state,
  ui,
  settlement,
  player,
  enemies,
  perf,
  renderer,
  scene,
  camera,
  scrapField,
  wasteland,
  input,
  actions: { doPlace, doGather, doStrike, doStress, applyQuality },
};
let spawnAt = 0;
let spawnWarned = false;
let nextSpawnGap = 16;
let cameraShake = 0;
let lastUIUpdate = 0;
let stressMesh = null;
let boundaryWarned = false;

ui.on('started', () => {
  if (state.started) return;
  state.started = true;
  input.setEnabled(true);
  spawnAt = state.time + 45;
  spawnWarned = false;
  ui.hint('SCAVENGE · BUILD · KEEP THE FIRE BURNING', 3800);
  ui.toast('THE WASTES ARE LISTENING');
  last = performance.now();
});

ui.on('buildToggle', toggleBuild);
ui.on('buildClose', closeBuild);
ui.on('buildSelect', selectBuilding);
ui.on('place', doPlace);
ui.on('cancelPlace', cancelPlacement);
ui.on('strike', doStrike);
ui.on('gather', doGather);
ui.on('quality', (name) => applyQuality(name));
ui.on('toggle', (key, value) => {
  if (key === 'adaptive') {
    perf.setAdaptive(value);
  } else if (key === 'fog') {
    scene.fog.density = value ? QUALITY[perf.quality].fogDensity : 0.0001;
  } else if (key === 'grass') {
    wasteland.grass.visible = value;
  } else if (key === 'embers') {
    particles.setEmbersVisible(value);
  } else if (key === 'shadows') {
    applyShadowState(value, QUALITY[perf.quality].shadowSize);
  }
});
ui.on('stress', (kind) => doStress(kind));

function applyShadowState(enabled, size) {
  const changed = enabled !== shadowsOn;
  shadowsOn = enabled;
  atmosphere.setShadowQuality(enabled, size);
  if (changed) {
    // Shadow defines are baked into compiled programs; refresh once on toggle.
    scene.traverse((obj) => {
      const material = obj.material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const m of materials) m.needsUpdate = true;
    });
  }
}

function applyQuality(name, silent = false) {
  if (!QUALITY[name]) return;
  perf.setQuality(name);
  const q = QUALITY[name];
  wasteland.grass.count = Math.min(wasteland.grass.instanceMatrix.count, q.grass);
  particles.setEmberCount(q.embers);
  scene.fog.density = ui.toggleState.fog ? q.fogDensity : 0.0001;
  enemies.maxActive = q.enemies;
  applyShadowState(q.shadows, q.shadowSize);
  ui.setQuality(name);
  ui.setToggle('adaptive', perf.adaptive);
  ui.setToggle('shadows', q.shadows);
  if (!silent) ui.toast(`QUALITY · ${name.toUpperCase()}`);
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

function toggleBuild() {
  if (!state.started || state.dead) return;
  if (ui.buildOpen) {
    closeBuild();
    return;
  }
  settlement.cancel();
  ui.showBuildMenu(true);
  ui.setSelectedBuilding(null);
  ui.setPlaceStatus(false, 'Pick a structure');
  ui.hint('PICK A STRUCTURE · THEN AIM ON THE GROUND', 3000);
}

function closeBuild() {
  settlement.cancel();
  ui.showBuildMenu(false);
  ui.showPlacement(false);
}

function selectBuilding(idOrIndex) {
  if (!state.started || state.dead) return;
  const def = typeof idOrIndex === 'number' ? BUILDINGS[idOrIndex] : BUILDINGS.find((b) => b.id === idOrIndex);
  if (!def) return;
  if (!ui.buildOpen) ui.showBuildMenu(true);
  settlement.cancel();
  settlement.begin(def.id, player);
  ui.setSelectedBuilding(def.id);
  ui.showPlacement(true, def);
  ui.setPlaceStatus(settlement.canPlace, settlement.reason);
  ui.hint(`${def.name} · ${def.cost} SCRAP · TAP THE GROUND TO AIM`, 3000);
}

function cancelPlacement() {
  settlement.cancel();
  ui.showPlacement(false);
  ui.setSelectedBuilding(null);
}

function doPlace() {
  if (!settlement.placing) return;
  if (!settlement.canPlace) {
    ui.toast(settlement.reason || 'INVALID SPOT', true);
    return;
  }
  const res = settlement.place(player);
  if (!res.ok) {
    ui.toast(res.reason, true);
    return;
  }
  state.scrap -= res.cost;
  if (res.building.type === 'chapel') {
    state.maxHealth += 25;
    state.health = Math.min(state.maxHealth, state.health + 25);
    ui.toast('SANCTUARY · +25 MAX VITALITY');
  } else {
    state.health = Math.min(state.maxHealth, state.health + 2);
    ui.toast(`${res.building.def.name} RAISED`);
  }
  ui.updateHUD(state);
  ui.setPlaceStatus(settlement.canPlace, settlement.reason);
  cameraShake = Math.max(cameraShake, 0.12);
}

function doGather() {
  if (!state.started || state.dead || settlement.placing) return;
  if (nearScrap < 0) {
    ui.toast('NOTHING TO SCAVENGE HERE', true);
    return;
  }
  const node = scrapField.nodes[nearScrap];
  const value = scrapField.gather(nearScrap, state.time);
  if (!value) return;
  state.scrap += value;
  particles.burst(node.x, node.y + 0.5, node.z, '#ffc37a', 16, 2.8);
  ui.toast(`+${value} SCRAP`);
  ui.updateHUD(state);
  nearScrap = -1;
  ui.setGather(false);
  player.strike();
}

function doStrike() {
  if (!state.started || state.dead) return;
  if (!player.strike()) return;
  const hits = enemies.strike(player.x, player.z, 2.55, 34);
  if (hits.length) {
    let kills = 0;
    for (const hit of hits) {
      particles.burst(hit.x, heightAt(hit.x, hit.z) + 0.8, hit.z, hit.killed ? '#a8c07a' : '#c4644a', hit.killed ? 16 : 7, 2.2);
      if (hit.killed) kills++;
    }
    if (kills) {
      state.kills += kills;
      state.scrap += kills * 2;
      ui.updateHUD(state);
      ui.toast(`+${kills * 2} SCRAP`);
    }
    cameraShake = Math.max(cameraShake, 0.3);
  }
}

function doStress(kind) {
  if (!state.started) {
    ui.toast('ENTER THE WASTELAND FIRST', true);
    return;
  }
  if (kind === 'debris') {
    if (!stressMesh) {
      const geo = paint(new THREE.BoxGeometry(0.5, 0.5, 0.5), '#8a5b3f');
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      stressMesh = new THREE.InstancedMesh(geo, material, 600);
      stressMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      stressMesh.frustumCulled = false;
      const o = new THREE.Object3D();
      for (let i = 0; i < 600; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 42;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        o.position.set(x, heightAt(x, z) + 0.3, z);
        o.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
        o.scale.setScalar(0.5 + Math.random() * 1.4);
        o.updateMatrix();
        stressMesh.setMatrixAt(i, o.matrix);
      }
      stressMesh.instanceMatrix.needsUpdate = true;
      stressMesh.count = 0;
      scene.add(stressMesh);
    }
    stressMesh.count = Math.min(600, stressMesh.count + 100);
    ui.toast(`STRESS · ${stressMesh.count} DEBRIS INSTANCES`);
  } else if (kind === 'ghouls') {
    const spawned = enemies.spawn(20, player.x, player.z, 22);
    ui.toast(`STRESS · ${spawned} GHOULS INBOUND`);
    cameraShake = 0.2;
  } else if (kind === 'clear') {
    if (stressMesh) stressMesh.count = 0;
    enemies.clear();
    ui.toast('STRESS SCENE CLEARED');
  }
}

// ---------------------------------------------------------------------------
// damage / death
// ---------------------------------------------------------------------------

enemies.onPlayerHit = (amount, enemy) => {
  if (state.dead || !state.started) return;
  state.health -= amount;
  state.lastDamage = state.time;
  player.hit();
  ui.flashDamage();
  cameraShake = Math.max(cameraShake, 0.35);
  if (state.health <= 0) {
    state.health = 0;
    state.dead = true;
    state.deadAt = state.time;
    if (ui.buildOpen) closeBuild();
    ui.showDeath(true);
    ui.setGather(false);
    ui.hideHint();
    ui.toast('YOU DIED', true);
  }
};

function respawn() {
  state.dead = false;
  state.health = state.maxHealth;
  state.lastDamage = state.time;
  state.scrap = Math.floor(state.scrap * 0.8);
  player.pos.set(0, heightAt(0, 4.5), 4.5);
  player.heading = 0;
  player.targetHeading = 0;
  ui.showDeath(false);
  ui.updateHUD(state);
  cameraShake = 0;
  spawnAt = state.time + 25;
  spawnWarned = false;
  ui.hint('THE CAMP DRAGS YOU BACK', 2600);
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

const camTarget = new THREE.Vector3(player.x, player.pos.y, player.z);
const camDesired = new THREE.Vector3();
const lookAhead = new THREE.Vector3();
let cameraReady = false;

function collidePlayer() {
  let x = player.pos.x;
  let z = player.pos.z;
  const push = (ox, oz, r) => {
    const dx = x - ox;
    const dz = z - oz;
    const d = Math.hypot(dx, dz);
    if (d > 0.0001 && d < r) {
      x = ox + (dx / d) * r;
      z = oz + (dz / d) * r;
    }
  };
  for (const o of wasteland.obstacles) push(o.x, o.z, o.r + 0.4);
  for (const b of settlement.buildings) push(b.x, b.z, b.radius + 0.35);
  const d = Math.hypot(x, z);
  if (d > 50) {
    x *= 50 / d;
    z *= 50 / d;
  }
  player.pos.x = x;
  player.pos.z = z;
}

function updateCamera(dt, moveX, moveZ) {
  const portrait = window.innerHeight > window.innerWidth;
  const height = portrait ? 30 : 24;
  const back = portrait ? 32 : 28;

  lookAhead.x = THREE.MathUtils.damp(lookAhead.x, moveX * 1.25, 4, dt);
  lookAhead.z = THREE.MathUtils.damp(lookAhead.z, moveZ * 1.25, 4, dt);

  camTarget.x = THREE.MathUtils.damp(camTarget.x, player.x + lookAhead.x, 7, dt);
  camTarget.z = THREE.MathUtils.damp(camTarget.z, player.z + lookAhead.z, 7, dt);
  camTarget.y = THREE.MathUtils.damp(camTarget.y, player.pos.y, 5, dt);

  camDesired.set(camTarget.x, camTarget.y + height, camTarget.z + back);
  if (!cameraReady) {
    camera.position.copy(camDesired);
    cameraReady = true;
  } else {
    const l = 1 - Math.exp(-7 * dt);
    camera.position.lerp(camDesired, l);
  }
  camera.lookAt(camTarget.x, camTarget.y + 0.55, camTarget.z - 1.4);

  // keep the shadow volume centred on the visible camp
  atmosphere.sun.target.position.set(camTarget.x, 0, camTarget.z - 4);
  atmosphere.sun.position
    .copy(atmosphere.sun.target.position)
    .addScaledVector(SUN_DIR, 60);
  atmosphere.sun.target.updateMatrixWorld();

  if (cameraShake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake * 0.6;
    camera.position.z += (Math.random() - 0.5) * cameraShake;
    cameraShake *= Math.exp(-7 * dt);
  }
}

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------

function simulate(dt) {
  state.time += dt;

  if (state.dead) {
    settlement.update(dt, state.time, player, enemies);
    enemies.update(dt, player, settlement.buildings, wasteland.obstacles);
    if (state.time - state.deadAt > 2.4) respawn();
    return;
  }

  const move = input.update();
  player.update(dt, move.x, move.z);
  collidePlayer();

  if (Math.hypot(player.x, player.z) > 50 && !boundaryWarned) {
    boundaryWarned = true;
    ui.hint('RAD STORM AHEAD — TURN BACK', 2600);
  } else if (Math.hypot(player.x, player.z) < 47) {
    boundaryWarned = false;
  }

  settlement.update(dt, state.time, player, enemies);
  enemies.update(dt, player, settlement.buildings, wasteland.obstacles);

  // campfire / chapel healing + slow passive regen
  if (settlement.isNearHealer(player.x, player.z)) {
    state.health = Math.min(state.maxHealth, state.health + 3.2 * dt);
  } else if (state.time - state.lastDamage > 6) {
    state.health = Math.min(state.maxHealth, state.health + 0.7 * dt);
  }

  // spawn pressure
  if (!spawnWarned && state.time > spawnAt - 8) {
    spawnWarned = true;
    ui.hint('MOVEMENT IN THE DUST — GHOULS INBOUND', 3200);
  }
  if (state.time > spawnAt) {
    if (enemies.activeCount < enemies.maxActive) {
      const n = 1 + Math.floor(state.time / 110);
      enemies.spawn(Math.min(n, 3), player.x, player.z, 32);
      spawnAt = state.time + nextSpawnGap;
      nextSpawnGap = Math.max(9, 17 - state.time / 90);
    } else {
      spawnAt = state.time + 5;
    }
  }

  // scavenge proximity
  nearScrap = scrapField.nearest(player.x, player.z, 2.7);
  ui.setGather(nearScrap >= 0 && !settlement.placing);

  if (settlement.placing) ui.setPlaceStatus(settlement.canPlace, settlement.reason);
  ui.setStrikeCooling(player.attackCooldown > 0.05);

  // Last-resort mobile fallback: if adaptive resolution is already at the floor
  // and we still cannot hold ~40 fps, drop the shadow pass before the experience degrades.
  if (shadowsOn && perf.adaptive && !shadowAutoFallback && perf.scale <= 0.51) {
    if (perf.stats.fps > 0 && perf.stats.fps < 40) autoLowTime += dt;
    else autoLowTime = 0;
    if (autoLowTime > 3) {
      shadowAutoFallback = true;
      autoLowTime = 0;
      applyShadowState(false, 0);
      ui.setToggle('shadows', false);
      ui.toast('SHADOWS OFF · KEEPING FRAME RATE');
    }
  } else {
    autoLowTime = 0;
  }
}

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------

let last = performance.now();
let lastPerfPaint = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const rawMs = now - last;
  last = now;
  const dt = Math.min(0.05, Math.max(0.0001, rawMs / 1000));
  const elapsed = rawMs / 1000;

  if (state.started) {
    simulate(dt);
  } else {
    // keep the firelight alive behind the start/death overlay
    state.time += dt;
    settlement.update(dt, state.time, player, null);
    enemies.update(dt, player, settlement.buildings, wasteland.obstacles);
  }

  scrapField.update(state.time);
  particles.update(dt, state.time);
  updateCamera(dt, state.started ? input.move.x : 0, state.started ? input.move.z : 0);

  ui.updateHUD(state);

  renderer.render(scene, camera);
  perf.frame(rawMs);

  if (now - lastPerfPaint > 260) {
    lastPerfPaint = now;
    if (ui.perfOpen) ui.updatePerf(perf, enemies.activeCount);
  }

  // keep the simulation from running away after long tab-aways
  if (elapsed > 0.4) last = now;
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
applyQuality(coarse ? 'balanced' : 'high', true);
ui.setToggle('adaptive', perf.adaptive);
ui.setToggle('fog', true);
ui.setToggle('grass', true);
ui.setToggle('embers', true);
ui.setToggle('shadows', shadowsOn);
ui.updateHUD(state);
ui.setQuality(coarse ? 'balanced' : 'high');

window.addEventListener('resize', () => {
  applyCameraFraming();
  perf.resize();
  cameraReady = false;
});

document.addEventListener('visibilitychange', () => {
  last = performance.now();
});

requestAnimationFrame(loop);
