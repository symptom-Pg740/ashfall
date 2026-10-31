import * as THREE from 'three';
import { createTerrain, heightAt, worldField, WORLD_RADIUS, PLAY_RADIUS } from './terrain.js';
import { WORLD_SEED, deriveSeed } from './rng.js';
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
import { CampFolk } from './npcs.js';
import { Raiders } from './raiders.js';
import { Commander } from './commander.js';
import { Armory } from './armory.js';
import { RECIPES, COMPONENT_CAP, recipeCap, recipeStock } from './recipes.js';
import { AudioFx } from './audio.js';
import { DayCycle } from './daycycle.js';
import { PowerNetwork } from './power.js';
import { BuildingCard } from './buildingcard.js';
import { WireTool } from './wire.js';
import { PathDebug } from './pathdebug.js';
import { NavGrid } from './nav.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { readSave, writeSave, clearSave } from './save.js';
import { itemLabel } from './wardrobe.js';
import { WEAPONS } from './weapons.js';
import { paint } from './geo.js';
import { TargetRegistry } from './actors.js';
import { Firearms } from './firearms.js';
import { FX } from './fx.js';

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
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.info.autoReset = true;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
scene.environmentIntensity = 0.35;
room.dispose();
pmrem.dispose();

// Main gameplay camera: fixed-pitch orthographic rig. Landscape is the primary framing; portrait
// widens the frustum so the player still sees enough ground either side of them.
const CAMERA = {
  pitch: THREE.MathUtils.degToRad(40),
  halfHeightLandscape: 11,
  halfHeightPortrait: 17,
  minGroundWidth: 17,
  maxHalfHeight: 22,
  distance: 45,
  near: 0.5,
  far: 240,
};

let viewHalfHeight = 11;
let viewZoom = 1;
let viewZoomTarget = 1;

const cameraRig = new THREE.Object3D();
cameraRig.name = 'camera-rig';
scene.add(cameraRig);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA.near, CAMERA.far);
let orthoMode = true;
let activeCamera = orthoCamera;

const camOffsetY = Math.sin(CAMERA.pitch) * CAMERA.distance;
const camOffsetZ = Math.cos(CAMERA.pitch) * CAMERA.distance;
for (const cam of [camera, orthoCamera]) {
  cam.position.set(0, camOffsetY, camOffsetZ);
  cam.rotation.x = -CAMERA.pitch;
  cameraRig.add(cam);
}

function applyCameraFraming() {
  const aspect = window.innerWidth / window.innerHeight;
  const portrait = aspect < 1;
  // Keep the same framing on landscape phones/desktops, and guarantee a usable width on tall
  // screens instead of letting the ortho view collapse into a keyhole.
  viewHalfHeight = THREE.MathUtils.clamp(
    Math.max(
      portrait ? CAMERA.halfHeightPortrait : CAMERA.halfHeightLandscape,
      CAMERA.minGroundWidth / aspect / 2,
    ),
    CAMERA.halfHeightLandscape,
    CAMERA.maxHalfHeight,
  );
  const halfWidth = viewHalfHeight * aspect;
  orthoCamera.top = viewHalfHeight;
  orthoCamera.bottom = -viewHalfHeight;
  orthoCamera.left = -halfWidth;
  orthoCamera.right = halfWidth;
  orthoCamera.zoom = viewZoom;
  orthoCamera.updateProjectionMatrix();

  // Perspective stays as a debug comparison; keep its lens long and its aspect correct.
  camera.aspect = aspect;
  camera.fov = portrait ? 44 : 34;
  camera.updateProjectionMatrix();
}
applyCameraFraming();

const fx = new FX(scene, renderer, activeCamera);

const atmosphere = createAtmosphere(scene, renderer);
createTerrain(scene);
const wasteland = createWasteland(scene, deriveSeed('wasteland'));
const particles = new Particles(scene);
const scrapField = new ScrapField(scene, deriveSeed('scrap'));
const player = new Player(scene);
const enemies = new Enemies(scene, deriveSeed('enemies'));
const charStyle = new URLSearchParams(window.location.search).get('chars');
const npcStyle = charStyle === 'blocky' ? 'blocky' : charStyle === 'smooth' ? 'smooth' : 'skinned';
const campFolk = new CampFolk(scene, 6, {
  activeCount: 3,
  style: npcStyle,
  scrapField,
  obstacles: wasteland.obstacles,
  dropPoint: (person) =>
    (person
      ? settlement.nearestOfType('warehouse', person.rig.group.position.x, person.rig.group.position.z)
      : null) || { x: player.x, z: player.z, radius: 2.4 },
});
const raiders = new Raiders(scene, deriveSeed('raiders'));

const state = {
  started: false,
  dead: false,
  deadAt: 0,
  scrap: 26,
  water: 4,
  food: 4,
  components: 0,
  waterCap: 80,
  foodCap: 80,
  day: 1,
  nextRecruit: 0,
  kills: 0,
  health: 100,
  maxHealth: 100,
  time: 0,
  lastDamage: -99,
  scrapCap: 80,
};

const RELAY_HOLD = 90;
const run = {
  activated: false,
  assault: false,
  hold: 0,
  wave: 0,
  waveTimer: 0,
  over: false,
  won: false,
  reason: '',
  powerWarned: false,
};

// Ammo reserve, per-weapon magazines and upgrade tiers live in the save state.
const armory = new Armory(state);
const audio = new AudioFx();
const dayCycle = new DayCycle({ atmosphere, scene, renderer, state });
player.setArmory(armory);
player.onDry = (name) => {
  ui.toast(`OUT OF AMMO · ${name}`, true);
  audio.click();
};

// Shared target registry: the player, camp folk and ghouls all describe themselves the same way.
const registry = new TargetRegistry();
const playerTarget = {
  id: 'player',
  faction: 'player',
  x: 0, y: 0, z: 0,
  hp: 100, maxHp: 100,
  radius: 0.38,
  height: 1.8,
  dead: false,
  hit: (damage) => damagePlayer(damage),
};
const playerAimActor = { x: 0, y: 0, z: 0, heading: 0 };
const campTargets = campFolk.people.map((p, i) => ({
  id: `camp:${i}`,
  faction: 'camp',
  x: 0, y: 0, z: 0,
  hp: p.hp, maxHp: p.maxHp,
  radius: 0.38,
  height: 1.8,
  dead: false,
  ref: p,
  hit: (damage) => campFolk.damage(i, damage),
}));
registry.add(enemies);
registry.add({
  forEachTarget(cb) {
    playerTarget.x = player.x;
    playerTarget.y = player.pos.y;
    playerTarget.z = player.z;
    playerTarget.hp = state.health;
    playerTarget.maxHp = state.maxHealth;
    playerTarget.dead = state.dead;
    if (!state.dead) cb(playerTarget);
  },
});
registry.add({
  forEachTarget(cb) {
    for (let i = 0; i < campFolk.people.length; i++) {
      const person = campFolk.people[i];
      if (!person.active || person.dead || person.possessed) continue;
      const t = campTargets[i];
      const pos = person.rig.group.position;
      t.x = pos.x;
      t.y = pos.y;
      t.z = pos.z;
      t.hp = person.hp;
      t.maxHp = person.maxHp;
      t.dead = false;
      cb(t);
    }
  },
});
registry.add(raiders);

