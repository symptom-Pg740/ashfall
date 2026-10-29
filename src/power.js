import * as THREE from 'three';

/**
 * The settlement power grid.
 *
 * Buildings with a `def.power` record are nodes: panels source, poles relay, batteries store and
 * consumers draw. Links are stored as pairs of building ids and drawn as sagging wires.
 *
 * The solver is deliberately small: split the graph into connected components, then for each
 * component allocate this tick's energy (solar × daylight + stored charge) to consumers in priority
 * order. Anything left charges the batteries; a shortfall leaves the lowest-priority consumers dark.
 */

const SPAN = 12;
const WIRE_COST_PER_M = 0.4;

const _wireMat = new THREE.MeshBasicMaterial({ color: 0x2a2119 });
const _wireHot = 0x6f5631;

function attachY(b) {
  return b.def.power?.attach ?? 1;
}

export class PowerNetwork {
  constructor({ scene, settlement, state, ui }) {
    this.scene = scene;
    this.settlement = settlement;
    this.state = state;
    this.ui = ui;
    this.links = [];
    this.wires = new Map();
    this.info = {
      output: 0,
      demand: 0,
      battery: 0,
      capacity: 0,
      powered: false,
      hasGrid: false,
      note: 'NO GRID · SOLAR + POLES',
    };
    this._allPowered = false;
    this._nodes = [];
  }

  nodes() {
    return this.settlement.buildings.filter((b) => b.def?.power);
  }

  /** A point that breaks line of sight to the player, used while reloading. */
  key(a, b) {
    return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  }

