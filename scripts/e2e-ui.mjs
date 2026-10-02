// Drives the real UI through the whole patient journey against the running local stack (real Bedrock + PayPal sandbox).
import { createRequire } from 'node:module';
const require = createRequire('/tmp/claude-1000/pw/');
const { chromium } = require('playwright-core');
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:15173';
const out = process.argv[2] || 'shots/e2e'; mkdirSync(out, { recursive: true });
const log = []; const ok = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); console.log(log.at(-1)); };
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE + '/#/report', { waitUntil: 'networkidle' });
// 1. validation errors sit next to the fields
await page.getByRole('button', { name: 'Start my 28-day clock' }).click();
ok('empty form shows field-level errors', (await page.locator('.err').count()) >= 4, (await page.locator('.err').first().innerText()));
await page.screenshot({ path: out + '/01-report-errors.png', fullPage: true });
// 2. fill and submit
await page.fill('#f-name', 'Marcus Webb'); await page.fill('#f-email', 'sb-patient@personal.example.com'); await page.fill('#f-hospital', 'Kestrel Park University Hospital'); await page.fill('#f-procedure', 'Knee replacement'); await page.selectOption('#f-setting', 'inpatient');
await page.getByRole('button', { name: 'Start my 28-day clock' }).click();
await page.waitForSelector('text=The clock is running.', { timeout: 15000 });
ok('case created and clock started at day 0', ['28', '27'].includes((await page.locator('.clock .num').innerText()).trim()));
const url = page.url(); ok('private link is in the URL', /#\/case\/c[0-9a-f]{8}\/track/.test(url), url);
await page.screenshot({ path: out + '/02-created.png', fullPage: true });
// 3. persistence: reload and find it again
await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.clock');
ok('after reload the case is still there', (await page.locator('.clock h1').innerText()).includes('Marcus Webb'));
await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
ok('saved on this device: listed under Your cases', (await page.locator('.chipgroup', { hasText: 'Your cases' }).count()) === 1);
// 4. claim with the real agent
await page.locator('.card', { hasText: 'Claim your costs' }).click();
await page.fill('#acct', 'I drove 60 miles each way to the hospital, so 120 miles. Parking was 14 pounds and I kept the ticket. I took the day unpaid, 8 hours at 18 pounds an hour, payslip available. I paid a childminder 50 pounds, receipt kept.');
await page.getByRole('button', { name: 'Add up my costs' }).click();
await page.waitForSelector('text=How the costs were priced, text=Your answer', { timeout: 90000 }).catch(() => {});
await page.waitForFunction(() => document.body.innerText.includes('How the costs were priced') || document.body.innerText.includes('Your answer'), null, { timeout: 90000 });
await page.screenshot({ path: out + '/03-claim-after-agent.png', fullPage: true });
let txt = await page.innerText('main');
if (txt.includes('Your answer') && !txt.includes('File my claim')) { // the agent asked something: answer it
  const q = await page.locator('.bubble.agent').last().innerText(); console.log('agent asked:', q.replace(/\n/g, ' '));
  await page.fill('#reply', 'Yes. The figures are right and I hold every document.'); await page.getByRole('button', { name: 'Send my answer' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('File my claim') || document.body.innerText.includes('Send my answer'), null, { timeout: 90000 });
  txt = await page.innerText('main');
  if (!txt.includes('File my claim')) { await page.getByRole('button', { name: /Skip this/ }).click(); await page.waitForSelector('text=File my claim'); }
}
ok('claim reaches review with priced lines', (await page.locator('.line').count()) >= 3, (await page.locator('.totalbar').innerText()).replace(/\s+/g, ' '));
await page.screenshot({ path: out + '/04-claim-review.png', fullPage: true });
// 5. file with the two-step confirmation
await page.getByRole('button', { name: 'File my claim' }).click();
await page.screenshot({ path: out + '/05-confirm-step.png' });
await page.getByRole('button', { name: /Yes, file my claim/ }).click();
await page.waitForSelector('.notice.ok:has-text("Your claim is filed")');
ok('filing is unmistakably confirmed', true);
await page.screenshot({ path: out + '/06-filed.png', fullPage: true });
// 6. demo: let day 28 pass -> automatic payout
await page.locator('.tabs').getByRole('button', { name: 'Watch the 28 days' }).click();
await page.locator('summary', { hasText: 'Demo controls' }).click(); await page.getByRole('button', { name: 'Let day 28 pass' }).click();
await page.waitForFunction(() => document.querySelector('.clock .stamp')?.innerText.toUpperCase().includes('PROMISE BROKEN'), null, { timeout: 20000 });
await page.waitForSelector('.receipt', { timeout: 30000 });
ok('breach fires a payout receipt', true, (await page.locator('.rc-amt').innerText()).replace(/\s+/g, ' '));
await page.waitForFunction(() => document.querySelector('.rc-status')?.innerText.includes('Paid'), null, { timeout: 90000 }).catch(() => {});
const status = (await page.locator('.rc-status').innerText()).trim(); ok('PayPal settles the payout to SUCCESS', /Paid/.test(status), status);
await page.screenshot({ path: out + '/07-paid.png', fullPage: true });
// 7. delete is refused once paid (no delete control)
ok('paid case offers no delete', (await page.getByRole('button', { name: 'Delete this case' }).count()) === 0 && (await page.locator('summary', { hasText: 'Remove this case' }).count()) === 0);
ok('no console errors', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
console.log('\nSUMMARY ' + log.filter((l) => l.startsWith('PASS')).length + ' pass, ' + log.filter((l) => l.startsWith('FAIL')).length + ' fail');
