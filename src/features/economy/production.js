/**
 * Workshop production rules.
 *
 * Pure checks over a recipe and the current stock. The adapter still owns ammo pools and callbacks.
 */

/**
 * @param {any} recipe
 * @param {{ scrap: number, stock: number, cap: number }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function canProduce(recipe, { scrap, stock, cap }) {
  if (!recipe) return { ok: false, reason: 'NO RECIPE' };
  if (scrap < recipe.scrap) return { ok: false, reason: 'NO SCRAP' };
  if (stock + recipe.amount > cap) return { ok: false, reason: 'STORAGE FULL' };
  return { ok: true, reason: '' };
}

/**
 * @param {any} recipe
 * @param {{ scrap: number, stock: number }} input
 * @returns {{ scrap: number, stock: number }}
 */
export function applyProduction(recipe, { scrap, stock }) {
  return {
    scrap: Math.max(0, scrap - recipe.scrap),
    stock: stock + recipe.amount,
  };
}
