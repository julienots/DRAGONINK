import type { ElementId, Stage } from '../core/types';
import { mulberry32Step, hashString, seededRng } from '../core/util';
import { elementMultiplier } from '../data/elements';
import { SPECIES, SPECIES_LIST, BOSSES, type Appearance } from '../data/species';
import { skillsFor, ULTIMATE_CHARGE, type SkillDef, type StatusId } from '../data/skills';
import { CAMPAIGN_WORLDS, STAGES_PER_WORLD } from '../data/progression';
import { monsterStats } from './monsters';
import { rarityIndex } from '../data/elements';

// Moteur de combat déterministe (graine + actions) : rejouable côté serveur
// pour valider un résultat dans une version en ligne (anti-triche).

export interface Fighter {
  id: string;
  side: 0 | 1;
  name: string;
  speciesId?: string;
  bossId?: string;
  look: Appearance;
  elements: ElementId[];
  level: number;
  stage: Stage;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  skills: SkillDef[];
  cooldowns: Record<string, number>;
  charge: number;
  statuses: { id: StatusId; turns: number }[];
  gauge: number;
  isBoss?: boolean;
  monsterUid?: string;
  skin?: string;
  damageDealt: number;
}

export type BattleMode = 'campaign' | 'arena' | 'tournament' | 'boss';

export interface BattleEvent {
  kind: 'damage' | 'heal' | 'status' | 'ko' | 'miss' | 'stunned' | 'dot' | 'charge';
  source?: string;
  target: string;
  amount?: number;
  mult?: number;
  crit?: boolean;
  status?: StatusId;
}

export interface TurnResult {
  actor: string;
  skill: SkillDef | null;
  targets: string[];
  events: BattleEvent[];
}

export interface BattleState {
  mode: BattleMode;
  fighters: Fighter[];
  rng: number;
  turn: number;
  maxTurns: number;
  over: boolean;
  winner: 0 | 1 | null;
  log: TurnResult[];
  meta: Record<string, string | number>;
}

export interface FighterInit {
  name: string;
  speciesId?: string;
  bossId?: string;
  level: number;
  stage: Stage;
  monsterUid?: string;
  skin?: string;
  statMul?: number;
}

function rnd(b: BattleState): number {
  const [n, v] = mulberry32Step(b.rng);
  b.rng = n;
  return v;
}

export function makeFighter(init: FighterInit, side: 0 | 1, idx: number): Fighter {
  let look: Appearance, elements: ElementId[], st: { hp: number; atk: number; def: number; spd: number };
  if (init.bossId) {
    const bd = BOSSES.find((x) => x.id === init.bossId)!;
    look = bd.look; elements = bd.elements;
    const lv = 1 + (init.level - 1) * 0.08;
    st = { hp: bd.hp, atk: Math.round(bd.atk * lv), def: Math.round(bd.def * lv), spd: bd.spd };
  } else {
    const sp = SPECIES[init.speciesId!];
    look = sp.look; elements = sp.elements;
    st = monsterStats({ speciesId: sp.id, level: init.level, stage: init.stage });
  }
  const mul = init.statMul ?? 1;
  const hp = Math.round(st.hp * mul);
  return {
    id: `${side}-${idx}`, side, name: init.name, speciesId: init.speciesId, bossId: init.bossId, look, elements,
    level: init.level, stage: init.stage, maxHp: hp, hp, atk: Math.round(st.atk * mul), def: Math.round(st.def * (init.bossId ? 1 : Math.sqrt(mul))),
    spd: st.spd, skills: skillsFor(elements), cooldowns: {}, charge: init.bossId ? 40 : 0, statuses: [], gauge: 0,
    isBoss: !!init.bossId, monsterUid: init.monsterUid, skin: init.skin, damageDealt: 0,
  };
}

export function createBattle(mode: BattleMode, a: FighterInit[], b: FighterInit[], seed: number, maxTurns = 60): BattleState {
  return {
    mode, rng: seed >>> 0, turn: 0, maxTurns, over: false, winner: null, log: [], meta: {},
    fighters: [...a.map((f, i) => makeFighter(f, 0, i)), ...b.map((f, i) => makeFighter(f, 1, i))],
  };
}

export function alive(b: BattleState, side?: 0 | 1): Fighter[] {
  return b.fighters.filter((f) => f.hp > 0 && (side === undefined || f.side === side));
}

export function fighter(b: BattleState, id: string): Fighter {
  const f = b.fighters.find((x) => x.id === id);
  if (!f) throw new Error('fighter ' + id);
  return f;
}

