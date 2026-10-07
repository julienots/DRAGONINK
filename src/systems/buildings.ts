import type { GameState, IslandId, BuildingInstance } from '../core/types';
import { assert } from '../core/util';
import { BUILDING, ISLANDS, ISLAND_ORDER, GRID, islandTileOk, islandMaxBuildings, islandUpgradeCost, upgradeCost, upgradeSeconds, HABITAT_CAPACITY } from '../data/world';
import { type Ctx, bump, newUid, spend, addPlayerXp, grant } from './core';
import { habitatResidents } from './monsters';

export function getBuilding(s: GameState, uid: string): BuildingInstance {
  const b = s.buildings.find((x) => x.uid === uid);
  assert(b, 'Bâtiment introuvable', 'not_found');
  return b;
}

export function occupied(s: GameState, island: IslandId, ignoreUid?: string): boolean[][] {
  const g: boolean[][] = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  for (const b of s.buildings) {
    if (b.islandId !== island || b.uid === ignoreUid) continue;
    const sz = BUILDING[b.defId].size;
    for (let dx = 0; dx < sz; dx++) for (let dy = 0; dy < sz; dy++) {
      if (b.x + dx < GRID && b.y + dy < GRID) g[b.x + dx][b.y + dy] = true;
    }
  }
  return g;
}

export function canPlace(s: GameState, island: IslandId, size: number, x: number, y: number, ignoreUid?: string): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const occ = occupied(s, island, ignoreUid);
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) {
    const tx = x + dx, ty = y + dy;
    if (!islandTileOk(island, tx, ty)) return false;
    if (occ[tx][ty]) return false;
  }
  return true;
}

/** Cherche un emplacement libre en spirale depuis le centre de l'île. */
export function findFreeSpot(s: GameState, island: IslandId, size: number): { x: number; y: number } | null {
  const c = Math.floor(GRID / 2 - size / 2);
  for (let r = 0; r < GRID; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (canPlace(s, island, size, c + dx, c + dy)) return { x: c + dx, y: c + dy };
    }
  }
  return null;
}

export function countOf(s: GameState, defId: string): number {
  return s.buildings.filter((b) => b.defId === defId).length;
}

export function buildCost(s: GameState, defId: string): { coins: number; gems: number; essence: number } {
  const def = BUILDING[defId];
  const n = countOf(s, defId);
  const mul = def.kind === 'deco' ? 1 : Math.pow(1.6, n);
  return {
    coins: Math.round((def.cost.coins ?? 0) * mul),
    gems: def.cost.gems ?? 0,
    essence: def.cost.essence ?? 0,
  };
}

export function buildingsOnIsland(s: GameState, island: IslandId): BuildingInstance[] {
  return s.buildings.filter((b) => b.islandId === island);
}

export function canBuildHere(s: GameState, defId: string, island: IslandId): string | null {
  const def = BUILDING[defId];
  if (!def) return 'Bâtiment inconnu';
  if (!s.islands[island]?.unlocked) return 'Île verrouillée';
  if (s.player.level < def.unlockLevel) return `Niveau joueur ${def.unlockLevel} requis`;
  if (def.islands && !def.islands.includes(island)) return `Uniquement sur ${def.islands.map((i) => ISLANDS[i].name).join(', ')}`;
  if (def.limit && countOf(s, defId) >= def.limit) return `Limite atteinte (${def.limit})`;
  if (def.requiresUnlock && !s.unlocks.includes(def.requiresUnlock)) return 'Récompense d’événement à débloquer';
  const nonDeco = buildingsOnIsland(s, island).filter((b) => BUILDING[b.defId].kind !== 'deco').length;
  if (def.kind !== 'deco' && nonDeco >= islandMaxBuildings(s.islands[island].level)) return 'Île pleine : améliore-la';
  return null;
}

export function build(s: GameState, ctx: Ctx, defId: string, island: IslandId, x: number, y: number): BuildingInstance {
  const def = BUILDING[defId];
  const why = canBuildHere(s, defId, island);
  assert(!why, why ?? '');
  assert(canPlace(s, island, def.size, x, y), 'Emplacement occupé ou hors de l’île', 'placement');
  spend(s, buildCost(s, defId));
  const b: BuildingInstance = {
    uid: newUid(s, 'b'), defId, islandId: island, x, y, level: 1,
    busyUntil: ctx.now + def.buildSeconds * 1000, busyKind: def.buildSeconds > 0 ? 'build' : undefined,
    stored: 0, lastTickAt: ctx.now,
  };
  if (def.kind === 'nursery') b.nursery = [];
  if (def.kind === 'farm') b.crop = null;
  if (def.kind === 'breeding') b.breeding = null;
  if (def.kind === 'kitchen') b.kitchen = null;
  if (!b.busyKind) b.busyUntil = 0;
  s.buildings.push(b);
  bump(s, 'constructions');
  if (def.kind === 'habitat') bump(s, 'habitats_built');
  addPlayerXp(s, ctx, def.kind === 'deco' ? 2 : 15);
  ctx.emit({ type: 'built', uid: b.uid });
  ctx.emit({ type: 'sfx', name: 'build' });
  return b;
}

