import * as THREE from 'three';
import {
  NIGHT_DAYLIGHT,
  POWER_SPAN as SPAN,
  WIRE_COST_PER_M,
  canConnect as canConnectNodes,
  linkKey,
  maxPortsForKind,
  solvePower,
} from './core/power.js';

/**
 * The settlement power grid.
 *
 * Buildings with a `def.power` record are nodes: panels source, poles relay, batteries store and
 * consumers draw. Links are stored as pairs of building ids and drawn as sagging wires.
 *
 * Graph validation and allocation live in `core/power.js`; this adapter owns the Three.js wires,
 * scene objects and HUD updates.
 */

const _wireMat = new THREE.MeshBasicMaterial({ color: 0x2a2119 });
const _wireHot = 0x6f5631;

function attachY(b) {
  return b.def.power?.attach ?? 1;
}

export class PowerNetwork {
  constructor({ scene, settlement, state, economy = null, ui }) {
    this.scene = scene;
    this.settlement = settlement;
    this.state = state;
    this.economy = economy;
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
    return this.settlement.buildings.filter((b) => b.def?.power && b.built);
  }

  /** A stable, order-independent key for a pair of buildings. */
  key(a, b) {
    return linkKey(a, b);
  }

  maxPorts(building) {
    return maxPortsForKind(building?.def?.power?.kind);
  }

  linksAt(building) {
    if (!building) return 0;
    let n = 0;
    for (const l of this.links) if (l.a === building.id || l.b === building.id) n++;
    return n;
  }

  /** Plain snapshot handed to the pure rules. */
  _snapshot(building) {
    if (!building) return null;
    return {
      id: building.id,
      x: building.x,
      z: building.z,
      kind: building.def?.power?.kind ?? null,
      built: building.built,
      destroyed: building.destroyed,
      ports: this.maxPorts(building),
      links: this.linksAt(building),
      name: building.def?.name,
    };
  }

  /** Whether a manual wire is legal, and why not. */
  canConnect(a, b) {
    return canConnectNodes(this._snapshot(a), this._snapshot(b), {
      scrap: this.economy ? this.economy.amount('scrap') : this.state.scrap,
      links: this.links,
    });
  }

  /** The best node to wire a newly placed building to, preferring the backbone over consumers. */
  nearestNode(b) {
    let best = null;
    let bestScore = Infinity;
    for (const other of this.nodes()) {
      if (other === b) continue;
      if (this.linksAt(other) >= this.maxPorts(other)) continue;
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
    const kind = building.def.power.kind;
    const within = this.nodes()
      .filter((b) => b !== building)
      .filter((b) => this.linksAt(b) < this.maxPorts(b))
      .map((b) => ({ b, d: Math.hypot(b.x - building.x, b.z - building.z) }))
      .filter((n) => n.d <= SPAN);
    if (!within.length) return false;

    const backbone = within
      .filter((n) => n.b.def.power.kind !== 'consumer')
      .sort((a, c) => a.d - c.d)[0];
    // A new backbone node also picks up the nearest consumer so a pole can bridge a turret that
    // was completed before the pole.
    const consumer = kind === 'consumer'
      ? null
      : within
          .filter((n) => n.b.def.power.kind === 'consumer')
          .sort((a, c) => a.d - c.d)[0];

    let linked = false;
    if (backbone) linked = this.connect(building, backbone.b) || linked;
    if (consumer) linked = this.connect(building, consumer.b) || linked;
    if (!linked && kind === 'consumer') {
      // Last resort: a consumer can wire to a nearby consumer if no backbone exists.
      const any = within.sort((a, c) => a.d - c.d)[0];
      if (any) linked = this.connect(building, any.b) || linked;
    }
    return linked;
  }

  connect(a, b, quiet = false) {
    const check = this.canConnect(a, b);
    if (!check.ok) {
      if (!quiet) this.ui.toast(check.reason, true);
      return false;
    }
    if (!this.economy) return false;
    this.economy.take('scrap', check.cost);
    this.links.push({ a: a.id, b: b.id });
    this.addWire(a, b);
    this.ui.updateHUD(this.state);
    if (!quiet) this.ui.toast(`WIRE · ${check.cost} SCRAP`);
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

  removeBuilding(building) {
    if (!building) return;
    this.links = this.links.filter((l) => l.a !== building.id && l.b !== building.id);
    for (const [key, wire] of [...this.wires.entries()]) {
      if (wire.a === building || wire.b === building) {
        this.removeWire(wire.a, wire.b);
      }
    }
    this.solve(0, 1);
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
    const result = solvePower(
      nodes.map((b) => ({
        id: b.id,
        kind: b.def.power.kind,
        output: b.def.power.output,
        capacity: b.def.power.capacity,
        charge: b.charge,
        demand: b.def.power.demand,
        priority: b.def.power.priority,
        nightOnly: b.def.power.nightOnly,
      })),
      this.links,
      { dt, daylight },
    );

    const byId = new Map(nodes.map((b) => [b.id, b]));
    for (const patch of result.results) {
      const b = byId.get(patch.id);
      if (!b) continue;
      b._energized = patch.energized;
      if (patch.charge !== null) b.charge = patch.charge;
      if (patch.powered !== null) b.powered = patch.powered;
    }

    this._allPowered = result.allPowered;
    this.info = result.info;
  }

  updateVisuals(daylight) {
    const night = daylight < NIGHT_DAYLIGHT;
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
