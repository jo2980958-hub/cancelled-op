import test from 'node:test';
import assert from 'node:assert/strict';
import { londonDate, addDays, diffDays, deadlineOf } from '../src/clock.js';
import { evaluate } from '../src/rules.js';
const eligibility = (c) => { const e = evaluate({ ...c, cancelledOn: '2026-01-01', offers: [] }, '2026-01-02'); return { eligible: e.state !== 'ineligible' }; };

const base = { cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', offers: [] };
const mk = (cancelledOn, offers = []) => ({ ...base, cancelledOn, offers });

test('londonDate: UTC evening in BST is already the next London day', () => {
  assert.equal(londonDate('2026-10-01T23:30:00Z'), '2026-10-02'); // BST = UTC+1
  assert.equal(londonDate('2026-10-01T22:59:59Z'), '2026-10-01');
  assert.equal(londonDate('2026-12-01T23:30:00Z'), '2026-12-01'); // GMT = UTC+0
});
test('londonDate: either side of the October clock change (25 Oct 2026, 02:00 BST -> 01:00 GMT)', () => {
  assert.equal(londonDate('2026-10-24T23:00:00Z'), '2026-10-25'); // 00:00 BST
  assert.equal(londonDate('2026-10-25T00:30:00Z'), '2026-10-25'); // 01:30 BST (first)
  assert.equal(londonDate('2026-10-25T01:30:00Z'), '2026-10-25'); // 01:30 GMT (second)
  assert.equal(londonDate('2026-10-25T23:59:59Z'), '2026-10-25');
  assert.equal(londonDate('2026-10-26T00:00:00Z'), '2026-10-26');
});
test('londonDate: March clock change (29 Mar 2026, 01:00 GMT -> 02:00 BST)', () => {
  assert.equal(londonDate('2026-03-28T23:59:59Z'), '2026-03-28');
  assert.equal(londonDate('2026-03-29T00:00:00Z'), '2026-03-29');
  assert.equal(londonDate('2026-03-29T23:00:00Z'), '2026-03-30'); // 00:00 BST
});
test('addDays/diffDays: calendar arithmetic across DST, month, year and leap day', () => {
  assert.equal(addDays('2026-10-01', 28), '2026-10-29');
  assert.equal(addDays('2026-10-20', 28), '2026-11-17'); // spans the 25 Oct change
  assert.equal(addDays('2026-12-10', 28), '2027-01-07');
  assert.equal(addDays('2028-02-01', 28), '2028-02-29');  // leap year
  assert.equal(addDays('2027-02-01', 28), '2027-03-01');  // not a leap year
  assert.equal(diffDays('2026-10-20', '2026-11-17'), 28);
  assert.equal(diffDays('2026-11-17', '2026-10-20'), -28);
});
test('rejects impossible dates and garbage', () => {
  assert.throws(() => addDays('2026-02-30', 1));
  assert.throws(() => addDays('26-1-1', 1));
  assert.throws(() => londonDate('not a date'));
});
test('BOUNDARY: day 27 and day 28 still ticking; day 29 is breached', () => {
  const c = mk('2026-10-01');
  assert.equal(deadlineOf('2026-10-01'), '2026-10-29');
  let e = evaluate(c, '2026-10-28'); assert.equal(e.state, 'ticking'); assert.equal(e.day, 27); assert.equal(e.daysLeft, 1);
  e = evaluate(c, '2026-10-29'); assert.equal(e.state, 'ticking'); assert.equal(e.day, 28); assert.equal(e.daysLeft, 0);
  e = evaluate(c, '2026-10-30'); assert.equal(e.state, 'breached'); assert.equal(e.day, 29); assert.equal(e.daysOver, 1);
});
test('day 0 is the cancellation date itself', () => {
  const e = evaluate(mk('2026-10-01'), '2026-10-01');
  assert.equal(e.day, 0); assert.equal(e.daysLeft, 28); assert.equal(e.state, 'ticking');
});
test('REBOOKING LANDS ON DAY 28: keeps the promise (inclusive deadline), even evaluated long after', () => {
  const c = mk('2026-10-01', [{ id: 'o1', date: '2026-10-29', madeOn: '2026-10-10', binding: true }]);
  assert.equal(deadlineOf('2026-10-01'), '2026-10-29');
  assert.equal(evaluate(c, '2026-10-15').state, 'kept');
  assert.equal(evaluate(c, '2026-11-30').state, 'kept');
});
test('REBOOKING ON DAY 29 does not keep the promise', () => {
  const c = mk('2026-10-01', [{ id: 'o1', date: '2026-10-30', madeOn: '2026-10-10', binding: true }]);
  assert.equal(evaluate(c, '2026-10-20').state, 'ticking');
  assert.equal(evaluate(c, '2026-10-30').state, 'breached');
});
test('offer MADE on day 28 for a date inside the window counts; made on day 29 does not', () => {
  const ok = mk('2026-10-01', [{ id: 'o', date: '2026-10-29', madeOn: '2026-10-29', binding: true }]);
  assert.equal(evaluate(ok, '2026-10-29').state, 'kept');
  const late = mk('2026-10-01', [{ id: 'o', date: '2026-10-29', madeOn: '2026-10-30', binding: true }]);
  assert.equal(evaluate(late, '2026-10-30').state, 'breached');
});
test('non-binding offer (provisional date) does not stop the clock', () => {
  const c = mk('2026-10-01', [{ id: 'o', date: '2026-10-15', madeOn: '2026-10-05', binding: false }]);
  assert.equal(evaluate(c, '2026-10-30').state, 'breached');
});
test('offer on the cancellation day itself (day 0) is not a rebooking', () => {
  const c = mk('2026-10-01', [{ id: 'o', date: '2026-10-01', madeOn: '2026-10-01', binding: true }]);
  assert.equal(evaluate(c, '2026-10-30').state, 'breached');
});
test('patient declines an in-window date: clock stops, no breach, state declined', () => {
  const c = mk('2026-10-01', [{ id: 'o', date: '2026-10-12', madeOn: '2026-10-05', binding: true, status: 'declined' }]);
  assert.equal(evaluate(c, '2026-11-30').state, 'declined');
});
test('declined offer outside window changes nothing', () => {
  const c = mk('2026-10-01', [{ id: 'o', date: '2026-11-12', madeOn: '2026-10-05', binding: true, status: 'declined' }]);
  assert.equal(evaluate(c, '2026-10-30').state, 'breached');
});
test('clock across the October DST change is still 28 calendar days (no off-by-one)', () => {
  // cancelled 20 Oct 2026 (BST); 25 Oct clocks go back. Deadline must be 17 Nov, not 16 Nov.
  const c = mk('2026-10-20');
  assert.equal(deadlineOf('2026-10-20'), '2026-11-17');
  assert.equal(evaluate(c, '2026-11-17').state, 'ticking');
  assert.equal(evaluate(c, '2026-11-18').state, 'breached');
});
test('cancellation at 23:30 UTC on 1 Oct 2026 is London 2 Oct: breach begins 31 Oct, not 30 Oct', () => {
  const cancelledOn = londonDate('2026-10-01T23:30:00Z');
  assert.equal(cancelledOn, '2026-10-02');
  const c = mk(cancelledOn);
  assert.equal(evaluate(c, '2026-10-30').state, 'ticking');
  assert.equal(evaluate(c, '2026-10-31').state, 'breached');
});
test('eligibility: clinical, patient-initiated and pre-admission cancellations are not covered', () => {
  assert.equal(eligibility({ cancelledBy: 'clinical', timing: 'day_of_surgery' }).eligible, false);
  assert.equal(eligibility({ cancelledBy: 'patient', timing: 'day_of_surgery' }).eligible, false);
  assert.equal(eligibility({ cancelledBy: 'hospital_nonclinical', timing: 'before_day' }).eligible, false);
  assert.equal(eligibility({ cancelledBy: 'hospital_nonclinical', timing: 'on_admission' }).eligible, true);
  assert.equal(evaluate({ cancelledBy: 'clinical', timing: 'day_of_surgery', cancelledOn: '2026-10-01', offers: [] }, '2026-12-01').state, 'ineligible');
});
