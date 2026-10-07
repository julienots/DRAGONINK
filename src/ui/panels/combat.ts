import type { App } from '../app';
import { SPECIES, BOSSES } from '../../data/species';
import { ELEMENTS, RARITIES } from '../../data/elements';
import { STATUS_INFO, ULTIMATE_CHARGE } from '../../data/skills';
import { CAMPAIGN_WORLDS, STAGES_PER_WORLD } from '../../data/progression';
import { campaignEnemies, campaignEnergyCost, arenaOpponents, tournamentEnemies, TOURNAMENT_ROUNDS, nextActor, act as battleAct, aiChoose, alive, skillReady, previewMultiplier, type BattleState, type BattleMode, type Fighter, type FighterInit } from '../../systems/battle';
import { campaignUnlocked, teamLevel, bossMaxHp, arenaLeague, BOSS_ATTEMPTS_PER_DAY, BOSS_TIERS, ARENA_ENERGY, TOURNAMENT_ENERGY, BOSS_ENERGY, BOSS_TURN_LIMIT, type BattleOutcome } from '../../systems/combat';
import { power, displayName } from '../../systems/monsters';
import { currentEvent } from '../../systems/time';
import { fmtNum, dayKey, msUntilNextDay } from '../../core/util';
import { html, esc, onActions, rewardLines, stars } from '../dom';
import { BattleView } from '../../render/battleView';
import { Showcase } from '../../render/showcase';
import { audio } from '../../audio/audio';
import { monsterCard } from './monsters';
import { ISLANDS } from '../../data/world';

export function registerCombatPanels(app: App): void {
  app.routes.combat = (d) => openHub(app, d.tab);
}

function enemyPreview(app: App, list: FighterInit[]): string {
  return `<div class="row wrap" style="justify-content:center">${list.map((e) => e.speciesId ? `<div style="text-align:center;width:84px"><img src="${app.portrait(e.speciesId, e.stage)}" style="width:72px;height:72px"><div style="font-size:11px">${esc(e.name)}</div><div class="muted" style="font-size:10px">Niv.${e.level} ${SPECIES[e.speciesId].elements.map((x) => ELEMENTS[x].icon).join('')}</div></div>` : '').join('')}</div>`;
}

function teamBar(app: App): string {
  const s = app.game.state;
  const team = s.team.map((u) => s.monsters.find((m) => m.uid === u)).filter(Boolean);
  return `<div class="card row" style="margin-bottom:8px"><b>Équipe</b><div class="row spacer" style="gap:4px">${team.map((m) => `<img src="${app.portrait(m!.speciesId, m!.stage, m!.skin)}" style="width:44px;height:44px" title="${esc(displayName(m!))}">`).join('')}</div>
    <span class="muted">⚔️ ${fmtNum(team.reduce((a, m) => a + power(m!), 0))}</span><button class="btn small" data-act="tab" data-tab="Équipe">Modifier</button></div>`;
}

