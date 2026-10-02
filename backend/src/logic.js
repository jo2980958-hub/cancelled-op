// Domain operations. Everything takes `deps` = { store, paypal, extract, now() } so tests can inject fakes.
import { londonDate, addDays, CHASE_DAYS, WINDOW_DAYS } from './clock.js';
import { evaluate } from './rules.js';
import { priceClaim, POLICY } from './policy.js';
import { newClaim, runAgent } from './agent.js';
import { EVIDENCE } from './evidence.js';
import { ConflictError } from './store.js';
import { EMAIL_RE, WEBHOOK_STATUS } from './paypal.js';
import { randomBytes } from 'node:crypto';

const money = (n) => '£' + Number(n).toFixed(2);
const longDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const MAX_PAYOUTS_TOTAL = () => Number(process.env.MAX_PAYOUTS_TOTAL || 200);
const MAX_CASES = () => Number(process.env.MAX_CASES || 80);
/** Ledger currency is always GBP. If the sandbox account stops holding GBP, set SANDBOX_SETTLE_CURRENCY=USD: PayPal then moves a small
 *  sandbox amount (SANDBOX_SETTLE_AMOUNT, default 5.00) while the ledger and the UI keep the real sterling figure, and the UI says so. */
export const payoutCurrency = () => 'GBP';
export const settlement = () => {
  const cur = process.env.SANDBOX_SETTLE_CURRENCY || 'GBP';
  return cur === 'GBP' ? { currency: 'GBP', scaled: false } : { currency: cur, scaled: true, amount: Number(process.env.SANDBOX_SETTLE_AMOUNT || 5) };
};

export const maskEmail = (e) => String(e).replace(/^(.{2}).*(@.*)$/, '$1***$2');
export const todayOf = (c, deps) => c.simToday || londonDate(deps.now());

function ev(c, deps) { return evaluate(c, todayOf(c, deps)); }
function addEvent(c, deps, type, text, extra = {}) {
  const e = ev(c, deps);
  c.events.push({ at: new Date(deps.now()).toISOString(), simDate: c.simToday || undefined, day: e.day, type, text, ...extra });
}
const has = (c, key) => c.events.some((e) => e.key === key);

/** Decorated, client-facing view of a case. */
export function view(c, deps) {
  const e = ev(c, deps);
  const cost = c.setting === 'inpatient' ? EVIDENCE.hospitalCost.inpatient : EVIDENCE.hospitalCost.daycase;
  const { messages, ...claim } = c.claim || {};
  return { ...c, claim: c.claim ? claim : null, patient: { name: c.patient.name, email: maskEmail(c.patient.email) }, eval: e, today: todayOf(c, deps), hospitalCost: cost, window: WINDOW_DAYS, payoutCurrency: payoutCurrency() };
}

async function mutate(deps, id, fn, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const c = await deps.store.get(id);
    if (!c) throw new HttpError(404, 'That case was not found. Check the link, or go back to the overview and choose a case.');
    try {
      const out = await fn(c);
      return await deps.store.put(c).then((saved) => (out ?? saved));
    } catch (e) { if (!(e instanceof ConflictError)) throw e; }
  }
  throw new HttpError(409, 'case was changed by another request; retry');
}

export function newId() { return 'c' + randomBytes(4).toString('hex'); }

