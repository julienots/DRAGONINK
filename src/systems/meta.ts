import type { GameState, Reward, QuestEntry } from '../core/types';
import { assert, dayKey, weekKey, monthKey, hashString, shuffleSeeded } from '../core/util';
import {
  DAILY_POOL, WEEKLY_POOL, STORY_QUESTS, WEEKLY_CHEST, ACHIEVEMENTS, LOGIN_REWARDS, PASS_TIERS, PASS_XP_PER_TIER,
  passFreeReward, passPremiumReward, EVENTS, IAP, SKIN, type QuestDef,
} from '../data/progression';
import { SPECIES, SPECIES_LIST } from '../data/species';
import { RARITIES, rarityIndex } from '../data/elements';
import { CROPS, BUILDING } from '../data/world';
import { type Ctx, bump, spend, grant, computeStat } from './core';
import { currentEvent } from './time';

// ————————————————————————————— Quêtes —————————————————————————————

const QUEST_INDEX: Record<string, QuestDef> = Object.fromEntries([...DAILY_POOL, ...WEEKLY_POOL, ...STORY_QUESTS].map((q) => [q.id, q]));
export function questDef(id: string): QuestDef { return QUEST_INDEX[id]; }

export function refreshQuests(s: GameState, now: number): void {
  const dk = dayKey(now);
  if (s.quests.dailyKey !== dk) {
    const pick = shuffleSeeded(DAILY_POOL, hashString(dk + s.saveId)).slice(0, 5);
    s.quests.dailyKey = dk;
    s.quests.daily = pick.map((q) => ({ id: q.id, baseline: computeStat(s, q.stat), claimed: false }));
  }
  const wk = weekKey(now);
  if (s.quests.weeklyKey !== wk) {
    const pick = shuffleSeeded(WEEKLY_POOL, hashString(wk + s.saveId)).slice(0, 4);
    s.quests.weeklyKey = wk;
    s.quests.weekly = pick.map((q) => ({ id: q.id, baseline: computeStat(s, q.stat), claimed: false }));
    s.quests.weeklyChestClaimed = false;
  }
}

export function questProgress(s: GameState, q: QuestDef, entry?: QuestEntry): number {
  const v = computeStat(s, q.stat);
  if (q.absolute || !entry) return q.absolute ? v : v;
  return Math.max(0, v - entry.baseline);
}

export function storyQuests(s: GameState): QuestDef[] {
  return STORY_QUESTS.filter((q) => !s.quests.storyClaimed.includes(q.id)).slice(0, 3);
}

export function claimQuest(s: GameState, ctx: Ctx, kind: 'daily' | 'weekly' | 'story', id: string): Reward {
  const q = questDef(id);
  assert(q, 'Quête inconnue');
  if (kind === 'story') {
    assert(storyQuests(s).some((x) => x.id === id), 'Quête non disponible');
    assert(computeStat(s, q.stat) >= q.target, 'Quête non terminée');
    s.quests.storyClaimed.push(id);
  } else {
    const list = kind === 'daily' ? s.quests.daily : s.quests.weekly;
    const e = list.find((x) => x.id === id);
    assert(e, 'Quête non disponible');
    assert(!e.claimed, 'Récompense déjà réclamée');
    assert(questProgress(s, q, e) >= q.target, 'Quête non terminée');
    e.claimed = true;
  }
  bump(s, 'quests_done');
  grant(s, ctx, q.reward, `quest:${id}`);
  ctx.emit({ type: 'sfx', name: 'reward' });
  return q.reward;
}

export function claimWeeklyChest(s: GameState, ctx: Ctx): Reward {
  assert(!s.quests.weeklyChestClaimed, 'Coffre déjà ouvert');
  assert(s.quests.weekly.length > 0 && s.quests.weekly.every((q) => q.claimed), 'Termine toutes les quêtes hebdomadaires');
  s.quests.weeklyChestClaimed = true;
  grant(s, ctx, WEEKLY_CHEST, 'weekly_chest');
  return WEEKLY_CHEST;
}

// ————————————————————————————— Succès —————————————————————————————

export function claimAchievement(s: GameState, ctx: Ctx, id: string): Reward {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  assert(a, 'Succès inconnu');
  const tier = s.achievements[id] ?? 0;
  assert(tier < a.tiers.length, 'Succès terminé');
  assert(computeStat(s, a.stat) >= a.tiers[tier], 'Objectif non atteint');
  s.achievements[id] = tier + 1;
  grant(s, ctx, a.rewards[tier], `achievement:${id}`);
  ctx.emit({ type: 'sfx', name: 'reward' });
  return a.rewards[tier];
}

