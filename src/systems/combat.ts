import type { GameState, Reward, Stage } from '../core/types';
import { assert, dayKey, hashString } from '../core/util';
import { BOSSES, SPECIES } from '../data/species';
import { CAMPAIGN_WORLDS, STAGES_PER_WORLD } from '../data/progression';
import { type Ctx, bump, spend, grant, addPlayerXp } from './core';
import { addMonsterXp, getMonster, displayName } from './monsters';
import {
  type BattleState, type FighterInit, type BattleMode, createBattle, campaignEnemies, campaignEnergyCost,
  arenaOpponents, tournamentEnemies, TOURNAMENT_ROUNDS, campaignStageIndex,
} from './battle';
import { currentEvent } from './time';

export const BOSS_ATTEMPTS_PER_DAY = 3;
export const BOSS_TURN_LIMIT = 24;
export const BOSS_TIERS = [0.1, 0.25, 0.5, 0.75, 1];
export const ARENA_ENERGY = 4;
export const TOURNAMENT_ENERGY = 5;
export const BOSS_ENERGY = 6;

export function teamInits(s: GameState): FighterInit[] {
  const team = s.team.map((u) => s.monsters.find((m) => m.uid === u)).filter(Boolean);
  assert(team.length > 0, 'Compose ton équipe (1 à 3 Xalamons)');
  return team.map((m) => ({ name: displayName(m!), speciesId: m!.speciesId, level: m!.level, stage: m!.stage, monsterUid: m!.uid, skin: m!.skin }));
}

export function teamLevel(s: GameState): number {
  const t = s.team.map((u) => s.monsters.find((m) => m.uid === u)).filter(Boolean);
  if (!t.length) return 1;
  return Math.round(t.reduce((a, m) => a + m!.level + m!.stage * 3, 0) / t.length);
}

export function campaignUnlocked(s: GameState, world: number, stage: number): boolean {
  if (world === 1 && stage === 1) return true;
  const prev = stage > 1 ? `${world}-${stage - 1}` : `${world - 1}-${STAGES_PER_WORLD}`;
  return (s.campaign.stars[prev] ?? 0) > 0;
}

export function bossForDay(now: number): number {
  return hashString(dayKey(now)) % BOSSES.length;
}

export function bossMaxHp(s: GameState): number {
  const def = BOSSES[s.boss.bossIndex];
  return Math.round(def.hp * (1 + Math.max(0, s.player.level - 5) * 0.12));
}

export function refreshBoss(s: GameState, now: number): void {
  const k = dayKey(now);
  if (s.boss.dayKey !== k) s.boss = { dayKey: k, attempts: 0, damage: 0, claimedTiers: [], bossIndex: bossForDay(now) };
}

export function startBattle(s: GameState, ctx: Ctx, mode: BattleMode, ref: string): BattleState {
  const seed = Math.floor(ctx.rng() * 2 ** 31);
  const me = teamInits(s);
  let enemies: FighterInit[] = [];
  let maxTurns = 80;
  if (mode === 'campaign') {
    const [w, st] = ref.split('-').map(Number);
    assert(w >= 1 && w <= CAMPAIGN_WORLDS.length && st >= 1 && st <= STAGES_PER_WORLD, 'Étape inconnue');
    assert(campaignUnlocked(s, w, st), 'Termine d’abord l’étape précédente');
    spend(s, { energy: campaignEnergyCost(w) });
    enemies = campaignEnemies(w, st);
  } else if (mode === 'arena') {
    const idx = Number(ref);
    const opps = arenaOpponents(s.arena.seed, s.arena.rating, teamLevel(s));
    assert(opps[idx], 'Adversaire inconnu');
    spend(s, { energy: ARENA_ENERGY });
    enemies = opps[idx].team;
  } else if (mode === 'tournament') {
    refreshTournament(s, ctx.now);
    assert(s.tournament.round < TOURNAMENT_ROUNDS, 'Tournoi terminé pour cette semaine');
    spend(s, { energy: TOURNAMENT_ENERGY });
    enemies = tournamentEnemies(s.tournament.eventKey, s.tournament.round, teamLevel(s));
  } else {
    refreshBoss(s, ctx.now);
    assert(s.boss.attempts < BOSS_ATTEMPTS_PER_DAY, 'Plus de tentatives aujourd’hui contre le Boss');
    assert(s.boss.damage < bossMaxHp(s), 'Boss déjà vaincu aujourd’hui !');
    spend(s, { energy: BOSS_ENERGY });
    s.boss.attempts += 1;
    const def = BOSSES[s.boss.bossIndex];
    enemies = [{ name: def.name, bossId: def.id, level: Math.max(1, s.player.level), stage: 3 as Stage }];
    maxTurns = BOSS_TURN_LIMIT;
  }
  const b = createBattle(mode, me, enemies, seed, maxTurns);
  if (mode === 'boss') {
    const boss = b.fighters.find((f) => f.isBoss)!;
    boss.maxHp = bossMaxHp(s);
    boss.hp = Math.max(1, boss.maxHp - s.boss.damage);
  }
  b.meta = { ref, seed };
  s.activeBattle = { mode, ref, seed, startedAt: ctx.now };
  bump(s, 'battles_played');
  return b;
}

