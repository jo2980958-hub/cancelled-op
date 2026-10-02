// REAL PayPal SANDBOX calls (fake money). Not part of `npm test`; run with `npm run test:sandbox`.
import './envload.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as pp from '../src/paypal.js';

const rid = () => randomBytes(4).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(batchId, want = ['SUCCESS', 'UNCLAIMED', 'FAILED', 'RETURNED', 'ONHOLD', 'BLOCKED'], tries = 8) {
  let b; for (let i = 0; i < tries; i++) { b = await pp.getBatch(batchId); if (want.includes(b.itemStatus)) return b; await sleep(2000); } return b;
}
const log = (...a) => console.log('   >', ...a);

test('sandbox: GBP payout is accepted and settles SUCCESS in GBP', async () => {
  const id = 'gbp-' + rid();
  const r = await pp.createPayout({ caseId: id, email: 'sb-patient@personal.example.com', amount: 12.34, currency: 'GBP', note: 'GBP probe' });
  log('create', JSON.stringify(r));
  const b = await settle(r.batchId); log('batch', JSON.stringify(b));
  assert.equal(b.itemStatus, 'SUCCESS'); assert.equal(b.amount.currency, 'GBP'); assert.equal(b.amount.value, '12.34');
});
test('sandbox: USD control payout settles SUCCESS', async () => {
  const r = await pp.createPayout({ caseId: 'usd-' + rid(), email: 'sb-patient@personal.example.com', amount: 5, currency: 'USD' });
  const b = await settle(r.batchId); log('batch', JSON.stringify(b));
  assert.equal(b.itemStatus, 'SUCCESS'); assert.equal(b.amount.currency, 'USD');
});
test('unhappy: invalid recipient email is refused locally before any API call', async () => {
  for (const bad of ['', 'plain', 'a@b', 'a b@c.com', '@x.com']) await assert.rejects(() => pp.createPayout({ caseId: 'x', email: bad, amount: 1, currency: 'GBP' }), /not valid/, bad);
});
test('unhappy: what PayPal itself does with a malformed receiver (bypassing our check)', async () => {
  const tok = await pp.getToken();
  const r = await fetch(process.env.PAYPAL_API + '/v1/payments/payouts', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender_batch_header: { sender_batch_id: 'bad-' + rid() }, items: [{ recipient_type: 'EMAIL', amount: { value: '1.00', currency: 'GBP' }, receiver: 'not-an-email', sender_item_id: 'bad1' }] }) });
  const j = await r.json(); log('status', r.status, JSON.stringify(j).slice(0, 400));
  assert.ok(r.status >= 400, 'PayPal should reject a malformed receiver');
});
test('REPLAYED BREACH: re-sending the same case adopts PayPal\'s original batch; a second payout is never created', async () => {
  const id = 'dup-' + rid();
  const a = await pp.createPayout({ caseId: id, email: 'sb-patient@personal.example.com', amount: 1, currency: 'GBP' });
  const b = await pp.createPayout({ caseId: id, email: 'sb-patient@personal.example.com', amount: 1, currency: 'GBP' });
  const c = await pp.createPayout({ caseId: id, email: 'sb-patient@personal.example.com', amount: 1, currency: 'GBP' });
  log('first', a.batchId, 'duplicate:', a.duplicate, '| replay 1', b.batchId, b.duplicate, '| replay 2', c.batchId, c.duplicate, '| stored PayPal-Request-Id', a.requestId);
  assert.equal(a.duplicate, false); assert.equal(b.batchId, a.batchId); assert.equal(c.batchId, a.batchId); assert.equal(b.duplicate, true);
  assert.equal(a.requestId, 'cop-' + id);
});
test('FINDING (characterisation): PayPal-Request-Id ALONE does not dedupe a payout in this sandbox; the sender_batch_id is the guard', async () => {
  const tok = await pp.getToken(); const reqId = 'req-' + rid();
  const mk = (batch) => fetch(process.env.PAYPAL_API + '/v1/payments/payouts', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', 'PayPal-Request-Id': reqId }, body: JSON.stringify({ sender_batch_header: { sender_batch_id: batch }, items: [{ recipient_type: 'EMAIL', amount: { value: '1.00', currency: 'GBP' }, receiver: 'sb-patient@personal.example.com', sender_item_id: batch }] }) }).then(async (r) => [r.status, (await r.json()).batch_header?.payout_batch_id]);
  const one = await mk('rqA-' + rid()), two = await mk('rqB-' + rid());
  log('same Request-Id, different sender_batch_id ->', JSON.stringify(one), JSON.stringify(two));
  assert.ok(one[0] === 201 && two[0] === 201 && one[1] !== two[1], 'two distinct batches were created: Request-Id did not dedupe');
});
test('unhappy: PayPal sandbox magic value ERRPYO002 in the note forces a create-time 403 SENDER_EMAIL_UNCONFIRMED', async () => {
  const tok = await pp.getToken();
  const r = await fetch(process.env.PAYPAL_API + '/v1/payments/payouts', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender_batch_header: { sender_batch_id: 'err-' + rid() }, items: [{ recipient_type: 'EMAIL', amount: { value: '1.00', currency: 'GBP' }, receiver: 'err@example.com', note: 'ERRPYO002', sender_item_id: 'err1' }] }) });
  const j = await r.json(); log('create', r.status, JSON.stringify(j.batch_header || j).slice(0, 300));
  assert.equal(r.status, 403); assert.equal(j.name, 'SENDER_EMAIL_UNCONFIRMED');
});
test('unhappy: try to provoke UNCLAIMED with addresses that have no sandbox account (observational)', async () => {
  const results = [];
  for (const email of ['nobody.' + rid() + '@gmail.com']) {
    try { const r = await pp.createPayout({ caseId: 'unc-' + rid(), email, amount: 1, currency: 'GBP' }); const b = await settle(r.batchId); results.push([email, b.itemStatus, b.errors]); }
    catch (e) { results.push([email, 'ERR', e.message]); }
  }
  log(JSON.stringify(results));
  assert.equal(results[0][1], 'UNCLAIMED'); assert.equal(results[0][2].name, 'RECEIVER_UNREGISTERED');
});
test('GET on a batch id that does not exist -> PayPalError 404', async () => {
  await assert.rejects(() => pp.getBatch('NOTAREALBATCH'), (e) => { log(e.status, e.ppName); return e.status === 404 || e.status === 400; });
});