function openHub(app: App, tab?: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Combat', tabs: ['Campagne', 'Arène', 'Tournoi', 'Boss', 'Équipe'], tab: tab ?? 'Campagne',
    render: (body, sheet) => {
      const s = g.state;
      const now = g.now();
      if (sheet.tab === 'Campagne') {
        body.innerHTML = teamBar(app) + CAMPAIGN_WORLDS.map((w) => {
          const total = Array.from({ length: STAGES_PER_WORLD }, (_, i) => s.campaign.stars[`${w.id}-${i + 1}`] ?? 0).reduce((a, b) => a + b, 0);
          return `<div class="world-card" style="--wc:${w.color}"><div class="row"><b class="spacer txt-stroke" style="font-size:16px">Monde ${w.id} · ${esc(w.name)}</b><span>${w.elements.map((e) => ELEMENTS[e].icon).join('')}</span><span class="muted">⭐ ${total}/${STAGES_PER_WORLD * 3}</span></div>
            <div class="stages">${Array.from({ length: STAGES_PER_WORLD }, (_, i) => {
              const st = i + 1;
              const open = campaignUnlocked(s, w.id, st);
              const n = s.campaign.stars[`${w.id}-${st}`] ?? 0;
              return `<button class="stage-btn ${st === STAGES_PER_WORLD ? 'boss' : ''} ${open ? '' : 'locked'}" data-act="stage" data-ref="${w.id}-${st}" ${open ? '' : 'disabled'}>${st === STAGES_PER_WORLD ? '👑' : st}<span class="st" style="color:#ffd36b">${open ? stars(n) : '🔒'}</span></button>`;
            }).join('')}</div></div>`;
        }).join('');
      } else if (sheet.tab === 'Arène') {
        const league = arenaLeague(s.arena.rating);
        const opps = arenaOpponents(s.arena.seed, s.arena.rating, teamLevel(s));
        body.innerHTML = teamBar(app) + `<div class="card hl" style="text-align:center"><div style="font-size:40px">${league.icon}</div><b>Ligue ${league.name}</b> · Classement ${s.arena.rating}<br><span class="muted">${s.arena.wins} victoires · ${s.arena.losses} défaites</span>
          <div style="margin-top:8px"><button class="btn gold small" data-act="arenaDaily" ${s.arena.dailyClaimKey === dayKey(now) || !s.arena.wins ? 'disabled' : ''}>🎁 Récompense quotidienne de ligue</button></div></div>
          <div class="section-title">Adversaires <span class="muted" style="text-transform:none">⚡ ${ARENA_ENERGY} par combat</span></div>
          ${opps.map((o, i) => `<div class="card"><div class="row"><b class="spacer">${esc(o.name)}</b><span class="muted">🏆 ${o.rating}</span><button class="btn green small" data-act="arena" data-ref="${i}">⚔️ Défier</button></div>${enemyPreview(app, o.team)}</div>`).join('')}
          <p class="muted" style="text-align:center">Les adversaires d’arène sont simulés localement. L’architecture permet un futur PvP serveur avec matchmaking.</p>`;
      } else if (sheet.tab === 'Tournoi') {
        const ev = currentEvent(now);
        const round = s.tournament.eventKey === ev.key ? s.tournament.round : 0;
        const next = round < TOURNAMENT_ROUNDS ? tournamentEnemies(ev.key, round, teamLevel(s)) : [];
        body.innerHTML = teamBar(app) + `<div class="card hl" style="text-align:center"><div style="font-size:36px">${ev.def.icon}🏆</div><b>Tournoi du ${esc(ev.def.name)}</b><br><span class="muted">Se termine dans <span data-until="${now + ev.endsInMs}"></span></span>
          <div class="row" style="justify-content:center;gap:4px;margin-top:8px">${Array.from({ length: TOURNAMENT_ROUNDS }, (_, i) => `<span style="width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;background:${i < round ? '#4fd36a' : i === round ? '#ffd36b' : 'rgba(255,255,255,.15)'};color:${i === round ? '#5a3a00' : '#fff'}">${i + 1}</span>`).join('')}</div></div>
          ${round < TOURNAMENT_ROUNDS ? `<div class="section-title">Manche ${round + 1} <span class="muted" style="text-transform:none">⚡ ${TOURNAMENT_ENERGY}</span></div><div class="card">${enemyPreview(app, next)}<button class="btn green wide" style="margin-top:8px" data-act="tournament">⚔️ Combattre</button></div>`
            : '<div class="card" style="text-align:center">🏆 Tournoi terminé ! Reviens au prochain événement.</div>'}
          <p class="muted" style="text-align:center">Récompenses croissantes à chaque manche · Manche 8 : Œuf Epic + 🌟 SuperEssence.</p>`;
      } else if (sheet.tab === 'Boss') {
        const bd = BOSSES[s.boss.bossIndex];
        const max = bossMaxHp(s);
        const pct = Math.min(1, s.boss.damage / max);
        body.innerHTML = teamBar(app) + `<div class="detail-hero" style="--hero:#ff5a6a;height:200px" id="boss-hero"></div>
          <div style="text-align:center;margin-top:6px"><b style="font-size:20px" class="txt-stroke">👑 ${esc(bd.name)}</b> ${bd.elements.map((e) => ELEMENTS[e].icon).join('')}<br><span class="muted">${esc(bd.lore)}</span></div>
          <div class="bar hp" style="height:16px;margin:8px 0"><i style="width:${(1 - pct) * 100}%"></i></div>
          <div class="muted" style="text-align:center">PV restants : ${fmtNum(max - s.boss.damage)} / ${fmtNum(max)} · Tentatives : ${BOSS_ATTEMPTS_PER_DAY - s.boss.attempts}/${BOSS_ATTEMPTS_PER_DAY} · Nouveau boss dans <span data-until="${now + msUntilNextDay(now)}"></span></div>
          <div class="row wrap" style="justify-content:center;margin:8px 0">${BOSS_TIERS.map((t, i) => `<span class="rar" style="--rc:${s.boss.claimedTiers.includes(i) ? '#4fd36a' : 'rgba(255,255,255,.3)'}">${Math.round(t * 100)} %</span>`).join(' ')}</div>
          <button class="btn red wide" data-act="boss" ${s.boss.attempts >= BOSS_ATTEMPTS_PER_DAY || pct >= 1 ? 'disabled' : ''}>⚔️ Attaquer (${BOSS_ENERGY} ⚡ · ${BOSS_TURN_LIMIT} actions)</button>
          <p class="muted" style="text-align:center">Les dégâts de chaque tentative s’additionnent. Paliers : 💎, ⚡, 🌟 SuperEssence et Œuf Epic.</p>`;
        const host = body.querySelector('#boss-hero') as HTMLElement;
        const sc = new Showcase(host);
        sc.showLook(bd.look, 3, true);
        sc.mode = 'idle';
      } else {
        const team = s.team;
        body.innerHTML = `<p class="muted" style="text-align:center">Sélectionne jusqu’à 3 Xalamons. Pense aux avantages élémentaires !</p>
          <div class="card" style="font-size:12px">${['flamme', 'aqua', 'flora', 'volt', 'ombre', 'glace', 'vent', 'roche', 'lumiere', 'cosmos'].map((e) => `${ELEMENTS[e as keyof typeof ELEMENTS].icon} > ${ELEMENTS[e as keyof typeof ELEMENTS].strong.map((x) => ELEMENTS[x].icon).join('')}`).join(' · ')}</div>
          <div class="grid g3" style="margin-top:8px">${s.monsters.slice().sort((a, b) => power(b) - power(a)).map((m) => monsterCard(app, m, { act: 'toggle', sel: team.includes(m.uid), tag: team.includes(m.uid) ? `#${team.indexOf(m.uid) + 1}` : `⚔️${fmtNum(power(m))}` })).join('')}</div>`;
      }
      onActions(body, (a, d) => {
        if (a === 'tab') { sheet.tab = d.tab!; sheet.refresh(); }
        if (a === 'stage') stagePreview(app, d.ref!);
        if (a === 'arena') launch(app, 'arena', d.ref!);
        if (a === 'tournament') launch(app, 'tournament', 'next');
        if (a === 'boss') launch(app, 'boss', 'boss');
        if (a === 'arenaDaily') { const r = app.act('arena.daily'); if (r) app.showReward('Récompense de ligue', r); }
        if (a === 'toggle') {
          const t = g.state.team.includes(d.uid!) ? g.state.team.filter((x) => x !== d.uid) : [...g.state.team, d.uid!];
          if (t.length > 3) { app.toast('3 Xalamons maximum', 'bad'); return; }
          if (!t.length) { app.toast('Au moins un Xalamon', 'bad'); return; }
          app.ok('team.set', { uids: t });
        }
      });
    },
  });
}

