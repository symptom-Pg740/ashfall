/**
 * The floating building card.
 *
 * Tapping a structure opens one surface for everything about it: HP, build progress, power state,
 * job slots and the contextual actions (BUILD, LINK, REPAIR, MAN/RELEASE). The card is anchored above
 * the building in screen space and refreshes itself while it is open.
 *
 * This is deliberately the only place where building actions live. Contextual taps on the world stay
 * for units, enemies, resources and movement, so the player is never surprised by a wall.
 */
export class BuildingCard {
  constructor({ ui, settlement, power, campFolk, state, getSelected, screenOf, onSave }) {
    this.ui = ui;
    this.settlement = settlement;
    this.power = power;
    this.campFolk = campFolk;
    this.state = state;
    this.getSelected = getSelected || (() => null);
    this.screenOf = screenOf;
    this.onSave = onSave || (() => {});
    this.commander = null;
    this.wire = null;
    this.building = null;
    this._timer = 0;
    this._sig = '';
  }

  get open() {
    return !!this.building;
  }

  openFor(building) {
    if (!building || building.destroyed) return;
    if (this.building === building) {
      this.refresh(true);
      return;
    }
    if (this.building?.rangeRing) this.building.rangeRing.visible = false;
    this.building = building;
    this._sig = '';
    this._timer = 0;
    if (building.rangeRing) building.rangeRing.visible = true;
    this.refresh(true);
  }

  close() {
    if (this.building?.rangeRing) this.building.rangeRing.visible = false;
    this.building = null;
    this._sig = '';
    this.ui.hideBuildingCard();
  }

  update(dt) {
    if (!this.building) return;
    const b = this.building;
    if (b.destroyed || !this.settlement.buildings.includes(b)) {
      this.close();
      return;
    }
    this._timer += dt;
    if (this._timer < 0.14) return;
    this._timer = 0;
    this.refresh(false);
  }

  refresh(force) {
    const b = this.building;
    if (!b) return;
    const view = this.view();
    if (!view) {
      this.close();
      return;
    }
    const sig = JSON.stringify(view);
    if (force || sig !== this._sig) {
      this._sig = sig;
      this.ui.showBuildingCard(view);
    }
    const p = this.screenOf(b.x, b.y + this.anchorHeight(b), b.z);
    if (!p.on || p.x < -40 || p.x > window.innerWidth + 40 || p.y < -80 || p.y > window.innerHeight + 80) {
      this.close();
      return;
    }
    this.ui.placeBuildingCard(p.x, p.y);
  }

  /** The point above a building that the card hangs from, per silhouette. */
  anchorHeight(b) {
    const table = {
      tower: 5.3,
      chapel: 5.1,
      house: 3.7,
      warehouse: 3.0,
      light: 3.6,
      pole: 3.5,
      turret: 2.2,
    };
    return table[b.type] ?? Math.max(2.2, b.radius * 0.7 + 1.2);
  }

