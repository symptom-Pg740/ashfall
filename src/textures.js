import * as THREE from 'three';
import { clamp, smoothstep } from './rng.js';

/** Periodic 2D hash in [0,1]. */
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function wrap(n, period) {
  return ((n % period) + period) % period;
}

/** Value noise that tiles over `period` cells. */
function tileNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = wrap(xi, period);
  const y0 = wrap(yi, period);
  const x1 = wrap(xi + 1, period);
  const y1 = wrap(yi + 1, period);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return (top + (bottom - top) * v) * 2 - 1;
}

function fbmTile(u, v, baseFreq, octaves, seed) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += tileNoise(u * f, v * f, f, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Distance to the nearest cell feature; returns F2-F1, which is 0 on cell boundaries. */
function cellularEdge(u, v, freq, seed) {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 1e9;
  let f2 = 1e9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = ix + ox;
      const gy = iy + oy;
      const wx = wrap(gx, freq);
      const wy = wrap(gy, freq);
      const px = gx + hash2(wx, wy, seed + 2);
      const py = gy + hash2(wx, wy, seed + 3);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return f2 - f1;
}

const KINDS = {
  sand: { size: 256, freq: 5, octaves: 5, crackFreq: 14, crackWidth: 0.05, crack: 0.12, darken: 0.18, normal: 0.5, base: 0.95, contrast: 0.08 },
  rock: { size: 256, freq: 4, octaves: 5, crackFreq: 8, crackWidth: 0.08, crack: 0.35, darken: 0.38, normal: 1.8, base: 0.92, contrast: 0.16 },
  plaster: { size: 256, freq: 8, octaves: 4, crackFreq: 16, crackWidth: 0.04, crack: 0.08, darken: 0.14, normal: 0.4, base: 0.98, contrast: 0.05 },
};

function dataTexture(data, size, srgb) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a tiling grayscale detail set: albedo (near-white, so vertex colours still carry the hue)
 * plus a tangent-space normal map derived from the same height field.
 */
export function makeDetailSet(kind, seed) {
  const cfg = KINDS[kind] || KINDS.sand;
  const size = cfg.size;
  const height = new Float32Array(size * size);
  const crack = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const n = fbmTile(u, v, cfg.freq, cfg.octaves, seed);
      const edge = cellularEdge(u, v, cfg.crackFreq, seed + 17);
      const patch = fbmTile(u, v, 3, 3, seed + 31) * 0.5 + 0.5;
      const mask = smoothstep(0.48, 0.72, patch);
      const cm = (1 - smoothstep(0, cfg.crackWidth, edge)) * mask;
      const i = y * size + x;
      height[i] = clamp(0.5 + n * 0.5 - cm * cfg.crack, 0, 1);
      crack[i] = cm;
    }
  }

  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const k = cfg.normal * 7;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = height[i];
      const v = clamp(cfg.base + (h - 0.5) * cfg.contrast - crack[i] * cfg.darken, 0.35, 1);
      const o = i * 4;
      albedo[o] = albedo[o + 1] = albedo[o + 2] = Math.round(v * 255);
      albedo[o + 3] = 255;

      const xl = (x - 1 + size) % size;
      const xr = (x + 1) % size;
      const yu = (y - 1 + size) % size;
      const yd = (y + 1) % size;
      const dx = height[y * size + xr] - height[y * size + xl];
      const dy = height[yd * size + x] - height[yu * size + x];
      let nx = -dx * k;
      let ny = dy * k;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }

  return {
    map: dataTexture(albedo, size, true),
    normalMap: dataTexture(normal, size, false),
    size,
  };
}

// ---------------------------------------------------------------------------
// Character atlas: skin / cloth / leather / metal in 2x2 regions.
// ---------------------------------------------------------------------------

export const CHAR_REGIONS = {
  skin: [0.01, 0.51, 0.49, 0.99],
  cloth: [0.51, 0.51, 0.99, 0.99],
  leather: [0.01, 0.01, 0.49, 0.49],
  metal: [0.51, 0.01, 0.99, 0.49],
};

export function makeCharacterAtlas() {
  const size = 256;
  const half = size / 2;
  const height = new Float32Array(size * size);
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const surface = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const region = y < half ? (x < half ? 'leather' : 'metal') : x < half ? 'skin' : 'cloth';
      const u = (x % half + 0.5) / half;
      const v = (y % half + 0.5) / half;
      const i = y * size + x;

      let h = 0.5;
      let tone = 0.96;
      let rough = 0.7;
      let metal = 0;
      if (region === 'skin') {
        const pores = 1 - smoothstep(0.0, 0.06, cellularEdge(u, v, 26, 17));
        h = 0.5 + fbmTile(u, v, 10, 4, 31) * 0.18 - pores * 0.08;
        tone = 0.97 + fbmTile(u, v, 4, 3, 37) * 0.03;
        rough = 0.62;
      } else if (region === 'cloth') {
        const weave = Math.sin(u * Math.PI * 48) * Math.sin(v * Math.PI * 48) * 0.5 + 0.5;
        const wrinkle = fbmTile(u, v, 5, 4, 43);
        h = 0.5 + weave * 0.12 + wrinkle * 0.18;
        tone = 0.94 + wrinkle * 0.03;
        rough = 0.94;
      } else if (region === 'leather') {
        const grain = 1 - smoothstep(0.0, 0.1, cellularEdge(u, v, 18, 59));
        h = 0.5 + fbmTile(u, v, 8, 4, 61) * 0.2 - grain * 0.1;
        tone = 0.9 + fbmTile(u, v, 3, 2, 67) * 0.04;
        rough = 0.58;
      } else {
        const scratch = fbmTile(u, v, 24, 3, 71);
        h = 0.5 + scratch * 0.08;
        tone = 0.9 + scratch * 0.05;
        rough = 0.3;
        metal = 0.85;
      }

      height[i] = clamp(h, 0, 1);
      const o = i * 4;
      const val = Math.round(clamp(tone + (h - 0.5) * 0.1, 0, 1) * 255);
      albedo[o] = albedo[o + 1] = albedo[o + 2] = val;
      albedo[o + 3] = 255;
      surface[o] = 0;
      surface[o + 1] = Math.round(rough * 255);
      surface[o + 2] = Math.round(metal * 255);
      surface[o + 3] = 255;
    }
  }

  const k = 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size;
      const xr = (x + 1) % size;
      const yu = (y - 1 + size) % size;
      const yd = (y + 1) % size;
      const dx = height[y * size + xr] - height[y * size + xl];
      const dy = height[yd * size + x] - height[yu * size + x];
      let nx = -dx * k;
      let ny = dy * k;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * size + x) * 4;
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }

  const map = dataTexture(albedo, size, true);
  const normalMap = dataTexture(normal, size, false);
  const surfaceMap = dataTexture(surface, size, false);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping;
  surfaceMap.wrapS = surfaceMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normalMap, surfaceMap };
}