function stagePreview(app: App, ref: string): void {
  const [w, st] = ref.split('-').map(Number);
  const en = campaignEnemies(w, st);
  const s = app.game.state;
  app.openSheet({
    title: `Monde ${w} · Étape ${st}`, modal: true,
    render: (body, sheet) => {
      const first = !s.campaign.stars[ref];
      body.innerHTML = `<div style="text-align:center">${st === STAGES_PER_WORLD ? '<b style="color:#ff8a96">👑 Combat de Gardien</b>' : ''}${enemyPreview(app, en)}
        <p class="muted">Récompenses : 🪙 XalaCoins, 🌾 nourriture, XP${first ? `, 💎 ${st === STAGES_PER_WORLD ? '15 + Œuf rare' : '2'} (première victoire)` : ''}, chance d’œuf</p>
        <p>Étoiles : ${stars(s.campaign.stars[ref] ?? 0)}</p>
        <button class="btn green wide" data-act="go">⚔️ Combattre · ⚡ ${campaignEnergyCost(w)}</button></div>`;
      onActions(body, () => { sheet.close(); launch(app, 'campaign', ref); });
    },
  });
}

// ————————————————————————————— combat en cours —————————————————————————————

export function launch(app: App, mode: BattleMode, ref: string): void {
  const battle = app.act('battle.start', { mode, ref });
  if (!battle) return;
  app.closeAllSheets();
  app.select(null);
  new BattleController(app, battle).run();
}

