import type { GameState } from './types';
import { GameError } from './util';
import { SaveManager } from './save';
import { newGame } from './state';
import { makeCtx, type GameEvent } from '../systems/core';
import { ACTIONS, type ActionName, type ActionArgs, type ActionResult } from '../systems/actions';
import { settleBuildings } from '../systems/buildings';
import { tickProduction } from '../systems/production';
import { refreshQuests, refreshPass, refreshEvent, checkLogin } from '../systems/meta';
import { refreshBoss, refreshTournament } from '../systems/combat';

export type Clock = () => number;

type Listener = (e: GameEvent) => void;

export interface ActionLogEntry { name: string; at: number; rev: number }

/**
 * Orchestrateur : possède l'état, exécute les actions, émet les événements
 * vers l'interface et déclenche la sauvegarde.
 */
export class Game {
  state: GameState;
  private listeners = new Set<Listener>();
  private changeListeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** journal des actions (pour une future synchronisation serveur) */
  actionLog: ActionLogEntry[] = [];
  /** horloge "serveur" : décalage appliqué à l'horloge locale */
  clockOffset = 0;

  constructor(public saver: SaveManager, private clock: Clock = () => Date.now(), initial?: GameState) {
    if (initial) this.state = initial;
    else {
      const loaded = saver.load(this.now());
      this.state = loaded.state ?? newGame(this.now(), Math.floor(Math.random() * 2 ** 31));
      if (!loaded.state) this.saveNow();
    }
    this.tick();
  }

  now(): number {
    return this.clock() + this.clockOffset;
  }

  on(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  private changed(): void {
    for (const l of this.changeListeners) l();
  }

  /** Exécute une action ; lève GameError si elle est invalide (état inchangé). */
  act<K extends ActionName>(name: K, ...args: ActionArgs<K> extends undefined ? [] : [ActionArgs<K>]): ActionResult<K> {
    const now = this.now();
    this.refresh(now);
    // copie de travail : en cas d'erreur, l'état d'origine reste intact
    const draft = structuredClone(this.state);
    const queued: GameEvent[] = [];
    const ctx = makeCtx(draft, now, (e) => queued.push(e));
    const handler = ACTIONS[name] as (s: GameState, c: typeof ctx, a: unknown) => ActionResult<K>;
    const result = handler(draft, ctx, args[0]);
    draft.revision += 1;
    this.state = draft;
    this.actionLog.push({ name, at: now, rev: draft.revision });
    if (this.actionLog.length > 200) this.actionLog.shift();
    for (const e of queued) this.emit(e);
    this.scheduleSave();
    this.changed();
    return result;
  }

  /** Version qui capture l'erreur et l'affiche via un toast. */
  tryAct<K extends ActionName>(name: K, ...args: ActionArgs<K> extends undefined ? [] : [ActionArgs<K>]): { ok: true; value: ActionResult<K> } | { ok: false; error: string } {
    try {
      return { ok: true, value: this.act(name, ...args) };
    } catch (e) {
      const msg = e instanceof GameError ? e.message : 'Action impossible';
      if (!(e instanceof GameError)) console.error(e);
      this.emit({ type: 'toast', text: msg, kind: 'bad' });
      this.emit({ type: 'sfx', name: 'error' });
      return { ok: false, error: msg };
    }
  }

  private refresh(now: number): void {
    const s = this.state;
    const done = settleBuildings(s, now);
    for (const uid of done) this.emit({ type: 'built', uid });
    tickProduction(s, now);
    refreshQuests(s, now);
    refreshPass(s, now);
    refreshEvent(s, now);
    refreshBoss(s, now);
    refreshTournament(s, now);
    checkLogin(s, now);
  }

  /** Appelé régulièrement par la boucle de jeu. */
  tick(): void {
    const before = JSON.stringify([this.state.quests.dailyKey, this.state.event.eventKey, this.state.login.pending, this.state.buildings.map((b) => b.busyKind)]);
    this.refresh(this.now());
    const after = JSON.stringify([this.state.quests.dailyKey, this.state.event.eventKey, this.state.login.pending, this.state.buildings.map((b) => b.busyKind)]);
    if (before !== after) {
      this.state.revision += 1;
      this.scheduleSave();
      this.changed();
    }
  }

  scheduleSave(delay = 400): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, delay);
  }

  saveNow(): boolean {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.refresh(this.now());
    return this.saver.save(this.state, this.now());
  }

  replaceState(s: GameState): void {
    this.state = s;
    this.saveNow();
    this.changed();
  }

  setSetting<K extends keyof GameState['settings']>(k: K, v: GameState['settings'][K]): void {
    this.state.settings[k] = v;
    this.state.revision += 1;
    this.scheduleSave();
    this.changed();
  }
}
