import type { ElementId, IslandId, Reward } from '../core/types';
import { ELEMENT_ORDER, ELEMENTS } from './elements';

// ————————————————————————————— Îles —————————————————————————————

export interface IslandDef {
  id: IslandId;
  name: string;
  subtitle: string;
  unlockLevel: number;
  cost: { coins?: number; gems?: number; essence?: number };
  /** éléments favorisés : +15 % de production pour les habitats correspondants */
  affinity: ElementId[];
  ground: string;
  ground2: string;
  cliff: string;
  water: string;
  sky: string;
  weather: WeatherId[];
  music: { root: number; scale: number[]; tempo: number; wave: OscillatorType };
  /** position dans l'archipel (unités monde) */
  pos: [number, number];
  radius: number;
}

export type WeatherId = 'sun' | 'rain' | 'storm' | 'snow' | 'rainbow' | 'stars';

export const WEATHER_INFO: Record<WeatherId, { name: string; icon: string; bonus: string }> = {
  sun: { name: 'Soleil', icon: '☀️', bonus: 'Cultures +10 % plus rapides' },
  rain: { name: 'Pluie', icon: '🌧️', bonus: 'Récoltes +20 %' },
  storm: { name: 'Orage', icon: '⛈️', bonus: 'Habitats Volt +25 %' },
  snow: { name: 'Neige', icon: '❄️', bonus: 'Habitats Glace +25 %' },
  rainbow: { name: 'Arc-en-ciel', icon: '🌈', bonus: 'Production +10 %' },
  stars: { name: 'Pluie d’étoiles', icon: '🌌', bonus: 'Chance d’œuf rare +' },
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA = [0, 2, 4, 7, 9];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

export const ISLANDS: Record<IslandId, IslandDef> = {
  verdante: { id: 'verdante', name: 'Île Verdante', subtitle: 'Nature, arbres et rivières', unlockLevel: 1, cost: {}, affinity: ['flora', 'aqua'], ground: '#5fcf4a', ground2: '#8de35a', cliff: '#b48a5e', water: '#39b6ff', sky: '#9fdcff', weather: ['sun', 'rain', 'rainbow'], music: { root: 60, scale: MAJOR, tempo: 104, wave: 'triangle' }, pos: [0, 0], radius: 15 },
  volcanique: { id: 'volcanique', name: 'Île Volcanique', subtitle: 'Lave, volcans et roches', unlockLevel: 4, cost: { coins: 2500 }, affinity: ['flamme', 'roche'], ground: '#7a4b3a', ground2: '#a0603f', cliff: '#4a2c24', water: '#ff6a1c', sky: '#ffb08a', weather: ['sun', 'storm'], music: { root: 57, scale: DORIAN, tempo: 112, wave: 'sawtooth' }, pos: [36, -8], radius: 13 },
  glaciaire: { id: 'glaciaire', name: 'Île Glaciaire', subtitle: 'Neige éternelle et glace', unlockLevel: 7, cost: { coins: 12000 }, affinity: ['glace', 'vent'], ground: '#e8f6ff', ground2: '#cbe9ff', cliff: '#7fa8c8', water: '#8ee6ff', sky: '#cfefff', weather: ['snow', 'sun'], music: { root: 64, scale: LYDIAN, tempo: 88, wave: 'sine' }, pos: [-34, -12], radius: 13 },
  celeste: { id: 'celeste', name: 'Île Céleste', subtitle: 'Nuages et énergie pure', unlockLevel: 10, cost: { coins: 40000, gems: 10 }, affinity: ['lumiere', 'vent', 'volt'], ground: '#fff4d6', ground2: '#ffe9b0', cliff: '#e8d8ff', water: '#ffffff', sky: '#ffe9f6', weather: ['sun', 'rainbow', 'storm'], music: { root: 67, scale: PENTA, tempo: 96, wave: 'sine' }, pos: [6, -38], radius: 12 },
  ombres: { id: 'ombres', name: 'Île des Ombres', subtitle: 'Cristaux violets et mystère', unlockLevel: 14, cost: { coins: 120000, gems: 25 }, affinity: ['ombre'], ground: '#3d2f5c', ground2: '#5a4585', cliff: '#231a38', water: '#8a5cff', sky: '#6b5a9a', weather: ['storm', 'rain', 'stars'], music: { root: 55, scale: MINOR, tempo: 84, wave: 'triangle' }, pos: [-30, 26], radius: 13 },
  cosmique: { id: 'cosmique', name: 'Île Cosmique', subtitle: 'Étoiles et fragments de planètes', unlockLevel: 18, cost: { coins: 300000, gems: 50, essence: 3 }, affinity: ['cosmos', 'lumiere'], ground: '#2b2f6b', ground2: '#454aa0', cliff: '#151838', water: '#ff7bf1', sky: '#1b1f4a', weather: ['stars'], music: { root: 62, scale: LYDIAN, tempo: 76, wave: 'sine' }, pos: [32, 30], radius: 13 },
  tempete: { id: 'tempete', name: 'Île des Tempêtes', subtitle: 'Éclairs et vents furieux', unlockLevel: 22, cost: { coins: 600000, gems: 80, essence: 5 }, affinity: ['volt', 'vent'], ground: '#6c7a96', ground2: '#8995b0', cliff: '#3a4258', water: '#ffe14d', sky: '#8a93b8', weather: ['storm', 'rain'], music: { root: 58, scale: DORIAN, tempo: 120, wave: 'square' }, pos: [62, 12], radius: 12 },
  corail: { id: 'corail', name: 'Île de Corail', subtitle: 'Lagons et récifs suspendus', unlockLevel: 26, cost: { coins: 1000000, gems: 120, essence: 8 }, affinity: ['aqua', 'roche'], ground: '#ffe2b8', ground2: '#ffd09a', cliff: '#ff9a8a', water: '#3fe0d0', sky: '#bff6ff', weather: ['sun', 'rain', 'rainbow'], music: { root: 65, scale: MAJOR, tempo: 100, wave: 'triangle' }, pos: [-62, -2], radius: 12 },
  dunes: { id: 'dunes', name: 'Île des Dunes', subtitle: 'Sables dorés suspendus', unlockLevel: 30, cost: { coins: 1600000, gems: 150, essence: 10 }, affinity: ['vent', 'roche'], ground: '#f3d28a', ground2: '#e8bf6a', cliff: '#b8874a', water: '#5ad8ff', sky: '#ffe7b8', weather: ['sun', 'storm'], music: { root: 57, scale: [0, 1, 4, 5, 7, 8, 10], tempo: 92, wave: 'triangle' }, pos: [-6, 56], radius: 12 },
  aurore: { id: 'aurore', name: 'Île de l’Aurore', subtitle: 'Lumière éternelle et jardins', unlockLevel: 34, cost: { coins: 2500000, gems: 200, essence: 14 }, affinity: ['lumiere', 'flora'], ground: '#ffd6ec', ground2: '#ffeaf5', cliff: '#c79ad6', water: '#ffe680', sky: '#ffeefa', weather: ['rainbow', 'sun', 'stars'], music: { root: 69, scale: LYDIAN, tempo: 90, wave: 'sine' }, pos: [62, -40], radius: 12 },
};

export const ISLAND_ORDER: IslandId[] = ['verdante', 'volcanique', 'glaciaire', 'celeste', 'ombres', 'cosmique', 'tempete', 'corail', 'dunes', 'aurore'];

export const GRID = 18; // grille GRID×GRID centrée sur chaque île

export function islandTileOk(id: IslandId, x: number, y: number): boolean {
  const r = ISLANDS[id].radius / 2 - 0.6;
  const cx = x + 0.5 - GRID / 2;
  const cy = y + 0.5 - GRID / 2;
  return cx * cx + cy * cy <= r * r * 1.0 && x >= 0 && y >= 0 && x < GRID && y < GRID;
}

export function islandMaxBuildings(level: number): number {
  return 10 + level * 4;
}

export function islandUpgradeCost(level: number): { coins: number; essence: number } {
  return { coins: Math.round(1500 * Math.pow(level, 2.2)), essence: level >= 4 ? level - 3 : 0 };
}

// ————————————————————————————— Cultures & cuisine —————————————————————————————

export interface CropDef {
  id: string;
  name: string;
  icon: string;
  category: 'céréale' | 'fruit' | 'légume' | 'plante spéciale' | 'plante énergétique';
  seconds: number;
  cost: number;
  yield: number;
  xp: number;
  unlockLevel: number;
  bonus?: Reward;
}

export const CROPS: CropDef[] = [
  { id: 'ble_xala', name: 'Blé de Xala', icon: '🌾', category: 'céréale', seconds: 30, cost: 20, yield: 12, xp: 4, unlockLevel: 1 },
  { id: 'baie_ondine', name: 'Baie Ondine', icon: '🍓', category: 'fruit', seconds: 120, cost: 60, yield: 16, xp: 6, unlockLevel: 2 },
  { id: 'carotte_zap', name: 'Carotte Zap', icon: '🥕', category: 'légume', seconds: 300, cost: 150, yield: 22, xp: 8, unlockLevel: 4 },
  { id: 'piment_braise', name: 'Piment Braise', icon: '🌶️', category: 'fruit', seconds: 600, cost: 300, yield: 26, xp: 10, unlockLevel: 6 },
  { id: 'champi_nuit', name: 'Champi de Nuit', icon: '🍄', category: 'plante spéciale', seconds: 1200, cost: 600, yield: 30, xp: 14, unlockLevel: 9 },
  { id: 'lys_solaire', name: 'Lys Solaire', icon: '🌼', category: 'plante énergétique', seconds: 2400, cost: 1200, yield: 30, xp: 18, unlockLevel: 12, bonus: { energy: 8 } },
];
export const CROP: Record<string, CropDef> = Object.fromEntries(CROPS.map((c) => [c.id, c]));

export interface RecipeDef {
  id: string;
  name: string;
  icon: string;
  seconds: number;
  input: Record<string, number>;
  xp: number;
  unlockLevel: number;
}

export const RECIPES: RecipeDef[] = [
  { id: 'galette', name: 'Galette Xala', icon: '🥞', seconds: 60, input: { ble_xala: 20, baie_ondine: 6 }, xp: 180, unlockLevel: 3 },
  { id: 'soupe_zap', name: 'Soupe Zap', icon: '🍲', seconds: 300, input: { carotte_zap: 15, ble_xala: 15 }, xp: 380, unlockLevel: 5 },
  { id: 'brochette', name: 'Brochette Braise', icon: '🍢', seconds: 600, input: { piment_braise: 15, carotte_zap: 10 }, xp: 600, unlockLevel: 8 },
  { id: 'festin', name: 'Festin Cosmique', icon: '🍱', seconds: 1800, input: { champi_nuit: 15, lys_solaire: 10 }, xp: 1500, unlockLevel: 12 },
];
export const RECIPE: Record<string, RecipeDef> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** valeur en XP d'un objet nourriture (culture ou plat) */
export function foodXp(itemId: string): number {
  return CROP[itemId]?.xp ?? RECIPE[itemId]?.xp ?? 0;
}

// ————————————————————————————— Bâtiments —————————————————————————————

export type BuildingKind = 'habitat' | 'farm' | 'nursery' | 'breeding' | 'kitchen' | 'storage' | 'energy' | 'essence' | 'deco' | 'monument' | 'arena';

export interface BuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  icon: string;
  size: number;
  element?: ElementId | 'any';
  unlockLevel: number;
  cost: { coins?: number; gems?: number; essence?: number };
  buildSeconds: number;
  maxLevel: number;
  /** île(s) où ce bâtiment est autorisé, toutes si absent */
  islands?: IslandId[];
  limit?: number;
  desc: string;
  /** bonus de production global (monuments), en % */
  bonus?: number;
  /** cosmétique à débloquer avant achat */
  requiresUnlock?: string;
}