class BattleController {
  view: BattleView;
  ui: HTMLElement;
  numbers: HTMLElement;
  auto = false;
  speed = 1;
  target: string | null = null;
  private resolveChoice: ((c: { skillId: string; targetId?: string }) => void) | null = null;
  private activeId: string | null = null;
  private quit = false;

  constructor(private app: App, private b: BattleState) {
    this.numbers = html('<div style="position:fixed;inset:0;pointer-events:none;z-index:35"></div>');
    document.body.appendChild(this.numbers);
    this.view = new BattleView(app.world, this.numbers, b.mode === 'boss');
    this.view.setup(b);
    this.ui = html(`<div class="battle-ui"><div class="b-top"><div class="b-team mine"></div><div class="b-team enemy"></div></div><div class="b-bottom"></div></div>`);
    document.body.appendChild(this.ui);
    app.battleActive = true;
    app.setHudVisible(false);
    app.onFrame = (dt) => this.view.update(dt);
    audio.setTheme({ root: b.mode === 'boss' ? 50 : 57, scale: [0, 2, 3, 5, 7, 8, 10], tempo: b.mode === 'boss' ? 150 : 138, wave: 'sawtooth', key: 'battle:' + b.mode, drums: true, minor: true });
    window.addEventListener('resize', this.onResize);
    onActions(this.ui, (a, d) => this.onAction(a, d));
  }

  private onResize = () => { this.app.world.resize(); this.view.resize(); };

  private onAction(a: string, d: DOMStringMap): void {
    audio.sfx('click');
    if (a === 'target') { this.target = d.id!; this.renderUnits(); this.renderControls(); }
    if (a === 'skill' && this.resolveChoice) {
      const f = this.b.fighters.find((x) => x.id === this.activeId)!;
      const sk = f.skills.find((s) => s.id === d.id)!;
      const r = this.resolveChoice;
      this.resolveChoice = null;
      r({ skillId: sk.id, targetId: this.target ?? undefined });
    }
    if (a === 'auto') { this.auto = !this.auto; if (this.auto && this.resolveChoice && this.activeId) { const r = this.resolveChoice; this.resolveChoice = null; r(aiChoose(this.b, this.activeId)); } this.renderControls(); }
    if (a === 'speed') { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.view.speed = this.speed; this.renderControls(); }
    if (a === 'flee') {
      this.app.openSheet({ title: 'Abandonner ?', modal: true, render: (body, sheet) => {
        body.innerHTML = '<p style="text-align:center">Le combat sera perdu et l’énergie dépensée ne sera pas rendue.</p><div class="row"><button class="btn gray wide" data-act="no">Continuer</button><button class="btn red wide" data-act="yes">Abandonner</button></div>';
        onActions(body, (x) => { sheet.close(); if (x === 'yes') { this.quit = true; this.app.ok('battle.abandon'); this.resolveChoice?.({ skillId: 'flee' }); this.exit(); } });
      } });
    }
  }

  renderUnits(): void {
    const unit = (f: Fighter) => {
      const r = f.hp / f.maxHp;
      const st = f.statuses.map((x) => STATUS_INFO[x.id].icon).join('');
      return `<div class="b-unit ${f.isBoss ? 'boss' : ''} ${f.id === this.activeId ? 'active' : ''} ${f.hp <= 0 ? 'ko' : ''}" ${f.side === 1 && f.hp > 0 ? `data-act="target" data-id="${f.id}" style="cursor:pointer;${this.target === f.id ? 'border-color:#ff5a6a;box-shadow:0 0 10px #ff5a6a' : ''}"` : ''}>
        <div class="nm"><span>${f.side === 1 && this.target === f.id ? '🎯 ' : ''}${esc(f.name)}</span><span>${f.elements.map((e) => ELEMENTS[e].icon).join('')} ${f.isBoss ? '' : 'Niv.' + f.level}</span></div>
        <div class="bar hp ${r < 0.25 ? 'low' : r < 0.5 ? 'mid' : ''}"><i style="width:${r * 100}%"></i></div>
        <div class="bar ult" style="height:4px"><i style="width:${(f.charge / ULTIMATE_CHARGE) * 100}%"></i></div>
        <div class="st">${f.isBoss ? `${fmtNum(f.hp)} / ${fmtNum(f.maxHp)} ` : ''}${st}</div></div>`;
    };
    (this.ui.querySelector('.mine') as HTMLElement).innerHTML = this.b.fighters.filter((f) => f.side === 0).map(unit).join('');
    (this.ui.querySelector('.enemy') as HTMLElement).innerHTML = this.b.fighters.filter((f) => f.side === 1).map(unit).join('');
  }

