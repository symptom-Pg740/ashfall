import * as THREE from 'three';
import { heightAt, slopeAt } from './terrain.js';
import { box, cyl, dodeca, merge, paint, bakeBaseAO, glowTexture, PALETTE } from './geo.js';
import { buildAdobeHouse } from './kit.js';
import { makeRng, deriveSeed, hash32, WORLD_SEED } from './rng.js';
import { makeDetailSet } from './textures.js';

const BUILD_RANGE = 11.5;
const CAMP_RADIUS = 46;
const GRID = 1;

function baseDisc(radius) {
  return cyl(radius * 0.8, radius * 0.9, 0.05, 12, '#a98b65', 0, 0.025, 0);
}

function barricade() {
  const p = [baseDisc(1.25)];
  p.push(cyl(0.08, 0.1, 1.55, 5, PALETTE.woodDark, -1.12, 0.78, 0));
  p.push(cyl(0.08, 0.1, 1.35, 5, PALETTE.woodDark, 1.12, 0.68, 0));
  p.push(box(2.5, 0.34, 0.13, PALETTE.rust, 0, 0.42, 0.02, 0, 0, 0.01));
  p.push(box(2.35, 0.3, 0.12, PALETTE.metal, 0.05, 0.78, -0.02, 0, 0, -0.02));
  p.push(box(2.2, 0.28, 0.12, '#7f4e35', -0.04, 1.1, 0.03, 0, 0, 0.015));
  p.push(box(2.45, 0.14, 0.16, PALETTE.wood, 0, 1.3, -0.02));
  p.push(cyl(0.045, 0.045, 1.5, 4, PALETTE.rustDark, 1.0, 0.65, 0.16, 0, 0, 0.5));
  p.push(box(0.34, 0.22, 0.06, '#b08d63', -0.4, 0.98, 0.09, 0, 0, 0.35));
  return merge(p);
}

function campfire() {
  const p = [baseDisc(1.0)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    p.push(dodeca(0.18 + (i % 2) * 0.06, i % 2 ? '#6f6a5e' : '#8a8274', Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7, a, a * 0.4, 0));
  }
  p.push(cyl(0.56, 0.6, 0.07, 10, '#332b22', 0, 0.04, 0));
  p.push(box(0.86, 0.13, 0.14, PALETTE.woodDark, 0, 0.16, 0, 0, 0.35, 0.08));
  p.push(box(0.8, 0.12, 0.14, PALETTE.wood, 0.04, 0.19, 0.02, 0, 1.9, -0.1));
  p.push(box(0.74, 0.11, 0.12, '#4d3522', -0.02, 0.22, -0.03, 0, 3.4, 0.1));
  p.push(dodeca(0.15, '#ff7a33', 0, 0.22, 0, 0, 0.4, 0));
  p.push(dodeca(0.11, '#ffb05b', 0.18, 0.2, 0.1, 0.3, 0.8, 0));
  return merge(p);
}

function catcher() {
  const p = [baseDisc(1.3)];
  p.push(cyl(0.5, 0.54, 1.18, 10, PALETTE.rustDark, -0.12, 0.59, 0.08));
  p.push(cyl(0.46, 0.46, 0.05, 10, '#548385', -0.12, 1.18, 0.08));
  p.push(cyl(0.52, 0.52, 0.08, 10, PALETTE.metal, -0.12, 0.08, 0.08));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    p.push(cyl(0.035, 0.05, 1.75, 4, PALETTE.wood, Math.cos(a) * 0.92, 0.87, Math.sin(a) * 0.92, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12));
  }
  // inverted tarp funnel
  const cone = new THREE.ConeGeometry(0.98, 0.52, 8);
  cone.rotateX(Math.PI);
  cone.translate(-0.12, 1.7, 0.08);
  p.push(paint(cone, PALETTE.tarp));
  p.push(cyl(0.07, 0.07, 0.34, 5, PALETTE.tarpLight, -0.12, 1.5, 0.08));
  p.push(box(0.34, 0.08, 0.5, PALETTE.metalLight, 0.72, 0.12, -0.6, 0, 0.6, 0));
  return merge(p);
}

