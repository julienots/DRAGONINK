import * as THREE from 'three';
import type { Game } from '../core/game';
import type { GameEvent } from '../systems/core';
import type { Reward, IslandId } from '../core/types';
import type { ActionName, ActionArgs, ActionResult } from '../systems/actions';
import { WorldRenderer, type TapResult } from '../render/world';
import { profileFor, detectQuality, FpsMonitor, lowerLevel, type QualityLevel } from '../platform/quality';
import { audio } from '../audio/audio';
import { ISLANDS, BUILDING, HABITAT_CAPACITY } from '../data/world';
import { SPECIES } from '../data/species';
import { ELEMENTS } from '../data/elements';
import { fmtNum, fmtDuration } from '../core/util';
import { playerXpForLevel } from '../data/progression';
import { claimableCount, storyQuests, questProgress } from '../systems/meta';
import { computeStat, coinCap } from '../systems/core';
import { tickProduction, storedCap } from '../systems/production';
import { html, esc, onActions, rewardLines, vibrate } from './dom';
import type { StoreProvider } from '../platform/store';
import { currentEvent, weatherAt } from '../systems/time';
import { WEATHER_INFO } from '../data/world';
import { portrait } from '../render/showcase';

export interface SheetOpts {
  title: string;
  tabs?: string[];
  tab?: string;
  modal?: boolean;
  noAutoRefresh?: boolean;
  render: (body: HTMLElement, sheet: Sheet) => void;
  onClose?: () => void;
  onBack?: () => void;
}

export class Sheet {
  wrap: HTMLElement;
  body: HTMLElement;
  tabsEl: HTMLElement | null = null;
  tab: string;
  closed = false;
  constructor(public app: App, public opts: SheetOpts) {
    this.tab = opts.tab ?? opts.tabs?.[0] ?? '';
    this.wrap = html(`<div class="sheet-wrap ${opts.modal ? 'center' : ''}"><div class="sheet ${opts.modal ? 'modal' : ''}">
      <div class="sheet-head">${opts.onBack ? '<button class="sheet-back" data-x="back">◀</button>' : '<div style="width:38px"></div>'}<h2 class="txt-stroke">${esc(opts.title)}</h2><button class="sheet-close" data-x="close" aria-label="Fermer">✕</button></div>
      ${opts.tabs ? '<div class="tabs"></div>' : ''}<div class="sheet-body"></div></div></div>`);
    this.body = this.wrap.querySelector('.sheet-body')!;
    this.tabsEl = this.wrap.querySelector('.tabs');
    this.wrap.querySelector('[data-x=close]')!.addEventListener('click', () => { audio.sfx('click'); this.close(); });
    this.wrap.querySelector('[data-x=back]')?.addEventListener('click', () => { audio.sfx('click'); this.close(); opts.onBack?.(); });
    this.wrap.addEventListener('click', (e) => { if (e.target === this.wrap && opts.modal) this.close(); });
    if (this.tabsEl) {
      this.tabsEl.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
        if (!b) return;
        audio.sfx('click');
        this.tab = b.dataset.tab!;
        this.body.scrollTop = 0;
        this.refresh();
      });
    }
    this.refresh();
  }
  refresh(): void {
    if (this.closed) return;
    if (this.tabsEl) this.tabsEl.innerHTML = this.opts.tabs!.map((t) => `<button class="tab ${t === this.tab ? 'on' : ''}" data-tab="${esc(t)}">${esc(t)}</button>`).join('');
    const st = this.body.scrollTop;
    this.body.innerHTML = '';
    this.opts.render(this.body, this);
    this.body.scrollTop = st;
    this.app.updateTimers(this.body);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.wrap.remove();
    this.app.sheets = this.app.sheets.filter((s) => s !== this);
    this.opts.onClose?.();
  }
}

