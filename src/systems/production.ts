import type { GameState, BuildingInstance, ElementId } from '../core/types';
import { assert } from '../core/util';
import { BUILDING, HABITAT_COIN_CAP, ISLANDS } from '../data/world';
import { type Ctx, bump, coinCap, playerEnergyCap, addPlayerXp } from './core';
import { habitatResidents, monsterIncome } from './monsters';
import { getBuilding } from './buildings';
import { currentEvent, weatherAt } from './time';

export const ENERGY_REGEN_MS = 4 * 60 * 1000;

export function monumentBonus(s: GameState): number {
  let pct = 0;
  for (const b of s.buildings) {
    const d = BUILDING[b.defId];
    if (d.kind === 'monument' && b.busyKind !== 'build') pct += (d.bonus ?? 0) * b.level;
  }
  return pct / 100;
}

/** Multiplicateur appliqué à un habitat (île, monuments, météo, événement). */
export function habitatMultiplier(s: GameState, b: BuildingInstance, now: number): number {
  const def = BUILDING[b.defId];
  const isl = ISLANDS[b.islandId];
  let m = 1 + (s.islands[b.islandId].level - 1) * 0.05 + monumentBonus(s);
  const el = def.element as ElementId | 'any' | undefined;
  if (el && el !== 'any' && isl.affinity.includes(el)) m += 0.15;
  const w = weatherAt(b.islandId, now);
  if (w === 'rainbow') m += 0.1;
  if (w === 'storm' && el === 'volt') m += 0.25;
  if (w === 'snow' && el === 'glace') m += 0.25;
  const ev = currentEvent(now).def;
  if (el === ev.element && s.event.eventKey) m += 0.2;
  return m;
}

/** XalaCoins / minute d'un habitat. */
export function habitatRate(s: GameState, b: BuildingInstance, now: number): number {
  const res = habitatResidents(s, b.uid);
  const base = res.reduce((sum, m) => sum + monsterIncome(m, now), 0);
  return base * habitatMultiplier(s, b, now);
}

export function habitatCap(b: BuildingInstance): number {
  return HABITAT_COIN_CAP[b.level];
}

export function energyWellRate(b: BuildingInstance): number { return b.level / 6; } // énergie / minute
export function energyWellCap(b: BuildingInstance): number { return 10 * b.level; }
export function condenserRate(b: BuildingInstance): number { return b.level / (24 * 60); }
export function condenserCap(b: BuildingInstance): number { return b.level; }

export function storedCap(b: BuildingInstance): number {
  const k = BUILDING[b.defId].kind;
  if (k === 'habitat') return habitatCap(b);
  if (k === 'energy') return energyWellCap(b);
  if (k === 'essence') return condenserCap(b);
  return 0;
}

/** Fait avancer la production jusqu'à `now`. Robuste aux retours d'horloge. */
export function tickProduction(s: GameState, now: number): void {
  for (const b of s.buildings) {
    const k = BUILDING[b.defId].kind;
    if (k !== 'habitat' && k !== 'energy' && k !== 'essence') { b.lastTickAt = now; continue; }
    if (b.busyKind === 'build') { b.lastTickAt = now; continue; }
    const dtMin = Math.max(0, now - b.lastTickAt) / 60000;
    b.lastTickAt = Math.max(b.lastTickAt, now);
    if (dtMin <= 0) continue;
    let rate = 0;
    if (k === 'habitat') rate = habitatRate(s, b, now);
    else if (k === 'energy') rate = energyWellRate(b);
    else rate = condenserRate(b);
    b.stored = Math.min(storedCap(b), b.stored + rate * dtMin);
  }
  // régénération passive de la XalaEnergy
  const cap = playerEnergyCap(s);
  const last = s.timers.energyAt ?? now;
  if (s.resources.energy >= cap) {
    s.timers.energyAt = now;
  } else if (now > last) {
    const ticks = Math.floor((now - last) / ENERGY_REGEN_MS);
    if (ticks > 0) {
      s.resources.energy = Math.min(cap, s.resources.energy + ticks);
      s.timers.energyAt = last + ticks * ENERGY_REGEN_MS;
    }
  } else {
    s.timers.energyAt = now;
  }
}

export function collect(s: GameState, ctx: Ctx, uid: string): number {
  const b = getBuilding(s, uid);
  const k = BUILDING[b.defId].kind;
  assert(k === 'habitat' || k === 'energy' || k === 'essence', 'Rien à récolter ici');
  tickProduction(s, ctx.now);
  const amount = Math.floor(b.stored);
  assert(amount >= 1, 'Rien à récolter pour le moment', 'empty');
  let taken = amount;
  if (k === 'habitat') {
    const room = Math.max(0, coinCap(s) - s.resources.coins);
    assert(room > 0, 'Entrepôt plein : construis ou améliore un Entrepôt Céleste', 'full');
    taken = Math.min(amount, room);
    s.resources.coins += taken;
    bump(s, 'coins_earned', taken);
    bump(s, 'collects');
    addPlayerXp(s, ctx, Math.max(1, Math.round(taken / 150)));
    if (s.event.eventKey) { s.event.currency += 1; s.event.points += 1; }
    ctx.emit({ type: 'sfx', name: 'coins' });
  } else if (k === 'energy') {
    s.resources.energy += taken;
    ctx.emit({ type: 'sfx', name: 'energy' });
  } else {
    s.resources.essence += taken;
    bump(s, 'essence_earned', taken);
    ctx.emit({ type: 'sfx', name: 'essence' });
  }
  b.stored -= taken;
  return taken;
}

export function collectAll(s: GameState, ctx: Ctx): number {
  tickProduction(s, ctx.now);
  let total = 0;
  for (const b of s.buildings) {
    if (BUILDING[b.defId].kind !== 'habitat' || b.stored < 1) continue;
    try { total += collect(s, ctx, b.uid); } catch { /* entrepôt plein */ }
  }
  return total;
}