const ui = new UI();
const pathDebug = new PathDebug(scene);
const commander = new Commander({
  canvas,
  getCamera: () => activeCamera,
  player,
  campFolk,
  getSettlement: () => settlement,
  scrapField,
  registry,
  state,
  ui,
  particles,
  scene,
  onFollow: () => recenterCamera(),
  onFocus: (unit) => {
    const p = unit.rig.group.position;
    cameraFollow = false;
    focus.set(p.x, 0, p.z);
  },
  onSave: () => saveGame(),
});
const settlement = new Settlement({
  scene,
  particles,
  state,
  onWater: (n) => {
    state.water = Math.min(state.waterCap || 80, state.water + n);
  },
  onKill: (x, z) => {
    state.kills++;
    grantScrap(2);
    particles.burst(x, heightAt(x, z) + 0.7, z, '#a8c07a', 12, 2.6);
  },
  onScrap: (n) => {
    grantScrap(n);
  },
  obstacles: wasteland.obstacles,
});
const power = new PowerNetwork({ scene, settlement, state, ui });
const buildingCard = new BuildingCard({
  ui,
  settlement,
  power,
  campFolk,
  scrapField,
  state,
  getSelected: () => commander.selected,
  screenOf: (x, y, z) => commander.screenOf(x, y, z),
  run,
  onRelayActivate: (relay) => activateRelay(relay),
  onSave: () => saveGame(),
});
const wire = new WireTool({
  scene,
  canvas,
  getCamera: () => activeCamera,
  power,
  ui,
  onConnect: (from, to, cost) => {
    ui.toast(`WIRE · ${from.def.name} → ${to.def.name} · ${cost} SCRAP`);
    saveGame();
    buildingCard.openFor(from);
  },
});
buildingCard.wire = wire;
buildingCard.commander = commander;
commander.buildingCard = buildingCard;
const nav = new NavGrid({ settlement, wasteland });
campFolk.nav = nav;
const perf = new Perf(renderer);
const firearms = new Firearms({ enemies, settlement, wasteland, fx, registry });
settlement.los = (x1, y1, z1, x2, y2, z2) => firearms.hasLineOfSight(x1, y1, z1, x2, y2, z2);
settlement.onTurretShot = (x, z) => {
  const distance = Math.hypot(x - player.x, z - player.z);
  audio.shot('rifle', distance, panFor(x, z));
};
/** Ground-plane stereo position of a world point relative to the camera's right axis. */
const _panRight = new THREE.Vector3();
function panFor(x, z) {
  if (!activeCamera) return 0;
  _panRight.setFromMatrixColumn(activeCamera.matrixWorld, 0).setY(0);
  if (_panRight.lengthSq() < 1e-6) return 0;
  _panRight.normalize();
  const dx = x - player.x;
  const dz = z - player.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return 0;
  return THREE.MathUtils.clamp(((dx * _panRight.x + dz * _panRight.z) / d) * 0.85, -0.85, 0.85);
}

firearms.onShot = (weapon, actor) => {
  const distance = Math.hypot(actor.x - player.x, actor.z - player.z);
  audio.shot(weapon.id, distance, panFor(actor.x, actor.z));
  if (distance < 0.5) setTimeout(() => audio.casing(), 220);
};
firearms.onImpact = ({ surface, x, z }) => {
  const distance = Math.hypot(x - player.x, z - player.z);
  audio.impact(surface, distance, panFor(x, z));
};
player.onReload = (id) => audio.reload(id);
player.onStep = () => audio.step(0);
player.aim.los = (x1, y1, z1, x2, y2, z2) => firearms.hasLineOfSight(x1, y1, z1, x2, y2, z2);
campFolk.attachCombat({
  registry,
  firearms,
  onKill: (x, z) => {
    state.kills++;
    grantScrap(2);
    particles.burst(x, heightAt(x, z) + 0.7, z, '#a8c07a', 12, 2.6);
    ui.updateHUD(state);
    saveGame();
  },
  onDown: (name) => ui.toast(`${name} DOWN — RESPAWNING`, true),
});
raiders.attachCombat({ registry, firearms });
raiders.settlement = settlement;
settlement.onBuildingDestroyed = (building) => {
  power.removeBuilding(building);
  if (building.type === 'campfire' && settlement.count('campfire') === 0) {
    defeatRun('THE CAMPFIRE IS OUT');
  }
  if (building.type === 'relay' && run.assault && settlement.count('relay') === 0) {
    defeatRun('THE RELAY WAS DESTROYED');
  }
  if (buildingCard.building === building) buildingCard.close();
  for (const person of campFolk.people) {
    if (person.home === building) campFolk.releaseWorkplace(person, true);
  }
  if (building.manned) {
    campFolk.down(building.manned);
    building.manned = null;
  }
  if (building.type === 'chapel') {
    state.maxHealth = Math.max(100, state.maxHealth - 25);
    state.health = Math.min(state.health, state.maxHealth);
  }
  ui.toast(`${building.def.name} DESTROYED`, true);
  ui.updateHUD(state);
  saveGame();
};
settlement.onBuildingDamage = (building) => {
  if (Math.hypot(building.x - player.x, building.z - player.z) < 24) {
    cameraShake = Math.max(cameraShake, 0.12);
  }
};
campFolk.onBuildingRepaired = (building) => {
  ui.toast(`${building.def.name} REPAIRED`);
  saveGame();
};
campFolk.onNoPath = (person) => {
  ui.toast(`${person.name} · NO PATH`, true);
  if (commander.selected === person) commander.refresh(person);
};
campFolk.onBuilderAssigned = (person, building) => {
  ui.toast(`${person.name} → ${building.def.name} SITE`);
};
campFolk.onRoleChanged = (person, role) => {
  ui.toast(`${person.name} · ${role.toUpperCase()}`);
  if (commander.selected === person) commander.refresh(person);
  saveGame();
};
campFolk.isStorageFull = () => state.scrap >= (state.scrapCap || 80);
campFolk.isWaterFull = () => state.water >= (state.waterCap || 80);
campFolk.isFoodFull = () => state.food >= (state.foodCap || 80);
campFolk.isWaterEmpty = () => state.water <= 0;
campFolk.takeWater = (n = 1) => {
  if (state.water < n) return false;
  state.water -= n;
  return true;
};
campFolk.canCraft = (id) => {
  const recipe = RECIPES[id];
  if (!recipe) return { ok: false, reason: 'NO RECIPE' };
  if (state.scrap < recipe.scrap) return { ok: false, reason: 'NO SCRAP' };
  const stock = recipeStock(state, recipe);
  if (stock + recipe.amount > recipeCap(recipe)) return { ok: false, reason: 'STORAGE FULL' };
  return { ok: true };
};
campFolk.doCraft = (id) => {
  const recipe = RECIPES[id];
  if (!recipe) return false;
  const check = campFolk.canCraft(id);
  if (!check.ok) return false;
  state.scrap -= recipe.scrap;
  if (recipe.ammo) {
    state.ammo[recipe.ammo] = (state.ammo[recipe.ammo] || 0) + recipe.amount;
  } else {
    state.components = Math.min(COMPONENT_CAP, (state.components || 0) + recipe.amount);
  }
  return true;
};
campFolk.onCraft = () => {
  ui.updateHUD(state);
  ui.setAmmo(player.ammoState());
  if (ui.wardrobeOpen) refreshWardrobe();
  saveGame();
};
campFolk.reloadUnit = (person) => {
  if (!person?.weapon) return 0;
  const c = armory.caliber(person.weapon.baseId || person.weapon.id);
  if (!c) return person.weapon.magazine;
  const need = Math.max(0, person.weapon.magazine - person.mag);
  const take = Math.min(need, state.ammo[c] || 0);
  if (take <= 0) return 0;
  state.ammo[c] -= take;
  person.mag += take;
  ui.setAmmo(player.ammoState());
  ui.updateHUD(state);
  return person.mag;
};
campFolk.onWaterProduced = (n = 1) => {
  state.water = Math.min(state.waterCap || 80, state.water + n);
  ui.updateHUD(state);
};
campFolk.onFoodProduced = (n = 1) => {
  state.food = Math.min(state.foodCap || 80, state.food + n);
  ui.updateHUD(state);
};
campFolk.onLeave = (person) => {
  ui.toast(`${person.name} LEFT CAMP`, true);
  ui.setRoster(commander.roster());
  saveGame();
};
campFolk.onBuildComplete = (building) => {
  if (!settlement.completeBuilding(building)) return;
  const wired = power.attach(building);
  if (building.type === 'chapel') {
    state.maxHealth += 25;
    state.health = Math.min(state.maxHealth, state.health + 25);
  }
  particles.burst(building.x, building.y + 1, building.z, '#ffc37a', 18, 3);
  cameraShake = Math.max(cameraShake, 0.14);
  ui.toast(`${building.def.name} COMPLETE${building.def.power ? (wired ? ' · WIRED' : ' · NEEDS A WIRE') : ''}`);
  ui.updateHUD(state);
  saveGame();
};
campFolk.onTowerManned = (person) => ui.toast(`${person.name} ON THE GUARD POST`);
campFolk.onTowerReleased = (person) => ui.toast(`${person.name} OFF THE GUARD POST`);
campFolk.onScrap = (value, person) => {
  if (!value) return false;
  const accepted = grantScrap(value);
  if (!accepted) {
    ui.hint('STORAGE FULL · SPEND SCRAP', 1800);
    return false;
  }
  const pos = person.rig.group.position;
  particles.burst(pos.x, pos.y + 0.9, pos.z, '#ffc37a', 10, 2.2);
  ui.toast(`+${accepted} SCRAP · ${person.name}`);
  ui.updateHUD(state);
  saveGame();
  return true;
};