  /** The nearest free survivor with the requested ability. */
  nearestFree(armed = false) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.campFolk.people) {
      if (p.dead || p.possessed || p.manning || p.job) continue;
      if (armed && !p.weapon) continue;
      const d = Math.hypot(p.rig.group.position.x - this.building.x, p.rig.group.position.z - this.building.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Prefer the selected survivor when the player selected one before tapping the building. */
  preferred(armed = false) {
    const unit = this.getSelected();
    if (unit && !unit.isLeader && !unit.dead && !unit.possessed) {
      if (!armed || unit.weapon) return unit;
    }
    return this.nearestFree(armed);
  }

  view() {
    const b = this.building;
    if (!b) return null;
    const def = b.def;
    const built = !!b.built && !b.destroyed;
    const pct = Math.round(Math.max(0, Math.min(1, b.buildProgress ?? 1)) * 100);
    const people = this.campFolk.people.filter(
      (p) => !p.dead && (p.manning === b || (p.job && (p.job.building === b || p.job.tower === b))),
    );
    const builder = people.find((p) => p.job?.type === 'build') || null;
    const repairer = people.find((p) => p.job?.type === 'repair') || null;
    const gunner = b.manned || null;

    let powerText = null;
    let ports = 0;
    let maxPorts = 0;
    if (def.power) {
      maxPorts = this.power.maxPorts(b);
      ports = this.power.linksAt(b);
      let stateText;
      if (!built) stateText = 'AWAITING BUILD';
      else if (def.power.kind === 'consumer') stateText = b.powered ? 'POWERED' : ports ? 'NO SOURCE' : 'NOT WIRED';
      else if (def.power.kind === 'source') stateText = b._energized ? 'GENERATING' : ports ? 'LINKED' : 'NOT WIRED';
      else if (def.power.kind === 'storage')
        stateText = `${Math.round(b.charge || 0)} / ${def.power.capacity} STORED`;
      else stateText = b._energized ? 'CARRYING POWER' : ports ? 'LINKED' : 'NOT WIRED';
      powerText = `${stateText} · PORTS ${ports}/${maxPorts}`;
    }

    const rows = [];
    let note = def.desc || '';
    let noteBad = false;

    if (!built) {
      rows.push({ label: 'PROGRESS', value: `${pct}%` });
      rows.push({ label: 'WORKER', value: builder ? builder.name : 'NONE' });
      note = builder
        ? `${builder.name} IS BUILDING THIS SITE`
        : 'NO BUILDER ASSIGNED · SET A SURVIVOR TO BUILDER OR PRESS BUILD';
      noteBad = !builder;
    } else if (def.id === 'turret') {
      const targets = b._targets || 0;
      rows.push({ label: 'TARGETS', value: 'GHOULS ONLY' });
      rows.push({ label: 'IN RANGE', value: String(targets) });
      rows.push({ label: 'BELT', value: b.reload > 0 ? 'RELOADING' : `${Math.max(0, b.mag | 0)} / 250` });
      if (!b.powered) {
        note = 'NO POWER · LINK IT TO A SOLAR ARRAY';
        noteBad = true;
      } else if (b.reload > 0) {
        note = 'RELOADING THE BELT · 4S';
      } else if (targets > 0 && !b._clearLine) {
        note = 'GHOULS IN RANGE · LINE OF FIRE BLOCKED';
        noteBad = true;
      } else if (targets > 0) {
        note = `ENGAGING ${targets} GHOUL${targets === 1 ? '' : 'S'}`;
      } else {
        note = 'WATCHING · IT CANNOT IDENTIFY HUMANS';
      }
    } else if (def.id === 'tower') {
      rows.push({ label: 'GUNNER', value: gunner ? gunner.name : 'NONE' });
      rows.push({ label: 'BONUS', value: '+6M RANGE · 40% COVER' });
      note = gunner ? `${gunner.name} IS ON WATCH` : 'ASSIGN AN ARMED SURVIVOR TO MAN THIS TOWER';
      noteBad = !gunner;
    } else if (def.id === 'warehouse') {
      rows.push({ label: 'STORED', value: `${this.state.scrap} / ${this.state.scrapCap || 0}` });
      note = 'SHARED STORE · SCRAP AND GOODS';
    } else if (repairer) {
      rows.push({ label: 'REPAIR', value: repairer.name });
    }

    const actions = [];
    if (!built) {
      actions.push({ id: 'build', label: builder ? 'BUILDING…' : 'BUILD', kind: 'primary', disabled: !!builder });
    } else {
      if (def.power && ports < maxPorts) {
        actions.push({ id: 'link', label: 'LINK', kind: 'primary' });
      } else if (def.power && maxPorts > 0) {
        actions.push({ id: 'link', label: 'PORTS FULL', kind: 'ghost', disabled: true });
      }
      if (def.id === 'tower') {
        actions.push({ id: 'man', label: gunner ? 'RELEASE' : 'ASSIGN', kind: gunner ? 'ghost' : 'primary' });
      }
      if (b.hp < b.maxHp) {
        actions.push({ id: 'repair', label: 'REPAIR', kind: 'ghost' });
      }
    }

    return {
      kind: def.id,
      name: def.name,
      state: !built ? 'CONSTRUCTION SITE' : b.hp < b.maxHp ? 'DAMAGED' : 'BUILT',
      hp: Math.max(0, Math.round(b.hp)),
      maxHp: Math.round(b.maxHp),
      hpPct: Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100)),
      progress: built ? null : pct,
      power: powerText,
      rows,
      note,
      noteBad,
      actions,
    };
  }

  action(id) {
    const b = this.building;
    if (!b || !this.commander) return;
    if (id === 'link') {
      if (this.wire?.start(b)) this.close();
      return;
    }
    if (id === 'build') {
      const unit = this.preferred(false);
      if (!unit) {
        this.ui.toast('NO FREE SURVIVOR', true);
        return;
      }
      this.commander.orderBuild(unit, b);
      this.refresh(true);
      this.onSave();
      return;
    }
    if (id === 'repair') {
      const unit = this.preferred(false);
      if (!unit) {
        this.ui.toast('NO FREE SURVIVOR', true);
        return;
      }
      this.commander.orderRepair(unit, b);
      this.refresh(true);
      this.onSave();
      return;
    }
    if (id === 'man') {
      if (b.manned) {
        this.campFolk.releaseTower(b.manned);
        this.refresh(true);
        return;
      }
      const unit = this.preferred(true);
      if (!unit) {
        this.ui.toast('NO ARMED SURVIVOR FREE', true);
        return;
      }
      this.commander.orderManTower(unit, b);
      this.refresh(true);
      this.onSave();
    }
  }
}
