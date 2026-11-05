import { describe, expect, it } from 'vitest';
import { applyProduction, canProduce } from '../../../src/features/economy/production.js';
import { RECIPES, recipeCap, recipeStock, nextRecipe } from '../../../src/recipes.js';

describe('workshop production rules', () => {
  const recipe = RECIPES.pistol;

  it('checks scrap and output capacity', () => {
    expect(canProduce(recipe, { scrap: 3, stock: 0, cap: 144 })).toEqual({ ok: false, reason: 'NO SCRAP' });
    expect(canProduce(recipe, { scrap: 4, stock: 140, cap: 144 })).toEqual({ ok: false, reason: 'STORAGE FULL' });
    expect(canProduce(recipe, { scrap: 4, stock: 0, cap: 144 })).toEqual({ ok: true, reason: '' });
  });

  it('applies the cost and output', () => {
    expect(applyProduction(recipe, { scrap: 10, stock: 5 })).toEqual({ scrap: 6, stock: 17 });
  });

  it('keeps the component recipe separate', () => {
    expect(recipeCap(RECIPES.components)).toBe(40);
    expect(recipeStock({ components: 3, ammo: {} }, RECIPES.components)).toBe(3);
  });

  it('cycles recipes', () => {
    expect(nextRecipe('pistol')).toBe('rifle');
    expect(nextRecipe('components')).toBe('pistol');
  });
});
