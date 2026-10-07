import type { App } from '../app';
import { SPECIES, SPECIES_LIST, STAGE_NAMES, BASE_SPECIES_BY_ELEMENT } from '../../data/species';
import { ELEMENTS, RARITIES, RARITY_ORDER } from '../../data/elements';
import { CROP, BUILDING } from '../../data/world';
import { ACHIEVEMENTS, LOGIN_REWARDS, PASS_TIERS, PASS_XP_PER_TIER, passFreeReward, passPremiumReward, IAP, playerXpForLevel, type QuestDef } from '../../data/progression';
import { shopOffers, questDef, questProgress, storyQuests, passTier, iapAvailable, type ShopCategory } from '../../systems/meta';
import { computeStat } from '../../systems/core';
import { currentEvent } from '../../systems/time';
import { fmtNum, msUntilNextDay, msUntilNextWeek, dayKey } from '../../core/util';
import { html, esc, onActions, priceHtml, rewardInline, rarityChip, elChips } from '../dom';
import { portrait, eggPortrait, Showcase } from '../../render/showcase';
import { audio } from '../../audio/audio';
import { StoreError, type StoreProvider, MockStore } from '../../platform/store';
import { profileFor, type QualityLevel } from '../../platform/quality';
import { startBuild } from './buildings';
import { skillsFor } from '../../data/skills';
import type { GameState } from '../../core/types';

export function registerMetaPanels(app: App): void {
  app.routes.shop = (d) => openShop(app, d.cat as ShopCategory | undefined);
  app.routes.quests = () => openQuests(app);
  app.routes.achievements = () => openAchievements(app);
  app.routes.pass = () => openPass(app);
  app.routes.event = () => openEvent(app);
  app.routes.daily = () => openDaily(app);
  app.routes.codex = () => openCodex(app);
  app.routes.settings = () => openSettings(app);
  app.routes.profile = () => openProfile(app);
  if (app.store instanceof MockStore) {
    app.store.confirm = (sku) => new Promise((resolve) => {
      const p = IAP[sku];
      app.openSheet({ title: 'Achat (mode test)', modal: true, noAutoRefresh: true, onClose: () => resolve(false), render: (body, sheet) => {
        body.innerHTML = `<p style="text-align:center"><span style="font-size:44px">${p.icon}</span><br><b>${esc(p.name)}</b><br>${esc(p.price)}</p>
          <p class="muted" style="text-align:center">Magasin de test : aucun paiement réel. Dans l’APK Play Store, Google Play Billing gère le paiement.</p>
          <div class="row"><button class="btn gray wide" data-act="no">Annuler</button><button class="btn green wide" data-act="yes">Confirmer</button></div>`;
        onActions(body, (a) => { sheet.opts.onClose = undefined; sheet.close(); resolve(a === 'yes'); });
      } });
    });
  }
}

/** Achat intégré robuste : récompense sauvegardée AVANT confirmation au magasin. */
export async function buyIap(app: App, sku: string): Promise<void> {
  const store: StoreProvider = app.store;
  const p = IAP[sku];
  if (!iapAvailable(app.game.state, sku, app.game.now())) { app.toast('Déjà possédé', 'info'); return; }
  try {
    const rc = await store.purchase(sku);
    const granted = app.game.tryAct('iap.grant', { receipt: rc });
    if (!granted.ok) return;
    if (!app.game.saveNow()) throw new StoreError('unknown', 'Sauvegarde impossible : achat conservé en attente');
    await store.finish(rc, p.type === 'consumable');
    if (!granted.value) app.toast('Achat déjà pris en compte', 'info');
  } catch (e) {
    const err = e as StoreError;
    if (err.code === 'cancelled') app.toast('Achat annulé', 'info');
    else if (err.code === 'pending') app.toast('Paiement en attente : la récompense arrivera dès validation.', 'info');
    else app.toast(err.message || 'Erreur lors de l’achat', 'bad');
  }
}

