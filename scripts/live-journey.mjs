// API-level journey against the DEPLOYED stack with real Bedrock and real PayPal sandbox, covering the unhappy paths.
const BASE = process.env.BASE || JSON.parse((await import('node:fs')).readFileSync(new URL('../deploy-output.json', import.meta.url))).cloudFrontUrl;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); return { s: r.status, j }; };
const say = (...a) => console.log(...a);
const rnd = Math.random().toString(16).slice(2, 8);
// 1. invalid recipient email is refused at the door, with a message that says how to fix it
let r = await call('POST', '/api/cases', { name: 'Typo Patient', email: 'typo@@paypal', hospital: 'H', procedure: 'P', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery' });
say('1. invalid email ->', r.s, JSON.stringify(r.j));
// 2. a patient whose PayPal address has no account
r = await call('POST', '/api/cases', { name: 'Unclaimed Patient', email: `nobody.${rnd}@gmail.com`, hospital: 'Northfield Royal Infirmary', procedure: 'Cataract surgery', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery' });
const id = r.j.id; say('2. created', r.s, id, 'state', r.j.eval.state);
r = await call('POST', `/api/cases/${id}/claim`, { narrative: 'I drove 40 miles each way, so 80 miles. Parking was 9 pounds with a ticket. I lost 6 hours of pay at 15 pounds an hour, payslip available.' });
say('3. claim ->', r.s, r.j.claim?.status, r.j.claim?.priced?.payableTotal);
if (r.j.claim?.status === 'needs_input') { say('   agent asked:', r.j.claim.pendingQuestion); r = await call('POST', `/api/cases/${id}/claim/reply`, { message: 'All figures are right and I hold the documents.' }); say('   after reply ->', r.j.claim?.status); if (r.j.claim?.status === 'needs_input') r = await call('POST', `/api/cases/${id}/claim/skip`); }
r = await call('POST', `/api/cases/${id}/claim/confirm`); say('4. filed ->', r.s, r.j.claim?.status, 'payable', r.j.claim?.priced?.payableTotal);
r = await call('POST', `/api/cases/${id}/advance`, { days: 29 }); say('5. day 29 ->', r.j.eval.state, 'payout', JSON.stringify({ status: r.j.payout?.status, batch: r.j.payout?.batchId, amount: r.j.payout?.amount, currency: r.j.payout?.currency }));
// 6. replay protection: hammer every route that could re-fire the payout
for (let i = 0; i < 4; i++) { await call('POST', `/api/cases/${id}/advance`, { days: 1 }); await call('POST', `/api/cases/${id}/refresh`); }
const mid = await call('GET', `/api/cases/${id}`); say('6. after 4 replays, payout batch is still', mid.j.payout?.batchId, '| payout events:', mid.j.events.filter((e) => e.type === 'payout').length);
// 7. UNCLAIMED surfaces
let p; for (let i = 0; i < 12; i++) { await sleep(5000); p = (await call('POST', `/api/cases/${id}/refresh`)).j; if (['UNCLAIMED', 'SUCCESS', 'FAILED'].includes(p.payout?.status)) break; }
say('7. PayPal says:', p.payout.status, '|', p.payout.error?.slice(0, 120));
say('   event:', p.events.filter((e) => e.type === 'payout').at(-1).text);
// 8. recover: patient gives a registered address; the unclaimed item is cancelled, then re-sent once
let fix; for (let i = 0; i < 12; i++) { fix = await call('POST', `/api/cases/${id}/email`, { email: 'sb-patient@personal.example.com' }); if (fix.s !== 409) break; say('   (PayPal: batch still processing, retrying)', fix.j.error?.slice(0, 80)); await sleep(6000); }
say('8. corrected email ->', fix.s, fix.j.payout?.status, fix.j.payout?.batchId);
for (let i = 0; i < 12; i++) { await sleep(5000); p = (await call('POST', `/api/cases/${id}/refresh`)).j; if (p.payout?.status === 'SUCCESS') break; }
say('9. final ->', p.payout.status, 'GBP', p.payout.amount, 'batch', p.payout.batchId);
say('\nTIMELINE'); for (const e of p.events.filter((e) => ['payout', 'email', 'breach', 'claim'].includes(e.type))) say(' -', e.text);
// 10. exemplar: the lost-write recovery that happened for real at deploy time
const a = (await call('GET', '/api/cases/seed-aisha')).j; say('\n10. exemplar events mentioning an adopted batch:'); for (const e of a.events.filter((e) => /already held|adopted/.test(e.text))) say(' -', e.text);
