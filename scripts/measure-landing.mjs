// Patient-facing landing (Overview) height and visible word count at 360 and 1280.
import { createRequire } from 'node:module';
const require = createRequire('/tmp/claude-1000/pw/');
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'https://drw0b3axbb84o.cloudfront.net';
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [w, h] of [[360, 780], [1280, 900]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(BASE + '/#/', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const m = document.querySelector('main'); const words = (m.innerText.match(/\S+/g) || []).length; return { height: document.documentElement.scrollHeight, words, mainWords: words }; });
  const total = await p.evaluate(() => (document.body.innerText.match(/\S+/g) || []).length);
  console.log(`${w}px: page height ${r.height}px, words in main ${r.words}, words on the whole page ${total}`);
}
await b.close();
