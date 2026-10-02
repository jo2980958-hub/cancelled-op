import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../src/handler.js';
import { fakeDeps, baseInput } from './helpers.js';

const call = (deps, method, path, body, headers = {}) => handler({ rawPath: path, headers, body: body ? JSON.stringify(body) : '', requestContext: { http: { method } } }, {}, deps);

test('GET /api/state auto-seeds six fictional cases and returns the exact verified figures', async () => {
  const f = fakeDeps(); f.deps.converse = async () => ({ output: { message: { role: 'assistant', content: [{ text: 'ok' }] } } });
  const r = await call(f.deps, 'GET', '/api/state'); assert.equal(r.statusCode, 200);
  const b = JSON.parse(r.body);
  assert.equal(b.cases.length, 6);
  assert.equal(b.evidence.breach.notTreated, 4821); assert.equal(b.evidence.breach.cancelled, 21456); assert.equal(b.evidence.breach.pct, '22.5%');
  assert.equal(b.evidence.cancellations.count, 22029); assert.equal(b.evidence.cancellations.previousQuarter, 23056);
  assert.equal(b.evidence.hospitalCost.daycase.low, 458); assert.equal(b.evidence.hospitalCost.inpatient.high, 1144);
  assert.ok(b.cases.some((c) => c.id === 'seed-aisha' && c.payout?.batchId), 'exemplar paid through the engine');
  assert.ok(b.cases.some((c) => c.eval.state === 'ineligible'));
  assert.ok(b.cases.some((c) => c.eval.state === 'kept'));
});
test('4821 / 21456 really is 22.5%', () => { assert.equal(((4821 / 21456) * 100).toFixed(1), '22.5'); assert.equal(((22029 / 2226660) * 100).toFixed(4), '0.9893'); });
test('create -> offer -> 404s/400s have JSON errors and CORS', async () => {
  const { deps } = fakeDeps();
  let r = await call(deps, 'POST', '/api/cases', { ...baseInput, cancelledOn: '2026-10-01' }); assert.equal(r.statusCode, 201);
  const id = JSON.parse(r.body).id;
  r = await call(deps, 'POST', `/api/cases/${id}/offer`, { date: '2026-10-20' }); assert.equal(r.statusCode, 200); assert.equal(JSON.parse(r.body).eval.state, 'kept');
  r = await call(deps, 'GET', '/api/cases/nope'); assert.equal(r.statusCode, 404);
  r = await call(deps, 'POST', '/api/cases', { ...baseInput, email: 'x' }); assert.equal(r.statusCode, 400); assert.match(JSON.parse(r.body).error, /email/);
  assert.equal(r.headers['access-control-allow-origin'], '*');
  r = await call(deps, 'OPTIONS', '/api/cases'); assert.equal(r.statusCode, 204);
  r = await call(deps, 'GET', '/api/zzz'); assert.equal(r.statusCode, 404);
});
test('malformed JSON body is a 400, not a 500', async () => {
  const { deps } = fakeDeps(); const r = await handler({ rawPath: '/api/cases', headers: {}, body: '{oops', requestContext: { http: { method: 'POST' } } }, {}, deps);
  assert.equal(r.statusCode, 400);
});
test('webhook with an unverifiable signature is rejected 401 and changes nothing', async () => {
  const f = fakeDeps(); f.deps.paypal.verifyWebhook = async () => false;
  const r = await call(f.deps, 'POST', '/api/webhooks/paypal', { id: 'WH', event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', resource: {} });
  assert.equal(r.statusCode, 401);
});
test('webhook with a verified signature is applied', async () => {
  const f = fakeDeps(); f.deps.paypal.verifyWebhook = async () => true;
  const c = JSON.parse((await call(f.deps, 'POST', '/api/cases', { ...baseInput, cancelledOn: '2026-10-01' })).body);
  await call(f.deps, 'POST', `/api/cases/${c.id}/claim`, { narrative: 'I drove 68 miles, parking ticket 9.50, lost 8h at 22/h payslip.' });
  await call(f.deps, 'POST', `/api/cases/${c.id}/claim/confirm`);
  await call(f.deps, 'POST', `/api/cases/${c.id}/advance`, { days: 29 });
  const r = await call(f.deps, 'POST', '/api/webhooks/paypal', { id: 'WH9', event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', resource: { payout_batch_id: 'B1', payout_item_id: 'I9' } });
  assert.equal(JSON.parse(r.body).applied, 'SUCCESS');
});
test('EventBridge scheduled event runs the sweep', async () => {
  const { deps } = fakeDeps(); const r = await handler({ source: 'aws.events', 'detail-type': 'Scheduled Event' }, {}, deps);
  assert.equal(r.checked, 0);
});