export class App {
  world: WorldRenderer;
  ui: HTMLElement;
  sheets: Sheet[] = [];
  qualityLevel: QualityLevel;
  private fps = new FpsMonitor();
  private last = performance.now();
  private hudEl!: HTMLElement;
  private ctxEl!: HTMLElement;
  private toastsEl!: HTMLElement;
  private sideL!: HTMLElement;
  private sideR!: HTMLElement;
  private navEl!: HTMLElement;
  private trackerEl!: HTMLElement;
  private chipEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  selected: string | null = null;
  private lastRes: Record<string, number> = {};
  private rewardQueue: { title: string; reward: Reward; extra?: string }[] = [];
  private rewardOpen = false;
  battleActive = false;
  onFrame: ((dt: number) => void) | null = null;
  private refreshPending = false;
  private markerEls = new Map<string, HTMLElement>();
  private ctxRenderKey = '';

  constructor(public game: Game, public store: StoreProvider) {
    const s = game.state;
    this.qualityLevel = s.settings.quality === 'auto' ? detectQuality() : s.settings.quality;
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.world = new WorldRenderer(canvas, profileFor(this.qualityLevel), document.getElementById('markers')!);
    this.ui = document.getElementById('ui')!;
    this.fps.onDowngrade = () => {
      if (this.game.state.settings.quality !== 'auto') return;
      const l = lowerLevel(this.qualityLevel);
      if (l) { this.setQuality(l); this.toast('Qualité graphique ajustée pour plus de fluidité', 'info'); }
    };
    audio.setVolumes(s.settings.music, s.settings.sfx);
  }

  // ————————————————————————— démarrage —————————————————————————

  start(): void {
    this.buildHud();
    this.world.onTap = (r) => this.handleTap(r);
    this.world.onIslandFocus = (id) => this.onIsland(id);
    this.world.sync(this.game.state);
    this.world.focus('verdante', true);
    this.game.on((e) => this.onGameEvent(e));
    this.game.onChange(() => this.scheduleRefresh());
    this.refreshAll();
    setInterval(() => this.everySecond(), 1000);
    requestAnimationFrame((t) => this.loop(t));
    this.bindLifecycle();
  }

