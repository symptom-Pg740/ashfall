import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { merge, paint, shadowTexture } from './geo.js';
import { makeSpec, shade, smoothHead } from './character.js';
import { makeCharacterAtlas, CHAR_REGIONS } from './textures.js';
import { heightAt } from './terrain.js';
import { clamp } from './rng.js';
import {
  LAYOUT,
  RIG_GROUP,
  ball,
  boxUV,
  capsule,
  getLowDetail,
  rbox,
  ring,
  setLowDetail,
  setRegionUV,
  smoothMerge,
  tagGroup,
} from './charparts.js';
import {
  OUTFIT_SLOTS,
  ITEMS,
  SLOT_IDS,
  buildGearItem,
  buildOutfit,
  defaultEquipment,
  nextItemId,
  normalizeEquipment,
  prevItemId,
} from './wardrobe.js';

/**
 * Skinned humanoid (R2/R4).
 *
 * A slim skin body in one SkinnedMesh, an equipment outfit in a second SkinnedMesh sharing the
 * same skeleton, plus gear parented to bone sockets. The wardrobe can replace the outfit or any
 * gear slot at runtime without rebuilding the rig.
 */

let ATLAS = null;
function getAtlas() {
  if (!ATLAS) ATLAS = makeCharacterAtlas();
  return ATLAS;
}


