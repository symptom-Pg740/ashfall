import * as THREE from 'three';
import { heightAt } from './terrain.js';

export class Input {
  constructor(canvas, camera, callbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.cb = callbacks;
    this.enabled = false;
    this.keys = new Set();
    this.move = { x: 0, z: 0 };
    this.joy = { x: 0, z: 0 };
    this.joyId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.joyRadius = 34;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.dragId = null;

    this.base = document.getElementById('joystick');
    this.knob = document.getElementById('joy-knob');

    this.bindJoystick();
    this.bindKeyboard();
    this.bindWorld();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.resetJoystick();
  }

  resetJoystick() {
    this.joy.x = 0;
    this.joy.z = 0;
    this.joyId = null;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.knob.style.transition = '';
  }

  bindJoystick() {
    const onDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = this.base.getBoundingClientRect();
      this.joyId = e.pointerId;
      this.joyCenter.x = rect.left + rect.width / 2;
      this.joyCenter.y = rect.top + rect.height / 2;
      this.joyRadius = rect.width * 0.34;
      this.knob.style.transition = 'none';
      try {
        this.base.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.updateJoy(e.clientX, e.clientY);
    };
    const onMove = (e) => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      this.updateJoy(e.clientX, e.clientY);
    };
    const onUp = (e) => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      this.resetJoystick();
    };
    this.base.addEventListener('pointerdown', onDown);
    this.base.addEventListener('pointermove', onMove);
    this.base.addEventListener('pointerup', onUp);
    this.base.addEventListener('pointercancel', onUp);
    this.base.addEventListener('lostpointercapture', onUp);
  }

  updateJoy(x, y) {
    let dx = x - this.joyCenter.x;
    let dy = y - this.joyCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > this.joyRadius) {
      dx = (dx / len) * this.joyRadius;
      dy = (dy / len) * this.joyRadius;
    }
    this.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    const nx = dx / this.joyRadius;
    const nz = dy / this.joyRadius;
    const mag = Math.hypot(nx, nz);
    if (mag < 0.14) {
      this.joy.x = 0;
      this.joy.z = 0;
    } else {
      this.joy.x = nx;
      this.joy.z = nz;
    }
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (k === ' ') this.cb.strike?.();
      else if (k === 'e') this.cb.gather?.();
      else if (k === 'b') this.cb.buildToggle?.();
      else if (k === 'p') this.cb.perf?.();
      else if (k === 'f') this.cb.fullscreen?.();
      else if (k === 'escape') this.cb.cancel?.();
      else if (k === 'enter') this.cb.place?.();
      else if (k.length === 1 && k >= '1' && k <= '6') this.cb.buildSelect?.(Number(k) - 1);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  bindWorld() {
    const aim = (clientX, clientY) => {
      if (!this.cb.isPlacing?.()) return;
      const rect = this.canvas.getBoundingClientRect();
      this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.ray.setFromCamera(this.ndc, this.camera);
      const groundY = this.cb.playerY?.() ?? 0;
      this.plane.constant = -groundY;
      if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return;
      const y2 = heightAt(this.hit.x, this.hit.z);
      this.plane.constant = -y2;
      this.ray.ray.intersectPlane(this.plane, this.hit);
      this.cb.aim?.(this.hit.x, this.hit.z);
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.dragId = e.pointerId;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      aim(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' || e.pointerId === this.dragId) {
        aim(e.clientX, e.clientY);
      }
    });
    this.canvas.addEventListener('pointerup', () => {
      this.dragId = null;
    });
    this.canvas.addEventListener('pointercancel', () => {
      this.dragId = null;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update() {
    let x = this.joy.x;
    let z = this.joy.z;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.move.x = x;
    this.move.z = z;
    return this.move;
  }
}