function has(f: Fighter, s: StatusId): boolean {
  return f.statuses.some((x) => x.id === s);
}

function effSpd(f: Fighter): number {
  let s = f.spd;
  if (has(f, 'haste')) s *= 1.5;
  if (has(f, 'slow')) s *= 0.65;
  return s;
}

/** Fait avancer les jauges d'action et renvoie le prochain combattant à agir. */
export function nextActor(b: BattleState): Fighter | null {
  if (b.over) return null;
  const list = alive(b);
  if (!list.length) return null;
  for (let guard = 0; guard < 10000; guard++) {
    const ready = list.filter((f) => f.gauge >= 1000).sort((x, y) => y.gauge - x.gauge || x.id.localeCompare(y.id));
    if (ready.length) return ready[0];
    const step = Math.min(...list.map((f) => (1000 - f.gauge) / effSpd(f)));
    for (const f of list) f.gauge += effSpd(f) * Math.max(step, 0.01);
  }
  return list[0];
}

export function skillReady(f: Fighter, sk: SkillDef): boolean {
  if (sk.kind === 'ultimate') return f.charge >= ULTIMATE_CHARGE;
  return (f.cooldowns[sk.id] ?? 0) <= 0;
}

export function targetsFor(b: BattleState, actor: Fighter, sk: SkillDef, chosen?: string): Fighter[] {
  const foes = alive(b, (1 - actor.side) as 0 | 1);
  const allies = alive(b, actor.side);
  switch (sk.target) {
    case 'enemy': {
      const t = chosen ? foes.find((f) => f.id === chosen) : undefined;
      return [t ?? foes[0]].filter(Boolean) as Fighter[];
    }
    case 'allEnemies': return foes;
    case 'self': return [actor];
    case 'allAllies': return allies;
    case 'weakestAlly': return allies.slice().sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp).slice(0, 1);
  }
}

export function previewMultiplier(sk: SkillDef, target: Fighter): number {
  return elementMultiplier(sk.element, target.elements);
}

/** Applique l'action de `actor`. Retourne le détail pour l'animation. */
export function act(b: BattleState, actorId: string, skillId: string, targetId?: string): TurnResult {
  const actor = fighter(b, actorId);
  const res: TurnResult = { actor: actorId, skill: null, targets: [], events: [] };
  if (b.over || actor.hp <= 0) return res;
  b.turn += 1;
  actor.gauge = 0;

  // dégâts sur la durée en début de tour
  for (const st of actor.statuses) {
    if (st.id === 'burn' || st.id === 'poison') {
      const dmg = Math.max(1, Math.round(actor.maxHp * (st.id === 'burn' ? 0.06 : 0.05) * (actor.isBoss ? 0.25 : 1)));
      actor.hp = Math.max(0, actor.hp - dmg);
      res.events.push({ kind: 'dot', target: actor.id, amount: dmg, status: st.id });
    }
    if (st.id === 'regen') {
      const h = Math.round(actor.maxHp * 0.07);
      actor.hp = Math.min(actor.maxHp, actor.hp + h);
      res.events.push({ kind: 'heal', target: actor.id, amount: h });
    }
  }
  if (actor.hp <= 0) {
    res.events.push({ kind: 'ko', target: actor.id });
    endTurn(b, actor);
    b.log.push(res);
    return res;
  }
  const stunned = has(actor, 'stun');
  if (stunned) {
    res.events.push({ kind: 'stunned', target: actor.id });
    endTurn(b, actor);
    b.log.push(res);
    return res;
  }

  let sk = actor.skills.find((s) => s.id === skillId) ?? actor.skills[0];
  if (!skillReady(actor, sk)) sk = actor.skills[0];
  res.skill = sk;
  const targets = targetsFor(b, actor, sk, targetId);
  res.targets = targets.map((t) => t.id);

  for (const t of targets) {
    if (sk.power > 0 && t.side !== actor.side) {
      const mult = elementMultiplier(sk.element, t.elements);
      const crit = rnd(b) < 0.1;
      let atk = actor.atk;
      if (has(actor, 'weaken')) atk *= 0.7;
      let dmg = sk.power * atk * 3 * (60 / (60 + t.def)) * mult * (0.92 + rnd(b) * 0.16) * (crit ? 1.5 : 1);
      if (has(t, 'shield')) dmg *= 0.6;
      dmg = Math.max(1, Math.round(dmg));
      t.hp = Math.max(0, t.hp - dmg);
      actor.damageDealt += dmg;
      t.charge = Math.min(ULTIMATE_CHARGE, t.charge + 12);
      res.events.push({ kind: 'damage', source: actor.id, target: t.id, amount: dmg, mult, crit });
      if (t.hp <= 0) res.events.push({ kind: 'ko', target: t.id });
    }
    if (sk.status && t.hp > 0) {
      const target = sk.status.onSelf ? actor : t;
      const immune = target.isBoss && sk.status.id === 'stun';
      if (!immune && rnd(b) < sk.status.chance) {
        const ex = target.statuses.find((x) => x.id === sk.status!.id);
        if (ex) ex.turns = Math.max(ex.turns, sk.status.turns);
        else target.statuses.push({ id: sk.status.id, turns: sk.status.turns });
        res.events.push({ kind: 'status', source: actor.id, target: target.id, status: sk.status.id });
      }
    }
  }

  if (sk.heal) {
    const recipients = sk.power > 0 ? alive(b, actor.side) : targets.filter((t) => t.hp > 0);
    for (const h of recipients) {
      const amt = Math.round(h.maxHp * sk.heal);
      h.hp = Math.min(h.maxHp, h.hp + amt);
      res.events.push({ kind: 'heal', source: actor.id, target: h.id, amount: amt });
    }
  }

  if (sk.kind === 'ultimate') actor.charge = 0;
  else actor.charge = Math.min(ULTIMATE_CHARGE, actor.charge + (actor.isBoss ? 20 : 25));
  for (const k of Object.keys(actor.cooldowns)) actor.cooldowns[k] = Math.max(0, actor.cooldowns[k] - 1);
  if (sk.cooldown) actor.cooldowns[sk.id] = sk.cooldown;
  endTurn(b, actor);
  b.log.push(res);
  return res;
}