// ---------------------------------------------------------------------------
// input wiring
// ---------------------------------------------------------------------------

const input = new Input(canvas, activeCamera, {
  strike: doStrike,
  gather: doGather,
  buildToggle: toggleBuild,
  buildClose: closeBuild,
  buildSelect: selectBuilding,
  place: doPlace,
  cancelPlace: cancelPlacement,
  perf: () => ui.togglePerf(),
  wardrobe: () => ui.toggleWardrobe(),
  fullscreen: () => ui.handleFullscreenGesture(),
  pan: (dx, dy) => panCamera(dx, dy),
  zoom: (factor) => {
    viewZoomTarget = THREE.MathUtils.clamp(viewZoomTarget * factor, 0.8, 2.2);
  },
  cancel: () => {
    if (wire.active) wire.cancel();
    else if (settlement.placing) cancelPlacement();
    else if (ui.buildOpen) closeBuild();
    else if (ui.perfOpen) ui.togglePerf(false);
    else if (ui.wardrobeOpen) ui.toggleWardrobe(false);
    else if (buildingCard.open) buildingCard.close();
    else if (commander.selected) commander.clear();
  },
  isPlacing: () => settlement.placing,
  isWiring: () => wire.active,
  wireDown: (x, y) => wire.pointerDown(x, y),
  wireMove: (x, y) => wire.pointerMove(x, y),
  wireUp: (x, y) => wire.pointerUp(x, y),
  wireAbort: () => wire.abortDrag(),
  playerY: () => player.pos.y,
  aim: (x, z) => {
    if (!settlement.placing) return;
    settlement.moveGhost(x, z, player);
    ui.setPlaceStatus(settlement.canPlace, settlement.reason);
  },
  tap: (x, y) => commander.tapAt(x, y),
});

function refreshWardrobe() {
  ui.buildWardrobe(player.rig.equipment, armory.view(player.rig.equipment.weapon));
}

let nearScrap = -1;
let shadowsOn = true;
let shadowAutoFallback = false;
let autoLowTime = 0;
window.__ashfall = {
  state,
  ui,
  seed: WORLD_SEED,
  worldField,
  campFolk,
  raiders,
  commander,
  power,
  buildingCard,
  wire,
  pathDebug,
  nav,
  run,
  settlement,
  buildings: BUILDINGS,
  player,
  enemies,
  firearms,
  fx,
  registry,
  armory,
  audio,
  perf,
  renderer,
  scene,
  camera,
  orthoCamera,
  cameraRig,
  scrapField,
  wasteland,
  input,
  actions: {
    doPlace,
    doGather,
    doStrike,
    doStress,
    applyQuality,
    setOrtho,
    rotateBy,
    saveGame,
    loadGame,
    validateWorld,
    damage: (n) => damagePlayer(n),
    dawn: () => {
      state.day += 1;
      dawnTick(state.day);
    },
    needs: () => campFolk.people.map((p) => ({ name: p.name, hunger: p.hunger, thirst: p.thirst, left: !!p.left, speed: p.speed })),
  },
};
let spawnAt = 0;
let nextRaid = 70;
let raidActive = false;
let raidKind = 'raiders';
let spawnWarned = false;
let nextSpawnGap = 16;
let resumedGame = false;
let lastSave = 0;
let cameraShake = 0;
let hitStopTimer = 0;
let lastUIUpdate = 0;
let stressMesh = null;
let boundaryWarned = false;

// Browsers only allow audio after a trusted gesture; every pointer-down retries the resume.
window.addEventListener('pointerdown', () => audio.start(), { passive: true });

ui.on('started', () => {
  if (state.started) return;
  state.started = true;
  audio.start();
  input.setEnabled(true);
  spawnAt = resumedGame ? Math.max(spawnAt, state.time + 8) : state.time + 45;
  spawnWarned = false;
  ui.hint('GOAL · BUILD A WORKSHOP · CRAFT 8 COMPONENTS · RAISE THE RELAY', 6500);
  ui.toast('THE WASTES ARE LISTENING');
  last = performance.now();
});

ui.on('unitControl', () => commander.toggleControl());
ui.on('unitPost', () => commander.toggleRole());
ui.on('unitClose', () => commander.clear());
ui.on('rosterSelect', (key) => commander.selectKey(key));
ui.on('buildingAction', (id) => buildingCard.action(id));
ui.on('buildingSlot', (index) => buildingCard.slot(index));
ui.on('buildingClose', () => buildingCard.close());
ui.on('wireCancel', () => wire.cancel());
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
  } else if (key === 'ortho') {
    setOrtho(value);
  } else if (key === 'sound') {
    audio.setMuted(!value);
  } else if (key === 'paths') {
    pathDebug.setEnabled(value);
  }
});
ui.on('stress', (kind) => doStress(kind));
ui.on('compassRotate', (rad) => rotateBy(rad));
ui.on('compassNorth', () => {
  yaw.target = 0;
});
ui.on('recenter', () => recenterCamera());
ui.on('wardrobeCycle', (slot, dir) => {
  const id = player.rig.cycleEquipment(slot, dir);
  refreshWardrobe();
  ui.setWeapon(player.armed, player.weapon?.name);
  ui.setAmmo(player.ammoState());
  ui.toast(`${slot.toUpperCase()} · ${itemLabel(slot, id)}`);
  saveGame();
});

ui.on('armoryUpgrade', (trackId) => {
  if (!armory.buyUpgrade(player.weaponId, trackId)) {
    ui.toast('NOT ENOUGH SCRAP', true);
    return;
  }
  player.refreshWeapon();
  ui.setAmmo(player.ammoState());
  ui.toast(`${player.weapon.name} · ${trackId.toUpperCase()} UP`);
  ui.updateHUD(state);
  refreshWardrobe();
  saveGame();
});

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
  if (wasteland.setGrassQuality) wasteland.setGrassQuality(q.grass);
  particles.setEmberCount(q.embers);
  scene.fog.density = ui.toggleState.fog ? q.fogDensity : 0.0001;
  enemies.maxActive = q.enemies;
  applyShadowState(q.shadows, q.shadowSize);
  fx.setQuality(name);
  audio.setQuality(name);
  ui.setQuality(name);
  ui.setToggle('adaptive', perf.adaptive);
  ui.setToggle('shadows', q.shadows);
  if (!silent) {
    ui.toast(`QUALITY · ${name.toUpperCase()}`);
    try {
      localStorage.setItem('ashfall-quality', name);
    } catch {
      /* ignore */
    }
  }
}

