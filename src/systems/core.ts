import type { GameState, Reward, ResourceId, IslandId, EggInstance, RarityId } from '../core/types';
import { assert, mulberry32Step, pickWeighted } from '../core/util';
import { SPECIES_LIST, SPECIES } from '../data/species';
import { RARITIES, RARITY_ORDER, rarityIndex } from '../data/elements';
import { BUILDING, storageCapacity, energyCap } from '../data/world';
import { playerXpForLevel, playerLevelReward } from '../data/progression';

export type GameEvent =
  | { type: 'reward'; reward: Reward; title: string }
  | { type: 'toast'; text: string; kind?: 'info' | 'good' | 'bad' }
  | { type: 'playerLevel'; level: number }
  | { type: 'monsterLevel'; uid: string; level: number }
  | { type: 'hatched'; uid: string }
  | { type: 'evolved'; uid: string }
  | { type: 'sfx'; name: string }
  | { type: 'built'; uid: string };

export interface Ctx {
  now: number;
  rng: () => number;
  emit: (e: GameEvent) => void;
}

export function makeCtx(s: GameState, now: number, emit: (e: GameEvent) => void = () => {}): Ctx {
  return {
    now,
    emit,
    rng: () => {
      const [n, v] = mulberry32Step(s.rngState);
      s.rngState = n;
      return v;
    },
  };
}

export function newUid(s: GameState, prefix: string): string {
  s.uidCounter += 1;
  return `${prefix}${s.uidCounter.toString(36)}`;
}

export function bump(s: GameState, key: string, n = 1): void {
  s.stats[key] = (s.stats[key] ?? 0) + n;
}

export type Cost = Partial<Record<ResourceId, number>> & { items?: Record<string, number> };

const RES_NAMES: Record<ResourceId, string> = { coins: 'XalaCoins', gems: 'XalaGems', energy: 'XalaEnergy', essence: 'SuperEssence' };

export function canAfford(s: GameState, cost: Cost): boolean {
  for (const k of ['coins', 'gems', 'energy', 'essence'] as ResourceId[]) {
    if ((cost[k] ?? 0) > s.resources[k]) return false;
  }
  for (const [id, n] of Object.entries(cost.items ?? {})) if ((s.items[id] ?? 0) < n) return false;
  return true;
}

export function spend(s: GameState, cost: Cost): void {
  for (const k of ['coins', 'gems', 'energy', 'essence'] as ResourceId[]) {
    const v = cost[k] ?? 0;
    assert(v >= 0, 'Coût invalide');
    assert(s.resources[k] >= v, `Pas assez de ${RES_NAMES[k]}`, 'funds');
  }
  for (const [id, n] of Object.entries(cost.items ?? {})) assert((s.items[id] ?? 0) >= n, 'Ingrédients insuffisants', 'funds');
  for (const k of ['coins', 'gems', 'energy', 'essence'] as ResourceId[]) {
    const v = cost[k] ?? 0;
    s.resources[k] -= v;
    if (k === 'gems' && v > 0) bump(s, 'gems_spent', v);
  }
  for (const [id, n] of Object.entries(cost.items ?? {})) s.items[id] -= n;
}

export function coinCap(s: GameState): number {
  return storageCapacity(s.buildings.filter((b) => BUILDING[b.defId].kind === 'storage' && b.busyKind !== 'build').map((b) => b.level));
}

export function playerEnergyCap(s: GameState): number {
  return energyCap(s.player.level);
}

export function addPlayerXp(s: GameState, ctx: Ctx, xp: number): void {
  if (xp <= 0) return;
  s.player.xp += Math.round(xp);
  for (let guard = 0; guard < 100; guard++) {
    const need = playerXpForLevel(s.player.level);
    if (s.player.xp < need) break;
    s.player.xp -= need;
    s.player.level += 1;
    const r = playerLevelReward(s.player.level);
    grant(s, ctx, r, 'level');
    ctx.emit({ type: 'playerLevel', level: s.player.level });
  }
}

