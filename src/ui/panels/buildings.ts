import type { App } from '../app';
import type { IslandId, BuildingInstance } from '../../core/types';
import { BUILDING, BUILDINGS, CROPS, RECIPES, ISLANDS, ISLAND_ORDER, HABITAT_CAPACITY, HABITAT_COIN_CAP, upgradeCost, upgradeSeconds, islandUpgradeCost, islandMaxBuildings, nurserySlots, type BuildingKind } from '../../data/world';
import { SPECIES } from '../../data/species';
import { ELEMENTS } from '../../data/elements';
import { buildCost, canBuildHere, findFreeSpot, speedUpCost, buildingsOnIsland } from '../../systems/buildings';
import { habitatRate, storedCap } from '../../systems/production';
import { habitatResidents, displayName } from '../../systems/monsters';
import { farmYield, cropDurationMs } from '../../systems/nurture';
import { fmtNum, fmtDuration } from '../../core/util';
import { esc, onActions, priceHtml } from '../dom';
import { audio } from '../../audio/audio';
import { WEATHER_INFO } from '../../data/world';
import { weatherAt } from '../../systems/time';

const CATS: { name: string; kinds: BuildingKind[] }[] = [
  { name: 'Habitats', kinds: ['habitat'] },
  { name: 'Production', kinds: ['farm', 'kitchen', 'energy', 'essence', 'storage'] },
  { name: 'Spéciaux', kinds: ['nursery', 'breeding', 'monument'] },
  { name: 'Décorations', kinds: ['deco'] },
];

export function registerBuildingPanels(app: App): void {
  const g = app.game;
  const B = (uid: string) => g.state.buildings.find((b) => b.uid === uid);

  app.routes.build = (d) => openBuildMenu(app, d.cat);

  app.routes.collect = (d) => {
    const got = app.act('production.collect', { uid: d.uid! });
    const p = app.world.buildingWorldPos(d.uid!);
    if (got && p) { app.floatAtWorld(p, `+${fmtNum(got)}`, '#ffe14d'); app.world.fx.burst(p, '#ffd36b', { count: 18 }); }
  };
  app.routes.harvest = (d) => {
    const n = app.act('farm.harvest', { uid: d.uid! });
    const p = app.world.buildingWorldPos(d.uid!);
    if (n && p) { app.floatAtWorld(p, `+${n}`, '#7af08e'); app.world.fx.burst(p, '#7af08e', { count: 16 }); }
  };
  app.routes.speedupCrop = (d) => {
    const b = B(d.uid!);
    if (!b?.crop) return;
    confirmGems(app, speedUpCost(b.crop.readyAt - g.now()), () => app.act('farm.speedup', { uid: d.uid! }));
  };
  app.routes.speedup = (d) => {
    const b = B(d.uid!);
    if (!b?.busyKind) return;
    confirmGems(app, speedUpCost(b.busyUntil - g.now()), () => app.act('building.speedup', { uid: d.uid! }));
  };
  app.routes.plant = (d) => openPlant(app, d.uid!);
  app.routes.cook = (d) => openKitchen(app, d.uid!);
  app.routes.collectDish = (d) => { if (app.ok('kitchen.collect', { uid: d.uid! })) app.toast('Plat prêt ! Utilise-le pour nourrir tes Xalamons.', 'good'); };
  app.routes.upgrade = (d) => openUpgrade(app, d.uid!);
  app.routes.info = (d) => openInfo(app, d.uid!);
  app.routes.habitat = (d) => openInfo(app, d.uid!);
  app.routes.move = (d) => {
    const b = B(d.uid!);
    if (!b) return;
    app.select(null);
    app.world.startPlacement(b.defId, b.islandId, b.x, b.y, b.uid);
    app.renderPlacementBar(true, () => {
      const p = app.world.placing!;
      if (app.ok('building.move', { uid: b.uid, x: p.x, y: p.y })) {
        app.world.cancelPlacement();
        app.renderPlacementBar(false);
        app.refreshAll();
      }
    }, 'Déplacer');
  };
  app.routes.islands = () => openIslands(app);
}

function confirmGems(app: App, cost: number, run: () => void): void {
  app.openSheet({
    title: 'Accélérer', modal: true,
    render: (body, sheet) => {
      body.innerHTML = `<p style="text-align:center">Terminer immédiatement pour <b>💎 ${cost}</b> XalaGems ?</p><div class="row"><button class="btn gray wide" data-act="no">Non</button><button class="btn purple wide" data-act="yes">💎 ${cost}</button></div>`;
      onActions(body, (a) => { sheet.close(); if (a === 'yes') run(); });
    },
  });
}

