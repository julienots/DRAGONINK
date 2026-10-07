import type { IslandId } from '../core/types';
import { hashString, weekIndex, msUntilNextWeek } from '../core/util';
import { ISLANDS, type WeatherId } from '../data/world';
import { EVENTS, type EventDef } from '../data/progression';

// Calendrier des événements et météo, déterministes à partir de l'heure.
// Une future version serveur pourra fournir ces valeurs (événements serveur).

export function currentEvent(now: number): { def: EventDef; key: string; endsInMs: number } {
  const w = weekIndex(now);
  const def = EVENTS[((w % EVENTS.length) + EVENTS.length) % EVENTS.length];
  return { def, key: `${def.id}#${w}`, endsInMs: msUntilNextWeek(now) };
}

const WEATHER_PERIOD = 3 * 3600 * 1000;

export function weatherAt(island: IslandId, now: number): WeatherId {
  const ev = currentEvent(now).def;
  if (ev.id === 'glace_fest' && island === 'glaciaire') return 'snow';
  if (ev.id === 'cosmic_night' && (island === 'cosmique' || island === 'celeste')) return 'stars';
  const slot = Math.floor(now / WEATHER_PERIOD);
  const pool = ISLANDS[island].weather;
  return pool[hashString(`${island}:${slot}`) % pool.length];
}

export function weatherEndsInMs(now: number): number {
  return WEATHER_PERIOD - (now % WEATHER_PERIOD);
}