function adobeHouse() {
  const red = '#b9543c';
  const redDark = '#963f2d';
  const cream = '#efddba';
  const mudRoof = '#b78f5d';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const stone = '#b6a184';
  const dark = '#2f2821';
  const blue = '#4f7d8d';
  const p = [];

  p.push(box(5.0, 1.3, 4.0, stone, 0, -0.5, 0));
  p.push(box(5.0, 0.22, 4.0, stone, 0, 0.11, 0));
  p.push(box(4.5, 2.5, 3.5, red, 0, 1.45, 0));
  p.push(box(4.3, 0.12, 3.3, mudRoof, 0, 2.68, 0));
  p.push(box(1.7, 0.02, 1.1, '#b8956a', -0.65, 2.75, 0.3));
  p.push(box(1.4, 0.02, 0.7, '#c1a171', 0.85, 2.75, 0.85));
  p.push(box(0.85, 0.06, 0.75, '#805a3a', 0.7, 2.77, -0.75));
  p.push(box(0.95, 0.03, 0.08, '#6a4a30', 0.7, 2.8, -0.38));
  p.push(box(0.95, 0.03, 0.08, '#6a4a30', 0.7, 2.8, -1.12));

  // parapet with a gap over the door
  p.push(box(1.5, 0.45, 0.18, redDark, -1.5, 2.85, 1.7));
  p.push(box(1.5, 0.45, 0.18, redDark, 1.5, 2.85, 1.7));
  p.push(box(4.6, 0.45, 0.18, redDark, 0, 2.85, -1.7));
  p.push(box(0.18, 0.45, 3.4, redDark, 2.25, 2.85, 0));
  p.push(box(0.18, 0.45, 3.4, redDark, -2.25, 2.85, 0));
  p.push(box(1.55, 0.07, 0.24, cream, -1.5, 3.1, 1.7));
  p.push(box(1.55, 0.07, 0.24, cream, 1.5, 3.1, 1.7));
  p.push(box(4.66, 0.07, 0.24, cream, 0, 3.1, -1.7));
  p.push(box(0.24, 0.07, 3.46, cream, -2.27, 3.1, 0));
  p.push(box(0.24, 0.07, 3.46, cream, 2.27, 3.1, 0));

  // exposed roof beams
  for (let i = -2; i <= 2; i++) p.push(box(0.12, 0.12, 0.62, woodDark, i * 0.82, 2.52, 1.88));
  for (let i = -1; i <= 1; i++) p.push(box(0.62, 0.12, 0.12, woodDark, 2.4, 2.52, i * 0.9));

  // door + cream frame
  p.push(box(0.98, 1.55, 0.1, dark, 0, 1.02, 1.78));
  p.push(box(0.12, 1.72, 0.14, cream, -0.55, 1.1, 1.8));
  p.push(box(0.12, 1.72, 0.14, cream, 0.55, 1.1, 1.8));
  p.push(box(1.22, 0.14, 0.16, cream, 0, 1.98, 1.8));
  p.push(box(1.3, 0.12, 0.5, stone, 0, 0.12, 2.02));

  // windows + blue shutters
  for (const wx of [-1.62, 1.62]) {
    p.push(box(0.62, 0.74, 0.08, dark, wx, 1.55, 1.78));
    p.push(box(0.74, 0.09, 0.13, cream, wx, 1.97, 1.8));
    p.push(box(0.74, 0.09, 0.13, cream, wx, 1.13, 1.8));
    p.push(box(0.09, 0.94, 0.13, cream, wx - 0.37, 1.55, 1.8));
    p.push(box(0.09, 0.94, 0.13, cream, wx + 0.37, 1.55, 1.8));
    p.push(box(0.2, 0.76, 0.07, blue, wx - 0.52, 1.55, 1.82));
    p.push(box(0.2, 0.76, 0.07, blue, wx + 0.52, 1.55, 1.82));
  }
  // side window
  for (const wz of [-0.35, 0.9]) {
    p.push(box(0.08, 0.7, 0.58, dark, 2.27, 1.55, wz));
    p.push(box(0.13, 0.09, 0.7, cream, 2.29, 1.95, wz));
    p.push(box(0.13, 0.09, 0.7, cream, 2.29, 1.15, wz));
    p.push(box(0.13, 0.9, 0.09, cream, 2.29, 1.55, wz - 0.35));
    p.push(box(0.13, 0.9, 0.09, cream, 2.29, 1.55, wz + 0.35));
  }

  // porch
  p.push(cyl(0.07, 0.1, 2.2, 5, wood, -1.2, 1.1, 2.45));
  p.push(cyl(0.07, 0.1, 2.2, 5, wood, 1.2, 1.1, 2.45));
  p.push(box(3.2, 0.12, 1.1, mudRoof, 0, 2.28, 2.45));
  p.push(box(3.3, 0.08, 0.14, woodDark, 0, 2.36, 2.9));
  // bench
  p.push(box(1.7, 0.1, 0.36, wood, 0, 0.46, 2.5));
  p.push(box(0.1, 0.46, 0.3, woodDark, -0.7, 0.23, 2.5));
  p.push(box(0.1, 0.46, 0.3, woodDark, 0.7, 0.23, 2.5));
  // clutter
  p.push(cyl(0.26, 0.3, 0.62, 8, woodDark, -2.0, 0.31, 2.15));
  p.push(box(0.5, 0.4, 0.5, wood, 1.95, 0.32, 2.3, 0, 0.3, 0));
  p.push(box(0.42, 0.32, 0.42, woodDark, 1.6, 0.28, 2.55, 0, -0.4, 0));
  // roof barrel
  p.push(cyl(0.24, 0.28, 0.56, 8, '#3b3831', -1.15, 3.02, -0.35));
  p.push(cyl(0.24, 0.28, 0.56, 8, '#4a4438', -1.65, 3.02, -0.6));
  // hanging board sign
  p.push(cyl(0.05, 0.06, 1.7, 4, woodDark, 2.65, 0.85, 2.35));
  p.push(box(0.78, 0.46, 0.06, cream, 2.98, 1.5, 2.35, 0, 0.12, 0));
  p.push(box(0.5, 0.05, 0.03, '#5d4631', 2.98, 1.56, 2.39, 0, 0.12, 0));
  p.push(box(0.38, 0.05, 0.03, '#5d4631', 2.98, 1.44, 2.39, 0, 0.12, 0));
  return bakeBaseAO(merge(p), 0.55, 0.3);
}