/** Au démarrage : réapplique les achats payés mais non finalisés (crash, coupure…). */
export async function reconcilePurchases(app: App): Promise<void> {
  try {
    await app.store.init();
    const pending = await app.store.pendingPurchases();
    for (const rc of pending) {
      app.game.tryAct('iap.grant', { receipt: rc });
      if (app.game.saveNow()) await app.store.finish(rc, IAP[rc.sku]?.type === 'consumable');
    }
  } catch { /* magasin indisponible : on réessaiera au prochain lancement */ }
}

const SHOP_CATS: ShopCategory[] = ['Œufs', 'Xalamons', 'Gems', 'Nourriture', 'Décorations', 'Packs', 'Événements', 'Cosmétiques'];

function openShop(app: App, cat?: ShopCategory): void {
  const g = app.game;
  app.openSheet({
    title: 'Boutique', tabs: SHOP_CATS, tab: cat && SHOP_CATS.includes(cat) ? cat : 'Œufs',
    render: (body, sheet) => {
      const s = g.state;
      const now = g.now();
      const offers = shopOffers(s, now).filter((o) => o.category === sheet.tab);
      const ev = currentEvent(now);
      body.innerHTML = `<div class="muted" style="text-align:center;margin-bottom:6px">Nouvelles offres dans <span data-until="${now + msUntilNextDay(now)}"></span>${sheet.tab === 'Événements' ? ` · ${ev.def.icon} ${esc(ev.def.currency)} : <b>${s.event.currency}</b>` : ''}</div>
        ${app.store.isTest && (sheet.tab === 'Gems' || sheet.tab === 'Packs') ? '<div class="card muted" style="text-align:center;margin-bottom:8px">Mode test : les achats réels passent par Google Play dans l’application Android.</div>' : ''}
        <div class="grid g2">${offers.map((o) => {
          const n = s.shop.dayKey === dayKey(now) ? s.shop.bought[o.id] ?? 0 : 0;
          const soldOut = !!o.limit && n >= o.limit;
          const locked = o.requiresLevel && s.player.level < o.requiresLevel;
          const owned = (o.reward.unlocks ?? []).length > 0 && o.reward.unlocks!.every((u) => s.unlocks.includes(u));
          const iapOwned = o.price.iap && !iapAvailable(s, o.price.iap, now);
          const img = o.speciesId ? (o.category === 'Xalamons' && !o.reward.eggs ? portrait(o.speciesId, 1) : eggPortrait(o.speciesId)) : '';
          let price = '';
          if (o.price.iap) price = esc(IAP[o.price.iap].price);
          else if (o.price.event) price = `${ev.def.currencyIcon} ${o.price.event}`;
          else price = priceHtml(o.price);
          return `<div class="offer ${o.featured ? 'featured' : ''}">${o.featured ? '<span class="ribbon">DU JOUR</span>' : ''}
            <div class="ico">${img ? `<img src="${img}">` : o.icon}</div><div class="nm">${esc(o.name)}</div>
            <div class="ds">${o.speciesId ? `${rarityChip(SPECIES[o.speciesId].rarity)}` : esc(o.desc)}</div>
            ${o.limit ? `<div class="muted" style="font-size:10px">${Math.max(0, o.limit - n)}/${o.limit} restant(s)</div>` : ''}
            ${locked ? `<button class="btn gray small" disabled>Niv. ${o.requiresLevel}</button>`
              : owned || iapOwned ? '<button class="btn gray small" disabled>Possédé</button>'
              : soldOut ? '<button class="btn gray small" disabled>Épuisé</button>'
              : `<button class="btn ${o.price.iap ? 'purple' : o.price.gems ? 'purple' : o.price.essence ? 'essence' : 'green'} small" data-act="buy" data-id="${o.id}">${price}</button>`}
          </div>`;
        }).join('')}</div>
        ${sheet.tab === 'Gems' || sheet.tab === 'Packs' || sheet.tab === 'Cosmétiques' ? '<div style="text-align:center;margin-top:12px"><button class="btn gray small" data-act="restore">🔄 Restaurer les achats</button></div>' : ''}
        <p class="muted" style="text-align:center;font-size:11px">Tout le contenu du jeu est accessible sans payer. Les achats accélèrent simplement la progression.</p>`;
      onActions(body, async (a, d) => {
        if (a === 'restore') { await restore(app); return; }
        if (a !== 'buy') return;
        const o = offers.find((x) => x.id === d.id)!;
        if (o.price.iap) { await buyIap(app, o.price.iap); return; }
        if (o.buildingId) { app.closeAllSheets(); startBuild(app, o.buildingId, app.world.focusIsland); return; }
        const r = app.act('shop.buy', { offerId: o.id });
        if (r) {
          if (o.category === 'Xalamons' && !o.reward.eggs) app.toast(`${SPECIES[o.speciesId!].name} a rejoint ton archipel !`, 'good');
          else app.showReward('Achat réussi', r);
        }
      });
    },
  });
}

