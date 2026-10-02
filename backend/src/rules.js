// THE RULES ENGINE. The 28-day pledge as explicit, individually testable rules.
// Every determination returns a `trace`: which rule fired, with what outcome, and why, in plain English.
//
//  R1 actor      The pledge covers cancellations made by the hospital. A patient-initiated cancellation or postponement is not covered.
//  R2 timing     Only cancellations ON or AFTER the day of admission (including the day of surgery).
//  R3 reason     Only NON-CLINICAL reasons. A clinical cancellation (patient unwell, clinical advice) is not covered.
//  R4 clock      Day 0 is the Europe/London date of the cancellation; the deadline is day 28, inclusive.
//  R5 offer      A BINDING date, falling on day 1..28 and offered by day 28, discharges the pledge.
//  R6 choice     A patient who declines or postpones an in-window date stops the clock; that is their choice, not a breach.
//  R7 re-cancel  If the hospital cancels the rebooked operation, on or after the day of admission, for a non-clinical reason,
//                the clock RESTARTS from that date. Cancelled in advance: the offer is void, the original clock keeps running.
//                Cancelled for a clinical reason: the discharge stands. Postponed by the patient: R6.
//  R8 breach     From 00:00 London time on day 29 with nothing discharged, the promise is broken.
//  R9 provisional A provisional (non-binding) date never discharges.
//  R10 late      A date beyond day 28, or an offer made after day 28, never discharges.
import { addDays, diffDays, deadlineOf, WINDOW_DAYS } from './clock.js';

const t = (rule, title, outcome, why) => ({ rule, title, outcome, why }); // outcome: pass | fail | info | fired

export function ruleActor(cancelledBy) {
  return cancelledBy === 'patient'
    ? t('R1', 'Cancelled by the hospital?', 'fail', 'The patient cancelled or postponed this operation. The pledge covers cancellations made by the hospital, so it does not apply.')
    : t('R1', 'Cancelled by the hospital?', 'pass', 'The hospital cancelled the operation.');
}
export function ruleTiming(timing) {
  return timing === 'before_day'
    ? t('R2', 'On or after the day of admission?', 'fail', 'The cancellation came before the day of admission. The pledge covers cancellations on or after the day of admission, including the day of surgery.')
    : t('R2', 'On or after the day of admission?', 'pass', timing === 'day_of_surgery' ? 'Cancelled on the day of surgery.' : 'Cancelled after admission.');
}
export function ruleReason(cancelledBy) {
  return cancelledBy === 'clinical'
    ? t('R3', 'Non-clinical reason?', 'fail', 'The reason was clinical (for example the patient was unwell). The pledge covers non-clinical cancellations only.')
    : t('R3', 'Non-clinical reason?', 'pass', 'The reason was not clinical (capacity, staffing, equipment, list over-run, administration).');
}
export function ruleClock(startOn) {
  return t('R4', 'Clock', 'info', `Day 0 is ${startOn} (the London calendar date of the cancellation). Day 28 is ${deadlineOf(startOn)}, inclusive: a binding date on that day still keeps the promise.`);
}

/** Verdict on a single offer inside a cycle that started on `startOn`. discharges / stops / restart / void. */
export function ruleOffer(o, startOn) {
  const deadline = deadlineOf(startOn);
  const label = `The offer of ${o.date} (made ${o.madeOn})`;
  const d = diffDays(startOn, o.date);
  if (o.status === 'void') return { discharges: false, trace: t('R7', 'Re-cancellation', 'fired', `${label} was cancelled by the hospital before the day of admission, so it is void. It no longer discharges the pledge; the original clock keeps running.`) };
  if (!o.binding) return { discharges: false, trace: t('R9', 'Binding date?', 'fail', `${label} is provisional, not binding. A provisional date never stops the clock.`) };
  if (d < 1) return { discharges: false, trace: t('R10', 'Inside the window?', 'fail', `${label} is not after the cancellation day.`) };
  if (o.date > deadline) return { discharges: false, trace: t('R10', 'Inside the window?', 'fail', `${label} falls on day ${d}, after day 28 (${deadline}). A date beyond the window does not discharge the pledge.`) };
  if (o.madeOn > deadline) return { discharges: false, trace: t('R10', 'Inside the window?', 'fail', `${label} was made after day 28 (${deadline}). A late offer does not discharge the pledge.`) };
  const inWin = `${label} is binding and falls on day ${d} (within day 1 to day 28, inclusive of ${deadline}).`;
  if (o.status === 'declined' || o.status === 'postponed_by_patient') return { discharges: false, stops: true, trace: t('R6', 'Patient choice', 'fired', `${inWin} The patient ${o.status === 'declined' ? 'declined' : 'postponed'} it. That is the patient's choice, so the clock stops and no breach arises.`) };
  if (o.status === 'hospital_cancelled' && o.recancel) {
    const r = o.recancel;
    if (r.cancelledBy === 'patient') return { discharges: false, stops: true, trace: t('R6', 'Patient choice', 'fired', `${inWin} The patient then postponed it themselves (${r.on}). Patient-initiated postponement does not count as a breach.`) };
    if (r.cancelledBy === 'clinical') return { discharges: true, trace: t('R7', 'Re-cancellation', 'fired', `${inWin} It was later cancelled on ${r.on} for a clinical reason, which the pledge does not cover. The discharge stands.`) };
    if (r.timing === 'before_day') return { discharges: false, trace: t('R7', 'Re-cancellation', 'fired', `${inWin} The hospital cancelled it in advance (${r.on}, before the day of admission), so the offer is void and the original clock keeps running.`) };
    return { discharges: true, restart: r.on, trace: t('R7', 'Re-cancellation', 'fired', `${inWin} The hospital then cancelled that operation on ${r.on}, on or after the day of admission, for a non-clinical reason. That is a new cancellation, so the 28-day clock RESTARTS from ${r.on}.`) };
  }
  return { discharges: true, trace: t('R5', 'Binding date inside the window?', 'pass', `${inWin} That discharges the pledge.`) };
}