  renderControls(): void {
    const bottom = this.ui.querySelector('.b-bottom') as HTMLElement;
    const f = this.activeId ? this.b.fighters.find((x) => x.id === this.activeId) : null;
    const mine = f && f.side === 0 && !this.auto && this.resolveChoice;
    const tgt = this.b.fighters.find((x) => x.id === this.target && x.hp > 0) ?? alive(this.b, 1)[0];
    const tools = `<div class="b-tools"><button class="btn red small" data-act="flee">🏳️ Fuir</button><span class="b-turn txt-stroke">${this.b.mode === 'boss' ? `Tour ${this.b.turn}/${this.b.maxTurns}` : f ? (f.side === 0 ? `À toi : ${esc(f.name)}` : `${esc(f.name)} agit…`) : ''}</span>
      <div class="row"><button class="btn small ${this.speed > 1 ? 'gold' : ''}" data-act="speed">⏩ ×${this.speed}</button><button class="btn small ${this.auto ? 'green' : 'gray'}" data-act="auto">🤖 Auto</button></div></div>`;
    if (!mine || !f) { bottom.innerHTML = tools; return; }
    bottom.innerHTML = `${tools}<div class="target-hint">Touche un ennemi en haut pour changer de cible · Cible : ${esc(tgt?.name ?? '')}</div>
      <div class="skills">${f.skills.map((sk) => {
        const ready = skillReady(f, sk);
        const cd = f.cooldowns[sk.id] ?? 0;
        const m = sk.power > 0 && tgt ? previewMultiplier(sk, tgt) : 1;
        return `<button class="skill ${sk.kind === 'ultimate' ? 'ult' : ''} ${sk.kind === 'ultimate' && ready ? 'ready' : ''}" style="--sc:${ELEMENTS[sk.element].color}" data-act="skill" data-id="${sk.id}" ${ready ? '' : 'disabled'}>
          ${m > 1 ? '<span class="adv">▲</span>' : m < 1 ? '<span class="adv bad">▼</span>' : ''}
          <span class="e">${sk.kind === 'normal' ? '👊' : ELEMENTS[sk.element].icon}</span><span>${esc(sk.name)}</span><span class="k">${sk.kind === 'normal' ? 'Attaque' : sk.kind === 'elemental' ? 'Élément' : sk.kind === 'special' ? 'Spéciale' : 'Ultime'}</span>
          ${!ready ? `<span class="cd">${sk.kind === 'ultimate' ? Math.round((f.charge / ULTIMATE_CHARGE) * 100) + '%' : cd}</span>` : ''}</button>`;
      }).join('')}</div>`;
  }

  async run(): Promise<void> {
    this.renderUnits();
    this.renderControls();
    await new Promise((r) => setTimeout(r, 500));
    while (!this.b.over && !this.quit) {
      const f = nextActor(this.b);
      if (!f) break;
      this.activeId = f.id;
      if (!this.target || !this.b.fighters.find((x) => x.id === this.target && x.hp > 0)) this.target = alive(this.b, 1)[0]?.id ?? null;
      this.renderUnits();
      let choice: { skillId: string; targetId?: string };
      if (f.side === 0 && !this.auto && !f.statuses.some((s) => s.id === 'stun')) {
        choice = await new Promise((resolve) => { this.resolveChoice = resolve; this.renderControls(); });
        if (this.quit) return;
      } else {
        this.renderControls();
        await new Promise((r) => setTimeout(r, 250 / this.speed));
        choice = aiChoose(this.b, f.id);
      }
      this.renderControls();
      const res = battleAct(this.b, f.id, choice.skillId, choice.targetId);
      if (res.skill) audio.sfx(res.skill.kind === 'ultimate' ? 'ult' : 'attack');
      if (res.events.some((e) => e.kind === 'damage')) setTimeout(() => audio.sfx('hit'), 380 / this.speed);
      await this.view.play(res);
      this.renderUnits();
    }
    if (this.quit) return;
    this.activeId = null;
    this.renderControls();
    const won = this.b.winner === 0;
    this.view.celebrate(won ? 0 : 1);
    audio.sfx(won ? 'victory' : 'defeat');
    await new Promise((r) => setTimeout(r, 1200));
    const out = this.app.act('battle.finish', { battle: this.b });
    this.showResult(out);
  }

