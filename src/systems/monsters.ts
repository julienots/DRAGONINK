import type { GameState, MonsterInstance, Stage, BuildingInstance, ElementId } from '../core/types';
import { assert } from '../core/util';
import { SPECIES, STAGE_LEVEL_CAP, STAGE_STAT_MUL, STAGE_NAMES, type Stats } from '../data/species';
import { RARITIES, rarityIndex } from '../data/elements';
import { BUILDING, HABITAT_CAPACITY, foodXp } from '../data/world';
import { monsterXpForLevel } from '../data/progression';
import { type Ctx, bump, newUid, spend, addPlayerXp, grant } from './core';

export const SATIETY_DECAY_MS = 6 * 60 * 1000; // -1 point toutes les 6 minutes
export const STAGE_INCOME_MUL = [1, 1.2, 1.45, 1.8];

export function getMonster(s: GameState, uid: string): MonsterInstance {
  const m = s.monsters.find((x) => x.uid === uid);
  assert(m, 'Xalamon introuvable', 'not_found');
  return m;
}

export function satietyNow(m: MonsterInstance, now: number): number {
  const lost = Math.max(0, now - m.satietyAt) / SATIETY_DECAY_MS;
  return Math.max(0, m.satiety - lost);
}

export function monsterStats(m: Pick<MonsterInstance, 'speciesId' | 'level' | 'stage'>): Stats {
  const sp = SPECIES[m.speciesId];
  const mul = RARITIES[sp.rarity].statMul * STAGE_STAT_MUL[m.stage] * (1 + (m.level - 1) * 0.08);
  return {
    hp: Math.round(sp.stats.hp * 3 * mul),
    atk: Math.round(sp.stats.atk * mul),
    def: Math.round(sp.stats.def * mul),
    spd: Math.round(sp.stats.spd * (1 + (m.level - 1) * 0.01) * (1 + m.stage * 0.05)),
  };
}

export function power(m: MonsterInstance): number {
  const st = monsterStats(m);
  return Math.round(st.hp / 3 + st.atk * 2 + st.def * 1.5 + st.spd);
}

/** XalaCoins par minute produits par ce Xalamon (avant bonus d'île). */
export function monsterIncome(m: MonsterInstance, now: number): number {
  const sp = SPECIES[m.speciesId];
  const sat = satietyNow(m, now) > 0 ? 1 : 0.5;
  return RARITIES[sp.rarity].income * (1 + (m.level - 1) * 0.12) * STAGE_INCOME_MUL[m.stage] * sat;
}

export function habitatAccepts(b: BuildingInstance, elements: ElementId[]): boolean {
  const def = BUILDING[b.defId];
  if (def.kind !== 'habitat') return false;
  return def.element === 'any' || elements.includes(def.element as ElementId);
}

export function habitatResidents(s: GameState, habitatUid: string): MonsterInstance[] {
  return s.monsters.filter((m) => m.habitatUid === habitatUid);
}

export function habitatHasRoom(s: GameState, b: BuildingInstance): boolean {
  return b.busyKind !== 'build' && habitatResidents(s, b.uid).length < HABITAT_CAPACITY[b.level];
}

export function findHabitatFor(s: GameState, speciesId: string): BuildingInstance | null {
  const els = SPECIES[speciesId].elements;
  // priorité aux habitats de l'élément principal, puis aux autres compatibles
  const cands = s.buildings.filter((b) => habitatAccepts(b, els) && habitatHasRoom(s, b));
  cands.sort((a, b) => {
    const ea = BUILDING[a.defId].element === els[0] ? 0 : BUILDING[a.defId].element === 'any' ? 2 : 1;
    const eb = BUILDING[b.defId].element === els[0] ? 0 : BUILDING[b.defId].element === 'any' ? 2 : 1;
    return ea - eb;
  });
  return cands[0] ?? null;
}

export function createMonster(s: GameState, ctx: Ctx, speciesId: string, opts: { level?: number; stage?: Stage } = {}): MonsterInstance {
  const sp = SPECIES[speciesId];
  assert(sp, 'Espèce inconnue');
  const home = findHabitatFor(s, speciesId);
  const m: MonsterInstance = {
    uid: newUid(s, 'm'), speciesId, level: opts.level ?? 1, xp: 0, stage: opts.stage ?? 0,
    satiety: 80, satietyAt: ctx.now, habitatUid: home?.uid ?? null, createdAt: ctx.now, battles: 0,
  };
  s.monsters.push(m);
  const c = s.codex[speciesId];
  if (c) { c.owned = true; c.seen = true; c.maxStage = Math.max(c.maxStage, m.stage) as Stage; }
  else s.codex[speciesId] = { seen: true, owned: true, firstAt: ctx.now, maxStage: m.stage };
  if (s.team.length < 3 && !s.team.includes(m.uid)) s.team.push(m.uid);
  return m;
}

export function levelCap(m: MonsterInstance): number {
  return STAGE_LEVEL_CAP[m.stage];
}

export function addMonsterXp(s: GameState, ctx: Ctx, m: MonsterInstance, xp: number): number {
  let gained = 0;
  m.xp += Math.round(xp);
  while (m.level < levelCap(m) && m.xp >= monsterXpForLevel(m.level)) {
    m.xp -= monsterXpForLevel(m.level);
    m.level += 1;
    gained++;
    bump(s, 'monster_levelups');
    ctx.emit({ type: 'monsterLevel', uid: m.uid, level: m.level });
  }
  if (m.level >= levelCap(m)) m.xp = Math.min(m.xp, monsterXpForLevel(m.level));
  return gained;
}

