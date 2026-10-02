import test from 'node:test';
import assert from 'node:assert/strict';
import * as pp from '../src/paypal.js';

const realFetch = globalThis.fetch;
function stub(handlers) { globalThis.fetch = async (url, opts) => { const h = handlers.find((x) => url.includes(x.m)); const { status = 200, body } = h.r(url, opts); return { ok: status < 300, status, text: async () => JSON.stringify(body) }; }; }
const restore = () => { globalThis.fetch = realFetch; };
process.env.PAYPAL_CLIENT_ID = 'x'; process.env.PAYPAL_SECRET = 'y'; process.env.PAYPAL_API = 'https://example.invalid';
const tokenH = { m: '/oauth2/token', r: () => ({ body: { access_token: 'T', expires_in: 3000 } }) };

test('REPLAYED BREACH: PayPal refuses the duplicate sender_batch_id; the original batch is ADOPTED, not paid again', async () => {
  const seen = [];
  stub([tokenH, { m: '/v1/payments/payouts', r: (u, o) => { seen.push(JSON.parse(o.body).sender_batch_header.sender_batch_id + '|' + o.headers['PayPal-Request-Id']); return { status: 400, body: { name: 'USER_BUSINESS_ERROR', details: [{ field: 'SENDER_BATCH_ID', issue: 'Batch with given sender_batch_id already exists', link: [{ href: 'https://api.sandbox.paypal.com/v1/payments/payouts/ORIGINAL123' }] }] } }; } }]);
  try {
    const r = await pp.createPayout({ caseId: 'c1', email: 'a@b.co', amount: 5, currency: 'GBP' });
    assert.equal(r.batchId, 'ORIGINAL123'); assert.equal(r.duplicate, true); assert.deepEqual(seen, ['cop-c1|cop-c1'], 'sender_batch_id and PayPal-Request-Id are both the deterministic id');
  } finally { restore(); }
});
test('a 400 that is not a duplicate is still an error', async () => {
  stub([tokenH, { m: '/v1/payments/payouts', r: () => ({ status: 400, body: { name: 'VALIDATION_ERROR', message: 'bad', details: [{ issue: 'Receiver is invalid' }] } }) }]);
  try { await assert.rejects(() => pp.createPayout({ caseId: 'c2', email: 'a@b.co', amount: 5, currency: 'GBP' }), (e) => e.ppName === 'VALIDATION_ERROR'); } finally { restore(); }
});
test('amount and email validated before any network call', async () => {
  globalThis.fetch = async () => { throw new Error('network must not be touched'); };
  try { await assert.rejects(() => pp.createPayout({ caseId: 'c', email: 'nope', amount: 5, currency: 'GBP' }), /not valid/); await assert.rejects(() => pp.createPayout({ caseId: 'c', email: 'a@b.co', amount: 0, currency: 'GBP' }), /positive/); } finally { restore(); }
});
test('verifyWebhook returns false without a configured webhook id; true only on SUCCESS', async () => {
  delete process.env.PAYPAL_WEBHOOK_ID; assert.equal(await pp.verifyWebhook({}, '{}'), false);
  process.env.PAYPAL_WEBHOOK_ID = 'WH'; let sent;
  stub([tokenH, { m: 'verify-webhook-signature', r: (u, o) => { sent = JSON.parse(o.body); return { body: { verification_status: sent.webhook_event.id === 'good' ? 'SUCCESS' : 'FAILURE' } }; } }]);
  try {
    const h = { 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'c', 'paypal-transmission-id': 't', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 'tm' };
    assert.equal(await pp.verifyWebhook(h, JSON.stringify({ id: 'good' })), true); assert.equal(sent.webhook_id, 'WH'); assert.equal(sent.transmission_sig, 's');
    assert.equal(await pp.verifyWebhook(h, JSON.stringify({ id: 'tampered' })), false);
  } finally { restore(); delete process.env.PAYPAL_WEBHOOK_ID; }
});