export function openBuildMenu(app: App, cat?: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Construire', tabs: CATS.map((c) => c.name), tab: cat && CATS.some((c) => c.name === cat) ? cat : 'Habitats',
    render: (body, sheet) => {
      const s = g.state;
      const island = app.world.focusIsland;
      const c = CATS.find((x) => x.name === sheet.tab)!;
      const defs = BUILDINGS.filter((b) => c.kinds.includes(b.kind) && b.kind !== 'arena' && (!b.requiresUnlock || s.unlocks.includes(b.requiresUnlock)));
      const used = buildingsOnIsland(s, island).filter((b) => BUILDING[b.defId].kind !== 'deco').length;
      body.innerHTML = `<div class="muted" style="text-align:center;margin-bottom:8px">Sur <b>${esc(ISLANDS[island].name)}</b> · ${used}/${islandMaxBuildings(s.islands[island].level)} bâtiments</div>
        <div class="grid g2">${defs.map((d) => {
          const why = canBuildHere(s, d.id, island);
          const cost = buildCost(s, d.id);
          return `<div class="offer ${why ? '' : 'featured'}">
            <div class="ico">${d.icon}</div><div class="nm">${esc(d.name)}</div>
            <div class="ds">${esc(d.desc)}</div>
            <div class="muted" style="font-size:11px">${d.size}×${d.size} · ${d.buildSeconds ? '⏱ ' + fmtDuration(d.buildSeconds * 1000) : 'Instantané'}</div>
            ${why ? `<button class="btn gray small" disabled>🔒 ${esc(why)}</button>` : `<button class="btn green small" data-act="pick" data-id="${d.id}">${priceHtml(cost)}</button>`}
          </div>`;
        }).join('')}</div>`;
      onActions(body, (a, d) => {
        if (a !== 'pick') return;
        audio.sfx('click');
        sheet.close();
        startBuild(app, d.id!, island);
      });
    },
  });
}

export function startBuild(app: App, defId: string, island: IslandId): void {
  const g = app.game;
  const def = BUILDING[defId];
  const spot = findFreeSpot(g.state, island, def.size);
  if (!spot) { app.toast('Plus de place sur cette île : améliore-la ou change d’île', 'bad'); return; }
  app.select(null);
  app.world.startPlacement(defId, island, spot.x, spot.y);
  app.renderPlacementBar(true, () => {
    const p = app.world.placing!;
    const uid = app.act('building.build', { defId, island: p.island, x: p.x, y: p.y });
    if (uid) {
      app.world.cancelPlacement();
      app.renderPlacementBar(false);
      app.refreshAll();
      app.select(uid);
      if (def.kind === 'habitat') app.toast(`${def.name} en construction ! Les Xalamons ${def.element === 'any' ? '' : ELEMENTS[def.element as keyof typeof ELEMENTS]?.name ?? ''} pourront s’y installer.`, 'good');
    }
  }, 'Construire');
}

function openPlant(app: App, uid: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Planter', modal: true,
    render: (body, sheet) => {
      const s = g.state;
      const b = s.buildings.find((x) => x.uid === uid);
      if (!b) { sheet.close(); return; }
      const w = weatherAt(b.islandId, g.now());
      body.innerHTML = `<div class="muted" style="text-align:center">Météo : ${WEATHER_INFO[w].icon} ${esc(WEATHER_INFO[w].bonus)}</div>
        ${CROPS.map((c) => {
          const locked = s.player.level < c.unlockLevel;
          return `<div class="card row">
            <div style="font-size:34px">${c.icon}</div>
            <div class="spacer"><b>${esc(c.name)}</b> <span class="muted">(${esc(c.category)})</span><br>
            <span class="muted">⏱ ${fmtDuration(cropDurationMs(s, b.islandId, c.id, g.now()))} · ${farmYield(s, b.level, c.id, b.islandId, g.now())} portions · ${c.xp} XP/portion${c.bonus?.energy ? ` · +${c.bonus.energy}⚡` : ''}</span><br>
            <span class="muted">En stock : ${s.items[c.id] ?? 0}</span></div>
            ${locked ? `<button class="btn gray small" disabled>Niv. ${c.unlockLevel}</button>` : `<button class="btn green small" data-act="plant" data-id="${c.id}">🪙 ${fmtNum(c.cost)}</button>`}
          </div>`;
        }).join('')}`;
      onActions(body, (a, d) => {
        if (a !== 'plant') return;
        if (app.ok('farm.plant', { uid, cropId: d.id! })) {
          sheet.close();
          const p = app.world.buildingWorldPos(uid);
          if (p) app.world.fx.burst(p, '#7af08e', { count: 12, up: 2 });
        }
      });
    },
  });
}

