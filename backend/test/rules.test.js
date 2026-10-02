import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleActor, ruleTiming, ruleReason, ruleClock, ruleOffer, ruleBreach, evaluate } from '../src/rules.js';

const base = { cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', cancelledOn: '2026-10-01' };
const off = (o) => ({ id: 'o1', madeOn: '2026-10-05', binding: true, status: 'open', cycle: 1, ...o });
const ids = (e) => e.trace.map((t) => t.rule);

test('R1 actor: patient-initiated cancellation or postponement is out of scope', () => {
  assert.equal(ruleActor('patient').outcome, 'fail'); assert.equal(ruleActor('hospital_nonclinical').outcome, 'pass');
  const e = evaluate({ ...base, cancelledBy: 'patient', offers: [] }, '2026-12-01'); assert.equal(e.state, 'ineligible'); assert.match(e.determination, /R1/);
});
test('R2 timing: before the day of admission is out of scope', () => {
  assert.equal(ruleTiming('before_day').outcome, 'fail'); assert.equal(ruleTiming('on_admission').outcome, 'pass'); assert.equal(ruleTiming('day_of_surgery').outcome, 'pass');
  assert.equal(evaluate({ ...base, timing: 'before_day', offers: [] }, '2026-12-01').state, 'ineligible');
});
test('R3 reason: clinical is out of scope', () => {
  assert.equal(ruleReason('clinical').outcome, 'fail'); assert.equal(ruleReason('hospital_nonclinical').outcome, 'pass');
  assert.match(evaluate({ ...base, cancelledBy: 'clinical', offers: [] }, '2026-10-02').determination, /R3/);
});
test('R4 clock: states day 0 and the inclusive day 28', () => { assert.match(ruleClock('2026-10-01').why, /2026-10-29/); });
test('R5 binding offer on day 28 discharges; trace names R5', () => {
  const e = evaluate({ ...base, offers: [off({ date: '2026-10-29' })] }, '2026-11-20');
  assert.equal(e.state, 'kept'); assert.ok(ids(e).includes('R5')); assert.match(e.trace.find((t) => t.rule === 'R5').why, /day 28/);
});
test('R6 patient decline / postponement stops the clock', () => {
  for (const status of ['declined', 'postponed_by_patient']) { const e = evaluate({ ...base, offers: [off({ date: '2026-10-12', status })] }, '2026-12-01'); assert.equal(e.state, 'declined', status); assert.ok(ids(e).includes('R6')); }
});
test('R7a hospital cancels the rebooked op ON the day, non-clinical: clock RESTARTS from that date', () => {
  const o = off({ date: '2026-10-20', status: 'hospital_cancelled', recancel: { cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', on: '2026-10-20' } });
  const e = evaluate({ ...base, offers: [o] }, '2026-10-25');
  assert.equal(e.state, 'ticking'); assert.equal(e.cycle, 2); assert.equal(e.cycleStart, '2026-10-20'); assert.equal(e.day, 5); assert.equal(e.deadline, '2026-11-17'); assert.equal(e.restarts, 1);
  assert.match(e.trace.find((t) => t.rule === 'R7').why, /RESTARTS/);
  assert.equal(evaluate({ ...base, offers: [o] }, '2026-11-18').state, 'breached', 'breach counts from the NEW deadline, not the old one');
});
test('R7a: an offer in cycle 2 discharges cycle 2 only', () => {
  const o1 = off({ date: '2026-10-20', status: 'hospital_cancelled', recancel: { cancelledBy: 'hospital_nonclinical', timing: 'on_admission', on: '2026-10-20' } });
  const o2 = off({ id: 'o2', cycle: 2, date: '2026-11-17', madeOn: '2026-10-22' });
  const e = evaluate({ ...base, offers: [o1, o2] }, '2026-12-30'); assert.equal(e.state, 'kept'); assert.equal(e.cycle, 2);
});
test('R7b cancelled again in ADVANCE: offer void, original clock keeps running and can breach', () => {
  const o = off({ date: '2026-10-20', status: 'void', recancel: { cancelledBy: 'hospital_nonclinical', timing: 'before_day', on: '2026-10-10' } });
  assert.equal(evaluate({ ...base, offers: [o] }, '2026-10-15').state, 'ticking');
  assert.equal(evaluate({ ...base, offers: [o] }, '2026-10-30').state, 'breached');
});
test('R7b via hospital_cancelled + before_day also voids', () => {
  const o = off({ date: '2026-10-20', status: 'hospital_cancelled', recancel: { cancelledBy: 'hospital_nonclinical', timing: 'before_day', on: '2026-10-10' } });
  assert.equal(evaluate({ ...base, offers: [o] }, '2026-10-30').state, 'breached');
});
test('R7c rebooked op cancelled for a CLINICAL reason: discharge stands, no restart, no breach', () => {
  const o = off({ date: '2026-10-20', status: 'hospital_cancelled', recancel: { cancelledBy: 'clinical', timing: 'day_of_surgery', on: '2026-10-20' } });
  const e = evaluate({ ...base, offers: [o] }, '2026-12-01'); assert.equal(e.state, 'kept'); assert.equal(e.cycle, 1); assert.match(e.trace.find((t) => t.rule === 'R7').why, /clinical/);
});
test('R7d rebooked op postponed by the PATIENT: stops the clock, never a breach', () => {
  const o = off({ date: '2026-10-20', status: 'hospital_cancelled', recancel: { cancelledBy: 'patient', timing: 'day_of_surgery', on: '2026-10-20' } });
  assert.equal(evaluate({ ...base, offers: [o] }, '2026-12-01').state, 'declined');
});
test('R7: restart date still in the future => offer stands for now (kept)', () => {
  const o = off({ date: '2026-10-20', status: 'hospital_cancelled', recancel: { cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', on: '2026-10-20' } });
  assert.equal(evaluate({ ...base, offers: [o] }, '2026-10-10').state, 'kept');
});
test('R8 breach fires from day 29 and says so', () => {
  assert.equal(ruleBreach('2026-10-29', '2026-10-29', '2026-10-01').outcome, 'pass'); assert.equal(ruleBreach('2026-10-30', '2026-10-29', '2026-10-01').outcome, 'fired');
  const e = evaluate({ ...base, offers: [] }, '2026-10-30'); assert.equal(e.state, 'breached'); assert.match(e.determination, /PROMISE BROKEN on day 29/);
});
test('R9 provisional date never discharges', () => { assert.equal(ruleOffer(off({ date: '2026-10-12', binding: false }), '2026-10-01').trace.rule, 'R9'); });
test('R10 late date / late offer / not-after-cancellation never discharge', () => {
  assert.equal(ruleOffer(off({ date: '2026-10-30' }), '2026-10-01').discharges, false);
  assert.equal(ruleOffer(off({ date: '2026-10-20', madeOn: '2026-10-30' }), '2026-10-01').discharges, false);
  assert.equal(ruleOffer(off({ date: '2026-10-01' }), '2026-10-01').discharges, false);
});
test('every determination carries a readable trace that names a rule and a reason', () => {
  for (const e of [evaluate({ ...base, offers: [] }, '2026-10-05'), evaluate({ ...base, offers: [] }, '2026-11-05'), evaluate({ ...base, cancelledBy: 'clinical', offers: [] }, '2026-10-05'), evaluate({ ...base, offers: [off({ date: '2026-10-12' })] }, '2026-10-05')]) {
    assert.ok(e.trace.length >= 3); for (const t of e.trace) { assert.match(t.rule, /^R\d+$/); assert.ok(t.why.length > 20); }
    assert.ok(e.determination.length > 20);
  }
});
