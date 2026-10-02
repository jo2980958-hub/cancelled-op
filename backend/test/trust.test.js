import test from 'node:test';
import assert from 'node:assert/strict';
import { trustReport } from '../src/trust.js';

const mk = (id, hospital, setting, state, extra = {}) => ({ id, hospital, setting, patient: { name: id }, procedure: 'P', eval: { state, daysLeft: extra.daysLeft, daysOver: extra.daysOver, deadline: '2026-10-30' }, claim: extra.claim || null, payout: extra.payout || null });
const claim = (n, status = 'submitted') => ({ status, priced: { payableTotal: n } });

test('live exposure: running clocks, due this week, breach rate, absorbed WH50 cost, repayments', () => {
  const cases = [
    mk('a', 'H1', 'daycase', 'ticking', { daysLeft: 3, claim: claim(100) }), mk('b', 'H1', 'inpatient', 'ticking', { daysLeft: 20, claim: claim(50, 'review') }),
    mk('c', 'H1', 'daycase', 'breached', { daysOver: 2, payout: { amount: 216.1, status: 'SUCCESS' } }), mk('d', 'H1', 'daycase', 'kept'), mk('e', 'H2', 'daycase', 'ineligible'),
  ];
  const r = trustReport(cases, 'H1');
  assert.equal(r.counts.running, 2); assert.equal(r.counts.breached, 1); assert.equal(r.counts.kept, 1); assert.equal(r.counts.covered, 4);
  assert.deepEqual(r.dueSoon.map((x) => x.id), ['a']); assert.equal(r.dueSoon[0].ifBreached, 100);
  assert.deepEqual(r.breachedThisWeek.map((x) => x.id), ['c']);
  assert.equal(r.breachRate.pct, 50); assert.equal(r.breachRate.of, 2);
  // 3 daycase (458-479) + 1 inpatient (917-1144)
  assert.equal(r.absorbed.low, 458 * 3 + 917); assert.equal(r.absorbed.high, 479 * 3 + 1144);
  assert.equal(r.repayments.paid, 216.1); assert.equal(r.repayments.exposureOnRunningClocks, 100, 'only FILED claims count as exposure'); assert.equal(r.repayments.potentialOnRunningClocks, 150);
  assert.deepEqual(r.bands.map((b) => b.count), [1, 0, 1, 0]); assert.equal(r.bands[2].label, '15 to 21 days left');
});
test('all hospitals, no resolved cases -> breach rate null, not NaN', () => {
  const r = trustReport([mk('a', 'H1', 'daycase', 'ticking', { daysLeft: 10 })]);
  assert.equal(r.breachRate, null); assert.deepEqual(r.hospitals, ['H1']);
});