export interface BattleOutcome {
  won: boolean;
  stars: number;
  reward: Reward;
  xpEach: number;
  details: string[];
}

export function finishBattle(s: GameState, ctx: Ctx, b: BattleState): BattleOutcome {
  assert(b.over, 'Combat non terminé');
  assert(s.activeBattle && s.activeBattle.seed === b.meta.seed && s.activeBattle.mode === b.mode, 'Combat invalide', 'cheat');
  s.activeBattle = null;
  const won = b.winner === 0;
  const mine = b.fighters.filter((f) => f.side === 0);
  const ko = mine.filter((f) => f.hp <= 0).length;
  const out: BattleOutcome = { won, stars: 0, reward: {}, xpEach: 0, details: [] };
  const ref = String(b.meta.ref);

  if (b.mode === 'campaign') {
    const [w, st] = ref.split('-').map(Number);
    const idx = campaignStageIndex(w, st);
    if (won) {
      out.stars = ko === 0 ? 3 : ko === 1 ? 2 : 1;
      const first = !s.campaign.stars[ref];
      s.campaign.stars[ref] = Math.max(s.campaign.stars[ref] ?? 0, out.stars);
      out.reward = { coins: 120 + idx * 70, playerXp: 15 + idx * 2, items: { ble_xala: 6 + idx } };
      if (first) out.reward.gems = st === STAGES_PER_WORLD ? 15 : 2;
      if (first && st === STAGES_PER_WORLD) out.reward.eggs = [idx >= 30 ? '__random_epic' : '__random_rare'];
      else if (ctx.rng() < 0.12) out.reward.eggs = ['__random_uncommon'];
      out.xpEach = 25 + idx * 9;
      bump(s, 'campaign_wins');
    } else {
      out.xpEach = 8 + idx * 2;
    }
  } else if (b.mode === 'arena') {
    bump(s, 'arena_played');
    if (won) {
      s.arena.wins++;
      s.arena.rating += 25;
      out.reward = { coins: 300 + s.arena.rating, playerXp: 20, gems: ctx.rng() < 0.3 ? 2 : 0 };
      bump(s, 'arena_wins');
      out.xpEach = 40;
    } else {
      s.arena.losses++;
      s.arena.rating = Math.max(0, s.arena.rating - 15);
      out.xpEach = 10;
    }
    s.arena.seed = Math.floor(ctx.rng() * 2 ** 31);
    out.details.push(`Classement : ${s.arena.rating}`);
  } else if (b.mode === 'tournament') {
    if (won) {
      s.tournament.round += 1;
      s.tournament.best = Math.max(s.tournament.best, s.tournament.round);
      const r = s.tournament.round;
      out.reward = { coins: 500 * r, gems: r % 2 === 0 ? 5 : 0, eventCurrency: 10 * r, essence: r === TOURNAMENT_ROUNDS ? 2 : 0 };
      if (r === TOURNAMENT_ROUNDS) out.reward.eggs = ['__random_epic'];
      out.xpEach = 50 + r * 10;
      out.details.push(`Manche ${r}/${TOURNAMENT_ROUNDS} remportée`);
    } else {
      out.xpEach = 15;
      out.details.push('Tu peux retenter cette manche.');
    }
  } else {
    bump(s, 'boss_attacks');
    const dealt = b.fighters.filter((f) => f.side === 0).reduce((a, f) => a + f.damageDealt, 0);
    const max = bossMaxHp(s);
    s.boss.damage = Math.min(max, s.boss.damage + dealt);
    const pct = s.boss.damage / max;
    const reward: Reward = { coins: Math.round(dealt / 4) };
    BOSS_TIERS.forEach((t, i) => {
      if (pct >= t && !s.boss.claimedTiers.includes(i)) {
        s.boss.claimedTiers.push(i);
        if (i === 0) reward.gems = (reward.gems ?? 0) + 5;
        if (i === 1) reward.energy = (reward.energy ?? 0) + 20;
        if (i === 2) reward.essence = (reward.essence ?? 0) + 1;
        if (i === 3) reward.gems = (reward.gems ?? 0) + 20;
        if (i === 4) { reward.essence = (reward.essence ?? 0) + 2; reward.eggs = ['__random_epic']; }
      }
    });
    out.reward = reward;
    out.xpEach = 60;
    out.details.push(`Dégâts infligés : ${dealt.toLocaleString('fr-FR')} (${Math.floor(pct * 100)} % du Boss)`);
    if (pct >= 1) out.details.push(`${BOSSES[s.boss.bossIndex].name} est vaincu !`);
  }

  if (won) {
    bump(s, 'battles_won');
    if (s.event.eventKey) { s.event.currency += 6; s.event.points += 6; }
  }
  for (const f of mine) {
    if (!f.monsterUid) continue;
    const m = s.monsters.find((x) => x.uid === f.monsterUid);
    if (!m) continue;
    m.battles += 1;
    addMonsterXp(s, ctx, m, out.xpEach);
  }
  grant(s, ctx, out.reward, `battle:${b.mode}`);
  addPlayerXp(s, ctx, won ? 10 : 3);
  return out;
}

