import type { GameState, NurserySlot } from '../core/types';
import { assert, pickWeighted } from '../core/util';
import { BUILDING, CROP, RECIPE, nurserySlots } from '../data/world';
import { SPECIES, SPECIES_LIST, type SpeciesDef } from '../data/species';
import { RARITIES, rarityIndex } from '../data/elements';
import { type Ctx, bump, spend, grant, addPlayerXp, addEgg } from './core';
import { getBuilding, speedUpCost } from './buildings';
import { createMonster, getMonster } from './monsters';
import { currentEvent, weatherAt } from './time';
import { STAGE_NAMES } from '../data/species';

// ————————————————————————————— Ferme —————————————————————————————

export function cropDurationMs(s: GameState, islandId: string, cropId: string, now: number): number {
  let mul = 1;
  if (weatherAt(islandId as never, now) === 'sun') mul *= 0.9;
  if (currentEvent(now).def.id === 'spring' && s.event.eventKey) mul *= 0.75;
  return Math.round(CROP[cropId].seconds * 1000 * mul);
}

export function plant(s: GameState, ctx: Ctx, farmUid: string, cropId: string): void {
  const b = getBuilding(s, farmUid);
  assert(BUILDING[b.defId].kind === 'farm', 'Ce n’est pas une ferme');
  assert(!b.busyKind, 'Ferme en construction');
  assert(!b.crop, 'Une culture pousse déjà ici');
  const crop = CROP[cropId];
  assert(crop, 'Culture inconnue');
  assert(s.player.level >= crop.unlockLevel, `Niveau joueur ${crop.unlockLevel} requis`);
  spend(s, { coins: crop.cost });
  b.crop = { cropId, plantedAt: ctx.now, readyAt: ctx.now + cropDurationMs(s, b.islandId, cropId, ctx.now) };
  bump(s, 'plants');
  ctx.emit({ type: 'sfx', name: 'plant' });
}

export function farmYield(s: GameState, farmLevel: number, cropId: string, islandId: string, now: number): number {
  let y = CROP[cropId].yield * (1 + (farmLevel - 1) * 0.25);
  if (weatherAt(islandId as never, now) === 'rain') y *= 1.2;
  return Math.round(y);
}

export function harvest(s: GameState, ctx: Ctx, farmUid: string): number {
  const b = getBuilding(s, farmUid);
  assert(b.crop, 'Rien à récolter');
  assert(b.crop.readyAt <= ctx.now, 'La culture n’est pas encore prête', 'not_ready');
  const crop = CROP[b.crop.cropId];
  const n = farmYield(s, b.level, crop.id, b.islandId, ctx.now);
  s.items[crop.id] = (s.items[crop.id] ?? 0) + n;
  if (crop.bonus) grant(s, ctx, crop.bonus, 'harvest');
  b.crop = null;
  bump(s, 'harvests');
  addPlayerXp(s, ctx, Math.ceil(crop.xp / 2) + 1);
  if (s.event.eventKey) { s.event.currency += 2; s.event.points += 2; }
  ctx.emit({ type: 'sfx', name: 'harvest' });
  return n;
}

export function speedUpCrop(s: GameState, ctx: Ctx, farmUid: string): void {
  const b = getBuilding(s, farmUid);
  assert(b.crop && b.crop.readyAt > ctx.now, 'Rien à accélérer');
  spend(s, { gems: speedUpCost(b.crop.readyAt - ctx.now) });
  b.crop.readyAt = ctx.now;
}

// ————————————————————————————— Cuisine —————————————————————————————

export function cook(s: GameState, ctx: Ctx, kitchenUid: string, recipeId: string): void {
  const b = getBuilding(s, kitchenUid);
  assert(BUILDING[b.defId].kind === 'kitchen', 'Ce n’est pas une cuisine');
  assert(!b.busyKind, 'Cuisine en construction');
  assert(!b.kitchen, 'Un plat est déjà en préparation');
  const r = RECIPE[recipeId];
  assert(r, 'Recette inconnue');
  assert(s.player.level >= r.unlockLevel, `Niveau joueur ${r.unlockLevel} requis`);
  spend(s, { items: r.input });
  const dur = r.seconds * 1000 / (1 + (b.level - 1) * 0.2);
  b.kitchen = { recipeId, readyAt: ctx.now + dur };
  ctx.emit({ type: 'sfx', name: 'cook' });
}

