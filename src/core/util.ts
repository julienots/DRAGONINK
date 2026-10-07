// Utilitaires déterministes (RNG, clés de date, hachage) partagés par la logique de jeu.

export class GameError extends Error {
  constructor(message: string, public code = 'invalid') {
    super(message);
  }
}

export function assert(cond: unknown, message: string, code = 'invalid'): asserts cond {
  if (!cond) throw new GameError(message, code);
}

/** mulberry32 : rapide, reproductible, état sur 32 bits (sérialisable). */
export function mulberry32Step(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [next, value];
}

export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const [n, v] = mulberry32Step(s);
    s = n;
    return v;
  };
}

export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickWeighted<T>(items: T[], weight: (t: T) => number, r: number): T {
  const total = items.reduce((s, i) => s + Math.max(0, weight(i)), 0);
  let x = r * total;
  for (const it of items) {
    x -= Math.max(0, weight(it));
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

export function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const rng = seededRng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAY = 86400000;

/** Jour local au format AAAA-MM-JJ (réinitialisation des quêtes quotidiennes). */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayIndex(t: number): number {
  const d = new Date(t);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY);
}

/** Semaine commençant le lundi. */
export function weekIndex(t: number): number {
  return Math.floor((dayIndex(t) + 3) / 7);
}

export function weekKey(t: number): string {
  return `W${weekIndex(t)}`;
}

export function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function msUntilNextDay(t: number): number {
  const d = new Date(t);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return next - t;
}

export function msUntilNextWeek(t: number): number {
  const di = dayIndex(t);
  const nextWeekStartDay = (weekIndex(t) + 1) * 7 - 3;
  return msUntilNextDay(t) + (nextWeekStartDay - di - 1) * DAY;
}

export function fmtNum(n: number): string {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.', ',') + ' Md';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
  if (n >= 1e4) return Math.floor(n / 1e3) + ' k';
  return n.toLocaleString('fr-FR');
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}j ${h % 24}h`;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
