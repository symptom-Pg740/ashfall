import { WEAPONS } from './weapons.js';

/**
 * Ammo economy and the data-driven weapon upgrade tracks.
 *
 * The player carries one magazine per weapon (`state.mags`) plus a shared reserve per caliber
 * (`state.ammo`). Reloading draws from the reserve; swapping weapons keeps the magazine you left in
 * the gun, so cycling the wardrobe cannot refill a rifle for free.
 *
 * Upgrades are per weapon and per stat. Each track is a list of multipliers over the base spec, so
 * adding a variant or a new track is a data edit, not a code path.
 */

export const CALIBERS = {
  rifle: { id: 'rifle', label: 'RIFLE ROUNDS', pack: 6, cost: 5, max: 48 },
  pistol: { id: 'pistol', label: 'PISTOL ROUNDS', pack: 12, cost: 4, max: 144 },
  shell: { id: 'shell', label: 'SHELLS', pack: 4, cost: 6, max: 32 },
};

export const STARTER_AMMO = { rifle: 8, pistol: 36, shell: 6 };

export const WEAPON_CALIBER = {
  rifle: 'rifle',
  pistol: 'pistol',
  shotgun: 'shell',
};

/**
 * Stat tracks. `steps[i]` multiplies the base stat at tier i (tier 0 is stock). `costs[i]` buys
 * tier i + 1. Fewer/negative is better for reload and spread.
 */
export const TRACKS = [
  {
    id: 'damage',
    label: 'DAMAGE',
    steps: [1, 1.25, 1.5, 1.8],
    costs: [14, 30, 52],
    apply: (base, step) => base.damage * step,
    format: (v) => String(Math.round(v)),
  },
  {
    id: 'rpm',
    label: 'RATE',
    steps: [1, 1.2, 1.45],
    costs: [12, 26],
    apply: (base, step) => base.rpm * step,
    format: (v) => `${Math.round(v)} RPM`,
  },
  {
    id: 'reload',
    label: 'RELOAD',
    steps: [1, 0.82, 0.66],
    costs: [10, 22],
    apply: (base, step) => base.reload * step,
    format: (v) => `${v.toFixed(2)}s`,
  },
  {
    id: 'spread',
    label: 'SPREAD',
    steps: [1, 0.75, 0.55],
    costs: [14, 30],
    apply: (base, step) => base.spread * step,
    format: (v) => `${v.toFixed(2)}°`,
  },
];

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

function tierOf(upgrades, weaponId, trackId) {
  const t = upgrades?.[weaponId]?.[trackId];
  return Number.isFinite(t) ? Math.max(0, Math.min(t, TRACK_BY_ID[trackId].costs.length)) : 0;
}

/** A resolved weapon spec with the purchased tiers applied. */
export function resolveWeapon(id, upgrades) {
  const base = WEAPONS[id];
  if (!base) return null;
  const spec = { ...base };
  for (const track of TRACKS) {
    const tier = tierOf(upgrades, id, track.id);
    if (tier > 0) spec[track.id] = track.apply(base, track.steps[tier]);
  }
  spec.baseId = id;
  spec.tiers = Object.fromEntries(TRACKS.map((t) => [t.id, tierOf(upgrades, id, t.id)]));
  return spec;
}

export class Armory {
  constructor(state) {
    this.state = state;
    if (!state.ammo || typeof state.ammo !== 'object') state.ammo = { ...STARTER_AMMO };
    for (const key of Object.keys(STARTER_AMMO)) {
      if (!Number.isFinite(state.ammo[key])) state.ammo[key] = STARTER_AMMO[key];
    }
    if (!state.mags || typeof state.mags !== 'object') state.mags = {};
    if (!state.upgrades || typeof state.upgrades !== 'object') state.upgrades = {};
    this._resolved = new Map();
  }

  caliber(weaponId) {
    return WEAPON_CALIBER[weaponId] || null;
  }

  weapon(id) {
    const key = `${id}:${JSON.stringify(this.state.upgrades[id] || {})}`;
    let spec = this._resolved.get(key);
    if (!spec) {
      spec = resolveWeapon(id, this.state.upgrades);
      if (spec) this._resolved.set(key, spec);
    }
    return spec;
  }