export function claimableCount(s: GameState): { quests: number; achievements: number; pass: number; event: number } {
  let quests = 0;
  for (const e of s.quests.daily) if (!e.claimed && questProgress(s, questDef(e.id), e) >= questDef(e.id).target) quests++;
  for (const e of s.quests.weekly) if (!e.claimed && questProgress(s, questDef(e.id), e) >= questDef(e.id).target) quests++;
  for (const q of storyQuests(s)) if (computeStat(s, q.stat) >= q.target) quests++;
  if (!s.quests.weeklyChestClaimed && s.quests.weekly.length && s.quests.weekly.every((q) => q.claimed)) quests++;
  let achievements = 0;
  for (const a of ACHIEVEMENTS) { const t = s.achievements[a.id] ?? 0; if (t < a.tiers.length && computeStat(s, a.stat) >= a.tiers[t]) achievements++; }
  const tier = passTier(s);
  let pass = 0;
  for (let i = 1; i <= tier; i++) {
    if (!s.pass.claimedFree.includes(i)) pass++;
    if (s.pass.premium && !s.pass.claimedPremium.includes(i)) pass++;
  }
  let event = 0;
  const ev = EVENTS.find((e) => s.event.eventKey.startsWith(e.id + '#'));
  if (ev) ev.milestones.forEach((m, i) => { if (s.event.points >= m.points && !s.event.claimed.includes(i)) event++; });
  return { quests, achievements, pass, event };
}

// ————————————————————————————— Connexion quotidienne —————————————————————————————

export function checkLogin(s: GameState, now: number): void {
  const dk = dayKey(now);
  if (s.login.lastDayKey === dk) return;
  const y = dayKey(now - 86400000);
  s.login.streak = s.login.lastDayKey === y ? s.login.streak + 1 : 1;
  s.login.cycleDay = s.login.lastDayKey ? (s.login.cycleDay + 1) % LOGIN_REWARDS.length : 0;
  s.login.lastDayKey = dk;
  s.login.pending = true;
  bump(s, 'logins');
}

export function claimLogin(s: GameState, ctx: Ctx): Reward {
  assert(s.login.pending, 'Récompense déjà réclamée aujourd’hui');
  s.login.pending = false;
  const base = LOGIN_REWARDS[s.login.cycleDay];
  const r: Reward = { ...base };
  if (s.login.streak >= 7 && r.coins) r.coins = Math.round(r.coins * 1.5);
  grant(s, ctx, r, 'login');
  ctx.emit({ type: 'sfx', name: 'reward' });
  return r;
}

// ————————————————————————————— Xala Pass —————————————————————————————

export function refreshPass(s: GameState, now: number): void {
  const k = monthKey(now);
  if (s.pass.seasonKey !== k) {
    s.pass = { seasonKey: k, xp: 0, premium: s.iap.entitlements.includes(`pass:${k}`), claimedFree: [], claimedPremium: [] };
  }
}

export function passTier(s: GameState): number {
  return Math.min(PASS_TIERS, Math.floor(s.pass.xp / PASS_XP_PER_TIER));
}

export function claimPass(s: GameState, ctx: Ctx, tier: number, premium: boolean): Reward {
  assert(tier >= 1 && tier <= PASS_TIERS, 'Palier invalide');
  assert(passTier(s) >= tier, 'Palier non atteint');
  if (premium) {
    assert(s.pass.premium, 'Nécessite le Xala Pass Premium');
    assert(!s.pass.claimedPremium.includes(tier), 'Déjà réclamé');
    s.pass.claimedPremium.push(tier);
    const r = passPremiumReward(tier);
    grant(s, ctx, r, 'pass');
    return r;
  }
  assert(!s.pass.claimedFree.includes(tier), 'Déjà réclamé');
  s.pass.claimedFree.push(tier);
  const r = passFreeReward(tier);
  grant(s, ctx, r, 'pass');
  return r;
}

/** Les gemmes permettent d'acheter des paliers (jamais nécessaire pour progresser). */
export function buyPassTier(s: GameState, ctx: Ctx): void {
  assert(passTier(s) < PASS_TIERS, 'Pass terminé');
  spend(s, { gems: 25 });
  s.pass.xp = (passTier(s) + 1) * PASS_XP_PER_TIER;
  ctx.emit({ type: 'sfx', name: 'reward' });
}

// ————————————————————————————— Événements —————————————————————————————

export function refreshEvent(s: GameState, now: number): void {
  const { key } = currentEvent(now);
  if (s.event.eventKey !== key) s.event = { eventKey: key, currency: 0, claimed: [], points: 0 };
}

