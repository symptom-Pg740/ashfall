import { makeRng, deriveSeed, clamp } from './rng.js';
import { XP } from './levels.js';

const SITE_LABEL = {
  wreck: 'CAR WRECK',
  ruin: 'COLLAPSED RUIN',
  cache: 'TRADER CACHE',
};

/**
 * Auto-resolving expeditions.
 *
 * A team leaves camp, travels to a known salvage site or cave, searches it, and returns with loot
 * and injuries. The camp keeps producing while they are away; this is the management-side answer
 * to the direct-control expedition loop.
 */
export class ExpeditionSystem {
  constructor({ campFolk, settlement, scrapField, cells, state, ui, onSave, onLoot }) {
    this.campFolk = campFolk;
    this.settlement = settlement;
    this.scrapField = scrapField;
    this.cells = cells;
    this.state = state;
    this.ui = ui;
    this.onSave = onSave || (() => {});
    this.onLoot = onLoot || (() => {});
    this.rng = makeRng(deriveSeed('expeditions'));
    this.missions = [];
    this.nextId = 1;
    this.maxMissions = 2;
    this.maxTeam = 3;
    this.selectedTargetId = null;
    this.selectedTeam = new Set();
  }

  campCenter() {
    return this.settlement.nearestOfType('campfire', 0, 0) || { x: 0, z: 0 };
  }

  freeSurvivors() {
    return this.campFolk.people
      .map((p, index) => ({ p, index }))
      .filter(({ p }) =>
        p.active && !p.dead && !p.left && !p.possessed && !p.onExpedition &&
        !p.home && !p.manning && !p.job,
      );
  }