function pickQuality(coarse) {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('quality');
  if (QUALITY[forced]) return forced;
  try {
    const saved = localStorage.getItem('ashfall-quality');
    if (QUALITY[saved]) return saved;
  } catch {
    /* ignore */
  }
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse && (memory <= 3 || cores <= 4)) return 'low';
  if (coarse) return 'balanced';
  if (memory >= 8 && cores >= 8) return 'high';
  return 'balanced';
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
  wire.cancel(true);
  buildingCard.close();
  if (commander.mode === 'command') commander.clear();
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
  settlement.begin(def.id, { x: focus.x, z: focus.z, heading: player.heading });
  ui.setSelectedBuilding(def.id);
  ui.showPlacement(true, def);
  ui.setPlaceStatus(settlement.canPlace, settlement.reason);
  ui.hint(
    `${def.name} · ${def.cost} SCRAP${def.components ? ` · ${def.components} COMPONENTS` : ''} · AIM ANYWHERE`,
    3600,
  );
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
  const def = settlement.selected;
  const compCost = def?.components || 0;
  if (compCost && state.components < compCost) {
    ui.toast(`NEED ${compCost} COMPONENTS · CRAFT THEM IN THE WORKSHOP`, true);
    return;
  }
  const res = settlement.place(player);
  if (!res.ok) {
    ui.toast(res.reason, true);
    return;
  }
  state.scrap -= res.cost;
  if (compCost) state.components -= compCost;
  const hasBuilder = campFolk.people.some((p) => !p.dead && p.role === 'builder');
  ui.toast(
    `${res.building.def.name} SITE${hasBuilder ? ' · BUILDER WILL ATTEND' : ' · SET A SURVIVOR TO BUILDER'}`,
  );
  ui.updateHUD(state);
  cameraShake = Math.max(cameraShake, 0.12);
  // One site per pick: the red ghost ring was confusing next to the new scaffold.
  cancelPlacement();
  saveGame();
}

function doGather() {
  if (!state.started || state.dead || settlement.placing) return;
  if (commander.mode !== 'direct') {
    ui.hint('TAKE CONTROL TO GATHER', 1600);
    return;
  }
  if (nearScrap < 0) {
    ui.toast('NOTHING TO SCAVENGE HERE', true);
    return;
  }
  if (state.scrap >= (state.scrapCap || 80)) {
    ui.toast('STORAGE FULL', true);
    return;
  }
  const node = scrapField.nodes[nearScrap];
  const value = scrapField.gather(nearScrap, state.time);
  if (!value) return;
  const accepted = grantScrap(value);
  particles.burst(node.x, node.y + 0.5, node.z, '#ffc37a', 16, 2.8);
  ui.toast(`+${accepted} SCRAP`);
  ui.updateHUD(state);
  nearScrap = -1;
  ui.setGather(false);
  player.strike();
  saveGame();
}

function grantScrap(amount) {
  const cap = state.scrapCap || 80;
  const accepted = Math.max(0, Math.min(amount, cap - state.scrap));
  state.scrap += accepted;
  return accepted;
}

function awardKills(kills) {
  if (!kills) return;
  hitStopTimer = 0.055;
  state.kills += kills;
  const gained = grantScrap(kills * 2);
  ui.updateHUD(state);
  if (gained) ui.toast(`+${gained} SCRAP`);
  saveGame();
}

function playerShoot() {
  const shot = player.tryFire();
  if (!shot) {
    ui.setAmmo(player.ammoState());
    return false;
  }
  const result = firearms.fire(player, shot);
  ui.setAmmo(player.ammoState());
  if (result.hit) ui.hitMarker(result.killed > 0);
  if (result.killed) awardKills(result.killed);
  cameraShake = Math.max(cameraShake, shot.weapon.shake);
  return true;
}

function doStrike() {
  if (!state.started || state.dead) return;
  if (commander.mode !== 'direct') {
    ui.hint('TAKE CONTROL TO FIGHT', 1600);
    return;
  }
  if (player.armed) {
    playerShoot();
    return;
  }
  if (!player.strike()) return;
  const hits = enemies.strike(player.x, player.z, 2.55, 34);
  if (hits.length) {
    let kills = 0;
    for (const hit of hits) {
      particles.burst(hit.x, heightAt(hit.x, hit.z) + 0.8, hit.z, hit.killed ? '#a8c07a' : '#c4644a', hit.killed ? 16 : 7, 2.2);
      if (hit.killed) kills++;
    }
    if (kills) awardKills(kills);
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

function damagePlayer(amount, fromX, fromZ) {
  if (state.dead || !state.started) return false;
  if (player.possessedUnit) {
    state.health -= amount;
    state.lastDamage = state.time;
    player.hit();
    ui.flashDamage();
    ui.updateHUD(state);
    cameraShake = Math.max(cameraShake, 0.35);
    if (state.health <= 0) {
      state.health = 0;
      commander.downPossessed();
      return true;
    }
    return false;
  }
  state.health -= amount;
  state.lastDamage = state.time;
  player.hit();
  ui.flashDamage();
  ui.updateHUD(state);
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
    if (raidActive) ui.showRaidResult(false, 'THE CAMP IS OVERRUN');
    return true;
  }
  return false;
}
enemies.onPlayerHit = (amount, enemy) => damagePlayer(amount, enemy?.x, enemy?.z);

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
  saveGame();
}

// ---------------------------------------------------------------------------
// save / load
// ---------------------------------------------------------------------------

function saveGame() {
  if (!state.started || state.dead) return;
  // While a survivor is possessed, `player.pos` and `state.health` belong to that survivor. Skip
  // the write instead of saving the leader on the wrong tile; release/down saves immediately.
  if (player.possessedUnit) return;
  writeSave({
    v: 6,
    seed: WORLD_SEED,
    savedAt: Date.now(),
    state: {
      scrap: state.scrap,
      water: state.water,
      food: state.food,
      components: state.components,
      nextRecruit: state.nextRecruit,
      kills: state.kills,
      health: state.health,
      maxHealth: state.maxHealth,
      time: state.time,
      ammo: { ...state.ammo },
      mags: { ...state.mags },
      upgrades: JSON.parse(JSON.stringify(state.upgrades)),
    },
    player: { x: player.x, z: player.z, heading: player.heading },
    equipment: { ...player.rig.equipment },
    buildings: settlement.serialize().buildings,
    units: campFolk.serialize(),
    scrap: scrapField.serialize(),
    power: power.serialize(),
    run: {
      activated: run.activated,
      assault: run.assault,
      hold: run.hold,
      wave: run.wave,
      waveTimer: run.waveTimer,
      over: run.over,
      won: run.won,
      reason: run.reason,
    },
    timers: {
      spawnAt,
      nextSpawnGap,
      prodTimer: settlement.prodTimer,
      houseTimer: settlement.houseTimer,
    },
  });
}