  private bindLifecycle(): void {
    const save = () => { this.game.saveNow(); };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { save(); audio.suspend(); }
      else { audio.resume(); this.game.tick(); this.refreshAll(); }
    });
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    // appelés par la coque Android (onPause / onResume)
    (window as unknown as Record<string, unknown>).__xalaPause = () => { save(); audio.suspend(); };
    (window as unknown as Record<string, unknown>).__xalaResume = () => { audio.resume(); this.game.tick(); this.refreshAll(); };
    (window as unknown as Record<string, unknown>).__xalaBack = () => this.handleBack();
    setInterval(save, 15000);
  }

  handleBack(): boolean {
    const top = this.sheets[this.sheets.length - 1];
    if (top) { top.close(); return true; }
    if (this.world.placing) { this.world.cancelPlacement(); this.renderPlacementBar(false); return true; }
    if (this.selected) { this.select(null); return true; }
    return false;
  }

  setQuality(l: QualityLevel): void {
    this.qualityLevel = l;
    this.world.setQuality(profileFor(l));
  }

  private loop(t: number): void {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.fps.tick(dt);
    if (document.hidden) return;
    this.onFrame?.(dt);
    if (!this.battleActive) this.world.update(dt);
    this.world.render();
    if (this.game.state.settings.showFps) this.fpsEl.textContent = `${Math.round(this.fps.fps)} FPS · ${this.qualityLevel.toUpperCase()}`;
  }

  private everySecond(): void {
    this.game.tick();
    if (!this.battleActive) {
      tickProduction(this.game.state, this.game.now());
      this.world.sync(this.game.state);
      this.updateMarkers();
      this.renderCtx();
    }
    this.updateHud();
    this.updateTimers(document.body);
  }

  private scheduleRefresh(): void {
    if (this.refreshPending) return;
    this.refreshPending = true;
    requestAnimationFrame(() => {
      this.refreshPending = false;
      this.refreshAll();
    });
  }

  refreshAll(): void {
    this.world.sync(this.game.state);
    this.updateHud();
    this.updateMarkers();
    this.renderCtx(true);
    const top = this.sheets[this.sheets.length - 1];
    if (top && !top.opts.noAutoRefresh) top.refresh();
  }

  /** Met à jour tous les comptes à rebours [data-until] et barres [data-from][data-to]. */
  updateTimers(root: HTMLElement): void {
    const now = this.game.now();
    root.querySelectorAll<HTMLElement>('[data-until]').forEach((el) => {
      const until = Number(el.dataset.until);
      el.textContent = until > now ? fmtDuration(until - now) : (el.dataset.done ?? 'Prêt !');
    });
    root.querySelectorAll<HTMLElement>('[data-from][data-to]').forEach((el) => {
      const a = Number(el.dataset.from), b = Number(el.dataset.to);
      el.style.width = `${Math.min(100, Math.max(0, ((now - a) / Math.max(1, b - a)) * 100))}%`;
    });
  }

  // ————————————————————————— actions —————————————————————————

  act<K extends ActionName>(name: K, ...args: ActionArgs<K> extends undefined ? [] : [ActionArgs<K>]): ActionResult<K> | undefined {
    const r = this.game.tryAct(name, ...args);
    if (r.ok) return r.value;
    vibrate(40);
    return undefined;
  }

  /** Variante booléenne (actions sans valeur de retour). */
  ok<K extends ActionName>(name: K, ...args: ActionArgs<K> extends undefined ? [] : [ActionArgs<K>]): boolean {
    const r = this.game.tryAct(name, ...args);
    if (!r.ok) vibrate(40);
    return r.ok;
  }

  // ————————————————————————— événements de jeu —————————————————————————

  private onGameEvent(e: GameEvent): void {
    switch (e.type) {
      case 'toast': this.toast(e.text, e.kind); break;
      case 'sfx': audio.sfx(e.name); break;
      case 'reward': this.showReward(e.title, e.reward); break;
      case 'playerLevel':
        audio.sfx('levelup');
        this.showReward(`Niveau ${e.level} !`, {}, `<div class="burst">⭐</div><p>Tu es maintenant niveau <b>${e.level}</b>.<br><span class="muted">De nouveaux bâtiments, cultures et îles peuvent être débloqués.</span></p>`);
        break;
      case 'monsterLevel': {
        const p = this.world.monsterWorldPos(e.uid);
        if (p) { this.world.fx.burst(p, '#ffe680', { count: 20, star: true }); this.floatAtWorld(p, `Niv. ${e.level} !`, '#ffe14d'); }
        this.world.playMonster(e.uid, 'happy', 2);
        audio.sfx('levelup');
        break;
      }
      case 'built': {
        const p = this.world.buildingWorldPos(e.uid);
        if (p) this.world.fx.burst(p, '#ffffff', { count: 26 });
        break;
      }
      case 'hatched':
      case 'evolved':
        break;
    }
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    const t = html(`<div class="toast ${kind}">${esc(text)}</div>`);
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild!.remove();
    setTimeout(() => t.remove(), 2900);
  }

  floatAt(x: number, y: number, text: string, color = '#fff'): void {
    const el = html(`<div class="float-gain txt-stroke" style="left:${x}px;top:${y}px;color:${color}">${esc(text)}</div>`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  floatAtWorld(p: THREE.Vector3, text: string, color = '#fff'): void {
    const s = this.world.project(p);
    if (s.visible) this.floatAt(s.x, s.y, text, color);
  }

  showReward(title: string, reward: Reward, extra?: string): void {
    this.rewardQueue.push({ title, reward, extra });
    if (!this.rewardOpen) this.nextReward();
  }

  private nextReward(): void {
    const r = this.rewardQueue.shift();
    if (!r) { this.rewardOpen = false; return; }
    this.rewardOpen = true;
    const lines = rewardLines(r.reward);
    this.openSheet({
      title: r.title, modal: true, noAutoRefresh: true,
      onClose: () => setTimeout(() => this.nextReward(), 120),
      render: (body, sheet) => {
        body.innerHTML = `<div class="reward-pop">${r.extra ?? (lines.length ? '<div class="burst">🎁</div>' : '')}
          <div class="reward-items">${lines.map((l, i) => `<div class="reward-item" style="animation-delay:${i * 0.08}s"><span class="e">${l.icon}</span><div class="q">${esc(l.qty)}</div><div class="muted" style="font-size:11px">${esc(l.label)}</div></div>`).join('')}</div>
          <button class="btn gold wide" data-act="ok">Super !</button></div>`;
        onActions(body, () => { audio.sfx('click'); sheet.close(); });
      },
    });
    if (lines.length) audio.sfx('reward');
  }

  openSheet(opts: SheetOpts): Sheet {
    const s = new Sheet(this, opts);
    this.ui.appendChild(s.wrap);
    this.sheets.push(s);
    audio.sfx('open');
    return s;
  }

  closeAllSheets(): void {
    for (const s of [...this.sheets]) s.close();
  }

  // ————————————————————————— HUD —————————————————————————

  private buildHud(): void {
    this.hudEl = html(`<div class="hud-top">
      <div class="lvl-badge" data-act="profile"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" fill="#2c2266" stroke="rgba(255,255,255,.25)" stroke-width="5"/><circle class="xp-ring" cx="26" cy="26" r="22" fill="none" stroke="#5cf2ff" stroke-width="5" stroke-linecap="round" transform="rotate(-90 26 26)" stroke-dasharray="138.2" stroke-dashoffset="138.2"/><path d="M26 9 l4.6 9.4 10.4 1.5 -7.5 7.3 1.8 10.3 -9.3 -4.9 -9.3 4.9 1.8 -10.3 -7.5 -7.3 10.4 -1.5z" fill="#ffd36b" opacity=".35"/></svg><div class="num txt-stroke">1</div></div>
      <div class="pills">
        <div class="pill" data-res="coins" data-act="shop" data-cat="Packs"><span class="ico">🪙</span><span class="val">0</span><span class="plus">+</span></div>
        <div class="pill" data-res="gems" data-act="shop" data-cat="Gems"><span class="ico">💎</span><span class="val">0</span><span class="plus">+</span></div>
        <div class="pill" data-res="energy" data-act="shop" data-cat="Packs"><span class="ico">⚡</span><span class="val">0</span><span class="plus">+</span></div>
        <div class="pill essence" data-res="essence" data-act="essence"><span class="ico">🌟</span><span class="val">0</span></div>
      </div>
      <button class="gear" data-act="settings" aria-label="Paramètres">⚙️</button></div>`);
    this.chipEl = html(`<div class="island-chip" data-act="islands"></div>`);
    this.sideL = html(`<div class="side left">
      <button class="round-btn" data-act="quests">🎯<span class="lbl txt-stroke">Quêtes</span></button>
      <button class="round-btn" data-act="pass">🎟️<span class="lbl txt-stroke">Pass</span></button>
      <button class="round-btn" data-act="codex">📖<span class="lbl txt-stroke">Codex</span></button>
      <button class="round-btn" data-act="achievements">🏆<span class="lbl txt-stroke">Succès</span></button></div>`);
    this.sideR = html(`<div class="side right">
      <button class="round-btn" data-act="event">🎉<span class="lbl txt-stroke">Événement</span></button>
      <button class="round-btn" data-act="daily">🎁<span class="lbl txt-stroke">Cadeau</span></button>
      <button class="round-btn" data-act="islands">🏝️<span class="lbl txt-stroke">Îles</span></button>
      <button class="round-btn" data-act="collectAll">💰<span class="lbl txt-stroke">Tout</span></button></div>`);
    this.trackerEl = html(`<div class="quest-tracker hidden" data-act="quests"></div>`);
    this.navEl = html(`<div class="nav-bottom">
      <button class="nav-btn" data-act="build"><span class="ic">🏗️</span><span class="tx txt-stroke">Construire</span></button>
      <button class="nav-btn" data-act="xalamons"><span class="ic">🐲</span><span class="tx txt-stroke">Xalamons</span></button>
      <button class="nav-btn" data-act="nursery"><span class="ic">🥚</span><span class="tx txt-stroke">Nursery</span></button>
      <button class="nav-btn" data-act="breeding"><span class="ic">🧬</span><span class="tx txt-stroke">Élevage</span></button>
      <button class="nav-btn" data-act="combat"><span class="ic">⚔️</span><span class="tx txt-stroke">Combat</span></button>
      <button class="nav-btn" data-act="shop"><span class="ic">🛍️</span><span class="tx txt-stroke">Boutique</span></button></div>`);
    this.ctxEl = html(`<div class="ctx-bar hidden"></div>`);
    this.toastsEl = html(`<div class="toasts"></div>`);
    this.fpsEl = html(`<div class="fps hidden"></div>`);
    for (const el of [this.hudEl, this.chipEl, this.sideL, this.sideR, this.trackerEl, this.navEl, this.ctxEl, this.toastsEl, this.fpsEl]) {
      this.ui.appendChild(el);
      onActions(el, (a, d) => this.onUiAction(a, d));
    }
  }

  /** Les modules de panneaux s'enregistrent ici (évite les dépendances circulaires). */
  routes: Record<string, (d: DOMStringMap) => void> = {};

  private onUiAction(a: string, d: DOMStringMap): void {
    audio.sfx('click');
    if (a === 'collectAll') {
      const n = this.act('production.collectAll');
      if (n) this.toast(`+${fmtNum(n)} XalaCoins récoltés`, 'good');
      else if (n === 0) this.toast('Rien à récolter pour le moment', 'info');
      return;
    }
    if (a === 'essence') {
      this.toast('🌟 SuperEssence : ressource rare (boss, événements, succès, Pass, Condensateur).', 'info');
      return;
    }
    const r = this.routes[a];
    if (r) r(d);
  }

  setHudVisible(v: boolean): void {
    this.world.markerLayer.style.visibility = v || !this.battleActive ? '' : 'hidden';
    for (const el of [this.hudEl, this.chipEl, this.sideL, this.sideR, this.trackerEl, this.navEl, this.ctxEl]) el.style.visibility = v ? '' : 'hidden';
  }

  updateHud(): void {
    const s = this.game.state;
    for (const k of ['coins', 'gems', 'energy', 'essence'] as const) {
      const pill = this.hudEl.querySelector(`[data-res=${k}]`) as HTMLElement;
      const v = Math.floor(s.resources[k]);
      pill.querySelector('.val')!.textContent = k === 'coins' ? `${fmtNum(v)}` : fmtNum(v);
      if (this.lastRes[k] !== undefined && v > this.lastRes[k]) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
      this.lastRes[k] = v;
    }
    (this.hudEl.querySelector('[data-res=coins]') as HTMLElement).title = `Capacité : ${fmtNum(coinCap(s))}`;
    this.hudEl.querySelector('.num')!.textContent = String(s.player.level);
    const ratio = s.player.xp / playerXpForLevel(s.player.level);
    (this.hudEl.querySelector('.xp-ring') as SVGCircleElement).setAttribute('stroke-dashoffset', String(138.2 * (1 - Math.min(1, ratio))));
    const c = claimableCount(s);
    this.setBadge(this.sideL.querySelector('[data-act=quests]')!, c.quests);
    this.setBadge(this.sideL.querySelector('[data-act=pass]')!, c.pass);
    this.setBadge(this.sideL.querySelector('[data-act=achievements]')!, c.achievements);
    this.setBadge(this.sideR.querySelector('[data-act=event]')!, c.event);
    this.setBadge(this.sideR.querySelector('[data-act=daily]')!, s.login.pending ? 1 : 0);
    this.setBadge(this.navEl.querySelector('[data-act=nursery]')!, s.eggs.length + s.buildings.reduce((n, b) => n + (b.nursery ?? []).filter((x) => x.readyAt <= this.game.now()).length, 0));
    this.setBadge(this.navEl.querySelector('[data-act=breeding]')!, s.buildings.filter((b) => b.breeding && b.breeding.readyAt <= this.game.now()).length);
    // île + météo
    const id = this.world.focusIsland;
    const w = weatherAt(id, this.game.now());
    const ev = currentEvent(this.game.now());
    this.chipEl.innerHTML = `${esc(ISLANDS[id].name)} · Niv. ${s.islands[id].level} <span title="${esc(WEATHER_INFO[w].bonus)}">${WEATHER_INFO[w].icon}</span> <span style="color:${ev.def.color}">${ev.def.icon}</span>`;
    // suivi de quête d'histoire
    const q = storyQuests(s)[0];
    if (q) {
      const prog = Math.min(q.target, q.absolute ? computeStat(s, q.stat) : questProgress(s, q));
      const done = prog >= q.target;
      this.trackerEl.classList.remove('hidden');
      this.trackerEl.classList.toggle('done', done);
      this.trackerEl.innerHTML = `<div class="t">${done ? '✅ Terminé — touche pour réclamer' : '🎯 Objectif'}</div><div>${esc(q.text)}</div><div class="bar"><i style="width:${(prog / q.target) * 100}%"></i></div>`;
    } else this.trackerEl.classList.add('hidden');
    this.fpsEl.classList.toggle('hidden', !s.settings.showFps);
  }

  private setBadge(el: Element, n: number): void {
    let b = el.querySelector('.badge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'badge'; el.appendChild(b); }
      b.textContent = String(n);
    } else b?.remove();
  }

  private onIsland(id: IslandId): void {
    const isl = ISLANDS[id];
    audio.setTheme({ ...isl.music, key: 'island:' + id, drums: ['volcanique', 'tempete', 'dunes'].includes(id) });
    audio.setAmbience(id === 'volcanique' ? ['lava', 'wind'] : id === 'cosmique' ? ['space'] : id === 'glaciaire' || id === 'tempete' ? ['wind'] : ['wind', 'water']);
    this.updateHud();
  }

  // ————————————————————————— sélection & barre contextuelle —————————————————————————

  private handleTap(r: TapResult): void {
    if (r.kind === 'building' && r.uid) {
      audio.sfx('click');
      const b = this.game.state.buildings.find((x) => x.uid === r.uid);
      if (!b) return;
      // action rapide : récolter directement si quelque chose est prêt
      if (this.selected === r.uid || this.quickAction(r.uid)) { this.select(r.uid); return; }
      this.select(r.uid);
    } else if (r.kind === 'monster' && r.uid) {
      const m = this.game.state.monsters.find((x) => x.uid === r.uid);
      if (m) { audio.sfx('cry', { freq: ELEMENTS[SPECIES[m.speciesId].elements[0]].voice }); this.world.playMonster(m.uid, 'happy', 1.5); this.routes.monster?.({ uid: m.uid }); }
    } else {
      this.select(null);
    }
  }

  /** Tap sur un bâtiment prêt = récolte immédiate (geste naturel du genre). */
  private quickAction(uid: string): boolean {
    const s = this.game.state;
    const b = s.buildings.find((x) => x.uid === uid)!;
    const def = BUILDING[b.defId];
    const now = this.game.now();
    tickProduction(s, now);
    const pos = this.world.buildingWorldPos(uid);
    if ((def.kind === 'habitat' || def.kind === 'energy' || def.kind === 'essence') && b.stored >= Math.max(1, storedCap(b) * 0.05) && !b.busyKind) {
      const got = this.act('production.collect', { uid });
      if (got && pos) { this.floatAtWorld(pos, `+${fmtNum(got)} ${def.kind === 'habitat' ? '🪙' : def.kind === 'energy' ? '⚡' : '🌟'}`, '#ffe14d'); this.world.fx.burst(pos, def.kind === 'essence' ? '#8a5cff' : '#ffd36b', { count: 18 }); }
      return !!got;
    }
    if (def.kind === 'farm' && b.crop && b.crop.readyAt <= now) {
      const n = this.act('farm.harvest', { uid });
      if (n && pos) { this.floatAtWorld(pos, `+${n} récolte`, '#7af08e'); this.world.fx.burst(pos, '#7af08e', { count: 16 }); }
      return !!n;
    }
    if (def.kind === 'kitchen' && b.kitchen && b.kitchen.readyAt <= now) { this.act('kitchen.collect', { uid }); return true; }
    if (def.kind === 'breeding' && b.breeding && b.breeding.readyAt <= now) { this.act('breeding.collect', { uid }); this.toast('Nouvel œuf ! Place-le dans la Nursery.', 'good'); return true; }
    return false;
  }

  select(uid: string | null): void {
    this.selected = uid;
    this.world.select(uid);
    this.renderCtx(true);
  }

  renderCtx(force = false): void {
    const s = this.game.state;
    const b = this.selected ? s.buildings.find((x) => x.uid === this.selected) : null;
    if (!b || this.world.placing) { this.ctxEl.classList.add('hidden'); this.ctxRenderKey = ''; return; }
    const def = BUILDING[b.defId];
    const now = this.game.now();
    const key = JSON.stringify([b, Math.floor(now / 1000)]);
    if (!force && key === this.ctxRenderKey) return;
    this.ctxRenderKey = key;
    this.ctxEl.classList.remove('hidden');
    const acts: string[] = [];
    const A = (act: string, ic: string, tx: string, cls = '', extra = '') => acts.push(`<button class="ctx-act ${cls}" data-act="${act}" data-uid="${b.uid}"><span class="ic">${ic}${extra}</span><span class="tx txt-stroke">${tx}</span></button>`);
    let sub = `Niv. ${b.level}`;
    if (b.busyKind) {
      sub = `${b.busyKind === 'build' ? 'Construction' : 'Amélioration'} : <span data-until="${b.busyUntil}"></span>`;
      A('speedup', '⏩', 'Accélérer', 'purple');
    } else {
      switch (def.kind) {
        case 'habitat': {
          const res = s.monsters.filter((m) => m.habitatUid === b.uid).length;
          sub = `Niv. ${b.level} · ${res}/${HABITAT_CAPACITY[b.level]} Xalamons · ${fmtNum(b.stored)}/${fmtNum(storedCap(b))} 🪙`;
          A('collect', '🪙', 'Récolter', 'green', `<span class="cnt">${fmtNum(b.stored)}</span>`);
          A('habitat', '🐲', 'Habitants', 'blue');
          break;
        }
        case 'farm':
          if (!b.crop) A('plant', '🌱', 'Planter', 'green');
          else if (b.crop.readyAt <= now) A('harvest', '🧺', 'Récolter', 'green');
          else { sub = `Pousse : <span data-until="${b.crop.readyAt}"></span>`; A('speedupCrop', '⏩', 'Accélérer', 'purple'); }
          break;
        case 'nursery': A('nursery', '🥚', 'Œufs', 'green'); break;
        case 'breeding': A('breeding', '🧬', 'Élever', 'green'); break;
        case 'kitchen':
          if (!b.kitchen) A('cook', '🍳', 'Cuisiner', 'green');
          else if (b.kitchen.readyAt <= now) A('collectDish', '🍱', 'Servir', 'green');
          else sub = `Cuisson : <span data-until="${b.kitchen.readyAt}"></span>`;
          break;
        case 'energy': sub = `Niv. ${b.level} · ${Math.floor(b.stored)}/${storedCap(b)} ⚡`; A('collect', '⚡', 'Récolter', 'green'); break;
        case 'essence': sub = `Niv. ${b.level} · ${b.stored.toFixed(2)}/${storedCap(b)} 🌟`; A('collect', '🌟', 'Récolter', 'purple'); break;
        case 'arena': A('combat', '⚔️', 'Combattre', 'green'); break;
        default: break;
      }
      if (b.level < def.maxLevel) A('upgrade', '⬆️', 'Améliorer');
    }
    A('info', '❓', 'Infos', 'blue');
    if (def.kind !== 'arena') A('move', '✥', 'Déplacer');
    this.ctxEl.innerHTML = `<div class="ctx-title">${def.icon} ${esc(def.name)} <small>${sub}</small></div><div class="ctx-actions">${acts.join('')}</div>`;
    this.updateTimers(this.ctxEl);
  }

  // ————————————————————————— marqueurs —————————————————————————

  updateMarkers(): void {
    const s = this.game.state;
    const now = this.game.now();
    const want = new Map<string, { pos: THREE.Vector3; html: string; cls: string }>();
    for (const b of s.buildings) {
      const def = BUILDING[b.defId];
      const pos = this.world.buildingWorldPos(b.uid);
      if (!pos || ISLANDS[b.islandId] === undefined) continue;
      if (this.world.focusIsland !== b.islandId && pos.distanceTo(this.world.target) > 30) continue;
      let h = '', cls = '';
      if (b.busyKind) { h = `🔨 <span data-until="${b.busyUntil}"></span>`; cls = 'timer'; }
      else if (def.kind === 'habitat' && b.stored >= storedCap(b) * 0.25 && b.stored >= 5) h = '🪙';
      else if (def.kind === 'energy' && b.stored >= 3) h = '⚡';
      else if (def.kind === 'essence' && b.stored >= 1) h = '🌟';
      else if (def.kind === 'farm' && b.crop) { if (b.crop.readyAt <= now) h = '🧺'; else { h = `🌱 <span data-until="${b.crop.readyAt}"></span>`; cls = 'timer'; } }
      else if (def.kind === 'farm' && !b.crop) { h = '🌱'; cls = 'lvl'; }
      else if (def.kind === 'nursery' && (b.nursery ?? []).some((n) => n.readyAt <= now)) h = '🐣';
      else if (def.kind === 'nursery' && s.eggs.length && (b.nursery ?? []).length === 0) h = '🥚';
      else if (def.kind === 'breeding' && b.breeding) { if (b.breeding.readyAt <= now) h = '💗'; else { h = `🧬 <span data-until="${b.breeding.readyAt}"></span>`; cls = 'timer'; } }
      else if (def.kind === 'kitchen' && b.kitchen) { if (b.kitchen.readyAt <= now) h = '🍱'; else { h = `🍳 <span data-until="${b.kitchen.readyAt}"></span>`; cls = 'timer'; } }
      if (h) want.set(b.uid, { pos, html: h, cls });
    }
    for (const id of this.world.markerIds()) if (!want.has(id)) { this.world.removeMarker(id); this.markerEls.delete(id); }
    for (const [id, w] of want) {
      let el = this.markerEls.get(id);
      if (!el) {
        el = html(`<div class="marker" data-uid="${id}"><div class="bub"></div></div>`);
        el.addEventListener('click', (e) => { e.stopPropagation(); this.handleTap({ kind: 'building', uid: id }); });
        this.markerEls.set(id, el);
      }
      const bub = el.firstElementChild as HTMLElement;
      bub.className = `bub ${w.cls}`;
      if (bub.dataset.h !== w.html) { bub.innerHTML = w.html; bub.dataset.h = w.html; }
      this.world.setMarker(id, w.pos, el);
    }
    this.updateTimers(this.world.markerLayer);
  }

  renderPlacementBar(show: boolean, onConfirm?: () => void, label = 'Placer'): void {
    this.ui.querySelector('.place-bar')?.remove();
    this.ui.querySelector('.place-hint')?.remove();
    if (!show) { this.setHudVisible(true); return; }
    this.setHudVisible(false);
    const bar = html(`<div class="place-bar"><button class="btn red" data-act="cancel">✕ Annuler</button><button class="btn green" data-act="ok">✓ ${esc(label)}</button></div>`);
    const hint = html(`<div class="place-hint">Fais glisser le bâtiment ou touche une case libre (vert = OK)</div>`);
    this.ui.appendChild(bar);
    this.ui.appendChild(hint);
    const ok = bar.querySelector('[data-act=ok]') as HTMLButtonElement;
    this.world.onPlacementChange = (v) => { ok.disabled = !v; };
    ok.disabled = !this.world.placing?.valid;
    onActions(bar, (a) => {
      audio.sfx('click');
      if (a === 'cancel') { this.world.cancelPlacement(); this.renderPlacementBar(false); }
      else onConfirm?.();
    });
  }

  /** Saisie de texte dans l'interface (pas de prompt() natif, peu fiable en WebView). */
  promptText(title: string, initial: string, multiline = false): Promise<string | null> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: string | null) => { if (!done) { done = true; resolve(v); } };
      this.openSheet({
        title, modal: true, noAutoRefresh: true, onClose: () => finish(null),
        render: (body, sheet) => {
          body.innerHTML = `${multiline ? `<textarea class="text-input">${esc(initial)}</textarea>` : `<input class="text-input" maxlength="40" value="${esc(initial)}">`}
            <div class="row" style="margin-top:10px"><button class="btn gray wide" data-act="no">Annuler</button><button class="btn green wide" data-act="ok">Valider</button></div>`;
          const inp = body.querySelector('input,textarea') as HTMLInputElement;
          setTimeout(() => inp.focus(), 50);
          onActions(body, (a) => { const v = inp.value; sheet.close(); finish(a === 'ok' ? v : null); });
        },
      });
    });
  }

  portrait(speciesId: string, stage: number, skin?: string): string {
    return portrait(speciesId, stage, { skin });
  }
}
