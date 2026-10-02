// Runs the REAL Bedrock claim agent on each seeded narrative and records the result to src/seed-claims.json,
// so restoring the examples is instant and deterministic. Re-run to refresh.
import '../test/envload.js';
import { writeFileSync } from 'node:fs';
import { SEEDS } from '../src/seed.js';
import { newClaim, runAgent } from '../src/agent.js';
import { readFileSync, existsSync } from 'node:fs';
const F = new URL('../src/seed-claims.json', import.meta.url);
const out = existsSync(F) ? JSON.parse(readFileSync(F, 'utf8')) : {};
const only = process.env.ONLY;
for (const s of SEEDS.filter((x) => x.claim && (!only || x.id === only))) {
  const c = newClaim(s.claim); await runAgent(c, s.claim);
  let guard = 0; while (c.status === 'needs_input' && !s.leaveOpen && guard++ < 2) { console.log(s.id, 'agent asked:', c.pendingQuestion); await runAgent(c, 'Yes, I have the documents and the figures above are right.'); }
  const { messages, ...rest } = c; out[s.id] = rest;
  console.log(s.id, c.status, 'payable', c.priced.payableTotal, 'lines', c.priced.lines.map((l) => `${l.category}:${l.status}`).join(','), 'steps', c.steps.length);
}
writeFileSync(new URL('../src/seed-claims.json', import.meta.url), JSON.stringify(out, null, 1));