function chapel() {
  const cream = '#dcc59c';
  const creamLight = '#efddba';
  const roof = '#a05233';
  const roofDark = '#7b3d27';
  const stone = '#b8a384';
  const dark = '#2e2923';
  const wood = '#5f4029';
  const gold = '#c8a44f';
  const p = [];

  p.push(box(5.6, 1.4, 6.8, stone, 0, -0.5, 0));
  p.push(box(5.6, 0.28, 6.8, stone, 0, 0.14, 0));
  p.push(box(3.8, 3.1, 4.9, cream, 0, 1.83, -0.35));

  // gabled roof
  const theta = 0.47;
  p.push(box(2.5, 0.16, 5.3, roof, -1.0, 3.95, -0.35, 0, 0, theta));
  p.push(box(2.5, 0.16, 5.3, roof, 1.0, 3.95, -0.35, 0, 0, -theta));
  p.push(cyl(0.09, 0.09, 5.4, 5, roofDark, 0, 4.53, -0.35, Math.PI / 2, 0, 0));

  // facade + stepped gable behind the tower
  p.push(box(3.9, 3.2, 0.26, creamLight, 0, 1.95, 2.1));
  p.push(box(3.1, 0.6, 0.3, cream, 0, 3.55, 2.12));
  p.push(box(1.7, 0.42, 0.3, cream, 0, 3.98, 2.12));

  // side annex
  p.push(box(1.25, 2.3, 2.5, cream, -2.5, 1.43, 0.3));
  p.push(box(1.55, 0.16, 2.7, roof, -2.5, 2.7, 0.3));
  p.push(box(1.2, 0.12, 0.6, creamLight, -2.5, 2.82, 0.3));

  // bell tower
  p.push(box(1.7, 5.1, 1.7, cream, 0, 2.7, 2.1));
  p.push(box(1.82, 0.16, 1.82, creamLight, 0, 3.15, 2.1));
  p.push(box(1.82, 0.14, 1.82, creamLight, 0, 4.35, 2.1));
  p.push(box(1.5, 1.0, 1.5, creamLight, 0, 5.55, 2.1));
  p.push(box(1.66, 0.16, 1.66, cream, 0, 6.06, 2.1));

  // belfry openings (bell visible through the front gap)
  p.push(box(0.36, 0.62, 0.08, dark, -0.42, 5.55, 2.86));
  p.push(box(0.36, 0.62, 0.08, dark, 0.42, 5.55, 2.86));
  p.push(box(0.08, 0.62, 0.36, dark, -0.76, 5.55, 2.1));
  p.push(box(0.08, 0.62, 0.36, dark, 0.76, 5.55, 2.1));
  p.push(box(0.24, 0.32, 0.2, gold, 0, 5.48, 2.72));
  p.push(box(0.1, 0.1, 0.1, roofDark, 0, 5.7, 2.72));
  p.push(cyl(0.03, 0.03, 0.32, 4, roofDark, 0, 5.32, 2.72));

  // tower cap + cross
  const cap = new THREE.ConeGeometry(1.15, 0.92, 4);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, 6.52, 2.1);
  p.push(paint(cap, roof));
  p.push(box(0.09, 0.82, 0.09, '#efe3c6', 0, 7.3, 2.1));
  p.push(box(0.5, 0.09, 0.09, '#efe3c6', 0, 7.42, 2.1));

  // arched-ish door + frame
  p.push(box(0.96, 1.58, 0.1, dark, 0, 0.94, 2.97));
  p.push(box(0.12, 1.74, 0.14, creamLight, -0.54, 1.02, 2.99));
  p.push(box(0.12, 1.74, 0.14, creamLight, 0.54, 1.02, 2.99));
  p.push(box(1.2, 0.16, 0.16, creamLight, 0, 1.88, 2.99));
  p.push(box(0.28, 0.28, 0.06, dark, 0, 2.0, 2.98));
  p.push(box(1.5, 0.14, 0.6, stone, 0, 0.12, 3.25));
  p.push(box(1.25, 0.14, 0.4, stone, 0, 0.24, 3.08));

  // rose window
  p.push(cyl(0.46, 0.46, 0.06, 12, creamLight, 0, 3.52, 2.95, Math.PI / 2, 0, 0));
  p.push(cyl(0.34, 0.34, 0.08, 12, '#4e7c8b', 0, 3.52, 3.0, Math.PI / 2, 0, 0));

  // side windows
  for (const wz of [-1.55, 0.35]) {
    for (const sx of [-1, 1]) {
      p.push(box(0.08, 0.95, 0.52, dark, sx * 1.92, 2.15, wz));
      p.push(box(0.1, 0.1, 0.64, creamLight, sx * 1.94, 2.66, wz));
      p.push(box(0.1, 0.1, 0.64, creamLight, sx * 1.94, 1.64, wz));
      p.push(box(0.1, 1.1, 0.1, creamLight, sx * 1.94, 2.15, wz - 0.32));
      p.push(box(0.1, 1.1, 0.1, creamLight, sx * 1.94, 2.15, wz + 0.32));
    }
  }

  // front buttresses, small side door, bench
  p.push(box(0.32, 2.4, 0.5, creamLight, -1.75, 1.35, 2.18));
  p.push(box(0.32, 2.4, 0.5, creamLight, 1.75, 1.35, 2.18));
  p.push(box(0.08, 1.5, 0.8, dark, -2.7, 0.9, 1.5));
  p.push(box(0.14, 1.64, 0.94, wood, -2.75, 0.98, 1.5));
  p.push(box(1.4, 0.1, 0.34, wood, 1.15, 0.42, 3.25));
  p.push(box(0.09, 0.42, 0.3, wood, 0.55, 0.21, 3.25));
  p.push(box(0.09, 0.42, 0.3, wood, 1.75, 0.21, 3.25));

  return bakeBaseAO(merge(p), 0.6, 0.3);
}