async function restore(app: App): Promise<void> {
  try {
    const owned = await app.store.owned();
    const n = app.act('iap.restore', { owned });
    app.game.saveNow();
    app.toast(n ? `${n} achat(s) restauré(s)` : 'Aucun achat à restaurer', n ? 'good' : 'info');
  } catch (e) {
    app.toast((e as Error).message || 'Restauration impossible', 'bad');
  }
}

function questRow(app: App, q: QuestDef, kind: 'daily' | 'weekly' | 'story', claimed: boolean, prog: number): string {
  const done = prog >= q.target;
  return `<div class="card ${done && !claimed ? 'hl' : ''}"><div class="row"><div class="spacer"><b>${esc(q.text)}</b><br><span class="muted">${rewardInline(q.reward)}</span></div>
    ${claimed ? '<span class="muted">✅</span>' : done ? `<button class="btn gold small" data-act="claim" data-kind="${kind}" data-id="${q.id}">Réclamer</button>` : `<span class="muted">${fmtNum(Math.min(prog, q.target))}/${fmtNum(q.target)}</span>`}</div>
    <div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, (prog / q.target) * 100)}%"></i></div></div>`;
}

function openQuests(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Quêtes', tabs: ['Progression', 'Quotidiennes', 'Hebdomadaires'],
    render: (body, sheet) => {
      const s = g.state;
      const now = g.now();
      if (sheet.tab === 'Progression') {
        const list = storyQuests(s);
        body.innerHTML = `<p class="muted" style="text-align:center">Ta feuille de route d’éleveur : construis, fais éclore, nourris, combats !</p>${list.map((q) => questRow(app, q, 'story', false, computeStat(s, q.stat))).join('') || '<div class="card">🏆 Toutes les quêtes de progression sont terminées !</div>'}`;
      } else if (sheet.tab === 'Quotidiennes') {
        body.innerHTML = `<div class="muted" style="text-align:center">Renouvelées dans <span data-until="${now + msUntilNextDay(now)}"></span></div>${s.quests.daily.map((e) => questRow(app, questDef(e.id), 'daily', e.claimed, questProgress(s, questDef(e.id), e))).join('')}`;
      } else {
        const allDone = s.quests.weekly.every((q) => q.claimed);
        body.innerHTML = `<div class="muted" style="text-align:center">Renouvelées dans <span data-until="${now + msUntilNextWeek(now)}"></span></div>${s.quests.weekly.map((e) => questRow(app, questDef(e.id), 'weekly', e.claimed, questProgress(s, questDef(e.id), e))).join('')}
          <div class="card ${allDone && !s.quests.weeklyChestClaimed ? 'hl' : ''}" style="text-align:center"><div style="font-size:40px">🧰</div><b>Coffre hebdomadaire</b><br><span class="muted">Termine toutes les quêtes de la semaine : 💎15, 🌟1, Œuf Rare</span><br>
          <button class="btn gold small" style="margin-top:6px" data-act="chest" ${allDone && !s.quests.weeklyChestClaimed ? '' : 'disabled'}>${s.quests.weeklyChestClaimed ? 'Ouvert ✅' : 'Ouvrir'}</button></div>`;
      }
      onActions(body, (a, d) => {
        if (a === 'claim') { const r = app.act('quest.claim', { kind: d.kind as 'daily', id: d.id! }); if (r) app.showReward('Quête terminée !', r); }
        if (a === 'chest') { const r = app.act('quest.chest'); if (r) app.showReward('Coffre hebdomadaire', r); }
      });
    },
  });
}

