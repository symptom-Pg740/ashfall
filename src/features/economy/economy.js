import { addResource, canAfford, clampResource, pay, takeResource } from '../../core/stockpile.js';

/**
 * The camp stockpile.
 *
 * One owner for scrap, water, food and components. The legacy `state` object keeps the same flat
 * fields so the UI and save format still work, but only this module writes them.
 */

export const STORAGE_RESOURCES = ['scrap', 'water', 'food', 'components'];

export class Economy {
  /**
   * @param {{ state: any, componentCap?: number }} options
   */
  constructor({ state, componentCap = 40 }) {
    this.state = state;
    this.capacity = state.scrapCap || 80;
    this.componentCap = componentCap;
    this.syncCaps();
  }

  /** @param {string} type */
  amount(type) {
    return this.state[type] || 0;
  }

  /** @param {string} type */
  capacityFor(type) {
    return type === 'components' ? this.componentCap : this.capacity;
  }

  /** @param {string} type */
  isFull(type) {
    return this.amount(type) >= this.capacityFor(type);
  }

  /** @param {string} type @param {number} amount */
  add(type, amount) {
    const result = addResource(this.amount(type), amount, this.capacityFor(type));
    this.state[type] = result.value;
    return result.accepted;
  }

  /** @param {string} type @param {number} amount */
  take(type, amount) {
    const result = takeResource(this.amount(type), amount);
    this.state[type] = result.value;
    return result.taken;
  }

  /** @param {string} type @param {number} value */
  set(type, value) {
    this.state[type] = clampResource(value, this.capacityFor(type));
  }

  /** @param {Record<string, number>} cost */
  canAfford(cost) {
    return canAfford(this.snapshot(), cost);
  }

  /**
   * Atomic spend. Returns false and changes nothing when any resource is short.
   * @param {Record<string, number>} cost
   */
  spend(cost) {
    const result = pay(this.snapshot(), cost);
    if (!result.ok) return false;
    for (const [type, value] of Object.entries(result.stock)) {
      if (type in this.state) this.state[type] = value;
    }
    return true;
  }

  /** @param {number} cap */
  setCapacity(cap) {
    this.capacity = Math.max(0, Number(cap) || 0);
    this.syncCaps();
  }

  /** @param {number} cap */
  setComponentCap(cap) {
    this.componentCap = Math.max(0, Number(cap) || 0);
    this.syncCaps();
  }

  /** Re-clamp after load or a capacity change. */
  syncCaps() {
    this.state.scrapCap = this.capacity;
    this.state.waterCap = this.capacity;
    this.state.foodCap = this.capacity;
    this.state.scrap = clampResource(this.state.scrap, this.capacity);
    this.state.water = clampResource(this.state.water, this.capacity);
    this.state.food = clampResource(this.state.food, this.capacity);
    this.state.components = clampResource(this.state.components, this.componentCap);
  }

  /** Re-read capacities from the legacy state after a save load. */
  syncFromState() {
    this.capacity = this.state.scrapCap || this.capacity;
    this.syncCaps();
  }

  snapshot() {
    return {
      scrap: this.amount('scrap'),
      water: this.amount('water'),
      food: this.amount('food'),
      components: this.amount('components'),
    };
  }

  total() {
    return STORAGE_RESOURCES.reduce((n, type) => n + this.amount(type), 0);
  }
}
