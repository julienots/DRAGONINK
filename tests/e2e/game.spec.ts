import { test, expect, type Page } from '@playwright/test';

// Tests de bout en bout : on joue réellement dans le navigateur (build de production).

const errors: string[] = [];

async function start(page: Page, fresh = true): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (fresh) await page.addInitScript(() => { if (!sessionStorage.getItem('xala-init')) { localStorage.clear(); sessionStorage.setItem('xala-init', '1'); } });
  await page.goto('/');
  await page.locator('#loading.ready').waitFor({ timeout: 60_000 });
  await page.locator('#loading').click();
  await page.waitForFunction(() => !!window.xala && !document.getElementById('loading'), null, { timeout: 30_000 });
  await page.waitForTimeout(900);
}

async function closeAll(page: Page): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const n = await page.locator('.sheet-close').count();
    if (!n) break;
    await page.locator('.sheet-close').last().click();
    await page.waitForTimeout(150);
  }
}

async function ff(page: Page, ms: number): Promise<void> {
  await page.evaluate((d) => { const { game, app } = window.xala!; game.clockOffset += d; game.tick(); app.refreshAll(); }, ms);
}

const state = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.xala!.game.state)));

test('lancement, écran de chargement et accueil', async ({ page }) => {
  await start(page);
  await expect(page.locator('.sheet h2')).toContainText('XalaMonsters');
  for (let i = 0; i < 4; i++) await page.locator('.sheet .btn.gold').click();
  await expect(page.locator('.sheet h2')).toContainText('Cadeau');
  await page.locator('.sheet .btn.gold').click();
  await page.locator('.sheet .btn.gold').click();
  const s = await state(page);
  expect(s.tutorialStep).toBe(1);
  expect(s.login.pending).toBe(false);
  const calls = await page.evaluate(() => window.xala!.app.world.renderer.info.render.calls);
  expect(calls).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('navigation : chaque bouton ouvre un écran fonctionnel', async ({ page }) => {
  await start(page);
  await closeAll(page);
  const buttons: [string, string][] = [
    ['.nav-btn[data-act=build]', 'Construire'], ['.nav-btn[data-act=xalamons]', 'Mes Xalamons'], ['.nav-btn[data-act=nursery]', 'Nursery'],
    ['.nav-btn[data-act=breeding]', 'Élevage'], ['.nav-btn[data-act=combat]', 'Combat'], ['.nav-btn[data-act=shop]', 'Boutique'],
    ['.side [data-act=quests]', 'Quêtes'], ['.side [data-act=pass]', 'Xala Pass'], ['.side [data-act=codex]', 'Codex'],
    ['.side [data-act=achievements]', 'Succès'], ['.side [data-act=event]', 'Événement'], ['.side [data-act=islands]', 'Archipel'],
    ['.gear', 'Paramètres'], ['.lvl-badge', 'Profil'],
  ];
  for (const [sel, title] of buttons) {
    await page.locator(sel).first().click();
    await expect(page.locator('.sheet h2').last()).toContainText(title);
    // parcourt les onglets
    const tabs = page.locator('.sheet .tab');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await page.waitForTimeout(60); }
    await closeAll(page);
  }
  expect(errors).toEqual([]);
});

test('œuf : incubation, éclosion animée et installation', async ({ page }) => {
  await start(page);
  await closeAll(page);
  await page.locator('.nav-btn[data-act=nursery]').click();
  await page.locator('.sheet [data-act=place]').first().click();
  await ff(page, 40_000);
  await page.locator('.sheet [data-act=hatch]').click();
  await expect(page.locator('.cinematic')).toBeVisible();
  for (let i = 0; i < 3; i++) { await page.locator('.cinematic').click(); await page.waitForTimeout(200); }
  await expect(page.locator('.cinematic h1')).toHaveText('Feuillot');
  await page.waitForTimeout(400);
  await page.locator('.cinematic').click();
  const s = await state(page);
  expect(s.monsters.length).toBe(2);
  expect(s.codex.feuillot.owned).toBe(true);
  expect(s.monsters[1].habitatUid).toBeTruthy();
  expect(errors).toEqual([]);
});

test('ferme : planter, récolter, nourrir et quête de progression', async ({ page }) => {
  await start(page);
  await closeAll(page);
  const farm = await page.evaluate(() => { const s = window.xala!.game.state; const f = s.buildings.find((b) => b.defId === 'farm')!; window.xala!.app.select(f.uid); return f.uid; });
  await page.locator('.ctx-act[data-act=plant]').click();
  await page.locator('.sheet [data-act=plant][data-id=ble_xala]').click();
  await ff(page, 35_000);
  await page.locator('.ctx-act[data-act=harvest]').click();
  let s = await state(page);
  expect(s.stats.harvests).toBe(1);
  expect(s.buildings.find((b: { uid: string }) => b.uid === farm).crop).toBeNull();
  // quête d'histoire
  await page.locator('.quest-tracker').click();
  await page.locator('.sheet [data-act=claim]').first().click();
  await expect(page.locator('.sheet h2').last()).toContainText('Quête terminée');
  await closeAll(page);
  // nourrir
  await page.locator('.nav-btn[data-act=xalamons]').click();
  await page.locator('.sheet .mcard').first().click();
  await page.locator('.sheet [data-act=feed][data-n="10"]').click();
  s = await state(page);
  expect(s.monsters[0].level).toBeGreaterThan(1);
  expect(s.stats.feeds).toBe(10);
  expect(errors).toEqual([]);
});

test('construction : placement libre puis déplacement', async ({ page }) => {
  await start(page);
  await closeAll(page);
  const before = (await state(page)).buildings.length;
  await page.locator('.nav-btn[data-act=build]').click();
  await page.locator('.sheet .tab', { hasText: 'Production' }).click();
  await page.locator('.sheet [data-act=pick][data-id=farm]').click();
  await expect(page.locator('.place-bar')).toBeVisible();
  await page.locator('.place-bar [data-act=ok]').click();
  const s = await state(page);
  expect(s.buildings.length).toBe(before + 1);
  const uid = s.buildings[s.buildings.length - 1].uid;
  await page.locator('.ctx-act[data-act=move]').click();
  await page.evaluate(() => { const w = window.xala!.app.world; const p = w.placing!; for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [2, 0], [0, 2]]) { w.movePlacement(p.x + dx, p.y + dy); if (w.placing!.valid) break; } });
  await page.locator('.place-bar [data-act=ok]').click();
  const moved = (await state(page)).buildings.find((b: { uid: string }) => b.uid === uid);
  expect(moved.x !== s.buildings[s.buildings.length - 1].x || moved.y !== s.buildings[s.buildings.length - 1].y).toBe(true);
  expect(errors).toEqual([]);
});

