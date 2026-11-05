import { BUILDINGS } from './settlement.js';
import { clearSave } from './save.js';
import { SLOTS, itemLabel } from './wardrobe.js';

/**
 * The mobile shell.
 *
 * One thumb rail (build / units / camp), a compact resource strip and a clipboard drawer replace the
 * old always-on roster, vitals, objective and power panels. Every panel is a bottom sheet on a phone
 * and a side drawer in landscape; nothing permanent covers the middle of the play field.
 */
export class UI {
  constructor() {
    this.cb = {};
    this.last = {
      scrap: -1,
      water: -1,
      food: -1,
      waterCap: -1,
      foodCap: -1,
      canPlace: null,
      reason: '',
    };
    this.toastTimer = 0;
    this.hintTimer = 0;
    this.perfOpen = false;
    this.buildOpen = false;
    this.campOpen = false;
    this.unitsOpen = false;
    this.menuOpen = false;
    this.buildingCardOpen = false;
    this.wireActive = false;
    this.perfLastHistory = 0;
    this.lastRaid = '';
    this.hitTimer = 0;
    this._unitsKey = '';
    this._objectiveKey = '';
    this.toggleState = {
      adaptive: true,
      fog: true,
      grass: true,
      embers: true,
      shadows: true,
      ortho: true,
      sound: true,
      paths: false,
    };
    this.orientationLock = null;
    this.compassDrag = null;
    this.compassAngle = 0;

    this.el = {
      scrap: document.getElementById('hud-scrap'),
      water: document.getElementById('hud-water'),
      food: document.getElementById('hud-food'),
      power: document.getElementById('hud-power'),
      powerChip: document.getElementById('power-chip'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
      flash: document.getElementById('flash'),
      raidResult: document.getElementById('raid-result'),
      raidResultTitle: document.getElementById('raid-result-title'),
      raidResultSub: document.getElementById('raid-result-sub'),
      build: document.getElementById('build-btn'),
      unitsBtn: document.getElementById('units-btn'),
      buildBar: document.getElementById('build-bar'),
      buildList: document.getElementById('build-list'),
      buildClose: document.getElementById('build-close'),
      buildScrap: document.getElementById('build-scrap'),
      placeBar: document.getElementById('place-bar'),
      placeName: document.getElementById('place-name'),
      placeStatus: document.getElementById('place-status'),
      placeConfirm: document.getElementById('place-confirm'),
      placeCancel: document.getElementById('place-cancel'),
      placeRotate: document.getElementById('place-rotate'),
      menuBtn: document.getElementById('menu-btn'),
      menuSheet: document.getElementById('menu-sheet'),
      perfBtn: document.getElementById('perf-btn'),
      campBtn: document.getElementById('camp-btn'),
      campPanel: document.getElementById('camp-panel'),
      campClose: document.getElementById('camp-close'),
      campSummary: document.getElementById('camp-summary'),
      campWarnings: document.getElementById('camp-warnings'),
      campExpeditions: document.getElementById('camp-expeditions'),
      campTargets: document.getElementById('camp-targets'),
      campTeam: document.getElementById('camp-team'),
      campLaunch: document.getElementById('camp-launch'),
      unitsPanel: document.getElementById('units-panel'),
      unitsClose: document.getElementById('units-close'),
      unitsList: document.getElementById('units-list'),
      unitsCount: document.getElementById('units-count'),
      unitDetail: document.getElementById('unit-detail'),
      unitCard: document.getElementById('unit-card'),
      unitName: document.getElementById('unit-name'),
      unitRole: document.getElementById('unit-role'),
      unitHp: document.getElementById('unit-hp'),
      unitHpFill: document.getElementById('unit-hp-fill'),
      unitMoodFill: document.getElementById('unit-mood-fill'),
      unitStatus: document.getElementById('unit-status'),
      unitDetails: document.getElementById('unit-details'),
      unitClose: document.getElementById('unit-close'),
      enemyCard: document.getElementById('enemy-card'),
      enemyName: document.getElementById('enemy-name'),
      enemyLevel: document.getElementById('enemy-level'),
      enemyHp: document.getElementById('enemy-hp'),
      enemyHpFill: document.getElementById('enemy-hp-fill'),
      enemyStats: document.getElementById('enemy-stats'),
      gridDay: document.getElementById('grid-day'),
      gridClock: document.getElementById('grid-clock'),
      endScreen: document.getElementById('end-screen'),
      endKicker: document.getElementById('end-kicker'),
      endTitle: document.getElementById('end-title'),
      endSub: document.getElementById('end-sub'),
      endDay: document.getElementById('end-day'),
      endSurvivors: document.getElementById('end-survivors'),
      endKills: document.getElementById('end-kills'),
      endNewRun: document.getElementById('end-new-run'),
      buildingCard: document.getElementById('building-card'),
      bcardName: document.getElementById('bcard-name'),
      bcardState: document.getElementById('bcard-state'),
      bcardHp: document.getElementById('bcard-hp'),
      bcardHpFill: document.getElementById('bcard-hp-fill'),
      bcardPower: document.getElementById('bcard-power'),
      bcardNote: document.getElementById('bcard-note'),
      bcardRows: document.getElementById('bcard-rows'),
      bcardSlots: document.getElementById('bcard-slots'),
      bcardProgress: document.getElementById('bcard-progress'),
      bcardProgressFill: document.getElementById('bcard-progress-fill'),
      bcardActions: document.getElementById('bcard-actions'),
      bcardClose: document.getElementById('bcard-close'),
      wireHud: document.getElementById('wire-hud'),
      wireStatus: document.getElementById('wire-status'),
      wireLayer: document.getElementById('wire-layer'),
      wireLine: document.getElementById('wire-line'),
      wireCancel: document.getElementById('wire-cancel'),
      cellHud: document.getElementById('cell-hud'),
      cellTitle: document.getElementById('cell-title'),
      cellEnemies: document.getElementById('cell-enemies'),
      cellNote: document.getElementById('cell-note'),
      cellLoot: document.getElementById('cell-loot'),
      cellLeave: document.getElementById('cell-leave'),
      raidBanner: document.getElementById('raid-banner'),
      raidCount: document.getElementById('raid-count'),
      raidKind: document.getElementById('raid-kind'),
      hitMarker: document.getElementById('hit-marker'),
      pSeed: document.getElementById('p-seed'),
      seedReroll: document.getElementById('seed-reroll'),
      saveReset: document.getElementById('save-reset'),
      fsBtn: document.getElementById('fs-btn'),
      orientBtn: document.getElementById('orient-btn'),
      soundBtn: document.getElementById('sound-btn'),
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
      card.dataset.components = String(def.components || 0);
      card.dataset.group = def.group || 'camp';
      const parts = [`${def.cost} ⬡`];
      if (def.components) parts.push(`${def.components} ⚙`);
      card.innerHTML = `
        <span class="bc-top"><span class="bc-name">${def.name}</span><span class="bc-cost">${parts.join(' · ')}</span></span>
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
    this.el.endNewRun?.addEventListener('click', (e) => {
      e.preventDefault();
      clearSave();
      window.location.reload();
    });

    this.el.build.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cb.buildToggle?.();
    });
    this.el.unitsBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleUnits();
    });
    this.el.unitsClose?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleUnits(false);
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
    this.el.placeRotate?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.placeRotate?.(Math.PI / 4);
    });

    this.el.menuBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMenu();
    });
    this.el.perfBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleMenu(false);
      this.togglePerf();
    });
    this.el.campBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleCamp();
    });
    this.el.campClose?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleCamp(false);
    });
    this.el.campLaunch?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cb.campLaunch?.();
    });
    this.el.unitDetails?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleUnits(true);
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
    this.el.cellLoot?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.el.cellLoot.disabled) this.cb.cellLoot?.();
    });
    this.el.cellLeave?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.cellLeave?.();
    });
    this.el.fsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleMenu(false);
      this.handleFullscreenGesture();
    });
    this.el.soundBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleState.sound = !this.toggleState.sound;
      this.el.soundBtn.textContent = this.toggleState.sound ? 'SOUND ON' : 'SOUND OFF';
      this.cb.toggle?.('sound', this.toggleState.sound);
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
      this.toggleMenu(false);
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
        this.cb.quality?.(btn.dataset.q);
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
    for (const root of [
      this.el.buildBar,
      this.el.perfPanel,
      this.el.campPanel,
      this.el.unitsPanel,
      this.el.menuSheet,
      document.querySelector('.hud-top'),
      document.querySelector('.action-rail'),
      this.el.unitCard,
      this.el.buildingCard,
      this.el.cellHud,
    ]) {
      if (!root) continue;
      root.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    document.addEventListener('pointerdown', (e) => {
      if (!this.menuOpen) return;
      if (e.target.closest('#menu-sheet') || e.target.closest('#menu-btn')) return;
      this.toggleMenu(false);
    });
  }

  start() {
    if (this.el.start.classList.contains('gone')) return;
    this.el.start.classList.add('gone');
    document.body.classList.add('playing');
    this.cb.started?.();
  }

  // -------------------------------------------------------------------------
  // panels
  // -------------------------------------------------------------------------

  toggleMenu(force) {
    this.menuOpen = typeof force === 'boolean' ? force : !this.menuOpen;
    this.el.menuSheet?.classList.toggle('hidden', !this.menuOpen);
    this.el.menuBtn?.setAttribute('aria-expanded', String(this.menuOpen));
  }

  togglePerf(force) {
    this.perfOpen = typeof force === 'boolean' ? force : !this.perfOpen;
    this.el.perfPanel.classList.toggle('hidden', !this.perfOpen);
    document.body.classList.toggle('perf-open', this.perfOpen);
    if (this.perfOpen) {
      this.toggleCamp(false);
      this.toggleUnits(false);
      this.toggleMenu(false);
    }
  }

  toggleCamp(force) {
    this.campOpen = typeof force === 'boolean' ? force : !this.campOpen;
    if (this.campOpen && this.buildOpen) this.cb.buildClose?.();
    this.el.campPanel?.classList.toggle('hidden', !this.campOpen);
    document.body.classList.toggle('camp-open', this.campOpen);
    if (this.campOpen) {
      this.togglePerf(false);
      this.toggleUnits(false);
      this.toggleMenu(false);
      this.cb.campRefresh?.();
    }
  }

  toggleUnits(force) {
    this.unitsOpen = typeof force === 'boolean' ? force : !this.unitsOpen;
    if (this.unitsOpen && this.buildOpen) this.cb.buildClose?.();
    this.el.unitsPanel?.classList.toggle('hidden', !this.unitsOpen);
    document.body.classList.toggle('units-open', this.unitsOpen);
    if (this.unitsOpen) {
      this.togglePerf(false);
      this.toggleCamp(false);
      this.toggleMenu(false);
      this.cb.unitsRefresh?.();
    }
  }

  // -------------------------------------------------------------------------
  // camp panel
  // -------------------------------------------------------------------------

  campRow({ tag = 'button', className = '', strong = '', small = '', right = '', onClick = null }) {
    const row = document.createElement(tag);
    row.className = `camp-row ${className}`.trim();
    if (tag === 'button') row.type = 'button';
    const left = document.createElement('div');
    const head = document.createElement('strong');
    head.textContent = strong;
    left.appendChild(head);
    if (small) {
      const sub = document.createElement('small');
      sub.textContent = small;
      left.appendChild(sub);
    }
    const tail = document.createElement('span');
    tail.textContent = right;
    row.append(left, tail);
    if (onClick) {
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
    }
    return row;
  }

  showCamp(view) {
    if (!view || !this.el.campPanel) return;
    this.el.campSummary.innerHTML = '';
    for (const item of view.summary || []) {
      const cell = document.createElement('div');
      const label = document.createElement('small');
      label.textContent = item.label;
      const value = document.createElement('b');
      value.textContent = item.value;
      cell.append(label, value);
      this.el.campSummary.appendChild(cell);
    }

    if (this.el.campWarnings) {
      this.el.campWarnings.innerHTML = '';
      const warnings = view.warnings || [];
      this.el.campWarnings.classList.toggle('hidden', !warnings.length);
      for (const w of warnings) {
        const line = document.createElement('p');
        line.className = `camp-warning ${w.bad ? 'bad' : ''}`;
        line.textContent = w.text;
        this.el.campWarnings.appendChild(line);
      }
    }

    const missions = this.el.campExpeditions;
    missions.innerHTML = '';
    for (const m of view.expedition?.active || []) {
      missions.appendChild(
        this.campRow({
          tag: 'div',
          strong: m.label,
          small: `${m.phase} · ${m.members}`,
          right: m.timer,
        }),
      );
    }
    if (!view.expedition?.active?.length) {
      const empty = document.createElement('div');
      empty.className = 'camp-empty';
      empty.textContent = `NO ACTIVE EXPEDITIONS · ${view.expedition?.slots || '0/2'} SLOTS`;
      missions.appendChild(empty);
    }

    const targets = this.el.campTargets;
    targets.innerHTML = '';
    for (const t of view.expedition?.targets || []) {
      targets.appendChild(
        this.campRow({
          className: t.selected ? 'selected' : '',
          strong: t.label,
          small: `${t.detail} · ${t.dangerText}`,
          right: `${Math.round(t.dist)}m`,
          onClick: () => this.cb.campTarget?.(t.id),
        }),
      );
    }
    if (!view.expedition?.targets?.length) {
      const empty = document.createElement('div');
      empty.className = 'camp-empty';
      empty.textContent = 'NO REACHABLE SALVAGE OR CAVES';
      targets.appendChild(empty);
    }

    const team = this.el.campTeam;
    team.innerHTML = '';
    for (const p of view.expedition?.team || []) {
      team.appendChild(
        this.campRow({
          className: p.selected ? 'selected' : '',
          strong: `${p.name} · LV ${p.level}`,
          small: `${p.armed ? 'ARMED' : 'UNARMED'}${p.busy ? ' · BUSY' : ''}`,
          right: p.selected ? 'ON TEAM' : '+ ADD',
          onClick: () => this.cb.campMember?.(p.index),
        }),
      );
    }
    if (!view.expedition?.team?.length) {
      const empty = document.createElement('div');
      empty.className = 'camp-empty';
      empty.textContent = 'NO FREE SURVIVORS';
      team.appendChild(empty);
    }

    if (this.el.campLaunch) {
      const slotsFull = view.expedition?.slots === '2/2';
      this.el.campLaunch.disabled = !view.expedition?.canLaunch;
      this.el.campLaunch.textContent = slotsFull
        ? 'EXPEDITION SLOTS FULL'
        : `LAUNCH EXPEDITION · ${view.expedition?.teamSize || '0/3'}`;
    }
  }

  // -------------------------------------------------------------------------
  // clipboard: survivors, equipment and armory
  // -------------------------------------------------------------------------

  showUnits(view) {
    if (!view || !this.el.unitsPanel) return;
    const units = view.units || [];
    const key = units
      .map(
        (u) =>
          `${u.key}:${Math.round(u.hp)}:${Math.round(u.morale)}:${u.selected ? 1 : 0}:${u.status}:${u.role}:${u.level}:${u.warning || ''}:${JSON.stringify(u.equipment || {})}`,
      )
      .join('|');
    const selectionKey = `${view.selectedKey || ''}|${view.armory?.name || ''}|${view.armory?.reserve ?? ''}`;
    if (key !== this._unitsKey || selectionKey !== this._unitsSelectionKey) {
      this._unitsSelectionKey = selectionKey;
      this._unitsKey = key;
      this.el.unitsCount.textContent = `${view.living ?? units.length}/${view.cap ?? '?'}`;
      this.el.unitsList.innerHTML = '';
      for (const u of units) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `unit-row${u.selected ? ' selected' : ''}${u.dead ? ' down' : ''}`;
        const head = document.createElement('div');
        head.className = 'unit-row-head';
        const name = document.createElement('strong');
        name.textContent = u.name;
        const lv = document.createElement('b');
        lv.textContent = `LV ${u.level}`;
        head.append(name, lv);
        const meta = document.createElement('small');
        meta.textContent = `${u.role}${u.home ? ` · ${u.home}` : ''}`;
        const status = document.createElement('span');
        status.className = 'unit-row-status';
        status.textContent = u.warning || u.status;
        const bars = document.createElement('div');
        bars.className = 'unit-row-bars';
        const hp = document.createElement('i');
        hp.className = 'mini-hp';
        hp.style.width = `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`;
        const mood = document.createElement('i');
        mood.className = 'mini-mood';
        mood.style.width = `${Math.max(0, Math.min(100, u.morale))}%`;
        bars.append(hp, mood);
        row.append(head, meta, status, bars);
        row.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.cb.unitsSelect?.(u.key);
        });
        this.el.unitsList.appendChild(row);
      }
      if (!units.length) {
        const empty = document.createElement('div');
        empty.className = 'camp-empty';
        empty.textContent = 'NO SURVIVORS';
        this.el.unitsList.appendChild(empty);
      }
      this.renderUnitDetail(view);
    }
    this.el.unitsCount.textContent = `${view.living ?? units.length}/${view.cap ?? '?'}`;
  }

  renderUnitDetail(view) {
    const detail = this.el.unitDetail;
    if (!detail) return;
    const u = (view.units || []).find((x) => x.key === view.selectedKey);
    if (!u) {
      detail.innerHTML = '<p class="camp-empty">SELECT A SURVIVOR</p>';
      return;
    }
    detail.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'detail-head';
    const title = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = u.name;
    const sub = document.createElement('small');
    sub.textContent = `${u.role} · LV ${u.level} · ${u.home || 'FREE'}`;
    title.append(name, sub);
    const status = document.createElement('b');
    status.className = 'detail-status';
    status.textContent = u.warning || u.status;
    head.append(title, status);
    detail.appendChild(head);

    detail.appendChild(this.detailBar('HP', u.hp, u.maxHp, 'hp'));
    detail.appendChild(this.detailBar('MOOD', u.morale, 100, 'mood'));
    if (u.xpNeed > 0) detail.appendChild(this.detailBar('XP', u.xp, u.xpNeed, 'xp'));

    const rows = document.createElement('div');
    rows.className = 'detail-rows';
    const addRow = (label, value) => {
      const line = document.createElement('div');
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('b');
      v.textContent = value;
      line.append(l, v);
      rows.appendChild(line);
    };
    addRow('DAMAGE', String(u.damage));
    addRow('RANGE', u.rangeText);
    addRow('SPEED', u.speedText);
    addRow('WEAPON', u.weaponText);
    addRow('AMMO', u.ammoText);
    addRow('CARRY', u.carryText);
    if (u.perk) addRow('PERK', u.perk);
    detail.appendChild(rows);

    if (u.moraleFactors?.length) {
      const factors = document.createElement('p');
      factors.className = 'detail-factors';
      factors.textContent = u.moraleFactors.join(' · ');
      detail.appendChild(factors);
    }

    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const actionDefs = u.pending
      ? [
          { id: 'welcome', label: 'WELCOME' },
          { id: 'reject', label: 'REJECT' },
        ]
      : [
          { id: 'focus', label: 'FOCUS' },
          { id: 'release', label: 'RELEASE POST', disabled: !u.home },
          { id: 'guard', label: 'GUARD POST', disabled: !u.canMan },
          { id: 'expel', label: 'EXPEL', disabled: false },
        ];
    for (const a of actionDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `bcard-action ${a.id === 'focus' || a.id === 'welcome' ? 'primary' : a.id === 'expel' ? 'danger' : 'ghost'}`;
      btn.textContent = a.label;
      btn.disabled = !!a.disabled;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        this.cb.unitAction?.(u.key, a.id);
      });
      actions.appendChild(btn);
    }
    detail.appendChild(actions);

    const equip = document.createElement('div');
    equip.className = 'detail-section';
    const equipLabel = document.createElement('span');
    equipLabel.className = 'group-label';
    equipLabel.textContent = 'EQUIPMENT';
    equip.appendChild(equipLabel);
    for (const slot of SLOTS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'wardrobe-row';
      const label = document.createElement('small');
      label.textContent = slot.label;
      const value = document.createElement('b');
      value.textContent = itemLabel(slot.id, u.equipment?.[slot.id] || 'none');
      row.append(label, value);
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cb.unitEquip?.(u.key, slot.id, e.shiftKey ? -1 : 1);
      });
      equip.appendChild(row);
    }
    detail.appendChild(equip);

    if (view.armory) {
      const arm = document.createElement('div');
      arm.className = 'detail-section';
      const armLabel = document.createElement('span');
      armLabel.className = 'group-label';
      armLabel.textContent = 'ARMORY';
      arm.appendChild(armLabel);
      const ammo = view.armory.ammo;
      if (ammo) {
        const line = document.createElement('div');
        line.className = 'wardrobe-row ammo-row static';
        const label = document.createElement('small');
        label.textContent = ammo.label;
        const value = document.createElement('b');
        value.textContent = `${ammo.reserve} / ${ammo.max}`;
        const source = document.createElement('span');
        source.className = 'buy';
        source.textContent = 'WORKSHOP';
        line.append(label, value, source);
        arm.appendChild(line);
      }
      for (const track of view.armory.tracks || []) {
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
        arm.appendChild(row);
      }
      detail.appendChild(arm);
    }
  }

  detailBar(label, value, max, kind) {
    const wrap = document.createElement('div');
    wrap.className = `detail-bar ${kind}`;
    const head = document.createElement('div');
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('b');
    v.textContent = kind === 'xp' ? `${Math.round(value)}/${Math.round(max)}` : `${Math.max(0, Math.round(value))}/${Math.round(max)}`;
    head.append(l, v);
    const track = document.createElement('i');
    const fill = document.createElement('u');
    fill.style.width = `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
    track.appendChild(fill);
    wrap.append(head, track);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // unit card and enemy card
  // -------------------------------------------------------------------------

  showUnitCard(view) {
    if (!view || !this.el.unitCard) return;
    this.el.unitCard.classList.remove('hidden');
    this.el.unitName.textContent = view.name;
    this.el.unitRole.textContent =
      view.role + (view.armed ? ' · ARMED' : '') + (view.home ? ` · ${view.home}` : '');
    this.el.unitHp.textContent = `${Math.max(0, Math.round(view.hp))}/${Math.round(view.maxHp)}`;
    this.el.unitHpFill.style.width = `${Math.max(0, Math.min(100, (view.hp / view.maxHp) * 100))}%`;
    if (this.el.unitMoodFill) {
      this.el.unitMoodFill.style.width = `${Math.max(0, Math.min(100, view.morale ?? 100))}%`;
      this.el.unitMoodFill.classList.toggle('low', (view.morale ?? 100) < 35);
    }
    this.el.unitStatus.textContent = view.warning || view.status;
  }

  updateUnitCard(view) {
    this.showUnitCard(view);
  }

  hideUnitCard() {
    this.el.unitCard?.classList.add('hidden');
  }

  showEnemyCard(info) {
    if (!info || !this.el.enemyCard) return;
    this.el.enemyName.textContent = info.name || 'HOSTILE';
    this.el.enemyLevel.textContent = `LV ${info.level || 1}`;
    this.el.enemyHp.textContent = `${Math.max(0, Math.round(info.hp))}/${Math.round(info.maxHp || 1)}`;
    this.el.enemyHpFill.style.width = `${Math.max(0, Math.min(100, (info.hp / (info.maxHp || 1)) * 100))}%`;
    const range = info.range ? `${Math.round(info.range)}m` : 'MELEE';
    this.el.enemyStats.textContent = `DMG ${Math.round((info.damage || 0) * 10) / 10} · ${range} · SPD ${(info.speed || 0).toFixed(1)}`;
    this.el.enemyCard.classList.remove('hidden');
    clearTimeout(this.enemyCardTimer);
    this.enemyCardTimer = setTimeout(() => this.el.enemyCard.classList.add('hidden'), 2800);
  }

  // -------------------------------------------------------------------------
  // building card
  // -------------------------------------------------------------------------

  showBuildingCard(view) {
    const card = this.el.buildingCard;
    if (!card || !view) return;
    this.buildingCardOpen = true;
    document.body.classList.add('card-open');
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

    if (this.el.bcardSlots) {
      this.el.bcardSlots.innerHTML = '';
      const slots = view.slots || [];
      this.el.bcardSlots.classList.toggle('hidden', !slots.length);
      for (const slot of slots) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `bcard-slot${slot.name ? ' filled' : ''}`;
        const role = document.createElement('span');
        role.textContent = slot.role;
        const name = document.createElement('b');
        name.textContent = slot.name || 'ASSIGN';
        btn.append(role, name);
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.cb.buildingSlot?.(slot.index);
        });
        this.el.bcardSlots.appendChild(btn);
      }
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
    document.body.classList.remove('card-open');
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

  // -------------------------------------------------------------------------
  // expedition cell HUD
  // -------------------------------------------------------------------------

  showCell(view) {
    if (!this.el.cellHud) return;
    this.el.cellHud.classList.toggle('hidden', !view);
    if (!view) {
      this._cellKey = '';
      return;
    }
    const key = `${view.title}|${view.enemies}|${view.note}|${view.canLoot}|${view.looted}|${view.canLeave}`;
    if (key === this._cellKey) return;
    this._cellKey = key;
    this.el.cellTitle.textContent = view.title || 'EXPEDITION';
    this.el.cellEnemies.textContent = `${view.enemies ?? 0} HOSTILES`;
    this.el.cellNote.textContent = view.note || '';
    this.el.cellLoot.disabled = !view.canLoot;
    this.el.cellLoot.textContent = view.looted ? 'CACHE EMPTY' : 'LOOT CACHE';
    this.el.cellLeave.textContent = view.canLeave ? 'RETURN TO CAMP' : 'LEAVE';
    this.el.cellLeave.disabled = !view.canLeave;
  }

  hideCell() {
    this.el.cellHud?.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // clocks, power, raid
  // -------------------------------------------------------------------------

  setClock(info) {
    if (!this.el.gridClock || !info) return;
    const key = `${info.clock}|${info.day}|${info.night}`;
    if (key === this._clockKey) return;
    this._clockKey = key;
    this.el.gridDay.textContent = `DAY ${info.day}`;
    this.el.gridClock.textContent = info.clock;
    document.body.classList.toggle('night', !!info.night);
  }

  setPower(info) {
    if (!info) return;
    const key = `${info.output.toFixed(1)}|${info.demand.toFixed(1)}|${Math.round(info.battery)}|${info.capacity}|${info.powered}|${info.hasGrid}|${info.note}`;
    if (key === this._powerKey) return;
    this._powerKey = key;
    if (this.el.power) this.el.power.textContent = info.output.toFixed(1);
    if (this.el.powerChip) {
      this.el.powerChip.title = `Output ${info.output.toFixed(1)} · demand ${info.demand.toFixed(1)} · stored ${Math.round(info.battery)}/${Math.round(info.capacity)} · ${info.note}`;
      this.el.powerChip.classList.toggle('low', !!info.hasGrid && !info.powered);
    }
  }

  setRaid(count, kind = 'raiders') {
    if (!this.el.raidBanner) return;
    const key = `${count}:${kind}`;
    if (key === this.lastRaid) return;
    this.lastRaid = key;
    this.el.raidBanner.classList.toggle('hidden', count <= 0);
    if (count > 0 && this.el.raidCount) this.el.raidCount.textContent = String(count);
    if (this.el.raidKind) {
      this.el.raidKind.textContent =
        kind === 'ghouls' ? 'GHOULS' : kind === 'bats' ? 'BATS' : kind === 'assault' ? 'ASSAULT' : 'RAIDERS';
    }
  }

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

  // -------------------------------------------------------------------------
  // run end (the camp is lost, never won)
  // -------------------------------------------------------------------------

  showRunEnd(win, title, sub, stats = {}) {
    if (!this.el.endScreen) return;
    this.el.endScreen.classList.remove('hidden');
    this.el.endScreen.classList.toggle('lose', !win);
    this.el.endTitle.textContent = title;
    this.el.endSub.textContent = sub;
    this.el.endKicker.textContent = 'CAMP PROTOCOL · ENDED';
    this.el.endDay.textContent = String(stats.day ?? 1);
    this.el.endSurvivors.textContent = String(stats.survivors ?? 0);
    this.el.endKills.textContent = String(stats.kills ?? 0);
  }

  hideRunEnd() {
    this.el.endScreen?.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // compass / fullscreen / orientation
  // -------------------------------------------------------------------------

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
    if (!active && this.orientationLock) this.clearOrientationLock();
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

  // -------------------------------------------------------------------------
  // build tray and placement
  // -------------------------------------------------------------------------

  showBuildMenu(open) {
    this.buildOpen = open;
    this.el.buildBar.classList.toggle('hidden', !open);
    document.body.classList.toggle('build-open', open);
    if (open) {
      this.el.toast.classList.remove('show');
      this.el.buildList.scrollLeft = 0;
      this.toggleMenu(false);
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
    if (key === 'sound' && this.el.soundBtn) {
      this.el.soundBtn.textContent = value ? 'SOUND ON' : 'SOUND OFF';
    }
  }

  // -------------------------------------------------------------------------
  // HUD resources
  // -------------------------------------------------------------------------

  updateHUD(state) {
    const cap = state.scrapCap || 0;
    if (state.scrap !== this.last.scrap || cap !== this.last.scrapCap) {
      this.last.scrap = state.scrap;
      this.last.scrapCap = cap;
      this.el.scrap.textContent = cap ? `${state.scrap}/${cap}` : String(state.scrap);
      this.el.buildScrap.textContent = `${state.scrap} scrap available`;
      this.el.buildList.querySelectorAll('.build-card').forEach((card) => {
        const comps = Number(card.dataset.components) || 0;
        card.classList.toggle(
          'cant',
          Number(card.dataset.cost) > state.scrap || comps > (state.components || 0),
        );
      });
    }
    const waterCap = state.waterCap || state.scrapCap || 0;
    if (state.water !== this.last.water || waterCap !== this.last.waterCap) {
      this.last.water = state.water;
      this.last.waterCap = waterCap;
      this.el.water.textContent = `${state.water}/${waterCap}`;
    }
    const foodCap = state.foodCap || state.scrapCap || 0;
    if (state.food !== this.last.food || foodCap !== this.last.foodCap) {
      this.last.food = state.food;
      this.last.foodCap = foodCap;
      this.el.food.textContent = `${state.food}/${foodCap}`;
    }
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

  // -------------------------------------------------------------------------
  // perf lab
  // -------------------------------------------------------------------------

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
    if (perf.history.length !== this.perfLastHistory) this.perfLastHistory = perf.history.length;
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
