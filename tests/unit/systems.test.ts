import { describe, it, expect } from 'vitest';
import { makeGame, T0 } from './helpers';
import { BUILDING, GRID } from '../../src/data/world';
import { canPlace, findFreeSpot } from '../../src/systems/buildings';
import { ELEMENTS, ELEMENT_ORDER, elementMultiplier } from '../../src/data/elements';
import { SPECIES_LIST, SPECIES } from '../../src/data/species';
import { breedOdds } from '../../src/systems/nurture';
import { GameError } from '../../src/core/util';
import { monsterXpForLevel } from '../../src/data/progression';

describe('données', () => {
  it('table élémentaire équilibrée : 2 forces et 2 faiblesses par élément', () => {
    for (const e of ELEMENT_ORDER) {
      expect(ELEMENTS[e].strong.length).toBe(2);
      const weak = ELEMENT_ORDER.filter((o) => ELEMENTS[o].strong.includes(e));
      expect(weak.length).toBe(2);
    }
    expect(elementMultiplier('flamme', ['flora'])).toBe(1.5);
    expect(elementMultiplier('flamme', ['aqua'])).toBe(0.75);
    expect(elementMultiplier('flamme', ['volt'])).toBe(1);
  });

  it('au moins 40 espèces originales avec ids uniques', () => {
    expect(SPECIES_LIST.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SPECIES_LIST.map((s) => s.id)).size).toBe(SPECIES_LIST.length);
  });

  it('la partie de départ est placée correctement sur la grille', () => {
    const g = makeGame();
    for (const b of g.s.buildings) {
      expect(canPlace(g.s, b.islandId, BUILDING[b.defId].size, b.x, b.y, b.uid)).toBe(true);
    }
    expect(GRID).toBe(18);
  });
});

describe('ferme et nourriture', () => {
  it('planter, attendre, récolter puis nourrir', () => {
    const g = makeGame();
    const farm = g.s.buildings.find((b) => b.defId === 'farm')!;
    g.game.act('farm.plant', { uid: farm.uid, cropId: 'ble_xala' });
    expect(() => g.game.act('farm.harvest', { uid: farm.uid })).toThrow(GameError);
    g.advance(31_000);
    const before = g.s.items.ble_xala;
    const n = g.game.act('farm.harvest', { uid: farm.uid });
    expect(n).toBeGreaterThan(0);
    expect(g.s.items.ble_xala).toBe(before + n);
    const mon = g.s.monsters[0];
    const r = g.game.act('monster.feed', { uid: mon.uid, item: 'ble_xala', count: 5 });
    expect(r.xp).toBe(20);
    expect(g.s.monsters[0].level).toBeGreaterThanOrEqual(2);
  });

  it('une action invalide ne modifie pas l’état', () => {
    const g = makeGame();
    const snap = JSON.stringify(g.s);
    expect(() => g.game.act('farm.plant', { uid: 'nope', cropId: 'ble_xala' })).toThrow();
    expect(JSON.stringify(g.s)).toBe(snap);
  });

  it('niveau plafonné par le stade puis évolution', () => {
    const g = makeGame();
    g.s.items.festin = 50;
    g.s.resources.coins = 1e6; g.s.resources.energy = 500;
    const uid = g.s.monsters[0].uid;
    for (let i = 0; i < 10; i++) { try { g.game.act('monster.feed', { uid, item: 'festin', count: 1 }); } catch { break; } }
    const m = g.s.monsters.find((x) => x.uid === uid)!;
    expect(m.level).toBe(10);
    expect(() => g.game.act('monster.feed', { uid, item: 'festin', count: 1 })).toThrow(/évoluer/);
    g.game.act('monster.evolve', { uid });
    expect(g.s.monsters.find((x) => x.uid === uid)!.stage).toBe(1);
    expect(monsterXpForLevel(1)).toBe(10);
  });
});