/** Choisit une espèce aléatoire d'une rareté donnée (hors exclusifs). */
export function randomSpeciesOfRarity(rarity: RarityId, r: number): string {
  const pool = SPECIES_LIST.filter((sp) => sp.rarity === rarity && !sp.exclusive && !sp.recipe);
  const list = pool.length ? pool : SPECIES_LIST.filter((sp) => sp.rarity === rarity && !sp.exclusive);
  return pickWeighted(list, () => 1, r).id;
}

export function resolveEggId(id: string, rng: () => number): string {
  if (!id.startsWith('__random_')) return id;
  const r = id.slice('__random_'.length) as RarityId;
  if (r === ('mystery' as RarityId)) {
    const rar = pickWeighted(RARITY_ORDER.slice(0, 5), (x) => RARITIES[x].breedWeight, rng());
    return randomSpeciesOfRarity(rar, rng());
  }
  return randomSpeciesOfRarity(r, rng());
}

export function addEgg(s: GameState, ctx: Ctx, speciesId: string, origin: string): EggInstance {
  const id = resolveEggId(speciesId, ctx.rng);
  assert(SPECIES[id], 'Espèce inconnue');
  const egg: EggInstance = { uid: newUid(s, 'e'), speciesId: id, origin };
  s.eggs.push(egg);
  if (!s.codex[id]) s.codex[id] = { seen: true, owned: false, firstAt: ctx.now, maxStage: 0 };
  return egg;
}

/** Applique une récompense. Toutes les sources de gains passent par ici. */
export function grant(s: GameState, ctx: Ctx, r: Reward, source: string): void {
  if (r.coins) { s.resources.coins += r.coins; bump(s, 'coins_earned', r.coins); }
  if (r.gems) s.resources.gems += r.gems;
  if (r.energy) s.resources.energy += r.energy;
  if (r.essence) { s.resources.essence += r.essence; bump(s, 'essence_earned', r.essence); }
  for (const [id, n] of Object.entries(r.items ?? {})) s.items[id] = (s.items[id] ?? 0) + n;
  for (const e of r.eggs ?? []) addEgg(s, ctx, e, source);
  for (const u of r.unlocks ?? []) if (!s.unlocks.includes(u)) s.unlocks.push(u);
  if (r.passXp) s.pass.xp += r.passXp;
  if (r.eventCurrency && s.event.eventKey) { s.event.currency += r.eventCurrency; s.event.points += r.eventCurrency; }
  if (r.playerXp) addPlayerXp(s, ctx, r.playerXp);
}

export function rewardIsEmpty(r: Reward): boolean {
  return !r.coins && !r.gems && !r.energy && !r.essence && !r.playerXp && !r.passXp && !r.eventCurrency
    && !Object.keys(r.items ?? {}).length && !(r.eggs ?? []).length && !(r.unlocks ?? []).length;
}

/** Statistiques calculées à partir de l'état (pour quêtes de collection et succès). */
export function computeStat(s: GameState, key: string): number {
  switch (key) {
    case 'monsters_owned': return s.monsters.length;
    case 'species_owned': return Object.values(s.codex).filter((c) => c.owned).length;
    case 'islands_unlocked': return Object.values(s.islands).filter((i) => i.unlocked).length;
    case 'max_monster_level': return s.monsters.reduce((m, x) => Math.max(m, x.level), 0);
    case 'rare_owned': return s.monsters.filter((m) => rarityIndex(SPECIES[m.speciesId].rarity) >= 2).length;
    case 'epic_owned': return s.monsters.filter((m) => rarityIndex(SPECIES[m.speciesId].rarity) >= 3).length;
    case 'superior_owned': return s.monsters.filter((m) => m.stage === 3).length;
    case 'player_level': return s.player.level;
    default: return s.stats[key] ?? 0;
  }
}

export function islandOf(s: GameState, uid: string): IslandId | null {
  return s.buildings.find((b) => b.uid === uid)?.islandId ?? null;
}