  targets() {
    const camp = this.campCenter();
    const out = [];
    for (let i = 0; i < this.scrapField.nodes.length; i++) {
      const n = this.scrapField.nodes[i];
      if (!n.active || n.remaining <= 0) continue;
      const dist = Math.hypot(n.x - camp.x, n.z - camp.z);
      out.push({
        id: `site:${i}`,
        kind: 'site',
        index: i,
        x: n.x,
        z: n.z,
        label: SITE_LABEL[n.type] || 'SALVAGE',
        detail: `${n.remaining} SCRAP`,
        danger: 0.12 + dist / 520,
        dist,
      });
    }
    for (const cave of this.cells.entrances) {
      if (this.cells.clearedCaves.has(cave.id)) continue;
      const dist = Math.hypot(cave.x - camp.x, cave.z - camp.z);
      out.push({
        id: `cave:${cave.id}`,
        kind: 'cave',
        caveId: cave.id,
        x: cave.x,
        z: cave.z,
        label: 'CAVE',
        detail: 'GHOUL PACK · CACHE',
        danger: 0.95,
        dist,
      });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  selectTarget(id) {
    this.selectedTargetId = this.selectedTargetId === id ? null : id;
  }

  toggleMember(index) {
    if (this.selectedTeam.has(index)) this.selectedTeam.delete(index);
    else if (this.selectedTeam.size < this.maxTeam) this.selectedTeam.add(index);
  }

  clearSelection() {
    this.selectedTargetId = null;
    this.selectedTeam.clear();
  }

  cannotLaunchReason() {
    if (this.missions.length >= this.maxMissions) return 'BOTH EXPEDITION SLOTS ARE BUSY';
    const target = this.targets().find((t) => t.id === this.selectedTargetId);
    if (!target) return 'PICK A DESTINATION';
    if (!this.selectedTeam.size) return 'PICK AT LEAST ONE SURVIVOR';
    return '';
  }

  launch() {
    const reason = this.cannotLaunchReason();
    if (reason) {
      this.ui.toast(reason, true);
      return false;
    }
    const target = this.targets().find((t) => t.id === this.selectedTargetId);
    const members = [...this.selectedTeam]
      .map((i) => this.campFolk.people[i])
      .filter((p) => p && p.active && !p.dead && !p.onExpedition);
    if (!members.length) return false;

    const camp = this.campCenter();
    const dist = Math.hypot(target.x - camp.x, target.z - camp.z);
    const travel = Math.round(clamp(dist / 8, 10, 60));
    const mission = {
      id: this.nextId++,
      targetId: target.id,
      kind: target.kind,
      index: target.index,
      caveId: target.caveId,
      label: target.label,
      x: target.x,
      z: target.z,
      danger: target.danger,
      members: members.map((p) => this.campFolk.people.indexOf(p)),
      phase: 'outbound',
      timer: travel,
      travel,
      search: 6,
      loot: null,
      success: false,
    };

    for (const p of members) {
      p.onExpedition = true;
      p.job = null;
      p.home = null;
      p.manning = null;
      p.carry = 0;
      p.path = null;
      p.aim?.setLock(null);
      if (p.aim) p.aim.target = null;
      p.rig.group.visible = false;
      if (p.farTier) p.farTier.visible = false;
    }
    this.missions.push(mission);
    this.ui.toast(`${members.map((p) => p.name).join(' · ')} DEPARTED FOR ${target.label}`);
    this.clearSelection();
    this.onSave();
    return true;
  }

  memberNames(mission) {
    return mission.members
      .map((i) => this.campFolk.people[i]?.name)
      .filter(Boolean)
      .join(' · ');
  }

  powerOf(mission) {
    let power = 0;
    for (const i of mission.members) {
      const p = this.campFolk.people[i];
      if (!p) continue;
      power += (p.level || 1) * 2 + (p.weapon ? 3 : 0) + (p.damageScale || 1) * 2;
    }
    return power;
  }

  resolve(mission) {
    const members = mission.members.map((i) => this.campFolk.people[i]).filter(Boolean);
    const power = this.powerOf(mission);
    const chance = clamp(0.34 + power * 0.032 - mission.danger * 0.3, 0.12, 0.95);
    const success = this.rng() < chance;
    let scrap = 0;
    let components = 0;

    if (mission.kind === 'site') {
      const node = this.scrapField.nodes[mission.index];
      if (node && node.active && node.remaining > 0) {
        const capacity = members.length * 20 + members.reduce((n, p) => n + (p.level || 1) * 3, 0);
        scrap = Math.min(node.remaining, Math.round(capacity * (success ? 1 : 0.35)));
        node.remaining -= scrap;
        if (node.remaining <= 0) {
          node.remaining = 0;
          node.active = false;
        }
        this.scrapField.writeNode(node);
        this.scrapField.updateMarkers(this.state.time, true);
      }
    } else if (mission.kind === 'cave' && !this.cells.clearedCaves.has(mission.caveId)) {
      if (success) {
        scrap = 50;
        components = 1;
        this.cells.clearedCaves.add(mission.caveId);
      } else {
        scrap = 15;
      }
    }

    for (const p of members) {
      if (!success) p.hp = Math.max(10, (p.hp || p.maxHp) - this.rng.range(20, 40));
      this.campFolk.awardXp(p, success ? 45 : 18, 'expedition');
    }

    mission.success = success;
    mission.loot = { scrap, components };
    mission.resultText = success
      ? `${mission.label} CLEARED · ${scrap} SCRAP${components ? ` · ${components} COMPONENT` : ''}`
      : `${mission.label} WENT BAD · ${scrap} SCRAP RECOVERED`;
    this.onSave();
  }

  complete(mission) {
    const camp = this.campCenter();
    const members = mission.members.map((i) => this.campFolk.people[i]).filter(Boolean);
    members.forEach((p, n) => {
      p.onExpedition = false;
      p.home = null;
      p.job = null;
      p.carry = 0;
      p.dead = false;
      p.hp = Math.max(1, p.hp || p.maxHp);
      const a = n * 2.1;
      const x = camp.x + Math.cos(a) * 2.4;
      const z = camp.z + Math.sin(a) * 2.4;
      p.anchor = { x, z };
      p.target = { x, z };
      p.timer = 1.5;
      p.rig.group.position.set(x, 0, z);
      p.rig.group.visible = true;
      p.rig.mesh.visible = true;
      if (p.farTier) p.farTier.visible = false;
    });

    const scrap = mission.loot?.scrap || 0;
    const components = mission.loot?.components || 0;
    this.onLoot(scrap, components, mission);
    this.ui.toast(
      `${mission.success ? 'EXPEDITION RETURNED' : 'EXPEDITION LIMPED HOME'} · +${scrap} SCRAP${components ? ` · +${components} COMPONENT` : ''}`,
      !mission.success,
    );
    this.missions = this.missions.filter((m) => m !== mission);
    this.onSave();
  }

  update(dt) {
    for (const mission of [...this.missions]) {
      mission.timer -= dt;
      if (mission.timer > 0) continue;
      if (mission.phase === 'outbound') {
        mission.phase = 'searching';
        mission.timer = mission.search;
        this.ui.hint(`${this.memberNames(mission)} REACHED THE ${mission.label}`, 2600);
      } else if (mission.phase === 'searching') {
        this.resolve(mission);
        mission.phase = 'returning';
        mission.timer = mission.travel;
      } else if (mission.phase === 'returning') {
        this.complete(mission);
      }
    }
  }

  view() {
    const targets = this.targets();
    if (this.selectedTargetId && !targets.some((t) => t.id === this.selectedTargetId)) {
      this.selectedTargetId = null;
    }
    const free = this.freeSurvivors();
    for (const i of [...this.selectedTeam]) {
      if (!free.some((f) => f.index === i)) this.selectedTeam.delete(i);
    }
    const phaseLabel = { outbound: 'OUTBOUND', searching: 'SEARCHING', returning: 'RETURNING' };
    return {
      active: this.missions.map((m) => ({
        id: m.id,
        label: m.label,
        phase: phaseLabel[m.phase] || m.phase,
        timer: Math.ceil(m.timer),
        members: this.memberNames(m),
        danger: m.danger > 0.6 ? 'HIGH RISK' : m.danger > 0.3 ? 'RISKY' : 'LOW RISK',
      })),
      targets: targets.slice(0, 14).map((t) => ({
        ...t,
        selected: t.id === this.selectedTargetId,
        dangerText: t.danger > 0.6 ? 'HIGH RISK' : t.danger > 0.3 ? 'RISKY' : 'LOW RISK',
      })),
      team: free.map(({ p, index }) => ({
        index,
        name: p.name,
        level: p.level || 1,
        armed: !!p.weapon,
        selected: this.selectedTeam.has(index),
      })),
      canLaunch: this.cannotLaunchReason() === '',
      slots: `${this.missions.length}/${this.maxMissions}`,
      teamSize: `${this.selectedTeam.size}/${this.maxTeam}`,
    };
  }

  serialize() {
    return {
      nextId: this.nextId,
      missions: this.missions.map((m) => ({ ...m })),
    };
  }

  restore(data) {
    if (!data || typeof data !== 'object') return;
    this.nextId = Number.isFinite(data.nextId) ? data.nextId : 1;
    this.missions = Array.isArray(data.missions) ? data.missions.map((m) => ({ ...m })) : [];
    for (const m of this.missions) {
      for (const i of m.members) {
        const p = this.campFolk.people[i];
        if (!p) continue;
        p.onExpedition = true;
        p.job = null;
        p.rig.group.visible = false;
        if (p.farTier) p.farTier.visible = false;
      }
    }
  }
}
