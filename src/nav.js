/**
 * A small 1 m navigation grid for settlement movement.
 *
 * The camp is dense enough that direct steering wedges units on houses and rock clusters. The grid
 * is rebuilt only when the number of buildings changes (no destruction yet), then A* on 8
 * neighbours routes around structures. Paths are simplified with a straight-line walkability test.
 */

const BOUNDS = 50;
const CELL = 1;
const SIZE = Math.floor((BOUNDS * 2) / CELL) + 1;
const DIAG = Math.SQRT2;

function cellIndex(x, z) {
  const ix = Math.max(0, Math.min(SIZE - 1, Math.floor((x + BOUNDS) / CELL)));
  const iz = Math.max(0, Math.min(SIZE - 1, Math.floor((z + BOUNDS) / CELL)));
  return iz * SIZE + ix;
}

function cellWorld(i) {
  const ix = i % SIZE;
  const iz = Math.floor(i / SIZE);
  return {
    x: -BOUNDS + (ix + 0.5) * CELL,
    z: -BOUNDS + (iz + 0.5) * CELL,
  };
}

export class NavGrid {
  constructor({ settlement, wasteland }) {
    this.settlement = settlement;
    this.wasteland = wasteland;
    this.count = -1;
    this.blocked = new Uint8Array(SIZE * SIZE);
    this.ensure();
  }

  ensure() {
    const count = this.settlement.buildings.length;
    if (count === this.count) return;
    this.count = count;
    this.blocked.fill(0);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const p = cellWorld(i);
      if (Math.hypot(p.x, p.z) > 52) {
        this.blocked[i] = 1;
        continue;
      }
      for (const b of this.settlement.buildings) {
        if (Math.hypot(b.x - p.x, b.z - p.z) < b.radius + 0.55) {
          this.blocked[i] = 1;
          break;
        }
      }
      if (this.blocked[i]) continue;
      for (const o of this.wasteland.obstacles) {
        if (Math.hypot(o.x - p.x, o.z - p.z) < (o.r || 0.5) + 0.4) {
          this.blocked[i] = 1;
          break;
        }
      }
    }
  }

  blockedAt(x, z) {
    return this.blocked[cellIndex(x, z)] === 1;
  }

  /** Nearest free cell to a world point, searching outward. */
  nearestFree(x, z, maxRing = 8) {
    if (!this.blockedAt(x, z)) return cellIndex(x, z);
    for (let r = 1; r <= maxRing; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = x + dx * CELL;
          const nz = z + dz * CELL;
          if (!this.blockedAt(nx, nz)) return cellIndex(nx, nz);
        }
      }
    }
    return cellIndex(x, z);
  }

  lineFree(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const d = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(d / 0.45));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.blockedAt(x1 + dx * t, z1 + dz * t)) return false;
    }
    return true;
  }

  /** A* path. Returns an array of world waypoints (no start point), or null if unreachable. */
  path(sx, sz, tx, tz) {
    this.ensure();
    const start = this.nearestFree(sx, sz, 3);
    const goal = this.nearestFree(tx, tz, 8);
    if (start === goal) return [{ x: tx, z: tz }];

    const g = new Float32Array(SIZE * SIZE).fill(Infinity);
    const came = new Int32Array(SIZE * SIZE).fill(-1);
    const closed = new Uint8Array(SIZE * SIZE);
    const open = [{ i: start, f: 0 }];
    g[start] = 0;

    const h = (i) => {
      const a = cellWorld(i);
      const dx = Math.abs(a.x - tx);
      const dz = Math.abs(a.z - tz);
      return (dx + dz) + (DIAG - 2) * Math.min(dx, dz);
    };

    let iterations = 0;
    while (open.length && iterations++ < 24000) {
      let best = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
      const current = open.splice(best, 1)[0];
      if (current.i === goal) {
        closed[goal] = 1;
        break;
      }
      if (closed[current.i]) continue;
      closed[current.i] = 1;
      const cx = current.i % SIZE;
      const cz = Math.floor(current.i / SIZE);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
          const ni = nz * SIZE + nx;
          if (this.blocked[ni] || closed[ni]) continue;
          if (dx && dz && (this.blocked[cz * SIZE + nx] || this.blocked[nz * SIZE + cx])) continue;
          const step = dx && dz ? DIAG : 1;
          const ng = g[current.i] + step;
          if (ng >= g[ni]) continue;
          g[ni] = ng;
          came[ni] = current.i;
          open.push({ i: ni, f: ng + h(ni) });
        }
      }
    }
    if (!closed[goal]) return null;

    const cells = [];
    let i = goal;
    while (i !== -1 && i !== start) {
      cells.push(cellWorld(i));
      i = came[i];
      if (cells.length > 6000) break;
    }
    cells.reverse();
    if (!cells.length) return [{ x: tx, z: tz }];

    // Straight-line simplification: drop waypoints that are visible from the last kept point.
    const out = [];
    let fromX = sx;
    let fromZ = sz;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) {
        if (this.lineFree(fromX, fromZ, cells[m].x, cells[m].z)) {
          far = m;
          break;
        }
      }
      out.push(cells[far]);
      fromX = cells[far].x;
      fromZ = cells[far].z;
      k = far + 1;
    }
    return out;
  }
}
