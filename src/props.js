import * as THREE from 'three';
import { heightAt, slopeAt, moistureAt, roadAt, WORLD_RADIUS } from './terrain.js';
import { makeRng, deriveSeed, smoothstep } from './rng.js';
import { box, cyl, dodeca, merge, paint, PALETTE, shadowTexture } from './geo.js';
import { scatterDisc } from './scatter.js';
import { makeDetailSet } from './textures.js';

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const nrm = new THREE.Vector3();

/**
 * Sit a large prop on the field: tilt to the local slope and drop it to the lowest point under its
 * footprint, so a slope buries the uphill edge instead of leaving the downhill edge floating.
 */
function alignToGround(obj, x, z, radius, sink = 0) {
  const hx1 = heightAt(x + radius, z);
  const hx0 = heightAt(x - radius, z);
  const hz1 = heightAt(x, z + radius);
  const hz0 = heightAt(x, z - radius);
  const h = Math.min(heightAt(x, z), hx1, hx0, hz1, hz0);
  nrm.set(-(hx1 - hx0) / (2 * radius), 1, -(hz1 - hz0) / (2 * radius)).normalize();
  obj.position.set(x, h - sink, z);
  obj.quaternion.setFromUnitVectors(UP, nrm);
}

function mat() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/** Lambert + a vertex-shader sway. Phase offsets come from the instance position. */
function windMaterial({ strength, doubleSided = false }) {
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: strength };
    shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float windPhase = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
      #else
        float windPhase = 0.0;
      #endif
      float windBend = sin(uTime * 1.7 + windPhase) * uWind * smoothstep(0.0, 0.8, position.y);
      transformed.x += windBend;
      transformed.z += windBend * 0.45;`,
    );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `ashfall-wind-${strength}-${doubleSided ? 'ds' : 'ss'}`;
  return material;
}

function instanced(geo, material, count, castColor = true) {
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  if (castColor) {
    for (let i = 0; i < count; i++) mesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
  }
  mesh.frustumCulled = true;
  return mesh;
}

function finalize(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
}

function tint(mesh, i, hex) {
  tmpColor.set(hex);
  mesh.setColorAt(i, tmpColor);
}

function buildTree(rng) {
  const parts = [];
  parts.push(cyl(0.07, 0.2, 2.7, 5, PALETTE.wood, 0, 1.35, 0));
  for (let i = 0; i < 6; i++) {
    const len = 0.8 + rng() * 1.5;
    const g = new THREE.CylinderGeometry(0.018, 0.06, len, 4);
    g.translate(0, len / 2, 0);
    g.rotateZ(0.55 + rng() * 0.75);
    g.rotateY(i * 1.7 + rng());
    g.translate(0, 1.15 + i * 0.22, 0);
    paint(g, i % 2 ? PALETTE.woodDark : PALETTE.wood);
    parts.push(g);
  }
  // a couple of low snapped limbs
  for (let i = 0; i < 2; i++) {
    const g = new THREE.CylinderGeometry(0.03, 0.07, 0.8, 4);
    g.translate(0, 0.4, 0);
    g.rotateZ(i ? -1.1 : 1.2);
    g.translate(0, 0.85 + i * 0.35, 0);
    paint(g, PALETTE.woodDark);
    parts.push(g);
  }
  return merge(parts);
}

function buildRuin() {
  const p = [];
  p.push(box(5.4, 0.28, 4.6, PALETTE.concreteDark, 0, 0.14, 0));
  // broken corner walls
  p.push(box(1.45, 2.6, 0.34, PALETTE.concrete, -1.9, 1.4, -2.0));
  p.push(box(1.1, 1.75, 0.34, PALETTE.concreteDark, -0.35, 0.98, -2.0));
  p.push(box(0.34, 2.25, 1.5, PALETTE.concrete, -2.45, 1.2, -1.05));
  p.push(box(0.34, 1.2, 1.1, PALETTE.concreteDark, -2.45, 0.7, 0.3));
  // fallen slab
  p.push(box(2.5, 0.26, 1.2, PALETTE.concrete, 0.7, 0.45, -1.3, 0.14, 0.3, 0.22));
  // rebar
  p.push(cyl(0.035, 0.035, 1.1, 4, PALETTE.rust, -1.45, 2.6, -2.0, 0.2, 0, 0.35));
  p.push(cyl(0.035, 0.035, 1.35, 4, PALETTE.rustDark, 0.9, 2.35, -2.0, -0.15, 0, 0.1));
  // rubble
  p.push(dodeca(0.42, PALETTE.concreteDark, 1.7, 0.3, 1.2, 0.4, 1.2, 0.8));
  p.push(dodeca(0.28, PALETTE.concrete, 2.2, 0.22, 0.6, 1.1, 0.2, 1.4));
  p.push(dodeca(0.34, PALETTE.concreteDark, -0.9, 0.24, 1.4, 0.7, 0.9, 0.2));
  return merge(p);
}

function buildWreck() {
  const p = [];
  p.push(box(2.0, 0.46, 4.3, PALETTE.rust, 0, 0.62, 0));
  p.push(box(1.72, 0.62, 1.95, PALETTE.rustDark, 0, 1.06, -0.25));
  p.push(box(1.78, 0.22, 1.3, PALETTE.rust, 0, 0.88, 1.65));
  p.push(box(1.5, 0.12, 1.3, PALETTE.metal, 0, 1.4, -0.3));
  p.push(box(0.1, 0.4, 1.5, PALETTE.metalLight, 0.86, 1.1, -0.2));
  p.push(box(0.1, 0.4, 1.5, PALETTE.metalLight, -0.86, 1.1, -0.2));
  for (const sx of [-1, 1]) {
    for (const sz of [-1.35, 1.35]) {
      p.push(cyl(0.36, 0.36, 0.3, 8, '#2c2824', sx * 0.98, 0.4, sz, 0, 0, Math.PI / 2));
    }
  }
  p.push(cyl(0.05, 0.05, 0.8, 4, PALETTE.rust, 1.02, 0.9, 1.2, 0, 0, 0.9));
  return merge(p);
}

function buildAdobeRuin() {
  const red = '#ad5138';
  const redDark = '#8f3d2b';
  const cream = '#dfc9a2';
  const stone = '#ab9068';
  const dark = '#2d2620';
  const wood = '#65452c';
  const woodDark = '#48301e';
  const p = [];
  p.push(box(5.2, 0.2, 4.6, stone, 0, 0.1, 0));
  p.push(box(4.7, 2.35, 0.3, red, 0, 1.3, -2.05));
  p.push(box(0.32, 2.15, 4.0, redDark, -2.3, 1.2, 0));
  p.push(box(0.32, 1.55, 4.0, red, 2.3, 0.9, 0));

  // front wall broken around a wide doorway
  p.push(box(1.35, 2.1, 0.3, red, -1.65, 1.15, 2.0));
  p.push(box(0.9, 1.35, 0.3, redDark, 1.8, 0.8, 2.0));
  p.push(box(0.95, 0.45, 0.3, redDark, -0.35, 2.0, 2.0));
  p.push(box(0.85, 0.35, 0.3, cream, -1.65, 2.32, 2.02));

  // window holes in the back wall
  for (const wx of [-1.55, 0.6]) {
    p.push(box(0.1, 0.9, 0.34, dark, wx, 1.45, -2.02));
    p.push(box(0.74, 0.1, 0.36, cream, wx, 1.95, -2.01));
    p.push(box(0.74, 0.1, 0.36, cream, wx, 0.95, -2.01));
  }
  // exposed beams
  for (let i = -2; i <= 2; i++) p.push(box(0.12, 0.12, 0.7, woodDark, i * 0.85, 2.45, -1.85));
  p.push(box(0.14, 0.14, 3.9, wood, -2.3, 2.35, 0));
  // collapsed roof beams inside
  p.push(box(0.14, 0.14, 3.4, woodDark, 0.8, 0.55, -0.2, 0, 0.5, 0.03));
  p.push(box(0.12, 0.12, 2.8, wood, -0.9, 0.4, 0.4, 0, -0.4, 0.02));

  // piano nod
  p.push(box(1.25, 0.5, 0.62, wood, 0.2, 0.62, 0.5));
  p.push(box(1.3, 0.08, 0.72, woodDark, 0.2, 0.9, 0.5));
  p.push(box(1.12, 0.06, 0.22, cream, 0.2, 0.94, 0.18));
  p.push(box(0.1, 0.5, 0.1, woodDark, -0.27, 0.3, 0.68));
  p.push(box(0.1, 0.5, 0.1, woodDark, 0.67, 0.3, 0.68));
  p.push(box(0.1, 0.5, 0.1, woodDark, -0.27, 0.3, 0.3));
  p.push(box(0.1, 0.5, 0.1, woodDark, 0.67, 0.3, 0.3));
  p.push(box(0.72, 0.1, 0.34, wood, 0.2, 0.32, 1.25));
  // rubble + barrel
  p.push(dodeca(0.36, '#c1a17a', -1.3, 0.28, 0.8, 0.4, 0.2, 0.8));
  p.push(dodeca(0.24, '#9b7b58', 1.4, 0.2, -1.2, 0.8, 0.5, 0.2));
  p.push(cyl(0.28, 0.3, 0.66, 8, woodDark, 1.75, 0.33, -0.8));

  return merge(p);
}

function buildBus() {
  const p = [];
  p.push(box(2.6, 2.0, 7.2, '#8d5a35', 0, 1.45, 0));
  p.push(box(2.46, 0.16, 7.0, '#6b4a2f', 0, 2.5, 0));
  p.push(box(2.64, 0.16, 6.8, '#a98a4b', 0, 1.62, 0));
  // window bands
  p.push(box(0.06, 0.72, 5.5, '#2f3534', 1.32, 2.02, 0.1));
  p.push(box(0.06, 0.72, 5.5, '#2f3534', -1.32, 2.02, 0.1));
  p.push(box(2.0, 0.72, 0.06, '#2f3534', 0, 2.02, 3.58));
  p.push(box(0.06, 1.5, 2.1, '#3a3b34', 1.33, 1.45, 1.15));
  // wheels
  for (const sx of [-1, 1]) {
    for (const sz of [-2.35, 2.25]) {
      p.push(cyl(0.52, 0.52, 0.34, 10, '#28251f', sx * 1.22, 0.52, sz, 0, 0, Math.PI / 2));
    }
  }
  // bumper + roof junk
  p.push(box(2.7, 0.24, 0.24, '#54432e', 0, 0.65, 3.65));
  p.push(box(0.6, 0.32, 0.7, '#7a4a2e', 0.5, 2.75, -1.4, 0.2, 0.4, 0));
  p.push(cyl(0.06, 0.06, 1.2, 5, PALETTE.rust, -0.8, 2.9, 0.5, 0, 0, 1.3));
  return merge(p);
}

function buildBanner() {
  const p = [];
  p.push(cyl(0.06, 0.09, 4.4, 6, '#5a4630', 0, 2.2, 0));
  p.push(box(1.9, 0.09, 0.09, '#4a3a29', 0.85, 4.15, 0));
  p.push(cyl(0.13, 0.2, 0.25, 6, '#40352a', 0, 0.12, 0));
  // ragged storm flag
  p.push(box(0.55, 0.82, 0.025, '#7c4330', 0.35, 3.68, 0.02));
  p.push(box(0.55, 0.64, 0.025, '#6e3b2a', 0.9, 3.78, 0.02));
  p.push(box(0.38, 0.42, 0.025, '#874a34', 1.4, 3.9, 0.02));
  p.push(box(0.2, 0.18, 0.026, '#5b3024', 1.64, 4.04, 0.02));
  // hanging scraps
  p.push(box(0.09, 0.3, 0.02, '#9a8a6c', 0.55, 3.16, 0.02, 0, 0, 0.2));
  p.push(box(0.07, 0.22, 0.02, '#9a8a6c', 0.15, 3.2, 0.02, 0, 0, -0.3));
  return merge(p);
}


function buildCampPit() {
  const p = [];
  p.push(cyl(1.25, 1.35, 0.06, 14, '#3c3329', 0, 0.03, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.push(dodeca(0.2, i % 2 ? '#7c7568' : '#918879', Math.cos(a) * 1.1, 0.12, Math.sin(a) * 1.1, a, 0.4, 0));
  }
  p.push(box(0.72, 0.12, 0.13, '#3b2d21', 0.1, 0.14, 0.1, 0, 0.8, 0.05));
  p.push(box(0.62, 0.11, 0.12, '#493626', -0.1, 0.17, -0.1, 0, 2.6, -0.08));
  return merge(p);
}

function buildCactus() {
  const green = '#5c7a4c';
  const dark = '#465f3a';
  const pale = '#7e9360';
  const p = [];
  p.push(cyl(0.16, 0.24, 2.4, 7, green, 0, 1.2, 0));
  p.push(cyl(0.1, 0.16, 0.12, 7, pale, 0, 2.44, 0));
  p.push(cyl(0.11, 0.14, 0.72, 5, green, -0.46, 1.42, 0, 0, 0, Math.PI / 2));
  p.push(cyl(0.11, 0.14, 0.95, 5, green, -0.82, 1.85, 0));
  p.push(cyl(0.09, 0.12, 0.55, 5, green, 0.4, 1.72, 0, 0, 0, Math.PI / 2));
  p.push(cyl(0.09, 0.12, 0.75, 5, green, 0.68, 2.05, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.push(cyl(0.018, 0.018, 1.9, 3, dark, Math.cos(a) * 0.2, 1.15, Math.sin(a) * 0.2));
  }
  p.push(dodeca(0.11, '#d9b36a', 0, 2.55, 0, 0, 0.4, 0));
  return merge(p);
}

function buildShrub(rng) {
  const p = [];
  const cols = ['#7f815a', '#6d704c', '#92906a', '#5f6647'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 0.4;
    const r = i === 0 ? 0 : 0.22 + rng() * 0.26;
    p.push(
      dodeca(
        0.18 + rng() * 0.16,
        cols[i % cols.length],
        Math.cos(a) * r,
        0.18 + rng() * 0.22,
        Math.sin(a) * r,
        rng() * 3,
        rng() * 3,
        rng() * 3
      )
    );
  }
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    p.push(cyl(0.015, 0.03, 0.55 + rng() * 0.2, 3, '#5f5336', Math.cos(a) * 0.14, 0.38, Math.sin(a) * 0.14, 0.2, a, 0.15));
  }
  return merge(p);
}

function buildGrass() {
  const blades = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.PlaneGeometry(0.24, 0.72, 1, 1);
    g.translate(0, 0.36, 0);
    if (i) g.rotateY(Math.PI / 2);
    paint(g, '#6f7049');
    // darker at the root, bleached at the tip
    const posAttr = g.attributes.position;
    const colAttr = g.attributes.color;
    const base = new THREE.Color('#41452f');
    const tip = new THREE.Color('#b0a574');
    for (let v = 0; v < posAttr.count; v++) {
      const f = smoothstep(0, 0.72, posAttr.getY(v));
      tmpColor.copy(base).lerp(tip, f);
      colAttr.setXYZ(v, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    blades.push(g);
  }
  return merge(blades);
}

export function createWasteland(scene, seed = 0x51a7) {
  const rng = makeRng(seed);
  const material = mat();
  const rockDetail = makeDetailSet('rock', deriveSeed('rock-detail'));
  rockDetail.map.repeat.set(2, 2);
  rockDetail.normalMap.repeat.set(2, 2);
  const rockMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    map: rockDetail.map,
    normalMap: rockDetail.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
  const grassMaterial = windMaterial({ strength: 0.075, doubleSided: true });
  const shrubMaterial = windMaterial({ strength: 0.035 });
  const windMaterials = [grassMaterial, shrubMaterial];

  const result = { grass: null, meshes: [], obstacles: [] };
  const shadowSpots = [];

  // ---- rocks -------------------------------------------------------------
  {
    const places = scatterDisc(rng, {
      minDist: 4.2,
      radius: WORLD_RADIUS - 1,
      inner: 16,
      count: 190,
      weight: (x, z) => {
        if (roadAt(x, z) > 0.55) return 0;
        return 0.12 + slopeAt(x, z, 1.4) * 2.2;
      },
    });
    const geo = paint(new THREE.DodecahedronGeometry(1, 0), '#8b8170');
    const mesh = instanced(geo, rockMaterial, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      const s = rng.range(0.22, 1.35);
      tmpObj.position.set(x, heightAt(x, z) + s * 0.18, z);
      tmpObj.rotation.set(rng() * 3, rng() * 6, rng() * 3);
      tmpObj.scale.set(s * rng.range(0.7, 1.5), s * rng.range(0.45, 0.9), s * rng.range(0.7, 1.4));
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#c4b9a2', '#95866e', '#7b6a55', '#6b6254']));
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- dead trees --------------------------------------------------------
  {
    const places = scatterDisc(rng, {
      minDist: 9,
      radius: WORLD_RADIUS - 2,
      inner: 14,
      count: 52,
      weight: (x, z) => {
        if (slopeAt(x, z, 1.2) > 0.28) return 0;
        if (roadAt(x, z) > 0.4) return 0;
        return 0.25 + moistureAt(x, z) * 0.35;
      },
    });
    const geo = buildTree(rng);
    const mesh = instanced(geo, material, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      const s = rng.range(0.65, 1.55);
      tmpObj.position.set(x, heightAt(x, z) - 0.05, z);
      tmpObj.rotation.set(rng.range(-0.06, 0.06), rng() * 6.28, rng.range(-0.06, 0.06));
      tmpObj.scale.setScalar(s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#b0a38c', '#8d806b', '#75695a']));
      shadowSpots.push({ x: x + 0.4 * s, z: z + 0.6 * s, s: 1.45 * s, ry: 0.7 });
      result.obstacles.push({ x, z, r: 0.36 * s });
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- cacti -------------------------------------------------------------
  {
    const places = scatterDisc(rng, {
      minDist: 9,
      radius: WORLD_RADIUS - 3,
      inner: 14,
      count: 44,
      weight: (x, z) => {
        if (slopeAt(x, z, 1.1) > 0.22) return 0;
        if (roadAt(x, z) > 0.38) return 0;
        return 0.3 + (1 - moistureAt(x, z)) * 0.5;
      },
    });
    const geo = buildCactus();
    const mesh = instanced(geo, material, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      const s = rng.range(0.8, 1.35);
      tmpObj.position.set(x, heightAt(x, z) - 0.05, z);
      tmpObj.rotation.set(0, rng() * 6.28, rng.range(-0.04, 0.04));
      tmpObj.scale.set(s, s * rng.range(0.9, 1.15), s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#c7cba4', '#aab58d', '#d6d7ad', '#9fa987']));
      result.obstacles.push({ x, z, r: 0.4 * s });
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- desert shrubs -----------------------------------------------------
  {
    const places = scatterDisc(rng, {
      minDist: 4.4,
      radius: WORLD_RADIUS - 2,
      inner: 8,
      count: 130,
      weight: (x, z) => {
        if (slopeAt(x, z, 1.0) > 0.32) return 0;
        if (roadAt(x, z) > 0.45) return 0;
        return 0.15 + moistureAt(x, z) * 0.8;
      },
    });
    const geo = buildShrub(rng);
    const mesh = instanced(geo, shrubMaterial, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      const s = rng.range(0.65, 1.5);
      tmpObj.position.set(x, heightAt(x, z) - 0.04, z);
      tmpObj.rotation.set(0, rng() * 6.28, 0);
      tmpObj.scale.set(s * rng.range(0.8, 1.2), s, s * rng.range(0.8, 1.2));
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#cabf91', '#b2aa7d', '#a49d72', '#8f8f68']));
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- ruined structures -------------------------------------------------
  {
    const places = scatterDisc(rng, {
      minDist: 14,
      radius: 74,
      inner: 18,
      count: 30,
      weight: (x, z) => {
        if (slopeAt(x, z, 2.5) > 0.2) return 0;
        if (roadAt(x, z) > 0.3) return 0;
        return 0.65;
      },
    });
    const geo = buildRuin();
    const mesh = instanced(geo, material, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      const s = rng.range(0.65, 1.3);
      alignToGround(tmpObj, x, z, 2.5, 0.42);
      tmpObj.rotateY(rng() * 6.28);
      tmpObj.scale.set(s, s * rng.range(0.85, 1.1), s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#efd9b9', '#e6c1a3', '#d5a98a', '#c98e72']));
      result.obstacles.push({ x, z, r: 2.5 * s });
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- wrecked vehicles --------------------------------------------------
  {
    const places = scatterDisc(rng, {
      minDist: 20,
      radius: 80,
      inner: 18,
      count: 9,
      weight: (x, z) => {
        if (slopeAt(x, z, 2) > 0.25) return 0;
        if (roadAt(x, z) > 0.5) return 0;
        return 0.5;
      },
    });
    const geo = buildWreck();
    const mesh = instanced(geo, material, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      const s = rng.range(0.85, 1.2);
      alignToGround(tmpObj, x, z, 1.9, 0.26);
      tmpObj.rotateY(rng() * 6.28);
      tmpObj.scale.setScalar(s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#b9a58c', '#8b7c6a', '#776b5e']));
      result.obstacles.push({ x, z, r: 1.9 * s });
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- landmark junk around the starting camp ---------------------------
  {
    const bus = new THREE.Mesh(buildBus(), material);
    const bx = 10.5;
    const bz = -12.5;
    alignToGround(bus, bx, bz, 3.1, 0.3);
    bus.rotateY(-0.55);
    scene.add(bus);
    result.meshes.push(bus);
    result.obstacles.push({ x: bx, z: bz, r: 3.15 });

    const pit = new THREE.Mesh(buildCampPit(), material);
    pit.position.set(0, heightAt(0, 0), 0);
    pit.rotation.y = 0.6;
    scene.add(pit);
    result.meshes.push(pit);

    const banner = new THREE.Mesh(buildBanner(), material);
    banner.position.set(-4.4, heightAt(-4.4, 2.6), 2.6);
    banner.rotation.y = 0.35;
    scene.add(banner);
    result.meshes.push(banner);
    result.obstacles.push({ x: -4.4, z: 2.6, r: 0.5 });

    const ruin = new THREE.Mesh(buildAdobeRuin(), material);
    const rx = 10.5;
    const rz = 6.5;
    alignToGround(ruin, rx, rz, 2.6, 0.18);
    ruin.rotateY(-0.35);
    scene.add(ruin);
    result.meshes.push(ruin);
    result.obstacles.push({ x: rx, z: rz, r: 3.3 });
  }

  // ---- debris ------------------------------------------------------------
  {
    const places = scatterDisc(rng, {
      minDist: 3.6,
      radius: WORLD_RADIUS,
      inner: 18,
      count: 110,
      weight: (x, z) => (roadAt(x, z) > 0.6 ? 0 : 0.6),
    });
    const geo = paint(new THREE.BoxGeometry(0.16, 0.13, 1.9), PALETTE.woodDark, 0.08);
    const mesh = instanced(geo, material, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      tmpObj.position.set(x, heightAt(x, z) + 0.06, z);
      tmpObj.rotation.set(rng.range(-0.1, 0.1), rng() * 6.28, rng.range(-0.06, 0.06));
      tmpObj.scale.set(rng.range(0.7, 1.5), 1, rng.range(0.6, 1.2));
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#baa78a', '#8d7b63', '#6b5e4c']));
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  {
    const places = scatterDisc(rng, {
      minDist: 5.0,
      radius: WORLD_RADIUS,
      inner: 16,
      count: 52,
      weight: (x, z) => (roadAt(x, z) > 0.5 ? 0 : 0.5),
    });
    const geo = paint(new THREE.CylinderGeometry(0.34, 0.34, 0.92, 8), PALETTE.rustDark);
    const mesh = instanced(geo, material, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      tmpObj.position.set(x, heightAt(x, z) + 0.44, z);
      tmpObj.rotation.set(rng.range(-0.08, 0.08), rng() * 6.28, rng.range(-0.08, 0.08));
      tmpObj.scale.setScalar(rng.range(0.8, 1.25));
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#b5825c', '#8a5c40', '#5d5f51', '#78654c']));
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  {
    const places = scatterDisc(rng, {
      minDist: 4.0,
      radius: WORLD_RADIUS,
      inner: 16,
      count: 70,
      weight: (x, z) => (roadAt(x, z) > 0.55 ? 0 : 0.5),
    });
    const geo = paint(new THREE.DodecahedronGeometry(0.45, 0), PALETTE.concreteDark);
    const mesh = instanced(geo, rockMaterial, places.length);
    for (let i = 0; i < places.length; i++) {
      const { x, z } = places[i];
      const s = rng.range(0.5, 1.6);
      tmpObj.position.set(x, heightAt(x, z) + s * 0.12, z);
      tmpObj.rotation.set(rng() * 3, rng() * 6, rng() * 3);
      tmpObj.scale.set(s, s * rng.range(0.4, 0.8), s * rng.range(0.7, 1.3));
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#c1b8a5', '#9b9282', '#7d7466']));
    }
    finalize(mesh);
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- dry grass (clustered so it reads as patches, not noise) -----------
  {
    const geo = buildGrass();
    const spots = [];
    const clusters = scatterDisc(rng, {
      minDist: 5.2,
      radius: WORLD_RADIUS - 1,
      inner: 6,
      count: 210,
      weight: (x, z) => {
        if (slopeAt(x, z, 1.0) > 0.34) return 0;
        if (roadAt(x, z) > 0.5) return 0;
        return 0.2 + moistureAt(x, z) * 0.85;
      },
    });
    for (const cluster of clusters) {
      const blades = rng.int(4, 7);
      for (let j = 0; j < blades; j++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 1.7;
        const x = cluster.x + Math.cos(a) * r;
        const z = cluster.z + Math.sin(a) * r;
        const s = rng.range(0.5, 1.25);
        spots.push({ x, z, s, rot: rng() * 6.28 });
      }
    }
    const mesh = instanced(geo, grassMaterial, spots.length);
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      tmpObj.position.set(spot.x, heightAt(spot.x, spot.z) - 0.02, spot.z);
      tmpObj.rotation.set(0, spot.rot, 0);
      tmpObj.scale.set(spot.s * rng.range(0.8, 1.3), spot.s, spot.s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tint(mesh, i, rng.pick(['#d4c9a2', '#b3b187', '#949a74', '#7c8862']));
    }
    finalize(mesh);
    scene.add(mesh);
    result.grass = mesh;
    result.meshes.push(mesh);
  }

  // ---- soft contact shadows under the bigger silhouettes ----------------
  if (shadowSpots.length) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geo, material, shadowSpots.length);
    for (let i = 0; i < shadowSpots.length; i++) {
      const spot = shadowSpots[i];
      tmpObj.position.set(spot.x, heightAt(spot.x, spot.z) + 0.035, spot.z);
      tmpObj.rotation.set(0, spot.ry, 0);
      tmpObj.scale.set(spot.s, 1, spot.s * 0.62);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 1;
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // ---- distant mesas / buttes -------------------------------------------
  {
    const parts = [];
    const rng2 = makeRng(0xdead77);
    for (let i = 0; i < 17; i++) {
      const angle = rng2() * Math.PI * 2;
      const radius = rng2.range(118, 138);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const base = rng2.range(7, 21);
      const top = base * rng2.range(0.36, 0.72);
      const h = rng2.range(10, 26);
      const y = heightAt(x, z) - 6;
      const color = rng2.pick(['#c39a72', '#b58a66', '#cfa57b', '#a87d5f']);
      parts.push(cyl(top, base, h, rng2.int(5, 7), color, x, y + h / 2, z, 0, rng2() * 6.28, 0));
      if (rng2() > 0.5) {
        parts.push(cyl(top * 0.62, top * 0.9, rng2.range(2, 5), 5, '#d3ad82', x, y + h + 1, z, 0, rng2() * 6, 0));
      }
      if (rng2() > 0.6) {
        parts.push(dodeca(rng2.range(2.2, 4.5), '#b98a63', x + rng2.range(-9, 9), y + 2.5, z + rng2.range(-9, 9), rng2() * 2, rng2() * 6, 0));
      }
    }
    for (let i = 0; i < 4; i++) {
      const angle = rng2() * Math.PI * 2;
      const radius = rng2.range(122, 134);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const h = rng2.range(16, 30);
      parts.push(cyl(1.5, 5.5, h, 6, '#b18460', x, heightAt(x, z) - 4 + h / 2, z));
    }
    const mesh = new THREE.Mesh(merge(parts), material);
    mesh.matrixAutoUpdate = false;
    mesh.userData.noShadow = true;
    mesh.updateMatrix();
    scene.add(mesh);
    result.meshes.push(mesh);
  }

  // Shadow flags: opaque scenery casts; grass only receives; decals/silhouettes do not.
  for (const mesh of result.meshes) {
    if (mesh === result.grass || mesh.material.transparent || mesh.userData.noShadow) continue;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  if (result.grass) {
    result.grass.castShadow = false;
    result.grass.receiveShadow = true;
  }

  result.updateWind = (time) => {
    for (const m of windMaterials) {
      const shader = m.userData.shader;
      if (shader) shader.uniforms.uTime.value = time;
    }
  };

  return result;
}