function loadGame() {
  const save = readSave();
  if (!save || save.seed !== WORLD_SEED || !save.player) return false;
  const s = save.state || {};
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

  state.scrap = num(s.scrap, 26);
  state.water = num(s.water, 4);
  state.food = num(s.food, 4);
  state.components = num(s.components, 0);
  state.nextRecruit = num(s.nextRecruit, 0);
  state.kills = num(s.kills, 0);
  state.health = num(s.health, 100);
  state.maxHealth = Math.max(100, num(s.maxHealth, 100));
  state.time = num(s.time, 0);
  state.day = 1 + Math.floor(state.time / 360);
  state.dead = false;
  state.deadAt = 0;
  state.lastDamage = state.time - 10;

  player.pos.set(save.player.x, heightAt(save.player.x, save.player.z), save.player.z);
  player.heading = num(save.player.heading, 0);
  player.targetHeading = player.heading;
  player.group.rotation.y = player.heading;
  if (save.equipment) player.rig.setEquipment(save.equipment);
  if (s.ammo && typeof s.ammo === 'object') {
    for (const key of Object.keys(armory.state.ammo)) {
      if (Number.isFinite(s.ammo[key])) armory.state.ammo[key] = s.ammo[key];
    }
  }
  if (s.mags && typeof s.mags === 'object') armory.state.mags = { ...s.mags };
  if (s.upgrades && typeof s.upgrades === 'object') {
    armory.state.upgrades = s.upgrades;
    armory._resolved.clear();
  }
  player.refreshWeapon();

  settlement.restore(save.buildings);
  campFolk.restore(save.units, (id) => settlement.buildings.find((b) => b.id === id) || null);
  ui.setRoster(commander.roster());
  power.restore(save.power);
  if (save.run && typeof save.run === 'object') {
    run.activated = !!save.run.activated;
    run.assault = !!save.run.assault;
    run.hold = num(save.run.hold, 0);
    run.wave = num(save.run.wave, 0);
    run.waveTimer = num(save.run.waveTimer, 22);
    run.over = !!save.run.over;
    run.won = !!save.run.won;
    run.reason = typeof save.run.reason === 'string' ? save.run.reason : '';
    if (run.over) {
      ui.showRunEnd(
        run.won,
        run.won ? 'RELAY ONLINE' : 'CAMP LOST',
        run.reason || (run.won ? 'THE WASTES ANSWER' : 'THE CAMP IS OVERRUN'),
        { day: state.day, survivors: campFolk.people.filter((p) => p.active && !p.dead).length, kills: state.kills },
      );
    }
  }
  scrapField.restore(save.scrap);
  if (save.timers) {
    spawnAt = num(save.timers.spawnAt, state.time + 45);
    nextSpawnGap = num(save.timers.nextSpawnGap, 16);
    settlement.prodTimer = num(save.timers.prodTimer, 0);
    settlement.houseTimer = num(save.timers.houseTimer, 0);
  }

  focus.set(player.x, 0, player.z);
  camTarget.set(player.x, player.pos.y, player.z);
  cameraFollow = true;
  cameraReady = false;
  resumedGame = true;
  return true;
}

function validateWorld() {
  const issues = [];
  const b = settlement.buildings;
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++) {
      const d = Math.hypot(b[i].x - b[j].x, b[i].z - b[j].z);
      if (d < b[i].radius + b[j].radius - 0.05) {
        issues.push(`overlapping buildings: ${b[i].type} / ${b[j].type}`);
      }
    }
  }
  for (const node of scrapField.nodes) {
    if (!node.active) continue;
    for (const building of b) {
      if (Math.hypot(node.x - building.x, node.z - building.z) < building.radius + 0.4) {
        issues.push(`scrap inside ${building.type}`);
      }
    }
  }
  for (const obstacle of wasteland.obstacles) {
    for (const building of b) {
      if (Math.hypot(obstacle.x - building.x, obstacle.z - building.z) < building.radius + obstacle.r - 0.2) {
        issues.push(`prop inside ${building.type}`);
      }
    }
  }
  if (Math.hypot(player.x, player.z) > PLAY_RADIUS + 1) issues.push('player outside the world');
  if (issues.length) {
    console.warn('[ashfall] validation', issues);
    ui.toast(`VALIDATION · ${issues.length} ISSUE${issues.length === 1 ? '' : 'S'}`, true);
  } else {
    console.info('[ashfall] validation: ok');
    ui.toast('VALIDATION · OK');
  }
  return issues;
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

const camTarget = new THREE.Vector3(player.x, player.pos.y, player.z);
const focus = new THREE.Vector3(player.x, 0, player.z);
const lookAhead = new THREE.Vector3();
const yaw = { current: 0, target: 0 };
const PAN_LIMIT = PLAY_RADIUS + 6;
let cameraFollow = true;
const moveWorld = { x: 0, z: 0 };
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const shadowRight = new THREE.Vector3();
const shadowUp = new THREE.Vector3();
const shadowFocus = new THREE.Vector3();
let cameraReady = false;

function rotateBy(radians) {
  yaw.target += radians;
}

// One-finger pan. Converts screen pixels to metres on the ground: horizontally the ortho scale is
// uniform, vertically it is stretched by 1/sin(pitch) because the camera looks down at an angle.
function panCamera(dx, dy) {
  const worldPerPixel = (2 * viewHalfHeight) / viewZoom / window.innerHeight;
  const c = Math.cos(yaw.current);
  const s = Math.sin(yaw.current);
  const rightX = c;
  const rightZ = -s;
  const upX = -s;
  const upZ = -c;
  const vertical = worldPerPixel / Math.sin(CAMERA.pitch);
  focus.x += -dx * worldPerPixel * rightX + dy * vertical * upX;
  focus.z += -dx * worldPerPixel * rightZ + dy * vertical * upZ;
  const d = Math.hypot(focus.x, focus.z);
  if (d > PAN_LIMIT) {
    focus.x *= PAN_LIMIT / d;
    focus.z *= PAN_LIMIT / d;
  }
  cameraFollow = false;
}

function recenterCamera() {
  cameraFollow = true;
}

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Input arrives in screen space (W = up the screen). Rotate it into world space so movement always
// matches what the player sees after orbiting the camera.
function cameraRelativeMove(x, z, out = moveWorld) {
  const c = Math.cos(yaw.current);
  const s = Math.sin(yaw.current);
  out.x = x * c + z * s;
  out.z = -x * s + z * c;
  return out;
}

function updateCamera(dt, moveX, moveZ) {
  if (Math.abs(viewZoomTarget - viewZoom) > 0.0005) {
    viewZoom += (viewZoomTarget - viewZoom) * (1 - Math.exp(-9 * dt));
    orthoCamera.zoom = viewZoom;
    orthoCamera.updateProjectionMatrix();
  }

  // Orbit toward the requested yaw along the shortest arc.
  yaw.current += shortestAngle(yaw.current, yaw.target) * (1 - Math.exp(-16 * dt));
  cameraRig.rotation.y = yaw.current;

  lookAhead.x = THREE.MathUtils.damp(lookAhead.x, moveX * 1.25, 4, dt);
  lookAhead.z = THREE.MathUtils.damp(lookAhead.z, moveZ * 1.25, 4, dt);

  if (cameraFollow) {
    focus.x = player.x + lookAhead.x;
    focus.z = player.z + lookAhead.z;
  }
  camTarget.x = THREE.MathUtils.damp(camTarget.x, focus.x, 10, dt);
  camTarget.z = THREE.MathUtils.damp(camTarget.z, focus.z, 10, dt);
  camTarget.y = THREE.MathUtils.damp(camTarget.y, player.pos.y, 5, dt);

  if (!cameraReady) {
    camTarget.set(focus.x, player.pos.y, focus.z);
    cameraReady = true;
  }
  cameraRig.position.copy(camTarget);

  // Shadow volume follows the rig. Snap the focus to shadow-map texels *in light space* so the map
  // does not crawl as the rig moves (an XZ-only snap leaks shimmer on a tilted sun).
  const sun = atmosphere.sun;
  const shadowCam = sun.shadow.camera;
  const texel = (shadowCam.right - shadowCam.left) / sun.shadow.mapSize.x;
  shadowRight.crossVectors(WORLD_UP, SUN_DIR).normalize();
  shadowUp.crossVectors(SUN_DIR, shadowRight).normalize();
  shadowFocus.set(camTarget.x, 0, camTarget.z - 4);
  const sr = shadowFocus.dot(shadowRight);
  const su = shadowFocus.dot(shadowUp);
  shadowFocus
    .addScaledVector(shadowRight, Math.round(sr / texel) * texel - sr)
    .addScaledVector(shadowUp, Math.round(su / texel) * texel - su);
  sun.target.position.copy(shadowFocus);
  sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 60);
  sun.target.updateMatrixWorld();

  // Shake lives in camera-local space: it rattles the view without changing the rig's heading.
  const cam = activeCamera;
  if (cameraShake > 0.001) {
    cam.position.x = (Math.random() - 0.5) * cameraShake;
    cam.position.y = camOffsetY + (Math.random() - 0.5) * cameraShake * 0.6;
    cameraShake *= Math.exp(-7 * dt);
  } else {
    cam.position.x = 0;
    cam.position.y = camOffsetY;
  }
}

