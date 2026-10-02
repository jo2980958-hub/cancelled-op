// Measured checks against the real running UI: text size floor, control size floor, visible focus ring, and "no dead buttons".
import { createRequire } from 'node:module';
const require = createRequire('/tmp/claude-1000/pw/');
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:15173';
const VIEWS = ['#/', '#/report', '#/case/seed-priya/track', '#/case/seed-aisha/why', '#/case/seed-helen/claim', '#/case/seed-tomasz/offers', '#/trust', '#/evidence'];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
let bad = 0; const say = (ok, m) => { if (!ok) bad++; console.log((ok ? 'PASS  ' : 'FAIL  ') + m); };
for (const [label, vp] of [['phone 360', { width: 360, height: 780 }], ['desktop 1280', { width: 1280, height: 900 }]]) {
  const page = await (await browser.newContext({ viewport: vp })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  let minFont = 99, minCtl = { w: 999, h: 999, name: '' }, smallFonts = new Set(), ringMissing = [];
  for (const v of VIEWS) {
    await page.goto(BASE + '/' + v, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const fonts = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const n = walker.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.sr') || el.closest('svg')) continue; fonts.push([parseFloat(cs.fontSize), n.textContent.trim().slice(0, 30)]); }
      const ctl = [...document.querySelectorAll('button, input, select, textarea, summary, a[href]')].filter((e) => e.offsetParent !== null && !e.closest('.sr') && !e.classList.contains('sr')).map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), (e.innerText || e.id || e.tagName).slice(0, 24)]; });
      return { fonts, ctl };
    });
    for (const [f, t] of r.fonts) { if (f < minFont) minFont = f; if (f < 13.3) smallFonts.add(`${f}px "${t}"`); }
    for (const [w, h, n] of r.ctl) if (h < minCtl.h) minCtl = { w, h, name: n };
    // keyboard: tab through the first 40 stops and require a visible outline on each
    await page.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const st = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { tag: e.tagName, name: (e.innerText || e.id || '').slice(0, 20), w: cs.outlineWidth, s: cs.outlineStyle, fv: e.matches(':focus-visible'), vis: e.getBoundingClientRect().height > 0 }; });
      if (st && st.vis && st.fv && (st.s === 'none' || parseFloat(st.w) < 2)) ringMissing.push(`${v} ${st.tag} "${st.name}"`);
    }
    // no dead buttons: every enabled, visible button either changes the DOM/URL/theme or issues a request
    const names = await page.$$eval('main button:not([disabled])', (bs) => bs.filter((b) => b.offsetParent !== null).map((b) => (b.innerText || '').trim().slice(0, 40)));
    const skip = /delete|restore|file my claim|let day 28|move forward|move to day|add up|send my|skip|record|cancel and|send the payout|start my|read my|use an example|decline|postpone|cancelled again|copy/i;
    for (const nme of [...new Set(names)].filter((n) => n && !skip.test(n))) {
      await page.goto(BASE + '/' + v, { waitUntil: 'networkidle' });
      const before = await page.evaluate(() => document.body.innerHTML.length + location.hash + document.documentElement.getAttribute('data-theme'));
      let req = 0; const h = () => req++; page.on('request', h);
      const loc = page.locator('main button:not([disabled])').filter({ hasText: nme }).first();
      if ((await loc.count()) === 0) { page.off('request', h); continue; }
      await loc.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(450);
      const after = await page.evaluate(() => document.body.innerHTML.length + location.hash + document.documentElement.getAttribute('data-theme'));
      page.off('request', h);
      if (before === after && req === 0) { bad++; console.log(`FAIL  dead button on ${v}: "${nme}"`); }
    }
  }
  say(minFont >= 13.3, `${label}: smallest rendered text ${minFont}px (floor 13.3px = 10pt)${smallFonts.size ? ' ' + [...smallFonts].slice(0, 4).join(', ') : ''}`);
  say(minCtl.h >= 37, `${label}: smallest control ${minCtl.w}x${minCtl.h}px "${minCtl.name}" (floor 28x28pt = 37px)`);
  say(ringMissing.length === 0, `${label}: every focused control has a visible focus ring${ringMissing.length ? ': ' + ringMissing.slice(0, 5).join('; ') : ''}`);
  say(errs.length === 0, `${label}: no page errors${errs.length ? ' ' + errs[0] : ''}`);
}
await browser.close(); console.log(bad ? `\n${bad} problem(s)` : '\nall checks passed');