function tower() {
  const p = [baseDisc(1.45)];
  const lean = 0.18;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.push(
        box(0.16, 3.0, 0.16, PALETTE.woodDark, sx * 0.64, 1.5, sz * 0.64, -sz * lean, 0, sx * lean)
      );
    }
  }
  p.push(box(1.65, 0.14, 0.12, PALETTE.wood, 0, 1.2, 0.62, 0, 0, 0.02));
  p.push(box(1.65, 0.12, 0.12, PALETTE.wood, 0, 2.1, -0.55, 0, 0, -0.02));
  p.push(box(0.12, 0.12, 1.5, PALETTE.wood, 0.58, 1.65, 0, 0.02, 0, 0));
  p.push(box(2.0, 0.18, 2.0, PALETTE.wood, 0, 3.0, 0));
  p.push(box(2.02, 0.09, 0.12, PALETTE.metal, 0, 3.36, 0.94));
  p.push(box(2.02, 0.09, 0.12, PALETTE.metal, 0, 3.36, -0.94));
  p.push(box(0.12, 0.09, 2.02, PALETTE.metal, 0.94, 3.36, 0));
  // roof
  const roof = new THREE.ConeGeometry(1.55, 0.62, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 3.95, 0);
  p.push(paint(roof, PALETTE.tarp));
  p.push(cyl(0.05, 0.05, 0.5, 4, PALETTE.metalLight, 0, 4.35, 0));
  // ladder
  for (let i = 0; i < 6; i++) {
    p.push(box(0.52, 0.06, 0.08, PALETTE.metalLight, 0, 0.42 + i * 0.44, 1.02));
  }
  p.push(box(0.07, 2.7, 0.08, PALETTE.metal, -0.23, 1.55, 1.02));
  p.push(box(0.07, 2.7, 0.08, PALETTE.metal, 0.23, 1.55, 1.02));
  // little lantern box
  p.push(box(0.16, 0.2, 0.16, '#ffb35e', 0.6, 3.25, 0.6));
  p.push(box(0.22, 0.06, 0.22, PALETTE.metal, 0.6, 3.39, 0.6));
  return merge(p);
}