function openAchievements(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Succès',
    render: (body) => {
      const s = g.state;
      body.innerHTML = ACHIEVEMENTS.map((a) => {
        const tier = s.achievements[a.id] ?? 0;
        const doneAll = tier >= a.tiers.length;
        const target = a.tiers[Math.min(tier, a.tiers.length - 1)];
        const v = computeStat(s, a.stat);
        const can = !doneAll && v >= target;
        return `<div class="card ${can ? 'hl' : ''}"><div class="row"><span style="font-size:30px">${a.icon}</span><div class="spacer"><b>${esc(a.name)}</b> <span class="muted">${'★'.repeat(tier)}${'☆'.repeat(a.tiers.length - tier)}</span><br>
          <span class="muted">${doneAll ? 'Terminé !' : `Objectif : ${fmtNum(target)} · Récompense : ${rewardInline(a.rewards[tier])}`}</span></div>
          ${can ? `<button class="btn gold small" data-act="claim" data-id="${a.id}">Réclamer</button>` : `<span class="muted">${fmtNum(Math.min(v, target))}/${fmtNum(target)}</span>`}</div>
          <div class="bar ev" style="margin-top:6px"><i style="width:${doneAll ? 100 : Math.min(100, (v / target) * 100)}%"></i></div></div>`;
      }).join('');
      onActions(body, (a, d) => { if (a === 'claim') { const r = app.act('achievement.claim', { id: d.id! }); if (r) app.showReward('Succès débloqué !', r); } });
    },
  });
}

function openPass(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Xala Pass',
    render: (body) => {
      const s = g.state;
      const tier = passTier(s);
      const now = g.now();
      const end = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 1).getTime();
      body.innerHTML = `<div class="card hl" style="text-align:center"><b style="font-size:18px">Saison ${esc(s.pass.seasonKey)}</b> · se termine dans <span data-until="${end}"></span>
        <div class="row" style="margin-top:6px"><b>Palier ${tier}/${PASS_TIERS}</b><div class="bar xp spacer"><i style="width:${tier >= PASS_TIERS ? 100 : ((s.pass.xp % PASS_XP_PER_TIER) / PASS_XP_PER_TIER) * 100}%"></i></div><span class="muted">${s.pass.xp % PASS_XP_PER_TIER}/${PASS_XP_PER_TIER}</span></div>
        <p class="muted" style="margin:6px 0">Gagne de l’XP de Pass avec les quêtes quotidiennes et hebdomadaires.</p>
        <div class="row">${s.pass.premium ? '<span class="rar" style="--rc:#ff7bf1">✨ PREMIUM ACTIF</span>' : `<button class="btn purple wide" data-act="premium">✨ Passer Premium · ${esc(IAP.xala_pass_premium.price)}</button>`}
        <button class="btn small" data-act="tier" ${tier >= PASS_TIERS ? 'disabled' : ''}>+1 palier · 💎25</button></div></div>
        <div class="pass-row" style="margin-top:10px"><div></div><b style="text-align:center">Gratuit</b><b style="text-align:center;color:#ff9ad1">Premium</b></div>
        ${Array.from({ length: PASS_TIERS }, (_, i) => {
          const t = i + 1;
          const reached = tier >= t;
          const fr = passFreeReward(t), pr = passPremiumReward(t);
          const fc = s.pass.claimedFree.includes(t), pc = s.pass.claimedPremium.includes(t);
          return `<div class="pass-row"><div class="pass-tier ${reached ? 'reached' : ''}">${t}</div>
            <div class="pass-cell ${fc ? 'claimed' : ''}">${rewardInline(fr)}${reached && !fc ? `<button class="btn gold small" data-act="claim" data-t="${t}" data-p="0">Prendre</button>` : fc ? '✅' : ''}</div>
            <div class="pass-cell premium ${pc ? 'claimed' : ''} ${s.pass.premium ? '' : 'lock'}">${rewardInline(pr)}${reached && !pc && s.pass.premium ? `<button class="btn purple small" data-act="claim" data-t="${t}" data-p="1">Prendre</button>` : pc ? '✅' : s.pass.premium ? '' : '🔒'}</div></div>`;
        }).join('')}`;
      onActions(body, async (a, d) => {
        if (a === 'premium') await buyIap(app, 'xala_pass_premium');
        if (a === 'tier') app.act('pass.buyTier');
        if (a === 'claim') { const r = app.act('pass.claim', { tier: Number(d.t), premium: d.p === '1' }); if (r) app.showReward(`Palier ${d.t}`, r); }
      });
    },
  });
}

