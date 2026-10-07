import type { ElementId, RarityId } from '../core/types';

export interface ElementDef {
  id: ElementId;
  name: string;
  icon: string;
  color: string;
  color2: string;
  /** éléments contre lesquels celui-ci inflige ×1.5 */
  strong: ElementId[];
  particle: 'ember' | 'bubble' | 'leaf' | 'spark' | 'smoke' | 'snow' | 'swirl' | 'pebble' | 'glow' | 'star';
  /** fréquence de base pour les sons synthétisés */
  voice: number;
  lore: string;
}

export const ELEMENT_ORDER: ElementId[] = [
  'flamme', 'aqua', 'flora', 'volt', 'ombre', 'glace', 'vent', 'roche', 'lumiere', 'cosmos',
];

// Table équilibrée : chaque élément est fort contre 2 éléments et faible contre 2.
export const ELEMENTS: Record<ElementId, ElementDef> = {
  flamme: { id: 'flamme', name: 'Flamme', icon: '🔥', color: '#ff6a2b', color2: '#ffc93c', strong: ['flora', 'glace'], particle: 'ember', voice: 220, lore: 'La Xala ardente qui jaillit du cœur des volcans flottants.' },
  aqua: { id: 'aqua', name: 'Aqua', icon: '💧', color: '#2fa8ff', color2: '#8ee6ff', strong: ['flamme', 'roche'], particle: 'bubble', voice: 330, lore: 'Les rivières suspendues qui relient les îles entre elles.' },
  flora: { id: 'flora', name: 'Flora', icon: '🌿', color: '#3fcf5a', color2: '#c4f56a', strong: ['aqua', 'roche'], particle: 'leaf', voice: 294, lore: 'La sève de Xala qui fait pousser les forêts des nuages.' },
  volt: { id: 'volt', name: 'Volt', icon: '⚡', color: '#ffd400', color2: '#fff7a1', strong: ['aqua', 'vent'], particle: 'spark', voice: 392, lore: 'Les éclairs nés des orages entre les archipels.' },
  ombre: { id: 'ombre', name: 'Ombre', icon: '🌑', color: '#6a3cbc', color2: '#b98cff', strong: ['lumiere', 'cosmos'], particle: 'smoke', voice: 165, lore: 'La Xala silencieuse qui dort sous les cristaux violets.' },
  glace: { id: 'glace', name: 'Glace', icon: '❄️', color: '#7fe3ff', color2: '#e8fbff', strong: ['flora', 'vent'], particle: 'snow', voice: 440, lore: 'Le froid pur des sommets que les nuages n’atteignent jamais.' },
  vent: { id: 'vent', name: 'Vent', icon: '🌪️', color: '#9be8c8', color2: '#e4fff4', strong: ['flamme', 'volt'], particle: 'swirl', voice: 349, lore: 'Les courants qui portent les îles à travers le ciel.' },
  roche: { id: 'roche', name: 'Roche', icon: '🪨', color: '#b0865a', color2: '#e3c79b', strong: ['volt', 'glace'], particle: 'pebble', voice: 131, lore: 'La matière ancienne qui forme le socle de chaque île.' },
  lumiere: { id: 'lumiere', name: 'Lumière', icon: '✨', color: '#ffe680', color2: '#fffbe6', strong: ['ombre', 'cosmos'], particle: 'glow', voice: 523, lore: 'L’éclat de l’aube qui traverse la mer de nuages.' },
  cosmos: { id: 'cosmos', name: 'Cosmos', icon: '🌌', color: '#4b5cff', color2: '#ff7bf1', strong: ['ombre', 'lumiere'], particle: 'star', voice: 262, lore: 'La Xala tombée des étoiles, la plus mystérieuse de toutes.' },
};

export function elementMultiplier(attack: ElementId, defenders: ElementId[]): number {
  let m = 1;
  for (const d of defenders) {
    if (ELEMENTS[attack].strong.includes(d)) m *= 1.5;
    else if (ELEMENTS[d].strong.includes(attack)) m *= 0.75;
  }
  return Math.max(0.5, Math.min(2.25, m));
}

export interface RarityDef {
  id: RarityId;
  name: string;
  color: string;
  glow: string;
  stars: number;
  /** multiplicateur de stats */
  statMul: number;
  /** pièces / minute de base */
  income: number;
  /** poids dans l'élevage */
  breedWeight: number;
  hatchMinutes: number;
  sellValue: number;
}

export const RARITY_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'mythic', 'ancient', 'celestial'];

export const RARITIES: Record<RarityId, RarityDef> = {
  common: { id: 'common', name: 'Common', color: '#9fb3c8', glow: '#ffffff', stars: 1, statMul: 1, income: 10, breedWeight: 100, hatchMinutes: 0.5, sellValue: 50 },
  uncommon: { id: 'uncommon', name: 'Uncommon', color: '#53d769', glow: '#b8ffc4', stars: 2, statMul: 1.15, income: 16, breedWeight: 55, hatchMinutes: 3, sellValue: 150 },
  rare: { id: 'rare', name: 'Rare', color: '#3aa0ff', glow: '#a8d8ff', stars: 3, statMul: 1.32, income: 26, breedWeight: 22, hatchMinutes: 15, sellValue: 500 },
  epic: { id: 'epic', name: 'Epic', color: '#b05cff', glow: '#e3c2ff', stars: 4, statMul: 1.55, income: 40, breedWeight: 7, hatchMinutes: 60, sellValue: 2000 },
  mythic: { id: 'mythic', name: 'Mythic', color: '#ff4fa3', glow: '#ffc2e1', stars: 5, statMul: 1.8, income: 60, breedWeight: 2.2, hatchMinutes: 180, sellValue: 6000 },
  ancient: { id: 'ancient', name: 'Ancient', color: '#ff9d1c', glow: '#ffe0a8', stars: 6, statMul: 2.1, income: 85, breedWeight: 0.7, hatchMinutes: 360, sellValue: 15000 },
  celestial: { id: 'celestial', name: 'Celestial', color: '#5cf2ff', glow: '#e2fdff', stars: 7, statMul: 2.5, income: 120, breedWeight: 0.2, hatchMinutes: 720, sellValue: 40000 },
};

export function rarityIndex(r: RarityId): number {
  return RARITY_ORDER.indexOf(r);
}
