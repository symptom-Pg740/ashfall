import * as THREE from 'three';
import { heightAt, slopeAt } from './terrain.js';
import { box, cyl, dodeca, merge, paint, bakeBaseAO, glowTexture, PALETTE } from './geo.js';
import { buildAdobeHouse } from './kit.js';
import { makeRng, deriveSeed, hash32, WORLD_SEED } from './rng.js';
import { makeDetailSet } from './textures.js';

const CAMP_RADIUS = 110;
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

function guardPost() {
  const sand = '#a3875e';
  const sandDark = '#806a4a';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const metal = '#777a78';
  const rust = '#8a4f35';
  const tarp = '#7c6447';
  const stone = '#b6a184';
  const p = [baseDisc(1.6)];

  // A dug-in pad, not a tower: low sandbags, a gun rest and a scrap blast shield.
  p.push(box(2.35, 0.14, 2.35, '#7d6649', 0, 0.07, 0));
  p.push(box(2.0, 0.1, 2.0, '#5f4a35', 0, 0.16, 0));
  for (let i = -1; i <= 1; i++) {
    p.push(box(1.5, 0.05, 0.28, '#6b4a2e', 0, 0.22, i * 0.32));
  }

  // Sandbag parapet: three rows on the back and sides, two at the front with a firing gap.
  for (let row = 0; row < 3; row++) {
    const y = 0.28 + row * 0.2;
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.4 + (row % 2 ? 0.2 : 0);
      p.push(box(0.38, 0.2, 0.32, row % 2 ? sand : sandDark, x, y, -0.88, 0, 0, 0));
    }
    for (const sx of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const z = i * 0.4 + (row % 2 ? 0.2 : 0);
        p.push(box(0.3, 0.2, 0.38, row % 2 ? sandDark : sand, sx * 0.9, y, z, 0, 0, 0));
      }
    }
  }
  for (let row = 0; row < 2; row++) {
    const y = 0.28 + row * 0.2;
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const x = i * 0.4 + (row % 2 ? 0.2 : 0);
      p.push(box(0.38, 0.2, 0.32, row % 2 ? sand : sandDark, x, y, 0.9, 0, 0, 0));
    }
  }

  // Corrugated blast shield across the back, with a camo net over the rear half.
  p.push(box(1.9, 1.1, 0.06, rust, 0, 0.85, -1.02, 0.12, 0, 0));
  p.push(box(1.96, 0.07, 0.1, metal, 0, 1.43, -1.0));
  p.push(box(2.0, 0.04, 1.0, tarp, 0, 1.52, -0.45, 0.12, 0, 0));
  for (const sx of [-0.85, 0.85]) {
    p.push(cyl(0.05, 0.06, 1.5, 5, woodDark, sx, 0.75, -0.82));
  }

  // Timber gun rest in the firing gap.
  p.push(box(0.9, 0.1, 0.24, wood, 0, 1.02, 0.82));
  p.push(box(0.08, 0.9, 0.08, woodDark, -0.4, 0.45, 0.82));
  p.push(box(0.08, 0.9, 0.08, woodDark, 0.4, 0.45, 0.82));

  // Ammo crate, field radio, lantern and a range card.
  p.push(box(0.45, 0.3, 0.32, '#6d563f', 0.55, 0.31, -0.45, 0, 0.2, 0));
  p.push(box(0.4, 0.05, 0.28, '#85663f', 0.55, 0.48, -0.45, 0, 0.2, 0));
  p.push(box(0.22, 0.16, 0.16, '#3d4237', 0.55, 0.6, -0.45, 0, 0.2, 0));
  p.push(cyl(0.03, 0.03, 0.55, 4, metal, 0.55, 0.87, -0.45));
  p.push(box(0.16, 0.2, 0.16, '#ffb35e', -0.6, 1.15, -0.65));
  p.push(box(0.22, 0.06, 0.22, metal, -0.6, 1.28, -0.65));
  p.push(cyl(0.04, 0.05, 1.25, 4, woodDark, 0.92, 0.62, 0.35));
  p.push(box(0.55, 0.32, 0.04, '#d8c8a8', 0.92, 1.2, 0.35, 0, 0.2, 0));
  p.push(box(0.34, 0.03, 0.02, '#5d4631', 0.92, 1.23, 0.38, 0, 0.2, 0));
  p.push(box(1.0, 0.1, 0.3, stone, 0, 0.05, 1.12));

  return bakeBaseAO(merge(p), 0.5, 0.3);
}

function solarArray() {
  const p = [baseDisc(1.7)];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.push(box(0.08, 0.55, 0.08, PALETTE.metalDark, sx * 0.72, 0.27, sz * 0.48));
    }
  }
  p.push(box(1.9, 0.07, 1.2, '#203f52', 0, 0.86, 0, -0.42, 0, 0));
  p.push(box(1.7, 0.04, 1.02, '#35617a', 0, 0.9, 0.06, -0.42, 0, 0));
  for (let i = -1; i <= 1; i++) {
    p.push(box(0.025, 0.02, 1.0, '#7fa6b8', i * 0.5, 0.93, 0.06, -0.42, 0, 0));
  }
  for (let i = 0; i < 3; i++) {
    p.push(box(1.66, 0.02, 0.025, '#7fa6b8', 0, 0.91, -0.2 + i * 0.26, -0.42, 0, 0));
  }
  p.push(box(0.35, 0.26, 0.2, PALETTE.metal, 0.92, 0.2, 0.5));
  p.push(cyl(0.03, 0.03, 0.55, 4, '#20262a', 0.92, 0.45, 0.5, 0, 0, 0.35));
  return merge(p);
}

function powerPole() {
  const p = [baseDisc(0.55)];
  p.push(cyl(0.1, 0.16, 3.4, 6, PALETTE.woodDark, 0, 1.7, 0));
  p.push(box(1.55, 0.1, 0.12, PALETTE.wood, 0, 3.12, 0));
  for (const sx of [-0.62, 0.62]) {
    p.push(cyl(0.055, 0.055, 0.18, 6, '#cfd7d2', sx, 3.25, 0));
  }
  p.push(box(0.32, 0.4, 0.24, PALETTE.metal, 0, 2.55, 0.15));
  p.push(cyl(0.025, 0.025, 1.15, 4, '#20262a', 0.0, 2.82, -0.08, 0.45, 0, 0.12));
  p.push(box(0.5, 0.05, 0.05, PALETTE.metalLight, 0.0, 2.98, 0.05));
  return merge(p);
}

function batteryBank() {
  const p = [baseDisc(1.25)];
  p.push(box(1.5, 0.92, 0.92, PALETTE.metalDark, 0, 0.46, 0));
  p.push(box(1.56, 0.1, 0.98, PALETTE.metal, 0, 0.94, 0));
  for (const sx of [-0.35, 0.35]) {
    p.push(cyl(0.12, 0.12, 0.5, 8, '#b9543c', sx, 0.42, 0.47, Math.PI / 2, 0, 0));
    p.push(cyl(0.05, 0.05, 0.08, 6, '#d6c07a', sx, 0.62, 0.68, Math.PI / 2, 0, 0));
  }
  p.push(box(0.55, 0.16, 0.03, '#8fe0a0', 0, 0.62, 0.47));
  p.push(box(0.4, 0.06, 0.03, '#1c2a1e', 0, 0.46, 0.48));
  return merge(p);
}