test('recovery: UNCLAIMED payout -> cancel the unclaimed item -> re-send to a registered address -> SUCCESS', async () => {
  const a = await pp.createPayout({ caseId: 'rec-' + rid(), email: 'typo.' + rid() + '@gmail.com', amount: 3.21, currency: 'GBP' });
  const b = await settle(a.batchId); log('first', b.itemStatus, b.errors?.name);
  assert.equal(b.itemStatus, 'UNCLAIMED');
  let waited = 0; let bb = b; while (bb.batchStatus !== 'SUCCESS' && waited < 120000) { await sleep(5000); waited += 5000; bb = await pp.getBatch(a.batchId); }
  log('batch status before cancel:', bb.batchStatus, 'after', waited, 'ms');
  const c = await pp.cancelUnclaimed(b.itemId); log('cancel ->', c.transaction_status);
  const d = await settle(a.batchId, ['RETURNED', 'CANCELED', 'REFUNDED'], 6); log('after cancel', d.itemStatus);
  const r2 = await pp.createPayout({ caseId: 'rec-' + rid(), email: 'sb-patient@personal.example.com', amount: 3.21, currency: 'GBP' });
  const e = await settle(r2.batchId); log('resend', e.itemStatus, e.amount.currency, e.amount.value);
  assert.equal(e.itemStatus, 'SUCCESS');
});

test('unhappy: a payout PayPal FAILS (bogus PAYPAL_ID): batch DENIED, item FAILED RECEIVER_ACCOUNT_INVALID; the engine records it', async () => {
  const L = await import('../src/logic.js'); const { memoryStore } = await import('../src/store.js');
  const a = await pp.createPayout({ caseId: 'fail-' + rid(), email: 'ZZZZZZZZZZZZZ', recipientType: 'PAYPAL_ID', amount: 2, currency: 'GBP' });
  const b = await settle(a.batchId, ['FAILED', 'SUCCESS', 'UNCLAIMED'], 10); log('PayPal says', b.batchStatus, b.itemStatus, b.errors?.name);
  assert.equal(b.itemStatus, 'FAILED'); assert.equal(b.errors.name, 'RECEIVER_ACCOUNT_INVALID');
  const deps = { store: memoryStore(), now: () => Date.now(), paypal: pp, converse: async () => { throw new Error('unused'); } };
  const c = await L.createCase(deps, { name: 'F', email: 'f@example.com', hospital: 'H', procedure: 'P', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery' });
  const st = await deps.store.get(c.id); st.payout = { status: 'PENDING', amount: 2, currency: 'GBP', generation: 1, batchId: a.batchId }; await deps.store.put(st);
  const v = await L.refreshPayout(deps, c.id); log('engine status', v.payout.status, '|', v.events.at(-1).text);
  assert.equal(v.payout.status, 'FAILED'); assert.match(v.events.at(-1).text, /FAILED/);
});
