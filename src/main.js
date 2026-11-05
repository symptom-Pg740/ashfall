import * as THREE from 'three';
import { createTerrain, heightAt, worldField, WORLD_RADIUS, PLAY_RADIUS, clampToPlayArea, inPlayArea, distanceOutsidePlayArea } from './terrain.js';
import { WORLD_SEED, deriveSeed } from './rng.js';
import { createAtmosphere, SUN_DIR } from './sky.js';
import { createWasteland } from './props.js';
import { ScrapField } from './resources.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Bats } from './bats.js';
import { Particles } from './particles.js';
import { Settlement, BUILDINGS } from './settlement.js';
import { Perf, QUALITY } from './perf.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { CampFolk } from './npcs.js';
import { Raiders } from './raiders.js';
import { EncounterField } from './encounters.js';
import { CellSystem } from './cells.js';
import { ExpeditionSystem } from './expeditions.js';
import { Commander } from './commander.js';
import { Armory } from './armory.js';
import { RECIPES, COMPONENT_CAP, recipeCap, recipeStock } from './recipes.js';
import { AudioFx } from './audio.js';
import { DayCycle } from './daycycle.js';
import { PowerNetwork } from './power.js';
import { TradeNetwork } from './trade.js';
import { BuildingCard } from './buildingcard.js';
import { WireTool } from './wire.js';
import { PathDebug } from './pathdebug.js';
import { NavGrid } from './nav.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { readSave, writeSave, clearSave } from './save.js';
import { itemLabel } from './wardrobe.js';
import { WEAPONS } from './weapons.js';
import { paint } from './geo.js';
import { TargetRegistry, canAttack } from './actors.js';
import { Firearms } from './firearms.js';
import { FX } from './fx.js';
import { XP } from './levels.js';
import { Economy, canProduce, applyProduction } from './features/economy/index.js';
import { createQualityController } from './app/quality.js';
import { installDebugHooks } from './app/debug.js';

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
const terrainChunks = createTerrain(scene);
const wasteland = createWasteland(scene, deriveSeed('wasteland'));
const particles = new Particles(scene);
const scrapField = new ScrapField(scene, deriveSeed('scrap'), { obstacles: wasteland.obstacles });
const player = new Player(scene);
// There is no separate "you" body in the world. The player controller is a camera anchor that
// borrows a survivor's rig when you take control of them.
player.group.visible = false;
const enemies = new Enemies(scene, deriveSeed('enemies'));
const bats = new Bats(scene, deriveSeed('bats'));
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
const encounters = new EncounterField({
  seed: deriveSeed('encounters'),
  enemies,
  raiders,
  bats,
  obstacles: wasteland.obstacles,
});
encounters.build();

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
  inCell: false,
  campLost: false,
  lastWarnings: [],
};

// The relay is a command centre, not a finish line. Broadcasting costs scrap and a day of cooldown
// and attracts a survivor when there is a free bed.
const comms = {
  broadcastDay: -1,
  lastResult: '',
};

// The camp stockpile has one owner. The flat state fields remain for the HUD/save compatibility.
const economy = new Economy({ state, componentCap: COMPONENT_CAP });

// Ammo reserve, per-weapon magazines and upgrade tiers live in the save state.
const armory = new Armory(state, economy);
const audio = new AudioFx();
const dayCycle = new DayCycle({ atmosphere, scene, renderer, state });
player.setArmory(armory);
player.onDry = (name) => {
  ui.toast(`OUT OF AMMO · ${name}`, true);
  audio.click();
};

