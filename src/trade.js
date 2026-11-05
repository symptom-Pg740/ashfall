import * as THREE from 'three';
import { makeRng, deriveSeed } from './rng.js';
import { COMPONENT_CAP } from './recipes.js';
import { heightAt, highwayZ, PLAY_HALF_X } from './terrain.js';
import { buildSkinnedHumanoid } from './skinned.js';
import { box, cyl, merge, PALETTE } from './geo.js';

const SELL = [
  { resource: 'water', amount: 8, price: [12, 18], name: 'WATER' },
  { resource: 'food', amount: 8, price: [12, 18], name: 'FOOD' },
  { resource: 'components', amount: 2, price: [18, 26], name: 'COMPONENTS' },
];
const BUY = [
  { resource: 'components', amount: 2, price: [16, 22], name: 'COMPONENTS' },
];

/** Two-wheel cart under a patched canvas hood, built facing +Z. */
function wagonGeometry() {
  const p = [];
  p.push(box(1.6, 0.12, 3.0, PALETTE.woodDark, 0, 0.74, 0));
  p.push(box(0.1, 0.5, 2.8, PALETTE.wood, -0.78, 1.02, 0));
  p.push(box(0.1, 0.5, 2.8, PALETTE.wood, 0.78, 1.02, 0));
  p.push(box(1.6, 0.5, 0.1, PALETTE.wood, 0, 1.02, -1.42));
  // canvas hood over the load
  p.push(cyl(0.9, 0.9, 2.0, 8, PALETTE.tarp, 0, 1.5, -0.35, Math.PI / 2, 0, 0));
  p.push(box(1.86, 0.08, 0.1, PALETTE.woodDark, 0, 2.36, 0.6));
  p.push(box(0.5, 0.06, 0.9, PALETTE.tarpLight, 0.55, 2.12, -0.7, 0, 0, 0.35));
  // driver bench and driver
  p.push(box(1.3, 0.16, 0.6, PALETTE.wood, 0, 1.12, 1.1));
  p.push(box(0.5, 0.7, 0.4, PALETTE.coat, 0, 1.5, 1.15));
  p.push(box(0.34, 0.12, 0.34, PALETTE.scarf, 0, 1.82, 1.15));
  p.push(box(0.26, 0.26, 0.26, PALETTE.skin, 0, 1.98, 1.15));
  // wheels
  for (const sx of [-1, 1]) {
    for (const sz of [-0.95, 0.95]) {
      p.push(cyl(0.46, 0.46, 0.14, 10, '#2c2824', sx * 0.84, 0.46, sz, 0, 0, Math.PI / 2));
      p.push(cyl(0.16, 0.16, 0.18, 8, PALETTE.rust, sx * 0.84, 0.46, sz, 0, 0, Math.PI / 2));
    }
  }
  // tow bar and cargo
  p.push(box(0.12, 0.1, 0.9, PALETTE.woodDark, 0, 0.82, 1.7));
  p.push(box(0.6, 0.4, 0.5, '#8a6a42', 0.3, 1.3, 0.9));
  p.push(cyl(0.24, 0.26, 0.6, 8, PALETTE.rustDark, -0.35, 1.4, 0.9));
  return merge(p);
}

/** A pack mule with a bedroll, built facing +Z. */
function packAnimalGeometry() {
  const hide = '#6d5a44';
  const hideDark = '#584735';
  const p = [];
  p.push(box(0.5, 0.52, 1.25, hide, 0, 0.95, 0));
  p.push(box(0.26, 0.4, 0.3, hideDark, 0, 1.14, 0.66, 0.3));
  p.push(box(0.22, 0.22, 0.42, hide, 0, 1.32, 0.86));
  p.push(box(0.08, 0.16, 0.08, hideDark, -0.08, 1.48, 0.82));
  p.push(box(0.08, 0.16, 0.08, hideDark, 0.08, 1.48, 0.82));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.push(box(0.14, 0.72, 0.16, hideDark, sx * 0.17, 0.36, sz * 0.42));
    }
  }
  p.push(box(0.07, 0.4, 0.07, hideDark, 0, 0.95, -0.66, -0.35));
  p.push(cyl(0.22, 0.22, 0.62, 7, '#7a6a4c', 0, 1.28, -0.12, 0, 0, Math.PI / 2));
  return merge(p);
}