function openKitchen(app: App, uid: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Cuisine Xala', modal: true,
    render: (body, sheet) => {
      const s = g.state;
      body.innerHTML = `<p class="muted" style="text-align:center">Transforme tes récoltes en plats très nourrissants.</p>
        ${RECIPES.map((r) => {
          const locked = s.player.level < r.unlockLevel;
          const ok = Object.entries(r.input).every(([k, n]) => (s.items[k] ?? 0) >= n);
          return `<div class="card row"><div style="font-size:34px">${r.icon}</div>
            <div class="spacer"><b>${esc(r.name)}</b> · <span class="muted">${fmtNum(r.xp)} XP · ⏱ ${fmtDuration(r.seconds * 1000)}</span><br>
            <span class="muted">${Object.entries(r.input).map(([k, n]) => `${CROPS.find((c) => c.id === k)?.icon ?? ''}${s.items[k] ?? 0}/${n}`).join(' · ')}</span></div>
            ${locked ? `<button class="btn gray small" disabled>Niv. ${r.unlockLevel}</button>` : `<button class="btn ${ok ? 'green' : 'gray'} small" data-act="cook" data-id="${r.id}" ${ok ? '' : 'disabled'}>Cuisiner</button>`}</div>`;
        }).join('')}`;
      onActions(body, (a, d) => {
        if (a === 'cook' && app.ok('kitchen.cook', { uid, recipeId: d.id! })) sheet.close();
      });
    },
  });
}

function openUpgrade(app: App, uid: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Amélioration', modal: true,
    render: (body, sheet) => {
      const b = g.state.buildings.find((x) => x.uid === uid);
      if (!b) { sheet.close(); return; }
      const def = BUILDING[b.defId];
      const to = b.level + 1;
      const cost = upgradeCost(def, to);
      const reqLvl = def.unlockLevel + (to - 1) * 2;
      let gain = '';
      if (def.kind === 'habitat') gain = `Capacité ${HABITAT_CAPACITY[b.level]} → <b>${HABITAT_CAPACITY[to]}</b> Xalamons<br>Stockage ${fmtNum(HABITAT_COIN_CAP[b.level])} → <b>${fmtNum(HABITAT_COIN_CAP[to])}</b> 🪙`;
      else if (def.kind === 'nursery') gain = `Emplacements ${nurserySlots(b.level)} → <b>${nurserySlots(to)}</b>`;
      else if (def.kind === 'farm') gain = `Récoltes +25 %`;
      else if (def.kind === 'storage') gain = `Capacité de XalaCoins +150 000`;
      else if (def.kind === 'energy' || def.kind === 'essence') gain = `Production et stockage augmentés`;
      else if (def.kind === 'kitchen') gain = `Cuisson plus rapide`;
      else if (def.kind === 'breeding') gain = `Élevage 10 % plus rapide`;
      else if (def.kind === 'monument') gain = `+${def.bonus} % de production globale`;
      body.innerHTML = `<div style="text-align:center"><div style="font-size:50px">${def.icon}</div><h3 style="margin:4px 0">${esc(def.name)} : niveau ${b.level} → ${to}</h3>
        <p>${gain}</p><p class="muted">⏱ ${fmtDuration(upgradeSeconds(def, to) * 1000)}${g.state.player.level < reqLvl ? ` · <b style="color:#ff8a96">Niveau joueur ${reqLvl} requis</b>` : ''}</p>
        ${cost.essence ? '<p class="muted">Les améliorations avancées demandent de la 🌟 SuperEssence.</p>' : ''}
        <button class="btn green wide" data-act="up">⬆️ ${priceHtml(cost)}</button></div>`;
      onActions(body, () => { if (app.ok('building.upgrade', { uid })) { sheet.close(); app.toast('Amélioration lancée !', 'good'); } });
    },
  });
}