function openEvent(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Événement',
    render: (body) => {
      const s = g.state;
      const now = g.now();
      const ev = currentEvent(now);
      const sp = SPECIES[ev.def.exclusiveSpecies];
      body.innerHTML = `<div class="world-card" style="--wc:${ev.def.color};text-align:center"><div style="font-size:50px">${ev.def.icon}</div><b style="font-size:20px" class="txt-stroke">${esc(ev.def.name)}</b><br>
        <span>${esc(ev.def.desc)}</span><br><span class="muted">Se termine dans <span data-until="${now + ev.endsInMs}"></span></span></div>
        <div class="card row"><img src="${portrait(sp.id, 2)}" style="width:80px;height:80px"><div class="spacer"><b>Xalamon exclusif : ${esc(sp.name)}</b><br>${rarityChip(sp.rarity)}<br><span class="muted">À gagner au palier 400 ou dans la boutique de l’événement.</span></div></div>
        <div class="card" style="text-align:center">${ev.def.currencyIcon} <b>${esc(ev.def.currency)}</b> : ${s.event.currency} disponibles · ${s.event.points} points cumulés
          <p class="muted" style="margin:4px 0">Gagne-en en récoltant, nourrissant, faisant éclore, combattant et avec les quêtes.</p>
          <button class="btn small" data-act="shop">🛍️ Boutique de l’événement</button></div>
        <div class="section-title">Paliers</div>
        ${ev.def.milestones.map((m, i) => {
          const ok = s.event.points >= m.points;
          const cl = s.event.claimed.includes(i);
          return `<div class="card ${ok && !cl ? 'hl' : ''} row"><b style="width:52px">${m.points}</b><div class="spacer">${rewardInline(m.reward)}</div>
            ${cl ? '✅' : ok ? `<button class="btn gold small" data-act="claim" data-i="${i}">Réclamer</button>` : `<div class="bar ev" style="width:70px"><i style="width:${Math.min(100, (s.event.points / m.points) * 100)}%"></i></div>`}</div>`;
        }).join('')}
        <div class="section-title">Missions</div><div class="card muted">Les quêtes quotidiennes et hebdomadaires rapportent aussi de la monnaie d’événement. Le Tournoi ⚔️ de la semaine est lié à l’événement.</div>
        <button class="btn red wide" style="margin-top:8px" data-act="tournament">🏆 Tournoi de l’événement</button>`;
      onActions(body, (a, d) => {
        if (a === 'claim') { const r = app.act('event.claim', { index: Number(d.i) }); if (r) app.showReward('Récompense d’événement', r); }
        if (a === 'shop') app.routes.shop?.({ cat: 'Événements' });
        if (a === 'tournament') { app.closeAllSheets(); app.routes.combat?.({ tab: 'Tournoi' }); }
      });
    },
  });
}

function openDaily(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Cadeau quotidien', modal: true,
    render: (body, sheet) => {
      const s = g.state;
      body.innerHTML = `<p class="muted" style="text-align:center">Connecte-toi chaque jour ! Série actuelle : <b>${s.login.streak}</b> jour(s)${s.login.streak >= 7 ? ' (bonus +50 % 🪙)' : ''}</p>
        <div class="grid g3">${LOGIN_REWARDS.map((r, i) => `<div class="card ${i === s.login.cycleDay ? 'hl' : ''}" style="text-align:center;padding:6px;${i < s.login.cycleDay || (i === s.login.cycleDay && !s.login.pending) ? 'opacity:.5' : ''}"><b>Jour ${i + 1}</b><div style="font-size:13px;margin-top:4px">${rewardInline(r)}</div></div>`).join('')}</div>
        <button class="btn gold wide" style="margin-top:10px" data-act="claim" ${s.login.pending ? '' : 'disabled'}>${s.login.pending ? '🎁 Récupérer' : 'Reviens demain !'}</button>`;
      onActions(body, () => { const r = app.act('login.claim'); if (r) { sheet.close(); app.showReward(`Jour ${g.state.login.cycleDay + 1}`, r); } });
    },
  });
}

