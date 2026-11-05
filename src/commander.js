import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { canAttack } from './actors.js';
import { levelInfo, perkFor } from './levels.js';
import { survivorStatus, deriveActivity, roster } from './features/survivors/index.js';

/**
 * Command layer: selection and contextual orders. There is no direct-control mode any more.
 *
 * A tap on a survivor selects it; the next tap resolves against what is under it (enemy → attack,
 * scrap → gather, building → open its card, ground → move). Selection is proximity picking in screen
 * space rather than mesh raycasts: the camera is top-down and the units are small, so a generous
 * pixel radius is both cheaper and kinder on touch.
 *
 * The clipboard panel is the reliable way to select a unit when the camp is crowded.
 */

const PICK_UNIT = 38;
const PICK_ENEMY = 34;
const PICK_SCRAP = 1.9;

const _v = new THREE.Vector3();

export class Commander {
  constructor({
    canvas,
    getCamera,
    player,
    campFolk,
    getSettlement,
    scrapField,
    registry,
    state,
    ui,
    particles,
    scene,
    onFollow,
    onFocus,
    onSave,
  }) {
    this.canvas = canvas;
    this.getCamera = getCamera;
    this.player = player;
    this.campFolk = campFolk;
    this.getSettlement = getSettlement || (() => null);
    this.scrapField = scrapField;
    this.registry = registry;
    this.state = state;
    this.ui = ui;
    this.particles = particles;
    this.onFollow = onFollow || (() => {});
    this.onFocus = onFocus || (() => {});
    this.onSave = onSave || (() => {});
    this.selected = null;
    this.buildingCard = null;
    this.inCell = false;
    this.cellMembers = null;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this._uiTimer = 0;
    this._lastKey = '';

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffb066,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    scene.add(this.ring);
  }

  // -------------------------------------------------------------------------
  // units and views
  // -------------------------------------------------------------------------

  units() {
    return roster(this.campFolk.people, {
      inCell: this.inCell,
      cellMembers: this.cellMembers,
    });
  }

  keyOf(unit) {
    if (!unit) return '';
    return `camp:${this.campFolk.people.indexOf(unit)}`;
  }

  unitByKey(key) {
    const index = Number(key.split(':')[1]);
    return this.campFolk.people[index] || null;
  }

  view(unit) {
    if (!unit) return null;
    const info = levelInfo(unit.xp || 0);
    const damage = unit.weapon
      ? Math.round(unit.weapon.damage * (unit.damageScale || 1))
      : Math.round(unit.meleeDamage || 15);
    const morale = Math.round(unit.morale ?? 70);
    return {
      key: this.keyOf(unit),
      name: unit.name,
      role: (unit.role || 'survivor').toUpperCase(),
      home: unit.home?.def?.name || null,
      hp: unit.hp,
      maxHp: unit.maxHp,
      status: this.statusOf(unit),
      activity: deriveActivity(unit, unit.rig?.group?.position || null),
      warning: this.warningOf(unit),
      morale,
      moraleFactors: unit.moraleFactors || [],
      armed: !!unit.weapon,
      dead: !!unit.dead,
      onExpedition: !!unit.onExpedition,
      pending: !!unit.pending,
      level: info.level,
      xp: info.xp,
      xpNeed: info.need,
      xpProgress: info.progress,
      perk: perkFor(unit.role, info.level),
      damage,
      rangeText: unit.weapon ? `${Math.round(unit.weapon.range)}m` : 'MELEE',
      speedText: (unit.speed || 0).toFixed(1),
      weaponText: unit.weapon ? unit.weapon.name : 'UNARMED',
      ammoText: unit.weapon ? `${unit.mag}/${unit.weapon.magazine}` : '—',
      carryText: unit.carry ? `${unit.carry} LOAD` : 'EMPTY',
      equipment: { ...unit.rig.equipment },
      canMan: !!unit.weapon && !unit.pending,
      canWork: !unit.pending,
    };
  }

  warningOf(unit) {
    if (!unit || unit.dead) return '';
    if (unit.pending) return 'NEWCOMER · WELCOME OR REJECT';
    if (unit.leaveWarn) return unit.leaveWarn;
    if ((unit.morale ?? 70) <= 25) return 'UNHAPPY';
    if (unit.hunger > 0) return `HUNGRY ${unit.hunger}/2`;
    if (unit.thirst > 0) return `THIRSTY ${unit.thirst}/2`;
    return '';
  }

  enemyView(t) {
    const names = { ghoul: 'GHOUL', raider: 'RAIDER', bat: 'BIO-BAT' };
    return {
      name: names[t.kind] || 'HOSTILE',
      level: t.level || 1,
      hp: t.hp,
      maxHp: t.maxHp || 46,
      damage: t.damage || 0,
      range: t.range || 0,
      speed: t.speed || 0,
    };
  }

