import type { ElementId, Reward } from '../core/types';

// ————————————————————————————— Quêtes —————————————————————————————

export type QuestCategory = 'île' | 'élevage' | 'combat' | 'collection' | 'nourriture';

export interface QuestDef {
  id: string;
  text: string;
  stat: string;
  target: number;
  reward: Reward;
  category: QuestCategory;
  /** quêtes d'histoire : valeur absolue de la stat (pas de ligne de base) */
  absolute?: boolean;
}

export const DAILY_POOL: QuestDef[] = [
  { id: 'd_collect', text: 'Récolte les XalaCoins de tes habitats 5 fois', stat: 'collects', target: 5, category: 'île', reward: { coins: 600, passXp: 100, eventCurrency: 5 } },
  { id: 'd_harvest', text: 'Récolte 4 cultures', stat: 'harvests', target: 4, category: 'nourriture', reward: { coins: 400, passXp: 100, eventCurrency: 5 } },
  { id: 'd_feed', text: 'Nourris tes Xalamons 10 fois', stat: 'feeds', target: 10, category: 'nourriture', reward: { coins: 500, passXp: 100, eventCurrency: 5 } },
  { id: 'd_win', text: 'Gagne 2 combats', stat: 'battles_won', target: 2, category: 'combat', reward: { gems: 2, passXp: 100, eventCurrency: 5 } },
  { id: 'd_breed', text: 'Lance un élevage', stat: 'breeds', target: 1, category: 'élevage', reward: { energy: 10, passXp: 100, eventCurrency: 5 } },
  { id: 'd_hatch', text: 'Fais éclore un œuf', stat: 'hatches', target: 1, category: 'élevage', reward: { coins: 800, passXp: 100, eventCurrency: 5 } },
  { id: 'd_cook', text: 'Cuisine un plat', stat: 'dishes', target: 1, category: 'nourriture', reward: { coins: 700, passXp: 100, eventCurrency: 5 } },
  { id: 'd_arena', text: 'Joue un combat d’arène', stat: 'arena_played', target: 1, category: 'combat', reward: { gems: 1, passXp: 100, eventCurrency: 5 } },
  { id: 'd_plant', text: 'Plante 5 cultures', stat: 'plants', target: 5, category: 'nourriture', reward: { coins: 300, passXp: 100, eventCurrency: 5 } },
  { id: 'd_coins', text: 'Gagne 3 000 XalaCoins', stat: 'coins_earned', target: 3000, category: 'île', reward: { energy: 8, passXp: 100, eventCurrency: 5 } },
];

export const WEEKLY_POOL: QuestDef[] = [
  { id: 'w_win', text: 'Gagne 20 combats', stat: 'battles_won', target: 20, category: 'combat', reward: { gems: 10, passXp: 300, eventCurrency: 20 } },
  { id: 'w_breed', text: 'Lance 8 élevages', stat: 'breeds', target: 8, category: 'élevage', reward: { gems: 8, passXp: 300, eventCurrency: 20 } },
  { id: 'w_harvest', text: 'Récolte 40 cultures', stat: 'harvests', target: 40, category: 'nourriture', reward: { coins: 8000, passXp: 300, eventCurrency: 20 } },
  { id: 'w_level', text: 'Fais monter 15 niveaux de Xalamons', stat: 'monster_levelups', target: 15, category: 'collection', reward: { gems: 8, passXp: 300, eventCurrency: 20 } },
  { id: 'w_boss', text: 'Attaque le Boss 5 fois', stat: 'boss_attacks', target: 5, category: 'combat', reward: { essence: 1, passXp: 300, eventCurrency: 20 } },
  { id: 'w_build', text: 'Construis ou améliore 5 bâtiments', stat: 'constructions', target: 5, category: 'île', reward: { coins: 10000, passXp: 300, eventCurrency: 20 } },
];

export const WEEKLY_CHEST: Reward = { gems: 15, essence: 1, eggs: ['__random_rare'] };

