import { clamp, smoothstep, makeRng } from './rng.js';

/** Stable 2D hash in [0,1]. Integer inputs only. */
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Smooth value noise in [-1,1]. */
function valueNoise(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return (top + (bottom - top) * v) * 2 - 1;
}

/**
 * Baked world field. One generation pass produces height, slope, moisture and road masks, sampled
 * bilinearly by terrain, props, player, buildings and AI. Deterministic for a given seed.
 */
export class WorldField {
  constructor(seed, { size = 384, extent = 190 } = {}) {
    this.seed = seed >>> 0;
    this.size = size;
    this.extent = extent;
    this.half = extent / 2;
    this.step = extent / (size - 1);
    this.height = new Float32Array(size * size);
    this.slope = new Float32Array(size * size);
    this.moisture = new Float32Array(size * size);
    this.road = new Float32Array(size * size);
    this.bakeMs = 0;
    this.erosionMs = 0;
    this.bake();
  }

  // ---- noise -------------------------------------------------------------

  noise(x, z, salt = 0) {
    return valueNoise(x, z, this.seed ^ Math.imul(salt | 0, 0x9e3779b9));
  }

  fbm(x, z, octaves = 5, salt = 0, gain = 0.5, lacunarity = 2.02) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fz = z;
    for (let o = 0; o < octaves; o++) {
      sum += this.noise(fx, fz, salt + o * 131) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fz *= lacunarity;
    }
    return sum / norm;
  }

  ridged(x, z, octaves = 4, salt = 0, gain = 0.5, lacunarity = 2.03) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fz = z;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise(fx, fz, salt + o * 197));
      sum += n * n * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fz *= lacunarity;
    }
    return sum / norm;
  }

  // ---- field definitions -------------------------------------------------

  /** 0..1 winding road mask, matching the dirt tracks drawn into the terrain colours. */
  roadAtRaw(x, z) {
    if (Math.abs(z) > 400) return 0;
    const roadX = Math.sin(z * 0.052) * 8 + Math.cos(z * 0.021) * 4;
    const roadZ = 3 + Math.sin(x * 0.055 + 0.5) * 2.5;
    const wobble = Math.sin(z * 0.7 + x * 0.3) * 0.5;
    const crossWobble = Math.sin(x * 0.9 + z * 0.2) * 0.35;
    const main = smoothstep(4.1, 1.3, Math.abs(x - roadX) + wobble);
    const cross = smoothstep(2.7, 0.9, Math.abs(z - roadZ) + crossWobble) * 0.9;
    return clamp(Math.max(main, cross), 0, 1);
  }

  heightAtRaw(x, z) {
    const d = Math.hypot(x, z);
    const relief = smoothstep(8, 26, d);

    // Domain warp: two low-frequency offsets push the fBm out of its grid.
    const wx = x + this.fbm(x * 0.03 + 11.3, z * 0.03 - 7.7, 3, 11) * 1.35;
    const wz = z + this.fbm(x * 0.03 - 5.3, z * 0.03 + 9.9, 3, 23) * 1.35;

    const broad = this.fbm(wx * 0.018 + 17.7, wz * 0.018 - 12.4, 3, 37) * 2.6;
    const base = this.fbm(wx * 0.05, wz * 0.05, 6, 31) * 3.2;
    const dunes = this.fbm(wx * 0.095 - 4.1, wz * 0.095 + 6.3, 4, 41) * 0.95;
    const detail = this.fbm(wx * 0.16, wz * 0.16, 3, 47) * 0.4;
    let h = (broad + base + dunes * relief + detail) * (0.1 + 0.9 * relief);

    // Ridged relief only at the outer ring, so the camp stays buildable.
    const rim = smoothstep(36, 330, d);
    h += this.ridged(wx * 0.022, wz * 0.022, 4, 59) * 9.0 * rim * 0.6;

    // Soft terraces on the rim: mesas/badlands without cliffs inside the camp.
    const terraced = Math.round(h * 1.2) / 1.2;
    h += (terraced - h) * rim * 0.5;

    // Shallow camp basin and a slight road depression.
    h -= (1 - smoothstep(6, 18, d)) * 0.35;
    h -= this.roadAtRaw(x, z) * 0.12;
    return h;
  }

  moistureAtRaw(x, z) {
    const large = this.fbm(x * 0.012 + 5.1, z * 0.012 - 8.4, 3, 71) * 0.5 + 0.5;
    const small = this.fbm(x * 0.06 - 3.7, z * 0.06 + 4.2, 4, 83) * 0.5 + 0.5;
    const basin = 1 - smoothstep(12, 46, Math.hypot(x, z)) * 0.25;
    return clamp((large * 0.65 + small * 0.35) * basin, 0, 1);
  }

  // ---- bake --------------------------------------------------------------

  bake() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const { size, step, half, height, slope, moisture, road } = this;
    for (let iz = 0; iz < size; iz++) {
      const z = -half + iz * step;
      for (let ix = 0; ix < size; ix++) {
        const x = -half + ix * step;
        const i = iz * size + ix;
        height[i] = this.heightAtRaw(x, z);
        moisture[i] = this.moistureAtRaw(x, z);
        road[i] = this.roadAtRaw(x, z);
      }
    }

    const te = typeof performance !== 'undefined' ? performance.now() : 0;
    this.erode(25000, 22);
    this.erosionMs = (typeof performance !== 'undefined' ? performance.now() : 0) - te;

    // Slope from neighbouring height samples (central difference, one-sided at the border).
    const denom = 2 * step;
    for (let iz = 0; iz < size; iz++) {
      const z0 = Math.max(0, iz - 1);
      const z1 = Math.min(size - 1, iz + 1);
      for (let ix = 0; ix < size; ix++) {
        const x0 = Math.max(0, ix - 1);
        const x1 = Math.min(size - 1, ix + 1);
        const dx = height[iz * size + x1] - height[iz * size + x0];
        const dz = height[z1 * size + ix] - height[z0 * size + ix];
        slope[iz * size + ix] = Math.hypot(dx, dz) / denom;
      }
    }
    this.bakeMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  // ---- erosion -----------------------------------------------------------

  /** Cheap droplet hydraulic erosion; runs once on the baked field, outside the camp. */
  erode(droplets, maxLife) {
    const { size, step, half, height } = this;
    const rng = makeRng(this.seed ^ 0x9e3779b9);
    const inertia = 0.05;
    const capacityFactor = 4;
    const minSlope = 0.01;
    const depositRate = 0.3;
    const erodeRate = 0.3;
    const evaporate = 0.02;
    const gravity = 4;
    const radius = 2;

    const sample = (x, y) => {
      const x0 = clamp(Math.floor(x), 0, size - 1);
      const y0 = clamp(Math.floor(y), 0, size - 1);
      const x1 = Math.min(size - 1, x0 + 1);
      const y1 = Math.min(size - 1, y0 + 1);
      const tx = x - x0;
      const ty = y - y0;
      const i00 = y0 * size + x0;
      const i10 = y0 * size + x1;
      const i01 = y1 * size + x0;
      const i11 = y1 * size + x1;
      const a = height[i00] + (height[i10] - height[i00]) * tx;
      const b = height[i01] + (height[i11] - height[i01]) * tx;
      return a + (b - a) * ty;
    };

    const brush = (x, y, amount) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const cells = [];
      let total = 0;
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          const gx = ix + ox;
          const gy = iy + oy;
          if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
          const dist = Math.hypot(ox, oy);
          if (dist > radius) continue;
          const w = 1 - dist / radius;
          if (w <= 0) continue;
          cells.push([gy * size + gx, w]);
          total += w;
        }
      }
      if (!total) return;
      const bounded = clamp(amount, -0.08, 0.08);
      for (const [i, w] of cells) height[i] = clamp(height[i] + (bounded * w) / total, -7, 8);
    };

    for (let d = 0; d < droplets; d++) {
      let x = rng() * (size - 1);
      let y = rng() * (size - 1);
      const startWorldX = -half + x * step;
      const startWorldZ = -half + y * step;
      if (Math.hypot(startWorldX, startWorldZ) < 12) continue;

      let dirX = 0;
      let dirY = 0;
      let speed = 1;
      let water = 1;
      let sediment = 0;

      for (let life = 0; life < maxLife; life++) {
        const oldH = sample(x, y);
        const gx = (sample(x + 1, y) - sample(x - 1, y)) * 0.5;
        const gy = (sample(x, y + 1) - sample(x, y - 1)) * 0.5;

        dirX = dirX * inertia - gx * (1 - inertia);
        dirY = dirY * inertia - gy * (1 - inertia);
        const len = Math.hypot(dirX, dirY);
        if (len < 0.0001) break;
        dirX /= len;
        dirY /= len;
        x += dirX;
        y += dirY;

        if (x < 1 || y < 1 || x >= size - 2 || y >= size - 2) break;
        const wx = -half + x * step;
        const wz = -half + y * step;
        if (Math.hypot(wx, wz) < 10) break;

        const newH = sample(x, y);
        const delta = newH - oldH;

        const capacity = Math.max(-delta, minSlope) * speed * water * capacityFactor;
        if (sediment > capacity || delta > 0) {
          const amount = delta > 0 ? Math.min(delta, sediment) : (sediment - capacity) * depositRate;
          sediment -= amount;
          brush(x, y, amount);
        } else {
          const amount = Math.min((capacity - sediment) * erodeRate, -delta);
          sediment += amount;
          brush(x, y, -amount);
        }

        speed = Math.sqrt(Math.max(0, speed * speed + delta * gravity));
        water *= 1 - evaporate;
      }
    }
  }

  // ---- sampling ----------------------------------------------------------

  sample(arr, x, z) {
    const fx = clamp((x + this.half) / this.step, 0, this.size - 1);
    const fz = clamp((z + this.half) / this.step, 0, this.size - 1);
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(this.size - 1, x0 + 1);
    const z1 = Math.min(this.size - 1, z0 + 1);
    const tx = fx - x0;
    const tz = fz - z0;
    const i00 = z0 * this.size + x0;
    const i10 = z0 * this.size + x1;
    const i01 = z1 * this.size + x0;
    const i11 = z1 * this.size + x1;
    const a = arr[i00] + (arr[i10] - arr[i00]) * tx;
    const b = arr[i01] + (arr[i11] - arr[i01]) * tx;
    return a + (b - a) * tz;
  }

  heightAt(x, z) {
    return this.sample(this.height, x, z);
  }

  slopeAt(x, z) {
    return this.sample(this.slope, x, z);
  }

  moistureAt(x, z) {
    return this.sample(this.moisture, x, z);
  }

  roadAt(x, z) {
    return this.sample(this.road, x, z);
  }
}
