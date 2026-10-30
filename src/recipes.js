import { CALIBERS } from './armory.js';

/**
 * Workshop recipes. One artisan runs one recipe; two artisans produce twice as fast.
 * Output goes into the same per-caliber ammo pool the armory draws from, or the component pool.
 */
export const COMPONENT_CAP = 40;

export const RECIPES = {
  pistol: {
    id: 'pistol',
    label: 'PISTOL ROUNDS',
    amount: 12,
    unit: 'ROUNDS',
    scrap: 4,
    time: 8,
    ammo: 'pistol',
  },
  rifle: {
    id: 'rifle',
    label: 'RIFLE ROUNDS',
    amount: 6,
    unit: 'ROUNDS',
    scrap: 6,
    time: 8,
    ammo: 'rifle',
  },
  shell: {
    id: 'shell',
    label: 'SHELLS',
    amount: 4,
    unit: 'SHELLS',
    scrap: 5,
    time: 8,
    ammo: 'shell',
  },
  components: {
    id: 'components',
    label: 'COMPONENTS',
    amount: 1,
    unit: 'COMPONENT',
    scrap: 8,
    time: 12,
    component: true,
  },
};

export const RECIPE_ORDER = ['pistol', 'rifle', 'shell', 'components'];

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
