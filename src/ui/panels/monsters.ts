import type { App } from '../app';
import type { MonsterInstance, ElementId } from '../../core/types';
import { SPECIES, STAGE_NAMES, STAGE_LEVEL_CAP } from '../../data/species';
import { ELEMENTS, ELEMENT_ORDER, RARITIES, rarityIndex } from '../../data/elements';
import { BUILDING, CROP, RECIPE, CROPS, RECIPES, HABITAT_CAPACITY, ISLANDS } from '../../data/world';
import { skillsFor, STATUS_INFO } from '../../data/skills';
import { SKIN, monsterXpForLevel } from '../../data/progression';
import { monsterStats, satietyNow, evolveCost, canEvolve, displayName, habitatAccepts, habitatResidents, monsterIncome, power, levelCap } from '../../systems/monsters';
import { fmtNum } from '../../core/util';
import { html, esc, onActions, priceHtml, elChips, rarityChip } from '../dom';
import { Showcase } from '../../render/showcase';
import { audio } from '../../audio/audio';

export function registerMonsterPanels(app: App): void {
  app.routes.xalamons = (d) => openList(app, d.habitat);
  app.routes.monster = (d) => openDetail(app, d.uid!);
}

function sortMonsters(list: MonsterInstance[]): MonsterInstance[] {
  return list.slice().sort((a, b) => rarityIndex(SPECIES[b.speciesId].rarity) - rarityIndex(SPECIES[a.speciesId].rarity) || b.stage - a.stage || b.level - a.level);
}

export function monsterCard(app: App, m: MonsterInstance, opts: { sel?: boolean; dim?: boolean; act?: string; tag?: string } = {}): string {
  const sp = SPECIES[m.speciesId];
  const r = RARITIES[sp.rarity];
  return `<div class="mcard ${opts.sel ? 'sel' : ''} ${opts.dim ? 'dim' : ''}" style="--rc:${r.color}" data-act="${opts.act ?? 'open'}" data-uid="${m.uid}">
    <span class="lv">Niv.${m.level}</span><span class="els">${sp.elements.map((e) => ELEMENTS[e].icon).join('')}</span>
    <img loading="lazy" src="${app.portrait(m.speciesId, m.stage, m.skin)}" alt="">
    ${opts.tag ? `<span class="tag">${esc(opts.tag)}</span>` : ''}
    <div class="nm">${esc(displayName(m))}</div><div class="stars">${'★'.repeat(r.stars)}</div></div>`;
}

function openList(app: App, habitatUid?: string): void {
  const g = app.game;
  let filter: ElementId | 'all' | 'reserve' | 'team' = 'all';
  app.openSheet({
    title: habitatUid ? 'Ajouter à l’habitat' : 'Mes Xalamons',
    tabs: habitatUid ? undefined : ['Tous', 'Équipe', 'Réserve', ...ELEMENT_ORDER.map((e) => ELEMENTS[e].icon + ' ' + ELEMENTS[e].name)],
    render: (body, sheet) => {
      const s = g.state;
      if (!habitatUid) {
        const t = sheet.tab;
        filter = t === 'Tous' ? 'all' : t === 'Équipe' ? 'team' : t === 'Réserve' ? 'reserve' : (ELEMENT_ORDER.find((e) => t.endsWith(ELEMENTS[e].name)) ?? 'all');
      }
      let list = s.monsters;
      const hab = habitatUid ? s.buildings.find((b) => b.uid === habitatUid) : undefined;
      if (hab) list = list.filter((m) => habitatAccepts(hab, SPECIES[m.speciesId].elements) && m.habitatUid !== hab.uid);
      else if (filter === 'team') list = list.filter((m) => s.team.includes(m.uid));
      else if (filter === 'reserve') list = list.filter((m) => !m.habitatUid);
      else if (filter !== 'all') list = list.filter((m) => SPECIES[m.speciesId].elements.includes(filter as ElementId));
      list = sortMonsters(list);
      const reserve = s.monsters.filter((m) => !m.habitatUid).length;
      body.innerHTML = `${hab ? `<p class="muted" style="text-align:center">${esc(BUILDING[hab.defId].name)} : ${habitatResidents(s, hab.uid).length}/${HABITAT_CAPACITY[hab.level]} places</p>` : `<div class="muted" style="text-align:center;margin-bottom:6px">${s.monsters.length} Xalamons · ${reserve} en réserve · Équipe : ${s.team.length}/3</div>`}
        ${list.length ? `<div class="grid g3">${list.map((m) => monsterCard(app, m, { act: hab ? 'move' : 'open', tag: !m.habitatUid ? 'Réserve' : s.team.includes(m.uid) ? 'Équipe' : undefined })).join('')}</div>` : '<p class="muted" style="text-align:center;margin-top:30px">Aucun Xalamon ici. Fais éclore des œufs à la Nursery !</p>'}`;
      onActions(body, (a, d) => {
        if (a === 'open') openDetail(app, d.uid!);
        if (a === 'move' && hab && app.ok('monster.move', { uid: d.uid!, habitat: hab.uid })) {
          app.toast('Xalamon installé !', 'good');
          if (habitatResidents(g.state, hab.uid).length >= HABITAT_CAPACITY[hab.level]) sheet.close();
        }
      });
    },
  });
}