  private showResult(out: BattleOutcome | undefined): void {
    const won = this.b.winner === 0;
    const boss = this.b.mode === 'boss';
    const lines = out ? rewardLines(out.reward) : [];
    const ref = String(this.b.meta.ref);
    this.app.openSheet({
      title: boss ? 'Fin de l’assaut' : won ? 'Victoire !' : 'Défaite…', modal: true, noAutoRefresh: true,
      onClose: () => this.exit(),
      render: (body, sheet) => {
        body.innerHTML = `<div class="reward-pop">
          <div class="result-banner txt-stroke" style="color:${won || boss ? '#ffe14d' : '#c9c2ff'}">${boss ? '⚔️' : won ? '🏆' : '💫'}</div>
          ${this.b.mode === 'campaign' && won ? `<div class="stars-big">${[0, 1, 2].map((i) => `<span class="${i < (out?.stars ?? 0) ? '' : 'off'}">⭐</span>`).join('')}</div>` : ''}
          ${(out?.details ?? []).map((d) => `<p>${esc(d)}</p>`).join('')}
          <div class="reward-items">${lines.map((l, i) => `<div class="reward-item" style="animation-delay:${i * 0.08}s"><span class="e">${l.icon}</span><div class="q">${esc(l.qty)}</div><div class="muted" style="font-size:11px">${esc(l.label)}</div></div>`).join('')}</div>
          ${out?.xpEach ? `<p class="muted">+${out.xpEach} XP pour chaque Xalamon de l’équipe</p>` : ''}
          ${!won && !boss ? '<p class="muted">Astuce : nourris et fais évoluer ton équipe, et exploite les avantages élémentaires ▲.</p>' : ''}
          <div class="row">${this.b.mode === 'campaign' ? `<button class="btn ${won ? 'gray' : 'gold'} wide" data-act="retry">🔁 Rejouer</button>` : ''}
          ${this.b.mode === 'campaign' && won ? '<button class="btn green wide" data-act="next">▶ Suivant</button>' : ''}
          <button class="btn ${this.b.mode === 'campaign' && won ? 'gray' : 'green'} wide" data-act="ok">Continuer</button></div></div>`;
        onActions(body, (a) => {
          sheet.close();
          if (a === 'retry') setTimeout(() => launch(this.app, 'campaign', ref), 50);
          else if (a === 'next') {
            const [w, st] = ref.split('-').map(Number);
            const nref = st < STAGES_PER_WORLD ? `${w}-${st + 1}` : `${w + 1}-1`;
            if (w + (st < STAGES_PER_WORLD ? 0 : 1) <= CAMPAIGN_WORLDS.length) setTimeout(() => launch(this.app, 'campaign', nref), 50);
          } else setTimeout(() => openHub(this.app, this.b.mode === 'campaign' ? 'Campagne' : this.b.mode === 'arena' ? 'Arène' : this.b.mode === 'tournament' ? 'Tournoi' : 'Boss'), 50);
        });
      },
    });
  }

  exit(): void {
    if (!this.ui.isConnected) return;
    this.view.dispose();
    this.ui.remove();
    this.numbers.remove();
    window.removeEventListener('resize', this.onResize);
    this.app.battleActive = false;
    this.app.onFrame = null;
    this.app.setHudVisible(true);
    const isl = ISLANDS[this.app.world.focusIsland];
    audio.setTheme({ ...isl.music, key: 'island:' + isl.id });
    this.app.refreshAll();
  }
}

export function rarityColor(id: string): string { return RARITIES[SPECIES[id].rarity].color; }