function yardLight() {
  const p = [baseDisc(0.7)];
  p.push(cyl(0.07, 0.1, 2.8, 6, PALETTE.metalDark, 0, 1.4, 0));
  p.push(box(0.52, 0.26, 0.36, PALETTE.metal, 0, 2.84, 0));
  p.push(box(0.34, 0.04, 0.26, '#ffe3a8', 0, 2.69, 0.02));
  p.push(box(0.85, 0.05, 0.05, PALETTE.metal, 0.32, 2.98, 0, 0, 0, 0.4));
  return merge(p);
}

function vickersBase() {
  const p = [baseDisc(1.35)];
  // tripod
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    p.push(cyl(0.045, 0.06, 1.45, 5, PALETTE.metalDark,
      Math.cos(a) * 0.34, 0.72, Math.sin(a) * 0.34,
      Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22));
  }
  p.push(cyl(0.16, 0.2, 0.14, 8, PALETTE.metal, 0, 1.02, 0));
  p.push(box(0.55, 0.2, 0.4, '#6b5134', 0.55, 0.12, -0.35, 0, 0.2, 0));
  p.push(box(0.42, 0.14, 0.3, '#85663f', 0.58, 0.28, -0.36, 0, 0.5, 0));
  // sandbags
  for (let i = 0; i < 3; i++) {
    p.push(box(0.52, 0.22, 0.32, '#a89068', -0.62 + i * 0.12, 0.11, 0.5 + i * 0.28, 0, 0.2 + i * 0.3, 0));
  }
  p.push(box(0.1, 0.1, 0.1, '#552222', 0.3, 1.16, 0.28));
  return merge(p);
}

function vickersHead() {
  const p = [];
  const metal = '#777a78';
  const metalLight = '#9a9d98';
  const metalDark = '#4d504f';
  // receiver + water jacket + muzzle
  p.push(box(0.3, 0.28, 0.46, metal, 0, 0, -0.05));
  p.push(cyl(0.1, 0.1, 1.15, 8, metal, 0, 0, 0.62, Math.PI / 2, 0, 0));
  for (let i = 0; i < 7; i++) {
    p.push(cyl(0.118, 0.118, 0.025, 8, metalLight, 0, 0, 0.16 + i * 0.13, Math.PI / 2, 0, 0));
  }
  p.push(cyl(0.07, 0.075, 0.18, 6, metalDark, 0, 0, 1.24, Math.PI / 2, 0, 0));
  // top feed + spade grips
  p.push(box(0.22, 0.18, 0.3, '#6f5a3a', 0, 0.22, 0.04));
  p.push(box(0.03, 0.16, 0.03, metalDark, -0.18, -0.06, -0.32, 0.4, 0, 0));
  p.push(box(0.03, 0.16, 0.03, metalDark, 0.18, -0.06, -0.32, 0.4, 0, 0));
  p.push(box(0.3, 0.04, 0.04, metalDark, 0, 0.02, -0.32));
  // small side ammunition box, keeps the silhouette readable without hiding the barrel
  p.push(box(0.18, 0.2, 0.22, '#6f5a3a', -0.28, 0.1, 0.02));
  return merge(p);
}

function warehouse() {
  const adobe = '#c9a878';
  const adobeDark = '#a98a61';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const tarp = '#7c6447';
  const p = [baseDisc(3.15)];
  // slab + back/side walls, open front with two piers
  p.push(box(4.6, 0.12, 3.8, '#8f7552', 0, 0.06, 0));
  p.push(box(4.4, 2.5, 0.2, adobe, 0, 1.25, -1.7));
  p.push(box(0.2, 2.5, 3.4, adobe, -2.2, 1.25, 0));
  p.push(box(0.2, 2.5, 3.4, adobe, 2.2, 1.25, 0));
  p.push(box(1.25, 2.2, 0.2, adobe, -1.67, 1.1, 1.7));
  p.push(box(1.25, 2.2, 0.2, adobe, 1.67, 1.1, 1.7));
  p.push(box(4.4, 0.45, 0.22, adobeDark, 0, 2.42, 1.7));
  p.push(box(4.9, 0.16, 4.0, '#b78f5d', 0, 2.62, 0));
  for (let i = 0; i < 5; i++) {
    p.push(box(0.12, 0.1, 3.9, wood, -1.8 + i * 0.9, 2.73, 0));
  }
  // tarp awning over the loading door
  p.push(box(3.2, 0.06, 1.15, tarp, 0, 2.33, 2.25, 0.16, 0, 0));
  for (let i = 0; i < 4; i++) {
    p.push(cyl(0.04, 0.04, 1.2, 4, woodDark, -1.2 + i * 0.8, 1.9, 2.2, 0.32, 0, 0));
  }
  // a couple of permanent crates + a lantern
  p.push(box(0.7, 0.5, 0.7, '#8a6a42', 1.4, 0.3, -1.1, 0, 0.2, 0));
  p.push(box(0.55, 0.4, 0.55, '#9b7a4e', 1.3, 0.75, -1.15, 0, 0.7, 0));
  p.push(box(0.16, 0.2, 0.16, '#ffb35e', 0, 2.02, 1.45));
  return merge(p);
}

