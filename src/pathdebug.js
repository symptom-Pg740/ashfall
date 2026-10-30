import * as THREE from 'three';
import { heightAt } from './terrain.js';

/**
 * Debug overlay for unit paths: a line through the current waypoints plus a dot on each corner.
 * Off by default; enable with `?paths=1` or the PATHS switch in the perf panel.
 */
const MAX_VERTS = 4000;
const MAX_POINTS = 600;

export class PathDebug {
  constructor(scene) {
    this.enabled = false;
    this.timer = 0;

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_VERTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x86b3ae,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 8;
    this.lines.visible = false;
    scene.add(this.lines);

    const pgeo = new THREE.BufferGeometry();
    this.pts = new Float32Array(MAX_POINTS * 3);
    pgeo.setAttribute('position', new THREE.BufferAttribute(this.pts, 3).setUsage(THREE.DynamicDrawUsage));
    pgeo.setDrawRange(0, 0);
    this.points = new THREE.Points(
      pgeo,
      new THREE.PointsMaterial({
        color: 0xffcb85,
        size: 0.22,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    this.points.visible = false;
    scene.add(this.points);
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.lines.visible = this.enabled;
    this.points.visible = this.enabled;
  }

  update(people, dt) {
    if (!this.enabled) return;
    this.timer += dt;
    if (this.timer < 0.12) return;
    this.timer = 0;

    let n = 0;
    let pn = 0;
    const pos = this.pos;
    const pts = this.pts;

    for (const person of people) {
      if (person.dead || !person.path || !person.path.length) continue;
      const start = person.rig.group.position;
      let px = start.x;
      let pz = start.z;
      for (const point of person.path) {
        if (n + 6 > pos.length) break;
        pos[n++] = px;
        pos[n++] = heightAt(px, pz) + 0.18;
        pos[n++] = pz;
        pos[n++] = point.x;
        pos[n++] = heightAt(point.x, point.z) + 0.18;
        pos[n++] = point.z;
        if (pn + 3 <= pts.length) {
          pts[pn++] = point.x;
          pts[pn++] = heightAt(point.x, point.z) + 0.24;
          pts[pn++] = point.z;
        }
        px = point.x;
        pz = point.z;
      }
    }

    const lineGeo = this.lines.geometry;
    lineGeo.setDrawRange(0, n / 3);
    lineGeo.attributes.position.needsUpdate = true;
    if (n > 0) lineGeo.computeBoundingSphere();

    const pointGeo = this.points.geometry;
    pointGeo.setDrawRange(0, pn / 3);
    pointGeo.attributes.position.needsUpdate = true;
    if (pn > 0) pointGeo.computeBoundingSphere();
  }
}
