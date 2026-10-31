import { makeRng, deriveSeed } from './rng.js';
import { COMPONENT_CAP } from './recipes.js';

const SELL = [
  { resource: 'water', amount: 8, price: [12, 18], name: 'WATER' },
  { resource: 'food', amount: 8, price: [12, 18], name: 'FOOD' },
  { resource: 'components', amount: 2, price: [18, 26], name: 'COMPONENTS' },
];
const BUY = [
  { resource: 'components', amount: 2, price: [16, 22], name: 'COMPONENTS' },
];

/**
 * The caravan.
 *
 * A built trade post unlocks periodic caravan visits. Each visit has three one-shot offers; most
 * turn surplus water/food/components into scrap, which is the sustainable answer to a stripped map.
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
  }

  post() {
    return this.settlement.buildings.find((b) => b.type === 'trade' && b.built && !b.destroyed) || null;
  }

  update(dt) {
    const post = this.post();
    if (!post) {
      this.arrived = false;
      this.offers = [];
      this.timer = 28;
      this.stay = 0;
      return;
    }
    if (this.arrived) {
      this.stay = Math.max(0, this.stay - dt);
      if (this.stay <= 0) {
        this.arrived = false;
        this.offers = [];
        this.timer = this.rng.range(80, 130);
        this.onDepart?.();
      }
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) this.arrive();
  }

  arrive() {
    this.arrived = true;
    this.stay = 75;
    this.visit++;
    this.offers = this.generateOffers();
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
  }
}