export async function createCase(deps, input, opts = {}) {
  const errs = [];
  const name = String(input.name || '').trim().slice(0, 80);
  const email = String(input.email || '').trim().toLowerCase().slice(0, 120);
  if (!name) errs.push('Enter the patient name.');
  if (!EMAIL_RE.test(email)) errs.push('Enter the email address of your PayPal account.');
  if (!['hospital_nonclinical', 'clinical', 'patient'].includes(input.cancelledBy)) errs.push('cancelledBy must be hospital_nonclinical, clinical or patient');
  if (!['day_of_surgery', 'on_admission', 'before_day'].includes(input.timing)) errs.push('timing must be day_of_surgery, on_admission or before_day');
  if (!['daycase', 'inpatient'].includes(input.setting)) errs.push('setting must be daycase or inpatient');
  let cancelledOn = input.cancelledOn;
  if (!cancelledOn) cancelledOn = londonDate(deps.now());
  try { addDays(cancelledOn, 0); } catch { errs.push('cancelledOn must be a real date YYYY-MM-DD'); }
  if (errs.length) throw new HttpError(400, errs.join('; '));
  if (!opts.id && (await deps.store.list()).length >= MAX_CASES()) throw new HttpError(429, 'demo case limit reached; use Restore demo data');
  const c = {
    id: opts.id || newId(), createdAt: new Date(deps.now()).toISOString(),
    patient: { name, email }, hospital: String(input.hospital || 'Unnamed hospital').slice(0, 80), procedure: String(input.procedure || 'Elective operation').slice(0, 80),
    setting: input.setting, cancelledOn, cancelledBy: input.cancelledBy, timing: input.timing, reasonText: String(input.reasonText || '').slice(0, 300),
    simToday: input.simToday || undefined, seed: opts.seed || undefined, exemplar: opts.exemplar || undefined,
    offers: [], claim: null, payout: null, events: [], generation: 1,
  };
  const el = evaluate(c, todayOf(c, deps));
  addEvent(c, deps, 'cancelled', `Cancellation logged on ${longDate(cancelledOn)}: ${c.procedure} at ${c.hospital}. ${el.state !== 'ineligible' ? 'It is covered by the 28-day promise. The clock started at day 0 and the deadline is ' + longDate(addDays(cancelledOn, WINDOW_DAYS)) + '.' : 'NOT covered by the pledge: ' + el.reasons.join(' ')}`, { key: 'cancelled', rule: 'R1-R3', trace: el.trace });
  await deps.store.put(c, { create: true });
  return reconcile(deps, c.id);
}

export async function recordOffer(deps, id, { date, binding = true }) {
  await mutate(deps, id, (c) => {
    if (c.payout) throw new HttpError(409, 'payout already made for this case');
    const today = todayOf(c, deps);
    const e = ev(c, deps);
    try { addDays(date, 0); } catch { throw new HttpError(400, 'Choose a real date for the offer, for example 14 October 2026.'); }
    if (e.state === 'ineligible') throw new HttpError(400, 'This cancellation is outside the 28-day promise, so there is nothing to record against it.');
    if (date <= e.cycleStart) throw new HttpError(400, 'A rebooked operation must be on a date after the cancellation. Choose a later date.');
    if (date < today) throw new HttpError(400, 'That date has already passed. Record the date the hospital offered for the operation, today or later.');
    const o = { id: 'o' + (c.offers.length + 1), date, madeOn: today, binding: binding !== false, status: 'open', cycle: e.cycle };
    c.offers.push(o);
    addEvent(c, deps, 'offer', `The hospital offered ${o.binding ? 'a binding' : 'a provisional (non-binding)'} date of ${longDate(date)}, on ${longDate(today)}.`, { offerId: o.id, rule: o.binding ? 'R5' : 'R9' });
  });
  return reconcile(deps, id);
}