export function openDetail(app: App, uid: string): void {
  const g = app.game;
  const hero = html(`<div class="detail-hero"></div>`);
  let show: Showcase | null = null;
  let shownKey = '';
  let foodSel: string | null = null;
  app.openSheet({
    title: 'Xalamon',
    onClose: () => show?.dispose(),
    render: (body, sheet) => {
      const s = g.state;
      const m = s.monsters.find((x) => x.uid === uid);
      if (!m) { sheet.close(); return; }
      const sp = SPECIES[m.speciesId];
      const st = monsterStats(m);
      const sat = satietyNow(m, g.now());
      const need = monsterXpForLevel(m.level);
      const cap = levelCap(m);
      const hab = m.habitatUid ? s.buildings.find((b) => b.uid === m.habitatUid) : null;
      hero.style.setProperty('--hero', ELEMENTS[sp.elements[0]].color);
      const key = `${m.speciesId}:${m.stage}:${m.skin ?? ''}`;
      if (!show) show = new Showcase(hero);
      if (key !== shownKey) { show.showSpecies(m.speciesId, m.stage, m.skin); shownKey = key; }
      const foods = [...CROPS.map((c) => c.id), ...RECIPES.map((r) => r.id)].filter((id) => (s.items[id] ?? 0) > 0);
      if (foodSel && !(s.items[foodSel] > 0)) foodSel = null;
      foodSel ??= foods.includes(sp.favoriteCrop) ? sp.favoriteCrop : foods[0] ?? null;
      const ev = evolveCost(m);
      const skills = skillsFor(sp.elements);
      const inTeam = s.team.includes(m.uid);
      const skins = Object.values(SKIN).filter((k) => s.unlocks.includes(k.id));
      body.innerHTML = '';
      body.appendChild(hero);
      body.appendChild(html(`<div>
        <div class="row" style="margin-top:8px"><div class="spacer"><div style="font-size:22px;font-weight:700" class="txt-stroke">${esc(displayName(m))}</div>
          <div class="muted">${esc(sp.name)} · ${STAGE_NAMES[m.stage]} · ⚔️ ${fmtNum(power(m))}</div></div>${rarityChip(sp.rarity)}</div>
        <div style="margin:6px 0">${elChips(sp.elements)}</div>
        <div class="card">
          <div class="row"><b>Niveau ${m.level}</b><span class="muted">/ ${cap} (${STAGE_NAMES[m.stage]})</span><span class="spacer"></span><span class="muted">${m.level >= cap ? 'MAX' : `${m.xp}/${need} XP`}</span></div>
          <div class="bar xp" style="margin:4px 0 8px"><i style="width:${m.level >= cap ? 100 : (m.xp / need) * 100}%"></i></div>
          <div class="row"><b>Satiété</b><span class="spacer"></span><span class="muted">${Math.round(sat)}/100 ${sat <= 0 ? '— production réduite !' : ''}</span></div>
          <div class="bar food" style="margin-top:4px"><i style="width:${sat}%"></i></div>
        </div>
        <div class="section-title">Nourrir <span class="muted" style="text-transform:none">Préféré : ${CROP[sp.favoriteCrop]?.icon} ${esc(CROP[sp.favoriteCrop]?.name ?? '')} (+50 %)</span></div>
        ${foods.length ? `<div class="food-list">${foods.map((id) => `<div class="food-item ${id === sp.favoriteCrop ? 'fav' : ''}" data-act="food" data-id="${id}" style="${id === foodSel ? 'border-color:#5cf2ff;box-shadow:0 0 10px #5cf2ff' : ''}"><div class="e">${CROP[id]?.icon ?? RECIPE[id]?.icon}</div><div class="n">${esc(CROP[id]?.name ?? RECIPE[id]?.name ?? '')}</div><div class="x">×${s.items[id]} · ${CROP[id]?.xp ?? RECIPE[id]?.xp} XP</div></div>`).join('')}</div>
          <div class="row" style="margin-top:8px"><button class="btn green wide" data-act="feed" data-n="1">🍖 Nourrir ×1</button><button class="btn green wide" data-act="feed" data-n="10">🍖 ×10</button></div>`
          : '<div class="card muted">Plus de nourriture ! Récolte tes fermes 🌾 ou cuisine des plats 🍳.</div>'}
        <div class="section-title">Évolution</div>
        <div class="card">${m.stage >= 3 ? '✨ Stade maximal atteint : Xalamon Supérieur !' : `
          <div class="row"><div class="spacer">${STAGE_NAMES[m.stage]} → <b>${STAGE_NAMES[m.stage + 1]}</b><br><span class="muted">Nécessite niveau ${cap}. Change l’apparence, la taille et les statistiques.</span></div>
          <img src="${app.portrait(m.speciesId, m.stage + 1, m.skin)}" style="width:64px;height:64px;${canEvolve(m) ? '' : 'filter:brightness(.25)'}"></div>
          <button class="btn ${ev.essence ? 'essence' : 'purple'} wide" style="margin-top:8px" data-act="evolve" ${canEvolve(m) ? '' : 'disabled'}>✨ Évoluer · ${priceHtml(ev)}</button>`}</div>
        <div class="section-title">Statistiques</div>
        <div class="statgrid"><div class="stat"><b>${fmtNum(st.hp)}</b><span>❤️ PV</span></div><div class="stat"><b>${st.atk}</b><span>⚔️ Attaque</span></div><div class="stat"><b>${st.def}</b><span>🛡️ Défense</span></div><div class="stat"><b>${st.spd}</b><span>💨 Vitesse</span></div></div>
        <div class="card" style="margin-top:8px">🪙 Production : <b>${fmtNum(monsterIncome(m, g.now()))}</b>/min ${hab ? `· ${esc(BUILDING[hab.defId].name)} (${esc(ISLANDS[hab.islandId].name)})` : '· <b style="color:#ff8a96">En réserve (ne produit pas)</b>'}</div>
        <div class="section-title">Compétences</div>
        ${skills.map((k) => `<div class="card row" style="padding:7px"><span style="font-size:22px">${ELEMENTS[k.element].icon}</span><div class="spacer"><b>${esc(k.name)}</b> <span class="muted">${k.kind === 'normal' ? 'Attaque normale' : k.kind === 'elemental' ? 'Élémentaire' : k.kind === 'special' ? 'Spéciale' : 'ULTIME'}${k.cooldown ? ` · recharge ${k.cooldown}` : ''}</span><br><span class="muted">${esc(k.desc)}${k.status ? ` ${STATUS_INFO[k.status.id].icon}` : ''}</span></div>${k.power ? `<b>×${k.power}</b>` : ''}</div>`).join('')}
        <div class="section-title">Gestion</div>
        <div class="row wrap">
          <button class="btn ${inTeam ? 'gray' : 'gold'} small" data-act="team">${inTeam ? '➖ Retirer de l’équipe' : '⚔️ Ajouter à l’équipe'}</button>
          <button class="btn small" data-act="home">🏠 Changer d’habitat</button>
          <button class="btn small" data-act="rename">✏️ Renommer</button>
          ${skins.length ? `<button class="btn purple small" data-act="skin">🎨 Cosmétique</button>` : ''}
          <button class="btn red small" data-act="sell">💰 Vendre</button>
        </div>
        <div class="section-title">Histoire</div><div class="card muted">${esc(sp.lore)}</div>
        <div style="height:10px"></div></div>`));
      onActions(body, (a, d) => {
        const mm = g.state.monsters.find((x) => x.uid === uid)!;
        if (a === 'food') { foodSel = d.id!; sheet.refresh(); }
        if (a === 'feed' && foodSel) {
          const r = app.act('monster.feed', { uid, item: foodSel, count: Number(d.n) });
          if (r) { show!.mode = 'eat'; setTimeout(() => { if (show) show.mode = 'happy'; }, 900); app.toast(`+${r.xp} XP${r.levels ? ` · +${r.levels} niveau${r.levels > 1 ? 'x' : ''} !` : ''}`, 'good'); }
        }
        if (a === 'evolve') evolveCinematic(app, uid);
        if (a === 'team') {
          const team = g.state.team.includes(uid) ? g.state.team.filter((t) => t !== uid) : [...g.state.team, uid];
          if (team.length === 0) { app.toast('Ton équipe doit compter au moins un Xalamon', 'bad'); return; }
          if (team.length > 3) { app.toast('Équipe complète (3 max). Retire d’abord un membre.', 'bad'); return; }
          app.ok('team.set', { uids: team });
        }
        if (a === 'home') chooseHabitat(app, uid);
        if (a === 'rename') {
          void app.promptText('Nouveau nom (16 caractères max)', mm.nickname ?? SPECIES[mm.speciesId].name).then((n) => { if (n !== null) app.ok('monster.rename', { uid, name: n }); });
        }
        if (a === 'skin') chooseSkin(app, uid);
        if (a === 'sell') {
          app.openSheet({ title: 'Vendre ?', modal: true, render: (b2, s2) => {
            b2.innerHTML = `<p style="text-align:center">Vendre <b>${esc(displayName(mm))}</b> ? Cette action est définitive.</p><div class="row"><button class="btn gray wide" data-act="no">Annuler</button><button class="btn red wide" data-act="yes">Vendre</button></div>`;
            onActions(b2, (x) => { s2.close(); if (x === 'yes') { const v = app.act('monster.sell', { uid }); if (v) { app.toast(`Vendu pour ${fmtNum(v)} 🪙`, 'good'); sheet.close(); } } });
          } });
        }
      });
    },
  });
}