// Orthographic is the main camera. Perspective stays available as a comparison/debug view.
function setOrtho(on) {
  if (orthoMode === on) return;
  orthoMode = on;
  activeCamera = on ? orthoCamera : camera;
  activeCamera.position.x = 0;
  activeCamera.position.y = camOffsetY;
  input.camera = activeCamera;
  fx.setCamera(activeCamera);
  ui.setToggle('ortho', on);
}

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    viewZoomTarget = THREE.MathUtils.clamp(viewZoomTarget * Math.exp(-e.deltaY * 0.0012), 0.8, 2.2);
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'c') setOrtho(!orthoMode);
  else if (k === ',') rotateBy(Math.PI / 4);
  else if (k === '.') rotateBy(-Math.PI / 4);
  else if (k === 'r') yaw.target = 0;
  else if (k === 'h') recenterCamera();
});

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
  if (d > PLAY_RADIUS) {
    x *= PLAY_RADIUS / d;
    z *= PLAY_RADIUS / d;
  }
  player.pos.x = x;
  player.pos.z = z;
}

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------

function raidRemaining() {
  return raidKind === 'ghouls' ? enemies.activeCount : raiders.activeCount;
}

function startRaid(kind = 'raiders', count = 2, distance = 30) {
  const spawned = kind === 'ghouls'
    ? enemies.spawn(count, player.x, player.z, distance)
    : raiders.spawnWave(count, player.x, player.z, distance);
  if (spawned) {
    raidActive = true;
    raidKind = kind;
    ui.setRaid(raidRemaining(), kind);
    ui.hint(kind === 'ghouls' ? 'GHOULS IN THE DARK' : 'RAIDERS IN THE DUST', 3400);
  }
  return spawned;
}

function assaultRemaining() {
  return raiders.activeCount + enemies.activeCount;
}

function activateRelay(relay) {
  if (!relay || !relay.built || relay.destroyed) return false;
  if (run.assault || run.over) return false;
  if (!relay.powered) {
    ui.toast('RELAY HAS NO POWER', true);
    return false;
  }
  run.activated = true;
  run.assault = true;
  run.hold = RELAY_HOLD;
  run.wave = 1;
  run.waveTimer = 20;
  run.powerWarned = false;
  raidActive = false;
  raiders.spawnWave(4, relay.x, relay.z, 28);
  enemies.spawn(5, relay.x, relay.z, 24);
  ui.setRaid(assaultRemaining(), 'assault');
  ui.hint('RELAY ONLINE · HOLD FOR 90 SECONDS', 4200);
  ui.toast('RELAY ACTIVATED');
  saveGame();
  return true;
}

function updateFinalAssault(dt) {
  const relay = settlement.buildings.find((b) => b.type === 'relay' && b.built && !b.destroyed);
  if (!relay) {
    defeatRun('THE RELAY WAS DESTROYED');
    return;
  }
  if (relay.powered) {
    run.hold = Math.max(0, run.hold - dt);
    run.powerWarned = false;
  } else if (!run.powerWarned) {
    run.powerWarned = true;
    ui.hint('RELAY UNPOWERED · RECONNECT THE GRID', 3200);
  }
  run.waveTimer -= dt;
  if (run.waveTimer <= 0 && run.hold > 10) {
    run.wave++;
    run.waveTimer = 20;
    const raiderCount = Math.min(2, 5 - raiders.activeCount);
    if (raiderCount > 0) raiders.spawnWave(raiderCount, relay.x, relay.z, 26);
    enemies.spawn(3 + Math.min(4, Math.floor(run.wave / 2)), relay.x, relay.z, 26);
    ui.hint(`WAVE ${run.wave} · HOLD THE RELAY`, 2400);
  }
  ui.setRaid(assaultRemaining(), 'assault');
  if (run.hold <= 0) endRun(true, 'RELAY ONLINE', 'THE WASTES ANSWER · THE CAMP HOLDS');
}

function endRun(win, title, reason = '') {
  if (run.over) return;
  run.over = true;
  run.won = !!win;
  run.assault = false;
  run.reason = reason;
  ui.setRaid(0, 'assault');
  ui.hideHint();
  ui.showRunEnd(win, title, reason, {
    day: state.day,
    survivors: campFolk.people.filter((p) => p.active && !p.dead).length,
    kills: state.kills,
  });
  updateObjective();
  input.setEnabled(false);
  saveGame();
}

function defeatRun(reason) {
  if (run.over || run.won) return;
  endRun(false, 'CAMP LOST', reason);
}

function updateObjective() {
  const relay = settlement.buildings.find((b) => b.type === 'relay' && !b.destroyed);
  const relayDef = BUILDINGS.find((b) => b.id === 'relay');
  const need = relayDef?.components || 6;
  const workshop = settlement.count('workshop') > 0;
  let step = '';
  let detail = '';
  let progress = 0;
  let tone = '';

  if (run.over) {
    step = run.won ? 'RELAY ONLINE' : 'CAMP LOST';
    detail = run.reason || (run.won ? 'THE WASTES ANSWER' : 'THE CAMP IS OVERRUN');
    progress = run.won ? 1 : 0;
    tone = run.won ? 'done' : '';
  } else if (run.assault) {
    step = 'HOLD THE RELAY';
    const powered = !!relay?.powered;
    detail = powered
      ? `${Math.ceil(run.hold)}S · WAVE ${run.wave} · ${assaultRemaining()} HOSTILES`
      : `${Math.ceil(run.hold)}S · POWER LOST · RELINK THE RELAY`;
    progress = 1 - run.hold / RELAY_HOLD;
    tone = 'active';
  } else if (!workshop) {
    step = 'BUILD A WORKSHOP';
    detail = 'It turns scrap into ammo and components.';
  } else if (!relay) {
    if (state.components < need) {
      step = 'CRAFT COMPONENTS';
      detail = `${state.components}/${need} · WORKSHOP → NEXT RECIPE`;
      progress = Math.min(1, state.components / need);
    } else {
      step = 'RAISE THE RELAY';
      detail = `${relayDef?.cost || 30} SCRAP · ${need} COMPONENTS READY`;
      progress = 1;
    }
  } else if (!relay.built) {
    step = 'FINISH THE RELAY';
    detail = `${Math.round((relay.buildProgress || 0) * 100)}% BUILT`;
    progress = relay.buildProgress || 0;
  } else if (!relay.powered) {
    step = 'POWER THE RELAY';
    detail = 'LINK it to the solar array from its card.';
    progress = 1;
  } else {
    step = 'ACTIVATE THE RELAY';
    detail = 'Open its card and hold the camp for 90 seconds.';
    progress = 1;
  }
  ui.setObjective({ step, detail, progress, tone });
}

