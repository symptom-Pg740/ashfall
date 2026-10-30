import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { canAttack } from './actors.js';

/**
 * Command layer: selection, contextual orders and possession.
 *
 * Command mode is the default. A tap on a survivor selects it; the next tap resolves against what is
 * under it (enemy → attack, scrap → gather, ground → move). `TAKE CONTROL` hands the unit to the
 * Player controller; `RELEASE` returns it to the camp brain.
 *
 * The first slice deliberately uses proximity picking in screen space rather than mesh raycasts: the
 * camera is top-down and the units are small, so a generous pixel radius is both cheaper and kinder
 * on touch.
 */

const PICK_UNIT = 36;
const PICK_ENEMY = 32;
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
    this.mode = 'command';
    this.selected = null;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this._leaderHealth = state.health;
    this._leaderMax = state.maxHealth;
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

    this.setMode('command');
  }

  // -------------------------------------------------------------------------
  // units and views
  // -------------------------------------------------------------------------

  get leaderUnit() {
    return {
      isLeader: true,
      key: 'leader',
      name: 'YOU',
      role: 'leader',
      rig: this.player.rig,
      hp: this.state.health,
      maxHp: this.state.maxHealth,
      dead: this.state.dead,
      job: null,
    };
  }

  units() {
    return [this.leaderUnit, ...this.campFolk.people];
  }

  keyOf(unit) {
    if (!unit) return '';
    return unit.isLeader ? 'leader' : `camp:${this.campFolk.people.indexOf(unit)}`;
  }

  unitByKey(key) {
    if (key === 'leader') return this.leaderUnit;
    const index = Number(key.split(':')[1]);
    return this.campFolk.people[index] || null;
  }

  view(unit) {
    if (!unit) return null;
    const armed = unit.isLeader ? this.player.weapon : unit.weapon;
    const possessed = unit === this.player.possessedUnit;
    const live = unit.isLeader || possessed;
    return {
      key: this.keyOf(unit),
      name: unit.isLeader ? 'YOU' : unit.name,
      role: (unit.isLeader ? 'leader' : unit.role || 'scavenger').toUpperCase(),
      hp: live ? this.state.health : unit.hp,
      maxHp: live ? this.state.maxHealth : unit.maxHp,
      status: this.statusOf(unit),
      armed: !!armed,
      dead: unit.isLeader ? this.state.dead : unit.dead,
      canControl: !(unit.isLeader ? this.state.dead : unit.dead),
    };
  }

  statusOf(unit) {
    if (!unit) return 'IDLE';
    if (unit.dead) return 'DOWN';
    if (unit.isLeader || unit === this.player.possessedUnit) {
      return this.mode === 'direct' ? 'UNDER YOUR CONTROL' : 'TAKE CONTROL TO MOVE';
    }
    if (unit.manning) return 'ON THE TOWER';
    const job = unit.job;
    if (!job) {
      if (unit.carry > 0) return `CARRYING ${unit.carry}`;
      return unit.role === 'guard' ? 'ON WATCH' : 'IDLE';
    }
    if (job.type === 'move') return 'MOVING';
    if (job.type === 'attack') return 'ENGAGING';
    if (job.type === 'gather') {
      if (job.phase === 'harvest') return 'SCAVENGING';
      if (job.phase === 'return') return `HAULING ${unit.carry}`;
      return 'TO THE PILE';
    }
    if (job.type === 'man') return 'TO THE TOWER';
    if (job.type === 'repair') {
      return job.building && Math.hypot(job.building.x - unit.rig.group.position.x, job.building.z - unit.rig.group.position.z) < job.building.radius + 1.6
        ? `REPAIRING ${job.building.def.name}`
        : `TO REPAIR ${job.building?.def.name || 'STRUCTURE'}`;
    }
    if (job.type === 'build') {
      return job.building && Math.hypot(job.building.x - unit.rig.group.position.x, job.building.z - unit.rig.group.position.z) < job.building.radius + 1.6
        ? `BUILDING ${job.building.def.name}`
        : `TO THE ${job.building?.def.name || 'SITE'}`;
    }
    return 'WORKING';
  }

  roster() {
    return this.units().map((u) => {
      const v = this.view(u);
      return {
        key: v.key,
        name: v.name,
        initial: v.key === 'leader' ? 'A' : v.name.charAt(0),
        hp: v.hp,
        maxHp: v.maxHp,
        dead: v.dead,
        selected: this.selected ? this.keyOf(this.selected) === v.key : false,
        leader: !!u.isLeader,
      };
    });
  }

  // -------------------------------------------------------------------------
  // mode and selection
  // -------------------------------------------------------------------------

  setMode(mode) {
    this.mode = mode;
    this.ui.setCommanderMode(mode);
    this.ui.setRoster(this.roster());
    if (mode === 'direct') {
      this.ui.hideHint?.();
      this.ring.visible = false;
      this.ui.showUnitCard(this.view(this.selected), mode);
    } else if (this.selected) {
      this.ui.showUnitCard(this.view(this.selected), mode);
      this.ui.setRoster(this.roster());
    }
  }

  select(unit) {
    if (!unit || this.state.dead) return;
    const same = this.selected && this.keyOf(this.selected) === this.keyOf(unit);
    this.selected = unit;
    this._lastKey = this.keyOf(unit);
    this.ui.showUnitCard(this.view(unit), this.mode);
    this.ui.setRoster(this.roster());
    this.ring.visible = this.mode === 'command' && !this.state.dead;
    if (same) this.onFocus(unit);
  }

  selectKey(key) {
    const unit = this.unitByKey(key);
    if (!unit) return;
    this.select(unit);
    this.onFocus(unit);
  }

  clear() {
    if (this.mode === 'direct') this.release();
    this.selected = null;
    this.ring.visible = false;
    this.ui.hideUnitCard();
    this.ui.setRoster(this.roster());
  }

  // -------------------------------------------------------------------------
  // possession
  // -------------------------------------------------------------------------

  toggleControl() {
    if (this.mode === 'direct') {
      this.release();
      return;
    }
    const unit = this.selected;
    if (!unit || this.state.dead) return;
    if (unit.isLeader) {
      this._leaderHealth = this.state.health;
      this._leaderMax = this.state.maxHealth;
      this.setMode('direct');
      this.onFollow();
      this.ui.toast('YOU TAKE POINT');
      return;
    }
    if (unit.dead) {
      this.ui.toast(`${unit.name} IS DOWN`, true);
      return;
    }
    this._leaderHealth = this.state.health;
    this._leaderMax = this.state.maxHealth;
    this.state.health = unit.hp;
    this.state.maxHealth = unit.maxHp;
    if (!this.player.possess(unit)) return;
    unit.possessed = true;
    unit.job = null;
    unit.carry = unit.carry || 0;
    this.selected = unit;
    this.setMode('direct');
    this.onFollow();
    this.ui.updateHUD(this.state);
    this.ui.setAmmo(this.player.ammoState());
    this.ui.toast(`YOU ARE ${unit.name}`);
  }

  release() {
    if (this.mode !== 'direct') return;
    const unit = this.player.possessedUnit;
    const hp = Math.max(1, this.state.health);
    this.player.release();
    if (unit) {
      unit.hp = Math.min(unit.maxHp, hp);
      unit.possessed = false;
    }
    this.state.health = this._leaderHealth;
    this.state.maxHealth = this._leaderMax;
    this.selected = unit || this.leaderUnit;
    this._lastKey = this.keyOf(this.selected);
    this.setMode('command');
    this.onFollow();
    this.ui.updateHUD(this.state);
    this.ui.setAmmo(this.player.ammoState());
    this.ui.toast('COMMAND MODE');
    this.onSave();
  }

  /** Called when the possessed unit's health reaches zero. */
  downPossessed() {
    const unit = this.player.possessedUnit;
    if (!unit) return;
    const name = unit.name;
    this.player.release();
    this.campFolk.down(unit);
    this.state.health = this._leaderHealth;
    this.state.maxHealth = this._leaderMax;
    this.selected = null;
    this.setMode('command');
    this.onFollow();
    this.ui.updateHUD(this.state);
    this.ui.toast(`${name} DOWN`, true);
    this.onSave();
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
      if (unit.isLeader ? this.state.dead : unit.dead) continue;
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
    let best = null;
    let bestD = PICK_UNIT * PICK_UNIT;
    for (const b of this.getSettlement()?.buildings || []) {
      const s = this.screenOf(b.x, b.y + Math.min(1.3, b.radius * 0.6), b.z);
      if (!s.on) continue;
      const dx = s.x - clientX;
      const dy = s.y - clientY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  orderRepair(unit, building) {
    if (!unit || unit.isLeader || unit.dead) {
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
    if (!unit || unit.isLeader || unit.dead) {
      this.ui.hint('SELECT A SURVIVOR TO BUILD', 1800);
      return;
    }
    if (!building || building.built) return;
    this.campFolk.issueJob(unit, { type: 'build', building });
    this.marker(building.x, building.z, '#ffc37a');
    this.ui.toast(`${unit.name} → BUILD ${building.def.name}`);
    this.refresh(unit);
  }

  /** Find the nearest free survivor for a freshly placed site. */
  autoAssignBuild(building) {
    if (!building || building.built) return null;
    let best = null;
    let bestD = Infinity;
    for (const p of this.campFolk.people) {
      if (p.dead || p.possessed || p.manning || p.job) continue;
      const d = Math.hypot(p.rig.group.position.x - building.x, p.rig.group.position.z - building.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) {
      this.ui.hint('NO FREE BUILDER · SELECT A UNIT AND TAP THE SITE', 2600);
      return null;
    }
    this.orderBuild(best, building);
    return best;
  }

  orderManTower(unit, tower) {
    this.campFolk.issueJob(unit, { type: 'man', tower });
    this.marker(tower.x, tower.z, '#8fb0c2');
    this.ui.toast(`${unit.name} → WATCHTOWER`);
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
      this.mode !== 'command' ||
      !this.state.started ||
      this.state.dead ||
      this.ui.buildOpen ||
      this.ui.wardrobeOpen ||
      this.ui.perfOpen
    ) {
      return;
    }
    const unit = this.pickUnit(clientX, clientY);
    if (unit) {
      this.select(unit);
      return;
    }

    if (!this.selected) {
      this.ui.hint('SELECT A SURVIVOR FIRST', 1800);
      return;
    }
    if (this.selected.isLeader) {
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

    const building = this.pickBuilding(clientX, clientY);
    if (building && !building.built) {
      this.orderBuild(this.selected, building);
      return;
    }
    if (building && building.type === 'tower' && building.built) {
      if (this.selected.isLeader) {
        this.ui.hint('TAKE CONTROL OF A SURVIVOR TO MAN THE TOWER', 2000);
        return;
      }
      if (this.selected.manning === building) {
        this.campFolk.releaseTower(this.selected);
        this.marker(building.x, building.z, '#8fb0c2');
        this.ui.toast(`${this.selected.name} → GROUND`);
        this.refresh(this.selected);
        return;
      }
      if (!this.selected.weapon) {
        if (building.hp < building.maxHp) this.orderRepair(this.selected, building);
        else this.ui.toast(`${this.selected.name} IS UNARMED`, true);
        return;
      }
      if (building.manned) {
        this.ui.toast('TOWER ALREADY MANNED', true);
        return;
      }
      this.orderManTower(this.selected, building);
      return;
    }
    if (building && building.built && !building.destroyed && building.hp < building.maxHp) {
      this.orderRepair(this.selected, building);
      return;
    }

    const node = this.scrapField.nearest(ground.x, ground.z, PICK_SCRAP);
    if (node >= 0) {
      this.orderGather(this.selected, node);
      return;
    }
    this.orderMove(this.selected, ground.x, ground.z);
  }

  orderMove(unit, x, z) {
    this.campFolk.issueJob(unit, { type: 'move', x, z });
    this.marker(x, z, '#ffc37a');
    this.ui.toast(`${unit.name} → MOVE`);
    this.refresh(unit);
  }

  orderAttack(unit, target) {
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
      this.ui.showUnitCard(this.view(unit), this.mode);
      this.ui.setRoster(this.roster());
    }
  }

  // -------------------------------------------------------------------------
  // per-frame
  // -------------------------------------------------------------------------

  update(dt) {
    if (this.selected && !this.state.dead) {
      const pos = this.selected.rig.group.position;
      this.ring.position.set(pos.x, heightAt(pos.x, pos.z) + 0.035, pos.z);
      const dead = this.selected.isLeader ? this.state.dead : this.selected.dead;
      this.ring.visible = this.mode === 'command' && !dead;
    } else {
      this.ring.visible = false;
    }

    this._uiTimer += dt;
    if (this._uiTimer < 0.22) return;
    this._uiTimer = 0;
    const unit = this.mode === 'direct' ? this.player.possessedUnit || this.selected : this.selected;
    if (!unit) return;
    const view = this.view(unit);
    const key = `${view.key}|${view.hp}|${view.status}|${this.mode}`;
    if (key === this._lastKey) return;
    this._lastKey = key;
    this.ui.updateUnitCard(view, this.mode);
    if (this.mode === 'command') this.ui.setRoster(this.roster());
  }
}