function openCodex(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Xalamon Codex', tabs: ['Tous', ...RARITY_ORDER.map((r) => RARITIES[r].name)],
    render: (body, sheet) => {
      const s = g.state;
      const list = SPECIES_LIST.filter((sp) => sheet.tab === 'Tous' || RARITIES[sp.rarity].name === sheet.tab);
      const owned = SPECIES_LIST.filter((sp) => s.codex[sp.id]?.owned).length;
      body.innerHTML = `<div class="card" style="text-align:center"><b>${owned}/${SPECIES_LIST.length}</b> espèces découvertes<div class="bar ev" style="margin-top:6px"><i style="width:${(owned / SPECIES_LIST.length) * 100}%"></i></div></div>
        <div class="grid g3" style="margin-top:8px">${list.map((sp) => {
          const c = s.codex[sp.id];
          const known = !!c?.owned;
          return `<div class="codex-card ${known ? '' : 'unknown'}" data-act="sp" data-id="${sp.id}" style="border-color:${known ? RARITIES[sp.rarity].color : 'rgba(255,255,255,.12)'}">
            <img loading="lazy" src="${portrait(sp.id, known ? c.maxStage : 2, { silhouette: !known })}"><div class="nm">${known ? esc(sp.name) : c?.seen ? esc(sp.name) + ' ?' : '???'}</div></div>`;
        }).join('')}</div>`;
      onActions(body, (a, d) => { if (a === 'sp') openSpecies(app, d.id!); });
    },
  });
}

function openSpecies(app: App, id: string): void {
  const g = app.game;
  const hero = html('<div class="detail-hero"></div>');
  let sc: Showcase | null = null;
  let stage = 0;
  app.openSheet({
    title: 'Codex', noAutoRefresh: true, onClose: () => sc?.dispose(), onBack: undefined,
    render: (body, sheet) => {
      const s = g.state;
      const sp = SPECIES[id];
      const c = s.codex[id];
      const known = !!c?.owned;
      body.innerHTML = '';
      if (!known) {
        body.innerHTML = `<div style="text-align:center"><img src="${portrait(id, 2, { silhouette: true, size: 240 })}" style="width:200px;height:200px"><h3>???</h3><p class="muted">Cette créature n’a pas encore été découverte.</p>
          <p class="muted">Indice : ${sp.exclusive === 'event' ? 'apparaît lors d’un événement spécial.' : sp.exclusive === 'pass' ? 'récompense ultime du Xala Pass.' : sp.exclusive === 'shop' ? 'liée à la précieuse SuperEssence…' : sp.recipe ? `recette d’élevage spéciale : ${sp.recipe.map((gr) => gr.map((e) => ELEMENTS[e].icon).join('/')).join(' + ')}` : `élevage de Xalamons ${sp.elements.map((e) => ELEMENTS[e].name).join(' + ')}.`}</p></div>`;
        return;
      }
      sc ??= new Showcase(hero);
      sc.showSpecies(id, stage);
      body.appendChild(hero);
      const st = skillsFor(sp.elements);
      const parents = Object.entries(s.breedLog).filter(([, v]) => v.includes(id)).map(([k]) => k.split('+').map((x) => SPECIES[x]?.name ?? x).join(' + '));
      body.appendChild(html(`<div>
        <div class="tabs" style="padding:8px 0">${[0, 1, 2, 3].map((i) => `<button class="tab ${i === stage ? 'on' : ''}" data-act="stage" data-i="${i}">${STAGE_NAMES[i]}</button>`).join('')}</div>
        <div class="row"><b style="font-size:22px" class="spacer txt-stroke">${esc(sp.name)}</b>${rarityChip(sp.rarity)}</div>
        <div style="margin:6px 0">${elChips(sp.elements)}</div>
        <div class="statgrid"><div class="stat"><b>${sp.stats.hp}</b><span>PV base</span></div><div class="stat"><b>${sp.stats.atk}</b><span>Attaque</span></div><div class="stat"><b>${sp.stats.def}</b><span>Défense</span></div><div class="stat"><b>${sp.stats.spd}</b><span>Vitesse</span></div></div>
        <div class="card" style="margin-top:8px">🏠 Habitat : ${sp.elements.map((e) => `${ELEMENTS[e].icon} ${esc(BUILDING['habitat_' + e].name)}`).join(' ou ')}<br>🍖 Nourriture préférée : ${CROP[sp.favoriteCrop].icon} ${esc(CROP[sp.favoriteCrop].name)}<br>
          🪙 Production : ${RARITIES[sp.rarity].income}/min au niveau 1<br>✨ Évolution : ${STAGE_NAMES.join(' → ')}<br>⚔️ Compétences : ${st.map((k) => esc(k.name)).join(', ')}
          ${parents.length ? `<br>🧬 Obtenu par : ${parents.map(esc).join(' · ')}` : ''}</div>
        <div class="section-title">Histoire</div><div class="card">${esc(sp.lore)}<br><span class="muted">${esc(ELEMENTS[sp.elements[0]].lore)}</span></div></div>`));
      onActions(body, (a, d) => { if (a === 'stage') { stage = Number(d.i); sheet.refresh(); } });
    },
  });
}