function setBodyUV(geo, spec) {
  const { s } = spec;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // The base body is skin except the torso/hip underlayer, which is left as dark cloth so a
    // removed outfit never exposes a naked torso.
    const region = y > 1.4 * s || y < 0.95 * s ? 'skin' : 'cloth';
    const r = CHAR_REGIONS[region];
    let [u, v] = boxUV(x, y, z, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    u -= Math.floor(u);
    v -= Math.floor(v);
    uv[i * 2] = r[0] + u * (r[2] - r[0]);
    uv[i * 2 + 1] = r[1] + v * (r[3] - r[1]);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

function baseBodyGeometry(spec) {
  const { s, w, skin, coat } = spec;
  const p = [];
  const armX = LAYOUT.armX * w;
  const legX = LAYOUT.legX * w;
  const under = shade(coat, 0.48);
  const BODY = RIG_GROUP.BODY;

  // Torso and pelvis: a slim body that clothing sits on top of, not a suit of armour.
  p.push(tagGroup(rbox(0.34 * w, 0.22 * s, 0.24 * w, 0.07 * w, under, 0, 0.9 * s, 0), BODY));
  p.push(tagGroup(rbox(0.4 * w, 0.34 * s, 0.26 * w, 0.09 * w, under, 0, 1.12 * s, 0), BODY));
  p.push(tagGroup(rbox(0.33 * w, 0.17 * s, 0.23 * w, 0.07 * w, under, 0, 1.36 * s, 0), BODY));
  p.push(tagGroup(capsule(0.045 * w, 0.08 * s, skin, 0, 1.48 * s, 0), BODY));

  // arms
  for (const sx of [-1, 1]) {
    const group = sx < 0 ? RIG_GROUP.ARM_L : RIG_GROUP.ARM_R;
    p.push(tagGroup(ball(0.072 * w, skin, sx * armX, 1.38 * s, 0), group));
    p.push(tagGroup(capsule(0.056 * w, 0.26 * s, skin, sx * armX, 1.17 * s, 0), group));
    p.push(tagGroup(capsule(0.045 * w, 0.24 * s, skin, sx * armX, 0.83 * s, 0.006 * w), group));
    p.push(tagGroup(ball(0.056 * w, skin, sx * armX, 0.64 * s, 0.02 * w, 1, 0.92, 0.82), group));
  }

  // legs
  for (const sx of [-1, 1]) {
    const group = sx < 0 ? RIG_GROUP.LEG_L : RIG_GROUP.LEG_R;
    p.push(tagGroup(ball(0.082 * w, under, sx * legX, 0.84 * s, 0), group));
    p.push(tagGroup(capsule(0.076 * w, 0.26 * s, skin, sx * legX, 0.62 * s, 0), group));
    p.push(tagGroup(capsule(0.06 * w, 0.24 * s, skin, sx * legX, 0.24 * s, 0), group));
    p.push(tagGroup(rbox(0.13 * w, 0.1 * s, 0.24 * w, 0.03 * w, skin, sx * legX, 0.02 * s, 0.04 * w), group));
  }
  return setBodyUV(smoothMerge(p), spec);
}

function createSkeleton(s, w) {
  const root = new THREE.Bone();
  root.name = 'root';
  root.position.set(0, 0, 0);

  const hips = new THREE.Bone();
  hips.name = 'hips';
  hips.position.set(0, 0.88 * s, 0);
  root.add(hips);

  const spine = new THREE.Bone();
  spine.name = 'spine';
  spine.position.set(0, 0.14 * s, 0);
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'chest';
  chest.position.set(0, 0.2 * s, 0);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'neck';
  neck.position.set(0, 0.24 * s, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'head';
  head.position.set(0, 0.1 * s, 0);
  neck.add(head);

  const bones = [root, hips, spine, chest, neck, head];
  const arms = {};
  const legs = {};

  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Bone();
    shoulder.name = `shoulder${side}`;
    shoulder.position.set(sx * LAYOUT.shoulderX * w, 0.18 * s, 0);
    chest.add(shoulder);

    const upper = new THREE.Bone();
    upper.name = `upperArm${side}`;
    upper.position.set(sx * (LAYOUT.armX - LAYOUT.shoulderX) * w, 0, 0);
    shoulder.add(upper);

    const fore = new THREE.Bone();
    fore.name = `forearm${side}`;
    fore.position.set(0, -0.42 * s, 0);
    upper.add(fore);

    const hand = new THREE.Bone();
    hand.name = `hand${side}`;
    hand.position.set(0, -0.38 * s, 0);
    fore.add(hand);

    const thigh = new THREE.Bone();
    thigh.name = `thigh${side}`;
    thigh.position.set(sx * LAYOUT.legX * w, -0.02 * s, 0);
    hips.add(thigh);

    const shin = new THREE.Bone();
    shin.name = `shin${side}`;
    shin.position.set(0, -0.44 * s, 0);
    thigh.add(shin);

    const foot = new THREE.Bone();
    foot.name = `foot${side}`;
    foot.position.set(0, -0.4 * s, 0);
    shin.add(foot);

    bones.push(shoulder, upper, fore, hand, thigh, shin, foot);
    arms[side] = { shoulder, upper, fore, hand };
    legs[side] = { thigh, shin, foot };
  }

  return { root, hips, spine, chest, neck, head, arms, legs, bones };
}

function distanceToSegment(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const len = abx * abx + aby * aby + abz * abz;
  const t = len > 0.000001 ? clamp((apx * abx + apy * aby + apz * abz) / len, 0, 1) : 0;
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dy, dz);
}

function skinGeometry(geo, spec, skeleton) {
  const { s, w } = spec;
  const segs = [];
  const add = (name, ax, ay, az, bx, by, bz, group = 'body', side = '') => {
    segs.push({
      index: skeleton.bones.findIndex((b) => b.name === name),
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      arm: group === 'arm',
      leg: group === 'leg',
      side,
    });
  };

  add('hips', 0, 0.82 * s, 0, 0, 1.0 * s, 0);
  add('spine', 0, 1.0 * s, 0, 0, 1.22 * s, 0);
  add('chest', 0, 1.22 * s, 0, 0, 1.44 * s, 0);
  add('neck', 0, 1.44 * s, 0, 0, 1.56 * s, 0);
  add('head', 0, 1.56 * s, 0, 0, 1.9 * s, 0);

  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const ax = sx * LAYOUT.armX * w;
    add(`shoulder${side}`, sx * LAYOUT.shoulderX * w, 1.4 * s, 0, ax, 1.4 * s, 0, 'arm', side);
    add(`upperArm${side}`, ax, 1.4 * s, 0, ax, 0.98 * s, 0, 'arm', side);
    add(`forearm${side}`, ax, 0.98 * s, 0, ax, 0.6 * s, 0, 'arm', side);
    add(`hand${side}`, ax, 0.6 * s, 0, ax, 0.48 * s, 0, 'arm', side);
    add(`thigh${side}`, sx * LAYOUT.legX * w, 0.86 * s, 0, sx * LAYOUT.legX * w, 0.42 * s, 0, 'leg', side);
    add(`shin${side}`, sx * LAYOUT.legX * w, 0.42 * s, 0, sx * LAYOUT.legX * w, 0.02 * s, 0, 'leg', side);
    add(`foot${side}`, sx * LAYOUT.legX * w, 0.02 * s, 0, sx * LAYOUT.legX * w, 0.02 * s, 0.3 * w, 'leg', side);
  }

  const pos = geo.attributes.position;
  const groupAttr = geo.attributes.aGroup;
  const indices = new Uint16Array(pos.count * 4);
  const weights = new Float32Array(pos.count * 4);
  const ranked = [];
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Automatic distance weights alone let the arm bones claim the sides of the torso: the upper
  // arm bone is only ~5 cm from the chest wall, so swinging an arm dragged the chest with it.
  // Fade arm influence out inside the torso silhouette, and leg influence out above the hip.
  const torsoHalf = 0.2 * w;
  const armStart = torsoHalf * 0.88;
  const armEnd = torsoHalf * 1.08;
  const legTop = 1.02 * s;
  const legFade = 0.16 * s;

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const group = groupAttr ? Math.round(groupAttr.getX(i)) : -1;
    const xMask = smooth(armStart, armEnd, Math.abs(px));
    // Only the arm column follows the arm. Letting high chest vertices follow it stretched the
    // shirt's top box into a fan whenever the pistol arm extended.
    const armMask = xMask;
    const legMask = 1 - smooth(legTop, legTop + legFade, py);
    ranked.length = 0;
    let nearestD = Infinity;
    let nearestArm = false;
    let nearestLeg = false;
    for (const seg of segs) {
      if (group >= 0) {
        if (group === 0 && (seg.arm || seg.leg)) continue;
        if (group === 1 || group === 2) {
          if (!seg.arm || seg.side !== (group === 1 ? 'L' : 'R')) continue;
        } else if (group === 3 || group === 4) {
          if (!seg.leg || seg.side !== (group === 3 ? 'L' : 'R')) continue;
        }
      }
      const d = distanceToSegment(px, py, pz, seg.ax, seg.ay, seg.az, seg.bx, seg.by, seg.bz);
      if (d < nearestD) {
        nearestD = d;
        nearestArm = seg.arm;
        nearestLeg = seg.leg;
      }
      let weight = 1 / (d * d + 0.0025);
      if (group < 0) {
        if (seg.arm) weight *= armMask;
        else if (seg.leg) weight *= legMask;
      }
      ranked.push({ index: seg.index, w: weight, arm: seg.arm, leg: seg.leg });
    }
    // Untagged geometry keeps the old cross-limb guard. Tagged geometry is already restricted to
    // its own limb, so no opposite-limb weights can appear.
    if (group < 0) {
      if (nearestArm) {
        for (const r of ranked) if (r.leg) r.w = 0;
      } else if (nearestLeg) {
        for (const r of ranked) if (r.arm) r.w = 0;
      }
    }
    ranked.sort((a, b) => b.w - a.w);
    let total = 0;
    for (let k = 0; k < 3; k++) total += ranked[k].w;
    for (let k = 0; k < 4; k++) {
      const r = ranked[k] || { index: 0, w: 0 };
      const wgt = k < 3 && total > 0 ? r.w / total : 0;
      indices[i * 4 + k] = r.index;
      weights[i * 4 + k] = wgt;
    }
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  if (groupAttr) geo.deleteAttribute('aGroup');
}