/**
 * The caravan.
 *
 * A built trade post unlocks periodic caravan visits. Each visit has three one-shot offers; most
 * turn surplus water/food/components into scrap, which is the sustainable answer to a stripped map.
 *
 * Visually the trade network also owns the highway traffic: a wagon and two pack mules drive the
 * east-west road to the post and park while the offers are live, and a few neutral travellers walk
 * the same road all the time. All of it is scenery — no gameplay is attached to the figures.
 */
export class TradeNetwork {
  constructor({ settlement, state, ui, onSave }) {
    this.settlement = settlement;
    this.state = state;
    this.ui = ui;
    this.onSave = onSave || (() => {});
    this.rng = makeRng(deriveSeed('caravan'));
    this.arrived = false;
    this.timer = 28;
    this.stay = 0;
    this.visit = 0;
    this.offers = [];
    this.onArrive = null;
    this.onDepart = null;

    /** Visible wagon + mules. `state` is 'away' | 'inbound' | 'parked' | 'outbound'. */
    this.caravan = { state: 'away', x: 0, z: 0, parkX: 0, parkZ: 0, dir: 1, t: 0, heading: 0 };
    /** Neutral road traffic: always walking, wrapping at the ends of the highway. */
    this.travellers = [
      { x: -PLAY_HALF_X * 0.55, dir: 1, speed: 1.15, lane: 1.7, phase: 0 },
      { x: PLAY_HALF_X * 0.3, dir: -1, speed: 1.3, lane: -1.9, phase: 2.2 },
      { x: -PLAY_HALF_X * 0.1, dir: 1, speed: 0.95, lane: 2.7, phase: 4.4 },
    ];
    this.group = new THREE.Group();
    this.group.name = 'caravan';
    this.buildVisuals();
  }

  // ---- visuals -----------------------------------------------------------

  buildVisuals() {
    const scene = this.settlement?.scene;
    if (!scene) return;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    const wagon = new THREE.Mesh(wagonGeometry(), material);
    wagon.castShadow = true;
    wagon.receiveShadow = true;

    const muleGeo = packAnimalGeometry();
    this.mules = [];
    for (let i = 0; i < 2; i++) {
      const mule = new THREE.Mesh(muleGeo, material);
      mule.castShadow = true;
      mule.receiveShadow = true;
      mule.userData.ox = i ? -0.55 : 0.55;
      mule.userData.oz = 2.5 + i * 0.9;
      this.mules.push(mule);
    }

    this.caravanGroup = new THREE.Group();
    this.caravanGroup.name = 'trade-caravan';
    this.caravanGroup.visible = false;
    this.caravanGroup.add(wagon, ...this.mules);
    this.group.add(this.caravanGroup);

    // Road traffic uses the same skinned survivor rig as the camp, not a box proxy. There are only
    // three of them and they are usually far away, so the cost is bounded.
    this.travellerRigs = this.travellers.map((t, i) =>
      buildSkinnedHumanoid(deriveSeed(`traveller:${i}`), {
        detail: 'low',
        castShadow: false,
        archetype: ['lean', 'stocky', 'tall'][i % 3],
        equipment: {
          head: i % 2 ? 'wrap' : 'cap',
          face: 'scarf',
          torso: i % 2 ? 'coat' : 'vest',
          legs: 'trousers',
          feet: 'boots',
          shoulders: 'none',
          hands: 'none',
          back: 'bedroll',
          waist: 'tool',
          weapon: 'none',
        },
      }),
    );
    for (const rig of this.travellerRigs) this.group.add(rig.group);

    scene.add(this.group);
    this.updateTravellers(0);
    this.placeCaravan();
  }

