import type { ElementId, RarityId } from '../core/types';

// Toutes les créatures sont des créations originales de XalaMonsters.

export type BodyPlan = 'blob' | 'quad' | 'biped' | 'serpent' | 'bird' | 'fish' | 'golem' | 'sprite';
export type Wings = 'none' | 'bat' | 'feather' | 'crystal' | 'leaf' | 'fin' | 'energy';
export type Tail = 'none' | 'flame' | 'leaf' | 'fin' | 'spike' | 'bolt' | 'puff' | 'star' | 'long';
export type Crest = 'none' | 'flame' | 'leaf' | 'crystal' | 'spikes' | 'mane' | 'cloud';
export type Ears = 'none' | 'cat' | 'long' | 'fin' | 'leaf' | 'round';
export type Extra = 'halo' | 'rings' | 'orbs' | 'crystals' | 'spots' | 'stripes' | 'thirdEye' | 'antenna' | 'shell' | 'moss' | 'aura';

export interface Appearance {
  body: BodyPlan;
  primary: string;
  secondary: string;
  accent: string;
  eyes: 'big' | 'sleepy' | 'fierce' | 'star' | 'cyclops';
  ears?: Ears;
  horns?: number;
  wings?: Wings;
  tail?: Tail;
  crest?: Crest;
  extras?: Extra[];
  /** déformation globale (rondeur) */
  chubby?: number;
}

export interface Stats { hp: number; atk: number; def: number; spd: number }

export interface SpeciesDef {
  id: string;
  name: string;
  elements: ElementId[];
  rarity: RarityId;
  look: Appearance;
  lore: string;
  /** recette spéciale : chaque groupe doit être couvert par un parent différent */
  recipe?: ElementId[][];
  /** uniquement par événement / boutique / boss */
  exclusive?: 'event' | 'shop' | 'boss' | 'pass';
  eventKey?: string;
  stats: Stats;
  favoriteCrop: string;
}

const PROFILE: Record<ElementId, Stats> = {
  flamme: { hp: 95, atk: 30, def: 16, spd: 22 },
  aqua: { hp: 115, atk: 24, def: 20, spd: 20 },
  flora: { hp: 120, atk: 22, def: 22, spd: 17 },
  volt: { hp: 90, atk: 29, def: 15, spd: 28 },
  ombre: { hp: 98, atk: 31, def: 17, spd: 24 },
  glace: { hp: 105, atk: 26, def: 23, spd: 18 },
  vent: { hp: 92, atk: 25, def: 16, spd: 31 },
  roche: { hp: 135, atk: 23, def: 30, spd: 12 },
  lumiere: { hp: 108, atk: 26, def: 20, spd: 23 },
  cosmos: { hp: 110, atk: 29, def: 21, spd: 24 },
};

const CROP_BY_ELEMENT: Record<ElementId, string> = {
  flamme: 'piment_braise', aqua: 'baie_ondine', flora: 'ble_xala', volt: 'carotte_zap', ombre: 'champi_nuit',
  glace: 'baie_ondine', vent: 'ble_xala', roche: 'carotte_zap', lumiere: 'lys_solaire', cosmos: 'lys_solaire',
};

function sp(
  id: string, name: string, elements: ElementId[], rarity: RarityId, look: Appearance, lore: string,
  extra: Partial<SpeciesDef> = {},
): SpeciesDef {
  const s: Stats = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const e of elements) {
    const p = PROFILE[e];
    s.hp += p.hp / elements.length; s.atk += p.atk / elements.length;
    s.def += p.def / elements.length; s.spd += p.spd / elements.length;
  }
  // petite variation propre à chaque espèce (déterministe)
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const v = (k: number) => 1 + (((h >> k) & 15) - 7.5) / 100;
  const stats = { hp: Math.round(s.hp * v(0)), atk: Math.round(s.atk * v(4)), def: Math.round(s.def * v(8)), spd: Math.round(s.spd * v(12)) };
  return { id, name, elements, rarity, look, lore, stats, favoriteCrop: CROP_BY_ELEMENT[elements[0]], ...extra };
}

