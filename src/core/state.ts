import type { GameState, IslandId, BuildingInstance } from './types';
import { ISLAND_ORDER, BUILDING } from '../data/world';
import { SPECIES } from '../data/species';

export const SAVE_VERSION = 3;

export function emptyState(now: number, seed: number): GameState {
  const islands = Object.fromEntries(ISLAND_ORDER.map((id) => [id, { unlocked: id === 'verdante', level: 1 }])) as GameState['islands'];
  return {
    version: SAVE_VERSION,
    saveId: `${now.toString(36)}-${(seed >>> 0).toString(36)}`,
    revision: 0,
    createdAt: now,
    lastSeenAt: now,
    playerName: 'Éleveur',
    tutorialStep: 0,
    player: { level: 1, xp: 0 },
    resources: { coins: 1500, gems: 40, energy: 40, essence: 0 },
    items: { ble_xala: 40 },
    monsters: [],
    eggs: [],
    buildings: [],
    islands,
    codex: {},
    breedLog: {},
    stats: {},
    quests: { dailyKey: '', daily: [], weeklyKey: '', weekly: [], storyClaimed: [], weeklyChestClaimed: false },
    achievements: {},
    campaign: { stars: {} },
    arena: { rating: 100, wins: 0, losses: 0, seed: seed >>> 0, refreshedAt: now, dailyClaimKey: '' },
    boss: { dayKey: '', attempts: 0, damage: 0, claimedTiers: [], bossIndex: 0 },
    tournament: { eventKey: '', round: 0, tokens: 0, best: 0 },
    team: [],
    activeBattle: null,
    login: { lastDayKey: '', streak: 0, cycleDay: 0, pending: false },
    shop: { dayKey: '', bought: {} },
    pass: { seasonKey: '', xp: 0, premium: false, claimedFree: [], claimedPremium: [] },
    event: { eventKey: '', currency: 0, claimed: [], points: 0 },
    iap: { processedOrders: [], entitlements: [], pending: [] },
    unlocks: [],
    settings: { quality: 'auto', music: 0.6, sfx: 0.8, vibration: true, showFps: false },
    timers: { energyAt: now },
    rngState: seed >>> 0,
    uidCounter: 0,
  };
}

function place(s: GameState, defId: string, island: IslandId, x: number, y: number, now: number, extra: Partial<BuildingInstance> = {}): BuildingInstance {
  s.uidCounter += 1;
  const b: BuildingInstance = { uid: `b${s.uidCounter.toString(36)}`, defId, islandId: island, x, y, level: 1, busyUntil: 0, stored: 0, lastTickAt: now, ...extra };
  const k = BUILDING[defId].kind;
  if (k === 'nursery') b.nursery = [];
  if (k === 'farm') b.crop = null;
  if (k === 'breeding') b.breeding = null;
  if (k === 'kitchen') b.kitchen = null;
  s.buildings.push(b);
  return b;
}

/** Nouvelle partie : une petite île de départ jouable immédiatement. */
export function newGame(now: number, seed: number): GameState {
  const s = emptyState(now, seed);
  place(s, 'arena', 'verdante', 12, 5, now);
  place(s, 'nursery', 'verdante', 4, 6, now);
  const fire = place(s, 'habitat_flamme', 'verdante', 8, 4, now, { stored: 120 });
  place(s, 'habitat_flora', 'verdante', 9, 11, now);
  place(s, 'farm', 'verdante', 5, 10, now);
  place(s, 'farm', 'verdante', 7, 13, now);
  place(s, 'deco_tree', 'verdante', 3, 9, now);
  place(s, 'deco_tree', 'verdante', 14, 9, now);
  place(s, 'deco_flowers', 'verdante', 12, 9, now);
  place(s, 'deco_flowers', 'verdante', 8, 8, now);
  // premier Xalamon
  s.uidCounter += 1;
  const uid = `m${s.uidCounter.toString(36)}`;
  s.monsters.push({ uid, speciesId: 'braisou', level: 1, xp: 0, stage: 0, satiety: 70, satietyAt: now, habitatUid: fire.uid, createdAt: now, battles: 0 });
  s.codex.braisou = { seen: true, owned: true, firstAt: now, maxStage: 0 };
  s.team = [uid];
  // premier œuf (tutoriel)
  s.uidCounter += 1;
  s.eggs.push({ uid: `e${s.uidCounter.toString(36)}`, speciesId: 'feuillot', origin: 'gift' });
  s.codex.feuillot = { seen: true, owned: false, firstAt: now, maxStage: 0 };
  return s;
}