export const BUILDINGS = [
  {
    id: 'barricade',
    name: 'BARRICADE',
    cost: 4,
    radius: 1.35,
    desc: 'Scrap cover.',
  },
  {
    id: 'campfire',
    name: 'CAMPFIRE',
    cost: 8,
    radius: 1.15,
    desc: 'Heals in its light.',
    geometry: null,
  },
  {
    id: 'catcher',
    name: 'RAIN CATCHER',
    cost: 12,
    radius: 1.45,
    desc: '+1 water / 6s.',
    geometry: null,
  },
  {
    id: 'house',
    name: 'ADOBE HOUSE',
    cost: 18,
    radius: 3.45,
    desc: '+1 scrap / 9s.',
    geometry: null,
  },
  {
    id: 'tower',
    name: 'WATCHTOWER',
    cost: 20,
    radius: 1.65,
    desc: 'Auto-fires within 13m.',
    geometry: null,
  },
  {
    id: 'chapel',
    name: 'CHAPEL',
    cost: 32,
    radius: 3.7,
    desc: '+25 max vitality.',
    geometry: null,
  },
];

const GEO_BUILDERS = {
  barricade,
  campfire,
  catcher,
  house: adobeHouse,
  tower,
  chapel,
};

export class Settlement {
  constructor({ scene, particles, state, onWater, onKill, onScrap, obstacles = [] }) {
    this.scene = scene;
    this.particles = particles;
    this.state = state;
    this.onWater = onWater;
    this.onKill = onKill;
    this.onScrap = onScrap;
    this.obstacles = obstacles;
    this.buildings = [];
    this.buildSeq = 0;
    this.occlusionTimer = 0;
    this.occlusionRay = new THREE.Raycaster();
    this.occlusionFrom = new THREE.Vector3();
    this.occlusionTo = new THREE.Vector3();
    this.occlusionDir = new THREE.Vector3();
    this.occlusionNDC = new THREE.Vector3();
    this.occlusionHits = [];
    this.selected = null;
    this.placing = false;
    this.canPlace = false;
    this.reason = '';
    this.prodTimer = 0;
    this.houseTimer = 0;
    this.time = 0;

    this.buildMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const plaster = makeDetailSet('plaster', deriveSeed('plaster-detail'));
    plaster.map.repeat.set(2, 2);
    plaster.normalMap.repeat.set(2, 2);
    this.houseMat = this.buildMat.clone();
    this.houseMat.map = plaster.map;
    this.houseMat.normalMap = plaster.normalMap;
    this.houseMat.normalScale = new THREE.Vector2(0.45, 0.45);
    this.geos = {};
    for (const def of BUILDINGS) {
      const geo = GEO_BUILDERS[def.id]();
      def.geometry = geo;
      this.geos[def.id] = geo;
    }

    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0x9fdc86,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      toneMapped: false,
    });
    this.ghost = new THREE.Mesh(this.geos.barricade, this.ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 3;
    scene.add(this.ghost);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x9fdc86,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.35, 30), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    scene.add(this.ring);

    this.flameGeo = new THREE.ConeGeometry(0.23, 0.72, 6);
    this.flameMat = new THREE.MeshBasicMaterial({
      color: 0xffb05b,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.coreGeo = new THREE.ConeGeometry(0.12, 0.46, 5);
    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xffe7a8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.poolGeo = new THREE.PlaneGeometry(1, 1);
    this.poolGeo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0xff7a30,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.glowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xff8a3c,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.towerGlowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffb466,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    // tracer pool for towers
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: 0xffc980,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(tracerGeo, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
  }

  begin(typeId, player) {
    const def = BUILDINGS.find((b) => b.id === typeId);
    if (!def) return;
    this.selected = def;
    this.placing = true;
    this.ghost.geometry = def.geometry;
    this.ghost.visible = true;
    this.ghostMat.color.set(0x9fdc86);
    this.ring.visible = true;
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.RingGeometry(def.radius - 0.12, def.radius, 30);
    const fwd = player.heading;
    const spawnDist = Math.max(3.4, def.radius + 1.1);
    this.moveGhost(player.x + Math.sin(fwd) * spawnDist, player.z + Math.cos(fwd) * spawnDist, player);
  }

  cancel() {
    this.selected = null;
    this.placing = false;
    this.canPlace = false;
    this.reason = '';
    this.ghost.visible = false;
    this.ring.visible = false;
  }

  moveGhost(x, z, player) {
    if (!this.placing) return;
    const snappedX = Math.round(x / GRID) * GRID;
    const snappedZ = Math.round(z / GRID) * GRID;
    const dx = snappedX - player.x;
    const dz = snappedZ - player.z;
    const dist = Math.hypot(dx, dz);
    let gx = snappedX;
    let gz = snappedZ;
    if (dist > BUILD_RANGE) {
      gx = player.x + (dx / dist) * BUILD_RANGE;
      gz = player.z + (dz / dist) * BUILD_RANGE;
      gx = Math.round(gx / GRID) * GRID;
      gz = Math.round(gz / GRID) * GRID;
    }
    const y = heightAt(gx, gz);
    this.ghost.position.set(gx, y + 0.02, gz);
    this.ring.position.set(gx, y + 0.06, gz);
    this.validate(player);
  }

  validate(player) {
    const def = this.selected;
    if (!def) {
      this.canPlace = false;
      return false;
    }
    const gx = this.ghost.position.x;
    const gz = this.ghost.position.z;
    const dist = Math.hypot(gx - player.x, gz - player.z);
    let reason = '';

    if (def.cost > this.state.scrap) reason = 'NOT ENOUGH SCRAP';
    else if (Math.hypot(gx, gz) > CAMP_RADIUS) reason = 'OUTSIDE SAFE RANGE';
    else if (dist > BUILD_RANGE) reason = 'TOO FAR AWAY';
    else if (dist < def.radius + 0.3) reason = 'TOO CLOSE TO YOU';
    else if (slopeAt(gx, gz, 1.1) > 0.26) reason = 'UNEVEN GROUND';
    else {
      for (const b of this.buildings) {
        if (Math.hypot(b.x - gx, b.z - gz) < b.radius + def.radius + 0.15) {
          reason = 'BLOCKED BY STRUCTURE';
          break;
        }
      }
      if (!reason) {
        for (const o of this.obstacles) {
          if (Math.hypot(o.x - gx, o.z - gz) < o.r + def.radius) {
            reason = 'BLOCKED BY WRECKAGE';
            break;
          }
        }
      }
    }

    this.canPlace = !reason;
    this.reason = reason;
    const color = this.canPlace ? 0x9fdc86 : 0xe17151;
    this.ghostMat.color.setHex(color);
    this.ringMat.color.setHex(color);
    return this.canPlace;
  }

  /** Create one building at a world position. Shared by placement and save restore. */
  createBuilding(def, x, z) {
    const y = heightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);

    let geo = def.geometry;
    if (def.id === 'house') {
      const seed = hash32(WORLD_SEED, 'house', this.buildSeq++, Math.round(x * 8), Math.round(z * 8));
      const rng = makeRng(seed);
      // One in four uses the shared hand-authored hero geometry; the rest are modular variants.
      geo = rng() < 0.25 ? this.geos.house : buildAdobeHouse(rng);
    }
    const baseMat = def.id === 'house' ? this.houseMat : this.buildMat;
    const mesh = new THREE.Mesh(geo, baseMat.clone());
    mesh.material.transparent = true;
    mesh.material.opacity = 1;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    mesh.geometry.computeBoundingSphere();
    group.updateMatrixWorld(true);
    const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(group.matrixWorld);

    const building = {
      def,
      type: def.id,
      x,
      z,
      y,
      radius: def.radius,
      group,
      mesh,
      sphere,
      occluded: false,
      cooldown: Math.random() * 0.5,
      phase: Math.random() * 6.28,
      flame: null,
      glow: null,
    };

    if (def.id === 'campfire') {
      const flame = new THREE.Mesh(this.flameGeo, this.flameMat);
      flame.position.set(0, 0.58, 0);
      group.add(flame);
      building.flame = flame;

      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      core.position.set(0, 0.56, 0.04);
      group.add(core);
      building.core = core;

      const pool = new THREE.Mesh(this.poolGeo, this.poolMat);
      pool.position.set(0, 0.06, 0);
      pool.scale.setScalar(4.4);
      group.add(pool);

      const glow = new THREE.Sprite(this.glowMat);
      glow.position.set(0, 0.95, 0);
      glow.scale.setScalar(3.4);
      group.add(glow);
      building.glow = glow;
    }

    if (def.id === 'tower') {
      const glow = new THREE.Sprite(this.towerGlowMat);
      glow.position.set(0.6, 3.35, 0.6);
      glow.scale.setScalar(1.35);
      group.add(glow);
      building.glow = glow;
    }

    this.scene.add(group);
    this.buildings.push(building);
    return building;
  }

  /** Recreate saved buildings without charging scrap or playing placement effects. */
  restore(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const def = BUILDINGS.find((b) => b.id === item.type);
      if (def) this.createBuilding(def, item.x, item.z);
    }
  }

  serialize() {
    return {
      buildings: this.buildings.map((b) => ({ type: b.type, x: b.x, z: b.z })),
      prodTimer: this.prodTimer,
      houseTimer: this.houseTimer,
    };
  }

  place(player) {
    if (!this.placing || !this.selected) return { ok: false, reason: 'NO STRUCTURE' };
    this.validate(player);
    if (!this.canPlace) return { ok: false, reason: this.reason || 'INVALID SPOT' };

    const def = this.selected;
    const x = this.ghost.position.x;
    const z = this.ghost.position.z;
    const building = this.createBuilding(def, x, z);
    const y = building.y;
    this.particles.burst(x, y + 0.4, z, '#b09572', 18, 3.2);

    // nudge the ghost further out so repeated walls flow naturally
    const dx = x - player.x;
    const dz = z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = x + (dx / d) * 2.4;
    const nz = z + (dz / d) * 2.4;
    this.moveGhost(nx, nz, player);
    this.validate(player);

    return { ok: true, cost: def.cost, building };
  }

  count(typeId) {
    let n = 0;
    for (const b of this.buildings) if (b.type === typeId) n++;
    return n;
  }

  isNearCampfire(x, z, radius = 5) {
    for (const b of this.buildings) {
      if (b.type !== 'campfire') continue;
      if (Math.hypot(b.x - x, b.z - z) < radius) return true;
    }
    return false;
  }

  isNearChapel(x, z, radius = 7.5) {
    for (const b of this.buildings) {
      if (b.type !== 'chapel') continue;
      if (Math.hypot(b.x - x, b.z - z) < radius) return true;
    }
    return false;
  }

  isNearHealer(x, z) {
    return this.isNearCampfire(x, z, 5.2) || this.isNearChapel(x, z, 7.5);
  }

  fireTracer(from, to) {
    let slot = this.tracers.find((t) => t.life <= 0);
    if (!slot) slot = this.tracers[0];
    const mesh = slot.mesh;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.lookAt(to.x, to.y, to.z);
    mesh.scale.set(1, 1, len);
    mesh.material.opacity = 0.95;
    mesh.visible = true;
    slot.life = 0.11;
  }

  // Orthographic cameras have no perspective cue telling you a building is in front of the player,
  // so fade any structure that covers them. Because ortho rays are parallel, cast back from a few
  // points up the player's body toward the camera; any hit means the building is in the way.
  updateOcclusion(camera, player, dt) {
    this.occlusionTimer -= dt;
    if (this.occlusionTimer <= 0 && this.buildings.length) {
      this.occlusionTimer = 0.1;
      camera.getWorldPosition(this.occlusionFrom);
      camera.getWorldDirection(this.occlusionDir);
      this.occlusionDir.negate(); // from the player back toward the camera
      const samples = [0.25, 0.9, 1.65];
      const px = player.x;
      const py = player.pos.y + 0.9;
      const pz = player.z;
      this.occlusionNDC.set(px, py, pz).project(camera);
      const onScreen = Math.abs(this.occlusionNDC.x) < 1.05 && Math.abs(this.occlusionNDC.y) < 1.05;
      for (const b of this.buildings) {
        b.occluded = false;
        if (!onScreen) continue;
        // Cheap parallel-projection test first: is the building even on the player's screen ray?
        const s = b.sphere;
        const rx = s.center.x - px;
        const ry = s.center.y - py;
        const rz = s.center.z - pz;
        const depth = rx * this.occlusionDir.x + ry * this.occlusionDir.y + rz * this.occlusionDir.z;
        if (depth < 0) continue; // farther from the camera than the player
        const perp2 = rx * rx + ry * ry + rz * rz - depth * depth;
        if (perp2 > s.radius * s.radius) continue;
        // Then confirm against the actual geometry along the player's body.
        for (const h of samples) {
          this.occlusionTo.set(px, player.pos.y + h, pz);
          this.occlusionRay.set(this.occlusionTo, this.occlusionDir);
          this.occlusionRay.far = this.occlusionFrom.distanceTo(this.occlusionTo) + 2;
          this.occlusionHits.length = 0;
          this.occlusionRay.intersectObject(b.mesh, false, this.occlusionHits);
          if (this.occlusionHits.length) {
            b.occluded = true;
            break;
          }
        }
      }
    }
    for (const b of this.buildings) {
      b.mesh.material.opacity = THREE.MathUtils.damp(b.mesh.material.opacity, b.occluded ? 0.3 : 1, 9, dt);
    }
  }

  update(dt, time, player, enemies) {
    this.time = time;

    // flicker
    this.poolMat.opacity = 0.45 + (Math.sin(time * 5.3) * 0.5 + 0.5) * 0.18;
    for (const b of this.buildings) {
      if (b.flame) {
        const f = Math.sin(time * 9 + b.phase) * 0.5 + 0.5;
        b.flame.scale.set(0.85 + f * 0.3, 0.8 + f * 0.45, 0.85 + f * 0.3);
        b.flame.rotation.y = time * 2.4 + b.phase;
        if (b.core) {
          b.core.scale.set(0.8 + f * 0.35, 0.7 + f * 0.55, 0.8 + f * 0.35);
          b.core.rotation.y = -time * 3.1 + b.phase;
          b.core.position.x = Math.sin(time * 6 + b.phase) * 0.03;
        }
      }
      if (b.glow) {
        const f = Math.sin(time * 7 + b.phase * 2) * 0.5 + 0.5;
        b.glow.material.opacity = b.type === 'tower' ? 0.38 + f * 0.22 : 0.5 + f * 0.25;
      }
    }

    // watchtower fire
    if (enemies) {
      for (const b of this.buildings) {
        if (b.type !== 'tower') continue;
        b.cooldown -= dt;
        if (b.cooldown > 0) continue;
        const targetIndex = enemies.nearest(b.x, b.z, 13);
        if (targetIndex < 0) continue;
        b.cooldown = 1.15 + Math.random() * 0.35;
        const e = enemies.getAt(targetIndex);
        const killed = enemies.damage(targetIndex, 22, b.x, b.z);
        const from = new THREE.Vector3(b.x, b.y + 3.3, b.z);
        const to = new THREE.Vector3(e.x, e.y + 0.9, e.z);
        this.fireTracer(from, to);
        this.particles.burst(to.x, to.y, to.z, killed ? '#a8c07a' : '#ffbd7a', killed ? 14 : 6, 2.2);
        if (killed && this.onKill) this.onKill(to.x, to.z);
      }
    }

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        t.mesh.material.opacity = 0;
      } else {
        t.mesh.material.opacity = (t.life / 0.11) * 0.9;
      }
    }

    // water production
    const catchers = this.count('catcher');
    if (catchers > 0) {
      this.prodTimer += dt;
      if (this.prodTimer >= 6) {
        this.prodTimer -= 6;
        if (this.onWater) this.onWater(catchers);
      }
    } else {
      this.prodTimer = 0;
    }

    // adobe houses send out scavengers
    const houses = this.count('house');
    if (houses > 0) {
      this.houseTimer += dt;
      if (this.houseTimer >= 9) {
        this.houseTimer -= 9;
        if (this.onScrap) this.onScrap(houses);
      }
    } else {
      this.houseTimer = 0;
    }

    if (this.placing) this.validate(player);
  }
}
