/**
 * Workshop recipe content. Data only: no Three.js, no economy, no UI.
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