function scavengerHut() {
  const mud = '#c9a878';
  const mudDark = '#a98a61';
  const stone = '#b6a184';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const rust = '#8a4f35';
  const metal = '#777a78';
  const tarp = '#7c6447';
  const dark = '#2f2821';
  const p = [baseDisc(1.95)];

  // Stone footing and a low, patched mud box.
  p.push(box(3.0, 0.16, 2.5, stone, 0, 0.08, 0));
  p.push(box(2.55, 1.5, 2.05, mud, 0, 0.9, -0.2));
  p.push(box(0.7, 0.48, 0.06, mudDark, -0.72, 1.25, 0.84));
  p.push(box(0.62, 0.36, 0.06, mudDark, 0.7, 0.55, 0.84));
  p.push(box(2.8, 0.14, 2.3, mudDark, 0, 1.69, -0.2));
  // A scrap patch and a short stove pipe on the roof.
  p.push(box(1.05, 0.05, 0.8, rust, 0.55, 1.77, -0.45, 0, 0.12, 0));
  p.push(cyl(0.1, 0.12, 0.9, 6, metal, -0.65, 2.15, -0.65));

  // Door and a small window with a shutter.
  p.push(box(0.85, 1.05, 0.1, dark, -0.35, 0.6, 0.85));
  p.push(box(0.12, 1.15, 0.12, woodDark, -0.84, 0.62, 0.88));
  p.push(box(0.12, 1.15, 0.12, woodDark, 0.14, 0.62, 0.88));
  p.push(box(0.68, 0.5, 0.08, dark, 0.72, 1.08, 0.86));
  p.push(box(0.72, 0.07, 0.12, wood, 0.72, 1.36, 0.9));

  // Scrap lean-to: two poles and an angled sheet.
  for (const sz of [-1, 0.75]) {
    p.push(cyl(0.06, 0.08, 1.9, 5, woodDark, 1.35, 0.95, sz));
  }
  p.push(box(1.15, 0.06, 2.2, rust, 1.75, 1.72, -0.1, 0, 0, -0.28));
  p.push(box(0.06, 0.06, 2.15, metal, 1.22, 1.95, -0.1));

  // Hand cart by the door.
  p.push(box(1.0, 0.16, 0.62, wood, -1.55, 0.42, 1.15));
  p.push(box(0.9, 0.22, 0.52, woodDark, -1.55, 0.58, 1.15, 0, 0.08, 0));
  p.push(cyl(0.3, 0.3, 0.08, 8, woodDark, -1.95, 0.3, 0.92, 0, 0, Math.PI / 2));
  p.push(cyl(0.3, 0.3, 0.08, 8, woodDark, -1.15, 0.3, 0.92, 0, 0, Math.PI / 2));
  p.push(box(0.05, 0.05, 0.8, woodDark, -1.55, 0.62, 1.65, 0.28, 0, 0));

  // Hanging cans and sorted scrap piles.
  for (let i = 0; i < 3; i++) {
    p.push(cyl(0.055, 0.055, 0.16, 6, metal, 1.45 + i * 0.18, 1.35 - i * 0.04, 0.75, 0, 0, 0));
  }
  p.push(box(0.55, 0.3, 0.5, rust, 0.55, 0.22, 1.0, 0, 0.3, 0));
  p.push(box(0.4, 0.22, 0.36, metal, 0.95, 0.18, 1.15, 0, -0.4, 0));
  p.push(box(0.3, 0.18, 0.3, tarp, -0.9, 0.17, 1.1, 0, 0.2, 0));

  // Chalk tally board.
  p.push(cyl(0.04, 0.05, 1.1, 4, woodDark, 1.1, 0.55, 0.72));
  p.push(box(0.55, 0.34, 0.05, '#d8c8a8', 1.1, 1.05, 0.74, 0, -0.12, 0));
  p.push(box(0.34, 0.03, 0.02, '#5d4631', 1.08, 1.08, 0.77, 0, -0.12, 0));
  p.push(box(0.26, 0.03, 0.02, '#5d4631', 1.07, 1.0, 0.77, 0, -0.12, 0));

  return bakeBaseAO(merge(p), 0.5, 0.3);
}

function wellWheel() {
  const stone = '#b6a184';
  const stoneDark = '#8f7c63';
  const mud = '#c9a878';
  const mudDark = '#a98a61';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const metal = '#777a78';
  const water = '#4c7f86';
  const tarp = '#7c6447';
  const p = [baseDisc(1.9)];

  p.push(cyl(1.55, 1.7, 0.18, 12, mudDark, 0, 0.09, 0));
  // Stone well ring.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.push(box(0.38, 0.42, 0.26, i % 2 ? stone : stoneDark, Math.cos(a) * 0.85, 0.32, Math.sin(a) * 0.85, 0, -a, 0));
  }
  p.push(cyl(0.62, 0.62, 0.05, 12, '#2a221b', 0, 0.5, 0));
  p.push(cyl(0.52, 0.52, 0.02, 12, water, 0, 0.54, 0));

  // Timber frame, axle and the hand-cranked wheel.
  for (const sx of [-1, 1]) p.push(box(0.12, 1.75, 0.12, woodDark, sx, 0.92, 0));
  p.push(cyl(0.09, 0.09, 2.15, 6, wood, 0, 1.74, 0, 0, 0, Math.PI / 2));
  p.push(cyl(0.52, 0.52, 0.12, 12, wood, 0.35, 1.74, 0, 0, 0, Math.PI / 2));
  p.push(cyl(0.4, 0.4, 0.13, 12, mudDark, 0.35, 1.74, 0, 0, 0, Math.PI / 2));
  for (let i = 0; i < 6; i++) {
    p.push(box(0.06, 0.92, 0.06, woodDark, 0.35, 1.74, 0, (i / 6) * Math.PI, 0, 0));
  }
  p.push(box(0.06, 0.34, 0.06, metal, 0.84, 1.43, 0.12));
  p.push(cyl(0.015, 0.015, 0.65, 3, '#b9a17a', 0.2, 1.37, 0));
  p.push(cyl(0.14, 0.17, 0.28, 8, woodDark, 0.2, 1.0, 0));

  // Trough, spill and a small tarp awning.
  p.push(box(1.3, 0.32, 0.55, wood, 1.55, 0.18, 0.65));
  p.push(box(1.1, 0.05, 0.4, water, 1.55, 0.36, 0.65));
  p.push(box(0.9, 0.02, 0.5, '#8a6a44', 1.15, 0.03, 1.0));
  p.push(box(1.5, 0.05, 1.1, tarp, -0.45, 2.15, -0.35, 0.14, 0, 0));
  for (const sx of [-1.05, 0.15]) p.push(cyl(0.05, 0.06, 2.1, 4, woodDark, sx, 1.05, -0.85));

  return bakeBaseAO(merge(p), 0.55, 0.3);
}

function farmPlot() {
  const soil = '#8a6a44';
  const soilDark = '#6f5336';
  const mud = '#c9a878';
  const mudDark = '#a98a61';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const metal = '#777a78';
  const water = '#4c7f86';
  const tarp = '#7c6447';
  const straw = '#b0a574';
  const p = [baseDisc(2.95)];

  // Packed plot and a low mud-brick border.
  p.push(box(4.4, 0.12, 4.0, soil, 0, 0.06, 0));
  for (const sx of [-1, 1]) p.push(box(0.16, 0.34, 4.25, mud, sx * 2.22, 0.17, 0));
  for (const sz of [-1, 1]) p.push(box(4.45, 0.34, 0.16, mudDark, 0, 0.17, sz * 2.02));

  // Tilled rows with dry stalks.
  for (let r = -1; r <= 1; r++) {
    const z = r * 1.05;
    p.push(box(3.9, 0.08, 0.5, soilDark, -0.1, 0.13, z));
    for (let i = -5; i <= 5; i++) {
      const x = i * 0.33;
      p.push(box(0.03, 0.28, 0.03, straw, x, 0.27, z + 0.08, 0, 0, 0));
      if (i % 2 === 0) p.push(box(0.03, 0.22, 0.03, straw, x + 0.1, 0.24, z - 0.1, 0.2, 0, 0.1));
    }
  }

  // Scrap irrigation channel and a water barrel.
  p.push(box(0.2, 0.08, 4.0, metal, 2.1, 0.22, 0));
  p.push(box(0.14, 0.03, 3.9, water, 2.1, 0.27, 0));
  p.push(cyl(0.35, 0.38, 0.8, 10, woodDark, -2.05, 0.45, 1.35));
  p.push(cyl(0.36, 0.36, 0.04, 10, water, -2.05, 0.86, 1.35));

  // Scarecrow, sacks and a hoe.
  p.push(cyl(0.06, 0.08, 1.85, 5, wood, 0.1, 0.95, -1.55));
  p.push(box(1.15, 0.08, 0.08, woodDark, 0.1, 1.5, -1.55));
  p.push(box(0.5, 0.55, 0.18, tarp, 0.1, 1.38, -1.55));
  p.push(box(0.3, 0.3, 0.3, '#c8b58a', 0.1, 1.82, -1.55));
  p.push(box(0.6, 0.4, 0.45, '#b6a184', 1.9, 0.28, -1.2, 0, 0.2, 0));
  p.push(box(0.5, 0.34, 0.4, '#9b7a4e', 1.55, 0.25, -1.5, 0, -0.3, 0));
  p.push(cyl(0.03, 0.04, 1.1, 4, woodDark, -1.55, 0.6, 0.65, 0, 0, 0.6));
  p.push(box(0.2, 0.08, 0.05, metal, -1.85, 0.28, 0.9, 0, 0.2, 0));

  return bakeBaseAO(merge(p), 0.55, 0.3);
}

