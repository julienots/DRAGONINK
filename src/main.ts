import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './ui/styles.css';
import { LoadingScreen } from './ui/loading';
import { Game } from './core/game';
import { SaveManager, HybridStorage } from './core/save';
import { createStore } from './platform/store';
import { App } from './ui/app';
import { audio } from './audio/audio';
import { portrait } from './render/showcase';
import { registerBuildingPanels } from './ui/panels/buildings';
import { registerMonsterPanels } from './ui/panels/monsters';
import { registerNurturePanels } from './ui/panels/nurture';
import { registerCombatPanels } from './ui/panels/combat';
import { registerMetaPanels, reconcilePurchases } from './ui/panels/meta';
import { showWelcome } from './ui/tutorial';

declare global {
  interface Window { xala?: { app: App; game: Game } }
}

const yieldFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function boot(): Promise<void> {
  const loading = new LoadingScreen();
  try {
    loading.setProgress(0.08, 'Réveil de la Xala...');
    await yieldFrame();
    const game = new Game(new SaveManager(new HybridStorage()));
    loading.setProgress(0.2, 'Chargement de l’archipel...');
    await yieldFrame();
    const store = createStore();
    const app = new App(game, store);
    registerBuildingPanels(app);
    registerMonsterPanels(app);
    registerNurturePanels(app);
    registerCombatPanels(app);
    registerMetaPanels(app);
    loading.setProgress(0.35, 'Construction des îles flottantes...');
    await yieldFrame();
    app.world.sync(game.state);
    app.world.focus('verdante', true);
    app.world.update(0.016);
    app.world.render();
    loading.setProgress(0.55, 'Les Xalamons se réveillent...');
    // préchargement des portraits des espèces possédées
    const owned = [...new Set(game.state.monsters.map((m) => `${m.speciesId}:${m.stage}`))];
    for (let i = 0; i < owned.length; i++) {
      const [sp, st] = owned[i].split(':');
      portrait(sp, Number(st));
      if (i % 4 === 3) { loading.setProgress(0.55 + (0.35 * i) / owned.length); await yieldFrame(); }
    }
    loading.setProgress(1, 'Prêt !');
    window.xala = { app, game };
    await loading.waitTap();
    audio.unlock();
    loading.hide();
    app.start();
    void reconcilePurchases(app);
    setTimeout(() => {
      if (game.state.tutorialStep === 0) showWelcome(app);
      else if (game.state.login.pending) app.routes.daily?.({});
    }, 700);
  } catch (e) {
    console.error(e);
    loading.setProgress(1, 'Erreur au chargement : ' + (e as Error).message);
  }
}

void boot();
