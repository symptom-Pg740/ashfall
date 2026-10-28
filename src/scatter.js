import { clamp } from './rng.js';

/**
 * Blue-noise-ish points inside a disc: a jittered grid with a minimum-distance check.
 * Deterministic for a given RNG stream. `weight(x,z)` is an acceptance probability, so the
 * distribution follows masks (slope, moisture, roads) instead of a uniform disc.
 */
export function scatterDisc(
  rng,
  { minDist, radius, inner = 0, count, weight = () => 1, filter = null, attempts = 5 },
) {
  const cell = minDist / Math.SQRT2;
  const half = Math.ceil(radius / cell);
  const grid = new Map();
  const points = [];
  const key = (ix, iz) => `${ix},${iz}`;

  const tooClose = (x, z) => {
    const gx = Math.floor(x / cell);
    const gz = Math.floor(z / cell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const p = grid.get(key(gx + dx, gz + dz));
        if (p && Math.hypot(p.x - x, p.z - z) < minDist) return true;
      }
    }
    return false;
  };

  const cells = [];
  for (let iz = -half; iz <= half; iz++) {
    for (let ix = -half; ix <= half; ix++) cells.push(ix, iz);
  }
  // Deterministic shuffle so early cells do not bias one side of the disc.
  for (let i = cells.length - 2; i > 0; i -= 2) {
    const j = Math.floor(rng() * (i / 2 + 1)) * 2;
    const tx = cells[i];
    const tz = cells[i + 1];
    cells[i] = cells[j];
    cells[i + 1] = cells[j + 1];
    cells[j] = tx;
    cells[j + 1] = tz;
  }

  for (let i = 0; i < cells.length && points.length < count; i += 2) {
    const ix = cells[i];
    const iz = cells[i + 1];
    for (let a = 0; a < attempts; a++) {
      const x = (ix + rng()) * cell;
      const z = (iz + rng()) * cell;
      const d = Math.hypot(x, z);
      if (d < inner || d > radius) continue;
      if (tooClose(x, z)) continue;
      const w = clamp(weight(x, z), 0, 1);
      if (w <= 0 || rng() > w) continue;
      if (filter && !filter(x, z)) continue;
      points.push({ x, z });
      grid.set(key(Math.floor(x / cell), Math.floor(z / cell)), { x, z });
      break;
    }
  }
  return points;
}