/**
 * Migration et réparation d'une sauvegarde : complète les champs manquants
 * et supprime les références invalides (sauvegardes anciennes ou partielles).
 */
export function migrate(raw: unknown, now: number): GameState {
  const base = emptyState(now, 12345);
  const s = { ...base, ...(raw as Partial<GameState>) } as GameState;
  s.resources = { ...base.resources, ...(s.resources ?? {}) };
  for (const k of Object.keys(s.resources) as (keyof GameState['resources'])[]) {
    if (!Number.isFinite(s.resources[k]) || s.resources[k] < 0) s.resources[k] = 0;
  }
  s.islands = { ...base.islands, ...(s.islands ?? {}) };
  s.islands.verdante.unlocked = true;
  s.quests = { ...base.quests, ...(s.quests ?? {}) };
  s.arena = { ...base.arena, ...(s.arena ?? {}) };
  s.boss = { ...base.boss, ...(s.boss ?? {}) };
  s.tournament = { ...base.tournament, ...(s.tournament ?? {}) };
  s.login = { ...base.login, ...(s.login ?? {}) };
  s.shop = { ...base.shop, ...(s.shop ?? {}) };
  s.pass = { ...base.pass, ...(s.pass ?? {}) };
  s.event = { ...base.event, ...(s.event ?? {}) };
  s.iap = { ...base.iap, ...(s.iap ?? {}) };
  s.settings = { ...base.settings, ...(s.settings ?? {}) };
  s.timers = { ...base.timers, ...(s.timers ?? {}) };
  s.campaign = { ...base.campaign, ...(s.campaign ?? {}) };
  s.items = s.items ?? {};
  s.stats = s.stats ?? {};
  s.codex = s.codex ?? {};
  s.breedLog = s.breedLog ?? {};
  s.unlocks = s.unlocks ?? [];
  s.achievements = s.achievements ?? {};
  s.eggs = (s.eggs ?? []).filter((e) => e && SPECIES[e.speciesId]);
  s.buildings = (s.buildings ?? []).filter((b) => b && BUILDING[b.defId] && s.islands[b.islandId]);
  for (const b of s.buildings) {
    if (b.nursery) b.nursery = b.nursery.filter((n) => n && n.egg && SPECIES[n.egg.speciesId]);
    if (b.breeding && !SPECIES[b.breeding.resultSpeciesId]) b.breeding = null;
    if (!Number.isFinite(b.stored)) b.stored = 0;
    if (!Number.isFinite(b.lastTickAt)) b.lastTickAt = now;
  }
  const bUids = new Set(s.buildings.map((b) => b.uid));
  s.monsters = (s.monsters ?? []).filter((m) => m && SPECIES[m.speciesId]);
  for (const m of s.monsters) {
    if (m.habitatUid && !bUids.has(m.habitatUid)) m.habitatUid = null;
    if (!Number.isFinite(m.satiety)) m.satiety = 50;
  }
  const mUids = new Set(s.monsters.map((m) => m.uid));
  s.team = (s.team ?? []).filter((u) => mUids.has(u)).slice(0, 3);
  if (!s.team.length && s.monsters.length) s.team = [s.monsters[0].uid];
  if (!Number.isFinite(s.rngState)) s.rngState = 1;
  if (!Number.isFinite(s.uidCounter)) s.uidCounter = 1000;
  // compteur d'identifiants toujours supérieur aux identifiants existants
  let maxId = 0;
  for (const x of [...s.monsters, ...s.buildings, ...s.eggs]) {
    const n = parseInt(x.uid.slice(1), 36);
    if (Number.isFinite(n)) maxId = Math.max(maxId, n);
  }
  s.uidCounter = Math.max(s.uidCounter, maxId);
  s.version = SAVE_VERSION;
  return s;
}
