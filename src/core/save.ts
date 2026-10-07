import type { GameState } from './types';
import { hashString } from './util';
import { migrate } from './state';

// Sauvegarde robuste :
//  - double emplacement A/B écrit en alternance (une écriture interrompue
//    n'abîme jamais la dernière sauvegarde valide),
//  - somme de contrôle pour détecter une corruption,
//  - copie de secours périodique,
//  - adaptateur natif Android (fichier + renommage atomique) si disponible.

export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

declare global {
  interface Window {
    XalaNative?: {
      saveWrite(key: string, value: string): boolean;
      saveRead(key: string): string | null;
      saveRemove?(key: string): void;
      [k: string]: unknown;
    };
  }
}

export class MemoryStorage implements StorageAdapter {
  map = new Map<string, string>();
  read(k: string) { return this.map.get(k) ?? null; }
  write(k: string, v: string) { this.map.set(k, v); }
  remove(k: string) { this.map.delete(k); }
}

export class WebStorage implements StorageAdapter {
  read(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  write(k: string, v: string): void {
    localStorage.setItem(k, v);
  }
  remove(k: string): void {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

/** Écrit dans le stockage natif ET dans localStorage ; lit la meilleure des deux. */
export class HybridStorage implements StorageAdapter {
  constructor(private web = new WebStorage()) {}
  private get native() { return typeof window !== 'undefined' ? window.XalaNative : undefined; }
  read(k: string): string | null {
    let n: string | null = null;
    try { n = this.native?.saveRead(k) ?? null; } catch { n = null; }
    const w = this.web.read(k);
    if (n && w) return newestEnvelope(n, w);
    return n ?? w;
  }
  write(k: string, v: string): void {
    let ok = false;
    try { ok = !!this.native?.saveWrite(k, v); } catch { ok = false; }
    try { this.web.write(k, v); ok = true; } catch (e) { if (!ok) throw e; }
  }
  remove(k: string): void {
    try { this.native?.saveRemove?.(k); } catch { /* ignore */ }
    this.web.remove(k);
  }
}

interface Envelope { v: 1; rev: number; at: number; sum: number; data: string }

function parseEnvelope(raw: string | null): Envelope | null {
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as Envelope;
    if (e.v !== 1 || typeof e.data !== 'string') return null;
    if (hashString(e.data) !== e.sum) return null;
    return e;
  } catch {
    return null;
  }
}

function newestEnvelope(a: string, b: string): string {
  const ea = parseEnvelope(a), eb = parseEnvelope(b);
  if (!ea) return b;
  if (!eb) return a;
  return eb.rev > ea.rev || (eb.rev === ea.rev && eb.at > ea.at) ? b : a;
}

const PREFIX = 'xalamonsters.save.';
const SLOTS = ['a', 'b'];

export interface LoadResult {
  state: GameState | null;
  source: string;
  corrupted: number;
}

export class SaveManager {
  private nextSlot = 0;
  private lastBackupAt = 0;
  lastSavedRevision = -1;
  lastError: string | null = null;

  constructor(public storage: StorageAdapter, private prefix = PREFIX) {}

  load(now: number): LoadResult {
    const cands: { env: Envelope; slot: string }[] = [];
    let corrupted = 0;
    for (const slot of [...SLOTS, 'backup']) {
      const raw = this.storage.read(this.prefix + slot);
      if (raw == null) continue;
      const env = parseEnvelope(raw);
      if (env) cands.push({ env, slot });
      else {
        corrupted++;
        try { this.storage.write(this.prefix + 'corrupt-' + slot, raw.slice(0, 2_000_000)); } catch { /* ignore */ }
      }
    }
    cands.sort((x, y) => y.env.rev - x.env.rev || y.env.at - x.env.at);
    for (const c of cands) {
      try {
        const st = migrate(JSON.parse(c.env.data), now);
        this.nextSlot = c.slot === 'a' ? 1 : 0;
        this.lastSavedRevision = st.revision;
        return { state: st, source: c.slot, corrupted };
      } catch {
        corrupted++;
      }
    }
    return { state: null, source: 'none', corrupted };
  }

  save(s: GameState, now: number): boolean {
    try {
      s.lastSeenAt = Math.max(s.lastSeenAt, now);
      const data = JSON.stringify(s);
      const env: Envelope = { v: 1, rev: s.revision, at: now, sum: hashString(data), data };
      const raw = JSON.stringify(env);
      const slot = SLOTS[this.nextSlot];
      this.storage.write(this.prefix + slot, raw);
      // vérification de relecture
      const check = parseEnvelope(this.storage.read(this.prefix + slot));
      if (!check || check.rev !== s.revision) throw new Error('Vérification de sauvegarde échouée');
      this.nextSlot = (this.nextSlot + 1) % SLOTS.length;
      if (now - this.lastBackupAt > 10 * 60 * 1000) {
        this.storage.write(this.prefix + 'backup', raw);
        this.lastBackupAt = now;
      }
      this.lastSavedRevision = s.revision;
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = (e as Error).message;
      return false;
    }
  }

  exportString(s: GameState): string {
    const data = JSON.stringify(s);
    return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, rev: s.revision, at: Date.now(), sum: hashString(data), data }))));
  }

  importString(str: string, now: number): GameState {
    const raw = decodeURIComponent(escape(atob(str.trim())));
    const env = parseEnvelope(raw);
    if (!env) throw new Error('Code de sauvegarde invalide');
    return migrate(JSON.parse(env.data), now);
  }

  wipe(): void {
    for (const slot of [...SLOTS, 'backup']) this.storage.remove(this.prefix + slot);
  }
}
