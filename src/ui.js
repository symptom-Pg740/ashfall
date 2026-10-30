import { BUILDINGS } from './settlement.js';
import { clearSave } from './save.js';
import { SLOTS, itemLabel } from './wardrobe.js';

export class UI {
  constructor() {
    this.cb = {};
    this.last = { scrap: -1, water: -1, kills: -1, health: -1, canGather: null, canPlace: null, reason: '' };
    this.lastStrikeCooling = null;
    this.toastTimer = 0;
    this.hintTimer = 0;
    this.perfOpen = false;
    this.buildOpen = false;
    this.wardrobeOpen = false;
    this.buildingCardOpen = false;
    this.wireActive = false;
    this.perfLastHistory = 0;
    this.lastAmmo = '';
    this.lastArmed = null;
    this.lastMag = 0;
    this.lastReserve = Infinity;
    this.lastReloading = false;
    this.lastRaid = '';
    this.hitTimer = 0;
    this.commanderMode = 'command';
    this._rosterKey = '';
    this.toggleState = { adaptive: true, fog: true, grass: true, embers: true, shadows: true, ortho: true, sound: true };
    this.orientationLock = null;
    this.compassDrag = null;
    this.compassAngle = 0;

    this.el = {
      scrap: document.getElementById('hud-scrap'),
      water: document.getElementById('hud-water'),
      kills: document.getElementById('hud-kills'),
      hpFill: document.getElementById('hp-fill'),
      hpText: document.getElementById('hp-text'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
      flash: document.getElementById('flash'),
      death: document.getElementById('death-screen'),
      raidResult: document.getElementById('raid-result'),
      raidResultTitle: document.getElementById('raid-result-title'),
      raidResultSub: document.getElementById('raid-result-sub'),
      gather: document.getElementById('gather-btn'),
      build: document.getElementById('build-btn'),
      strike: document.getElementById('strike-btn'),
      buildBar: document.getElementById('build-bar'),
      buildList: document.getElementById('build-list'),
      buildClose: document.getElementById('build-close'),
      buildScrap: document.getElementById('build-scrap'),
      placeBar: document.getElementById('place-bar'),
      placeName: document.getElementById('place-name'),
      placeStatus: document.getElementById('place-status'),
      placeConfirm: document.getElementById('place-confirm'),
      placeCancel: document.getElementById('place-cancel'),
      perfBtn: document.getElementById('perf-btn'),
      outfitBtn: document.getElementById('outfit-btn'),
      wardrobePanel: document.getElementById('wardrobe-panel'),
      wardrobeList: document.getElementById('wardrobe-list'),
      armory: document.getElementById('armory'),
      armoryWeapon: document.getElementById('armory-weapon'),
      armoryAmmo: document.getElementById('armory-ammo'),
      armoryUpgrades: document.getElementById('armory-upgrades'),
      armoryScrap: document.getElementById('armory-scrap'),
      rosterBar: document.getElementById('roster-bar'),
      roster: document.getElementById('roster'),
      unitCard: document.getElementById('unit-card'),
      unitName: document.getElementById('unit-name'),
      unitRole: document.getElementById('unit-role'),
      unitHp: document.getElementById('unit-hp'),
      unitHpFill: document.getElementById('unit-hp-fill'),
      unitStatus: document.getElementById('unit-status'),
      unitControl: document.getElementById('unit-control'),
      gridPanel: document.getElementById('grid-panel'),
      gridDay: document.getElementById('grid-day'),
      gridClock: document.getElementById('grid-clock'),
      gridPower: document.getElementById('grid-power'),
      gridBarFill: document.getElementById('grid-bar-fill'),
      gridNote: document.getElementById('grid-note'),
      buildingCard: document.getElementById('building-card'),
      bcardName: document.getElementById('bcard-name'),
      bcardState: document.getElementById('bcard-state'),
      bcardHp: document.getElementById('bcard-hp'),
      bcardHpFill: document.getElementById('bcard-hp-fill'),
      bcardPower: document.getElementById('bcard-power'),
      bcardNote: document.getElementById('bcard-note'),
      bcardRows: document.getElementById('bcard-rows'),
      bcardProgress: document.getElementById('bcard-progress'),
      bcardProgressFill: document.getElementById('bcard-progress-fill'),
      bcardActions: document.getElementById('bcard-actions'),
      bcardClose: document.getElementById('bcard-close'),
      wireHud: document.getElementById('wire-hud'),
      wireStatus: document.getElementById('wire-status'),
      wireLayer: document.getElementById('wire-layer'),
      wireLine: document.getElementById('wire-line'),
      wireCancel: document.getElementById('wire-cancel'),
      unitClose: document.getElementById('unit-close'),
      wardrobeClose: document.getElementById('wardrobe-close'),
      ammo: document.getElementById('hud-ammo'),
      raidBanner: document.getElementById('raid-banner'),
      raidCount: document.getElementById('raid-count'),
      raidKind: document.getElementById('raid-kind'),
      ammoChip: document.getElementById('ammo-chip'),
      hitMarker: document.getElementById('hit-marker'),
      pSeed: document.getElementById('p-seed'),
      seedReroll: document.getElementById('seed-reroll'),
      saveReset: document.getElementById('save-reset'),
      fsBtn: document.getElementById('fs-btn'),
      orientBtn: document.getElementById('orient-btn'),
      compass: document.getElementById('compass'),
      compassNeedle: document.getElementById('compass-needle'),
      compassHome: document.getElementById('compass-home'),
      perfPanel: document.getElementById('perf-panel'),
      perfClose: document.getElementById('perf-close'),
      graph: document.getElementById('fps-graph'),
      start: document.getElementById('start-screen'),
      startBtn: document.getElementById('start-btn'),
      newRun: document.getElementById('new-run-btn'),
      pFps: document.getElementById('p-fps'),
      pMs: document.getElementById('p-ms'),
      pMin: document.getElementById('p-min'),
      pDraws: document.getElementById('p-draws'),
      pTris: document.getElementById('p-tris'),
      pRes: document.getElementById('p-res'),
      pDpr: document.getElementById('p-dpr'),
      pGhouls: document.getElementById('p-ghouls'),
      pGpu: document.getElementById('p-gpu'),
      qualitySeg: document.getElementById('quality-seg'),
      toggles: document.querySelectorAll('[data-toggle]'),
      stress: document.querySelectorAll('[data-stress]'),
    };

    this.gctx = this.el.graph.getContext('2d');
    this.buildCards();
    this.bind();
  }

  on(name, fn) {
    this.cb[name] = fn;
    return this;
  }

  buildCards() {
    this.el.buildList.innerHTML = '';
    BUILDINGS.forEach((def, i) => {
      const card = document.createElement('button');
      card.className = 'build-card';
      card.dataset.type = def.id;
      card.dataset.cost = String(def.cost);
      card.innerHTML = `
        <span class="bc-top"><span class="bc-name">${def.name}</span><span class="bc-cost">${def.cost} ⬡</span></span>
        <span class="bc-desc">${def.desc}</span>
        <span class="bc-key">${i + 1}</span>
      `;
      card.addEventListener('click', (e) => {
        e.preventDefault();
        this.cb.buildSelect?.(def.id);
      });
      this.el.buildList.appendChild(card);
    });
  }

  bind() {
    const start = (e) => {
      e.preventDefault();
      this.start();
    };
    this.el.startBtn.addEventListener('pointerdown', start);
    this.el.startBtn.addEventListener('click', start);
    this.el.newRun.addEventListener('click', (e) => {
      e.preventDefault();
      clearSave();
      window.location.reload();
    });

    this.el.build.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cb.buildToggle?.();
    });
    this.el.buildClose.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cb.buildClose?.();
    });
    this.el.placeConfirm.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.el.placeConfirm.disabled) this.cb.place?.();
    });
    this.el.placeCancel.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cb.cancelPlace?.();
    });

    this.el.strike.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cb.strike?.();
    });
    this.el.gather.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cb.gather?.();
    });

    this.el.perfBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.togglePerf();
    });
    this.el.outfitBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleWardrobe();
    });
    this.el.unitControl?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.unitControl?.();
    });
    this.el.unitClose?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.unitClose?.();
    });
    this.el.bcardClose?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.buildingClose?.();
    });
    this.el.wireCancel?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.wireCancel?.();
    });
    this.el.wardrobeClose.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleWardrobe(false);
    });
    this.el.fsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleFullscreenGesture();
    });
    this.el.seedReroll.addEventListener('click', (e) => {
      e.preventDefault();
      clearSave();
      const next = (Math.random() * 0xffffffff) >>> 0;
      const url = new URL(window.location.href);
      url.searchParams.set('seed', next.toString(16).padStart(8, '0'));
      window.location.href = url.toString();
    });
    this.el.saveReset.addEventListener('click', (e) => {
      e.preventDefault();
      clearSave();
      window.location.reload();
    });
    this.el.orientBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleOrientation();
    });
    this.bindCompass();
    const syncFs = () => this.syncFullscreen();
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    this.el.perfClose.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.togglePerf(false);
    });

    this.el.qualitySeg.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const q = btn.dataset.q;
        this.cb.quality?.(q);
      });
    });

    this.el.toggles.forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const key = btn.dataset.toggle;
        this.toggleState[key] = !this.toggleState[key];
        btn.classList.toggle('on', this.toggleState[key]);
        this.cb.toggle?.(key, this.toggleState[key]);
      });
    });

    this.el.stress.forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.cb.stress?.(btn.dataset.stress);
      });
    });

    // Stop taps on UI chrome from ever reaching the world.
    for (const root of [this.el.buildBar, this.el.perfPanel, this.el.wardrobePanel, document.querySelector('.hud-top'), document.querySelector('.actions'), document.querySelector('.joystick-wrap')]) {
      if (!root) continue;
      root.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }

  start() {
    if (this.el.start.classList.contains('gone')) return;
    this.el.start.classList.add('gone');
    document.body.classList.add('playing');
    this.cb.started?.();
  }

  togglePerf(force) {
    this.perfOpen = typeof force === 'boolean' ? force : !this.perfOpen;
    this.el.perfPanel.classList.toggle('hidden', !this.perfOpen);
    if (this.perfOpen) this.toggleWardrobe(false);
  }

  toggleWardrobe(force) {
    this.wardrobeOpen = typeof force === 'boolean' ? force : !this.wardrobeOpen;
    this.el.wardrobePanel.classList.toggle('hidden', !this.wardrobeOpen);
    if (this.wardrobeOpen) this.togglePerf(false);
  }

  setWeapon(armed, name) {
    if (armed === this.lastArmed) return;
    this.lastArmed = armed;
    this.el.strike.classList.toggle('is-firearm', !!armed);
    if (name) this.el.strike.title = name;
    this.renderStrikeLabel();
  }

  setAmmo(state) {
    if (!this.el.ammo || !this.el.ammoChip) return;
    const reserve = state.reserve;
    this.lastArmed = state.armed;
    this.lastMag = state.mag;
    this.lastReserve = reserve;
    this.lastReloading = !!state.reloading;
    this.el.strike.classList.toggle('is-firearm', !!state.armed);
    const key = `${state.armed}|${state.mag}|${reserve}|${state.reloading}`;
    if (key !== this.lastAmmo) {
      this.lastAmmo = key;
      this.el.ammoChip.classList.toggle('hidden', !state.armed);
      this.el.ammoChip.classList.toggle('reloading', !!state.reloading);
      this.el.ammoChip.classList.toggle('dry', state.armed && state.mag <= 0 && reserve <= 0);
      const mag = state.reloading ? '··' : String(state.mag);
      this.el.ammo.textContent = Number.isFinite(reserve) ? `${mag}/${reserve}` : mag;
      this.renderStrikeLabel();
    }
  }

  renderStrikeLabel() {
    const label = this.el.strike.querySelector('span:last-child');
    if (!label) return;
    if (!this.lastArmed) label.textContent = 'STRIKE';
    else if (this.lastReloading) label.textContent = 'RELOAD';
    else if (this.lastMag <= 0 && this.lastReserve <= 0) label.textContent = 'EMPTY';
    else if (Number.isFinite(this.lastReserve)) label.textContent = `FIRE ${this.lastMag}/${this.lastReserve}`;
    else label.textContent = `FIRE ${this.lastMag}`;
  }

  /** Raid outcome card: victory on clear, defeat when the camp overruns the player. */
  showRaidResult(win, sub = '') {
    const el = this.el.raidResult;
    if (!el) return;
    this.el.raidResultTitle.textContent = win ? 'RAID CLEARED' : 'RAID LOST';
    this.el.raidResultSub.textContent = sub;
    el.classList.toggle('win', !!win);
    el.classList.toggle('lose', !win);
    el.classList.remove('hidden');
    clearTimeout(this.raidResultTimer);
    this.raidResultTimer = setTimeout(() => el.classList.add('hidden'), win ? 2800 : 2400);
  }

  setClock(info) {
    if (!this.el.gridClock || !info) return;
    const key = `${info.clock}|${info.day}|${info.night}`;
    if (key === this._clockKey) return;
    this._clockKey = key;
    this.el.gridDay.textContent = `DAY ${info.day}`;
    this.el.gridClock.textContent = info.clock;
    this.el.gridPanel?.classList.toggle('night', !!info.night);
  }

  setPower(info) {
    if (!this.el.gridPower || !info) return;
    const key = `${info.output.toFixed(1)}|${info.demand.toFixed(1)}|${Math.round(info.battery)}|${info.capacity}|${info.powered}|${info.hasGrid}|${info.note}`;
    if (key === this._powerKey) return;
    this._powerKey = key;
    this.el.gridPower.textContent = `${info.output.toFixed(1)} / ${info.demand.toFixed(1)}`;
    const fill = info.capacity > 0 ? info.battery / info.capacity : info.powered ? 1 : 0;
    this.el.gridBarFill.style.width = `${Math.max(0, Math.min(100, fill * 100))}%`;
    this.el.gridNote.textContent = info.note;
    this.el.gridPanel?.classList.toggle('low', !!info.hasGrid && !info.powered);
  }

  setCommanderMode(mode) {
    this.commanderMode = mode;
    document.body.classList.toggle('command-mode', mode === 'command');
    if (this.el.unitControl) {
      this.el.unitControl.textContent = mode === 'direct' ? 'RELEASE' : 'TAKE CONTROL';
      this.el.unitControl.classList.toggle('release', mode === 'direct');
    }
  }

  showUnitCard(view, mode = this.commanderMode) {
    if (!view || !this.el.unitCard) return;
    this.el.unitCard.classList.remove('hidden');
    this.el.unitName.textContent = view.name;
    this.el.unitRole.textContent = view.role + (view.armed ? ' · ARMED' : '');
    this.el.unitHp.textContent = `${Math.max(0, Math.round(view.hp))}/${Math.round(view.maxHp)}`;
    this.el.unitHpFill.style.width = `${Math.max(0, Math.min(100, (view.hp / view.maxHp) * 100))}%`;
    this.el.unitStatus.textContent = view.status;
    this.el.unitControl.disabled = !view.canControl;
    this.el.unitControl.textContent = mode === 'direct' ? 'RELEASE' : 'TAKE CONTROL';
    this.el.unitControl.classList.toggle('release', mode === 'direct');
  }

  updateUnitCard(view, mode) {
    this.showUnitCard(view, mode);
  }

  hideUnitCard() {
    this.el.unitCard?.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // building card
  // -------------------------------------------------------------------------

  showBuildingCard(view) {
    const card = this.el.buildingCard;
    if (!card || !view) return;
    this.buildingCardOpen = true;
    card.classList.remove('hidden');
    card.classList.toggle('site', view.progress != null);
    card.classList.toggle('bad', !!view.noteBad);
    this.el.bcardName.textContent = view.name;
    this.el.bcardState.textContent = view.state;
    this.el.bcardHp.textContent = `${view.hp}/${view.maxHp}`;
    this.el.bcardHpFill.style.width = `${view.hpPct}%`;
    this.el.bcardPower.textContent = view.power || '';
    this.el.bcardPower.classList.toggle('hidden', !view.power);
    this.el.bcardNote.textContent = view.note || '';

    if (this.el.bcardProgress) {
      const show = view.progress != null;
      this.el.bcardProgress.classList.toggle('hidden', !show);
      if (show) this.el.bcardProgressFill.style.width = `${view.progress}%`;
    }

    if (this.el.bcardRows) {
      this.el.bcardRows.innerHTML = '';
      for (const row of view.rows) {
        const line = document.createElement('div');
        line.className = 'bcard-row';
        const label = document.createElement('span');
        label.textContent = row.label;
        const value = document.createElement('b');
        value.textContent = row.value;
        line.append(label, value);
        this.el.bcardRows.appendChild(line);
      }
    }

    if (this.el.bcardActions) {
      this.el.bcardActions.innerHTML = '';
      for (const action of view.actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `bcard-action ${action.kind || 'ghost'}`;
        btn.textContent = action.label;
        btn.disabled = !!action.disabled;
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (btn.disabled) return;
          this.cb.buildingAction?.(action.id);
        });
        this.el.bcardActions.appendChild(btn);
      }
    }
  }

  placeBuildingCard(clientX, clientY) {
    const card = this.el.buildingCard;
    if (!card || card.classList.contains('hidden')) return;
    const w = card.offsetWidth || 214;
    const h = card.offsetHeight || 150;
    const margin = 8;
    const left = Math.max(margin + w / 2, Math.min(window.innerWidth - margin - w / 2, clientX));
    let below = false;
    let top = clientY - 14;
    if (top - h < margin) {
      below = true;
      top = clientY + 14;
    }
    if (below) top = Math.min(top, window.innerHeight - margin - h);
    card.classList.toggle('below', below);
    card.style.left = `${left.toFixed(1)}px`;
    card.style.top = `${Math.max(margin, top).toFixed(1)}px`;
  }

  hideBuildingCard() {
    this.buildingCardOpen = false;
    this.el.buildingCard?.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // manual wiring
  // -------------------------------------------------------------------------

  showWire(active, building = null) {
    this.wireActive = !!active;
    document.body.classList.toggle('wiring', !!active);
    this.el.wireHud?.classList.toggle('hidden', !active);
    this.el.wireLayer?.classList.toggle('hidden', !active);
    if (active && building) {
      this.updateWireStatus(`DRAG FROM ${building.def.name} TO A HIGHLIGHTED NODE`, 'idle');
    }
    if (!active) this.clearWireLine();
  }

  updateWireStatus(text, tone = 'idle') {
    const el = this.el.wireStatus;
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('ok', tone === 'ok');
    el.classList.toggle('bad', tone === 'bad');
  }

  setWireLine(x1, y1, x2, y2, tone = null) {
    const line = this.el.wireLine;
    if (!line) return;
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    line.classList.toggle('ok', tone === 'ok');
    line.classList.toggle('bad', tone === 'bad');
    line.classList.remove('hidden');
  }

  clearWireLine() {
    this.el.wireLine?.classList.add('hidden');
  }

  setRoster(units = []) {
    if (!this.el.roster) return;
    const key = units
      .map((u) => `${u.key}:${Math.round(u.hp)}:${u.selected ? 1 : 0}:${u.dead ? 1 : 0}`)
      .join('|');
    if (key === this._rosterKey) return;
    this._rosterKey = key;
    this.el.roster.innerHTML = '';
    for (const unit of units) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `roster-btn${unit.selected ? ' selected' : ''}${unit.dead ? ' dead' : ''}${unit.leader ? ' leader' : ''}`;
      btn.title = unit.name;
      const initial = document.createElement('b');
      initial.textContent = unit.initial;
      const name = document.createElement('small');
      name.textContent = unit.name;
      const bar = document.createElement('span');
      bar.className = 'r-hp';
      const fill = document.createElement('i');
      fill.style.width = `${Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100))}%`;
      bar.appendChild(fill);
      btn.append(initial, name, bar);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cb.rosterSelect?.(unit.key);
      });
      this.el.roster.appendChild(btn);
    }
  }

  setRaid(count, kind = 'raiders') {
    if (!this.el.raidBanner) return;
    const key = `${count}:${kind}`;
    if (key === this.lastRaid) return;
    this.lastRaid = key;
    this.el.raidBanner.classList.toggle('hidden', count <= 0);
    if (count > 0 && this.el.raidCount) this.el.raidCount.textContent = String(count);
    if (this.el.raidKind) this.el.raidKind.textContent = kind === 'ghouls' ? 'GHOULS' : 'RAIDERS';
  }

  hitMarker(kill = false) {
    const el = this.el.hitMarker;
    if (!el) return;
    el.classList.remove('hit', 'kill');
    void el.offsetWidth;
    el.classList.add('hit');
    if (kill) el.classList.add('kill');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => el.classList.remove('hit', 'kill'), 140);
  }

  buildWardrobe(equipment, armory = null) {
    if (!this.el.wardrobeList) return;
    this.el.wardrobeList.innerHTML = '';
    for (const slot of SLOTS) {
      const row = document.createElement('button');
      row.className = 'wardrobe-row';
      row.type = 'button';
      const label = document.createElement('small');
      label.textContent = slot.label;
      const value = document.createElement('b');
      value.textContent = itemLabel(slot.id, equipment?.[slot.id] || 'none');
      row.append(label, value);
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cb.wardrobeCycle?.(slot.id, e.shiftKey ? -1 : 1);
      });
      this.el.wardrobeList.appendChild(row);
    }
    this.buildArmory(armory, armory?.scrap ?? 0);
  }

  /** Ammo reserve and per-weapon upgrade tracks; both spend scrap. */
  buildArmory(view, scrap = 0) {
    if (!this.el.armory) return;
    this.el.armory.classList.toggle('hidden', !view);
    if (!view) return;
    if (this.el.armoryWeapon) this.el.armoryWeapon.textContent = view.name;
    if (this.el.armoryScrap) this.el.armoryScrap.innerHTML = `SCRAP <b>${scrap}</b>`;

    if (this.el.armoryAmmo) {
      this.el.armoryAmmo.innerHTML = '';
      if (view.ammo) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'wardrobe-row ammo-row';
        row.disabled = view.ammo.full || !view.ammo.affordable;
        const label = document.createElement('small');
        label.textContent = view.ammo.label;
        const value = document.createElement('b');
        value.textContent = `${view.reserve} / ${view.ammo.max}`;
        const cost = document.createElement('span');
        cost.className = 'buy';
        cost.textContent = view.ammo.full ? 'FULL' : `+${view.ammo.pack} · ${view.ammo.cost}`;
        row.append(label, value, cost);
        row.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.cb.armoryAmmo?.();
        });
        this.el.armoryAmmo.appendChild(row);
      }
    }

    if (this.el.armoryUpgrades) {
      this.el.armoryUpgrades.innerHTML = '';
      for (const track of view.tracks) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'wardrobe-row upgrade-row';
        row.disabled = !track.next;
        const label = document.createElement('small');
        label.textContent = `${track.label} ${track.tier}/${track.maxTier}`;
        const value = document.createElement('b');
        value.textContent = track.next ? `${track.next.from} → ${track.next.to}` : track.value;
        const cost = document.createElement('span');
        cost.className = 'buy';
        cost.textContent = track.next ? `${track.next.cost}` : 'MAX';
        row.append(label, value, cost);
        row.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.cb.armoryUpgrade?.(track.id);
        });
        this.el.armoryUpgrades.appendChild(row);
      }
    }
  }

  bindCompass() {
    const el = this.el.compass;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#compass-home')) return;
      e.preventDefault();
      e.stopPropagation();
      this.compassDrag = { id: e.pointerId, x: e.clientX, moved: false };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    el.addEventListener('pointermove', (e) => {
      const drag = this.compassDrag;
      if (!drag || drag.id !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - drag.x;
      if (dx !== 0) {
        drag.x = e.clientX;
        if (Math.abs(dx) > 1) drag.moved = true;
        this.cb.compassRotate?.(dx * 0.012);
      }
    });
    const end = (e) => {
      const drag = this.compassDrag;
      if (!drag || drag.id !== e.pointerId) return;
      this.compassDrag = null;
      if (!drag.moved) this.cb.compassNorth?.();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => {
      if (this.compassDrag && this.compassDrag.id === e.pointerId) this.compassDrag = null;
    });
    this.el.compassHome.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.recenter?.();
    });
  }

  setResume(resumed) {
    this.el.startBtn.textContent = resumed ? 'CONTINUE' : 'ENTER THE WASTELAND';
    this.el.newRun.classList.toggle('hidden', !resumed);
  }

  setSeed(seed) {
    this.el.pSeed.textContent = (seed >>> 0).toString(16).padStart(8, '0');
    this.el.pSeed.title = `World seed ${seed >>> 0}`;
  }

  setCompass(yaw, free) {
    const deg = (yaw * 180) / Math.PI;
    if (Math.abs(deg - this.compassAngle) > 0.2) {
      this.compassAngle = deg;
      this.el.compassNeedle.style.transform = `rotate(${deg.toFixed(1)}deg)`;
      this.el.compass.setAttribute('aria-valuenow', String(((Math.round(deg) % 360) + 360) % 360));
    }
    this.el.compass.classList.toggle('free', !!free);
  }

  syncFullscreen() {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    this.el.fsBtn.classList.toggle('is-fs', active);
    this.el.fsBtn.setAttribute('aria-pressed', String(active));
    this.el.fsBtn.title = active ? 'Exit fullscreen' : 'Fullscreen';
    // Leaving fullscreen also releases the orientation lock on every browser that supports it.
    if (!active && this.orientationLock) this.clearOrientationLock();
    // The viewport changes when browser chrome disappears; reframe on the next tick.
    setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
  }

  clearOrientationLock() {
    this.orientationLock = null;
    this.el.orientBtn.classList.remove('is-locked');
    this.el.orientBtn.setAttribute('aria-pressed', 'false');
    this.el.orientBtn.title = 'Lock landscape / portrait';
  }

  requestFullscreen() {
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) return Promise.reject(new Error('fullscreen unsupported'));
    return Promise.resolve(request.call(root));
  }

  async toggleOrientation() {
    const so = window.screen && window.screen.orientation;
    if (!so || typeof so.lock !== 'function') {
      this.toast('ROTATE DEVICE · LOCK UNSUPPORTED', true);
      return;
    }
    try {
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) {
        await this.requestFullscreen();
      }
      const portraitNow =
        String(so.type || '').indexOf('portrait') === 0 || window.innerHeight > window.innerWidth;
      const next = portraitNow ? 'landscape' : 'portrait';
      await so.lock(next);
      this.orientationLock = next;
      this.el.orientBtn.classList.add('is-locked');
      this.el.orientBtn.setAttribute('aria-pressed', 'true');
      this.el.orientBtn.title = `${next === 'landscape' ? 'Landscape' : 'Portrait'} locked · tap to switch`;
      this.toast(`${next.toUpperCase()} LOCKED`);
    } catch {
      this.clearOrientationLock();
      this.toast('ORIENTATION LOCK BLOCKED · ROTATE DEVICE', true);
    }
  }

  handleFullscreenGesture() {
    this.toggleFullscreen();
  }

  toggleFullscreen() {
    const doc = document;
    const root = document.documentElement;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (active) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) {
        try {
          exit.call(doc);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) {
      this.toast('FULLSCREEN UNSUPPORTED · ADD TO HOME SCREEN', true);
      return;
    }
    try {
      const result = request.call(root);
      if (result && typeof result.catch === 'function') {
        result.catch(() => this.toast('FULLSCREEN BLOCKED BY BROWSER', true));
      }
    } catch {
      this.toast('FULLSCREEN BLOCKED BY BROWSER', true);
    }
  }

  showBuildMenu(open) {
    this.buildOpen = open;
    this.el.buildBar.classList.toggle('hidden', !open);
    document.body.classList.toggle('build-open', open);
    if (open) {
      this.el.toast.classList.remove('show');
      this.el.buildList.scrollLeft = 0;
    } else {
      this.el.toast.style.bottom = '';
      this.showPlacement(false);
    }
  }

  setSelectedBuilding(id) {
    this.el.buildList.querySelectorAll('.build-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.type === id);
    });
  }

  showPlacement(active, def = null) {
    this.el.placeBar.classList.toggle('hidden', !active);
    if (active && def) {
      this.el.placeName.textContent = def.name;
      this.last.reason = '';
      this.last.canPlace = null;
    }
    if (!active) {
      this.setSelectedBuilding(null);
      this.el.buildList.querySelectorAll('.build-card').forEach((c) => c.classList.remove('selected'));
    }
  }

  setPlaceStatus(canPlace, reason) {
    if (canPlace === this.last.canPlace && reason === this.last.reason) return;
    this.last.canPlace = canPlace;
    this.last.reason = reason;
    this.el.placeConfirm.disabled = !canPlace;
    this.el.placeStatus.textContent = canPlace
      ? 'Tap the ground to aim · confirm to raise'
      : reason || 'Invalid spot';
    this.el.placeStatus.style.color = canPlace ? '' : 'var(--red)';
  }

  setQuality(name) {
    this.el.qualitySeg.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.q === name);
    });
  }

  setToggle(key, value) {
    this.toggleState[key] = value;
    this.el.toggles.forEach((b) => {
      if (b.dataset.toggle === key) b.classList.toggle('on', value);
    });
  }

  updateHUD(state) {
    const cap = state.scrapCap || 0;
    if (state.scrap !== this.last.scrap || cap !== this.last.scrapCap) {
      this.last.scrap = state.scrap;
      this.last.scrapCap = cap;
      this.el.scrap.textContent = cap ? `${state.scrap}/${cap}` : String(state.scrap);
      this.el.buildScrap.textContent = `${state.scrap} scrap available`;
      this.el.buildList.querySelectorAll('.build-card').forEach((card) => {
        card.classList.toggle('cant', Number(card.dataset.cost) > state.scrap);
      });
    }
    if (state.water !== this.last.water) {
      this.last.water = state.water;
      this.el.water.textContent = String(state.water);
    }
    if (state.kills !== this.last.kills) {
      this.last.kills = state.kills;
      this.el.kills.textContent = String(state.kills);
    }
    const hp = Math.max(0, Math.round(state.health));
    if (hp !== this.last.health) {
      this.last.health = hp;
      this.el.hpFill.style.width = `${(hp / state.maxHealth) * 100}%`;
      this.el.hpText.textContent = String(hp);
    }
  }

  setGather(visible) {
    if (visible === this.last.canGather) return;
    this.last.canGather = visible;
    this.el.gather.classList.toggle('hidden', !visible);
  }

  setStrikeCooling(cooling) {
    if (cooling === this.lastStrikeCooling) return;
    this.lastStrikeCooling = cooling;
    this.el.strike.classList.toggle('cooling', cooling);
  }

  toast(msg, bad = false) {
    const el = this.el.toast;
    el.textContent = msg;
    el.classList.toggle('bad', bad);
    if (this.buildOpen) {
      const top = this.el.buildBar.getBoundingClientRect().top;
      el.style.bottom = `${Math.max(12, window.innerHeight - top + 10)}px`;
    } else {
      el.style.bottom = '';
    }
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
  }

  hint(msg, duration = 2600) {
    const el = this.el.hint;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  hideHint() {
    clearTimeout(this.hintTimer);
    this.el.hint.classList.remove('show');
  }

  flashDamage() {
    const el = this.el.flash;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove('hit'), 90);
  }

  showDeath(show) {
    this.el.death.classList.toggle('hidden', !show);
  }

  updatePerf(perf, ghouls) {
    const s = perf.stats;
    this.el.pFps.textContent = String(s.fps);
    this.el.pFps.style.color = s.fps < 30 ? 'var(--red)' : s.fps < 50 ? 'var(--amber)' : 'var(--amber-hot)';
    this.el.pMs.textContent = s.ms;
    this.el.pMin.textContent = String(s.min);
    this.el.pDraws.textContent = String(s.calls);
    this.el.pTris.textContent = s.tris > 9999 ? `${(s.tris / 1000).toFixed(0)}k` : String(s.tris);
    this.el.pRes.textContent = `${s.scale.toFixed(2)}x`;
    this.el.pDpr.textContent = s.dpr.toFixed(2);
    this.el.pGhouls.textContent = String(ghouls);
    this.el.pGpu.textContent = s.gpu;
    if (perf.history.length !== this.perfLastHistory) {
      this.perfLastHistory = perf.history.length;
    }
    if (this.perfOpen) this.drawGraph(perf.history);
  }

  drawGraph(history) {
    const ctx = this.gctx;
    const w = this.el.graph.width;
    const h = this.el.graph.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, w, h);

    const yFor = (fps) => h - Math.min(1, Math.max(0, fps / 90)) * (h - 4) - 2;

    ctx.strokeStyle = 'rgba(240,169,94,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yFor(60));
    ctx.lineTo(w, yFor(60));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,113,81,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, yFor(30));
    ctx.lineTo(w, yFor(30));
    ctx.stroke();

    if (history.length < 2) return;
    const step = w / (90 - 1);
    const start = w - (history.length - 1) * step;
    ctx.beginPath();
    history.forEach((fps, i) => {
      const x = start + i * step;
      const y = yFor(fps);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#f0a95e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(start + (history.length - 1) * step, h);
    ctx.lineTo(start, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240,169,94,0.09)';
    ctx.fill();
  }
}