function chooseHabitat(app: App, uid: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Choisir un habitat', modal: true,
    render: (body, sheet) => {
      const s = g.state;
      const m = s.monsters.find((x) => x.uid === uid)!;
      const habs = s.buildings.filter((b) => habitatAccepts(b, SPECIES[m.speciesId].elements));
      body.innerHTML = habs.length ? habs.map((b) => {
        const n = habitatResidents(s, b.uid).length;
        const full = n >= HABITAT_CAPACITY[b.level] && m.habitatUid !== b.uid;
        return `<div class="card row"><span style="font-size:28px">${BUILDING[b.defId].icon}</span><div class="spacer"><b>${esc(BUILDING[b.defId].name)}</b> Niv.${b.level}<br><span class="muted">${esc(ISLANDS[b.islandId].name)} · ${n}/${HABITAT_CAPACITY[b.level]}</span></div>
          ${m.habitatUid === b.uid ? '<span class="muted">Actuel</span>' : `<button class="btn small ${full ? 'gray' : 'green'}" data-act="go" data-id="${b.uid}" ${full || b.busyKind === 'build' ? 'disabled' : ''}>${full ? 'Plein' : 'Installer'}</button>`}</div>`;
      }).join('') + (m.habitatUid ? '<button class="btn gray wide" style="margin-top:8px" data-act="reserve">Mettre en réserve</button>' : '')
        : `<p class="muted" style="text-align:center">Aucun habitat compatible (${SPECIES[m.speciesId].elements.map((e) => ELEMENTS[e].name).join(' / ')}). Construis-en un !</p><button class="btn green wide" data-act="build">🏗️ Construire</button>`;
      onActions(body, (a, d) => {
        if (a === 'go' && app.ok('monster.move', { uid, habitat: d.id! })) sheet.close();
        if (a === 'reserve' && app.ok('monster.move', { uid, habitat: null })) sheet.close();
        if (a === 'build') { app.closeAllSheets(); app.routes.build?.({ cat: 'Habitats' }); }
      });
    },
  });
}

