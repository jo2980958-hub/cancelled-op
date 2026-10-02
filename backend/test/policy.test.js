import test from 'node:test';
import assert from 'node:assert/strict';
import { priceClaim, priceLine, POLICY } from '../src/policy.js';

test('mileage is priced by code, not by the model', () => {
  const l = priceLine({ category: 'travel', miles: 68, evidence: 'ticket' });
  assert.equal(l.claimed, 30.6); assert.equal(l.amount, 30.6); assert.equal(l.status, 'payable');
});
test('mileage needs no receipt (distance is checkable); a fare with no evidence is still held', () => {
  const m = priceLine({ category: 'travel', miles: 10, evidence: 'none' });
  assert.equal(m.status, 'payable'); assert.equal(m.amount, 4.5);
  assert.equal(priceLine({ category: 'travel', amount_gbp: 20, evidence: 'none' }).status, 'held');
});
test('wages: hours x rate, hours limited to 16', () => {
  const l = priceLine({ category: 'wages', hours: 40, hourly_rate_gbp: 20, evidence: 'payslip' });
  assert.equal(l.claimed, 320); assert.match(l.basis, /limited to 16/);
});
test('line without evidence is held, not paid', () => {
  const l = priceLine({ category: 'childcare', amount_gbp: 80, evidence: 'none' });
  assert.equal(l.status, 'held'); assert.equal(l.amount, 0); assert.equal(l.claimed, 80);
});
test('category cap applied: parking 200 -> 40', () => {
  const l = priceLine({ category: 'parking', amount_gbp: 200, evidence: 'receipt' });
  assert.equal(l.amount, POLICY.categoryCaps.parking); assert.equal(l.status, 'capped');
});
test('"other" is never auto-paid', () => { assert.equal(priceLine({ category: 'other', amount_gbp: 50, evidence: 'receipt' }).amount, 0); });
test('hostile / nonsense model output cannot create money', () => {
  for (const bad of [{ category: 'travel', amount_gbp: -500, evidence: 'receipt' }, { category: 'travel', amount_gbp: NaN, evidence: 'receipt' }, { category: 'travel', amount_gbp: '9999', evidence: 'receipt' }, { category: 'nonsense', amount_gbp: 99999, evidence: 'receipt' }, null, {}]) {
    assert.equal(priceLine(bad).amount, 0, JSON.stringify(bad));
  }
});
test('total cap 750 is a hard ceiling on one automatic payout', () => {
  const c = priceClaim({ items: [{ category: 'travel', amount_gbp: 150, evidence: 'ticket' }, { category: 'wages', amount_gbp: 400, evidence: 'payslip' }, { category: 'childcare', amount_gbp: 200, evidence: 'receipt' }, { category: 'accommodation', amount_gbp: 150, evidence: 'receipt' }, { category: 'parking', amount_gbp: 40, evidence: 'receipt' }] });
  assert.equal(c.payableTotal, 750); assert.equal(c.totalCapApplied, true);
});
test('more than 20 lines are truncated', () => {
  const c = priceClaim({ items: Array.from({ length: 50 }, () => ({ category: 'parking', amount_gbp: 5, evidence: 'receipt' })) });
  assert.equal(c.lines.length, 20);
});
test('empty extraction -> zero payable', () => { assert.equal(priceClaim({ items: [] }).payableTotal, 0); assert.equal(priceClaim(undefined).payableTotal, 0); });