export function claimEventMilestone(s: GameState, ctx: Ctx, i: number): Reward {
  const ev = currentEvent(ctx.now).def;
  assert(s.event.eventKey === currentEvent(ctx.now).key, 'Événement terminé');
  const m = ev.milestones[i];
  assert(m, 'Palier inconnu');
  assert(s.event.points >= m.points, 'Points insuffisants');
  assert(!s.event.claimed.includes(i), 'Déjà réclamé');
  s.event.claimed.push(i);
  grant(s, ctx, m.reward, 'event');
  ctx.emit({ type: 'sfx', name: 'reward' });
  return m.reward;
}

// ————————————————————————————— Boutique —————————————————————————————

export type ShopCategory = 'Xalamons' | 'Œufs' | 'Gems' | 'Nourriture' | 'Décorations' | 'Packs' | 'Événements' | 'Cosmétiques';

export interface ShopOffer {
  id: string;
  category: ShopCategory;
  name: string;
  icon: string;
  desc: string;
  price: { coins?: number; gems?: number; essence?: number; event?: number; iap?: string };
  reward: Reward;
  /** achats max par jour (0 = illimité) */
  limit: number;
  speciesId?: string;
  buildingId?: string;
  featured?: boolean;
  requiresLevel?: number;
}

function eggPrice(speciesId: string): { coins?: number; gems?: number } {
  const r = rarityIndex(SPECIES[speciesId].rarity);
  if (r === 0) return { coins: 400 };
  if (r === 1) return { coins: 2500 };
  if (r === 2) return { gems: 45 };
  if (r === 3) return { gems: 120 };
  return { gems: 300 };
}

