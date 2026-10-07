import type { App } from './app';
import { portrait } from '../render/showcase';
import { onActions } from './dom';

// Accueil du nouveau joueur : l'objectif du jeu est expliqué en une page,
// puis la liste des quêtes de progression guide pas à pas.

const PAGES = [
  { sp: 'lumio', title: 'Bienvenue dans l’archipel !', text: 'Je suis Lumio. Ici, des îles flottent sur une mer de nuages, nourries par une énergie mystérieuse : la <b>Xala</b>.' },
  { sp: 'braisou', title: 'Ton but', text: '<b>Construis tes îles</b>, <b>obtiens des Xalamons</b>, <b>nourris-les</b>, fais-les <b>évoluer</b>, <b>élève-les</b>… et deviens de plus en plus puissant !' },
  { sp: 'feuillot', title: 'Premiers pas', text: 'Un œuf t’attend : ouvre la <b>Nursery 🥚</b> pour le faire éclore. Plante du blé à la <b>Ferme 🌾</b> pour nourrir tes Xalamons. Touche un habitat pour récolter les <b>XalaCoins 🪙</b>.' },
  { sp: 'superessia', title: 'La SuperEssence', text: 'La <b>🌟 SuperEssence</b> est la ressource la plus rare. Elle permet les évolutions ultimes et d’éveiller des créatures légendaires. Suis l’<b>Objectif 🎯</b> en haut à gauche !' },
];

export function showWelcome(app: App): void {
  let page = 0;
  app.openSheet({
    title: 'XalaMonsters', modal: true, noAutoRefresh: true,
    onClose: () => {
      app.ok('tutorial.step', { step: 1 });
      if (app.game.state.login.pending) setTimeout(() => app.routes.daily?.({}), 300);
    },
    render: (body, sheet) => {
      const p = PAGES[page];
      body.innerHTML = `<div class="tuto"><img src="${portrait(p.sp, page === 3 ? 2 : 1)}"><div><h3 style="margin:0 0 6px">${p.title}</h3><p>${p.text}</p></div></div>
        <div class="row" style="justify-content:center;gap:6px;margin:6px 0">${PAGES.map((_, i) => `<span style="width:9px;height:9px;border-radius:50%;background:${i === page ? '#ffd36b' : 'rgba(255,255,255,.3)'}"></span>`).join('')}</div>
        <button class="btn gold wide" data-act="next">${page < PAGES.length - 1 ? 'Suivant ▶' : 'C’est parti !'}</button>`;
      onActions(body, () => {
        if (page < PAGES.length - 1) { page++; sheet.refresh(); }
        else sheet.close();
      });
    },
  });
}
