import { chromium } from '@playwright/test';
const [url, out, w = '412', h = '892'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, hasTouch: false });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await p.goto(url);
const steps = (process.env.STEPS ?? '').split(';').filter(Boolean);
await p.waitForTimeout(Number(process.env.LOADWAIT ?? 1500));
if (process.env.LOADSHOT) await p.screenshot({ path: process.env.LOADSHOT });
for (const s of steps) {
  const [kind, arg] = [s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1)];
  try {
    if (kind === 'wait') await p.waitForTimeout(+arg);
    else if (kind === 'click') await p.click(arg, { timeout: 8000 });
    else if (kind === 'eval') console.log('EVAL', JSON.stringify(await p.evaluate(arg)));
    else if (kind === 'shot') await p.screenshot({ path: arg });
    else if (kind === 'tapxy') { const [x, y] = arg.split(',').map(Number); await p.mouse.click(x, y); }
  } catch (e) { logs.push('STEP FAIL ' + s + ': ' + e.message.split('\n')[0]); }
}
await p.screenshot({ path: out });
console.log(logs.slice(0, 40).join('\n'));
await b.close();