function openInfo(app: App, uid: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Informations',
    render: (body, sheet) => {
      const s = g.state;
      const b = s.buildings.find((x) => x.uid === uid) as BuildingInstance | undefined;
      if (!b) { sheet.close(); return; }
      const def = BUILDING[b.defId];
      let extra = '';
      if (def.kind === 'habitat') {
        const res = habitatResidents(s, uid);
        const rate = habitatRate(s, b, g.now());
        extra = `<div class="section-title">Habitants (${res.length}/${HABITAT_CAPACITY[b.level]})</div>
          <div class="grid g3">${res.map((m) => `<div class="mcard" style="--rc:${ELEMENTS[SPECIES[m.speciesId].elements[0]].color}" data-act="mon" data-uid="${m.uid}"><span class="lv">Niv.${m.level}</span><img src="${app.portrait(m.speciesId, m.stage, m.skin)}"><div class="nm">${esc(displayName(m))}</div></div>`).join('')}
          ${res.length < HABITAT_CAPACITY[b.level] ? `<div class="mcard" style="--rc:#666;display:flex;align-items:center;justify-content:center;min-height:120px" data-act="add">➕<br>Ajouter</div>` : ''}</div>
          <div class="section-title">Production</div><div class="card">🪙 ${fmtNum(rate)} / minute · Stock ${fmtNum(b.stored)}/${fmtNum(storedCap(b))}</div>`;
      }
      if (def.kind === 'farm' && b.crop) extra = `<div class="card">${CROPS.find((c) => c.id === b.crop!.cropId)?.icon} En croissance : <span data-until="${b.crop.readyAt}"></span><div class="bar" style="margin-top:6px"><i data-from="${b.crop.plantedAt}" data-to="${b.crop.readyAt}"></i></div></div>`;
      body.innerHTML = `<div style="text-align:center"><div style="font-size:54px">${def.icon}</div><h3 style="margin:2px 0">${esc(def.name)} · Niv. ${b.level}/${def.maxLevel}</h3><p class="muted">${esc(def.desc)}</p>
        <p class="muted">${esc(ISLANDS[b.islandId].name)} · ${def.size}×${def.size}</p></div>${extra}
        ${['deco', 'farm', 'habitat', 'kitchen', 'storage', 'energy'].includes(def.kind) ? '<div style="margin-top:14px"><button class="btn red small" data-act="remove">🗑️ Retirer (remboursement 25 %)</button></div>' : ''}`;
      onActions(body, (a, d) => {
        if (a === 'mon') app.routes.monster?.({ uid: d.uid! });
        if (a === 'add') app.routes.xalamons?.({ habitat: uid });
        if (a === 'remove' && app.ok('building.remove', { uid })) { sheet.close(); app.select(null); }
      });
    },
  });
}

export function openIslands(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Archipel',
    render: (body, sheet) => {
      const s = g.state;
      body.innerHTML = ISLAND_ORDER.map((id) => {
        const isl = ISLANDS[id];
        const st = s.islands[id];
        const w = weatherAt(id, g.now());
        const n = buildingsOnIsland(s, id).length;
        const up = islandUpgradeCost(st.level);
        return `<div class="world-card" style="--wc:${isl.ground}">
          <div class="row"><div class="spacer"><b style="font-size:17px" class="txt-stroke">${esc(isl.name)}</b><br><span class="muted">${esc(isl.subtitle)} · ${isl.affinity.map((e) => ELEMENTS[e].icon).join('')} +15 %</span></div>
          ${st.unlocked ? `<span class="rar" style="--rc:#ffd36b">Niv. ${st.level}</span>` : ''}</div>
          ${st.unlocked ? `<div class="muted" style="margin:6px 0">${WEATHER_INFO[w].icon} ${esc(WEATHER_INFO[w].name)} — ${esc(WEATHER_INFO[w].bonus)} · ${n} bâtiments</div>
            <div class="row"><button class="btn green small" data-act="go" data-id="${id}">✈️ Visiter</button>
            ${st.level < 10 ? `<button class="btn small" data-act="up" data-id="${id}">⬆️ Niv. ${st.level + 1} · ${priceHtml(up)}</button>` : ''}</div>`
          : `<div class="muted" style="margin:6px 0">🔒 Niveau joueur ${isl.unlockLevel} requis</div><button class="btn gold small" data-act="unlock" data-id="${id}" ${s.player.level < isl.unlockLevel ? 'disabled' : ''}>Débloquer · ${priceHtml(isl.cost)}</button> <button class="btn small gray" data-act="look" data-id="${id}">👁️ Voir</button>`}
        </div>`;
      }).join('') + '<p class="muted" style="text-align:center">Chaque niveau d’île : +5 % de production et +4 emplacements de bâtiments.</p>';
      onActions(body, (a, d) => {
        const id = d.id as IslandId;
        if (a === 'go' || a === 'look') { sheet.close(); app.world.focus(id); }
        if (a === 'up') app.act('island.upgrade', { id });
        if (a === 'unlock' && app.ok('island.unlock', { id })) {
          sheet.close();
          app.world.sync(g.state);
          app.world.focus(id);
          const p = app.world.islandOrigin(id);
          p.y = 2;
          app.world.fx.burst(p, '#ffe680', { count: 80, speed: 6, up: 6, star: true });
        }
      });
    },
  });
}
