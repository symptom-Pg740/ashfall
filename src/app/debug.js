/**
 * Development-only URL test hooks.
 *
 * Everything here is inert unless the matching query parameter is present. The hooks are installed
 * once, after the composition root has created the systems and loaded the save, so they act on the
 * same objects the game loop uses. Synchronous hooks stay synchronous, and the `setTimeout` /
 * `requestAnimationFrame` delays are intentionally unchanged from the original inline block.
 *
 * `?fresh` is not here: it clears the save before `loadGame()` runs, so it stays in the boot
 * sequence in `main.js`. Moving it into this post-boot install would silently change its behaviour.
 */
import * as THREE from 'three';

export function installDebugHooks(ctx) {
  const {
    params = new URLSearchParams(window.location.search),
    player,
    state,
    raiders,
    enemies,
    campFolk,
    commander,
    ui,
    audio,
    economy,
    settlement,
    fx,
    weapons,
    startRaid,
    simulate,
    damageSelected,
    openUnits,
    refreshUnits,
    livingTargets,
    heightAt,
    setViewZoom,
  } = ctx;

  if (params.has('zoom')) {
    const z = THREE.MathUtils.clamp(parseFloat(params.get('zoom')) || 1, 0.8, 8);
    setViewZoom(z);
  }
  if (params.has('heading')) {
    const h = parseFloat(params.get('heading')) || 0;
    player.heading = h;
    player.targetHeading = h;
    player.group.rotation.y = h;
  }
  if (params.get('hide') === 'body') player.rig.mesh.visible = false;
  if (params.get('hide') === 'outfit' && player.rig.outfit) player.rig.outfit.visible = false;
  if (params.has('raider')) {
    const r = raiders.people[0];
    r.active = true;
    r.dead = false;
    r.hp = r.maxHp;
    r.mag = r.weapon.magazine;
    r.reloadTimer = 0;
    r.cooldown = 0;
    r.recoil = 0;
    r.aim.target = null;
    r.aim._initialised = false;
    const x = player.x + 7;
    const z = player.z;
    const face = Math.atan2(player.x - x, player.z - z);
    r.rig.group.position.set(x, heightAt(x, z), z);
    r.rig.group.rotation.y = face;
    r.heading = face;
    r.rig.group.visible = true;
    r.rig.mesh.visible = true;
    if (r.farTier) r.farTier.visible = false;
    r.isFar = false;
  }
  if (params.has('raid')) {
    setTimeout(() => startRaid('raiders', 2, 9), 1200);
  }
  if (params.has('raidghoul')) {
    setTimeout(() => startRaid('ghouls', 3, 9), 1200);
  }
  if (params.has('bats')) {
    setTimeout(() => startRaid('bats', 4, 10), 1200);
  }
  if (params.has('raidclear')) {
    setTimeout(() => {
      startRaid('raiders', 2, 10);
      setTimeout(() => {
        for (const p of raiders.people) {
          if (p.active) raiders.damage(p.target.ref, 999);
        }
      }, 400);
    }, 800);
  }
  if (params.has('guardtest')) {
    const n = campFolk.people[0];
    const nx = player.x + 1.2;
    const nz = player.z + 0.4;
    n.rig.group.position.set(nx, heightAt(nx, nz), nz);
    n.rig.group.rotation.y = 0;
    n.heading = 0;
  }
  if (params.has('compare')) {
    const n = campFolk.people[0];
    const nx = player.x + 1.15;
    n.rig.group.position.set(nx, heightAt(nx, player.z), player.z);
    n.rig.group.rotation.y = 0;
    campFolk.update = () => {};
  }
  if (params.has('ghoul')) {
    const g = enemies.pool[0];
    g.active = true;
    g.x = player.x;
    g.z = player.z + 7;
    g.y = heightAt(g.x, g.z);
    g.hp = 46;
    g.scale = 1;
    g.speed = 0;
    g.attackCd = 999;
  }
  if (params.has('weapon')) {
    const unit = commander.selected || campFolk.people[0];
    unit.rig.equip('weapon', params.get('weapon'));
    unit.weapon = weapons[params.get('weapon')] || unit.weapon;
    commander.refresh(unit);
    refreshUnits();
  }
  if (params.has('hurt')) {
    setTimeout(() => damageSelected(Number(params.get('hurt')) || 35), 1000);
  }
  if (params.has('noammo')) {
    setTimeout(() => {
      for (const key of Object.keys(state.ammo)) state.ammo[key] = 0;
      for (const key of Object.keys(weapons)) state.mags[key] = 0;
    }, 400);
  }
  if (params.has('audiotest')) {
    setTimeout(() => {
      const seq = [
        () => audio.shot('pistol', 0, 0),
        () => audio.shot('rifle', 0, 0),
        () => audio.shot('shotgun', 0, 0),
        () => audio.shot('rifle', 35, -0.4),
        () => audio.impact('stone', 2, 0.3),
        () => audio.impact('flesh', 2, 0),
        () => audio.reload('rifle'),
        () => audio.dry(),
      ];
      seq.forEach((fn, i) => setTimeout(fn, i * 900));
    }, 1200);
  }
  if (params.has('armory')) {
    setTimeout(() => openUnits(), 500);
  }
  if (params.has('upgrade')) {
    setTimeout(() => {
      economy.set('scrap', Math.max(state.scrap, 200));
      ui.updateHUD(state);
      ui.cb.armoryUpgrade?.(params.get('upgrade'));
      openUnits();
    }, 600);
  }
  if (params.has('autostart')) {
    requestAnimationFrame(() => document.getElementById('start-btn')?.click());
  }
  if (params.has('fastforward')) {
    // Deterministic headless step: rAF advances very slowly under virtual time.
    setTimeout(() => {
      const seconds = Math.min(60, Number(params.get('fastforward')) || 5);
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) {
        if (!state.started) break;
        simulate(1 / 60);
        campFolk.solids = settlement.solids();
        campFolk.update(1 / 60, state.time, player, settlement.buildings);
        raiders.update(1 / 60, state.time, player, livingTargets);
        fx.update(1 / 60);
      }
      ui.updateHUD(state);
      ui.hint(`SIM +${seconds}s`, 1800);
    }, Number(params.get('ffdelay')) || 700);
  }
}
