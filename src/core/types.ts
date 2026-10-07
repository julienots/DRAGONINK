// Types partagés de XalaMonsters. Tout l'état de jeu est sérialisable en JSON
// pour la sauvegarde locale et, plus tard, la synchronisation serveur.

export type ElementId =
  | 'flamme' | 'aqua' | 'flora' | 'volt' | 'ombre'
  | 'glace' | 'vent' | 'roche' | 'lumiere' | 'cosmos';

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic' | 'ancient' | 'celestial';

export type ResourceId = 'coins' | 'gems' | 'energy' | 'essence';

export type IslandId = 'verdante' | 'volcanique' | 'glaciaire' | 'celeste' | 'ombres' | 'cosmique' | 'tempete' | 'corail' | 'dunes' | 'aurore';

/** 0 = bébé, 1 = adolescent, 2 = adulte, 3 = supérieur */
export type Stage = 0 | 1 | 2 | 3;

export type Reward = {
  coins?: number;
  gems?: number;
  energy?: number;
  essence?: number;
  playerXp?: number;
  passXp?: number;
  items?: Record<string, number>;
  /** œufs ajoutés à l'inventaire (id d'espèce) */
  eggs?: string[];
  /** décorations / cosmétiques débloqués */
  unlocks?: string[];
  eventCurrency?: number;
};

export interface MonsterInstance {
  uid: string;
  speciesId: string;
  nickname?: string;
  level: number;
  xp: number;
  stage: Stage;
  /** 0..100, décroît avec le temps */
  satiety: number;
  satietyAt: number;
  habitatUid: string | null;
  createdAt: number;
  battles: number;
  skin?: string;
}

export interface EggInstance {
  uid: string;
  speciesId: string;
  /** source : achat, élevage, récompense... */
  origin: string;
}

export interface NurserySlot {
  egg: EggInstance;
  placedAt: number;
  readyAt: number;
}

export interface BreedingJob {
  parentA: string;
  parentB: string;
  startedAt: number;
  readyAt: number;
  resultSpeciesId: string;
}

export interface CropJob {
  cropId: string;
  plantedAt: number;
  readyAt: number;
}

export interface BuildingInstance {
  uid: string;
  defId: string;
  islandId: IslandId;
  x: number;
  y: number;
  level: number;
  /** construction / amélioration en cours */
  busyUntil: number;
  busyKind?: 'build' | 'upgrade';
  /** ressources produites non récoltées */
  stored: number;
  lastTickAt: number;
  crop?: CropJob | null;
  nursery?: NurserySlot[];
  breeding?: BreedingJob | null;
  kitchen?: { recipeId: string; readyAt: number } | null;
}

export interface IslandState {
  unlocked: boolean;
  level: number;
}

export interface QuestEntry {
  id: string;
  baseline: number;
  claimed: boolean;
}

export interface QuestBoard {
  dailyKey: string;
  daily: QuestEntry[];
  weeklyKey: string;
  weekly: QuestEntry[];
  /** quêtes de progression permanentes réclamées */
  storyClaimed: string[];
  weeklyChestClaimed: boolean;
}

export interface SettingsState {
  quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
  music: number;
  sfx: number;
  vibration: boolean;
  showFps: boolean;
}

export interface GameState {
  version: number;
  saveId: string;
  /** compteur de révision, incrémenté à chaque mutation sauvegardée */
  revision: number;
  createdAt: number;
  lastSeenAt: number;
  playerName: string;
  tutorialStep: number;
  player: { level: number; xp: number };
  resources: Record<ResourceId, number>;
  /** cultures, plats, objets */
  items: Record<string, number>;
  monsters: MonsterInstance[];
  /** Xalamons sans habitat */
  eggs: EggInstance[];
  buildings: BuildingInstance[];
  islands: Record<IslandId, IslandState>;
  codex: Record<string, { seen: boolean; owned: boolean; firstAt: number; maxStage: Stage }>;
  /** recettes d'élevage découvertes "a+b" -> espèces obtenues */
  breedLog: Record<string, string[]>;
  stats: Record<string, number>;
  quests: QuestBoard;
  achievements: Record<string, number>; // id -> palier réclamé
  campaign: { stars: Record<string, number> };
  arena: { rating: number; wins: number; losses: number; seed: number; refreshedAt: number; dailyClaimKey: string };
  boss: { dayKey: string; attempts: number; damage: number; claimedTiers: number[]; bossIndex: number };
  tournament: { eventKey: string; round: number; tokens: number; best: number };
  team: string[];
  /** combat lancé (énergie dépensée) en attente de résultat */
  activeBattle: { mode: string; ref: string; seed: number; startedAt: number } | null;
  login: { lastDayKey: string; streak: number; cycleDay: number; pending: boolean };
  shop: { dayKey: string; bought: Record<string, number> };
  pass: { seasonKey: string; xp: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  event: { eventKey: string; currency: number; claimed: number[]; points: number };
  iap: { processedOrders: string[]; entitlements: string[]; pending: string[] };
  unlocks: string[];
  settings: SettingsState;
  /** horodatages divers (régénération d'énergie, météo...) */
  timers: Record<string, number>;
  rngState: number;
  uidCounter: number;
}