// Shared target registry: survivors, raiders, ghouls and bats all describe themselves the same way.
const registry = new TargetRegistry();
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
    for (let i = 0; i < campFolk.people.length; i++) {
      const person = campFolk.people[i];
      if (!person.active || person.dead || person.left) continue;
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
registry.add(bats);

/**
 * Every living body a ghoul or a bat can bite. The hidden player camera anchor is deliberately
 * absent: if nobody is standing there, there is nothing to attack.
 */
const _living = [];
function livingTargets() {
  _living.length = 0;
  for (let i = 0; i < campFolk.people.length; i++) {
    const person = campFolk.people[i];
    if (!person.active || person.dead || person.left) continue;
    const t = campTargets[i];
    const pos = person.rig.group.position;
    t.x = pos.x;
    t.y = pos.y;
    t.z = pos.z;
    t.hp = person.hp;
    t.maxHp = person.maxHp;
    t.dead = false;
    _living.push(t);
  }
  for (const r of raiders.people) {
    if (!r.active || r.dead) continue;
    const t = r.target;
    const pos = r.rig.group.position;
    t.x = pos.x;
    t.y = pos.y;
    t.z = pos.z;
    t.hp = r.hp;
    t.dead = false;
    _living.push(t);
  }
  return _living;
}

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
  economy,
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
    economy.add('water', n);
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
economy.setCapacity(settlement.storageCap());
settlement.onStorageChanged = (cap) => economy.setCapacity(cap);
const power = new PowerNetwork({ scene, settlement, state, economy, ui });
const trade = new TradeNetwork({ settlement, state, economy, ui, onSave: () => saveGame() });
trade.onArrive = () => ui.hint('A CARAVAN IS COMING DOWN THE HIGHWAY', 4200);
trade.onDepart = () => ui.toast('THE CARAVAN MOVES ON');
const buildingCard = new BuildingCard({
  ui,
  settlement,
  power,
  campFolk,
  scrapField,
  state,
  comms,
  getSelected: () => commander.selected,
  screenOf: (x, y, z) => commander.screenOf(x, y, z),
  onBroadcast: (relay) => broadcastRelay(relay),
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
buildingCard.trade = trade;
const cells = new CellSystem({
  scene,
  terrainChunks,
  wasteland,
  settlement,
  scrapField,
  campFolk,
  enemies,
  raiders,
  bats,
  ui,
  obstacles: wasteland.obstacles,
});
cells.onBite = null;
cells.onLoot = () => {
  ui.toast('CACHE LOOTED · RETURN TO CAMP TO BANK IT');
  refreshCellHud();
};
registry.add(cells);
const expeditions = new ExpeditionSystem({
  campFolk,
  settlement,
  scrapField,
  cells,
  state,
  economy,
  ui,
  player,
  onSave: () => saveGame(),
  onLoot: (scrap, components) => {
    const gained = grantScrap(scrap);
    if (components) economy.add('components', components);
    ui.updateHUD(state);
    if (gained !== scrap) ui.toast('EXPEDITION LOOT · STORAGE WAS FULL', true);
  },
});
commander.buildingCard = buildingCard;
expeditions.onEnterCell = (mission, members) => enterExpeditionCell(mission, members);
expeditions.onExitCell = () => exitExpeditionCell();
const nav = new NavGrid({ settlement, wasteland });
campFolk.nav = nav;
const perf = new Perf(renderer);
const quality = createQualityController({
  atmosphere,
  scene,
  particles,
  wasteland,
  enemies,
  fx,
  audio,
  ui,
  perf,
});
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
raiders.onLoot = (kind, amount, building) => {
  if (kind === 'scrap' || kind === 'water' || kind === 'food') {
    const lost = economy.take(kind, amount);
    ui.toast(kind === 'food' ? `RAIDERS TOOK ${lost} FOOD` : `RAIDERS LOOTED ${lost} ${kind.toUpperCase()}`, true);
  }
  particles.burst(building.x, building.y + 1, building.z, '#c4644a', 10, 2.2);
  ui.updateHUD(state);
  saveGame();
};
raiders.onRetreat = (alive, total) => {
  ui.toast(`RAIDERS BREAKING OFF · ${alive}/${total} LEFT`, true);
};
raiders.onEscape = (carry) => {
  if (carry > 0) ui.hint('THE RAIDERS RUN WITH THEIR LOOT', 2400);
};
settlement.onBuildingDestroyed = (building) => {
  power.removeBuilding(building);
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
settlement.onBuildingRemoved = (building, refund, reason) => {
  power.removeBuilding(building);
  if (buildingCard.building === building) buildingCard.close();
  for (const person of campFolk.people) {
    if (person.home === building) campFolk.releaseWorkplace(person, true);
    if (person.manning === building) campFolk.releaseTower(person);
  }
  const gained = grantScrap(refund || 0);
  ui.toast(
    `${building.def.name} ${reason === 'cancelled' ? 'CANCELLED' : 'DEMOLISHED'}${gained ? ` · +${gained} SCRAP` : ''}`,
  );
  ui.updateHUD(state);
  refreshUnits();
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
campFolk.onLevelUp = (person, level) => {
  ui.toast(`${person.name} · LEVEL ${level}`);
  if (commander.selected === person) {
    state.maxHealth = person.maxHp;
    state.health = Math.min(state.health, state.maxHealth);
    commander.refresh(person);
  }
  refreshUnits();
  ui.updateHUD(state);
  saveGame();
};
campFolk.isStorageFull = () => state.scrap >= (state.scrapCap || 80);
campFolk.isWaterFull = () => state.water >= (state.waterCap || 80);
campFolk.isFoodFull = () => state.food >= (state.foodCap || 80);
campFolk.isWaterEmpty = () => state.water <= 0;
campFolk.takeWater = (n = 1) => economy.take('water', n) >= n;
campFolk.canCraft = (id) => {
  const recipe = RECIPES[id];
  if (!recipe) return { ok: false, reason: 'NO RECIPE' };
  return canProduce(recipe, {
    scrap: economy.amount('scrap'),
    stock: recipeStock(state, recipe),
    cap: recipeCap(recipe),
  });
};
campFolk.doCraft = (id) => {
  const recipe = RECIPES[id];
  if (!recipe) return false;
  const check = campFolk.canCraft(id);
  if (!check.ok) return false;
  const next = applyProduction(recipe, {
    scrap: economy.amount('scrap'),
    stock: recipeStock(state, recipe),
  });
  if (!economy.spend({ scrap: recipe.scrap })) return false;
  if (recipe.ammo) state.ammo[recipe.ammo] = next.stock;
  else economy.set('components', next.stock);
  return true;
};
campFolk.onCraft = () => {
  ui.updateHUD(state);
  refreshUnits();
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
  ui.updateHUD(state);
  return person.mag;
};
campFolk.onWaterProduced = (n = 1) => {
  economy.add('water', n);
  ui.updateHUD(state);
};
campFolk.onFoodProduced = (n = 1) => {
  economy.add('food', n);
  ui.updateHUD(state);
};
campFolk.onLeave = (person) => {
  ui.toast(`${person.name} LEFT CAMP`, true);
  refreshUnits();
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
  buildToggle: toggleBuild,
  buildClose: closeBuild,
  buildSelect: selectBuilding,
  place: doPlace,
  cancelPlace: cancelPlacement,
  placeRotate: (rad) => settlement.rotateGhost(rad),
  perf: () => ui.togglePerf(),
  units: () => openUnits(),
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
    else if (ui.unitsOpen) ui.toggleUnits(false);
    else if (ui.campOpen) ui.toggleCamp(false);
    else if (buildingCard.open) buildingCard.close();
    else if (commander.selected) commander.clear();
  },
  cycleUnit: (dir) => commander.cycle(dir),
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

let nearScrap = -1;
let shadowAutoFallback = false;
let autoLowTime = 0;
window.__ashfall = {
  state,
  economy,
  ui,
  seed: WORLD_SEED,
  worldField,
  campFolk,
  raiders,
  encounters,
  commander,
  power,
  trade,
  buildingCard,
  wire,
  cells,
  expeditions,
  pathDebug,
  nav,
  comms,
  settlement,
  buildings: BUILDINGS,
  player,
  enemies,
  bats,
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
  terrainChunks,
  actions: {
    doPlace,
    doStress,
    applyQuality: quality.applyQuality,
    setOrtho,
    rotateBy,
    saveGame,
    loadGame,
    validateWorld,
    damage: (n) => damageSelected(n),
    dawn: () => {
      state.day += 1;
      dawnTick(state.day);
    },
    needs: () => campFolk.people.map((p) => ({ name: p.name, hunger: p.hunger, thirst: p.thirst, morale: p.morale, leaveWarn: p.leaveWarn, left: !!p.left, speed: p.speed })),
  },
};
let nextRaid = 55;
let raidActive = false;
let raidKind = 'raiders';
let resumedGame = false;
let lastSave = 0;
let cameraShake = 0;
let hitStopTimer = 0;
let lastUIUpdate = 0;
let lastCampPaint = 0;
let stressMesh = null;
let boundaryWarned = false;

// Browsers only allow audio after a trusted gesture; every pointer-down retries the resume.
window.addEventListener('pointerdown', () => audio.start(), { passive: true });

ui.on('started', () => {
  if (state.started) return;
  state.started = true;
  audio.start();
  input.setEnabled(true);
  nextRaid = state.time + (resumedGame ? 45 : 55);
  const first = commander.units().find((p) => !p.dead && !p.left);
  if (first) commander.select(first);
  // Open on the camp, not on whichever survivor happened to spawn furthest out. The compass
  // centre recentres on the selected unit when the player wants to follow them.
  const camp = settlement.nearestOfType('campfire', 0, 0);
  if (camp) {
    cameraFollow = false;
    focus.set(camp.x, 0, camp.z);
    cameraReady = false;
  }
  ui.hint('THE CAMP IS YOURS · BUILD, ASSIGN, ARM, AND KEEP THE FIRE LIT', 5200);
  ui.toast('THE WASTES ARE LISTENING');
  last = performance.now();
});

ui.on('unitClose', () => commander.clear());
ui.on('unitsRefresh', () => refreshUnits());
ui.on('unitsSelect', (key) => {
  commander.selectKey(key);
  refreshUnits();
});
let expelConfirm = { key: '', at: 0 };

ui.on('unitAction', (key, action) => {
  const unit = commander.unitByKey(key);
  if (!unit) return;
  if (action === 'focus') {
    commander.select(unit);
    commander.onFocus(unit);
  } else if (action === 'welcome') {
    const living = campFolk.people.filter((p) => p.active && !p.left && !p.dead && !p.pending).length;
    const cap = Math.min(6, 3 + settlement.count('house'));
    if (living >= cap) {
      ui.toast('NO FREE BED · BUILD A HOUSE FIRST', true);
    } else if (campFolk.welcome(unit)) {
      ui.toast(`${unit.name} JOINED THE CAMP`);
      commander.select(unit);
      saveGame();
    }
  } else if (action === 'reject') {
    const name = unit.name;
    if (campFolk.reject(unit)) {
      ui.toast(`${name} WAS TURNED AWAY`);
      if (commander.selected === unit) commander.clear();
      saveGame();
    }
  } else if (action === 'expel') {
    const now = performance.now();
    if (expelConfirm.key === key && now - expelConfirm.at < 4000) {
      const name = unit.name;
      expelConfirm = { key: '', at: 0 };
      if (campFolk.expel(unit)) {
        ui.toast(`${name} WAS EXPELLED`);
        if (commander.selected === unit) commander.clear();
        const left = campFolk.people.filter((p) => p.active && !p.left && !p.pending && !p.dead).length;
        const pending = campFolk.people.filter((p) => p.active && !p.left && p.pending).length;
        if (left === 0 && pending === 0) endCamp('THE CAMP IS EMPTY');
        saveGame();
      }
    } else {
      expelConfirm = { key, at: now };
      ui.toast(`TAP EXPEL AGAIN TO CONFIRM ${unit.name}`, true);
    }
  } else if (action === 'release') {
    commander.releasePost(unit);
  } else if (action === 'guard') {
    const post = settlement.buildings.find((b) => b.type === 'tower' && b.built && !b.manned);
    if (post) commander.orderManTower(unit, post);
    else ui.toast('NO FREE GUARD POST', true);
  }
  refreshUnits();
});
ui.on('unitEquip', (key, slot, dir) => {
  const unit = commander.unitByKey(key);
  if (!unit) return;
  const id = unit.rig.cycleEquipment(slot, dir);
  ui.toast(`${unit.name} · ${slot.toUpperCase()} · ${itemLabel(slot, id)}`);
  refreshUnits();
  commander.refresh(unit);
  saveGame();
});
ui.on('campRefresh', () => refreshCamp());
ui.on('campSelect', (index) => {
  const person = campFolk.people[index];
  if (!person || person.onExpedition || person.dead) return;
  commander.selectKey(`camp:${index}`);
  ui.toggleCamp(false);
});
ui.on('campTarget', (id) => {
  expeditions.selectTarget(id);
  refreshCamp();
});
ui.on('campMember', (index) => {
  expeditions.toggleMember(index);
  refreshCamp();
});
ui.on('campLaunch', () => {
  if (expeditions.launch()) refreshCamp();
});
ui.on('buildingAction', (id) => buildingCard.action(id));
ui.on('buildingSlot', (index) => buildingCard.slot(index));
ui.on('buildingClose', () => buildingCard.close());
ui.on('wireCancel', () => wire.cancel());
ui.on('buildToggle', toggleBuild);
ui.on('buildClose', closeBuild);
ui.on('buildSelect', selectBuilding);
ui.on('place', doPlace);
ui.on('cancelPlace', cancelPlacement);
ui.on('placeRotate', (rad) => settlement.rotateGhost(rad));
ui.on('cellLoot', () => {
  if (cells.interact() === 'loot') {
    ui.toast('CACHE LOOTED');
    refreshCellHud();
  }
});
ui.on('cellLeave', () => leaveExpeditionCell());
ui.on('quality', (name) => quality.applyQuality(name));
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
    quality.applyShadowState(value, QUALITY[perf.quality].shadowSize);
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

ui.on('armoryUpgrade', (trackId) => {
  const unit = commander.selected;
  const weaponId = unit?.weapon?.baseId || unit?.weapon?.id || 'pistol';
  if (!armory.buyUpgrade(weaponId, trackId)) {
    ui.toast('NOT ENOUGH SCRAP', true);
    return;
  }
  ui.toast(`${weaponId.toUpperCase()} · ${trackId.toUpperCase()} UP`);
  ui.updateHUD(state);
  refreshUnits();
  saveGame();
});

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

function toggleBuild() {
  if (!state.started || state.dead || state.inCell) return;
  if (ui.buildOpen) {
    closeBuild();
    return;
  }
  wire.cancel(true);
  buildingCard.close();
  ui.toggleCamp(false);
  ui.toggleUnits(false);
  commander.clear();
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
  if (!state.started || state.dead || state.inCell) return;
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
  if (!settlement.placing || state.inCell) return;
  if (!settlement.canPlace) {
    ui.toast(settlement.reason || 'INVALID SPOT', true);
    return;
  }
  const def = settlement.selected;
  const compCost = def?.components || 0;
  if (compCost && !economy.canAfford({ components: compCost })) {
    ui.toast(`NEED ${compCost} COMPONENTS · CRAFT THEM IN THE WORKSHOP`, true);
    return;
  }
  const res = settlement.place(player);
  if (!res.ok) {
    ui.toast(res.reason, true);
    return;
  }
  economy.spend({ scrap: res.cost, components: compCost });
  const free = campFolk.people.some((p) => !p.dead && !p.left && !p.home && !p.job && !p.onExpedition);
  ui.toast(
    `${res.building.def.name} SITE${free ? ' · A FREE SURVIVOR WILL BUILD IT' : ' · ALL SURVIVORS ARE BUSY'}`,
  );
  ui.updateHUD(state);
  cameraShake = Math.max(cameraShake, 0.12);
  // One site per pick: the red ghost ring was confusing next to the new scaffold.
  cancelPlacement();
  saveGame();
}

function grantScrap(amount) {
  return economy.add('scrap', amount);
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
  } else if (kind === 'bats') {
    const spawned = bats.spawn(6, player.x, player.z, 18);
    ui.toast(`STRESS · ${spawned} BATS INBOUND`);
    cameraShake = 0.2;
  } else if (kind === 'clear') {
    if (stressMesh) stressMesh.count = 0;
    enemies.clear();
    bats.clear();
    ui.toast('STRESS SCENE CLEARED');
  }
}

// ---------------------------------------------------------------------------
// damage / death
// ---------------------------------------------------------------------------

function damageSelected(amount, fromX, fromZ) {
  if (!state.started) return false;
  let unit = commander.selected;
  if (!unit || unit.dead) {
    let best = null;
    let bestD = Infinity;
    for (const p of campFolk.people) {
      if (!p.active || p.dead || p.left || p.onExpedition) continue;
      const pos = p.rig.group.position;
      const d = Math.hypot(pos.x - (fromX ?? player.x), pos.z - (fromZ ?? player.z));
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    unit = best;
    if (unit) commander.select(unit);
  }
  if (!unit || unit.dead) return false;
  const index = campFolk.people.indexOf(unit);
  const killed = campFolk.damage(index, amount);
  state.health = unit.hp;
  state.maxHealth = unit.maxHp;
  state.lastDamage = state.time;
  ui.flashDamage();
  ui.updateHUD(state);
  cameraShake = Math.max(cameraShake, 0.35);
  if (killed) {
    ui.toast(`${unit.name} DOWN`, true);
    const next = commander.units().find((p) => !p.dead);
    if (next) commander.select(next);
    saveGame();
  }
  return killed;
}
enemies.onPlayerHit = (amount, enemy) => damageSelected(amount, enemy?.x, enemy?.z);

// ---------------------------------------------------------------------------
// save / load
// ---------------------------------------------------------------------------

function saveGame() {
  if (!state.started || state.campLost || state.inCell) return;
  writeSave({
    v: 7,
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
    trade: trade.serialize(),
    encounters: encounters.serialize(),
    cells: cells.serialize(),
    expeditions: expeditions.serialize(),
    comms: { broadcastDay: comms.broadcastDay, lastResult: comms.lastResult },
    timers: {
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
  economy.syncFromState();
  campFolk.restore(save.units, (id) => settlement.buildings.find((b) => b.id === id) || null);
  refreshUnits();
  power.restore(save.power);
  trade.restore(save.trade);
  encounters.restore(save.encounters);
  cells.restore(save.cells);
  expeditions.restore(save.expeditions);
  if (save.comms && typeof save.comms === 'object') {
    comms.broadcastDay = Number.isFinite(save.comms.broadcastDay) ? save.comms.broadcastDay : -1;
    comms.lastResult = typeof save.comms.lastResult === 'string' ? save.comms.lastResult : '';
  }
  state.campLost = false;
  scrapField.restore(save.scrap);
  if (save.timers) {
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
  if (distanceOutsidePlayArea(player.x, player.z) > 1) issues.push('player outside the world');
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
  const clamp = clampToPlayArea(focus.x, focus.z, -6);
  focus.x = clamp.x;
  focus.z = clamp.z;
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
  if (raidKind === 'ghouls') return enemies.activeCount;
  if (raidKind === 'bats') return bats.activeCount;
  return raiders.activeCount;
}

function startRaid(kind = 'raiders', count = 2, distance = 30, level = 1, center = null) {
  const opts = { level };
  const cx = center?.x ?? player.x;
  const cz = center?.z ?? player.z;
  const spawned = kind === 'ghouls'
    ? enemies.spawn(count, cx, cz, distance, opts)
    : kind === 'bats'
      ? bats.spawn(count, cx, cz, distance, opts)
      : raiders.spawnWave(count, cx, cz, distance, opts);
  if (spawned) {
    raidActive = true;
    raidKind = kind;
    ui.setRaid(raidRemaining(), kind);
    ui.hint(
      kind === 'ghouls' ? 'GHOULS IN THE DARK' : kind === 'bats' ? 'WINGS IN THE DARK' : 'RAIDERS IN THE DUST',
      3400,
    );
  }
  return spawned;
}

function broadcastRelay(relay) {
  if (!relay || !relay.built || relay.destroyed) return false;
  if (!relay.powered) {
    ui.toast('RELAY HAS NO POWER', true);
    return false;
  }
  if (comms.broadcastDay === state.day) {
    ui.toast('ALREADY BROADCAST TODAY', true);
    return false;
  }
  const living = campFolk.people.filter((p) => p.active && !p.dead && !p.left).length;
  const cap = Math.min(6, 3 + settlement.count('house'));
  if (living >= cap) {
    ui.toast('NO FREE BED · BUILD A HOUSE', true);
    return false;
  }
  const cost = 10;
  if (!economy.spend({ scrap: cost })) {
    ui.toast(`NEED ${cost} SCRAP TO BROADCAST`, true);
    return false;
  }
  comms.broadcastDay = state.day;
  const chance = 0.7 + (settlement.count('chapel') > 0 ? 0.15 : 0);
  const fire = campCenter();
  const recruit = Math.random() < chance
    ? campFolk.recruit(fire.x + 2.2, fire.z + 1.2)
    : null;
  comms.lastResult = recruit ? `${recruit.name} ANSWERED` : 'STATIC';
  ui.updateHUD(state);
  if (recruit) {
    ui.toast(`${recruit.name} ANSWERED THE BROADCAST`);
    ui.hint('A NEWCOMER IS WAITING AT THE FIRE · WELCOME OR REJECT', 5200);
    refreshUnits();
  } else {
    ui.toast('THE STATIC ANSWERS NOTHING', true);
    ui.hint('BROADCAST AGAIN TOMORROW', 2600);
  }
  saveGame();
  return true;
}

function endCamp(reason) {
  if (state.campLost) return;
  state.campLost = true;
  ui.hideHint();
  ui.showRunEnd(false, 'CAMP LOST', reason, {
    day: state.day,
    survivors: campFolk.people.filter((p) => p.active && !p.dead && !p.left).length,
    kills: state.kills,
  });
  input.setEnabled(false);
  saveGame();
}

function dawnTick(day) {
  let fed = 0;
  let watered = 0;
  for (const p of campFolk.people) {
    if (!p.active || p.dead || p.left || p.pending) continue;
    if (economy.take('water', 1)) {
      p.thirst = 0;
      watered++;
    } else {
      p.thirst = (p.thirst || 0) + 1;
    }
    if (economy.take('food', 1)) {
      p.hunger = 0;
      fed++;
    } else {
      p.hunger = (p.hunger || 0) + 1;
    }
    const unfed = p.hunger > 0 || p.thirst > 0;
    p.speed = p.baseSpeed * (unfed ? 0.8 : 1) * (1 + 0.02 * ((p.level || 1) - 1));
  }

  const report = campFolk.evaluateMorale(day, state, settlement);
  state.lastWarnings = report.warnings || [];
  let living = campFolk.people.filter((p) => p.active && !p.dead && !p.left && !p.pending).length;
  const cap = Math.min(6, 3 + settlement.count('house'));
  let recruited = null;
  if (
    !state.campLost &&
    living < cap &&
    state.water >= living + 2 &&
    state.food >= living + 2 &&
    day >= (state.nextRecruit || 0)
  ) {
    const spot =
      settlement.nearestOfType('campfire', player.x, player.z) ||
      { x: player.x, z: player.z, radius: 2 };
    const recruit = campFolk.recruit(spot.x + (spot.radius || 2), spot.z + 1);
    if (recruit) {
      recruited = recruit;
      living++;
      state.nextRecruit = day + 2 + Math.floor(Math.random() * 2);
      ui.toast(`${recruit.name} IS WAITING AT THE FIRE`);
    }
  }
  if (campFolk.people.filter((p) => p.active && !p.left && !p.dead).length === 0) {
    endCamp('EVERY SURVIVOR LEFT THE CAMP');
    return;
  }
  ui.updateHUD(state);
  refreshUnits();
  if (ui.campOpen) refreshCamp();
  const warning = report.warnings[0];
  const short = fed < living || watered < living;
  ui.hint(
    warning
      ? `DAY ${day} · ${warning.text}`
      : `DAY ${day} · ${living}/${cap} SURVIVORS · FOOD ${state.food} · WATER ${state.water}${recruited ? ` · ${recruited.name} WAITING AT THE FIRE` : ''}${short ? ' · SHORT SUPPLIES' : ''}`,
    warning ? 7000 : 5200,
  );
  saveGame();
}

function campCenter() {
  return settlement.nearestOfType('campfire', 0, 0) || { x: 0, z: 0 };
}

function campView() {
  const people = campFolk.people;
  const living = people.filter((p) => p.active && !p.dead && !p.left && !p.onExpedition).length;
  const cap = Math.min(6, 3 + settlement.count('house'));
  const totalLiving = people.filter((p) => p.active && !p.dead && !p.left).length;
  return {
    summary: [
      { label: 'DAY', value: String(state.day) },
      { label: 'SURVIVORS', value: `${totalLiving}/${cap}` },
      { label: 'AT CAMP', value: String(living) },
      { label: 'SCRAP', value: `${state.scrap}/${state.scrapCap || 80}` },
      { label: 'WATER', value: `${state.water}/${state.waterCap || 80}` },
      { label: 'FOOD', value: `${state.food}/${state.foodCap || 80}` },
    ],
    warnings: (state.lastWarnings || []).map((w) => ({ text: w.text, bad: true })),
    survivors: people
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => p.active && !p.left)
      .map(({ p, index }) => ({
        index,
        name: p.name,
        level: p.level || 1,
        role: (p.role || 'scavenger').toUpperCase(),
        home: p.home?.def?.name || null,
        hp: Math.max(0, Math.round(p.hp)),
        maxHp: Math.round(p.maxHp),
        armed: !!p.weapon,
        expedition: !!p.onExpedition,
        hunger: p.hunger || 0,
        thirst: p.thirst || 0,
        morale: Math.round(p.morale ?? 70),
        leaveWarn: p.leaveWarn || '',
        selected: commander.selected === p,
      })),
    expedition: expeditions.view(),
  };
}

function refreshCamp() {
  if (ui.campOpen) ui.showCamp(campView());
}

function openUnits() {
  ui.toggleUnits(true);
  refreshUnits();
}

function refreshUnits() {
  if (!ui.unitsOpen) return;
  const units = commander.units().filter((p) => !p.left).map((p) => commander.view(p));
  const living = campFolk.people.filter((p) => p.active && !p.dead && !p.left).length;
  const cap = Math.min(6, 3 + settlement.count('house'));
  const selected = commander.selected;
  const weaponId = selected?.weapon?.baseId || selected?.weapon?.id || 'pistol';
  const armoryView = armory.view(weaponId);
  ui.showUnits({
    units,
    living,
    cap,
    selectedKey: selected ? commander.keyOf(selected) : '',
    armory: armoryView,
  });
}

function refreshCellHud() {
  const view = cells.hudView?.();
  if (view) ui.showCell(view);
  else ui.hideCell();
}

/**
 * With no leader body in the world, the player controller is just the camera anchor. In command
 * mode it sits on the selected survivor (or the campfire when nothing is selected); taking control
 * moves the anchor onto the borrowed rig instead.
 */
function updateCommandAnchor() {
  let sel = commander.selected;
  if (state.inCell && (!sel || sel.dead || sel.left)) {
    sel = commander.units().find((p) => !p.dead && !p.left) || null;
    if (sel) commander.select(sel);
  }
  if (sel && sel.active && !sel.dead) {
    const p = sel.rig.group.position;
    player.pos.set(p.x, p.y, p.z);
    player.heading = sel.rig.group.rotation.y;
    player.targetHeading = player.heading;
    return;
  }
  if (state.inCell && cells.exitPos) {
    player.pos.set(cells.exitPos.x, cells.group.position.y, cells.exitPos.z);
    return;
  }
  const fire = settlement.nearestOfType('campfire', player.x, player.z);
  if (fire) {
    player.pos.set(fire.x, heightAt(fire.x, fire.z), fire.z);
  }
}

function enterExpeditionCell(mission, members) {
  state.inCell = true;
  commander.inCell = true;
  commander.cellMembers = members;
  campFolk.activeFilter = members;
  wire.cancel(true);
  buildingCard.close();
  if (ui.buildOpen) closeBuild();
  ui.toggleCamp(false);
  ui.toggleUnits(false);
  const first = members.find((p) => !p.dead && !p.left);
  if (first) commander.select(first);
  ui.toast(`ARRIVED · ${mission.label}`);
  ui.hint('TAP THE GROUND TO MOVE · TAP A GHOUL TO ENGAGE · LOOT WHEN CLEAR', 5200);
  focus.set(player.x, 0, player.z);
  camTarget.set(player.x, player.pos.y, player.z);
  cameraReady = false;
  cameraFollow = true;
  refreshCellHud();
}

function leaveExpeditionCell() {
  if (!cells.active) return;
  const result = cells.exitExpedition();
  state.inCell = false;
  commander.inCell = false;
  commander.cellMembers = null;
  campFolk.activeFilter = null;
  player.bounds = null;
  player.floorY = null;
  ui.hideCell();
  expeditions.completeFromCell(result);
  refreshCellHud();
}

function exitExpeditionCell() {
  const camp = campCenter();
  focus.set(camp.x, 0, camp.z);
  camTarget.set(camp.x, heightAt(camp.x, camp.z), camp.z);
  cameraReady = false;
  cameraFollow = true;
  const next = commander.units().find((p) => !p.dead && !p.left);
  if (next) commander.select(next);
  refreshUnits();
  ui.toast('BACK IN THE DUST');
  saveGame();
}

function simulateCell(dt) {
  // The expedition cell is a separate arena. The overworld is hidden and paused; only the team,
  // the hostiles in the cell and the cell HUD run.
  state.time += dt;
  updateCommandAnchor();
  campFolk.inCell = true;
  campFolk.solids = null;
  const savedNav = campFolk.nav;
  campFolk.nav = null;
  campFolk.update(dt, state.time, player, []);
  campFolk.nav = savedNav;
  cells.update(dt, player, commander.selected);
  commander.update(dt);
  fx.update(dt);
  refreshCellHud();
}

function simulate(dt) {
  if (state.campLost) return;
  if (state.inCell) {
    simulateCell(dt);
    return;
  }
  campFolk.inCell = false;
  state.time += dt;
  const day = 1 + Math.floor(state.time / 360);
  if (day > state.day) {
    state.day = day;
    dawnTick(day);
  }

  updateCommandAnchor();

  if (!inPlayArea(player.x, player.z) && !boundaryWarned) {
    boundaryWarned = true;
    ui.hint('RAD STORM AHEAD — TURN BACK', 2600);
  } else if (inPlayArea(player.x, player.z, 3)) {
    boundaryWarned = false;
  }

  settlement.update(dt, state.time, player, enemies, bats);
  enemies.update(dt, player, settlement.solids(), wasteland.obstacles, livingTargets);
  bats.update(dt, state.time, player, livingTargets);
  fx.update(dt);

  // campfire / chapel healing + slow passive regen, applied to the selected survivor
  const focus = commander.selected;
  if (focus && !focus.dead) {
    const fx = focus.rig.group.position.x;
    const fz = focus.rig.group.position.z;
    const healing = settlement.isNearHealer(fx, fz);
    const rate = healing ? 3.2 : state.time - state.lastDamage > 6 ? 0.7 : 0;
    if (rate > 0) {
      focus.hp = Math.min(focus.maxHp, focus.hp + rate * dt);
      state.health = focus.hp;
      state.maxHealth = focus.maxHp;
    }
  }

  // Camp events: occasional directed attacks, not a permanent trickle of spawns. The world
  // encounters are handled by the groups scattered around the map.
  if (!raidActive && state.time > nextRaid) {
    const night = dayCycle.daylight < 0.35;
    const roll = Math.random();
    let kind;
    if (night) kind = roll < 0.45 ? 'bats' : roll < 0.8 ? 'ghouls' : 'raiders';
    else kind = roll < 0.4 ? 'raiders' : roll < 0.8 ? 'ghouls' : 'bats';
    const pressure = 1 + Math.floor(state.time / 200);
    const eventLevel = 1 + Math.min(4, Math.floor(state.day / 2) + Math.floor(state.time / 240));
    const count = kind === 'raiders'
      ? Math.min(4, 1 + Math.floor(pressure / 2))
      : kind === 'bats'
        ? Math.min(6, 2 + Math.floor(pressure / 2))
        : Math.min(6, 2 + pressure);
    const spawned = startRaid(kind, count, kind === 'bats' ? 24 : 30, eventLevel, campCenter());
    nextRaid = spawned ? state.time + 80 + Math.random() * 45 : state.time + 10;
  }

  if (raidActive) {
    const remaining = raidRemaining();
    ui.setRaid(remaining, raidKind);
    if (remaining === 0) {
      raidActive = false;
      ui.setRaid(0, raidKind);
      const stolen = raidKind === 'raiders' ? raiders.lootedValue : 0;
      if (stolen > 0) {
        ui.toast(`RAIDERS ESCAPED WITH ${stolen} RESOURCES`, true);
        ui.hint('THEY TOOK WHAT THEY COULD CARRY', 2800);
        ui.showRaidResult(false, `${stolen} STOLEN · CAMP DAMAGED`);
      } else {
        grantScrap(10);
        ui.updateHUD(state);
        ui.toast('RAID CLEARED · +10 SCRAP');
        ui.hint('THE DUST SETTLES — FOR NOW', 2600);
        ui.showRaidResult(true, '+10 SCRAP · THE DUST SETTLES');
      }
      saveGame();
    }
  }

  if (settlement.placing) ui.setPlaceStatus(settlement.canPlace, settlement.reason);

  // Last-resort mobile fallback: if adaptive resolution is already at the floor
  // and we still cannot hold ~40 fps, drop the shadow pass before the experience degrades.
  if (quality.shadowsOn && perf.adaptive && !shadowAutoFallback && perf.scale <= 0.51) {
    if (perf.stats.fps > 0 && perf.stats.fps < 40) autoLowTime += dt;
    else autoLowTime = 0;
    if (autoLowTime > 3) {
      shadowAutoFallback = true;
      autoLowTime = 0;
      quality.applyShadowState(false, 0);
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
  if (state.started && !state.campLost) {
    simulate(dt);
  } else if (!state.started) {
    // keep the firelight alive behind the start/death overlay
    state.time += dt;
    settlement.update(dt, state.time, player, null);
    enemies.update(dt, player, settlement.buildings, wasteland.obstacles, livingTargets);
    bats.update(dt, state.time, player, livingTargets);
  }

  if (!state.inCell && !state.campLost) {
    campFolk.solids = settlement.solids();
    raiders.solids = campFolk.solids;
    campFolk.update(dt, state.time, player, settlement.buildings);
    const sel = commander.selected;
    if (sel && sel.active && !sel.dead) {
      state.health = sel.hp;
      state.maxHealth = sel.maxHp;
    }
    raiders.update(dt, state.time, player, livingTargets);
    encounters.update(dt, player.x, player.z);
    expeditions.update(dt);
    pathDebug.update(campFolk.people, dt);
    power.update(dt, dayInfo.daylight);
    trade.update(dt);
  }
  commander.update(dt);
  buildingCard.update(dt);
  // Damage and passive regen change health outside the event-driven HUD paths.
  if (now - lastUIUpdate > 120) {
    lastUIUpdate = now;
    ui.updateHUD(state);
  }
  if (ui.campOpen && now - lastCampPaint > 500) {
    lastCampPaint = now;
    refreshCamp();
  }
  if (ui.unitsOpen && now - lastCampPaint > 500) {
    lastCampPaint = now;
    refreshUnits();
  }
  if (state.started && !state.campLost && !state.inCell && now - lastSave > 5000) {
    lastSave = now;
    saveGame();
  }
  scrapField.update(state.time);
  particles.update(dt, state.time);
  wasteland.updateWind(state.time);
  updateCamera(dt, 0, 0);
  if (!state.inCell) {
    terrainChunks.update(camTarget.x, camTarget.z);
    wasteland.stream?.(camTarget.x, camTarget.z);
    settlement.updateOcclusion(activeCamera, player, dt);
  }
  ui.setCompass(yaw.current, !cameraFollow);

  ui.updateHUD(state);

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
const initialQuality = quality.pickQuality(coarse);
quality.applyQuality(initialQuality, true);
ui.setToggle('adaptive', perf.adaptive);
ui.setToggle('fog', true);
ui.setToggle('grass', true);
ui.setToggle('embers', true);
ui.setToggle('shadows', quality.shadowsOn);
ui.setToggle('ortho', orthoMode);
ui.setToggle('sound', !audio.muted);
const showPaths = new URLSearchParams(window.location.search).has('paths');
pathDebug.setEnabled(showPaths);
ui.setToggle('paths', showPaths);
ui.setSeed(WORLD_SEED);
// A 45-degree yaw reads more of each building's side and roof than a straight-on view.
const startYaw = new URLSearchParams(window.location.search).has('yaw0') ? 0 : Math.PI / 4;
yaw.current = startYaw;
yaw.target = startYaw;
input.camera = activeCamera;
ui.updateHUD(state);
ui.setQuality(initialQuality);

// `?fresh` is a boot-time save reset: it must run before loadGame(), so it cannot live in the
// post-boot debug hooks. The rest of the URL test hooks are installed below via app/debug.js.
if (new URLSearchParams(window.location.search).has('fresh')) clearSave(false);
resumedGame = loadGame();
if (!resumedGame || settlement.count('campfire') === 0) settlement.seedStartingCamp();
ui.setResume(resumedGame);
ui.setRaid(0, 'raiders');
if (resumedGame) ui.updateHUD(state);

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

// Development-only URL test hooks. Inert unless present in the URL. Installed here, after the
// systems exist and the save is loaded, so the hooks see the same objects the loop uses.
installDebugHooks({
  params: new URLSearchParams(window.location.search),
  player,
  state,
  raiders,
  enemies,
  campFolk,
  commander,
  ui,
  audio,
  economy,
  settlement,
  fx,
  weapons: WEAPONS,
  startRaid,
  simulate,
  damageSelected,
  openUnits,
  refreshUnits,
  livingTargets,
  heightAt,
  setViewZoom(z) {
    viewZoom = viewZoomTarget = z;
    orthoCamera.zoom = z;
    orthoCamera.updateProjectionMatrix();
  },
});

requestAnimationFrame(loop);