export function ruleBreach(today, deadline, startOn) {
  return today > deadline
    ? t('R8', 'Breach', 'fired', `Today is ${today}, day ${diffDays(startOn, today)}. Day 28 (${deadline}) has passed with no binding date inside the window. The promise is broken.`)
    : t('R8', 'Breach', 'pass', `Today is ${today}, day ${diffDays(startOn, today)}. ${diffDays(today, deadline) === 0 ? 'Today is day 28, the last day.' : `${diffDays(today, deadline)} day(s) remain.`} No breach yet.`);
}

/** Full determination for a case on a London calendar date. */
export function evaluate(c, today) {
  const trace = [ruleActor(c.cancelledBy), ruleTiming(c.timing), ruleReason(c.cancelledBy)];
  const out = trace.filter((x) => x.outcome === 'fail');
  if (out.length) return { state: 'ineligible', reasons: out.map((x) => x.why), trace, today, determination: `Not covered: ${out[0].rule} failed. ${out[0].why}`, cycle: 1 };

  let start = c.cancelledOn, cycle = 1;
  for (let guard = 0; guard < 20; guard++) {
    const deadline = deadlineOf(start);
    const offers = (c.offers || []).filter((o) => (o.cycle || 1) === cycle);
    const cyc = [ruleClock(start)];
    let kept = null, stopped = null, restart = null;
    for (const o of offers) {
      const v = ruleOffer(o, start); cyc.push(v.trace);
      if (v.restart && !restart && !kept) { restart = { on: v.restart, offer: o }; }
      else if (v.discharges && !kept && !restart) kept = o;
      else if (v.stops && !stopped) stopped = o;
    }
    if (restart && restart.on <= today) { trace.push(...cyc); start = restart.on; cycle += 1; continue; }
    if (restart) kept = restart.offer; // restart date is still in the future: offer stands for now
    const day = diffDays(start, today);
    const base = { day, daysLeft: WINDOW_DAYS - day, deadline, today, cycleStart: start, cycle, cancelledOn: start };
    let state, extra = {}, fin;
    if (kept) { state = 'kept'; extra = { keptBy: kept.id, keptDate: kept.date }; fin = t('R5', 'Result', 'pass', `Promise kept: binding date ${kept.date} discharges the pledge. No payout.`); }
    else if (stopped) { state = 'declined'; extra = { keptBy: stopped.id, keptDate: stopped.date }; fin = t('R6', 'Result', 'fired', 'Clock stopped by the patient. No payout.'); }
    else {
      const b = ruleBreach(today, deadline, start); cyc.push(b);
      state = today > deadline ? 'breached' : 'ticking';
      if (state === 'breached') extra = { daysOver: diffDays(deadline, today) };
      fin = state === 'breached' ? t('R8', 'Result', 'fired', `PROMISE BROKEN on day ${day}. A repayment of the patient's out-of-pocket loss is due.`) : t('R4', 'Result', 'info', `Clock running: day ${day} of 28.`);
    }
    return { ...base, ...extra, state, trace: [...trace, ...cyc, fin], determination: fin.why, restarts: cycle - 1 };
  }
  throw new Error('rules: too many restarts');
}
