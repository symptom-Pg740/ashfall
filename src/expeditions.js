import { makeRng, deriveSeed, clamp } from './rng.js';
import { XP } from './levels.js';

const SITE_LABEL = {
  wreck: 'CAR WRECK',
  ruin: 'COLLAPSED RUIN',
  cache: 'TRADER CACHE',
};

/**
 * Expeditions.
 *
 * A team leaves camp, travels, and arrives at a runtime-generated cell. The player then commands
 * the same survivors inside it: clear the hostiles, loot the cache, and return. Nothing resolves
 * from a timer any more; the only automatic part is the walk out and the walk home.
 */
export class ExpeditionSystem {
  constructor({ campFolk, settlement, scrapField, cells, state, ui, player, onSave, onLoot }) {
    this.campFolk = campFolk;
    this.settlement = settlement;
    this.scrapField = scrapField;
    this.cells = cells;
    this.state = state;
    this.ui = ui;
    this.player = player;
    this.onSave = onSave || (() => {});
    this.onLoot = onLoot || (() => {});
    this.onEnterCell = null;
    this.onExitCell = null;
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
        p.active && !p.dead && !p.left && !p.pending && !p.possessed && !p.onExpedition &&
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
    if (this.missions.some((m) => m.phase === 'exploring')) return 'A TEAM IS STILL IN THE FIELD';
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
    const travel = Math.round(clamp(dist / 9, 8, 45));
    const node = target.kind === 'site' ? this.scrapField.nodes[target.index] : null;
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
      scrap: node ? Math.min(node.remaining, 60) : 55,
      components: target.kind === 'cave' ? 1 : 0,
      members: members.map((p) => this.campFolk.people.indexOf(p)),
      phase: 'outbound',
      timer: travel,
      travel,
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

  membersOf(mission) {
    return mission.members.map((i) => this.campFolk.people[i]).filter(Boolean);
  }

  enter(mission) {
    const members = this.membersOf(mission).filter((p) => !p.dead && !p.left);
    if (!members.length) {
      this.abandon(mission, 'THE TEAM WAS LOST');
      return false;
    }
    if (!this.cells.enterExpedition(mission, members, this.player)) return false;
    mission.phase = 'exploring';
    mission.timer = 0;
    this.onEnterCell?.(mission, members);
    return true;
  }

  /** Called by main when the player leaves the cell. */
  completeFromCell(result) {
    const mission = result?.mission;
    if (!mission) return false;
    const members = this.membersOf(mission);
    const camp = this.campCenter();
    members.forEach((p, n) => {
      p.onExpedition = false;
      p.home = null;
      p.job = null;
      p.carry = 0;
      if (p.dead) {
        p.dead = false;
        p.hp = Math.max(1, Math.round(p.maxHp * 0.25));
      }
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
      this.campFolk.awardXp(p, result.cleared ? 55 : 20, 'expedition');
    });

    let banked = result.scrap || 0;
    if (mission.kind === 'site') {
      const node = this.scrapField.nodes[mission.index];
      if (node && node.active) {
        banked = Math.min(node.remaining, banked);
        node.remaining -= banked;
        if (node.remaining <= 0) {
          node.remaining = 0;
          node.active = false;
        }
        this.scrapField.writeNode(node);
        this.scrapField.updateMarkers(this.state.time, true);
      } else {
        banked = 0;
      }
    } else if (mission.kind === 'cave' && result.cleared) {
      this.cells.clearedCaves.add(mission.caveId);
    }

    this.onLoot(banked, result.components || 0, mission);
    this.ui.toast(
      result.cleared
        ? `EXPEDITION RETURNED · +${banked} SCRAP${result.components ? ` · +${result.components} COMPONENT` : ''}`
        : 'THE TEAM LIMPED HOME · NO LOOT',
      !result.cleared,
    );
    this.missions = this.missions.filter((m) => m !== mission);
    this.onExitCell?.(mission);
    this.onSave();
    return true;
  }

  abandon(mission, reason) {
    const members = this.membersOf(mission);
    for (const p of members) {
      p.onExpedition = false;
      p.dead = false;
      p.hp = Math.max(1, Math.round(p.maxHp * 0.2));
      p.rig.group.visible = true;
      p.rig.mesh.visible = true;
    }
    this.missions = this.missions.filter((m) => m !== mission);
    this.ui.toast(reason, true);
    this.onSave();
  }

  update(dt) {
    for (const mission of [...this.missions]) {
      if (mission.phase !== 'outbound') continue;
      mission.timer -= dt;
      if (mission.timer > 0) continue;
      this.ui.hint(`${this.memberNames(mission)} REACHED THE ${mission.label}`, 2600);
      if (!this.enter(mission)) continue;
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
    const phaseLabel = { outbound: 'ON THE ROAD', exploring: 'IN THE FIELD' };
    return {
      active: this.missions.map((m) => ({
        id: m.id,
        label: m.label,
        phase: phaseLabel[m.phase] || m.phase,
        timer: m.phase === 'outbound' ? `${Math.ceil(m.timer)}S` : 'FIELD',
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
        busy: !!p.home || !!p.job,
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
    // Saves are skipped while a team is inside a cell, so any restored mission is still travelling.
    for (const m of this.missions) {
      if (m.phase === 'exploring') m.phase = 'outbound';
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
