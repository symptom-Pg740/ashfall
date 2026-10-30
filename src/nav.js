import { WORLD_RADIUS, PLAY_RADIUS } from './terrain.js';

/**
 * Navigation grid for settlement movement.
 *
 * The map is a 1 m grid over the playable disc. Buildings and wreckage inflate their footprints by
 * the unit radius plus a margin, and a soft clearance field biases paths away from walls instead of
 * scraping along them. A* runs on 8 neighbours with a binary heap and a small clearance penalty;
 * paths are string-pulled into long straight segments. A direct line is returned without searching
 * when the target is already visible.
 *
 * `path()` returns `null` when the target is unreachable. Callers must treat that as `NO PATH` and
 * stop, never beeline into the obstacle.
 */

const BOUNDS = WORLD_RADIUS;
const CELL = 1;
const SIZE = Math.floor((BOUNDS * 2) / CELL) + 1;
const DIAG = Math.SQRT2;
const CLEAR_LIMIT = 3;

class MinHeap {
  constructor(capacity) {
    this.ids = new Int32Array(capacity);
    this.f = new Float32Array(capacity);
    this.n = 0;
  }

  clear() {
    this.n = 0;
  }

  push(id, f) {
    if (this.n >= this.ids.length) return;
    let i = this.n++;
    this.ids[i] = id;
    this.f[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= this.f[i]) break;
      const ti = this.ids[p];
      const tf = this.f[p];
      this.ids[p] = this.ids[i];
      this.f[p] = this.f[i];
      this.ids[i] = ti;
      this.f[i] = tf;
      i = p;
    }
  }

  pop() {
    const top = this.ids[0];
    const n = --this.n;
    if (n <= 0) {
      this.n = 0;
      return top;
    }
    this.ids[0] = this.ids[n];
    this.f[0] = this.f[n];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= n) break;
      const r = l + 1;
      let c = l;
      if (r < n && this.f[r] < this.f[l]) c = r;
      if (this.f[i] <= this.f[c]) break;
      const ti = this.ids[i];
      const tf = this.f[i];
      this.ids[i] = this.ids[c];
      this.f[i] = this.f[c];
      this.ids[c] = ti;
      this.f[c] = tf;
      i = c;
    }
    return top;
  }
}

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
    this.sig = null;
    this.blocked = new Uint8Array(SIZE * SIZE);
    this.clearance = new Uint8Array(SIZE * SIZE);
    this.g = new Float32Array(SIZE * SIZE);
    this.came = new Int32Array(SIZE * SIZE);
    this.closed = new Uint8Array(SIZE * SIZE);
    this.open = new MinHeap(SIZE * SIZE * 2);
    this.ensure();
  }

  signature() {
    let s = '';
    for (const b of this.settlement.buildings) s += `${b.id},`;
    return s;
  }

  ensure() {
    const sig = this.signature();
    if (sig === this.sig) return;
    this.sig = sig;
    const { blocked, clearance } = this;
    blocked.fill(0);

    // The playable disc.
    for (let i = 0; i < SIZE * SIZE; i++) {
      const p = cellWorld(i);
      if (Math.hypot(p.x, p.z) > PLAY_RADIUS) blocked[i] = 1;
    }

    // Inflated footprints. Marking from each object's bounding box is much cheaper than testing
    // every cell against every object, which matters on the larger map.
    const mark = (x, z, r) => {
      const x0 = Math.max(0, Math.floor((x - r + BOUNDS) / CELL));
      const x1 = Math.min(SIZE - 1, Math.ceil((x + r + BOUNDS) / CELL));
      const z0 = Math.max(0, Math.floor((z - r + BOUNDS) / CELL));
      const z1 = Math.min(SIZE - 1, Math.ceil((z + r + BOUNDS) / CELL));
      const rr = r * r;
      for (let iz = z0; iz <= z1; iz++) {
        const wz = -BOUNDS + (iz + 0.5) * CELL;
        for (let ix = x0; ix <= x1; ix++) {
          const wx = -BOUNDS + (ix + 0.5) * CELL;
          const dx = wx - x;
          const dz = wz - z;
          if (dx * dx + dz * dz <= rr) blocked[iz * SIZE + ix] = 1;
        }
      }
    };

    for (const b of this.settlement.buildings) mark(b.x, b.z, b.radius + 0.6);
    for (const o of this.wasteland.obstacles) mark(o.x, o.z, (o.r || 0.5) + 0.45);

    // Soft clearance: distance in cells to the nearest blocked cell, capped at CLEAR_LIMIT.
    clearance.fill(255);
    const queue = new Int32Array(SIZE * SIZE);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (blocked[i]) {
        clearance[i] = 0;
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const i = queue[head++];
      const c = clearance[i];
      if (c >= CLEAR_LIMIT) continue;
      const ix = i % SIZE;
      const iz = Math.floor(i / SIZE);
      const next = c + 1;
      if (ix > 0 && clearance[i - 1] > next) {
        clearance[i - 1] = next;
        queue[tail++] = i - 1;
      }
      if (ix < SIZE - 1 && clearance[i + 1] > next) {
        clearance[i + 1] = next;
        queue[tail++] = i + 1;
      }
      if (iz > 0 && clearance[i - SIZE] > next) {
        clearance[i - SIZE] = next;
        queue[tail++] = i - SIZE;
      }
      if (iz < SIZE - 1 && clearance[i + SIZE] > next) {
        clearance[i + SIZE] = next;
        queue[tail++] = i + SIZE;
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

  clearanceAt(x, z) {
    return this.clearance[cellIndex(x, z)];
  }

  /** A* path. Returns an array of world waypoints (no start point), or null if unreachable. */
  path(sx, sz, tx, tz) {
    if (!Number.isFinite(sx) || !Number.isFinite(sz) || !Number.isFinite(tx) || !Number.isFinite(tz)) {
      return null;
    }
    this.ensure();

    // Open ground is the common case: skip the search entirely.
    if (!this.blockedAt(sx, sz) && !this.blockedAt(tx, tz) && this.lineFree(sx, sz, tx, tz)) {
      return [{ x: tx, z: tz }];
    }

    const start = this.nearestFree(sx, sz, 4);
    const goal = this.nearestFree(tx, tz, 12);
    if (this.blocked[start] || this.blocked[goal]) return null;

    if (start === goal) {
      return this.blockedAt(tx, tz) ? [cellWorld(goal)] : [{ x: tx, z: tz }];
    }

    const { g, came, closed, clearance } = this;
    g.fill(Infinity);
    came.fill(-1);
    closed.fill(0);
    this.open.clear();
    g[start] = 0;
    this.open.push(start, 0);

    const targetCell = cellWorld(goal);
    const heuristic = (i) => {
      const a = cellWorld(i);
      const dx = Math.abs(a.x - targetCell.x);
      const dz = Math.abs(a.z - targetCell.z);
      return dx + dz + (DIAG - 2) * Math.min(dx, dz);
    };

    let found = false;
    let guard = 0;
    const maxIterations = SIZE * SIZE * 2;
    while (this.open.n > 0 && guard++ < maxIterations) {
      const current = this.open.pop();
      if (current === goal) {
        found = true;
        break;
      }
      if (closed[current]) continue;
      closed[current] = 1;
      const cx = current % SIZE;
      const cz = Math.floor(current / SIZE);
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
          const c = clearance[ni];
          const penalty = c <= 1 ? 0.55 : c === 2 ? 0.2 : c === 3 ? 0.06 : 0;
          const ng = g[current] + step + penalty;
          if (ng >= g[ni]) continue;
          g[ni] = ng;
          came[ni] = current;
          this.open.push(ni, ng + heuristic(ni));
        }
      }
    }
    this.open.clear();
    if (!found) return null;

    const cells = [];
    let i = goal;
    while (i !== -1 && i !== start) {
      cells.push(cellWorld(i));
      i = came[i];
      if (cells.length > 20000) return null;
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

    // Finish on the exact target when the target cell itself is walkable.
    const last = out[out.length - 1];
    if (last && !this.blockedAt(tx, tz) && this.lineFree(last.x, last.z, tx, tz)) {
      if (Math.hypot(tx - last.x, tz - last.z) > 0.05) out.push({ x: tx, z: tz });
    }
    return out;
  }
}