/** Things that happen to an offer after it is made: the patient declines or postpones it, or the hospital cancels it again. */
export async function offerAction(deps, id, offerId, action, body = {}) {
  await mutate(deps, id, (c) => {
    const o = c.offers.find((x) => x.id === offerId);
    if (!o) throw new HttpError(404, 'offer not found');
    if (c.payout) throw new HttpError(409, 'payout already made for this case');
    const today = todayOf(c, deps);
    if (action === 'decline' || action === 'postpone') {
      o.status = action === 'decline' ? 'declined' : 'postponed_by_patient';
      addEvent(c, deps, 'declined', `The patient ${action === 'decline' ? 'declined' : 'postponed'} the offered date of ${longDate(o.date)}. If it was inside the 28 days the clock stops: that is the patient's choice.`, { offerId, rule: 'R6' });
    } else if (action === 'recancel') {
      const cancelledBy = body.cancelledBy, timing = body.timing, on = body.on || today;
      if (!['hospital_nonclinical', 'clinical', 'patient'].includes(cancelledBy)) throw new HttpError(400, 'cancelledBy must be hospital_nonclinical, clinical or patient');
      if (!['day_of_surgery', 'on_admission', 'before_day'].includes(timing)) throw new HttpError(400, 'timing must be day_of_surgery, on_admission or before_day');
      try { addDays(on, 0); } catch { throw new HttpError(400, 'on must be a real date YYYY-MM-DD'); }
      if (on < o.madeOn) throw new HttpError(400, 'a re-cancellation cannot predate the offer');
      o.recancel = { cancelledBy, timing, on };
      o.status = cancelledBy === 'hospital_nonclinical' && timing === 'before_day' ? 'void' : 'hospital_cancelled';
      addEvent(c, deps, 'recancel', `The operation offered for ${longDate(o.date)} was cancelled again on ${longDate(on)} (${cancelledBy.replace('_', ' ')}, ${timing.replace(/_/g, ' ')}).`, { offerId, rule: 'R7' });
    } else throw new HttpError(404, 'unknown offer action');
  });
  return reconcile(deps, id);
}
export const declineOffer = (deps, id, offerId) => offerAction(deps, id, offerId, 'decline');

export async function advance(deps, id, days) {
  const n = Math.trunc(Number(days));
  if (!Number.isFinite(n) || n < 1 || n > 60) throw new HttpError(400, 'Choose between 1 and 60 days.');
  await mutate(deps, id, (c) => {
    const from = todayOf(c, deps);
    c.simToday = addDays(from, n);
    addEvent(c, deps, 'sim', `Demo: time moved forward ${n} day${n > 1 ? 's' : ''}, from ${longDate(from)} to ${longDate(c.simToday)}.`);
  });
  return reconcile(deps, id);
}

const claimOpen = (c, deps) => {
  if (c.payout) throw new HttpError(409, 'The payout has already been made, so the claim is closed.');
  if (ev(c, deps).state === 'ineligible') throw new HttpError(400, 'This cancellation is not covered by the pledge, so there is nothing to claim.');
};
function claimEvent(c, deps, text, extra) { addEvent(c, deps, 'claim', text, extra); }

/** Start (or restart) a claim: the agent reads the account and may ask a question, challenge a line, or finish. */
export async function submitClaim(deps, id, narrative) {
  const text = String(narrative || '').trim();
  if (text.length < 20) throw new HttpError(400, 'Write at least a sentence about what the cancellation cost, for example "I drove 40 miles each way and paid 8 pounds for parking".');
  if (text.length > 4000) throw new HttpError(400, 'The account is over 4,000 characters. Shorten it to the costs themselves.');
  const c0 = await deps.store.get(id);
  if (!c0) throw new HttpError(404, 'That case was not found. Check the link, or go back to the overview and choose a case.');
  claimOpen(c0, deps);
  if (c0.claim?.status === 'submitted') throw new HttpError(409, 'This claim is already filed and cannot be changed.');
  const claim = newClaim(text);
  try { await runAgent(claim, text, { converse: deps.converse, now: deps.now }); } catch (e) { throw new HttpError(502, 'The claim assistant is not available right now (' + e.message + '). Nothing was saved. Try again in a minute.'); }
  await mutate(deps, id, (c) => { claimOpen(c, deps); c.claim = claim; claimEvent(c, deps, claimSummaryText(claim)); });
  return reconcile(deps, id);
}
function claimSummaryText(claim) {
  const p = claim.priced;
  if (claim.status === 'needs_input') return `Claim assistant read the account and has a question: "${claim.pendingQuestion}"`;
  return `Claim assistant finished reading. Claimed ${money(p.claimedTotal)}; payable on a breach ${money(p.payableTotal)}${p.heldTotal ? '; held for evidence, confirmation or review ' + money(p.heldTotal) : ''}. Waiting for the patient to confirm.`;
}

