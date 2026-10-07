import type { App } from '../app';
import { SPECIES, STAGE_NAMES } from '../../data/species';
import { ELEMENTS, RARITIES } from '../../data/elements';
import { BUILDING, nurserySlots } from '../../data/world';
import { breedOdds, breedCost, BREED_MIN_LEVEL, hatchDurationMs, breedDurationMs } from '../../systems/nurture';
import { speedUpCost } from '../../systems/buildings';
import { displayName } from '../../systems/monsters';
import { currentEvent, weatherAt } from '../../systems/time';
import { fmtDuration } from '../../core/util';
import { html, esc, onActions, priceHtml, rarityChip, elChips } from '../dom';
import { eggPortrait, Showcase } from '../../render/showcase';
import { audio } from '../../audio/audio';
import { monsterCard } from './monsters';
import { startBuild } from './buildings';

export function registerNurturePanels(app: App): void {
  app.routes.nursery = () => openNursery(app);
  app.routes.breeding = (d) => openBreeding(app, d.uid);
}

function openNursery(app: App): void {
  const g = app.game;
  app.openSheet({
    title: 'Nursery',
    render: (body) => {
      const s = g.state;
      const now = g.now();
      const nursery = s.buildings.find((b) => BUILDING[b.defId].kind === 'nursery');
      if (!nursery) {
        body.innerHTML = `<p class="muted" style="text-align:center">Tu n’as pas encore de Nursery.</p><button class="btn green wide" data-act="buildN">🏗️ Construire une Nursery</button>`;
        onActions(body, () => { app.closeAllSheets(); startBuild(app, 'nursery', app.world.focusIsland); });
        return;
      }
      const slots = nursery.nursery ?? [];
      const max = nurserySlots(nursery.level);
      body.innerHTML = `<p class="muted" style="text-align:center">Place un œuf, attends l’éclosion… et découvre ton nouveau Xalamon !</p>
        <div class="section-title">Incubateurs (${slots.length}/${max})</div>
        <div class="grid g3">${Array.from({ length: max }, (_, i) => {
          const sl = slots[i];
          if (!sl) return `<div class="card" style="text-align:center;min-height:150px;display:flex;align-items:center;justify-content:center;opacity:.6">Libre</div>`;
          const ready = sl.readyAt <= now;
          const sp = SPECIES[sl.egg.speciesId];
          return `<div class="card ${ready ? 'hl' : ''}" style="text-align:center;padding:6px">
            <img src="${eggPortrait(sl.egg.speciesId)}" style="width:72px;height:72px;${ready ? 'animation:shake 1.2s infinite' : ''}">
            <div style="font-size:12px;font-weight:700">${esc(sp.name)}</div>
            <div class="stars" style="color:${RARITIES[sp.rarity].color};font-size:10px">${'★'.repeat(RARITIES[sp.rarity].stars)}</div>
            ${ready ? `<button class="btn gold small wide" data-act="hatch" data-i="${i}">🐣 Éclore</button>`
              : `<div class="bar" style="margin:4px 0"><i data-from="${sl.placedAt}" data-to="${sl.readyAt}"></i></div><div class="muted" style="font-size:11px" data-until="${sl.readyAt}"></div>
                 <button class="btn purple small wide" data-act="speed" data-i="${i}">⏩ 💎${speedUpCost(sl.readyAt - now)}</button>`}
          </div>`;
        }).join('')}</div>
        ${slots.length >= max && nursery.level < 5 ? '<p class="muted" style="text-align:center">Améliore la Nursery pour plus d’emplacements.</p>' : ''}
        <div class="section-title">Mes œufs (${s.eggs.length})</div>
        ${s.eggs.length ? `<div class="grid g3">${s.eggs.map((e) => {
          const sp = SPECIES[e.speciesId];
          return `<div class="card" style="text-align:center;padding:6px;border-color:${RARITIES[sp.rarity].color}">
            <img src="${eggPortrait(e.speciesId)}" style="width:64px;height:64px">
            <div style="font-size:12px;font-weight:700">${esc(sp.name)}</div>
            <div class="muted" style="font-size:10px">⏱ ${fmtDuration(hatchDurationMs(e.speciesId))}</div>
            <button class="btn green small wide" data-act="place" data-uid="${e.uid}" ${slots.length >= max ? 'disabled' : ''}>Incuber</button>
            <button class="btn gray small wide" style="margin-top:4px;min-height:24px;font-size:11px" data-act="sell" data-uid="${e.uid}">Vendre</button></div>`;
        }).join('')}</div>` : '<div class="card muted" style="text-align:center">Aucun œuf. Obtiens-en par l’élevage 🧬, la boutique 🛍️, les quêtes 🎯 et les combats ⚔️.</div>'}`;
      onActions(body, (a, d) => {
        if (a === 'place') app.ok('nursery.place', { uid: nursery.uid, eggUid: d.uid! });
        if (a === 'speed') app.act('nursery.speedup', { uid: nursery.uid, slot: Number(d.i) });
        if (a === 'sell') app.act('egg.sell', { eggUid: d.uid! });
        if (a === 'hatch') {
          const sl = (g.state.buildings.find((b) => b.uid === nursery.uid)!.nursery ?? [])[Number(d.i)];
          if (!sl) return;
          const species = sl.egg.speciesId;
          const isNew = !g.state.codex[species]?.owned;
          const mu = app.act('nursery.hatch', { uid: nursery.uid, slot: Number(d.i) });
          if (mu) hatchCinematic(app, species, mu, isNew);
        }
      });
    },
  });
}

