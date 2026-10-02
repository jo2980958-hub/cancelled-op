// Uses REAL PayPal-signed deliveries captured by the deployed Lambda. Run: node --test test/live.webhook.test.js
import './envload.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pp from '../src/paypal.js';

const S = new URL('../../.deploy-state/', import.meta.url);
const FN = JSON.parse(readFileSync(new URL('../../deploy-output.json', import.meta.url))).functionUrl;
process.env.PAYPAL_WEBHOOK_ID = readFileSync(new URL('webhook-id', S), 'utf8').trim();
const token = readFileSync(new URL('admin-token', S), 'utf8').trim();
const log = (...a) => console.log('   >', ...a);

const logs = await (await fetch(FN + '/api/admin/webhook-log', { headers: { 'x-admin-token': token } })).json();
const genuine = logs.filter((e) => e.verified).sort((a, b) => (a.at < b.at ? 1 : -1));
const pick = genuine.find((e) => JSON.parse(e.body).event_type === 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED') || genuine[0];
const post = (body, headers) => fetch(FN + '/api/webhooks/paypal', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

test('precondition: the deployed Lambda has captured real, verified PayPal deliveries', () => {
  log(genuine.length, 'verified deliveries captured; using', JSON.parse(pick.body).event_type, JSON.parse(pick.body).id);
  assert.ok(genuine.length >= 3);
});
test('a genuine delivery verifies against PayPal verify-webhook-signature', async () => {
  assert.equal(await pp.verifyWebhook(pick.headers, pick.body), true);
});
test('TAMPERED payload is rejected: one changed field in the body', async () => {
  const evt = JSON.parse(pick.body); evt.resource.payout_batch_id = 'FORGEDBATCH'; 
  assert.equal(await pp.verifyWebhook(pick.headers, JSON.stringify(evt)), false);
  const evt2 = JSON.parse(pick.body); evt2.event_type = 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED';
  assert.equal(await pp.verifyWebhook(pick.headers, JSON.stringify(evt2)), false, 'flipping UNCLAIMED to SUCCEEDED must not verify');
});
test('TAMPERED signature header is rejected (a middle character; the final base64 char before == carries no significant bits)', async () => {
  const sig = pick.headers['paypal-transmission-sig']; const i = Math.floor(sig.length / 2);
  const flip = (x, k) => x.slice(0, k) + (x[k] === 'A' ? 'B' : 'A') + x.slice(k + 1);
  assert.equal(await pp.verifyWebhook({ ...pick.headers, 'paypal-transmission-sig': flip(sig, i) }, pick.body), false);
  assert.equal(await pp.verifyWebhook({ ...pick.headers, 'paypal-transmission-sig': flip(sig, 0) }, pick.body), false);
});
test('REPLAY with a forged transmission id or time is rejected', async () => {
  assert.equal(await pp.verifyWebhook({ ...pick.headers, 'paypal-transmission-id': '00000000-0000-0000-0000-000000000000' }, pick.body), false);
  assert.equal(await pp.verifyWebhook({ ...pick.headers, 'paypal-transmission-time': '2020-01-01T00:00:00Z' }, pick.body), false);
});
test('DEPLOYED endpoint: forged payload -> 401 and no state change', async () => {
  const evt = JSON.parse(pick.body); evt.event_type = 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED';
  const r = await post(JSON.stringify(evt), pick.headers); log('forged ->', r.status, await r.text());
  assert.equal(r.status, 401);
  const r2 = await post(JSON.stringify({ id: 'WH-FAKE', event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', resource: {} }), {}); assert.equal(r2.status, 401);
});
test('DEPLOYED endpoint: a genuine delivery for another app/payout is acknowledged 200 immediately (unmatched), not retried forever', async () => {
  const t0 = Date.now(); const r = await post(pick.body, pick.headers); const ms = Date.now() - t0; const body = await r.text();
  log('genuine replay ->', r.status, body, ms + 'ms');
  assert.equal(r.status, 200); assert.ok(ms < 8000);
});
test('DEPLOYED endpoint: malformed JSON body is a clean 4xx/200, never a 500', async () => {
  const r = await post('{not json', pick.headers); log('malformed ->', r.status); assert.ok(r.status < 500);
});