const HAB_UNLOCK: Record<ElementId, number> = { flamme: 1, flora: 1, aqua: 2, volt: 3, roche: 4, glace: 6, vent: 7, ombre: 9, lumiere: 11, cosmos: 15 };

export const BUILDINGS: BuildingDef[] = [
  ...ELEMENT_ORDER.map((e): BuildingDef => ({
    id: `habitat_${e}`, name: `Habitat ${ELEMENTS[e].name}`, kind: 'habitat', icon: ELEMENTS[e].icon, size: 3, element: e,
    unlockLevel: HAB_UNLOCK[e], cost: { coins: 100 + HAB_UNLOCK[e] * HAB_UNLOCK[e] * 120 }, buildSeconds: 10 + HAB_UNLOCK[e] * 20, maxLevel: 5,
    desc: `Abrite les Xalamons d’élément ${ELEMENTS[e].name} et accumule leurs XalaCoins.`,
  })),
  { id: 'habitat_prisme', name: 'Habitat Prisme', kind: 'habitat', icon: '🔷', size: 3, element: 'any', unlockLevel: 16, cost: { coins: 250000, essence: 2 }, buildSeconds: 1800, maxLevel: 5, desc: 'Un habitat légendaire qui accueille tous les éléments.' },
  { id: 'farm', name: 'Ferme Xala', kind: 'farm', icon: '🌾', size: 2, unlockLevel: 1, cost: { coins: 50 }, buildSeconds: 5, maxLevel: 5, desc: 'Plante des cultures pour nourrir tes Xalamons.' },
  { id: 'nursery', name: 'Nurserie', kind: 'nursery', icon: '🥚', size: 3, unlockLevel: 1, cost: { coins: 500 }, buildSeconds: 30, maxLevel: 5, limit: 1, desc: 'Fais éclore tes œufs. Chaque niveau ajoute un emplacement.' },
  { id: 'breeding', name: 'Sanctuaire d’Union', kind: 'breeding', icon: '🧬', size: 3, unlockLevel: 4, cost: { coins: 2000 }, buildSeconds: 60, maxLevel: 5, limit: 2, desc: 'Unis deux Xalamons compatibles pour obtenir un œuf.' },
  { id: 'kitchen', name: 'Cuisine Xala', kind: 'kitchen', icon: '🍳', size: 2, unlockLevel: 3, cost: { coins: 800 }, buildSeconds: 30, maxLevel: 5, limit: 2, desc: 'Transforme tes récoltes en plats très nourrissants.' },
  { id: 'storage', name: 'Entrepôt Céleste', kind: 'storage', icon: '🏦', size: 2, unlockLevel: 5, cost: { coins: 3000 }, buildSeconds: 120, maxLevel: 5, limit: 4, desc: 'Augmente la capacité maximale de XalaCoins.' },
  { id: 'energy_well', name: 'Puits de Xala', kind: 'energy', icon: '⚡', size: 2, unlockLevel: 3, cost: { coins: 1500 }, buildSeconds: 60, maxLevel: 5, limit: 3, desc: 'Puise la XalaEnergy de l’île.' },
  { id: 'essence_condenser', name: 'Condensateur d’Essence', kind: 'essence', icon: '🌟', size: 3, unlockLevel: 18, cost: { coins: 400000, gems: 40 }, buildSeconds: 3600, maxLevel: 5, limit: 1, islands: ['cosmique'], desc: 'Condense lentement la précieuse SuperEssence.' },
  { id: 'arena', name: 'Colisée des Nuages', kind: 'arena', icon: '🏟️', size: 3, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, limit: 1, desc: 'Lieu des combats : campagne, arène, tournoi et boss.' },
  { id: 'monument_xala', name: 'Monument de Xala', kind: 'monument', icon: '🗿', size: 2, unlockLevel: 8, cost: { coins: 25000, essence: 1 }, buildSeconds: 600, maxLevel: 3, limit: 1, bonus: 5, desc: 'Monument ancien : +5 % de production par niveau.' },
  { id: 'monument_etoile', name: 'Obélisque Stellaire', kind: 'monument', icon: '🗼', size: 2, unlockLevel: 20, cost: { coins: 250000, essence: 4 }, buildSeconds: 1800, maxLevel: 3, limit: 1, bonus: 8, desc: 'Canalise l’énergie des étoiles : +8 % par niveau.' },
  // décorations
  { id: 'deco_tree', name: 'Arbre Nuage', kind: 'deco', icon: '🌳', size: 1, unlockLevel: 1, cost: { coins: 100 }, buildSeconds: 0, maxLevel: 1, desc: 'Un arbre aux feuilles cotonneuses.' },
  { id: 'deco_flowers', name: 'Parterre de Fleurs', kind: 'deco', icon: '🌸', size: 1, unlockLevel: 1, cost: { coins: 80 }, buildSeconds: 0, maxLevel: 1, desc: 'Des fleurs qui chantent au vent.' },
  { id: 'deco_lantern', name: 'Lanterne de Xala', kind: 'deco', icon: '🏮', size: 1, unlockLevel: 3, cost: { coins: 400 }, buildSeconds: 0, maxLevel: 1, desc: 'Brille doucement la nuit.' },
  { id: 'deco_crystal', name: 'Cristal Flottant', kind: 'deco', icon: '💠', size: 1, unlockLevel: 6, cost: { gems: 5 }, buildSeconds: 0, maxLevel: 1, desc: 'Un cristal qui lévite au-dessus du sol.' },
  { id: 'deco_fountain', name: 'Fontaine Céleste', kind: 'deco', icon: '⛲', size: 2, unlockLevel: 8, cost: { coins: 5000 }, buildSeconds: 0, maxLevel: 1, desc: 'L’eau y coule vers le haut.' },
  { id: 'deco_statue', name: 'Statue Xalamon', kind: 'deco', icon: '🗽', size: 1, unlockLevel: 10, cost: { gems: 15 }, buildSeconds: 0, maxLevel: 1, desc: 'En l’honneur des premiers éleveurs.' },
  { id: 'deco_flame_torch', name: 'Brasero du Festival', kind: 'deco', icon: '🔥', size: 1, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, requiresUnlock: 'deco_flame_torch', desc: 'Décoration du Festival de la Flamme.' },
  { id: 'deco_snowman', name: 'Bonhomme de Givre', kind: 'deco', icon: '⛄', size: 1, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, requiresUnlock: 'deco_snowman', desc: 'Décoration du Festival Glaciaire.' },
  { id: 'deco_star_lamp', name: 'Lampe Astrale', kind: 'deco', icon: '🌠', size: 1, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, requiresUnlock: 'deco_star_lamp', desc: 'Décoration de la Nuit Cosmique.' },
  { id: 'deco_pumpkin', name: 'Citrouille Lanterne', kind: 'deco', icon: '🎃', size: 1, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, requiresUnlock: 'deco_pumpkin', desc: 'Décoration du Festival des Ombres.' },
  { id: 'deco_sakura', name: 'Arbre en Fleurs', kind: 'deco', icon: '🌸', size: 1, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, requiresUnlock: 'deco_sakura', desc: 'Décoration du Printemps Xala.' },
  { id: 'deco_eclipse', name: 'Autel de l’Éclipse', kind: 'deco', icon: '🌘', size: 1, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, requiresUnlock: 'deco_eclipse', desc: 'Décoration de l’Éclipse.' },
  { id: 'deco_pass_banner', name: 'Bannière du Pass', kind: 'deco', icon: '🎏', size: 1, unlockLevel: 1, cost: { coins: 0 }, buildSeconds: 0, maxLevel: 1, requiresUnlock: 'deco_pass_banner', desc: 'Récompense du Xala Pass.' },
];

export const BUILDING: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export const HABITAT_CAPACITY = [0, 2, 3, 4, 5, 6];
export const HABITAT_COIN_CAP = [0, 800, 2500, 7000, 18000, 45000];

export function upgradeCost(def: BuildingDef, toLevel: number): { coins: number; gems?: number; essence: number } {
  const base = Math.max(200, (def.cost.coins ?? 0) || 500);
  return {
    coins: Math.round(base * Math.pow(toLevel, 2.1)),
    essence: toLevel >= 4 && def.kind !== 'farm' && def.kind !== 'deco' ? toLevel - 3 : 0,
  };
}

export function upgradeSeconds(def: BuildingDef, toLevel: number): number {
  return Math.round(Math.max(10, def.buildSeconds) * toLevel * 1.5);
}

export function nurserySlots(level: number): number { return 1 + level; }
export function storageCapacity(levels: number[]): number {
  return 100000 + levels.reduce((s, l) => s + 150000 * l, 0);
}
export function energyCap(level: number): number { return 50 + level * 5; }