export const STORY_QUESTS: QuestDef[] = [
  { id: 's_harvest', text: 'Récolte ta première culture à la Ferme', stat: 'harvests', target: 1, category: 'nourriture', reward: { coins: 200, playerXp: 30 } },
  { id: 's_hatch', text: 'Fais éclore ton premier œuf à la Nurserie', stat: 'hatches', target: 1, category: 'élevage', reward: { coins: 300, playerXp: 40 } },
  { id: 's_feed', text: 'Nourris un Xalamon 3 fois', stat: 'feeds', target: 3, category: 'nourriture', reward: { coins: 300, playerXp: 40 } },
  { id: 's_collect', text: 'Récupère les XalaCoins d’un habitat', stat: 'collects', target: 1, category: 'île', reward: { coins: 300, playerXp: 40 } },
  { id: 's_habitat', text: 'Construis un nouvel habitat', stat: 'habitats_built', target: 1, category: 'île', reward: { coins: 600, gems: 5, playerXp: 60 } },
  { id: 's_battle', text: 'Gagne ton premier combat de campagne', stat: 'campaign_wins', target: 1, category: 'combat', reward: { coins: 500, gems: 5, playerXp: 60 } },
  { id: 's_level4', text: 'Fais atteindre le niveau 4 à un Xalamon', stat: 'max_monster_level', target: 4, category: 'collection', absolute: true, reward: { coins: 800, playerXp: 80 } },
  { id: 's_breed', text: 'Réalise ton premier élevage', stat: 'breeds', target: 1, category: 'élevage', reward: { gems: 10, playerXp: 80 } },
  { id: 's_owned5', text: 'Possède 5 Xalamons', stat: 'monsters_owned', target: 5, category: 'collection', absolute: true, reward: { coins: 1500, playerXp: 100 } },
  { id: 's_evolve', text: 'Fais évoluer un Xalamon', stat: 'evolutions', target: 1, category: 'collection', reward: { gems: 10, playerXp: 120 } },
  { id: 's_island2', text: 'Débloque l’Île Volcanique', stat: 'islands_unlocked', target: 2, category: 'île', absolute: true, reward: { coins: 3000, gems: 10, playerXp: 150 } },
  { id: 's_species10', text: 'Découvre 10 espèces dans le Codex', stat: 'species_owned', target: 10, category: 'collection', absolute: true, reward: { gems: 20, essence: 1, playerXp: 200 } },
  { id: 's_campaign10', text: 'Termine le Monde 1 de la campagne', stat: 'campaign_wins', target: 10, category: 'combat', reward: { gems: 25, playerXp: 250 } },
  { id: 's_rare', text: 'Obtiens un Xalamon Rare ou mieux', stat: 'rare_owned', target: 1, category: 'élevage', absolute: true, reward: { gems: 15, playerXp: 200 } },
  { id: 's_island4', text: 'Possède 4 îles', stat: 'islands_unlocked', target: 4, category: 'île', absolute: true, reward: { gems: 30, essence: 2, playerXp: 400 } },
  { id: 's_epic', text: 'Obtiens un Xalamon Epic', stat: 'epic_owned', target: 1, category: 'élevage', absolute: true, reward: { gems: 30, essence: 1, playerXp: 400 } },
  { id: 's_superior', text: 'Fais atteindre le stade Supérieur à un Xalamon', stat: 'superior_owned', target: 1, category: 'collection', absolute: true, reward: { gems: 50, essence: 3, playerXp: 800 } },
];