function chooseSkin(app: App, uid: string): void {
  const g = app.game;
  app.openSheet({
    title: 'Cosmétiques', modal: true,
    render: (body, sheet) => {
      const m = g.state.monsters.find((x) => x.uid === uid)!;
      const skins = Object.values(SKIN).filter((k) => g.state.unlocks.includes(k.id));
      body.innerHTML = `<div class="grid g3"><div class="mcard" data-act="set" data-id="" style="--rc:#999"><img src="${app.portrait(m.speciesId, m.stage)}"><div class="nm">Original</div></div>
        ${skins.map((k) => `<div class="mcard ${m.skin === k.id ? 'sel' : ''}" data-act="set" data-id="${k.id}" style="--rc:${k.tint}"><img src="${app.portrait(m.speciesId, m.stage, k.id)}"><div class="nm">${esc(k.name)}</div></div>`).join('')}</div>`;
      onActions(body, (a, d) => { if (a === 'set' && app.ok('monster.skin', { uid, skin: d.id || null })) sheet.close(); });
    },
  });
}

export function evolveCinematic(app: App, uid: string): void {
  const g = app.game;
  const before = g.state.monsters.find((x) => x.uid === uid);
  if (!before) return;
  const fromStage = before.stage;
  if (!app.ok('monster.evolve', { uid })) return;
  const m = g.state.monsters.find((x) => x.uid === uid)!;
  const ov = html(`<div class="cinematic"><div class="stage3d"><div class="rays"></div></div><h1 class="txt-stroke">Évolution !</h1><div class="sub"></div><div class="tap">Touchez pour continuer</div></div>`);
  document.body.appendChild(ov);
  const stage = ov.querySelector('.stage3d') as HTMLElement;
  const sc = new Showcase(stage);
  sc.spin = true;
  sc.showSpecies(m.speciesId, fromStage, m.skin);
  sc.mode = 'idle';
  audio.sfx('evolve');
  let t = 0;
  sc.onFrame = (time) => {
    t = time;
    if (sc.rig && t < 1.6) {
      const k = 1 + Math.sin(t * (6 + t * 14)) * 0.08 * t;
      sc.rig.group.scale.setScalar(k);
    }
  };
  setTimeout(() => {
    document.body.appendChild(html('<div class="flash"></div>'));
    setTimeout(() => document.querySelector('.flash')?.remove(), 700);
    sc.showSpecies(m.speciesId, m.stage, m.skin);
    sc.mode = 'happy';
    sc.onFrame = undefined;
    (ov.querySelector('.sub') as HTMLElement).textContent = `${SPECIES[m.speciesId].name} est maintenant ${STAGE_NAMES[m.stage]} ! (niveau max ${STAGE_LEVEL_CAP[m.stage]})`;
    audio.sfx('levelup');
  }, 1700);
  ov.addEventListener('click', () => { if (t < 1.8) return; sc.dispose(); ov.remove(); app.refreshAll(); });
}
