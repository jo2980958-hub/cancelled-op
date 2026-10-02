// Invokes the REAL Lambda handler locally with Function-URL-shaped events (real PayPal sandbox + real Bedrock, in-memory store).
import '../backend/test/envload.js';
process.env.STORE = 'memory'; process.env.NO_AUTOSEED = '1';
const { handler } = await import('../backend/src/handler.js');
const ev = (method, path, body, qs) => ({ version: '2.0', rawPath: path, queryStringParameters: qs, headers: { 'content-type': 'application/json', host: 'local' }, requestContext: { http: { method, path } }, body: body ? JSON.stringify(body) : undefined, isBase64Encoded: false });
const call = async (m, p, b, qs) => { const t0 = Date.now(); const r = await handler(ev(m, p, b, qs), {}, () => {}); return { s: r.statusCode, j: r.body ? JSON.parse(r.body) : {}, ms: Date.now() - t0, h: r.headers }; };
let r = await call('GET', '/api/health'); console.log('GET /api/health', r.s, JSON.stringify(r.j), r.ms + 'ms');
r = await call('GET', '/api/state'); console.log('GET /api/state (no cases yet, autoseed off)', r.s, 'cases:', r.j.cases.length, 'evidence breach:', r.j.evidence.breach.notTreated + '/' + r.j.evidence.breach.cancelled, r.j.evidence.breach.pct);
r = await call('POST', '/api/cases', { name: 'Local Lambda', email: 'sb-patient@personal.example.com', hospital: 'Test Hospital', procedure: 'Cataract surgery', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery' }); const id = r.j.id; console.log('POST /api/cases', r.s, id, r.j.eval.state, 'day', r.j.eval.day, 'deadline', r.j.eval.deadline);
console.log('CORS header present:', r.h['access-control-allow-origin']);
r = await call('POST', `/api/cases/${id}/claim`, { narrative: 'I drove 30 miles each way, 60 miles total. Parking was 7 pounds with a ticket. I lost 6 hours of pay at 15 pounds an hour, payslip available.' }); console.log('POST claim', r.s, r.j.claim.status, 'payable', r.j.claim.priced.payableTotal, r.ms + 'ms');
if (r.j.claim.status === 'needs_input') { r = await call('POST', `/api/cases/${id}/claim/skip`); }
r = await call('POST', `/api/cases/${id}/claim/confirm`); console.log('POST confirm', r.s, r.j.claim.status);
r = await call('POST', `/api/cases/${id}/advance`, { days: 29 }); console.log('POST advance 29', r.s, r.j.eval.state, 'payout', r.j.payout.status, r.j.payout.batchId);
for (let i = 0; i < 10; i++) { await new Promise((q) => setTimeout(q, 4000)); r = await call('POST', `/api/cases/${id}/refresh`); if (r.j.payout.status === 'SUCCESS') break; }
console.log('POST refresh ->', r.j.payout.status, JSON.stringify(r.j.payout.fee));
r = await call('GET', '/api/nope'); console.log('GET /api/nope', r.s, JSON.stringify(r.j));
r = await call('POST', '/api/cases', { name: '' }); console.log('POST invalid case', r.s, JSON.stringify(r.j));
r = await call('OPTIONS', '/api/cases'); console.log('OPTIONS', r.s);
r = await handler({ source: 'aws.events', 'detail-type': 'Scheduled Event' }, {}, () => {}); console.log('EventBridge sweep event ->', JSON.stringify(r));