/** Abandon : le combat est perdu (l'énergie dépensée n'est pas rendue). */
export function abandonBattle(s: GameState): void {
  s.activeBattle = null;
}

export function refreshTournament(s: GameState, now: number): void {
  const k = currentEvent(now).key;
  if (s.tournament.eventKey !== k) s.tournament = { eventKey: k, round: 0, tokens: 0, best: 0 };
}

export function arenaLeague(rating: number): { name: string; icon: string } {
  if (rating >= 1600) return { name: 'Céleste', icon: '🌟' };
  if (rating >= 1200) return { name: 'Diamant', icon: '💎' };
  if (rating >= 800) return { name: 'Or', icon: '🥇' };
  if (rating >= 400) return { name: 'Argent', icon: '🥈' };
  return { name: 'Bronze', icon: '🥉' };
}

export function claimArenaDaily(s: GameState, ctx: Ctx): Reward {
  const k = dayKey(ctx.now);
  assert(s.arena.dailyClaimKey !== k, 'Récompense d’arène déjà réclamée aujourd’hui');
  assert(s.arena.wins > 0, 'Gagne au moins un combat d’arène');
  s.arena.dailyClaimKey = k;
  const r: Reward = { gems: 2 + Math.floor(s.arena.rating / 400) * 2, coins: 500 + s.arena.rating * 2 };
  grant(s, ctx, r, 'arena_daily');
  return r;
}

export function monsterTeamNames(s: GameState): string[] {
  return s.team.map((u) => { const m = getMonster(s, u); return `${SPECIES[m.speciesId].name}`; });
}
