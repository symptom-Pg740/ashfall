import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { SPAN } from './power.js';

/**
 * Manual power wiring.
 *
 * `PowerNetwork.attach` is only a convenience. This tool is the real interface: pick a power
 * building, hit LINK in its card, and drag (or tap) to a highlighted node. Everything that can go
 * wrong — out of range, no free port, not enough scrap, already linked — is shown before the player
 * releases, so a wire never fails silently.
 *
 * The range ring and node markers live in the scene; the drag line is an SVG overlay in the HUD.
 * The tool consumes canvas pointers while it is active (see `Input`), so a drag cannot pan the
 * camera at the same time.
 */

const PICK_PX = 52;

function groundRing(x, z, radius, color, opacity = 0.4) {
  const points = [];
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const pz = z + Math.sin(a) * radius;
    points.push(new THREE.Vector3(px, heightAt(px, pz) + 0.09, pz));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new THREE.LineLoop(geo, mat);
  line.renderOrder = 6;
  return line;
}

function nodeMarker(x, y, z, radius, color) {
  const points = [];
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    points.push(new THREE.Vector3(x + Math.cos(a) * radius, y + 0.12, z + Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new THREE.LineLoop(geo, mat);
  line.renderOrder = 7;
  return line;
}

export class WireTool {
  constructor({ scene, canvas, getCamera, power, ui, onConnect }) {
    this.scene = scene;
    this.canvas = canvas;
    this.getCamera = getCamera;
    this.power = power;
    this.ui = ui;
    this.onConnect = onConnect || (() => {});
    this.source = null;
    this.target = null;
    this.dragging = false;
    this.pointer = null;
    this.rings = [];
    this.markers = [];
    this._v = new THREE.Vector3();
  }

  get active() {
    return !!this.source;
  }

  screenOf(x, y, z) {
    const cam = this.getCamera();
    this._v.set(x, y, z).project(cam);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (this._v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-this._v.y * 0.5 + 0.5) * rect.height + rect.top,
      on: this._v.z < 1,
    };
  }

  anchor(b) {
    return this.screenOf(b.x, b.y + (b.def?.power?.attach ?? 1) + 0.15, b.z);
  }

  sourceProblem(b) {
    if (!b || b.destroyed) return 'NO STRUCTURE';
    if (!b.def?.power) return 'NOT A POWER NODE';
    if (!b.built) return 'SITE NOT READY';
    const ports = this.power.maxPorts(b);
    if (this.power.linksAt(b) >= ports) return `${b.def.name} PORTS FULL (${ports}/${ports})`;
    return '';
  }

  start(source) {
    if (this.active) this.cancel(true);
    const problem = this.sourceProblem(source);
    if (problem) {
      this.ui.toast(problem, true);
      return false;
    }
    this.source = source;
    this.target = null;
    this.dragging = false;
    this.pointer = null;
    this._buildRings();
    this.ui.showWire(true, source);
    this.ui.updateWireStatus(`DRAG FROM ${source.def.name} TO A HIGHLIGHTED NODE · ${SPAN}M`, 'idle');
    return true;
  }

  _buildRings() {
    const s = this.source;
    const ring = groundRing(s.x, s.z, SPAN, 0x9a8a62, 0.42);
    this.scene.add(ring);
    this.rings.push(ring);

    for (const node of this.power.nodes()) {
      if (node === s) continue;
      const check = this.power.canConnect(s, node);
      const color = check.ok ? 0x9ad07a : 0xd06a5a;
      const r = Math.max(0.75, node.radius + 0.4);
      const marker = nodeMarker(node.x, node.y, node.z, r, color);
      marker.userData.node = node;
      marker.userData.ok = check.ok;
      this.scene.add(marker);
      this.markers.push(marker);
    }
  }

  _clearRings() {
    for (const ring of this.rings) this._dispose(ring);
    for (const marker of this.markers) this._dispose(marker);
    this.rings = [];
    this.markers = [];
  }

  _dispose(line) {
    this.scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  }

  _pick(clientX, clientY) {
    let best = null;
    let bestD = PICK_PX * PICK_PX;
    for (const marker of this.markers) {
      const b = marker.userData.node;
      const p = this.screenOf(b.x, b.y + Math.min(1.4, b.radius * 0.6), b.z);
      if (!p.on) continue;
      const dx = p.x - clientX;
      const dy = p.y - clientY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  _hover(target) {
    if (this.target === target) return;
    this.target = target;
    for (const marker of this.markers) {
      const hovered = marker.userData.node === target;
      marker.material.opacity = hovered ? 1 : target ? 0.32 : 0.6;
    }
    if (!target) {
      this.ui.updateWireStatus(`DRAG FROM ${this.source.def.name} TO A HIGHLIGHTED NODE · ${SPAN}M`, 'idle');
      return;
    }
    const check = this.power.canConnect(this.source, target);
    if (check.ok) {
      this.ui.updateWireStatus(
        `${this.source.def.name} → ${target.def.name} · ${check.distance.toFixed(1)}M · ${check.cost} SCRAP`,
        'ok',
      );
    } else {
      this.ui.updateWireStatus(`${target.def.name} · ${check.reason}`, 'bad');
    }
  }

  pointerDown(clientX, clientY) {
    if (!this.active) return false;
    this.dragging = true;
    this.pointer = { x: clientX, y: clientY };
    const a = this.anchor(this.source);
    this.ui.setWireLine(a.x, a.y, clientX, clientY, null);
    this._hover(this._pick(clientX, clientY));
    return true;
  }

  pointerMove(clientX, clientY) {
    if (!this.active) return false;
    this.pointer = { x: clientX, y: clientY };
    const target = this._pick(clientX, clientY);
    this._hover(target);
    if (this.dragging) {
      const a = this.anchor(this.source);
      const tone = target ? (this.power.canConnect(this.source, target).ok ? 'ok' : 'bad') : null;
      this.ui.setWireLine(a.x, a.y, clientX, clientY, tone);
    }
    return true;
  }

  pointerUp(clientX, clientY) {
    if (!this.active) return false;
    const wasDragging = this.dragging;
    this.dragging = false;
    this.ui.clearWireLine();
    if (!wasDragging) return true;
    const target = this._pick(clientX, clientY);
    this._hover(target);
    if (!target) {
      this.ui.toast('PICK A HIGHLIGHTED NODE', true);
      return true;
    }
    const check = this.power.canConnect(this.source, target);
    if (!check.ok) {
      this.ui.toast(check.reason, true);
      return true;
    }
    const from = this.source;
    if (this.power.connect(from, target)) {
      this.ui.showWire(false);
      this._clearRings();
      this.source = null;
      this.target = null;
      this.pointer = null;
      this.onConnect(from, target, check.cost);
    }
    return true;
  }

  cancel(silent = false) {
    if (!this.active) return;
    this.ui.showWire(false);
    this.ui.clearWireLine();
    this._clearRings();
    this.source = null;
    this.target = null;
    this.dragging = false;
    this.pointer = null;
    if (!silent) this.ui.toast('WIRE CANCELLED');
  }

  /** A cancelled pointer (system gesture, capture loss) drops the drag but keeps wire mode open. */
  abortDrag() {
    this.dragging = false;
    this.pointer = null;
    this.ui.clearWireLine();
  }
}