function endTurn(b: BattleState, actor: Fighter): void {
  actor.statuses = actor.statuses.map((s) => ({ ...s, turns: s.turns - 1 })).filter((s) => s.turns > 0);
  const a = alive(b, 0).length, c = alive(b, 1).length;
  if (a === 0 || c === 0) {
    b.over = true;
    b.winner = a > 0 ? 0 : 1;
  } else if (b.turn >= b.maxTurns) {
    b.over = true;
    // égalité : avantage au camp ayant le plus de PV en proportion (le boss n'est jamais vaincu par le temps)
    if (b.mode === 'boss') b.winner = 1;
    else {
      const ratio = (side: 0 | 1) => alive(b, side).reduce((s, f) => s + f.hp / f.maxHp, 0);
      b.winner = ratio(0) >= ratio(1) ? 0 : 1;
    }
  }
}

/** IA : choisit la meilleure action selon les éléments, PV et charges. */
export function aiChoose(b: BattleState, actorId: string): { skillId: string; targetId?: string } {
  const actor = fighter(b, actorId);
  const foes = alive(b, (1 - actor.side) as 0 | 1);
  const allies = alive(b, actor.side);
  const ready = actor.skills.filter((s) => skillReady(actor, s));
  let best = { score: -1, skillId: actor.skills[0].id, targetId: foes[0]?.id as string | undefined };
  for (const sk of ready) {
    if (sk.power > 0) {
      const cands = sk.target === 'enemy' ? foes : [foes[0]];
      for (const t of cands) {
        if (!t) continue;
        const group = sk.target === 'allEnemies' ? foes : [t];
        let score = 0;
        for (const g of group) {
          const dmg = sk.power * actor.atk * 3 * (60 / (60 + g.def)) * elementMultiplier(sk.element, g.elements);
          score += Math.min(dmg, g.hp) + (dmg >= g.hp ? 60 : 0);
        }
        if (sk.status) score *= 1.08;
        if (sk.heal) score += allies.reduce((s, a) => s + Math.min(a.maxHp - a.hp, a.maxHp * sk.heal!), 0) * 0.8;
        if (score > best.score) best = { score, skillId: sk.id, targetId: t.id };
      }
    } else {
      let score = 0;
      if (sk.heal) {
        const hurt = allies.reduce((s, a) => s + Math.min(a.maxHp - a.hp, a.maxHp * sk.heal!), 0);
        score = hurt * 1.2;
      }
      if (sk.status) {
        const need = sk.target === 'self' ? [actor] : allies;
        const missing = need.filter((a) => !has(a, sk.status!.id)).length;
        score += missing * actor.atk * 1.4;
      }
      if (score > best.score) best = { score, skillId: sk.id, targetId: undefined };
    }
  }
  return { skillId: best.skillId, targetId: best.targetId };
}