export function moveBuilding(s: GameState, uid: string, x: number, y: number): void {
  const b = getBuilding(s, uid);
  assert(canPlace(s, b.islandId, BUILDING[b.defId].size, x, y, uid), 'Emplacement invalide', 'placement');
  b.x = x; b.y = y;
}

/** Termine automatiquement les constructions/améliorations arrivées à échéance. */
export function settleBuildings(s: GameState, now: number): string[] {
  const done: string[] = [];
  for (const b of s.buildings) {
    if (b.busyKind && b.busyUntil <= now) {
      if (b.busyKind === 'upgrade') b.level += 1;
      b.busyKind = undefined;
      b.busyUntil = 0;
      done.push(b.uid);
    }
  }
  return done;
}

export function upgrade(s: GameState, ctx: Ctx, uid: string): void {
  const b = getBuilding(s, uid);
  const def = BUILDING[b.defId];
  assert(!b.busyKind, 'Bâtiment occupé');
  assert(b.level < def.maxLevel, 'Niveau maximal atteint', 'maxed');
  const to = b.level + 1;
  assert(s.player.level >= def.unlockLevel + (to - 1) * 2, `Niveau joueur ${def.unlockLevel + (to - 1) * 2} requis`);
  spend(s, upgradeCost(def, to));
  b.busyKind = 'upgrade';
  b.busyUntil = ctx.now + upgradeSeconds(def, to) * 1000;
  bump(s, 'constructions');
  addPlayerXp(s, ctx, 20 * to);
  ctx.emit({ type: 'sfx', name: 'build' });
}

export function speedUpCost(msLeft: number): number {
  if (msLeft <= 0) return 0;
  const min = msLeft / 60000;
  if (min <= 1) return 1;
  return Math.ceil(Math.pow(min, 0.72));
}

export function speedUpBuilding(s: GameState, ctx: Ctx, uid: string): void {
  const b = getBuilding(s, uid);
  assert(b.busyKind, 'Rien à accélérer');
  spend(s, { gems: speedUpCost(b.busyUntil - ctx.now) });
  b.busyUntil = ctx.now;
  settleBuildings(s, ctx.now);
}

export function removeBuilding(s: GameState, ctx: Ctx, uid: string): void {
  const b = getBuilding(s, uid);
  const def = BUILDING[b.defId];
  assert(['deco', 'farm', 'habitat', 'kitchen', 'storage', 'energy'].includes(def.kind), 'Ce bâtiment ne peut pas être retiré');
  if (def.kind === 'habitat') assert(habitatResidents(s, uid).length === 0, 'Déplace d’abord les Xalamons de cet habitat');
  if (def.kind === 'farm') assert(!b.crop, 'Récolte d’abord la culture');
  if (def.kind === 'kitchen') assert(!b.kitchen, 'Récupère d’abord le plat');
  s.buildings = s.buildings.filter((x) => x.uid !== uid);
  const refund = Math.floor((def.cost.coins ?? 0) * 0.25);
  if (refund) grant(s, ctx, { coins: refund }, 'sell');
}

export function habitatCapacity(b: BuildingInstance): number {
  return HABITAT_CAPACITY[b.level];
}

// ————————————————————————————— Îles —————————————————————————————

export function nextLockedIsland(s: GameState): IslandId | null {
  return ISLAND_ORDER.find((i) => !s.islands[i].unlocked) ?? null;
}

export function unlockIsland(s: GameState, ctx: Ctx, id: IslandId): void {
  const def = ISLANDS[id];
  assert(def, 'Île inconnue');
  assert(!s.islands[id].unlocked, 'Île déjà débloquée');
  assert(s.player.level >= def.unlockLevel, `Niveau joueur ${def.unlockLevel} requis`);
  const idx = ISLAND_ORDER.indexOf(id);
  assert(idx === 0 || s.islands[ISLAND_ORDER[idx - 1]].unlocked, 'Débloque d’abord l’île précédente');
  spend(s, def.cost);
  s.islands[id].unlocked = true;
  bump(s, 'islands_bought');
  addPlayerXp(s, ctx, 100 * idx);
  ctx.emit({ type: 'sfx', name: 'unlock' });
  ctx.emit({ type: 'toast', text: `${def.name} rejoint ton archipel !`, kind: 'good' });
}

export function upgradeIsland(s: GameState, ctx: Ctx, id: IslandId): void {
  const st = s.islands[id];
  assert(st.unlocked, 'Île verrouillée');
  assert(st.level < 10, 'Niveau maximal atteint', 'maxed');
  spend(s, islandUpgradeCost(st.level));
  st.level += 1;
  bump(s, 'constructions');
  addPlayerXp(s, ctx, 50 * st.level);
  ctx.emit({ type: 'sfx', name: 'unlock' });
}