export async function claimReply(deps, id, message) {
  const text = String(message || '').trim();
  if (!text) throw new HttpError(400, 'Write a reply before sending it.');
  if (text.length > 2000) throw new HttpError(400, 'The reply is over 2,000 characters. Shorten it.');
  const c0 = await deps.store.get(id);
  if (!c0) throw new HttpError(404, 'That case was not found. Check the link, or go back to the overview and choose a case.');
  claimOpen(c0, deps);
  if (!c0.claim || !['needs_input', 'review'].includes(c0.claim.status)) throw new HttpError(409, 'There is no open question to answer.');
  const claim = structuredClone(c0.claim);
  try { await runAgent(claim, text, { converse: deps.converse, now: deps.now }); } catch (e) { throw new HttpError(502, 'The claim assistant is not available right now (' + e.message + '). Your reply was not saved. Try again in a minute.'); }
  await mutate(deps, id, (c) => { claimOpen(c, deps); c.claim = claim; claimEvent(c, deps, claimSummaryText(claim)); });
  return reconcile(deps, id);
}

/** Patient chooses to stop answering and review what is priced so far. */
export async function claimFinalize(deps, id) {
  await mutate(deps, id, (c) => {
    claimOpen(c, deps);
    if (c.claim?.status !== 'needs_input') throw new HttpError(409, 'There is no open question to skip.');
    c.claim.status = 'review'; c.claim.pendingQuestion = null;
    claimEvent(c, deps, 'Patient skipped the open question and moved to review. Lines without enough information stay held.');
  });
  return view(await deps.store.get(id), deps);
}

/** The act that files the claim. Only a filed claim can ever be paid. */
export async function claimConfirm(deps, id) {
  await mutate(deps, id, (c) => {
    claimOpen(c, deps);
    if (c.claim?.status !== 'review') throw new HttpError(409, 'The claim is not ready to file. Answer the open question or review the lines first.');
    if (!c.claim.priced.lines.length) throw new HttpError(409, 'There are no costs in the claim yet.');
    c.claim.status = 'submitted'; c.claim.submittedAt = new Date(deps.now()).toISOString();
    claimEvent(c, deps, `Claim filed by the patient: ${money(c.claim.priced.payableTotal)} is payable if the promise is broken.`, { key: 'filed', rule: 'claim' });
  });
  return reconcile(deps, id);
}