  /** Put the wagon and mules on the road at the caravan's current x. No per-frame allocation. */
  placeCaravan() {
    if (!this.caravanGroup) return;
    const c = this.caravan;
    const z = highwayZ(c.x);
    c.z = z;
    const slope = (highwayZ(c.x + 1.5) - highwayZ(c.x - 1.5)) / 3;
    const yaw = Math.atan2(c.dir, c.dir * slope);
    const moving = c.state === 'inbound' || c.state === 'outbound';
    const bob = moving ? Math.abs(Math.sin(c.t * 7)) * 0.03 : Math.sin(c.t * 1.6) * 0.012;
    this.caravanGroup.position.set(c.x, heightAt(c.x, z) + bob, z);
    this.caravanGroup.rotation.y = yaw;
    c.heading = yaw;
  }

  updateTravellers(dt) {
    if (!this.travellerRigs) return;
    const span = PLAY_HALF_X - 8;
    const list = this.travellers;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const rig = this.travellerRigs[i];
      t.x += t.dir * t.speed * dt;
      if (t.x > span) t.x = -span;
      else if (t.x < -span) t.x = span;
      const z = highwayZ(t.x) + t.lane;
      const slope = (highwayZ(t.x + 1) - highwayZ(t.x - 1)) * 0.5;
      const yaw = Math.atan2(t.dir, t.dir * slope);
      t.phase += dt * (3.2 + t.speed * 1.4);
      rig.group.position.set(t.x, heightAt(t.x, z), z);
      rig.group.rotation.y = yaw;
      if (dt > 0) {
        rig.setPose(dt, true, t.phase);
        rig.plantFeet(true);
      }
    }
  }

  /** Send the wagon in from the far end of the highway toward the post. */
  sendCaravan() {
    const post = this.post();
    if (!post || !this.caravanGroup) return;
    const c = this.caravan;
    const dir = post.x >= 0 ? -1 : 1;
    const parkX = Math.max(-PLAY_HALF_X + 30, Math.min(PLAY_HALF_X - 30, post.x + dir * 8));
    c.parkX = parkX;
    c.parkZ = highwayZ(parkX);
    c.dir = dir;
    c.x = Math.max(-PLAY_HALF_X + 12, Math.min(PLAY_HALF_X - 12, parkX - dir * 110));
    c.z = highwayZ(c.x);
    c.t = 0;
    c.state = 'inbound';
    this.caravanGroup.visible = true;
    this.placeCaravan();
  }

  /** Let the wagon pull away and disappear over the horizon. */
  departCaravan() {
    const c = this.caravan;
    if (c.state === 'away') return;
    c.state = 'outbound';
    c.t = 0;
  }

  recallCaravan() {
    const c = this.caravan;
    if (c.state === 'away') return;
    c.state = 'away';
    if (this.caravanGroup) this.caravanGroup.visible = false;
  }

  updateCaravan(dt) {
    const c = this.caravan;
    if (!this.caravanGroup) return;
    c.t += dt;
    if (c.state === 'inbound') {
      const dx = c.parkX - c.x;
      const step = 13 * dt;
      if (Math.abs(dx) <= step) {
        c.x = c.parkX;
        c.state = 'parked';
        c.t = 0;
      } else {
        c.x += Math.sign(dx) * step;
      }
    } else if (c.state === 'outbound') {
      c.x += c.dir * 12 * dt;
      if (Math.abs(c.x) >= PLAY_HALF_X - 6 || c.t > 45) {
        c.state = 'away';
        this.caravanGroup.visible = false;
      }
    }
    this.placeCaravan();
  }

  // ---- gameplay ----------------------------------------------------------

  post() {
    return this.settlement.buildings.find((b) => b.type === 'trade' && b.built && !b.destroyed) || null;
  }

  update(dt) {
    this.updateTravellers(dt);
    const post = this.post();
    if (!post) {
      this.arrived = false;
      this.offers = [];
      this.timer = 28;
      this.stay = 0;
      this.recallCaravan();
      this.updateCaravan(dt);
      return;
    }
    if (this.arrived) {
      this.stay = Math.max(0, this.stay - dt);
      if (this.stay <= 0) {
        this.arrived = false;
        this.offers = [];
        this.timer = this.rng.range(80, 130);
        this.departCaravan();
        this.onDepart?.();
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) this.arrive();
    }
    this.updateCaravan(dt);
  }

  arrive() {
    this.arrived = true;
    this.stay = 75;
    this.visit++;
    this.offers = this.generateOffers();
    this.sendCaravan();
    this.onArrive?.();
  }

  generateOffers() {
    const sells = [...SELL];
    for (let i = sells.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [sells[i], sells[j]] = [sells[j], sells[i]];
    }
    const lines = sells.slice(0, 2).map((t) => this.makeOffer(t, 'sell'));
    if (this.rng() < 0.55) {
      const buy = BUY[Math.floor(this.rng() * BUY.length)];
      lines.push(this.makeOffer(buy, 'buy'));
    } else {
      lines.push(this.makeOffer(sells[2] || SELL[0], 'sell'));
    }
    return lines;
  }

  makeOffer(template, kind) {
    const price = Math.round(this.rng.range(template.price[0], template.price[1]));
    return {
      id: `${this.visit}:${kind}:${template.resource}`,
      kind,
      resource: template.resource,
      name: template.name,
      amount: template.amount,
      scrap: price,
      used: false,
      label:
        kind === 'sell'
          ? `SELL ${template.amount} ${template.name} · +${price} SCRAP`
          : `BUY ${template.amount} ${template.name} · ${price} SCRAP`,
    };
  }

  available(offer) {
    if (!offer || offer.used) return false;
    const cap = this.state.scrapCap || 80;
    if (offer.kind === 'sell') {
      return (this.state[offer.resource] || 0) >= offer.amount && this.state.scrap + offer.scrap <= cap;
    }
    if (offer.resource === 'components') {
      return this.state.scrap >= offer.scrap && (this.state.components || 0) + offer.amount <= COMPONENT_CAP;
    }
    return this.state.scrap >= offer.scrap;
  }

  execute(index) {
    const offer = this.offers[index];
    if (!offer || offer.used) return false;
    if (!this.available(offer)) {
      const cap = this.state.scrapCap || 80;
      if (offer.kind === 'sell' && this.state.scrap + offer.scrap > cap) {
        this.ui.toast('SCRAP STORE FULL · SPEND BEFORE TRADING', true);
      } else {
        this.ui.toast('NOT ENOUGH GOODS', true);
      }
      return false;
    }
    if (offer.kind === 'sell') {
      this.state[offer.resource] = (this.state[offer.resource] || 0) - offer.amount;
      this.state.scrap += offer.scrap;
      this.ui.toast(`TRADE · +${offer.scrap} SCRAP FOR ${offer.amount} ${offer.name}`);
    } else {
      this.state.scrap -= offer.scrap;
      this.state.components = (this.state.components || 0) + offer.amount;
      this.ui.toast(`TRADE · -${offer.scrap} SCRAP FOR ${offer.amount} ${offer.name}`);
    }
    offer.used = true;
    this.ui.updateHUD(this.state);
    this.onSave();
    return true;
  }

  serialize() {
    return {
      arrived: this.arrived,
      timer: this.timer,
      stay: this.stay,
      visit: this.visit,
      offers: this.offers.map((o) => ({ ...o })),
    };
  }

  restore(data) {
    if (!data || typeof data !== 'object') return;
    this.arrived = !!data.arrived;
    this.timer = Number.isFinite(data.timer) ? data.timer : 28;
    this.stay = Number.isFinite(data.stay) ? data.stay : 0;
    this.visit = Number.isFinite(data.visit) ? data.visit : 0;
    this.offers = Array.isArray(data.offers) ? data.offers.map((o) => ({ ...o })) : [];
    if (this.arrived && !this.offers.length) this.offers = this.generateOffers();
    // A restored visit should show the wagon already parked at the post, not driving in.
    if (this.arrived) {
      this.sendCaravan();
      this.caravan.x = this.caravan.parkX;
      this.caravan.z = this.caravan.parkZ;
      this.caravan.state = 'parked';
      this.caravan.t = 0;
      this.placeCaravan();
    } else {
      this.recallCaravan();
    }
  }
}