  reserve(weaponId) {
    const c = this.caliber(weaponId);
    if (!c) return Infinity;
    return Math.max(0, Math.floor(this.state.ammo[c] || 0));
  }

  /** The magazine currently in the gun, without spending anything. */
  magOf(weaponId) {
    const base = WEAPONS[weaponId];
    if (!base) return 0;
    const n = this.state.mags[weaponId];
    if (!Number.isFinite(n)) return base.magazine;
    return Math.max(0, Math.min(Math.floor(n), base.magazine));
  }

  setMag(weaponId, n) {
    const base = WEAPONS[weaponId];
    if (!base) return 0;
    const value = Math.max(0, Math.min(Math.floor(n), base.magazine));
    this.state.mags[weaponId] = value;
    return value;
  }

  /** Top the magazine up from the reserve. Returns the new magazine size. */
  fill(weaponId) {
    const base = WEAPONS[weaponId];
    if (!base) return 0;
    const current = this.magOf(weaponId);
    const room = base.magazine - current;
    const c = this.caliber(weaponId);
    if (!c || room <= 0) return current;
    const take = Math.min(room, this.reserve(weaponId));
    this.state.ammo[c] -= take;
    return this.setMag(weaponId, current + take);
  }

  hasReserve(weaponId) {
    return this.reserve(weaponId) > 0;
  }

  /** Buy one pack for the weapon's caliber. Returns the amount added, or 0. */
  buyAmmo(weaponId) {
    const c = this.caliber(weaponId);
    const def = c ? CALIBERS[c] : null;
    if (!def) return 0;
    const current = this.reserve(weaponId);
    if (current >= def.max) return 0;
    if (this.state.scrap < def.cost) return 0;
    const add = Math.min(def.pack, def.max - current);
    this.state.scrap -= def.cost;
    this.state.ammo[c] = current + add;
    return add;
  }

  tier(weaponId, trackId) {
    return tierOf(this.state.upgrades, weaponId, trackId);
  }

  /** Next tier's cost and preview, or null when maxed. */
  next(weaponId, trackId) {
    const track = TRACK_BY_ID[trackId];
    const base = WEAPONS[weaponId];
    if (!track || !base) return null;
    const tier = this.tier(weaponId, trackId);
    if (tier >= track.costs.length) return null;
    return {
      tier: tier + 1,
      cost: track.costs[tier],
      from: track.format(track.apply(base, track.steps[tier])),
      to: track.format(track.apply(base, track.steps[tier + 1])),
    };
  }

  /** Buy the next tier of a track. Returns true when the scrap was spent. */
  buyUpgrade(weaponId, trackId) {
    const next = this.next(weaponId, trackId);
    if (!next || this.state.scrap < next.cost) return false;
    this.state.scrap -= next.cost;
    const row = (this.state.upgrades[weaponId] ||= {});
    row[trackId] = next.tier;
    this._resolved.clear();
    return true;
  }

  /** Everything the armory panel needs for one weapon. */
  view(weaponId) {
    const base = WEAPONS[weaponId];
    if (!base) return null;
    const spec = this.weapon(weaponId);
    const c = this.caliber(weaponId);
    const pack = c ? CALIBERS[c] : null;
    return {
      id: weaponId,
      name: spec.name,
      scrap: this.state.scrap,
      mag: this.magOf(weaponId),
      magazine: base.magazine,
      reserve: this.reserve(weaponId),
      ammo: pack
        ? {
            label: pack.label,
            pack: pack.pack,
            cost: pack.cost,
            max: pack.max,
            full: this.reserve(weaponId) >= pack.max,
            affordable: this.state.scrap >= pack.cost,
          }
        : null,
      tracks: TRACKS.map((t) => {
        const tier = this.tier(weaponId, t.id);
        return {
          id: t.id,
          label: t.label,
          tier,
          maxTier: t.costs.length,
          value: t.format(t.apply(base, t.steps[tier])),
          next: this.next(weaponId, t.id),
        };
      }),
    };
  }
}