// ————————————————————————————— Succès —————————————————————————————

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  stat: string;
  tiers: number[];
  rewards: Reward[];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a_owned', name: 'Collectionneur', icon: '🐲', stat: 'monsters_owned', tiers: [10, 25, 50, 100], rewards: [{ gems: 10 }, { gems: 25 }, { gems: 50, essence: 1 }, { gems: 100, essence: 3 }] },
  { id: 'a_species', name: 'Encyclopédiste', icon: '📖', stat: 'species_owned', tiers: [10, 20, 35, 50], rewards: [{ gems: 10 }, { gems: 30 }, { essence: 2 }, { essence: 5, unlocks: ['deco_statue_gold'] }] },
  { id: 'a_islands', name: 'Maître de l’Archipel', icon: '🏝️', stat: 'islands_unlocked', tiers: [3, 5, 8, 10], rewards: [{ gems: 20 }, { gems: 40 }, { essence: 3 }, { essence: 8 }] },
  { id: 'a_battles', name: 'Gladiateur', icon: '⚔️', stat: 'battles_won', tiers: [10, 50, 100, 500], rewards: [{ coins: 2000 }, { gems: 20 }, { gems: 50 }, { essence: 4 }] },
  { id: 'a_harvests', name: 'Fermier Céleste', icon: '🌾', stat: 'harvests', tiers: [50, 250, 1000, 5000], rewards: [{ coins: 2000 }, { items: { lys_solaire: 60 } }, { gems: 40 }, { essence: 3 }] },
  { id: 'a_breeds', name: 'Généticien', icon: '🧬', stat: 'breeds', tiers: [5, 25, 100, 300], rewards: [{ energy: 30 }, { gems: 20 }, { gems: 50 }, { essence: 4 }] },
  { id: 'a_hatches', name: 'Gardien des Œufs', icon: '🥚', stat: 'hatches', tiers: [5, 25, 100, 300], rewards: [{ coins: 1500 }, { gems: 15 }, { gems: 40 }, { essence: 3 }] },
  { id: 'a_evos', name: 'Alchimiste', icon: '✨', stat: 'evolutions', tiers: [1, 10, 30, 80], rewards: [{ gems: 5 }, { gems: 25 }, { essence: 2 }, { essence: 5 }] },
  { id: 'a_coins', name: 'Fortune de Xala', icon: '🪙', stat: 'coins_earned', tiers: [10000, 100000, 1000000, 10000000], rewards: [{ gems: 5 }, { gems: 20 }, { gems: 60 }, { essence: 5 }] },
  { id: 'a_boss', name: 'Tueur de Titans', icon: '👑', stat: 'boss_attacks', tiers: [5, 25, 100], rewards: [{ gems: 15 }, { essence: 2 }, { essence: 6 }] },
  { id: 'a_level', name: 'Légende Vivante', icon: '⭐', stat: 'player_level', tiers: [5, 10, 20, 35], rewards: [{ gems: 10 }, { gems: 25 }, { essence: 2 }, { essence: 6 }] },
];

// ————————————————————————————— Connexion —————————————————————————————

export const LOGIN_REWARDS: Reward[] = [
  { coins: 500 },
  { items: { ble_xala: 60, baie_ondine: 30 } },
  { energy: 25 },
  { gems: 5 },
  { coins: 2500 },
  { eggs: ['__random_uncommon'] },
  { gems: 15, essence: 1 },
];

// ————————————————————————————— Xala Pass —————————————————————————————

export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 400;

export function passFreeReward(tier: number): Reward {
  if (tier === PASS_TIERS) return { eggs: ['__random_epic'], gems: 20 };
  if (tier % 10 === 0) return { eggs: ['__random_rare'] };
  if (tier % 5 === 0) return { gems: 8 };
  if (tier % 3 === 0) return { items: { carotte_zap: 40, baie_ondine: 40 } };
  if (tier % 2 === 0) return { energy: 15 };
  return { coins: 600 * tier };
}

export function passPremiumReward(tier: number): Reward {
  if (tier === PASS_TIERS) return { eggs: ['passarion'], essence: 3 };
  if (tier === 25) return { unlocks: ['skin_aurore'] };
  if (tier === 15) return { unlocks: ['deco_pass_banner'] };
  if (tier % 10 === 0) return { eggs: ['__random_epic'], essence: 1 };
  if (tier % 5 === 0) return { gems: 25 };
  if (tier % 2 === 0) return { items: { festin: 2 } };
  return { gems: 6, coins: 1000 * tier };
}

// ————————————————————————————— Événements —————————————————————————————

export interface EventDef {
  id: string;
  name: string;
  icon: string;
  element: ElementId;
  currency: string;
  currencyIcon: string;
  color: string;
  exclusiveSpecies: string;
  deco: string;
  milestones: { points: number; reward: Reward }[];
  desc: string;
}