function dawnTick(day) {
  let fed = 0;
  let watered = 0;
  for (const p of campFolk.people) {
    if (!p.active || p.dead) continue;
    if (state.water > 0) {
      state.water--;
      p.thirst = 0;
      watered++;
    } else {
      p.thirst = (p.thirst || 0) + 1;
    }
    if (state.food > 0) {
      state.food--;
      p.hunger = 0;
      fed++;
    } else {
      p.hunger = (p.hunger || 0) + 1;
    }
    const unfed = p.hunger > 0 || p.thirst > 0;
    p.speed = (p.baseSpeed || p.speed) * (unfed ? 0.8 : 1);
    if (p.thirst >= 2 || p.hunger >= 2) campFolk.leaveCamp(p, 'LEFT CAMP');
  }
  let living = campFolk.people.filter((p) => p.active && !p.dead).length;
  const cap = Math.min(6, 3 + settlement.count('house'));
  let recruited = null;
  if (
    living < cap &&
    state.water >= living + 2 &&
    state.food >= living + 2 &&
    day >= (state.nextRecruit || 0)
  ) {
    const spot =
      settlement.nearestOfType('house', player.x, player.z) ||
      settlement.nearestOfType('campfire', player.x, player.z) ||
      { x: player.x, z: player.z, radius: 2 };
    const recruit = campFolk.recruit(spot.x + (spot.radius || 2), spot.z + 1);
    if (recruit) {
      recruited = recruit;
      living++;
      state.nextRecruit = day + 2 + Math.floor(Math.random() * 2);
      ui.toast(`${recruit.name} JOINED THE CAMP`);
    }
  }
  if (campFolk.people.filter((p) => p.active && !p.left).length === 0) {
    defeatRun('THE CAMP IS EMPTY');
    return;
  }
  ui.updateHUD(state);
  ui.setRoster(commander.roster());
  const short = fed < living || watered < living;
  ui.hint(
    `DAY ${day} · ${living}/${cap} SURVIVORS · FOOD ${state.food} · WATER ${state.water}${recruited ? ` · ${recruited.name} JOINED` : ''}${short ? ' · SHORT SUPPLIES' : ''}`,
    5200,
  );
  saveGame();
}

function simulate(dt) {
  if (run.over) return;
  state.time += dt;
  const day = 1 + Math.floor(state.time / 360);
  if (day > state.day) {
    state.day = day;
    dawnTick(day);
  }

  if (state.dead) {
    settlement.update(dt, state.time, player, enemies);
    enemies.update(dt, player, settlement.buildings, wasteland.obstacles);
    fx.update(dt);
    if (state.time - state.deadAt > 2.4) respawn();
    return;
  }

  const direct = commander.mode === 'direct';
  const move = direct ? input.update() : { x: 0, z: 0 };
  const wm = cameraRelativeMove(move.x, move.z);
  playerAimActor.x = player.x;
  playerAimActor.y = player.pos.y;
  playerAimActor.z = player.z;
  playerAimActor.heading = player.heading;
  player.aim.update(dt, playerAimActor, registry, player.weapon);
  player.update(dt, wm.x, wm.z);
  if (!direct && player.armed && player.aim.target && player.aim.canFire) {
    // The avatar fights for itself while you command; you can still take over at any time.
    playerShoot();
  }
  ui.setWeapon(player.armed, player.weapon?.name);
  ui.setAmmo(player.ammoState());
  collidePlayer();

  if (Math.hypot(player.x, player.z) > PLAY_RADIUS && !boundaryWarned) {
    boundaryWarned = true;
    ui.hint('RAD STORM AHEAD — TURN BACK', 2600);
  } else if (Math.hypot(player.x, player.z) < PLAY_RADIUS - 3) {
    boundaryWarned = false;
  }

  settlement.update(dt, state.time, player, enemies);
  enemies.update(dt, player, settlement.buildings, wasteland.obstacles);
  fx.update(dt);

  // campfire / chapel healing + slow passive regen
  if (settlement.isNearHealer(player.x, player.z)) {
    state.health = Math.min(state.maxHealth, state.health + 3.2 * dt);
  } else if (state.time - state.lastDamage > 6) {
    state.health = Math.min(state.maxHealth, state.health + 0.7 * dt);
  }

  // spawn pressure pauses during the final assault
  if (!run.assault && !spawnWarned && state.time > spawnAt - 8) {
    spawnWarned = true;
    ui.hint('MOVEMENT IN THE DUST — GHOULS INBOUND', 3200);
  }
  if (!run.assault && state.time > spawnAt) {
    if (enemies.activeCount < enemies.maxActive) {
      const night = dayCycle.daylight < 0.3;
      const n = (1 + Math.floor(state.time / 110)) * (night ? 2 : 1);
      enemies.spawn(Math.min(n, night ? 5 : 3), player.x, player.z, 32);
      spawnAt = state.time + nextSpawnGap;
      nextSpawnGap = Math.max(9, 17 - state.time / 90);
    } else {
      spawnAt = state.time + 5;
    }
  }

  // raider pressure: a small squad every minute or so
  if (!run.assault && state.time > nextRaid) {
    const n = 1 + Math.floor(state.time / 150);
    const night = dayCycle.daylight < 0.3;
    const kind = night ? 'ghouls' : 'raiders';
    const spawned = startRaid(kind, Math.min(3, kind === 'ghouls' ? n + 1 : n), 30);
    nextRaid = spawned ? state.time + 60 : state.time + 8;
  }

  if (raidActive) {
    const remaining = raidRemaining();
    ui.setRaid(remaining, raidKind);
    if (remaining === 0) {
      raidActive = false;
      ui.setRaid(0, raidKind);
      grantScrap(10);
      ui.updateHUD(state);
      ui.toast('RAID CLEARED · +10 SCRAP');
      ui.hint('THE DUST SETTLES — FOR NOW', 2600);
      ui.showRaidResult(true, '+10 SCRAP · THE DUST SETTLES');
      saveGame();
    }
  }

  if (run.assault) updateFinalAssault(dt);

  // scavenge proximity
  nearScrap = scrapField.nearest(player.x, player.z, 2.7);
  ui.setGather(direct && nearScrap >= 0 && !settlement.placing);

  if (settlement.placing) ui.setPlaceStatus(settlement.canPlace, settlement.reason);
  ui.setStrikeCooling(player.attackCooldown > 0.05 || player.reloadTimer > 0);

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
  const elapsed = rawMs / 1000;
  let dt = Math.min(0.05, Math.max(0.0001, rawMs / 1000));
  // A kill lands with a brief, subtle time dip so the hit reads.
  if (hitStopTimer > 0) {
    hitStopTimer -= elapsed;
    dt *= 0.2;
  }

  const dayInfo = dayCycle.update(dt);
  ui.setClock(dayInfo);
  if (state.started) {
    simulate(dt);
  } else {
    // keep the firelight alive behind the start/death overlay
    state.time += dt;
    settlement.update(dt, state.time, player, null);
    enemies.update(dt, player, settlement.buildings, wasteland.obstacles);
  }

  campFolk.update(dt, state.time, player, settlement.buildings);
  raiders.update(dt, state.time, player);
  commander.update(dt);
  buildingCard.update(dt);
  pathDebug.update(campFolk.people, dt);
  power.update(dt, dayInfo.daylight);
  // Damage and passive regen change health outside the event-driven HUD paths.
  if (now - lastUIUpdate > 120) {
    lastUIUpdate = now;
    ui.updateHUD(state);
  }
  if (state.started && !state.dead && now - lastSave > 5000) {
    lastSave = now;
    saveGame();
  }
  scrapField.update(state.time);
  particles.update(dt, state.time);
  wasteland.updateWind(state.time);
  const wm = state.started ? cameraRelativeMove(input.move.x, input.move.z) : { x: 0, z: 0 };
  updateCamera(dt, wm.x, wm.z);
  settlement.updateOcclusion(activeCamera, player, dt);
  ui.setCompass(yaw.current, !cameraFollow);

  ui.updateHUD(state);
  updateObjective();

  renderer.render(scene, activeCamera);
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
const initialQuality = pickQuality(coarse);
applyQuality(initialQuality, true);
ui.setToggle('adaptive', perf.adaptive);
ui.setToggle('fog', true);
ui.setToggle('grass', true);
ui.setToggle('embers', true);
ui.setToggle('shadows', shadowsOn);
ui.setToggle('ortho', orthoMode);
ui.setToggle('sound', !audio.muted);
const showPaths = new URLSearchParams(window.location.search).has('paths');
pathDebug.setEnabled(showPaths);
ui.setToggle('paths', showPaths);
ui.setSeed(WORLD_SEED);
input.camera = activeCamera;
ui.updateHUD(state);
updateObjective();
ui.setQuality(initialQuality);

if (new URLSearchParams(window.location.search).has('fresh')) clearSave(false);
resumedGame = loadGame();
ui.setResume(resumedGame);
refreshWardrobe();
ui.setWeapon(player.armed, player.weapon?.name);
ui.setAmmo(player.ammoState());
ui.setRaid(0, 'raiders');
if (resumedGame) {
  ui.updateHUD(state);
  ui.setGather(false);
}

window.addEventListener('resize', () => {
  applyCameraFraming();
  perf.resize();
  cameraReady = false;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveGame();
    audio.pause();
  } else {
    last = performance.now();
    audio.resume();
  }
});
window.addEventListener('pagehide', saveGame);