/** Re-evaluate: chase ladder, restarts, breach, and (once, idempotently) the payout. Every determination is written to the audit trail with its rule trace. */
export async function reconcile(deps, id) {
  let fire = null;
  await mutate(deps, id, (c) => {
    fire = null; // a conflict-retry re-runs this body; only the attempt that commits may fire
    const e = ev(c, deps);
    const cy = e.cycle || 1;
    if (cy > 1 && !has(c, 'restart-c' + cy)) addEvent(c, deps, 'restart', `The clock restarted. The rebooked operation was cancelled again by the hospital on or after the day of admission, so a new 28-day clock runs from ${longDate(e.cycleStart)}. The new deadline is ${longDate(e.deadline)}.`, { key: 'restart-c' + cy, rule: 'R7', trace: e.trace });
    if (e.state === 'ticking' || e.state === 'breached') {
      for (const d of CHASE_DAYS) {
        const key = `chase-c${cy}-d${d}`;
        if (d <= e.day && !has(c, key) && !c.offers.some((o) => (o.cycle || 1) === cy) && d <= WINDOW_DAYS) {
          const left = WINDOW_DAYS - d;
          const t = {
            3: `Day 3. Written chase to ${c.hospital} bookings: asked for a binding date for ${c.procedure}.`,
            7: `Day 7. Chased again; asked for earliest theatre slots. ${left} days left.`,
            14: `Day 14. Escalated to the trust's patient-access manager. ${left} days left.`,
            21: `Day 21. Escalated to the operations director; flagged that a breach triggers repayment. ${left} days left.`,
            26: `Day 26. Final notice: ${left} days left. Repayment is queued.`,
            28: `Day 28. Last day of the window. No binding date recorded.`,
          }[d];
          addEvent(c, deps, 'chase', t, { key, delivery: 'simulated', rule: 'R4' });
        }
      }
    }
    if (e.state === 'kept' && !has(c, 'kept-c' + cy)) addEvent(c, deps, 'kept', `Promise kept: the binding date of ${longDate(e.keptDate)} falls on or before day 28 (${longDate(e.deadline)}). The clock stopped and nothing is owed.`, { key: 'kept-c' + cy, rule: 'R5', trace: e.trace });
    if (e.state === 'declined' && !has(c, 'stopped-c' + cy)) addEvent(c, deps, 'stopped', 'The clock stopped at the patient\'s choice and nothing is owed.', { key: 'stopped-c' + cy, rule: 'R6', trace: e.trace });
    if (e.state === 'breached' && !has(c, 'breach-c' + cy)) addEvent(c, deps, 'breach', `Promise broken. ${longDate(e.deadline)} passed with no binding date inside the window (now day ${e.day}). The promise has no legal force and no automatic penalty, so the agent repays the patient.`, { key: 'breach-c' + cy, rule: 'R8', trace: e.trace });
    if (e.state === 'breached' && c.claim && c.claim.status === 'submitted' && c.claim.priced.payableTotal > 0 && !c.payout) {
      c.payout = { status: 'SUBMITTING', amount: c.claim.priced.payableTotal, currency: payoutCurrency(), generation: c.generation, attempts: 0, startedAt: new Date(deps.now()).toISOString() };
      fire = true; // we hold the version lock on the SUBMITTING write below
    }
  });
  if (fire) return submitPayout(deps, id);
  return view(await deps.store.get(id), deps);
}

async function submitPayout(deps, id) {
  const total = (await deps.store.list()).filter((x) => x.payout && x.payout.batchId).length;
  const c = await deps.store.get(id);
  if (total >= MAX_PAYOUTS_TOTAL()) {
    await mutate(deps, id, (x) => { x.payout = { ...x.payout, status: 'HELD_BREAKER', error: `Demo safety breaker: ${MAX_PAYOUTS_TOTAL()} sandbox payouts already made.` }; addEvent(x, deps, 'payout', 'Payout held by the demo safety breaker.'); });
    return view(await deps.store.get(id), deps);
  }
  let res, err;
  try {
    const st = settlement();
    res = await deps.paypal.createPayout({
      caseId: c.id + (c.generation > 1 ? '-g' + c.generation : ''), email: c.patient.email, amount: st.scaled ? st.amount : c.payout.amount, currency: st.currency,
      note: `Repayment of out-of-pocket costs after cancelled operation (${c.procedure}, ${c.hospital}). Ledger GBP ${c.payout.amount.toFixed(2)}. ` + c.claim.priced.lines.filter((l) => l.amount).map((l) => `${l.category} ${l.amount.toFixed(2)}`).join(', '),
    });
  } catch (e) { err = e; }
  await mutate(deps, id, (x) => {
    if (res) {
      x.payout = { ...x.payout, settle: settlement(), status: 'PENDING', batchId: res.batchId, senderBatchId: res.senderBatchId, requestId: res.requestId, batchStatus: res.batchStatus, submittedAt: new Date(deps.now()).toISOString() };
      addEvent(x, deps, 'payout', res.duplicate ? `PayPal already held a payout for this case, so it was adopted instead of paying again.` : `${money(x.payout.amount)} was sent through PayPal Payouts to ${maskEmail(x.patient.email)}.`, { rule: 'payout' });
    } else {
      const funding = ['INSUFFICIENT_FUNDS', 'NON_HOLDING_CURRENCY', 'SENDER_EMAIL_UNCONFIRMED', 'SENDER_RESTRICTED', 'AUTHORIZATION_ERROR'].includes(err.ppName);
      const transient = !err.status || err.status >= 500 || [429, 401, 403].includes(err.status) || funding; // funding problems are ours, never the patient's
      const why = { INSUFFICIENT_FUNDS: 'The sandbox funding account has no funds right now.', NON_HOLDING_CURRENCY: 'The funding account does not hold pounds sterling right now.' }[err.ppName];
      x.payout = { ...x.payout, status: transient ? 'RETRY' : 'REJECTED', attempts: (x.payout.attempts || 0) + 1, error: why || err.message, ppName: err.ppName, debugId: err.debugId };
      addEvent(x, deps, 'payout', transient ? `PayPal did not accept the payout yet (${err.ppName || err.message}). ${why ? why + ' ' : ''}The cause is the funding account, not the patient. The agent will retry.` : `PayPal rejected the payout: ${err.message}${err.ppName ? ' [' + err.ppName + ']' : ''}. The patient must supply a valid PayPal email.`);
    }
  });
  return view(await deps.store.get(id), deps);
}