function milestones(species: string, deco: string): { points: number; reward: Reward }[] {
  return [
    { points: 30, reward: { coins: 3000 } },
    { points: 80, reward: { unlocks: [deco] } },
    { points: 150, reward: { gems: 15 } },
    { points: 250, reward: { energy: 40, essence: 1 } },
    { points: 400, reward: { eggs: [species] } },
    { points: 600, reward: { gems: 40, essence: 2 } },
  ];
}

export const EVENTS: EventDef[] = [
  { id: 'flamme_fest', name: 'Festival de la Flamme', icon: '🔥', element: 'flamme', currency: 'Braises', currencyIcon: '🔸', color: '#ff6a2b', exclusiveSpecies: 'braselune', deco: 'deco_flame_torch', milestones: milestones('braselune', 'deco_flame_torch'), desc: 'Les volcans s’illuminent ! Les Xalamons Flamme produisent +20 %.' },
  { id: 'glace_fest', name: 'Festival Glaciaire', icon: '❄️', element: 'glace', currency: 'Flocons', currencyIcon: '❄', color: '#7fe3ff', exclusiveSpecies: 'cristaline', deco: 'deco_snowman', milestones: milestones('cristaline', 'deco_snowman'), desc: 'La neige tombe sur tout l’archipel. Les Xalamons Glace produisent +20 %.' },
  { id: 'cosmic_night', name: 'Nuit Cosmique', icon: '🌌', element: 'cosmos', currency: 'Poussière d’étoile', currencyIcon: '✦', color: '#6a5cff', exclusiveSpecies: 'orbinox', deco: 'deco_star_lamp', milestones: milestones('orbinox', 'deco_star_lamp'), desc: 'Une pluie d’étoiles traverse le ciel. Les Xalamons Cosmos produisent +20 %.' },
  { id: 'eclipse', name: 'Éclipse', icon: '🌑', element: 'ombre', currency: 'Éclats d’ombre', currencyIcon: '◆', color: '#6a3cbc', exclusiveSpecies: 'umbrelion', deco: 'deco_eclipse', milestones: milestones('umbrelion', 'deco_eclipse'), desc: 'Le soleil disparaît. Les Xalamons Ombre produisent +20 %.' },
  { id: 'spring', name: 'Printemps Xala', icon: '🌸', element: 'flora', currency: 'Pétales', currencyIcon: '❀', color: '#ff9ad1', exclusiveSpecies: 'petalia', deco: 'deco_sakura', milestones: milestones('petalia', 'deco_sakura'), desc: 'Tout refleurit ! Les cultures poussent 25 % plus vite.' },
  { id: 'shadow_fest', name: 'Festival des Ombres', icon: '🎃', element: 'ombre', currency: 'Bonbons', currencyIcon: '🍬', color: '#ff8a1c', exclusiveSpecies: 'citrouillon', deco: 'deco_pumpkin', milestones: milestones('citrouillon', 'deco_pumpkin'), desc: 'Les citrouilles s’allument. Œufs Ombre plus fréquents.' },
];

export const EVENT_DURATION_DAYS = 7;

// ————————————————————————————— Campagne —————————————————————————————

export interface WorldDef { id: number; name: string; elements: ElementId[]; color: string }

export const CAMPAIGN_WORLDS: WorldDef[] = [
  { id: 1, name: 'Prairies Verdantes', elements: ['flora', 'aqua', 'flamme'], color: '#5fcf4a' },
  { id: 2, name: 'Cratères Ardents', elements: ['flamme', 'roche', 'volt'], color: '#ff6a2b' },
  { id: 3, name: 'Glaciers Hurlants', elements: ['glace', 'vent', 'aqua'], color: '#7fe3ff' },
  { id: 4, name: 'Jardins du Ciel', elements: ['lumiere', 'vent', 'volt'], color: '#ffe680' },
  { id: 5, name: 'Vallée des Ombres', elements: ['ombre', 'roche', 'flora'], color: '#6a3cbc' },
  { id: 6, name: 'Confins Cosmiques', elements: ['cosmos', 'lumiere', 'ombre'], color: '#4b5cff' },
];
export const STAGES_PER_WORLD = 10;

