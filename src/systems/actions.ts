import type { GameState, IslandId } from '../core/types';
import type { Ctx } from './core';
import * as B from './buildings';
import * as P from './production';
import * as N from './nurture';
import * as M from './monsters';
import * as C from './combat';
import * as X from './meta';
import type { BattleState, BattleMode } from './battle';

// Registre des actions joueur. Toute mutation de l'état passe par une action
// nommée et sérialisable : une future version en ligne enverra ces mêmes
// actions au serveur, qui les rejouera de façon autoritaire.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (s: GameState, ctx: Ctx, a: any) => unknown;

export const ACTIONS = {
  'building.build': (s, c, a: { defId: string; island: IslandId; x: number; y: number }) => B.build(s, c, a.defId, a.island, a.x, a.y).uid,
  'building.move': (s, _c, a: { uid: string; x: number; y: number }) => B.moveBuilding(s, a.uid, a.x, a.y),
  'building.upgrade': (s, c, a: { uid: string }) => B.upgrade(s, c, a.uid),
  'building.speedup': (s, c, a: { uid: string }) => B.speedUpBuilding(s, c, a.uid),
  'building.remove': (s, c, a: { uid: string }) => B.removeBuilding(s, c, a.uid),
  'island.unlock': (s, c, a: { id: IslandId }) => B.unlockIsland(s, c, a.id),
  'island.upgrade': (s, c, a: { id: IslandId }) => B.upgradeIsland(s, c, a.id),
  'production.collect': (s, c, a: { uid: string }) => P.collect(s, c, a.uid),
  'production.collectAll': (s, c) => P.collectAll(s, c),
  'farm.plant': (s, c, a: { uid: string; cropId: string }) => N.plant(s, c, a.uid, a.cropId),
  'farm.harvest': (s, c, a: { uid: string }) => N.harvest(s, c, a.uid),
  'farm.speedup': (s, c, a: { uid: string }) => N.speedUpCrop(s, c, a.uid),
  'kitchen.cook': (s, c, a: { uid: string; recipeId: string }) => N.cook(s, c, a.uid, a.recipeId),
  'kitchen.collect': (s, c, a: { uid: string }) => N.collectDish(s, c, a.uid),
  'nursery.place': (s, c, a: { uid: string; eggUid: string }) => N.placeEgg(s, c, a.uid, a.eggUid),
  'nursery.hatch': (s, c, a: { uid: string; slot: number }) => N.hatch(s, c, a.uid, a.slot),
  'nursery.speedup': (s, c, a: { uid: string; slot: number }) => N.speedUpEgg(s, c, a.uid, a.slot),
  'egg.sell': (s, c, a: { eggUid: string }) => N.sellEgg(s, c, a.eggUid),
  'breeding.start': (s, c, a: { uid: string; a: string; b: string }) => N.startBreeding(s, c, a.uid, a.a, a.b),
  'breeding.collect': (s, c, a: { uid: string }) => N.collectBreeding(s, c, a.uid),
  'breeding.speedup': (s, c, a: { uid: string }) => N.speedUpBreeding(s, c, a.uid),
  'monster.feed': (s, c, a: { uid: string; item: string; count: number }) => M.feed(s, c, a.uid, a.item, a.count),
  'monster.evolve': (s, c, a: { uid: string }) => M.evolve(s, c, a.uid),
  'monster.move': (s, _c, a: { uid: string; habitat: string | null }) => M.moveMonster(s, a.uid, a.habitat),
  'monster.sell': (s, c, a: { uid: string }) => M.sellMonster(s, c, a.uid),
  'monster.rename': (s, _c, a: { uid: string; name: string }) => M.rename(s, a.uid, a.name),
  'monster.skin': (s, _c, a: { uid: string; skin: string | null }) => M.applySkin(s, a.uid, a.skin),
  'team.set': (s, _c, a: { uids: string[] }) => M.setTeam(s, a.uids),
  'battle.start': (s, c, a: { mode: BattleMode; ref: string }) => C.startBattle(s, c, a.mode, a.ref),
  'battle.finish': (s, c, a: { battle: BattleState }) => C.finishBattle(s, c, a.battle),
  'battle.abandon': (s) => C.abandonBattle(s),
  'arena.daily': (s, c) => C.claimArenaDaily(s, c),
  'quest.claim': (s, c, a: { kind: 'daily' | 'weekly' | 'story'; id: string }) => X.claimQuest(s, c, a.kind, a.id),
  'quest.chest': (s, c) => X.claimWeeklyChest(s, c),
  'achievement.claim': (s, c, a: { id: string }) => X.claimAchievement(s, c, a.id),
  'login.claim': (s, c) => X.claimLogin(s, c),
  'pass.claim': (s, c, a: { tier: number; premium: boolean }) => X.claimPass(s, c, a.tier, a.premium),
  'pass.buyTier': (s, c) => X.buyPassTier(s, c),
  'event.claim': (s, c, a: { index: number }) => X.claimEventMilestone(s, c, a.index),
  'shop.buy': (s, c, a: { offerId: string }) => X.buyOffer(s, c, a.offerId, (sp) => { M.createMonster(s, c, sp, { level: 10, stage: 1 }); }),
  'iap.grant': (s, c, a: { receipt: X.PurchaseReceipt }) => X.grantPurchase(s, c, a.receipt),
  'iap.restore': (s, c, a: { owned: X.PurchaseReceipt[] }) => X.restorePurchases(s, c, a.owned),
  'tutorial.step': (s, _c, a: { step: number }) => { s.tutorialStep = Math.max(s.tutorialStep, a.step); },
  'player.rename': (s, _c, a: { name: string }) => { s.playerName = a.name.replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Éleveur'; },
} satisfies Record<string, Handler>;

export type ActionName = keyof typeof ACTIONS;
export type ActionArgs<K extends ActionName> = Parameters<(typeof ACTIONS)[K]>[2];
export type ActionResult<K extends ActionName> = ReturnType<(typeof ACTIONS)[K]>;