// Development-only framing helpers. These are inert unless present in the URL.
const debugParams = new URLSearchParams(window.location.search);
if (debugParams.has('zoom')) {
  const z = THREE.MathUtils.clamp(parseFloat(debugParams.get('zoom')) || 1, 0.8, 8);
  viewZoom = viewZoomTarget = z;
  orthoCamera.zoom = z;
  orthoCamera.updateProjectionMatrix();
}
if (debugParams.has('heading')) {
  const h = parseFloat(debugParams.get('heading')) || 0;
  player.heading = h;
  player.targetHeading = h;
  player.group.rotation.y = h;
}
if (debugParams.get('hide') === 'body') player.rig.mesh.visible = false;
if (debugParams.get('hide') === 'outfit' && player.rig.outfit) player.rig.outfit.visible = false;
if (debugParams.has('raider')) {
  const r = raiders.people[0];
  r.active = true;
  r.dead = false;
  r.hp = r.maxHp;
  r.mag = r.weapon.magazine;
  r.reloadTimer = 0;
  r.cooldown = 0;
  r.recoil = 0;
  r.aim.target = null;
  r.aim._initialised = false;
  const x = player.x + 7;
  const z = player.z;
  const face = Math.atan2(player.x - x, player.z - z);
  r.rig.group.position.set(x, heightAt(x, z), z);
  r.rig.group.rotation.y = face;
  r.heading = face;
  r.rig.group.visible = true;
  r.rig.mesh.visible = true;
  if (r.farTier) r.farTier.visible = false;
  r.isFar = false;
}
if (debugParams.has('raid')) {
  setTimeout(() => startRaid('raiders', 2, 9), 1200);
}
if (debugParams.has('raidghoul')) {
  setTimeout(() => startRaid('ghouls', 3, 9), 1200);
}
if (debugParams.has('raidclear')) {
  setTimeout(() => {
    startRaid('raiders', 2, 10);
    setTimeout(() => {
      for (const p of raiders.people) {
        if (p.active) raiders.damage(p.target.ref, 999);
      }
    }, 400);
  }, 800);
}
if (debugParams.has('guardtest')) {
  const n = campFolk.people[0];
  const nx = player.x + 1.2;
  const nz = player.z + 0.4;
  n.rig.group.position.set(nx, heightAt(nx, nz), nz);
  n.rig.group.rotation.y = 0;
  n.heading = 0;
}
if (debugParams.has('compare')) {
  const n = campFolk.people[0];
  const nx = player.x + 1.15;
  n.rig.group.position.set(nx, heightAt(nx, player.z), player.z);
  n.rig.group.rotation.y = 0;
  campFolk.update = () => {};
}
if (debugParams.has('ghoul')) {
  const g = enemies.pool[0];
  g.active = true;
  g.x = player.x;
  g.z = player.z + 7;
  g.y = heightAt(g.x, g.z);
  g.hp = 46;
  g.scale = 1;
  g.speed = 0;
  g.attackCd = 999;
}
if (debugParams.has('weapon')) {
  player.rig.equip('weapon', debugParams.get('weapon'));
  refreshWardrobe();
  ui.setWeapon(player.armed, player.weapon?.name);
  ui.setAmmo(player.ammoState());
}
if (debugParams.has('hurt')) {
  setTimeout(() => damagePlayer(Number(debugParams.get('hurt')) || 35), 1000);
}
if (debugParams.has('noammo')) {
  setTimeout(() => {
    for (const key of Object.keys(state.ammo)) state.ammo[key] = 0;
    for (const key of Object.keys(WEAPONS)) state.mags[key] = 0;
    player.refreshWeapon();
    ui.setAmmo(player.ammoState());
  }, 400);
}
if (debugParams.has('audiotest')) {
  setTimeout(() => {
    const seq = [
      () => audio.shot('pistol', 0, 0),
      () => audio.shot('rifle', 0, 0),
      () => audio.shot('shotgun', 0, 0),
      () => audio.shot('rifle', 35, -0.4),
      () => audio.impact('stone', 2, 0.3),
      () => audio.impact('flesh', 2, 0),
      () => audio.reload('rifle'),
      () => audio.dry(),
    ];
    seq.forEach((fn, i) => setTimeout(fn, i * 900));
  }, 1200);
}
if (debugParams.has('armory')) {
  setTimeout(() => ui.toggleWardrobe(true), 500);
}
if (debugParams.has('upgrade')) {
  setTimeout(() => {
    state.scrap = Math.max(state.scrap, 200);
    ui.updateHUD(state);
    ui.cb.armoryUpgrade?.(debugParams.get('upgrade'));
    ui.toggleWardrobe(true);
  }, 600);
}
if (debugParams.has('fire')) {
  setTimeout(() => window.__ashfall.actions.doStrike(), 1500);
}
if (debugParams.has('autostart')) {
  requestAnimationFrame(() => document.getElementById('start-btn')?.click());
}
if (debugParams.has('fastforward')) {
  // Deterministic headless step: rAF advances very slowly under virtual time.
  setTimeout(() => {
    const seconds = Math.min(60, Number(debugParams.get('fastforward')) || 5);
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) {
      if (!state.started) break;
      simulate(1 / 60);
      campFolk.update(1 / 60, state.time, player, settlement.buildings);
      raiders.update(1 / 60, state.time, player);
      fx.update(1 / 60);
    }
    ui.updateHUD(state);
    ui.setAmmo(player.ammoState());
    ui.hint(`SIM +${seconds}s`, 1800);
  }, Number(debugParams.get('ffdelay')) || 700);
}

requestAnimationFrame(loop);
