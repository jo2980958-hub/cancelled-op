import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';
import { PayPalError } from '../src/paypal.js';
import { fakeDeps, baseInput, LINES, finishScript } from './helpers.js';
const file = async (deps, id, text = CLAIM) => { await L.submitClaim(deps, id, text); return L.claimConfirm(deps, id); };

const CLAIM = 'I drove 68 miles, have the parking ticket for 9.50, and lost 8 hours at 22 pounds an hour, payslip available.';
async function breached(opts = {}) {
  const f = fakeDeps(opts); const c = await L.createCase(f.deps, { ...baseInput, cancelledOn: '2026-10-01' });
  return { ...f, id: c.id };
}

test('creating a case starts the clock at day 0 with deadline day 28', async () => {
  const { deps } = fakeDeps(); const c = await L.createCase(deps, { ...baseInput, cancelledOn: '2026-10-02' });
  assert.equal(c.eval.state, 'ticking'); assert.equal(c.eval.day, 0); assert.equal(c.eval.deadline, '2026-10-30');
});
test('default cancelledOn uses the London date: 23:30Z on 1 Oct is 2 Oct', async () => {
  const { deps } = fakeDeps({ nowIso: '2026-10-01T23:30:00Z' }); const c = await L.createCase(deps, baseInput);
  assert.equal(c.cancelledOn, '2026-10-02');
});
test('validation: invalid email, bad enums, bad date are 400s', async () => {
  const { deps } = fakeDeps();
  for (const bad of [{ email: 'nope' }, { cancelledBy: 'x' }, { timing: 'x' }, { setting: 'x' }, { cancelledOn: '2026-02-30' }, { name: ' ' }]) {
    await assert.rejects(() => L.createCase(deps, { ...baseInput, ...bad }), (e) => e.status === 400, JSON.stringify(bad));
  }
});
test('clinical cancellation is ineligible: no clock, offers and claims refused, no payout ever', async () => {
  const { deps, calls } = fakeDeps(); const c = await L.createCase(deps, { ...baseInput, cancelledBy: 'clinical', cancelledOn: '2026-01-01' });
  assert.equal(c.eval.state, 'ineligible');
  await assert.rejects(() => L.recordOffer(deps, c.id, { date: '2026-01-10' }), (e) => e.status === 400);
  await assert.rejects(() => L.submitClaim(deps, c.id, CLAIM), (e) => e.status === 400);
  await L.reconcile(deps, c.id); assert.equal(calls.createPayout.length, 0);
});
test('chase ladder fires once per rung and only while no date is offered', async () => {
  const { deps } = fakeDeps(); const c = await L.createCase(deps, { ...baseInput, cancelledOn: '2026-10-01' });
  await L.advance(deps, c.id, 8); await L.reconcile(deps, c.id);
  const chases = (await deps.store.get(c.id)).events.filter((e) => e.type === 'chase').map((e) => e.key);
  assert.deepEqual(chases, ['chase-c1-d3', 'chase-c1-d7']);
});
test('THE DEMO BEAT: day 28 passes with no date, claim on file -> exactly one payout of the priced amount', async () => {
  const { deps, calls, id } = await breached();
  await file(deps, id);
  let v = await L.advance(deps, id, 27); // fake now is 2 Oct = day 1; +27 = 29 Oct = day 28, the last day
  assert.equal(v.eval.state, 'ticking'); assert.equal(calls.createPayout.length, 0, 'no payout on day 28 itself');
  v = await L.advance(deps, id, 1);       // day 29
  assert.equal(v.eval.state, 'breached'); assert.equal(calls.createPayout.length, 1);
  assert.equal(calls.createPayout[0].amount, 30.6 + 9.5 + 176); assert.equal(calls.createPayout[0].currency, 'GBP');
  assert.equal(v.payout.status, 'PENDING'); assert.equal(v.payout.batchId, 'B1');
  await L.reconcile(deps, id); await L.reconcile(deps, id); await L.sweep(deps);
  assert.equal(calls.createPayout.length, 1, 'idempotent: reconcile/sweep never pay twice');
});
test('rebooking that lands on day 28 means no payout, ever', async () => {
  const { deps, calls, id } = await breached();
  await file(deps, id);
  await L.advance(deps, id, 10);
  await L.recordOffer(deps, id, { date: '2026-10-29' }); // day 28
  const v = await L.advance(deps, id, 30);
  assert.equal(v.eval.state, 'kept'); assert.equal(calls.createPayout.length, 0); assert.equal(v.payout, null);
});
test('rebooking on day 29 does not stop the payout', async () => {
  const { deps, calls, id } = await breached();
  await file(deps, id); await L.advance(deps, id, 5);
  await L.recordOffer(deps, id, { date: '2026-10-30' });
  const v = await L.advance(deps, id, 30);
  assert.equal(v.eval.state, 'breached'); assert.equal(calls.createPayout.length, 1);
});
test('offers: past date, pre-cancellation date and non-dates are refused', async () => {
  const { deps, id } = await breached(); await L.advance(deps, id, 10); // today 2026-10-11
  for (const d of ['2026-10-05', '2026-10-01', '2026-09-01', 'banana']) await assert.rejects(() => L.recordOffer(deps, id, { date: d }), (e) => e.status === 400, d);
});
test('patient declining an in-window date stops the clock without payout', async () => {
  const { deps, calls, id } = await breached(); await file(deps, id);
  await L.advance(deps, id, 3); await L.recordOffer(deps, id, { date: '2026-10-12' });
  await L.declineOffer(deps, id, 'o1'); const v = await L.advance(deps, id, 40);
  assert.equal(v.eval.state, 'declined'); assert.equal(calls.createPayout.length, 0);
});
test('breach with NO claim: no payout yet; claim submitted after breach fires it', async () => {
  const { deps, calls, id } = await breached();
  let v = await L.advance(deps, id, 29); assert.equal(v.eval.state, 'breached'); assert.equal(calls.createPayout.length, 0);
  v = await file(deps, id); assert.equal(calls.createPayout.length, 1); assert.equal(v.payout.status, 'PENDING');
});
test('claim that prices to zero (no evidence) never fires a payout', async () => {
  const { deps, calls, id } = await breached({ lines: [{ category: 'travel', description: 'taxi', amount_gbp: 50, evidence: 'none', justification: 'x' }] });
  await file(deps, id); const v = await L.advance(deps, id, 29);
  assert.equal(v.claim.priced.payableTotal, 0); assert.equal(calls.createPayout.length, 0);
});
test('extractor failure: 502, nothing saved', async () => {
  const f = fakeDeps(); const c = await L.createCase(f.deps, { ...baseInput, cancelledOn: '2026-10-01' });
  f.deps.converse = async () => { throw new Error('bedrock down'); };
  await assert.rejects(() => L.submitClaim(f.deps, c.id, CLAIM), (e) => e.status === 502);
  assert.equal((await f.deps.store.get(c.id)).claim, null);
});
test('UNHAPPY: PayPal rejects the recipient (invalid email) -> REJECTED, patient can fix, exactly one re-send with a new batch id', async () => {
  const f = fakeDeps(); const c = await L.createCase(f.deps, { ...baseInput, cancelledOn: '2026-10-01' });
  await file(f.deps, c.id);
  const st = await f.deps.store.get(c.id); st.patient.email = 'broken@@address'; await f.deps.store.put(st); // simulate bad address reaching PayPal
  let v = await L.advance(f.deps, c.id, 29);
  assert.equal(v.payout.status, 'REJECTED'); assert.match(v.payout.error, /bad email/);
  await assert.rejects(() => L.fixEmail(f.deps, c.id, 'still bad'), (e) => e.status === 400);
  v = await L.fixEmail(f.deps, c.id, 'good@example.com');
  assert.equal(v.payout.status, 'PENDING'); assert.equal(f.calls.createPayout.length, 2);
  assert.match(f.calls.createPayout[1].caseId, /-g2$/);
});
test('UNHAPPY: UNCLAIMED -> patient gives a corrected email -> unclaimed item cancelled, payout re-sent once to new address', async () => {
  const { deps, calls, id } = await breached(); await file(deps, id); await L.advance(deps, id, 29);
  await L.applyWebhook(deps, { id: 'W1', event_type: 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED', resource: { payout_batch_id: 'B1', payout_item_id: 'ITEM-1' } });
  const v = await L.fixEmail(deps, id, 'real.account@example.com');
  assert.deepEqual(calls.cancel, ['ITEM-1']); assert.equal(calls.createPayout.length, 2);
  assert.equal(calls.createPayout[1].email, 'real.account@example.com'); assert.equal(v.payout.status, 'PENDING');
});
test('fixEmail refused when the payout is fine', async () => {
  const { deps, id } = await breached(); await file(deps, id); await L.advance(deps, id, 29);
  await assert.rejects(() => L.fixEmail(deps, id, 'a@b.co'), (e) => e.status === 409);
});
test('UNHAPPY: PayPal 403 on the funding account is RETRY (operator problem), not blamed on the patient', async () => {
  const f = fakeDeps({ ppFail: new PayPalError('Authorization error', { status: 403, name: 'SENDER_EMAIL_UNCONFIRMED' }) });
  const c = await L.createCase(f.deps, { ...baseInput, cancelledOn: '2026-10-01' }); await file(f.deps, c.id);
  const v = await L.advance(f.deps, c.id, 29); assert.equal(v.payout.status, 'RETRY'); assert.match(v.events.at(-1).text, /funding account, not the patient/);
});
test('UNHAPPY: INSUFFICIENT_FUNDS (422) and NON_HOLDING_CURRENCY (400) are funding-account problems: RETRY with a clear reason, never blamed on the patient', async () => {
  for (const [status, name, expect] of [[422, 'INSUFFICIENT_FUNDS', /no funds/], [400, 'NON_HOLDING_CURRENCY', /does not hold pounds/]]) {
    const f = fakeDeps({ ppFail: new PayPalError('x', { status, name }) });
    const c = await L.createCase(f.deps, { ...baseInput, cancelledOn: '2026-10-01' }); await file(f.deps, c.id);
    const v = await L.advance(f.deps, c.id, 29); assert.equal(v.payout.status, 'RETRY', name); assert.match(v.payout.error, expect); assert.match(v.events.at(-1).text, /not the patient/);
  }
});
test('sandbox settlement fallback: ledger stays GBP, PayPal gets the small USD amount, and the payout records it', async () => {
  process.env.SANDBOX_SETTLE_CURRENCY = 'USD'; process.env.SANDBOX_SETTLE_AMOUNT = '4.50';
  try {
    const { deps, calls, id } = await breached(); await file(deps, id); const v = await L.advance(deps, id, 29);
    assert.equal(calls.createPayout[0].currency, 'USD'); assert.equal(calls.createPayout[0].amount, 4.5);
    assert.equal(v.payout.currency, 'GBP'); assert.equal(v.payout.amount, 216.1); assert.deepEqual(v.payout.settle, { currency: 'USD', scaled: true, amount: 4.5 });
  } finally { delete process.env.SANDBOX_SETTLE_CURRENCY; delete process.env.SANDBOX_SETTLE_AMOUNT; }
});
test('UNHAPPY: transient PayPal outage -> RETRY, and the sweep retries then succeeds', async () => {
  const f = fakeDeps({ ppFail: new PayPalError('boom', { status: 503 }) });
  const c = await L.createCase(f.deps, { ...baseInput, cancelledOn: '2026-10-01' }); await file(f.deps, c.id);
  let v = await L.advance(f.deps, c.id, 29); assert.equal(v.payout.status, 'RETRY');
  const ok = fakeDeps(); f.deps.paypal = ok.deps.paypal; // outage over
  await L.sweep(f.deps); v = L.view(await f.deps.store.get(c.id), f.deps);
  assert.notEqual(v.payout.status, 'RETRY'); assert.equal(ok.calls.createPayout.length, 1);
});
test('UNHAPPY: UNCLAIMED webhook is recorded, explained, and not treated as success; duplicate delivery ignored', async () => {
  const { deps, id } = await breached(); await file(deps, id); await L.advance(deps, id, 29);
  const evt = { id: 'WH-1', event_type: 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED', resource: { payout_batch_id: 'B1', payout_item_id: 'I1', sender_batch_id: 'cop-' + id } };
  assert.deepEqual(await L.applyWebhook(deps, evt), { applied: 'UNCLAIMED', caseId: id });
  assert.deepEqual(await L.applyWebhook(deps, evt), { duplicate: 'WH-1' });
  const c = await deps.store.get(id);
  assert.equal(c.payout.status, 'UNCLAIMED'); assert.match(c.events.at(-1).text, /no confirmed PayPal account/);
  await L.applyWebhook(deps, { ...evt, id: 'WH-2', event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED' });
  assert.equal((await deps.store.get(id)).payout.status, 'SUCCESS');
});
test('STALE webhook for a superseded batch is ignored and cannot overwrite the re-sent payout', async () => {
  const { deps, id } = await breached(); await file(deps, id); await L.advance(deps, id, 29); // batch B1
  await L.applyWebhook(deps, { id: 'W1', event_type: 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED', resource: { payout_batch_id: 'B1', payout_item_id: 'ITEM-1', sender_batch_id: 'cop-' + id } });
  await L.fixEmail(deps, id, 'real.account@example.com'); // cancels ITEM-1, pays batch B2
  let c = await deps.store.get(id); assert.equal(c.payout.batchId, 'B2'); assert.equal(c.payout.status, 'PENDING');
  const out = await L.applyWebhook(deps, { id: 'W2', event_type: 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED', resource: { payout_batch_id: 'B1', payout_item_id: 'ITEM-1', sender_batch_id: 'cop-' + id } });
  assert.deepEqual(out, { stale: 'B1', caseId: id });
  c = await deps.store.get(id); assert.equal(c.payout.status, 'PENDING', 'the live payout is untouched');
});
test('webhook for unknown batch / unknown type is ignored safely', async () => {
  const { deps } = await breached();
  assert.deepEqual(await L.applyWebhook(deps, { id: 'x', event_type: 'PAYMENT.SALE.COMPLETED', resource: {} }), { ignored: 'PAYMENT.SALE.COMPLETED' });
  assert.deepEqual(await L.applyWebhook(deps, { id: 'y', event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', resource: { payout_batch_id: 'NOPE' } }), { unmatched: 'NOPE' });
});
test('concurrency: two simultaneous reconciles after breach produce one payout', async () => {
  const { deps, calls, id } = await breached(); await file(deps, id);
  const c = await deps.store.get(id); c.simToday = '2026-10-30'; await deps.store.put(c);
  await Promise.all([L.reconcile(deps, id), L.reconcile(deps, id), L.reconcile(deps, id)]);
  assert.equal(calls.createPayout.length, 1);
});
test('safety breaker: past MAX_PAYOUTS_TOTAL the payout is held, not sent', async () => {
  process.env.MAX_PAYOUTS_TOTAL = '0';
  try {
    const { deps, calls, id } = await breached(); await file(deps, id);
    const v = await L.advance(deps, id, 29);
    assert.equal(v.payout.status, 'HELD_BREAKER'); assert.equal(calls.createPayout.length, 0);
  } finally { delete process.env.MAX_PAYOUTS_TOTAL; }
});
test('advance bounds', async () => {
  const { deps, id } = await breached();
  for (const d of [0, -1, 61, 'x']) await assert.rejects(() => L.advance(deps, id, d), (e) => e.status === 400);
});