export function collectDish(s: GameState, ctx: Ctx, kitchenUid: string): void {
  const b = getBuilding(s, kitchenUid);
  assert(b.kitchen, 'Aucun plat en préparation');
  assert(b.kitchen.readyAt <= ctx.now, 'Le plat n’est pas prêt', 'not_ready');
  const id = b.kitchen.recipeId;
  s.items[id] = (s.items[id] ?? 0) + 1;
  b.kitchen = null;
  bump(s, 'dishes');
  addPlayerXp(s, ctx, 10);
  ctx.emit({ type: 'sfx', name: 'harvest' });
}

// ————————————————————————————— Nurserie —————————————————————————————

export function hatchDurationMs(speciesId: string): number {
  return Math.round(RARITIES[SPECIES[speciesId].rarity].hatchMinutes * 60000);
}

export function placeEgg(s: GameState, ctx: Ctx, nurseryUid: string, eggUid: string): NurserySlot {
  const b = getBuilding(s, nurseryUid);
  assert(BUILDING[b.defId].kind === 'nursery', 'Ce n’est pas une nurserie');
  assert(!b.busyKind || b.busyKind === 'upgrade', 'Nurserie en construction');
  b.nursery ??= [];
  assert(b.nursery.length < nurserySlots(b.level), 'Nurserie pleine : améliore-la pour plus d’emplacements', 'full');
  const idx = s.eggs.findIndex((e) => e.uid === eggUid);
  assert(idx >= 0, 'Œuf introuvable', 'not_found');
  const [egg] = s.eggs.splice(idx, 1);
  const slot: NurserySlot = { egg, placedAt: ctx.now, readyAt: ctx.now + hatchDurationMs(egg.speciesId) };
  b.nursery.push(slot);
  ctx.emit({ type: 'sfx', name: 'egg' });
  return slot;
}

export function hatch(s: GameState, ctx: Ctx, nurseryUid: string, slotIndex: number): string {
  const b = getBuilding(s, nurseryUid);
  const slot = b.nursery?.[slotIndex];
  assert(slot, 'Emplacement vide');
  assert(slot.readyAt <= ctx.now, 'L’œuf n’est pas encore prêt', 'not_ready');
  b.nursery!.splice(slotIndex, 1);
  const m = createMonster(s, ctx, slot.egg.speciesId);
  bump(s, 'hatches');
  const r = rarityIndex(SPECIES[m.speciesId].rarity);
  addPlayerXp(s, ctx, 10 + r * 15);
  if (s.event.eventKey) { s.event.currency += 5; s.event.points += 5; }
  ctx.emit({ type: 'hatched', uid: m.uid });
  if (!m.habitatUid) ctx.emit({ type: 'toast', text: 'Aucun habitat compatible libre : ton Xalamon attend dans la Réserve.', kind: 'info' });
  return m.uid;
}

export function speedUpEgg(s: GameState, ctx: Ctx, nurseryUid: string, slotIndex: number): void {
  const b = getBuilding(s, nurseryUid);
  const slot = b.nursery?.[slotIndex];
  assert(slot && slot.readyAt > ctx.now, 'Rien à accélérer');
  spend(s, { gems: speedUpCost(slot.readyAt - ctx.now) });
  slot.readyAt = ctx.now;
}

export function sellEgg(s: GameState, ctx: Ctx, eggUid: string): void {
  const idx = s.eggs.findIndex((e) => e.uid === eggUid);
  assert(idx >= 0, 'Œuf introuvable');
  const [egg] = s.eggs.splice(idx, 1);
  grant(s, ctx, { coins: Math.round(RARITIES[SPECIES[egg.speciesId].rarity].sellValue / 2) }, 'sell');
}

// ————————————————————————————— Élevage —————————————————————————————

export const BREED_MIN_LEVEL = 4;

function recipeMatches(sp: SpeciesDef, a: SpeciesDef, b: SpeciesDef): boolean {
  const r = sp.recipe!;
  const covers = (g: string[], p: SpeciesDef) => p.elements.some((e) => g.includes(e));
  return (covers(r[0], a) && covers(r[1], b)) || (covers(r[0], b) && covers(r[1], a));
}

export interface BreedOdds { speciesId: string; chance: number }