export function hatchCinematic(app: App, speciesId: string, monsterUid: string, isNew: boolean): void {
  const sp = SPECIES[speciesId];
  const ov = html(`<div class="cinematic"><div class="stage3d"><div class="rays"></div></div><h1 class="txt-stroke"></h1><div class="sub"></div><div class="tap">Touchez l’œuf !</div></div>`);
  document.body.appendChild(ov);
  const stage = ov.querySelector('.stage3d') as HTMLElement;
  const sc = new Showcase(stage);
  sc.showEgg(speciesId);
  let taps = 0, revealed = false, t0 = 0;
  const egg = sc.egg!;
  sc.onFrame = (t) => {
    if (!t0) t0 = t;
    if (!revealed && egg) {
      const k = taps * 0.06 + 0.04;
      egg.rotation.z = Math.sin(t * (8 + taps * 6)) * k;
      egg.position.y = Math.abs(Math.sin(t * 3)) * 0.05 * (taps + 1);
    }
  };
  const reveal = () => {
    revealed = true;
    audio.sfx('hatch');
    document.body.appendChild(html('<div class="flash"></div>'));
    setTimeout(() => document.querySelector('.flash')?.remove(), 700);
    sc.showSpecies(speciesId, 0);
    sc.mode = 'happy';
    setTimeout(() => audio.sfx('cry', { freq: ELEMENTS[sp.elements[0]].voice }), 300);
    (ov.querySelector('h1') as HTMLElement).textContent = sp.name;
    (ov.querySelector('.sub') as HTMLElement).innerHTML = `${rarityChip(sp.rarity)} ${elChips(sp.elements)}<br><span style="font-size:13px">${isNew ? '✨ Nouvelle espèce ajoutée au Codex ! ✨' : STAGE_NAMES[0]}</span>`;
    (ov.querySelector('.tap') as HTMLElement).textContent = 'Touchez pour continuer';
    const m = app.game.state.monsters.find((x) => x.uid === monsterUid);
    if (m && !m.habitatUid) (ov.querySelector('.tap') as HTMLElement).textContent = 'Aucun habitat libre : ton Xalamon attend en réserve. Touchez pour continuer';
  };
  ov.addEventListener('click', () => {
    if (!revealed) {
      taps++;
      audio.sfx('crack');
      stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
      if (taps >= 3) reveal();
      return;
    }
    sc.dispose();
    ov.remove();
    app.refreshAll();
    const p = app.world.monsterWorldPos(monsterUid);
    if (p) { app.world.fx.burst(p, ELEMENTS[sp.elements[0]].color, { count: 30, star: true }); app.world.playMonster(monsterUid, 'happy', 3); }
  });
}