export const SPECIES_LIST: SpeciesDef[] = [
  // ——— Élémentaires de base (Common) ———
  sp('braisou', 'Braisou', ['flamme'], 'common', { body: 'quad', primary: '#ff6a2b', secondary: '#ffd36b', accent: '#7a2a10', eyes: 'big', ears: 'round', horns: 2, tail: 'flame', crest: 'flame', chubby: 1.15 }, 'Un petit dragon tout rond dont la queue crépite quand il est content.'),
  sp('ondelin', 'Ondelin', ['aqua'], 'common', { body: 'fish', primary: '#2fa8ff', secondary: '#c3f1ff', accent: '#105a9a', eyes: 'big', ears: 'fin', tail: 'fin', crest: 'none', extras: ['spots'] }, 'Il nage dans les rivières suspendues et adore faire des bulles.'),
  sp('feuillot', 'Feuillot', ['flora'], 'common', { body: 'blob', primary: '#3fcf5a', secondary: '#dfffa8', accent: '#1d6b2a', eyes: 'sleepy', ears: 'leaf', tail: 'leaf', crest: 'leaf', chubby: 1.25 }, 'Il dort au soleil pendant que des fleurs poussent sur son dos.'),
  sp('zinzap', 'Zinzap', ['volt'], 'common', { body: 'biped', primary: '#ffd400', secondary: '#fff7c2', accent: '#3b3b55', eyes: 'big', ears: 'long', tail: 'bolt', extras: ['antenna', 'stripes'] }, 'Il ne tient pas en place : chaque pas libère une étincelle.'),
  sp('nocturo', 'Nocturo', ['ombre'], 'common', { body: 'sprite', primary: '#5b2fa8', secondary: '#c9a8ff', accent: '#1a0f33', eyes: 'star', ears: 'cat', wings: 'bat', tail: 'long' }, 'Il se cache dans les ombres des cristaux et chuchote des secrets.'),
  sp('givrette', 'Givrette', ['glace'], 'common', { body: 'quad', primary: '#9fe9ff', secondary: '#ffffff', accent: '#3a8bb5', eyes: 'big', ears: 'cat', tail: 'puff', crest: 'crystal', chubby: 1.1 }, 'Son souffle dessine des flocons en forme d’étoile.'),
  sp('bourrasko', 'Bourrasko', ['vent'], 'common', { body: 'bird', primary: '#8fe3c0', secondary: '#f0fff8', accent: '#2c7a62', eyes: 'big', wings: 'feather', tail: 'puff', crest: 'cloud' }, 'Un petit oiseau-nuage qui surfe sur les courants d’air.'),
  sp('galetor', 'Galetor', ['roche'], 'common', { body: 'golem', primary: '#a87e52', secondary: '#e6c99c', accent: '#4e3a26', eyes: 'sleepy', horns: 1, extras: ['moss'], chubby: 1.2 }, 'Lent mais têtu, il roule plutôt que de marcher.'),
  sp('lumio', 'Lumio', ['lumiere'], 'uncommon', { body: 'sprite', primary: '#ffe680', secondary: '#ffffff', accent: '#c79a1c', eyes: 'big', wings: 'feather', tail: 'star', extras: ['halo'] }, 'Il brille plus fort quand quelqu’un sourit près de lui.'),
  sp('astrelle', 'Astrelle', ['cosmos'], 'rare', { body: 'biped', primary: '#4b5cff', secondary: '#ffb3f7', accent: '#1b1f5c', eyes: 'star', ears: 'long', tail: 'star', extras: ['orbs', 'spots'] }, 'Tombée d’une étoile filante, elle cherche encore sa constellation.'),

  // ——— Hybrides (Uncommon / Rare) ———
  sp('vaporon', 'Vaporon', ['flamme', 'aqua'], 'uncommon', { body: 'blob', primary: '#ff9a7a', secondary: '#bfe9ff', accent: '#6b3b5a', eyes: 'big', tail: 'fin', crest: 'cloud', extras: ['spots'], chubby: 1.2 }, 'Moitié flamme, moitié vague : il fume quand il est gêné.'),
  sp('braisiflore', 'Braisiflore', ['flamme', 'flora'], 'uncommon', { body: 'quad', primary: '#ff7d3b', secondary: '#7bdc5a', accent: '#5a2c10', eyes: 'fierce', ears: 'leaf', tail: 'flame', crest: 'leaf' }, 'Des fleurs de braise éclosent sur son dos sans jamais brûler.'),
  sp('fulgubraise', 'Fulgubraise', ['flamme', 'volt'], 'rare', { body: 'biped', primary: '#ff5a1f', secondary: '#ffe14d', accent: '#2a1a40', eyes: 'fierce', horns: 2, tail: 'bolt', crest: 'flame', extras: ['stripes'] }, 'Rapide comme l’éclair, ardent comme la lave.'),
  sp('magmor', 'Magmor', ['flamme', 'roche'], 'rare', { body: 'golem', primary: '#5a3a2e', secondary: '#ff6a2b', accent: '#ffcf4d', eyes: 'fierce', horns: 2, crest: 'spikes', extras: ['crystals'], chubby: 1.15 }, 'Sa carapace de roche refroidie cache un cœur en fusion.'),
  sp('tornafeu', 'Tornafeu', ['flamme', 'vent'], 'rare', { body: 'bird', primary: '#ff7a3d', secondary: '#ffe0b0', accent: '#8a2a0a', eyes: 'fierce', wings: 'feather', tail: 'flame', crest: 'flame' }, 'Il tourbillonne si vite qu’il dessine des spirales de feu.'),
  sp('thermigel', 'Thermigel', ['flamme', 'glace'], 'epic', { body: 'serpent', primary: '#ff6a2b', secondary: '#9fe9ff', accent: '#ffffff', eyes: 'star', horns: 2, tail: 'long', crest: 'crystal', extras: ['aura'] }, 'Le paradoxe vivant : un côté gèle, l’autre fond.'),
  sp('nenuphou', 'Nénuphou', ['aqua', 'flora'], 'uncommon', { body: 'blob', primary: '#3fc7b5', secondary: '#ffc4e6', accent: '#1e6b5f', eyes: 'sleepy', ears: 'leaf', crest: 'leaf', extras: ['spots'], chubby: 1.3 }, 'Il flotte sur les mares en portant une fleur sur la tête.'),
  sp('anguizap', 'Anguizap', ['aqua', 'volt'], 'rare', { body: 'serpent', primary: '#2f7bff', secondary: '#ffe94d', accent: '#0e2a5c', eyes: 'big', tail: 'bolt', crest: 'none', extras: ['stripes', 'antenna'] }, 'Chaque ondulation de son corps fait grésiller l’eau.'),
  sp('banquilou', 'Banquilou', ['aqua', 'glace'], 'uncommon', { body: 'fish', primary: '#5ac8ff', secondary: '#ffffff', accent: '#21659c', eyes: 'big', ears: 'fin', tail: 'fin', crest: 'crystal' }, 'Il dort sur des banquises miniatures qu’il fabrique lui-même.'),
  sp('embrunelle', 'Embrunelle', ['aqua', 'vent'], 'uncommon', { body: 'bird', primary: '#6fd3ff', secondary: '#e9fbff', accent: '#2c6f9a', eyes: 'big', wings: 'fin', tail: 'fin', crest: 'cloud' }, 'Elle plane au-dessus des cascades en chantant.'),
  sp('corallor', 'Corallor', ['aqua', 'roche'], 'rare', { body: 'golem', primary: '#ff7f9a', secondary: '#7fd9ff', accent: '#6a3040', eyes: 'sleepy', horns: 3, extras: ['crystals', 'shell'] }, 'Un récif ambulant où vivent de minuscules poissons.'),
  sp('ronceclair', 'Ronceclair', ['flora', 'volt'], 'rare', { body: 'quad', primary: '#7ad13f', secondary: '#fff05a', accent: '#2e4f12', eyes: 'fierce', ears: 'leaf', tail: 'bolt', crest: 'spikes' }, 'Ses ronces conduisent l’électricité des orages.'),
  sp('moussaut', 'Moussaut', ['flora', 'roche'], 'uncommon', { body: 'golem', primary: '#7d9a52', secondary: '#c9e88f', accent: '#3d4a2a', eyes: 'sleepy', extras: ['moss'], crest: 'leaf', chubby: 1.25 }, 'Une colline vivante couverte de mousse moelleuse.'),
  sp('pollenix', 'Pollenix', ['flora', 'vent'], 'rare', { body: 'bird', primary: '#b4f06a', secondary: '#ffe3f5', accent: '#3a6e1a', eyes: 'big', wings: 'leaf', tail: 'leaf', crest: 'leaf', extras: ['spots'] }, 'Partout où il vole, des fleurs apparaissent.'),
  sp('frimousse', 'Frimousse', ['flora', 'glace'], 'rare', { body: 'quad', primary: '#a8f0d0', secondary: '#ffffff', accent: '#3c8a6a', eyes: 'big', ears: 'leaf', tail: 'puff', crest: 'crystal' }, 'Une fleur des neiges qui ne fleurit qu’à minuit.'),
  sp('orageon', 'Orageon', ['volt', 'vent'], 'rare', { body: 'bird', primary: '#5d6bff', secondary: '#fff35a', accent: '#1f2266', eyes: 'fierce', wings: 'energy', tail: 'bolt', crest: 'cloud' }, 'Il annonce les orages en battant des ailes.'),
  sp('magnetrok', 'Magnétrok', ['volt', 'roche'], 'rare', { body: 'golem', primary: '#8c8fa8', secondary: '#ffdc3a', accent: '#2a2c3a', eyes: 'cyclops', horns: 2, extras: ['orbs', 'antenna'] }, 'Les cailloux flottent autour de lui comme des satellites.'),
  sp('cristalvolt', 'Cristalvolt', ['volt', 'glace'], 'epic', { body: 'quad', primary: '#b5f4ff', secondary: '#fff35a', accent: '#305c8c', eyes: 'star', horns: 2, wings: 'crystal', tail: 'bolt', crest: 'crystal' }, 'Ses cristaux stockent la foudre pendant des siècles.'),
  sp('blizzou', 'Blizzou', ['glace', 'vent'], 'uncommon', { body: 'sprite', primary: '#dff7ff', secondary: '#9fe1ff', accent: '#4a8fb5', eyes: 'big', ears: 'cat', wings: 'feather', tail: 'puff' }, 'Un petit tourbillon de neige qui joue à cache-cache.'),
  sp('glaciolithe', 'Glaciolithe', ['glace', 'roche'], 'rare', { body: 'golem', primary: '#9ccde8', secondary: '#ffffff', accent: '#45627a', eyes: 'sleepy', horns: 2, extras: ['crystals'], chubby: 1.1 }, 'Un glacier tout entier, endormi depuis l’aube des îles.'),
  sp('dunarok', 'Dunarok', ['vent', 'roche'], 'uncommon', { body: 'quad', primary: '#e0b872', secondary: '#fff1cf', accent: '#7a5a2a', eyes: 'sleepy', ears: 'long', tail: 'long', extras: ['stripes'] }, 'Il voyage avec les tempêtes de sable du ciel.'),
  sp('feunoir', 'Feunoir', ['ombre', 'flamme'], 'rare', { body: 'quad', primary: '#3a1f4f', secondary: '#ff5a2b', accent: '#ffb347', eyes: 'fierce', horns: 2, wings: 'bat', tail: 'flame', crest: 'flame' }, 'Ses flammes violettes ne produisent aucune lumière.'),
  sp('abyssin', 'Abyssin', ['ombre', 'aqua'], 'rare', { body: 'fish', primary: '#24305e', secondary: '#7a5cff', accent: '#5cf2ff', eyes: 'star', ears: 'fin', tail: 'fin', extras: ['antenna', 'spots'] }, 'Il vit dans les eaux les plus profondes, sous les îles.'),
  sp('sombrelys', 'Sombrelys', ['ombre', 'flora'], 'rare', { body: 'biped', primary: '#4a2c6b', secondary: '#9be36a', accent: '#d48cff', eyes: 'sleepy', ears: 'leaf', tail: 'leaf', crest: 'leaf', extras: ['spots'] }, 'Une fleur nocturne qui s’ouvre sous la lune.'),
  sp('solarion', 'Solarion', ['lumiere', 'flamme'], 'epic', { body: 'quad', primary: '#ffcf3a', secondary: '#ff7a2b', accent: '#ffffff', eyes: 'fierce', horns: 2, wings: 'feather', tail: 'flame', crest: 'mane', extras: ['halo'] }, 'Sa crinière brille comme un soleil levant.'),
  sp('perlumine', 'Perlumine', ['lumiere', 'aqua'], 'rare', { body: 'fish', primary: '#ffffff', secondary: '#9fe1ff', accent: '#ffd36b', eyes: 'big', ears: 'fin', tail: 'fin', extras: ['shell', 'halo'] }, 'Une perle vivante née d’un rayon de lune dans l’eau.'),
  sp('aurorelle', 'Aurorelle', ['lumiere', 'flora'], 'rare', { body: 'sprite', primary: '#ffe8a8', secondary: '#9be86a', accent: '#ff9ad1', eyes: 'big', wings: 'leaf', tail: 'leaf', crest: 'leaf', extras: ['halo'] }, 'Elle réveille les fleurs chaque matin.'),
  sp('nebulos', 'Nébulos', ['cosmos', 'vent'], 'epic', { body: 'serpent', primary: '#6a5cff', secondary: '#ffb3f7', accent: '#e2fdff', eyes: 'star', wings: 'energy', tail: 'star', crest: 'cloud', extras: ['orbs'] }, 'Il nage dans les nébuleuses comme dans un océan.'),
  sp('meteorok', 'Météorok', ['cosmos', 'roche'], 'epic', { body: 'golem', primary: '#3b3550', secondary: '#7a8cff', accent: '#ff9d1c', eyes: 'cyclops', horns: 3, extras: ['crystals', 'rings'] }, 'Un fragment de planète qui a appris à marcher.'),

  // ——— Créatures légendaires (Epic → Celestial) via recettes ———
  sp('eclipso', 'Éclipso', ['lumiere', 'ombre'], 'epic', { body: 'biped', primary: '#1d1530', secondary: '#ffe680', accent: '#b98cff', eyes: 'star', horns: 2, wings: 'bat', tail: 'long', extras: ['halo', 'aura'] }, 'Il apparaît uniquement lors des éclipses de Xala.', { recipe: [['lumiere'], ['ombre']] }),
  sp('stellaris', 'Stellaris', ['cosmos', 'lumiere'], 'mythic', { body: 'quad', primary: '#3c49ff', secondary: '#fff4b0', accent: '#ff7bf1', eyes: 'star', horns: 2, wings: 'crystal', tail: 'star', crest: 'mane', extras: ['halo', 'orbs', 'aura'] }, 'Les anciens disent qu’elle a allumé les premières étoiles.', { recipe: [['cosmos'], ['lumiere']] }),
  sp('neantis', 'Néantis', ['cosmos', 'ombre'], 'mythic', { body: 'serpent', primary: '#120b2a', secondary: '#7a5cff', accent: '#ff4fa3', eyes: 'star', horns: 3, wings: 'energy', tail: 'star', crest: 'spikes', extras: ['rings', 'aura'] }, 'Il dévore la lumière des étoiles mortes.', { recipe: [['cosmos'], ['ombre']] }),
  sp('tempestor', 'Tempestor', ['volt', 'vent'], 'mythic', { body: 'bird', primary: '#2c2f8f', secondary: '#9fe1ff', accent: '#fff35a', eyes: 'fierce', horns: 2, wings: 'energy', tail: 'bolt', crest: 'mane', extras: ['aura', 'orbs'] }, 'Le seigneur des orages, né au centre d’un cyclone.', { recipe: [['volt'], ['vent', 'aqua']] }),
  sp('xalaurus', 'Xalaurus', ['flamme', 'roche'], 'ancient', { body: 'quad', primary: '#7a4a2a', secondary: '#ffb347', accent: '#5cf2ff', eyes: 'fierce', horns: 3, wings: 'bat', tail: 'spike', crest: 'spikes', extras: ['crystals', 'aura', 'thirdEye'] }, 'Le premier Xalamon. Ses écailles contiennent la mémoire des îles.', { recipe: [['flamme', 'roche'], ['cosmos']] }),
  sp('primordia', 'Primordia', ['flora', 'aqua'], 'ancient', { body: 'serpent', primary: '#2f8f6a', secondary: '#bfffd9', accent: '#ffd36b', eyes: 'sleepy', horns: 2, wings: 'leaf', tail: 'leaf', crest: 'mane', extras: ['moss', 'aura', 'halo'] }, 'L’esprit de la toute première forêt des nuages.', { recipe: [['flora', 'aqua'], ['lumiere']] }),
  sp('celestyx', 'Célestyx', ['cosmos', 'lumiere'], 'celestial', { body: 'quad', primary: '#e8f6ff', secondary: '#7a8cff', accent: '#ffd36b', eyes: 'star', horns: 3, wings: 'crystal', tail: 'star', crest: 'mane', extras: ['halo', 'rings', 'aura', 'orbs'] }, 'Gardien des portes célestes. Seule la SuperEssence peut l’appeler.', { recipe: [['cosmos'], ['lumiere', 'ombre']] }),
  sp('superessia', 'Superessia', ['cosmos', 'ombre'], 'celestial', { body: 'sprite', primary: '#6a2cff', secondary: '#5cf2ff', accent: '#ffffff', eyes: 'star', horns: 2, wings: 'energy', tail: 'star', crest: 'crystal', extras: ['halo', 'rings', 'aura', 'thirdEye'] }, 'L’incarnation pure de la SuperEssence. Elle vibre d’énergie violette et bleue.', { exclusive: 'shop' }),

  // ——— Exclusifs d'événements ———
  sp('braselune', 'Braselune', ['flamme', 'lumiere'], 'epic', { body: 'biped', primary: '#ff4d2b', secondary: '#ffe680', accent: '#7a1010', eyes: 'fierce', horns: 2, wings: 'feather', tail: 'flame', crest: 'flame', extras: ['halo'] }, 'Il danse au centre du Festival de la Flamme.', { exclusive: 'event', eventKey: 'flamme_fest' }),
  sp('cristaline', 'Cristaline', ['glace', 'lumiere'], 'epic', { body: 'quad', primary: '#e2fbff', secondary: '#9fd8ff', accent: '#ff9ad1', eyes: 'big', ears: 'cat', horns: 1, wings: 'crystal', tail: 'puff', crest: 'crystal' }, 'Elle sculpte les palais de glace du Festival Glaciaire.', { exclusive: 'event', eventKey: 'glace_fest' }),
  sp('orbinox', 'Orbinox', ['cosmos', 'vent'], 'mythic', { body: 'sprite', primary: '#2b2f7a', secondary: '#ffb3f7', accent: '#fff4b0', eyes: 'star', ears: 'long', wings: 'energy', tail: 'star', extras: ['rings', 'orbs'] }, 'Il ne descend sur les îles que pendant la Nuit Cosmique.', { exclusive: 'event', eventKey: 'cosmic_night' }),
  sp('umbrelion', 'Umbrélion', ['ombre', 'roche'], 'epic', { body: 'quad', primary: '#2a1f3a', secondary: '#ffcf4d', accent: '#b98cff', eyes: 'fierce', horns: 2, tail: 'spike', crest: 'mane', extras: ['crystals'] }, 'Le lion de l’éclipse, à la crinière d’ombre.', { exclusive: 'event', eventKey: 'eclipse' }),
  sp('petalia', 'Pétalia', ['flora', 'vent'], 'epic', { body: 'sprite', primary: '#ffb3d9', secondary: '#c4f56a', accent: '#ffffff', eyes: 'big', ears: 'leaf', wings: 'leaf', tail: 'leaf', crest: 'leaf', extras: ['spots'] }, 'Elle fait tomber une pluie de pétales au Printemps Xala.', { exclusive: 'event', eventKey: 'spring' }),
  sp('citrouillon', 'Citrouillon', ['ombre', 'flora'], 'epic', { body: 'blob', primary: '#ff8a1c', secondary: '#3a1f4f', accent: '#ffe14d', eyes: 'fierce', horns: 1, tail: 'leaf', crest: 'leaf', extras: ['stripes'], chubby: 1.3 }, 'Il rit dans le noir pendant le Festival des Ombres.', { exclusive: 'event', eventKey: 'shadow_fest' }),
  sp('passarion', 'Passarion', ['lumiere', 'vent'], 'epic', { body: 'bird', primary: '#ffffff', secondary: '#5cf2ff', accent: '#ffd36b', eyes: 'star', wings: 'feather', tail: 'star', crest: 'mane', extras: ['halo'] }, 'La récompense ultime du Xala Pass.', { exclusive: 'pass' }),
];

