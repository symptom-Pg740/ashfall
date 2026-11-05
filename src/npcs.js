import { buildHumanoid, buildSmoothHumanoid } from './character.js';
import { buildSkinnedHumanoid, bakeStatic } from './skinned.js';
import { AimController } from './aim.js';
import { WEAPONS } from './weapons.js';
import { heightAt } from './terrain.js';
import { makeRng, deriveSeed, damp } from './rng.js';
import { RECIPES } from './recipes.js';
import { canAttack } from './actors.js';
import { levelInfo, perkFor, statScale, XP } from './levels.js';
import { evaluateSurvivorNeeds } from './core/needs.js';
import { canIssueJob, syncActivity, welcomePatch, removePatch, canWelcome, canExpel, JOB } from './features/survivors/index.js';

const NAMES = ['MARA', 'SILAS', 'REN', 'ODA', 'JUNO', 'KADE'];

/**
 * Camp survivors. They wander, watch the player, and the first skinned survivor is armed with a
 * pistol and auto-engages hostiles once `attachCombat()` provides the registry and firearms system.
 */
export class CampFolk {
  constructor(scene, count = 3, options = {}) {
    this.people = [];
    this.registry = null;
    this.firearms = null;
    this.onKill = null;
    this.onScrap = null;
    this.onBuildComplete = null;
    this.onBuildingRepaired = null;
    this.onWorkAssigned = null;
    this.onWorkReleased = null;
    this.onRoleChanged = null;
    this.onBuilderAssigned = null;
    this.onWaterProduced = null;
    this.onFoodProduced = null;
    this.onLeave = null;
    this.isStorageFull = null;
    this.isWaterFull = null;
    this.isFoodFull = null;
    this.isWaterEmpty = null;
    this.takeWater = null;
    this.canCraft = null;
    this.doCraft = null;
    this.onCraft = null;
    this.reloadUnit = null;
    this.scrapField = options.scrapField || null;
    this.dropPoint = options.dropPoint || null;
    this.obstacles = options.obstacles || [];
    this.nav = options.nav || null;
    const style = options.style || 'skinned';
    const activeCount = options.activeCount ?? Math.min(3, count);
    for (let i = 0; i < count; i++) {
      const seed = deriveSeed(`npc:${i}`);
      const archetype = ['lean', 'stocky', 'tall'][i % 3];
      const armed = i === 0 && style === 'skinned';
      const rigOptions = { castShadow: false, archetype };
      if (armed) rigOptions.equipment = { weapon: 'pistol' };
      const rig =
        style === 'skinned'
          ? buildSkinnedHumanoid(seed, { ...rigOptions, detail: 'low' })
          : style === 'smooth'
            ? buildSmoothHumanoid(seed, { castShadow: false, archetype })
            : buildHumanoid(seed, { castShadow: false, archetype });
      const rng = makeRng(seed ^ 0x51ed270b);

      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 24; tries++) {
        const angle = rng() * Math.PI * 2;
        const radius = rng.range(7, 16);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        if (Math.hypot(x, z) > 6) break;
      }

      rig.group.position.set(x, heightAt(x, z), z);
      rig.group.rotation.y = rng() * Math.PI * 2;
      scene.add(rig.group);

      // Far LOD tier: the whole rig baked into one static mesh. It keeps the silhouette and
      // material but drops the skeleton, skinning and every per-bone gear draw.
      let farTier = null;
      if (style === 'skinned') {
        farTier = bakeStatic(rig);
        if (farTier) {
          farTier.visible = false;
          rig.group.add(farTier);
          rig.onEquipmentChanged = () => {
            const next = bakeStatic(rig);
            if (!next) return;
            farTier.geometry.dispose();
            farTier.geometry = next.geometry;
          };
        }
      }

      const weapon = armed ? WEAPONS.pistol : null;
      const active = i < activeCount;
      if (!active) {
        rig.group.visible = false;
        if (farTier) farTier.visible = false;
      }
      const speed = rng.range(1.9, 2.5);
      this.people.push({
        name: NAMES[i % NAMES.length],
        rig,
        farTier,
        active: i < activeCount,
        isFar: false,
        rng,
        anchor: { x, z },
        spawnAnchor: { x, z },
        target: { x, z },
        home: null,
        timer: rng.range(0.5, 3),
        speed,
        baseSpeed: speed,
        xp: 0,
        level: 1,
        baseMaxHp: 100,
        baseMeleeDamage: armed ? 20 : 15,
        baseReaction: 0.25,
        baseTurn: 360,
        damageScale: 1,
        workScale: 1,
        heading: rig.group.rotation.y,
        phase: rng() * 6.28,
        role: armed ? 'guard' : 'scavenger',
        activity: 'idle',
        armed,
        weapon,
        job: null,
        possessed: false,
        onExpedition: false,
        carry: 0,
        holdTimer: 0,
        manning: null,
        towerWeapon: null,
        path: null,
        pathIndex: 0,
        pathKey: '',
        pathTimer: 0,
        attention: null,
        hunger: 0,
        thirst: 0,
        morale: 70,
        moraleTarget: 70,
        moraleFactors: ['FED', 'WATERED'],
        leaveWarn: '',
        left: false,
        pending: false,
        workTimer: 0,
        waterTimer: 0,
        pathFail: 0,
        replan: 0,
        stuckTimer: 0,
        stuckCount: 0,
        lastMoveX: x,
        lastMoveZ: z,
        fireAngle: rng() * Math.PI * 2,
        fireRank: i,
        hp: 100,
        maxHp: 100,
        dead: false,
        respawnTimer: 0,
        mag: weapon ? weapon.magazine : 0,
        reserve: Infinity,
        reloadTimer: 0,
        cooldown: 0,
        recoil: 0,
        dry: false,
        meleeCooldown: 0,
        meleeDamage: armed ? 20 : 15,
        aim: armed
          ? new AimController({
              faction: 'camp',
              firePolicy: 'auto',
              cone: 180,
              turnRate: 360,
              fireGate: 3,
              reaction: 0.25,
              range: weapon.range,
            })
          : null,
        aimActor: { x: 0, y: 0, z: 0, heading: 0 },
      });
      this.applyLevelStats(this.people[this.people.length - 1], true);
    }
  }

  /** Recompute derived stats after XP changes, keeping the current damage taken. */
  applyLevelStats(person, silent = false) {
    if (!person) return;
    const info = levelInfo(person.xp || 0);
    const previousMax = person.maxHp || person.baseMaxHp;
    person.level = info.level;
    const scale = statScale(info.level);
    person.maxHp = Math.round(person.baseMaxHp * scale.health);
    person.hp = Math.min(person.maxHp, Math.max(1, (person.hp || person.maxHp) + (person.maxHp - previousMax)));
    person.meleeDamage = person.baseMeleeDamage * scale.damage;
    person.damageScale = scale.damage;
    person.speed = person.baseSpeed * scale.speed * (person.hunger > 0 || person.thirst > 0 ? 0.8 : 1);
    person.workScale = scale.work;
    if (person.aim) {
      person.aim.reaction = Math.max(0, person.baseReaction * (1 - 0.045 * (info.level - 1)));
      person.aim.turnRate = person.baseTurn * scale.accuracy;
    }
  }

  awardXp(person, amount, reason = '') {
    if (!person || !person.active || person.dead || person.left || !(amount > 0)) return 0;
    const before = person.level || 1;
    person.xp = (person.xp || 0) + amount;
    this.applyLevelStats(person);
    if (person.level > before) {
      this.onLevelUp?.(person, person.level, reason);
    }
    return amount;
  }

  issueJob(person, job) {
    const check = canIssueJob(person, job);
    if (!check.ok) return false;
    if (person.manning && job?.type !== 'man') this.releaseTower(person);
    person.job = job;
    person.holdTimer = 0;
    person.path = null;
    person.pathIndex = 0;
    person.pathKey = '';
    person.pathTimer = 0;
    person.attention = null;
    person.retryAt = 0;
    person.pathFail = 0;
    person.replan = 0;
    person.stuckCount = 0;
    if (person.aim) person.aim.setLock(job?.type === 'attack' ? job.target?.id ?? null : null);
    syncActivity(person);
    return true;
  }

  cancelJob(person) {
    if (!person) return;
    person.job = null;
    person.carry = 0;
    person.attention = null;
    person.aim?.setLock(null);
  }

  // -------------------------------------------------------------------------
  // workplaces and the free builder role
  // -------------------------------------------------------------------------

  workersOf(building) {
    if (!building) return [];
    return this.people.filter((p) => p.active && p.home === building && !p.dead);
  }

  /** Put a survivor on a building's job slot. Clears any builder role and manual job. */
  assignWorkplace(person, building) {
    const job = building?.def?.job;
    if (!person || !person.active || person.dead || person.pending || person.onExpedition || !job || !building.built || building.destroyed) return false;
    if (person.home !== building && this.workersOf(building).length >= job.slots) return false;
    if (person.manning) this.releaseTower(person);
    person.home = building;
    person.role = (job.label || job.role).toLowerCase();
    person.job = null;
    person.carry = 0;
    person.attention = null;
    person.path = null;
    person.pathIndex = 0;
    person.pathKey = '';
    person.pathTimer = 0;
    person.pathFail = 0;
    const post = job.post || { x: 1.5, z: 1.5 };
    person.anchor = { x: building.x + post.x, z: building.z + post.z };
    person.target = { ...person.anchor };
    person.timer = 0.5;
    person.workTimer = 0;
    person.waterTimer = 0;
    person.aim?.setLock(null);
    this.onWorkAssigned?.(person, building);
    return true;
  }

  /** Clear a workplace assignment; the survivor keeps any builder role only if they had one. */
  releaseWorkplace(person, quiet = false) {
    if (!person?.home) return false;
    const building = person.home;
    person.home = null;
    person.job = null;
    person.carry = 0;
    person.attention = null;
    person.path = null;
    person.pathIndex = 0;
    person.pathKey = '';
    person.pathTimer = 0;
    person.pathFail = 0;
    person.workTimer = 0;
    person.waterTimer = 0;
    if (person.role !== 'survivor') person.role = person.armed ? 'guard' : 'scavenger';
    person.anchor = { ...person.spawnAnchor };
    person.target = { ...person.anchor };
    person.aim?.setLock(null);
    if (!quiet) this.onWorkReleased?.(person, building);
    return true;
  }

  /** The nearest active, unclaimed scrap pile within a workplace's work radius. */
  nearestNode(building, radius, person = null) {
    if (!this.scrapField || !building) return -1;
    let best = -1;
    let bestD = radius * radius;
    const nodes = this.scrapField.nodes;
    const now = performance.now();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n.active) continue;
      if (n.blockedUntil && now < n.blockedUntil) continue;
      const owner = n.claimedBy;
      if (owner && owner !== person && !owner.dead && owner.job?.type === 'gather' && owner.job.node === i) {
        continue;
      }
      const dx = n.x - building.x;
      const dz = n.z - building.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Ran once per update while the survivor has no manual job. */
  runWorkLoop(person, time, buildings = [], dt = 0.016) {
    if (person.dead || person.pending) return;
    if (person.retryAt) {
      if (performance.now() < person.retryAt) return;
      person.retryAt = 0;
      person.attention = null;
    }
    const b = person.home;
    if (!b) {
      // Any free survivor answers the construction queue. There is no dedicated builder role and
      // therefore no unit parked "just in case" a site appears.
      this.freeLoop(person, buildings);
      return;
    }
    const job = b.def?.job;
    if (!b.built || b.destroyed || !job) {
      this.releaseWorkplace(person, true);
      return;
    }
    if (job.role === 'scavenger') this.scavengerLoop(person, b, job, time);
    else if (job.role === 'water') this.wellLoop(person, b, job, dt);
    else if (job.role === 'farmer') this.farmLoop(person, b, job, dt);
    else if (job.role === 'artisan') this.workshopLoop(person, b, job, dt);
  }

  /** Stand at the wheel and draw water. Production pauses away from the post or when full. */
  wellLoop(person, building, job, dt) {
    if (this.isWaterFull?.()) {
      person.attention = 'STORAGE FULL';
      return;
    }
    const post = job.post || { x: 2.2, z: 0.4 };
    const pos = person.rig.group.position;
    const d = Math.hypot(building.x + post.x - pos.x, building.z + post.z - pos.z);
    if (d > building.radius + 1.5) {
      if (person.attention === 'NO PATH') return;
      person.attention = null;
      person.target = { x: building.x + post.x, z: building.z + post.z };
      person.workTimer = 0;
      this.issueJob(person, { type: 'move', x: building.x + post.x, z: building.z + post.z });
      return;
    }
    person.attention = null;
    person.target = { x: building.x + post.x, z: building.z + post.z };
    person.timer = 3;
    person.workTimer += dt * (person.workScale || 1);
    if (person.workTimer >= 4) {
      person.workTimer -= 4;
      this.onWaterProduced?.(1, building);
      this.awardXp(person, XP.produce, 'water');
    }
  }

  /** Tend the plot: food out, water in. Two farmers each run their own cycle. */
  farmLoop(person, building, job, dt) {
    if (this.isFoodFull?.()) {
      person.attention = 'STORAGE FULL';
      return;
    }
    if (this.isWaterEmpty?.()) {
      person.attention = 'NO WATER';
      return;
    }
    const post = job.post || { x: 0, z: 3.3 };
    const pos = person.rig.group.position;
    const d = Math.hypot(building.x + post.x - pos.x, building.z + post.z - pos.z);
    if (d > building.radius + 1.2) {
      if (person.attention === 'NO PATH') return;
      person.attention = null;
      person.target = { x: building.x + post.x, z: building.z + post.z };
      person.workTimer = 0;
      person.waterTimer = 0;
      this.issueJob(person, { type: 'move', x: building.x + post.x, z: building.z + post.z });
      return;
    }
    person.attention = null;
    person.target = { x: building.x + post.x, z: building.z + post.z };
    person.timer = 3;
    person.workTimer += dt * (person.workScale || 1);
    person.waterTimer += dt;
    if (person.waterTimer >= 20) {
      if (!this.takeWater?.(1)) {
        person.attention = 'NO WATER';
        return;
      }
      person.waterTimer -= 20;
    }
    if (person.workTimer >= 7) {
      person.workTimer -= 7;
      this.onFoodProduced?.(1, building);
      this.awardXp(person, XP.produce, 'food');
    }
  }

  /** An artisan runs the workshop's selected recipe, drawing scrap from the warehouse. */
  workshopLoop(person, building, job, dt) {
    const recipe = RECIPES[building.recipe || 'pistol'];
    if (!recipe) {
      person.attention = 'NO RECIPE';
      person.workTimer = 0;
      return;
    }
    const check = this.canCraft?.(recipe.id);
    if (!check || !check.ok) {
      person.attention = check?.reason || 'NO RECIPE';
      person.workTimer = 0;
      return;
    }
    const post = job.post || { x: 0, z: 2.75 };
    const pos = person.rig.group.position;
    const d = Math.hypot(building.x + post.x - pos.x, building.z + post.z - pos.z);
    if (d > building.radius + 1.5) {
      if (person.attention === 'NO PATH') return;
      person.attention = null;
      person.target = { x: building.x + post.x, z: building.z + post.z };
      person.workTimer = 0;
      this.issueJob(person, { type: 'move', x: building.x + post.x, z: building.z + post.z });
      return;
    }
    person.attention = null;
    person.target = { x: building.x + post.x, z: building.z + post.z };
    person.timer = 3;
    person.workTimer += dt * (person.workScale || 1);
    if (person.workTimer >= recipe.time) {
      if (this.doCraft?.(recipe.id)) {
        person.workTimer -= recipe.time;
        this.onCraft?.(recipe, building);
        this.awardXp(person, XP.craft, 'craft');
      } else {
        person.workTimer = 0;
        person.attention = 'NO SCRAP';
      }
    }
  }

  /** Reload from the shared ammo pool. Returns the new magazine size (0 if dry). */
  reloadPerson(person) {
    if (!person?.weapon) return 0;
    if (!this.reloadUnit) {
      person.mag = person.weapon.magazine;
      person.dry = false;
      return person.mag;
    }
    const mag = this.reloadUnit(person);
    if (mag > 0) {
      person.dry = false;
      return mag;
    }
    person.dry = true;
    person.reloadTimer = 0.75;
    return 0;
  }

  /** Bring one of the reserved survivors to the fire as a newcomer awaiting welcome. */
  recruit(x, z, pending = true) {
    const p = this.people.find((q) => !q.active);
    if (!p) return null;
    p.active = true;
    p.dead = false;
    p.left = false;
    p.pending = pending;
    p.activity = pending ? 'pending' : 'idle';
    p.onExpedition = false;
    p.hp = p.maxHp;
    p.role = pending ? 'newcomer' : 'scavenger';
    p.home = null;
    p.job = null;
    p.attention = null;
    p.carry = 0;
    p.hunger = 0;
    p.thirst = 0;
    p.morale = 70;
    p.moraleTarget = 70;
    p.moraleFactors = ['FED', 'WATERED'];
    p.leaveWarn = '';
    this.applyLevelStats(p, true);
    p.anchor = { x, z };
    p.spawnAnchor = { x, z };
    p.target = { x, z };
    p.holdTimer = pending ? 30 : 0;
    p.timer = 1;
    p.path = null;
    p.pathIndex = 0;
    p.pathKey = '';
    p.pathTimer = 0;
    p.rig.group.position.set(x, heightAt(x, z), z);
    p.heading = p.rng() * Math.PI * 2;
    p.rig.group.rotation.y = p.heading;
    p.rig.group.visible = true;
    p.rig.mesh.visible = true;
    p.isFar = false;
    if (p.farTier) p.farTier.visible = false;
    p.aim?.setLock(null);
    return p;
  }

  /** Accept a newcomer waiting at the fire. */
  welcome(person) {
    if (!canWelcome(person)) return false;
    Object.assign(person, welcomePatch(person));
    this.onWelcome?.(person);
    return true;
  }

  /** Turn a newcomer away; they walk off and the pool slot is freed. */
  reject(person) {
    if (!person?.pending) return false;
    this.removeUnit(person);
    this.onReject?.(person);
    return true;
  }

  /** Remove an accepted survivor from the camp. They do not leave on their own. */
  expel(person) {
    if (!canExpel(person)) return false;
    this.removeUnit(person);
    this.onExpel?.(person);
    return true;
  }

  removeUnit(person) {
    if (person.manning) this.releaseTower(person);
    if (person.home) this.releaseWorkplace(person, true);
    Object.assign(person, removePatch());
    person.rig.group.visible = false;
    person.rig.mesh.visible = false;
    if (person.farTier) person.farTier.visible = false;
    person.aim?.setLock(null);
    person.aim && (person.aim.target = null);
  }

  /** A survivor with no food/water or no hope walks out of the camp. The reason is kept for the UI. */
  leaveCamp(person, reason = 'LEFT CAMP') {
    if (!person || person.dead) return false;
    if (person.manning) this.releaseTower(person);
    if (person.home) this.releaseWorkplace(person, true);
    person.hp = 0;
    person.dead = true;
    person.left = true;
    person.respawnTimer = Infinity;
    person.job = null;
    person.carry = 0;
    person.attention = reason;
    person.leaveWarn = reason;
    person.moraleFactors = [reason];
    person.rig.group.visible = false;
    person.rig.mesh.visible = false;
    if (person.farTier) person.farTier.visible = false;
    this.onLeave?.(person, reason);
    return true;
  }

  /**
   * Daily morale check. Every survivor gets a target mood from food, water, a bed, work, faith,
   * firelight and defence; the visible factor list is what the clipboard shows. Two unfed dawns or
   * a sustained zero mood is what actually makes them leave, and both are warned about first.
   */
  evaluateMorale(day, state, settlement) {
    const living = this.people.filter((p) => p.active && !p.dead && !p.left);
    const camp = {
      population: living.length,
      beds: 3 + (settlement?.count ? settlement.count('house') : 0),
      chapel: !!(settlement?.count && settlement.count('chapel') > 0),
      campfire: !!(settlement?.count && settlement.count('campfire') > 0),
      defended: !!(
        settlement?.buildings?.some((b) => b.type === 'turret' && b.built && !b.destroyed) ||
        settlement?.buildings?.some((b) => b.manned)
      ),
    };
    const warnings = [];
    const left = [];
    for (const p of living) {
      const result = evaluateSurvivorNeeds(
        {
          hunger: p.hunger || 0,
          thirst: p.thirst || 0,
          hp: p.hp || 0,
          maxHp: p.maxHp || 1,
          hasHome: !!p.home,
          onExpedition: !!p.onExpedition,
          pending: !!p.pending,
          morale: p.morale ?? 70,
          level: p.level || 1,
          baseSpeed: p.baseSpeed || 0,
        },
        camp,
      );
      if (!result) continue;
      p.moraleTarget = result.moraleTarget;
      p.morale = result.morale;
      p.moraleFactors = result.factors;
      p.leaveWarn = result.leaveWarn;
      p.speed = result.speed;
      if (result.warning) {
        warnings.push({ name: p.name, text: `${p.name} ${result.warning}` });
      }
    }
    return { warnings, left, pop: camp.population, beds: camp.beds };
  }

  scavengerLoop(person, building, job, time) {
    if (this.isStorageFull?.()) {
      person.attention = 'STORAGE FULL';
      return;
    }
    const node = this.nearestNode(building, job.radius, person);
    if (node < 0) {
      person.attention = 'NO NODES';
      return;
    }
    person.attention = null;
    const pile = this.scrapField?.nodes[node];
    if (pile) pile.claimedBy = person;
    this.issueJob(person, { type: 'gather', node, phase: 'toNode', timer: 0, work: true });
  }

  /**
   * Call units to the fire. Idle-only is the default; `all` pulls workers off their posts for a
   * while, and they resume the work loop when the hold expires.
   */
  callToFire(fire, all = false) {
    if (!fire) return 0;
    const units = this.people.filter(
      (p) =>
        p.active && !p.dead && !p.left && !p.pending && !p.onExpedition && !p.manning &&
        (all || (!p.home && !p.job)),
    );
    units.forEach((p, i) => {
      const a = p.fireAngle + i * 2.399963;
      const r = 2.0 + (i % 3) * 0.7;
      this.issueJob(p, {
        type: JOB.RALLY,
        x: fire.x + Math.cos(a) * r,
        z: fire.z + Math.sin(a) * r,
        hold: all ? 30 : 45,
        fire,
      });
      p.attention = null;
    });
    return units.length;
  }

  /** Release everyone called to this fire; workers walk back to their posts. */
  dismissFire(fire) {
    let n = 0;
    for (const p of this.people) {
      if (p.job?.type !== JOB.RALLY || p.job.fire !== fire) continue;
      p.job = null;
      p.holdTimer = 0;
      p.attention = null;
      p.path = null;
      p.pathIndex = 0;
      p.pathKey = '';
      p.pathTimer = 0;
      n++;
    }
    return n;
  }

  /** A free survivor (no workplace, no manual job) takes the oldest unclaimed site. */
  freeLoop(person, buildings = []) {
    if (person.manning || person.pending) return;
    let site = null;
    const now = performance.now();
    for (const b of buildings) {
      if (!b || b.built || b.destroyed) continue;
      if (b.workBlockedUntil && now < b.workBlockedUntil) continue;
      const claimed = this.people.some(
        (q) => !q.dead && q.job?.type === 'build' && q.job.building === b,
      );
      if (!claimed) {
        site = b;
        break;
      }
    }
    if (!site) return;
    person.attention = null;
    this.issueJob(person, { type: 'build', building: site });
    this.onBuilderAssigned?.(person, site);
  }

  /** A job could not be reached: stop, report on the unit card, and do not beeline into scenery. */
  failJob(person, reason = 'NO PATH') {
    if (!person) return false;
    const job = person.job;
    person.job = null;
    person.path = null;
    person.pathIndex = 0;
    person.pathKey = '';
    person.pathTimer = 0;
    person.pathFail = 0;
    person.replan = 0;
    person.stuckCount = 0;
    person.attention = reason;
    person.holdTimer = 2;
    // Work loops retry on their own; a manual order reports and waits for the player.
    person.retryAt = job?.type === 'move' || job?.type === 'attack' ? 0 : performance.now() + 4000;
    person.aim?.setLock(null);
    // Do not immediately re-issue the same unreachable target every frame.
    if (job?.type === 'build' && job.building) {
      job.building.workBlockedUntil = performance.now() + 15000;
    } else if (job?.type === 'gather') {
      const node = this.scrapField?.nodes[job.node];
      if (node) node.blockedUntil = performance.now() + 10000;
    }
    this.onNoPath?.(person, job, reason);
    return true;
  }

  down(person) {
    if (!person || person.dead) return;
    person.hp = 0;
    person.dead = true;
    person.respawnTimer = 20;
    person.carry = 0;
    person.job = null;
    person.attention = null;
    person.home = null;
    if (person.role !== 'survivor') person.role = person.armed ? 'guard' : 'scavenger';
    if (person.manning) {
      person.manning.manned = null;
      person.manning = null;
      person.towerWeapon = null;
      person.ignoreBuilding = null;
      if (person.aim) person.aim.los = person.towerLos || null;
      person.towerLos = null;
    }
    person.possessed = false;
    person.rig.group.visible = false;
    if (person.farTier) person.farTier.visible = false;
    if (person.aim) {
      person.aim.target = null;
      person.aim.canFire = false;
      person.aim.setLock(null);
    }
    this.onDown?.(person.name);
  }

  attachCombat({ registry, firearms, onKill, onDown }) {
    this.registry = registry;
    this.firearms = firearms;
    this.onKill = onKill || null;
    this.onDown = onDown || null;
    for (const p of this.people) {
      if (!p.armed || !p.aim) continue;
      p.aim.los = (x1, y1, z1, x2, y2, z2) => firearms.hasLineOfSight(x1, y1, z1, x2, y2, z2);
    }
  }

  damage(index, amount) {
    const p = this.people[index];
    if (!p || !p.active || p.dead) return false;
    p.hp -= p.manning ? amount * 0.6 : amount;
    if (p.hp <= 0) {
      this.down(p);
      return true;
    }
    return false;
  }

  mountTower(person, tower) {
    if (!person || !tower || !tower.built || !person.weapon) return false;
    if (tower.manned && tower.manned !== person) return false;
    if (person.manning) this.releaseTower(person);
    tower.manned = person;
    person.manning = tower;
    person.towerWeapon = { ...person.weapon, range: person.weapon.range + 6 };
    person.job = null;
    person.attention = null;
    person.carry = 0;
    person.holdTimer = 0;
    person.phase = 0;
    person.heading = tower.group.rotation.y;
    person.rig.group.rotation.y = person.heading;
    person.rig.group.position.set(tower.x, tower.y + 0.28, tower.z);
    person.ignoreBuilding = tower;
    person.rig.mesh.visible = true;
    if (person.farTier) person.farTier.visible = false;
    person.target = { x: tower.x, z: tower.z };
    if (person.aim) {
      person.towerLos = person.aim.los;
      // Start the sight ray outside the tower's own footprint, otherwise the building blocks
      // every shot from the platform at the origin.
      person.aim.los = (x1, y1, z1, x2, y2, z2) => {
        if (!person.towerLos) return true;
        const dx = x2 - x1;
        const dz = z2 - z1;
        const d = Math.hypot(dx, dz) || 1;
        return person.towerLos(x1 + (dx / d) * 2.3, y1, z1 + (dz / d) * 2.3, x2, y2, z2);
      };
      person.aim.setRange(person.towerWeapon.range);
      person.aim.target = null;
      person.aim._initialised = false;
      person.aim.setLock(null);
    }
    this.onTowerManned?.(person, tower);
    return true;
  }

  releaseTower(person) {
    const tower = person?.manning;
    if (!tower) return false;
    tower.manned = null;
    person.manning = null;
    person.towerWeapon = null;
    person.ignoreBuilding = null;
    const x = tower.x + 1.25;
    const z = tower.z + 1.25;
    person.rig.group.position.set(x, heightAt(x, z), z);
    person.heading = Math.atan2(-1, -1);
    person.rig.group.rotation.y = person.heading;
    person.target = { x, z };
    person.timer = 1.6;
    person.holdTimer = 2;
    if (person.aim) {
      person.aim.los = person.towerLos || null;
      person.towerLos = null;
      person.aim.setRange(person.weapon?.range || 22);
      person.aim.target = null;
      person.aim._initialised = false;
      person.aim.setLock(null);
    }
    this.onTowerReleased?.(person, tower);
    return true;
  }

  /** Steer around the nearest obstacle instead of walking into it. */
  steerAround(p, dx, dz, buildings = []) {
    let sx = dx;
    let sz = dz;
    const pos = p.rig.group.position;
    const consider = (ox, oz, or) => {
      const vx = ox - pos.x;
      const vz = oz - pos.z;
      const d = Math.hypot(vx, vz) || 1;
      const radius = (or || 0.5) + 0.45;
      if (d > radius + 1.5) return;
      const ahead = (vx / d) * sx + (vz / d) * sz;
      if (ahead < -0.15) return;
      let tx = -vz / d;
      let tz = vx / d;
      if (tx * sx + tz * sz < 0) {
        tx = -tx;
        tz = -tz;
      }
      const push = 1 - Math.max(0, Math.min(1, (d - radius) / 1.5));
      sx += tx * push * 1.5 + (vx / d) * push * 0.25;
      sz += tz * push * 1.5 + (vz / d) * push * 0.25;
    };
    for (const b of buildings) consider(b.x, b.z, b.radius);
    for (const o of this.obstacles) consider(o.x, o.z, o.r || 0.5);
    const len = Math.hypot(sx, sz) || 1;
    return { x: sx / len, z: sz / len };
  }

  /** Keep units out of buildings and props. Direct steering slides along the boundary. */
  resolveCollisions(p, buildings = []) {
    const pos = p.rig.group.position;
    const push = (ox, oz, r) => {
      const dx = pos.x - ox;
      const dz = pos.z - oz;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001 && d < r) {
        pos.x = ox + (dx / d) * r;
        pos.z = oz + (dz / d) * r;
      }
    };
    for (const b of buildings) push(b.x, b.z, b.radius + 0.4);
    for (const o of this.obstacles) push(o.x, o.z, (o.r || 0.5) + 0.4);
  }

  /**
   * Run one job step. Returns a world point to walk toward, or null when the unit should hold
   * position (harvesting, aiming, arriving). Combat keeps priority: the caller only runs this when
   * the unit has no auto-acquired target.
   */
  /** A point near the target with line of sight, used when a wall or rock blocks the direct line. */
  findFiringPosition(p, t, buildings = []) {
    const pos = p.rig.group.position;
    const los = p.aim?.los;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + p.rng() * 0.35;
      const r = 6 + p.rng() * 4;
      const x = t.x + Math.cos(a) * r;
      const z = t.z + Math.sin(a) * r;
      const y = heightAt(x, z);
      let blocked = false;
      for (const b of buildings) {
        if (Math.hypot(b.x - x, b.z - z) < b.radius + 0.6) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (los && !los(x, y + 1.25, z, t.x, t.y + 1.0, t.z)) continue;
      const score = Math.hypot(x - pos.x, z - pos.z);
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    return best || { x: t.x, z: t.z };
  }

  updateJob(p, dt, time, buildings = []) {
    const j = p.job;
    if (!j) return null;
    const pos = p.rig.group.position;
    const distTo = (x, z) => Math.hypot(x - pos.x, z - pos.z);

    if (j.type === 'move') {
      if (distTo(j.x, j.z) < 0.6) {
        p.job = null;
        p.holdTimer = 4 + Math.random() * 3;
        return null;
      }
      return { x: j.x, z: j.z };
    }

    if (j.type === JOB.RALLY) {
      if (distTo(j.x, j.z) < 0.75) {
        p.job = null;
        p.holdTimer = j.hold || 20;
        p.heading = Math.atan2(j.fire.x - pos.x, j.fire.z - pos.z);
        return null;
      }
      return { x: j.x, z: j.z };
    }

    if (j.type === JOB.GATHER) {
      const field = this.scrapField;
      const node = field?.nodes[j.node];
      if (!node) {
        p.job = null;
        return null;
      }
      if (j.phase === 'toNode') {
        if (!node.active) {
          p.job = null;
          return null;
        }
        if (distTo(node.x, node.z) < 2.2) {
          j.phase = 'harvest';
          j.timer = 1.2;
          return null;
        }
        return { x: node.x, z: node.z };
      }
      if (j.phase === 'harvest') {
        j.timer -= dt * (p.workScale || 1);
        if (j.timer <= 0) {
          const value = field.gather(j.node, time);
          if (!value) {
            p.job = null;
            return null;
          }
          p.carry = value;
          j.phase = 'return';
        }
        return null;
      }
      if (j.phase === 'return') {
        const drop = this.dropPoint ? this.dropPoint(p) : { x: 0, z: 0, radius: 2.4 };
        if (distTo(drop.x, drop.z) < (drop.radius || 2.4)) {
          j.retry = Math.max(0, (j.retry || 0) - dt);
          if (j.retry > 0) return null;
          const accepted = this.onScrap?.(p.carry || 0, p);
          if (accepted === false) {
            // Storage is full: wait at the drop instead of throwing the load away.
            j.retry = 2;
            return null;
          }
          p.carry = 0;
          this.awardXp(p, XP.gather, 'gather');
          if (node.active) {
            j.phase = 'toNode';
            j.timer = 0;
          } else {
            p.job = null;
          }
          return null;
        }
        return { x: drop.x, z: drop.z };
      }
      return null;
    }

    if (j.type === 'repair') {
      const b = j.building;
      if (!b || !b.built || b.destroyed || b.hp >= b.maxHp) {
        p.job = null;
        return null;
      }
      if (distTo(b.x, b.z) > b.radius + 1.5) return { x: b.x, z: b.z };
      b.hp = Math.min(b.maxHp, b.hp + dt * 14 * (p.workScale || 1));
      if (b.hp >= b.maxHp) {
        p.job = null;
        p.holdTimer = 2;
        this.onBuildingRepaired?.(b);
        this.awardXp(p, XP.repair, 'repair');
      }
      return null;
    }

    if (j.type === 'build') {
      const b = j.building;
      if (!b || b.built) {
        p.job = null;
        return null;
      }
      if (distTo(b.x, b.z) > b.radius + 1.5) {
        return { x: b.x, z: b.z };
      }
      b.buildProgress = Math.min(1, (b.buildProgress || 0) + (dt * (p.workScale || 1)) / Math.max(0.5, b.buildTime));
      if (b.buildProgress >= 1) {
        p.job = null;
        p.holdTimer = 2;
        this.onBuildComplete?.(b);
        this.awardXp(p, XP.build, 'build');
      }
      return null;
    }

    if (j.type === 'man') {
      const tower = j.tower;
      if (!p.weapon) {
        p.job = null;
        return null;
      }
      if (!tower || !tower.built || (tower.manned && tower.manned !== p)) {
        p.job = null;
        return null;
      }
      if (distTo(tower.x, tower.z) < 3.0) {
        this.mountTower(p, tower);
        return null;
      }
      return { x: tower.x, z: tower.z };
    }

    if (j.type === 'attack') {
      const t = j.target;
      if (!t || t.dead) {
        p.job = null;
        p.holdTimer = 4 + Math.random() * 3;
        p.aim?.setLock(null);
        return null;
      }
      p.aim?.setLock(t.id);
      const range = Math.max(2, (p.weapon?.range ?? 2) * 0.72);
      let los = true;
      if (p.aim?.los) {
        los = p.aim.los(pos.x, pos.y + 1.25, pos.z, t.x, t.y + 1.0, t.z);
      }
      if (distTo(t.x, t.z) > range) {
        j.flank = null;
        return { x: t.x, z: t.z };
      }
      if (!los) {
        j.flankTimer = (j.flankTimer || 0) - dt;
        if (!j.flank || j.flankTimer <= 0) {
          j.flank = this.findFiringPosition(p, t, buildings);
          j.flankTimer = 2.5;
        }
        return j.flank;
      }
      j.flank = null;
      return null;
    }

    return null;
  }

  /** A gunner in the guard post: fixed position, +6 m range, 40% cover. */
  updateManning(p, dt) {
    const tower = p.manning;
    const pos = p.rig.group.position;
    pos.set(tower.x, tower.y + 0.28, tower.z);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.recoil = damp(p.recoil, 0, 12, dt);
    if (p.reloadTimer > 0) {
      p.reloadTimer = Math.max(0, p.reloadTimer - dt);
      if (p.reloadTimer === 0) this.reloadPerson(p);
    }

    let combatTarget = null;
    if (p.armed && p.aim && this.registry && this.firearms) {
      p.aimActor.x = pos.x;
      p.aimActor.y = pos.y;
      p.aimActor.z = pos.z;
      p.aimActor.heading = p.rig.group.rotation.y;
      p.aim.update(dt, p.aimActor, this.registry, p.towerWeapon || p.weapon);
      combatTarget = p.aim.target;
    }

    if (combatTarget) {
      p.heading = p.aim.aimYaw;
      p.rig.lookAt(p.aim.targetPoint.x, p.aim.targetPoint.z, dt);
    } else {
      p.heading = tower.group.rotation.y;
    }
    let diff = p.heading - p.rig.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.rig.group.rotation.y += diff * (1 - Math.exp(-9 * dt));
    p.phase += dt * 1.2;
    p.rig.setPose(dt, false, p.phase);
    if (p.armed) {
      p.rig.applyWeaponPose(p.aim?.pitch || 0, p.recoil, p.reloadTimer > 0, !!p.weapon.twoHanded);
      if (combatTarget && p.aim.canFire && p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) {
        const shot = this.firearms.fire(
          { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading, faction: 'camp' },
          { weapon: p.weapon, aimPoint: p.aim.targetPoint, ignoreBuilding: p.ignoreBuilding || null, damage: p.weapon.damage * (p.damageScale || 1) },
        );
        p.mag--;
        p.cooldown = 60 / p.weapon.rpm;
        p.recoil = 1;
        if (p.mag <= 0) p.reloadTimer = p.weapon.reload;
        if (shot.killed) {
          this.onKill?.(shot.x, shot.z);
          this.awardXp(p, XP.kill * shot.killed, 'kill');
        }
      }
    }
  }

  /** The nearest lit campfire to a world point, or null. Idle survivors gather around it. */
  campfireNear(buildings = [], x = 0, z = 0) {
    let best = null;
    let bestD = Infinity;
    for (const b of buildings) {
      if (!b || b.type !== 'campfire' || !b.built || b.destroyed) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** A ring slot around the fire so the whole camp does not stand on one tile. */
  campfireSpot(person, fire) {
    if (!fire) return null;
    const a = person.fireAngle + person.fireRank * 0.7;
    const r = 1.9 + (person.fireRank % 3) * 0.62;
    return { x: fire.x + Math.cos(a) * r, z: fire.z + Math.sin(a) * r };
  }

  /** Nearest attackable body within `radius`, used when a survivor has no loaded gun. */
  nearestHostile(person, radius = 7) {
    if (!this.registry) return null;
    const pos = person.rig.group.position;
    let best = null;
    let bestD = radius * radius;
    this.registry.forEach((t) => {
      if (!t || t.dead || !canAttack('camp', t.faction)) return;
      const dx = t.x - pos.x;
      const dz = t.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    });
    return best;
  }

  /** A dry or unarmed survivor swings at a body that has already closed the distance. */
  meleeAttack(person, target) {
    if (!target || target.dead || person.meleeCooldown > 0) return false;
    person.meleeCooldown = 0.95;
    const pos = person.rig.group.position;
    const killed = target.hit?.(person.meleeDamage, pos.x, pos.z, 0.6) ?? false;
    if (killed) {
      this.onKill?.(target.x, target.z);
      this.awardXp(person, XP.kill, 'kill');
    }
    return true;
  }

  update(dt, time, player, buildings = []) {
    const solids = this.solids || buildings;
    for (const p of this.people) {
      if (!p.active) continue;
      if (this.activeFilter && !this.activeFilter.includes(p)) continue;
      syncActivity(p);
      if (p.possessed) continue;
      if (p.onExpedition && !this.inCell) continue;
      if (p.manning) {
        this.updateManning(p, dt);
        continue;
      }
      const pos = p.rig.group.position;
      const toPlayer = Math.hypot(player.x - pos.x, player.z - pos.z);

      // Hysteresis so a survivor walking along the threshold does not flicker between tiers.
      if (p.farTier) {
        const wasFar = p.isFar;
        p.isFar = toPlayer > (p.isFar ? 20 : 24);
        if (p.isFar !== wasFar) {
          p.rig.mesh.visible = !p.isFar;
          p.farTier.visible = p.isFar;
        }
      }

      if (p.dead) {
        if (p.left) continue;
        p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.respawnTimer === 0) {
          p.dead = false;
          p.hp = p.maxHp;
          p.isFar = false;
          p.possessed = false;
          p.job = null;
          p.attention = null;
          p.carry = 0;
          p.aim?.setLock(null);
          pos.set(p.anchor.x, heightAt(p.anchor.x, p.anchor.z), p.anchor.z);
          p.rig.group.visible = true;
          p.rig.mesh.visible = true;
          if (p.farTier) p.farTier.visible = false;
          p.heading = p.rng() * Math.PI * 2;
          p.rig.group.rotation.y = p.heading;
          if (p.aim) p.aim.target = null;
          if (p.weapon) {
            p.mag = p.weapon.magazine;
            p.reloadTimer = 0;
            p.cooldown = 0;
            p.recoil = 0;
          }
        }
        continue;
      }

      // Workplaces run only when there is no manual job. A manual order is the override; when it
      // finishes, this loop resumes automatically.
      if (!p.job) this.runWorkLoop(p, time, buildings, dt);

      if (p.armed) {
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.recoil = damp(p.recoil, 0, 12, dt);
        if (p.reloadTimer > 0) {
          p.reloadTimer = Math.max(0, p.reloadTimer - dt);
          if (p.reloadTimer === 0) this.reloadPerson(p);
        }
      }
      p.meleeCooldown = Math.max(0, p.meleeCooldown - dt);

      let moving = false;
      let lookX = pos.x + Math.sin(p.heading);
      let lookZ = pos.z + Math.cos(p.heading);
      let combatTarget = null;

      // An explicit move/gather order wins over auto-defend: a survivor carrying scrap should not
      // stop every two metres to trade shots. Attack jobs still use the aim controller.
      const ordered = !!p.job && p.job.type !== 'attack';
      if (!p.isFar && p.armed && p.aim && this.registry && this.firearms && !ordered) {
        p.aimActor.x = pos.x;
        p.aimActor.y = pos.y;
        p.aimActor.z = pos.z;
        p.aimActor.heading = p.rig.group.rotation.y;
        p.aim.update(dt, p.aimActor, this.registry, p.weapon);
        combatTarget = p.aim.target;
      }

      // Fallback melee: when the gun is dry, or there is no gun at all, close and swing.
      let meleeTarget = null;
      if (!ordered && this.registry) {
        const dry = p.armed && p.mag <= 0 && p.reloadTimer <= 0 && p.dry;
        if (dry && combatTarget && Math.hypot(combatTarget.x - pos.x, combatTarget.z - pos.z) <= 10) {
          meleeTarget = combatTarget;
          combatTarget = null;
        }
        if (!meleeTarget) {
          const reach = dry || !p.weapon ? 7 : 0;
          if (reach > 0) meleeTarget = this.nearestHostile(p, reach);
        }
      }

      const jobTarget = meleeTarget || combatTarget ? null : this.updateJob(p, dt, time, solids);
      const jobActive = !!p.job;

      if (meleeTarget) {
        const dx = meleeTarget.x - pos.x;
        const dz = meleeTarget.z - pos.z;
        const dist = Math.hypot(dx, dz) || 1;
        p.heading = Math.atan2(dx, dz);
        lookX = meleeTarget.x;
        lookZ = meleeTarget.z;
        if (dist > 1.45) {
          const step = Math.min(p.speed * dt, dist - 1.2);
          const dir = this.steerAround(p, dx / dist, dz / dist, solids);
          pos.x += dir.x * step;
          pos.z += dir.z * step;
          moving = true;
          p.phase += dt * (5.4 + p.speed);
        } else {
          p.phase += dt * 2.4;
          if (p.meleeCooldown <= 0) this.meleeAttack(p, meleeTarget);
        }
      } else if (combatTarget) {
        // Stop, face the target and shoot; the body catches up with the aim yaw.
        p.heading = p.aim.aimYaw;
        lookX = p.aim.targetPoint.x;
        lookZ = p.aim.targetPoint.z;
        p.phase += dt * 1.2;
      } else if (jobTarget) {
        let tx = jobTarget.x;
        let tz = jobTarget.z;
        let canMove = true;
        const type = p.job?.type;
        if (this.nav && (type === 'move' || type === 'gather' || type === 'build' || type === 'repair' || type === 'man')) {
          const key = `${Math.round(jobTarget.x * 2)}:${Math.round(jobTarget.z * 2)}`;
          p.pathTimer -= dt;
          if (p.pathKey !== key || p.pathTimer <= 0) {
            p.path = this.nav.path(pos.x, pos.z, jobTarget.x, jobTarget.z);
            p.pathIndex = 0;
            p.pathKey = key;
            p.pathTimer = p.path ? 1.5 : 0.15;
          }
          if (!p.path) {
            p.pathFail += dt;
            if (p.pathFail > 0.4) {
              this.failJob(p, 'NO PATH');
              canMove = false;
            }
          } else {
            p.pathFail = 0;
          }
          if (!p.path) canMove = false;
          while (
            p.path &&
            p.pathIndex < p.path.length &&
            Math.hypot(p.path[p.pathIndex].x - pos.x, p.path[p.pathIndex].z - pos.z) < 0.55
          ) {
            p.pathIndex++;
          }
          if (p.path && p.pathIndex < p.path.length) {
            tx = p.path[p.pathIndex].x;
            tz = p.path[p.pathIndex].z;
          }
        }
        if (canMove) {
          const dx = tx - pos.x;
          const dz = tz - pos.z;
          const dist = Math.hypot(dx, dz) || 1;
          const step = Math.min(p.speed * dt, dist);
          const dir = this.steerAround(p, dx / dist, dz / dist, solids);
          pos.x += dir.x * step;
          pos.z += dir.z * step;
          p.heading = Math.atan2(dir.x, dir.z);
          moving = true;
          p.phase += dt * (5.2 + p.speed);
        }
      } else if (jobActive) {
        // Holding: harvesting, waiting for a reload, or standing at firing range. Face the work.
        const j = p.job;
        if (j?.type === 'attack' && j.target) {
          p.heading = Math.atan2(j.target.x - pos.x, j.target.z - pos.z);
          lookX = j.target.x;
          lookZ = j.target.z;
        } else if (j?.type === 'gather') {
          const node = this.scrapField?.nodes[j.node];
          if (node) {
            p.heading = Math.atan2(node.x - pos.x, node.z - pos.z);
            lookX = node.x;
            lookZ = node.z;
          }
        } else if ((j?.type === 'build' || j?.type === 'repair') && j.building) {
          p.heading = Math.atan2(j.building.x - pos.x, j.building.z - pos.z);
          lookX = j.building.x;
          lookZ = j.building.z;
        }
        p.phase += dt * 1.2;
      } else if (p.holdTimer > 0) {
        p.holdTimer = Math.max(0, p.holdTimer - dt);
        p.phase += dt * 1.2;
      } else {
        const dx = p.target.x - pos.x;
        const dz = p.target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.35) {
          const step = Math.min(p.speed * dt, dist);
          const dir = this.steerAround(p, dx / dist, dz / dist, solids);
          pos.x += dir.x * step;
          pos.z += dir.z * step;
          p.heading = Math.atan2(dir.x, dir.z);
          moving = true;
          p.phase += dt * (5.2 + p.speed);
        } else {
          p.phase += dt * 1.4;
          p.timer -= dt;
          if (p.timer <= 0) {
            p.timer = p.rng.range(3.5, 8);
            const center = p.anchor;
            for (let tries = 0; tries < 10; tries++) {
              const a = p.rng() * Math.PI * 2;
              const r = p.rng() * 3.2;
              const tx = center.x + Math.cos(a) * r;
              const tz = center.z + Math.sin(a) * r;
              let blocked = false;
              for (const b of buildings) {
                if (Math.hypot(b.x - tx, b.z - tz) < b.radius + 0.6) {
                  blocked = true;
                  break;
                }
              }
              if (!blocked) {
                p.target.x = tx;
                p.target.z = tz;
                break;
              }
            }
          }
        }
      }

      this.resolveCollisions(p, solids);
      pos.y = heightAt(pos.x, pos.z);
      syncActivity(p, pos);

      // Stuck detection. A unit that is trying to move but not covering ground is wedged on
      // wreckage, a building corner or another body. Replan once; if that fails, report `NO PATH`.
      if (moving) {
        p.stuckTimer += dt;
        if (p.stuckTimer >= 0.55) {
          const moved = Math.hypot(pos.x - p.lastMoveX, pos.z - p.lastMoveZ);
          if (moved < 0.18) p.stuckCount++;
          else {
            p.stuckCount = 0;
            if (moved > 1.0) p.replan = 0;
          }
          p.stuckTimer = 0;
          p.lastMoveX = pos.x;
          p.lastMoveZ = pos.z;
          if (p.stuckCount >= 2) {
            p.stuckCount = 0;
            p.replan++;
            p.pathTimer = 0;
            p.pathKey = '';
            p.path = null;
            if (p.replan >= 2 && p.job) {
              // Last-resort nudge to the nearest free nav cell before giving up. This clears the
              // corner/wall cases where steering and collision push against each other forever.
              const free = this.nav?.nearestFreeWorld(pos.x, pos.z, 6);
              if (free && Math.hypot(free.x - pos.x, free.z - pos.z) < 4) {
                pos.x = free.x;
                pos.z = free.z;
                pos.y = heightAt(pos.x, pos.z);
                p.pathTimer = 0;
                p.pathKey = '';
                p.replan = 1;
              } else if (p.replan >= 4) {
                this.failJob(p, 'NO PATH');
              }
            }
          }
        }
      } else {
        p.stuckTimer = 0;
        p.stuckCount = 0;
        p.lastMoveX = pos.x;
        p.lastMoveZ = pos.z;
      }

      let diff = p.heading - p.rig.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rig.group.rotation.y += diff * (1 - Math.exp(-9 * dt));

      if (p.isFar) continue;

      if (combatTarget || meleeTarget) p.rig.lookAt(lookX, lookZ, dt);
      else if (toPlayer < 8) p.rig.lookAt(lookX, lookZ, dt);
      else p.rig.head.rotation.y = damp(p.rig.head.rotation.y, 0, 5, dt);

      p.rig.setPose(dt, moving, p.phase);
      if (!combatTarget) p.rig.head.rotation.x = Math.sin(time * 1.3 + p.phase) * 0.012;

      if (p.armed && p.weapon) {
        p.rig.applyWeaponPose(p.aim?.pitch || 0, p.recoil, p.reloadTimer > 0, !!p.weapon.twoHanded);
        if (combatTarget && p.aim.canFire && p.cooldown <= 0 && p.reloadTimer <= 0 && p.mag > 0) {
          const shot = this.firearms.fire(
            { x: pos.x, z: pos.z, rig: p.rig, heading: p.heading, faction: 'camp' },
            { weapon: p.weapon, aimPoint: p.aim.targetPoint, damage: p.weapon.damage * (p.damageScale || 1) },
          );
          p.mag--;
          p.cooldown = 60 / p.weapon.rpm;
          p.recoil = 1;
          if (p.mag <= 0) p.reloadTimer = p.weapon.reload;
          if (shot.killed) {
            this.onKill?.(shot.x, shot.z);
            this.awardXp(p, XP.kill * shot.killed, 'kill');
          }
        }
      }
    }

    this.separateUnits();
  }

  /** Workplace assignments and roles for the save. */
  serialize() {
    return this.people.map((p) => ({
      role: p.role,
      active: !!p.active,
      home: p.home?.id ?? null,
      hp: Math.max(0, Math.round(p.hp)),
      dead: !!p.dead,
      left: !!p.left,
      pending: !!p.pending,
      expedition: !!p.onExpedition,
      hunger: p.hunger || 0,
      thirst: p.thirst || 0,
      morale: Math.round(p.morale ?? 70),
      leaveWarn: p.leaveWarn || '',
      equipment: { ...p.rig.equipment },
      xp: Math.round(p.xp || 0),
      x: p.rig.group.position.x,
      z: p.rig.group.position.z,
    }));
  }

  restore(data, findBuilding) {
    if (!Array.isArray(data)) return;
    for (let i = 0; i < this.people.length && i < data.length; i++) {
      const p = this.people[i];
      const s = data[i];
      if (!s) continue;
      const home = Number.isFinite(s.home) ? findBuilding?.(s.home) : null;
      p.active = s.active !== false;
      p.home = home && home.built ? home : null;
      p.role =
        s.role === 'builder'
          ? 'scavenger'
          : (home?.def?.job?.label || home?.def?.job?.role)?.toLowerCase() || s.role || p.role;
      p.dead = !!s.dead;
      p.left = !!s.left;
      p.pending = !!s.pending;
      p.onExpedition = !!s.expedition;
      p.hunger = Number.isFinite(s.hunger) ? s.hunger : 0;
      p.thirst = Number.isFinite(s.thirst) ? s.thirst : 0;
      p.morale = Number.isFinite(s.morale) ? s.morale : 70;
      p.moraleTarget = p.morale;
      p.leaveWarn = typeof s.leaveWarn === 'string' ? s.leaveWarn : '';
      p.xp = Number.isFinite(s.xp) ? s.xp : 0;
      if (s.equipment && typeof s.equipment === 'object') p.rig.setEquipment(s.equipment);
      this.applyLevelStats(p, true);
      p.hp = Number.isFinite(s.hp) ? Math.max(1, Math.min(p.maxHp, s.hp)) : p.maxHp;
      p.respawnTimer = p.left ? Infinity : p.dead ? 20 : 0;
      if (p.dead) p.home = null;
      p.job = null;
      p.attention = null;
      p.carry = 0;
      p.path = null;
      p.pathIndex = 0;
      p.pathKey = '';
      p.pathTimer = 0;
      p.aim?.setLock(null);
      p.aim && (p.aim.target = null);
      const x = Number.isFinite(s.x) ? s.x : p.spawnAnchor.x;
      const z = Number.isFinite(s.z) ? s.z : p.spawnAnchor.z;
      p.rig.group.position.set(x, heightAt(x, z), z);
      if (p.home) {
        p.anchor = { x: p.home.x + 1.5, z: p.home.z + 1.5 };
      } else {
        p.anchor = { x, z };
      }
      p.target = { ...p.anchor };
      p.rig.group.visible = p.active && !p.dead;
      p.rig.mesh.visible = p.active && !p.dead;
      if (p.farTier) p.farTier.visible = false;
      p.isFar = false;
    }
  }

  /** Keep camp folk out of each other's capsules; cheap at this population. */
  separateUnits() {
    const people = this.people;
    const r = 0.62;
    for (let i = 0; i < people.length; i++) {
      const a = people[i];
      if (!a.active || a.dead) continue;
      const pa = a.rig.group.position;
      for (let j = i + 1; j < people.length; j++) {
        const b = people[j];
        if (!b.active || b.dead) continue;
        const pb = b.rig.group.position;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        let nx;
        let nz;
        if (d < 1e-4) {
          // Perfect overlap: give each pair a deterministic direction so they separate.
          const angle = i * 2.399963 + j * 0.7;
          nx = Math.cos(angle);
          nz = Math.sin(angle);
          d = 0;
        } else {
          nx = dx / d;
          nz = dz / d;
        }
        const push = (r - d) * 0.5;
        if (!a.possessed) {
          pa.x -= nx * push;
          pa.z -= nz * push;
        }
        if (!b.possessed) {
          pb.x += nx * push;
          pb.z += nz * push;
        }
        pa.y = heightAt(pa.x, pa.z);
        pb.y = heightAt(pb.x, pb.z);
      }
    }
  }
}
