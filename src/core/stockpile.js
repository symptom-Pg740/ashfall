/**
 * Stockpile rules.
 *
 * Pure functions over a numeric value and a capacity. The caller owns the state object; this module
 * never touches `state.scrap`, the DOM or the scene.
 */

export const BASE_STORAGE = 80;
export const WAREHOUSE_STORAGE = 120;

/**
 * @param {number} warehouseCount
 * @param {{ base?: number, perWarehouse?: number }} [options]
 * @returns {number}
 */
export function storageCapacity(warehouseCount, options = {}) {
  const base = options.base ?? BASE_STORAGE;
  const perWarehouse = options.perWarehouse ?? WAREHOUSE_STORAGE;
  const count = Math.max(0, Math.floor(Number(warehouseCount) || 0));
  return base + perWarehouse * count;
}

/**
 * @param {number} value
 * @param {number} cap
 * @returns {number}
 */
export function clampResource(value, cap) {
  const max = Math.max(0, Number(cap) || 0);
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, v));
}

/**
 * Add up to `amount`, respecting capacity.
 * @param {number} value current amount
 * @param {number} amount requested amount (negative is ignored)
 * @param {number} cap capacity
 * @returns {{ value: number, accepted: number }}
 */
export function addResource(value, amount, cap) {
  const current = clampResource(value, cap);
  const max = Math.max(0, Number(cap) || 0);
  const requested = Math.max(0, Number(amount) || 0);
  const accepted = Math.max(0, Math.min(requested, max - current));
  return { value: current + accepted, accepted };
}

/**
 * Remove up to `amount`.
 * @param {number} value current amount
 * @param {number} amount requested amount (negative is ignored)
 * @returns {{ value: number, taken: number }}
 */
export function takeResource(value, amount) {
  const current = Math.max(0, Number(value) || 0);
  const requested = Math.max(0, Number(amount) || 0);
  const taken = Math.min(current, requested);
  return { value: current - taken, taken };
}

/**
 * @param {Record<string, number>} stock
 * @param {Record<string, number>} cost
 * @returns {boolean}
 */
export function canAfford(stock, cost) {
  for (const [key, required] of Object.entries(cost || {})) {
    if ((stock?.[key] || 0) < (required || 0)) return false;
  }
  return true;
}

/**
 * @param {Record<string, number>} stock
 * @param {Record<string, number>} cost
 * @returns {{ ok: boolean, stock: Record<string, number> }}
 */
export function pay(stock, cost) {
  if (!canAfford(stock, cost)) return { ok: false, stock };
  const next = { ...stock };
  for (const [key, required] of Object.entries(cost || {})) {
    next[key] = Math.max(0, (next[key] || 0) - (required || 0));
  }
  return { ok: true, stock: next };
}

/**
 * @param {number} value
 * @param {number} cap
 * @returns {number} 0..1
 */
export function resourceFraction(value, cap) {
  const max = Math.max(0, Number(cap) || 0);
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, (Number(value) || 0) / max));
}
