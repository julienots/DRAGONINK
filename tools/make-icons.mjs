// Génère les icônes PNG Android à partir de public/icon.svg (rendu Chromium).
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const p = await b.newPage();
for (const [d, s] of Object.entries(sizes)) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
  const dir = new URL(`../android/app/src/main/res/mipmap-${d}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  await p.screenshot({ path: new URL('ic_launcher.png', dir).pathname, omitBackground: true });
}
await b.close();
console.log('icônes générées');