// ————————————————————————————— Boutique & achats intégrés —————————————————————————————

export interface IapProduct {
  sku: string;
  name: string;
  price: string;
  type: 'consumable' | 'non_consumable' | 'subscription_like';
  reward: Reward;
  icon: string;
  oncePerAccount?: boolean;
  bonusLabel?: string;
}

export const IAP_PRODUCTS: IapProduct[] = [
  { sku: 'gems_80', name: 'Poignée de XalaGems', price: '0,99 €', type: 'consumable', reward: { gems: 80 }, icon: '💎' },
  { sku: 'gems_500', name: 'Bourse de XalaGems', price: '4,99 €', type: 'consumable', reward: { gems: 500 }, icon: '💎', bonusLabel: '+25 %' },
  { sku: 'gems_1200', name: 'Coffre de XalaGems', price: '9,99 €', type: 'consumable', reward: { gems: 1200 }, icon: '💎', bonusLabel: '+50 %' },
  { sku: 'gems_2600', name: 'Trésor de XalaGems', price: '19,99 €', type: 'consumable', reward: { gems: 2600 }, icon: '💎', bonusLabel: '+62 %' },
  { sku: 'gems_7000', name: 'Montagne de XalaGems', price: '49,99 €', type: 'consumable', reward: { gems: 7000 }, icon: '💎', bonusLabel: '+75 %' },
  { sku: 'starter_pack', name: 'Pack de Départ', price: '2,99 €', type: 'non_consumable', oncePerAccount: true, reward: { gems: 150, coins: 20000, eggs: ['__random_rare'], essence: 1 }, icon: '🎁', bonusLabel: 'Une seule fois' },
  { sku: 'food_pack', name: 'Pack Festin', price: '2,99 €', type: 'consumable', reward: { items: { festin: 5, galette: 10 } }, icon: '🍱' },
  { sku: 'event_pack', name: 'Pack Événement', price: '4,99 €', type: 'consumable', reward: { gems: 200, eventCurrency: 150 }, icon: '🎉' },
  { sku: 'xala_pass_premium', name: 'Xala Pass Premium', price: '7,99 €', type: 'non_consumable', reward: {}, icon: '🎟️' },
  { sku: 'cosmetic_aurora', name: 'Teinte Aurore (cosmétique)', price: '1,99 €', type: 'non_consumable', reward: { unlocks: ['skin_aurore_iap'] }, icon: '🌈' },
];
export const IAP: Record<string, IapProduct> = Object.fromEntries(IAP_PRODUCTS.map((p) => [p.sku, p]));

export interface SkinDef { id: string; name: string; tint: string; glow: string; gemCost?: number; source: string }
export const SKINS: SkinDef[] = [
  { id: 'skin_doree', name: 'Aura Dorée', tint: '#ffd36b', glow: '#fff1b0', gemCost: 60, source: 'Boutique' },
  { id: 'skin_nocturne', name: 'Teinte Nocturne', tint: '#5a3c9c', glow: '#b98cff', gemCost: 60, source: 'Boutique' },
  { id: 'skin_aurore', name: 'Aurore du Pass', tint: '#ff9ad1', glow: '#ffe2f2', source: 'Xala Pass' },
  { id: 'skin_aurore_iap', name: 'Teinte Aurore', tint: '#7af0d0', glow: '#e0fff6', source: 'Achat' },
];
export const SKIN: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]));

// ————————————————————————————— Niveaux —————————————————————————————

export function playerXpForLevel(level: number): number {
  return Math.round(60 * Math.pow(level, 1.45));
}

export function monsterXpForLevel(level: number): number {
  return Math.round(10 * Math.pow(level, 1.5));
}

export function playerLevelReward(level: number): Reward {
  return { gems: level % 5 === 0 ? 10 : 2, coins: 200 * level, energy: 10 };
}