export function buildSkinnedHumanoid(seed, options = {}) {
  setLowDetail(options.detail === 'low');
  const spec = makeSpec(seed, options);
  spec.skipHead = true;
  const { s, w, archetype, accent } = spec;
  const atlas = getAtlas();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: atlas.map,
    normalMap: atlas.normalMap,
    roughnessMap: atlas.surfaceMap,
    metalnessMap: atlas.surfaceMap,
    roughness: 1,
    metalness: 1,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });

  const equipment = normalizeEquipment(defaultEquipment(spec, options));

  const group = new THREE.Group();
  const skeleton = createSkeleton(s, w);

  // Base body: skin and underlayer only. All clothing/armour is a separate skinned layer.
  const bodyGeo = baseBodyGeometry(spec);
  skinGeometry(bodyGeo, spec, skeleton);
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, material);
  bodyMesh.castShadow = options.castShadow !== false;
  bodyMesh.receiveShadow = false;
  bodyMesh.frustumCulled = false;
  bodyMesh.add(skeleton.root);
  group.add(bodyMesh);
  group.updateMatrixWorld(true);
  skeleton.root.updateMatrixWorld(true);
  // Bone inverses must be captured after the rest-pose matrices are up to date.
  const skeletonObj = new THREE.Skeleton(skeleton.bones);
  const bindMatrix = new THREE.Matrix4();
  bodyMesh.bind(skeletonObj, bindMatrix);

  // Outfit layer: rebuilt in place when a torso/legs/feet slot changes.
  let outfitMesh = null;
  const rebuildOutfit = () => {
    const geo = buildOutfit(spec, equipment);
    if (!geo) {
      if (outfitMesh) {
        group.remove(outfitMesh);
        outfitMesh.geometry.dispose();
        outfitMesh = null;
      }
      return;
    }
    skinGeometry(geo, spec, skeleton);
    if (!outfitMesh) {
      outfitMesh = new THREE.SkinnedMesh(geo, material);
      outfitMesh.castShadow = options.castShadow !== false;
      outfitMesh.receiveShadow = false;
      outfitMesh.frustumCulled = false;
      group.add(outfitMesh);
      outfitMesh.bind(skeletonObj, bindMatrix);
    } else {
      outfitMesh.geometry.dispose();
      outfitMesh.geometry = geo;
    }
  };
  rebuildOutfit();

  // Head: authored asset on the player, procedural fallback on NPCs.
  const headGroup = new THREE.Group();
  skeleton.head.add(headGroup);
  if (options.headGeometry) {
    // The asset is already in head-local metres: neck pivot at (0,0,0), chin near the origin,
    // crown at y≈0.245. The inner group fits it to the stylised body.
    const fit = new THREE.Group();
    fit.scale.setScalar(1.25);
    fit.position.y = -0.03 * s;
    headGroup.add(fit);

    const headGeo = options.headGeometry.clone();
    headGeo.scale(s, s, s);
    paint(headGeo, spec.skin);
    setRegionUV(headGeo, 'skin');
    headGeo.computeVertexNormals();
    const authored = new THREE.Mesh(headGeo, material);
    authored.castShadow = options.castShadow !== false;
    fit.add(authored);

    // Hair shell: crown, sides and nape. The front wedge is left open for the face.
    const hairParts = [];
    const hairPiece = (thetaStart, thetaLength, phiStart, phiLength) => {
      const g = new THREE.SphereGeometry(
        1,
        getLowDetail() ? 12 : 24,
        getLowDetail() ? 8 : 16,
        phiStart,
        phiLength,
        thetaStart,
        thetaLength,
      );
      g.scale(0.116 * s, 0.12 * s, 0.138 * s);
      g.translate(0, 0.14 * s, -0.048 * s);
      paint(g, spec.hair);
      hairParts.push(g);
    };
    hairPiece(0, Math.PI * 0.36, 0, Math.PI * 2);
    hairPiece(Math.PI * 0.3, Math.PI * 0.34, Math.PI * 0.78, Math.PI * 1.44);
    hairPiece(Math.PI * 0.6, Math.PI * 0.2, Math.PI * 0.95, Math.PI * 1.1);
    const hairGeo = smoothMerge(hairParts);
    setRegionUV(hairGeo, 'cloth');
    const hair = new THREE.Mesh(hairGeo, material);
    hair.castShadow = options.castShadow !== false;
    fit.add(hair);

    const eyeGeo = merge([
      ball(0.0095 * s, '#d8cfbc', -0.031 * s, 0.142 * s, 0.047 * s, 1, 0.8, 0.7),
      ball(0.0095 * s, '#d8cfbc', 0.031 * s, 0.142 * s, 0.047 * s, 1, 0.8, 0.7),
      ball(0.0058 * s, '#241f1a', -0.031 * s, 0.142 * s, 0.0555 * s, 1, 1, 0.7),
      ball(0.0058 * s, '#241f1a', 0.031 * s, 0.142 * s, 0.0555 * s, 1, 1, 0.7),
      rbox(0.046 * s, 0.0065 * s, 0.014 * s, 0.003 * s, shade(spec.hair, 0.9), -0.033 * s, 0.166 * s, 0.052 * s, 0, 0, -0.07),
      rbox(0.046 * s, 0.0065 * s, 0.014 * s, 0.003 * s, shade(spec.hair, 0.9), 0.033 * s, 0.166 * s, 0.052 * s, 0, 0, 0.07),
    ]);
    setRegionUV(eyeGeo, 'skin');
    const eyes = new THREE.Mesh(eyeGeo, material);
    eyes.castShadow = false;
    fit.add(eyes);
  } else {
    // `smoothHead` is already built in head-local space (the head group sits on the head bone),
    // so it must not be shifted again — doing that used to drop NPC heads down around their feet.
    const fallback = smoothHead(spec);
    const head = new THREE.Mesh(fallback, material);
    head.castShadow = options.castShadow !== false;
    headGroup.add(head);
  }

  // Gear slots: separate meshes on bone sockets. Rebuilt as a group when any gear slot changes.
  const gearMeshes = [];
  let muzzle = null;
  let foregrip = null;
  const boneFor = (path) => path.split('.').reduce((node, key) => node[key], skeleton);
  const refreshSockets = () => {
    const item = ITEMS.weapon[equipment.weapon];
    const hand = skeleton.arms.R.hand;
    if (item?.muzzle) {
      if (!muzzle) {
        muzzle = new THREE.Object3D();
        muzzle.name = 'muzzle';
        hand.add(muzzle);
      }
      muzzle.position.set(item.muzzle.x, item.muzzle.y, item.muzzle.z);
      muzzle.visible = true;
    } else if (muzzle) {
      muzzle.visible = false;
    }
    if (item?.foregrip) {
      if (!foregrip) {
        foregrip = new THREE.Object3D();
        foregrip.name = 'foregrip';
        hand.add(foregrip);
      }
      foregrip.position.set(item.foregrip.x, item.foregrip.y, item.foregrip.z);
      foregrip.visible = true;
    } else if (foregrip) {
      foregrip.visible = false;
    }
  };
  const rebuildGear = () => {
    for (const m of gearMeshes) {
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
    }
    gearMeshes.length = 0;
    for (const slot of SLOT_IDS) {
      if (OUTFIT_SLOTS.has(slot)) continue;
      const parts = buildGearItem(slot, equipment[slot], spec);
      for (const part of parts) {
        if (!part || !part.geometry) continue;
        const m = new THREE.Mesh(part.geometry, material);
        m.castShadow = options.castShadow !== false;
        m.receiveShadow = false;
        boneFor(part.bone).add(m);
        gearMeshes.push(m);
      }
    }
    refreshSockets();
  };
  rebuildGear();
  setLowDetail(false);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
    toneMapped: false,
    color: 0x000000,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35 * w, 1.35 * w), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  shadow.renderOrder = 1;
  group.add(shadow);

  const hipsBaseY = skeleton.hips.position.y;
  const footBase = {
    L: skeleton.legs.L.foot.position.y,
    R: skeleton.legs.R.foot.position.y,
  };
  const _v = new THREE.Vector3();
  const _hip = new THREE.Vector3();
  const _ikUpper = new THREE.Vector3();
  const _ikElbow = new THREE.Vector3();
  const _ikTarget = new THREE.Vector3();
  const _ikDir = new THREE.Vector3();
  const _ikPerp = new THREE.Vector3();
  const _ikDown = new THREE.Vector3(0, -1, 0);
  const _ikDesired = new THREE.Quaternion();
  const _ikParent = new THREE.Quaternion();

  const rig = {
    group,
    mesh: bodyMesh,
    get outfit() {
      return outfitMesh;
    },
    get muzzle() {
      return muzzle;
    },
    get foregrip() {
      return foregrip;
    },
    skeleton,
    bones: skeleton,
    head: skeleton.head,
    shadow,
    material,
    archetype,
    equipment,
    params: { s, w, head: spec.head },
    gear: spec.gear,
    hipsBaseY,
    footBase,
    onEquipmentChanged: null,
    equip(slot, id) {
      if (!ITEMS[slot] || !ITEMS[slot][id]) return false;
      equipment[slot] = id;
      if (OUTFIT_SLOTS.has(slot)) rebuildOutfit();
      else rebuildGear();
      rig.onEquipmentChanged?.();
      return true;
    },
    setEquipment(next) {
      Object.assign(equipment, normalizeEquipment({ ...equipment, ...next }));
      rebuildOutfit();
      rebuildGear();
      rig.onEquipmentChanged?.();
    },
    cycleEquipment(slot, dir = 1) {
      const next = dir > 0 ? nextItemId(slot, equipment[slot]) : prevItemId(slot, equipment[slot]);
      rig.equip(slot, next);
      return next;
    },
    lookAt(x, z, dt) {
      const dx = x - group.position.x;
      const dz = z - group.position.z;
      let yaw = Math.atan2(dx, dz) - group.rotation.y;
      while (yaw > Math.PI) yaw -= Math.PI * 2;
      while (yaw < -Math.PI) yaw += Math.PI * 2;
      const target = Math.max(-1.05, Math.min(1.05, yaw));
      skeleton.head.rotation.y += (target - skeleton.head.rotation.y) * (1 - Math.exp(-8 * dt));
    },
    plantFeet(moving = 0) {
      group.updateMatrixWorld(true);
      const factor = 1 - Math.min(1, moving) * 0.78;
      const L1 = 0.44 * s;
      const L2 = 0.4 * s;
      const fx = Math.sin(group.rotation.y);
      const fz = Math.cos(group.rotation.y);

      for (const side of ['L', 'R']) {
        const leg = skeleton.legs[side];
        const { thigh, shin, foot } = leg;
        foot.position.y = footBase[side];

        foot.getWorldPosition(_v);
        const ground = heightAt(_v.x, _v.z);
        const targetY = ground + 0.06;

        thigh.getWorldPosition(_hip);
        const dx = _v.x - _hip.x;
        const dz = _v.z - _hip.z;
        const forward = dx * fx + dz * fz;
        const dy = targetY - _hip.y;

        let D = Math.hypot(forward, dy);
        D = clamp(D, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);

        const alpha = Math.atan2(forward, -dy);
        const beta = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
        const kneeInterior = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
        const kneeBend = Math.PI - kneeInterior;
        const hipAngle = -(alpha + beta);

        const hz = heightAt(_v.x + fx * 0.2, _v.z + fz * 0.2) - heightAt(_v.x - fx * 0.2, _v.z - fz * 0.2);
        const hx = heightAt(_v.x + 0.2, _v.z) - heightAt(_v.x - 0.2, _v.z);
        const slopePitch = -Math.atan2(hz, 0.4);
        const slopeRoll = -Math.atan2(hx, 0.4);

        const walkThigh = thigh.rotation.x;
        const walkShin = shin.rotation.x;
        thigh.rotation.x = walkThigh + (hipAngle - walkThigh) * factor;
        shin.rotation.x = walkShin + (kneeBend - walkShin) * factor;
        foot.rotation.x = (alpha + beta - kneeBend + slopePitch) * factor;
        foot.rotation.z = slopeRoll * factor;
      }
    },
    solveArmIK(side, target, pole = null, weight = 1) {
      const arm = skeleton.arms[side];
      if (!arm || weight <= 0) return;
      group.updateMatrixWorld(true);
      const upper = arm.upper;
      const fore = arm.fore;
      const L1 = 0.42 * s;
      const L2 = 0.38 * s;
      upper.getWorldPosition(_ikUpper);
      _ikTarget.copy(target);
      _ikDir.subVectors(_ikTarget, _ikUpper);
      let D = _ikDir.length();
      if (D < 0.0001) return;
      D = clamp(D, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);
      _ikDir.normalize();
      if (pole) {
        _ikPerp.copy(pole);
        _ikPerp.addScaledVector(_ikDir, -_ikPerp.dot(_ikDir));
      } else {
        _ikPerp.set(0, -1, 0);
        _ikPerp.addScaledVector(_ikDir, _ikDir.y);
      }
      if (_ikPerp.lengthSq() < 0.0001) _ikPerp.set(0, 0, 1);
      _ikPerp.normalize();
      const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      _ikElbow.copy(_ikUpper).addScaledVector(_ikDir, a).addScaledVector(_ikPerp, h);

      _ikDir.subVectors(_ikElbow, _ikUpper).normalize();
      _ikDesired.setFromUnitVectors(_ikDown, _ikDir);
      upper.parent.getWorldQuaternion(_ikParent);
      _ikParent.invert().multiply(_ikDesired);
      upper.quaternion.slerp(_ikParent, Math.min(1, weight));
      upper.updateMatrixWorld(true);

      _ikDir.subVectors(_ikTarget, _ikElbow).normalize();
      _ikDesired.setFromUnitVectors(_ikDown, _ikDir);
      fore.parent.getWorldQuaternion(_ikParent);
      _ikParent.invert().multiply(_ikDesired);
      fore.quaternion.slerp(_ikParent, Math.min(1, weight));
      fore.updateMatrixWorld(true);
    },
    setPose(dt, moving, phase) {
      const m = moving ? 1 : 0;
      const swing = Math.sin(phase) * m;
      const b = skeleton;
      b.hips.position.y = hipsBaseY + Math.abs(Math.sin(phase)) * 0.03 * m;
      b.hips.rotation.z = Math.sin(phase) * 0.02 * m;
      b.spine.rotation.y = -swing * 0.05;
      b.chest.rotation.y = -swing * 0.08;
      b.legs.L.thigh.rotation.x = swing * 0.55;
      b.legs.R.thigh.rotation.x = -swing * 0.55;
      b.legs.L.shin.rotation.x = Math.max(0, -swing) * 0.6 + 0.04;
      b.legs.R.shin.rotation.x = Math.max(0, swing) * 0.6 + 0.04;
      b.arms.L.upper.rotation.x = -swing * 0.45;
      b.arms.R.upper.rotation.x = swing * 0.45;
      b.arms.L.upper.rotation.z = 0.06;
      b.arms.R.upper.rotation.z = -0.06;
      b.arms.L.fore.rotation.x = -0.15 - Math.max(0, swing) * 0.25;
      b.arms.R.fore.rotation.x = -0.15 - Math.max(0, -swing) * 0.25;
      b.head.rotation.x = Math.sin(phase * 0.5) * 0.015;
      this.plantFeet(m);
    },
  };

  return rig;
}


export function bakeStatic(rig) {
  rig.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(rig.group.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const parts = [];
  const sources = [rig.mesh, rig.outfit].filter(Boolean);
  const seen = new Set();

  for (const source of sources) {
    source.traverse((o) => {
      if (!o.isMesh || seen.has(o)) return;
      seen.add(o);
      let g = o.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      g.deleteAttribute('skinIndex');
      g.deleteAttribute('skinWeight');
      g.morphAttributes = {};
      m.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(m);
      g.computeBoundingSphere();
      parts.push(g);
    });
  }

  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, rig.material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