test('combat de campagne complet (automatique) avec récompenses', async ({ page }) => {
  await start(page);
  await closeAll(page);
  await page.locator('.nav-btn[data-act=combat]').click();
  await page.locator('.sheet [data-act=stage][data-ref="1-1"]').click();
  await page.locator('.sheet [data-act=go]').click();
  await expect(page.locator('.battle-ui')).toBeVisible();
  // premier tour manuel : compétence
  await page.locator('.skill').first().click({ timeout: 15_000 });
  await page.locator('[data-act=speed]').click();
  await page.locator('[data-act=speed]').click();
  await page.locator('[data-act=auto]').click();
  await expect(page.locator('.sheet h2').last()).toHaveText(/Victoire|Défaite/, { timeout: 90_000 });
  const s = await state(page);
  expect(s.stats.battles_played).toBe(1);
  expect(s.activeBattle).toBeNull();
  await page.locator('.sheet [data-act=ok]').click();
  await expect(page.locator('.battle-ui')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('boss et arène', async ({ page }) => {
  await start(page);
  await closeAll(page);
  await page.evaluate(() => { window.xala!.game.state.resources.energy = 100; });
  await page.locator('.nav-btn[data-act=combat]').click();
  await page.locator('.sheet .tab', { hasText: 'Boss' }).click();
  await page.locator('.sheet [data-act=boss]').click();
  await page.locator('[data-act=speed]').click();
  await page.locator('[data-act=speed]').click();
  await page.locator('[data-act=auto]').click();
  await expect(page.locator('.sheet h2').last()).toHaveText(/assaut/, { timeout: 90_000 });
  expect((await state(page)).boss.damage).toBeGreaterThan(0);
  await page.locator('.sheet [data-act=ok]').click();
  await page.locator('.sheet .tab', { hasText: 'Arène' }).click();
  await page.locator('.sheet [data-act=arena]').first().click();
  await page.locator('[data-act=speed]').click();
  await page.locator('[data-act=auto]').click();
  await expect(page.locator('.sheet h2').last()).toHaveText(/Victoire|Défaite/, { timeout: 90_000 });
  expect((await state(page)).stats.arena_played).toBe(1);
  expect(errors).toEqual([]);
});

test('boutique, achat intégré (test), double récompense impossible, restauration', async ({ page }) => {
  await start(page);
  await closeAll(page);
  await page.locator('.nav-btn[data-act=shop]').click();
  await page.locator('.sheet [data-act=buy][data-id=egg_braisou]').click();
  await closeAll(page);
  let s = await state(page);
  expect(s.eggs.some((e: { speciesId: string }) => e.speciesId === 'braisou')).toBe(true);
  const gems = s.resources.gems;
  await page.locator('.pill[data-res=gems]').click();
  await page.locator('.sheet [data-act=buy][data-id=iap_gems_80]').click();
  await page.locator('.sheet [data-act=yes]').click();
  await page.waitForFunction((g) => window.xala!.game.state.resources.gems === g + 80, gems);
  // rejouer le même reçu ne donne rien
  const again = await page.evaluate(() => { const s = window.xala!.game.state; const id = s.iap.processedOrders[0]; return window.xala!.game.act('iap.grant', { receipt: { orderId: id, sku: 'gems_80', purchaseToken: 'x', purchaseTime: Date.now(), source: 'mock' } }); });
  expect(again).toBe(false);
  // achat non consommable puis restauration sur une nouvelle partie
  await page.locator('.sheet .tab', { hasText: 'Cosmétiques' }).click();
  await page.locator('.sheet [data-act=buy][data-id=iap_cosmetic_aurora]').click();
  await page.locator('.sheet [data-act=yes]').click();
  await page.waitForFunction(() => window.xala!.game.state.unlocks.includes('skin_aurore_iap'));
  await page.evaluate(() => { const s = window.xala!.game.state; s.unlocks = []; s.iap.entitlements = []; });
  await page.locator('.sheet [data-act=restore]').click();
  await page.waitForFunction(() => window.xala!.game.state.unlocks.includes('skin_aurore_iap'));
  s = await state(page);
  expect(s.resources.gems).toBe(gems + 80);
  expect(errors).toEqual([]);
});

test('élevage via l’interface puis évolution animée', async ({ page }) => {
  await start(page);
  await closeAll(page);
  await page.evaluate(() => {
    const { game } = window.xala!;
    const s = game.state;
    s.player.level = 6; s.resources.coins = 200000; s.resources.energy = 200; s.resources.essence = 5;
    s.monsters[0].level = 10;
    s.monsters.push({ ...s.monsters[0], uid: 'mtest1', speciesId: 'feuillot', level: 5, habitatUid: null });
  });
  await page.evaluate(() => { const { game } = window.xala!; const spot = (() => { for (let x = 2; x < 15; x++) for (let y = 2; y < 15; y++) { try { return game.act('building.build', { defId: 'breeding', island: 'verdante', x, y }); } catch { /* suivant */ } } return null; })(); return spot; });
  await ff(page, 120_000);
  await page.locator('.nav-btn[data-act=breeding]').click();
  await page.locator('.sheet .mcard[data-act=pick]').nth(0).click();
  await page.locator('.sheet .mcard[data-act=pick]').nth(1).click();
  await page.locator('.sheet [data-act=start]').click();
  let s = await state(page);
  expect(s.stats.breeds).toBe(1);
  await ff(page, 13 * 3600_000);
  await page.locator('.sheet [data-act=collect]').click();
  s = await state(page);
  expect(s.eggs.length).toBeGreaterThanOrEqual(2);
  await closeAll(page);
  // évolution
  await page.locator('.nav-btn[data-act=xalamons]').click();
  await page.locator('.sheet .mcard[data-uid="' + s.monsters[0].uid + '"]').click();
  await page.locator('.sheet [data-act=evolve]').click();
  await expect(page.locator('.cinematic')).toBeVisible();
  await page.waitForTimeout(2200);
  await page.locator('.cinematic').click();
  s = await state(page);
  expect(s.monsters[0].stage).toBe(1);
  expect(errors).toEqual([]);
});

test('sauvegarde : rechargement et fermeture brutale', async ({ page, context }) => {
  await start(page);
  await closeAll(page);
  await page.locator('.side [data-act=collectAll]').click();
  await page.locator('.nav-btn[data-act=nursery]').click();
  await page.locator('.sheet [data-act=place]').first().click();
  await page.waitForTimeout(800);
  const s1 = await state(page);
  // fermeture brutale : pas de beforeunload/pagehide
  await page.close({ runBeforeUnload: false });
  const page2 = await context.newPage();
  await start(page2, false);
  const s2 = await state(page2);
  expect(s2.saveId).toBe(s1.saveId);
  expect(s2.resources.coins).toBe(s1.resources.coins);
  expect(s2.buildings.find((b: { defId: string }) => b.defId === 'nursery').nursery.length).toBe(1);
  // rechargement normal
  await page2.reload();
  await page2.locator('#loading.ready').waitFor({ timeout: 60_000 });
  await page2.locator('#loading').click();
  await page2.waitForFunction(() => !!window.xala);
  const s3 = await page2.evaluate(() => window.xala!.game.state.saveId);
  expect(s3).toBe(s1.saveId);
});

test('îles, quêtes quotidiennes, pass, paramètres de qualité', async ({ page }) => {
  await start(page);
  await closeAll(page);
  await page.evaluate(() => { const s = window.xala!.game.state; s.player.level = 4; s.resources.coins = 50000; s.pass.xp = 900; });
  await page.locator('.side [data-act=islands]').click();
  await page.locator('.sheet [data-act=unlock][data-id=volcanique]').click();
  expect((await state(page)).islands.volcanique.unlocked).toBe(true);
  await page.locator('.side [data-act=pass]').click();
  await page.locator('.sheet [data-act=claim]').first().click();
  await closeAll(page);
  expect((await state(page)).pass.claimedFree).toContain(1);
  await page.locator('.gear').click();
  for (const q of ['low', 'medium', 'high', 'auto']) {
    await page.locator(`.sheet [data-act=q][data-v=${q}]`).click();
    await page.waitForTimeout(200);
  }
  expect((await state(page)).settings.quality).toBe('auto');
  expect(errors).toEqual([]);
});

test('performance : la boucle de rendu tourne sans erreur', async ({ page }) => {
  await start(page);
  await closeAll(page);
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const t0 = performance.now();
    await new Promise<void>((r) => { const f = () => { frames++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    return { fps: frames / 4, calls: window.xala!.app.world.renderer.info.render.calls, tris: window.xala!.app.world.renderer.info.render.triangles, quality: window.xala!.app.qualityLevel };
  });
  console.log('Perf (rendu logiciel SwiftShader) :', fps);
  expect(fps.fps).toBeGreaterThan(1);
  expect(fps.calls).toBeLessThan(400);
  expect(errors).toEqual([]);
});