export const SPECIES: Record<string, SpeciesDef> = Object.fromEntries(SPECIES_LIST.map((s) => [s.id, s]));

export const STAGE_NAMES = ['Bébé', 'Adolescent', 'Adulte', 'Supérieur'] as const;
export const STAGE_SCALE = [0.62, 0.8, 1, 1.18];
export const STAGE_STAT_MUL = [1, 1.25, 1.55, 1.95];
export const STAGE_LEVEL_CAP = [10, 20, 30, 40];

export const BASE_SPECIES_BY_ELEMENT: Record<ElementId, string> = {
  flamme: 'braisou', aqua: 'ondelin', flora: 'feuillot', volt: 'zinzap', ombre: 'nocturo',
  glace: 'givrette', vent: 'bourrasko', roche: 'galetor', lumiere: 'lumio', cosmos: 'astrelle',
};

export interface BossDef {
  id: string;
  name: string;
  elements: ElementId[];
  look: Appearance;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  lore: string;
}

export const BOSSES: BossDef[] = [
  { id: 'volcarion', name: 'Volcarion', elements: ['flamme', 'roche'], hp: 9000, atk: 70, def: 40, spd: 18, lore: 'Le titan du volcan éternel.', look: { body: 'quad', primary: '#3a1f1a', secondary: '#ff5a1f', accent: '#ffcf4d', eyes: 'fierce', horns: 3, wings: 'bat', tail: 'spike', crest: 'spikes', extras: ['crystals', 'aura'] } },
  { id: 'glacior', name: 'Glacior', elements: ['glace', 'vent'], hp: 10000, atk: 62, def: 48, spd: 16, lore: 'Le colosse qui gèle le ciel.', look: { body: 'golem', primary: '#bfeaff', secondary: '#ffffff', accent: '#2c6f9a', eyes: 'cyclops', horns: 3, crest: 'crystal', extras: ['crystals', 'aura'] } },
  { id: 'umbraxis', name: 'Umbraxis', elements: ['ombre'], hp: 9500, atk: 76, def: 36, spd: 24, lore: 'L’ombre qui avale les îles.', look: { body: 'serpent', primary: '#1a0f33', secondary: '#9a5cff', accent: '#ff4fa3', eyes: 'star', horns: 3, wings: 'bat', tail: 'long', crest: 'spikes', extras: ['aura', 'thirdEye'] } },
  { id: 'abyssalor', name: 'Abyssalor', elements: ['aqua', 'ombre'], hp: 11000, atk: 64, def: 44, spd: 20, lore: 'Le gardien des abysses sous la mer de nuages.', look: { body: 'fish', primary: '#14305e', secondary: '#5cf2ff', accent: '#ff7bf1', eyes: 'fierce', horns: 2, ears: 'fin', tail: 'fin', crest: 'spikes', extras: ['antenna', 'aura'] } },
  { id: 'cosmorgue', name: 'Cosmorgue', elements: ['cosmos'], hp: 12000, atk: 72, def: 46, spd: 22, lore: 'Né de l’effondrement d’une étoile de Xala.', look: { body: 'biped', primary: '#20145c', secondary: '#ff7bf1', accent: '#5cf2ff', eyes: 'star', horns: 3, wings: 'energy', tail: 'star', crest: 'mane', extras: ['rings', 'orbs', 'aura'] } },
];
