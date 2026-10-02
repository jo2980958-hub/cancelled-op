// usage: node scripts/shoot.mjs <outdir> [widths=360,768,1280,1920] [themes=light,dark] [views=all] [scale=1]
import { createRequire } from 'node:module';
const require = createRequire('/tmp/claude-1000/pw/');
const { chromium } = require('playwright-core');
import { mkdirSync } from 'node:fs';
const [out, widthsArg = '360,768,1280,1920', themesArg = 'light,dark', viewsArg = 'all', scale = '1'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://localhost:15173';
const ALL = { home: '#/', report: '#/report', track: '#/case/seed-priya/track', why: '#/case/seed-aisha/why', claim_open: '#/case/seed-helen/claim', claim_paid: '#/case/seed-aisha/claim', claim_new: '#/case/seed-daniel/claim', offers: '#/case/seed-tomasz/offers', trust: '#/trust', evidence: '#/evidence' };
const views = viewsArg === 'all' ? Object.keys(ALL) : viewsArg.split(',');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], executablePath: process.env.CHROME || undefined });
const report = [];
for (const theme of themesArg.split(',')) for (const w of widthsArg.split(',').map(Number)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 780 : 900 }, colorScheme: theme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('cop.theme', t); } catch {} }, theme);
  for (const v of views) {
    await page.goto(BASE + '/' + ALL[v], { waitUntil: 'networkidle' });
    if (scale !== '1') await page.addStyleTag({ content: `html{font-size:${Number(scale) * 100}% !important}` });
    if (v === 'trust') await page.waitForSelector('.kpis', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(350);
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    report.push(`${theme} ${w}px ${v}${scale !== '1' ? ' x' + scale : ''}: scrollWidth ${over.sw} / ${over.iw} ${over.sw > over.iw ? 'HORIZONTAL SCROLL' : 'ok'}`);
    await page.screenshot({ path: `${out}/${theme}-${w}-${v}${scale !== '1' ? '-x' + scale : ''}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(report.join('\n'));