function workshop() {
  const mud = '#c9a878';
  const mudDark = '#a98a61';
  const stone = '#b6a184';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const rust = '#8a4f35';
  const metal = '#777a78';
  const tarp = '#7c6447';
  const dark = '#2f2821';
  const p = [baseDisc(2.35)];

  p.push(box(3.4, 0.16, 2.9, stone, 0, 0.08, 0));
  // Mud box with an open front bay.
  p.push(box(3.2, 2.0, 0.2, mud, 0, 1.0, -1.2));
  p.push(box(0.2, 2.0, 2.4, mudDark, -1.5, 1.0, 0));
  p.push(box(0.2, 2.0, 2.4, mud, 1.5, 1.0, 0));
  p.push(box(0.7, 1.7, 0.18, mudDark, -1.05, 0.85, 1.18));
  p.push(box(0.7, 1.7, 0.18, mudDark, 1.05, 0.85, 1.18));
  p.push(box(3.5, 0.1, 3.0, rust, 0, 2.12, 0, 0.04, 0, 0));
  for (let i = -2; i <= 2; i++) p.push(box(0.1, 0.12, 3.0, woodDark, i * 0.62, 2.02, 0));

  // Bench, vice, press and tool wall.
  p.push(box(2.3, 0.14, 0.65, wood, 0.2, 0.96, 1.35));
  for (const sx of [-0.8, 1.1]) p.push(box(0.1, 0.9, 0.1, woodDark, sx, 0.45, 1.35));
  p.push(box(0.45, 0.22, 0.3, metal, -0.55, 1.1, 1.35, 0, 0.2, 0));
  p.push(cyl(0.045, 0.06, 0.35, 6, metal, -0.55, 1.35, 1.35));
  p.push(box(0.12, 0.9, 0.45, metal, 0.95, 1.5, 0.92));
  p.push(box(0.08, 0.12, 0.3, metal, 0.95, 1.58, 1.2));
  p.push(box(1.4, 0.08, 0.5, wood, -0.4, 1.62, -1.05));
  for (let i = 0; i < 5; i++) p.push(box(0.05, 0.3, 0.05, i % 2 ? metal : woodDark, -0.95 + i * 0.25, 1.8, -1.0));

  // Ammo crates, a powder keg and scrap stock.
  p.push(box(0.55, 0.38, 0.42, '#6d563f', 1.05, 0.35, 1.0, 0, 0.2, 0));
  p.push(box(0.42, 0.3, 0.36, '#85663f', 1.15, 0.72, 1.0, 0, -0.15, 0));
  p.push(cyl(0.28, 0.32, 0.55, 8, rust, 1.05, 0.32, -0.2));
  p.push(cyl(0.29, 0.29, 0.04, 8, '#5d3a28', 1.05, 0.6, -0.2));
  p.push(box(0.55, 0.2, 0.4, metal, -1.05, 0.25, 1.45, 0, 0.3, 0));
  p.push(box(0.4, 0.14, 0.3, rust, -0.7, 0.2, 1.35, 0, -0.2, 0));

  // Chalk sign and a vent pipe.
  p.push(cyl(0.04, 0.05, 1.3, 4, woodDark, 0.2, 1.55, 1.6));
  p.push(box(0.7, 0.4, 0.05, '#d8c8a8', 0.2, 2.15, 1.62, 0, 0.05, 0));
  p.push(box(0.4, 0.04, 0.02, '#5d4631', 0.2, 2.2, 1.66, 0, 0.05, 0));
  p.push(box(0.3, 0.04, 0.02, '#5d4631', 0.2, 2.1, 1.66, 0, 0.05, 0));
  p.push(cyl(0.09, 0.11, 1.0, 6, metal, -1.1, 2.35, -0.7));
  p.push(box(1.0, 0.04, 0.7, tarp, -0.65, 2.3, 1.2, 0.15, 0, 0));

  p.push(box(1.0, 0.08, 0.3, stone, 0, 0.04, 1.52));
  return bakeBaseAO(merge(p), 0.55, 0.3);
}

function relayMast() {
  const stone = '#b6a184';
  const mud = '#c9a878';
  const mudDark = '#a98a61';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const metal = '#8a8f8b';
  const metalDark = '#555b59';
  const rust = '#8a4f35';
  const tarp = '#7c6447';
  const dark = '#2f2821';
  const p = [baseDisc(2.0)];

  p.push(box(3.6, 0.16, 3.6, stone, 0, 0.08, 0));
  p.push(box(3.2, 0.12, 3.2, '#5f4a35', 0, 0.18, 0));

  // Four leaning legs, cross-braced like a scavenged lattice.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.push(cyl(0.06, 0.1, 3.4, 4, metalDark, sx * 0.72, 1.9, sz * 0.72, sz * 0.17, 0, -sx * 0.17));
    }
  }
  for (const y of [1.0, 2.0, 3.0]) {
    const half = 0.85 - y * 0.12;
    p.push(box(half * 2, 0.06, 0.06, metal, 0, y, -half));
    p.push(box(half * 2, 0.06, 0.06, metal, 0, y, half));
    p.push(box(0.06, 0.06, half * 2, metal, -half, y, 0));
    p.push(box(0.06, 0.06, half * 2, metal, half, y, 0));
  }

  // Platform, mast and dish.
  p.push(box(1.5, 0.1, 1.5, wood, 0, 3.55, 0));
  p.push(cyl(0.09, 0.12, 1.6, 6, metalDark, 0, 4.35, 0));
  p.push(cyl(0.8, 0.62, 0.16, 12, metal, 0, 4.55, 0, 0.85, 0, 0));
  p.push(cyl(0.62, 0.46, 0.06, 12, '#35617a', 0, 4.62, 0.02, 0.85, 0, 0));
  p.push(box(0.06, 0.05, 1.3, metal, 0, 4.7, 0.35, -0.35, 0, 0));
  p.push(box(0.7, 0.05, 0.05, metal, 0, 5.2, 0));
  p.push(box(0.05, 0.7, 0.05, metal, 0, 5.2, 0));
  p.push(box(0.16, 0.16, 0.16, '#ffb35e', 0.2, 5.4, 0));

  // Cables down to a radio cabinet and battery bank at the base.
  p.push(box(0.025, 2.4, 0.025, dark, 0.55, 2.3, 0.35, 0, 0, 0.18));
  p.push(box(0.8, 1.0, 0.55, woodDark, -0.9, 0.75, 0.7));
  p.push(box(0.6, 0.4, 0.06, '#3d4237', -0.9, 1.0, 0.99));
  p.push(box(0.55, 0.5, 0.45, metalDark, 0.95, 0.45, 0.7));
  p.push(box(0.5, 0.08, 0.4, rust, 0.95, 0.73, 0.7));
  p.push(box(0.5, 0.35, 0.4, '#6d563f', -0.8, 0.35, -0.9, 0, 0.2, 0));
  p.push(box(0.45, 0.3, 0.35, '#85663f', -0.4, 0.28, -1.0, 0, -0.2, 0));
  p.push(cyl(0.26, 0.3, 0.62, 8, rust, 0.95, 0.33, -0.85));

  // Sandbag ring and a tarp shelter for the operator.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.push(box(0.42, 0.2, 0.32, i % 2 ? '#a3875e' : '#806a4a', Math.cos(a) * 1.4, 0.28, Math.sin(a) * 1.4, 0, -a, 0));
  }
  p.push(box(1.3, 0.05, 1.1, tarp, 0.75, 1.45, -0.75, 0.12, 0, 0));
  for (const sx of [0.2, 1.25]) {
    p.push(cyl(0.04, 0.05, 1.45, 4, woodDark, sx, 0.72, -1.18));
  }

  return bakeBaseAO(merge(p), 0.5, 0.3);
}

