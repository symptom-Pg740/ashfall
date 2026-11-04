import * as THREE from 'three';
import { heightAt } from './terrain.js';

/**
 * Touch and keyboard input for the command layer.
 *
 * There is no joystick and no direct-control movement any more: the canvas owns pan, pinch zoom,
 * placement aiming, wiring and taps. Taps are resolved by the commander (select / order / open a
 * card); drags pan the camera. UI chrome stops its own pointer events before they reach here.
 */
export class Input {
  constructor(canvas, camera, callbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.cb = callbacks;
    this.enabled = false;
    this.keys = new Set();
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.dragId = null;
    this.dragX = 0;
    this.dragY = 0;
    this.pointers = new Map();
    this.pinchDist = 0;
    this.tapStart = null;

    this.bindKeyboard();
    this.bindWorld();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.pointers.clear();
      this.pinchDist = 0;
      this.dragId = null;
      this.tapStart = null;
    }
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (k === 'b') this.cb.buildToggle?.();
      else if (k === 'p') this.cb.perf?.();
      else if (k === 'f') this.cb.fullscreen?.();
      else if (k === 'u') this.cb.units?.();
      else if (k === 'escape') this.cb.cancel?.();
      else if (k === 'enter') this.cb.place?.();
      else if (k === 'tab') {
        e.preventDefault();
        this.cb.cycleUnit?.(e.shiftKey ? -1 : 1);
      } else if (k.length === 1 && k >= '1' && k <= '9') this.cb.buildSelect?.(Number(k) - 1);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
      this.pinchDist = 0;
      this.dragId = null;
      this.tapStart = null;
    });
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
      if (this.cb.isWiring?.()) {
        e.preventDefault();
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        this.cb.wireDown?.(e.clientX, e.clientY);
        return;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (this.pointers.size >= 2) {
        const pts = [...this.pointers.values()];
        this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.dragId = null;
        return;
      }
      this.dragId = e.pointerId;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      this.tapStart = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        moved: false,
      };
      aim(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (this.cb.isWiring?.()) {
        e.preventDefault();
        this.cb.wireMove?.(e.clientX, e.clientY);
        return;
      }
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch zoom. It takes priority over pan/aim.
      if (this.pointers.size >= 2) {
        const pts = [...this.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchDist > 1 && dist > 1) this.cb.zoom?.(dist / this.pinchDist);
        this.pinchDist = dist;
        return;
      }

      // Drag the empty world to pan. While a building is being placed the same gesture aims it.
      if (this.dragId === e.pointerId && !this.cb.isPlacing?.()) {
        const dx = e.clientX - this.dragX;
        const dy = e.clientY - this.dragY;
        if (dx !== 0 || dy !== 0) {
          this.dragX = e.clientX;
          this.dragY = e.clientY;
          this.cb.pan?.(dx, dy);
        }
      }
      if (this.tapStart && this.tapStart.id === e.pointerId) {
        const tx = e.clientX - this.tapStart.x;
        const ty = e.clientY - this.tapStart.y;
        if (tx * tx + ty * ty > 81) this.tapStart.moved = true;
      }
      if (e.pointerType === 'mouse' || e.pointerId === this.dragId) {
        aim(e.clientX, e.clientY);
      }
    });

    const endDrag = (e, aborted = false) => {
      if (this.cb.isWiring?.()) {
        if (aborted) this.cb.wireAbort?.();
        else this.cb.wireUp?.(e.clientX, e.clientY);
        return;
      }
      const wasSingle = this.pointers.size <= 1;
      const tap = this.tapStart;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) {
        this.dragId = null;
      } else if (this.dragId === e.pointerId) {
        const [id, p] = this.pointers.entries().next().value;
        this.dragId = id;
        this.dragX = p.x;
        this.dragY = p.y;
      }
      if (tap && tap.id === e.pointerId && wasSingle && !tap.moved && performance.now() - tap.t < 400) {
        this.tapStart = null;
        this.cb.tap?.(e.clientX, e.clientY);
      } else if (tap && tap.id === e.pointerId) {
        this.tapStart = null;
      }
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
    this.canvas.addEventListener('lostpointercapture', (e) => endDrag(e, true));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
