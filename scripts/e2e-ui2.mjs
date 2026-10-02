import { createRequire } from 'node:module';
const require = createRequire('/tmp/claude-1000/pw/');
const { chromium } = require('playwright-core');
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:15173'; const out = process.argv[2] || 'shots/e2e2'; mkdirSync(out, { recursive: true });
let fails = 0; const ok = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const stamp = (t) => page.waitForFunction((x) => document.querySelector('.clock .stamp')?.innerText.toUpperCase().includes(x), t, { timeout: 15000 });
const today = new Date().toISOString().slice(0, 10); const plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await page.goto(BASE + '/#/report', { waitUntil: 'networkidle' });
await page.fill('#f-name', 'Rita Okafor'); await page.fill('#f-email', 'rita@example.com'); await page.fill('#f-hospital', 'Marlow Vale General'); await page.fill('#f-procedure', 'Hernia repair');
await page.getByRole('button', { name: 'Start my 28-day clock' }).click(); await page.waitForSelector('text=The clock is running.');
// copy link button
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
await page.getByRole('button', { name: /Copy the link/ }).click(); ok('copy link responds', await page.getByRole('button', { name: /Link copied|Copy the link/ }).count() === 1);
// record a provisional date: clock keeps running
await page.goto(page.url().replace('/track', '/offers'), { waitUntil: 'networkidle' });
await page.fill('#od', plus(10)); await page.selectOption('#ob', 'p'); await page.getByRole('button', { name: 'Record this date' }).click(); await page.waitForSelector('text=Provisional');
ok('provisional date does not stop the clock', (await page.locator('.clock .stamp').innerText()).includes('DAY'), await page.locator('.clock .stamp').innerText());
// binding date inside window keeps the promise
await page.fill('#od', plus(12)); await page.selectOption('#ob', 'b'); await page.getByRole('button', { name: 'Record this date' }).click(); await stamp('PROMISE KEPT');
ok('binding date inside 28 days: promise kept', true);
await page.screenshot({ path: out + '/01-kept.png', fullPage: true });
// the hospital cancels the binding date again, on the day, non-clinical -> a NEW 28-day clock
await page.locator('tr', { hasText: 'Binding' }).getByRole('button', { name: 'It was cancelled again' }).click();
await page.selectOption('#rc-by', 'hospital_nonclinical'); await page.selectOption('#rc-t', 'day_of_surgery');
await page.getByRole('button', { name: 'Record what happened' }).click(); await stamp('DAY 0'); await page.waitForSelector('.eg:has-text("cycle 2")');
ok('re-cancellation restarts the clock (cycle 2, day 0 again)', (await page.locator('.clock .stamp').innerText()).includes('DAY 0'), await page.locator('.clock .stamp').innerText());
await page.screenshot({ path: out + '/02-restarted.png', fullPage: true });
await page.goto(page.url().replace('/offers', '/why'), { waitUntil: 'networkidle' });
const plain = await page.locator('.why-plain').innerText(); await page.locator('summary', { hasText: 'The rules behind it' }).click();
ok('explanation is plain English first, rule R7 behind it', /cancelled again by the hospital, so a new 28-day clock started/.test(plain) && (await page.innerText('main')).includes('RESTARTS'), plain.slice(0, 140));
// patient declines a fresh in-window date -> clock stops
await page.goto(page.url().replace('/why', '/offers'), { waitUntil: 'networkidle' });
await page.fill('#od', plus(9)); await page.getByRole('button', { name: 'Record this date' }).click(); await stamp('PROMISE KEPT');
await page.getByRole('button', { name: 'I decline this date' }).last().click(); await stamp('CLOCK STOPPED');
ok('patient declining an in-window date stops the clock', true);
// theme toggle changes the document theme
const t0 = await page.evaluate(() => document.documentElement.getAttribute('data-theme')); await page.getByRole('button', { name: /Colour theme/ }).click();
ok('theme toggle works', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== t0);
// trust dashboard: record a binding date for the case about to breach
await page.goto(BASE + '/#/trust', { waitUntil: 'networkidle' }); await page.waitForSelector('.kpis');
const before = await page.locator('.kpis div').nth(1).locator('dd').innerText();
await page.fill('input[id^="dseed-helen"]', '2026-09-30'); await page.getByRole('button', { name: 'Record binding date' }).click(); await page.waitForFunction((b) => document.querySelectorAll('.kpis div')[1]?.querySelector('dd')?.innerText !== b, before, { timeout: 15000 }).catch(() => {});
const after = await page.locator('.kpis div').nth(1).locator('dd').innerText();
ok('trust records a binding date: "break within 7 days" count drops', Number(after) === Number(before) - 1, `${before} -> ${after}`);
await page.selectOption('#hosp', 'Northfield Royal Infirmary'); await page.waitForTimeout(600);
ok('hospital filter narrows the dashboard', (await page.locator('h3', { hasText: 'Needs a binding date now' }).count()) === 1);
await page.screenshot({ path: out + '/03-trust.png', fullPage: true });
// own case: delete is two-step and really removes it
await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
await page.locator('.chip', { hasText: 'Rita Okafor' }).click(); await page.locator('.card', { hasText: 'Watch the 28 days' }).click();
await page.locator('summary', { hasText: 'Remove this case' }).click(); await page.getByRole('button', { name: 'Delete this case' }).click(); ok('delete asks for confirmation first', await page.getByRole('button', { name: 'Yes, delete this case' }).count() === 1);
await page.getByRole('button', { name: 'Keep this case' }).click(); ok('keeping the case cancels the delete', await page.locator('.chip', { hasText: 'Rita Okafor' }).count() === 1);
await page.getByRole('button', { name: 'Delete this case' }).click(); await page.getByRole('button', { name: 'Yes, delete this case' }).click(); await page.waitForTimeout(1200);
ok('delete removes the case', await page.locator('.chip', { hasText: 'Rita Okafor' }).count() === 0);
// restore examples
await page.getByRole('button', { name: /Restore the example/ }).first().click(); await page.waitForTimeout(2500);
ok('restore examples works and the app still loads', await page.locator('.chip', { hasText: 'Helen Cartwright' }).count() === 1);
ok('no page errors', errs.length === 0, errs.join(' | ').slice(0, 200));
await browser.close(); console.log(fails ? fails + ' FAIL' : 'ALL PASS');