function openProfile(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Profil', modal: true,
    render: (body) => {
      const s = g.state;
      const owned = SPECIES_LIST.filter((sp) => s.codex[sp.id]?.owned).length;
      body.innerHTML = `<div style="text-align:center"><img src="${portrait(BASE_SPECIES_BY_ELEMENT.flamme, 1)}" style="width:96px;height:96px"><h3 style="margin:2px">${esc(s.playerName)}</h3>
        <p>Niveau <b>${s.player.level}</b> · ${s.player.xp}/${playerXpForLevel(s.player.level)} XP</p></div>
        <div class="statgrid"><div class="stat"><b>${s.monsters.length}</b><span>Xalamons</span></div><div class="stat"><b>${owned}</b><span>Espèces</span></div><div class="stat"><b>${Object.values(s.islands).filter((i) => i.unlocked).length}</b><span>Îles</span></div><div class="stat"><b>${s.stats.battles_won ?? 0}</b><span>Victoires</span></div></div>
        <div class="statgrid" style="margin-top:6px"><div class="stat"><b>${s.stats.harvests ?? 0}</b><span>Récoltes</span></div><div class="stat"><b>${s.stats.hatches ?? 0}</b><span>Éclosions</span></div><div class="stat"><b>${s.stats.breeds ?? 0}</b><span>Élevages</span></div><div class="stat"><b>${s.stats.evolutions ?? 0}</b><span>Évolutions</span></div></div>
        <button class="btn wide" style="margin-top:10px" data-act="rename">✏️ Changer de nom</button>`;
      onActions(body, async () => { const n = await app.promptText('Nom d’éleveur', s.playerName); if (n !== null) app.ok('player.rename', { name: n }); });
    },
  });
}

