import { CALIBERS } from './armory.js';
import { COMPONENT_CAP, RECIPES, RECIPE_ORDER } from './content/recipes.js';

/**
 * Workshop recipe helpers. The data lives in `content/recipes.js`; the caps still depend on the
 * armory calibre table and the component pool.
 */

export { COMPONENT_CAP, RECIPES, RECIPE_ORDER } from './content/recipes.js';

export function recipeCap(recipe) {
  if (!recipe) return 0;
  return recipe.ammo ? CALIBERS[recipe.ammo].max : COMPONENT_CAP;
}

export function recipeStock(state, recipe) {
  if (!recipe) return 0;
  if (recipe.ammo) return Math.max(0, Math.floor(state.ammo?.[recipe.ammo] || 0));
  return Math.max(0, Math.floor(state.components || 0));
}

export function nextRecipe(id) {
  const i = RECIPE_ORDER.indexOf(id);
  return RECIPE_ORDER[(i + 1 + RECIPE_ORDER.length) % RECIPE_ORDER.length];
}