/** Patient corrects the PayPal email after a REJECTED/RETRY payout, or after an UNCLAIMED one (the unclaimed item is cancelled first so the money returns and is re-sent once). */
export async function fixEmail(deps, id, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(em)) throw new HttpError(400, 'that does not look like an email address');
  const c0 = await deps.store.get(id);
  if (!c0) throw new HttpError(404, 'That case was not found. Check the link, or go back to the overview and choose a case.');
  if (!c0.payout || !['REJECTED', 'RETRY', 'UNCLAIMED'].includes(c0.payout.status)) throw new HttpError(409, 'no failed or unclaimed payout to fix');
  if (c0.payout.status === 'UNCLAIMED') {
    if (!c0.payout.itemId) throw new HttpError(409, 'payout item not known yet; refresh first');
    try { await deps.paypal.cancelUnclaimed(c0.payout.itemId); } catch (e) { throw new HttpError(e.ppName === 'BATCH_NOT_COMPLETED' ? 409 : 502, e.ppName === 'BATCH_NOT_COMPLETED' ? 'PayPal can only cancel an unclaimed payout once its batch has finished processing. Try again in a minute.' : 'could not cancel the unclaimed payout: ' + e.message); }
  }
  await mutate(deps, id, (c) => {
    c.patient.email = em; c.generation += 1; c.payout = null;
    addEvent(c, deps, 'email', `Patient corrected the PayPal email to ${maskEmail(em)}; ${c0.payout.status === 'UNCLAIMED' ? 'the unclaimed payout was cancelled and ' : ''}payout will be re-sent once.`);
  });
  return reconcile(deps, id);
}

export async function refreshPayout(deps, id) {
  const c0 = await deps.store.get(id);
  if (!c0?.payout?.batchId) return view(c0, deps);
  const b = await deps.paypal.getBatch(c0.payout.batchId);
  await mutate(deps, id, (c) => applyStatus(c, deps, b.itemStatus, b));
  return view(await deps.store.get(id), deps);
}