function openSettings(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Paramètres',
    render: (body) => {
      const s = g.state;
      const q = s.settings.quality;
      body.innerHTML = `
        <div class="setting"><label>Qualité graphique</label><div class="seg">${(['auto', 'low', 'medium', 'high', 'ultra'] as const).map((l) => `<button class="${q === l ? 'on' : ''}" data-act="q" data-v="${l}">${l === 'auto' ? 'AUTO' : l.toUpperCase()}</button>`).join('')}</div></div>
        <div class="muted" style="font-size:12px;padding:0 4px">Actuel : ${app.qualityLevel.toUpperCase()} · résolution ×${profileFor(app.qualityLevel).pixelRatio.toFixed(2)} · ombres ${profileFor(app.qualityLevel).shadows ? 'oui' : 'non'}. L’anticrénelage s’applique au prochain lancement.</div>
        <div class="setting"><label>🎵 Musique</label><input type="range" min="0" max="1" step="0.05" value="${s.settings.music}" data-r="music"></div>
        <div class="setting"><label>🔊 Effets sonores</label><input type="range" min="0" max="1" step="0.05" value="${s.settings.sfx}" data-r="sfx"></div>
        <div class="setting"><label>📳 Vibrations</label><div class="seg"><button class="${s.settings.vibration ? 'on' : ''}" data-act="vib" data-v="1">Oui</button><button class="${!s.settings.vibration ? 'on' : ''}" data-act="vib" data-v="0">Non</button></div></div>
        <div class="setting"><label>Afficher les FPS</label><div class="seg"><button class="${s.settings.showFps ? 'on' : ''}" data-act="fps" data-v="1">Oui</button><button class="${!s.settings.showFps ? 'on' : ''}" data-act="fps" data-v="0">Non</button></div></div>
        <div class="section-title">Sauvegarde</div>
        <div class="card muted" style="font-size:12px">Sauvegarde automatique locale (double emplacement + secours). Dernière : révision ${s.revision}${g.saver.lastError ? ` · <b style="color:#ff8a96">${esc(g.saver.lastError)}</b>` : ''}</div>
        <div class="row wrap" style="margin-top:8px"><button class="btn small" data-act="save">💾 Sauvegarder</button><button class="btn small" data-act="export">📤 Exporter</button><button class="btn small" data-act="import">📥 Importer</button></div>
        <div class="section-title">Achats</div>
        <div class="row wrap"><button class="btn small" data-act="restore">🔄 Restaurer les achats</button><span class="muted">${esc(app.store.name)}</span></div>
        <div class="section-title">Compte & en ligne</div>
        <div class="card muted" style="font-size:12px">Version locale. L’architecture (actions validées, journal d’actions, combats rejouables, horloge serveur) est prête pour : comptes, sauvegarde cloud, PvP, classements et événements serveur.</div>
        <div class="section-title">Zone dangereuse</div>
        <button class="btn red small" data-act="reset">🗑️ Recommencer une partie</button>
        <div style="text-align:center;margin-top:20px" class="muted">XalaMonsters v${__APP_VERSION__} · <b style="background:linear-gradient(90deg,#8a5cff,#5cf2ff);-webkit-background-clip:text;background-clip:text;color:transparent">SUPERESSENCE</b><br>Créatures, musiques et sons originaux · Police Fredoka (OFL)</div>`;
      body.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) => r.addEventListener('change', () => {
        const k = r.dataset.r as 'music' | 'sfx';
        g.setSetting(k, Number(r.value));
        audio.setVolumes(g.state.settings.music, g.state.settings.sfx);
        audio.sfx('click');
      }));
      onActions(body, async (a, d) => {
        if (a === 'q') {
          const v = d.v as GameState['settings']['quality'];
          g.setSetting('quality', v);
          app.setQuality(v === 'auto' ? (await import('../../platform/quality')).detectQuality() : (v as QualityLevel));
        }
        if (a === 'vib') g.setSetting('vibration', d.v === '1');
        if (a === 'fps') g.setSetting('showFps', d.v === '1');
        if (a === 'save') app.toast(g.saveNow() ? 'Partie sauvegardée' : 'Échec de la sauvegarde', g.saver.lastError ? 'bad' : 'good');
        if (a === 'export') {
          const code = g.saver.exportString(g.state);
          app.openSheet({ title: 'Exporter', modal: true, render: (b2) => {
            b2.innerHTML = `<p class="muted">Copie ce code et garde-le en lieu sûr :</p><textarea readonly>${esc(code)}</textarea><button class="btn wide" data-act="copy">📋 Copier</button>`;
            onActions(b2, async () => { try { await navigator.clipboard.writeText(code); app.toast('Copié !', 'good'); } catch { (b2.querySelector('textarea') as HTMLTextAreaElement).select(); } });
          } });
        }
        if (a === 'import') {
          const code = await app.promptText('Colle ton code de sauvegarde', '', true);
          if (!code) return;
          try { g.replaceState(g.saver.importString(code, g.now())); app.closeAllSheets(); app.toast('Sauvegarde importée', 'good'); app.world.focus('verdante', true); }
          catch (e) { app.toast((e as Error).message, 'bad'); }
        }
        if (a === 'restore') await restore(app);
        if (a === 'reset') {
          const v = await app.promptText('Tape RECOMMENCER pour effacer ta partie', '');
          if (v === 'RECOMMENCER') { g.saver.wipe(); location.reload(); }
        }
      });
    },
  });
}