describe('œufs, élevage, habitats', () => {
  it('éclosion du premier œuf et placement automatique dans l’habitat Flora', () => {
    const g = makeGame();
    const nursery = g.s.buildings.find((b) => b.defId === 'nursery')!;
    const egg = g.s.eggs[0];
    g.game.act('nursery.place', { uid: nursery.uid, eggUid: egg.uid });
    expect(g.s.eggs.length).toBe(0);
    g.advance(31_000);
    const uid = g.game.act('nursery.hatch', { uid: nursery.uid, slot: 0 });
    const m = g.s.monsters.find((x) => x.uid === uid)!;
    expect(m.speciesId).toBe('feuillot');
    const hab = g.s.buildings.find((b) => b.uid === m.habitatUid)!;
    expect(hab.defId).toBe('habitat_flora');
    expect(g.s.codex.feuillot.owned).toBe(true);
  });

  it('probabilités d’élevage : somme = 1, hybride possible, jamais garanti', () => {
    const odds = breedOdds('braisou', 'feuillot');
    const sum = odds.reduce((a, o) => a + o.chance, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(odds.map((o) => o.speciesId)).toContain('braisiflore');
    expect(Math.max(...odds.map((o) => o.chance))).toBeLessThan(1);
    const legend = breedOdds('astrelle', 'lumio');
    expect(legend.map((o) => o.speciesId)).toContain('stellaris');
    expect(legend.map((o) => o.speciesId)).not.toContain('superessia');
  });

  it('élevage complet : œuf obtenu et journal de découvertes', () => {
    const g = makeGame();
    g.s.player.level = 5;
    g.s.resources.coins = 100000;
    const a = g.s.monsters[0];
    a.level = 5;
    // second parent
    g.s.monsters.push({ ...a, uid: 'mzz', speciesId: 'feuillot', habitatUid: null });
    const spot = findFreeSpot(g.s, 'verdante', 3)!;
    const sanct = g.game.act('building.build', { defId: 'breeding', island: 'verdante', x: spot.x, y: spot.y });
    g.advance(61_000);
    g.game.act('breeding.start', { uid: sanct, a: a.uid, b: 'mzz' });
    expect(() => g.game.act('breeding.start', { uid: sanct, a: a.uid, b: 'mzz' })).toThrow();
    g.advance(13 * 3600_000);
    const eggs = g.s.eggs.length;
    g.game.act('breeding.collect', { uid: sanct });
    expect(g.s.eggs.length).toBe(eggs + 1);
    expect(Object.keys(g.s.breedLog).length).toBe(1);
  });

  it('production plafonnée et récolte', () => {
    const g = makeGame();
    const hab = g.s.buildings.find((b) => b.defId === 'habitat_flamme')!;
    g.advance(10 * 3600_000);
    const h = g.s.buildings.find((b) => b.uid === hab.uid)!;
    expect(h.stored).toBeLessThanOrEqual(800);
    expect(h.stored).toBeGreaterThan(100);
    const coins = g.s.resources.coins;
    const got = g.game.act('production.collect', { uid: hab.uid });
    expect(g.s.resources.coins).toBe(coins + got);
  });

  it('retour d’horloge : aucune production négative', () => {
    const g = makeGame();
    const hab = g.s.buildings.find((b) => b.defId === 'habitat_flamme')!;
    const before = hab.stored;
    g.advance(-3600_000);
    expect(g.s.buildings.find((b) => b.uid === hab.uid)!.stored).toBeGreaterThanOrEqual(before);
  });

  it('construction : placement refusé si occupé, accepté ailleurs', () => {
    const g = makeGame();
    const nursery = g.s.buildings.find((b) => b.defId === 'nursery')!;
    expect(() => g.game.act('building.build', { defId: 'farm', island: 'verdante', x: nursery.x, y: nursery.y })).toThrow(/occupé/);
    const spot = findFreeSpot(g.s, 'verdante', 2)!;
    const uid = g.game.act('building.build', { defId: 'farm', island: 'verdante', x: spot.x, y: spot.y });
    expect(g.s.buildings.some((b) => b.uid === uid)).toBe(true);
    const spot2 = findFreeSpot(g.s, 'verdante', 2)!;
    g.game.act('building.move', { uid, x: spot2.x, y: spot2.y });
  });

  it('déblocage d’île selon le niveau', () => {
    const g = makeGame();
    g.s.resources.coins = 10000;
    expect(() => g.game.act('island.unlock', { id: 'volcanique' })).toThrow(/Niveau/);
    g.s.player.level = 4;
    g.game.act('island.unlock', { id: 'volcanique' });
    expect(g.s.islands.volcanique.unlocked).toBe(true);
    expect(() => g.game.act('island.unlock', { id: 'cosmique' })).toThrow();
  });
});

describe('quêtes, connexion, pass, succès', () => {
  it('quêtes quotidiennes générées et réclamables', () => {
    const g = makeGame();
    expect(g.s.quests.daily.length).toBe(5);
    expect(g.s.quests.weekly.length).toBe(4);
    const farm = g.s.buildings.find((b) => b.defId === 'farm')!;
    g.game.act('farm.plant', { uid: farm.uid, cropId: 'ble_xala' });
    g.advance(31_000);
    g.game.act('farm.harvest', { uid: farm.uid });
    g.game.act('quest.claim', { kind: 'story', id: 's_harvest' });
    expect(() => g.game.act('quest.claim', { kind: 'story', id: 's_harvest' })).toThrow();
  });

  it('récompense de connexion une fois par jour', () => {
    const g = makeGame();
    expect(g.s.login.pending).toBe(true);
    g.game.act('login.claim');
    expect(() => g.game.act('login.claim')).toThrow();
    g.advance(24 * 3600_000);
    expect(g.s.login.pending).toBe(true);
    expect(g.s.login.streak).toBe(2);
  });

  it('pass : palier gratuit réclamable, premium refusé sans achat', () => {
    const g = makeGame();
    g.s.pass.xp = 400;
    g.game.act('pass.claim', { tier: 1, premium: false });
    expect(() => g.game.act('pass.claim', { tier: 1, premium: true })).toThrow(/Premium/);
    expect(() => g.game.act('pass.claim', { tier: 2, premium: false })).toThrow();
  });
});

describe('achats intégrés', () => {
  it('pas de double récompense pour un même ordre', () => {
    const g = makeGame();
    const gems = g.s.resources.gems;
    const rc = { orderId: 'GPA.1', sku: 'gems_80', purchaseToken: 'tok', purchaseTime: T0, source: 'mock' as const };
    expect(g.game.act('iap.grant', { receipt: rc })).toBe(true);
    expect(g.game.act('iap.grant', { receipt: rc })).toBe(false);
    expect(g.s.resources.gems).toBe(gems + 80);
  });

  it('pass premium et restauration', () => {
    const g = makeGame();
    g.game.act('iap.grant', { receipt: { orderId: 'GPA.2', sku: 'xala_pass_premium', purchaseToken: 't', purchaseTime: T0, source: 'mock' } });
    expect(g.s.pass.premium).toBe(true);
    const g2 = makeGame(7);
    const n = g2.game.act('iap.restore', { owned: [{ orderId: 'GPA.3', sku: 'cosmetic_aurora', purchaseToken: 't', purchaseTime: T0, source: 'mock' }] });
    expect(n).toBe(1);
    expect(g2.s.unlocks).toContain('skin_aurore_iap');
    expect(g2.game.act('iap.restore', { owned: [{ orderId: 'GPA.3', sku: 'cosmetic_aurora', purchaseToken: 't', purchaseTime: T0, source: 'mock' }] })).toBe(0);
  });

  it('boutique : achat d’œuf et limite journalière', () => {
    const g = makeGame();
    g.s.resources.gems = 1000;
    g.game.act('shop.buy', { offerId: 'egg_braisou' });
    expect(g.s.eggs.some((e) => e.speciesId === 'braisou')).toBe(true);
    for (let i = 0; i < 5; i++) g.game.act('shop.buy', { offerId: 'egg_mystery' });
    expect(() => g.game.act('shop.buy', { offerId: 'egg_mystery' })).toThrow(/Limite/);
    expect(SPECIES[g.s.eggs[g.s.eggs.length - 1].speciesId]).toBeTruthy();
  });
});