/** Offres du jour : rotation déterministe (identique pour un même jour). */
export function shopOffers(s: GameState, now: number): ShopOffer[] {
  const dk = dayKey(now);
  const offers: ShopOffer[] = [];
  const pool = SPECIES_LIST.filter((x) => !x.exclusive && !x.recipe);
  const rot = shuffleSeeded(pool, hashString('rot:' + dk));
  // Œufs : base + rotation
  for (const id of ['braisou', 'feuillot', 'ondelin', 'zinzap', 'galetor', 'givrette', 'bourrasko', 'nocturo']) {
    offers.push({ id: `egg_${id}`, category: 'Œufs', name: `Œuf de ${SPECIES[id].name}`, icon: '🥚', desc: `Un œuf ${RARITIES[SPECIES[id].rarity].name}.`, price: eggPrice(id), reward: { eggs: [id] }, limit: 0, speciesId: id });
  }
  for (const sp of rot.filter((x) => rarityIndex(x.rarity) >= 1).slice(0, 4)) {
    offers.push({ id: `egg_rot_${sp.id}`, category: 'Œufs', name: `Œuf de ${sp.name}`, icon: '🥚', desc: 'Offre du jour', price: eggPrice(sp.id), reward: { eggs: [sp.id] }, limit: 2, speciesId: sp.id, featured: true });
  }
  offers.push({ id: 'egg_mystery', category: 'Œufs', name: 'Œuf Mystère', icon: '❔', desc: 'Peut contenir un Xalamon de Common à Mythic !', price: { gems: 30 }, reward: { eggs: ['__random_mystery'] }, limit: 5 });
  // Xalamons directs (adolescents)
  for (const sp of rot.slice(4, 7)) {
    const p = eggPrice(sp.id);
    offers.push({ id: `mon_${sp.id}`, category: 'Xalamons', name: sp.name, icon: '🐲', desc: 'Livré directement niveau 10, prêt au combat.', price: p.coins ? { coins: p.coins * 6 } : { gems: Math.round((p.gems ?? 0) * 2.2) }, reward: {}, limit: 1, speciesId: sp.id, featured: true });
  }
  offers.push({ id: 'mon_superessia', category: 'Xalamons', name: 'Superessia', icon: '🌟', desc: 'Xalamon Celestial, incarnation de la SuperEssence.', price: { essence: 30 }, reward: { eggs: ['superessia'] }, limit: 1, speciesId: 'superessia', requiresLevel: 15 });
  // Gems (achats intégrés)
  for (const p of Object.values(IAP).filter((p) => p.sku.startsWith('gems_'))) {
    offers.push({ id: `iap_${p.sku}`, category: 'Gems', name: p.name, icon: p.icon, desc: p.bonusLabel ?? '', price: { iap: p.sku }, reward: p.reward, limit: 0 });
  }
  // Nourriture
  for (const c of CROPS) {
    offers.push({ id: `food_${c.id}`, category: 'Nourriture', name: `${c.name} ×${c.yield * 3}`, icon: c.icon, desc: `${c.xp} XP par portion`, price: { coins: c.cost * 5 }, reward: { items: { [c.id]: c.yield * 3 } }, limit: 0, requiresLevel: c.unlockLevel });
  }
  offers.push({ id: 'food_festin', category: 'Nourriture', name: 'Festin Cosmique ×2', icon: '🍱', desc: '1 500 XP chacun', price: { gems: 20 }, reward: { items: { festin: 2 } }, limit: 3 });
  offers.push({ id: 'iap_food_pack', category: 'Nourriture', name: IAP.food_pack.name, icon: '🍱', desc: '5 Festins + 10 Galettes', price: { iap: 'food_pack' }, reward: IAP.food_pack.reward, limit: 0 });
  // Décorations (renvoient vers le mode construction)
  for (const d of Object.values(BUILDING).filter((b) => b.kind === 'deco' && !b.requiresUnlock)) {
    offers.push({ id: `deco_${d.id}`, category: 'Décorations', name: d.name, icon: d.icon, desc: d.desc, price: d.cost, reward: {}, limit: 0, buildingId: d.id, requiresLevel: d.unlockLevel });
  }
  // Packs
  for (const sku of ['starter_pack', 'event_pack']) {
    const p = IAP[sku];
    offers.push({ id: `iap_${sku}`, category: 'Packs', name: p.name, icon: p.icon, desc: p.bonusLabel ?? 'Ressources variées', price: { iap: sku }, reward: p.reward, limit: 0 });
  }
  offers.push({ id: 'pack_energy', category: 'Packs', name: 'Recharge d’Énergie', icon: '⚡', desc: '+60 XalaEnergy', price: { gems: 12 }, reward: { energy: 60 }, limit: 5 });
  offers.push({ id: 'pack_coins', category: 'Packs', name: 'Sac de XalaCoins', icon: '🪙', desc: '+25 000 XalaCoins', price: { gems: 40 }, reward: { coins: 25000 }, limit: 3 });
  offers.push({ id: 'pack_essence', category: 'Packs', name: 'Fiole de SuperEssence', icon: '🌟', desc: '+1 SuperEssence (limitée)', price: { gems: 150 }, reward: { essence: 1 }, limit: 1, requiresLevel: 8 });
  // Événement
  const ev = currentEvent(now).def;
  offers.push({ id: `ev_egg_${ev.exclusiveSpecies}`, category: 'Événements', name: `Œuf de ${SPECIES[ev.exclusiveSpecies].name}`, icon: ev.icon, desc: 'Exclusif à l’événement', price: { event: 350 }, reward: { eggs: [ev.exclusiveSpecies] }, limit: 1, speciesId: ev.exclusiveSpecies, featured: true });
  offers.push({ id: `ev_deco_${ev.deco}`, category: 'Événements', name: BUILDING[ev.deco].name, icon: BUILDING[ev.deco].icon, desc: 'Décoration exclusive', price: { event: 120 }, reward: { unlocks: [ev.deco] }, limit: 1 });
  offers.push({ id: 'ev_energy', category: 'Événements', name: 'Énergie du Festival', icon: '⚡', desc: '+30 XalaEnergy', price: { event: 40 }, reward: { energy: 30 }, limit: 5 });
  offers.push({ id: 'ev_gems', category: 'Événements', name: 'Gemmes du Festival', icon: '💎', desc: '+10 XalaGems', price: { event: 90 }, reward: { gems: 10 }, limit: 3 });
  offers.push({ id: 'iap_event_pack', category: 'Événements', name: IAP.event_pack.name, icon: '🎉', desc: '+200 gemmes, +150 monnaie', price: { iap: 'event_pack' }, reward: IAP.event_pack.reward, limit: 0 });
  // Cosmétiques
  for (const sk of Object.values(SKIN)) {
    if (sk.gemCost) offers.push({ id: `skin_${sk.id}`, category: 'Cosmétiques', name: sk.name, icon: '🎨', desc: 'Teinte cosmétique pour un Xalamon', price: { gems: sk.gemCost }, reward: { unlocks: [sk.id] }, limit: 1 });
  }
  offers.push({ id: 'iap_cosmetic_aurora', category: 'Cosmétiques', name: IAP.cosmetic_aurora.name, icon: '🌈', desc: 'Cosmétique uniquement', price: { iap: 'cosmetic_aurora' }, reward: IAP.cosmetic_aurora.reward, limit: 0 });
  return offers;
}