function openBreeding(app: App, sanctuaryUid?: string): void {
  const g = app.game;
  let pick: string[] = [];
  app.openSheet({
    title: 'Élevage',
    render: (body) => {
      const s = g.state;
      const now = g.now();
      const sancts = s.buildings.filter((b) => BUILDING[b.defId].kind === 'breeding');
      if (!sancts.length) {
        const lvl = BUILDING.breeding.unlockLevel;
        body.innerHTML = `<div style="text-align:center"><div style="font-size:60px">🧬</div><p>Le <b>Sanctuaire d’Union</b> permet d’unir deux Xalamons compatibles pour obtenir un œuf.</p>
          ${s.player.level < lvl ? `<p class="muted">Disponible au niveau ${lvl}.</p>` : '<button class="btn green wide" data-act="build">🏗️ Construire un Sanctuaire</button>'}</div>`;
        onActions(body, () => { app.closeAllSheets(); startBuild(app, 'breeding', app.world.focusIsland); });
        return;
      }
      const sanct = sancts.find((b) => b.uid === sanctuaryUid) ?? sancts.find((b) => !b.breeding && !b.busyKind) ?? sancts[0];
      const busyParents = new Set(s.buildings.flatMap((b) => (b.breeding ? [b.breeding.parentA, b.breeding.parentB] : [])));
      let jobs = sancts.filter((b) => b.breeding).map((b) => {
        const j = b.breeding!;
        const ready = j.readyAt <= now;
        const pa = s.monsters.find((m) => m.uid === j.parentA), pb = s.monsters.find((m) => m.uid === j.parentB);
        return `<div class="card ${ready ? 'hl' : ''} row"><span style="font-size:30px">💗</span><div class="spacer"><b>${esc(pa ? displayName(pa) : '?')} + ${esc(pb ? displayName(pb) : '?')}</b><br>
          ${ready ? '<span style="color:#7af08e">Un œuf est prêt !</span>' : `<span class="muted">Union en cours : <span data-until="${j.readyAt}"></span></span><div class="bar" style="margin-top:4px"><i data-from="${j.startedAt}" data-to="${j.readyAt}"></i></div>`}</div>
          ${ready ? `<button class="btn gold small" data-act="collect" data-uid="${b.uid}">🥚 Récupérer</button>` : `<button class="btn purple small" data-act="speed" data-uid="${b.uid}">⏩ 💎${speedUpCost(j.readyAt - now)}</button>`}</div>`;
      }).join('');
      if (!jobs) jobs = '';
      const eligible = s.monsters.filter((m) => m.level >= BREED_MIN_LEVEL && !busyParents.has(m.uid));
      pick = pick.filter((u) => eligible.some((m) => m.uid === u));
      const a = s.monsters.find((m) => m.uid === pick[0]), b = s.monsters.find((m) => m.uid === pick[1]);
      let preview = '';
      if (a && b) {
        const odds = breedOdds(a.speciesId, b.speciesId, { stars: weatherAt(sanct.islandId, now) === 'stars', eventElement: s.event.eventKey ? currentEvent(now).def.element : undefined, parentStages: a.stage + b.stage });
        const key = [a.speciesId, b.speciesId].sort().join('+');
        const known = new Set(s.breedLog[key] ?? []);
        const cost = breedCost(a.speciesId, b.speciesId);
        preview = `<div class="card hl"><div class="row"><b class="spacer">Résultats possibles</b><span class="muted">jamais garanti !</span></div>
          ${odds.slice(0, 8).map((o) => {
            const sp = SPECIES[o.speciesId];
            const seen = s.codex[o.speciesId]?.owned || known.has(o.speciesId);
            return `<div class="row" style="margin-top:5px"><img src="${app.portrait(o.speciesId, 0)}" style="width:40px;height:40px;${seen ? '' : 'filter:brightness(0)'}"><span class="spacer">${seen ? esc(sp.name) : '???'} <span style="color:${RARITIES[sp.rarity].color};font-size:11px">${RARITIES[sp.rarity].name}</span></span><b>${o.chance < 0.01 ? '<1' : Math.round(o.chance * 100)} %</b></div>`;
          }).join('')}${odds.length > 8 ? `<div class="muted" style="margin-top:4px">… et ${odds.length - 8} autres possibilités</div>` : ''}
          <div class="muted" style="margin-top:6px">⏱ ${fmtDuration(breedDurationMs(odds[0].speciesId))} à ${fmtDuration(breedDurationMs(odds[odds.length - 1].speciesId))} selon le résultat</div>
          <button class="btn green wide" style="margin-top:8px" data-act="start" ${sanct.breeding || sanct.busyKind ? 'disabled' : ''}>💗 Unir · ${priceHtml(cost)}</button>
          ${sanct.breeding ? '<div class="muted" style="text-align:center;margin-top:4px">Ce sanctuaire est occupé.</div>' : ''}</div>`;
      }
      body.innerHTML = `${jobs}
        <div class="section-title">Choisis 2 parents (niveau ${BREED_MIN_LEVEL}+)</div>
        <div class="row" style="justify-content:center;gap:14px;margin-bottom:8px">
          ${[a, b].map((m) => m ? `<div style="text-align:center"><img src="${app.portrait(m.speciesId, m.stage, m.skin)}" style="width:80px;height:80px"><div style="font-size:12px">${esc(displayName(m))}</div></div>` : '<div style="width:80px;height:96px;border:3px dashed rgba(255,255,255,.3);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:30px">?</div>').join('<div style="font-size:30px">💗</div>')}
        </div>
        ${preview}
        <div class="section-title">Xalamons disponibles</div>
        ${eligible.length ? `<div class="grid g3">${eligible.map((m) => monsterCard(app, m, { act: 'pick', sel: pick.includes(m.uid) })).join('')}</div>` : `<div class="card muted">Fais monter tes Xalamons au niveau ${BREED_MIN_LEVEL} en les nourrissant pour pouvoir les unir.</div>`}
        <p class="muted" style="text-align:center">Astuce : la météo 🌌 Pluie d’étoiles et les parents rares ou évolués augmentent les chances d’obtenir des Xalamons rares. Les recettes spéciales (Lumière + Ombre, Cosmos + Lumière…) peuvent révéler des légendes.</p>`;
      onActions(body, (act, d) => {
        if (act === 'pick') {
          if (pick.includes(d.uid!)) pick = pick.filter((u) => u !== d.uid);
          else pick = [...pick, d.uid!].slice(-2);
          audio.sfx('click');
          app.sheets[app.sheets.length - 1]?.refresh();
        }
        if (act === 'start' && a && b && app.ok('breeding.start', { uid: sanct.uid, a: a.uid, b: b.uid })) {
          pick = [];
          app.toast('Union lancée ! Reviens plus tard pour récupérer l’œuf.', 'good');
          const p = app.world.buildingWorldPos(sanct.uid);
          if (p) app.world.fx.burst(p, '#ff7bf1', { count: 30, star: true });
        }
        if (act === 'collect' && app.act('breeding.collect', { uid: d.uid! })) app.toast('Nouvel œuf ajouté ! Place-le dans la Nursery 🥚', 'good');
        if (act === 'speed') app.act('breeding.speedup', { uid: d.uid! });
      });
    },
  });
}