  statusOf(unit) {
    const pos = unit?.rig?.group?.position || null;
    return survivorStatus(unit, pos).status;
  }

  /** Compact list data for the old roster callers and the clipboard. */
  roster() {
    return this.units().map((u) => {
      const v = this.view(u);
      return {
        key: v.key,
        name: v.name,
        initial: v.name.charAt(0),
        hp: v.hp,
        maxHp: v.maxHp,
        morale: v.morale,
        role: v.role,
        level: v.level,
        status: v.status,
        warning: v.warning,
        home: v.home,
        dead: v.dead,
        selected: this.selected ? this.keyOf(this.selected) === v.key : false,
      };
    });
  }

  // -------------------------------------------------------------------------
  // selection
  // -------------------------------------------------------------------------

  select(unit) {
    if (!unit || this.state.dead) return;
    this.buildingCard?.close();
    const same = this.selected && this.keyOf(this.selected) === this.keyOf(unit);
    this.selected = unit;
    this._lastKey = this.keyOf(unit);
    this.ui.showUnitCard(this.view(unit));
    this.ring.visible = !this.state.dead;
    if (same) this.onFocus(unit);
  }

  selectKey(key) {
    const unit = this.unitByKey(key);
    if (!unit) return;
    this.select(unit);
    this.onFocus(unit);
  }

  cycle(dir = 1) {
    const units = this.units().filter((u) => !u.dead);
    if (!units.length) return;
    const current = units.indexOf(this.selected);
    const next = units[(current + dir + units.length) % units.length];
    this.select(next);
    this.onFocus(next);
  }

  clear() {
    this.buildingCard?.close();
    this.selected = null;
    this.ring.visible = false;
    this.ui.hideUnitCard();
  }

  /** Clipboard: send a survivor home from their workplace. */
  releasePost(unit) {
    if (!unit?.home) return false;
    this.campFolk.releaseWorkplace(unit);
    this.refresh(unit);
    this.onSave();
    return true;
  }

  // -------------------------------------------------------------------------
  // picking and orders
  // -------------------------------------------------------------------------

  groundPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ndc, this.getCamera());
    this.plane.constant = -this.player.pos.y;
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null;
    const y = heightAt(this.hit.x, this.hit.z);
    this.plane.constant = -y;
    this.ray.ray.intersectPlane(this.plane, this.hit);
    return { x: this.hit.x, z: this.hit.z };
  }

  screenOf(x, y, z) {
    const cam = this.getCamera();
    _v.set(x, y, z).project(cam);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (_v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-_v.y * 0.5 + 0.5) * rect.height + rect.top,
      on: _v.z < 1,
    };
  }

  pickUnit(clientX, clientY) {
    let best = null;
    let bestD = PICK_UNIT * PICK_UNIT;
    for (const unit of this.units()) {
      if (unit.dead) continue;
      const pos = unit.rig.group.position;
      const s = this.screenOf(pos.x, pos.y + 0.95, pos.z);
      if (!s.on) continue;
      const dx = s.x - clientX;
      const dy = s.y - clientY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = unit;
      }
    }
    return best;
  }

  pickBuilding(clientX, clientY) {
    if (this.inCell) return null;
    let best = null;
    let bestD = Infinity;
    for (const b of this.getSettlement()?.buildings || []) {
      const s = this.screenOf(b.x, b.y + Math.min(1.3, b.radius * 0.6), b.z);
      if (!s.on) continue;
      const dx = s.x - clientX;
      const dy = s.y - clientY;
      const d = dx * dx + dy * dy;
      // Small nodes (poles, lights, wall posts) get a smaller touch target, otherwise tapping the
      // ground next to one opens its card by accident.
      const limit = Math.max(16, Math.min(PICK_UNIT, 12 + (b.radius || 1) * 8));
      if (d < limit * limit && d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  orderRepair(unit, building) {
    if (!unit || unit.dead) {
      this.ui.hint('SELECT A SURVIVOR TO REPAIR', 1800);
      return;
    }
    if (!building || !building.built || building.destroyed || building.hp >= building.maxHp) return;
    this.campFolk.issueJob(unit, { type: 'repair', building });
    this.marker(building.x, building.z, '#8fbf7a');
    this.ui.toast(`${unit.name} → REPAIR ${building.def.name}`);
    this.refresh(unit);
  }

  orderBuild(unit, building) {
    if (!unit || unit.dead) {
      this.ui.hint('SELECT A SURVIVOR TO BUILD', 1800);
      return;
    }
    if (!building || building.built) return;
    building.workBlockedUntil = 0;
    this.campFolk.issueJob(unit, { type: 'build', building });
    this.marker(building.x, building.z, '#ffc37a');
    this.ui.toast(`${unit.name} → BUILD ${building.def.name}`);
    this.refresh(unit);
  }

  orderManTower(unit, tower) {
    this.campFolk.issueJob(unit, { type: 'man', tower });
    this.marker(tower.x, tower.z, '#8fb0c2');
    this.ui.toast(`${unit.name} → GUARD POST`);
    this.refresh(unit);
  }

  pickEnemy(clientX, clientY) {
    let best = null;
    let bestD = PICK_ENEMY * PICK_ENEMY;
    this.registry.forEach((t) => {
      if (!t || t.dead || !canAttack('player', t.faction)) return;
      const s = this.screenOf(t.x, t.y + (t.height || 1.6) * 0.5, t.z);
      if (!s.on) return;
      const dx = s.x - clientX;
      const dy = s.y - clientY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    });
    return best;
  }

  tapAt(clientX, clientY) {
    if (
      !this.state.started ||
      this.state.dead ||
      this.ui.buildOpen ||
      this.ui.unitsOpen ||
      this.ui.perfOpen ||
      this.ui.campOpen ||
      this.ui.wireActive
    ) {
      return;
    }
    // A tap outside an open building card dismisses it without also issuing an order.
    if (this.buildingCard?.open) {
      this.buildingCard.close();
      return;
    }

    const unit = this.pickUnit(clientX, clientY);
    if (unit) {
      this.select(unit);
      return;
    }

    const building = this.pickBuilding(clientX, clientY);
    if (building) {
      this.openBuilding(building);
      return;
    }

    if (!this.selected) {
      const enemy = this.pickEnemy(clientX, clientY);
      if (enemy) this.ui.showEnemyCard(this.enemyView(enemy));
      this.ui.hint('SELECT A SURVIVOR FIRST', 1800);
      return;
    }
    if (this.selected.dead) {
      this.ui.toast(`${this.selected.name} IS DOWN`, true);
      return;
    }

    const ground = this.groundPoint(clientX, clientY);
    if (!ground) return;

    const enemy = this.pickEnemy(clientX, clientY);
    if (enemy) {
      this.orderAttack(this.selected, enemy);
      return;
    }

    if (!this.inCell) {
      const node = this.scrapField.nearest(ground.x, ground.z, PICK_SCRAP);
      if (node >= 0) {
        this.orderGather(this.selected, node);
        return;
      }
    }
    this.orderMove(this.selected, ground.x, ground.z);
  }

  openBuilding(building) {
    if (!building || building.destroyed || this.inCell) return;
    if (!this.buildingCard) {
      this.ui.toast('STRUCTURE CARD UNAVAILABLE', true);
      return;
    }
    this.buildingCard.openFor(building);
    this.ring.visible = false;
  }

  orderMove(unit, x, z) {
    this.campFolk.issueJob(unit, { type: 'move', x, z });
    this.marker(x, z, '#ffc37a');
    this.ui.toast(`${unit.name} → MOVE`);
    this.refresh(unit);
  }

  orderAttack(unit, target) {
    this.ui.showEnemyCard(this.enemyView(target));
    if (!unit.weapon) {
      this.ui.toast(`${unit.name} IS UNARMED`, true);
      return;
    }
    this.campFolk.issueJob(unit, { type: 'attack', target });
    this.marker(target.x, target.z, '#e2705a');
    this.ui.toast(`${unit.name} → ENGAGE`);
    this.refresh(unit);
  }

  orderGather(unit, nodeIndex) {
    const node = this.scrapField.nodes[nodeIndex];
    this.campFolk.issueJob(unit, { type: 'gather', node: nodeIndex, phase: 'toNode', timer: 0 });
    if (node) this.marker(node.x, node.z, '#a8c07a');
    this.ui.toast(`${unit.name} → SCAVENGE`);
    this.refresh(unit);
  }

  marker(x, z, color) {
    const y = heightAt(x, z) + 0.08;
    this.particles?.burst(x, y, z, color, 7, 1.5);
  }

  refresh(unit) {
    if (this.selected === unit) {
      this.ui.showUnitCard(this.view(unit));
    }
  }

  // -------------------------------------------------------------------------
  // per-frame
  // -------------------------------------------------------------------------

  update(dt) {
    if (this.selected && !this.state.dead) {
      const pos = this.selected.rig.group.position;
      this.ring.position.set(pos.x, heightAt(pos.x, pos.z) + 0.035, pos.z);
      this.ring.visible = !this.selected.dead;
    } else {
      this.ring.visible = false;
    }

    this._uiTimer += dt;
    if (this._uiTimer < 0.22) return;
    this._uiTimer = 0;
    const unit = this.selected;
    if (!unit) return;
    const view = this.view(unit);
    const key = `${view.key}|${view.hp}|${view.status}|${view.morale}|${view.warning}`;
    if (key === this._lastKey) return;
    this._lastKey = key;
    this.ui.updateUnitCard(view);
  }
}