export function isXpFull(m: MonsterInstance): boolean {
  return m.level >= levelCap(m) && m.xp >= monsterXpForLevel(m.level);
}

/** Nourrir : consomme `count` portions de l'objet choisi. */
export function feed(s: GameState, ctx: Ctx, uid: string, itemId: string, count = 1): { xp: number; levels: number } {
  const m = getMonster(s, uid);
  const base = foodXp(itemId);
  assert(base > 0, 'Cet objet ne se mange pas');
  assert(count >= 1 && count <= 100, 'Quantité invalide');
  assert(!isXpFull(m), m.stage < 3 ? 'Niveau maximal du stade atteint : fais-le évoluer !' : 'Niveau maximal atteint', 'maxed');
  const have = s.items[itemId] ?? 0;
  assert(have >= 1, 'Plus de nourriture de ce type', 'funds');
  const n = Math.min(count, have);
  const fav = SPECIES[m.speciesId].favoriteCrop === itemId ? 1.5 : 1;
  s.items[itemId] = have - n;
  const sat = satietyNow(m, ctx.now);
  m.satiety = Math.min(100, sat + 6 * n);
  m.satietyAt = ctx.now;
  const xp = Math.round(base * fav * n);
  const levels = addMonsterXp(s, ctx, m, xp);
  bump(s, 'feeds', n);
  addPlayerXp(s, ctx, n);
  if (s.event.eventKey) { s.event.currency += Math.ceil(n / 5); s.event.points += Math.ceil(n / 5); }
  ctx.emit({ type: 'sfx', name: 'eat' });
  return { xp, levels };
}

export function evolveCost(m: MonsterInstance): { coins: number; energy: number; essence: number } {
  const r = rarityIndex(SPECIES[m.speciesId].rarity);
  const st = m.stage;
  return {
    coins: Math.round([300, 3000, 25000][st] * (1 + r * 0.6)),
    energy: [10, 25, 60][st],
    essence: st === 2 ? 1 + Math.floor(r / 2) : 0,
  };
}

export function canEvolve(m: MonsterInstance): boolean {
  return m.stage < 3 && m.level >= levelCap(m);
}

export function evolve(s: GameState, ctx: Ctx, uid: string): void {
  const m = getMonster(s, uid);
  assert(m.stage < 3, 'Stade maximal déjà atteint', 'maxed');
  assert(m.level >= levelCap(m), `Atteins le niveau ${levelCap(m)} pour évoluer`);
  spend(s, evolveCost(m));
  m.stage = (m.stage + 1) as Stage;
  m.xp = 0;
  const c = s.codex[m.speciesId];
  if (c) c.maxStage = Math.max(c.maxStage, m.stage) as Stage;
  bump(s, 'evolutions');
  addPlayerXp(s, ctx, 40 * m.stage);
  ctx.emit({ type: 'evolved', uid });
  ctx.emit({ type: 'toast', text: `${SPECIES[m.speciesId].name} devient ${STAGE_NAMES[m.stage]} !`, kind: 'good' });
}

export function moveMonster(s: GameState, uid: string, habitatUid: string | null): void {
  const m = getMonster(s, uid);
  if (habitatUid === null) { m.habitatUid = null; return; }
  const b = s.buildings.find((x) => x.uid === habitatUid);
  assert(b, 'Habitat introuvable', 'not_found');
  assert(habitatAccepts(b, SPECIES[m.speciesId].elements), 'Élément incompatible avec cet habitat');
  if (m.habitatUid === b.uid) return;
  assert(habitatHasRoom(s, b), 'Habitat plein');
  m.habitatUid = b.uid;
}

export function sellMonster(s: GameState, ctx: Ctx, uid: string): number {
  assert(s.monsters.length > 1, 'Tu dois garder au moins un Xalamon');
  const m = getMonster(s, uid);
  const value = Math.round(RARITIES[SPECIES[m.speciesId].rarity].sellValue * (1 + m.level * 0.1) * (1 + m.stage * 0.5));
  s.monsters = s.monsters.filter((x) => x.uid !== uid);
  s.team = s.team.filter((t) => t !== uid);
  grant(s, ctx, { coins: value }, 'sell');
  return value;
}

export function rename(s: GameState, uid: string, name: string): void {
  const m = getMonster(s, uid);
  const clean = name.replace(/[<>&"]/g, '').trim().slice(0, 16);
  m.nickname = clean || undefined;
}

export function setTeam(s: GameState, uids: string[]): void {
  assert(uids.length >= 1 && uids.length <= 3, 'Une équipe compte de 1 à 3 Xalamons');
  assert(new Set(uids).size === uids.length, 'Doublon dans l’équipe');
  for (const u of uids) getMonster(s, u);
  s.team = uids.slice();
}

export function applySkin(s: GameState, uid: string, skin: string | null): void {
  const m = getMonster(s, uid);
  if (skin) assert(s.unlocks.includes(skin), 'Cosmétique non débloqué');
  m.skin = skin ?? undefined;
}

export function displayName(m: MonsterInstance): string {
  return m.nickname || SPECIES[m.speciesId].name;
}