/** Probabilités de résultat pour deux espèces parentes (jamais garanti). */
export function breedOdds(aId: string, bId: string, opts: { stars?: boolean; eventElement?: string; parentStages?: number } = {}): BreedOdds[] {
  const a = SPECIES[aId], b = SPECIES[bId];
  const union = new Set([...a.elements, ...b.elements]);
  const parentRarity = rarityIndex(a.rarity) + rarityIndex(b.rarity);
  const list: { speciesId: string; w: number }[] = [];
  for (const sp of SPECIES_LIST) {
    if (sp.exclusive) continue;
    let ok: boolean;
    if (sp.recipe) ok = recipeMatches(sp, a, b);
    else ok = sp.elements.every((e) => union.has(e));
    if (!ok) continue;
    const ri = rarityIndex(sp.rarity);
    let w = RARITIES[sp.rarity].breedWeight;
    if (ri >= 2) w *= 1 + parentRarity * 0.12 + (opts.parentStages ?? 0) * 0.05;
    if (sp.id === aId || sp.id === bId) w *= 1.4;
    if (opts.stars && ri >= 2) w *= 1.3;
    if (opts.eventElement && sp.elements.includes(opts.eventElement as never)) w *= 1.3;
    list.push({ speciesId: sp.id, w });
  }
  const total = list.reduce((s, x) => s + x.w, 0);
  return list.map((x) => ({ speciesId: x.speciesId, chance: x.w / total })).sort((p, q) => q.chance - p.chance);
}

export function breedDurationMs(speciesId: string): number {
  return Math.max(30000, Math.round(RARITIES[SPECIES[speciesId].rarity].hatchMinutes * 60000));
}

export function breedCost(aId: string, bId: string): { coins: number; energy: number } {
  const r = rarityIndex(SPECIES[aId].rarity) + rarityIndex(SPECIES[bId].rarity);
  return { coins: 100 + r * 250, energy: 5 + r * 2 };
}

export function startBreeding(s: GameState, ctx: Ctx, sanctuaryUid: string, aUid: string, bUid: string): void {
  const b = getBuilding(s, sanctuaryUid);
  assert(BUILDING[b.defId].kind === 'breeding', 'Ce n’est pas un sanctuaire');
  assert(!b.busyKind, 'Sanctuaire en construction');
  assert(!b.breeding, 'Un élevage est déjà en cours ici');
  assert(aUid !== bUid, 'Choisis deux Xalamons différents');
  const ma = getMonster(s, aUid), mb = getMonster(s, bUid);
  assert(ma.level >= BREED_MIN_LEVEL && mb.level >= BREED_MIN_LEVEL, `Les parents doivent être au moins niveau ${BREED_MIN_LEVEL}`);
  const busy = s.buildings.some((x) => x.breeding && [x.breeding.parentA, x.breeding.parentB].some((p) => p === aUid || p === bUid));
  assert(!busy, 'Un des parents est déjà en élevage');
  const odds = breedOdds(ma.speciesId, mb.speciesId, {
    stars: weatherAt(b.islandId, ctx.now) === 'stars',
    eventElement: s.event.eventKey ? currentEvent(ctx.now).def.element : undefined,
    parentStages: ma.stage + mb.stage,
  });
  assert(odds.length > 0, 'Ces Xalamons ne sont pas compatibles');
  spend(s, breedCost(ma.speciesId, mb.speciesId));
  const pick = pickWeighted(odds, (o) => o.chance, ctx.rng()).speciesId;
  const speed = 1 + (b.level - 1) * 0.1;
  b.breeding = { parentA: aUid, parentB: bUid, startedAt: ctx.now, readyAt: ctx.now + breedDurationMs(pick) / speed, resultSpeciesId: pick };
  bump(s, 'breeds');
  addPlayerXp(s, ctx, 8);
  ctx.emit({ type: 'sfx', name: 'breed' });
}

export function collectBreeding(s: GameState, ctx: Ctx, sanctuaryUid: string): string {
  const b = getBuilding(s, sanctuaryUid);
  assert(b.breeding, 'Aucun élevage en cours');
  assert(b.breeding.readyAt <= ctx.now, 'L’élevage n’est pas terminé', 'not_ready');
  const job = b.breeding;
  const pa = s.monsters.find((m) => m.uid === job.parentA)?.speciesId ?? '?';
  const pb = s.monsters.find((m) => m.uid === job.parentB)?.speciesId ?? '?';
  const key = [pa, pb].sort().join('+');
  const log = (s.breedLog[key] ??= []);
  if (!log.includes(job.resultSpeciesId)) log.push(job.resultSpeciesId);
  const egg = addEgg(s, ctx, job.resultSpeciesId, 'breeding');
  b.breeding = null;
  ctx.emit({ type: 'sfx', name: 'egg' });
  return egg.uid;
}

export function speedUpBreeding(s: GameState, ctx: Ctx, sanctuaryUid: string): void {
  const b = getBuilding(s, sanctuaryUid);
  assert(b.breeding && b.breeding.readyAt > ctx.now, 'Rien à accélérer');
  spend(s, { gems: speedUpCost(b.breeding.readyAt - ctx.now) });
  b.breeding.readyAt = ctx.now;
}

export function stageLabel(stage: number): string { return STAGE_NAMES[stage]; }