function applyStatus(c, deps, itemStatus, b = {}) {
  if (!c.payout || !itemStatus) return;
  const prev = c.payout.status;
  c.payout.itemStatus = itemStatus; c.payout.batchStatus = b.batchStatus || c.payout.batchStatus; c.payout.fee = b.fee || c.payout.fee; c.payout.itemId = b.itemId || c.payout.itemId;
  if (b.errors) c.payout.error = b.errors.message || JSON.stringify(b.errors);
  c.payout.status = itemStatus;
  if (prev !== itemStatus) {
    const msg = {
      SUCCESS: `PayPal confirms the money has reached ${maskEmail(c.patient.email)}.`,
      UNCLAIMED: `UNCLAIMED: ${maskEmail(c.patient.email)} has no confirmed PayPal account yet. PayPal holds the money for 30 days, then returns it to the sender. The patient can open an account with that address or give a different one.`,
      FAILED: `PayPal reports the payout FAILED${c.payout.error ? ': ' + c.payout.error : ''}.`,
      RETURNED: 'The payout was returned unclaimed.', ONHOLD: 'PayPal has put the payout on hold.', BLOCKED: 'PayPal blocked the payout.', REFUNDED: 'The payout was refunded.', CANCELED: 'The payout was cancelled.',
    }[itemStatus] || `PayPal payout status: ${itemStatus}.`;
    addEvent(c, deps, 'payout', msg);
  }
}

/** PayPal webhook (already signature-verified by the caller). Idempotent by event id. */
export async function applyWebhook(deps, event) {
  const status = WEBHOOK_STATUS[event.event_type];
  if (!status) return { ignored: event.event_type };
  const r = event.resource || {};
  const batchId = r.payout_batch_id;
  const senderBatch = r.sender_batch_id || r.payout_item?.sender_item_id;
  const all = await deps.store.list();
  const c = all.find((x) => x.payout?.batchId && x.payout.batchId === batchId);
  if (!c) {
    // Not the batch we hold. If it belongs to one of our cases it is a SUPERSEDED batch (for example the unclaimed one we cancelled and re-sent): ignore it so a late event cannot overwrite the live payout.
    const ours = all.find((x) => x.payout && senderBatch && (senderBatch === 'cop-' + x.id || senderBatch.startsWith('cop-' + x.id + '-g')));
    return ours ? { stale: batchId, caseId: ours.id } : { unmatched: batchId };
  }
  if ((c.payout.webhookIds || []).includes(event.id)) return { duplicate: event.id };
  await mutate(deps, c.id, (x) => {
    x.payout.webhookIds = [...(x.payout.webhookIds || []), event.id].slice(-20);
    applyStatus(x, deps, status, { itemId: r.payout_item_id, errors: r.errors });
  });
  return { applied: status, caseId: c.id };
}

export async function sweep(deps) {
  const all = await deps.store.list();
  const out = { checked: all.length, fired: 0, refreshed: 0 };
  for (const c of all) {
    const before = !!c.payout;
    const retry = c.payout?.status === 'RETRY' && (c.payout.attempts || 0) < 5;
    if (retry) { await mutate(deps, c.id, (x) => { x.payout = null; }); }
    await reconcile(deps, c.id);
    const after = await deps.store.get(c.id);
    if (!before && after.payout) out.fired++;
    if (after.payout?.batchId && ['PENDING', 'PROCESSING', 'UNCLAIMED'].includes(after.payout.status)) { try { await refreshPayout(deps, c.id); out.refreshed++; } catch { /* PayPal unreachable; next sweep */ } }
  }
  return out;
}

export async function listCases(deps) {
  return (await deps.store.list()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((c) => view(c, deps));
}

/** Public list: example cases plus only the cases whose ids the browser holds. */
export async function listScoped(deps, ids = []) {
  const want = new Set(ids);
  return (await deps.store.list()).filter((c) => c.seed || want.has(c.id)).sort((a, b) => (a.seed === b.seed ? (a.createdAt < b.createdAt ? 1 : -1) : a.seed ? 1 : -1)).map((c) => view(c, deps));
}
export async function deleteCase(deps, id) {
  const c = await deps.store.get(id);
  if (!c) throw new HttpError(404, 'That case was not found. Check the link, or go back to the overview and choose a case.');
  if (c.seed) throw new HttpError(403, 'Example cases cannot be deleted. Use Restore examples to reset them.');
  if (c.payout) throw new HttpError(409, 'A payout has been made on this case, so the record is kept for the audit trail.');
  await deps.store.del(id);
  return { deleted: id };
}