/** Résout un combat entièrement par l'IA (combats auto, simulations, tests). */
export function autoResolve(b: BattleState): BattleState {
  for (let i = 0; i < 1000 && !b.over; i++) {
    const f = nextActor(b);
    if (!f) break;
    const c = aiChoose(b, f.id);
    act(b, f.id, c.skillId, c.targetId);
  }
  return b;
}

// ————————————————————————————— Adversaires —————————————————————————————

export function campaignStageIndex(world: number, stage: number): number {
  return (world - 1) * STAGES_PER_WORLD + (stage - 1);
}

export function campaignEnemies(world: number, stage: number): FighterInit[] {
  const w = CAMPAIGN_WORLDS[world - 1];
  const idx = campaignStageIndex(world, stage);
  const rng = seededRng(hashString(`campaign:${world}:${stage}`));
  const level = Math.max(1, Math.round(1 + idx * 0.62));
  const stageSt: Stage = (idx < 8 ? 0 : idx < 22 ? 1 : idx < 42 ? 2 : 3) as Stage;
  const maxRar = Math.min(4, Math.floor(idx / 12) + 1);
  const pool = SPECIES_LIST.filter((s) => !s.exclusive && s.elements.every((e) => w.elements.includes(e)) && rarityIndex(s.rarity) <= maxRar);
  const count = idx < 2 ? 1 : idx < 5 ? 2 : 3;
  if (stage === STAGES_PER_WORLD) {
    const strongest = pool.slice().sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity))[0];
    return [
      { name: `Gardien ${strongest.name}`, speciesId: strongest.id, level: level + 2, stage: Math.min(3, stageSt + 1) as Stage, statMul: 2.2 },
      ...[0, 1].map(() => {
        const sp = pool[Math.floor(rng() * pool.length)];
        return { name: sp.name, speciesId: sp.id, level, stage: stageSt };
      }),
    ];
  }
  return Array.from({ length: count }, () => {
    const sp = pool[Math.floor(rng() * pool.length)];
    return { name: sp.name, speciesId: sp.id, level, stage: stageSt, statMul: idx < 3 ? 0.7 : 1 };
  });
}

export function campaignEnergyCost(world: number): number {
  return 3 + world;
}

export function arenaOpponents(seed: number, rating: number, refLevel: number): { name: string; rating: number; team: FighterInit[] }[] {
  const rng = seededRng(seed);
  const names = ['Lyra', 'Kaël', 'Nyx', 'Oskar', 'Mina', 'Taro', 'Zélie', 'Bram', 'Ilka', 'Rémi', 'Sora', 'Vasco'];
  const pool = SPECIES_LIST.filter((s) => !s.exclusive && rarityIndex(s.rarity) <= Math.min(4, 1 + Math.floor(rating / 400)));
  return [-80, 0, 90].map((delta, i) => {
    const r = Math.max(0, rating + delta + Math.round((rng() - 0.5) * 40));
    const lvl = Math.max(1, Math.round(refLevel + delta / 60 + (rng() - 0.5) * 2));
    const st: Stage = (lvl > 30 ? 3 : lvl > 20 ? 2 : lvl > 10 ? 1 : 0) as Stage;
    const team = [0, 1, 2].map(() => {
      const sp = pool[Math.floor(rng() * pool.length)];
      return { name: sp.name, speciesId: sp.id, level: Math.min(40, lvl), stage: st };
    });
    return { name: `${names[Math.floor(rng() * names.length)]}#${(seed % 900) + 100 + i}`, rating: r, team };
  });
}

export function tournamentEnemies(eventKey: string, round: number, refLevel: number): FighterInit[] {
  const rng = seededRng(hashString(`tournament:${eventKey}:${round}`));
  const pool = SPECIES_LIST.filter((s) => !s.exclusive && rarityIndex(s.rarity) <= Math.min(4, 1 + Math.floor(round / 2)));
  const lvl = Math.min(40, Math.max(1, Math.round(refLevel * (0.8 + round * 0.08))));
  const st: Stage = (lvl > 30 ? 3 : lvl > 20 ? 2 : lvl > 10 ? 1 : 0) as Stage;
  return [0, 1, 2].map(() => {
    const sp = pool[Math.floor(rng() * pool.length)];
    return { name: sp.name, speciesId: sp.id, level: lvl, stage: st, statMul: 1 + round * 0.05 };
  });
}

export const TOURNAMENT_ROUNDS = 8;