  /** The best node to wire a newly placed building to, preferring the backbone over consumers. */
  nearestNode(b) {
    let best = null;
    let bestScore = Infinity;
    for (const other of this.nodes()) {
      if (other === b) continue;
      const d = Math.hypot(other.x - b.x, other.z - b.z);
      if (d > SPAN) continue;
      const kind = other.def.power.kind;
      const score = d + (kind === 'consumer' ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }

  attach(building) {
    if (!building?.def?.power) return false;
    const other = this.nearestNode(building);
    if (!other) return false;
    return this.connect(building, other);
  }

  connect(a, b) {
    if (!a || !b || a === b) return false;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > SPAN) return false;
    const key = this.key(a, b);
    if (this.links.some((l) => this.key(l.a, l.b) === key)) return false;
    const cost = Math.max(1, Math.ceil(d * WIRE_COST_PER_M));
    if (this.state.scrap < cost) {
      this.ui.hint('NOT ENOUGH SCRAP FOR THE WIRE', 1800);
      return false;
    }
    this.state.scrap -= cost;
    this.links.push({ a: a.id, b: b.id });
    this.addWire(a, b);
    this.ui.updateHUD(this.state);
    this.ui.toast(`WIRE · ${cost} SCRAP`);
    return true;
  }

  nodeById(id) {
    return this.settlement.buildings.find((b) => b.id === id) || null;
  }

  addWire(a, b) {
    this.removeWire(a, b);
    const ax = a.x;
    const az = a.z;
    const bx = b.x;
    const bz = b.z;
    const ay = a.y + attachY(a);
    const by = b.y + attachY(b);
    const span = Math.hypot(bx - ax, bz - az);
    const sag = 0.35 + span * 0.045;
    const points = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      points.push(new THREE.Vector3(
        ax + (bx - ax) * t,
        ay + (by - ay) * t - Math.sin(Math.PI * t) * sag,
        az + (bz - az) * t,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 10, 0.025, 4, false);
    const mat = _wireMat.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.wires.set(this.key(a, b), { mesh, mat, a, b });
  }

  removeWire(a, b) {
    const key = this.key(a, b);
    const wire = this.wires.get(key);
    if (!wire) return;
    this.scene.remove(wire.mesh);
    wire.mesh.geometry.dispose();
    wire.mat.dispose();
    this.wires.delete(key);
  }

  clearWires() {
    for (const key of [...this.wires.keys()]) {
      const [a, b] = key.split(':').map(Number);
      this.removeWire({ id: a }, { id: b });
    }
  }

  rebuildWires() {
    this.clearWires();
    for (const link of this.links) {
      const a = this.nodeById(link.a);
      const b = this.nodeById(link.b);
      if (a && b) this.addWire(a, b);
    }
  }

  serialize() {
    return { links: this.links.map((l) => ({ a: l.a, b: l.b })) };
  }

  restore(data) {
    this.links = Array.isArray(data?.links)
      ? data.links.filter((l) => Number.isFinite(l.a) && Number.isFinite(l.b))
      : [];
    this.rebuildWires();
  }

  update(dt, daylight) {
    this.solve(dt, daylight);
    this.updateVisuals(daylight);
    this.ui.setPower(this.info);
  }

  solve(dt, daylight) {
    const nodes = this.nodes();
    this._nodes = nodes;
    const byId = new Map(nodes.map((b) => [b.id, b]));
    const adj = new Map(nodes.map((b) => [b.id, []]));
    for (const l of this.links) {
      if (!byId.has(l.a) || !byId.has(l.b)) continue;
      adj.get(l.a).push(l.b);
      adj.get(l.b).push(l.a);
    }

    let totalOutput = 0;
    let totalDemand = 0;
    let totalCharge = 0;
    let totalCap = 0;
    let activeCount = 0;
    let poweredCount = 0;

    const seen = new Set();
    for (const start of nodes) {
      if (seen.has(start.id)) continue;
      const component = [];
      const stack = [start.id];
      seen.add(start.id);
      while (stack.length) {
        const id = stack.pop();
        const b = byId.get(id);
        if (!b) continue;
        component.push(b);
        for (const nb of adj.get(id) || []) {
          if (!seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        }
      }

      let production = 0;
      let capacity = 0;
      let charge = 0;
      const consumers = [];
      for (const b of component) {
        const p = b.def.power;
        if (p.kind === 'source') production += p.output || 0;
        else if (p.kind === 'storage') capacity += p.capacity || 0;
        else if (p.kind === 'consumer') {
          const active = !p.nightOnly || daylight < 0.25;
          if (active) {
            consumers.push({ b, demand: p.demand || 0, priority: p.priority || 1 });
            activeCount++;
          }
        }
        b._energized = false;
      }
      for (const b of component) {
        if (b.def.power.kind === 'storage') charge += Math.min(b.charge || 0, b.def.power.capacity || 0);
      }

      const output = production * daylight;
      const requested = consumers.reduce((n, c) => n + c.demand, 0);
      consumers.sort((x, y) => y.priority - x.priority);
      let available = output * dt + charge;
      let used = 0;
      for (const c of consumers) {
        const need = c.demand * dt;
        if (available >= need - 1e-9) {
          c.b.powered = true;
          available -= need;
          used += c.demand;
          poweredCount++;
        } else {
          c.b.powered = false;
        }
      }
      const stored = Math.min(capacity, Math.max(0, available));
      // Distribute the component's charge evenly across its batteries.
      const batteries = component.filter((b) => b.def.power.kind === 'storage');
      if (batteries.length) {
        const per = stored / batteries.length;
        for (const b of batteries) b.charge = per;
      }
      const energized = output > 0.01 || stored > 0.01;
      for (const b of component) b._energized = energized;

      totalOutput += output;
      totalDemand += requested;
      totalCharge += stored;
      totalCap += capacity;
    }

    const hasGrid = nodes.length > 0;
    const active = activeCount > 0;
    this._allPowered = active ? poweredCount >= activeCount : true;
    let note;
    if (!hasGrid) note = 'NO GRID · SOLAR + POLES';
    else if (totalOutput < 0.01 && totalCharge < 0.01) {
      const hasSource = nodes.some((b) => b.def.power.kind === 'source');
      note = !hasSource ? 'NO SOURCE · BUILD SOLAR' : daylight < 0.25 ? 'BATTERY EMPTY' : 'NO POWER · CHECK WIRES';
    }
    else if (!active) note = totalCharge > 0.01 ? `IDLE · ${Math.round(totalCharge)} STORED` : 'GRID READY';
    else if (!this._allPowered) note = 'DEFICIT · ADD POWER';
    else note = daylight > 0.3 ? 'SOLAR ONLINE' : 'BATTERY · NIGHT';

    this.info = {
      output: totalOutput,
      demand: totalDemand,
      battery: totalCharge,
      capacity: totalCap,
      powered: active ? this._allPowered : totalOutput > 0.01,
      hasGrid,
      note,
    };
  }

  updateVisuals(daylight) {
    const night = daylight < 0.25;
    for (const b of this.settlement.buildings) {
      if (b.type !== 'light') continue;
      const on = !!b.powered && night;
      if (b.lamp) b.lamp.visible = on;
      if (b.lampLight) b.lampLight.intensity = on ? 3.4 : 0;
    }
    for (const wire of this.wires.values()) {
      const hot = wire.a?._energized || wire.b?._energized;
      wire.mat.color.setHex(hot ? _wireHot : 0x2a2119);
    }
  }
}

export { SPAN, WIRE_COST_PER_M };
