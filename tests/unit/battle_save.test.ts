import { describe, it, expect } from 'vitest';
import { makeGame, T0 } from './helpers';
import { createBattle, autoResolve, nextActor, act, aiChoose, campaignEnemies } from '../../src/systems/battle';
import { SaveManager, MemoryStorage } from '../../src/core/save';
import { Game } from '../../src/core/game';
import { CAMPAIGN_WORLDS, STAGES_PER_WORLD } from '../../src/data/progression';

describe('combat', () => {
  it('déterministe à graine égale', () => {
    const a = autoResolve(createBattle('arena', [{ name: 'A', speciesId: 'braisou', level: 5, stage: 0 }], [{ name: 'B', speciesId: 'feuillot', level: 5, stage: 0 }], 99));
    const b = autoResolve(createBattle('arena', [{ name: 'A', speciesId: 'braisou', level: 5, stage: 0 }], [{ name: 'B', speciesId: 'feuillot', level: 5, stage: 0 }], 99));
    expect(a.over).toBe(true);
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
  });

  it('l’avantage élémentaire compte (Flamme bat Flora à niveau égal la plupart du temps)', () => {
    let wins = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = autoResolve(createBattle('arena', [{ name: 'A', speciesId: 'braisou', level: 8, stage: 0 }], [{ name: 'B', speciesId: 'feuillot', level: 8, stage: 0 }], seed));
      if (r.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThan(28);
  });

  it('chaque étape de campagne génère des ennemis valides et un combat qui se termine', () => {
    for (let w = 1; w <= CAMPAIGN_WORLDS.length; w++) for (let st = 1; st <= STAGES_PER_WORLD; st++) {
      const en = campaignEnemies(w, st);
      expect(en.length).toBeGreaterThan(0);
      const b = autoResolve(createBattle('campaign', [{ name: 'X', speciesId: 'stellaris', level: 40, stage: 3 }], en, w * 100 + st));
      expect(b.over).toBe(true);
    }
  });

  it('tour manuel : l’IA choisit une compétence prête', () => {
    const b = createBattle('arena', [{ name: 'A', speciesId: 'nenuphou', level: 5, stage: 0 }], [{ name: 'B', speciesId: 'zinzap', level: 5, stage: 0 }], 5);
    const f = nextActor(b)!;
    const c = aiChoose(b, f.id);
    const r = act(b, f.id, c.skillId, c.targetId);
    expect(r.events.length).toBeGreaterThan(0);
  });

  it('flux complet de campagne avec récompenses et énergie', () => {
    const g = makeGame();
    const energy = g.s.resources.energy;
    const battle = g.game.act('battle.start', { mode: 'campaign', ref: '1-1' });
    expect(g.s.resources.energy).toBe(energy - 4);
    autoResolve(battle);
    const out = g.game.act('battle.finish', { battle });
    if (out.won) expect(g.s.campaign.stars['1-1']).toBeGreaterThan(0);
    expect(() => g.game.act('battle.finish', { battle })).toThrow(/invalide/);
  });

  it('boss : dégâts cumulés et tentatives limitées', () => {
    const g = makeGame();
    g.s.resources.energy = 100;
    for (let i = 0; i < 3; i++) {
      const b = g.game.act('battle.start', { mode: 'boss', ref: 'boss' });
      autoResolve(b);
      g.game.act('battle.finish', { battle: b });
    }
    expect(g.s.boss.damage).toBeGreaterThan(0);
    expect(() => g.game.act('battle.start', { mode: 'boss', ref: 'boss' })).toThrow(/tentatives/);
  });
});

describe('sauvegarde', () => {
  it('sauvegarde puis rechargement identique', () => {
    const g = makeGame();
    g.game.act('login.claim');
    expect(g.game.saveNow()).toBe(true);
    const g2 = new Game(new SaveManager(g.storage), () => g.now());
    expect(g2.state.resources).toEqual(g.s.resources);
    expect(g2.state.monsters.length).toBe(g.s.monsters.length);
  });

  it('écriture interrompue/corrompue : on récupère l’autre emplacement', () => {
    const g = makeGame();
    g.game.saveNow();
    g.game.act('login.claim');
    g.game.saveNow();
    const rev = g.s.revision;
    // corrompre la dernière écriture (simule une coupure brutale en pleine écriture)
    const keys = [...g.storage.map.keys()].filter((k) => k.endsWith('.a') || k.endsWith('.b'));
    const newest = keys.map((k) => ({ k, rev: JSON.parse(g.storage.map.get(k)!).rev })).sort((x, y) => y.rev - x.rev)[0];
    g.storage.map.set(newest.k, g.storage.map.get(newest.k)!.slice(0, 200));
    const res = new SaveManager(g.storage).load(T0);
    expect(res.state).not.toBeNull();
    expect(res.corrupted).toBeGreaterThan(0);
    expect(res.state!.revision).toBeLessThan(rev);
  });

  it('toutes les sauvegardes illisibles : nouvelle partie sans plantage', () => {
    const st = new MemoryStorage();
    st.write('xalamonsters.save.a', '{garbage');
    st.write('xalamonsters.save.b', 'null');
    const game = new Game(new SaveManager(st), () => T0);
    expect(game.state.monsters.length).toBe(1);
  });

  it('export / import de sauvegarde', () => {
    const g = makeGame();
    const code = g.saver.exportString(g.s);
    const back = g.saver.importString(code, T0);
    expect(back.saveId).toBe(g.s.saveId);
  });
});