export function buyOffer(s: GameState, ctx: Ctx, offerId: string, createDirect: (speciesId: string) => void): Reward {
  const offer = shopOffers(s, ctx.now).find((o) => o.id === offerId);
  assert(offer, 'Offre expirée');
  assert(!offer.price.iap, 'Achat intégré : passe par le magasin');
  assert(!offer.buildingId, 'Les décorations se placent depuis le mode Construction');
  if (offer.requiresLevel) assert(s.player.level >= offer.requiresLevel, `Niveau ${offer.requiresLevel} requis`);
  const dk = dayKey(ctx.now);
  if (s.shop.dayKey !== dk) s.shop = { dayKey: dk, bought: {} };
  const n = s.shop.bought[offerId] ?? 0;
  assert(!offer.limit || n < offer.limit, 'Limite d’achat atteinte pour aujourd’hui');
  if ((offer.reward.unlocks ?? []).length) assert(!offer.reward.unlocks!.every((u) => s.unlocks.includes(u)), 'Déjà possédé');
  if (offer.price.event) {
    refreshEvent(s, ctx.now);
    assert(s.event.currency >= offer.price.event, 'Pas assez de monnaie d’événement', 'funds');
  }
  spend(s, { coins: offer.price.coins, gems: offer.price.gems, essence: offer.price.essence });
  if (offer.price.event) s.event.currency -= offer.price.event;
  s.shop.bought[offerId] = n + 1;
  if (offer.category === 'Xalamons' && !offer.reward.eggs) createDirect(offer.speciesId!);
  grant(s, ctx, offer.reward, `shop:${offerId}`);
  bump(s, 'shop_purchases');
  ctx.emit({ type: 'sfx', name: 'buy' });
  return offer.reward;
}

// ————————————————————————————— Achats intégrés —————————————————————————————

export interface PurchaseReceipt {
  orderId: string;
  sku: string;
  purchaseToken: string;
  purchaseTime: number;
  /** signature du magasin, vérifiée par le serveur dans la version en ligne */
  signature?: string;
  source: 'play' | 'mock';
}

/**
 * Accorde un achat UNE seule fois (protection contre les doubles récompenses).
 * Retourne false si la commande a déjà été traitée.
 */
export function grantPurchase(s: GameState, ctx: Ctx, rc: PurchaseReceipt): boolean {
  const p = IAP[rc.sku];
  assert(p, 'Produit inconnu');
  assert(rc.orderId && rc.purchaseToken, 'Reçu invalide');
  if (s.iap.processedOrders.includes(rc.orderId)) return false;
  if (p.type === 'non_consumable' && s.iap.entitlements.includes(entitlementFor(rc.sku, ctx.now))) {
    s.iap.processedOrders.push(rc.orderId);
    return false;
  }
  s.iap.processedOrders.push(rc.orderId);
  if (s.iap.processedOrders.length > 500) s.iap.processedOrders.splice(0, s.iap.processedOrders.length - 500);
  s.iap.pending = s.iap.pending.filter((x) => x !== rc.orderId);
  if (p.type === 'non_consumable') s.iap.entitlements.push(entitlementFor(rc.sku, ctx.now));
  if (rc.sku === 'xala_pass_premium') {
    refreshPass(s, ctx.now);
    s.pass.premium = true;
  }
  grant(s, ctx, p.reward, `iap:${rc.sku}`);
  bump(s, 'iap_purchases');
  ctx.emit({ type: 'reward', reward: p.reward, title: p.name });
  return true;
}

export function entitlementFor(sku: string, now: number): string {
  return sku === 'xala_pass_premium' ? `pass:${monthKey(now)}` : sku;
}

/** Restauration : réapplique les droits non consommables manquants. */
export function restorePurchases(s: GameState, ctx: Ctx, owned: PurchaseReceipt[]): number {
  let restored = 0;
  for (const rc of owned) {
    const p = IAP[rc.sku];
    if (!p || p.type !== 'non_consumable') continue;
    const ent = rc.sku === 'xala_pass_premium' ? `pass:${monthKey(rc.purchaseTime)}` : rc.sku;
    if (s.iap.entitlements.includes(ent)) continue;
    s.iap.entitlements.push(ent);
    if (!s.iap.processedOrders.includes(rc.orderId)) s.iap.processedOrders.push(rc.orderId);
    if (rc.sku === 'xala_pass_premium' && ent === `pass:${monthKey(ctx.now)}`) s.pass.premium = true;
    for (const u of p.reward.unlocks ?? []) if (!s.unlocks.includes(u)) s.unlocks.push(u);
    restored++;
  }
  return restored;
}

export function iapAvailable(s: GameState, sku: string, now: number): boolean {
  const p = IAP[sku];
  if (!p) return false;
  if (p.type === 'non_consumable') return !s.iap.entitlements.includes(entitlementFor(sku, now));
  return true;
}
