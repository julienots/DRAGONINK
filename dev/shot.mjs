import { chromium } from '@playwright/test';
const [url, out, w = '1000', h = '1400'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await p.goto(url);
try { await p.waitForFunction(() => window.__done === true, null, { timeout: 60000 }); } catch { logs.push('timeout waiting __done'); }
await p.waitForTimeout(Number(process.env.WAIT ?? 300));
await p.screenshot({ path: out });
console.log(logs.slice(0, 30).join('\n'));
await b.close();