function tradePost() {
  const mud = '#c9a878';
  const mudDark = '#a98a61';
  const stone = '#b6a184';
  const wood = '#6b4a2e';
  const woodDark = '#4e3522';
  const rust = '#8a4f35';
  const metal = '#777a78';
  const tarp = '#7c6447';
  const cream = '#dfc9a2';
  const p = [baseDisc(2.65)];

  // Packed pad and a low stone footing.
  p.push(box(4.6, 0.12, 3.8, stone, 0, 0.06, 0));
  p.push(box(4.0, 0.16, 3.2, mudDark, 0, 0.14, 0));

  // Four timber posts and a patched awning.
  for (const sx of [-1.7, 1.7]) {
    for (const sz of [-1.35, 1.35]) {
      p.push(box(0.14, 2.6, 0.14, woodDark, sx, 1.3, sz));
    }
  }
  p.push(box(4.1, 0.09, 3.15, tarp, 0, 2.62, 0, 0.06, 0, 0));
  p.push(box(4.2, 0.05, 0.7, cream, 0, 2.55, 1.5, 0.18, 0, 0));
  p.push(box(1.4, 0.55, 0.06, rust, 0, 2.15, 1.73, 0, 0, 0));

  // Counter, shelves and goods.
  p.push(box(3.6, 0.18, 0.72, wood, 0, 1.02, 0.95));
  p.push(box(3.2, 0.8, 0.5, mud, 0, 0.58, 0.95));
  p.push(box(2.2, 1.25, 0.35, mudDark, 0, 1.55, -1.05));
  p.push(box(2.0, 0.08, 0.45, wood, 0, 1.9, -1.02));
  p.push(box(2.0, 0.08, 0.45, wood, 0, 1.42, -1.02));

  // Crates and barrels on the pad.
  p.push(box(0.72, 0.58, 0.62, '#8a6a42', -1.55, 0.4, -0.55, 0, 0.25, 0));
  p.push(box(0.56, 0.46, 0.5, '#9b7447', -1.35, 0.9, -0.55, 0, -0.18, 0));
  p.push(cyl(0.3, 0.32, 0.82, 8, rust, 1.45, 0.47, -0.45));
  p.push(cyl(0.24, 0.26, 0.66, 8, metal, 1.55, 0.39, 0.35));
  p.push(box(0.5, 0.34, 0.4, '#7c5a36', 0.55, 0.3, -1.35, 0, 0.4, 0));

  // A hanging trader banner.
  p.push(cyl(0.035, 0.035, 1.1, 4, woodDark, -2.05, 1.9, 1.55));
  p.push(box(0.7, 0.42, 0.04, rust, -2.05, 2.35, 1.55, 0, 0.2, 0));

  return bakeBaseAO(merge(p), 0.5, 0.3);
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
    hp: 260,
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
    desc: '+1 scrap / 9s · +1 survivor.',
    geometry: null,
  },
  {
    id: 'warehouse',
    name: 'WAREHOUSE',
    cost: 22,
    radius: 3.15,
    desc: '+120 storage.',
    geometry: null,
  },
  {
    id: 'scavenger',
    name: 'SCAVENGER HUT',
    cost: 16,
    radius: 2.1,
    desc: 'Assign scavengers. 26m.',
    job: { role: 'scavenger', label: 'SCAVENGER', slots: 2, radius: 26 },
    geometry: null,
  },
  {
    id: 'well',
    name: 'WELL WHEEL',
    cost: 20,
    radius: 1.9,
    desc: 'Assign a water carrier.',
    job: { role: 'water', label: 'WATER CARRIER', slots: 1, radius: 2.6, post: { x: 2.2, z: 0.4 }, output: '1 WATER / 4S' },
    geometry: null,
  },
  {
    id: 'farm',
    name: 'FARM',
    cost: 24,
    radius: 3.0,
    desc: 'Assign farmers. Uses water.',
    job: { role: 'farmer', label: 'FARMER', slots: 2, radius: 3.2, post: { x: 0, z: 3.3 }, output: '1 FOOD / 7S', waterUse: '1 / 20S' },
    geometry: null,
  },
  {
    id: 'workshop',
    name: 'WORKSHOP',
    cost: 26,
    radius: 2.4,
    desc: 'Scrap into ammo.',
    job: { role: 'artisan', label: 'ARTISAN', slots: 2, radius: 2.4, post: { x: 0, z: 2.75 } },
    geometry: null,
  },
  {
    id: 'trade',
    name: 'TRADE POST',
    cost: 28,
    hp: 180,
    radius: 2.8,
    desc: 'Caravan stop. Trade goods for scrap.',
    geometry: null,
  },
  {
    id: 'relay',
    name: 'RELAY',
    cost: 40,
    components: 8,
    hp: 520,
    radius: 2.0,
    desc: 'Call home. Hold it.',
    power: { kind: 'consumer', demand: 0.8, priority: 6, attach: 2.8 },
    geometry: null,
  },
  {
    id: 'solar',
    name: 'SOLAR ARRAY',
    cost: 14,
    radius: 1.75,
    desc: 'Generates 2.2 power.',
    power: { kind: 'source', output: 2.2, attach: 1.0 },
    geometry: null,
  },
  {
    id: 'pole',
    name: 'POWER POLE',
    cost: 3,
    radius: 0.8,
    desc: 'Carries power 14m.',
    power: { kind: 'relay', attach: 3.25 },
    geometry: null,
  },
  {
    id: 'battery',
    name: 'BATTERY BANK',
    cost: 16,
    radius: 1.25,
    desc: 'Stores 150 power.',
    power: { kind: 'storage', capacity: 150, attach: 1.0 },
    geometry: null,
  },
  {
    id: 'light',
    name: 'YARD LIGHT',
    cost: 8,
    radius: 0.7,
    desc: 'Burns power at night.',
    power: { kind: 'consumer', demand: 0.5, nightOnly: true, attach: 2.8 },
    geometry: null,
  },
  {
    id: 'turret',
    name: 'VICKERS',
    cost: 26,
    radius: 1.5,
    desc: 'Ghouls + bats only. 1.2 power.',
    power: { kind: 'consumer', demand: 1.2, priority: 5, attach: 1.05 },
    geometry: null,
  },
  {
    id: 'tower',
    name: 'GUARD POST',
    cost: 20,
    hp: 240,
    radius: 1.65,
    desc: 'Assign a gunner. +6m, cover.',
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
  warehouse,
  scavenger: scavengerHut,
  well: wellWheel,
  farm: farmPlot,
  workshop,
  trade: tradePost,
  relay: relayMast,
  solar: solarArray,
  pole: powerPole,
  battery: batteryBank,
  light: yardLight,
  turret: vickersBase,
  tower: guardPost,
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
    this.nextBuildId = 1;
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
    this.turretHeadGeo = vickersHead();

    this.syncStorage();

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
    this.lampMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffd7a0,
      transparent: true,
      opacity: 0.9,
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

  begin(typeId, origin) {
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
    const fwd = origin.heading || 0;
    const spawnDist = Math.max(3.4, def.radius + 1.1);
    this.moveGhost(origin.x + Math.sin(fwd) * spawnDist, origin.z + Math.cos(fwd) * spawnDist, origin);
  }

  cancel() {
    this.selected = null;
    this.placing = false;
    this.canPlace = false;
    this.reason = '';
    this.ghost.visible = false;
    this.ring.visible = false;
  }

  moveGhost(x, z, origin) {
    if (!this.placing) return;
    const gx = Math.round(x / GRID) * GRID;
    const gz = Math.round(z / GRID) * GRID;
    const y = heightAt(gx, gz);
    this.ghost.position.set(gx, y + 0.02, gz);
    this.ring.position.set(gx, y + 0.06, gz);
    this.validate(origin);
  }

  validate(origin) {
    const def = this.selected;
    if (!def) {
      this.canPlace = false;
      return false;
    }
    const gx = this.ghost.position.x;
    const gz = this.ghost.position.z;
    let reason = '';

    if (def.cost > this.state.scrap) reason = 'NOT ENOUGH SCRAP';
    else if (Math.hypot(gx, gz) > CAMP_RADIUS) reason = 'OUTSIDE THE CAMP';
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
  createBuilding(def, x, z, id = null, built = true, progress = 1) {
    const y = heightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const model = new THREE.Group();
    group.add(model);

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
    model.add(mesh);

    mesh.geometry.computeBoundingSphere();
    group.updateMatrixWorld(true);
    const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(group.matrixWorld);

    if (id != null && id >= this.nextBuildId) this.nextBuildId = id + 1;
    const maxHp = def.hp || 60 + def.cost * 8;
    const building = {
      def,
      id: id ?? this.nextBuildId++,
      type: def.id,
      charge: 0,
      hp: maxHp,
      maxHp,
      destroyed: false,
      x,
      z,
      y,
      radius: def.radius,
      group,
      model,
      mesh,
      sphere,
      built,
      buildProgress: built ? 1 : Math.max(0, Math.min(1, progress)),
      buildTime: def.buildTime || 2 + def.cost * 0.16,
      site: null,
      occluded: false,
      cooldown: Math.random() * 0.5,
      phase: Math.random() * 6.28,
      manned: null,
      recipe: def.id === 'workshop' ? 'pistol' : null,
      flame: null,
      glow: null,
    };

    if (def.id === 'warehouse') {
      this.crateGeo ||= new THREE.BoxGeometry(0.46, 0.36, 0.46);
      this.crateMat ||= new THREE.MeshStandardMaterial({
        color: 0x8a6a42,
        roughness: 0.85,
        metalness: 0.05,
      });
      const spots = [
        [-0.75, 0, -1.1], [-0.25, 0, -1.15], [0.25, 0, -1.1], [0.75, 0, -1.05],
        [-0.5, 0.38, -1.1], [0, 0.38, -1.12], [0.5, 0.38, -1.08], [-0.25, 0.76, -1.1],
      ];
      building.crates = [];
      building._crateLevel = -1;
      for (const [cx, cy, cz] of spots) {
        const crate = new THREE.Mesh(this.crateGeo, this.crateMat);
        crate.position.set(cx, 0.22 + cy, cz);
        crate.rotation.y = (cx * 7 + cz * 3) % 0.35;
        crate.castShadow = false;
        crate.receiveShadow = true;
        model.add(crate);
        building.crates.push(crate);
      }
    }

    if (def.id === 'turret') {
      const head = new THREE.Mesh(this.turretHeadGeo, this.buildMat.clone());
      head.castShadow = true;
      head.receiveShadow = true;
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.14, 0);
      headGroup.add(head);
      model.add(headGroup);
      building.head = headGroup;
      building.turretYaw = Math.atan2(-x, -z);
      building.burstLeft = 0;
      building.burstTimer = 0;
      building.cooldown = 0;
      building.mag = 250;
      building.reload = 0;
      building._targets = 0;
      building._clearLine = false;
      building.lampMat = new THREE.MeshBasicMaterial({ color: 0x5a1e1e });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), building.lampMat);
      lamp.position.set(0.3, 1.17, 0.28);
      model.add(lamp);
      building.lamp = lamp;

      // The card opens this ring so "it does nothing" has a visible explanation.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(17.82, 18, 80),
        new THREE.MeshBasicMaterial({
          color: 0xd8a45e,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      ring.visible = false;
      ring.renderOrder = 6;
      model.add(ring);
      building.rangeRing = ring;
    }

    if (def.id === 'light') {
      const glow = new THREE.Sprite(this.lampMat);
      glow.position.set(0, 2.7, 0.02);
      glow.scale.setScalar(1.5);
      glow.visible = false;
      model.add(glow);
      building.lamp = glow;
      const lampLight = new THREE.PointLight(0xffd7a0, 0, 10, 1.7);
      lampLight.position.set(0, 2.6, 0);
      lampLight.castShadow = false;
      model.add(lampLight);
      building.lampLight = lampLight;
    }

    if (def.id === 'campfire') {
      const flame = new THREE.Mesh(this.flameGeo, this.flameMat);
      flame.position.set(0, 0.58, 0);
      model.add(flame);
      building.flame = flame;

      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      core.position.set(0, 0.56, 0.04);
      model.add(core);
      building.core = core;

      const pool = new THREE.Mesh(this.poolGeo, this.poolMat);
      pool.position.set(0, 0.06, 0);
      pool.scale.setScalar(4.4);
      model.add(pool);

      const glow = new THREE.Sprite(this.glowMat);
      glow.position.set(0, 0.95, 0);
      glow.scale.setScalar(3.4);
      model.add(glow);
      building.glow = glow;

      const fireLight = new THREE.PointLight(0xffa45e, 4.5, 9, 1.6);
      fireLight.position.set(0, 1.15, 0);
      fireLight.castShadow = false;
      model.add(fireLight);
      building.fireLight = fireLight;
    }

    if (def.id === 'tower') {
      const glow = new THREE.Sprite(this.towerGlowMat);
      glow.position.set(0.6, 1.5, 0.6);
      glow.scale.setScalar(1.0);
      model.add(glow);
      building.glow = glow;
    }

    const hpWidth = Math.max(1.6, def.radius * 1.5);
    const hpY = def.id === 'pole' ? 4.2 : def.id === 'tower' ? 2.4 : def.id === 'light' ? 3.8 : def.id === 'relay' ? 6.0 : Math.max(4.0, def.radius * 0.7 + 3.2);
    const hpBg = new THREE.Mesh(
      new THREE.BoxGeometry(hpWidth, 0.1, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2b2117, transparent: true, opacity: 0.82, depthWrite: false, depthTest: false }),
    );
    hpBg.position.set(0, hpY, 0);
    hpBg.renderOrder = 20;
    hpBg.visible = false;
    model.add(hpBg);
    const hpFill = new THREE.Mesh(
      new THREE.BoxGeometry(hpWidth, 0.12, 0.32),
      new THREE.MeshBasicMaterial({ color: 0x7fbf6a, toneMapped: false, depthWrite: false, depthTest: false }),
    );
    hpFill.position.set(0, hpY + 0.03, 0);
    hpFill.renderOrder = 21;
    hpFill.visible = false;
    model.add(hpFill);
    building.hpBar = { bg: hpBg, fill: hpFill, width: hpWidth };
    building.smokeTimer = 0;

    building.site = this.makeSite(def);
    group.add(building.site.group);
    building.model.visible = !!building.built;
    building.site.group.visible = !building.built;

    this.scene.add(group);
    this.buildings.push(building);
    return building;
  }

  /** A pad, scaffold and progress bar shown while a building is a construction site. */
  makeSite(def) {
    const radius = def.radius;
    const group = new THREE.Group();
    const padMat = new THREE.MeshLambertMaterial({ color: 0x8f7552 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 0.96, 0.06, 12), padMat);
    pad.position.y = 0.03;
    pad.receiveShadow = true;
    group.add(pad);

    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
    const postGeo = new THREE.BoxGeometry(0.08, 1.15, 0.08);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, wood);
        post.position.set(sx * radius * 0.58, 0.58, sz * radius * 0.58);
        post.castShadow = true;
        group.add(post);
      }
    }
    const beamGeo = new THREE.BoxGeometry(radius * 1.25, 0.08, 0.08);
    for (const sz of [-1, 1]) {
      const beam = new THREE.Mesh(beamGeo, wood);
      beam.position.set(0, 1.12, sz * radius * 0.58);
      group.add(beam);
    }
    // material pile
    const pile = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    pile.position.set(radius * 0.65, 0.11, -radius * 0.2);
    pile.rotation.y = 0.3;
    group.add(pile);

    const width = Math.max(2.0, radius * 1.8);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.12, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x2b2117, transparent: true, opacity: 0.82, depthWrite: false, depthTest: false }),
    );
    back.position.set(0, 1.72, 0);
    back.renderOrder = 20;
    group.add(back);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.14, 0.36),
      new THREE.MeshBasicMaterial({ color: 0xffb066, toneMapped: false, depthWrite: false, depthTest: false }),
    );
    bar.position.set(0, 1.77, 0);
    bar.renderOrder = 21;
    bar.scale.x = 0.001;
    group.add(bar);

    return { group, bar, width };
  }

  damageBuilding(building, amount) {
    if (!building || !building.built || building.destroyed) return false;
    building.hp = Math.max(0, building.hp - amount);
    this.particles.burst(building.x, building.y + 1.2, building.z, '#d8b08a', 5, 1.5);
    this.onBuildingDamage?.(building);
    if (building.hp <= 0) this.destroyBuilding(building);
    return true;
  }

  destroyBuilding(building) {
    if (!building || building.destroyed) return;
    building.destroyed = true;
    building.built = false;
    this.particles.burst(building.x, building.y + 1, building.z, '#b09572', 26, 3.6);
    this.particles.burst(building.x, building.y + 0.6, building.z, '#5a5048', 12, 2.2);
    this.scene.remove(building.group);
    const index = this.buildings.indexOf(building);
    if (index >= 0) this.buildings.splice(index, 1);
    this.syncStorage();
    this.onBuildingDestroyed?.(building);
  }

  /** Turn a site into a finished building. Returns false if it was already done. */
  completeBuilding(b) {
    if (!b || b.built) return false;
    b.built = true;
    b.buildProgress = 1;
    b.model.visible = true;
    if (b.site) b.site.group.visible = false;
    this.syncStorage();
    return true;
  }

  /** Recreate saved buildings without charging scrap or playing placement effects. */
  restore(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const def = BUILDINGS.find((b) => b.id === item.type);
      if (def) {
        const built = item.built !== false;
        const building = this.createBuilding(
          def,
          item.x,
          item.z,
          Number.isFinite(item.id) ? item.id : null,
          built,
          Number.isFinite(item.buildProgress) ? item.buildProgress : 1,
        );
        building.charge = Number.isFinite(item.charge) ? item.charge : 0;
        if (Number.isFinite(item.hp)) building.hp = Math.max(0, Math.min(building.maxHp, item.hp));
        if (def.id === 'workshop') building.recipe = item.recipe || 'pistol';
      }
    }
    this.syncStorage();
  }

  serialize() {
    return {
      buildings: this.buildings.map((b) => ({
        id: b.id,
        type: b.type,
        x: b.x,
        z: b.z,
        charge: b.charge || 0,
        built: b.built !== false,
        buildProgress: b.buildProgress ?? 1,
        hp: b.hp,
        recipe: b.recipe || null,
      })),
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
    const building = this.createBuilding(def, x, z, null, false, 0);
    this.syncStorage();
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

  /** A camp always begins with one lit fire for idle survivors to gather around. */
  seedStartingCamp() {
    if (this.count('campfire') > 0) return null;
    const def = BUILDINGS.find((b) => b.id === 'campfire');
    if (!def) return null;
    const building = this.createBuilding(def, 2.6, 2.6, null, true, 1);
    this.syncStorage();
    return building;
  }

  count(typeId, onlyBuilt = true) {
    let n = 0;
    for (const b of this.buildings) {
      if (b.type === typeId && (!onlyBuilt || b.built)) n++;
    }
    return n;
  }

  /** Base field stock plus one warehouse's capacity per warehouse. */
  storageCap() {
    return 80 + 120 * this.count('warehouse');
  }

  syncStorage() {
    const cap = this.storageCap();
    this.state.scrapCap = cap;
    this.state.waterCap = cap;
    this.state.foodCap = cap;
    if (this.state.scrap > cap) this.state.scrap = cap;
    if (this.state.water > cap) this.state.water = cap;
    if (this.state.food > cap) this.state.food = cap;
    return cap;
  }

  nearestOfType(type, x, z) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.type !== type || !b.built) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bestD) {
        bestD = d;
        best = { x: b.x, z: b.z, radius: b.radius + 1.2 };
      }
    }
    return best;
  }

  isNearCampfire(x, z, radius = 5) {
    for (const b of this.buildings) {
      if (b.type !== 'campfire' || !b.built) continue;
      if (Math.hypot(b.x - x, b.z - z) < radius) return true;
    }
    return false;
  }

  isNearChapel(x, z, radius = 7.5) {
    for (const b of this.buildings) {
      if (b.type !== 'chapel' || !b.built) continue;
      if (Math.hypot(b.x - x, b.z - z) < radius) return true;
    }
    return false;
  }

  isNearHealer(x, z) {
    return this.isNearCampfire(x, z, 5.2) || this.isNearChapel(x, z, 7.5);
  }

  updateTurret(b, dt, enemies, bats = null) {
    if (!b.head || !b.built) return;
    const powered = !!b.powered;
    if (b.lampMat) b.lampMat.color.setHex(powered ? 0x2f7a45 : 0x5a1e1e);
    if (!powered) {
      b.burstLeft = 0;
      b._targets = 0;
      b._clearLine = false;
      return;
    }
    if (b.reload > 0) {
      b.reload = Math.max(0, b.reload - dt);
      if (b.reload === 0) b.mag = 250;
    }
    b.cooldown = Math.max(0, b.cooldown - dt);

    // 360° traverse. The old 220° arc was invisible and clamped at placement; it is the main reason
    // a turret could sit next to a ghoul and never turn. A tripod-mounted Vickers can traverse fully.
    const candidates = [];
    const consider = (e, i, kind) => {
      if (!e.active) return;
      const dx = e.x - b.x;
      const dz = e.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > 18 || d < 0.4) return;
      const yaw = Math.atan2(dx, dz);
      candidates.push({ i, e, kind, d, yaw });
    };
    for (let i = 0; i < enemies.pool.length; i++) consider(enemies.pool[i], i, 'ghoul');
    if (bats) for (let i = 0; i < bats.pool.length; i++) consider(bats.pool[i], i, 'bat');
    b._targets = candidates.length;
    if (!candidates.length) {
      b.burstLeft = 0;
      b._clearLine = false;
      return;
    }
    candidates.sort((a, c) => a.d - c.d);

    // The sight ray must start outside the turret's own footprint: `raycastStatic` treats every
    // building as a cylinder, so a ray from the centre hits the turret itself and every shot is
    // "blocked". Start 1.9 m out, at gun height.
    const sightY = b.y + 1.45;
    const sightOut = 1.9;
    let chosen = null;
    for (const c of candidates) {
      const sx = b.x + Math.sin(c.yaw) * sightOut;
      const sz = b.z + Math.cos(c.yaw) * sightOut;
      const targetY = c.kind === 'bat' ? c.e.y : c.e.y + 0.75;
      if (this.los && !this.los(sx, sightY, sz, c.e.x, targetY, c.e.z)) continue;
      chosen = c;
      break;
    }
    b._clearLine = !!chosen;
    if (!chosen) {
      b.burstLeft = 0;
      return;
    }

    let diff = chosen.yaw - b.turretYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    b.turretYaw += diff * (1 - Math.exp(-10 * dt));
    b.head.rotation.y = b.turretYaw;
    if (Math.abs(diff) > 0.18) return;

    const e = chosen.e;
    const index = chosen.i;
    const mx = b.x + Math.sin(b.turretYaw) * 1.35;
    const mz = b.z + Math.cos(b.turretYaw) * 1.35;
    const my = b.y + 1.14;

    if (b.burstLeft <= 0) {
      if (b.cooldown <= 0 && b.mag > 0 && b.reload <= 0) {
        b.burstLeft = 8;
        b.burstTimer = 0;
        b.cooldown = 1.55;
      }
      return;
    }

    b.burstTimer -= dt;
    if (b.burstTimer > 0) return;
    b.burstTimer += 60 / 450;
    b.burstLeft -= 1;
    b.mag -= 1;
    const killed = chosen.kind === 'bat'
      ? bats.damage(index, 6, b.x, b.z)
      : enemies.damage(index, 6, b.x, b.z);
    const from = new THREE.Vector3(mx, my, mz);
    const to = new THREE.Vector3(e.x, chosen.kind === 'bat' ? e.y : e.y + 0.75, e.z);
    this.fireTracer(from, to);
    this.particles.burst(mx, my, mz, '#ffd9a0', 3, 1.4);
    this.particles.burst(to.x, to.y, to.z, killed ? '#a8c07a' : '#ffbd7a', killed ? 12 : 4, 2.2);
    this.onTurretShot?.(b.x, b.z);
    if (killed && this.onKill) this.onKill(to.x, to.z);
    if (b.mag <= 0) {
      b.burstLeft = 0;
      b.reload = 4;
    }
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

  update(dt, time, player, enemies, bats = null) {
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

    // Vickers turrets: powered, ghoul-only, burst fire.
    if (enemies) {
      for (const b of this.buildings) {
        if (b.type === 'turret' && b.built) this.updateTurret(b, dt, enemies, bats);
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

    // damage bars + smoke
    for (const b of this.buildings) {
      if (!b.hpBar) continue;
      const damaged = b.built && !b.destroyed && b.hp < b.maxHp;
      b.hpBar.bg.visible = damaged;
      b.hpBar.fill.visible = damaged;
      if (!damaged) continue;
      const p = Math.max(0, Math.min(1, b.hp / b.maxHp));
      b.hpBar.fill.scale.x = Math.max(0.001, p);
      b.hpBar.fill.position.x = -b.hpBar.width * 0.5 * (1 - p);
      b.hpBar.fill.material.color.setHex(p > 0.55 ? 0x7fbf6a : p > 0.25 ? 0xe0a24e : 0xd66a4a);
      b.smokeTimer -= dt;
      if (b.hp < b.maxHp * 0.42 && b.smokeTimer <= 0) {
        b.smokeTimer = 0.55;
        this.particles.burst(b.x, b.y + 1.3, b.z, '#5a5048', 2, 1.1);
      }
    }

    // construction progress bars
    for (const b of this.buildings) {
      if (b.built || !b.site?.bar) continue;
      const p = Math.max(0, Math.min(1, b.buildProgress || 0));
      b.site.bar.scale.x = Math.max(0.001, p);
      b.site.bar.position.x = -b.site.width * 0.5 * (1 - p);
    }

    // warehouse fill
    const fill = Math.min(1, this.state.scrap / Math.max(1, this.storageCap()));
    for (const b of this.buildings) {
      if (!b.crates || !b.built) continue;
      const level = Math.round(b.crates.length * fill);
      if (level !== b._crateLevel) {
        b._crateLevel = level;
        for (let i = 0; i < b.crates.length; i++) b.crates[i].visible = i < level;
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
