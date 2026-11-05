import { RECIPES, recipeCap, recipeStock, nextRecipe } from './recipes.js';

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
  constructor({ ui, settlement, power, campFolk, scrapField, state, comms, getSelected, screenOf, onBroadcast, onSave }) {
    this.ui = ui;
    this.settlement = settlement;
    this.power = power;
    this.campFolk = campFolk;
    this.scrapField = scrapField;
    this.state = state;
    this.comms = comms || null;
    this.onBroadcast = onBroadcast || (() => {});
    this.getSelected = getSelected || (() => null);
    this.screenOf = screenOf;
    this.onSave = onSave || (() => {});
    this.commander = null;
    this.wire = null;
    this.trade = null;
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
      tower: 2.3,
      chapel: 5.1,
      house: 3.7,
      warehouse: 3.0,
      light: 3.6,
      pole: 3.5,
      turret: 2.2,
      relay: 5.7,
    };
    return table[b.type] ?? Math.max(2.2, b.radius * 0.7 + 1.2);
  }

  /** The nearest free survivor with the requested ability. */
  nearestFree(armed = false) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.campFolk.people) {
      if (p.dead || p.pending || p.possessed || p.onExpedition || p.manning || p.job) continue;
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
    if (unit && !unit.isLeader && !unit.dead && !unit.pending && !unit.possessed) {
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

    const job = def.job || null;
    const workers = job && built ? this.campFolk.workersOf(b) : [];
    const recipe = def.id === 'workshop' ? RECIPES[b.recipe || 'pistol'] : null;
    const craftCheck = recipe ? this.campFolk.canCraft?.(recipe.id) : null;
    const craftStock = recipe ? recipeStock(this.state, recipe) : 0;
    const craftCap = recipe ? recipeCap(recipe) : 0;
    const scrapFull = this.state.scrap >= (this.state.scrapCap || 80);
    const waterFull = this.state.water >= (this.state.waterCap || 80);
    const foodFull = this.state.food >= (this.state.foodCap || 80);
    const noWater = this.state.water <= 0;
    const slots = [];
    let piles = 0;
    if (job && built) {
      for (let i = 0; i < job.slots; i++) {
        slots.push({ index: i, role: job.label, name: workers[i]?.name || null });
      }
      if (def.id === 'scavenger' && this.scrapField) {
        for (const node of this.scrapField.nodes) {
          if (node.active && Math.hypot(node.x - b.x, node.z - b.z) <= job.radius) piles++;
        }
      }
    }

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
    } else if (job) {
      if (def.id === 'scavenger') {
        rows.push({ label: 'AREA', value: `${job.radius}M` });
        rows.push({ label: 'PILES', value: `${piles} IN AREA` });
      } else if (def.id === 'well') {
        rows.push({ label: 'OUTPUT', value: job.output });
        rows.push({ label: 'WATER', value: `${this.state.water} / ${this.state.waterCap || 0}` });
      } else if (def.id === 'farm') {
        rows.push({ label: 'OUTPUT', value: job.output });
        rows.push({ label: 'WATER USE', value: job.waterUse });
        rows.push({ label: 'WATER', value: `${this.state.water} / ${this.state.waterCap || 0}` });
        rows.push({ label: 'FOOD', value: `${this.state.food} / ${this.state.foodCap || 0}` });
      } else if (def.id === 'workshop' && recipe) {
        rows.push({ label: 'RECIPE', value: recipe.label });
        rows.push({ label: 'OUTPUT', value: `${recipe.amount} ${recipe.unit}` });
        rows.push({ label: 'COST', value: `${recipe.scrap} SCRAP` });
        rows.push({ label: 'STOCK', value: `${craftStock} / ${craftCap}` });
      }
      rows.push({ label: 'WORKERS', value: `${workers.length} / ${job.slots}` });
      const attention = workers.find((p) => p.attention)?.attention;
      const full =
        def.id === 'well'
          ? waterFull
          : def.id === 'farm'
            ? foodFull
            : def.id === 'workshop'
              ? false
              : scrapFull;
      if (!workers.length) {
        note = `NO WORKER · ASSIGN ${job.role === 'artisan' ? 'AN' : 'A'} ${job.label}`;
        noteBad = true;
      } else if (full) {
        note = def.id === 'well' ? 'WATER STORE FULL' : def.id === 'farm' ? 'FOOD STORE FULL' : 'STORAGE FULL · SPEND SCRAP BEFORE HAULING';
        noteBad = true;
      } else if (def.id === 'farm' && noWater) {
        note = 'NO WATER · STAFF THE WELL WHEEL';
        noteBad = true;
      } else if (attention) {
        note = attention;
        noteBad = true;
      } else if (def.id === 'scavenger' && piles === 0) {
        note = `NO SCRAP PILES WITHIN ${job.radius}M`;
        noteBad = true;
      } else if (def.id === 'workshop' && craftCheck && !craftCheck.ok) {
        note =
          craftCheck.reason === 'NO SCRAP'
            ? 'NO SCRAP · SEND SCAVENGERS'
            : craftCheck.reason === 'STORAGE FULL'
              ? 'STOCK FULL · USE AMMO OR SWITCH RECIPE'
              : craftCheck.reason;
        noteBad = true;
      } else {
        note =
          def.id === 'well'
            ? 'DRAWING WATER'
            : def.id === 'farm'
              ? 'TENDING THE PLOT'
              : def.id === 'workshop' && recipe
                ? `CRAFTING ${recipe.label}`
                : `GATHERING WITHIN ${job.radius}M`;
      }
    } else if (def.id === 'relay') {
      const broadcastDay = this.comms?.broadcastDay ?? -1;
      const today = broadcastDay === this.state.day;
      rows.push({ label: 'STATUS', value: b.powered ? 'COMMAND CENTRE' : 'NO POWER' });
      rows.push({ label: 'BROADCAST', value: today ? 'USED TODAY' : b.powered ? 'READY' : 'NEEDS POWER' });
      rows.push({ label: 'COST', value: '10 SCRAP' });
      if (!b.powered) {
        note = 'NO POWER · LINK THE RELAY TO THE GRID';
        noteBad = true;
      } else if (today) {
        note = 'SIGNAL SENT · THE WASTES ANSWER TOMORROW';
      } else {
        note = 'BROADCAST TO ATTRACT A SURVIVOR · NEEDS A FREE BED';
      }
    } else if (def.id === 'tower') {
      rows.push({ label: 'GUNNER', value: gunner ? gunner.name : 'NONE' });
      rows.push({ label: 'BONUS', value: '+6M RANGE · 40% COVER' });
      note = gunner ? `${gunner.name} IS ON WATCH` : 'ASSIGN AN ARMED SURVIVOR TO THIS POST';
      noteBad = !gunner;
    } else if (def.id === 'warehouse') {
      rows.push({ label: 'STORED', value: `${this.state.scrap} / ${this.state.scrapCap || 0}` });
      note = 'SHARED STORE · SCRAP AND GOODS';
    } else if (def.id === 'trade') {
      const t = this.trade;
      if (t?.arrived) {
        rows.push({ label: 'CARAVAN', value: `HERE · ${Math.ceil(t.stay || 0)}S LEFT` });
        rows.push({ label: 'VISIT', value: String(t.visit || 1) });
        note = 'THE CARAVAN IS OPEN FOR TRADE';
      } else {
        rows.push({ label: 'CARAVAN', value: `IN ${Math.ceil(t?.timer || 0)}S` });
        note = 'A CARAVAN ARRIVES PERIODICALLY · SURPLUS WATER AND FOOD BUY SCRAP';
      }
    } else if (repairer) {
      rows.push({ label: 'REPAIR', value: repairer.name });
    }

    const actions = [];
    if (!built) {
      actions.push({ id: 'build', label: builder ? 'BUILDING…' : 'BUILD', kind: 'primary', disabled: !!builder });
      actions.push({ id: 'cancelSite', label: 'CANCEL SITE', kind: 'danger' });
    } else {
      if (def.power && ports < maxPorts) {
        actions.push({ id: 'link', label: 'LINK', kind: 'primary' });
      } else if (def.power && maxPorts > 0) {
        actions.push({ id: 'link', label: 'PORTS FULL', kind: 'ghost', disabled: true });
      }
      if (def.id === 'tower') {
        actions.push({ id: 'man', label: gunner ? 'RELEASE' : 'ASSIGN', kind: gunner ? 'ghost' : 'primary' });
      }
      if (def.id === 'workshop') {
        actions.push({ id: 'recipe', label: 'NEXT RECIPE', kind: 'ghost' });
      }
      if (def.id === 'campfire') {
        actions.push({ id: 'callIdle', label: 'CALL IDLE', kind: 'primary' });
        actions.push({ id: 'callAll', label: 'CALL ALL', kind: 'ghost' });
        actions.push({ id: 'dismiss', label: 'DISMISS', kind: 'ghost' });
      }
      if (def.id === 'trade' && this.trade?.arrived) {
        this.trade.offers.forEach((offer, i) => {
          const ok = this.trade.available(offer);
          actions.push({
            id: `trade:${i}`,
            label: offer.used ? `${offer.name} · SOLD` : offer.label,
            kind: ok ? 'primary' : 'ghost',
            disabled: !ok,
          });
        });
      }
      if (def.id === 'relay') {
        const today = (this.comms?.broadcastDay ?? -1) === this.state.day;
        actions.push({
          id: 'broadcast',
          label: today ? 'BROADCASTED TODAY' : b.powered ? 'BROADCAST' : 'NO POWER',
          kind: b.powered && !today ? 'primary' : 'ghost',
          disabled: !b.powered || today,
        });
      }
      if (b.hp < b.maxHp) {
        actions.push({ id: 'repair', label: 'REPAIR', kind: 'ghost' });
      }
      actions.push({ id: 'demolish', label: 'DEMOLISH', kind: 'danger' });
    }

    return {
      kind: def.id,
      name: def.name,
      state: !built
        ? 'CONSTRUCTION SITE'
        : b.hp < b.maxHp
          ? 'DAMAGED'
          : def.id === 'relay'
            ? b.powered
              ? 'COMMAND CENTRE'
              : 'NO POWER'
          : job
            ? !workers.length
              ? 'NO WORKER'
              : def.id === 'well'
                ? waterFull
                  ? 'STORAGE FULL'
                  : workers.find((p) => p.attention)?.attention || 'WORKING'
                : def.id === 'farm'
                  ? foodFull
                    ? 'STORAGE FULL'
                    : noWater
                      ? 'NO WATER'
                      : workers.find((p) => p.attention)?.attention || 'WORKING'
                  : def.id === 'workshop'
                    ? !craftCheck || craftCheck.ok
                      ? workers.find((p) => p.attention)?.attention || 'WORKING'
                      : craftCheck.reason
                  : scrapFull
                    ? 'STORAGE FULL'
                    : workers.find((p) => p.attention)?.attention || 'WORKING'
            : 'BUILT',
      hp: Math.max(0, Math.round(b.hp)),
      maxHp: Math.round(b.maxHp),
      hpPct: Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100)),
      progress: built ? null : pct,
      power: powerText,
      slots,
      rows,
      note,
      noteBad,
      actions,
    };
  }

  /** Tap a job slot: assign the selected/nearest survivor, or release the worker in it. */
  slot(index) {
    const b = this.building;
    if (!b || !b.def?.job || !b.built) return;
    if (index < 0 || index >= b.def.job.slots) return;
    const workers = this.campFolk.workersOf(b);
    if (workers[index]) {
      const worker = workers[index];
      this.campFolk.releaseWorkplace(worker);
      this.ui.toast(`${worker.name} RELEASED`);
      this.refresh(true);
      this.onSave();
      return;
    }
    const unit = this.pickWorker();
    if (!unit) {
      this.ui.toast('NO FREE SURVIVOR', true);
      return;
    }
    if (!this.campFolk.assignWorkplace(unit, b)) {
      this.ui.toast(`${b.def.name} IS FULL`, true);
      return;
    }
    this.ui.toast(`${unit.name} → ${b.def.name}`);
    this.refresh(true);
    this.onSave();
  }

  /** Selected survivor first, then the nearest unemployed survivor. */
  pickWorker() {
    const sel = this.getSelected();
    if (sel && !sel.isLeader && !sel.dead && !sel.possessed && !sel.manning) return sel;
    let best = null;
    let bestD = Infinity;
    for (const p of this.campFolk.people) {
      if (p.dead || p.pending || p.possessed || p.onExpedition || p.manning || p.home || p.job) continue;
      if (p.role === 'builder') continue;
      const d = Math.hypot(
        p.rig.group.position.x - this.building.x,
        p.rig.group.position.z - this.building.z,
      );
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) return best;
    for (const p of this.campFolk.people) {
      if (p.dead || p.pending || p.possessed || p.manning || p.home || p.job) continue;
      return p;
    }
    return null;
  }

  action(id) {
    const b = this.building;
    if (!b || !this.commander) return;
    if (id.startsWith('trade:')) {
      const index = Number(id.split(':')[1]);
      if (this.trade?.execute(index)) this.refresh(true);
      return;
    }
    if (id === 'broadcast' && b.def.id === 'relay') {
      this.onBroadcast(b);
      this.refresh(true);
      return;
    }
    if (id === 'callIdle' && b.def.id === 'campfire') {
      const n = this.campFolk.callToFire(b, false);
      this.ui.toast(n ? `${n} IDLE SURVIVOR${n === 1 ? '' : 'S'} CALLED TO THE FIRE` : 'NO IDLE SURVIVORS');
      this.refresh(true);
      return;
    }
    if (id === 'callAll' && b.def.id === 'campfire') {
      const n = this.campFolk.callToFire(b, true);
      this.ui.toast(n ? `${n} SURVIVOR${n === 1 ? '' : 'S'} CALLED TO THE FIRE` : 'NO ONE TO CALL');
      this.refresh(true);
      return;
    }
    if (id === 'dismiss' && b.def.id === 'campfire') {
      const n = this.campFolk.dismissFire(b);
      this.ui.toast(n ? `${n} RELEASED` : 'NO ONE AT THE FIRE');
      this.refresh(true);
      return;
    }
    if (id === 'cancelSite' && !b.built) {
      this.close();
      this.settlement.cancelSite(b);
      return;
    }
    if (id === 'demolish' && b.built) {
      const now = performance.now();
      if (this._demolishId === b.id && now - this._demolishAt < 4000) {
        this._demolishId = 0;
        this.close();
        this.settlement.demolish(b);
      } else {
        this._demolishId = b.id;
        this._demolishAt = now;
        this.ui.toast(`TAP DEMOLISH AGAIN TO CONFIRM ${b.def.name}`, true);
        this.refresh(true);
      }
      return;
    }
    if (id === 'recipe' && b.def.id === 'workshop') {
      b.recipe = nextRecipe(b.recipe || 'pistol');
      this.ui.toast(`RECIPE · ${RECIPES[b.recipe].label}`);
      this.refresh(true);
      this.onSave();
      return;
    }
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
